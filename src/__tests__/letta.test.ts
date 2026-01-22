import { describe, expect, it, vi } from "vitest";
import type { LettaStreamingResponse } from "@letta-ai/letta-client/resources/agents/messages";
import type { Letta } from "@letta-ai/letta-client";
import type { Env } from "../types";
import { parseTemplateMemory, sendMessageToAgent } from "../letta";

function streamFrom(events: LettaStreamingResponse[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    }
  };
}

describe("sendMessageToAgent", () => {
  it("responds to tool calls by sending approvals", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(streamFrom([{
        message_type: "approval_request_message",
        tool_call: {
          name: "editForumTopic",
          arguments: JSON.stringify({ title: "Release notes" }),
          tool_call_id: "call-1"
        }
      } as LettaStreamingResponse]))
      .mockResolvedValueOnce(streamFrom([{
        message_type: "assistant_message",
        content: "Done"
      } as LettaStreamingResponse]));

    const client = {
      agents: {
        messages: {
          create
        }
      }
    } as unknown as Letta;

    const onToken = vi.fn(async () => {});
    const onToolCall = vi.fn(async (toolCall) => ({
      status: "success" as const,
      tool_call_id: toolCall.tool_call_id ?? "unknown",
      tool_return: "ok"
    }));

    await sendMessageToAgent(client, "agent-1", "Hello", onToken, {
      clientTools: [{
        name: "editForumTopic",
        description: "Edit topic",
        parameters: { type: "object", properties: {} }
      }],
      onToolCall
    });

    expect(create).toHaveBeenCalledTimes(2);

    const firstBody = create.mock.calls[0][1];
    expect(firstBody).toMatchObject({
      input: "Hello",
      streaming: true,
      stream_tokens: true,
      client_tools: expect.any(Array)
    });

    const secondBody = create.mock.calls[1][1];
    expect(secondBody).toMatchObject({
      messages: [{
        type: "approval",
        approvals: [expect.objectContaining({
          status: "success",
          tool_call_id: "call-1",
          tool_return: "ok",
          type: "tool"
        })]
      }],
      streaming: true,
      stream_tokens: true,
      client_tools: expect.any(Array)
    });
    expect(onToolCall).toHaveBeenCalledTimes(1);
  });

  it("merges tool call deltas before executing", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(streamFrom([{
        message_type: "approval_request_message",
        tool_call: {
          name: "editForumTopic",
          tool_call_id: "call-2"
        }
      } as LettaStreamingResponse, {
        message_type: "approval_request_message",
        tool_call: {
          arguments: JSON.stringify({ title: "Roadmap" }),
          tool_call_id: "call-2"
        }
      } as LettaStreamingResponse]))
      .mockResolvedValueOnce(streamFrom([{
        message_type: "assistant_message",
        content: "Updated"
      } as LettaStreamingResponse]));

    const client = {
      agents: {
        messages: {
          create
        }
      }
    } as unknown as Letta;

    const onToken = vi.fn(async () => {});
    const onToolCall = vi.fn(async (toolCall) => ({
      status: "success" as const,
      tool_call_id: toolCall.tool_call_id ?? "unknown",
      tool_return: "ok"
    }));

    await sendMessageToAgent(client, "agent-1", "Hello", onToken, {
      clientTools: [{
        name: "editForumTopic",
        description: "Edit topic",
        parameters: { type: "object", properties: {} }
      }],
      onToolCall
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolCall).toHaveBeenCalledWith(expect.objectContaining({
      name: "editForumTopic",
      arguments: JSON.stringify({ title: "Roadmap" }),
      tool_call_id: "call-2"
    }));
  });
});

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
