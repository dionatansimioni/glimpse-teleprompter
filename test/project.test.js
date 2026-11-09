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

const lines = (text) => text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

test('.gitignore impede que dados e segredos locais vão para o GitHub', async () => {
  const ignored = lines(await read('.gitignore'));
  for (const pattern of ['data/', 'node_modules/', '.env', '.env.*', 'auth.json', '.session-secret', '*.pem', '*.key', 'test-results/']) {
    assert.ok(ignored.includes(pattern), `.gitignore deveria conter ${pattern}`);
  }
  assert.ok(ignored.includes('!.env.example'), 'o exemplo de .env continua versionado');
});

test('.dockerignore impede que dados e segredos entrem na imagem', async () => {
  const ignored = lines(await read('.dockerignore'));
  for (const pattern of ['data', '.env', '.git', 'node_modules', 'auth.json', '.session-secret']) {
    assert.ok(ignored.includes(pattern), `.dockerignore deveria conter ${pattern}`);
  }
});

test('CI verifica segredos antes de publicar a imagem', async () => {
  const workflow = await read('.github/workflows/docker-publish.yml');
  assert.match(workflow, /gitleaks/);
  assert.match(workflow, /needs: \[secrets, test, e2e\]/);
});
