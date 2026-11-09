import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (file) => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('CI (.nvmrc) e Dockerfile usam a mesma versão major do Node', async () => {
  const nvmrc = (await read('.nvmrc')).trim();
  const froms = [...(await read('Dockerfile')).matchAll(/^FROM node:(\d+)/gm)].map((m) => m[1]);
  assert.ok(froms.length > 0, 'Dockerfile sem FROM node');
  for (const major of froms) assert.equal(major, nvmrc);
});

test('engines.node do package.json aceita a versão usada', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const min = Number(pkg.engines.node.match(/>=\s*(\d+)/)[1]);
  assert.ok(Number((await read('.nvmrc')).trim()) >= min);
});

test('Playwright fixado em versão exata (a imagem do e2e depende dela)', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.match(pkg.devDependencies['@playwright/test'], /^\d+\.\d+\.\d+$/);
});
