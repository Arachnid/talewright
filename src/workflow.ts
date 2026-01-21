import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { Bot } from "grammy";
import telegramifyMarkdown from "telegramify-markdown";
import type { Env, TelegramWorkflowInput, TelegramMeta } from "./types";
import { createFreshAgent, forwardMessageToLetta } from "./agent";

export class TelegramWorkflow extends WorkflowEntrypoint<Env, TelegramWorkflowInput> {
  async run(
    event: WorkflowEvent<TelegramWorkflowInput>,
    step: WorkflowStep
  ): Promise<void> {
    const { chatId, userId, username, text } = event.payload;
    
    const meta: TelegramMeta = {
      chatId,
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

    // Handle /start and /restart commands
    const trimmedText = text.trim();
    if (trimmedText === "/start" || trimmedText === "/restart") {
      try {
        await step.do("create-fresh-agent", async () => {
          await createFreshAgent(this.env, meta);
        });
        await sendTelegramMessage(bot, chatId, "Agent restarted! Ready for a fresh conversation.");
        return;
      } catch (error) {
        console.error("Error creating fresh agent", error);
        await sendTelegramMessage(bot, chatId, "Sorry, something went wrong while restarting the agent.");
        return;
      }
    }

    try {
      await step.do("process-letta-message", async () => {
        await forwardMessageToLetta(this.env, meta, text, async (part: string) => {
          await sendTelegramMessage(bot, chatId, part);
        });
      });
    } catch (error) {
      console.error("Letta error in workflow", error);
      await sendTelegramMessage(bot, chatId, "Sorry, something went wrong on my side.");
    }
  }
}

async function sendTelegramMessage(bot: Bot, chatId: string, text: string): Promise<void> {
  try {
    const sanitized = telegramifyMarkdown(text, "escape").trim();
    await bot.api.sendMessage(chatId, sanitized, {parse_mode: "MarkdownV2"});
  } catch (error) {
    console.error("Failed to send Telegram message", {
      error,
      chatId
    });
  }
}
