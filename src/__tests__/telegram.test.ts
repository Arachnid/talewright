import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";

const mockReply = vi.fn().mockResolvedValue(undefined);
const storedHandlers: Record<string, (ctx: any) => Promise<void>> = {};

vi.mock("grammy", () => {
  class Bot {
    token: string;
    options?: unknown;
    constructor(token: string, options?: unknown) {
      this.token = token;
      this.options = options;
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
      const messageHandler = storedHandlers["message:text"];
      if (messageHandler) {
        await messageHandler({
          chat: { id: 123 },
          message: { text: "Hello", message_thread_id: 456 },
          from: { id: 789, username: "tester" },
          reply: mockReply
        });
      }
      return new Response("OK");
    };
  }
  class BotError {}
  class Context {}
  return { Bot, BotError, Context, webhookCallback };
});

import { createTelegramWebhookHandler } from "../telegram";

describe("createTelegramWebhookHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete storedHandlers["message:text"];
  });

  it("enqueues the workflow instead of replying directly", async () => {
    const workflowCreate = vi.fn().mockResolvedValue({ id: "workflow-1" });
    const env = {
      TELEGRAM_BOT_TOKEN: "test-token",
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

  it("rejects requests with the wrong secret token", async () => {
    const workflowCreate = vi.fn().mockResolvedValue({ id: "workflow-1" });
    const env = {
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_WEBHOOK_SECRET: "secret-123",
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
