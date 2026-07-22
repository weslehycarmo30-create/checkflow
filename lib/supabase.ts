import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabasePublicKey = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)?.trim();

export const supabaseConfiguration = {
  configured: Boolean(supabaseUrl && supabasePublicKey),
  missing: [
    !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !supabasePublicKey
      ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ou NEXT_PUBLIC_SUPABASE_ANON_KEY)"
      : null,
  ].filter((value): value is string => Boolean(value)),
};

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabasePublicKey) return null;

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabasePublicKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}
