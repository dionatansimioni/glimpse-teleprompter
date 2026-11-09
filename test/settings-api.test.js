import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer } from './helpers.js';
import { DEFAULT_SETTINGS } from '../public/js/settings.js';
import { defaultBindings, findAction } from '../public/js/keys.js';

const json = async (res) => ({ status: res.status, body: res.status === 204 ? null : await res.json() });

describe('Configuração geral do teleprompter', () => {
  test('servidor novo devolve os padrões e saved=false', async () => {
    const srv = await startServer();
    try {
      await srv.login();
      const { status, body } = await json(await srv.request('/api/settings'));
      assert.equal(status, 200);
      assert.deepEqual(body.settings, DEFAULT_SETTINGS);
      assert.deepEqual(body.bindings, defaultBindings());
      assert.equal(body.saved, false);
    } finally {
      await srv.close();
    }
  });

  test('ler exige login (exceto em PUBLIC_READ) e gravar exige administrador', async () => {
    const srv = await startServer();
    try {
      assert.equal((await srv.request('/api/settings')).status, 401);
      assert.equal((await srv.request('/api/settings', { method: 'PUT', body: { settings: { speed: 9 } } })).status, 401);
    } finally {
      await srv.close();
    }
    const pub = await startServer({ publicRead: true });
    try {
      assert.equal((await pub.request('/api/settings')).status, 200);
      assert.equal((await pub.request('/api/settings', { method: 'PUT', body: { settings: { speed: 9 } } })).status, 401);
    } finally {
      await pub.close();
    }
  });

  test('grava, mescla com o que já existe e valida', async () => {
    const srv = await startServer();
    try {
      await srv.login();
      let { body } = await json(await srv.request('/api/settings', {
        method: 'PUT', body: { settings: { fontSize: 90, speed: 999, theme: 'neon', hacker: 1 } },
      }));
      assert.equal(body.saved, true);
      assert.equal(body.settings.fontSize, 90);
      assert.equal(body.settings.speed, 60, 'limitado à faixa');
      assert.equal(body.settings.theme, DEFAULT_SETTINGS.theme, 'valor inválido ignorado');
      assert.equal('hacker' in body.settings, false);

      ({ body } = await json(await srv.request('/api/settings', { method: 'PUT', body: { settings: { mirrorX: true } } })));
      assert.equal(body.settings.fontSize, 90, 'mantém o que não foi enviado');
      assert.equal(body.settings.mirrorX, true);
    } finally {
      await srv.close();
    }
  });

  test('atalhos são gravados junto, sem apagar as configurações', async () => {
    const srv = await startServer();
    try {
      await srv.login();
      await srv.request('/api/settings', { method: 'PUT', body: { settings: { fontSize: 70 } } });
      const bindings = { ...defaultBindings(), togglePlay: ['pad:b3'] };
      const { body } = await json(await srv.request('/api/settings', { method: 'PUT', body: { bindings } }));
      assert.equal(findAction(body.bindings, 'pad:b3'), 'togglePlay');
      assert.equal(findAction(body.bindings, 'Space'), null);
      assert.equal(body.settings.fontSize, 70);
    } finally {
      await srv.close();
    }
  });

  test('rejeita corpo inválido', async () => {
    const srv = await startServer();
    try {
      await srv.login();
      for (const payload of [{}, { settings: [1] }, { settings: 'x' }, { bindings: 3 }]) {
        assert.equal((await srv.request('/api/settings', { method: 'PUT', body: payload })).status, 400, JSON.stringify(payload));
      }
    } finally {
      await srv.close();
    }
  });

  test('persiste em disco e sobrevive a reinício do servidor', async () => {
    const a = await startServer();
    await a.login();
    await a.request('/api/settings', { method: 'PUT', body: { settings: { fontSize: 120 } } });
    const cookie = a.getCookie();
    await a.close({ keepData: true });
    const raw = JSON.parse(await fs.readFile(path.join(a.dataDir, 'settings.json'), 'utf8'));
    assert.equal(raw.settings.fontSize, 120);

    const b = await startServer({ dataDir: a.dataDir, configure: false });
    try {
      const { body } = await json(await b.request('/api/settings', { auth: false, headers: { cookie } }));
      assert.equal(body.settings.fontSize, 120);
      assert.equal(body.saved, true);
    } finally {
      await b.close();
    }
  });

  test('gravações simultâneas não se perdem', async () => {
    const srv = await startServer();
    try {
      await srv.login();
      await Promise.all([
        srv.request('/api/settings', { method: 'PUT', body: { settings: { fontSize: 100 } } }),
        srv.request('/api/settings', { method: 'PUT', body: { settings: { speed: 33 } } }),
        srv.request('/api/settings', { method: 'PUT', body: { settings: { mirrorY: true } } }),
      ]);
      const { body } = await json(await srv.request('/api/settings'));
      assert.equal(body.settings.fontSize, 100);
      assert.equal(body.settings.speed, 33);
      assert.equal(body.settings.mirrorY, true);
    } finally {
      await srv.close();
    }
  });
});

