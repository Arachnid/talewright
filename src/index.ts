import type { Env } from "./types";
import { assertEnv } from "./config";
import { createTelegramWebhookHandler } from "./telegram";
export { TelegramWorkflow } from "./workflow";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      assertEnv(env);
    } catch (error) {
      console.error("Configuration error", error);
      return new Response("Worker misconfigured.", { status: 500 });
    }

    const url = new URL(request.url);
    if (url.pathname !== env.TELEGRAM_WEBHOOK_PATH) {
      return new Response("Not found.", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed.", { status: 405 });
    }

    const handler = createTelegramWebhookHandler(env);
    return handler(request);
  }
};
