"use client";

import { useEffect, useRef, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { AGENTES_POR_AREA, type Area, type Execucao } from "@/lib/tipos";

interface Props {
  area: Area;
  itemId: string;
}

type EstadoCartao = "vazio" | "rodando" | "ok" | "erro";

function segundos(exec: Execucao): string | null {
  if (!exec.inicio || !exec.fim) return null;
  const ms = new Date(exec.fim).getTime() - new Date(exec.inicio).getTime();
  return (ms / 1000).toFixed(1);
}

function tokens(exec: Execucao): number {
  return (exec.tokens_entrada ?? 0) + (exec.tokens_saida ?? 0);
}

const CORES: Record<EstadoCartao, { fundo: string; borda: string }> = {
  vazio: { fundo: "#f2f2f2", borda: "#d9d9d9" },
  rodando: { fundo: "#fff4d6", borda: "#e0b93a" },
  ok: { fundo: "#dcf5e3", borda: "#3aa35a" },
  erro: { fundo: "#fbdcdc", borda: "#c0392b" },
};

export default function Organograma({ area, itemId }: Props) {
  const agentes = AGENTES_POR_AREA[area];
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [setaRetornoVermelha, setSetaRetornoVermelha] = useState(false);
  const ultimaReprovacao = useRef<string | null>(null);

  useEffect(() => {
    const supabase = criarClienteNavegador();
    let ativo = true;

    supabase
      .from("execucoes_agentes")
      .select("*")
      .eq("item_id", itemId)
      .order("inicio", { ascending: true })
      .then(({ data }) => {
        if (ativo && data) setExecucoes(data as Execucao[]);
      });

    const canal = supabase
      .channel(`org-${itemId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "execucoes_agentes",
          filter: `item_id=eq.${itemId}`,
        },
        (payload) => {
          const nova = payload.new as Execucao;
          if (!nova?.id) return;
          setExecucoes((atual) => {
            const i = atual.findIndex((e) => e.id === nova.id);
            if (i === -1) return [...atual, nova];
            const copia = atual.slice();
            copia[i] = nova;
            return copia;
          });
        },
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [itemId]);

  // Seta de retorno (revisor -> agente anterior) vermelha por 3s quando o
  // revisor devolve com aprovado = false (SPEC 3.3).
  useEffect(() => {
    const reprovacao = execucoes.find(
      (e) =>
        e.agente === "revisor" &&
        e.status === "ok" &&
        e.saida != null &&
        typeof e.saida === "object" &&
        (e.saida as { aprovado?: boolean }).aprovado === false,
    );
    if (reprovacao && ultimaReprovacao.current !== reprovacao.id) {
      ultimaReprovacao.current = reprovacao.id;
      setSetaRetornoVermelha(true);
      const t = setTimeout(() => setSetaRetornoVermelha(false), 3000);
      return () => clearTimeout(t);
    }
  }, [execucoes]);

  const raiz = execucoes.find((e) => e.agente === "orquestrador");
  const estadoRaiz: EstadoCartao = raiz
    ? (raiz.status as EstadoCartao)
    : "vazio";

  return (
    <div style={{ padding: 16 }}>
      {/* Orquestrador */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Cartao
          titulo="orquestrador"
          estado={estadoRaiz}
          linhaExtra={
            raiz && raiz.status === "ok" && segundos(raiz)
              ? `${segundos(raiz)}s`
              : undefined
          }
        />
      </div>

      {/* Barramento do orquestrador para os agentes */}
      <div
        style={{
          height: 20,
          borderLeft: "1px solid #bbb",
          width: 1,
          margin: "0 auto",
        }}
      />
      <div
        style={{
          borderTop: "1px solid #bbb",
          margin: "0 auto",
          width: "80%",
        }}
      />

      {/* Agentes da area */}
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          alignItems: "flex-start",
          marginTop: 4,
          flexWrap: "wrap",
        }}
      >
        {agentes.map((nome, indice) => {
          const doAgente = execucoes.filter((e) => e.agente === nome);
          const rodando = doAgente.filter((e) => e.status === "rodando").length;
          const okList = doAgente.filter((e) => e.status === "ok");
          const temErro = doAgente.some((e) => e.status === "erro");

          let estado: EstadoCartao = "vazio";
          if (rodando > 0) estado = "rodando";
          else if (temErro) estado = "erro";
          else if (okList.length > 0) estado = "ok";

          const ultimaOk = okList[okList.length - 1];
          let linhaExtra: string | undefined;
          if (nome === "investigador" && doAgente.length > 0) {
            linhaExtra = `${rodando} rodando / ${okList.length} concluidos`;
          } else if (estado === "ok" && ultimaOk) {
            const s = segundos(ultimaOk);
            linhaExtra = `${s ? s + "s" : ""} · ${tokens(ultimaOk)} tok`;
          }

          // Conector entre este cartao e o anterior. O conector imediatamente
          // antes do revisor e a "seta de retorno".
          const ehSetaRetorno = nome === "revisor" && indice > 0;
          const conector =
            indice === 0 ? null : (
              <div
                aria-hidden
                style={{
                  alignSelf: "center",
                  fontSize: 18,
                  color:
                    ehSetaRetorno && setaRetornoVermelha ? "#c0392b" : "#bbb",
                  fontWeight: ehSetaRetorno && setaRetornoVermelha ? 700 : 400,
                }}
              >
                {ehSetaRetorno && setaRetornoVermelha ? "↩" : "→"}
              </div>
            );

          return (
            <div
              key={nome}
              style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
            >
              {conector}
              <Cartao titulo={nome} estado={estado} linhaExtra={linhaExtra} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cartao({
  titulo,
  estado,
  linhaExtra,
}: {
  titulo: string;
  estado: EstadoCartao;
  linhaExtra?: string;
}) {
  const cor = CORES[estado];
  return (
    <div
      className={estado === "rodando" ? "agente-rodando" : undefined}
      style={{
        minWidth: 120,
        padding: "10px 12px",
        borderRadius: 8,
        border: `1px solid ${cor.borda}`,
        background: cor.fundo,
        textAlign: "center",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13 }}>{titulo}</div>
      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
        {linhaExtra ?? estado}
      </div>
    </div>
  );
}