describe('Ajustes próprios de um roteiro', () => {
  async function withScript(fn) {
    const srv = await startServer();
    try {
      await srv.login();
      const { body: doc } = await json(await srv.request('/api/scripts', { method: 'POST', body: { title: 'A', content: 'x' } }));
      await fn(srv, doc);
    } finally {
      await srv.close();
    }
  }
  const putOverrides = (srv, id, settings) =>
    srv.request(`/api/scripts/${id}/settings`, { method: 'PUT', body: { settings } });

  test('roteiro novo não tem ajustes', () => withScript(async (srv, doc) => {
    assert.deepEqual(doc.settings ?? {}, {});
    const { body } = await json(await srv.request(`/api/scripts/${doc.id}`));
    assert.deepEqual(body.settings, {});
    const list = await (await srv.request('/api/scripts')).json();
    assert.equal(list[0].customized, false);
  }));

  test('grava só chaves válidas, sem as que são só gerais', () => withScript(async (srv, doc) => {
    const { status, body } = await json(await putOverrides(srv, doc.id, { speed: 25, fontSize: 'x', keepAwake: false, foo: 1 }));
    assert.equal(status, 200);
    assert.deepEqual(body.settings, { speed: 25 });
    const got = await (await srv.request(`/api/scripts/${doc.id}`)).json();
    assert.deepEqual(got.settings, { speed: 25 });
    const list = await (await srv.request('/api/scripts')).json();
    assert.equal(list[0].customized, true, 'lista indica ajustes próprios');
  }));

  test('substitui os ajustes e {} remove todos', () => withScript(async (srv, doc) => {
    await putOverrides(srv, doc.id, { speed: 25, mirrorX: true });
    let { body } = await json(await putOverrides(srv, doc.id, { fontSize: 50 }));
    assert.deepEqual(body.settings, { fontSize: 50 });
    ({ body } = await json(await putOverrides(srv, doc.id, {})));
    assert.deepEqual(body.settings, {});
  }));

  test('ajustar a leitura não altera a data de edição do roteiro', () => withScript(async (srv, doc) => {
    await putOverrides(srv, doc.id, { speed: 25 });
    const got = await (await srv.request(`/api/scripts/${doc.id}`)).json();
    assert.equal(got.updatedAt, doc.updatedAt);
  }));

  test('editar o texto mantém os ajustes', () => withScript(async (srv, doc) => {
    await putOverrides(srv, doc.id, { speed: 25 });
    await srv.request(`/api/scripts/${doc.id}`, { method: 'PUT', body: { title: 'B', content: 'novo' } });
    const got = await (await srv.request(`/api/scripts/${doc.id}`)).json();
    assert.deepEqual(got.settings, { speed: 25 });
  }));

  test('exige administrador, corpo válido e roteiro existente', () => withScript(async (srv, doc) => {
    assert.equal((await srv.request(`/api/scripts/${doc.id}/settings`, { method: 'PUT', body: {} })).status, 400);
    assert.equal((await putOverrides(srv, 'naoexiste123', { speed: 2 })).status, 404);
    srv.clearCookie();
    assert.equal((await putOverrides(srv, doc.id, { speed: 2 })).status, 401);
  }));
});
