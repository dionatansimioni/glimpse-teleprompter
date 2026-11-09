// Regras de senha compartilhadas pelas telas (sem DOM: testável no Node).
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 256;

// Retorna a mensagem de erro, ou '' se estiver tudo certo.
export function passwordProblem(password, confirm) {
  if (!password) return 'Digite a nova senha.';
  if (password.length < MIN_PASSWORD) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  if (password.length > MAX_PASSWORD) return `A senha pode ter no máximo ${MAX_PASSWORD} caracteres.`;
  if (!confirm) return 'Confirme a senha.';
  if (password !== confirm) return 'A confirmação não confere com a senha.';
  return '';
}
