"use client";

import { useEffect } from "react";
import { initializeSupabaseBrowserClient } from "../lib/supabase";

export function PrivateRouteGuard() {
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    initializeSupabaseBrowserClient().then((client) => {
      if (!client) return;
      client.auth.getSession().then(({ data }) => {
        if (!data.session) window.location.replace("/auth");
      });
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT" || !session) window.location.replace("/auth");
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => unsubscribe?.();
  }, []);

  return null;
}
