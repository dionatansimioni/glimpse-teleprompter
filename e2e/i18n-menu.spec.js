import { test, expect, E2E_PASSWORD } from './fixtures.js';

test.describe('Idioma', () => {
  test('o usuário escolhe inglês na tela de login e o app inteiro fica em inglês', async ({ browser, createScript }) => {
    const doc = await createScript(`Language ${Date.now()}`);
    const ctx = await browser.newContext({ locale: 'pt-BR' });
    try {
      const page = await ctx.newPage();
      await page.goto('/');
      await expect(page).toHaveURL(/\/login/);
      await expect(page.locator('button[type=submit]')).toHaveText('Entrar');

      await page.click('[data-lang-option=en]');
      await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
      await expect(page.locator('button[type=submit]')).toHaveText('Sign in');
      await expect(page.locator('[data-lang-option=en]')).toHaveAttribute('aria-pressed', 'true');

      await page.fill('#password', 'wrong-password');
      await page.click('button[type=submit]');
      await expect(page.locator('#error')).toHaveText('Wrong password.');
      await page.fill('#password', E2E_PASSWORD);
      await page.click('button[type=submit]');

      // Biblioteca em inglês
      await expect(page.locator('#new-script')).toHaveText('New script');
      await expect(page.locator('.script', { hasText: doc.title }).locator('a', { hasText: 'Read' })).toBeVisible();
      await expect(page.locator('.script', { hasText: doc.title }).locator('.script-meta')).toContainText('words');

      // Leitor em inglês
      await page.goto(`/read/${doc.id}`);
      await expect(page.locator('.end-mark')).toHaveText('• • • END • • •');
      await page.click('[data-action=settings]');
      await expect(page.locator('#panel h2')).toHaveText('Settings');
      await expect(page.locator('[data-scope=global]')).toHaveText('All scripts');
      await expect(page.locator('.field', { has: page.locator('[data-setting=speed]') })).toContainText('Speed');
      await expect(page.getByRole('button', { name: 'Add key for Play / pause' })).toBeVisible();

      // A escolha fica salva neste aparelho
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
    } finally {
      await ctx.close();
    }
  });

  test('navegador em inglês abre em inglês; navegador em outro idioma também', async ({ browser }) => {
    for (const locale of ['en-US', 'de-DE']) {
      const ctx = await browser.newContext({ locale });
      try {
        const page = await ctx.newPage();
        await page.goto('/login');
        await expect(page.locator('button[type=submit]')).toHaveText('Sign in');
      } finally {
        await ctx.close();
      }
    }
  });

  test('trocar o idioma pelo menu atualiza a tela na hora', async ({ adminPage: page, createScript }) => {
    const doc = await createScript(`Menu lang ${Date.now()}`);
    await page.goto('/');
    await page.click('#menu-button');
    await page.click('[role=menuitemradio][data-lang-option=en]');
    await expect(page.locator('#new-script')).toHaveText('New script');
    await expect(page.locator('.script', { hasText: doc.title }).locator('a', { hasText: 'Read' })).toBeVisible();
    await page.click('#menu-button');
    await expect(page.locator('[role=menuitemradio][data-lang-option=en]')).toHaveAttribute('aria-checked', 'true');
    await page.click('[role=menuitemradio][data-lang-option=pt]');
    await expect(page.locator('#new-script')).toHaveText('Novo roteiro');
  });
});

test.describe('Menu do canto superior direito', () => {
  test('mostra configurações, idioma, alterar senha e sair', async ({ adminPage: page }) => {
    await page.goto('/');
    const button = page.locator('#menu-button');
    const box = await button.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThan(viewport.width * 0.75); // lado direito
    expect(box.y).toBeLessThan(60); // no topo
    // É o último item da barra superior (nada à direita dele).
    const topbarRight = await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().right - parseFloat(getComputedStyle(el).paddingRight));
    expect(Math.abs(box.x + box.width - topbarRight)).toBeLessThan(2);

    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['Configurações do teleprompter', 'Português', 'English', 'Alterar senha', 'Sair']) {
      await expect(page.locator('#menu-list').getByText(name, { exact: true })).toBeVisible();
    }
    await expect(page.locator('#login-link')).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-list')).toBeHidden();
    await button.click();
    await page.mouse.click(10, 300); // clicar fora fecha
    await expect(page.locator('#menu-list')).toBeHidden();
  });

  test('sair encerra a sessão', async ({ adminPage: page }) => {
    await page.goto('/');
    await page.click('#menu-button');
    await page.click('#logout');
    await expect(page).toHaveURL(/\/login/);
    const res = await page.request.get('/api/scripts');
    expect(res.status()).toBe(401);
  });

  test('página de configurações altera a configuração geral usada pelo leitor', async ({ adminPage: page, createScript }) => {
    const doc = await createScript(`Settings page ${Date.now()}`);
    await page.goto('/');
    await page.click('#menu-button');
    await page.click('#menu-settings');
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator('h1')).toHaveText('Configurações do teleprompter');

    await page.locator('[data-setting=fontSize]').fill('84');
    await expect(page.locator('output[data-for=fontSize]')).toHaveText('84px');
    await page.locator('[data-setting=theme]').selectOption('yellow');
    await expect(page.locator('#save-status')).toHaveText('Salvo');

    await page.goto(`/read/${doc.id}`);
    await expect(page.locator('#text h1').first()).toBeVisible();
    expect(await page.locator('#text').evaluate((el) => getComputedStyle(el).fontSize)).toBe('84px');
    await expect(page.locator('body')).toHaveClass(/theme-yellow/);
  });

  test('atalhos editados na página de configurações valem no leitor', async ({ adminPage: page, createScript, isMobile }) => {
    test.skip(isMobile, 'teclado testado no desktop');
    const doc = await createScript(`Settings keys ${Date.now()}`);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Adicionar tecla para Tela cheia' }).click();
    await page.keyboard.press('KeyG');
    await expect(page.locator('.binding', { hasText: 'Tela cheia' }).locator('.chip', { hasText: /^G✕$/ })).toBeVisible();
    await expect(page.locator('#save-status')).toHaveText('Salvo');
    const res = await page.request.get('/api/settings');
    expect((await res.json()).bindings.fullscreen).toContain('KeyG');
  });

  test('página de configurações exige login', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
  });
});
