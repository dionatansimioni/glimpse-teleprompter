import { t, translateDom } from './i18n.js';
import { mountMenu } from './menu.js';

translateDom();
import {
  api, getSession, goToLogin, extractTitle, stripFrontMatter, renderMarkdown,
  toast, formatDate, readingMinutes,
} from './common.js';

const $ = (id) => document.getElementById(id);
const listView = $('list-view');
const editorView = $('editor-view');
const listEl = $('scripts');
const emptyEl = $('empty');
const searchEl = $('search');
const titleEl = $('title');
const contentEl = $('content');
const previewEl = $('preview');
const statusEl = $('status');
const readLink = $('read-link');
const saveBtn = $('save');

let session = { authenticated: false, publicRead: false };
let scripts = [];
let editing = null; // { id|null, savedTitle, savedContent }

const isAdmin = () => session.authenticated;
const isDirty = () =>
  editing && (titleEl.value !== editing.savedTitle || contentEl.value !== editing.savedContent);

// ---------- Lista ----------

async function loadList() {
  try {
    scripts = await api('/scripts');
  } catch (err) {
    if (err.status === 401) return goToLogin();
    toast(err.message);
    scripts = [];
  }
  renderList();
}

function renderList() {
  const query = searchEl.value.trim().toLowerCase();
  const items = scripts.filter((s) => s.title.toLowerCase().includes(query));
  listEl.replaceChildren(...items.map(renderItem));

  emptyEl.hidden = items.length > 0;
  emptyEl.textContent = scripts.length === 0
    ? t(isAdmin() ? 'library.emptyAdmin' : 'library.emptyReader')
    : t('library.noResults');
}

function renderItem(script) {
  const li = document.createElement('li');
  li.className = 'script';

  const main = document.createElement('a');
  main.className = 'script-main';
  main.href = `/read/${script.id}`;
  const title = document.createElement('span');
  title.className = 'script-title';
  title.textContent = script.title;
  const meta = document.createElement('span');
  meta.className = 'script-meta';
  meta.textContent = t('library.meta', {
    date: formatDate(script.updatedAt),
    words: script.words,
    minutes: readingMinutes(script.words),
  }) + (script.customized ? t('library.customized') : '');
  main.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'script-actions';
  const read = link(t('library.read'), `/read/${script.id}`, 'button primary');
  actions.append(read);
  if (isAdmin()) {
    actions.append(link(t('library.edit'), `#/edit/${script.id}`, 'button'));
    actions.append(link(t('library.download'), `/api/scripts/${script.id}/download`, 'button'));
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = t('library.delete');
    del.addEventListener('click', () => deleteScript(script));
    actions.append(del);
  }

  li.append(main, actions);
  return li;
}

function link(text, href, className) {
  const a = document.createElement('a');
  a.textContent = text;
  a.href = href;
  a.className = className;
  return a;
}

async function deleteScript(script) {
  if (!confirm(t('library.confirmDelete', { title: script.title }))) return;
  try {
    await api(`/scripts/${script.id}`, { method: 'DELETE' });
    toast(t('library.deleted'));
    await loadList();
  } catch (err) {
    toast(err.message);
  }
}

async function importFiles(files) {
  const accepted = [...files].filter((f) => /\.(md|markdown|txt)$/i.test(f.name) || f.type.startsWith('text/'));
  if (!accepted.length) return toast(t('library.importSelect'));
  let ok = 0;
  for (const file of accepted) {
    try {
      const text = await file.text();
      await api('/scripts', {
        method: 'POST',
        body: { title: extractTitle(text, file.name, t('library.untitled')).slice(0, 200), content: stripFrontMatter(text) },
      });
      ok += 1;
    } catch (err) {
      toast(`${file.name}: ${err.message}`, 4000);
    }
  }
  if (ok) toast(ok === 1 ? t('library.importedOne') : t('library.importedMany', { n: ok }));
  await loadList();
}

// ---------- Editor ----------

async function openEditor(id) {
  if (!isAdmin()) return goToLogin();
  let doc = { id: null, title: '', content: '' };
  if (id) {
    try {
      doc = await api(`/scripts/${id}`);
    } catch (err) {
      toast(err.message);
      location.hash = '#/';
      return;
    }
  }
  editing = { id: doc.id, savedTitle: doc.title, savedContent: doc.content };
  titleEl.value = doc.title;
  contentEl.value = doc.content;
  setTab('edit');
  updateEditorStatus();
  listView.hidden = true;
  editorView.hidden = false;
  (doc.id ? contentEl : titleEl).focus();
}

