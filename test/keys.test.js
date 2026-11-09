import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS, ACTION_IDS, defaultBindings, bindingFromKeyEvent, bindingLabel, findAction,
  assignBinding, removeBinding, sanitizeBindings, readLegacyBindings, clearLegacyBindings, KEYS_STORAGE,
  gamepadButtonBinding, gamepadAxisBinding, isRepeatable,
} from '../public/js/keys.js';

test('atalhos padrão não têm teclas repetidas entre ações', () => {
  const seen = new Map();
  for (const [action, keys] of Object.entries(defaultBindings())) {
    for (const key of keys) {
      assert.ok(!seen.has(key), `${key} em ${action} e ${seen.get(key)}`);
      seen.set(key, action);
    }
  }
});

test('ações essenciais existem', () => {
  for (const id of ['togglePlay', 'speedUp', 'speedDown', 'fontUp', 'fontDown', 'mirrorX', 'reverse', 'fullscreen']) {
    assert.ok(ACTION_IDS.includes(id), id);
  }
});

test('identificador de tecla prefere code, depois key, depois keyCode', () => {
  assert.equal(bindingFromKeyEvent({ code: 'Space', key: ' ' }), 'Space');
  assert.equal(bindingFromKeyEvent({ code: '', key: 'AudioVolumeUp' }), 'key:AudioVolumeUp');
  assert.equal(bindingFromKeyEvent({ code: 'Unidentified', key: 'Unidentified', keyCode: 179 }), 'keyCode:179');
  assert.equal(bindingFromKeyEvent({}), null);
});

test('findAction encontra a ação da tecla', () => {
  const b = defaultBindings();
  assert.equal(findAction(b, 'Space'), 'togglePlay');
  assert.equal(findAction(b, 'PageDown'), 'jumpForward');
  assert.equal(findAction(b, 'KeyZ'), null);
  assert.equal(findAction(b, null), null);
});

test('assignBinding adiciona uma tecla customizada', () => {
  const { bindings, movedFrom } = assignBinding(defaultBindings(), 'togglePlay', 'key:AudioVolumeUp');
  assert.equal(movedFrom, null);
  assert.equal(findAction(bindings, 'key:AudioVolumeUp'), 'togglePlay');
});

test('assignBinding move a tecla de outra ação para evitar conflito', () => {
  const original = defaultBindings();
  const { bindings, movedFrom } = assignBinding(original, 'togglePlay', 'PageDown');
  assert.equal(movedFrom, 'jumpForward');
  assert.equal(findAction(bindings, 'PageDown'), 'togglePlay');
  assert.ok(!bindings.jumpForward.includes('PageDown'));
  assert.ok(original.jumpForward.includes('PageDown'), 'não altera o objeto original');
});

test('assignBinding não duplica a mesma tecla na mesma ação', () => {
  const { bindings } = assignBinding(defaultBindings(), 'togglePlay', 'Space');
  assert.equal(bindings.togglePlay.filter((k) => k === 'Space').length, 1);
});

test('removeBinding remove apenas a tecla indicada', () => {
  const b = removeBinding(defaultBindings(), 'togglePlay', 'Space');
  assert.ok(!b.togglePlay.includes('Space'));
  assert.ok(b.togglePlay.includes('Enter'));
});

test('botões e eixos de gamepad viram atalhos', () => {
  const pad = gamepadButtonBinding(3);
  const axis = gamepadAxisBinding(1, false);
  const { bindings } = assignBinding(defaultBindings(), 'speedUp', pad);
  assert.equal(findAction(bindings, pad), 'speedUp');
  assert.equal(bindingLabel(pad), 'Controle: botão 3');
  assert.equal(bindingLabel(axis), 'Controle: eixo 1-');
});

test('rótulos legíveis', () => {
  assert.equal(bindingLabel('Space'), 'Espaço');
  assert.equal(bindingLabel('KeyM'), 'M');
  assert.equal(bindingLabel('Digit7'), '7');
  assert.equal(bindingLabel('ArrowUp'), '↑');
  assert.equal(bindingLabel('key:AudioVolumeUp'), 'AudioVolumeUp');
  assert.equal(bindingLabel('keyCode:179'), 'Código 179');
});

test('sanitizeBindings mantém ações válidas e completa as ausentes', () => {
  const b = sanitizeBindings({ togglePlay: ['KeyP', 'KeyP', 42], inexistente: ['KeyQ'] });
  assert.deepEqual(b.togglePlay, ['KeyP']);
  assert.deepEqual(b.speedUp, defaultBindings().speedUp);
  assert.equal('inexistente' in b, false);
  assert.deepEqual(Object.keys(b), ACTION_IDS);
});

test('uma ação pode ficar sem nenhuma tecla', () => {
  const b = sanitizeBindings({ togglePlay: [] });
  assert.deepEqual(b.togglePlay, []);
});

test('atalhos antigos do navegador são lidos para migração e depois apagados', () => {
  const m = new Map();
  const storage = { getItem: (k) => m.get(k) ?? null, removeItem: (k) => m.delete(k) };
  assert.equal(readLegacyBindings(storage), null, 'nada salvo');
  const { bindings } = assignBinding(defaultBindings(), 'reverse', 'pad:b7');
  m.set(KEYS_STORAGE, JSON.stringify(bindings));
  assert.equal(findAction(readLegacyBindings(storage), 'pad:b7'), 'reverse');
  clearLegacyBindings(storage);
  assert.equal(readLegacyBindings(storage), null);
  m.set(KEYS_STORAGE, '{quebrado');
  assert.equal(readLegacyBindings(storage), null);
});

test('ações repetíveis (segurar a tecla) são só as contínuas', () => {
  assert.equal(isRepeatable('speedUp'), true);
  assert.equal(isRepeatable('togglePlay'), false);
  assert.equal(isRepeatable('fullscreen'), false);
  assert.equal(ACTIONS.length, ACTION_IDS.length);
});
