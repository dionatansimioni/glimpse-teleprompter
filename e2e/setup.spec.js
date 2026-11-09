import { test, expect, E2E_PASSWORD } from './fixtures.js';

// Roda uma única vez, antes dos outros projetos, com o servidor ainda sem senha.
test('primeiro acesso: cria a senha de administrador com confirmação', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.locator('h1')).toContainText('Bem-vindo');

  // Login também leva ao setup enquanto não há senha.
  await page.goto('/login');
  await expect(page).toHaveURL(/\/setup$/);

  await page.fill('#password', 'curta');
  await page.fill('#confirm', 'curta');
  await page.click('button[type=submit]');
  await expect(page.locator('#error')).toHaveText('A senha precisa ter pelo menos 8 caracteres.');

  await page.fill('#password', E2E_PASSWORD);
  await page.fill('#confirm', `${E2E_PASSWORD}x`);
  await page.click('button[type=submit]');
  await expect(page.locator('#error')).toHaveText('A confirmação não confere com a senha.');

  await page.fill('#confirm', E2E_PASSWORD);
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#new-script')).toBeVisible();

  // Depois de configurado, /setup redireciona para a biblioteca.
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/$/);
});
