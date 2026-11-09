import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthError, createAuth } from './auth.js';
import { createStore } from './store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const MAX_TITLE = 200;
const MAX_CONTENT = 1_000_000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseScript(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const content = typeof body?.content === 'string' ? body.content.replace(/\r\n?/g, '\n') : '';
  if (!title) throw new HttpError(400, 'O título é obrigatório.');
  if (title.length > MAX_TITLE) throw new HttpError(400, `O título pode ter até ${MAX_TITLE} caracteres.`);
  if (content.length > MAX_CONTENT) throw new HttpError(413, 'O roteiro é grande demais.');
  return { title, content };
}

function slugify(title) {
  return (
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'roteiro'
  );
}

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: https:",
      "media-src 'self' blob: data:",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  next();
}

export async function createApp({
  dataDir,
  sessionSecret,
  publicRead = false,
  cookieSecure = false,
  trustProxy = false,
}) {
  const store = await createStore(dataDir);
  const auth = await createAuth({ dataDir, sessionSecret, cookieSecure });

  const app = express();
  app.disable('x-powered-by');
  app.locals.configured = auth.isConfigured;
  app.set('trust proxy', trustProxy);
  app.use(securityHeaders);

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  const api = express.Router();
  api.use(express.json({ limit: '2mb' }));

  // Proteção CSRF: requisições que alteram dados precisam de um cabeçalho
  // customizado, que um site de terceiros não consegue enviar sem CORS.
  api.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('x-glimpse') !== '1') {
      return next(new HttpError(403, 'Requisição recusada.'));
    }
    next();
  });

  const requireAdmin = (req, res, next) =>
    auth.isAuthenticated(req) ? next() : next(new HttpError(401, 'Faça login como administrador.'));
  const requireReader = (req, res, next) => (publicRead ? next() : requireAdmin(req, res, next));

  api.get('/session', (req, res) => {
    res.json({
      configured: auth.isConfigured(),
      authenticated: auth.isAuthenticated(req),
      publicRead,
    });
  });

  // Setup inicial: define a senha de administrador no primeiro acesso.
  api.post('/setup', async (req, res) => {
    await auth.setup(req.body?.password, req.body?.confirm);
    auth.startSession(res);
    res.status(201).json({ configured: true, authenticated: true });
  });

  api.post('/login', async (req, res) => {
    if (!auth.isConfigured()) throw new HttpError(409, 'Defina a senha de administrador primeiro.');
    if (!auth.allowAttempt(req.ip)) {
      throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
    }
    if (!(await auth.checkPassword(req.body?.password))) throw new HttpError(401, 'Senha incorreta.');
    auth.clearAttempts(req.ip);
    auth.startSession(res);
    res.json({ authenticated: true });
  });

  // Troca de senha: encerra todas as sessões e abre uma nova para quem trocou.
  api.post('/password', requireAdmin, async (req, res) => {
    if (!auth.allowAttempt(req.ip)) {
      throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
    }
    const { current, password, confirm } = req.body ?? {};
    await auth.changePassword(current, password, confirm);
    auth.clearAttempts(req.ip);
    auth.startSession(res);
    res.json({ authenticated: true });
  });

  api.post('/logout', (req, res) => {
    auth.endSession(res);
    res.json({ authenticated: false });
  });

  api.get('/scripts', requireReader, async (req, res) => {
    res.json(await store.list());
  });

  api.get('/scripts/:id', requireReader, async (req, res) => {
    const doc = await store.get(req.params.id);
    if (!doc) throw new HttpError(404, 'Roteiro não encontrado.');
    res.json(doc);
  });

  api.get('/scripts/:id/download', requireReader, async (req, res) => {
    const doc = await store.get(req.params.id);
    if (!doc) throw new HttpError(404, 'Roteiro não encontrado.');
    const filename = `${slugify(doc.title)}.md`;
    res.set('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.type('text/markdown; charset=utf-8').send(doc.content);
  });

  api.post('/scripts', requireAdmin, async (req, res) => {
    res.status(201).json(await store.create(parseScript(req.body)));
  });

  api.put('/scripts/:id', requireAdmin, async (req, res) => {
    const doc = await store.update(req.params.id, parseScript(req.body));
    if (!doc) throw new HttpError(404, 'Roteiro não encontrado.');
    res.json(doc);
  });

  api.delete('/scripts/:id', requireAdmin, async (req, res) => {
    if (!(await store.remove(req.params.id))) throw new HttpError(404, 'Roteiro não encontrado.');
    res.status(204).end();
  });

  api.use((req, res, next) => next(new HttpError(404, 'Rota não encontrada.')));

  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    const message =
      err instanceof HttpError || err instanceof AuthError ? err.message
      : status === 413 ? 'O roteiro é grande demais.'
      : status === 400 ? 'Requisição inválida.'
      : 'Erro interno do servidor.';
    res.status(status).json({ error: message });
  });

  app.use('/api', api);

  // Bibliotecas do navegador servidas direto do node_modules (funciona offline/LAN).
  app.use('/vendor/marked', express.static(path.join(ROOT, 'node_modules/marked/lib')));
  app.use('/vendor/dompurify', express.static(path.join(ROOT, 'node_modules/dompurify/dist')));

  app.get('/read/:id', (req, res) => res.sendFile(path.join(PUBLIC, 'read.html')));
  app.use(express.static(PUBLIC, { extensions: ['html'] }));

  return app;
}
