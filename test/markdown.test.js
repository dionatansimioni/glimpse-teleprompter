import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTitle, stripFrontMatter } from '../public/js/markdown-utils.js';
import { countWords } from '../src/store.js';

test('título vem do front matter', () => {
  const md = '---\ntitle: "Meu vídeo"\ntags: x\n---\n# Outro\nTexto';
  assert.equal(extractTitle(md, 'arquivo.md'), 'Meu vídeo');
});

test('título vem do primeiro # cabeçalho', () => {
  assert.equal(extractTitle('Intro\n\n# Review do Fedora 44\nTexto', 'a.md'), 'Review do Fedora 44');
  assert.equal(extractTitle('## Só subtítulo\ntexto', 'roteiro_final.md'), 'roteiro final');
});

test('título vem do nome do arquivo quando não há cabeçalho', () => {
  assert.equal(extractTitle('apenas texto', 'video-sobre-docker.md'), 'video sobre docker');
  assert.equal(extractTitle('', ''), 'Sem título');
});

test('quebras de linha do Windows são aceitas', () => {
  assert.equal(extractTitle('---\r\ntitle: Win\r\n---\r\ntexto'), 'Win');
});

test('stripFrontMatter remove apenas o bloco inicial', () => {
  assert.equal(stripFrontMatter('---\ntitle: a\n---\nCorpo\n---\nFim'), 'Corpo\n---\nFim');
  assert.equal(stripFrontMatter('Sem front matter'), 'Sem front matter');
});

test('contagem de palavras ignora marcação Markdown', () => {
  assert.equal(countWords('# Título\n\n**Olá** _mundo_ > nota'), 4);
  assert.equal(countWords('---\ntitle: x\n---\num dois'), 2);
  assert.equal(countWords(''), 0);
});
