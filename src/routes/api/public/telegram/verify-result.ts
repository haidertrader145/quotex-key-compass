import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { MIN_DEPOSIT, parseAffiliateReply } from "@/lib/affiliate-reply";
import { safeEqual, sendMessage } from "@/lib/telegram.server";

const bodySchema = z.object({
  request_id: z.string().uuid(),
  verified: z.boolean(),
  affiliate_reply: z.string().max(2000).optional(),
});

// Called by the external verification bridge (or the admin dashboard) with the
// affiliate system's verdict. On success, issues a license key and messages
// the user. Protected by VERIFIER_SECRET.
export const Route = createFileRoute("/api/public/telegram/verify-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["VERIFIER_SECRET"];
        const provided = request.headers.get("X-Verifier-Secret") ?? "";
        if (!secret || !safeEqual(provided, secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
          return Response.json({ error: "Invalid body" }, { status: 400 });
        }
        const { request_id, verified, affiliate_reply } = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: reqRow, error: reqError } = await supabaseAdmin
          .from("verification_requests")
          .select("id, chat_id, trader_id, status")
          .eq("id", request_id)
          .maybeSingle();

        if (reqError || !reqRow) {
          return Response.json({ error: "Request not found" }, { status: 404 });
        }
        if (reqRow.status !== "pending") {
          return Response.json({ ok: true, already_resolved: true });
        }

        const now = new Date().toISOString();

        // The reply text is the source of truth; the bridge flag is only a fallback.
        let isVerified = verified;
        if (affiliate_reply) {
          const v = parseAffiliateReply(affiliate_reply, reqRow.trader_id);
          if (v.kind === "not_found") isVerified = false;
          if (v.kind === "verified") {
            isVerified = true;
            const deposit = v.deposit ?? 0;
            if (deposit < MIN_DEPOSIT) {
              await supabaseAdmin
                .from("verification_requests")
                .update({ status: "rejected", affiliate_reply: `[LOW DEPOSIT] ${affiliate_reply}`, resolved_at: now })
                .eq("id", request_id);
              await sendMessage(
                reqRow.chat_id,
                `✅ Your account (trader ID <b>${reqRow.trader_id}</b>) was created through our affiliate link.\n\n💰 Deposit: <b>$${deposit.toFixed(2)}</b>\n💼 Balance: <b>$${(v.balance ?? 0).toFixed(2)}</b>\n\n⚠️ To get access, please deposit at least <b>$${MIN_DEPOSIT} USD</b>, then send your trader ID again.`,
              );
              return Response.json({ ok: true, verified: true, low_deposit: true });
            }
          }
        }

        if (!isVerified) {
          await supabaseAdmin
            .from("verification_requests")
            .update({ status: "rejected", affiliate_reply: affiliate_reply ?? null, resolved_at: now })
            .eq("id", request_id);
          await sendMessage(
            reqRow.chat_id,
            `❌ Unfortunately, trader ID <b>${reqRow.trader_id}</b> could not be verified.\n\nPlease make sure you registered through our affiliate link, then send your trader ID again.`,
          );
          return Response.json({ ok: true, verified: false });
        }

        // Claim an available key atomically.
        const { data: key } = await supabaseAdmin
          .from("license_keys")
          .select("id, key")
          .eq("status", "available")
          .limit(1)
          .maybeSingle();

        if (!key) {
          await supabaseAdmin
            .from("verification_requests")
            .update({ status: "error", affiliate_reply: "No license keys available", resolved_at: now })
            .eq("id", request_id);
          await sendMessage(
            reqRow.chat_id,
            "✅ Your trader ID is verified! However, we're temporarily out of license keys — the team has been notified and will send yours shortly.",
          );
          return Response.json({ ok: true, verified: true, key_issued: false });
        }

        await supabaseAdmin
          .from("license_keys")
          .update({
            status: "issued",
            issued_to_chat_id: reqRow.chat_id,
            issued_to_trader_id: reqRow.trader_id,
            issued_at: now,
          })
          .eq("id", key.id);

        await supabaseAdmin.from("verified_users").upsert(
          {
            chat_id: reqRow.chat_id,
            trader_id: reqRow.trader_id,
            license_key_id: key.id,
          },
          { onConflict: "chat_id" },
        );

        await supabaseAdmin
          .from("verification_requests")
          .update({ status: "verified", affiliate_reply: affiliate_reply ?? null, resolved_at: now })
          .eq("id", request_id);

        await sendMessage(
          reqRow.chat_id,
          `🎉 <b>Verified!</b> Trader ID <b>${reqRow.trader_id}</b> is confirmed.\n\n🔑 Your license key:\n<code>${key.key}</code>\n\nKeep it safe — it's tied to your account.`,
        );

        return Response.json({ ok: true, verified: true, key_issued: true });
      },
    },
  },
});
