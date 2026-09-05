import { readFile } from "node:fs/promises";
import path from "node:path";
import { abrirExecucaoRaiz, agente, fecharExecucaoRaiz } from "@/lib/agente";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Cliente, Pedido, Produto } from "@/lib/tipos";

type ClienteAdmin = ReturnType<typeof criarClienteAdmin>;

// Saida esperada do Triador (SPEC 4.2, passo 2 e prompts/vendas/triador.md).
interface ItemPedido {
  descricao_cliente: string;
  quantidade: number | null;
  unidade: string;
}

interface SaidaTriador {
  tipo:
    | "orcamento"
    | "complemento"
    | "reclamacao"
    | "fora_do_ramo"
    | "spam"
    | "outro";
  itens: ItemPedido[];
  prazo_desejado: string | null;
  pede_desconto: boolean;
  desconto_pedido_pct: number | null;
  urgencia: "normal" | "alta" | "critica";
  observacoes: string;
}

// Saida esperada do Pesquisador (SPEC 4.2, passo 3 e prompts/vendas/pesquisador.md).
interface SaidaPesquisador {
  itens: Array<{
    descricao_cliente: string;
    cod_produto: string | null;
    descricao: string | null;
    quantidade: number | null;
    unidade: string;
    existe: boolean;
    preco_aplicado: number | null;
    estoque: number | null;
    atende_estoque: boolean | null;
    prazo_reposicao_dias: number | null;
  }>;
  condicao_pagamento_dias: number | null;
  desconto_maximo_pct: number | null;
  observacoes: string;
}

// Saida esperada do Redator (SPEC 4.2, passo 4 e prompts/vendas/redator.md).
interface SaidaRedator {
  resposta: string;
  resumo: string;
}

// Saida esperada do Revisor (SPEC 4.2, passo 5 e prompts/vendas/revisor.md).
interface SaidaRevisor {
  aprovado: boolean;
  motivos: string[];
}

const PALAVRAS_IGNORADAS = new Set([
  "de", "da", "do", "das", "dos", "e", "um", "uma", "uns", "umas",
  "para", "com", "os", "as", "o", "a", "em", "no", "na", "nos", "nas",
  "pra", "por", "que", "se",
]);

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenizar(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9/]+/)
    .filter((t) => t.length > 0 && !PALAVRAS_IGNORADAS.has(t))
    // singularizacao ingenua (parafusos -> parafuso) so pra casar com o
    // catalogo, que esta no singular.
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

// Candidatos do catalogo por semelhanca de palavras-chave (SPEC 4.2, passo 3:
// "ilike com as palavras principais"). Codigo deterministico, sem modelo.
function candidatosDoItem(produtos: Produto[], descricaoCliente: string): Produto[] {
  const palavras = tokenizar(descricaoCliente);
  if (palavras.length === 0) return [];
  return produtos.filter((produto) => {
    const tokensProduto = tokenizar(produto.descricao);
    return palavras.some((palavra) =>
      tokensProduto.some((token) => token.includes(palavra) || palavra.includes(token)),
    );
  });
}

async function buscarCatalogo(supabase: ClienteAdmin): Promise<Produto[]> {
  const { data, error } = await supabase.from("produtos").select("*");
  if (error) throw new Error(`Falha ao buscar catalogo: ${error.message}`);
  return (data as Produto[] | null) ?? [];
}

// Pedidos do mesmo cliente nos ultimos 30 dias, contados a partir da data
// do pedido atual (SPEC 4.2, passo 3).
async function buscarPedidosAnteriores(
  supabase: ClienteAdmin,
  cliente: Cliente | null,
  codPedidoAtual: string,
  dataPedidoAtual: string,
): Promise<Pedido[]> {
  if (!cliente) return [];

  const { data, error } = await supabase
    .from("pedidos_orcamento")
    .select("*")
    .eq("cod_cliente", cliente.cod_cliente)
    .neq("cod_pedido", codPedidoAtual);
  if (error) throw new Error(`Falha ao buscar pedidos anteriores: ${error.message}`);

  const fim = new Date(dataPedidoAtual);
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - 30);

  return ((data as Pedido[] | null) ?? []).filter((p) => {
    const d = new Date(p.data);
    return d >= inicio && d <= fim;
  });
}

