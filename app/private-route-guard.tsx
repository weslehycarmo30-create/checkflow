"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";

export function PrivateRouteGuard() {
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.replace("/auth");
    });

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) window.location.replace("/auth");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
