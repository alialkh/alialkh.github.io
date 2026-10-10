// Small floating, draggable card that links to the radiology tools. Self-contained, no dependencies.
(() => {
  const KEY = 'radiologyPromoClosed';
  try { if (sessionStorage.getItem(KEY)) return; } catch { /* storage blocked, show it anyway */ }

  const style = document.createElement('style');
  style.textContent = `
    .rp { position: fixed; right: 16px; bottom: 16px; z-index: 1040; max-width: min(260px, calc(100vw - 32px)); padding: 10px 34px 10px 14px; border-radius: 12px; background: rgba(15, 20, 30, .78); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); box-shadow: 0 4px 18px rgba(0, 0, 0, .35); font: 600 15px/1.35 system-ui, sans-serif; opacity: .88; cursor: grab; touch-action: none; user-select: none; transition: opacity .15s; }
    .rp:hover, .rp:focus-within { opacity: 1; }
    .rp.rp-drag { cursor: grabbing; }
    .rp a { color: #fff; text-decoration: underline; text-underline-offset: 3px; }
    .rp button { position: absolute; top: 4px; right: 6px; width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: #fff; font-size: 18px; line-height: 1; cursor: pointer; }
    .rp button:hover, .rp button:focus-visible { background: rgba(255, 255, 255, .25); }
    @media print { .rp { display: none; } }`;

  const link = document.createElement('a');
  link.textContent = 'Try out my fun radiology tools';
  link.href = new URL('../radiology/index.html', document.currentScript.src).href;

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close');

  const card = document.createElement('aside');
  card.className = 'rp';
  card.setAttribute('aria-label', 'Radiology tools');
  card.append(link, close);

  function place(x, y) {
    card.style.left = `${Math.min(Math.max(0, x), innerWidth - card.offsetWidth)}px`;
    card.style.top = `${Math.min(Math.max(0, y), innerHeight - card.offsetHeight)}px`;
    card.style.right = card.style.bottom = 'auto';
  }

  let grab = null;
  let moved = false;
  card.addEventListener('pointerdown', e => {
    if (e.target === close || e.button > 0) return;
    const r = card.getBoundingClientRect();
    grab = { x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top };
    moved = false;
  });
  card.addEventListener('pointermove', e => {
    if (!grab) return;
    if (!moved) {
      if (Math.hypot(e.clientX - grab.x, e.clientY - grab.y) < 5) return;
      moved = true;
      // Capture only once a drag starts, otherwise the click would land on the card instead of the link.
      card.setPointerCapture(e.pointerId);
      card.classList.add('rp-drag');
    }
    place(e.clientX - grab.dx, e.clientY - grab.dy);
  });
  const release = () => { grab = null; card.classList.remove('rp-drag'); };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
  link.addEventListener('click', e => { if (moved) e.preventDefault(); moved = false; });
  addEventListener('resize', () => { if (card.style.left) place(parseFloat(card.style.left), parseFloat(card.style.top)); });

  const dismiss = () => {
    card.remove();
    try { sessionStorage.setItem(KEY, '1'); } catch { /* storage blocked, it returns next page */ }
  };
  close.addEventListener('click', dismiss);
  card.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(); });

  document.body.append(style, card);
})();
