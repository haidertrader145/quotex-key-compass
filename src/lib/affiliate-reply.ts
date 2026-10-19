export const MIN_DEPOSIT = 50;

export type AffiliateVerdict =
  | { kind: "verified"; country: string | null; deposit: number | null; balance: number | null }
  | { kind: "not_found" }
  | { kind: "unknown" };

function amount(text: string, label: string): number | null {
  const m = text.match(new RegExp(`${label}:\\s*\\$?\\s*(-?[\\d,]+(?:\\.\\d+)?)`, "i"));
  return m && m[1] ? Number(m[1].replace(/,/g, "")) : null;
}

// Parses the Quotex affiliate bot reply for the given trader ID.
export function parseAffiliateReply(reply: string, traderId: string): AffiliateVerdict {
  const text = reply ?? "";
  if (/was not found/i.test(text)) return { kind: "not_found" };
  const m = text.match(/Trader\s*#\s*(\d+)/i);
  if (m && m[1] === traderId.trim()) {
    return { kind: "verified", country: text.match(/^Country:\s*([^\r\n]+)/im)?.[1]?.trim() ?? null, deposit: amount(text, "Deposits Sum"), balance: amount(text, "Balance") };
  }
  return { kind: "unknown" };
}

export function meetsDepositRequirement(deposit: number | null): boolean {
  return (deposit ?? 0) >= MIN_DEPOSIT;
}

export function formatTraderDetails(verdict: Extract<AffiliateVerdict, { kind: "verified" }>): string {
  const country = (verdict.country ?? "Unavailable").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const money = (value: number | null) => value === null ? "Unavailable" : `$${value.toFixed(2)}`;
  return `🌍 Country: <b>${country}</b>\n💼 Total balance: <b>${money(verdict.balance)}</b>\n💰 Deposit: <b>${money(verdict.deposit)}</b>`;
}
