"use client";

import { useCallback, useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { Execucao } from "@/lib/tipos";

interface Props {
  itemId: string;
}

function segundos(exec: Execucao): string {
  if (!exec.inicio || !exec.fim) return "—";
  const ms = new Date(exec.fim).getTime() - new Date(exec.inicio).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

const COR_STATUS: Record<string, string> = {
  rodando: "#e0b93a",
  ok: "#1a7f37",
  erro: "#c0392b",
};

// Detalhe de execucao: lista as execucoes de um item_id em ordem (SPEC 3.5).
export default function LinhaDoTempo({ itemId }: Props) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const supabase = criarClienteNavegador();
    const { data } = await supabase
      .from("execucoes_agentes")
      .select("*")
      .eq("item_id", itemId)
      .order("inicio", { ascending: true });
    setExecucoes((data as Execucao[] | null) ?? []);
  }, [itemId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3 style={{ fontSize: 15 }}>Linha do tempo</h3>
        <button
          onClick={carregar}
          style={{
            fontSize: 12,
            padding: "4px 8px",
            border: "1px solid #ccc",
            borderRadius: 6,
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Atualizar
        </button>
      </div>

      {execucoes.length === 0 && (
        <p style={{ color: "#777", fontSize: 14 }}>Sem execucoes.</p>
      )}

      <ol style={{ listStyle: "none", marginTop: 8 }}>
        {execucoes.map((e) => (
          <li
            key={e.id}
            style={{ borderBottom: "1px solid #eee", padding: "8px 0" }}
          >
            <button
              onClick={() => setExpandido(expandido === e.id ? null : e.id)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                textAlign: "left",
              }}
            >
              <span style={{ fontWeight: 600 }}>{e.agente}</span>
              <span style={{ color: COR_STATUS[e.status] ?? "#555" }}>
                {e.status}
              </span>
              <span style={{ color: "#555" }}>{segundos(e)}</span>
              <span style={{ color: "#555" }}>
                {(e.tokens_entrada ?? 0) + (e.tokens_saida ?? 0)} tok
              </span>
            </button>

            {expandido === e.id && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                {e.erro && (
                  <p style={{ color: "#c0392b" }}>Erro: {e.erro}</p>
                )}
                <p style={{ fontWeight: 600, marginTop: 6 }}>entrada</p>
                <pre style={bloco}>
                  {JSON.stringify(e.entrada, null, 2)}
                </pre>
                <p style={{ fontWeight: 600, marginTop: 6 }}>saida</p>
                <pre style={bloco}>{JSON.stringify(e.saida, null, 2)}</pre>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

const bloco: React.CSSProperties = {
  background: "#f6f6f6",
  border: "1px solid #e0e0e0",
  borderRadius: 6,
  padding: 10,
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
