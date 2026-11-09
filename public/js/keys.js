// Atalhos de teclado / controles Bluetooth / gamepad. Módulo sem DOM: testável no Node.

export const KEYS_STORAGE = 'glimpse.keys.v1';

export const ACTIONS = [
  { id: 'togglePlay', label: 'Reproduzir / pausar', keys: ['Space', 'Enter', 'NumpadEnter', 'MediaPlayPause', 'KeyK'] },
  { id: 'speedUp', label: 'Aumentar velocidade', keys: ['ArrowRight', 'Equal', 'NumpadAdd'], repeat: true },
  { id: 'speedDown', label: 'Diminuir velocidade', keys: ['ArrowLeft', 'Minus', 'NumpadSubtract'], repeat: true },
  { id: 'jumpBack', label: 'Voltar trecho', keys: ['ArrowUp', 'PageUp', 'MediaTrackPrevious'], repeat: true },
  { id: 'jumpForward', label: 'Avançar trecho', keys: ['ArrowDown', 'PageDown', 'MediaTrackNext'], repeat: true },
  { id: 'prevSection', label: 'Seção anterior', keys: ['Comma'] },
  { id: 'nextSection', label: 'Próxima seção', keys: ['Period'] },
  { id: 'toStart', label: 'Ir para o início', keys: ['Home'] },
  { id: 'toEnd', label: 'Ir para o fim', keys: ['End'] },
  { id: 'fontUp', label: 'Aumentar texto', keys: ['BracketRight'], repeat: true },
  { id: 'fontDown', label: 'Diminuir texto', keys: ['BracketLeft'], repeat: true },
  { id: 'mirrorX', label: 'Espelhar horizontalmente', keys: ['KeyM'] },
  { id: 'mirrorY', label: 'Espelhar verticalmente', keys: ['KeyV'] },
  { id: 'reverse', label: 'Inverter direção', keys: ['KeyR'] },
  { id: 'fullscreen', label: 'Tela cheia', keys: ['KeyF'] },
  { id: 'toggleHud', label: 'Mostrar / esconder controles', keys: ['KeyH'] },
  { id: 'settings', label: 'Configurações', keys: ['KeyS'] },
];

export const ACTION_IDS = ACTIONS.map((a) => a.id);

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

const NAMES = {
  Space: 'Espaço', Enter: 'Enter', NumpadEnter: 'Enter (num)', Escape: 'Esc',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  PageUp: 'Page Up', PageDown: 'Page Down', Home: 'Home', End: 'End',
  Equal: '=', Minus: '-', NumpadAdd: '+ (num)', NumpadSubtract: '- (num)',
  Comma: ',', Period: '.', BracketLeft: '[', BracketRight: ']',
  MediaPlayPause: 'Mídia ⏯', MediaTrackNext: 'Mídia ⏭', MediaTrackPrevious: 'Mídia ⏮',
  AudioVolumeUp: 'Volume +', AudioVolumeDown: 'Volume −',
};

export function bindingLabel(binding) {
  if (NAMES[binding]) return NAMES[binding];
  let m;
  if ((m = binding.match(/^Key([A-Z])$/))) return m[1];
  if ((m = binding.match(/^Digit(\d)$/))) return m[1];
  if ((m = binding.match(/^Numpad(\d)$/))) return `${m[1]} (num)`;
  if ((m = binding.match(/^pad:b(\d+)$/))) return `Controle: botão ${m[1]}`;
  if ((m = binding.match(/^pad:a(\d+)([+-])$/))) return `Controle: eixo ${m[1]}${m[2]}`;
  if ((m = binding.match(/^key:(.+)$/))) return m[1] === ' ' ? 'Espaço' : m[1];
  if ((m = binding.match(/^keyCode:(\d+)$/))) return `Código ${m[1]}`;
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

export function loadBindings(storage) {
  try {
    return sanitizeBindings(JSON.parse(storage?.getItem(KEYS_STORAGE) ?? 'null'));
  } catch {
    return defaultBindings();
  }
}

export function saveBindings(storage, bindings) {
  try {
    storage?.setItem(KEYS_STORAGE, JSON.stringify(bindings));
  } catch {
    /* armazenamento indisponível */
  }
}

export const isRepeatable = (actionId) => Boolean(ACTIONS.find((a) => a.id === actionId)?.repeat);
export const actionLabel = (actionId) => ACTIONS.find((a) => a.id === actionId)?.label ?? actionId;
