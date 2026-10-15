// Partida: três momentos bem separados.
//  1. Jogo em andamento — times, ajustes manuais, "Time X venceu".
//  2. Fim de jogo — confere e confirma o resultado (nada é gravado antes disso).
//  3. Intervalo — resultado registrado; o próximo jogo só é sorteado ao tocar no botão.
//  4. Dia encerrado — fechamento com o botão do wrapped.
// Não mostra MMR individual — só um indicador geral de equilíbrio.
import { getOpenDay, listDays, closeDay, listPlayers, dayMatches, proposeMatch, swapPlayers, recordResult, undoLast, pendingChance, restPlayer, endRest } from '../store.js';
import { dayStats, stayingTeam, MAX_STREAK, activeRestingIds } from '../rotation.js';
import { openStats } from './history.js';
import { esc, toast, plural, askConfirm, formatDate, shortDate, initials, pad2, openDialog, closeDialog } from '../ui.js';

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
  if (!pending && matches.length) return renderBreak(root, ctx, day, matches, names, kick, byId);
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
  const resting = activeRestingIds(day.resting, num);
  const bench = day.presentIds.filter((id) => !onCourt.has(id) && !resting.has(id)).sort((a, b) => games(a) - games(b));
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
    ${restingSection(day, num, byId)}
    <button class="btn block" id="rest" style="margin-top:14px">☕ Descansar</button>
    <button class="btn block" id="reroll">↻ Sortear de novo</button>
    ${matches.length ? '<button class="btn block" id="stats">📈 Estatísticas do dia</button>' : ''}
    <button class="btn block" id="close-day">🏁 Encerrar o dia</button>
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
      document.getElementById('app').scrollTo({ top: 0 });
    }),
  );

  root.querySelector('#reroll').addEventListener('click', async () => {
    selected = null;
    // Sempre segue o rodízio: com vencedor em quadra, só o desafiante é sorteado de novo.
    await proposeMatch(day.id, { reroll: true });
    ctx.rerender();
  });
  root.querySelector('#undo')?.addEventListener('click', () => undo(day, ctx));
  root.querySelector('#close-day').addEventListener('click', () =>
    endDay(day, ctx, `Encerrar o dia com ${plural(matches.length, 'jogo', 'jogos')}? O jogo ${pad2(num)}, em andamento, será descartado (sem resultado).`),
  );
  bindRest(root, ctx, day, num, byId, pending);
  bindStats(root, day, matches, byId);
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

