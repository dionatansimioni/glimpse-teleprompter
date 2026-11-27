// Interações do site: teleprompter ao vivo, comparador de Markdown, abas e teclas.
(() => {
  document.documentElement.classList.add('js');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Teleprompter ---------- */
  const stage = document.getElementById('stage');
  const mirror = document.getElementById('mirror');
  const roll = document.getElementById('roll');
  const playButton = document.getElementById('play');
  const mirrorButton = document.querySelector('[data-act="mirror"]');
  const speedOutput = document.getElementById('speed');
  const timeOutput = document.getElementById('time');
  const progress = document.getElementById('progress');

  const PX_PER_STEP = 5; // pixels por segundo para cada ponto de velocidade
  let pos = 0; // quanto o texto já subiu
  let max = 0;
  let origin = 0; // deslocamento que põe a primeira linha sobre a guia
  let speed = 10;
  let zoom = 1;
  let playing = false;
  let wantsPlay = !reducedMotion.matches; // intenção do visitante
  let visible = false;
  let frame = 0;
  let last = 0;
  let glide = null; // movimento até um alvo (salto) ou inércia (arrasto)
  let drag = null;

  // A primeira linha começa na guia; o fim é a última linha chegando nela.
  function measure() {
    const ratio = max ? pos / max : 0;
    const lastLine = roll.lastElementChild;
    max = Math.max(0, lastLine.offsetTop);
    pos = ratio * max;
    origin = stage.clientHeight * 0.36 - parseFloat(getComputedStyle(roll).lineHeight) / 2;
    render();
  }

  function render() {
    roll.style.transform = `translate3d(0, ${origin - pos}px, 0)`;
    const ratio = max ? Math.min(1, Math.max(0, pos / max)) : 0;
    progress.style.transform = `scaleX(${ratio})`;
    const left = Math.max(0, Math.ceil((max - pos) / (speed * PX_PER_STEP)));
    const time = `−${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (timeOutput.textContent !== time) timeOutput.textContent = time;
  }

  function tick(now) {
    frame = 0;
    const dt = Math.min(64, now - last);
    last = now;

    if (glide?.type === 'to') {
      // Aproximação exponencial: sempre parte da posição atual, então pode ser interrompida.
      pos += (glide.target - pos) * (1 - Math.exp(-dt / 70));
      if (Math.abs(glide.target - pos) < 0.5) { pos = glide.target; glide = null; }
    } else if (glide?.type === 'fling') {
      pos += glide.velocity * dt;
      glide.velocity *= 0.996 ** dt;
      if (pos < 0 || pos > max) glide = { type: 'to', target: clamp(pos) };
      else if (Math.abs(glide.velocity) < 0.03) glide = null;
    } else if (playing && !drag) {
      pos += (speed * PX_PER_STEP * dt) / 1000;
      if (pos >= max) restart();
    }

    render();
    if (glide || (playing && !drag)) schedule();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function wake() {
    if (!frame) last = performance.now();
    schedule();
  }

  const clamp = (value) => Math.min(max, Math.max(0, value));

  // Fim do roteiro: volta ao começo com um esmaecer, sem rebobinar na tela.
  function restart() {
    pos = 0;
    roll.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease' });
  }

  function sync() {
    const next = wantsPlay && visible && !document.hidden;
    playButton.setAttribute('aria-pressed', String(wantsPlay));
    if (next === playing) return;
    playing = next;
    if (playing) wake();
  }

  function toggle() {
    wantsPlay = !wantsPlay;
    glide = null;
    sync();
  }

  function moveTo(target, instant) {
    if (instant || reducedMotion.matches) {
      glide = null;
      pos = clamp(target);
      render();
      if (playing) wake();
    } else {
      glide = { type: 'to', target: clamp(target) };
      wake();
    }
  }

  function section(direction, instant) {
    const tops = [...roll.querySelectorAll('h2')].map((h) => h.offsetTop);
    const from = glide?.type === 'to' ? glide.target : pos;
    const target = direction > 0 ? tops.find((t) => t > from + 4) : tops.reverse().find((t) => t < from - 24);
    moveTo(target ?? (direction > 0 ? max : 0), instant);
  }

  // Ações de teclado são instantâneas; as de ponteiro podem deslizar.
  function act(name, instant = false) {
    const step = stage.clientHeight * 0.3;
    const base = glide?.type === 'to' ? glide.target : pos;
    if (name === 'toggle') toggle();
    else if (name === 'back') moveTo(base - step, instant);
    else if (name === 'forward') moveTo(base + step, instant);
    else if (name === 'previous') section(-1, instant);
    else if (name === 'next') section(1, instant);
    else if (name === 'slower' || name === 'faster') {
      speed = Math.min(30, Math.max(1, speed + (name === 'faster' ? 1 : -1)));
      speedOutput.textContent = speed;
      render();
    } else if (name === 'smaller' || name === 'larger') {
      zoom = Math.min(1.6, Math.max(0.7, zoom + (name === 'larger' ? 0.1 : -0.1)));
      roll.style.setProperty('--zoom', zoom);
      measure();
    } else if (name === 'mirror' || name === 'flip') {
      mirror.classList.toggle('instant', instant);
      const on = mirror.classList.toggle(name === 'mirror' ? 'h' : 'v');
      if (name === 'mirror') mirrorButton.setAttribute('aria-pressed', String(on));
    } else if (name === 'full') {
      if (document.fullscreenElement) document.exitFullscreen();
      else stage.requestFullscreen?.().catch(() => {});
    }
  }

  const KEYS = {
    ' ': 'toggle', enter: 'toggle', k: 'toggle', mediaplaypause: 'toggle',
    arrowleft: 'slower', arrowright: 'faster',
    arrowup: 'back', arrowdown: 'forward', pageup: 'back', pagedown: 'forward',
    ',': 'previous', '.': 'next',
    '[': 'smaller', ']': 'larger',
    m: 'mirror', v: 'flip', f: 'full',
  };

  stage.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const name = KEYS[e.key.toLowerCase()];
    if (!name) return;
    e.preventDefault();
    act(name, true);
  });

  playButton.addEventListener('click', (e) => act('toggle', e.detail === 0));
  for (const btn of document.querySelectorAll('[data-act]')) {
    btn.addEventListener('click', (e) => act(btn.dataset.act, e.detail === 0));
  }

  // Toque ou clique reproduz/pausa; com mouse ou caneta, arrastar move o texto 1:1.
  stage.addEventListener('pointerdown', (e) => {
    if (drag || !e.isPrimary || e.button !== 0) return;
    const caught = glide?.type === 'fling'; // segurar o texto em movimento não é um toque
    glide = null;
    drag = { id: e.pointerId, y: e.clientY, from: pos, moved: false, caught, history: [[e.timeStamp, e.clientY]] };
    stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener('pointermove', (e) => {
    if (drag?.id !== e.pointerId || e.pointerType === 'touch') return;
    const delta = drag.y - e.clientY;
    if (!drag.moved) {
      if (Math.abs(delta) < 6) return;
      // Reancora no ponto atual para o texto não saltar ao passar do limiar.
      drag.moved = true;
      drag.y = e.clientY;
      drag.from = pos;
      stage.classList.add('dragging');
      return;
    }
    let next = drag.from + delta * (mirror.classList.contains('v') ? -1 : 1);
    // Resistência progressiva além das bordas.
    const edge = clamp(next);
    const over = next - edge;
    const size = stage.clientHeight;
    next = edge + (over * size * 0.55) / (size + 0.55 * Math.abs(over));
    pos = next;
    drag.history.push([e.timeStamp, e.clientY]);
    if (drag.history.length > 5) drag.history.shift();
    render();
  });

  function release(e, cancelled) {
    if (drag?.id !== e.pointerId) return;
    const { moved, caught, history } = drag;
    drag = null;
    stage.classList.remove('dragging');
    if (!moved) {
      if (!cancelled && !caught) toggle();
      else if (playing) wake();
      return;
    }
    const [t0, y0] = history[0];
    const recent = e.timeStamp - history.at(-1)[0] < 80;
    let velocity = recent && e.timeStamp > t0 ? (y0 - e.clientY) / (e.timeStamp - t0) : 0;
    if (mirror.classList.contains('v')) velocity *= -1;
    if (pos < 0 || pos > max) glide = { type: 'to', target: clamp(pos) };
    else if (Math.abs(velocity) > 0.11 && !reducedMotion.matches) glide = { type: 'fling', velocity };
    wake();
  }
  stage.addEventListener('pointerup', (e) => release(e, false));
  stage.addEventListener('pointercancel', (e) => release(e, true));

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }, { threshold: 0.35 }).observe(stage);
  document.addEventListener('visibilitychange', sync);
  // Cobre redimensionamento, troca de idioma e carregamento da fonte.
  const sizes = new ResizeObserver(measure);
  sizes.observe(stage);
  sizes.observe(roll);
  sync();

  /* ---------- Comparador de Markdown ---------- */
  const compare = document.getElementById('compare');
  const range = compare.querySelector('input');
  const split = () => compare.style.setProperty('--split', `${range.value}%`);
  range.addEventListener('input', split);
  split();

  /* ---------- Abas ---------- */
  for (const box of document.querySelectorAll('.tabbed')) {
    const list = box.querySelector('[role="tablist"]');
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const panels = box.querySelector('.panels');
    const overlay = document.createElement('div');
    overlay.className = 'tabs-active';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.append(...tabs.map(() => document.createElement('span')));
    list.append(overlay);
    let selected = 0;

    const clip = () => {
      const tab = tabs[selected];
      const right = list.clientWidth - tab.offsetLeft - tab.offsetWidth;
      const bottom = list.clientHeight - tab.offsetTop - tab.offsetHeight;
      overlay.style.clipPath = `inset(${tab.offsetTop}px ${right}px ${bottom}px ${tab.offsetLeft}px round 999px)`;
    };
    const labels = () => tabs.forEach((tab, i) => { overlay.children[i].textContent = tab.textContent; });

    const select = (index, instant) => {
      selected = (index + tabs.length) % tabs.length;
      overlay.classList.toggle('instant', instant);
      panels.classList.toggle('instant', instant);
      tabs.forEach((tab, i) => {
        const on = i === selected;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).classList.toggle('active', on);
      });
      clip();
    };

    tabs.forEach((tab, i) => tab.addEventListener('click', (e) => select(i, e.detail === 0)));
    list.addEventListener('keydown', (e) => {
      const target = { ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (target === undefined) return;
      e.preventDefault();
      select(target, true);
      tabs[selected].focus();
    });

    // As larguras mudam com o idioma e com a fonte.
    const refresh = new ResizeObserver(() => { labels(); clip(); });
    for (const el of [list, ...tabs]) refresh.observe(el);
    labels();
    select(0, true);
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('ready')));
  }

  /* ---------- Teclas acendem ao serem pressionadas ---------- */
  const keycaps = new Map([...document.querySelectorAll('kbd[data-key]')].map((el) => [el.dataset.key, el]));
  const light = (e, on) => keycaps.get(e.key.toLowerCase())?.classList.toggle('pressed', on);
  addEventListener('keydown', (e) => light(e, true));
  addEventListener('keyup', (e) => light(e, false));
  addEventListener('blur', () => keycaps.forEach((el) => el.classList.remove('pressed')));
})();
