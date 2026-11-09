import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer, PASSWORD } from './helpers.js';
import { resetPassword } from '../src/reset-password.js';
import { hashPassword, verifyPassword, validateNewPassword } from '../src/auth.js';

const session = async (srv) => (await srv.request('/api/session')).json();

describe('Setup inicial', () => {
  test('servidor novo começa sem senha e bloqueia tudo', async () => {
    const srv = await startServer({ configure: false });
    try {
      assert.deepEqual(await session(srv), { configured: false, authenticated: false, publicRead: false });
      assert.equal((await srv.request('/api/scripts')).status, 401);
      const login = await srv.login('qualquer');
      assert.equal(login.status, 409);
    } finally {
      await srv.close();
    }
  });

  test('recusa confirmação diferente e senha curta', async () => {
    const srv = await startServer({ configure: false });
    try {
      let res = await srv.setup('senha-boa-123', 'senha-boa-124');
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /confirmação/);
      res = await srv.setup('curta', 'curta');
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /8 caracteres/);
      res = await srv.request('/api/setup', { method: 'POST', body: { password: 'senha-boa-123' } });
      assert.equal(res.status, 400);
      assert.equal((await session(srv)).configured, false);
    } finally {
      await srv.close();
    }
  });

  test('cria a senha, já entra logado e permite usar a API', async () => {
    const srv = await startServer({ configure: false });
    try {
      const res = await srv.setup();
      assert.equal(res.status, 201);
      assert.deepEqual(await session(srv), { configured: true, authenticated: true, publicRead: false });
      const created = await srv.request('/api/scripts', { method: 'POST', body: { title: 'a', content: 'b' } });
      assert.equal(created.status, 201);
    } finally {
      await srv.close();
    }
  });

  test('setup não pode ser refeito depois de configurado', async () => {
    const srv = await startServer();
    try {
      const res = await srv.setup('outra-senha-123');
      assert.equal(res.status, 409);
      assert.equal((await srv.login()).status, 200, 'senha original continua valendo');
      assert.equal((await srv.login('outra-senha-123')).status, 401);
    } finally {
      await srv.close();
    }
  });

  test('setups simultâneos: só um vence', async () => {
    const srv = await startServer({ configure: false });
    try {
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) => srv.setup(`senha-concorrente-${i}`)),
      );
      const statuses = results.map((r) => r.status).sort();
      assert.deepEqual(statuses, [201, 409, 409, 409, 409]);
    } finally {
      await srv.close();
    }
  });

  test('a senha é salva como hash, nunca em texto puro', async () => {
    const srv = await startServer();
    try {
      const raw = await fs.readFile(path.join(srv.dataDir, 'auth.json'), 'utf8');
      assert.ok(!raw.includes(PASSWORD));
      assert.match(JSON.parse(raw).passwordHash, /^scrypt\$/);
      const stat = await fs.stat(path.join(srv.dataDir, 'auth.json'));
      assert.equal(stat.mode & 0o077, 0, 'arquivo legível só pelo dono');
    } finally {
      await srv.close();
    }
  });

  test('configuração persiste ao reiniciar o servidor', async () => {
    const a = await startServer();
    await a.close({ keepData: true });
    const b = await startServer({ dataDir: a.dataDir, configure: false });
    try {
      assert.equal((await session(b)).configured, true);
      assert.equal((await b.login()).status, 200);
    } finally {
      await b.close();
    }
  });

  test('reset-password apaga a senha e libera um novo setup após reiniciar', async () => {
    const a = await startServer();
    await a.request('/api/login', { method: 'POST', body: { password: PASSWORD } });
    await a.request('/api/scripts', { method: 'POST', body: { title: 'Fica', content: 'x' } });
    await a.close({ keepData: true });

    assert.equal(await resetPassword(a.dataDir), true);
    assert.equal(await resetPassword(a.dataDir), false, 'segunda vez não há o que remover');

    const b = await startServer({ dataDir: a.dataDir, configure: false });
    try {
      assert.equal((await session(b)).configured, false);
      assert.equal((await b.setup('nova-senha-123')).status, 201);
      const list = await (await b.request('/api/scripts')).json();
      assert.equal(list.length, 1, 'roteiros preservados');
    } finally {
      await b.close();
    }
  });
});

describe('Troca de senha', () => {
  const change = (srv, current, password, confirm = password) =>
    srv.request('/api/password', { method: 'POST', body: { current, password, confirm } });

  test('exige login', async () => {
    const srv = await startServer();
    try {
      assert.equal((await change(srv, PASSWORD, 'nova-senha-123')).status, 401);
    } finally {
      await srv.close();
    }
  });

  test('valida senha atual, confirmação e senha repetida', async () => {
    const srv = await startServer();
    try {
      await srv.login();
      assert.equal((await change(srv, 'errada-123', 'nova-senha-123')).status, 401);
      assert.equal((await change(srv, PASSWORD, 'nova-senha-123', 'nova-senha-124')).status, 400);
      assert.equal((await change(srv, PASSWORD, 'curta')).status, 400);
      assert.equal((await change(srv, PASSWORD, PASSWORD)).status, 400);
    } finally {
      await srv.close();
    }
  });

  test('troca a senha, mantém quem trocou logado e derruba outras sessões', async () => {
    const srv = await startServer();
    try {
      await srv.login();
      const other = srv.getCookie(); // outra sessão (ex.: o celular)
      await srv.login();

      const res = await change(srv, PASSWORD, 'nova-senha-123');
      assert.equal(res.status, 200);
      assert.equal((await session(srv)).authenticated, true, 'quem trocou continua logado');

      const old = await srv.request('/api/scripts', { auth: false, headers: { cookie: other } });
      assert.equal(old.status, 401, 'sessões antigas são encerradas');

      srv.clearCookie();
      assert.equal((await srv.login(PASSWORD)).status, 401);
      assert.equal((await srv.login('nova-senha-123')).status, 200);
    } finally {
      await srv.close();
    }
  });
});

describe('Hash de senha', () => {
  test('hash e verificação', async () => {
    const hash = await hashPassword('minha senha secreta');
    assert.equal(await verifyPassword('minha senha secreta', hash), true);
    assert.equal(await verifyPassword('outra', hash), false);
    assert.notEqual(await hashPassword('minha senha secreta'), hash, 'salt aleatório');
    assert.equal(await verifyPassword('x', 'formato-invalido'), false);
    assert.equal(await verifyPassword(undefined, hash), false);
  });

  test('validateNewPassword', () => {
    assert.doesNotThrow(() => validateNewPassword('12345678', '12345678'));
    assert.throws(() => validateNewPassword('1234567', '1234567'), /8 caracteres/);
    assert.throws(() => validateNewPassword('12345678', '12345679'), /confirmação/);
    assert.throws(() => validateNewPassword('a'.repeat(257), 'a'.repeat(257)), /no máximo/);
    assert.throws(() => validateNewPassword(undefined, undefined), /Informe/);
  });
});
