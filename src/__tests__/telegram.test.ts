import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";

const mockReply = vi.fn().mockResolvedValue(undefined);
const mockSendChatAction = vi.fn().mockResolvedValue(undefined);
const storedHandlers: Record<string, (ctx: any) => Promise<void>> = {};
let nextUpdate: { chat: { id: number }; message: { text: string; message_thread_id?: number }; from: { id: number; username: string }; reply: typeof mockReply };

vi.mock("grammy", () => {
  class Bot {
    token: string;
    options?: unknown;
    api: { sendChatAction: typeof mockSendChatAction };
    constructor(token: string, options?: unknown) {
      this.token = token;
      this.options = options;
      this.api = { sendChatAction: mockSendChatAction };
    }
    command(command: string, handler: (ctx: any) => Promise<void>) {
      storedHandlers[`command:${command}`] = handler;
    }
    on(event: string, handler: (ctx: any) => Promise<void>) {
      storedHandlers[event] = handler;
    }
    catch() {}
  }
  function webhookCallback(_bot: Bot, _adapter: string, options?: { secretToken?: string }) {
    return async function handler(request?: Request) {
      if (options?.secretToken) {
        const token = request?.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (token !== options.secretToken) {
          return new Response("Unauthorized", { status: 401 });
        }
      }
      const update = nextUpdate ?? {
        chat: { id: 123 },
        message: { text: "Hello", message_thread_id: 456 },
        from: { id: 789, username: "tester" },
        reply: mockReply
      };
      const messageText = update.message?.text ?? "";
      if (messageText.startsWith("/start")) {
        const commandHandler = storedHandlers["command:start"];
        if (commandHandler) {
          await commandHandler(update);
        }
      } else {
        const messageHandler = storedHandlers["message:text"];
        if (messageHandler) {
          await messageHandler(update);
        }
      }
      return new Response("OK");
    };
  }
  class BotError {}
  class Context {}
  return { Bot, BotError, Context, webhookCallback };
});

vi.mock("../agent", () => ({
  getOrCreateAgent: vi.fn()
}));

import { createTelegramWebhookHandler } from "../telegram";

describe("createTelegramWebhookHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete storedHandlers["message:text"];
    delete storedHandlers["command:start"];
    nextUpdate = {
      chat: { id: 123 },
      message: { text: "Hello", message_thread_id: 456 },
      from: { id: 789, username: "tester" },
      reply: mockReply
    };
  });

  it("enqueues the workflow instead of replying directly", async () => {
    const workflowCreate = vi.fn().mockResolvedValue({ id: "workflow-1" });
    const env = {
      CHAT_AGENT_KV: {} as any,
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_WEBHOOK_PATH: "/webhook",
      LETTA_API_KEY: "test-key",
      LETTA_TEMPLATE_VERSION: "testproject/testtemplate:1",
      TELEGRAM_WORKFLOW: { create: workflowCreate }
    } as Env;

    const handler = createTelegramWebhookHandler(env);
    await handler(new Request("https://example.com/telegram/webhook", { method: "POST" }));

    expect(workflowCreate).toHaveBeenCalledWith({
      id: expect.stringContaining("telegram-123-456-"),
      params: {
        chatId: "123",
        messageThreadId: "456",
        userId: "789",
        username: "tester",
        text: "Hello"
      }
    });
    expect(mockReply).not.toHaveBeenCalled();
  });

  it("creates a new agent and enqueues greeting on /start", async () => {
    const workflowCreate = vi.fn().mockResolvedValue({ id: "workflow-1" });
    const env = {
      CHAT_AGENT_KV: {} as any,
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_WEBHOOK_PATH: "/webhook",
      LETTA_API_KEY: "test-key",
      LETTA_TEMPLATE_VERSION: "testproject/testtemplate:1",
      TELEGRAM_WORKFLOW: { create: workflowCreate }
    } as Env;
    const { getOrCreateAgent } = await import("../agent");

    vi.mocked(getOrCreateAgent).mockResolvedValue({
      agentId: "agent-1",
      created: true
    });

    nextUpdate.message.text = "/start";

    const handler = createTelegramWebhookHandler(env);
    await handler(new Request("https://example.com/telegram/webhook", { method: "POST" }));

    expect(getOrCreateAgent).toHaveBeenCalled();
    expect(workflowCreate).toHaveBeenCalledWith({
      id: expect.stringContaining("telegram-123-456-"),
      params: {
        chatId: "123",
        messageThreadId: "456",
        userId: "789",
        username: "tester",
        text: "Let's get started"
      }
    });
  });

  it("does nothing on /start if agent already exists", async () => {
    const workflowCreate = vi.fn().mockResolvedValue({ id: "workflow-1" });
    const env = {
      CHAT_AGENT_KV: {} as any,
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_WEBHOOK_PATH: "/webhook",
      LETTA_API_KEY: "test-key",
      LETTA_TEMPLATE_VERSION: "testproject/testtemplate:1",
      TELEGRAM_WORKFLOW: { create: workflowCreate }
    } as Env;
    const { getOrCreateAgent } = await import("../agent");
    vi.mocked(getOrCreateAgent).mockResolvedValue({
      agentId: "agent-1",
      created: false
    });

    nextUpdate.message.text = "/start";

    const handler = createTelegramWebhookHandler(env);
    await handler(new Request("https://example.com/telegram/webhook", { method: "POST" }));

    expect(workflowCreate).not.toHaveBeenCalled();
  });

  it("rejects requests with the wrong secret token", async () => {
    const workflowCreate = vi.fn().mockResolvedValue({ id: "workflow-1" });
    const env = {
      CHAT_AGENT_KV: {} as any,
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_WEBHOOK_PATH: "/webhook",
      TELEGRAM_WEBHOOK_SECRET: "secret-123",
      LETTA_API_KEY: "test-key",
      LETTA_TEMPLATE_VERSION: "testproject/testtemplate:1",
      TELEGRAM_WORKFLOW: { create: workflowCreate }
    } as Env;

    const handler = createTelegramWebhookHandler(env);
    const response = await handler(new Request("https://example.com/telegram/webhook", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong" }
    }));

    expect(response.status).toBe(401);
    expect(workflowCreate).not.toHaveBeenCalled();
    expect(mockReply).not.toHaveBeenCalled();
  });
});
