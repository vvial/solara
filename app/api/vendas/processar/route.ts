import { NextResponse } from "next/server";
import { processarPedido } from "@/lib/orquestradores/vendas";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const maxDuration = 60;

// Dispara o orquestrador de Vendas para um pedido (SPEC 4.2).
// So usuarios com 'vendas' em perfis.areas podem chamar.
export async function POST(request: Request) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("perfis")
    .select("areas")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.areas?.includes("vendas")) {
    return NextResponse.json({ erro: "Acesso restrito a vendas." }, { status: 403 });
  }

  let corpo: { cod_pedido?: string };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }

  const codPedido = corpo.cod_pedido?.trim();
  if (!codPedido) {
    return NextResponse.json({ erro: "cod_pedido e obrigatorio." }, { status: 400 });
  }

  try {
    await processarPedido(codPedido);
  } catch (erro) {
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Falha ao processar pedido." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
