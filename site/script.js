// Site do Glimpse: troca de idioma (inglês no HTML, português aqui) e botões de copiar.
(() => {
  const PT = {
    skip: 'Pular para o conteúdo',
    'nav.features': 'Recursos',
    'nav.how': 'Como funciona',
    'nav.install': 'Instalar',
    'hero.eyebrow': 'Open source · Auto-hospedado · Gratuito',
    'hero.title': 'Seus roteiros, em qualquer tela.',
    'hero.lead': 'O Glimpse é um teleprompter web que roda no seu próprio servidor. Escreva ou suba roteiros em Markdown pelo computador e leia no celular ou tablet, com espelhamento, controles Bluetooth e configurações que valem em todo lugar.',
    'hero.start': 'Começar',
    'hero.github': 'Ver no GitHub',
    'hero.note': 'Roda com Docker em amd64 e arm64, incluindo Raspberry Pi.',
    'features.title': 'Tudo o que um teleprompter precisa',
    'features.lead': 'Simples de usar, minimalista e feito para gravar vídeos.',
    'f.markdown.t': 'Roteiros em Markdown',
    'f.markdown.d': 'Escreva no editor embutido ou importe arquivos .md. Títulos viram seções, ==destaques== chamam atenção e notas com > aparecem como indicações de direção.',
    'f.settings.t': 'Configurações universais',
    'f.settings.d': 'Defina tamanho, velocidade e cores uma vez: todos os roteiros e aparelhos seguem. Precisa de algo diferente em um vídeo? Dê ajustes próprios só àquele roteiro.',
    'f.mirror.t': 'Espelhamento e direção',
    'f.mirror.d': 'Espelhamento horizontal e vertical para vidro de teleprompter, rolagem invertida, guia de leitura, contagem regressiva e tempo restante.',
    'f.remote.t': 'Controles Bluetooth',
    'f.remote.d': 'Associe qualquer tecla, passador de slides, botão de mídia ou de gamepad a qualquer ação. Os atalhos ficam no servidor e valem em todos os aparelhos.',
    'f.remote2.t': 'Controle remoto pelo computador',
    'f.remote2.d': 'Abra o controle remoto num laptop e conduza o leitor no celular: reproduzir, pausar, velocidade, tamanho do texto e saltos, por botões ou pelo teclado.',
    'gallery.remote': 'Controle remoto: conduza o leitor do celular por outro computador.',
    'f.screen.t': 'Tela cheia e tela sempre acesa',
    'f.screen.d': 'Leia em tela cheia sem a tela apagar no meio da gravação, mesmo por HTTP na sua rede local.',
    'f.docker.t': 'Auto-hospedado com Docker',
    'f.docker.d': 'Um container, um volume. Seus roteiros ficam no seu servidor: sem conta, sem nuvem, sem rastreamento.',
    'f.lang.t': 'Português e inglês',
    'f.lang.d': 'Escolha o idioma na tela de login e troque quando quiser pelo menu.',
    'f.oss.t': 'Open source',
    'f.oss.d': 'Licença MIT, testado a cada mudança e com imagens publicadas automaticamente no GitHub Container Registry.',
    'how.title': 'Como funciona',
    'how.1.t': 'Escreva no computador',
    'how.1.d': 'Entre por qualquer navegador, crie um roteiro ou arraste seus arquivos .md para a biblioteca. Cada roteiro tem um título, e dá para visualizar o Markdown antes de salvar.',
    'how.2.t': 'Leia no celular ou tablet',
    'how.2.d': 'Abra o mesmo endereço no aparelho em frente à câmera. Toque para reproduzir, arraste para ajustar e use um controle Bluetooth para conduzir o texto sem tocar na tela.',
    'how.3.t': 'Ajuste uma vez',
    'how.3.d': 'Regule velocidade, tamanho, cores, espelhamento e atalhos. As alterações valem para todos os roteiros e aparelhos, ou só para o roteiro aberto.',
    'gallery.title': 'Por dentro',
    'gallery.library': 'Biblioteca de roteiros com busca, importação e download.',
    'gallery.settings': 'Configurações do teleprompter e atalhos, no menu do canto superior direito.',
    'gallery.menu': 'Menu com configurações, idioma, senha e sair.',
    'gallery.login': 'Escolha do idioma na tela de login.',
    'install.title': 'Instale em um minuto',
    'install.lead': 'Você precisa do Docker. Baixe o arquivo do compose e suba o container:',
    'install.copy': 'Copiar',
    'install.copied': 'Copiado!',
    'install.open': 'Depois abra http://SEU-SERVIDOR:3000 e crie a senha de administrador no primeiro acesso.',
    'install.run': 'Prefere um comando só?',
    'install.https': 'Dica: atrás de um proxy reverso com HTTPS você também ganha o Wake Lock nativo do navegador e tela cheia sem restrições.',
    'keys.title': 'Atalhos padrão',
    'keys.lead': 'Todos podem ser trocados, inclusive por botões de controles Bluetooth e gamepads.',
    'keys.play': 'Reproduzir / pausar',
    'keys.speed': 'Velocidade − / +',
    'keys.jump': 'Voltar / avançar trecho',
    'keys.section': 'Seção anterior / próxima',
    'keys.size': 'Texto menor / maior',
    'keys.mirror': 'Espelhar horizontal / vertical',
    'keys.full': 'Tela cheia',
    'footer.license': 'licença MIT',
    'footer.image': 'Imagem Docker',
    'footer.issues': 'Reportar um problema',
  };
  const META = {
    pt: {
      title: 'Glimpse Teleprompter · Teleprompter web open source',
      description: 'Teleprompter web open source e auto-hospedado. Suba roteiros em Markdown pelo computador e leia no celular ou tablet. Roda com Docker.',
    },
  };

  const english = new Map();
  const nodes = [...document.querySelectorAll('[data-i18n]')];
  for (const el of nodes) english.set(el, el.textContent);
  const original = { title: document.title, description: document.querySelector('meta[name=description]').content };
  let current = 'en';
  let copiedLabel = 'Copied!';

  function apply(lang) {
    current = lang === 'pt' ? 'pt' : 'en';
    document.documentElement.lang = current === 'pt' ? 'pt-BR' : 'en';
    for (const el of nodes) el.textContent = current === 'pt' ? (PT[el.dataset.i18n] ?? english.get(el)) : english.get(el);
    document.title = current === 'pt' ? META.pt.title : original.title;
    document.querySelector('meta[name=description]').content = current === 'pt' ? META.pt.description : original.description;
    for (const img of document.querySelectorAll('img[data-shot]')) img.src = `assets/screens/${current}-${img.dataset.shot}.png`;
    for (const btn of document.querySelectorAll('[data-lang]')) btn.setAttribute('aria-pressed', String(btn.dataset.lang === current));
    copiedLabel = current === 'pt' ? PT['install.copied'] : 'Copied!';
    try {
      localStorage.setItem('glimpse.site.lang', current);
    } catch {
      /* armazenamento indisponível */
    }
  }

  function initialLanguage() {
    const fromUrl = new URLSearchParams(location.search).get('lang');
    if (fromUrl) return fromUrl;
    try {
      const saved = localStorage.getItem('glimpse.site.lang');
      if (saved) return saved;
    } catch {
      /* armazenamento indisponível */
    }
    return (navigator.languages ?? [navigator.language]).some((l) => /^pt/i.test(l)) ? 'pt' : 'en';
  }

  for (const btn of document.querySelectorAll('[data-lang]')) btn.addEventListener('click', () => apply(btn.dataset.lang));

  for (const btn of document.querySelectorAll('[data-copy]')) {
    btn.addEventListener('click', async () => {
      const text = document.getElementById(btn.dataset.copy).textContent;
      try {
        await navigator.clipboard.writeText(text);
        const label = btn.textContent;
        btn.textContent = copiedLabel;
        setTimeout(() => { btn.textContent = label; }, 1500);
      } catch {
        /* sem permissão para a área de transferência */
      }
    });
  }

  apply(initialLanguage());
})();
