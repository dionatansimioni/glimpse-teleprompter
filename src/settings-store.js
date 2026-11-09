// Configuração geral do teleprompter (vale para todos os roteiros e aparelhos),
// guardada em <DATA_DIR>/settings.json.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sanitizeSettings } from '../public/js/settings.js';
import { sanitizeBindings } from '../public/js/keys.js';

export async function createSettingsStore(dataDir) {
  const file = path.join(dataDir, 'settings.json');

  async function read() {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  const shape = (data) => ({
    settings: sanitizeSettings(data?.settings),
    bindings: sanitizeBindings(data?.bindings),
    saved: Boolean(data), // false = nunca configurado (usa os padrões)
    updatedAt: data?.updatedAt ?? null,
  });

  // Gravações em fila: duas requisições seguidas não se atropelam.
  let queue = Promise.resolve();

  return {
    async get() {
      return shape(await read());
    },

    // Atualiza só o que vier (settings e/ou bindings), mantendo o resto.
    update({ settings, bindings }) {
      const run = async () => {
        const current = shape(await read());
        const doc = {
          settings: settings === undefined ? current.settings : sanitizeSettings({ ...current.settings, ...settings }),
          bindings: bindings === undefined ? current.bindings : sanitizeBindings(bindings),
          updatedAt: new Date().toISOString(),
        };
        const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(doc, null, 2));
        await fs.rename(tmp, file);
        return shape(doc);
      };
      queue = queue.then(run, run);
      return queue;
    },
  };
}
