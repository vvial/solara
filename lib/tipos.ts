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