// As regras do Revisor moram so no prompt (prompts/vendas/revisor.md); aqui
// so extraimos a lista numerada para incluir na entrada dele, como pede o
// SPEC 4.2 passo 5 ("regras vem do prompt"). Nao copia o texto para o
// codigo, so le o arquivo em tempo de execucao.
async function lerRegrasRevisor(): Promise<string[]> {
  const caminho = path.join(process.cwd(), "prompts", "vendas", "revisor.md");
  const texto = await readFile(caminho, "utf-8");
  return texto
    .split("\n")
    .map((linha) => linha.match(/^\d+\.\s+(.+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1].trim());
}

/**
 * Orquestrador de Vendas (SPEC 4.2): Triador -> (se orcamento/complemento)
 * Pesquisador -> Redator -> Revisor, com ate 2 voltas de redator/revisor.
 */
export async function processarPedido(codPedido: string): Promise<void> {
  const supabase = criarClienteAdmin();

  const { data: pedido, error: erroPedido } = await supabase
    .from("pedidos_orcamento")
    .select("*")
    .eq("cod_pedido", codPedido)
    .maybeSingle();

  if (erroPedido || !pedido) {
    throw new Error(`Pedido ${codPedido} nao encontrado.`);
  }
  const pedidoTyped = pedido as Pedido;

  let cliente: Cliente | null = null;
  if (pedidoTyped.cod_cliente) {
    const { data } = await supabase
      .from("clientes")
      .select("*")
      .eq("cod_cliente", pedidoTyped.cod_cliente)
      .maybeSingle();
    cliente = (data as Cliente | null) ?? null;
  }

  const { error: erroStatusProcessando } = await supabase
    .from("pedidos_orcamento")
    .update({ status: "processando" })
    .eq("cod_pedido", codPedido);
  if (erroStatusProcessando) {
    throw new Error(
      `Falha ao marcar pedido como processando: ${erroStatusProcessando.message}`,
    );
  }

  // Execucao raiz para o organograma ter uma copa (SPEC 3.2).
  const raizId = await abrirExecucaoRaiz({
    area: "vendas",
    item_tipo: "pedido",
    item_id: codPedido,
  });

  const ctx = { area: "vendas" as const, item_tipo: "pedido" as const, item_id: codPedido, chamado_por: raizId };

  try {
    const { saida: triagem } = await agente<SaidaTriador>(
      "triador",
      {
        mensagem: pedidoTyped.mensagem,
        canal: pedidoTyped.canal,
        cliente: cliente
          ? {
              cod_cliente: cliente.cod_cliente,
              nome: cliente.nome,
              segmento: cliente.segmento,
            }
          : null,
      },
      ctx,
    );

    if (triagem.tipo !== "orcamento" && triagem.tipo !== "complemento") {
      // SPEC 4.2: mensagem nao e orcamento nem complemento -> vai direto
      // para a fila de aprovacao com a saida do Triador como proposta, sem
      // passar pelo resto do pipeline.
      const { error: erroAprovacao } = await supabase.from("aprovacoes").insert({
        area: "vendas",
        item_tipo: "pedido",
        item_id: codPedido,
        titulo: `Nao e orcamento: ${triagem.tipo}`,
        proposta: { triagem },
        status: "pendente",
      });
      if (erroAprovacao) {
        throw new Error(`Falha ao criar aprovacao: ${erroAprovacao.message}`);
      }

      const { error: erroStatusNaoOrcamento } = await supabase
        .from("pedidos_orcamento")
        .update({ status: "aguardando_aprovacao" })
        .eq("cod_pedido", codPedido);
      if (erroStatusNaoOrcamento) {
        throw new Error(
          `Falha ao marcar pedido como aguardando_aprovacao: ${erroStatusNaoOrcamento.message}`,
        );
      }

      await fecharExecucaoRaiz(raizId, "ok");
      return;
    }

    // Pesquisador: catalogo e historico do cliente, em paralelo e em
    // codigo (nao pelo modelo) - SPEC 4.2, passo 3.
    const [produtos, pedidosAnteriores] = await Promise.all([
      buscarCatalogo(supabase),
      buscarPedidosAnteriores(supabase, cliente, codPedido, pedidoTyped.data),
    ]);

    const candidatosCatalogo = triagem.itens.map((item) => ({
      descricao_cliente: item.descricao_cliente,
      candidatos: candidatosDoItem(produtos, item.descricao_cliente).map((p) => ({
        cod_produto: p.cod_produto,
        descricao: p.descricao,
        unidade: p.unidade,
        preco_unitario: p.preco_unitario,
        preco_acima_100_un: p.preco_acima_100_un,
        estoque: p.estoque,
        prazo_reposicao_dias: p.prazo_reposicao_dias,
      })),
    }));

    const clienteResumo = cliente
      ? {
          cod_cliente: cliente.cod_cliente,
          nome: cliente.nome,
          segmento: cliente.segmento,
          prazo_pagamento_dias: cliente.prazo_pagamento_dias,
          desconto_maximo_pct: cliente.desconto_maximo_pct,
          cliente_desde: cliente.cliente_desde,
        }
      : null;

    const { saida: contexto } = await agente<SaidaPesquisador>(
      "pesquisador",
      {
        itens_pedidos: triagem.itens,
        candidatos_catalogo: candidatosCatalogo,
        cliente: clienteResumo,
        pedidos_anteriores: pedidosAnteriores,
      },
      ctx,
    );

    // Redator + Revisor, com ate 2 voltas quando o Revisor reprova
    // (SPEC 4.2, passo 5).
    const clienteRedator = cliente ? { nome: cliente.nome, segmento: cliente.segmento } : null;
    const regras = await lerRegrasRevisor();

    let entradaRedator: Record<string, unknown> = { triagem, contexto, cliente: clienteRedator };

    let { saida: redacao } = await agente<SaidaRedator>("redator", entradaRedator, ctx);
    let { saida: revisao } = await agente<SaidaRevisor>(
      "revisor",
      { resposta: redacao.resposta, contexto, regras },
      ctx,
    );

    let voltas = 0;
    while (!revisao.aprovado && voltas < 2) {
      voltas++;
      entradaRedator = { ...entradaRedator, ajustes: revisao.motivos };
      ({ saida: redacao } = await agente<SaidaRedator>("redator", entradaRedator, ctx));
      ({ saida: revisao } = await agente<SaidaRevisor>(
        "revisor",
        { resposta: redacao.resposta, contexto, regras },
        ctx,
      ));
    }

    // SPEC 4.2, passo 6: item na fila com a resposta pronta para a Marcela
    // aprovar, editar ou rejeitar.
    const nomeCliente = cliente?.nome ?? "Cliente desconhecido";
    const { error: erroAprovacao } = await supabase.from("aprovacoes").insert({
      area: "vendas",
      item_tipo: "pedido",
      item_id: codPedido,
      titulo: `${nomeCliente} · ${redacao.resumo}`,
      proposta: { resposta: redacao.resposta, triagem, contexto, revisao },
      status: "pendente",
    });
    if (erroAprovacao) {
      throw new Error(`Falha ao criar aprovacao: ${erroAprovacao.message}`);
    }

    const { error: erroStatusAguardando } = await supabase
      .from("pedidos_orcamento")
      .update({ status: "aguardando_aprovacao" })
      .eq("cod_pedido", codPedido);
    if (erroStatusAguardando) {
      throw new Error(
        `Falha ao marcar pedido como aguardando_aprovacao: ${erroStatusAguardando.message}`,
      );
    }

    await fecharExecucaoRaiz(raizId, "ok");
  } catch (erro) {
    await fecharExecucaoRaiz(
      raizId,
      "erro",
      erro instanceof Error ? erro.message : String(erro),
    );
    // Devolve o pedido para 'novo' para permitir tentar de novo.
    await supabase
      .from("pedidos_orcamento")
      .update({ status: "novo" })
      .eq("cod_pedido", codPedido);
    throw erro;
  }
}
