import { createFileRoute } from "@tanstack/react-router";

import { safeEqual } from "@/lib/telegram.server";

// Polled by the external verification bridge (the Telethon userbot running on
// an always-on machine). Returns pending trader IDs to forward to the Quotex
// affiliate bot. Protected by VERIFIER_SECRET.
export const Route = createFileRoute("/api/public/telegram/pending-requests")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["VERIFIER_SECRET"];
        const provided = request.headers.get("X-Verifier-Secret") ?? "";
        if (!secret || !safeEqual(provided, secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("verification_requests")
          .select("id, chat_id, trader_id, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(50);

        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }
        return Response.json({ requests: data ?? [] });
      },
    },
  },
});
