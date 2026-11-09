// Autenticação de administrador único: senha via variável de ambiente e
// cookie de sessão assinado com HMAC (sem estado no servidor).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const COOKIE = 'glimpse_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

async function loadOrCreateSecret(dataDir) {
  const file = path.join(dataDir, '.session-secret');
  try {
    const existing = (await fs.readFile(file, 'utf8')).trim();
    if (existing) return existing;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const secret = crypto.randomBytes(32).toString('hex');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(file, secret, { mode: 0o600 });
  return secret;
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest();

export async function createAuth({ dataDir, adminPassword, sessionSecret, cookieSecure }) {
  if (!adminPassword) throw new Error('ADMIN_PASSWORD não foi definido.');

  const secret = sessionSecret || (await loadOrCreateSecret(dataDir));
  // A senha entra na chave: trocar a senha invalida todas as sessões existentes.
  const key = crypto.createHmac('sha256', secret).update(adminPassword).digest();
  const sign = (payload) => crypto.createHmac('sha256', key).update(payload).digest('base64url');
  const passwordHash = sha256(adminPassword);
  const attempts = new Map();

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    path: '/',
  };

  return {
    isAuthenticated(req) {
      const token = readCookie(req, COOKIE);
      if (!token) return false;
      const dot = token.lastIndexOf('.');
      if (dot === -1) return false;
      const payload = token.slice(0, dot);
      const given = Buffer.from(token.slice(dot + 1));
      const expected = Buffer.from(sign(payload));
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
      const exp = Number(payload.split('.')[1]);
      return Number.isFinite(exp) && exp > Date.now();
    },

    checkPassword(password) {
      if (typeof password !== 'string') return false;
      return crypto.timingSafeEqual(sha256(password), passwordHash);
    },

    // Retorna true se o IP ainda pode tentar logar.
    allowAttempt(ip) {
      const now = Date.now();
      for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
      const entry = attempts.get(ip) ?? { count: 0, reset: now + LOGIN_WINDOW_MS };
      entry.count += 1;
      attempts.set(ip, entry);
      return entry.count <= LOGIN_MAX_ATTEMPTS;
    },

    clearAttempts(ip) {
      attempts.delete(ip);
    },

    startSession(res) {
      const payload = `v1.${Date.now() + SESSION_MS}.${crypto.randomBytes(8).toString('base64url')}`;
      res.cookie(COOKIE, `${payload}.${sign(payload)}`, { ...cookieOptions, maxAge: SESSION_MS });
    },

    endSession(res) {
      res.clearCookie(COOKIE, cookieOptions);
    },
  };
}
