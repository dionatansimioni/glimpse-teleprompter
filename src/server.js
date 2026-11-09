import fs from 'node:fs';
import { createApp } from './app.js';

const env = process.env;
const bool = (value) => /^(1|true|yes|on)$/i.test(value ?? '');

function readSecret(name) {
  if (env[`${name}_FILE`]) return fs.readFileSync(env[`${name}_FILE`], 'utf8').trim();
  return env[name];
}

function parseTrustProxy(value) {
  if (!value) return false;
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  return /^\d+$/.test(value) ? Number(value) : value;
}

const adminPassword = readSecret('ADMIN_PASSWORD');
if (!adminPassword) {
  console.error('Erro: defina a variável ADMIN_PASSWORD (ou ADMIN_PASSWORD_FILE) com a senha do administrador.');
  process.exit(1);
}

const app = await createApp({
  dataDir: env.DATA_DIR || './data',
  adminPassword,
  sessionSecret: readSecret('SESSION_SECRET'),
  publicRead: bool(env.PUBLIC_READ),
  cookieSecure: bool(env.COOKIE_SECURE),
  trustProxy: parseTrustProxy(env.TRUST_PROXY),
});

const port = Number(env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`Glimpse Teleprompter rodando em http://0.0.0.0:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
