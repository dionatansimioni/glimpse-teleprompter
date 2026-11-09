// Menu do canto superior direito: configurações do teleprompter, idioma,
// alterar senha e sair. Usado na biblioteca e na página de configurações.
import { api, toast } from './common.js';
import { t, translateDom, setLanguage } from './i18n.js';
import { passwordProblem } from './password-rules.js';

const TEMPLATE = `
<div class="menu">
  <button type="button" class="ghost icon-button menu-button" id="menu-button" aria-haspopup="menu" aria-expanded="false"
    aria-controls="menu-list" data-i18n-attr="aria-label:menu.open;title:menu.open">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>
  </button>
  <div class="menu-list" id="menu-list" role="menu" hidden>
    <a role="menuitem" href="/settings" id="menu-settings" data-admin data-i18n="menu.settings"></a>
    <a role="menuitem" href="/remote" id="menu-remote" data-admin data-i18n="menu.remote"></a>
    <div class="menu-sep" role="separator"></div>
    <span class="menu-label" data-i18n="menu.language"></span>
    <button role="menuitemradio" type="button" data-lang-option="pt" lang="pt-BR">Português</button>
    <button role="menuitemradio" type="button" data-lang-option="en" lang="en">English</button>
    <div class="menu-sep" role="separator" data-admin></div>
    <button role="menuitem" type="button" id="change-password" data-admin data-i18n="menu.password"></button>
    <button role="menuitem" type="button" id="logout" data-admin data-i18n="menu.logout"></button>
    <div class="menu-sep" role="separator" data-guest></div>
    <a role="menuitem" href="/login" id="login-link" data-guest data-i18n="menu.login"></a>
  </div>
</div>
<dialog id="password-dialog" class="dialog">
  <form id="password-form" novalidate>
    <h2 data-i18n="password.title"></h2>
    <label class="field-label" for="pw-current" data-i18n="password.current"></label>
    <input type="password" id="pw-current" name="current" autocomplete="current-password" required>
    <label class="field-label" for="pw-new" data-i18n="password.new"></label>
    <input type="password" id="pw-new" name="password" autocomplete="new-password" minlength="8" required>
    <label class="field-label" for="pw-confirm" data-i18n="password.confirmNew"></label>
    <input type="password" id="pw-confirm" name="confirm" autocomplete="new-password" minlength="8" required>
    <p class="hint" data-i18n="password.dialogHint"></p>
    <div class="error" id="password-error" role="alert"></div>
    <div class="dialog-actions">
      <button type="button" id="password-cancel" data-i18n="common.cancel"></button>
      <button type="submit" class="primary" data-i18n="common.save"></button>
    </div>
  </form>
</dialog>`;

export function mountMenu(container, { isAdmin }) {
  container.innerHTML = TEMPLATE; // modelo fixo, sem dados do usuário
  for (const el of container.querySelectorAll('[data-admin]')) el.hidden = !isAdmin;
  for (const el of container.querySelectorAll('[data-guest]')) el.hidden = isAdmin;
  translateDom(container);

  const button = container.querySelector('.menu-button');
  const list = container.querySelector('.menu-list');
  const items = () => [...list.querySelectorAll('[role^="menuitem"]')].filter((el) => !el.hidden);

  function open() {
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    items()[0]?.focus();
  }
  function close({ focusButton = false } = {}) {
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focusButton) button.focus();
  }

  button.addEventListener('click', () => (list.hidden ? open() : close()));
  document.addEventListener('click', (e) => {
    if (!list.hidden && !container.contains(e.target)) close();
  });
  list.addEventListener('keydown', (e) => {
    const all = items();
    const index = all.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close({ focusButton: true });
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      all[(index + step + all.length) % all.length]?.focus();
    } else if (e.key === 'Tab') {
      close();
    }
  });

  for (const option of list.querySelectorAll('[data-lang-option]')) {
    option.addEventListener('click', () => {
      setLanguage(option.dataset.langOption);
      close({ focusButton: true });
    });
  }

  // Alterar senha
  const dialog = container.querySelector('#password-dialog');
  const form = container.querySelector('#password-form');
  const error = container.querySelector('#password-error');
  container.querySelector('#change-password').addEventListener('click', () => {
    close();
    form.reset();
    error.textContent = '';
    dialog.showModal();
  });
  container.querySelector('#password-cancel').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = form.current.value;
    const password = form.password.value;
    const confirm = form.confirm.value;
    const problem = current ? passwordProblem(password, confirm) : t('password.enterCurrent');
    error.textContent = problem;
    if (problem) return;
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    try {
      await api('/password', { method: 'POST', body: { current, password, confirm } });
      dialog.close();
      toast(t('password.changed'), 4000);
    } catch (err) {
      error.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });

  container.querySelector('#logout').addEventListener('click', async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    location.href = '/login';
  });

  return { close };
}
