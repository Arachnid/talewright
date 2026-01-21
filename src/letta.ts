import { Letta } from "@letta-ai/letta-client";
import type {
  AssistantMessage,
  LettaStreamingResponse
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
  onPart: (text: string) => Promise<void>
): Promise<void> {
  const stream = await client.agents.messages.create(agentId, {
    input: text,
    streaming: true
  }, {timeout: 300000});

  for await (const event of stream) {
    if (event.message_type === "assistant_message") {
      const content = (event as AssistantMessage).content;
      
      if (typeof content === "string") {
        if (content.trim()) {
          await onPart(content);
        }
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (typeof part === "string") {
            if ((part as string).trim()) {
              await onPart(part as string);
            }
          } else if (part && typeof part === "object" && "text" in part) {
            const textValue = (part as { text?: string }).text;
            if (textValue != null) {
              const textPart = String(textValue);
              if (textPart.trim()) {
                await onPart(textPart);
              }
            }
          }
        }
      }
    }
  }
}
