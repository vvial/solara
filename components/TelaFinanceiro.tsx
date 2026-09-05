"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import FilaAprovacao from "@/components/FilaAprovacao";
import LinhaDoTempo from "@/components/LinhaDoTempo";
import Organograma from "@/components/Organograma";
import type { Divergencia, Lancamento, StatusDivergencia } from "@/lib/tipos";

interface Resumo {
  total_linhas: number;
  casados: number;
  divergentes: number;
  ignorados: number;
}

const COLUNAS_DIVERGENCIA: { chave: StatusDivergencia; titulo: string }[] = [
  { chave: "nova", titulo: "Nova" },
  { chave: "investigando", titulo: "Investigando" },
  { chave: "aguardando_aprovacao", titulo: "Aguardando aprovacao" },
  { chave: "resolvida", titulo: "Resolvida" },
];

// Tela de Financeiro (SPEC 5.2): organograma da conciliacao corrente em
// cima, bloco de importar com antes/depois, botao conciliar, resultado em
// tres listas, abas Relatorio e Aprovacoes.
export default function TelaFinanceiro() {
  const [extratoId, setExtratoId] = useState<string | null>(null);
  const [antes, setAntes] = useState<string[]>([]);
  const [depois, setDepois] = useState<string[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);
  const [relatorioMarkdown, setRelatorioMarkdown] = useState<string | null>(null);
  const [aba, setAba] = useState<"resultado" | "relatorio" | "aprovacoes">("resultado");
  const [painelAberto, setPainelAberto] = useState(false);
  const [importando, setImportando] = useState(false);
  const [conciliando, setConciliando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregarDados = useCallback(async (id: string) => {
    const supabase = criarClienteNavegador();
    const [{ data: lancs }, { data: divs }] = await Promise.all([
      supabase.from("lancamentos").select("*").eq("extrato_id", id),
      supabase
        .from("divergencias")
        .select("*")
        .eq("extrato_id", id)
        .order("criado_em", { ascending: true }),
    ]);
    setLancamentos((lancs as Lancamento[] | null) ?? []);
    setDivergencias((divs as Divergencia[] | null) ?? []);
  }, []);

  const carregarRelatorio = useCallback(async (id: string) => {
    const supabase = criarClienteNavegador();
    const { data } = await supabase
      .from("execucoes_agentes")
      .select("saida")
      .eq("item_id", id)
      .eq("agente", "consolidador")
      .eq("status", "ok")
      .order("inicio", { ascending: false })
      .limit(1);
    const saida = data?.[0]?.saida as { relatorio_markdown?: string } | undefined;
    setRelatorioMarkdown(saida?.relatorio_markdown ?? null);
  }, []);

  // Kanban de divergencias por Realtime (mesma necessidade do kanban de
  // Vendas, SPEC 4.1/5.2).
  useEffect(() => {
    if (!extratoId) return;
    const supabase = criarClienteNavegador();
    const canal = supabase
      .channel(`divergencias-${extratoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "divergencias",
          filter: `extrato_id=eq.${extratoId}`,
        },
        (payload) => {
          const linha = payload.new as Divergencia | undefined;
          if (!linha?.id) return;
          setDivergencias((atual) => {
            const i = atual.findIndex((d) => d.id === linha.id);
            if (i === -1) return [...atual, linha];
            const copia = atual.slice();
            copia[i] = linha;
            return copia;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [extratoId]);

  async function importar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const form = evento.currentTarget;
    const dados = new FormData(form);

    setImportando(true);
    try {
      const resposta = await fetch("/api/financeiro/importar", {
        method: "POST",
        body: dados,
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? "Falha ao importar.");

      setExtratoId(corpo.extrato_id);
      setAntes(corpo.antes);
      setDepois(corpo.depois);
      setResumo(corpo.resumo);
      setRelatorioMarkdown(null);
      setAba("resultado");
      await carregarDados(corpo.extrato_id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setImportando(false);
    }
  }

  async function conciliarAgora() {
    if (!extratoId) return;
    setErro(null);
    setConciliando(true);
    try {
      const resposta = await fetch("/api/financeiro/conciliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extrato_id: extratoId }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? "Falha ao conciliar.");
      await carregarDados(extratoId);
      await carregarRelatorio(extratoId);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao conciliar.");
    } finally {
      setConciliando(false);
    }
  }

  const bateram = lancamentos.filter((l) => l.situacao === "casado");
  const ignorados = lancamentos.filter((l) => l.situacao === "ignorado");

  return (
    <main style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Financeiro</h1>
        <Link href="/" style={{ fontSize: 14, color: "#555" }}>
          ← Voltar
        </Link>
      </header>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 15, color: "#555", marginBottom: 8 }}>Organograma</h2>
        {extratoId ? (
          <div style={{ border: "1px solid #d0d7de", borderRadius: 8, background: "#fff" }}>
            <Organograma area="financeiro" itemId={extratoId} />
          </div>
        ) : (
          <p style={{ color: "#777", fontSize: 14 }}>Nenhuma conciliacao em andamento.</p>
        )}
      </section>

      {erro && <p style={{ marginTop: 16, color: "#c0392b", fontSize: 14 }}>{erro}</p>}

      <section
        style={{
          marginTop: 32,
          padding: 20,
          border: "1px solid #d0d7de",
          borderRadius: 8,
          background: "#fff",
        }}
      >
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Importar</h2>
        <form onSubmit={importar} style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ fontSize: 13 }}>
            Extrato (obrigatorio)
            <input type="file" name="extrato" accept=".csv,.txt" required style={{ display: "block", marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Titulos (opcional)
            <input type="file" name="titulos" accept=".csv,.txt" style={{ display: "block", marginTop: 4 }} />
          </label>
          <button
            type="submit"
            disabled={importando}
            style={{
              padding: "10px 14px",
              border: "none",
              borderRadius: 6,
              background: "#1a1a1a",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {importando ? "Importando…" : "Importar"}
          </button>
        </form>

        {antes.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
              Antes e depois (6 primeiras linhas):
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <pre style={blocoPre}>{antes.join("\n")}</pre>
              <pre style={blocoPre}>{depois.join("\n")}</pre>
            </div>
          </div>
        )}

        {resumo && (
          <div style={{ marginTop: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#555" }}>
              {resumo.total_linhas} linhas · {resumo.casados} bateram · {resumo.divergentes} divergencias ·{" "}
              {resumo.ignorados} ignorados
            </span>
            <button
              onClick={conciliarAgora}
              disabled={conciliando}
              style={{
                padding: "8px 12px",
                border: "none",
                borderRadius: 6,
                background: "#1a7f37",
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {conciliando ? "Conciliando…" : "Conciliar"}
            </button>
          </div>
        )}
      </section>

      <div style={{ marginTop: 32, display: "flex", gap: 4 }}>
        <button onClick={() => setAba("resultado")} style={botaoAba(aba === "resultado")}>
          Resultado
        </button>
        <button onClick={() => setAba("relatorio")} style={botaoAba(aba === "relatorio")}>
          Relatorio
        </button>
        <button onClick={() => setAba("aprovacoes")} style={botaoAba(aba === "aprovacoes")}>
          Aprovacoes
        </button>
      </div>

      {aba === "resultado" && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 24 }}>
          {!extratoId ? (
            <p style={{ color: "#777", fontSize: 14 }}>
              Importe um extrato acima para ver o resultado da conciliacao.
            </p>
          ) : (
            <>
              <div>
                <h3 style={{ fontSize: 14, marginBottom: 8 }}>Bateram ({bateram.length})</h3>
                <ListaLancamentos lancamentos={bateram} cor="#1a7f37" />
              </div>

              <div>
                <h3 style={{ fontSize: 14, marginBottom: 8 }}>Divergencias ({divergencias.length})</h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(220px, 1fr))",
                    gap: 16,
                    overflowX: "auto",
                  }}
                >
                  {COLUNAS_DIVERGENCIA.map((coluna) => {
                    const itens = divergencias.filter((d) => d.status === coluna.chave);
                    return (
                      <div key={coluna.chave}>
                        <h4 style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
                          {coluna.titulo} ({itens.length})
                        </h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {itens.map((d) => (
                            <div
                              key={d.id}
                              onClick={() => setPainelAberto(true)}
                              style={{
                                padding: 12,
                                border: "1px solid #d0d7de",
                                borderRadius: 8,
                                background: "#fff",
                                cursor: "pointer",
                                fontSize: 13,
                              }}
                            >
                              <strong>{d.tipo_inicial}</strong>
                              <p style={{ marginTop: 4, color: "#555" }}>
                                R$ {(d.valor_lancamento ?? d.valor_titulo ?? 0).toFixed(2)}
                                {d.cod_titulo ? ` · ${d.cod_titulo}` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: 14, marginBottom: 8 }}>Ignorados ({ignorados.length})</h3>
                <ListaLancamentos lancamentos={ignorados} cor="#999" />
              </div>
            </>
          )}
        </div>
      )}

      {aba === "relatorio" && (
        <div style={{ marginTop: 16 }}>
          {relatorioMarkdown ? (
            <pre style={{ ...blocoPre, whiteSpace: "pre-wrap" }}>{relatorioMarkdown}</pre>
          ) : (
            <p style={{ color: "#777", fontSize: 14 }}>
              {extratoId
                ? "Ainda sem relatorio. Clique em Conciliar para gera-lo."
                : "Importe um extrato e clique em Conciliar para gerar o relatorio."}
            </p>
          )}
        </div>
      )}

      {aba === "aprovacoes" && (
        <div style={{ marginTop: 16 }}>
          <FilaAprovacao area="financeiro" />
        </div>
      )}

      {painelAberto && extratoId && (
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
            <h2 style={{ fontSize: 16 }}>Linha do tempo da conciliacao</h2>
            <button
              onClick={() => setPainelAberto(false)}
              style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#555" }}
            >
              Fechar ✕
            </button>
          </div>
          <div style={{ marginTop: 16 }}>
            <LinhaDoTempo itemId={extratoId} />
          </div>
        </div>
      )}
    </main>
  );
}

function ListaLancamentos({ lancamentos, cor }: { lancamentos: Lancamento[]; cor: string }) {
  if (lancamentos.length === 0) {
    return <p style={{ color: "#777", fontSize: 13 }}>Nenhum.</p>;
  }
  return (
    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
      {lancamentos.map((l) => (
        <li
          key={l.id}
          style={{
            padding: "8px 12px",
            border: `1px solid ${cor}`,
            borderRadius: 6,
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>
            {l.data} · {l.descricao}
          </span>
          <span>
            R$ {l.valor.toFixed(2)}
            {l.cod_titulo_casado ? ` · ${l.cod_titulo_casado}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

const blocoPre: React.CSSProperties = {
  background: "#f6f6f6",
  border: "1px solid #e0e0e0",
  borderRadius: 6,
  padding: 10,
  fontSize: 12,
  overflowX: "auto",
};

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
