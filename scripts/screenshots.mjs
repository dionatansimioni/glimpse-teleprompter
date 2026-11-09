// Gera capturas de tela do app (pt e en) para o site e a documentação.
// Uso: npm run screenshots   (roda na imagem do Playwright via Docker)
import { chromium, devices } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] ?? 'site/assets/screens');
const PORT = 3777;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'screenshots-123';
const H = { 'x-glimpse': '1' };

const DEMO = {
  pt: [
    {
      title: 'Review: o novo Fedora',
      content: `# Abertura

Fala, pessoal! Hoje a gente vai testar o **Fedora** mais recente e ver se ele vale a ==atualização==.

> mostrar a tela inicial

Fiquem até o final, porque tem uma dica que pouca gente conhece.

# Instalação

O instalador ficou mais simples: são só três passos até a área de trabalho.

> abrir o instalador

---

# Conclusão

Se curtiu, deixa o like e até a próxima!`,
    },
    { title: 'Tutorial: Docker em 10 minutos', content: '# Introdução\n\nHoje vamos subir o primeiro container.' },
    { title: 'Notícias da semana', content: '# Destaques\n\nTrês notícias que movimentaram o mundo Linux.' },
  ],
  en: [
    {
      title: 'Review: the new Fedora',
      content: `# Opening

Hey everyone! Today we are testing the latest **Fedora** and checking whether it is worth the ==upgrade==.

> show the welcome screen

Stay until the end, because there is a tip few people know about.

# Installation

The installer got simpler: just three steps to the desktop.

> open the installer

---

# Wrap-up

If you enjoyed it, hit like and see you next time!`,
    },
    { title: 'Tutorial: Docker in 10 minutes', content: '# Introduction\n\nToday we start our first container.' },
    { title: 'Weekly news', content: '# Highlights\n\nThree stories that shook the Linux world.' },
  ],
};

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) return;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('servidor não respondeu');
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const lang of ['pt', 'en']) {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'glimpse-shots-'));
    const server = spawn(process.execPath, ['src/server.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir }, stdio: 'ignore' });
    try {
      await waitForServer();
      const locale = lang === 'pt' ? 'pt-BR' : 'en-US';
      const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'dark', locale });
      const phone = await browser.newContext({ ...devices['Pixel 7'], colorScheme: 'dark', locale });
      const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${lang}-${name}.png`) });

      // Login (antes do setup só existe a tela de setup; capturamos o login depois)
      const d = await desktop.newPage();
      await d.request.post(`${BASE}/api/setup`, { headers: H, data: { password: PASSWORD, confirm: PASSWORD } });
      const ids = [];
      for (const doc of [...DEMO[lang]].reverse()) {
        const res = await d.request.post(`${BASE}/api/scripts`, { headers: H, data: doc });
        ids.unshift((await res.json()).id);
      }
      await d.request.put(`${BASE}/api/settings`, { headers: H, data: { settings: { fontSize: 56, countdown: 0 } } });

      const login = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark', locale })).newPage();
      await login.goto(`${BASE}/login`);
      await login.waitForSelector('html:not([data-i18n-pending])');
      await shot(login, 'login');

      await d.goto(`${BASE}/`);
      await d.waitForSelector('.script');
      await shot(d, 'library');
      await d.click('#menu-button');
      await d.waitForTimeout(150);
      await shot(d, 'menu');

      await d.goto('about:blank'); // recarrega a página (só trocar o # manteria o menu aberto)
      await d.goto(`${BASE}/#/edit/${ids[0]}`);
      await d.waitForSelector('#editor-view:not([hidden])');
      await shot(d, 'editor');

      await d.goto(`${BASE}/settings`);
      await d.waitForSelector('[data-setting=fontSize]');
      await d.waitForTimeout(150);
      await shot(d, 'settings');

      await d.goto(`${BASE}/read/${ids[0]}`);
      await d.waitForSelector('#text h1');
      await d.waitForTimeout(200);
      await shot(d, 'reader-desktop');

      const p = await phone.newPage();
      await p.request.post(`${BASE}/api/login`, { headers: H, data: { password: PASSWORD } });
      await p.request.put(`${BASE}/api/settings`, { headers: H, data: { settings: { fontSize: 40, countdown: 0 } } });
      await p.goto(`${BASE}/read/${ids[0]}`);
      await p.waitForSelector('#text h1');
      await p.waitForTimeout(200);
      await shot(p, 'reader-phone');
      await p.click('[data-action=settings]');
      await p.waitForTimeout(250);
      await shot(p, 'panel-phone');
      await p.click('#panel-close');

      // Espelhado (para teleprompter com vidro)
      await p.request.put(`${BASE}/api/settings`, { headers: H, data: { settings: { mirrorX: true, theme: 'yellow' } } });
      await p.reload();
      await p.waitForSelector('#text h1');
      await p.waitForTimeout(200);
      await shot(p, 'reader-mirrored');

      await p.goto(`${BASE}/`);
      await p.waitForSelector('.script');
      await shot(p, 'library-phone');

      await desktop.close();
      await phone.close();
    } finally {
      server.kill();
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  }
  await browser.close();
  console.log(`Capturas salvas em ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
