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

if (env.ADMIN_PASSWORD) {
  console.warn('Aviso: ADMIN_PASSWORD é ignorada. A senha é definida no primeiro acesso pela interface.');
}

const dataDir = env.DATA_DIR || './data';
let app;
try {
  app = await createApp({
    dataDir,
    sessionSecret: readSecret('SESSION_SECRET'),
    publicRead: bool(env.PUBLIC_READ),
    cookieSecure: bool(env.COOKIE_SECURE),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
  });
} catch (err) {
  if (err.code !== 'EACCES' && err.code !== 'EPERM') throw err;
  // Comum com pastas do host (bind mount) criadas como root, ex.: no ZimaOS/CasaOS.
  const uid = process.getuid?.() ?? '?';
  const gid = process.getgid?.() ?? '?';
  console.error(`Erro: sem permissão para gravar em ${dataDir} (${err.path ?? err.message}).`);
  console.error(`O servidor roda como UID ${uid}. Dê a pasta do host a esse usuário, por exemplo:`);
  console.error(`  sudo chown -R ${uid}:${gid} /caminho/da/pasta/no/host`);
  process.exit(1);
}

const port = Number(env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`Glimpse Teleprompter rodando em http://0.0.0.0:${port}`);
  if (!app.locals.configured()) {
    console.log('Primeiro acesso: abra o endereço acima no navegador para definir a senha de administrador.');
  }
});

// Conexões do controle remoto ficam abertas: encerra-as para o servidor parar.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    app.locals.closeRemote();
    server.close(() => process.exit(0));
    server.closeAllConnections?.();
  });
}
