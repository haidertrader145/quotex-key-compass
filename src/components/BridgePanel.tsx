import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import { getBridgeStatus, resetBridgeLogin, submitLoginCode } from "@/lib/admin.functions";

const LABELS: Record<string, string> = {
  offline: "Not running yet",
  waiting_code: "Waiting for your Telegram login code",
  running: "Running — verifying automatically",
  login_failed: "Login failed — check your code and try again",
  restart_needed: "Restart the helper on Railway to log in again",
  config_missing: "Missing Telegram details",
};

export function BridgePanel() {
  const fetchStatus = useServerFn(getBridgeStatus);
  const sendCode = useServerFn(submitLoginCode);
  const reset = useServerFn(resetBridgeLogin);
  const [s, setS] = useState<{ status: string; last_seen: string | null } | null>(null);
  const [code, setCode] = useState("");

  const load = useCallback(async () => {
    try {
      setS(await fetchStatus());
    } catch {
      /* ignore */
    }
  }, [fetchStatus]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const stale = s?.last_seen ? Date.now() - new Date(s.last_seen).getTime() > 60000 : true;
  const status = s ? (s.status === "running" && stale ? "offline" : s.status) : "offline";

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4">
      <h2 className="text-base font-semibold text-foreground">Auto-verification helper</h2>
      <p className="mt-1 text-sm text-muted-foreground">Status: <b className="text-foreground">{LABELS[status] ?? status}</b></p>
      {status === "waiting_code" && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await sendCode({ data: { code: code.trim() } });
            setCode("");
            load();
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code from Telegram"
            inputMode="numeric"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Log in</button>
        </form>
      )}
      {status === "running" && (
        <button
          onClick={async () => {
            if (confirm("Log the helper out of Telegram?")) {
              await reset();
              load();
            }
          }}
          className="mt-3 text-xs text-muted-foreground underline"
        >
          Log out helper
        </button>
      )}
    </section>
  );
}
