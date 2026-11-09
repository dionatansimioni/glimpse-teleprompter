import { test as base, expect } from '@playwright/test';
import { E2E_PASSWORD } from '../playwright.config.js';

export { expect, E2E_PASSWORD };

export const SAMPLE = `# Abertura

Olá, pessoal! Bem-vindos a mais um vídeo.

> mostrar o terminal

Hoje vamos falar sobre **Linux** e ==Docker==.

${Array.from({ length: 40 }, (_, i) => `Linha de conteúdo número ${i + 1} do roteiro de teste.`).join('\n\n')}

# Encerramento

Até a próxima!`;

export const test = base.extend({
  // Falha o teste se a página tiver qualquer erro de JavaScript.
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      // Respostas HTTP de erro esperadas (401/404) aparecem como "Failed to load resource".
      if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) errors.push(msg.text());
    });
    await use(page);
    expect(errors, 'erros no console do navegador').toEqual([]);
  },

  // Página já autenticada como administrador.
  adminPage: async ({ page }, use) => {
    const res = await page.request.post('/api/login', {
      headers: { 'x-glimpse': '1' },
      data: { password: E2E_PASSWORD },
    });
    expect(res.ok()).toBeTruthy();
    await use(page);
  },

  // Cria um roteiro pela API e devolve o documento.
  createScript: async ({ adminPage }, use) => {
    await use(async (title = 'Roteiro de teste', content = SAMPLE) => {
      const res = await adminPage.request.post('/api/scripts', {
        headers: { 'x-glimpse': '1' },
        data: { title, content },
      });
      expect(res.status()).toBe(201);
      return res.json();
    });
  },
});

// Deslocamento vertical atual do texto (translateY do scroller).
export async function scrollOffset(page) {
  return page.locator('#scroller').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);
}
