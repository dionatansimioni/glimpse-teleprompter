#!/bin/sh
# Roda os testes e2e na imagem oficial do Playwright, na mesma versão do package.json.
set -eu
cd "$(dirname "$0")/.."
version=$(sed -n 's/.*"@playwright\/test": *"\([^"]*\)".*/\1/p' package.json)
[ -n "$version" ] || { echo "Versão do @playwright/test não encontrada no package.json" >&2; exit 1; }
exec docker run --rm --ipc=host -v "$PWD":/app -w /app \
  "mcr.microsoft.com/playwright:v${version}-noble" npx playwright test "$@"
