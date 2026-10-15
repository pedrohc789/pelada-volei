// Histórico de partidas por dia (times e vencedor; sem números de MMR).
import { listDays, dayMatches, listPlayers, undoLast } from '../store.js';
import { esc, formatDate, plural, toast, askConfirm } from '../ui.js';

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
  for (const d of days) {
    const ms = await dayMatches(d.id);
    const open = d.status === 'aberto';
    blocks.push(`
      <details class="card" ${open || blocks.length === 0 ? 'open' : ''}>
        <summary><strong>${formatDate(d.date)}</strong> · ${plural(ms.length, 'jogo', 'jogos')} · ${plural(d.presentIds.length, 'presente', 'presentes')} ${open ? '<span class="badge">aberto</span>' : ''}</summary>
        ${ms.length ? `<ol class="matches">${ms.slice().reverse().map((m) => `
          <li>
            <div class="mnum">Jogo ${m.seq}</div>
            <div class="${m.winner === 'A' ? 'won' : ''}"><b>A</b> ${names(m.teamA)}</div>
            <div class="${m.winner === 'B' ? 'won' : ''}"><b>B</b> ${names(m.teamB)}</div>
          </li>`).join('')}</ol>` : '<p class="muted">Sem jogos.</p>'}
        ${ms.length ? `<a class="btn block" href="#/wrapped/${d.id}">🎁 Ver wrapped do dia</a>` : ''}
        ${open && ms.length ? `<button class="btn ghost block" data-undo="${d.id}">Desfazer último resultado</button>` : ''}
      </details>`);
  }
  root.innerHTML = `<p class="muted small legend">🏆 em destaque: time vencedor.</p>${blocks.join('')}`;

  root.querySelectorAll('[data-undo]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await askConfirm('Desfazer o último resultado? O MMR volta ao que era antes.'))) return;
      await undoLast(b.dataset.undo);
      toast('Resultado desfeito');
      ctx.rerender();
    }),
  );
}
