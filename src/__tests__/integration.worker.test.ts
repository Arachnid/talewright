import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

type MockState = {
  templateCalls: number;
  messageCalls: number;
  telegramMessages: Array<{ chatId: number; text: string }>;
  requests: Array<{ method: string; path: string }>;
};

function startMockServer() {
  const state: MockState = {
    templateCalls: 0,
    messageCalls: 0,
    telegramMessages: [],
    requests: []
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    state.requests.push({ method: req.method ?? "GET", path: url.pathname });
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = chunks.length ? Buffer.concat(chunks).toString("utf8") : "";

    if (req.method === "POST" && url.pathname.startsWith("/v1/templates/")) {
      state.templateCalls += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        agents: [{ id: "agent-1" }]
      }));
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/v1/agents/") && url.pathname.endsWith("/messages")) {
      state.messageCalls += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        messages: [{ message_type: "assistant_message", role: "assistant", content: "Hello from Letta" }]
      }));
      return;
    }

    if (url.pathname.includes("getMe")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        result: {
          id: 42,
          is_bot: true,
          first_name: "TestBot",
          username: "test_bot"
        }
      }));
      return;
    }

    if (req.method === "POST" && url.pathname.includes("sendMessage")) {
      const parsed = body ? JSON.parse(body) : {};
      state.telegramMessages.push({ chatId: Number(parsed.chat_id), text: parsed.text });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise<{ port: number; close: () => Promise<void>; state: MockState }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        state,
        close: () => new Promise((done) => server.close(() => done()))
      });
    });
  });
}

async function getAvailablePort(): Promise<number> {
  const server = createServer();
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

async function waitForWorkerReady(
  port: number,
  path: string,
  processInfo: { exited: boolean; code: number | null; logs: string }
) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (processInfo.exited) {
      throw new Error(`Worker exited early (code ${processInfo.code}). Logs:\n${processInfo.logs}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "GET" });
      if (response.status === 405 || response.status === 401 || response.status === 404) {
        return;
      }
    } catch {
      // ignore until ready
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Worker did not become ready in time. Logs:\n${processInfo.logs}`);
}

function startWranglerDev(params: {
  port: number;
  vars: Record<string, string>;
}) {
  const args = [
    "dev",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    String(params.port)
  ];

  for (const [key, value] of Object.entries(params.vars)) {
    args.push("--var", `${key}:${value}`);
  }

  const child = spawn("./node_modules/.bin/wrangler", args, {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd()
  });

  return child;
}

describe("worker integration", () => {
  let mockCloser: (() => Promise<void>) | null = null;
  let workerProcess: ReturnType<typeof startWranglerDev> | null = null;
  let workerLogs = "";
  let workerExit: { exited: boolean; code: number | null } = { exited: false, code: null };

  afterEach(async () => {
    if (workerProcess) {
      workerProcess.kill("SIGTERM");
      workerProcess = null;
    }
    if (mockCloser) {
      await mockCloser();
      mockCloser = null;
    }
  });

  it(
    "routes Telegram webhook -> Letta -> Telegram reply",
    async () => {
      const mock = await startMockServer();
      mockCloser = mock.close;

      const workerPort = await getAvailablePort();
      const webhookPath = "/telegram/webhook";

      workerProcess = startWranglerDev({
        port: workerPort,
        vars: {
          TELEGRAM_BOT_TOKEN: "TEST_TOKEN",
          TELEGRAM_API_BASE_URL: `http://127.0.0.1:${mock.port}`,
          TELEGRAM_WEBHOOK_PATH: webhookPath,
          LETTA_API_KEY: "test-key",
          LETTA_BASE_URL: `http://127.0.0.1:${mock.port}`,
          LETTA_TEMPLATE_VERSION: "testproject/testtemplate:1"
        }
      });

      if (workerProcess.stdout) {
        workerProcess.stdout.on("data", (chunk) => {
          workerLogs += chunk.toString();
        });
      }
      if (workerProcess.stderr) {
        workerProcess.stderr.on("data", (chunk) => {
          workerLogs += chunk.toString();
        });
      }
      workerProcess.on("exit", (code) => {
        workerExit = { exited: true, code };
      });

      await waitForWorkerReady(workerPort, webhookPath, {
        get exited() {
          return workerExit.exited;
        },
        get code() {
          return workerExit.code;
        },
        get logs() {
          return workerLogs;
        }
      });

      const chatId = Math.floor(Math.random() * 1_000_000_000);
      const telegramUpdate = {
        update_id: 1,
        message: {
          message_id: 10,
          date: Math.floor(Date.now() / 1000),
          text: "Hello",
          chat: { id: chatId, type: "private" },
          from: { id: 456, is_bot: false, first_name: "Tester" }
        }
      };

      const response = await fetch(`http://127.0.0.1:${workerPort}${webhookPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telegramUpdate)
      });

      if (response.status !== 200) {
        const body = await response.text();
        throw new Error(
          `Unexpected status ${response.status}. Body: ${body}. ` +
            `Requests: ${JSON.stringify(mock.state.requests)}. ` +
            `Logs:\n${workerLogs}`
        );
      }

      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && mock.state.telegramMessages.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (mock.state.telegramMessages.length === 0) {
        throw new Error(
          `No Telegram reply observed. Requests: ${JSON.stringify(mock.state.requests)}. ` +
            `Logs:\n${workerLogs}`
        );
      }

      if (mock.state.templateCalls !== 1 || mock.state.messageCalls !== 1) {
        throw new Error(
          `Unexpected Letta calls. templateCalls=${mock.state.templateCalls}, ` +
            `messageCalls=${mock.state.messageCalls}. ` +
            `Requests: ${JSON.stringify(mock.state.requests)}. ` +
            `TelegramMessages: ${JSON.stringify(mock.state.telegramMessages)}. ` +
            `Logs:\n${workerLogs}`
        );
      }

      expect(mock.state.telegramMessages[0]).toEqual({
        chatId,
        text: "Hello from Letta"
      });
    },
    20000
  );
});
