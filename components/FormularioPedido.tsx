"use client";

import { useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { Cliente } from "@/lib/tipos";

const CANAIS = ["e-mail", "whatsapp", "telefone"] as const;

interface Props {
  clientes: Cliente[];
  onFechar: () => void;
}

// Formulario "Novo pedido" (SPEC 4.1): cliente, canal, mensagem. Salva em
// pedidos_orcamento com status 'novo' e cod_pedido sequencial (PED031...).
// Insere direto via client (RLS ainda desligada nesta tabela, igual ao
// FilaAprovacao); o kanban pega a linha nova pelo Realtime ja ligado.
export default function FormularioPedido({ clientes, onFechar }: Props) {
  const [codCliente, setCodCliente] = useState("");
  const [canal, setCanal] = useState<(typeof CANAIS)[number]>("e-mail");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function proximoCodPedido(
    supabase: ReturnType<typeof criarClienteNavegador>,
  ): Promise<string> {
    const { data, error } = await supabase
      .from("pedidos_orcamento")
      .select("cod_pedido")
      .order("cod_pedido", { ascending: false })
      .limit(1);

    if (error) throw new Error(error.message);

    const ultimo = data?.[0]?.cod_pedido as string | undefined;
    const numero = ultimo ? parseInt(ultimo.replace(/\D/g, ""), 10) : 0;
    const proximo = (Number.isFinite(numero) ? numero : 0) + 1;
    return `PED${String(proximo).padStart(3, "0")}`;
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (!codCliente) {
      setErro("Selecione um cliente.");
      return;
    }
    if (!mensagem.trim()) {
      setErro("A mensagem e obrigatoria.");
      return;
    }

    setEnviando(true);
    const supabase = criarClienteNavegador();

    try {
      const codPedido = await proximoCodPedido(supabase);
      const { error } = await supabase.from("pedidos_orcamento").insert({
        cod_pedido: codPedido,
        data: new Date().toISOString().slice(0, 10),
        cod_cliente: codCliente,
        canal,
        mensagem: mensagem.trim(),
        status: "novo",
      });
      if (error) throw new Error(error.message);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao criar pedido.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={enviar}
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      <label style={{ fontSize: 13 }}>
        Cliente
        <select
          value={codCliente}
          onChange={(e) => setCodCliente(e.target.value)}
          required
          style={campo}
        >
          <option value="">Selecione…</option>
          {clientes.map((c) => (
            <option key={c.cod_cliente} value={c.cod_cliente}>
              {c.nome} ({c.cod_cliente})
            </option>
          ))}
        </select>
      </label>

      <label style={{ fontSize: 13 }}>
        Canal
        <select
          value={canal}
          onChange={(e) => setCanal(e.target.value as (typeof CANAIS)[number])}
          style={campo}
        >
          {CANAIS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label style={{ fontSize: 13 }}>
        Mensagem
        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          required
          rows={5}
          style={{ ...campo, resize: "vertical" }}
        />
      </label>

      {erro && <p style={{ color: "#c0392b", fontSize: 13 }}>{erro}</p>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onFechar} style={botaoSecundario}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} style={botao}>
          {enviando ? "Salvando…" : "Salvar pedido"}
        </button>
      </div>
    </form>
  );
}

const campo: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: 6,
  marginTop: 4,
};

const botao: React.CSSProperties = {
  padding: "10px 14px",
  border: "none",
  borderRadius: 6,
  background: "#1a1a1a",
  color: "#fff",
  cursor: "pointer",
};

const botaoSecundario: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #ccc",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
};
