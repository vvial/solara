"use client";

import { useCallback, useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { Aprovacao, Area } from "@/lib/tipos";

interface Props {
  area: Area;
}

// Fila de aprovacao da area. Mesmo componente em Vendas e Financeiro
// (SPEC 3.4). Atualiza a tabela `aprovacoes`; efeitos no pedido/divergencia
// ficam nos orquestradores de cada area.
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
    setOcupado(false);

    if (error) {
      setErro(error.message);
      return;
    }

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
