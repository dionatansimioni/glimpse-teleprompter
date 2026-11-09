import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, sanitizeSettings, sanitizeOverrides, effectiveSettings, settingTarget,
  GLOBAL_ONLY, readLegacySettings, clearLegacySettings, pixelsPerSecond, formatDuration, SETTINGS_KEY,
} from '../public/js/settings.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
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

test('configurações antigas do navegador são lidas para migração', () => {
  const storage = memoryStorage();
  assert.equal(readLegacySettings(storage), null, 'nada salvo');
  storage.setItem(SETTINGS_KEY, JSON.stringify({ speed: 20, mirrorX: true }));
  const s = readLegacySettings(storage);
  assert.equal(s.speed, 20);
  assert.equal(s.mirrorX, true);
  clearLegacySettings(storage);
  assert.equal(readLegacySettings(storage), null);
});

test('migração tolera JSON corrompido e storage indisponível', () => {
  const storage = memoryStorage();
  storage.setItem(SETTINGS_KEY, '{quebrado');
  assert.equal(readLegacySettings(storage), null);
  const broken = { getItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } };
  assert.equal(readLegacySettings(broken), null);
  assert.doesNotThrow(() => clearLegacySettings(broken));
});

test('ajustes do roteiro guardam só chaves válidas e permitidas', () => {
  const o = sanitizeOverrides({
    speed: 30, fontSize: 'abc', theme: 'neon', mirrorX: true, keepAwake: false, mediaKeys: true, hacker: 1,
  });
  assert.deepEqual(o, { speed: 30, mirrorX: true });
  assert.deepEqual(sanitizeOverrides(null), {});
  assert.deepEqual(sanitizeOverrides([1, 2]), {});
  assert.deepEqual(sanitizeOverrides({ speed: 999 }), { speed: 60 }, 'limita à faixa');
  assert.deepEqual(sanitizeOverrides({ speed: true }), {}, 'booleano não é número');
});

test('configuração efetiva: geral + ajustes do roteiro por cima', () => {
  const global = { ...DEFAULT_SETTINGS, fontSize: 80, speed: 15, mirrorX: true };
  const eff = effectiveSettings(global, { speed: 25 });
  assert.equal(eff.speed, 25, 'ajuste do roteiro vence');
  assert.equal(eff.fontSize, 80, 'o resto segue a geral');
  assert.equal(eff.mirrorX, true);
  assert.deepEqual(effectiveSettings(global, {}), sanitizeSettings(global));
  assert.equal(effectiveSettings(global, { keepAwake: false }).keepAwake, true, 'keepAwake é só geral');
});

test('onde gravar cada alteração', () => {
  assert.equal(settingTarget('speed', 'global', {}), 'global');
  assert.equal(settingTarget('speed', 'script', {}), 'script');
  assert.equal(settingTarget('speed', 'global', { speed: 20 }), 'script', 'roteiro já sobrescreve: altera o ajuste');
  assert.equal(settingTarget('fontSize', 'global', { speed: 20 }), 'global');
  for (const key of GLOBAL_ONLY) assert.equal(settingTarget(key, 'script', { [key]: 1 }), 'global');
});

test('velocidade em px/s cresce com a velocidade e com o tamanho da fonte', () => {
  const base = pixelsPerSecond({ speed: 10, fontSize: 50, lineHeight: 1.4 });
  assert.ok(base > 0);
  assert.equal(pixelsPerSecond({ speed: 20, fontSize: 50, lineHeight: 1.4 }), base * 2);
  assert.equal(pixelsPerSecond({ speed: 10, fontSize: 100, lineHeight: 1.4 }), base * 2);
});

test('manter a tela acesa vem ligado por padrão', () => {
  assert.equal(DEFAULT_SETTINGS.keepAwake, true);
  assert.equal(sanitizeSettings({ keepAwake: false }).keepAwake, false);
});

test('formatDuration', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65.4), '1:05');
  assert.equal(formatDuration(3600), '60:00');
  assert.equal(formatDuration(Infinity), '');
  assert.equal(formatDuration(-1), '');
});
