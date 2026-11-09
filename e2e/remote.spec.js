import { test, expect, E2E_PASSWORD } from './fixtures.js';
import { devices } from '@playwright/test';

// Celular com o leitor aberto, num contexto (aparelho) separado.
async function openPhoneReader(browser, doc) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'pt-BR' });
  const phone = await ctx.newPage();
  await phone.request.post('/api/login', { headers: { 'x-glimpse': '1' }, data: { password: E2E_PASSWORD } });
  await phone.goto(`/read/${doc.id}`);
  await expect(phone.locator('#text h1').first()).toBeVisible();
  return { ctx, phone };
}

const fontSize = (page) => page.locator('#text').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
const scrollOffset = (page) => page.locator('#scroller').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);

test.describe('Controle remoto', () => {
  test.skip(({ isMobile }) => isMobile, 'o controle roda no computador');

  test('o computador controla o leitor aberto no celular', async ({ browser, adminPage: laptop, createScript, setSettings }) => {
    await setSettings({ countdown: 0, speed: 12, fontSize: 48 });
    const doc = await createScript(`Remoto ${Date.now()}`);
    const { ctx, phone } = await openPhoneReader(browser, doc);
    try {
      await laptop.goto('/');
      await laptop.click('#menu-button');
      await laptop.click('#menu-remote');
      await expect(laptop).toHaveURL(/\/remote$/);

      // Escolhe o leitor pela lista (ou já abre, se for o único).
      const item = laptop.locator('.reader-item', { hasText: doc.title });
      if (await laptop.locator('#list-view').isVisible()) await item.click();
      await expect(laptop.locator('#target-title')).toHaveText(doc.title);
      await expect(laptop.locator('#target-meta')).toContainText('Android');
      await expect(laptop.locator('#target-speed')).toHaveText('12');
      await expect(laptop.locator('#target-font')).toHaveText('48px');

      // Reproduzir / pausar
      await laptop.click('#remote-play');
      await expect(phone.locator('body')).toHaveClass(/playing/);
      await expect(laptop.locator('#remote-play-label')).toHaveText('Pausar');
      await laptop.click('#remote-play');
      await expect(phone.locator('body')).not.toHaveClass(/playing/);
      await expect(laptop.locator('#remote-play-label')).toHaveText('Reproduzir');

      // Velocidade + e −
      await laptop.click('[data-remote=speedUp]');
      await laptop.click('[data-remote=speedUp]');
      await expect(phone.locator('#speed-val')).toHaveText('14');
      await expect(laptop.locator('#target-speed')).toHaveText('14');
      await laptop.click('[data-remote=speedDown]');
      await expect(phone.locator('#speed-val')).toHaveText('13');

      // Tamanho do texto + e −
      await laptop.click('[data-remote=fontUp]');
      await expect.poll(() => fontSize(phone)).toBe(52);
      await expect(laptop.locator('#target-font')).toHaveText('52px');
      await laptop.click('[data-remote=fontDown]');
      await expect.poll(() => fontSize(phone)).toBe(48);

      // Avançar e voltar trecho
      const start = await scrollOffset(phone);
      await laptop.click('[data-remote=jumpForward]');
      await expect.poll(() => scrollOffset(phone)).toBeLessThan(start - 10);
      await laptop.click('[data-remote=jumpBack]');
      await expect.poll(() => scrollOffset(phone)).toBeCloseTo(start, 0);
    } finally {
      await ctx.close();
    }
  });

  test('atalhos de teclado do computador também controlam o celular', async ({ browser, adminPage: laptop, createScript, setSettings }) => {
    await setSettings({ countdown: 0, speed: 12 });
    const doc = await createScript(`Teclado remoto ${Date.now()}`);
    const { ctx, phone } = await openPhoneReader(browser, doc);
    try {
      await laptop.goto('/remote');
      const item = laptop.locator('.reader-item', { hasText: doc.title });
      if (await laptop.locator('#list-view').isVisible()) await item.click();
      await expect(laptop.locator('#target-title')).toHaveText(doc.title);

      await laptop.keyboard.press('Space');
      await expect(phone.locator('body')).toHaveClass(/playing/);
      await laptop.keyboard.press('ArrowRight');
      await expect(phone.locator('#speed-val')).toHaveText('13');
      await laptop.keyboard.press('Space');
      await expect(phone.locator('body')).not.toHaveClass(/playing/);
    } finally {
      await ctx.close();
    }
  });

  test('lista mostra os leitores abertos e avisa quando o escolhido fecha', async ({ browser, adminPage: laptop, createScript }) => {
    const a = await createScript(`Leitor A ${Date.now()}`);
    const b = await createScript(`Leitor B ${Date.now()}`);
    const first = await openPhoneReader(browser, a);
    const second = await openPhoneReader(browser, b);
    try {
      await laptop.goto('/remote');
      await expect(laptop.locator('.reader-item', { hasText: a.title })).toBeVisible();
      await expect(laptop.locator('.reader-item', { hasText: b.title })).toContainText('Pausado');

      await laptop.locator('.reader-item', { hasText: b.title }).click();
      await expect(laptop.locator('#target-title')).toHaveText(b.title);

      await second.ctx.close(); // celular fechou o leitor
      await expect(laptop.locator('.toast')).toContainText('fechado');
      await expect(laptop.locator('#list-view')).toBeVisible();
      await expect(laptop.locator('.reader-item', { hasText: b.title })).toHaveCount(0);
      await expect(laptop.locator('.reader-item', { hasText: a.title })).toBeVisible();
    } finally {
      await first.ctx.close();
      await second.ctx.close().catch(() => {});
    }
  });

  test('sem leitores abertos mostra a explicação', async ({ adminPage: laptop }) => {
    await laptop.goto('/remote');
    await expect(laptop.locator('#empty')).toContainText('Nenhum leitor aberto');
  });

  test('página do controle remoto exige login', async ({ page }) => {
    await page.goto('/remote');
    await expect(page).toHaveURL(/\/login\?next=%2Fremote/);
  });
});