function updateEditorStatus() {
  readLink.hidden = !editing?.id;
  if (editing?.id) readLink.href = `/read/${editing.id}`;
  statusEl.textContent = isDirty() ? t('editor.unsaved') : (editing?.id ? t('common.saved') : '');
}

async function save() {
  if (!editing) return;
  const title = titleEl.value.trim();
  if (!title) {
    toast(t('editor.needTitle'));
    titleEl.focus();
    return;
  }
  saveBtn.disabled = true;
  try {
    const body = { title, content: contentEl.value };
    const doc = editing.id
      ? await api(`/scripts/${editing.id}`, { method: 'PUT', body })
      : await api('/scripts', { method: 'POST', body });
    editing = { id: doc.id, savedTitle: doc.title, savedContent: doc.content };
    titleEl.value = doc.title;
    if (location.hash !== `#/edit/${doc.id}`) history.replaceState(null, '', `#/edit/${doc.id}`);
    toast(t('editor.savedToast'));
  } catch (err) {
    if (err.status === 401) toast(t('editor.sessionExpired'), 5000);
    else toast(err.message);
  } finally {
    saveBtn.disabled = false;
    updateEditorStatus();
  }
}

function setTab(tab) {
  const preview = tab === 'preview';
  $('tab-edit').setAttribute('aria-selected', String(!preview));
  $('tab-preview').setAttribute('aria-selected', String(preview));
  contentEl.hidden = preview;
  previewEl.hidden = !preview;
  if (preview) previewEl.innerHTML = renderMarkdown(contentEl.value);
}

// ---------- Rotas (hash) ----------

let currentHash = location.hash;

async function route() {
  const hash = location.hash || '#/';
  const edit = hash.match(/^#\/edit\/([\w-]+)$/);
  if (edit) return openEditor(edit[1]);
  if (hash === '#/new') return openEditor(null);
  editing = null;
  editorView.hidden = true;
  listView.hidden = false;
  await loadList();
}

window.addEventListener('hashchange', () => {
  if (isDirty() && !confirm(t('editor.leaveConfirm'))) {
    history.replaceState(null, '', currentHash);
    return;
  }
  currentHash = location.hash;
  route();
});

window.addEventListener('beforeunload', (event) => {
  if (isDirty()) event.preventDefault();
});

// ---------- Eventos ----------

searchEl.addEventListener('input', renderList);
$('new-script').addEventListener('click', () => { location.hash = '#/new'; });
$('import').addEventListener('change', (e) => {
  importFiles(e.target.files);
  e.target.value = '';
});
saveBtn.addEventListener('click', save);
$('tab-edit').addEventListener('click', () => setTab('edit'));
$('tab-preview').addEventListener('click', () => setTab('preview'));
titleEl.addEventListener('input', updateEditorStatus);
contentEl.addEventListener('input', updateEditorStatus);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && editing) {
    e.preventDefault();
    save();
  }
});

// Tab insere tabulação no editor em vez de mudar o foco.
contentEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
  e.preventDefault();
  contentEl.setRangeText('  ', contentEl.selectionStart, contentEl.selectionEnd, 'end');
  updateEditorStatus();
});


// Troca de idioma: refaz os textos gerados pelo script.
window.addEventListener('glimpse:language', () => {
  renderList();
  updateEditorStatus();
  if (!previewEl.hidden) previewEl.innerHTML = renderMarkdown(contentEl.value);
});

// Arrastar e soltar arquivos na lista para importar.
let dragDepth = 0;
const dropHint = $('drop-hint');
const canDrop = (e) => isAdmin() && !listView.hidden && e.dataTransfer?.types.includes('Files');
document.addEventListener('dragenter', (e) => {
  if (!canDrop(e)) return;
  dragDepth += 1;
  dropHint.hidden = false;
});
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropHint.hidden = true;
});
document.addEventListener('dragover', (e) => {
  if (canDrop(e)) e.preventDefault();
});
document.addEventListener('drop', (e) => {
  dragDepth = 0;
  dropHint.hidden = true;
  if (!canDrop(e)) return;
  e.preventDefault();
  importFiles(e.dataTransfer.files);
});

// ---------- Início ----------

session = await getSession();
if (!session.configured) {
  location.replace('/setup');
} else if (!session.authenticated && !session.publicRead) {
  goToLogin();
} else {
  document.querySelectorAll('.admin-only').forEach((el) => { el.hidden = !isAdmin(); });
  mountMenu($('app-menu'), { isAdmin: isAdmin() });
  route();
}
