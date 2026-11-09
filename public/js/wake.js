// Mantém a tela acesa durante a leitura.
//
// 1. Wake Lock API: o jeito oficial, mas o navegador só oferece em contexto
//    seguro (HTTPS ou localhost). Acessando pelo IP via HTTP ela não existe.
// 2. Modo de compatibilidade: um vídeo minúsculo, silencioso e em loop. Enquanto
//    um vídeo está tocando, o navegador não deixa a tela apagar. Como o vídeo
//    não é mudo (tem trilha de áudio silenciosa), só pode começar após um gesto
//    do usuário (toque/tecla); até lá o estado fica "blocked".
//
// Sem DOM direto: as dependências são injetadas, o que permite testar no Node.

export const WAKE_MODES = Object.freeze({
  OFF: 'off',
  WAKE_LOCK: 'wakelock',
  VIDEO: 'video',
  BLOCKED: 'blocked',
});

export function createScreenWake({
  nav = globalThis.navigator,
  doc = globalThis.document,
  secure = globalThis.isSecureContext,
  createVideo,
  onChange = () => {},
} = {}) {
  let wanted = false;
  let sentinel = null;
  let video = null;
  let mode = WAKE_MODES.OFF;
  let pending = null;

  const hasApi = () => Boolean(secure && nav?.wakeLock && typeof nav.wakeLock.request === 'function');
  const isActive = () => mode === WAKE_MODES.WAKE_LOCK || mode === WAKE_MODES.VIDEO;

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    onChange(mode);
  }

  async function tryWakeLock() {
    if (!hasApi()) return false;
    if (sentinel && !sentinel.released) return true;
    try {
      const lock = await nav.wakeLock.request('screen');
      sentinel = lock;
      lock.addEventListener?.('release', () => {
        if (sentinel === lock) sentinel = null;
        // O navegador libera ao esconder a página; volta a pedir em refresh().
        if (mode === WAKE_MODES.WAKE_LOCK) setMode(WAKE_MODES.OFF);
      });
      return true;
    } catch {
      return false; // negado (ex.: economia de bateria): cai para o vídeo
    }
  }

  async function tryVideo() {
    if (!createVideo) return false;
    video ??= createVideo();
    if (!video.paused) return true;
    try {
      await video.play();
      return true;
    } catch {
      return false; // precisa de gesto do usuário
    }
  }

  async function acquire() {
    if (!wanted || doc?.visibilityState === 'hidden') return mode;
    if (await tryWakeLock()) {
      if (video && !video.paused) video.pause();
      setMode(WAKE_MODES.WAKE_LOCK);
    } else if (await tryVideo()) {
      setMode(WAKE_MODES.VIDEO);
    } else {
      setMode(WAKE_MODES.BLOCKED);
    }
    return mode;
  }

  // Evita pedidos simultâneos (ex.: toque e tecla ao mesmo tempo).
  function serialized() {
    pending ??= acquire().finally(() => { pending = null; });
    return pending;
  }

  return {
    get mode() {
      return mode;
    },
    get usesApi() {
      return hasApi();
    },
    enable() {
      wanted = true;
      return serialized();
    },
    async disable() {
      wanted = false;
      const lock = sentinel;
      sentinel = null;
      try {
        await lock?.release?.();
      } catch {
        /* já liberado */
      }
      video?.pause();
      setMode(WAKE_MODES.OFF);
    },
    // Chamar em gestos do usuário e quando a página volta a ficar visível.
    refresh() {
      if (!wanted || (isActive() && (mode !== WAKE_MODES.VIDEO || !video?.paused))) {
        return Promise.resolve(mode);
      }
      return serialized();
    },
  };
}

export function wakeStatusText(mode, enabled) {
  if (!enabled) return 'Desativado: a tela pode apagar sozinha.';
  switch (mode) {
    case WAKE_MODES.WAKE_LOCK: return 'Ativo.';
    case WAKE_MODES.VIDEO: return 'Ativo (modo de compatibilidade, usado sem HTTPS).';
    case WAKE_MODES.BLOCKED: return 'Aguardando: toque na tela ou pressione reproduzir para ativar.';
    default: return 'Inativo no momento; será reativado ao voltar para a página.';
  }
}
