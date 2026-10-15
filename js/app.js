// Roteador por hash.
import * as players from './views/players.js';
import * as day from './views/day.js';
import * as match from './views/match.js';
import * as historyView from './views/history.js';
import * as config from './views/config.js';
import * as wrapped from './views/wrapped.js';
import { getOpenDay } from './store.js';
import { esc } from './ui.js';

const routes = { partida: match, dia: day, jogadores: players, historico: historyView, config, wrapped };

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
function syncAppHeight() {
  document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
}
syncAppHeight();
window.addEventListener('resize', syncAppHeight);
window.addEventListener('orientationchange', () => setTimeout(syncAppHeight, 300));

window.addEventListener('hashchange', () => {
  document.getElementById('app').scrollTop = 0; // nova tela começa do topo
  render();
});
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW não registrado', e));
}
