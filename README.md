# Glimpse Teleprompter

Teleprompter web, open source e auto-hospedado. Você sobe seus roteiros em Markdown pelo PC e lê no celular ou tablet pelo navegador, sem instalar nenhum app.

- **Área de staging**: crie, edite, importe (`.md`, arrastar e soltar) e baixe roteiros, cada um com título.
- **Teleprompter**: velocidade, tamanho do texto, espaçamento, margens, alinhamento, fonte, cores, espelhamento horizontal e vertical, direção da rolagem, guia de leitura, contagem regressiva e tempo restante.
- **Tela cheia** (e instalável como app pela opção "Adicionar à tela inicial").
- **Atalhos customizáveis**: teclado, controles Bluetooth (teclas, page-turners e botões de mídia) e gamepads. Cada dispositivo guarda os próprios atalhos e configurações.
- **Toque**: tocar na tela reproduz/pausa e arrastar move o texto.
- Interface minimalista, sem dependências externas em tempo de execução (funciona numa rede local sem internet).

## Rodando com Docker

```bash
mkdir glimpse && cd glimpse
curl -O https://raw.githubusercontent.com/OWNER/glimpse-teleprompter/main/docker-compose.yml
echo "ADMIN_PASSWORD=uma-senha-forte" > .env
docker compose up -d
```

Antes, troque `OWNER` no `docker-compose.yml` pelo seu usuário ou organização do GitHub. Depois acesse `http://IP-DO-SERVIDOR:3000` no PC e no celular.

Ou direto com `docker run`:

```bash
docker run -d --name glimpse -p 3000:3000 \
  -e ADMIN_PASSWORD=uma-senha-forte \
  -v glimpse-data:/data \
  ghcr.io/OWNER/glimpse-teleprompter:latest
```

As imagens são publicadas no GitHub Container Registry (`ghcr.io`) para `linux/amd64` e `linux/arm64` (Raspberry Pi 4/5 incluídos).

### Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `ADMIN_PASSWORD` | *(obrigatória)* | Senha do administrador. Também aceita `ADMIN_PASSWORD_FILE` (Docker secrets). |
| `PUBLIC_READ` | `false` | `true` permite listar e ler roteiros sem login (editar continua exigindo login). |
| `COOKIE_SECURE` | `false` | Use `true` quando o acesso for por HTTPS. |
| `TRUST_PROXY` | *(vazio)* | Número de proxies reversos à frente (ex.: `1`), para identificar o IP real no limite de tentativas de login. |
| `SESSION_SECRET` | *(gerado)* | Chave das sessões. Se omitida, é gerada e salva em `/data/.session-secret`. |
| `PORT` | `3000` | Porta interna do servidor. |
| `DATA_DIR` | `/data` | Onde os roteiros são salvos (um arquivo JSON por roteiro). |

Trocar a `ADMIN_PASSWORD` encerra todas as sessões abertas. As sessões duram 30 dias.

## Fluxo de uso

1. No PC, entre em `http://servidor:3000`, faça login e clique em **Novo roteiro** ou **Importar .md** (ou arraste arquivos para a página).
2. No celular ou tablet, abra o mesmo endereço, faça login e toque em **Ler**.
3. Toque em ⚙ para ajustar texto, velocidade, espelhamento e atalhos. Use o botão de tela cheia ou adicione o Glimpse à tela inicial.

O título do roteiro importado vem do front matter (`title: ...`), do primeiro `# Título` ou do nome do arquivo.

### Markdown suportado

```markdown
# Seção (aparece destacada; use , e . para pular entre seções)
Texto normal, **ênfase**, *itálico* e ==destaque==.
> Nota de direção: aparece menor e esmaecida (ex.: "mostrar o terminal").
---
```

## Atalhos padrão

| Ação | Teclas |
|---|---|
| Reproduzir / pausar | `Espaço`, `Enter`, `K`, botão de mídia ⏯ |
| Velocidade − / + | `←` / `→`, `-` / `=` |
| Voltar / avançar trecho | `↑` / `↓`, `Page Up` / `Page Down`, mídia ⏮ / ⏭ |
| Seção anterior / próxima | `,` / `.` |
| Início / fim | `Home` / `End` |
| Texto menor / maior | `[` / `]` |
| Espelhar horizontal / vertical | `M` / `V` |
| Inverter direção | `R` |
| Tela cheia | `F` |
| Mostrar / esconder controles | `H` |
| Configurações | `S` |

Todos podem ser alterados em ⚙ → **Atalhos e controles**: clique em **+** e pressione a tecla ou o botão do controle.

### Controles Bluetooth

- **Page-turners e mini-teclados** (enviam setas, Page Up/Down, Enter, Espaço): funcionam direto ou após mapear em **+**.
- **Controles de mídia / controles de selfie**: ative **Capturar botões de mídia** nas configurações e toque em reproduzir uma vez. O Glimpse toca um áudio silencioso para receber play/pause, próxima e anterior pela Media Session do navegador.
- **Gamepads**: aperte qualquer botão com a página aberta para o navegador detectar o controle e então mapeie os botões em **+**.
- Os botões de **volume** do Android não chegam ao navegador, por limitação do sistema.

### Observações sobre o celular

- **Manter a tela acesa** (Wake Lock) e a tela cheia funcionam melhor com **HTTPS**. Na rede local por HTTP, o Glimpse funciona normalmente, mas o celular pode apagar a tela sozinho. Coloque um proxy reverso com HTTPS (Caddy, Traefik, Nginx Proxy Manager, Tailscale Serve etc.) e use `COOKIE_SECURE=true`.
- No iPhone o Safari não oferece tela cheia para páginas; use **Compartilhar → Adicionar à Tela de Início**.

## Desenvolvimento

Requer Node.js 20 ou superior.

```bash
npm install
ADMIN_PASSWORD=dev npm run dev   # http://localhost:3000
npm test                         # testes de API, páginas e módulos
npm run test:e2e                 # testes no navegador (Playwright, via Docker)
```

Estrutura:

```
src/            servidor (Express): API, autenticação e armazenamento
public/         interface (HTML/CSS/JS puro, sem build)
  js/reader.js  teleprompter
  js/keys.js    atalhos (teclado, Bluetooth, gamepad)
  js/settings.js configurações de leitura
test/           testes unitários e de API (node:test)
e2e/            testes no navegador, desktop e celular (Playwright)
```

A cada push na `main` o GitHub Actions roda os testes e publica a imagem em `ghcr.io/<owner>/<repo>:latest`. Tags `vX.Y.Z` geram as imagens versionadas `X.Y.Z` e `X.Y`. Na primeira publicação, deixe o pacote público em **GitHub → Packages → glimpse-teleprompter → Package settings → Change visibility**.

## Licença

[MIT](LICENSE)
