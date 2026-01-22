import { Letta } from "@letta-ai/letta-client";
import type {
  AssistantMessage,
  LettaRequest,
  LettaStreamingResponse,
  ToolCall,
  ToolCallDelta,
  ToolReturn
} from "@letta-ai/letta-client/resources/agents/messages";
import type { Env, TelegramMeta } from "./types";

export type SendMessageOptions = {
  clientTools?: LettaRequest.ClientTool[];
  onToolCall?: (toolCall: ToolCall) => Promise<ToolReturn>;
};

export function createLettaClient(env: Env): Letta {
  if (env.LETTA_BASE_URL) {
    return new Letta({
      apiKey: env.LETTA_API_KEY,
      baseURL: env.LETTA_BASE_URL
    });
  }

  return new Letta({
    apiKey: env.LETTA_API_KEY,
    project: env.LETTA_PROJECT
  });
}

export function parseTemplateMemory(env: Env): Record<string, string> | undefined {
  if (!env.LETTA_TEMPLATE_MEMORY_JSON) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(env.LETTA_TEMPLATE_MEMORY_JSON) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("LETTA_TEMPLATE_MEMORY_JSON must be a JSON object");
    }
    const entries = Object.entries(parsed);
    for (const [key, value] of entries) {
      if (typeof value !== "string") {
        throw new Error(`LETTA_TEMPLATE_MEMORY_JSON value for '${key}' must be a string`);
      }
    }
    return parsed as Record<string, string>;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse LETTA_TEMPLATE_MEMORY_JSON";
    throw new Error(message);
  }
}

export async function createAgentFromTemplate(env: Env, meta: TelegramMeta): Promise<string> {
  const templateVersion = env.LETTA_TEMPLATE_VERSION;

  // Determine base URL
  let baseURL: string;
  if (env.LETTA_BASE_URL) {
    baseURL = env.LETTA_BASE_URL.replace(/\/$/, ""); // Remove trailing slash
  } else if (env.LETTA_PROJECT) {
    baseURL = "https://api.letta.com";
  } else {
    throw new Error("Either LETTA_BASE_URL or LETTA_PROJECT must be set");
  }

  // Construct API endpoint using the full template version string
  // Split on '/' to preserve it as a path separator, encode each segment
  const pathSegments = templateVersion.split("/").map(segment => encodeURIComponent(segment));
  const url = `${baseURL}/v1/templates/${pathSegments.join("/")}/agents`;

  // Prepare request body
  const body: { memory_variables?: Record<string, string> } = {};
  const memoryVariables = parseTemplateMemory(env);
  if (memoryVariables) {
    body.memory_variables = memoryVariables;
  }

  // Make HTTP request
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.LETTA_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Letta API request failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`);
  }

  const data = await response.json() as { agents?: Array<{ id?: string }> };
  const agentId = data.agents?.[0]?.id;
  if (!agentId) {
    throw new Error("Letta template response did not include agents[0].id");
  }

  return agentId;
}

export async function deleteAgent(env: Env, agentId: string): Promise<void> {
  // Determine base URL
  let baseURL: string;
  if (env.LETTA_BASE_URL) {
    baseURL = env.LETTA_BASE_URL.replace(/\/$/, ""); // Remove trailing slash
  } else if (env.LETTA_PROJECT) {
    baseURL = "https://api.letta.com";
  } else {
    throw new Error("Either LETTA_BASE_URL or LETTA_PROJECT must be set");
  }

  const url = `${baseURL}/v1/agents/${encodeURIComponent(agentId)}`;

  // Make HTTP request
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${env.LETTA_API_KEY}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Letta API delete request failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`);
  }
}

