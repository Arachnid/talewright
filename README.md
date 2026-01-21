# Telegram → Letta Bot on Cloudflare Workers

This project wires a Telegram bot webhook to a Letta agent created from a template per Telegram chat. Each chat gets a dedicated Letta agent, stored in Cloudflare KV, and all messages are forwarded to Letta with replies sent back to Telegram.

## How it works

- Telegram webhook hits the Worker at `TELEGRAM_WEBHOOK_PATH`
- Worker verifies the optional Telegram secret header
- KV maps `chat_id -> Letta agent id`
- On first message in a chat, we create a Letta agent from a template
- Messages are forwarded to Letta, and the agent’s response is sent back to Telegram

## Libraries used

- `grammy` for Telegram webhook parsing and replies
- `@letta-ai/letta-client` for Letta API calls
- Wrangler + Cloudflare Workers KV for storage

## Configuration

Set these as Worker vars or secrets:

- `TELEGRAM_BOT_TOKEN` (secret)
- `TELEGRAM_WEBHOOK_SECRET` (optional secret for Telegram’s `X-Telegram-Bot-Api-Secret-Token`)
- `LETTA_API_KEY` (secret)
- `LETTA_BASE_URL` (optional, e.g. `https://api.letta.com` or your self-hosted URL)
- `LETTA_PROJECT` (optional, used with Letta Cloud instead of `LETTA_BASE_URL`)
- `LETTA_TEMPLATE_VERSION` (format: `template_name:version`)
- `LETTA_TEMPLATE_MEMORY_JSON` (optional JSON object for template memory variables)
- `TELEGRAM_WEBHOOK_PATH` (default: `/telegram/webhook`)

## Local development

1. Install dependencies: `npm install`
2. Start the worker: `npm run dev`
3. Expose the local URL:
   - `cloudflared tunnel --url http://localhost:8787`
   - or `ngrok http 8787`
4. Set the Telegram webhook:
   ```bash
   TELEGRAM_WEBHOOK_URL="https://YOUR_TUNNEL/telegram/webhook" \
   TELEGRAM_WEBHOOK_SECRET="YOUR_WEBHOOK_SECRET" \
   TELEGRAM_BOT_TOKEN="YOUR_TOKEN" \
   npm run set:webhook
   ```

## Tests

- Run: `npm test`
- Uses `vitest` with mocked KV and Letta client calls
- Integration test: `npm run test:integration` (spins up `wrangler dev` + mock server)

## Deployment

1. Create a KV namespace and update `wrangler.toml` with its ID.
2. Set secrets:
   - `wrangler secret put TELEGRAM_BOT_TOKEN`
   - `wrangler secret put LETTA_API_KEY`
   - `wrangler secret put TELEGRAM_WEBHOOK_SECRET` (optional)
3. Deploy: `npm run deploy`

## Alternative Telegram frameworks

If you prefer a different framework:

- **Telegraf**: more middleware plugins and examples, slightly heavier in Workers.
- **grammy**: lightweight, strong TypeScript support, clean webhook adapter for Workers.

I used `grammy` for minimal boilerplate, but I can switch to Telegraf if you prefer.

## Letta template API

Template agent creation uses `client.templates.agents.create(templateVersion, ...)` from the Letta SDK. Reference: https://github.com/letta-ai/letta-node/blob/main/api.md

## Letta SDK config

You can configure the Letta client with either a `baseURL` (self-hosted or custom) or a `project` for Letta Cloud. Reference: https://docs.letta.com/api-reference/overview#typescript-sdk
