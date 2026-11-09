import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startServer } from './helpers.js';

const exec = promisify(execFile);
const PUBLIC = path.resolve(import.meta.dirname, '../public');

describe('Páginas e arquivos estáticos', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(() => srv.close());

  for (const [url, marker] of [
    ['/', 'library.js'],
    ['/login', 'login.js'],
    ['/setup', 'setup.js'],
    ['/read/qualquer-id', 'reader.js'],
  ]) {
    test(`${url} serve a página certa`, async () => {
      const res = await srv.request(url);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /text\/html/);
      assert.ok((await res.text()).includes(marker));
    });
  }

  test('cabeçalhos de segurança estão presentes', async () => {
    const res = await srv.request('/');
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  test('bibliotecas do navegador (marked, DOMPurify) são servidas localmente', async () => {
    for (const url of ['/vendor/marked/marked.esm.js', '/vendor/dompurify/purify.es.mjs']) {
      const res = await srv.request(url);
      assert.equal(res.status, 200, url);
      assert.match(res.headers.get('content-type'), /javascript/, url);
    }
  });

  test('vídeos que mantêm a tela acesa são servidos e pequenos', async () => {
    for (const [url, type] of [['/media/keep-awake.webm', 'video/webm'], ['/media/keep-awake.mp4', 'video/mp4']]) {
      const res = await srv.request(url);
      assert.equal(res.status, 200, url);
      assert.equal(res.headers.get('content-type'), type);
      const size = (await res.arrayBuffer()).byteLength;
      assert.ok(size > 500 && size < 50_000, `${url}: ${size} bytes`);
    }
    const reader = await fs.readFile(path.join(PUBLIC, 'js', 'reader.js'), 'utf8');
    assert.ok(reader.includes('/media/keep-awake.webm') && reader.includes('/media/keep-awake.mp4'));
  });

  test('todo import dos módulos do navegador aponta para um arquivo existente', async () => {
    const files = (await fs.readdir(path.join(PUBLIC, 'js'))).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      const source = await fs.readFile(path.join(PUBLIC, 'js', file), 'utf8');
      for (const [, spec] of source.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
        const url = spec.startsWith('/') ? spec : `/js/${spec.replace(/^\.\//, '')}`;
        const res = await srv.request(url);
        assert.equal(res.status, 200, `${file} importa ${spec}`);
      }
    }
  });

  test('todos os assets referenciados no HTML existem', async () => {
    for (const page of ['index.html', 'login.html', 'setup.html', 'read.html']) {
      const html = await fs.readFile(path.join(PUBLIC, page), 'utf8');
      for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) {
        if (url === '/' || url === '/login') continue;
        const res = await srv.request(url);
        assert.equal(res.status, 200, `${page} → ${url}`);
      }
    }
  });

  test('HTML não tem estilos nem scripts inline (bloqueados pela CSP)', async () => {
    for (const page of ['index.html', 'login.html', 'setup.html', 'read.html']) {
      const html = await fs.readFile(path.join(PUBLIC, page), 'utf8');
      assert.doesNotMatch(html, /\sstyle="/, page);
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, page);
      assert.doesNotMatch(html, /\son[a-z]+="/, page);
    }
  });

  test('IDs usados pelos scripts existem no HTML', async () => {
    const pairs = [['library.js', 'index.html'], ['login.js', 'login.html'], ['setup.js', 'setup.html'], ['reader.js', 'read.html']];
    for (const [js, page] of pairs) {
      const source = await fs.readFile(path.join(PUBLIC, 'js', js), 'utf8');
      const html = await fs.readFile(path.join(PUBLIC, page), 'utf8');
      const ids = [...source.matchAll(/(?:\$|getElementById)\('([\w-]+)'\)/g)].map((m) => m[1]);
      assert.ok(ids.length > 0, js);
      for (const id of ids) assert.ok(html.includes(`id="${id}"`), `${js} usa #${id}, ausente em ${page}`);
    }
  });

  test('todos os data-action do leitor têm uma ação correspondente', async () => {
    const html = await fs.readFile(path.join(PUBLIC, 'read.html'), 'utf8');
    const { ACTION_IDS } = await import('../public/js/keys.js');
    for (const [, id] of html.matchAll(/data-action="(\w+)"/g)) {
      assert.ok(ACTION_IDS.includes(id), `ação desconhecida: ${id}`);
    }
  });

  test('scripts do navegador não têm erro de sintaxe', async () => {
    const files = (await fs.readdir(path.join(PUBLIC, 'js'))).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      await exec(process.execPath, ['--check', path.join(PUBLIC, 'js', file)]);
    }
  });
});
