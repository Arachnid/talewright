import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Env, TelegramWorkflowInput } from "../types";

// Mock cloudflare:workers module
vi.mock("cloudflare:workers", () => ({
  WorkflowEntrypoint: class MockWorkflowEntrypoint {
    env: Env;
    constructor(env: Env) {
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
  createFreshAgent: vi.fn(),
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

  it("handles /start command by creating fresh agent", async () => {
    const { createFreshAgent } = await import("../agent");
    vi.mocked(createFreshAgent).mockResolvedValue("new-agent-id");

    const workflow = new TelegramWorkflow(mockEnv);
    mockEvent.payload.text = "/start";

    await workflow.run(mockEvent as any, mockStep as any);

    expect(mockStep.do).toHaveBeenCalledWith(
      "create-fresh-agent",
      expect.any(Function)
    );
    expect(createFreshAgent).toHaveBeenCalledWith(mockEnv, {
      chatId: "123",
      userId: "456",
      username: "testuser"
    });
    expect(mockSendMessage).toHaveBeenCalledWith(
      "123",
      expect.stringContaining("Agent restarted"),
      { parse_mode: "MarkdownV2" }
    );
  });

  it("handles /restart command by creating fresh agent", async () => {
    const { createFreshAgent } = await import("../agent");
    vi.mocked(createFreshAgent).mockResolvedValue("new-agent-id");

    const workflow = new TelegramWorkflow(mockEnv);
    mockEvent.payload.text = "/restart";

    await workflow.run(mockEvent as any, mockStep as any);

    expect(mockStep.do).toHaveBeenCalledWith(
      "create-fresh-agent",
      expect.any(Function)
    );
    expect(createFreshAgent).toHaveBeenCalledWith(mockEnv, {
      chatId: "123",
      userId: "456",
      username: "testuser"
    });
    expect(mockSendMessage).toHaveBeenCalledWith(
      "123",
      expect.stringContaining("Agent restarted"),
      { parse_mode: "MarkdownV2" }
    );
  });

  it("handles /start command with whitespace", async () => {
    const { createFreshAgent } = await import("../agent");
    vi.mocked(createFreshAgent).mockResolvedValue("new-agent-id");

    const workflow = new TelegramWorkflow(mockEnv);
    mockEvent.payload.text = "  /start  ";

    await workflow.run(mockEvent as any, mockStep as any);

    expect(createFreshAgent).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(
      "123",
      expect.stringContaining("Agent restarted"),
      { parse_mode: "MarkdownV2" }
    );
  });

  it("sends error message if creating fresh agent fails", async () => {
    const { createFreshAgent } = await import("../agent");
    vi.mocked(createFreshAgent).mockRejectedValue(new Error("Failed to create agent"));

    const workflow = new TelegramWorkflow(mockEnv);
    mockEvent.payload.text = "/start";

    await workflow.run(mockEvent as any, mockStep as any);

    expect(mockSendMessage).toHaveBeenCalledWith(
      "123",
      "Sorry, something went wrong while restarting the agent\\.",
      { parse_mode: "MarkdownV2" }
    );
  });

  it("forwards non-command messages to Letta", async () => {
    const { forwardMessageToLetta } = await import("../agent");
    vi.mocked(forwardMessageToLetta).mockResolvedValue(undefined);

    const workflow = new TelegramWorkflow(mockEnv);
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

  it("does not treat /start as command when it's part of a longer message", async () => {
    const { forwardMessageToLetta, createFreshAgent } = await import("../agent");
    vi.mocked(forwardMessageToLetta).mockResolvedValue(undefined);

    const workflow = new TelegramWorkflow(mockEnv);
    mockEvent.payload.text = "Please /start the process";

    await workflow.run(mockEvent as any, mockStep as any);

    expect(forwardMessageToLetta).toHaveBeenCalled();
    expect(vi.mocked(createFreshAgent)).not.toHaveBeenCalled();
  });
});
