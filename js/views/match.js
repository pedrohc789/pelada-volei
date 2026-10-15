// Partida: três momentos bem separados.
//  1. Jogo em andamento — times, ajustes manuais, "Time X venceu".
//  2. Fim de jogo — confere e confirma o resultado (nada é gravado antes disso).
//  3. Intervalo — resultado registrado; o próximo jogo só é sorteado ao tocar no botão.
// Não mostra MMR individual — só um indicador geral de equilíbrio.
import { getOpenDay, listPlayers, dayMatches, proposeMatch, swapPlayers, recordResult, undoLast, pendingChance } from '../store.js';
import { dayStats, stayingTeam, MAX_STREAK } from '../rotation.js';
import { esc, toast, plural, askConfirm } from '../ui.js';

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
let finishing = null; // {winner, key}: tela de fim de jogo aberta para o jogo `key`
let justStarted = false; // mostra o aviso de "novo jogo" uma vez, logo após o sorteio

const pendingKey = (p) => `${p.teamA.join(',')}|${p.teamB.join(',')}`;

export async function render(root, ctx) {
  const day = await getOpenDay();
  if (!day) {
    root.innerHTML = `<section class="card"><h2>Nenhum dia aberto</h2><p class="muted">Marque quem veio para começar.</p><a class="btn primary block" href="#/dia">Iniciar dia</a></section>`;
    return;
  }
  const [players, matches] = await Promise.all([listPlayers(), dayMatches(day.id)]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id) => esc(byId.get(id)?.name || '?');
  const names = (ids) => ids.map(name).join(', ');

  let pending = day.pending;
  if (!pending && matches.length) return renderBreak(root, ctx, day, matches, names);
  if (!pending) {
    const r = await proposeMatch(day.id);
    if (r.error) return renderError(root, r.error);
    pending = r.pending;
    justStarted = true;
  }

  if (finishing && finishing.key === pendingKey(pending)) {
    return renderFinish(root, ctx, day, pending, matches.length + 1, names);
  }
  finishing = null;
  renderGame(root, ctx, day, pending, matches, byId, name);
}

function renderError(root, msg) {
  root.innerHTML = `<section class="card error"><p>${esc(msg)}</p><a class="btn block" href="#/dia">Ajustar presença</a></section>`;
}

// ---------- 1. Jogo em andamento ----------

function renderGame(root, ctx, day, pending, matches, byId, name) {
  const num = matches.length + 1;
  const stats = dayStats(matches);
  const games = (id) => stats[id]?.games || 0;
  const onCourt = new Set([...pending.teamA, ...pending.teamB]);
  const bench = day.presentIds.filter((id) => !onCourt.has(id)).sort((a, b) => games(a) - games(b));
  const chanceA = Math.round(pendingChance(pending, byId) * 100);

  const chip = (id) => `<button class="chip ${selected === id ? 'sel' : ''}" data-pid="${id}">${name(id)}<small>${games(id)}</small></button>`;
  const streakLabel = (s) => (s > 1 ? `<span class="badge warn">${s}º jogo seguido</span>` : '');
  const team = (label, ids, streak, key) => `
    <section class="card team team-${key}">
      <h2>${label} ${streakLabel(streak)}</h2>
      <div class="chips">${ids.map(chip).join('')}</div>
      <button class="btn primary block" data-win="${key}">${label} venceu</button>
    </section>`;

  root.innerHTML = `
    ${justStarted ? `<section class="card new-game"><span class="eyebrow">Novo jogo</span><strong>🏐 Começou o jogo nº ${num}</strong></section>` : ''}
    <section class="card info">
      <p><strong>Jogo nº ${num}</strong> · ${esc(REASONS[pending.reason] || '')}</p>
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
    ${matches.length ? '<button class="btn ghost block" id="undo">Desfazer resultado do jogo anterior</button>' : ''}
  `;
  justStarted = false;

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
    b.addEventListener('click', () => {
      selected = null;
      finishing = { winner: b.dataset.win, key: pendingKey(pending) };
      ctx.rerender();
      window.scrollTo({ top: 0 });
    }),
  );

  root.querySelector('#reroll').addEventListener('click', async () => {
    selected = null;
    await proposeMatch(day.id, { reroll: true, forceDraw: pending.reason === 'sorteio-manual' });
    ctx.rerender();
  });
  root.querySelector('#full').addEventListener('click', async () => {
    if (pending.streakA > 1 && !(await askConfirm('O vencedor sairá da quadra antes do limite. Fazer sorteio completo?'))) return;
    selected = null;
    await proposeMatch(day.id, { reroll: true, forceDraw: true });
    ctx.rerender();
  });
  root.querySelector('#undo')?.addEventListener('click', () => undo(day, ctx));
}

