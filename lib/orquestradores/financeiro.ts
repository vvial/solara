import { abrirExecucaoRaiz, agente, fecharExecucaoRaiz } from "@/lib/agente";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Cliente, Divergencia, Lancamento, TituloReceber } from "@/lib/tipos";

// Nota de design: o organograma (SPEC 3.3/5.2) mostra, numa unica tela, o
// orquestrador + N investigadores rodando em paralelo + consolidador +
// revisor da MESMA conciliacao. Para o componente Organograma (que filtra
// execucoes_agentes por um unico item_id) mostrar tudo junto sem precisar
// ser reescrito, todas as execucoes desta conciliacao usam item_id =
// extrato_id (nao o id de cada divergencia individual).

interface SaidaInvestigador {
  hipotese:
    | "pagamento_parcial"
    | "dois_titulos_um_pagamento"
    | "duplicidade"
    | "diferenca_centavos"
    | "atraso_com_juros"
    | "vencido_sem_pagamento"
    | "deposito_nao_identificado"
    | "nao_e_titulo"
    | "outro";
  explicacao: string;
  confianca: number;
  acao_sugerida: string;
  cod_titulos_envolvidos: string[];
  valor_a_baixar: number;
  valor_pendente: number;
}

interface SaidaConsolidador {
  relatorio_markdown: string;
  acoes: string[];
}

