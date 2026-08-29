import { createClient } from "@supabase/supabase-js";

// Cliente Supabase com a service role. Ignora RLS e permite a Admin API
// (criar usuarios, etc.). NUNCA importe isto em codigo que roda no
// navegador — so em rotas de API no servidor.
export function criarClienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
