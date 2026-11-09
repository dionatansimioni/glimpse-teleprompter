// Autenticação de administrador único. A senha é definida no primeiro acesso
// (setup inicial) e guardada como hash scrypt em <DATA_DIR>/auth.json.
// Sessões usam cookie assinado com HMAC (sem estado no servidor).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

const COOKIE = 'glimpse_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 32;

export const AUTH_FILE = 'auth.json';
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 256;

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Valida a nova senha e a confirmação. Lança AuthError(400) com mensagem amigável.
export function validateNewPassword(password, confirm) {
  if (typeof password !== 'string' || typeof confirm !== 'string') {
    throw new AuthError(400, 'Informe a senha e a confirmação.');
  }
  if (password.length < MIN_PASSWORD) {
    throw new AuthError(400, `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  }
  if (password.length > MAX_PASSWORD) {
    throw new AuthError(400, `A senha pode ter no máximo ${MAX_PASSWORD} caracteres.`);
  }
  if (password !== confirm) throw new AuthError(400, 'A confirmação não confere com a senha.');
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [algo, N, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
  });
  return crypto.timingSafeEqual(actual, expected);
}

async function loadOrCreateSecret(dataDir) {
  const file = path.join(dataDir, '.session-secret');
  try {
    const existing = (await fs.readFile(file, 'utf8')).trim();
    if (existing) return existing;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const secret = crypto.randomBytes(32).toString('hex');
  await fs.writeFile(file, secret, { mode: 0o600 });
  return secret;
}

async function readAuthFile(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    return typeof data.passwordHash === 'string' ? data : null;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
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

export async function createAuth({ dataDir, sessionSecret, cookieSecure }) {
  await fs.mkdir(dataDir, { recursive: true });
  const authFile = path.join(dataDir, AUTH_FILE);
  const secret = sessionSecret || (await loadOrCreateSecret(dataDir));
  const attempts = new Map();

  let passwordHash = null;
  let key = null;

  // A chave das sessões deriva do hash da senha: trocar a senha invalida todas as sessões.
  function setHash(hash) {
    passwordHash = hash;
    key = hash ? crypto.createHmac('sha256', secret).update(hash).digest() : null;
  }
  setHash((await readAuthFile(authFile))?.passwordHash ?? null);

  const sign = (payload) => crypto.createHmac('sha256', key).update(payload).digest('base64url');

  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: cookieSecure, path: '/' };

  async function writeAuthFile(hash, flag) {
    const data = JSON.stringify({ passwordHash: hash, updatedAt: new Date().toISOString() }, null, 2);
    if (flag === 'wx') {
      await fs.writeFile(authFile, data, { mode: 0o600, flag: 'wx' });
      return;
    }
    const tmp = `${authFile}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, data, { mode: 0o600 });
    await fs.rename(tmp, authFile);
  }

  return {
    isConfigured: () => passwordHash !== null,

    isAuthenticated(req) {
      if (!key) return false;
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

    checkPassword: (password) => (passwordHash ? verifyPassword(password, passwordHash) : false),

    // Setup inicial: só funciona enquanto não existe senha.
    async setup(password, confirm) {
      if (passwordHash) throw new AuthError(409, 'O Glimpse já foi configurado.');
      validateNewPassword(password, confirm);
      const hash = await hashPassword(password);
      try {
        await writeAuthFile(hash, 'wx'); // falha se outra requisição configurou antes
      } catch (err) {
        if (err.code === 'EEXIST') throw new AuthError(409, 'O Glimpse já foi configurado.');
        throw err;
      }
      setHash(hash);
    },

    async changePassword(current, password, confirm) {
      if (!(await verifyPassword(current, passwordHash))) {
        throw new AuthError(401, 'A senha atual está incorreta.');
      }
      validateNewPassword(password, confirm);
      if (password === current) throw new AuthError(400, 'A nova senha precisa ser diferente da atual.');
      const hash = await hashPassword(password);
      await writeAuthFile(hash);
      setHash(hash);
    },

    // Retorna true se o IP ainda pode tentar uma senha.
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
