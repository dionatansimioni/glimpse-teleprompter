// Controle remoto: liga leitores abertos (ex.: celular na câmera) a controles
// (ex.: laptop). Usa Server-Sent Events: o servidor envia eventos por uma
// conexão aberta e os aparelhos respondem com requisições comuns.
//
//   leitor   --GET  /api/remote/reader (SSE)--> recebe "hello" (seu id) e "command"
//   leitor   --POST /api/remote/readers/:id/state--> informa o estado
//   controle --GET  /api/remote/controller (SSE)--> recebe "readers" (lista + estados)
//   controle --POST /api/remote/readers/:id/commands--> envia um comando
import crypto from 'node:crypto';
import { REMOTE_ACTIONS } from '../public/js/keys.js';

export { REMOTE_ACTIONS };

// Nome curto do aparelho a partir do User-Agent, ex.: "Android · Chrome".
export function deviceLabel(ua = '') {
  const os = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : '';
  const browser = /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
    : /Edg(A|iOS)?\//.test(ua) ? 'Edge'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\/|CriOS/.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : '';
  return [os, browser].filter(Boolean).join(' · ');
}

const num = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function sanitizeState(input) {
  const s = input && typeof input === 'object' ? input : {};
  return {
    playing: Boolean(s.playing),
    speed: num(s.speed, 0, 1000, 0),
    fontSize: num(s.fontSize, 0, 1000, 0),
    progress: num(s.progress, 0, 1, 0),
  };
}

export function createRemoteHub({ heartbeatMs = 20_000, maxReaders = 50, maxControllers = 20 } = {}) {
  const readers = new Map();
  const controllers = new Set();

  const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const list = () => [...readers.values()]
    .sort((a, b) => a.since - b.since)
    .map(({ id, scriptId, title, device, state, since }) => ({ id, scriptId, title, device, state, since }));
  const broadcast = () => {
    const data = list();
    for (const res of controllers) send(res, 'readers', data);
  };

  // Comentário periódico mantém a conexão viva através de proxies.
  const timer = setInterval(() => {
    for (const r of readers.values()) r.res.write(': ping\n\n');
    for (const res of controllers) res.write(': ping\n\n');
  }, heartbeatMs);
  timer.unref?.();

  return {
    list,

    addReader({ scriptId, title, device, res }) {
      if (readers.size >= maxReaders) return null;
      const id = crypto.randomBytes(9).toString('base64url');
      readers.set(id, { id, scriptId, title, device, res, since: Date.now(), state: sanitizeState({}) });
      send(res, 'hello', { id });
      broadcast();
      return id;
    },

    removeReader(id) {
      if (readers.delete(id)) broadcast();
    },

    updateState(id, state) {
      const reader = readers.get(id);
      if (!reader) return false;
      const next = sanitizeState(state);
      if (JSON.stringify(next) !== JSON.stringify(reader.state)) {
        reader.state = next;
        broadcast();
      }
      return true;
    },

    // Retorna false se o leitor não existe mais.
    command(id, action) {
      const reader = readers.get(id);
      if (!reader) return false;
      send(reader.res, 'command', { action });
      return true;
    },

    addController(res) {
      if (controllers.size >= maxControllers) return false;
      controllers.add(res);
      send(res, 'readers', list());
      return true;
    },

    removeController(res) {
      controllers.delete(res);
    },

    // Encerra todas as conexões (desligamento do servidor).
    close() {
      clearInterval(timer);
      for (const r of readers.values()) r.res.end();
      for (const res of controllers) res.end();
      readers.clear();
      controllers.clear();
    },
  };
}