// ---------- 2. Fim de jogo: confirmar resultado ----------

function renderFinish(root, ctx, day, pending, num, names) {
  const w = finishing.winner;
  const l = w === 'A' ? 'B' : 'A';
  const ids = { A: pending.teamA, B: pending.teamB };
  root.innerHTML = `
    <section class="card result-hero team-${w}">
      <span class="eyebrow">Fim do jogo nº ${num}</span>
      <h2>🏆 Vitória do Time ${w}</h2>
      <p>${names(ids[w])}</p>
    </section>
    <section class="card loser">
      <h2>Time ${l}</h2>
      <p>${names(ids[l])}</p>
    </section>
    <p class="muted small center">Confira o resultado. O próximo jogo só será sorteado depois que você confirmar.</p>
    <button class="btn primary block big" id="confirm-result">Confirmar resultado</button>
    <button class="btn ghost block" id="back">Voltar ao jogo</button>
  `;
  root.querySelector('#back').addEventListener('click', () => {
    finishing = null;
    ctx.rerender();
  });
  root.querySelector('#confirm-result').addEventListener('click', async (e) => {
    e.target.disabled = true;
    finishing = null;
    await recordResult(day.id, w);
    toast(`Resultado do jogo nº ${num} registrado`);
    ctx.rerender();
    window.scrollTo({ top: 0 });
  });
}

// ---------- 3. Intervalo: resultado registrado, próximo jogo sob demanda ----------

function renderBreak(root, ctx, day, matches, names) {
  const last = matches[matches.length - 1];
  const next = last.seq + 1;
  const winIds = last.winner === 'A' ? last.teamA : last.teamB;
  const stay = stayingTeam(matches);
  const nextText = stay.mustLeave
    ? `O time vencedor completou ${MAX_STREAK} jogos seguidos: <b>os dois times saem</b> e haverá sorteio novo, priorizando quem jogou menos.`
    : `<b>O time vencedor fica em quadra</b> para o ${stay.streak + 1}º jogo seguido. O desafiante sai de quem jogou menos.`;

  root.innerHTML = `
    <section class="card done">
      <span class="eyebrow">✓ Jogo nº ${last.seq} registrado</span>
      <h2>Vitória do Time ${last.winner}</h2>
      <p>${names(winIds)}</p>
    </section>
    <section class="card">
      <h2>Próximo: jogo nº ${next}</h2>
      <p>${nextText}</p>
    </section>
    <button class="btn primary block big" id="draw">Sortear jogo nº ${next}</button>
    <a class="btn block" href="#/wrapped/${day.id}">🎁 Ver wrapped do dia até agora</a>
    <button class="btn ghost block" id="undo">Desfazer resultado do jogo nº ${last.seq}</button>
  `;
  root.querySelector('#draw').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const r = await proposeMatch(day.id);
    if (r.error) return renderError(root, r.error);
    justStarted = true;
    ctx.rerender();
    window.scrollTo({ top: 0 });
  });
  root.querySelector('#undo').addEventListener('click', () => undo(day, ctx));
}

async function undo(day, ctx) {
  if (!(await askConfirm('Desfazer o último resultado? O MMR volta ao que era antes e o jogo volta para "em andamento".', 'Desfazer'))) return;
  selected = null;
  finishing = null;
  await undoLast(day.id);
  toast('Resultado desfeito');
  ctx.rerender();
}
