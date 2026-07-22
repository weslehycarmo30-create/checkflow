"use client";

import { useState } from "react";
import { initializeSupabaseBrowserClient } from "../lib/supabase";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    const client = await initializeSupabaseBrowserClient();
    if (!client || busy) return;
    setBusy(true);
    const { error } = await client.auth.signOut();
    if (error) {
      setBusy(false);
      window.alert("Não foi possível sair. Tente novamente.");
      return;
    }
    window.location.replace("/auth");
  }

  return (
    <button className="avatar main-avatar logout-avatar" onClick={logout} disabled={busy} title="Sair do CheckFlow" aria-label="Sair do CheckFlow">
      {busy ? "…" : "WA"}
    </button>
  );
}
