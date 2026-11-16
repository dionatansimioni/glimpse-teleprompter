import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteHub, deviceLabel, sanitizeState, REMOTE_ACTIONS, REMOTE_NAVIGATION } from '../src/remote.js';
import { ACTION_IDS } from '../public/js/keys.js';
import { startServer } from './helpers.js';
import { newDeviceId } from '../public/js/device-id.js';
import { isDeviceId } from '../src/remote.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// Resposta falsa: guarda o que foi escrito como eventos.
function fakeRes() {
  const res = {
    ended: false,
    chunks: [],
    write(chunk) { res.chunks.push(chunk); },
    end() { res.ended = true; },
    events(name) {
      return res.chunks
        .map((c) => c.match(/^event: (.*)\ndata: (.*)\n\n$/))
        .filter((m) => m && m[1] === name)
        .map((m) => JSON.parse(m[2]));
    },
  };
  return res;
}

describe('Hub do controle remoto', () => {
  test('nome do aparelho a partir do User-Agent', () => {
    assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36'), 'Android · Chrome');
    assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
    assert.equal(deviceLabel('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'), 'Linux · Firefox');
    assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0'), 'Windows · Edge');
    assert.equal(deviceLabel(''), '');
  });

  test('estado é validado', () => {
    assert.deepEqual(sanitizeState({ playing: 1, speed: '12', fontSize: 64, progress: 7, extra: 'x' }),
      { playing: true, speed: 12, fontSize: 64, progress: 1 });
    assert.deepEqual(sanitizeState(null), { playing: false, speed: 0, fontSize: 0, progress: 0 });
  });

  test('ações remotas são as pedidas e existem no leitor', () => {
    assert.deepEqual([...REMOTE_ACTIONS].sort(),
      ['fontDown', 'fontUp', 'jumpBack', 'jumpForward', 'speedDown', 'speedUp', 'togglePlay']);
    for (const action of REMOTE_ACTIONS) assert.ok(ACTION_IDS.includes(action), action);
  });

  test('leitor recebe id, controles veem a lista e o estado', () => {
    const hub = createRemoteHub();
    try {
      const controller = fakeRes();
      hub.addController(controller);
      assert.deepEqual(controller.events('readers').at(-1), []);

      const reader = fakeRes();
      const id = hub.addReader({ scriptId: 's1', title: 'Roteiro', device: 'Android · Chrome', res: reader });
      assert.equal(reader.events('hello')[0].id, id);
      assert.equal(controller.events('readers').at(-1)[0].title, 'Roteiro');

      assert.equal(hub.updateState(id, { playing: true, speed: 15, fontSize: 60, progress: 0.5 }), true);
      assert.deepEqual(controller.events('readers').at(-1)[0].state, { playing: true, speed: 15, fontSize: 60, progress: 0.5 });
      const sent = controller.chunks.length;
      hub.updateState(id, { playing: true, speed: 15, fontSize: 60, progress: 0.5 });
      assert.equal(controller.chunks.length, sent, 'estado igual não é reenviado');

      assert.equal(hub.command(id, 'togglePlay'), true);
      assert.deepEqual(reader.events('command'), [{ action: 'togglePlay' }]);

      hub.removeReader(id);
      assert.deepEqual(controller.events('readers').at(-1), []);
      assert.equal(hub.command(id, 'togglePlay'), false);
      assert.equal(hub.updateState(id, {}), false);
    } finally {
      hub.close();
    }
  });

  test('aparelho com id fixo: na biblioteca (sem roteiro) e substituído ao trocar de conexão', () => {
    const hub = createRemoteHub();
    try {
      const controller = fakeRes();
      hub.addController(controller);

      const first = fakeRes();
      assert.equal(hub.addReader({ id: 'aparelho-fixo-1', device: 'Android', res: first }), 'aparelho-fixo-1');
      assert.deepEqual(controller.events('readers').at(-1)[0].scriptId, null);
      assert.deepEqual(controller.events('readers').at(-1)[0].title, null);

      // Abriu um roteiro: mesma identidade, conexão nova.
      const second = fakeRes();
      assert.equal(hub.addReader({ id: 'aparelho-fixo-1', scriptId: 's1', title: 'Roteiro', device: 'Android', res: second }), 'aparelho-fixo-1');
      assert.equal(hub.list().length, 1);
      assert.equal(controller.events('readers').at(-1)[0].scriptId, 's1');
      assert.equal(first.events('replaced').length, 1, 'a conexão antiga é avisada');
      assert.equal(first.ended, true);

      // A conexão antiga fechando não derruba a nova.
      hub.removeReader('aparelho-fixo-1', first);
      assert.equal(hub.list().length, 1);
      hub.removeReader('aparelho-fixo-1', second);
      assert.equal(hub.list().length, 0);

      // Id inválido vira um id gerado pelo servidor.
      const id = hub.addReader({ id: 'x', device: '', res: fakeRes() });
      assert.notEqual(id, 'x');
    } finally {
      hub.close();
    }
  });

  test('comando de navegação leva o roteiro', () => {
    const hub = createRemoteHub();
    try {
      const reader = fakeRes();
      const id = hub.addReader({ device: '', res: reader });
      assert.equal(hub.command(id, 'openScript', { scriptId: 's2' }), true);
      assert.equal(hub.command(id, 'openLibrary'), true);
      assert.deepEqual(reader.events('command'), [{ action: 'openScript', scriptId: 's2' }, { action: 'openLibrary' }]);
      assert.deepEqual([...REMOTE_NAVIGATION], ['openScript', 'openLibrary', 'reload']);
      assert.equal(hub.command(id, 'reload'), true);
      assert.deepEqual(reader.events('command').at(-1), { action: 'reload' });
    } finally {
      hub.close();
    }
  });

  test('limite de leitores e close encerra tudo', () => {
    const hub = createRemoteHub({ maxReaders: 1, maxControllers: 1 });
    const a = fakeRes();
    const c = fakeRes();
    assert.ok(hub.addReader({ scriptId: 'a', title: 'A', device: '', res: a }));
    assert.equal(hub.addReader({ scriptId: 'b', title: 'B', device: '', res: fakeRes() }), null);
    assert.equal(hub.addController(c), true);
    assert.equal(hub.addController(fakeRes()), false);
    hub.close();
    assert.equal(a.ended, true);
    assert.equal(c.ended, true);
    assert.deepEqual(hub.list(), []);
  });
});