function renderBreak(root, ctx, day, matches, names, kick, byId) {
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
    ${restingSection(day, next, byId)}
    <button class="btn block" id="rest">☕ Descansar</button>
    <button class="btn block" id="stats">📈 Estatísticas do dia</button>
    <button class="btn block" id="close-day">🏁 Encerrar o dia</button>
    <button class="btn ghost block" id="undo">Desfazer resultado do jogo ${pad2(last.seq)}</button>
  `;
  bindRest(root, ctx, day, next, byId, null);
  bindStats(root, day, matches, byId);
  root.querySelector('#draw').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const r = await proposeMatch(day.id);
    if (r.error) return renderError(root, r.error);
    justStarted = true;
    ctx.rerender();
    document.getElementById('app').scrollTo({ top: 0 });
  });
  root.querySelector('#undo').addEventListener('click', () => undo(day, ctx));
  root.querySelector('#close-day').addEventListener('click', () =>
    endDay(day, ctx, `Encerrar o dia com ${plural(matches.length, 'jogo', 'jogos')}?`),
  );
}

// Encerra o dia (a partida sem resultado, se houver, é descartada) e mostra o fechamento com o wrapped.
async function endDay(day, ctx, message) {
  if (!(await askConfirm(message, 'Encerrar dia'))) return;
  selected = null;
  finishing = null;
  await closeDay(day.id);
  ctx.rerender();
  document.getElementById('app').scrollTo({ top: 0 });
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

// ---------- Descanso ----------

// Lista de quem está descansando no jogo `num`, com quando volta e o botão "Voltar".
function restingSection(day, num, byId) {
  const ids = [...activeRestingIds(day.resting, num)];
  if (!ids.length) return '';
  const until = (id) => {
    const u = day.resting[id].untilSeq;
    return u == null ? 'até avisar' : `volta no jogo ${pad2(u + 1)}`;
  };
  return `
    <div class="resting">
      <div class="sec"><h3>☕ Descansando</h3></div>
      ${ids.map((id) => `
        <div class="rest-row">
          <span class="av">${esc(initials(byId.get(id)?.name))}</span>
          <span class="grow"><b>${esc(byId.get(id)?.name || '?')}</b><small>${until(id)}</small></span>
          <button class="btn small" data-back="${id}">Voltar</button>
        </div>`).join('')}
    </div>`;
}

function bindRest(root, ctx, day, num, byId, pending) {
  root.querySelectorAll('[data-back]').forEach((b) =>
    b.addEventListener('click', async () => {
      const nm = byId.get(b.dataset.back)?.name || 'Jogador';
      if (!(await askConfirm(`${nm} volta para a fila agora?`, 'Voltar'))) return;
      await endRest(day.id, b.dataset.back);
      toast(`${nm} voltou para a fila`);
      ctx.rerender();
    }),
  );
  root.querySelector('#rest')?.addEventListener('click', () => openRestDialog(ctx, day, num, byId, pending));
}

function openRestDialog(ctx, day, num, byId, pending) {
  const resting = activeRestingIds(day.resting, num);
  const onCourt = new Set(pending ? [...pending.teamA, ...pending.teamB] : []);
  const ids = day.presentIds
    .filter((id) => !resting.has(id) && byId.has(id))
    .sort((a, b) => byId.get(a).name.localeCompare(byId.get(b).name, 'pt-BR'));
  // Só o próximo jogo dele: se está no jogo sorteado, é este; se está no banco com jogo sorteado, o seguinte.
  const nextFor = (id) => (pending && !onCourt.has(id) ? num + 1 : num);

  openDialog(`
    <div class="form">
      <h2>☕ Descansar</h2>
      <div id="rest-step">
        <p class="muted small" style="margin:0 0 10px">Quem vai descansar? Ele sai do sorteio e volta depois com a vez dele na fila.</p>
        <div class="rest-pick">
          ${ids.map((id) => `
            <button class="pl" data-pick="${id}">
              <span class="av ${pending?.teamA.includes(id) ? 'a' : pending?.teamB.includes(id) ? 'b' : ''}">${esc(initials(byId.get(id).name))}</span>
              <span class="nm">${esc(byId.get(id).name)}</span>
            </button>`).join('')}
        </div>
      </div>
      <button type="button" class="btn ghost" data-close>Cancelar</button>
    </div>`, (dlg) => {
    dlg.querySelectorAll('[data-pick]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.pick;
        const nm = esc(byId.get(id).name);
        const playing = onCourt.has(id);
        dlg.querySelector('#rest-step').innerHTML = `
          <p style="margin:0 0 12px"><b>${nm}</b> vai descansar por quanto tempo?</p>
          ${playing ? '<p class="muted small" style="margin:0 0 12px">Está no jogo sorteado: entra outro do banco no lugar.</p>' : ''}
          <div class="rest-opts">
            <button class="btn primary" data-mode="next">Só o jogo ${pad2(nextFor(id))}</button>
            <button class="btn" data-mode="until">Até eu avisar</button>
          </div>`;
        dlg.querySelectorAll('[data-mode]').forEach((m) =>
          m.addEventListener('click', async () => {
            m.disabled = true;
            const r = await restPlayer(day.id, id, m.dataset.mode);
            closeDialog();
            toast(r.error ? r.error : `${byId.get(id).name} está descansando`);
            ctx.rerender();
          }),
        );
      }),
    );
  });
}

function bindStats(root, day, matches, byId) {
  root.querySelector('#stats')?.addEventListener('click', () =>
    openStats(day, matches, new Map([...byId].map(([id, p]) => [id, p.name]))),
  );
}
