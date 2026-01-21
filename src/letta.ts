import { Letta } from "@letta-ai/letta-client";
import type {
  AssistantMessage,
  LettaResponse,
  Message
} from "@letta-ai/letta-client/resources/agents/messages";
import type { Env, TelegramMeta } from "./types";

export function createLettaClient(env: Env): Letta {
  return new Letta({
    apiKey: env.LETTA_API_KEY,
    baseURL: env.LETTA_BASE_URL
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
  const client = createLettaClient(env);
  const response = await client.templates.agents.create(env.LETTA_TEMPLATE_VERSION, {
    memory_variables: parseTemplateMemory(env)
  });

  const agentId = response.agent_ids?.[0];
  if (!agentId) {
    throw new Error("Letta template response did not include agent_ids");
  }

  return agentId;
}

export async function sendMessageToAgent(
  client: Letta,
  agentId: string,
  text: string
): Promise<string> {
  const response: LettaResponse = await client.agents.messages.create(agentId, { input: text });
  const messages: Message[] = response.messages ?? [];
  const assistant = [...messages].reverse().find((message): message is AssistantMessage => {
    return "message_type" in message && message.message_type === "assistant_message";
  });

  const content = assistant?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part === "object" && part && "text" in part) {
          return String((part as { text?: string }).text ?? "");
        }
        return "";
      })
      .join("")
      .trim();
  }

  if (content != null) {
    return String(content);
  }

  return "";
}
