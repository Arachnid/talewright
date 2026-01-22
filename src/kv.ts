import type { ChatAgentRecord, Env } from "./types";
import { deleteAgent } from "./letta";

const KV_PREFIX = "chat:";
const DEFAULT_THREAD = "main";

export function chatKey(chatId: string, messageThreadId?: string): string {
  const threadKey = messageThreadId ?? DEFAULT_THREAD;
  return `${KV_PREFIX}${chatId}:${threadKey}`;
}

export async function getChatAgent(
  env: Env,
  chatId: string,
  messageThreadId?: string
): Promise<ChatAgentRecord | null> {
  const raw = await env.CHAT_AGENT_KV.get(chatKey(chatId, messageThreadId));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ChatAgentRecord;
  } catch {
    return null;
  }
}

export async function putChatAgent(
  env: Env,
  chatId: string,
  messageThreadId: string | undefined,
  record: ChatAgentRecord
): Promise<void> {
  await env.CHAT_AGENT_KV.put(chatKey(chatId, messageThreadId), JSON.stringify(record));
}

export async function deleteChatAgent(
  env: Env,
  chatId: string,
  messageThreadId?: string
): Promise<void> {
  // Get the agent record to find the agent ID
  const record = await getChatAgent(env, chatId, messageThreadId);
  
  // Delete the agent from Letta API if it exists
  if (record?.agentId) {
    try {
      await deleteAgent(env, record.agentId);
    } catch (error) {
      // Log error but continue to delete from KV
      // The agent might already be deleted or the API call might fail
      console.error("Failed to delete agent from Letta API", {
        error,
        agentId: record.agentId,
        chatId
      });
    }
  }
  
  // Delete the KV record
  await env.CHAT_AGENT_KV.delete(chatKey(chatId, messageThreadId));
}
