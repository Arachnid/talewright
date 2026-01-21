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
  it("calls onPart for assistant content string", async () => {
    async function* mockStream() {
      yield { message_type: "assistant_message", content: "Hello there" } as any;
    }
    
    const client = {
      agents: {
        messages: {
          create: async () => mockStream()
        }
      }
    };

    const parts: string[] = [];
    await sendMessageToAgent(client as any, "agent-1", "Hi", async (part) => {
      parts.push(part);
    });
    expect(parts).toEqual(["Hello there"]);
  });

  it("calls onPart for each text part in array content", async () => {
    async function* mockStream() {
      yield { message_type: "assistant_message", content: [{ text: "Hello" }, { text: " world" }] } as any;
    }
    
    const client = {
      agents: {
        messages: {
          create: async () => mockStream()
        }
      }
    };

    const parts: string[] = [];
    await sendMessageToAgent(client as any, "agent-1", "Hi", async (part) => {
      parts.push(part);
    });
    expect(parts).toEqual(["Hello", " world"]);
  });
});
