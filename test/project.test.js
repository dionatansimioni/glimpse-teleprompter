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

test('compose do ZimaOS/CasaOS: imagem, porta, pasta de dados e metadados do painel', async () => {
  const compose = await read('docker-compose.zimaos.yml');
  assert.match(compose, /^name: glimpse$/m);
  assert.match(compose, /image: ghcr\.io\/dionatansimioni\/glimpse-teleprompter:latest/);
  assert.match(compose, /target: 3000\s+published: "3000"/);
  assert.match(compose, /source: \/DATA\/AppData\/glimpse\s+target: \/data/);
  // Metadados que o painel usa para mostrar o app.
  assert.match(compose, /^x-casaos:\n(?:  .*\n|\s*\n)*?  main: glimpse$/m);
  assert.match(compose, /architectures:\s+- amd64\s+- arm64/);
  assert.match(compose, /port_map: "3000"/);
  for (const key of ['title', 'tagline', 'description']) {
    assert.match(compose, new RegExp(`  ${key}:\\n    en_us: .+\\n    pt_br: .+`), `${key} em inglês e português`);
  }
  // O ícone aponta para o site no GitHub Pages, publicado a partir de site/.
  const icon = compose.match(/icon: https:\/\/dionatansimioni\.github\.io\/glimpse-teleprompter\/(\S+)/)[1];
  await fs.access(new URL(`../site/${icon}`, import.meta.url));
  // O comentário ensina a dar a pasta ao mesmo usuário com que a imagem roda.
  assert.match(compose, /chown -R 1000:1000 \/DATA\/AppData\/glimpse/);
  assert.match(await read('Dockerfile'), /^USER node$/m);
});

test('READMEs explicam a instalação no ZimaOS', async () => {
  for (const file of ['README.md', 'README.pt-BR.md']) {
    const text = await read(file);
    assert.match(text, /## .*ZimaOS/, `${file} sem seção do ZimaOS`);
    assert.match(text, /docker-compose\.zimaos\.yml/);
    assert.match(text, /chown -R 1000:1000 \/DATA\/AppData\/glimpse/);
  }
});
