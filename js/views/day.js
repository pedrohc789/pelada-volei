// Dia de jogo: presença e tamanho do time.
import { listPlayers, getOpenDay, startDay, setPresence, closeDay, updateDaySettings, dayMatches, listDays } from '../store.js';
import { dayStats } from '../rotation.js';
import { esc, toast, todayIso, formatDate, plural, askConfirm } from '../ui.js';
import { openPlayerForm } from './players.js';

export const title = 'Dia de jogo';

const SIZES = [2, 3, 4, 5, 6];

export async function render(root, ctx) {
  const [players, day] = await Promise.all([listPlayers(), getOpenDay()]);
  const active = players.filter((p) => p.active);
  const lastDay = day ? null : (await listDays())[0];
  const present = new Set(day ? day.presentIds : []);
  const stats = day ? dayStats(await dayMatches(day.id)) : {};
  const teamSize = day ? day.teamSize : lastDay?.teamSize || 6;

  // No dia aberto, presentes já inativados continuam visíveis.
  const shown = day ? players.filter((p) => p.active || present.has(p.id)) : active;

  root.innerHTML = `
    ${day ? `
      <section class="card">
        <h2>Dia ${formatDate(day.date)} <small class="badge">aberto</small></h2>
        <p class="muted">Ajuste a presença a qualquer momento; o próximo sorteio já considera.</p>
      </section>` : `
      <section class="card">
        <h2>Novo dia</h2>
        <label class="inline">Data <input type="date" id="date" value="${todayIso()}"></label>
      </section>`}
    <section class="card">
      <label class="inline">Jogadores por time
        <select id="size">${SIZES.map((n) => `<option value="${n}" ${n === teamSize ? 'selected' : ''}>${n} x ${n}</option>`).join('')}</select>
      </label>
    </section>
    <section class="card">
      <h2>Presença <small id="count"></small></h2>
      ${shown.length ? `
        <input type="search" id="q" placeholder="Buscar nome…" autocomplete="off">
        <div class="row-actions"><button class="btn ghost small" id="all">Marcar todos</button><button class="btn ghost small" id="none">Limpar</button></div>
        <ul class="list checks">
          ${shown.map((p) => `
            <li data-name="${esc(p.name.toLowerCase())}">
              <label><input type="checkbox" value="${p.id}" ${present.has(p.id) ? 'checked' : ''}>
              <span>${esc(p.name)}</span>
              ${stats[p.id] ? `<small class="muted">${plural(stats[p.id].games, 'partida', 'partidas')} hoje</small>` : ''}</label>
            </li>`).join('')}
        </ul>` : '<p class="muted">Cadastre jogadores primeiro.</p>'}
      <button class="btn ghost block" id="newp">+ Cadastrar jogador novo</button>
    </section>
    ${day ? `
      <a class="btn primary block" href="#/partida">Ir para a partida</a>
      <button class="btn ghost danger block" id="close">Encerrar dia</button>` : `
      <button class="btn primary block" id="start">Iniciar dia</button>`}
  `;

  const boxes = () => [...root.querySelectorAll('.checks input[type=checkbox]')];
  const checkedIds = () => boxes().filter((b) => b.checked).map((b) => b.value);
  const updateCount = () => (root.querySelector('#count').textContent = `${checkedIds().length} presentes`);
  updateCount();

  const persist = async () => {
    updateCount();
    if (day) await setPresence(day.id, checkedIds());
  };
  boxes().forEach((b) => b.addEventListener('change', persist));

  root.querySelector('#q')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    root.querySelectorAll('.checks li').forEach((li) => (li.hidden = q && !li.dataset.name.includes(q)));
  });
  root.querySelector('#all')?.addEventListener('click', () => {
    boxes().forEach((b) => !b.closest('li').hidden && (b.checked = true));
    persist();
  });
  root.querySelector('#none')?.addEventListener('click', () => {
    boxes().forEach((b) => (b.checked = false));
    persist();
  });

  root.querySelector('#size').addEventListener('change', async (e) => {
    if (day) {
      await updateDaySettings(day.id, { teamSize: Number(e.target.value) });
      toast('Tamanho do time atualizado');
    }
  });

  root.querySelector('#newp').addEventListener('click', () =>
    openPlayerForm(null, ctx, {
      onSaved: async (p) => {
        // Quem é cadastrado aqui já entra como presente.
        const ids = [...checkedIds(), p.id];
        if (day) await setPresence(day.id, ids);
        else pendingChecks = ids;
        ctx.rerender();
      },
    }),
  );
  if (!day && pendingChecks) {
    const keep = new Set(pendingChecks);
    boxes().forEach((b) => (b.checked = keep.has(b.value)));
    pendingChecks = null;
    updateCount();
  }

  root.querySelector('#start')?.addEventListener('click', async () => {
    const ids = checkedIds();
    if (ids.length < 4) return toast('Marque pelo menos 4 jogadores presentes.');
    await startDay({ date: root.querySelector('#date').value || todayIso(), teamSize: Number(root.querySelector('#size').value), presentIds: ids });
    location.hash = '#/partida';
  });

  root.querySelector('#close')?.addEventListener('click', async () => {
    if (!(await askConfirm('Encerrar o dia? A partida em andamento (sem resultado) será descartada.'))) return;
    await closeDay(day.id);
    toast('Dia encerrado');
    ctx.rerender();
  });
}

// Marcações feitas antes de iniciar o dia sobrevivem ao re-render após cadastrar alguém.
let pendingChecks = null;
