import { createFileRoute } from "@tanstack/react-router";

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
        if (!telegramKey) {
          return new Response("Not configured", { status: 500 });
        }

        const expected = await deriveTelegramWebhookSecret(telegramKey);
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) {
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

          // Already verified? Re-send the existing key.
          const { data: existing } = await supabaseAdmin
            .from("verified_users")
            .select("trader_id, license_keys(key)")
            .eq("chat_id", chatId)
            .maybeSingle();

          if (existing) {
            const key = (existing.license_keys as { key: string } | null)?.key;
            await sendMessage(
              chatId,
              `✅ Your trader ID <b>${existing.trader_id}</b> is already verified.\n\n🔑 Your license key:\n<code>${key ?? "unavailable — contact support"}</code>`,
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
