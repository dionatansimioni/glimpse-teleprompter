import { api, goToLogin, renderMarkdown, toast } from './common.js';
import {
  loadSettings, saveSettings, sanitizeSettings, DEFAULT_SETTINGS,
  pixelsPerSecond, formatDuration, clamp,
} from './settings.js';
import {
  ACTIONS, loadBindings, saveBindings, defaultBindings, bindingFromKeyEvent,
  gamepadButtonBinding, gamepadAxisBinding, bindingLabel, findAction,
  assignBinding, removeBinding, isRepeatable, actionLabel,
} from './keys.js';
import { createScreenWake, wakeStatusText } from './wake.js';

const $ = (id) => document.getElementById(id);
const body = document.body;
const stage = $('stage');
const scroller = $('scroller');
const text = $('text');
const guide = $('guide');
const hud = $('hud');
const panel = $('panel');
const progressBar = $('progress-bar');
const timeLeftEl = $('time-left');
const countdownEl = $('countdown');
const flashEl = $('speed-flash');
const captureEl = $('capture');

let settings = loadSettings(localStorage);
let bindings = loadBindings(localStorage);
let scriptTitle = '';

// ---------- Estado da rolagem ----------
let pos = 0;          // deslocamento em px a partir do início do texto
let maxPos = 0;
let guideY = 0;       // posição vertical da guia, em px a partir do topo
let lineHeightPx = 0;
let playing = false;
let dragging = false;
let tween = null;     // animação curta para saltos
let raf = 0;
let lastT = 0;
let sections = [];    // offsets dos títulos/separadores

const dirSign = () => (settings.direction === 'down' ? -1 : 1);
const pps = () => pixelsPerSecond(settings);

function measure() {
  const ratio = maxPos > 0 ? pos / maxPos : 0;
  const height = stage.clientHeight;
  lineHeightPx = settings.fontSize * settings.lineHeight;
  guideY = Math.round(height * settings.guidePos / 100);
  guide.style.top = `${guideY + lineHeightPx / 2}px`;
  guide.style.setProperty('--guide-size', `${Math.min(settings.fontSize, 60)}px`);
  const newMax = Math.max(0, text.offsetHeight - lineHeightPx);
  if (newMax !== maxPos) {
    maxPos = newMax;
    pos = clamp(ratio * maxPos, 0, maxPos);
  }
  sections = [...text.querySelectorAll('h1, h2, h3, h4, hr')].map((el) => el.offsetTop);
  render();
}

let lastTimeText = '';
function render() {
  scroller.style.transform = `translate3d(0, ${guideY - pos}px, 0)`;
  progressBar.style.width = `${maxPos ? (pos / maxPos) * 100 : 0}%`;
  const remaining = dirSign() > 0 ? maxPos - pos : pos;
  const timeText = maxPos ? `−${formatDuration(remaining / pps())}` : '';
  if (timeText !== lastTimeText) timeLeftEl.textContent = lastTimeText = timeText;
}

function tick(t) {
  raf = 0;
  const dt = lastT ? Math.min((t - lastT) / 1000, 0.1) : 0;
  lastT = t;
  if (tween) {
    const k = Math.min(1, (t - tween.start) / tween.duration);
    const eased = 1 - (1 - k) ** 3;
    pos = tween.from + (tween.to - tween.from) * eased;
    if (k >= 1) tween = null;
  } else if (playing && !dragging) {
    pos += dirSign() * pps() * dt;
  }
  pos = clamp(pos, 0, maxPos);
  if (playing && !tween && !dragging && (dirSign() > 0 ? pos >= maxPos : pos <= 0)) pause();
  render();
  if (playing || tween) raf = requestAnimationFrame(tick);
  else lastT = 0;
}

function kick() {
  if (!raf) {
    lastT = 0;
    raf = requestAnimationFrame(tick);
  }
}

function scrollTo(target, animate = true) {
  target = clamp(target, 0, maxPos);
  if (!animate) {
    tween = null;
    pos = target;
    render();
    return;
  }
  tween = { from: pos, to: target, start: performance.now(), duration: 280 };
  kick();
}

const currentTarget = () => (tween ? tween.to : pos);

// ---------- Reproduzir / pausar ----------
let countdownTimer = 0;

function stopCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = 0;
  countdownEl.hidden = true;
}

function play() {
  if (playing || countdownTimer || !maxPos) return;
  ensureMediaAudio();
  // Chegou ao fim? Recomeça.
  if (dirSign() > 0 && pos >= maxPos - 1) pos = 0;
  if (dirSign() < 0 && pos <= 1) pos = maxPos;
  render();
  const atStart = dirSign() > 0 ? pos <= 1 : pos >= maxPos - 1;
  if (settings.countdown > 0 && atStart) {
    let n = settings.countdown;
    countdownEl.textContent = n;
    countdownEl.hidden = false;
    countdownTimer = setInterval(() => {
      n -= 1;
      if (n > 0) {
        countdownEl.textContent = n;
      } else {
        stopCountdown();
        startPlaying();
      }
    }, 1000);
  } else {
    startPlaying();
  }
}

function startPlaying() {
  playing = true;
  body.classList.add('playing');
  $('btn-play').setAttribute('aria-label', 'Pausar');
  kick();
  scheduleHudHide();
}

function pause() {
  stopCountdown();
  playing = false;
  body.classList.remove('playing');
  $('btn-play').setAttribute('aria-label', 'Reproduzir');
  showHud();
}

function togglePlay() {
  if (countdownTimer) pause();
  else if (playing) pause();
  else play();
}

// ---------- Barra de controles ----------
let hudTimer = 0;
function showHud() {
  body.classList.remove('hud-hidden');
  scheduleHudHide();
}
function scheduleHudHide() {
  clearTimeout(hudTimer);
  if (playing) hudTimer = setTimeout(() => body.classList.add('hud-hidden'), 2500);
}

let flashTimer = 0;
function flash(message) {
  flashEl.textContent = message;
  flashEl.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => flashEl.classList.remove('show'), 900);
}

// ---------- Configurações ----------
function setSetting(key, value) {
  settings = sanitizeSettings({ ...settings, [key]: value });
  saveSettings(localStorage, settings);
  applySettings();
}

function applySettings() {
  text.style.setProperty('--prompt-size', `${settings.fontSize}px`);
  text.style.setProperty('--prompt-lh', String(settings.lineHeight));
  text.style.setProperty('--prompt-margin', `${settings.margin}%`);
  text.classList.toggle('font-serif', settings.font === 'serif');
  text.classList.toggle('font-mono', settings.font === 'mono');
  text.classList.toggle('align-center', settings.align === 'center');
  text.classList.toggle('uppercase', settings.uppercase);
  for (const theme of ['dark', 'yellow', 'green', 'light']) {
    body.classList.toggle(`theme-${theme}`, settings.theme === theme);
  }
  stage.style.transform = `scale(${settings.mirrorX ? -1 : 1}, ${settings.mirrorY ? -1 : 1})`;
  guide.hidden = !settings.showGuide;
  $('speed-val').textContent = settings.speed;
  syncForm();
  measure();
  setMediaKeys(settings.mediaKeys);
  syncKeepAwake();
}

function syncForm() {
  for (const input of panel.querySelectorAll('[data-setting]')) {
    const value = settings[input.dataset.setting];
    if (input.type === 'checkbox') input.checked = value;
    else input.value = String(value);
  }
  for (const out of panel.querySelectorAll('output[data-for]')) {
    out.textContent = `${settings[out.dataset.for]}${out.dataset.unit ?? ''}`;
  }
}

for (const input of panel.querySelectorAll('[data-setting]')) {
  input.addEventListener('input', () => {
    const value = input.type === 'checkbox' ? input.checked
      : input.type === 'range' ? Number(input.value)
      : input.value;
    setSetting(input.dataset.setting, value);
  });
}

function openPanel() {
  pause();
  renderBindings();
  panel.hidden = false;
}
function closePanel() {
  panel.hidden = true;
  if (panel.contains(document.activeElement)) document.activeElement.blur();
}
$('panel-close').addEventListener('click', closePanel);
$('reset-settings').addEventListener('click', () => {
  if (!confirm('Restaurar todas as configurações de leitura?')) return;
  settings = { ...DEFAULT_SETTINGS };
  saveSettings(localStorage, settings);
  applySettings();
});

