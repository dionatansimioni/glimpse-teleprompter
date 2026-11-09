import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, sanitizeSettings, loadSettings, saveSettings,
  pixelsPerSecond, formatDuration, SETTINGS_KEY,
} from '../public/js/settings.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};

test('sanitizeSettings usa padrões para entrada inválida', () => {
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings('lixo'), DEFAULT_SETTINGS);
});

test('sanitizeSettings limita números à faixa permitida', () => {
  const s = sanitizeSettings({ speed: 999, fontSize: 2, lineHeight: '1.8', margin: 'abc' });
  assert.equal(s.speed, 60);
  assert.equal(s.fontSize, 16);
  assert.equal(s.lineHeight, 1.8);
  assert.equal(s.margin, DEFAULT_SETTINGS.margin);
});

test('sanitizeSettings só aceita opções conhecidas', () => {
  const s = sanitizeSettings({ direction: 'sideways', theme: 'yellow', align: 'center', hacker: true });
  assert.equal(s.direction, 'up');
  assert.equal(s.theme, 'yellow');
  assert.equal(s.align, 'center');
  assert.equal('hacker' in s, false);
});

test('sanitizeSettings converte booleanos', () => {
  const s = sanitizeSettings({ mirrorX: 1, mirrorY: 0 });
  assert.equal(s.mirrorX, true);
  assert.equal(s.mirrorY, false);
});

test('salvar e carregar configurações', () => {
  const storage = memoryStorage();
  saveSettings(storage, { ...DEFAULT_SETTINGS, speed: 20, mirrorX: true });
  const s = loadSettings(storage);
  assert.equal(s.speed, 20);
  assert.equal(s.mirrorX, true);
});

test('loadSettings tolera JSON corrompido e storage indisponível', () => {
  const storage = memoryStorage();
  storage.setItem(SETTINGS_KEY, '{quebrado');
  assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
  const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.deepEqual(loadSettings(broken), DEFAULT_SETTINGS);
  assert.doesNotThrow(() => saveSettings(broken, DEFAULT_SETTINGS));
});

test('velocidade em px/s cresce com a velocidade e com o tamanho da fonte', () => {
  const base = pixelsPerSecond({ speed: 10, fontSize: 50, lineHeight: 1.4 });
  assert.ok(base > 0);
  assert.equal(pixelsPerSecond({ speed: 20, fontSize: 50, lineHeight: 1.4 }), base * 2);
  assert.equal(pixelsPerSecond({ speed: 10, fontSize: 100, lineHeight: 1.4 }), base * 2);
});

test('formatDuration', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65.4), '1:05');
  assert.equal(formatDuration(3600), '60:00');
  assert.equal(formatDuration(Infinity), '');
  assert.equal(formatDuration(-1), '');
});
