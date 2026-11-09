import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

export const PASSWORD = 'senha-de-teste';

// Sobe o app numa porta aleatória com um diretório de dados temporário.
// Por padrão já faz o setup inicial com PASSWORD (configure: false para pular).
export async function startServer({ configure = true, dataDir, ...options } = {}) {
  dataDir ??= await fs.mkdtemp(path.join(os.tmpdir(), 'glimpse-test-'));
  const app = await createApp({ dataDir, ...options });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';

  async function request(urlPath, { method = 'GET', body, headers = {}, auth = true, csrf = true } = {}) {
    const h = { ...headers };
    if (csrf) h['x-glimpse'] = '1';
    if (body !== undefined) h['content-type'] = 'application/json';
    if (auth && cookie) h.cookie = cookie;
    const res = await fetch(base + urlPath, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return res;
  }

  const srv = {
    base,
    dataDir,
    request,
    login: (password = PASSWORD) => request('/api/login', { method: 'POST', body: { password } }),
    setup: (password = PASSWORD, confirm = password) =>
      request('/api/setup', { method: 'POST', body: { password, confirm } }),
    getCookie: () => cookie,
    // Abre um fluxo SSE e devolve um leitor de eventos ({ next(event), close() }).
    async stream(urlPath, { headers = {} } = {}) {
      const controller = new AbortController();
      const res = await fetch(base + urlPath, { headers: { cookie, ...headers }, signal: controller.signal });
      return sseReader(res, controller);
    },
    clearCookie: () => { cookie = ''; },
    // Para o servidor; keepData mantém o diretório para reabrir com startServer({ dataDir }).
    async close({ keepData = false } = {}) {
      app.locals.closeRemote();
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      if (!keepData) await fs.rm(dataDir, { recursive: true, force: true });
    },
  };

  if (configure) {
    const res = await srv.setup();
    if (res.status !== 201) throw new Error(`setup falhou: ${res.status}`);
    srv.clearCookie();
  }
  return srv;
}

// Lê eventos Server-Sent Events de uma resposta fetch.
function sseReader(res, controller) {
  const queue = [];
  const waiting = [];
  let buffer = '';
  const decoder = new TextDecoder();
  (async () => {
    try {
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let index;
        while ((index = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const event = block.match(/^event: (.*)$/m)?.[1];
          const data = block.match(/^data: (.*)$/m)?.[1];
          if (!event) continue; // comentários (": ping")
          const item = { event, data: data ? JSON.parse(data) : null };
          const w = waiting.findIndex((x) => x.event === item.event);
          if (w !== -1) waiting.splice(w, 1)[0].resolve(item.data);
          else queue.push(item);
        }
      }
    } catch { /* conexão encerrada */ }
  })();
  return {
    status: res.status,
    // Próximo evento com esse nome (os já recebidos ficam na fila).
    next(event, timeoutMs = 2000) {
      const i = queue.findIndex((x) => x.event === event);
      if (i !== -1) return Promise.resolve(queue.splice(i, 1)[0].data);
      return new Promise((resolve, reject) => {
        const entry = { event, resolve };
        waiting.push(entry);
        setTimeout(() => {
          const k = waiting.indexOf(entry);
          if (k !== -1) { waiting.splice(k, 1); reject(new Error(`timeout esperando "${event}"`)); }
        }, timeoutMs);
      });
    },
    close: () => controller.abort(),
  };
}
