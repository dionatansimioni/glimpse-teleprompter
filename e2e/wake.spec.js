import { test, expect } from './fixtures.js';

const video = (page) => page.locator('video.keep-awake');

test.describe('Manter a tela acesa', () => {
  let doc;
  test.beforeEach(async ({ createScript }) => {
    doc = await createScript('Roteiro tela acesa');
  });

  test('com a Wake Lock API disponível (HTTPS), usa a API', async ({ page }) => {
    // Simula uma Wake Lock API que sempre concede o pedido.
    await page.addInitScript(() => {
      window.__wakeRequests = 0;
      Object.defineProperty(Navigator.prototype, 'wakeLock', {
        configurable: true,
        get: () => ({
          request: async () => {
            window.__wakeRequests += 1;
            return { released: false, addEventListener() {}, release: async () => {} };
          },
        }),
      });
    });
    await page.goto(`/read/${doc.id}`);
    await expect(page.locator('body')).toHaveAttribute('data-wake', 'wakelock');
    expect(await page.evaluate(() => window.__wakeRequests)).toBe(1);
    await expect(video(page)).toHaveCount(0);

    await page.click('[data-action=settings]');
    await expect(page.locator('#wake-status')).toHaveText('Ativo.');
  });

  test('sem a Wake Lock API (HTTP pelo IP), toca o vídeo invisível após um toque', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => undefined });
    });
    await page.goto(`/read/${doc.id}`);
    await expect(page.locator('#text h1, #text p').first()).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-wake', /^(video|blocked)$/);

    await page.locator('#stage').click(); // gesto do usuário
    await expect(page.locator('body')).toHaveAttribute('data-wake', 'video');
    const state = await video(page).evaluate((v) => ({
      paused: v.paused, muted: v.muted, loop: v.loop, inline: v.playsInline,
      src: v.currentSrc, opacity: getComputedStyle(v).opacity,
      covers: v.getBoundingClientRect().width === innerWidth,
    }));
    expect(state).toMatchObject({ paused: false, muted: false, loop: true, inline: true, covers: true });
    expect(state.src).toMatch(/keep-awake\.(webm|mp4)$/);
    expect(Number(state.opacity)).toBeLessThan(0.05);

    await page.click('[data-action=settings]');
    await expect(page.locator('#wake-status')).toContainText('compatibilidade');

    // Desligar a opção pausa o vídeo.
    await page.locator('[data-setting=keepAwake]').uncheck();
    await expect(page.locator('#wake-status')).toContainText('Desativado');
    await expect.poll(() => video(page).evaluate((v) => v.paused)).toBe(true);
    await expect(page.locator('body')).toHaveAttribute('data-wake', 'off');
  });

  test('o vídeo não atrapalha o toque para reproduzir/pausar', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => undefined });
    });
    await page.evaluate(() => 0);
    await page.goto(`/read/${doc.id}`);
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('glimpse.settings.v1') || '{}');
      localStorage.setItem('glimpse.settings.v1', JSON.stringify({ ...s, countdown: 0 }));
    });
    await page.reload();
    await expect(page.locator('#text h1, #text p').first()).toBeVisible();
    await page.locator('#stage').click();
    await expect(page.locator('body')).toHaveClass(/playing/);
    await page.locator('#stage').click();
    await expect(page.locator('body')).not.toHaveClass(/playing/);
  });
});
