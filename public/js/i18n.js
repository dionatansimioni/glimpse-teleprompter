// Internacionalização (pt/en). Funciona no navegador e no Node (servidor e testes).
//
// No HTML: data-i18n="chave" troca o texto; data-i18n-attr="placeholder:chave;title:outra"
// troca atributos. As páginas começam com <html data-i18n-pending> (escondidas)
// e translateDom() as revela já no idioma certo.
import pt from './locales/pt.js';
import en from './locales/en.js';

export const DICTIONARIES = Object.freeze({ pt, en });
export const LANGUAGES = Object.freeze({ pt: 'Português', en: 'English' });
export const LANG_STORAGE = 'glimpse.lang';
export const FALLBACK = 'pt';

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

export function normalizeLanguage(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v.startsWith('pt')) return 'pt';
  if (v.startsWith('en')) return 'en';
  return null;
}

// Idioma salvo neste aparelho; senão o do navegador (pt ou en); senão inglês.
export function detectLanguage({ storage, languages = [] } = {}) {
  try {
    const saved = normalizeLanguage(storage?.getItem(LANG_STORAGE));
    if (saved) return saved;
  } catch {
    /* armazenamento indisponível */
  }
  for (const lang of languages) {
    const found = normalizeLanguage(lang);
    if (found) return found;
  }
  return 'en';
}

// Idioma de uma requisição no servidor: cabeçalho x-glimpse-lang ou Accept-Language.
export function languageFromHeaders(headers = {}) {
  const explicit = normalizeLanguage(headers['x-glimpse-lang']);
  if (explicit) return explicit;
  for (const part of String(headers['accept-language'] ?? '').split(',')) {
    const found = normalizeLanguage(part.split(';')[0]);
    if (found) return found;
  }
  return FALLBACK;
}

export function translate(lang, key, params = {}) {
  const text = DICTIONARIES[lang]?.[key] ?? DICTIONARIES[FALLBACK][key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

let current = isBrowser
  ? detectLanguage({ storage: window.localStorage, languages: navigator.languages ?? [navigator.language] })
  : FALLBACK;

export const getLanguage = () => current;
export const t = (key, params) => translate(current, key, params);
export const locale = () => (current === 'pt' ? 'pt-BR' : 'en-US');

export function setLanguage(lang, { persist = true } = {}) {
  current = normalizeLanguage(lang) ?? FALLBACK;
  if (persist && isBrowser) {
    try {
      window.localStorage.setItem(LANG_STORAGE, current);
    } catch {
      /* armazenamento indisponível */
    }
  }
  if (isBrowser) {
    translateDom();
    window.dispatchEvent(new CustomEvent('glimpse:language', { detail: current }));
  }
  return current;
}

export function translateDom(root = document) {
  document.documentElement.lang = locale();
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
  for (const el of root.querySelectorAll('[data-lang-option]')) {
    const selected = el.dataset.langOption === current;
    el.setAttribute(el.getAttribute('role') === 'menuitemradio' ? 'aria-checked' : 'aria-pressed', String(selected));
  }
  document.documentElement.removeAttribute('data-i18n-pending');
}

// Botões com data-lang-option="pt|en" trocam o idioma.
export function bindLanguageButtons(root = document) {
  for (const el of root.querySelectorAll('[data-lang-option]')) {
    el.addEventListener('click', () => setLanguage(el.dataset.langOption));
  }
}
