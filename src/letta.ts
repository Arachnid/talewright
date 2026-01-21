import { Letta } from "@letta-ai/letta-client";
import type {
  AssistantMessage,
  LettaResponse,
  Message
} from "@letta-ai/letta-client/resources/agents/messages";
import type { Env, TelegramMeta } from "./types";

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
