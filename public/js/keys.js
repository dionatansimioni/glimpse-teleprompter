// Atalhos de teclado / controles Bluetooth / gamepad. Guardados no servidor e
// valem para todos os roteiros. Módulo sem DOM: usado pelo navegador, servidor e testes.

import { t } from './i18n.js';

export const KEYS_STORAGE = 'glimpse.keys.v1'; // gitleaks:allow (nome de chave do localStorage, não é segredo)

export const ACTIONS = [
  { id: 'togglePlay', keys: ['Space', 'Enter', 'NumpadEnter', 'MediaPlayPause', 'KeyK'] },
  { id: 'speedUp', keys: ['ArrowRight', 'Equal', 'NumpadAdd'], repeat: true },
  { id: 'speedDown', keys: ['ArrowLeft', 'Minus', 'NumpadSubtract'], repeat: true },
  { id: 'jumpBack', keys: ['ArrowUp', 'PageUp', 'MediaTrackPrevious'], repeat: true },
  { id: 'jumpForward', keys: ['ArrowDown', 'PageDown', 'MediaTrackNext'], repeat: true },
  { id: 'prevSection', keys: ['Comma'] },
  { id: 'nextSection', keys: ['Period'] },
  { id: 'toStart', keys: ['Home'] },
  { id: 'toEnd', keys: ['End'] },
  { id: 'fontUp', keys: ['BracketRight'], repeat: true },
  { id: 'fontDown', keys: ['BracketLeft'], repeat: true },
  { id: 'mirrorX', keys: ['KeyM'] },
  { id: 'mirrorY', keys: ['KeyV'] },
  { id: 'reverse', keys: ['KeyR'] },
  { id: 'fullscreen', keys: ['KeyF'] },
  { id: 'toggleHud', keys: ['KeyH'] },
  { id: 'settings', keys: ['KeyS'] },
];

export const ACTION_IDS = ACTIONS.map((a) => a.id);

// Ações que o controle remoto pode enviar a um leitor.
export const REMOTE_ACTIONS = Object.freeze([
  'togglePlay', 'speedDown', 'speedUp', 'fontDown', 'fontUp', 'jumpBack', 'jumpForward',
]);

export function defaultBindings() {
  return Object.fromEntries(ACTIONS.map((a) => [a.id, [...a.keys]]));
}

// Identificador estável de uma tecla. Usa `code` (independe do layout);
// se o dispositivo não informar (alguns controles/teclados virtuais), usa `key`
// e, em último caso, o `keyCode` numérico.
export function bindingFromKeyEvent(e) {
  if (e.code && e.code !== 'Unidentified') return e.code;
  if (e.key && e.key !== 'Unidentified') return `key:${e.key}`;
  if (e.keyCode) return `keyCode:${e.keyCode}`;
  return null;
}

export const gamepadButtonBinding = (index) => `pad:b${index}`;
export const gamepadAxisBinding = (index, positive) => `pad:a${index}${positive ? '+' : '-'}`;

// Nomes fixos; os que dependem do idioma vêm das traduções (key.*).
const TRANSLATED = {
  Space: 'key.space', NumpadEnter: 'key.numpadEnter',
  MediaPlayPause: 'key.mediaPlayPause', MediaTrackNext: 'key.mediaNext', MediaTrackPrevious: 'key.mediaPrev',
};
const NAMES = {
  Enter: 'Enter', Escape: 'Esc',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  PageUp: 'Page Up', PageDown: 'Page Down', Home: 'Home', End: 'End',
  Equal: '=', Minus: '-', NumpadAdd: '+ (num)', NumpadSubtract: '- (num)',
  Comma: ',', Period: '.', BracketLeft: '[', BracketRight: ']',
  AudioVolumeUp: 'Volume +', AudioVolumeDown: 'Volume −',
};

export function bindingLabel(binding) {
  if (TRANSLATED[binding]) return t(TRANSLATED[binding]);
  if (NAMES[binding]) return NAMES[binding];
  let m;
  if ((m = binding.match(/^Key([A-Z])$/))) return m[1];
  if ((m = binding.match(/^Digit(\d)$/))) return m[1];
  if ((m = binding.match(/^Numpad(\d)$/))) return `${m[1]} (num)`;
  if ((m = binding.match(/^pad:b(\d+)$/))) return t('key.padButton', { n: m[1] });
  if ((m = binding.match(/^pad:a(\d+)([+-])$/))) return t('key.padAxis', { n: m[1], dir: m[2] });
  if ((m = binding.match(/^key:(.+)$/))) return m[1] === ' ' ? t('key.space') : m[1];
  if ((m = binding.match(/^keyCode:(\d+)$/))) return t('key.code', { n: m[1] });
  return binding;
}

export function findAction(bindings, binding) {
  if (!binding) return null;
  for (const id of ACTION_IDS) if (bindings[id]?.includes(binding)) return id;
  return null;
}

// Associa uma tecla a uma ação, removendo-a de qualquer outra ação (sem conflitos).
// Retorna { bindings, movedFrom } sem alterar o objeto original.
export function assignBinding(bindings, actionId, binding) {
  const next = {};
  let movedFrom = null;
  for (const id of ACTION_IDS) {
    const list = (bindings[id] ?? []).filter((b) => {
      if (b !== binding) return true;
      if (id !== actionId) movedFrom = id;
      return false;
    });
    next[id] = list;
  }
  next[actionId].push(binding);
  return { bindings: next, movedFrom };
}

export function removeBinding(bindings, actionId, binding) {
  return { ...bindings, [actionId]: (bindings[actionId] ?? []).filter((b) => b !== binding) };
}

export function sanitizeBindings(input) {
  const defaults = defaultBindings();
  if (!input || typeof input !== 'object') return defaults;
  const out = {};
  for (const id of ACTION_IDS) {
    const list = input[id];
    out[id] = Array.isArray(list)
      ? [...new Set(list.filter((b) => typeof b === 'string' && b.length > 0 && b.length < 64))]
      : defaults[id];
  }
  return out;
}

// Atalhos antigos, salvos só no navegador (versões anteriores do Glimpse).
// Retorna null se não houver nada salvo.
export function readLegacyBindings(storage) {
  try {
    const raw = storage?.getItem(KEYS_STORAGE);
    return raw ? sanitizeBindings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearLegacyBindings(storage) {
  try {
    storage?.removeItem(KEYS_STORAGE);
  } catch {
    /* armazenamento indisponível */
  }
}

export const isRepeatable = (actionId) => Boolean(ACTIONS.find((a) => a.id === actionId)?.repeat);
export const actionLabel = (actionId) => t(`action.${actionId}`);
