// Configurações do leitor (por dispositivo). Módulo sem DOM: testável no Node.

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

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Normaliza um objeto de configurações qualquer (ex.: lido do localStorage),
// descartando chaves desconhecidas e valores inválidos.
export function sanitizeSettings(input) {
  const out = { ...DEFAULT_SETTINGS };
  if (!input || typeof input !== 'object') return out;
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const value = input[key];
    if (value === undefined) continue;
    if (key in NUMBER_RANGES) {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = clamp(n, ...NUMBER_RANGES[key]);
    } else if (key in CHOICES) {
      if (CHOICES[key].includes(value)) out[key] = value;
    } else if (typeof def === 'boolean') {
      out[key] = Boolean(value);
    }
  }
  return out;
}

export function loadSettings(storage) {
  try {
    return sanitizeSettings(JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage, settings) {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* armazenamento indisponível (aba anônima etc.) */
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
