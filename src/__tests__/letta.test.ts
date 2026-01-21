import { describe, expect, it } from "vitest";
import { parseTemplateMemory, sendMessageToAgent } from "../letta";
import type { Env } from "../types";

describe("parseTemplateMemory", () => {
  it("returns undefined when not set", () => {
    const env = {
      LETTA_TEMPLATE_MEMORY_JSON: undefined
    } as Env;
    expect(parseTemplateMemory(env)).toBeUndefined();
  });

  it("parses JSON object", () => {
    const env = {
      LETTA_TEMPLATE_MEMORY_JSON: "{\"human_name\":\"Ada\"}"
    } as Env;
    expect(parseTemplateMemory(env)).toEqual({ human_name: "Ada" });
  });
});

describe("sendMessageToAgent", () => {
  it("returns assistant content string", async () => {
    const client = {
      agents: {
        messages: {
          create: async () => ({
            messages: [{ role: "assistant", content: "Hello there" }]
          })
        }
      }
    };

    const reply = await sendMessageToAgent(client as any, "agent-1", "Hi");
    expect(reply).toBe("Hello there");
  });

  it("extracts text from array content", async () => {
    const client = {
      agents: {
        messages: {
          create: async () => ({
            messages: [
              { role: "assistant", content: [{ text: "Hello" }, { text: " world" }] }
            ]
          })
        }
      }
    };

    const reply = await sendMessageToAgent(client as any, "agent-1", "Hi");
    expect(reply).toBe("Hello world");
  });
});
