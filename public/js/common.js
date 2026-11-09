import { marked } from '/vendor/marked/marked.esm.js';
import DOMPurify from '/vendor/dompurify/purify.es.mjs';

export async function api(path, { method = 'GET', body, keepalive = false } = {}) {
  const headers = { 'x-glimpse': '1' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    keepalive,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Erro ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const getSession = () => api('/session');

export function goToLogin() {
  const next = location.pathname + location.search + location.hash;
  location.href = `/login?next=${encodeURIComponent(next)}`;
}

import { stripFrontMatter } from './markdown-utils.js';

export { stripFrontMatter, extractTitle } from './markdown-utils.js';

// Suporte extra: ==texto== vira <mark>texto</mark> (destaque).
marked.use({
  extensions: [
    {
      name: 'highlight',
      level: 'inline',
      start: (src) => src.indexOf('=='),
      tokenizer(src) {
        const match = /^==(?=\S)([\s\S]*?\S)==/.exec(src);
        if (match) {
          return { type: 'highlight', raw: match[0], tokens: this.lexer.inlineTokens(match[1]) };
        }
      },
      renderer(token) {
        return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
      },
    },
  ],
});

export function renderMarkdown(md) {
  const html = marked.parse(stripFrontMatter(md), { gfm: true, breaks: true });
  return DOMPurify.sanitize(html);
}

let toastTimer;
export function toast(message, ms = 2400) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function formatDate(iso) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function readingMinutes(words, wpm = 150) {
  return Math.max(1, Math.round(words / wpm));
}
