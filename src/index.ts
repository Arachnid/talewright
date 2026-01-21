import type { Env } from "./types";
import { assertEnv } from "./config";
import { processTelegramMessage } from "./telegram";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    console.log("Worker fetch: request received", {
      method: request.method,
      path: new URL(request.url).pathname,
      timestamp: startTime
    });

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

    try {
      // Parse the Telegram update
      const update = await request.json() as {
        message?: {
          text?: string;
          chat?: { id: number; type: string };
          from?: { id: number; username?: string };
        };
      };

      // Respond immediately to Telegram
      const response = new Response("OK", { status: 200 });
      
      // Process the Letta API call in the background
      ctx.waitUntil(processTelegramMessage(env, update));

      const duration = Date.now() - startTime;
      console.log("Worker fetch: request completed", { duration, status: response.status });
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error("Worker fetch: error occurred", {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        duration
      });
      // Still return 200 to Telegram even on error to avoid retries
      return new Response("OK", { status: 200 });
    }
  }
};
