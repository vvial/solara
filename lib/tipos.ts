// Tipos compartilhados do Solara OS.

export type Area = "vendas" | "financeiro";
export type Papel = "admin" | "operador";

export interface Perfil {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
  areas: string[];
  criado_em: string;
}

export type NomeAgente =
  | "triador"
  | "pesquisador"
  | "redator"
  | "revisor"
  | "investigador"
  | "consolidador";

export type StatusExecucao = "rodando" | "ok" | "erro";

export interface Execucao {
  id: string;
  area: Area;
  item_tipo: "pedido" | "divergencia";
  item_id: string;
  agente: NomeAgente | "orquestrador";
  chamado_por: string | null;
  status: StatusExecucao;
  entrada: unknown;
  saida: unknown;
  erro: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  inicio: string | null;
  fim: string | null;
}

export type StatusAprovacao =
  | "pendente"
  | "aprovada"
  | "editada"
  | "rejeitada";

export interface Aprovacao {
  id: string;
  area: Area;
  item_tipo: "pedido" | "divergencia";
  item_id: string;
  titulo: string | null;
  proposta: unknown;
  status: StatusAprovacao;
  decidido_por: string | null;
  decidido_em: string | null;
  observacao: string | null;
  criado_em: string;
}

// Agentes desenhados no Organograma, por area (SPEC 3.3).
export const AGENTES_POR_AREA: Record<Area, NomeAgente[]> = {
  vendas: ["triador", "pesquisador", "redator", "revisor"],
  financeiro: ["investigador", "consolidador", "revisor"],
};

// Tabela pedidos_orcamento, importada do ERP (SPEC 4). Colunas fixas.
export type StatusPedido =
  | "novo"
  | "processando"
  | "aguardando_aprovacao"
  | "respondido"
  | "rejeitado";

export interface Pedido {
  cod_pedido: string;
  data: string;
  cod_cliente: string | null;
  canal: string;
  mensagem: string;
  status: StatusPedido;
}

// Tabela clientes, importada do ERP (SPEC 4). Colunas fixas.
export interface Cliente {
  cod_cliente: string;
  nome: string;
  cidade: string;
  segmento: string;
  prazo_pagamento_dias: number;
  desconto_maximo_pct: number;
  cliente_desde: string;
}

// Tabela produtos, importada do ERP (SPEC 4.2, passo 3). Colunas fixas.
export interface Produto {
  cod_produto: string;
  descricao: string;
  categoria: string;
  unidade: string;
  preco_unitario: number;
  preco_acima_100_un: number;
  estoque: number;
  prazo_reposicao_dias: number;
}

// Tabela titulos_receber, importada do ERP (SPEC 5). Colunas fixas.
export type StatusTitulo = "aberto" | "pago" | "pago_parcial" | "vencido";

export interface TituloReceber {
  cod_titulo: string;
  cod_cliente: string;
  nota_fiscal: string;
  valor: number;
  emissao: string;
  vencimento: string;
  status: StatusTitulo;
}

// Tabelas do Financeiro, criadas para esta area (SPEC 5.1).
export interface ExtratoImportado {
  id: string;
  nome_arquivo: string;
  importado_em: string;
  importado_por: string | null;
  total_linhas: number;
  total_creditos: number;
}

export type SituacaoLancamento = "casado" | "divergente" | "ignorado";

export interface Lancamento {
  id: string;
  extrato_id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
  cod_titulo_casado: string | null;
  situacao: SituacaoLancamento;
}

export type TipoInicialDivergencia =
  | "valor_diferente_mesma_nf"
  | "sem_titulo_correspondente"
  | "possivel_soma"
  | "duplicado"
  | "vencido_sem_pagamento";

export type StatusDivergencia =
  | "nova"
  | "investigando"
  | "aguardando_aprovacao"
  | "resolvida";

export interface Divergencia {
  id: string;
  extrato_id: string;
  tipo_inicial: TipoInicialDivergencia;
  lancamento_id: string | null;
  cod_titulo: string | null;
  valor_lancamento: number | null;
  valor_titulo: number | null;
  status: StatusDivergencia;
  hipotese: unknown;
  criado_em: string;
}
