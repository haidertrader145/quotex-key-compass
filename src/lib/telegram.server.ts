// Server-only Telegram Bot API helpers, routed through the Lovable connector gateway.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function getKeys() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const telegramKey = process.env["TELEGRAM_API_KEY"];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!telegramKey) throw new Error("TELEGRAM_API_KEY is not configured");
  return { lovableKey, telegramKey };
}

export async function telegramCall<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { lovableKey, telegramKey } = getKeys();
  const response = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed [${response.status}]: ${data.description ?? "unknown error"}`);
  }
  return data.result as T;
}

export async function sendMessage(chatId: number, text: string) {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  });
}

// Secret-token derivation for webhook verification. Must match the value
// registered via setWebhook (see the setup script): sha256 base64url of
// `telegram-webhook:${TELEGRAM_API_KEY}`. Implemented with Web Crypto so it
// runs on the Cloudflare Workers runtime.
export async function deriveTelegramWebhookSecret(telegramApiKey: string): Promise<string> {
  const data = new TextEncoder().encode(`telegram-webhook:${telegramApiKey}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
