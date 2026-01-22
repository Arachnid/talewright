import type { Env, TelegramMeta } from "./types";
import {
  createAgentFromTemplate,
  createLettaClient,
  sendMessageToAgent,
  type SendMessageOptions
} from "./letta";
import { getChatAgent, putChatAgent } from "./kv";

export async function ensureAgentForChat(env: Env, meta: TelegramMeta): Promise<string> {
  const { agentId } = await getOrCreateAgent(env, meta);
  return agentId;
}

export async function getOrCreateAgent(
  env: Env,
  meta: TelegramMeta
): Promise<{ agentId: string; created: boolean }> {
  const existing = await getChatAgent(env, meta.chatId, meta.messageThreadId);
  if (existing?.agentId) {
    return { agentId: existing.agentId, created: false };
  }

  const agentId = await createAgentFromTemplate(env, meta);
  await putChatAgent(env, meta.chatId, meta.messageThreadId, {
    agentId,
    createdAt: new Date().toISOString(),
    templateVersion: env.LETTA_TEMPLATE_VERSION
  });

  return { agentId, created: true };
}

export async function forwardMessageToLetta(
  env: Env,
  meta: TelegramMeta,
  text: string,
  onPart: (messageId: string, text: string) => Promise<void>,
  options?: SendMessageOptions
): Promise<void> {
  const agentId = await ensureAgentForChat(env, meta);
  const client = createLettaClient(env);
  await sendMessageToAgent(client, agentId, text, onPart, options);
}
