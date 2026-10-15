// Histórico de partidas por dia (times e vencedor; sem números de MMR) + estatísticas do dia.
import { listDays, dayMatches, listPlayers, undoLast } from '../store.js';
import { esc, formatDate, plural, toast, askConfirm, openDialog } from '../ui.js';
import { computeWrapped } from '../wrapped.js';

export const title = 'Histórico';

export async function render(root, ctx) {
  const [days, players] = await Promise.all([listDays(), listPlayers()]);
  const byId = new Map(players.map((p) => [p.id, p.name]));
  const names = (ids) => ids.map((id) => esc(byId.get(id) || '?')).join(', ');

  if (!days.length) {
    root.innerHTML = '<section class="card"><p class="muted">Nenhum dia registrado ainda.</p></section>';
    return;
  }

  const blocks = [];
  const byDay = new Map();
  for (const d of days) {
    const ms = await dayMatches(d.id);
    byDay.set(d.id, { day: d, matches: ms });
    const open = d.status === 'aberto';
    blocks.push(`
      <details class="card" ${open || blocks.length === 0 ? 'open' : ''}>
        <summary><strong>${formatDate(d.date)}</strong> · ${plural(ms.length, 'jogo', 'jogos')} · ${plural(d.presentIds.length, 'presente', 'presentes')} ${open ? '<span class="badge">aberto</span>' : ''}</summary>
        ${ms.length ? `<div class="row-actions">
          <button class="btn" data-stats="${d.id}">📈 Estatísticas</button>
          <a class="btn" href="#/wrapped/${d.id}">🎁 Wrapped</a>
        </div>` : ''}
        ${ms.length ? `<ol class="matches">${ms.slice().reverse().map((m) => `
          <li>
            <div class="mnum">Jogo ${m.seq}</div>
            <div class="ta ${m.winner === 'A' ? 'won' : ''}"><b>A</b> ${names(m.teamA)}</div>
            <div class="tb ${m.winner === 'B' ? 'won' : ''}"><b>B</b> ${names(m.teamB)}</div>
          </li>`).join('')}</ol>` : '<p class="muted">Sem jogos.</p>'}
        ${open && ms.length ? `<button class="btn ghost block" data-undo="${d.id}">Desfazer último resultado</button>` : ''}
      </details>`);
  }
  root.innerHTML = `<p class="muted small legend">🏆 em destaque: time vencedor.</p>${blocks.join('')}`;

  root.querySelectorAll('[data-stats]').forEach((b) =>
    b.addEventListener('click', () => {
      const { day, matches } = byDay.get(b.dataset.stats);
      openStats(day, matches, byId);
    }),
  );

  root.querySelectorAll('[data-undo]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await askConfirm('Desfazer o último resultado? O MMR volta ao que era antes.'))) return;
      await undoLast(b.dataset.undo);
      toast('Resultado desfeito');
      ctx.rerender();
    }),
  );
}

// ---------- Estatísticas do dia ----------

const COLS = [
  { key: 'name', label: 'Jogador' },
  { key: 'games', label: 'J', title: 'Jogos' },
  { key: 'wins', label: 'V', title: 'Vitórias' },
  { key: 'losses', label: 'D', title: 'Derrotas' },
  { key: 'rate', label: '%', title: 'Aproveitamento' },
  { key: 'streak', label: 'Seq', title: 'Maior sequência de vitórias' },
];

function openStats(day, matches, byId) {
  const w = computeWrapped(matches);
  // Inclui quem estava presente mas não entrou em quadra.
  const ids = [...new Set([...day.presentIds, ...Object.keys(w.perPlayer)])];
  const rows = ids.map((id) => {
    const p = w.perPlayer[id] || { games: 0, wins: 0, losses: 0, streak: 0 };
    return { id, name: byId.get(id) || '?', ...p, rate: p.games ? Math.round((p.wins / p.games) * 100) : null };
  });
  const counts = rows.map((r) => r.games);
  const stayed = matches.filter((m) => String(m.reason).startsWith('vencedor-fica')).length;
  const avg = rows.length ? (counts.reduce((a, b) => a + b, 0) / rows.length).toFixed(1).replace('.', ',') : '0';
  const nameOf = (id) => esc(byId.get(id) || '?');
  const duo = w.bestDuo ? `${nameOf(w.bestDuo.ids[0])} & ${nameOf(w.bestDuo.ids[1])} (${w.bestDuo.wins}/${w.bestDuo.together})` : '—';

  let sortKey = 'name';
  let sortDir = 1;

  openDialog(`
    <div class="form stats-dlg">
      <h2>📈 Estatísticas · ${formatDate(day.date)}</h2>
      <div class="kpis">
        <div><strong>${matches.length}</strong><span>jogos</span></div>
        <div><strong>${rows.length}</strong><span>presentes</span></div>
        <div><strong>${avg}</strong><span>jogos por pessoa</span></div>
        <div><strong>${Math.min(...counts)}–${Math.max(...counts)}</strong><span>mín–máx de jogos</span></div>
        <div><strong>${stayed}</strong><span>vezes o vencedor ficou</span></div>
        <div><strong>${matches.length - stayed}</strong><span>sorteios completos</span></div>
      </div>
      <p class="small">🤝 Melhor dupla: <b>${duo}</b></p>
      <div class="table-wrap"><table class="stats-table">
        <thead><tr>${COLS.map((c) => `<th data-key="${c.key}" ${c.title ? `title="${c.title}"` : ''}>${c.label}</th>`).join('')}</tr></thead>
        <tbody></tbody>
      </table></div>
      <p class="muted small">Toque no título de uma coluna para ordenar. J = jogos, V = vitórias, D = derrotas, Seq = maior sequência de vitórias.</p>
      <button type="button" class="btn" data-close>Fechar</button>
    </div>`, (dlg) => {
    const tbody = dlg.querySelector('tbody');
    const draw = () => {
      const sorted = rows.slice().sort((a, b) => {
        if (sortKey === 'name') return sortDir * a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
        const x = a[sortKey] ?? -1;
        const y = b[sortKey] ?? -1;
        return sortDir * (x - y) || a.name.localeCompare(b.name, 'pt-BR');
      });
      tbody.innerHTML = sorted.map((r) => `
        <tr>
          <td>${esc(r.name)}</td>
          <td>${r.games}</td>
          <td>${r.wins}</td>
          <td>${r.losses}</td>
          <td>${r.rate === null ? '—' : r.rate + '%'}</td>
          <td>${r.streak || 0}</td>
        </tr>`).join('');
      dlg.querySelectorAll('th').forEach((th) => {
        th.classList.toggle('sorted', th.dataset.key === sortKey);
        th.dataset.dir = th.dataset.key === sortKey ? (sortDir > 0 ? '▲' : '▼') : '';
      });
    };
    dlg.querySelectorAll('th').forEach((th) =>
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (key === sortKey) sortDir = -sortDir;
        else {
          sortKey = key;
          sortDir = key === 'name' ? 1 : -1; // números: maior primeiro
        }
        draw();
      }),
    );
    draw();
  });
}
