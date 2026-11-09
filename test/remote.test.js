import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteHub, deviceLabel, sanitizeState, REMOTE_ACTIONS } from '../src/remote.js';
import { ACTION_IDS } from '../public/js/keys.js';
import { startServer } from './helpers.js';

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
