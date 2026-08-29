import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import BotaoSair from "@/components/BotaoSair";

export default async function PaginaInicial() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // O middleware ja redireciona, mas garantimos aqui tambem.
  if (!user) {
    redirect("/login");
  }

  return (
    <main style={{ padding: 40 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: 480,
        }}
      >
        <h1>Solara OS</h1>
        <BotaoSair />
      </div>
      <p style={{ marginTop: 16, color: "#555" }}>{user.email}</p>
    </main>
  );
}
