import { Bot, BotError, Context, webhookCallback } from "grammy";
import type { Env } from "./types";
import { forwardMessageToLetta } from "./agent";

export function createTelegramWebhookHandler(env: Env) {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN, {
    client: env.TELEGRAM_API_BASE_URL
      ? {
          apiRoot: env.TELEGRAM_API_BASE_URL
        }
      : undefined
  });

  bot.on("message:text", async (ctx: Context) => {
    const chatId = ctx.chat?.id?.toString();
    const text = ctx.message?.text?.trim();
    if (!chatId || !text) {
      return;
    }

    const meta = {
      chatId,
      userId: ctx.from?.id?.toString(),
      username: ctx.from?.username
    };

    try {
      const reply = await forwardMessageToLetta(env, meta, text);
      const safeReply = reply?.trim() || "Got it.";
      await ctx.reply(safeReply);
    } catch (error) {
      console.error("Letta error", error);
      await ctx.reply("Sorry, something went wrong on my side.");
    }
  });

  bot.catch((error: BotError) => {
    console.error("Telegram bot error", error);
  });

  return webhookCallback(bot, "cloudflare-mod");
}
