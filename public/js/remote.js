// Página de controle remoto: lista os leitores abertos e envia comandos ao escolhido.
import { api, getSession, goToLogin, toast } from './common.js';
import { t, translateDom } from './i18n.js';
import { REMOTE_ACTIONS, bindingFromKeyEvent, findAction, defaultBindings, isRepeatable } from './keys.js';
import { mountMenu } from './menu.js';

translateDom();

const $ = (id) => document.getElementById(id);
let readers = [];
let selectedId = null;
let userChose = false; // escolheu um leitor (não seleciona outro sozinho depois)
let bindings = defaultBindings();
let connected = false;

const selected = () => readers.find((r) => r.id === selectedId) ?? null;
const deviceName = (reader) => reader.device || t('remote.unknownDevice');

function renderList() {
  const list = $('readers');
  list.replaceChildren(...readers.map((reader) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reader-item';
    button.dataset.reader = reader.id;
    const title = document.createElement('span');
    title.className = 'remote-title';
    title.textContent = reader.title;
    const meta = document.createElement('span');
    meta.className = 'remote-meta';
    meta.textContent = describe(reader);
    button.append(title, meta);
    button.addEventListener('click', () => select(reader.id, true));
    li.append(button);
    return li;
  }));
  $('empty').hidden = readers.length > 0;
}

function describe(reader) {
  return [
    deviceName(reader),
    t(reader.state.playing ? 'remote.playing' : 'remote.paused'),
    t('remote.progress', { n: Math.round(reader.state.progress * 100) }),
  ].join(' · ');
}

function renderControl() {
  const reader = selected();
  if (!reader) return;
  $('target-title').textContent = reader.title;
  $('target-meta').textContent = describe(reader);
  $('target-speed').textContent = reader.state.speed || '–';
  $('target-font').textContent = reader.state.fontSize ? `${reader.state.fontSize}px` : '–';
  $('target-progress').style.width = `${reader.state.progress * 100}%`;
  const playing = reader.state.playing;
  $('remote-play').classList.toggle('is-playing', playing);
  $('remote-play-label').textContent = t(playing ? 'reader.pause' : 'reader.play');
  $('remote-play').setAttribute('aria-label', t(playing ? 'reader.pause' : 'reader.play'));
}

function showView() {
  const control = Boolean(selected());
  $('list-view').hidden = control;
  $('control-view').hidden = !control;
  if (control) renderControl();
  else renderList();
}

function select(id, byUser = false) {
  selectedId = id;
  if (byUser) userChose = true;
  showView();
}

function onReaders(next) {
  const hadSelection = Boolean(selected());
  readers = next;
  if (hadSelection && !selected()) {
    toast(t('remote.disconnected'), 4000);
    selectedId = null;
  }
  // Com um único leitor aberto, já abre os controles dele.
  if (!selectedId && !userChose && readers.length === 1) selectedId = readers[0].id;
  showView();
}

async function send(action) {
  const reader = selected();
  if (!reader || !REMOTE_ACTIONS.includes(action)) return;
  try {
    await api(`/remote/readers/${reader.id}/commands`, { method: 'POST', body: { action } });
  } catch (err) {
    if (err.status === 401) return goToLogin();
    toast(err.message, 3000);
  }
}

for (const button of document.querySelectorAll('[data-remote]')) {
  button.addEventListener('click', () => send(button.dataset.remote));
}
$('change-reader').addEventListener('click', () => {
  selectedId = null;
  userChose = true;
  showView();
});

// Atalhos configurados (teclado ou controle Bluetooth ligado a este computador).
document.addEventListener('keydown', (e) => {
  if (!selected() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.matches('input, select, textarea, dialog *')) return;
  if (e.target.matches('button, a') && (e.key === 'Enter' || e.key === ' ')) return;
  const action = findAction(bindings, bindingFromKeyEvent(e));
  if (!action || !REMOTE_ACTIONS.includes(action)) return;
  e.preventDefault();
  if (e.repeat && !isRepeatable(action)) return;
  send(action);
});

window.addEventListener('glimpse:language', showView);

function setConnected(value) {
  connected = value;
  $('connection').textContent = connected ? '' : t('remote.offline');
}

// ---------- Início ----------
const session = await getSession();
if (!session.configured) {
  location.replace('/setup');
} else if (!session.authenticated) {
  goToLogin();
} else {
  mountMenu($('app-menu'), { isAdmin: true });
  api('/settings').then((data) => { bindings = data.bindings; }).catch(() => {});
  const source = new EventSource('/api/remote/controller');
  source.addEventListener('open', () => setConnected(true));
  source.addEventListener('error', () => setConnected(false));
  source.addEventListener('readers', (event) => {
    setConnected(true);
    onReaders(JSON.parse(event.data));
  });
  showView();
}
