// Armazenamento simples em arquivos JSON: um arquivo por roteiro em <DATA_DIR>/scripts.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ID_RE = /^[A-Za-z0-9_-]{8,32}$/;

export function countWords(text) {
  return text
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/[#>*_`~\-=|[\]()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

export async function createStore(dataDir) {
  const dir = path.join(dataDir, 'scripts');
  await fs.mkdir(dir, { recursive: true });

  const fileFor = (id) => path.join(dir, `${id}.json`);

  async function read(id) {
    if (!ID_RE.test(id)) return null;
    try {
      return JSON.parse(await fs.readFile(fileFor(id), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  // Grava em arquivo temporário e renomeia, para nunca deixar um JSON pela metade.
  async function write(doc) {
    const tmp = `${fileFor(doc.id)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(doc, null, 2));
    await fs.rename(tmp, fileFor(doc.id));
  }

  const summarize = ({ id, title, content, createdAt, updatedAt }) => ({
    id,
    title,
    createdAt,
    updatedAt,
    words: countWords(content),
  });

  return {
    async list() {
      const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json'));
      const docs = await Promise.all(names.map((n) => read(n.slice(0, -5))));
      return docs
        .filter(Boolean)
        .map(summarize)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    get: read,

    async create({ title, content }) {
      const now = new Date().toISOString();
      const doc = {
        id: crypto.randomBytes(9).toString('base64url'),
        title,
        content,
        createdAt: now,
        updatedAt: now,
      };
      await write(doc);
      return doc;
    },

    async update(id, { title, content }) {
      const doc = await read(id);
      if (!doc) return null;
      Object.assign(doc, { title, content, updatedAt: new Date().toISOString() });
      await write(doc);
      return doc;
    },

    async remove(id) {
      if (!ID_RE.test(id)) return false;
      try {
        await fs.unlink(fileFor(id));
        return true;
      } catch (err) {
        if (err.code === 'ENOENT') return false;
        throw err;
      }
    },
  };
}
