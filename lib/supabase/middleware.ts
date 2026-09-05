import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rotas que nao exigem login.
const ROTAS_PUBLICAS = ["/login"];

// Renova a sessao a cada request e protege as rotas privadas.
// Nunca deixa uma excecao virar 500 generico (MIDDLEWARE_INVOCATION_FAILED):
// registra o erro real no log e cai para um estado seguro.
export async function atualizarSessao(request: NextRequest) {
  const caminho = request.nextUrl.pathname;
  const ehPublica = ROTAS_PUBLICAS.some(
    (rota) => caminho === rota || caminho.startsWith(rota + "/"),
  );
  // Rotas de API cuidam da propria autenticacao e respondem JSON; o
  // middleware so renova a sessao, nao redireciona.
  const ehApi = caminho.startsWith("/api/");

  const paraLogin = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem credenciais nao da para validar a sessao. Em vez de derrubar
  // toda requisicao, registra o que falta e falha fechado nas rotas
  // privadas (rotas publicas e de API seguem normalmente).
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "[middleware] Variaveis do Supabase ausentes: " +
        `NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl ? "ok" : "faltando"} ` +
        `NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnonKey ? "ok" : "faltando"}`,
    );
    return ehPublica || ehApi ? NextResponse.next({ request }) : paraLogin();
  }

  try {
    let resposta = NextResponse.next({ request });

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesParaGravar) {
          cookiesParaGravar.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          resposta = NextResponse.next({ request });
          cookiesParaGravar.forEach(({ name, value, options }) =>
            resposta.cookies.set(name, value, options),
          );
        },
      },
    });

    // Nao coloque logica entre criar o cliente e getUser().
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && !ehPublica && !ehApi) {
      return paraLogin();
    }

    if (user && caminho === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    return resposta;
  } catch (erro) {
    // Qualquer falha ao falar com o Supabase (rede, chave invalida,
    // resposta inesperada) cai aqui. Registra o erro real e falha
    // fechado: rotas privadas vao para /login em vez de dar 500.
    console.error("[middleware] Falha ao renovar a sessao:", erro);
    return ehPublica || ehApi ? NextResponse.next({ request }) : paraLogin();
  }
}
