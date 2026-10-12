import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { BridgePanel } from "@/components/BridgePanel";
import { addLicenseKeys, getAdminOverview, resolveRequest } from "@/lib/admin.functions";

type Overview = Awaited<ReturnType<typeof getAdminOverview>>;

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    available: "bg-secondary text-secondary-foreground",
    issued: "bg-primary/10 text-primary",
    revoked: "bg-destructive/10 text-destructive",
    pending: "bg-accent text-accent-foreground",
    verified: "bg-primary/10 text-primary",
    rejected: "bg-destructive/10 text-destructive",
    error: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function AdminPage() {
  const navigate = useNavigate();
  const fetchOverview = useServerFn(getAdminOverview);
  const postKeys = useServerFn(addLicenseKeys);
  const postResolve = useServerFn(resolveRequest);

  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKeys, setNewKeys] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"requests" | "keys" | "users">("requests");

  const load = useCallback(async () => {
    try {
      setData(await fetchOverview());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [fetchOverview]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function handleAddKeys(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await postKeys({ data: { keys: newKeys } });
      setNewKeys("");
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add keys");
    } finally {
      setSaving(false);
    }
  }

  async function handleResolve(requestId: string, verified: boolean) {
    try {
      await postResolve({ data: { requestId, verified } });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resolve");
    }
  }

  if (error === "Forbidden") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-foreground">No admin access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account isn't an admin yet. Ask the project owner to grant you the admin role.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{error ?? "Loading…"}</p>
      </div>
    );
  }

  const pending = data.requests.filter((r) => r.status === "pending");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold text-foreground">License Key Bot — Admin</h1>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Available keys", value: data.stats.availableKeys },
            { label: "Issued keys", value: data.stats.issuedKeys },
            { label: "Verified users", value: data.stats.verifiedUsers },
            { label: "Pending requests", value: data.stats.pendingRequests },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <BridgePanel />

        <div className="mt-6 flex gap-2">
          {(["requests", "keys", "users"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "requests" && (
          <section className="mt-4 rounded-xl border border-border bg-card p-4">
            <h2 className="text-base font-semibold text-foreground">Verification requests</h2>
            {pending.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {pending.length} waiting — approve or reject after checking the trader ID in your Quotex affiliate portal.
              </p>
            )}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Trader ID</th>
                    <th className="pb-2 pr-4 font-medium">Chat ID</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Requested</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.requests.map((r) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-foreground">{r.trader_id}</td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground">{r.chat_id}</td>
                      <td className="py-2 pr-4"><StatusBadge status={r.status} /></td>
                      <td className="py-2 pr-4 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-2">
                        {r.status === "pending" && (
                          <span className="flex gap-2">
                            <button
                              onClick={() => handleResolve(r.id, true)}
                              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleResolve(r.id, false)}
                              className="rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                            >
                              Reject
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.requests.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No requests yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "keys" && (
          <section className="mt-4 space-y-4">
            <form onSubmit={handleAddKeys} className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-base font-semibold text-foreground">Add license keys</h2>
              <p className="mt-1 text-sm text-muted-foreground">Paste one key per line. Duplicates are skipped.</p>
              <textarea
                value={newKeys}
                onChange={(e) => setNewKeys(e.target.value)}
                rows={5}
                placeholder={"KEY-AAAA-BBBB-CCCC\nKEY-DDDD-EEEE-FFFF"}
                className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={saving || !newKeys.trim()}
                className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Adding…" : "Add keys"}
              </button>
            </form>

            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-base font-semibold text-foreground">All keys</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Key</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 pr-4 font-medium">Issued to</th>
                      <th className="pb-2 font-medium">Issued at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.keys.map((k) => (
                      <tr key={k.id} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-mono text-foreground">{k.key}</td>
                        <td className="py-2 pr-4"><StatusBadge status={k.status} /></td>
                        <td className="py-2 pr-4 font-mono text-muted-foreground">{k.issued_to_trader_id ?? "—"}</td>
                        <td className="py-2 text-muted-foreground">{k.issued_at ? new Date(k.issued_at).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                    {data.keys.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No keys yet — add some above.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {tab === "users" && (
          <section className="mt-4 rounded-xl border border-border bg-card p-4">
            <h2 className="text-base font-semibold text-foreground">Verified users</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Trader ID</th>
                    <th className="pb-2 pr-4 font-medium">Chat ID</th>
                    <th className="pb-2 font-medium">Verified at</th>
                  </tr>
                </thead>
                <tbody>
                  {data.verifiedUsers.map((u) => (
                    <tr key={u.id} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-foreground">{u.trader_id}</td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground">{u.chat_id}</td>
                      <td className="py-2 text-muted-foreground">{new Date(u.verified_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.verifiedUsers.length === 0 && (
                    <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No verified users yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
