"use client";

import { useRouter } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/navegador";

export default function BotaoSair() {
  const router = useRouter();

  async function sair() {
    const supabase = criarClienteNavegador();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={sair}
      style={{
        padding: "8px 12px",
        border: "1px solid #ccc",
        borderRadius: 6,
        background: "#fff",
        cursor: "pointer",
      }}
    >
      Sair
    </button>
  );
}
