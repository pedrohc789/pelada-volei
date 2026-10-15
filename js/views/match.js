// Partida: três momentos bem separados.
//  1. Jogo em andamento — times, ajustes manuais, "Time X venceu".
//  2. Fim de jogo — confere e confirma o resultado (nada é gravado antes disso).
//  3. Intervalo — resultado registrado; o próximo jogo só é sorteado ao tocar no botão.
//  4. Dia encerrado — fechamento com o botão do wrapped.
// Não mostra MMR individual — só um indicador geral de equilíbrio.
import { getOpenDay, listDays, closeDay, listPlayers, dayMatches, proposeMatch, swapPlayers, recordResult, undoLast, pendingChance } from '../store.js';
import { dayStats, stayingTeam, MAX_STREAK } from '../rotation.js';
import { esc, toast, plural, askConfirm, formatDate, shortDate, initials, pad2 } from '../ui.js';

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

// Cabeçalho próprio da tela: linha pequena + título grande (o número em destaque).
function head(kicker, title, accent = '', badge = '') {
  return `
    <div class="match-head">
      <div><span class="kicker">${kicker}</span><div class="big">${title}${accent ? ` <span>${accent}</span>` : ''}</div></div>
      ${badge ? `<span class="badge volt">${badge}</span>` : ''}
    </div>`;
}

const BADGES = {
  inicio: 'Sorteio', sorteio: 'Sorteio', 'sorteio-manual': 'Sorteio', 'dois-saem': 'Sorteio novo',
  'vencedor-fica': 'Vencedor fica', 'vencedor-fica-substituicao': 'Vencedor fica',
};

export async function render(root, ctx) {
  const day = await getOpenDay();
  if (!day) return renderClosed(root);
  const [players, matches] = await Promise.all([listPlayers(), dayMatches(day.id)]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id) => esc(byId.get(id)?.name || '?');
  const names = (ids) => ids.map(name).join(', ');
  const kick = `${shortDate(day.date)} · ${plural(day.presentIds.length, 'presente', 'presentes')}`;

  let pending = day.pending;
  if (!pending && matches.length) return renderBreak(root, ctx, day, matches, names, kick);
  if (!pending) {
    const r = await proposeMatch(day.id);
    if (r.error) return renderError(root, r.error);
    pending = r.pending;
    justStarted = true;
  }

  if (finishing && finishing.key === pendingKey(pending)) {
    return renderFinish(root, ctx, day, pending, matches.length + 1, names, kick);
  }
  finishing = null;
  renderGame(root, ctx, day, pending, matches, byId, name, kick);
}

function renderError(root, msg) {
  root.innerHTML = `${head('Partida', 'Ops')}<section class="card error"><p>${esc(msg)}</p><a class="btn block" href="#/dia">Ajustar presença</a></section>`;
}

// ---------- 1. Jogo em andamento ----------

function renderGame(root, ctx, day, pending, matches, byId, name, kick) {
  const num = matches.length + 1;
  const stats = dayStats(matches);
  const games = (id) => stats[id]?.games || 0;
  const onCourt = new Set([...pending.teamA, ...pending.teamB]);
  const bench = day.presentIds.filter((id) => !onCourt.has(id)).sort((a, b) => games(a) - games(b));
  const chanceA = Math.round(pendingChance(pending, byId) * 100);

  // Jogador como botão (toque em dois para trocar de lugar); no banco mostra partidas hoje.
  const pl = (id, team) => `
    <button class="pl ${selected === id ? 'sel' : ''}" data-pid="${id}">
      <span class="av ${team}">${esc(initials(byId.get(id)?.name))}</span><span class="nm">${name(id)}</span>${team ? '' : `<span class="cnt">${games(id)}</span>`}
    </button>`;
  const stays = pending.reason.startsWith('vencedor');
  const streakText = (n, other) => (n > 1 ? `${n}º jogo seguido` : other);

  root.innerHTML = `
    ${justStarted ? `<section class="card new-game">🏐 Começou o jogo ${pad2(num)}</section>` : ''}
    ${head(kick, 'Jogo', pad2(num), BADGES[pending.reason])}
    ${pending.warning ? `<p class="warn-text">${esc(pending.warning)}</p>` : ''}
    <div class="court">
      <div class="half a">
        <div class="half-head"><span class="team-label">Time A</span><span class="streak-label">${streakText(pending.streakA, '')}</span></div>
        <div class="pgrid">${pending.teamA.map((id) => pl(id, 'a')).join('')}</div>
      </div>
      <div class="net"><div class="bal" title="Chance estimada de vitória"><span class="ca">${chanceA}%</span><span class="x">equilíbrio</span><span class="cb">${100 - chanceA}%</span></div></div>
      <div class="half b">
        <div class="pgrid">${pending.teamB.map((id) => pl(id, 'b')).join('')}</div>
        <div class="half-head"><span class="team-label">Time B</span><span class="streak-label">${streakText(pending.streakB, stays ? 'Desafiante' : '')}</span></div>
      </div>
    </div>
    <div class="win-row"><button class="wa" data-win="A">A venceu</button><button class="wb" data-win="B">B venceu</button></div>
    <div class="sec"><h3>No banco</h3><small>partidas hoje</small></div>
    ${bench.length ? `<div class="bench">${bench.map((id) => pl(id, '')).join('')}</div>` : '<p class="muted small">Ninguém no banco.</p>'}
    <p class="hint">Toque em dois jogadores para trocá-los de lugar.</p>
    <div class="tools">
      <button class="btn" id="reroll">↻ Sortear de novo</button>
      <button class="btn" id="full">Sorteio completo</button>
    </div>
    ${matches.length ? '<button class="btn ghost block" id="undo" style="margin-top:8px">Desfazer resultado do jogo anterior</button>' : ''}
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
      document.getElementById('app').scrollTo({ top: 0 });
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

function renderFinish(root, ctx, day, pending, num, names, kick) {
  const w = finishing.winner;
  const l = w === 'A' ? 'B' : 'A';
  const ids = { A: pending.teamA, B: pending.teamB };
  root.innerHTML = `
    ${head(kick, 'Fim do jogo', pad2(num))}
    <section class="card hero ${w.toLowerCase()}">
      <span class="eyebrow">Vitória</span>
      <h2>🏆 Time ${w}</h2>
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
    document.getElementById('app').scrollTo({ top: 0 });
  });
}

