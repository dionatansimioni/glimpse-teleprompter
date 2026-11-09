// Funções de texto sem dependências (testáveis no Node).

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n?/;

export function stripFrontMatter(md) {
  return md.replace(/\r\n?/g, '\n').replace(FRONT_MATTER, '');
}

// Título a partir do front matter (title: ...), do primeiro "# Título" ou do nome do arquivo.
export function extractTitle(md, filename = '') {
  const text = md.replace(/\r\n?/g, '\n');
  const fm = text.match(FRONT_MATTER);
  const fmTitle = fm?.[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
  if (fmTitle) return fmTitle.trim();
  const h1 = stripFrontMatter(text).match(/^#\s+(.+?)\s*#*\s*$/m)?.[1];
  if (h1) return h1.trim();
  return filename.replace(/\.(md|markdown|txt)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Sem título';
}
