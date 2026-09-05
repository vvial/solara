import type { LancamentoLimpo } from "@/lib/financeiro/limpar";
import type {
  SituacaoLancamento,
  TipoInicialDivergencia,
  TituloReceber,
} from "@/lib/tipos";

// Casamento de credito x titulo (SPEC 5.3). Codigo deterministico, sem
// modelo.

export interface DivergenciaEncontrada {
  tipo_inicial: TipoInicialDivergencia;
  cod_titulo: string | null;
  valor_titulo: number | null;
}

export interface ResultadoCasamentoLancamento {
  lancamento: LancamentoLimpo;
  situacao: SituacaoLancamento;
  cod_titulo_casado: string | null;
  divergencia: DivergenciaEncontrada | null;
}

export interface ResultadoCasamento {
  lancamentos: ResultadoCasamentoLancamento[];
  // Titulos em aberto, nao casados neste lote, vencidos antes do fim do
  // extrato - viram divergencia 'vencido_sem_pagamento' (SPEC 5.3, ultima
  // regra).
  titulosVencidos: TituloReceber[];
}

function valorIguais(a: number, b: number, tolerancia = 0.01): boolean {
  return Math.abs(a - b) <= tolerancia;
}

function diasEntre(dataIsoA: string, dataIsoB: string): number {
  const ms = Math.abs(new Date(dataIsoA).getTime() - new Date(dataIsoB).getTime());
  return Math.round(ms / 86_400_000);
}

// SPEC 5.3, tipo 'possivel_soma': procura, entre os titulos em aberto do
// mesmo cliente, um par cuja soma bate com o valor do lancamento.
function encontrarParDeTitulos(
  titulosDisponiveis: TituloReceber[],
  valorAlvo: number,
): [TituloReceber, TituloReceber] | null {
  const porCliente = new Map<string, TituloReceber[]>();
  for (const titulo of titulosDisponiveis) {
    const lista = porCliente.get(titulo.cod_cliente) ?? [];
    lista.push(titulo);
    porCliente.set(titulo.cod_cliente, lista);
  }

  for (const lista of porCliente.values()) {
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        if (valorIguais(lista[i].valor + lista[j].valor, valorAlvo)) {
          return [lista[i], lista[j]];
        }
      }
    }
  }
  return null;
}

function casarLancamento(
  lancamento: LancamentoLimpo,
  titulos: TituloReceber[],
  usados: Set<string>,
): ResultadoCasamentoLancamento {
  if (lancamento.tipo === "debito") {
    return { lancamento, situacao: "ignorado", cod_titulo_casado: null, divergencia: null };
  }

  const disponivel = (t: TituloReceber) => t.status === "aberto" && !usados.has(t.cod_titulo);

  // Regra 1: descricao cita NF-<n> e existe titulo com essa nota.
  const nf = lancamento.descricao.match(/NF-(\d+)/i);
  const nfTexto = nf ? `NF-${nf[1]}` : null;
  const tituloPorNf = nfTexto
    ? titulos.find((t) => t.nota_fiscal.toUpperCase() === nfTexto.toUpperCase())
    : undefined;

  if (tituloPorNf) {
    const valorBate = valorIguais(tituloPorNf.valor, lancamento.valor);
    if (valorBate && disponivel(tituloPorNf)) {
      usados.add(tituloPorNf.cod_titulo);
      return {
        lancamento,
        situacao: "casado",
        cod_titulo_casado: tituloPorNf.cod_titulo,
        divergencia: null,
      };
    }
    if (valorBate) {
      // NF e valor batem, mas o titulo ja foi baixado por outro lancamento.
      return {
        lancamento,
        situacao: "divergente",
        cod_titulo_casado: null,
        divergencia: {
          tipo_inicial: "duplicado",
          cod_titulo: tituloPorNf.cod_titulo,
          valor_titulo: tituloPorNf.valor,
        },
      };
    }
    return {
      lancamento,
      situacao: "divergente",
      cod_titulo_casado: null,
      divergencia: {
        tipo_inicial: "valor_diferente_mesma_nf",
        cod_titulo: tituloPorNf.cod_titulo,
        valor_titulo: tituloPorNf.valor,
      },
    };
  }

  // Regra 2: exatamente um titulo em aberto com mesmo valor e vencimento a
  // ate 5 dias da data do lancamento.
  const candidatos = titulos.filter(
    (t) =>
      disponivel(t) &&
      valorIguais(t.valor, lancamento.valor) &&
      diasEntre(t.vencimento, lancamento.data) <= 5,
  );
  if (candidatos.length === 1) {
    usados.add(candidatos[0].cod_titulo);
    return {
      lancamento,
      situacao: "casado",
      cod_titulo_casado: candidatos[0].cod_titulo,
      divergencia: null,
    };
  }

  // Regra 3: divergente. possivel_soma antes de sem_titulo_correspondente.
  const par = encontrarParDeTitulos(
    titulos.filter(disponivel),
    lancamento.valor,
  );
  if (par) {
    return {
      lancamento,
      situacao: "divergente",
      cod_titulo_casado: null,
      divergencia: {
        tipo_inicial: "possivel_soma",
        cod_titulo: null,
        valor_titulo: par[0].valor + par[1].valor,
      },
    };
  }

  return {
    lancamento,
    situacao: "divergente",
    cod_titulo_casado: null,
    divergencia: { tipo_inicial: "sem_titulo_correspondente", cod_titulo: null, valor_titulo: null },
  };
}

export function casar(
  lancamentos: LancamentoLimpo[],
  titulos: TituloReceber[],
): ResultadoCasamento {
  const usados = new Set<string>();
  const resultados = lancamentos.map((l) => casarLancamento(l, titulos, usados));

  // Data final do extrato = a mais recente entre os lancamentos importados.
  const dataFinal = lancamentos.reduce(
    (maior, l) => (l.data > maior ? l.data : maior),
    lancamentos[0]?.data ?? "",
  );

  const titulosVencidos = dataFinal
    ? titulos.filter(
        (t) => t.status === "aberto" && !usados.has(t.cod_titulo) && t.vencimento < dataFinal,
      )
    : [];

  return { lancamentos: resultados, titulosVencidos };
}
