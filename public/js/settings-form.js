// Monta o formulário de configurações a partir de SETTINGS_FORM (settings.js).
// Usado pelo painel do leitor e pela página de configurações.
import { SETTINGS_FORM, GLOBAL_ONLY } from './settings.js';
import { t } from './i18n.js';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

// container: onde inserir as seções.
// onChange(key, value): chamado a cada alteração.
// overridable: mostra o botão "usar geral" (ajustes por roteiro) e chama onClearOverride(key).
// wakeStatus: adiciona a linha de status de "Manter a tela acesa" (id wake-status).
export function renderSettingsForm(container, { onChange, overridable = false, onClearOverride, wakeStatus = false }) {
  const inputs = new Map();
  const outputs = new Map();

  const build = () => {
    container.replaceChildren(...SETTINGS_FORM.map((section) => {
      const nodes = [el('h3', { textContent: t(`section.${section.id}`) })];
      for (const field of section.fields) {
        const { key } = field;
        let input;
        let row;
        if (field.type === 'checkbox') {
          input = el('input', { type: 'checkbox' });
          row = el('label', { className: 'check' }, [input, ` ${t(`setting.${key}`)}`]);
        } else {
          input = field.type === 'range'
            ? el('input', { type: 'range', min: field.min, max: field.max, step: field.step })
            : el('select', {}, field.options.map((value) => el('option', { value, textContent: t(`setting.${key}.${value}`) })));
          const head = el('span', {}, [t(`setting.${key}`)]);
          if (field.type === 'range') {
            const out = el('output', { dataset: { for: key, unit: field.unit } });
            outputs.set(key, out);
            head.append(out);
          }
          row = el('label', { className: 'field' }, [head, input]);
        }
        input.dataset.setting = key;
        input.addEventListener('input', () => {
          const value = input.type === 'checkbox' ? input.checked
            : input.type === 'range' ? Number(input.value)
            : input.value;
          onChange(key, value);
        });
        inputs.set(key, input);

        if (GLOBAL_ONLY.includes(key)) {
          row.classList.add('global-only');
          row.dataset.globalLabel = t('panel.globalOnly');
        } else if (overridable) {
          const reset = el('button', {
            type: 'button',
            className: 'reset-override',
            textContent: t('panel.useGlobal'),
            title: t('panel.useGlobalTitle'),
            dataset: { reset: key },
          });
          reset.addEventListener('click', (event) => {
            event.preventDefault();
            onClearOverride?.(key);
          });
          (row.querySelector(':scope > span') ?? row).append(reset);
        }
        nodes.push(row);
        if (field.note) nodes.push(el('p', { className: 'note', textContent: t(`setting.${key}.note`) }));
        if (wakeStatus && key === 'keepAwake') {
          nodes.push(el('p', { className: 'note', id: 'wake-status', 'aria-live': 'polite' }));
        }
      }
      return el('section', {}, nodes);
    }));
  };

  build();

  return {
    // Atualiza os campos com a configuração efetiva e marca os itens sobrescritos.
    sync(settings, overrides = {}) {
      for (const [key, input] of inputs) {
        if (input.type === 'checkbox') input.checked = settings[key];
        else input.value = String(settings[key]);
        input.closest('.field, .check').classList.toggle('overridden', Object.hasOwn(overrides, key));
      }
      for (const [key, out] of outputs) out.textContent = `${settings[key]}${out.dataset.unit ?? ''}`;
    },
    // Recria com os textos no idioma atual (os valores são reaplicados com sync()).
    rebuild() {
      inputs.clear();
      outputs.clear();
      build();
    },
  };
}
