"use client";

import { useEffect, useState } from "react";
import {
  getSupabaseBrowserClient,
  supabaseConfiguration,
} from "../lib/supabase";

type ConnectionState = "checking" | "ready" | "error";

export function SupabaseConnectionStatus() {
  const [state, setState] = useState<ConnectionState>(
    supabaseConfiguration.configured ? "checking" : "error",
  );

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;

    client.auth
      .getSession()
      .then(({ error }) => setState(error ? "error" : "ready"))
      .catch(() => setState("error"));
  }, []);

  if (supabaseConfiguration.configured && state !== "error") return null;

  const detail = supabaseConfiguration.configured
    ? "O cliente não conseguiu validar a sessão. Revise a URL e a chave pública do projeto."
    : `Configure ${supabaseConfiguration.missing.join(" e ")} no ambiente de execução.`;

  return (
    <section className="configuration-notice" role="status">
      <strong>Configuração do Supabase pendente</strong>
      <span>{detail}</span>
    </section>
  );
}
