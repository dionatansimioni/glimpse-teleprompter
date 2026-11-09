import { test, expect, scrollOffset } from './fixtures.js';

test.describe('Teleprompter', () => {
  let doc;
  test.beforeEach(async ({ createScript, page }) => {
    doc = await createScript();
    await page.goto(`/read/${doc.id}`);
    await expect(page.locator('#text h1').first()).toHaveText('Abertura');
    // Sem contagem regressiva para os testes ficarem rápidos.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('glimpse.settings.v1') || '{}');
      localStorage.setItem('glimpse.settings.v1', JSON.stringify({ ...s, countdown: 0, speed: 40 }));
    });
    await page.reload();
    await expect(page.locator('#text h1').first()).toBeVisible();
  });

  test('mostra o título e renderiza o Markdown', async ({ page }) => {
    await expect(page.locator('#script-title')).toHaveText('Roteiro de teste');
    await expect(page.locator('#text strong')).toHaveText('Linux');
    await expect(page.locator('#text mark')).toHaveText('Docker');
    await expect(page.locator('#text blockquote')).toContainText('mostrar o terminal');
    await expect(page.locator('#time-left')).toHaveText(/−\d+:\d\d/);
  });

  test('reproduz e pausa: o texto rola só enquanto está tocando', async ({ page }) => {
    const start = await scrollOffset(page);
    await page.click('#btn-play');
    await expect(page.locator('body')).toHaveClass(/playing/);
    await page.waitForTimeout(700);
    const moving = await scrollOffset(page);
    expect(moving).toBeLessThan(start);

    await page.locator('#btn-play').click();
    await expect(page.locator('body')).not.toHaveClass(/playing/);
    const paused = await scrollOffset(page);
    await page.waitForTimeout(400);
    expect(await scrollOffset(page)).toBe(paused);
  });

  test('contagem regressiva antes de começar', async ({ page }) => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('glimpse.settings.v1'));
      localStorage.setItem('glimpse.settings.v1', JSON.stringify({ ...s, countdown: 2 }));
    });
    await page.reload();
    await page.click('#btn-play');
    await expect(page.locator('#countdown')).toBeVisible();
    await expect(page.locator('#countdown')).toHaveText('2');
    await expect(page.locator('body')).toHaveClass(/playing/, { timeout: 4000 });
    await expect(page.locator('#countdown')).toBeHidden();
  });

  test('atalhos padrão: Espaço, velocidade, saltos e seções', async ({ page, isMobile }) => {
    test.skip(isMobile, 'atalhos de teclado são testados no desktop');
    await page.keyboard.press('Space');
    await expect(page.locator('body')).toHaveClass(/playing/);
    await page.keyboard.press('Space');
    await expect(page.locator('body')).not.toHaveClass(/playing/);

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#speed-val')).toHaveText('41');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#speed-val')).toHaveText('39');

    const top = await scrollOffset(page);
    await page.keyboard.press('PageDown');
    await expect.poll(() => scrollOffset(page)).toBeLessThan(top);

    await page.keyboard.press('Period'); // próxima seção → "Encerramento"
    await expect.poll(async () => {
      const guide = await page.locator('#guide').boundingBox();
      const h = await page.locator('#text h1', { hasText: 'Encerramento' }).boundingBox();
      return Math.abs(h.y - (guide.y - h.height / 2));
    }).toBeLessThan(5);

    await page.keyboard.press('Home');
    await expect.poll(() => scrollOffset(page)).toBeCloseTo(top, 0);
  });

  test('configurações: tamanho, espelho e tema persistem após recarregar', async ({ page }) => {
    await page.click('[data-action=settings]');
    await expect(page.locator('#panel')).toBeVisible();

    await page.locator('[data-setting=fontSize]').fill('100');
    await expect(page.locator('output[data-for=fontSize]')).toHaveText('100px');
    await page.locator('[data-setting=mirrorX]').check();
    await page.locator('[data-setting=theme]').selectOption('yellow');
    await page.locator('[data-setting=direction]').selectOption('down');

    const fontSize = () => page.locator('#text').evaluate((el) => getComputedStyle(el).fontSize);
    const transform = () => page.locator('#stage').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    expect(await fontSize()).toBe('100px');
    expect(await transform()).toBe(-1);
    await expect(page.locator('body')).toHaveClass(/theme-yellow/);

    await page.reload();
    await expect(page.locator('#text h1').first()).toBeVisible();
    expect(await fontSize()).toBe('100px');
    expect(await transform()).toBe(-1);
    await expect(page.locator('body')).toHaveClass(/theme-yellow/);
  });

  test('direção invertida: o texto desce', async ({ page }) => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('glimpse.settings.v1'));
      localStorage.setItem('glimpse.settings.v1', JSON.stringify({ ...s, direction: 'down' }));
    });
    await page.reload();
    await expect(page.locator('#text h1').first()).toBeVisible();
    await page.click('#btn-play'); // começa do fim
    await page.waitForTimeout(300);
    const a = await scrollOffset(page);
    await page.waitForTimeout(500);
    expect(await scrollOffset(page)).toBeGreaterThan(a);
  });

  test('tecla customizada controla a reprodução', async ({ page, isMobile }) => {
    test.skip(isMobile, 'captura de tecla testada no desktop');
    await page.keyboard.press('KeyS'); // abre configurações
    await expect(page.locator('#panel')).toBeVisible();
    await page.getByRole('button', { name: 'Adicionar tecla para Reproduzir / pausar' }).click();
    await expect(page.locator('#capture')).toBeVisible();
    await page.keyboard.press('KeyM'); // M era "espelhar": deve ser movida
    await expect(page.locator('#capture')).toBeHidden();
    await expect(page.locator('.binding', { hasText: 'Reproduzir / pausar' }).locator('.chip', { hasText: /^M✕$/ })).toBeVisible();
    await expect(page.locator('.binding', { hasText: 'Espelhar horizontalmente' }).locator('.chip')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.locator('#panel')).toBeHidden();
    await page.keyboard.press('KeyM');
    await expect(page.locator('body')).toHaveClass(/playing/);

    await page.reload();
    await expect(page.locator('#text h1').first()).toBeVisible();
    await page.keyboard.press('KeyM');
    await expect(page.locator('body')).toHaveClass(/playing/);
  });

  test('restaurar atalhos padrão', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop');
    await page.keyboard.press('KeyS');
    const chips = page.locator('.binding', { hasText: 'Reproduzir / pausar' }).locator('.chip');
    const count = await chips.count();
    await chips.first().locator('button').click();
    await expect(chips).toHaveCount(count - 1);
    await page.click('#reset-keys');
    await expect(chips).toHaveCount(count);
  });

  test('tocar na tela reproduz/pausa e arrastar move o texto', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'gestos de toque testados no celular');
    const box = await page.locator('#stage').boundingBox();
    await page.touchscreen.tap(box.width / 2, box.height / 2);
    await expect(page.locator('body')).toHaveClass(/playing/);
    await page.touchscreen.tap(box.width / 2, box.height / 2);
    await expect(page.locator('body')).not.toHaveClass(/playing/);

    const before = await scrollOffset(page);
    await page.locator('#stage').dispatchEvent('pointerdown', { pointerId: 7, clientY: 500, button: 0, pointerType: 'touch', isPrimary: true });
    await page.locator('#stage').dispatchEvent('pointermove', { pointerId: 7, clientY: 300, pointerType: 'touch', isPrimary: true });
    await page.locator('#stage').dispatchEvent('pointerup', { pointerId: 7, clientY: 300, pointerType: 'touch', isPrimary: true });
    expect(await scrollOffset(page)).toBeCloseTo(before - 200, 0);
    await expect(page.locator('body')).not.toHaveClass(/playing/);
  });

  test('botão de tela cheia entra e sai da tela cheia', async ({ page }) => {
    await page.click('#btn-fs');
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await page.click('#btn-fs');
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  });

  test('ao chegar ao fim a reprodução para sozinha', async ({ page }) => {
    await page.click('#btn-play');
    await expect(page.locator('body')).toHaveClass(/playing/);
    await page.keyboard.press('End');
    await expect(page.locator('body')).not.toHaveClass(/playing/, { timeout: 3000 });
    await expect(page.locator('#progress-bar')).toHaveAttribute('style', /width: 100%/);
  });
});

test('roteiro inexistente mostra erro sem quebrar a página', async ({ adminPage: page }) => {
  await page.goto('/read/naoexiste123');
  await expect(page.locator('#text')).toHaveText('Roteiro não encontrado.');
});

test('leitor sem login redireciona para o login', async ({ page }) => {
  await page.goto('/read/qualquercoisa1');
  await expect(page).toHaveURL(/\/login\?next=%2Fread%2Fqualquercoisa1/);
});
