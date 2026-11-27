/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { crmPublicationResponse } from "../lib/crm-publication-guard.mjs";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  // This binding exists only in the local Vite/Miniflare configuration. It is
  // deliberately not a hosted Sites variable: CRM must be unavailable unless
  // the runtime explicitly identifies itself as the local development target.
  CRM_LOCAL_DEVELOPMENT?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // `vinext start` can invoke the local worker without a bindings object.
    // Missing binding is intentionally treated as a non-local runtime, so CRM
    // remains denied while public application routes can still render.
    const crmResponse = crmPublicationResponse(url.pathname, env?.CRM_LOCAL_DEVELOPMENT === "true");
    if (crmResponse) return crmResponse;

    if (url.pathname === "/api/team-invitations") {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

      const supabaseUrl = env?.NEXT_PUBLIC_SUPABASE_URL?.trim();
      const publicKey = (env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env?.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
      const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY?.trim();
      const accessToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      if (!supabaseUrl || !publicKey || !serviceKey) {
        return Response.json({ error: "Convites não configurados no ambiente." }, { status: 503 });
      }
      if (!accessToken) return Response.json({ error: "Sessão não encontrada." }, { status: 401 });

      const payload = await request.json().catch(() => null) as { email?: unknown; role?: unknown } | null;
      const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
      const requestedRole = payload?.role === "manager" ? "manager" : payload?.role === "collaborator" || payload?.role === undefined ? "collaborator" : null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
      if (!requestedRole) return Response.json({ error: "Papel de convite inválido." }, { status: 400 });

      // Network failures and 5xx from Supabase are an outage, not a bad session or a lack of permission.
      const upstream = (input: string, init: RequestInit) => fetch(input, init).catch(() => null);
      const unavailable = () => Response.json({ error: "Serviço de autenticação indisponível. Tente novamente." }, { status: 502 });

      const userResponse = await upstream(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: publicKey, Authorization: `Bearer ${accessToken}` },
      });
      if (!userResponse || userResponse.status >= 500) return unavailable();
      const user = userResponse.ok ? await userResponse.json().catch(() => null) as { id?: string } | null : null;
      if (!user?.id) return Response.json({ error: "Sessão inválida." }, { status: 401 });

      // The server derives the organization from the authenticated membership;
      // it never accepts an organization_id from the browser.
      const membershipResponse = await upstream(
        `${supabaseUrl}/rest/v1/organization_members?select=organization_id,role&user_id=eq.${encodeURIComponent(user.id)}&active=is.true`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      );
      if (!membershipResponse?.ok) return unavailable();
      const memberships = await membershipResponse.json().catch(() => []) as Array<{ organization_id: string; role: "owner" | "manager" | "collaborator" }>;
      if (memberships.length !== 1 || !["owner", "manager"].includes(memberships[0].role)) {
        return Response.json({ error: "Apenas owner ou manager com uma organização ativa pode convidar." }, { status: 403 });
      }
      const requester = memberships[0];
      if (requester.role === "manager" && requestedRole !== "collaborator") {
        return Response.json({ error: "Manager só pode convidar executor." }, { status: 403 });
      }

      // GoTrue reads redirect_to from the query string. The invited person has no password yet,
      // so the link opens the "set password" form of the auth screen.
      const redirectTo = encodeURIComponent(`${url.origin}/auth?mode=reset`);
      const inviteResponse = await upstream(`${supabaseUrl}/auth/v1/invite?redirect_to=${redirectTo}`, {
        method: "POST",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!inviteResponse || inviteResponse.status >= 500) return unavailable();
      // GoTrue returns the user object itself; some responses wrap it in `user`.
      const invite = await inviteResponse.json().catch(() => ({})) as { id?: string; user?: { id?: string }; msg?: string; message?: string };
      const invitedUserId = invite.user?.id ?? invite.id;
      if (!inviteResponse.ok || !invitedUserId) {
        return Response.json({ error: invite.msg || invite.message || "Não foi possível criar o convite." }, { status: 400 });
      }

      // An invitation still pending elsewhere is accepted again by GoTrue. Linking that person
      // here too would attach them to a second company without their consent.
      const invitedResponse = await upstream(
        `${supabaseUrl}/rest/v1/organization_members?select=organization_id&user_id=eq.${encodeURIComponent(invitedUserId)}&active=is.true`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      );
      const invitedMemberships = invitedResponse?.ok
        ? await invitedResponse.json().catch(() => null) as Array<{ organization_id: string }> | null
        : null;
      if (!invitedMemberships) return unavailable();
      if (invitedMemberships.some(membership => membership.organization_id !== requester.organization_id)) {
        return Response.json({ error: "Este e-mail já está vinculado a outra empresa." }, { status: 409 });
      }

      const createMembershipResponse = await upstream(`${supabaseUrl}/rest/v1/organization_members`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          organization_id: requester.organization_id,
          user_id: invitedUserId,
          role: requestedRole,
          active: true,
          created_by: user.id,
        }),
      });
      if (!createMembershipResponse?.ok) {
        return Response.json({ error: "Convite criado, mas a associação à organização falhou." }, { status: 502 });
      }
      return Response.json({ message: "Convite enviado e membro associado à organização." }, { status: 201 });
    }

    if (url.pathname === "/api/supabase-config") {
      const supabaseUrl = env?.NEXT_PUBLIC_SUPABASE_URL?.trim();
      const supabasePublicKey = (
        env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        env?.NEXT_PUBLIC_SUPABASE_ANON_KEY
      )?.trim();
      return Response.json(
        supabaseUrl && supabasePublicKey
          ? { url: supabaseUrl, publicKey: supabasePublicKey }
          : { error: "Supabase não configurado no ambiente." },
        { status: supabaseUrl && supabasePublicKey ? 200 : 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
