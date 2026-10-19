import { createFileRoute } from "@tanstack/react-router";
import { formatTraderDetails, parseAffiliateReply } from "@/lib/affiliate-reply";

import {
  deriveTelegramWebhookSecret,
  safeEqual,
  sendMessage,
} from "@/lib/telegram.server";

type TelegramUpdate = {
  update_id?: number;
  message?: {
    chat?: { id?: number };
    from?: { id?: number; username?: string; first_name?: string };
    text?: string;
  };
};

const WELCOME =
  "👋 Welcome!\n\nSend me your <b>Quotex Trader ID</b> and I'll verify it with our affiliate team. Once verified, you'll receive your license key right here.";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const telegramKey = process.env["TELEGRAM_API_KEY"];
        const verifier = process.env["VERIFIER_SECRET"];
        if (!telegramKey && !verifier) {
          return new Response("Not configured", { status: 500 });
        }

        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        const candidates: string[] = [];
        if (verifier) candidates.push(await deriveTelegramWebhookSecret(`verifier:${verifier}`));
        if (telegramKey) candidates.push(await deriveTelegramWebhookSecret(telegramKey));
        if (!candidates.some((c) => safeEqual(actual, c))) {
          console.error("Telegram webhook: secret token mismatch");
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json()) as TelegramUpdate;
        const message = update.message;
        const chatId = message?.chat?.id;
        const text = message?.text?.trim();
        if (!chatId || !text) {
          return Response.json({ ok: true, ignored: true });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          if (text.startsWith("/start")) {
            await sendMessage(chatId, WELCOME);
            return Response.json({ ok: true });
          }

          // Already verified? Show the stored affiliate account details.
          const { data: existing } = await supabaseAdmin
            .from("verified_users")
            .select("trader_id")
            .eq("chat_id", chatId)
            .maybeSingle();

          if (existing) {
            const { data: previous } = await supabaseAdmin
              .from("verification_requests")
              .select("affiliate_reply")
              .eq("chat_id", chatId)
              .eq("trader_id", existing.trader_id)
              .not("affiliate_reply", "is", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const verdict = parseAffiliateReply(previous?.affiliate_reply ?? "", existing.trader_id);
            await sendMessage(
              chatId,
              formatTraderDetails(existing.trader_id, verdict.kind === "verified" ? verdict : { kind: "verified", country: null, deposit: null, balance: null }),
            );
            return Response.json({ ok: true });
          }

          const traderId = text.replace(/\s+/g, "");
          if (!/^[A-Za-z0-9-]{4,32}$/.test(traderId)) {
            await sendMessage(
              chatId,
              "⚠️ That doesn't look like a valid trader ID. Please send just your numeric/alphanumeric Quotex trader ID (no spaces or symbols).",
            );
            return Response.json({ ok: true });
          }

          // One pending request per chat at a time.
          const { data: pending } = await supabaseAdmin
            .from("verification_requests")
            .select("id")
            .eq("chat_id", chatId)
            .eq("status", "pending")
            .maybeSingle();

          if (!pending) {
            const { error } = await supabaseAdmin.from("verification_requests").insert({
              chat_id: chatId,
              trader_id: traderId,
            });
            if (error) throw new Error(error.message);
          }

          await sendMessage(
            chatId,
            `⏳ Got it! Verifying trader ID <b>${traderId}</b> with our affiliate system…\n\nThis usually takes a moment. I'll message you as soon as it's confirmed.`,
          );
          return Response.json({ ok: true });
        } catch (err) {
          console.error("webhook error:", err);
          try {
            await sendMessage(chatId, "⚠️ Something went wrong on our end. Please try again in a minute.");
          } catch {
            // ignore secondary failure
          }
          return Response.json({ ok: true });
        }
      },
    },
  },
});
