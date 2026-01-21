import type { Env, TelegramWorkflowInput } from "./types";
import { assertEnv } from "./config";
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

    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Unauthorized.", { status: 401 });
      }
    }

    // Parse the Telegram update
    const update = await request.json() as {
      message?: {
        text?: string;
        chat?: { id: number; type: string };
        from?: { id: number; username?: string };
      };
    };

    const message = update.message;
    if (!message) {
      return new Response("OK", { status: 200 });
    }

    const chatId = message.chat?.id?.toString();
    const text = message.text?.trim();
    if (!chatId || !text) {
      return new Response("OK", { status: 200 });
    }

    // Trigger workflow and return immediately
    const workflowInput: TelegramWorkflowInput = {
      chatId,
      userId: message.from?.id?.toString(),
      username: message.from?.username,
      text
    };

    await env.TELEGRAM_WORKFLOW.create({
      id: `telegram-${chatId}-${Date.now()}`,
      params: workflowInput
    });

    // Respond immediately to Telegram
    return new Response("OK", { status: 200 });
  }
};
