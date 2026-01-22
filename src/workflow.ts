import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { Bot } from "grammy";
import telegramifyMarkdown from "telegramify-markdown";
import type { Env, TelegramWorkflowInput, TelegramMeta } from "./types";
import { forwardMessageToLetta } from "./agent";

export class TelegramWorkflow extends WorkflowEntrypoint<Env, TelegramWorkflowInput> {
  async run(
    event: WorkflowEvent<TelegramWorkflowInput>,
    step: WorkflowStep
  ): Promise<void> {
    const { chatId, messageThreadId, userId, username, text } = event.payload;
    
    const meta: TelegramMeta = {
      chatId,
      ...(messageThreadId ? { messageThreadId } : {}),
      userId,
      username
    };

    // Create bot instance for sending messages
    const bot = new Bot(this.env.TELEGRAM_BOT_TOKEN, {
      client: this.env.TELEGRAM_API_BASE_URL
        ? {
            apiRoot: this.env.TELEGRAM_API_BASE_URL
          }
        : undefined
    });

    try {
      await step.do("process-letta-message", async () => {
        await forwardMessageToLetta(this.env, meta, text, async (part: string) => {
          await sendTelegramMessage(bot, chatId, part, messageThreadId);
        });
      });
    } catch (error) {
      console.error("Letta error in workflow", error);
      await sendTelegramMessage(
        bot,
        chatId,
        "Sorry, something went wrong on my side.",
        messageThreadId
      );
    }
  }
}

async function sendTelegramMessage(
  bot: Bot,
  chatId: string,
  text: string,
  messageThreadId?: string
): Promise<void> {
  try {
    const sanitized = telegramifyMarkdown(text, "escape").trim();
    const options: { parse_mode: "MarkdownV2"; message_thread_id?: number } = {
      parse_mode: "MarkdownV2"
    };
    if (messageThreadId) {
      options.message_thread_id = Number(messageThreadId);
    }
    await bot.api.sendMessage(chatId, sanitized, options);
  } catch (error) {
    console.error("Failed to send Telegram message", {
      error,
      chatId
    });
  }
}
