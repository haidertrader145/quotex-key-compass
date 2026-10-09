import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "License Key Bot — Telegram Trader ID Verification" },
      {
        name: "description",
        content:
          "A Telegram bot that verifies Quotex trader IDs through your affiliate system and automatically delivers license keys to verified users.",
      },
      { property: "og:title", content: "License Key Bot — Telegram Trader ID Verification" },
      {
        property: "og:description",
        content:
          "A Telegram bot that verifies Quotex trader IDs through your affiliate system and automatically delivers license keys to verified users.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Telegram License Bot</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Verify trader IDs. Deliver keys. Automatically.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Users send their Quotex trader ID to your Telegram bot. The bot checks it against your
            affiliate system, and verified users instantly receive their license key — no manual work.
          </p>

          <div className="mt-10 grid gap-4 text-left md:grid-cols-3">
            {[
              { step: "1", title: "User sends trader ID", text: "They message your bot with their Quotex trader ID." },
              { step: "2", title: "Automatic verification", text: "The ID is checked with your affiliate system." },
              { step: "3", title: "Key delivered", text: "Verified users get their license key in the chat." },
            ].map((s) => (
              <div key={s.step} className="rounded-xl border border-border bg-card p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {s.step}
                </span>
                <h2 className="mt-3 font-semibold text-foreground">{s.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>

          <Link
            to="/auth"
            className="mt-10 inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open admin dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
