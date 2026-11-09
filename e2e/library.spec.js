import { test, expect, E2E_PASSWORD } from './fixtures.js';

test('redireciona para o login e entra com a senha', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.fill('#password', 'errada');
  await page.click('button[type=submit]');
  await expect(page.locator('#error')).toHaveText('Senha incorreta.');
  await page.fill('#password', E2E_PASSWORD);
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#new-script')).toBeVisible();
});

test('cria, edita e exclui um roteiro pela interface', async ({ adminPage: page }) => {
  const title = `Vídeo ${Date.now()}`;
  await page.goto('/');
  await page.click('#new-script');
  await page.fill('#title', title);
  await page.fill('#content', '# Olá\n\nPrimeiro **roteiro**.');
  await expect(page.locator('#status')).toHaveText('Alterações não salvas');

  await page.click('#tab-preview');
  await expect(page.locator('#preview strong')).toHaveText('roteiro');
  await page.click('#tab-edit');

  await page.click('#save');
  await expect(page.locator('#status')).toHaveText('Salvo');
  await expect(page).toHaveURL(/#\/edit\//);
  await expect(page.locator('#read-link')).toBeVisible();

  await page.click('text=← Voltar');
  const item = page.locator('.script', { hasText: title });
  await expect(item).toBeVisible();
  await expect(item.locator('.script-meta')).toContainText('3 palavras');

  await item.locator('text=Editar').click();
  await page.fill('#title', `${title} (editado)`);
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status')).toHaveText('Salvo');
  await page.click('text=← Voltar');
  await expect(page.locator('.script', { hasText: `${title} (editado)` })).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await page.locator('.script', { hasText: title }).locator('button', { hasText: 'Excluir' }).click();
  await expect(page.locator('.script', { hasText: title })).toHaveCount(0);
});

test('avisa antes de sair do editor com alterações não salvas', async ({ adminPage: page }) => {
  await page.goto('/#/new');
  await page.fill('#title', 'Rascunho');
  page.once('dialog', (d) => d.dismiss());
  await page.click('text=← Voltar');
  await expect(page.locator('#editor-view')).toBeVisible();
  await expect(page.locator('#title')).toHaveValue('Rascunho');
});

test('importa arquivo .md usando o título do cabeçalho', async ({ adminPage: page }) => {
  const title = `Importado ${Date.now()}`;
  await page.goto('/');
  await page.setInputFiles('#import', {
    name: 'roteiro.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(`---\ntitle: ${title}\n---\n# Cabeçalho\nTexto importado.`),
  });
  await expect(page.locator('.script', { hasText: title })).toBeVisible();
});

test('busca filtra a lista', async ({ adminPage: page, createScript }) => {
  const id = Date.now();
  await createScript(`Alfa ${id}`);
  await createScript(`Beta ${id}`);
  await page.goto('/');
  await page.fill('#search', `alfa ${id}`);
  await expect(page.locator('.script', { hasText: `Alfa ${id}` })).toBeVisible();
  await expect(page.locator('.script', { hasText: `Beta ${id}` })).toHaveCount(0);
});

test('altera a senha pelo diálogo e volta para a original', async ({ adminPage: page }) => {
  await page.goto('/');
  const open = () => page.click('#change-password');
  const fill = async (current, password, confirm = password) => {
    await page.fill('#pw-current', current);
    await page.fill('#pw-new', password);
    await page.fill('#pw-confirm', confirm);
    await page.click('#password-form button[type=submit]');
  };

  await open();
  await expect(page.locator('#password-dialog')).toBeVisible();
  await fill(E2E_PASSWORD, 'nova-senha-456', 'diferente-456');
  await expect(page.locator('#password-error')).toHaveText('A confirmação não confere com a senha.');
  await fill('senha-errada', 'nova-senha-456');
  await expect(page.locator('#password-error')).toHaveText('A senha atual está incorreta.');
  await fill(E2E_PASSWORD, 'nova-senha-456');
  await expect(page.locator('#password-dialog')).toBeHidden();
  await expect(page.locator('.toast')).toContainText('Senha alterada');

  // Continua logado e consegue usar a biblioteca.
  await page.reload();
  await expect(page.locator('#new-script')).toBeVisible();

  // Restaura a senha original para os demais testes.
  await open();
  await fill('nova-senha-456', E2E_PASSWORD);
  await expect(page.locator('#password-dialog')).toBeHidden();
});
