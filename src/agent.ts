import type { Env, TelegramMeta } from "./types";
import { createAgentFromTemplate, createLettaClient, sendMessageToAgent } from "./letta";
import { getChatAgent, putChatAgent } from "./kv";

export async function ensureAgentForChat(env: Env, meta: TelegramMeta): Promise<string> {
  const existing = await getChatAgent(env, meta.chatId);
  if (existing?.agentId) {
    return existing.agentId;
  }

  const agentId = await createAgentFromTemplate(env, meta);
  await putChatAgent(env, meta.chatId, {
    agentId,
    createdAt: new Date().toISOString(),
    templateVersion: env.LETTA_TEMPLATE_VERSION
  });

  return agentId;
}

export async function forwardMessageToLetta(
  env: Env,
  meta: TelegramMeta,
  text: string,
  onPart: (text: string) => Promise<void>
): Promise<void> {
  const agentId = await ensureAgentForChat(env, meta);
  const client = createLettaClient(env);
  await sendMessageToAgent(client, agentId, text, onPart);
}
