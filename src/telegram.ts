import type { Env, TelegramMeta } from "./types";
import { forwardMessageToLetta } from "./agent";

export async function processTelegramMessage(
  env: Env,
  update: {
    message?: {
      text?: string;
      chat?: { id: number; type: string };
      from?: { id: number; username?: string };
    };
  }
): Promise<void> {
  const message = update.message;
  if (!message) {
    return;
  }

  const chatId = message.chat?.id?.toString();
  const text = message.text?.trim();
  if (!chatId || !text) {
    return;
  }

  const meta: TelegramMeta = {
    chatId,
    userId: message.from?.id?.toString(),
    username: message.from?.username
  };

  try {
    const reply = await forwardMessageToLetta(env, meta, text);
    const safeReply = reply?.trim() || "Got it.";
    await sendTelegramMessage(env, chatId, safeReply);
  } catch (error) {
    console.error("Letta error", error);
    await sendTelegramMessage(env, chatId, "Sorry, something went wrong on my side.");
  }
}

async function sendTelegramMessage(env: Env, chatId: string, text: string): Promise<void> {
  const apiBase = env.TELEGRAM_API_BASE_URL || "https://api.telegram.org";
  const url = `${apiBase}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("Failed to send Telegram message", {
      status: response.status,
      statusText: response.statusText,
      body: errorText,
      chatId
    });
  }
}