// ---------- 3. Intervalo: resultado registrado, próximo jogo sob demanda ----------

function renderBreak(root, ctx, day, matches, names, kick) {
  const last = matches[matches.length - 1];
  const next = last.seq + 1;
  const winIds = last.winner === 'A' ? last.teamA : last.teamB;
  const stay = stayingTeam(matches);
  const nextText = stay.mustLeave
    ? `O time vencedor completou ${MAX_STREAK} jogos seguidos: <b>os dois times saem</b> e haverá sorteio novo, priorizando quem jogou menos.`
    : `<b>O time vencedor fica em quadra</b> para o ${stay.streak + 1}º jogo seguido. O desafiante sai de quem jogou menos.`;

  root.innerHTML = `
    ${head(kick, 'Intervalo')}
    <section class="card hero ${last.winner.toLowerCase()}">
      <span class="eyebrow">✓ Jogo ${pad2(last.seq)} registrado</span>
      <h2>Vitória do Time ${last.winner}</h2>
      <p>${names(winIds)}</p>
    </section>
    <section class="card">
      <span class="eyebrow">Próximo · jogo ${pad2(next)}</span>
      <p style="margin:0">${nextText}</p>
    </section>
    <button class="btn primary block big" id="draw">Sortear jogo ${pad2(next)}</button>
    <button class="btn block" id="close-day">🏁 Encerrar o dia</button>
    <button class="btn ghost block" id="undo">Desfazer resultado do jogo ${pad2(last.seq)}</button>
  `;
  root.querySelector('#draw').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const r = await proposeMatch(day.id);
    if (r.error) return renderError(root, r.error);
    justStarted = true;
    ctx.rerender();
    document.getElementById('app').scrollTo({ top: 0 });
  });
  root.querySelector('#undo').addEventListener('click', () => undo(day, ctx));
  root.querySelector('#close-day').addEventListener('click', async () => {
    if (!(await askConfirm(`Encerrar o dia com ${plural(matches.length, 'jogo', 'jogos')}?`, 'Encerrar dia'))) return;
    await closeDay(day.id);
    ctx.rerender();
    document.getElementById('app').scrollTo({ top: 0 });
  });
}

// ---------- 4. Sem dia aberto: fechamento do último dia + wrapped ----------

async function renderClosed(root) {
  const last = (await listDays())[0];
  const games = last ? (await dayMatches(last.id)).length : 0;
  if (!last || !games) {
    root.innerHTML = `${head('Pelada de vôlei', 'Bora', 'jogar?')}<section class="card"><h2>Nenhum dia aberto</h2><p class="muted" style="margin:0 0 12px">Marque quem veio para começar.</p><a class="btn primary block big" href="#/dia">Iniciar dia</a></section>`;
    return;
  }
  root.innerHTML = `
    ${head(shortDate(last.date), 'Fim de', 'dia')}
    <section class="card hero volt">
      <span class="eyebrow">🏁 Dia encerrado</span>
      <h2>Pelada de ${formatDate(last.date)}</h2>
      <p>${plural(games, 'jogo', 'jogos')} · ${plural(last.presentIds.length, 'presente', 'presentes')}</p>
    </section>
    <a class="btn primary block big" href="#/wrapped/${last.id}">🎁 Ver wrapped do dia</a>
    <a class="btn block" href="#/dia">Iniciar novo dia</a>
  `;
}

async function undo(day, ctx) {
  if (!(await askConfirm('Desfazer o último resultado? O MMR volta ao que era antes e o jogo volta para "em andamento".', 'Desfazer'))) return;
  selected = null;
  finishing = null;
  await undoLast(day.id);
  toast('Resultado desfeito');
  ctx.rerender();
}
