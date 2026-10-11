import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [keys, users, requests] = await Promise.all([
      supabaseAdmin
        .from("license_keys")
        .select("id, key, status, issued_to_trader_id, issued_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("verified_users")
        .select("id, chat_id, username, trader_id, verified_at")
        .order("verified_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("verification_requests")
        .select("id, chat_id, trader_id, status, affiliate_reply, created_at, resolved_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    return {
      keys: keys.data ?? [],
      verifiedUsers: users.data ?? [],
      requests: requests.data ?? [],
      stats: {
        availableKeys: (keys.data ?? []).filter((k) => k.status === "available").length,
        issuedKeys: (keys.data ?? []).filter((k) => k.status === "issued").length,
        verifiedUsers: (users.data ?? []).length,
        pendingRequests: (requests.data ?? []).filter((r) => r.status === "pending").length,
      },
    };
  });

export const getBridgeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("bridge_state" as never)
      .select("status, last_seen")
      .eq("id", 1)
      .maybeSingle();
    return (data as { status: string; last_seen: string | null } | null) ?? { status: "offline", last_seen: null };
  });

export const submitLoginCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => z.object({ code: z.string().regex(/^\d{4,8}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("bridge_state" as never).update({ login_code: data.code } as never).eq("id", 1);
    return { ok: true };
  });

export const resetBridgeLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("bridge_state" as never)
      .update({ session_string: null, login_code: null, status: "restart_needed" } as never)
      .eq("id", 1);
    return { ok: true };
  });

export const addLicenseKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { keys: string }) => z.object({ keys: z.string().min(1).max(20000) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const keys = [...new Set(data.keys.split(/\r?\n/).map((k) => k.trim()).filter(Boolean))];
    if (keys.length === 0) throw new Error("No keys provided");
    if (keys.length > 500) throw new Error("Maximum 500 keys at once");

    const { error } = await supabaseAdmin
      .from("license_keys")
      .upsert(keys.map((key) => ({ key })), { onConflict: "key", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { added: keys.length };
  });

export const resolveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string; verified: boolean }) =>
    z.object({ requestId: z.string().uuid(), verified: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);

    // Reuse the same issuance logic as the bridge callback by calling the
    // public route internally is not possible, so duplicate the minimal flow.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMessage } = await import("@/lib/telegram.server");

    const { data: reqRow } = await supabaseAdmin
      .from("verification_requests")
      .select("id, chat_id, trader_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!reqRow) throw new Error("Request not found");
    if (reqRow.status !== "pending") return { ok: true, already_resolved: true };

    const now = new Date().toISOString();

    if (!data.verified) {
      await supabaseAdmin
        .from("verification_requests")
        .update({ status: "rejected", resolved_at: now })
        .eq("id", reqRow.id);
      await sendMessage(
        reqRow.chat_id,
        `❌ Unfortunately, trader ID <b>${reqRow.trader_id}</b> could not be verified.\n\nPlease make sure you registered through our affiliate link, then send your trader ID again.`,
      );
      return { ok: true, verified: false };
    }

    const { data: key } = await supabaseAdmin
      .from("license_keys")
      .select("id, key")
      .eq("status", "available")
      .limit(1)
      .maybeSingle();
    if (!key) throw new Error("No license keys available — add keys first");

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
      { chat_id: reqRow.chat_id, trader_id: reqRow.trader_id, license_key_id: key.id },
      { onConflict: "chat_id" },
    );

    await supabaseAdmin
      .from("verification_requests")
      .update({ status: "verified", resolved_at: now })
      .eq("id", reqRow.id);

    await sendMessage(
      reqRow.chat_id,
      `🎉 <b>Verified!</b> Trader ID <b>${reqRow.trader_id}</b> is confirmed.\n\n🔑 Your license key:\n<code>${key.key}</code>\n\nKeep it safe — it's tied to your account.`,
    );

    return { ok: true, verified: true };
  });
