// "Puxar para sincronizar": com o conteúdo no topo, arrastar para baixo e soltar força um sync.
const THRESHOLD = 70; // px de arrasto para disparar
const MAX = 110;

export function setupPullToRefresh(scroller, onRefresh) {
  const el = document.getElementById('ptr');
  let startY = null;
  let dist = 0;
  let busy = false;

  const show = (d, text, ready) => {
    el.hidden = false;
    el.style.transform = `translate(-50%, ${Math.min(d, MAX) - 60}px)`;
    el.classList.toggle('ready', ready);
    el.querySelector('span').textContent = text;
    el.querySelector('i').style.transform = `rotate(${Math.min(d / THRESHOLD, 1) * 180}deg)`;
  };
  const hide = () => {
    el.style.transform = 'translate(-50%, -60px)';
    el.classList.remove('ready', 'spin');
    setTimeout(() => !busy && (el.hidden = true), 200);
  };

  scroller.addEventListener('touchstart', (e) => {
    // Só no topo, sem janelas abertas nem wrapped em tela cheia.
    if (busy || scroller.scrollTop > 0 || document.querySelector('dialog[open]') || document.querySelector('.wrapped')) return;
    startY = e.touches[0].clientY;
    dist = 0;
  }, { passive: true });

  scroller.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    dist = (e.touches[0].clientY - startY) * 0.55; // resistência, como nos apps nativos
    if (dist <= 0 || scroller.scrollTop > 0) return;
    show(dist, dist >= THRESHOLD ? 'Solte para sincronizar' : 'Puxe para sincronizar', dist >= THRESHOLD);
  }, { passive: true });

  scroller.addEventListener('touchend', async () => {
    if (startY === null) return;
    startY = null;
    if (dist < THRESHOLD) return hide();
    busy = true;
    el.classList.add('spin');
    show(THRESHOLD, 'Sincronizando…', true);
    try {
      await onRefresh();
    } finally {
      busy = false;
      hide();
    }
  });
}
