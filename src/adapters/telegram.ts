import type { Notifier } from "./types";

export async function telegramApi<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
  return json.result;
}

export function createTelegramNotifier(token: string, chatId: string): Notifier {
  return {
    app: "telegram",
    live: true,
    async send(text) {
      await telegramApi(token, "sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true } });
    },
  };
}
