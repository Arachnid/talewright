import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { Bot } from "grammy";
import telegramifyMarkdown from "telegramify-markdown";
import type { Env, TelegramWorkflowInput, TelegramMeta } from "./types";
import { forwardMessageToLetta } from "./agent";
import type { LettaRequest, ToolCall, ToolReturn } from "@letta-ai/letta-client/resources/agents/messages";

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
        let draftText = "";
        let lastUpdateAt = 0;
        let messageId: number | undefined;
        let currentLettaMessageId: string | undefined;
        const clientTools: LettaRequest.ClientTool[] = [editForumTopicTool];
        const toolHandler = createTelegramToolHandler(bot, chatId, messageThreadId);

        const updateDraft = async (force: boolean) => {
          if (!draftText) {
            return;
          }
          const now = Date.now();
          if (!force && messageId && now - lastUpdateAt < 1000) {
            return;
          }
          const nextMessageId = await sendMessageDraft(
            bot,
            chatId,
            draftText,
            messageThreadId,
            messageId
          );
          if (nextMessageId != null) {
            messageId = nextMessageId;
            lastUpdateAt = now;
          }
        };

        await forwardMessageToLetta(this.env, meta, text, async (messageId: string, token: string) => {
          if (currentLettaMessageId !== messageId) {
            currentLettaMessageId = messageId;
            draftText = "";
            lastUpdateAt = 0;
            messageId = undefined;
          }
          draftText += token;
          await updateDraft(false);
        }, {
          clientTools,
          onToolCall: toolHandler
        });

        await updateDraft(true);
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

const editForumTopicTool: LettaRequest.ClientTool = {
  name: "editForumTopic",
  description: "Edit the current Telegram forum topic title and icon.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "New forum topic title"
      },
      emojiId: {
        type: "string",
        description: "Custom emoji ID for the topic icon"
      }
    }
  }
};

function createTelegramToolHandler(
  bot: Bot,
  chatId: string,
  messageThreadId?: string
): (toolCall: ToolCall) => Promise<ToolReturn> {
  return async (toolCall: ToolCall) => {
    const toolCallId = toolCall.tool_call_id ?? "unknown";
    if (toolCall.name !== "editForumTopic") {
      return {
        status: "error",
        tool_call_id: toolCallId,
        tool_return: `Unsupported tool: ${toolCall.name ?? "unknown"}`
      };
    }

    let args: { title?: string; emojiId?: string } | undefined;
    try {
      args = toolCall.arguments ? JSON.parse(toolCall.arguments) : undefined;
    } catch (error) {
      console.error("Failed to parse editForumTopic arguments", {
        error,
        toolCall
      });
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        tool_call_id: toolCallId,
        tool_return: `Invalid tool arguments: ${message}`
      };
    }

    const title = typeof args?.title === "string" ? args.title.trim() : "";
    const emojiId = typeof args?.emojiId === "string" ? args.emojiId.trim() : "";
    if (!title && !emojiId) {
      return {
        status: "error",
        tool_call_id: toolCallId,
        tool_return: "Invalid arguments: at least one of title or emojiId is required."
      };
    }

    if (!messageThreadId) {
      return {
        status: "error",
        tool_call_id: toolCallId,
        tool_return: "Invalid context: this chat has no forum topic to edit."
      };
    }

    const threadId = Number(messageThreadId);
    if (Number.isNaN(threadId)) {
      return {
        status: "error",
        tool_call_id: toolCallId,
        tool_return: `Invalid forum topic thread id: ${messageThreadId}`
      };
    }

    const update: { name?: string; icon_custom_emoji_id?: string } = {};
    if (title) {
      update.name = title;
    }
    if (emojiId) {
      update.icon_custom_emoji_id = emojiId;
    }

    try {
      await bot.api.editForumTopic(chatId, threadId, update);
      return {
        status: "success",
        tool_call_id: toolCallId,
        tool_return: "Updated forum topic."
      };
    } catch (error) {
      console.error("Failed to edit forum topic", {
        error,
        toolCall,
        chatId,
        threadId,
        update
      });
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        tool_call_id: toolCallId,
        tool_return: `Failed to edit forum topic: ${message}`
      };
    }
  };
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

async function sendMessageDraft(
  bot: Bot,
  chatId: string,
  text: string,
  messageThreadId?: string,
  messageId?: number
): Promise<number | undefined> {
  const sanitized = telegramifyMarkdown(text, "escape");
  if (!sanitized.trim()) {
    return messageId;
  }

  const options: { parse_mode: "MarkdownV2"; message_thread_id?: number } = {
    parse_mode: "MarkdownV2"
  };
  if (messageThreadId) {
    options.message_thread_id = Number(messageThreadId);
  }

  try {
    if (messageId == null) {
      const response = await bot.api.sendMessage(chatId, sanitized, options);
      return response.message_id;
    }

    await bot.api.editMessageText(chatId, messageId, sanitized, options);
    return messageId;
  } catch (error) {
    console.error("Failed to send Telegram message draft", {
      error,
      chatId
    });
    return messageId;
  }
}
