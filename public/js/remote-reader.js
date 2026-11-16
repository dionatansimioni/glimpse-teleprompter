// Lado do leitor no controle remoto: registra este aparelho no servidor,
// executa os comandos recebidos e informa o estado (tocando, velocidade,
// tamanho, progresso). Funciona no leitor (com roteiro) e na biblioteca (sem).
import { api } from './common.js';
import { REMOTE_ACTIONS } from './keys.js';

const STATE_INTERVAL_MS = 250;
const DEVICE_KEY = 'glimpse.device';

// Identificador fixo desta aba: sobrevive a trocas de página, para o controle
// continuar apontando para o mesmo aparelho. Por aba (e não por navegador)
// para duas abas abertas não se substituírem uma à outra.
function deviceId() {
  try {
    let id = sessionStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID().replaceAll('-', '').slice(0, 22);
      sessionStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID().replaceAll('-', '').slice(0, 22); // armazenamento indisponível
  }
}

// scriptId: roteiro aberto (null na biblioteca).
// onCommand(action): ações de leitura; onOpenScript(id) / onOpenLibrary() / onReload(): navegação.
export function connectRemoteReader({ scriptId = null, onCommand, onOpenScript, onOpenLibrary, onReload, getState = () => ({}) }) {
  const device = deviceId();
  let current = scriptId;
  let id = null;
  let lastSent = '';
  let timer = 0;
  let closed = false;
  let source = null;

  // EventSource reconecta sozinho; a cada reconexão o servidor confirma o id.
  function open() {
    const params = new URLSearchParams({ device });
    if (current) params.set('script', current);
    source = new EventSource(`/api/remote/reader?${params}`);
    source.addEventListener('hello', (event) => {
      id = JSON.parse(event.data).id;
      lastSent = '';
      push();
    });
    source.addEventListener('command', (event) => {
      const { action, scriptId: target } = JSON.parse(event.data);
      if (action === 'openScript' && typeof target === 'string') onOpenScript?.(target);
      else if (action === 'openLibrary') onOpenLibrary?.();
      else if (action === 'reload') onReload?.();
      else if (REMOTE_ACTIONS.includes(action)) onCommand?.(action);
    });
    // Outra aba assumiu este aparelho: para de reconectar.
    source.addEventListener('replaced', () => close());
  }

  async function push() {
    timer = 0;
    if (!id || closed) return;
    const json = JSON.stringify(getState());
    if (json === lastSent) return;
    lastSent = json;
    try {
      await api(`/remote/readers/${id}/state`, { method: 'POST', body: { state: JSON.parse(json) } });
    } catch {
      lastSent = ''; // tenta de novo na próxima mudança (ex.: após reconectar)
    }
  }

  function close() {
    closed = true;
    clearTimeout(timer);
    source?.close();
  }

  open();

  return {
    // Pode ser chamado a cada quadro: agrupa as mudanças e envia no máximo a cada 250 ms.
    report() {
      if (!timer && !closed) timer = setTimeout(push, STATE_INTERVAL_MS);
    },
    // O leitor passou a mostrar outro roteiro sem recarregar a página.
    setScript(next) {
      if (closed || next === current) return;
      current = next;
      id = null;
      source.close();
      open();
    },
    close,
  };
}
