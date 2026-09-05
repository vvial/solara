"use client";

import { useCallback, useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { Aprovacao, Area } from "@/lib/tipos";

interface Props {
  area: Area;
}

// Formato da proposta de financeiro (lib/orquestradores/financeiro.ts).
interface PropostaFinanceiro {
  hipotese?: {
    hipotese?: string;
    explicacao?: string;
    confianca?: number;
    acao_sugerida?: string;
    cod_titulos_envolvidos?: string[];
    valor_a_baixar?: number;
    valor_pendente?: number;
  };
}

// Fila de aprovacao da area. Mesmo componente em Vendas e Financeiro
// (SPEC 3.4). Atualiza a tabela `aprovacoes` e, conforme item_tipo, o
// registro relacionado: 'pedido' -> pedidos_orcamento (SPEC 4.3);
// 'divergencia' -> divergencias e titulos_receber (SPEC 5.5).
export default function FilaAprovacao({ area }: Props) {
  const [itens, setItens] = useState<Aprovacao[]>([]);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const supabase = criarClienteNavegador();
    const { data } = await supabase
      .from("aprovacoes")
      .select("*")
      .eq("area", area)
      .eq("status", "pendente")
      .order("criado_em", { ascending: true });
    setItens((data as Aprovacao[] | null) ?? []);
  }, [area]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrir(item: Aprovacao) {
    setErro(null);
    if (abertoId === item.id) {
      setAbertoId(null);
      return;
    }
    setAbertoId(item.id);
    setRascunho(JSON.stringify(item.proposta, null, 2));
  }

  async function decidir(
    item: Aprovacao,
    status: "aprovada" | "editada" | "rejeitada",
  ) {
    setErro(null);
    const supabase = criarClienteNavegador();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const patch: Partial<Aprovacao> = {
      status,
      decidido_por: user?.id ?? null,
      decidido_em: new Date().toISOString(),
    };

    if (status === "editada") {
      try {
        patch.proposta = JSON.parse(rascunho);
      } catch {
        setErro("A proposta editada precisa ser JSON valido.");
        return;
      }
    }

    if (status === "rejeitada") {
      const obs = window.prompt("Observacao da rejeicao:");
      if (obs == null || obs.trim() === "") {
        setErro("Rejeicao exige uma observacao.");
        return;
      }
      patch.observacao = obs.trim();
    }

    setOcupado(true);
    const { error } = await supabase
      .from("aprovacoes")
      .update(patch)
      .eq("id", item.id);

    if (error) {
      setOcupado(false);
      setErro(error.message);
      return;
    }

    // SPEC 4.3: aprovar ou editar manda o pedido para 'respondido'; rejeitar
    // manda para 'rejeitado'.
    if (item.item_tipo === "pedido") {
      const statusPedido = status === "rejeitada" ? "rejeitado" : "respondido";
      const { error: erroPedido } = await supabase
        .from("pedidos_orcamento")
        .update({ status: statusPedido })
        .eq("cod_pedido", item.item_id);
      if (erroPedido) {
        setOcupado(false);
        setErro(
          `Aprovacao salva, mas falha ao atualizar o pedido: ${erroPedido.message}`,
        );
        return;
      }
    }

    // SPEC 5.5: aprovar ou editar resolve a divergencia e baixa o(s)
    // titulo(s); rejeitar devolve a divergencia para 'nova'.
    if (item.item_tipo === "divergencia") {
      const { error: erroDivergencia } = await supabase
        .from("divergencias")
        .update({ status: status === "rejeitada" ? "nova" : "resolvida" })
        .eq("id", item.item_id);
      if (erroDivergencia) {
        setOcupado(false);
        setErro(
          `Aprovacao salva, mas falha ao atualizar a divergencia: ${erroDivergencia.message}`,
        );
        return;
      }

      if (status !== "rejeitada") {
        const proposta = (patch.proposta ?? item.proposta) as PropostaFinanceiro;
        const hip = proposta?.hipotese;
        const novoStatusTitulo =
          hip?.hipotese === "vencido_sem_pagamento"
            ? "vencido"
            : (hip?.valor_pendente ?? 0) > 0.01
              ? "pago_parcial"
              : "pago";

        for (const codTitulo of hip?.cod_titulos_envolvidos ?? []) {
          const { error: erroTitulo } = await supabase
            .from("titulos_receber")
            .update({ status: novoStatusTitulo })
            .eq("cod_titulo", codTitulo);
          if (erroTitulo) {
            setOcupado(false);
            setErro(
              `Aprovacao salva, mas falha ao atualizar o titulo ${codTitulo}: ${erroTitulo.message}`,
            );
            return;
          }
        }
      }
    }

    setOcupado(false);
    setAbertoId(null);
    setItens((atual) => atual.filter((i) => i.id !== item.id));
  }

  if (itens.length === 0) {
    return (
      <p style={{ color: "#777", fontSize: 14 }}>
        Nenhum item pendente em {area}.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
      {itens.map((item) => (
        <li
          key={item.id}
          style={{ border: "1px solid #d0d7de", borderRadius: 8, background: "#fff" }}
        >
          <button
            onClick={() => abrir(item)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "12px 14px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {item.titulo ?? `${item.item_tipo} ${item.item_id}`}
          </button>

          {abertoId === item.id && (
            <div style={{ padding: "0 14px 14px" }}>
              {area === "vendas" && <PreviaVendas proposta={item.proposta} />}
              {area === "financeiro" && <PreviaFinanceiro proposta={item.proposta} />}
              <textarea
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                rows={12}
                style={{
                  width: "100%",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12,
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />
              {erro && (
                <p style={{ color: "#c0392b", fontSize: 13 }}>{erro}</p>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  disabled={ocupado}
                  onClick={() => decidir(item, "aprovada")}
                  style={botao("#1a7f37")}
                >
                  Aprovar
                </button>
                <button
                  disabled={ocupado}
                  onClick={() => decidir(item, "editada")}
                  style={botao("#1a1a1a")}
                >
                  Salvar edicao e aprovar
                </button>
                <button
                  disabled={ocupado}
                  onClick={() => decidir(item, "rejeitada")}
                  style={botao("#c0392b")}
                >
                  Rejeitar
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// Formato da proposta de vendas (lib/orquestradores/vendas.ts). Todos os
// campos opcionais porque o pedido pode ter parado no Triador (sem
// resposta) ou vir de um formato antigo.
interface PropostaVendas {
  resposta?: string;
  triagem?: { tipo?: string; observacoes?: string };
  contexto?: {
    itens?: Array<{
      descricao_cliente?: string;
      descricao?: string;
      existe?: boolean;
    }>;
  };
  revisao?: { aprovado?: boolean; motivos?: string[] };
}

// Previa legivel da proposta de Vendas: mostra a resposta pronta pro
// cliente e destaca o que precisa de atencao antes de aprovar - item que a
// Solara nao vende, ou pedido que nem chegou a virar orcamento.
function PreviaVendas({ proposta }: { proposta: unknown }) {
  const p = (proposta ?? {}) as PropostaVendas;

  if (!p.resposta) {
    return (
      <div style={aviso("#e0b93a", "#fff4d6")}>
        <strong>Este pedido nao virou uma resposta de orcamento.</strong>
        {p.triagem?.tipo && (
          <p style={{ marginTop: 4 }}>
            Classificado pelo Triador como: <strong>{p.triagem.tipo}</strong>
          </p>
        )}
        {p.triagem?.observacoes && (
          <p style={{ marginTop: 4 }}>{p.triagem.observacoes}</p>
        )}
      </div>
    );
  }

  const itensForaDoCatalogo = (p.contexto?.itens ?? []).filter(
    (i) => i.existe === false,
  );

  return (
    <div style={{ marginBottom: 10 }}>
      {itensForaDoCatalogo.length > 0 && (
        <div style={aviso("#c0392b", "#fbdcdc")}>
          <strong>Confira: item(ns) que a Solara nao vende</strong>
          <ul style={{ marginTop: 4, paddingLeft: 18 }}>
            {itensForaDoCatalogo.map((item, i) => (
              <li key={i}>{item.descricao_cliente ?? item.descricao ?? "item"}</li>
            ))}
          </ul>
        </div>
      )}

      {p.revisao?.aprovado === false && (p.revisao.motivos?.length ?? 0) > 0 && (
        <div style={aviso("#c0392b", "#fbdcdc")}>
          <strong>O Revisor reprovou esta versao:</strong>
          <ul style={{ marginTop: 4, paddingLeft: 18 }}>
            {p.revisao.motivos!.map((motivo, i) => (
              <li key={i}>{motivo}</li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ fontSize: 12, color: "#777", marginBottom: 4 }}>
        Resposta ao cliente:
      </p>
      <div
        style={{
          background: "#f6f6f6",
          border: "1px solid #e0e0e0",
          borderRadius: 6,
          padding: 12,
          fontSize: 14,
          whiteSpace: "pre-wrap",
        }}
      >
        {p.resposta}
      </div>
    </div>
  );
}

// Previa legivel da hipotese do Investigador (Financeiro): explicacao, acao
// sugerida e um aviso quando a confianca e baixa (< 0.7, mesmo limite do
// Revisor para marcar "a confirmar" no relatorio).
function PreviaFinanceiro({ proposta }: { proposta: unknown }) {
  const hip = ((proposta ?? {}) as PropostaFinanceiro).hipotese;
  if (!hip) return null;

  const confiancaBaixa = (hip.confianca ?? 1) < 0.7;

  return (
    <div style={{ marginBottom: 10 }}>
      {confiancaBaixa && (
        <div style={aviso("#e0b93a", "#fff4d6")}>
          <strong>Confianca baixa ({Math.round((hip.confianca ?? 0) * 100)}%) — confirme antes de aprovar.</strong>
        </div>
      )}
      <div
        style={{
          background: "#f6f6f6",
          border: "1px solid #e0e0e0",
          borderRadius: 6,
          padding: 12,
          fontSize: 14,
        }}
      >
        <p>
          <strong>Hipotese:</strong> {hip.hipotese}
        </p>
        {hip.explicacao && <p style={{ marginTop: 6 }}>{hip.explicacao}</p>}
        {hip.acao_sugerida && (
          <p style={{ marginTop: 6 }}>
            <strong>Acao sugerida:</strong> {hip.acao_sugerida}
          </p>
        )}
        {(hip.valor_a_baixar != null || hip.valor_pendente != null) && (
          <p style={{ marginTop: 6 }}>
            Baixar R$ {(hip.valor_a_baixar ?? 0).toFixed(2)} · Pendente R${" "}
            {(hip.valor_pendente ?? 0).toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}

function aviso(borda: string, fundo: string): React.CSSProperties {
  return {
    background: fundo,
    border: `1px solid ${borda}`,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    fontSize: 13,
  };
}

function botao(cor: string): React.CSSProperties {
  return {
    padding: "8px 12px",
    border: "none",
    borderRadius: 6,
    background: cor,
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
  };
}
