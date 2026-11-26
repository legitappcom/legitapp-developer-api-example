import dotenv from 'dotenv';
import { createApp } from './app';

dotenv.config();

const apiBaseUrl = process.env.LEGIT_APP_API_URL || 'https://developer-api-a7zu.legitapp.com/v1';
const developerSecretKey = process.env.LEGIT_APP_DEVELOPER_SECRET_KEY;
if (!developerSecretKey) throw new Error('Set LEGIT_APP_DEVELOPER_SECRET_KEY in .env.');
const base = new URL(apiBaseUrl);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
  throw new Error('LEGIT_APP_API_URL must be an HTTP(S) API base URL without credentials or a query string.');
}
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const host = process.env.HOST || '127.0.0.1';
const webhookToken = process.env.WEBHOOK_PATH_TOKEN || '';
if (webhookToken && !/^[A-Za-z0-9_-]{32,}$/.test(webhookToken)) {
  throw new Error('WEBHOOK_PATH_TOKEN must contain at least 32 letters, digits, underscores or hyphens.');
}
const app = createApp({
  apiBaseUrl,
  developerSecretKey,
  webhookPath: webhookToken ? `/webhook/${webhookToken}` : '/webhook',
});
app.listen(port, host, () => { console.log(`Example server listening on http://${host}:${port}`); });
