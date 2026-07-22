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
let initialization: Promise<SupabaseClient | null> | null = null;

function createBrowserClient(url: string, publicKey: string) {
  return createClient(url, publicKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabasePublicKey) return null;

  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabasePublicKey);
  }

  return browserClient;
}

export async function initializeSupabaseBrowserClient(): Promise<SupabaseClient | null> {
  const existing = getSupabaseBrowserClient();
  if (existing) return existing;
  if (typeof window === "undefined") return null;

  initialization ??= fetch("/api/supabase-config", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return null;
      const config = (await response.json()) as { url?: string; publicKey?: string };
      if (!config.url || !config.publicKey) return null;
      browserClient = createBrowserClient(config.url, config.publicKey);
      return browserClient;
    })
    .catch(() => null);

  return initialization;
}
