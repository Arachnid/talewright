import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Env, TelegramWorkflowInput } from "../types";

// Mock cloudflare:workers module
vi.mock("cloudflare:workers", () => ({
  WorkflowEntrypoint: class MockWorkflowEntrypoint {
    env: Env;
    constructor(_ctx: unknown, env: Env) {
      this.env = env;
    }
  },
  WorkflowEvent: class {},
  WorkflowStep: class {}
}));

// Create a shared mock for sendMessage that we can spy on
const mockSendMessage = vi.fn().mockResolvedValue(undefined);

// Mock dependencies
vi.mock("../agent", () => ({
  forwardMessageToLetta: vi.fn()
}));

vi.mock("grammy", () => ({
  Bot: vi.fn().mockImplementation(() => ({
    api: {
      sendMessage: mockSendMessage
    }
  }))
}));

// Import after mocks are set up
import { TelegramWorkflow } from "../workflow";

describe("TelegramWorkflow", () => {
  let mockEnv: Env;
  let mockStep: {
    do: ReturnType<typeof vi.fn>;
  };
  let mockEvent: {
    payload: TelegramWorkflowInput;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMessage.mockClear();

    mockEnv = {
      CHAT_AGENT_KV: {} as any,
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_WEBHOOK_PATH: "/webhook",
      LETTA_API_KEY: "test-key",
      LETTA_TEMPLATE_VERSION: "testproject/testtemplate:1",
      TELEGRAM_WORKFLOW: { create: async () => ({ id: "test" }) }
    } as Env;

    mockStep = {
      do: vi.fn().mockImplementation(async (name: string, fn: () => Promise<void>) => {
        await fn();
      })
    };

    mockEvent = {
      payload: {
        chatId: "123",
        userId: "456",
        username: "testuser",
        text: "Hello"
      }
    };
  });

  it("forwards non-command messages to Letta", async () => {
    const { forwardMessageToLetta } = await import("../agent");
    vi.mocked(forwardMessageToLetta).mockResolvedValue(undefined);

    const workflow = new TelegramWorkflow({} as any, mockEnv as any);
    mockEvent.payload.text = "Hello, how are you?";

    await workflow.run(mockEvent as any, mockStep as any);

    expect(mockStep.do).toHaveBeenCalledWith(
      "process-letta-message",
      expect.any(Function)
    );
    expect(forwardMessageToLetta).toHaveBeenCalledWith(
      mockEnv,
      {
        chatId: "123",
        userId: "456",
        username: "testuser"
      },
      "Hello, how are you?",
      expect.any(Function)
    );
  });

  it("forwards /start text to Letta when invoked directly", async () => {
    const { forwardMessageToLetta } = await import("../agent");
    vi.mocked(forwardMessageToLetta).mockResolvedValue(undefined);

    const workflow = new TelegramWorkflow({} as any, mockEnv as any);
    mockEvent.payload.text = "/start";

    await workflow.run(mockEvent as any, mockStep as any);

    expect(forwardMessageToLetta).toHaveBeenCalledWith(
      mockEnv,
      {
        chatId: "123",
        userId: "456",
        username: "testuser"
      },
      "/start",
      expect.any(Function)
    );
  });
});
