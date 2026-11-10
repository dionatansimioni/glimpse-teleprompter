import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const serverFile = new URL('../src/server.js', import.meta.url).pathname;

function run(env, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [serverFile], { env: { ...process.env, PORT: '0', ...env }, ...options });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    const timer = setTimeout(() => child.kill(), 10_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

test('sem permissão na pasta de dados, o servidor explica como corrigir e sai', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'glimpse-ro-'));
  await fs.chmod(dataDir, 0o555);
  // Como root as permissões são ignoradas: roda o servidor como outro usuário.
  const asOther = process.getuid?.() === 0 ? { uid: 1000, gid: 1000 } : {};
  try {
    const { code, output } = await run({ DATA_DIR: dataDir }, asOther);
    assert.equal(code, 1);
    assert.match(output, /sem permissão para gravar em/);
    assert.match(output, /chown -R \d+:\d+/);
  } finally {
    await fs.chmod(dataDir, 0o755);
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
