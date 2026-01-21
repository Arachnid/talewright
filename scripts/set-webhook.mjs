const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

if (!webhookUrl) {
  console.error("Missing TELEGRAM_WEBHOOK_URL");
  process.exit(1);
}

const payload = {
  url: webhookUrl
};

if (secret) {
  payload.secret_token = secret;
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});

const bodyText = await response.text();

if (!response.ok) {
  console.error(`Failed to set webhook (${response.status}).`);
  console.error(bodyText);
  process.exit(1);
}

console.log(bodyText);
