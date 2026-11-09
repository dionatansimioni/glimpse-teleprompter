#!/bin/sh
# Gera as capturas de tela do site (site/assets/screens) com a imagem do Playwright.
set -eu
cd "$(dirname "$0")/.."
version=$(sed -n 's/.*"@playwright\/test": *"\([^"]*\)".*/\1/p' package.json)
exec docker run --rm --ipc=host -v "$PWD":/app -w /app \
  "mcr.microsoft.com/playwright:v${version}-noble" node scripts/screenshots.mjs "$@"
