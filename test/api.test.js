import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer } from './helpers.js';

describe('API de roteiros', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(() => srv.close());

  test('healthcheck responde', async () => {
    const res = await srv.request('/healthz');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test('sem login, listar roteiros retorna 401', async () => {
    const res = await srv.request('/api/scripts');
    assert.equal(res.status, 401);
  });

  test('sessão informa que não está autenticado', async () => {
    const res = await srv.request('/api/session');
    assert.deepEqual(await res.json(), { authenticated: false, publicRead: false });
  });

  test('senha errada é recusada', async () => {
    const res = await srv.login('errada');
    assert.equal(res.status, 401);
  });

  test('login sem o cabeçalho anti-CSRF é recusado', async () => {
    const res = await srv.request('/api/login', { method: 'POST', body: { password: 'x' }, csrf: false });
    assert.equal(res.status, 403);
  });

  test('login correto cria cookie de sessão HttpOnly', async () => {
    const res = await srv.login();
    assert.equal(res.status, 200);
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /glimpse_session=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    const session = await (await srv.request('/api/session')).json();
    assert.equal(session.authenticated, true);
  });

  test('CRUD completo de um roteiro', async () => {
    await srv.login();

    let res = await srv.request('/api/scripts', {
      method: 'POST',
      body: { title: '  Vídeo sobre Linux  ', content: '# Abertura\r\nOlá, pessoal!' },
    });
    assert.equal(res.status, 201);
    const created = await res.json();
    assert.equal(created.title, 'Vídeo sobre Linux');
    assert.equal(created.content, '# Abertura\nOlá, pessoal!', 'normaliza quebras de linha');
    assert.ok(created.id);

    res = await srv.request('/api/scripts');
    const list = await res.json();
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'Vídeo sobre Linux');
    assert.equal(list[0].words, 3);
    assert.equal(list[0].content, undefined, 'a lista não traz o conteúdo inteiro');

    res = await srv.request(`/api/scripts/${created.id}`, {
      method: 'PUT',
      body: { title: 'Novo título', content: 'Texto novo' },
    });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.title, 'Novo título');
    assert.equal(updated.createdAt, created.createdAt);

    res = await srv.request(`/api/scripts/${created.id}`);
    assert.equal((await res.json()).content, 'Texto novo');

    res = await srv.request(`/api/scripts/${created.id}/download`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /novo-titulo\.md/);
    assert.equal(await res.text(), 'Texto novo');

    res = await srv.request(`/api/scripts/${created.id}`, { method: 'DELETE' });
    assert.equal(res.status, 204);
    res = await srv.request(`/api/scripts/${created.id}`);
    assert.equal(res.status, 404);
  });

  test('título é obrigatório e limitado', async () => {
    await srv.login();
    let res = await srv.request('/api/scripts', { method: 'POST', body: { title: '   ', content: 'x' } });
    assert.equal(res.status, 400);
    res = await srv.request('/api/scripts', { method: 'POST', body: { title: 'a'.repeat(201), content: 'x' } });
    assert.equal(res.status, 400);
  });

  test('IDs inválidos não escapam do diretório de dados', async () => {
    await srv.login();
    for (const id of ['..%2F..%2Fetc%2Fpasswd', '..', 'abc']) {
      const res = await srv.request(`/api/scripts/${id}`);
      assert.equal(res.status, 404, id);
    }
  });

  test('roteiros ficam salvos em disco como JSON', async () => {
    await srv.login();
    const res = await srv.request('/api/scripts', { method: 'POST', body: { title: 'Persistente', content: 'abc' } });
    const { id } = await res.json();
    const raw = JSON.parse(await fs.readFile(path.join(srv.dataDir, 'scripts', `${id}.json`), 'utf8'));
    assert.equal(raw.title, 'Persistente');
  });

  test('logout encerra a sessão', async () => {
    await srv.login();
    await srv.request('/api/logout', { method: 'POST' });
    const res = await srv.request('/api/scripts');
    assert.equal(res.status, 401);
  });

  test('cookie adulterado é recusado', async () => {
    const res = await srv.request('/api/scripts', {
      auth: false,
      headers: { cookie: 'glimpse_session=v1.99999999999999.abc.assinaturafalsa' },
    });
    assert.equal(res.status, 401);
  });

  test('rota de API inexistente retorna 404 em JSON', async () => {
    const res = await srv.request('/api/nao-existe');
    assert.equal(res.status, 404);
    assert.ok((await res.json()).error);
  });
});

describe('Limite de tentativas de login', () => {
  test('bloqueia após muitas tentativas erradas', async () => {
    const srv = await startServer();
    try {
      let last;
      for (let i = 0; i < 11; i++) last = await srv.login('errada');
      assert.equal(last.status, 429);
    } finally {
      await srv.close();
    }
  });
});

describe('Modo PUBLIC_READ', () => {
  test('permite ler sem login, mas não editar', async () => {
    const srv = await startServer({ publicRead: true });
    try {
      await srv.login();
      const { id } = await (await srv.request('/api/scripts', {
        method: 'POST', body: { title: 'Público', content: 'oi' },
      })).json();
      srv.clearCookie();

      assert.equal((await srv.request('/api/scripts')).status, 200);
      assert.equal((await srv.request(`/api/scripts/${id}`)).status, 200);
      const res = await srv.request('/api/scripts', { method: 'POST', body: { title: 'x', content: 'y' } });
      assert.equal(res.status, 401);
    } finally {
      await srv.close();
    }
  });
});

describe('Sessões', () => {
  test('trocar a senha invalida sessões antigas', async () => {
    const a = await startServer({ sessionSecret: 'segredo' });
    await a.login();
    const cookie = (await a.request('/api/login', { method: 'POST', body: { password: 'senha-de-teste' } }))
      .headers.get('set-cookie').split(';')[0];
    await a.close();

    const b = await startServer({ sessionSecret: 'segredo', adminPassword: 'outra-senha' });
    try {
      const res = await b.request('/api/scripts', { auth: false, headers: { cookie } });
      assert.equal(res.status, 401);
    } finally {
      await b.close();
    }
  });
});
