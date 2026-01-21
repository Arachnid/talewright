import { describe, expect, it, vi } from "vitest";
import { createFreshAgent, ensureAgentForChat } from "../agent";
import type { Env } from "../types";

class MockKV {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

vi.mock("../letta", async () => {
  const actual = await vi.importActual<typeof import("../letta")>("../letta");
  return {
    ...actual,
    createAgentFromTemplate: vi.fn(async () => "agent-created")
  };
});

describe("ensureAgentForChat", () => {
  it("reuses an existing agent id", async () => {
    const env = {
      CHAT_AGENT_KV: new MockKV(),
      LETTA_TEMPLATE_VERSION: "testproject/testtemplate:1",
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_WEBHOOK_PATH: "/webhook",
      LETTA_API_KEY: "test-key",
      TELEGRAM_WORKFLOW: { create: async () => ({ id: "test" }) }
    } as Env;

    await env.CHAT_AGENT_KV.put("chat:123", JSON.stringify({
      agentId: "agent-existing",
      createdAt: "2025-01-01T00:00:00.000Z",
      templateVersion: "template:1"
    }));

    const agentId = await ensureAgentForChat(env, { chatId: "123" });
    expect(agentId).toBe("agent-existing");
  });

  it("creates and stores a new agent id", async () => {
    const env = {
      CHAT_AGENT_KV: new MockKV(),
      LETTA_TEMPLATE_VERSION: "testproject/testtemplate:1",
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_WEBHOOK_PATH: "/webhook",
      LETTA_API_KEY: "test-key",
      TELEGRAM_WORKFLOW: { create: async () => ({ id: "test" }) }
    } as Env;

    const agentId = await ensureAgentForChat(env, { chatId: "456" });
    expect(agentId).toBe("agent-created");

    const raw = await env.CHAT_AGENT_KV.get("chat:456");
    expect(raw).toContain("agent-created");
  });
});

describe("createFreshAgent", () => {
  it("deletes existing agent and creates a new one", async () => {
    const env = {
      CHAT_AGENT_KV: new MockKV(),
      LETTA_TEMPLATE_VERSION: "testproject/testtemplate:1",
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_WEBHOOK_PATH: "/webhook",
      LETTA_API_KEY: "test-key",
      TELEGRAM_WORKFLOW: { create: async () => ({ id: "test" }) }
    } as Env;

    // Set up an existing agent
    await env.CHAT_AGENT_KV.put("chat:789", JSON.stringify({
      agentId: "agent-old",
      createdAt: "2025-01-01T00:00:00.000Z",
      templateVersion: "template:1"
    }));

    const agentId = await createFreshAgent(env, { chatId: "789" });
    expect(agentId).toBe("agent-created");

    // Verify the old agent was deleted and a new one was created
    const raw = await env.CHAT_AGENT_KV.get("chat:789");
    expect(raw).not.toContain("agent-old");
    expect(raw).toContain("agent-created");
  });

  it("creates a new agent even when none exists", async () => {
    const env = {
      CHAT_AGENT_KV: new MockKV(),
      LETTA_TEMPLATE_VERSION: "testproject/testtemplate:1",
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_WEBHOOK_PATH: "/webhook",
      LETTA_API_KEY: "test-key",
      TELEGRAM_WORKFLOW: { create: async () => ({ id: "test" }) }
    } as Env;

    const agentId = await createFreshAgent(env, { chatId: "999" });
    expect(agentId).toBe("agent-created");

    const raw = await env.CHAT_AGENT_KV.get("chat:999");
    expect(raw).toContain("agent-created");
  });
});
