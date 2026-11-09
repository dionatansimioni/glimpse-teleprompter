import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordProblem, MIN_PASSWORD, MAX_PASSWORD } from '../public/js/password-rules.js';
import { MIN_PASSWORD as SERVER_MIN, MAX_PASSWORD as SERVER_MAX } from '../src/auth.js';

test('regras do navegador e do servidor são as mesmas', () => {
  assert.equal(MIN_PASSWORD, SERVER_MIN);
  assert.equal(MAX_PASSWORD, SERVER_MAX);
});

test('passwordProblem aponta cada problema', () => {
  assert.match(passwordProblem('', ''), /Digite/);
  assert.match(passwordProblem('curta', 'curta'), /8 caracteres/);
  assert.match(passwordProblem('senha-boa-1', ''), /Confirme/);
  assert.match(passwordProblem('senha-boa-1', 'senha-boa-2'), /não confere/);
  assert.equal(passwordProblem('senha-boa-1', 'senha-boa-1'), '');
});
