"use client";

import { useEffect, useState } from "react";
import {
  initializeSupabaseBrowserClient,
  supabaseConfiguration,
} from "../lib/supabase";

type ConnectionState = "checking" | "ready" | "error";

export function SupabaseConnectionStatus() {
  const [state, setState] = useState<ConnectionState>(
    supabaseConfiguration.configured ? "checking" : "error",
  );

  useEffect(() => {
    initializeSupabaseBrowserClient()
      .then((client) => client?.auth.getSession())
      .then((result) => setState(result && !result.error ? "ready" : "error"))
      .catch(() => setState("error"));
  }, []);

  if (state !== "error") return null;

  const detail = supabaseConfiguration.configured
    ? "O cliente não conseguiu validar a sessão. Revise a URL e a chave pública do projeto."
    : "Não foi possível carregar a configuração pública do Supabase no ambiente de execução.";

  return (
    <section className="configuration-notice" role="status">
      <strong>Configuração do Supabase pendente</strong>
      <span>{detail}</span>
    </section>
  );
}
