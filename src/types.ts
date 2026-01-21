export interface Env {
  CHAT_AGENT_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_API_BASE_URL?: string;
  TELEGRAM_WEBHOOK_PATH: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  LETTA_API_KEY: string;
  LETTA_BASE_URL?: string;
  LETTA_PROJECT?: string;
  LETTA_TEMPLATE_VERSION: string;
  LETTA_TEMPLATE_MEMORY_JSON?: string;
}

export interface ChatAgentRecord {
  agentId: string;
  createdAt: string;
  templateVersion: string;
}

export interface TelegramMeta {
  chatId: string;
  userId?: string;
  username?: string;
}
