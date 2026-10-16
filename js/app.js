// Roteador por hash.
import * as players from './views/players.js';
import * as day from './views/day.js';
import * as match from './views/match.js';
import * as historyView from './views/history.js';
import * as config from './views/config.js';
import * as wrapped from './views/wrapped.js';
import * as entrar from './views/entrar.js';
import * as sync from './sync.js';
import { getOpenDay } from './store.js';
import { esc, toast } from './ui.js';

const routes = { partida: match, dia: day, jogadores: players, historico: historyView, config, wrapped, entrar };

async function render() {
  let [name, param] = location.hash.replace(/^#\//, '').split('/');
  if (!routes[name]) {
    name = (await getOpenDay()) ? 'partida' : 'dia';
    location.replace(`#/${name}`);
    return;
  }
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  document.body.classList.toggle('own-header', name === 'partida'); // a Partida desenha o próprio cabeçalho
  const view = routes[name];
  document.getElementById('title').textContent = view.title;
  const root = document.getElementById('app');
  try {
    await view.render(root, { rerender: render, param });
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="card error">Erro: ${esc(e.message)}</div>`;
  }
}

// Altura real da tela: no iPhone em modo app (tela de início) o 100dvh do CSS fica curto
// e sobra uma faixa vazia embaixo da barra de abas.
// No modo app do iPhone (navigator.standalone) com a barra de status transparente, até o
// innerHeight vem curto (falta a altura da barra de status); lá o app ocupa a tela inteira,
// então usamos a altura da tela.
function syncAppHeight() {
  let h = window.innerHeight;
  if (navigator.standalone) {
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    h = Math.max(h, full);
  }
  document.documentElement.style.setProperty('--app-h', `${h}px`);
}
syncAppHeight();
window.addEventListener('resize', syncAppHeight);
window.addEventListener('orientationchange', () => setTimeout(syncAppHeight, 300));

window.addEventListener('hashchange', () => {
  document.getElementById('app').scrollTop = 0; // nova tela começa do topo
  render();
});

// Conflitos (outro organizador mudou antes) e falta de internet no modo grupo chegam aqui
// a partir de qualquer botão: avisa, ressincroniza e redesenha a tela.
window.addEventListener('unhandledrejection', async (e) => {
  const err = e.reason;
  if (!err || (err.name !== 'ConflictError' && err.name !== 'OfflineError')) return;
  e.preventDefault();
  toast(err.message);
  if (err.name === 'ConflictError') {
    try {
      await sync.refresh();
    } catch {
      /* segue com o espelho atual */
    }
  }
  render();
});

// Indicador de sincronização (só no modo grupo).
const LABELS = { syncing: '🔄 Sincronizando…', offline: '⚪ Offline — só leitura' };
sync.onStatus((s) => {
  const el = document.getElementById('sync');
  el.textContent = LABELS[s] || '';
  el.hidden = !LABELS[s];
  document.querySelector('.tabbar a[data-route="config"]')?.classList.toggle('synced', s === 'ok');
  if (location.hash.startsWith('#/config')) render(); // a tela de Ajustes mostra o status do grupo
});

render();
sync.start(render).then(render);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW não registrado', e));
}
