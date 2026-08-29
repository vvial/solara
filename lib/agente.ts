import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Area, NomeAgente } from "@/lib/tipos";

// Modelo definido no CLAUDE.md. Trocar aqui se necessario.
const MODELO = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;

export interface ContextoAgente {
  area: Area;
  item_tipo: "pedido" | "divergencia";
  item_id: string;
  chamado_por?: string;
}

export interface ResultadoAgente<T = unknown> {
  saida: T;
  execucao_id: string;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Le o system prompt do papel em prompts/<area>/<papel>.md.
async function lerPrompt(area: Area, papel: NomeAgente): Promise<string> {
  const caminho = path.join(process.cwd(), "prompts", area, `${papel}.md`);
  return readFile(caminho, "utf-8");
}

/**
 * Ponto unico de chamada a API da Anthropic. Todo agente passa por aqui.
 *
 * 1. Grava a execucao em `execucoes_agentes` com status `rodando`.
 * 2. Le o system prompt do arquivo do papel.
 * 3. Chama a API (claude-sonnet-4-6, max_tokens 2000).
 * 4. Faz JSON.parse da resposta; se falhar, marca `erro` e lanca excecao.
 * 5. Atualiza a linha com status `ok`, saida, tokens e fim.
 * 6. Devolve { saida, execucao_id }.
 */
export async function agente<T = unknown>(
  papel: NomeAgente,
  entrada: unknown,
  contexto: ContextoAgente,
): Promise<ResultadoAgente<T>> {
  const supabase = criarClienteAdmin();

  const { data: linha, error: erroInsert } = await supabase
    .from("execucoes_agentes")
    .insert({
      area: contexto.area,
      item_tipo: contexto.item_tipo,
      item_id: contexto.item_id,
      agente: papel,
      chamado_por: contexto.chamado_por ?? null,
      status: "rodando",
      entrada,
      inicio: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (erroInsert || !linha) {
    throw new Error(
      `Falha ao registrar execucao do agente ${papel}: ${erroInsert?.message}`,
    );
  }

  const execucao_id: string = linha.id;

  try {
    const systemPrompt = await lerPrompt(contexto.area, papel);

    const resposta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(entrada) }],
    });

    const texto = resposta.content
      .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === "text")
      .map((bloco) => bloco.text)
      .join("");

    let saida: T;
    try {
      saida = JSON.parse(texto) as T;
    } catch {
      await supabase
        .from("execucoes_agentes")
        .update({
          status: "erro",
          erro: `Resposta nao e JSON valido: ${texto.slice(0, 500)}`,
          tokens_entrada: resposta.usage.input_tokens,
          tokens_saida: resposta.usage.output_tokens,
          fim: new Date().toISOString(),
        })
        .eq("id", execucao_id);
      throw new Error(`Agente ${papel} devolveu JSON invalido.`);
    }

    await supabase
      .from("execucoes_agentes")
      .update({
        status: "ok",
        saida,
        tokens_entrada: resposta.usage.input_tokens,
        tokens_saida: resposta.usage.output_tokens,
        fim: new Date().toISOString(),
      })
      .eq("id", execucao_id);

    return { saida, execucao_id };
  } catch (erro) {
    // Erros que nao passaram pelo update de erro acima (ex.: prompt ausente,
    // falha de rede). Nao sobrescreve um status 'erro' ja gravado.
    await supabase
      .from("execucoes_agentes")
      .update({
        status: "erro",
        erro: erro instanceof Error ? erro.message : String(erro),
        fim: new Date().toISOString(),
      })
      .eq("id", execucao_id)
      .eq("status", "rodando");
    throw erro;
  }
}

/**
 * Cria a execucao raiz `orquestrador` para o organograma ter um topo.
 * O id devolvido e passado como `chamado_por` para todos os agentes que o
 * orquestrador disparar (SPEC 3.2).
 */
export async function abrirExecucaoRaiz(
  contexto: Omit<ContextoAgente, "chamado_por">,
): Promise<string> {
  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("execucoes_agentes")
    .insert({
      area: contexto.area,
      item_tipo: contexto.item_tipo,
      item_id: contexto.item_id,
      agente: "orquestrador",
      chamado_por: null,
      status: "rodando",
      inicio: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Falha ao abrir execucao raiz: ${error?.message}`);
  }
  return data.id;
}

/** Fecha a execucao raiz ao fim do processamento. */
export async function fecharExecucaoRaiz(
  execucao_id: string,
  status: "ok" | "erro" = "ok",
  erro?: string,
): Promise<void> {
  const supabase = criarClienteAdmin();
  await supabase
    .from("execucoes_agentes")
    .update({ status, erro: erro ?? null, fim: new Date().toISOString() })
    .eq("id", execucao_id);
}
