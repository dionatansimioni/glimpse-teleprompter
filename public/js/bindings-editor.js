// Editor de atalhos: lista as ações com suas teclas, adiciona (capturando a
// próxima tecla, botão de controle Bluetooth ou de gamepad) e remove.
// Usado pelo painel do leitor e pela página de configurações.
import {
  ACTIONS, bindingFromKeyEvent, bindingLabel, assignBinding, removeBinding, actionLabel,
  gamepadButtonBinding, gamepadAxisBinding, defaultBindings,
} from './keys.js';
import { t } from './i18n.js';
import { toast } from './common.js';

// getBindings(): atalhos atuais; setBindings(b): grava (o chamador salva no servidor).
export function createBindingsEditor({ container, getBindings, setBindings }) {
  let capturing = null;
  let padRaf = 0;
  let padState = null;

  const overlay = document.createElement('div');
  overlay.className = 'capture';
  overlay.id = 'capture';
  overlay.hidden = true;
  const prompt = document.createElement('p');
  const actionName = document.createElement('b');
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.addEventListener('click', () => end());
  const box = document.createElement('div');
  box.append(prompt, cancel);
  overlay.append(box);
  document.body.append(overlay);

  function render() {
    const bindings = getBindings();
    container.replaceChildren(...ACTIONS.map((action) => {
      const label = actionLabel(action.id);
      const row = document.createElement('div');
      row.className = 'binding';
      const name = document.createElement('span');
      name.className = 'binding-label';
      name.textContent = label;
      const keys = document.createElement('div');
      keys.className = 'binding-keys';
      for (const binding of bindings[action.id]) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = bindingLabel(binding);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '✕';
        remove.title = t('shortcuts.remove');
        remove.setAttribute('aria-label', t('shortcuts.removeAria', { key: bindingLabel(binding), action: label }));
        remove.addEventListener('click', () => {
          setBindings(removeBinding(getBindings(), action.id, binding));
          render();
        });
        chip.append(remove);
        keys.append(chip);
      }
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'chip-add';
      add.textContent = '+';
      add.title = t('shortcuts.add');
      add.setAttribute('aria-label', t('shortcuts.addAria', { action: label }));
      add.addEventListener('click', () => start(action.id));
      keys.append(add);
      row.append(name, keys);
      return row;
    }));
  }

  function start(actionId) {
    capturing = actionId;
    prompt.replaceChildren(t('shortcuts.capturePrompt'), document.createElement('br'), actionName);
    actionName.textContent = actionLabel(actionId);
    cancel.textContent = t('common.cancel');
    overlay.hidden = false;
    padState = null;
    if (!padRaf && navigator.getGamepads) padRaf = requestAnimationFrame(pollPads);
  }

  function end(binding = null) {
    const actionId = capturing;
    capturing = null;
    overlay.hidden = true;
    if (!binding || !actionId) return;
    const result = assignBinding(getBindings(), actionId, binding);
    setBindings(result.bindings);
    render();
    toast(result.movedFrom
      ? t('shortcuts.moved', { key: bindingLabel(binding), from: actionLabel(result.movedFrom), to: actionLabel(actionId) })
      : t('shortcuts.assigned', { key: bindingLabel(binding), action: actionLabel(actionId) }), 3000);
  }

  // Durante a captura, a próxima tecla é do editor (não aciona atalhos da página).
  document.addEventListener('keydown', (e) => {
    if (!capturing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') end();
    else end(bindingFromKeyEvent(e));
  }, { capture: true });

  function pollPads() {
    padRaf = 0;
    if (!capturing) return;
    const now = {};
    for (const pad of [...(navigator.getGamepads?.() ?? [])].filter(Boolean)) {
      pad.buttons.forEach((b, i) => { now[gamepadButtonBinding(i)] = b.pressed || b.value > 0.5; });
      pad.axes.forEach((v, i) => {
        now[gamepadAxisBinding(i, true)] = v > 0.6;
        now[gamepadAxisBinding(i, false)] = v < -0.6;
      });
    }
    // A primeira leitura só registra o estado (botões já pressionados não contam).
    if (padState) {
      const pressed = Object.keys(now).find((b) => now[b] && !padState[b]);
      if (pressed) return end(pressed);
    }
    padState = now;
    padRaf = requestAnimationFrame(pollPads);
  }

  return {
    render,
    isCapturing: () => capturing !== null,
    reset() {
      setBindings(defaultBindings());
      render();
      toast(t('shortcuts.restored'));
    },
  };
}