// ---------- Tela cheia ----------
function toggleFullscreen() {
  const d = document;
  if (d.fullscreenElement || d.webkitFullscreenElement) {
    (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    return;
  }
  const el = d.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!request) {
    toast('Tela cheia não suportada neste navegador. Use "Adicionar à tela inicial".', 4000);
    return;
  }
  Promise.resolve(request.call(el, { navigationUI: 'hide' })).catch(() => toast('Não foi possível entrar em tela cheia.'));
}

// ---------- Manter a tela acesa ----------
// Vídeo invisível, silencioso e em loop: usado quando a Wake Lock API não
// está disponível (acesso por HTTP). Fica atrás do texto, cobrindo a tela,
// porque alguns navegadores ignoram vídeos minúsculos ou fora da área visível.
function createKeepAwakeVideo() {
  const video = document.createElement('video');
  video.className = 'keep-awake';
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  video.preload = 'auto';
  video.tabIndex = -1;
  for (const [src, type] of [['/media/keep-awake.webm', 'video/webm'], ['/media/keep-awake.mp4', 'video/mp4']]) {
    const source = document.createElement('source');
    source.src = src;
    source.type = type;
    video.append(source);
  }
  document.body.prepend(video);
  return video;
}

const wake = createScreenWake({
  createVideo: createKeepAwakeVideo,
  onChange: (mode) => {
    body.dataset.wake = mode;
    $('wake-status').textContent = wakeStatusText(mode, settings.keepAwake);
  },
});

let keepAwakeApplied = null;
function syncKeepAwake() {
  if (settings.keepAwake === keepAwakeApplied) return;
  keepAwakeApplied = settings.keepAwake;
  if (settings.keepAwake) wake.enable();
  else wake.disable();
  $('wake-status').textContent = wakeStatusText(wake.mode, settings.keepAwake);
}

// Vídeo com som só pode começar após um gesto: cada toque/tecla tenta de novo.
for (const type of ['pointerdown', 'keydown', 'click']) {
  document.addEventListener(type, () => { wake.refresh(); }, { capture: true, passive: true });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') wake.refresh();
  else if (playing) pause();
});

// ---------- Ações ----------
const jumpPx = () => settings.jumpLines * lineHeightPx;

function changeSpeed(delta) {
  setSetting('speed', settings.speed + delta);
  flash(`Velocidade ${settings.speed}`);
}

function changeFont(delta) {
  setSetting('fontSize', settings.fontSize + delta);
  flash(`Texto ${settings.fontSize}px`);
}

function toggleSetting(key, onText, offText) {
  setSetting(key, !settings[key]);
  flash(settings[key] ? onText : offText);
}

function gotoSection(step) {
  const from = currentTarget();
  const target = step > 0
    ? sections.find((y) => y > from + 2)
    : sections.findLast((y) => y < from - lineHeightPx * 0.5);
  scrollTo(target ?? (step > 0 ? maxPos : 0));
}

const actions = {
  togglePlay,
  speedUp: () => changeSpeed(1),
  speedDown: () => changeSpeed(-1),
  jumpBack: () => scrollTo(currentTarget() - jumpPx()),
  jumpForward: () => scrollTo(currentTarget() + jumpPx()),
  prevSection: () => gotoSection(-1),
  nextSection: () => gotoSection(1),
  toStart: () => scrollTo(0),
  toEnd: () => scrollTo(maxPos),
  fontUp: () => changeFont(4),
  fontDown: () => changeFont(-4),
  mirrorX: () => toggleSetting('mirrorX', 'Espelhado (horizontal)', 'Sem espelho horizontal'),
  mirrorY: () => toggleSetting('mirrorY', 'Espelhado (vertical)', 'Sem espelho vertical'),
  reverse: () => {
    setSetting('direction', settings.direction === 'up' ? 'down' : 'up');
    flash(settings.direction === 'up' ? 'Texto sobe' : 'Texto desce');
  },
  fullscreen: toggleFullscreen,
  toggleHud: () => body.classList.toggle('hud-hidden'),
  settings: () => (panel.hidden ? openPanel() : closePanel()),
};

function run(actionId) {
  actions[actionId]?.();
}