export async function sendMessageToAgent(
  client: Letta,
  agentId: string,
  text: string,
  onToken: (text: string) => Promise<void>,
  options: SendMessageOptions = {}
): Promise<void> {
  const pendingToolCalls = new Map<string, PendingToolCall>();
  const executedToolCalls = new Set<string>();

  let stream = await client.agents.messages.create(agentId, {
    input: text,
    streaming: true,
    stream_tokens: true,
    ...(options.clientTools ? { client_tools: options.clientTools } : {})
  }, { timeout: 300000 });

  while (true) {
    const approvals: ToolReturn[] = [];
    let sawApprovalRequest = false;

    for await (const event of stream) {
      if (event.message_type === "assistant_message") {
        const content = (event as AssistantMessage).content;

        if (typeof content === "string") {
          if (content.length > 0) {
            await onToken(content);
          }
        } else if (Array.isArray(content)) {
          for (const part of content) {
            if (typeof part === "string") {
              if ((part as string).length > 0) {
                await onToken(part as string);
              }
            } else if (part && typeof part === "object" && "text" in part) {
              const textValue = (part as { text?: string }).text;
              if (textValue != null) {
                const textPart = String(textValue);
                if (textPart.length > 0) {
                  await onToken(textPart);
                }
              }
            }
          }
        }
      }

      if (event.message_type === "approval_request_message") {
        sawApprovalRequest = true;
        const toolCalls = extractToolCalls(event);
        const readyToolCalls = collectExecutableToolCalls(
          toolCalls,
          pendingToolCalls,
          executedToolCalls
        );
        for (const toolCall of readyToolCalls) {
          approvals.push(await executeToolCall(toolCall, options.onToolCall));
        }
      }
    }

    if (!sawApprovalRequest) {
      break;
    }

    stream = await client.agents.messages.create(agentId, {
      messages: [{ type: "approval", approvals }],
      streaming: true,
      stream_tokens: true,
      ...(options.clientTools ? { client_tools: options.clientTools } : {})
    }, { timeout: 300000 });
  }
}

type PendingToolCall = {
  tool_call_id: string;
  name?: string;
  arguments?: string;
};

function extractToolCalls(event: LettaStreamingResponse): Array<ToolCall | ToolCallDelta> {
  const toolCalls: Array<ToolCall | ToolCallDelta> = [];
  const toolCall = (event as { tool_call?: ToolCall | ToolCallDelta }).tool_call;
  if (toolCall) {
    toolCalls.push(toolCall);
  }

  const toolCallsValue = (event as { tool_calls?: ToolCall | ToolCallDelta | Array<ToolCall | ToolCallDelta> }).tool_calls;
  if (Array.isArray(toolCallsValue)) {
    toolCalls.push(...toolCallsValue);
  } else if (toolCallsValue && typeof toolCallsValue === "object") {
    toolCalls.push(toolCallsValue);
  }

  return toolCalls;
}

function collectExecutableToolCalls(
  toolCalls: Array<ToolCall | ToolCallDelta>,
  pendingToolCalls: Map<string, PendingToolCall>,
  executedToolCalls: Set<string>
): ToolCall[] {
  const ready: ToolCall[] = [];

  for (const toolCall of toolCalls) {
    const toolCallId = toolCall.tool_call_id ?? null;
    if (!toolCallId) {
      continue;
    }

    const merged = mergeToolCall(toolCallId, pendingToolCalls.get(toolCallId), toolCall);
    pendingToolCalls.set(toolCallId, merged);

    if (merged.name && merged.arguments && !executedToolCalls.has(toolCallId)) {
      executedToolCalls.add(toolCallId);
      pendingToolCalls.delete(toolCallId);
      ready.push({
        tool_call_id: toolCallId,
        name: merged.name,
        arguments: merged.arguments
      });
    }
  }

  return ready;
}

function mergeToolCall(
  toolCallId: string,
  pending: PendingToolCall | undefined,
  delta: ToolCall | ToolCallDelta
): PendingToolCall {
  return {
    tool_call_id: toolCallId,
    name: delta.name ?? pending?.name,
    arguments: delta.arguments ?? pending?.arguments
  };
}

async function executeToolCall(
  toolCall: ToolCall,
  handler?: (toolCall: ToolCall) => Promise<ToolReturn>
): Promise<ToolReturn> {
  if (!handler) {
    return {
      status: "error",
      tool_call_id: toolCall.tool_call_id ?? "unknown",
      tool_return: "No tool handler is configured for client-side execution.",
      type: "tool"
    };
  }

  try {
    const result = await handler(toolCall);
    return {
      type: "tool",
      ...result
    };
  } catch (error) {
    console.error("Client-side tool execution failed", {
      error,
      toolCall
    });
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "error",
      tool_call_id: toolCall.tool_call_id ?? "unknown",
      tool_return: `Tool execution failed: ${message}`,
      type: "tool"
    };
  }
}
