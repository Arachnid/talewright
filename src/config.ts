import type { Env } from "./types";

const REQUIRED_ENV: Array<keyof Env> = [
  "CHAT_AGENT_KV",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_PATH",
  "LETTA_API_KEY",
  "LETTA_BASE_URL",
  "LETTA_TEMPLATE_VERSION"
];

export function assertEnv(env: Env): void {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment values: ${missing.join(", ")}`);
  }
}
