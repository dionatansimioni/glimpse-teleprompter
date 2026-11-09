import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFile(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.access(path.join(ROOT, file)).then(() => true, () => false);

test('site: todo texto marcado tem tradução para português', async () => {
  const html = await read('site/index.html');
  const script = await read('site/script.js');
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 30);
  for (const key of new Set(keys)) {
    assert.ok(script.includes(`'${key}':`) || script.includes(` ${key}:`), `sem tradução pt: ${key}`);
  }
});

test('site: toda captura de tela existe nos dois idiomas', async () => {
  const html = await read('site/index.html');
  const shots = [...html.matchAll(/data-shot="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(shots.length >= 5);
  for (const shot of shots) {
    for (const lang of ['en', 'pt']) {
      assert.ok(await exists(`site/assets/screens/${lang}-${shot}.png`), `${lang}-${shot}.png`);
    }
  }
});

test('site: arquivos locais referenciados existem', async () => {
  const html = await read('site/index.html');
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
    assert.ok(await exists(path.join('site', ref)), ref);
  }
});

test('READMEs: links entre idiomas e imagens existentes', async () => {
  for (const [file, other] of [['README.md', 'README.pt-BR.md'], ['README.pt-BR.md', 'README.md']]) {
    const text = await read(file);
    assert.ok(text.includes(`(${other})`), `${file} deve apontar para ${other}`);
    for (const [, src] of text.matchAll(/<img src="([^"]+)"/g)) assert.ok(await exists(src), `${file}: ${src}`);
  }
});

test('READMEs têm as mesmas seções nos dois idiomas', async () => {
  const count = (text, re) => (text.match(re) ?? []).length;
  const en = await read('README.md');
  const pt = await read('README.pt-BR.md');
  assert.equal(count(en, /^#{1,3} /gm), count(pt, /^#{1,3} /gm), 'mesmo número de títulos');
  assert.equal(count(en, /^\| /gm), count(pt, /^\| /gm), 'mesmas linhas de tabela');
});
