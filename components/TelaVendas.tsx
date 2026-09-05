"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import FilaAprovacao from "@/components/FilaAprovacao";
import FormularioPedido from "@/components/FormularioPedido";
import LinhaDoTempo from "@/components/LinhaDoTempo";
import Organograma from "@/components/Organograma";
import type { Cliente, Pedido, StatusPedido } from "@/lib/tipos";

interface Props {
  pedidosIniciais: Pedido[];
  clientes: Cliente[];
}

const COLUNAS: { chave: StatusPedido; titulo: string }[] = [
  { chave: "novo", titulo: "Novo" },
  { chave: "processando", titulo: "Processando" },
  { chave: "aguardando_aprovacao", titulo: "Aguardando aprovacao" },
  { chave: "respondido", titulo: "Respondido" },
  { chave: "rejeitado", titulo: "Rejeitado" },
];

// Tela de Vendas (SPEC 4.1): organograma do pedido selecionado em cima,
// kanban de pedidos_orcamento embaixo, painel lateral com a linha do tempo.
export default function TelaVendas({ pedidosIniciais, clientes }: Props) {
  const [pedidos, setPedidos] = useState<Pedido[]>(pedidosIniciais);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [processando, setProcessando] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"kanban" | "aprovacoes">("kanban");
  const [mostrarNovoPedido, setMostrarNovoPedido] = useState(false);

  const nomesClientes = new Map(clientes.map((c) => [c.cod_cliente, c.nome]));

  // Kanban por Realtime na tabela pedidos_orcamento (SPEC 4.1).
  useEffect(() => {
    const supabase = criarClienteNavegador();
    const canal = supabase
      .channel("kanban-pedidos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos_orcamento" },
        (payload) => {
          const linha = (payload.new ?? payload.old) as Pedido | undefined;
          if (!linha?.cod_pedido) return;

          if (payload.eventType === "DELETE") {
            setPedidos((atual) =>
              atual.filter((p) => p.cod_pedido !== linha.cod_pedido),
            );
            return;
          }

          setPedidos((atual) => {
            const i = atual.findIndex((p) => p.cod_pedido === linha.cod_pedido);
            if (i === -1) return [linha as Pedido, ...atual];
            const copia = atual.slice();
            copia[i] = linha as Pedido;
            return copia;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  async function processar(codPedido: string, evento: React.MouseEvent) {
    evento.stopPropagation();
    setErro(null);
    setProcessando((atual) => new Set(atual).add(codPedido));

    try {
      const resposta = await fetch("/api/vendas/processar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod_pedido: codPedido }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        throw new Error(corpo.erro ?? "Falha ao processar pedido.");
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao processar pedido.");
    } finally {
      setProcessando((atual) => {
        const copia = new Set(atual);
        copia.delete(codPedido);
        return copia;
      });
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Vendas</h1>
        <Link href="/" style={{ fontSize: 14, color: "#555" }}>
          ← Voltar
        </Link>
      </header>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 15, color: "#555", marginBottom: 8 }}>
          Organograma
        </h2>
        {selecionado ? (
          <div style={{ border: "1px solid #d0d7de", borderRadius: 8, background: "#fff" }}>
            <Organograma area="vendas" itemId={selecionado} />
          </div>
        ) : (
          <p style={{ color: "#777", fontSize: 14 }}>
            Selecione um pedido para ver o organograma.
          </p>
        )}
      </section>

      {erro && (
        <p style={{ marginTop: 16, color: "#c0392b", fontSize: 14 }}>{erro}</p>
      )}

      <div
        style={{
          marginTop: 32,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setAba("kanban")}
            style={botaoAba(aba === "kanban")}
          >
            Kanban
          </button>
          <button
            onClick={() => setAba("aprovacoes")}
            style={botaoAba(aba === "aprovacoes")}
          >
            Aprovacoes
          </button>
        </div>

        {aba === "kanban" && (
          <button
            onClick={() => setMostrarNovoPedido(true)}
            style={{
              padding: "8px 12px",
              border: "none",
              borderRadius: 6,
              background: "#1a1a1a",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            + Novo pedido
          </button>
        )}
      </div>

      {aba === "aprovacoes" && (
        <section style={{ marginTop: 16 }}>
          <FilaAprovacao area="vendas" />
        </section>
      )}

      {aba === "kanban" && (
      <section
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(220px, 1fr))",
          gap: 16,
          overflowX: "auto",
        }}
      >
        {COLUNAS.map((coluna) => {
          const itens = pedidos.filter((p) => p.status === coluna.chave);
          return (
            <div key={coluna.chave}>
              <h3 style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
                {coluna.titulo} ({itens.length})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {itens.map((pedido) => (
                  <div
                    key={pedido.cod_pedido}
                    onClick={() => setSelecionado(pedido.cod_pedido)}
                    style={{
                      padding: 12,
                      border:
                        selecionado === pedido.cod_pedido
                          ? "1px solid #1a1a1a"
                          : "1px solid #d0d7de",
                      borderRadius: 8,
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong>{pedido.cod_pedido}</strong>
                      <span style={{ color: "#777" }}>{pedido.data}</span>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {nomesClientes.get(pedido.cod_cliente ?? "") ??
                        "Cliente desconhecido"}
                      <span style={{ color: "#999" }}> · {pedido.canal}</span>
                    </div>
                    <p style={{ marginTop: 6, color: "#555" }}>
                      {pedido.mensagem.slice(0, 80)}
                      {pedido.mensagem.length > 80 ? "…" : ""}
                    </p>
                    {pedido.status === "novo" && (
                      <button
                        disabled={processando.has(pedido.cod_pedido)}
                        onClick={(e) => processar(pedido.cod_pedido, e)}
                        style={{
                          marginTop: 8,
                          padding: "6px 10px",
                          border: "none",
                          borderRadius: 6,
                          background: "#1a1a1a",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        {processando.has(pedido.cod_pedido)
                          ? "Processando…"
                          : "Processar"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
      )}

      {mostrarNovoPedido && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: 24,
              width: 420,
              maxWidth: "90vw",
            }}
          >
            <h2 style={{ fontSize: 16, marginBottom: 12 }}>Novo pedido</h2>
            <FormularioPedido
              clientes={clientes}
              onFechar={() => setMostrarNovoPedido(false)}
            />
          </div>
        </div>
      )}

      {selecionado && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: 380,
            background: "#fff",
            borderLeft: "1px solid #d0d7de",
            boxShadow: "-4px 0 12px rgba(0,0,0,0.08)",
            padding: 20,
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 16 }}>{selecionado}</h2>
            <button
              onClick={() => setSelecionado(null)}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 14,
                color: "#555",
              }}
            >
              Fechar ✕
            </button>
          </div>
          <div style={{ marginTop: 16 }}>
            <LinhaDoTempo itemId={selecionado} />
          </div>
        </div>
      )}
    </main>
  );
}

function botaoAba(ativa: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    border: "1px solid #d0d7de",
    borderBottom: ativa ? "2px solid #1a1a1a" : "1px solid #d0d7de",
    borderRadius: 0,
    background: ativa ? "#fff" : "#f6f6f6",
    fontWeight: ativa ? 600 : 400,
    cursor: "pointer",
    fontSize: 13,
  };
}