describe('Identificador do aparelho', () => {
  test('é gerado sem crypto.randomUUID (HTTP pelo IP não é contexto seguro) e o servidor aceita', () => {
    // Só getRandomValues, como num navegador fora de HTTPS/localhost.
    const insecure = { getRandomValues: (bytes) => { bytes.fill(171); return bytes; } };
    assert.equal(insecure.randomUUID, undefined);
    const id = newDeviceId(insecure);
    assert.equal(id.length, 22);
    assert.ok(isDeviceId(id));
    // Até sem crypto nenhum não pode quebrar.
    assert.ok(isDeviceId(newDeviceId(null)));
    assert.notEqual(newDeviceId(null), newDeviceId(null));
  });

  test('o código do navegador não usa APIs que exigem HTTPS', async () => {
    const dir = path.join(import.meta.dirname, '..', 'public', 'js');
    for (const file of await fs.readdir(dir)) {
      if (!file.endsWith('.js')) continue;
      const source = await fs.readFile(path.join(dir, file), 'utf8');
      assert.doesNotMatch(source, /randomUUID\s*\(/, `${file}: crypto.randomUUID só existe em contexto seguro`);
    }
  });
});

describe('API do controle remoto', () => {
  async function setup() {
    const srv = await startServer();
    await srv.login();
    const doc = await (await srv.request('/api/scripts', { method: 'POST', body: { title: 'Ao vivo', content: '# A\nTexto' } })).json();
    return { srv, doc };
  }

  test('exige login de administrador', async () => {
    const { srv, doc } = await setup();
    try {
      srv.clearCookie();
      assert.equal((await srv.request(`/api/remote/reader?script=${doc.id}`)).status, 401);
      assert.equal((await srv.request('/api/remote/controller')).status, 401);
      assert.equal((await srv.request('/api/remote/readers/x/commands', { method: 'POST', body: { action: 'togglePlay' } })).status, 401);
    } finally {
      await srv.close();
    }
  });

  test('roteiro inexistente não registra leitor', async () => {
    const { srv } = await setup();
    try {
      assert.equal((await srv.request('/api/remote/reader?script=naoexiste123')).status, 404);
    } finally {
      await srv.close();
    }
  });

  test('fluxo completo: leitor aparece, recebe comandos, informa estado e some ao fechar', async () => {
    const { srv, doc } = await setup();
    const ua = { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/141.0 Mobile Safari/537.36' };
    try {
      const controller = await srv.stream('/api/remote/controller');
      assert.equal(controller.status, 200);
      assert.deepEqual(await controller.next('readers'), []);

      const reader = await srv.stream(`/api/remote/reader?script=${doc.id}`, { headers: ua });
      const { id } = await reader.next('hello');
      const list = await controller.next('readers');
      assert.equal(list.length, 1);
      assert.equal(list[0].id, id);
      assert.equal(list[0].title, 'Ao vivo');
      assert.equal(list[0].device, 'Android · Chrome');

      let res = await srv.request(`/api/remote/readers/${id}/state`, {
        method: 'POST', body: { state: { playing: true, speed: 20, fontSize: 64, progress: 0.25 } },
      });
      assert.equal(res.status, 204);
      assert.deepEqual((await controller.next('readers'))[0].state, { playing: true, speed: 20, fontSize: 64, progress: 0.25 });

      for (const action of ['togglePlay', 'speedUp', 'fontDown', 'jumpForward']) {
        res = await srv.request(`/api/remote/readers/${id}/commands`, { method: 'POST', body: { action } });
        assert.equal(res.status, 204, action);
        assert.deepEqual(await reader.next('command'), { action });
      }

      res = await srv.request(`/api/remote/readers/${id}/commands`, { method: 'POST', body: { action: 'deleteAll' } });
      assert.equal(res.status, 400);
      res = await srv.request(`/api/remote/readers/${id}/commands`, { method: 'POST', body: { action: 'mirrorX' } });
      assert.equal(res.status, 400, 'só as ações do controle remoto');

      reader.close();
      assert.deepEqual(await controller.next('readers'), [], 'leitor fechado some da lista');
      res = await srv.request(`/api/remote/readers/${id}/commands`, { method: 'POST', body: { action: 'togglePlay' } });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /não está mais aberto/);
      controller.close();
    } finally {
      await srv.close();
    }
  });

  test('aparelho na biblioteca aparece, troca de roteiro e mantém a identidade', async () => {
    const { srv, doc } = await setup();
    const other = await (await srv.request('/api/scripts', { method: 'POST', body: { title: 'Outro', content: 'Texto' } })).json();
    const device = 'aparelho-do-teste-01';
    try {
      const controller = await srv.stream('/api/remote/controller');
      await controller.next('readers');

      const library = await srv.stream(`/api/remote/reader?device=${device}`);
      assert.equal((await library.next('hello')).id, device);
      let list = await controller.next('readers');
      assert.equal(list[0].id, device);
      assert.equal(list[0].scriptId, null);

      let res = await srv.request(`/api/remote/readers/${device}/commands`, { method: 'POST', body: { action: 'openScript', scriptId: doc.id } });
      assert.equal(res.status, 204);
      assert.deepEqual(await library.next('command'), { action: 'openScript', scriptId: doc.id });

      // O aparelho abriu o roteiro: mesma identidade, agora com título.
      const reader = await srv.stream(`/api/remote/reader?device=${device}&script=${doc.id}`);
      await reader.next('hello');
      list = await controller.next('readers');
      assert.equal(list.length, 1);
      assert.equal(list[0].id, device);
      assert.equal(list[0].title, 'Ao vivo');

      res = await srv.request(`/api/remote/readers/${device}/commands`, { method: 'POST', body: { action: 'openScript', scriptId: other.id } });
      assert.equal(res.status, 204);
      assert.deepEqual(await reader.next('command'), { action: 'openScript', scriptId: other.id });
      res = await srv.request(`/api/remote/readers/${device}/commands`, { method: 'POST', body: { action: 'openLibrary' } });
      assert.equal(res.status, 204);
      assert.deepEqual(await reader.next('command'), { action: 'openLibrary' });

      reader.close();
      library.close();
      controller.close();
    } finally {
      await srv.close();
    }
  });

  test('abrir roteiro exige um roteiro que exista', async () => {
    const { srv } = await setup();
    try {
      const reader = await srv.stream('/api/remote/reader?device=aparelho-do-teste-02');
      await reader.next('hello');
      let res = await srv.request('/api/remote/readers/aparelho-do-teste-02/commands', { method: 'POST', body: { action: 'openScript', scriptId: 'naoexiste123' } });
      assert.equal(res.status, 404);
      res = await srv.request('/api/remote/readers/aparelho-do-teste-02/commands', { method: 'POST', body: { action: 'openScript' } });
      assert.equal(res.status, 404);
      reader.close();
    } finally {
      await srv.close();
    }
  });

  test('comandos exigem o cabeçalho anti-CSRF', async () => {
    const { srv, doc } = await setup();
    try {
      const reader = await srv.stream(`/api/remote/reader?script=${doc.id}`);
      const { id } = await reader.next('hello');
      const res = await srv.request(`/api/remote/readers/${id}/commands`, { method: 'POST', body: { action: 'togglePlay' }, csrf: false });
      assert.equal(res.status, 403);
      reader.close();
    } finally {
      await srv.close();
    }
  });
});
