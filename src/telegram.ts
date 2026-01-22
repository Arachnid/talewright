import { Bot, BotError, Context, webhookCallback } from "grammy";
import { getOrCreateAgent } from "./agent";
import type { Env } from "./types";
import type { TelegramWorkflowInput } from "./types";

export function createTelegramWebhookHandler(env: Env) {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN, {
    client: env.TELEGRAM_API_BASE_URL
      ? {
          apiRoot: env.TELEGRAM_API_BASE_URL
        }
      : undefined
  });

  bot.command("start", async (ctx: Context) => {
    const chatId = ctx.chat?.id?.toString();
    const messageThreadId = ctx.message?.message_thread_id?.toString();
    if (!chatId) {
      return;
    }

    try {
      const { created } = await getOrCreateAgent(env, {
        chatId,
        ...(messageThreadId ? { messageThreadId } : {}),
        userId: ctx.from?.id?.toString(),
        username: ctx.from?.username
      });
      if (!created) {
        return;
      }

      const workflowInput: TelegramWorkflowInput = {
        chatId,
        ...(messageThreadId ? { messageThreadId } : {}),
        userId: ctx.from?.id?.toString(),
        username: ctx.from?.username,
        text: "Let's get started"
      };

      await bot.api.sendChatAction(
        chatId,
        "typing",
        messageThreadId ? { message_thread_id: Number(messageThreadId) } : undefined
      );
      await env.TELEGRAM_WORKFLOW.create({
        id: `telegram-${chatId}-${messageThreadId ?? "main"}-${Date.now()}`,
        params: workflowInput
      });
    } catch (error) {
      console.error("Letta error", error);
      await ctx.reply(
        "Sorry, something went wrong on my side.",
        messageThreadId ? { message_thread_id: Number(messageThreadId) } : undefined
      );
    }
  });

  bot.on("message:text", async (ctx: Context) => {
    const chatId = ctx.chat?.id?.toString();
    const messageThreadId = ctx.message?.message_thread_id?.toString();
    const text = ctx.message?.text?.trim();
    if (!chatId || !text) {
      return;
    }

    try {
      const workflowInput: TelegramWorkflowInput = {
        chatId,
        ...(messageThreadId ? { messageThreadId } : {}),
        userId: ctx.from?.id?.toString(),
        username: ctx.from?.username,
        text
      };

      await bot.api.sendChatAction(
        chatId,
        "typing",
        messageThreadId ? { message_thread_id: Number(messageThreadId) } : undefined
      );
      await env.TELEGRAM_WORKFLOW.create({
        id: `telegram-${chatId}-${messageThreadId ?? "main"}-${Date.now()}`,
        params: workflowInput
      });
    } catch (error) {
      console.error("Letta error", error);
      await ctx.reply(
        "Sorry, something went wrong on my side.",
        messageThreadId ? { message_thread_id: Number(messageThreadId) } : undefined
      );
    }
  });

  bot.catch((error: BotError) => {
    console.error("Telegram bot error", error);
  });

  return webhookCallback(bot, "cloudflare-mod", {
    secretToken: env.TELEGRAM_WEBHOOK_SECRET
  });
}
