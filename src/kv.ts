import type { ChatAgentRecord, Env } from "./types";

const KV_PREFIX = "chat:";

export function chatKey(chatId: string): string {
  return `${KV_PREFIX}${chatId}`;
}

export async function getChatAgent(
  env: Env,
  chatId: string
): Promise<ChatAgentRecord | null> {
  const raw = await env.CHAT_AGENT_KV.get(chatKey(chatId));
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
  record: ChatAgentRecord
): Promise<void> {
  await env.CHAT_AGENT_KV.put(chatKey(chatId), JSON.stringify(record));
}

export async function deleteChatAgent(
  env: Env,
  chatId: string
): Promise<void> {
  await env.CHAT_AGENT_KV.delete(chatKey(chatId));
}
