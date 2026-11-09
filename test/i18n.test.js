import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DICTIONARIES, translate, normalizeLanguage, detectLanguage, languageFromHeaders,
  setLanguage, t, LANG_STORAGE,
} from '../public/js/i18n.js';
import { SETTINGS_FORM } from '../public/js/settings.js';
import { ACTIONS, bindingLabel, actionLabel } from '../public/js/keys.js';
import { startServer } from './helpers.js';

const PUBLIC = path.resolve(import.meta.dirname, '../public');
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('português e inglês têm exatamente as mesmas chaves', () => {
  const pt = Object.keys(DICTIONARIES.pt).sort();
  const en = Object.keys(DICTIONARIES.en).sort();
  assert.deepEqual(pt.filter((k) => !en.includes(k)), [], 'faltando em en.js');
  assert.deepEqual(en.filter((k) => !pt.includes(k)), [], 'faltando em pt.js');
});

test('as traduções usam os mesmos {parâmetros}', () => {
  for (const key of Object.keys(DICTIONARIES.pt)) {
    assert.deepEqual(placeholders(DICTIONARIES.en[key]), placeholders(DICTIONARIES.pt[key]), key);
  }
});

test('nenhuma tradução vazia', () => {
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    for (const [key, value] of Object.entries(dict)) assert.ok(value.trim(), `${lang}: ${key}`);
  }
});

test('toda chave usada no HTML existe', async () => {
  const pages = (await fs.readdir(PUBLIC)).filter((f) => f.endsWith('.html'));
  const menu = await fs.readFile(path.join(PUBLIC, 'js', 'menu.js'), 'utf8'); // modelo HTML do menu
  for (const page of [...pages, 'js/menu.js']) {
    const html = page === 'js/menu.js' ? menu : await fs.readFile(path.join(PUBLIC, page), 'utf8');
    const keys = [
      ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]),
      ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1].split(';').map((p) => p.split(':')[1].trim())),
    ];
    for (const key of keys) assert.ok(key in DICTIONARIES.pt, `${page}: ${key}`);
  }
});

test('toda chave literal usada nos scripts existe', async () => {
  const dirs = [path.join(PUBLIC, 'js'), path.resolve(import.meta.dirname, '../src')];
  for (const dir of dirs) {
    for (const file of (await fs.readdir(dir)).filter((f) => f.endsWith('.js'))) {
      const source = await fs.readFile(path.join(dir, file), 'utf8');
      const keys = [
        ...[...source.matchAll(/\bt\('([\w.]+)'/g)].map((m) => m[1]),
        ...[...source.matchAll(/(?:HttpError|AuthError)\(\d+, '([\w.]+)'/g)].map((m) => m[1]),
      ];
      for (const key of keys) assert.ok(key in DICTIONARIES.pt, `${file}: ${key}`);
    }
  }
});

test('todo campo, opção, seção e ação tem tradução', () => {
  for (const section of SETTINGS_FORM) {
    assert.ok(`section.${section.id}` in DICTIONARIES.pt, section.id);
    for (const field of section.fields) {
      assert.ok(`setting.${field.key}` in DICTIONARIES.pt, field.key);
      for (const option of field.options ?? []) assert.ok(`setting.${field.key}.${option}` in DICTIONARIES.pt, `${field.key}.${option}`);
      if (field.note) assert.ok(`setting.${field.key}.note` in DICTIONARIES.pt, `${field.key}.note`);
    }
  }
  for (const action of ACTIONS) assert.ok(`action.${action.id}` in DICTIONARIES.pt, action.id);
});

test('translate substitui parâmetros e cai para o português', () => {
  assert.equal(translate('en', 'library.importedMany', { n: 3 }), '3 scripts imported.');
  assert.equal(translate('pt', 'library.importedMany', { n: 3 }), '3 roteiros importados.');
  assert.equal(translate('xx', 'library.read'), 'Ler', 'idioma desconhecido usa pt');
  assert.equal(translate('en', 'chave.inexistente'), 'chave.inexistente');
  assert.equal(translate('en', 'reader.flashSpeed'), 'Speed {n}', 'parâmetro ausente fica visível');
});

test('normaliza e detecta o idioma', () => {
  assert.equal(normalizeLanguage('pt-BR'), 'pt');
  assert.equal(normalizeLanguage('en-GB'), 'en');
  assert.equal(normalizeLanguage('es'), null);
  const storage = (value) => ({ getItem: (k) => (k === LANG_STORAGE ? value : null) });
  assert.equal(detectLanguage({ storage: storage('en'), languages: ['pt-BR'] }), 'en', 'escolha salva vence');
  assert.equal(detectLanguage({ storage: storage(null), languages: ['es', 'pt-PT'] }), 'pt');
  assert.equal(detectLanguage({ storage: storage(null), languages: ['de'] }), 'en', 'outros idiomas: inglês');
  assert.equal(detectLanguage({ storage: { getItem() { throw new Error('x'); } }, languages: ['pt'] }), 'pt');
});

test('idioma da requisição no servidor', () => {
  assert.equal(languageFromHeaders({ 'x-glimpse-lang': 'en' }), 'en');
  assert.equal(languageFromHeaders({ 'accept-language': 'fr;q=0.9, en-US;q=0.8' }), 'en');
  assert.equal(languageFromHeaders({ 'accept-language': '*' }), 'pt');
  assert.equal(languageFromHeaders({}), 'pt');
});

test('rótulos de teclas e ações seguem o idioma escolhido', () => {
  try {
    setLanguage('en');
    assert.equal(t('library.read'), 'Read');
    assert.equal(bindingLabel('Space'), 'Space');
    assert.equal(bindingLabel('pad:b3'), 'Controller: button 3');
    assert.equal(actionLabel('togglePlay'), 'Play / pause');
    setLanguage('pt');
    assert.equal(bindingLabel('Space'), 'Espaço');
    assert.equal(actionLabel('togglePlay'), 'Reproduzir / pausar');
  } finally {
    setLanguage('pt');
  }
});

test('o servidor responde erros no idioma pedido', async () => {
  const srv = await startServer();
  try {
    let res = await srv.request('/api/login', { method: 'POST', body: { password: 'errada' }, headers: { 'x-glimpse-lang': 'en' } });
    assert.equal((await res.json()).error, 'Wrong password.');
    res = await srv.request('/api/login', { method: 'POST', body: { password: 'errada' } });
    assert.equal((await res.json()).error, 'Senha incorreta.');
    res = await srv.request('/api/scripts', { headers: { 'accept-language': 'en-US,en;q=0.9' } });
    assert.equal((await res.json()).error, 'Sign in as administrator.');
  } finally {
    await srv.close();
  }
  const fresh = await startServer({ configure: false });
  try {
    const res = await fresh.request('/api/setup', {
      method: 'POST', body: { password: 'curta', confirm: 'curta' }, headers: { 'x-glimpse-lang': 'en' },
    });
    assert.equal((await res.json()).error, 'The password must have at least 8 characters.');
  } finally {
    await fresh.close();
  }
});
