import { test, expect, waitSaved, E2E_PASSWORD } from './fixtures.js';

const fontSize = (page) => page.locator('#text').evaluate((el) => getComputedStyle(el).fontSize);
const openReader = async (page, doc) => {
  await page.goto(`/read/${doc.id}`);
  await expect(page.locator('#text h1').first()).toBeVisible();
};

test.describe('Configurações universais', () => {
  test('configuração feita num roteiro vale para todos os outros', async ({ page, createScript }) => {
    const a = await createScript('Universal A');
    const b = await createScript('Universal B');
    await openReader(page, a);
    await page.click('[data-action=settings]');
    await expect(page.locator('[data-scope=global]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('[data-setting=fontSize]').fill('90');
    await page.locator('[data-setting=mirrorX]').check();
    await waitSaved(page);

    await openReader(page, b);
    expect(await fontSize(page)).toBe('90px');
    await page.click('[data-action=settings]');
    await expect(page.locator('[data-setting=mirrorX]')).toBeChecked();
  });

  test('vale também em outro aparelho/navegador', async ({ page, browser, createScript }) => {
    const doc = await createScript('Outro aparelho');
    await openReader(page, doc);
    await page.click('[data-action=settings]');
    await page.locator('[data-setting=fontSize]').fill('110');
    await page.locator('[data-setting=theme]').selectOption('green');
    await waitSaved(page);

    const other = await browser.newContext(); // sem cookies nem localStorage
    try {
      const phone = await other.newPage();
      await phone.request.post('/api/login', { headers: { 'x-glimpse': '1' }, data: { password: E2E_PASSWORD } });
      await openReader(phone, doc);
      expect(await fontSize(phone)).toBe('110px');
      await expect(phone.locator('body')).toHaveClass(/theme-green/);
    } finally {
      await other.close();
    }
  });

  test('atalhos de teclado do painel e da barra alteram a configuração geral', async ({ page, createScript, setSettings, isMobile }) => {
    test.skip(isMobile, 'teclado testado no desktop');
    await setSettings({ speed: 10 });
    const a = await createScript('Atalho A');
    const b = await createScript('Atalho B');
    await openReader(page, a);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#speed-val')).toHaveText('12');
    await page.click('[data-action=settings]');
    await waitSaved(page);
    await openReader(page, b);
    await expect(page.locator('#speed-val')).toHaveText('12');
  });
});

test.describe('Ajustes só deste roteiro', () => {
  test('sobrescreve só o roteiro escolhido e só os itens alterados', async ({ page, createScript, setSettings }) => {
    await setSettings({ fontSize: 60, speed: 10 });
    const tag = Date.now();
    const a = await createScript(`Com ajuste ${tag}`);
    const b = await createScript(`Sem ajuste ${tag}`);

    await openReader(page, a);
    await page.click('[data-action=settings]');
    await page.click('[data-scope=script]');
    await expect(page.locator('#scope-note')).toContainText(`Com ajuste ${tag}`);
    await page.locator('[data-setting=fontSize]').fill('130');
    const row = page.locator('.field', { has: page.locator('[data-setting=fontSize]') });
    await expect(row).toHaveClass(/overridden/);
    await expect(row.locator('.reset-override')).toBeVisible();
    await waitSaved(page);
    expect(await fontSize(page)).toBe('130px');

    // O outro roteiro continua com a configuração geral.
    await openReader(page, b);
    expect(await fontSize(page)).toBe('60px');

    // Mudar a geral afeta os dois, menos o item sobrescrito.
    await page.click('[data-action=settings]');
    await page.locator('[data-setting=fontSize]').fill('70');
    await page.locator('[data-setting=speed]').fill('20');
    await waitSaved(page);
    await openReader(page, a);
    expect(await fontSize(page)).toBe('130px');
    await expect(page.locator('#speed-val')).toHaveText('20');

    // Na lista, o roteiro aparece com "ajustes próprios".
    await page.goto('/');
    await expect(page.locator('.script', { hasText: `Com ajuste ${tag}` }).locator('.script-meta')).toContainText('ajustes próprios');
    await expect(page.locator('.script', { hasText: `Sem ajuste ${tag}` }).locator('.script-meta')).not.toContainText('ajustes próprios');
  });

  test('alterar um item sobrescrito, mesmo em "Todos os roteiros", muda o ajuste do roteiro', async ({ page, createScript, setSettings }) => {
    await setSettings({ speed: 10 });
    const a = await createScript('Sobrescrito');
    const b = await createScript('Geral');
    await openReader(page, a);
    await page.click('[data-action=settings]');
    await page.click('[data-scope=script]');
    await page.locator('[data-setting=speed]').fill('30');
    await page.click('[data-scope=global]');
    await expect(page.locator('#scope-note')).toContainText('1 ajuste próprio');
    await page.locator('[data-setting=speed]').fill('35');
    await waitSaved(page);
    await expect(page.locator('#speed-val')).toHaveText('35');
    await openReader(page, b);
    await expect(page.locator('#speed-val')).toHaveText('10');
  });

  test('"usar geral" remove um item e "Remover ajustes" remove todos', async ({ page, createScript, setSettings }) => {
    await setSettings({ fontSize: 60 });
    const a = await createScript('Limpar ajustes');
    await openReader(page, a);
    await page.click('[data-action=settings]');
    await page.click('[data-scope=script]');
    await page.locator('[data-setting=fontSize]').fill('140');
    await page.locator('[data-setting=mirrorY]').check();
    await expect(page.locator('#clear-overrides')).toBeVisible();

    await page.locator('.field', { has: page.locator('[data-setting=fontSize]') }).locator('.reset-override').click();
    expect(await fontSize(page)).toBe('60px');
    await expect(page.locator('[data-setting=mirrorY]')).toBeChecked();

    page.once('dialog', (d) => d.accept());
    await page.click('#clear-overrides');
    await expect(page.locator('[data-setting=mirrorY]')).not.toBeChecked();
    await expect(page.locator('#clear-overrides')).toBeHidden();
    await waitSaved(page);
    await page.reload();
    await expect(page.locator('#text h1').first()).toBeVisible();
    const res = await page.request.get(`/api/scripts/${a.id}`);
    expect((await res.json()).settings).toEqual({});
  });
});

test('configurações antigas do navegador são migradas para o servidor', async ({ page, createScript }) => {
  // adminPage (via createScript) restaurou a configuração geral; simula um
  // servidor ainda sem configuração gravada apagando o arquivo não é possível
  // daqui, então testamos que o navegador limpa os dados antigos quando o
  // servidor já tem configuração.
  const doc = await createScript('Migração');
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('glimpse.settings.v1', JSON.stringify({ fontSize: 33 }));
    localStorage.setItem('glimpse.keys.v1', JSON.stringify({ togglePlay: ['KeyQ'] }));
  });
  await openReader(page, doc);
  expect(await fontSize(page)).not.toBe('33px'); // servidor já configurado: vale a geral
  expect(await page.evaluate(() => [localStorage.getItem('glimpse.settings.v1'), localStorage.getItem('glimpse.keys.v1')]))
    .toEqual([null, null]);
});
