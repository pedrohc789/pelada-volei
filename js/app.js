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

window.addEventListener('hashchange', render);
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW não registrado', e));
}
