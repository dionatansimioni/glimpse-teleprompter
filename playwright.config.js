import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const PORT = 3999;
export const E2E_PASSWORD = 'senha-e2e-123';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'pt-BR', // os testes em inglês usam um contexto próprio
    trace: 'retain-on-failure',
  },
  projects: [
    // Roda primeiro, com o servidor ainda sem senha: testa a tela de setup inicial.
    { name: 'setup', testMatch: /setup\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop', dependencies: ['setup'], testIgnore: /setup\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', dependencies: ['setup'], testIgnore: /setup\.spec\.js/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node src/server.js',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      DATA_DIR: path.join(os.tmpdir(), `glimpse-e2e-${Date.now()}`),
    },
  },
});