hud.addEventListener('mousedown', (e) => {
  if (e.target.closest('button')) e.preventDefault(); // não rouba o foco do teclado
});
hud.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  run(button.dataset.action);
  button.blur();
});

// ---------- Teclado ----------
document.addEventListener('keydown', (e) => {
  if (capturing) {
    e.preventDefault();
    if (e.code === 'Escape') return endCapture();
    return endCapture(bindingFromKeyEvent(e));
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!panel.hidden) {
    if (e.key === 'Escape') closePanel();
    else if (findAction(bindings, bindingFromKeyEvent(e)) === 'settings' && !e.target.matches('input, select')) closePanel();
    return;
  }
  // Enter/Espaço em um botão focado: deixa o próprio botão agir.
  if (e.target.matches('button, a') && (e.key === 'Enter' || e.key === ' ')) return;
  const actionId = findAction(bindings, bindingFromKeyEvent(e));
  if (!actionId) return;
  e.preventDefault();
  if (e.repeat && !isRepeatable(actionId)) return;
  run(actionId);
});

// ---------- Gamepads (controles Bluetooth no modo gamepad) ----------
const padState = new Map();
let padRaf = 0;

function pollGamepads() {
  padRaf = 0;
  const pads = [...(navigator.getGamepads?.() ?? [])].filter(Boolean);
  for (const pad of pads) {
    const now = {};
    pad.buttons.forEach((b, i) => { now[gamepadButtonBinding(i)] = b.pressed || b.value > 0.5; });
    pad.axes.forEach((v, i) => {
      now[gamepadAxisBinding(i, true)] = v > 0.6;
      now[gamepadAxisBinding(i, false)] = v < -0.6;
    });
    const prev = padState.get(pad.index);
    if (prev) {
      for (const [binding, pressed] of Object.entries(now)) {
        if (pressed && !prev[binding]) onGamepadPress(binding);
      }
    }
    padState.set(pad.index, now);
  }
  if (pads.length) padRaf = requestAnimationFrame(pollGamepads);
}

function onGamepadPress(binding) {
  if (capturing) return endCapture(binding);
  if (!panel.hidden) return;
  const actionId = findAction(bindings, binding);
  if (actionId) run(actionId);
}

window.addEventListener('gamepadconnected', (e) => {
  toast(`Controle conectado: ${e.gamepad.id.slice(0, 40)}`);
  if (!padRaf) padRaf = requestAnimationFrame(pollGamepads);
});
window.addEventListener('gamepaddisconnected', (e) => padState.delete(e.gamepad.index));

// ---------- Botões de mídia (Media Session) ----------
let mediaAudio = null;
let mediaKeysOn = false;

function silentWavUrl(seconds = 10, rate = 8000) {
  const samples = seconds * rate;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + samples, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, samples, true);
  new Uint8Array(buf, 44).fill(128); // silêncio em PCM de 8 bits
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function ensureMediaAudio() {
  if (!mediaKeysOn || !('mediaSession' in navigator)) return;
  if (!mediaAudio) {
    mediaAudio = new Audio(silentWavUrl());
    mediaAudio.loop = true;
  }
  if (mediaAudio.paused) mediaAudio.play().catch(() => {});
}

function setMediaKeys(on) {
  if (on === mediaKeysOn || !('mediaSession' in navigator)) return;
  mediaKeysOn = on;
  const ms = navigator.mediaSession;
  const handlers = {
    play: 'togglePlay',
    pause: 'togglePlay',
    nexttrack: 'jumpForward',
    previoustrack: 'jumpBack',
    seekforward: 'jumpForward',
    seekbackward: 'jumpBack',
  };
  for (const [event, actionId] of Object.entries(handlers)) {
    try {
      ms.setActionHandler(event, on ? () => run(actionId) : null);
    } catch {
      /* ação não suportada */
    }
  }
  if (on) {
    if ('MediaMetadata' in window) {
      ms.metadata = new MediaMetadata({ title: scriptTitle || 'Teleprompter', artist: 'Glimpse Teleprompter' });
    }
    ensureMediaAudio();
  } else if (mediaAudio) {
    mediaAudio.pause();
  }
}

// ---------- Toque, arrasto e roda do mouse ----------
let drag = null;

stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  ensureMediaAudio();
  drag = { id: e.pointerId, y: e.clientY, pos, moved: false };
  try {
    stage.setPointerCapture(e.pointerId);
  } catch {
    /* ponteiro já liberado */
  }
});

stage.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') showHud();
  if (!drag || drag.id !== e.pointerId) return;
  const dy = e.clientY - drag.y;
  if (!drag.moved && Math.abs(dy) > 8) {
    drag.moved = true;
    dragging = true;
    tween = null;
  }
  if (drag.moved) {
    pos = clamp(drag.pos - dy * (settings.mirrorY ? -1 : 1), 0, maxPos);
    render();
  }
});

function endDrag(e) {
  if (!drag || drag.id !== e.pointerId) return;
  const wasTap = !drag.moved && e.type === 'pointerup';
  drag = null;
  dragging = false;
  if (wasTap) togglePlay();
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const unit = e.deltaMode === 1 ? lineHeightPx : e.deltaMode === 2 ? stage.clientHeight : 1;
  tween = null;
  pos = clamp(pos + e.deltaY * unit * (settings.mirrorY ? -1 : 1), 0, maxPos);
  render();
}, { passive: false });

document.addEventListener('mousemove', () => showHud());

new ResizeObserver(() => measure()).observe(text);
window.addEventListener('resize', () => measure());

// ---------- Editor de atalhos ----------
let capturing = null;

function renderBindings() {
  const container = $('bindings');
  container.replaceChildren(...ACTIONS.map((action) => {
    const row = document.createElement('div');
    row.className = 'binding';
    const label = document.createElement('span');
    label.className = 'binding-label';
    label.textContent = action.label;
    const keys = document.createElement('div');
    keys.className = 'binding-keys';
    for (const binding of bindings[action.id]) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = bindingLabel(binding);
      const remove = document.createElement('button');
      remove.textContent = '✕';
      remove.title = 'Remover';
      remove.setAttribute('aria-label', `Remover ${bindingLabel(binding)} de ${action.label}`);
      remove.addEventListener('click', () => {
        bindings = removeBinding(bindings, action.id, binding);
        saveBindings(localStorage, bindings);
        renderBindings();
      });
      chip.append(remove);
      keys.append(chip);
    }
    const add = document.createElement('button');
    add.className = 'chip-add';
    add.textContent = '+';
    add.title = 'Adicionar tecla';
    add.setAttribute('aria-label', `Adicionar tecla para ${action.label}`);
    add.addEventListener('click', () => startCapture(action.id));
    keys.append(add);
    row.append(label, keys);
    return row;
  }));
}

function startCapture(actionId) {
  capturing = actionId;
  $('capture-action').textContent = actionLabel(actionId);
  captureEl.hidden = false;
  if (!padRaf && navigator.getGamepads) padRaf = requestAnimationFrame(pollGamepads);
}

function endCapture(binding = null) {
  const actionId = capturing;
  capturing = null;
  captureEl.hidden = true;
  if (!binding || !actionId) return;
  const result = assignBinding(bindings, actionId, binding);
  bindings = result.bindings;
  saveBindings(localStorage, bindings);
  renderBindings();
  toast(result.movedFrom
    ? `${bindingLabel(binding)} movida de "${actionLabel(result.movedFrom)}" para "${actionLabel(actionId)}".`
    : `${bindingLabel(binding)} → ${actionLabel(actionId)}`, 3000);
}

$('capture-cancel').addEventListener('click', () => endCapture());
$('reset-keys').addEventListener('click', () => {
  bindings = defaultBindings();
  saveBindings(localStorage, bindings);
  renderBindings();
  toast('Atalhos restaurados.');
});

// ---------- Início ----------
async function init() {
  const id = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() ?? '');
  applySettings();
  try {
    const doc = await api(`/scripts/${encodeURIComponent(id)}`);
    scriptTitle = doc.title;
    document.title = `${doc.title} · Glimpse`;
    $('script-title').textContent = doc.title;
    text.innerHTML = renderMarkdown(doc.content);
    const end = document.createElement('p');
    end.className = 'end-mark';
    end.textContent = '• • • FIM • • •';
    text.append(end);
  } catch (err) {
    if (err.status === 401) return goToLogin();
    text.textContent = err.message;
  }
  measure();
}

init();
