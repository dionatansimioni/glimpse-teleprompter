// Lado do leitor no controle remoto: registra este leitor no servidor, executa
// os comandos recebidos e informa o estado (tocando, velocidade, tamanho, progresso).
import { api } from './common.js';
import { REMOTE_ACTIONS } from './keys.js';

const STATE_INTERVAL_MS = 250;

export function connectRemoteReader({ scriptId, onCommand, getState }) {
  let id = null;
  let lastSent = '';
  let timer = 0;
  let closed = false;

  // EventSource reconecta sozinho; a cada reconexão o servidor manda um novo id.
  const source = new EventSource(`/api/remote/reader?script=${encodeURIComponent(scriptId)}`);
  source.addEventListener('hello', (event) => {
    id = JSON.parse(event.data).id;
    lastSent = '';
    push();
  });
  source.addEventListener('command', (event) => {
    const { action } = JSON.parse(event.data);
    if (REMOTE_ACTIONS.includes(action)) onCommand(action);
  });

  async function push() {
    timer = 0;
    if (!id || closed) return;
    const state = getState();
    const json = JSON.stringify(state);
    if (json === lastSent) return;
    lastSent = json;
    try {
      await api(`/remote/readers/${id}/state`, { method: 'POST', body: { state } });
    } catch {
      lastSent = ''; // tenta de novo na próxima mudança (ex.: após reconectar)
    }
  }

  return {
    // Pode ser chamado a cada quadro: agrupa as mudanças e envia no máximo a cada 250 ms.
    report() {
      if (!timer && !closed) timer = setTimeout(push, STATE_INTERVAL_MS);
    },
    close() {
      closed = true;
      clearTimeout(timer);
      source.close();
    },
  };
}
