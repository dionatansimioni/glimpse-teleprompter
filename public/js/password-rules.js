// Regras de senha compartilhadas pelas telas (sem DOM: testável no Node).
import { t } from './i18n.js';

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 256;

// Retorna a mensagem de erro, ou '' se estiver tudo certo.
export function passwordProblem(password, confirm) {
  if (!password) return t('password.enterNew');
  if (password.length < MIN_PASSWORD) return t('password.tooShort', { min: MIN_PASSWORD });
  if (password.length > MAX_PASSWORD) return t('password.tooLong', { max: MAX_PASSWORD });
  if (!confirm) return t('password.confirm');
  if (password !== confirm) return t('password.mismatch');
  return '';
}
