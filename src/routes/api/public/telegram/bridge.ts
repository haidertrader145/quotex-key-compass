import { createFileRoute } from "@tanstack/react-router";

import { safeEqual } from "@/lib/telegram.server";

// Used by the always-on bridge. GET returns its config + saved login state.
// POST updates status / saves the session. Protected by VERIFIER_SECRET.
function authorized(request: Request) {
  const secret = process.env["VERIFIER_SECRET"];
  const provided = request.headers.get("X-Verifier-Secret") ?? "";
  return !!secret && safeEqual(provided, secret);
}

export const Route = createFileRoute("/api/public/telegram/bridge")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("bridge_state").select("*").eq("id", 1).maybeSingle();
        return Response.json({
          api_id: process.env["TG_API_ID"] ?? null,
          api_hash: process.env["TG_API_HASH"] ?? null,
          phone: process.env["TG_PHONE"] ?? null,
          password: process.env["TG_2FA_PASSWORD"] ?? null,
          affiliate_bot: process.env["AFFILIATE_BOT"] ?? null,
          session_string: data?.session_string ?? null,
          login_code: data?.login_code ?? null,
        });
      },
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const body = (await request.json()) as {
          status?: string;
          session_string?: string | null;
          clear_code?: boolean;
        };
        const update: Record<string, unknown> = {
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (typeof body.status === "string") update.status = body.status.slice(0, 50);
        if (body.session_string !== undefined) update.session_string = body.session_string;
        if (body.clear_code) update.login_code = null;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("bridge_state").update(update as never).eq("id", 1);
        return Response.json({ ok: true });
      },
    },
  },
});