interface SaidaRevisorFinanceiro {
  aprovado: boolean;
  motivos: string[];
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function diasEntre(dataIsoA: string, dataIsoB: string): number {
  const ms = Math.abs(new Date(dataIsoA).getTime() - new Date(dataIsoB).getTime());
  return Math.round(ms / 86_400_000);
}

function identificarClientePorDescricao(descricao: string, clientes: Cliente[]): Cliente | null {
  const alvo = normalizar(descricao);
  return clientes.find((c) => alvo.includes(normalizar(c.nome))) ?? null;
}

interface CandidatoTitulo {
  cod_titulo: string;
  cod_cliente: string;
  nome_cliente: string;
  nota_fiscal: string;
  valor: number;
  vencimento: string;
  status: string;
}

// Candidatos do Investigador (SPEC 5.4, passo 2): titulos do mesmo cliente
// (se identificavel pela descricao) ou de valor proximo (+-10%), com
// vencimento a ate 30 dias.
function candidatosDaDivergencia(
  divergencia: Divergencia,
  lancamento: Lancamento | null,
  titulos: TituloReceber[],
  clientes: Cliente[],
  nomePorCliente: Map<string, string>,
): CandidatoTitulo[] {
  const abertos = titulos.filter((t) => t.status === "aberto");

  let codCliente: string | null = null;
  if (lancamento) {
    const nf = lancamento.descricao.match(/NF-(\d+)/i);
    const tituloPorNf = nf
      ? titulos.find((t) => t.nota_fiscal.toUpperCase() === `NF-${nf[1]}`)
      : undefined;
    codCliente =
      tituloPorNf?.cod_cliente ??
      identificarClientePorDescricao(lancamento.descricao, clientes)?.cod_cliente ??
      null;
  } else if (divergencia.cod_titulo) {
    codCliente = titulos.find((t) => t.cod_titulo === divergencia.cod_titulo)?.cod_cliente ?? null;
  }

  const valorReferencia = divergencia.valor_lancamento ?? divergencia.valor_titulo ?? 0;
  const dataReferencia = lancamento?.data ?? divergencia.criado_em.slice(0, 10);

  const candidatos = abertos.filter((t) => {
    const mesmoCliente = codCliente != null && t.cod_cliente === codCliente;
    const valorProximo =
      valorReferencia > 0 && Math.abs(t.valor - valorReferencia) / valorReferencia <= 0.1;
    if (!mesmoCliente && !valorProximo) return false;
    return diasEntre(t.vencimento, dataReferencia) <= 30;
  });

  return candidatos.map((t) => ({
    cod_titulo: t.cod_titulo,
    cod_cliente: t.cod_cliente,
    nome_cliente: nomePorCliente.get(t.cod_cliente) ?? t.cod_cliente,
    nota_fiscal: t.nota_fiscal,
    valor: t.valor,
    vencimento: t.vencimento,
    status: t.status,
  }));
}

/**
 * Orquestrador de Financeiro (SPEC 5.4): um Investigador por divergencia
 * (em paralelo) -> Consolidador -> Revisor, com ate 1 refacao so do
 * Consolidador se o Revisor reprovar.
 */
export async function conciliar(extratoId: string): Promise<void> {
  const supabase = criarClienteAdmin();

  const raizId = await abrirExecucaoRaiz({
    area: "financeiro",
    item_tipo: "divergencia",
    item_id: extratoId,
  });
  const ctx = {
    area: "financeiro" as const,
    item_tipo: "divergencia" as const,
    item_id: extratoId,
    chamado_por: raizId,
  };

  try {
    const { data: divergenciasData, error: erroDivergencias } = await supabase
      .from("divergencias")
      .select("*")
      .eq("extrato_id", extratoId)
      .eq("status", "nova");
    if (erroDivergencias) {
      throw new Error(`Falha ao buscar divergencias: ${erroDivergencias.message}`);
    }
    const divergencias = (divergenciasData as Divergencia[] | null) ?? [];

    if (divergencias.length > 0) {
      const { error } = await supabase
        .from("divergencias")
        .update({ status: "investigando" })
        .eq("extrato_id", extratoId)
        .eq("status", "nova");
      if (error) throw new Error(`Falha ao marcar divergencias como investigando: ${error.message}`);
    }

    const [
      { data: titulosData, error: erroTitulos },
      { data: clientesData, error: erroClientes },
      { data: lancamentosData, error: erroLancamentos },
    ] = await Promise.all([
      supabase.from("titulos_receber").select("*"),
      supabase.from("clientes").select("*"),
      supabase.from("lancamentos").select("*").eq("extrato_id", extratoId),
    ]);
    if (erroTitulos) throw new Error(`Falha ao buscar titulos_receber: ${erroTitulos.message}`);
    if (erroClientes) throw new Error(`Falha ao buscar clientes: ${erroClientes.message}`);
    if (erroLancamentos) throw new Error(`Falha ao buscar lancamentos: ${erroLancamentos.message}`);

    const titulos = (titulosData as TituloReceber[] | null) ?? [];
    const clientes = (clientesData as Cliente[] | null) ?? [];
    const lancamentos = (lancamentosData as Lancamento[] | null) ?? [];
    const lancamentosPorId = new Map(lancamentos.map((l) => [l.id, l]));
    const nomePorCliente = new Map(clientes.map((c) => [c.cod_cliente, c.nome]));

    // Investigador: um por divergencia, todos em paralelo (SPEC 5.4, passo 2).
    const investigacoes = await Promise.all(
      divergencias.map(async (divergencia) => {
        const lancamento = divergencia.lancamento_id
          ? lancamentosPorId.get(divergencia.lancamento_id) ?? null
          : null;

        const { saida } = await agente<SaidaInvestigador>(
          "investigador",
          {
            divergencia: {
              tipo_inicial: divergencia.tipo_inicial,
              valor_lancamento: divergencia.valor_lancamento,
              valor_titulo: divergencia.valor_titulo,
            },
            lancamento: lancamento
              ? { data: lancamento.data, descricao: lancamento.descricao, valor: lancamento.valor }
              : null,
            titulos_candidatos: candidatosDaDivergencia(
              divergencia,
              lancamento,
              titulos,
              clientes,
              nomePorCliente,
            ),
          },
          ctx,
        );
        return { divergencia, saida };
      }),
    );

    const hipoteses = investigacoes.map((i) => i.saida);

    const resumoCasamento = {
      qtd_casados: lancamentos.filter((l) => l.situacao === "casado").length,
      valor_casado: lancamentos
        .filter((l) => l.situacao === "casado")
        .reduce((soma, l) => soma + l.valor, 0),
      qtd_divergencias: divergencias.length,
      valor_divergente: divergencias.reduce(
        (soma, d) => soma + (d.valor_lancamento ?? d.valor_titulo ?? 0),
        0,
      ),
    };

    const titulosAbertosResumo = titulos
      .filter((t) => t.status === "aberto")
      .map((t) => ({
        cod_titulo: t.cod_titulo,
        valor: t.valor,
        cod_cliente: t.cod_cliente,
        vencimento: t.vencimento,
      }));

    // Consolidador + Revisor, com no maximo 1 refacao do Consolidador
    // (SPEC 5.4, passo 4 - so o Consolidador refaz, nao o Investigador).
    let entradaConsolidador: Record<string, unknown> = {
      resumo_casamento: resumoCasamento,
      hipoteses,
    };
    let { saida: relatorio } = await agente<SaidaConsolidador>(
      "consolidador",
      entradaConsolidador,
      ctx,
    );
    let { saida: revisao } = await agente<SaidaRevisorFinanceiro>(
      "revisor",
      { hipoteses, titulos_abertos: titulosAbertosResumo, relatorio },
      ctx,
    );

    if (!revisao.aprovado) {
      entradaConsolidador = { ...entradaConsolidador, ajustes: revisao.motivos };
      ({ saida: relatorio } = await agente<SaidaConsolidador>("consolidador", entradaConsolidador, ctx));
      ({ saida: revisao } = await agente<SaidaRevisorFinanceiro>(
        "revisor",
        { hipoteses, titulos_abertos: titulosAbertosResumo, relatorio },
        ctx,
      ));
    }

    // SPEC 5.4, passo 5: cada hipotese vira um item na fila de aprovacao.
    await Promise.all(
      investigacoes.map(async ({ divergencia, saida }) => {
        const lancamento = divergencia.lancamento_id
          ? lancamentosPorId.get(divergencia.lancamento_id) ?? null
          : null;
        const titulo = divergencia.cod_titulo
          ? titulos.find((t) => t.cod_titulo === divergencia.cod_titulo)
          : undefined;
        const referencia =
          lancamento?.descricao ??
          (titulo ? nomePorCliente.get(titulo.cod_cliente) ?? titulo.cod_cliente : "sem referencia");
        const valorReferencia = divergencia.valor_lancamento ?? divergencia.valor_titulo ?? 0;

        const { error: erroAprovacao } = await supabase.from("aprovacoes").insert({
          area: "financeiro",
          item_tipo: "divergencia",
          item_id: divergencia.id,
          titulo: `${saida.hipotese} · ${referencia} · R$ ${valorReferencia.toFixed(2)}`,
          proposta: { hipotese: saida, divergencia, relatorio },
          status: "pendente",
        });
        if (erroAprovacao) {
          throw new Error(`Falha ao criar aprovacao: ${erroAprovacao.message}`);
        }

        const { error: erroDivergencia } = await supabase
          .from("divergencias")
          .update({ status: "aguardando_aprovacao", hipotese: saida })
          .eq("id", divergencia.id);
        if (erroDivergencia) {
          throw new Error(`Falha ao atualizar divergencia: ${erroDivergencia.message}`);
        }
      }),
    );

    await fecharExecucaoRaiz(raizId, "ok");
  } catch (erro) {
    await fecharExecucaoRaiz(raizId, "erro", erro instanceof Error ? erro.message : String(erro));
    // Devolve as divergencias que ainda estao "investigando" para 'nova',
    // pra permitir tentar de novo.
    await supabase
      .from("divergencias")
      .update({ status: "nova" })
      .eq("extrato_id", extratoId)
      .eq("status", "investigando");
    throw erro;
  }
}
