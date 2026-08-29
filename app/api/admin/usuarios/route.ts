import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Cria um usuario no Supabase Auth e a linha correspondente em `perfis`.
// So um admin pode chamar. Usa a service role (SPEC 2.3).
export async function POST(request: Request) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }

  const { data: perfilAtual } = await supabase
    .from("perfis")
    .select("papel")
    .eq("id", user.id)
    .maybeSingle();

  if (perfilAtual?.papel !== "admin") {
    return NextResponse.json({ erro: "Acesso restrito a admin." }, { status: 403 });
  }

  let corpo: {
    email?: string;
    senha?: string;
    nome?: string;
    papel?: string;
    areas?: string[];
  };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }

  const email = corpo.email?.trim();
  const senha = corpo.senha ?? "";
  const nome = corpo.nome?.trim() ?? "";
  const papel = corpo.papel === "admin" ? "admin" : "operador";
  const areas = Array.isArray(corpo.areas)
    ? corpo.areas.filter((a) => a === "vendas" || a === "financeiro")
    : [];

  if (!email || senha.length < 6 || !nome) {
    return NextResponse.json(
      { erro: "E-mail, nome e senha (min. 6) sao obrigatorios." },
      { status: 400 },
    );
  }

  const admin = criarClienteAdmin();

  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (erroAuth || !criado.user) {
    return NextResponse.json(
      { erro: `Auth: ${erroAuth?.message ?? "falha ao criar usuario."}` },
      { status: 400 },
    );
  }

  const { data: perfil, error: erroPerfil } = await admin
    .from("perfis")
    .insert({ id: criado.user.id, email, nome, papel, areas })
    .select("*")
    .single();

  if (erroPerfil) {
    // Desfaz o usuario do Auth para nao deixar orfao.
    await admin.auth.admin.deleteUser(criado.user.id);
    return NextResponse.json(
      { erro: `Perfil: ${erroPerfil.message}` },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, perfil });
}
