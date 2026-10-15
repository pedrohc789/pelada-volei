// Partida em andamento: times propostos, ajustes manuais e registro do resultado.
// Não mostra MMR individual — só um indicador geral de equilíbrio.
import { getOpenDay, listPlayers, dayMatches, proposeMatch, swapPlayers, recordResult, undoLast, pendingChance } from '../store.js';
import { dayStats, MAX_STREAK } from '../rotation.js';
import { esc, toast, plural } from '../ui.js';

export const title = 'Partida';

const REASONS = {
  inicio: 'Primeiro jogo do dia — times sorteados.',
  sorteio: 'Times sorteados.',
  'sorteio-manual': 'Sorteio completo feito pelo organizador.',
  'dois-saem': `O vencedor completou ${MAX_STREAK} jogos seguidos — os dois times saíram e houve sorteio novo.`,
  'vencedor-fica': 'Vencedor fica; desafiante montado com quem jogou menos.',
  'vencedor-fica-substituicao': 'Vencedor fica (com substituição de quem saiu); desafiante montado com quem jogou menos.',
};

let selected = null; // jogador marcado para troca

export async function render(root, ctx) {
  const day = await getOpenDay();
  if (!day) {
    root.innerHTML = `<section class="card"><h2>Nenhum dia aberto</h2><p class="muted">Marque quem veio para começar.</p><a class="btn primary block" href="#/dia">Iniciar dia</a></section>`;
    return;
  }
  let pending = day.pending;
  if (!pending) {
    const r = await proposeMatch(day.id);
    if (r.error) {
      root.innerHTML = `<section class="card error"><p>${esc(r.error)}</p><a class="btn block" href="#/dia">Ajustar presença</a></section>`;
      return;
    }
    pending = r.pending;
  }

  const [players, matches] = await Promise.all([listPlayers(), dayMatches(day.id)]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const stats = dayStats(matches);
  const games = (id) => stats[id]?.games || 0;
  const onCourt = new Set([...pending.teamA, ...pending.teamB]);
  const bench = day.presentIds.filter((id) => !onCourt.has(id)).sort((a, b) => games(a) - games(b));
  const chanceA = Math.round(pendingChance(pending, byId) * 100);
  const name = (id) => esc(byId.get(id)?.name || '?');

  const chip = (id) => `<button class="chip ${selected === id ? 'sel' : ''}" data-pid="${id}">${name(id)}<small>${games(id)}</small></button>`;
  const streakLabel = (s) => (s > 1 ? `<span class="badge warn">${s}º jogo seguido</span>` : '');
  const team = (label, ids, streak, key) => `
    <section class="card team team-${key}">
      <h2>${label} ${streakLabel(streak)}</h2>
      <div class="chips">${ids.map(chip).join('')}</div>
      <button class="btn primary block" data-win="${key}">${label} venceu</button>
    </section>`;

  root.innerHTML = `
    <section class="card info">
      <p><strong>Jogo nº ${matches.length + 1}</strong> · ${esc(REASONS[pending.reason] || '')}</p>
      ${pending.warning ? `<p class="warn-text">${esc(pending.warning)}</p>` : ''}
      <div class="balance" title="Chance estimada de vitória">
        <span>Equilíbrio</span>
        <div class="bar"><i style="width:${chanceA}%"></i></div>
        <span>${chanceA}% × ${100 - chanceA}%</span>
      </div>
    </section>
    ${team('Time A', pending.teamA, pending.streakA, 'A')}
    ${team('Time B', pending.teamB, pending.streakB, 'B')}
    <section class="card">
      <h2>De fora <small>${plural(bench.length, 'jogador', 'jogadores')}</small></h2>
      ${bench.length ? `<div class="chips">${bench.map(chip).join('')}</div>` : '<p class="muted">Ninguém de fora.</p>'}
      <p class="muted small">O número em cada nome é quantas partidas jogou hoje. Toque em dois nomes para trocá-los de lugar.</p>
    </section>
    <div class="row-actions">
      <button class="btn" id="reroll">Sortear de novo</button>
      <button class="btn ghost" id="full">Sorteio completo</button>
    </div>
    ${matches.length ? '<button class="btn ghost block" id="undo">Desfazer último resultado</button>' : ''}
  `;

  root.querySelectorAll('[data-pid]').forEach((b) =>
    b.addEventListener('click', async () => {
      const id = b.dataset.pid;
      if (!selected) {
        selected = id;
      } else if (selected === id) {
        selected = null;
      } else {
        const benchSet = new Set(bench);
        if (benchSet.has(selected) && benchSet.has(id)) {
          selected = id; // dois do banco: só muda a seleção
        } else {
          await swapPlayers(day.id, selected, id);
          selected = null;
        }
      }
      ctx.rerender();
    }),
  );

  root.querySelectorAll('[data-win]').forEach((b) =>
    b.addEventListener('click', async () => {
      const w = b.dataset.win;
      if (!confirm(`Confirmar vitória do Time ${w}?`)) return;
      selected = null;
      await recordResult(day.id, w);
      toast(`Vitória do Time ${w} registrada`);
      ctx.rerender();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }),
  );

  root.querySelector('#reroll').addEventListener('click', async () => {
    selected = null;
    await proposeMatch(day.id, { reroll: true, forceDraw: pending.reason === 'sorteio-manual' });
    ctx.rerender();
  });
  root.querySelector('#full').addEventListener('click', async () => {
    if (pending.streakA > 1 && !confirm('O vencedor sairá da quadra antes do limite. Fazer sorteio completo?')) return;
    selected = null;
    await proposeMatch(day.id, { reroll: true, forceDraw: true });
    ctx.rerender();
  });
  root.querySelector('#undo')?.addEventListener('click', async () => {
    if (!confirm('Desfazer o último resultado? O MMR volta ao que era antes.')) return;
    selected = null;
    await undoLast(day.id);
    toast('Resultado desfeito');
    ctx.rerender();
  });
}
