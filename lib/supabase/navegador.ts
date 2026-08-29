import { createBrowserClient } from "@supabase/ssr";

// Cliente Supabase para o navegador. Usa a chave anon (publica).
// Use em Client Components.
export function criarClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
