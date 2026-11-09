// Página de configurações: edita a configuração geral do teleprompter e os
// atalhos (valem para todos os roteiros e aparelhos), sem abrir um roteiro.
import { api, getSession, goToLogin, toast } from './common.js';
import { t, translateDom } from './i18n.js';
import { sanitizeSettings, DEFAULT_SETTINGS } from './settings.js';
import { defaultBindings } from './keys.js';
import { renderSettingsForm } from './settings-form.js';
import { createBindingsEditor } from './bindings-editor.js';
import { mountMenu } from './menu.js';

translateDom();

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULT_SETTINGS };
let bindings = defaultBindings();

// ---------- Gravação (com atraso, como no leitor) ----------
const timers = {};
const setStatus = (text) => { $('save-status').textContent = text; };

function schedule(what) {
  setStatus(t('common.saving'));
  clearTimeout(timers[what]);
  timers[what] = setTimeout(() => flush(what), 400);
}

async function flush(what, { keepalive = false } = {}) {
  clearTimeout(timers[what]);
  delete timers[what];
  try {
    const body = what === 'settings' ? { settings } : { bindings };
    await api('/settings', { method: 'PUT', body, keepalive });
    if (!Object.keys(timers).length) setStatus(t('common.saved'));
  } catch (err) {
    setStatus(t('common.saveError'));
    if (err.status === 401) return goToLogin();
    toast(t('reader.saveFailed', { error: err.message }), 4000);
  }
}

window.addEventListener('pagehide', () => {
  for (const what of Object.keys(timers)) flush(what, { keepalive: true });
});

// ---------- Formulário e atalhos ----------
const form = renderSettingsForm($('settings-form'), {
  onChange(key, value) {
    settings = sanitizeSettings({ ...settings, [key]: value });
    form.sync(settings);
    schedule('settings');
  },
});

const editor = createBindingsEditor({
  container: $('bindings'),
  getBindings: () => bindings,
  setBindings: (next) => {
    bindings = next;
    schedule('bindings');
  },
});

$('reset-keys').addEventListener('click', () => editor.reset());
$('reset-settings').addEventListener('click', () => {
  if (!confirm(t('panel.confirmResetGlobal'))) return;
  settings = { ...DEFAULT_SETTINGS };
  form.sync(settings);
  schedule('settings');
});

window.addEventListener('glimpse:language', () => {
  form.rebuild();
  form.sync(settings);
  editor.render();
});

// ---------- Início ----------
const session = await getSession();
if (!session.configured) {
  location.replace('/setup');
} else if (!session.authenticated) {
  goToLogin();
} else {
  mountMenu($('app-menu'), { isAdmin: true });
  const data = await api('/settings');
  settings = data.settings;
  bindings = data.bindings;
  form.sync(settings);
  editor.render();
}
