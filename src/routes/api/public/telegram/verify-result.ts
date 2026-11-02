import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { formatAccountDeleted, formatTraderDetails, meetsDepositRequirement, parseAffiliateReply } from "@/lib/affiliate-reply";
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
        let traderDetails = formatTraderDetails(reqRow.trader_id, { kind: "verified", country: null, deposit: null, balance: null });
        if (affiliate_reply) {
          const v = parseAffiliateReply(affiliate_reply, reqRow.trader_id);
          if (v.kind === "not_found") isVerified = false;
          if (v.kind === "account_deleted") {
            await supabaseAdmin
              .from("verification_requests")
              .update({ status: "rejected", affiliate_reply: `[ACCOUNT DELETED] ${affiliate_reply}`, resolved_at: now })
              .eq("id", request_id);
            await sendMessage(reqRow.chat_id, formatAccountDeleted());
            return Response.json({ ok: true, verified: false, account_deleted: true });
          }
          if (v.kind === "verified") {
            isVerified = true;
            traderDetails = formatTraderDetails(reqRow.trader_id, v);
            if (!meetsDepositRequirement(v.deposit)) {
              await supabaseAdmin
                .from("verification_requests")
                .update({ status: "rejected", affiliate_reply: `[LOW DEPOSIT] ${affiliate_reply}`, resolved_at: now })
                .eq("id", request_id);
              await sendMessage(
                reqRow.chat_id,
                traderDetails,
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
            traderDetails,
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
          traderDetails,
        );

        return Response.json({ ok: true, verified: true, key_issued: true });
      },
    },
  },
});
