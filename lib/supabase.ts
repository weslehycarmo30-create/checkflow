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
const publicConfigCacheKey = "checkflow:supabase-public-config";

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

  try {
    const cached = window.localStorage.getItem(publicConfigCacheKey);
    if (cached) {
      const config = JSON.parse(cached) as { url?: string; publicKey?: string };
      if (config.url && config.publicKey) {
        browserClient = createBrowserClient(config.url, config.publicKey);
        return browserClient;
      }
    }
  } catch {
    // O cache é apenas uma contingência; falhas de armazenamento não bloqueiam a conexão.
  }

  initialization ??= (async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        const response = await fetch("/api/supabase-config", {
          cache: "no-store",
          signal: controller.signal,
        });
        window.clearTimeout(timeout);
        if (response.ok) {
          const config = (await response.json()) as { url?: string; publicKey?: string };
          if (config.url && config.publicKey) {
            browserClient = createBrowserClient(config.url, config.publicKey);
            try {
              window.localStorage.setItem(publicConfigCacheKey, JSON.stringify(config));
            } catch {
              // A sessão atual continua funcionando mesmo se o navegador bloquear o cache.
            }
            return browserClient;
          }
        }
      } catch {
        // Repete chamadas temporariamente interrompidas pela rede móvel.
      }
      if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 500 * (attempt + 1)));
    }
    return null;
  })().finally(() => {
    initialization = null;
  });

  return initialization;
}
