import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

export const PASSWORD = 'senha-de-teste';

// Sobe o app numa porta aleatória com um diretório de dados temporário.
export async function startServer(options = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'glimpse-test-'));
  const app = await createApp({ dataDir, adminPassword: PASSWORD, ...options });
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

  return {
    base,
    dataDir,
    request,
    login: (password = PASSWORD) => request('/api/login', { method: 'POST', body: { password } }),
    clearCookie: () => { cookie = ''; },
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await fs.rm(dataDir, { recursive: true, force: true });
    },
  };
}
