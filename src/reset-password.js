// Remove a senha de administrador para refazer o setup inicial.
// Uso: node src/reset-password.js   (no Docker: docker compose exec glimpse node src/reset-password.js)
// Depois reinicie o servidor; os roteiros não são afetados.
import fs from 'node:fs/promises';
import path from 'node:path';
import { AUTH_FILE } from './auth.js';

export async function resetPassword(dataDir) {
  try {
    await fs.unlink(path.join(dataDir, AUTH_FILE));
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dataDir = process.env.DATA_DIR || './data';
  const removed = await resetPassword(dataDir);
  console.log(removed
    ? 'Senha removida. Reinicie o Glimpse e acesse-o no navegador para definir uma nova senha.'
    : 'Nenhuma senha estava configurada.');
}
