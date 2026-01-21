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
  text: string
): Promise<string> {
  console.log("forwardMessageToLetta: starting", { chatId: meta.chatId, textLength: text.length });
  try {
    const agentId = await ensureAgentForChat(env, meta);
    console.log("forwardMessageToLetta: agent obtained", { agentId });
    const client = createLettaClient(env);
    const result = await sendMessageToAgent(client, agentId, text);
    console.log("forwardMessageToLetta: completed successfully", { resultLength: result.length });
    return result;
  } catch (error) {
    console.error("forwardMessageToLetta: error occurred", {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause
      } : error,
      chatId: meta.chatId,
      textLength: text.length
    });
    throw error;
  }
}
