// Configurações do leitor. Guardadas no servidor (gerais + ajustes por roteiro).
// Módulo sem DOM: usado pelo navegador, pelo servidor e pelos testes.

export const SETTINGS_KEY = 'glimpse.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  speed: 12,
  direction: 'up',
  jumpLines: 3,
  countdown: 3,
  fontSize: 64,
  lineHeight: 1.4,
  margin: 8,
  align: 'left',
  font: 'sans',
  theme: 'dark',
  uppercase: false,
  mirrorX: false,
  mirrorY: false,
  showGuide: true,
  guidePos: 30,
  mediaKeys: false,
  keepAwake: true,
});

const NUMBER_RANGES = {
  speed: [1, 60],
  jumpLines: [1, 15],
  countdown: [0, 10],
  fontSize: [16, 200],
  lineHeight: [1, 2.4],
  margin: [0, 35],
  guidePos: [5, 80],
};

const CHOICES = {
  direction: ['up', 'down'],
  align: ['left', 'center'],
  font: ['sans', 'serif', 'mono'],
  theme: ['dark', 'yellow', 'green', 'light'],
};

// Formulário de configurações: seções e campos (os rótulos vêm das traduções
// section.<id>, setting.<key> e setting.<key>.<opção>).
const STEPS = { speed: 1, jumpLines: 1, countdown: 1, fontSize: 2, lineHeight: 0.05, margin: 1, guidePos: 1 };
const UNITS = { countdown: 's', fontSize: 'px', margin: '%', guidePos: '%' };
const SECTIONS = {
  scroll: ['speed', 'direction', 'jumpLines', 'countdown'],
  text: ['fontSize', 'lineHeight', 'margin', 'align', 'font', 'theme', 'uppercase'],
  screen: ['mirrorX', 'mirrorY', 'showGuide', 'guidePos', 'keepAwake', 'mediaKeys'],
};
const WITH_NOTE = ['mediaKeys'];

export const SETTINGS_FORM = Object.freeze(Object.entries(SECTIONS).map(([id, keys]) => ({
  id,
  fields: keys.map((key) => {
    if (key in NUMBER_RANGES) {
      const [min, max] = NUMBER_RANGES[key];
      return { key, type: 'range', min, max, step: STEPS[key], unit: UNITS[key] ?? '' };
    }
    if (key in CHOICES) return { key, type: 'select', options: [...CHOICES[key]] };
    return { key, type: 'checkbox', note: WITH_NOTE.includes(key) };
  }),
})));

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Configurações que valem para todos os roteiros e não podem ser sobrescritas
// por roteiro (comportamento do aparelho, não da leitura).
export const GLOBAL_ONLY = Object.freeze(['keepAwake', 'mediaKeys']);

const NO_VALUE = Symbol('inválido');

// Valida e normaliza o valor de uma configuração; NO_VALUE se for inválido.
function normalize(key, value) {
  if (!(key in DEFAULT_SETTINGS) || value === undefined || value === null) return NO_VALUE;
  if (key in NUMBER_RANGES) {
    const n = typeof value === 'boolean' ? NaN : Number(value);
    return Number.isFinite(n) ? clamp(n, ...NUMBER_RANGES[key]) : NO_VALUE;
  }
  if (key in CHOICES) return CHOICES[key].includes(value) ? value : NO_VALUE;
  return Boolean(value);
}

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// Configuração completa: chaves desconhecidas e valores inválidos viram o padrão.
export function sanitizeSettings(input) {
  const out = { ...DEFAULT_SETTINGS };
  if (!isObject(input)) return out;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const value = normalize(key, input[key]);
    if (value !== NO_VALUE) out[key] = value;
  }
  return out;
}

// Ajustes de um roteiro: só as chaves válidas que ele sobrescreve.
export function sanitizeOverrides(input) {
  const out = {};
  if (!isObject(input)) return out;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (GLOBAL_ONLY.includes(key)) continue;
    const value = normalize(key, input[key]);
    if (value !== NO_VALUE) out[key] = value;
  }
  return out;
}

// O que o leitor usa: configuração geral + ajustes do roteiro por cima.
export function effectiveSettings(global, overrides) {
  return sanitizeSettings({ ...sanitizeSettings(global), ...sanitizeOverrides(overrides) });
}

// Onde gravar uma alteração: nos ajustes do roteiro quando o painel está em
// "Só este roteiro" ou quando o roteiro já sobrescreve essa chave (senão a
// mudança não teria efeito visível); caso contrário, na configuração geral.
export function settingTarget(key, scope, overrides = {}) {
  if (GLOBAL_ONLY.includes(key)) return 'global';
  if (scope === 'script' || Object.hasOwn(overrides, key)) return 'script';
  return 'global';
}

// Configurações antigas, salvas só no navegador (versões anteriores do Glimpse).
// Retorna null se não houver nada salvo.
export function readLegacySettings(storage) {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    return raw ? sanitizeSettings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearLegacySettings(storage) {
  try {
    storage?.removeItem(SETTINGS_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}

// Pixels por segundo da rolagem. Escala com o tamanho da linha, para que a
// mesma "velocidade" pareça igual em qualquer tamanho de fonte.
export function pixelsPerSecond({ speed, fontSize, lineHeight }) {
  return speed * fontSize * lineHeight * 0.025;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}
