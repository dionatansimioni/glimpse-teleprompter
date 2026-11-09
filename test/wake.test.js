import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreenWake, wakeStatusText, WAKE_MODES } from '../public/js/wake.js';

// Wake Lock API falsa.
function fakeWakeLock({ fail = false } = {}) {
  const api = {
    requests: 0,
    sentinels: [],
    async request(type) {
      assert.equal(type, 'screen');
      api.requests += 1;
      if (fail) throw new Error('NotAllowedError');
      const listeners = [];
      const sentinel = {
        released: false,
        addEventListener: (ev, fn) => ev === 'release' && listeners.push(fn),
        async release() {
          sentinel.released = true;
          listeners.forEach((fn) => fn());
        },
      };
      api.sentinels.push(sentinel);
      return sentinel;
    },
  };
  return api;
}

// Vídeo falso: play() pode exigir "gesto do usuário".
function fakeVideoFactory({ needsGesture = false } = {}) {
  const state = { created: 0, gesture: !needsGesture, video: null };
  state.create = () => {
    state.created += 1;
    state.video = {
      paused: true,
      plays: 0,
      async play() {
        this.plays += 1;
        if (!state.gesture) throw new Error('NotAllowedError');
        this.paused = false;
      },
      pause() { this.paused = true; },
    };
    return state.video;
  };
  return state;
}

const visibleDoc = () => ({ visibilityState: 'visible' });

test('com HTTPS usa a Wake Lock API e não cria vídeo', async () => {
  const wakeLock = fakeWakeLock();
  const videos = fakeVideoFactory();
  const wake = createScreenWake({ nav: { wakeLock }, doc: visibleDoc(), secure: true, createVideo: videos.create });
  assert.equal(await wake.enable(), WAKE_MODES.WAKE_LOCK);
  assert.equal(wakeLock.requests, 1);
  assert.equal(videos.created, 0);
});

test('sem HTTPS (contexto inseguro) usa o vídeo de compatibilidade', async () => {
  const wakeLock = fakeWakeLock();
  const videos = fakeVideoFactory();
  const wake = createScreenWake({ nav: { wakeLock }, doc: visibleDoc(), secure: false, createVideo: videos.create });
  assert.equal(await wake.enable(), WAKE_MODES.VIDEO);
  assert.equal(wakeLock.requests, 0, 'nem tenta a API fora de contexto seguro');
  assert.equal(videos.video.paused, false);
});

test('navegador sem Wake Lock API usa o vídeo', async () => {
  const videos = fakeVideoFactory();
  const wake = createScreenWake({ nav: {}, doc: visibleDoc(), secure: true, createVideo: videos.create });
  assert.equal(await wake.enable(), WAKE_MODES.VIDEO);
});

test('se a API recusar o pedido, cai para o vídeo', async () => {
  const videos = fakeVideoFactory();
  const wake = createScreenWake({
    nav: { wakeLock: fakeWakeLock({ fail: true }) }, doc: visibleDoc(), secure: true, createVideo: videos.create,
  });
  assert.equal(await wake.enable(), WAKE_MODES.VIDEO);
});

test('vídeo bloqueado até um gesto do usuário; refresh ativa depois do gesto', async () => {
  const videos = fakeVideoFactory({ needsGesture: true });
  const changes = [];
  const wake = createScreenWake({
    nav: {}, doc: visibleDoc(), secure: false, createVideo: videos.create, onChange: (m) => changes.push(m),
  });
  assert.equal(await wake.enable(), WAKE_MODES.BLOCKED);
  videos.gesture = true; // usuário tocou na tela
  assert.equal(await wake.refresh(), WAKE_MODES.VIDEO);
  assert.deepEqual(changes, [WAKE_MODES.BLOCKED, WAKE_MODES.VIDEO]);
  assert.equal(videos.created, 1, 'reaproveita o mesmo vídeo');
});

test('quando o navegador libera o wake lock (aba escondida), refresh pede de novo', async () => {
  const wakeLock = fakeWakeLock();
  const wake = createScreenWake({ nav: { wakeLock }, doc: visibleDoc(), secure: true });
  await wake.enable();
  await wakeLock.sentinels[0].release(); // navegador liberou
  assert.equal(wake.mode, WAKE_MODES.OFF);
  assert.equal(await wake.refresh(), WAKE_MODES.WAKE_LOCK);
  assert.equal(wakeLock.requests, 2);
});

test('vídeo pausado pelo navegador volta a tocar no refresh', async () => {
  const videos = fakeVideoFactory();
  const wake = createScreenWake({ nav: {}, doc: visibleDoc(), secure: false, createVideo: videos.create });
  await wake.enable();
  videos.video.pause(); // ex.: aba foi para segundo plano
  await wake.refresh();
  assert.equal(videos.video.paused, false);
  assert.equal(videos.video.plays, 2);
});

test('refresh não faz nada quando já está ativo', async () => {
  const wakeLock = fakeWakeLock();
  const wake = createScreenWake({ nav: { wakeLock }, doc: visibleDoc(), secure: true });
  await wake.enable();
  await wake.refresh();
  await wake.refresh();
  assert.equal(wakeLock.requests, 1);
});

test('pedidos simultâneos geram uma única requisição', async () => {
  const wakeLock = fakeWakeLock();
  const wake = createScreenWake({ nav: { wakeLock }, doc: visibleDoc(), secure: true });
  await Promise.all([wake.enable(), wake.refresh(), wake.refresh()]);
  assert.equal(wakeLock.requests, 1);
});

test('com a página escondida não pede; pede ao voltar', async () => {
  const doc = { visibilityState: 'hidden' };
  const wakeLock = fakeWakeLock();
  const wake = createScreenWake({ nav: { wakeLock }, doc, secure: true });
  assert.equal(await wake.enable(), WAKE_MODES.OFF);
  doc.visibilityState = 'visible';
  assert.equal(await wake.refresh(), WAKE_MODES.WAKE_LOCK);
});

test('disable libera o wake lock e pausa o vídeo; refresh não reativa', async () => {
  const wakeLock = fakeWakeLock();
  const a = createScreenWake({ nav: { wakeLock }, doc: visibleDoc(), secure: true });
  await a.enable();
  await a.disable();
  assert.equal(wakeLock.sentinels[0].released, true);
  assert.equal(a.mode, WAKE_MODES.OFF);
  assert.equal(await a.refresh(), WAKE_MODES.OFF);
  assert.equal(wakeLock.requests, 1);

  const videos = fakeVideoFactory();
  const b = createScreenWake({ nav: {}, doc: visibleDoc(), secure: false, createVideo: videos.create });
  await b.enable();
  await b.disable();
  assert.equal(videos.video.paused, true);
});

test('textos de status', () => {
  assert.match(wakeStatusText(WAKE_MODES.WAKE_LOCK, true), /^Ativo\.$/);
  assert.match(wakeStatusText(WAKE_MODES.VIDEO, true), /compatibilidade/);
  assert.match(wakeStatusText(WAKE_MODES.BLOCKED, true), /toque/i);
  assert.match(wakeStatusText(WAKE_MODES.WAKE_LOCK, false), /Desativado/);
});
