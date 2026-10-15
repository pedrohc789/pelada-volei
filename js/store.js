// Camada de serviço: regras do app sobre o IndexedDB.
import * as db from './db.js';
import { levelMmr, computeDeltas, winChance, avgMmr } from './elo.js';
import { nextMatch, activeRestingIds, dayStats } from './rotation.js';
import { matchKey, pickGroup } from './balance.js';

const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });

// ---------- Jogadores ----------

export async function listPlayers() {
  return (await db.getAll('players')).sort(byName);
}

export const getPlayer = (id) => db.get('players', id);

export async function savePlayer({ id, name, level }) {
  name = name.trim();
  if (!name) throw new Error('Informe o nome.');
  if (id) {
    const p = await db.get('players', id);
    const updated = { ...p, name, level };
    // Sem partidas ainda, o nível define o MMR; depois disso o Elo é quem manda.
    if (p.games === 0) updated.mmr = levelMmr(level);
    await db.put('players', updated);
    return updated;
  }
  const p = { id: db.newId(), name, level, mmr: levelMmr(level), games: 0, wins: 0, losses: 0, active: true, createdAt: Date.now() };
  await db.put('players', p);
  return p;
}

export async function setPlayerActive(id, active) {
  const p = await db.get('players', id);
  await db.put('players', { ...p, active });
}

export async function resetPlayerMmr(id) {
  const p = await db.get('players', id);
  await db.put('players', { ...p, mmr: levelMmr(p.level) });
}

// ---------- Dia ----------

export const getDay = (id) => db.get('days', id);

export async function getOpenDay() {
  const days = (await db.getAll('days')).filter((d) => d.status === 'aberto');
  days.sort((a, b) => b.createdAt - a.createdAt);
  return days[0] || null;
}

export async function startDay({ date, teamSize, presentIds }) {
  const day = { id: db.newId(), date, teamSize, presentIds, status: 'aberto', pending: null, createdAt: Date.now() };
  await db.put('days', day);
  return day;
}

export async function updateDaySettings(dayId, { teamSize }) {
  const day = await db.get('days', dayId);
  const changed = day.teamSize !== teamSize;
  await db.put('days', { ...day, teamSize, pending: changed ? null : day.pending });
}

export async function setPresence(dayId, presentIds) {
  const day = await db.get('days', dayId);
  let pending = day.pending;
  if (pending) {
    const set = new Set(presentIds);
    // Se alguém do jogo proposto saiu, refaz a proposta.
    if (![...pending.teamA, ...pending.teamB].every((id) => set.has(id))) pending = null;
  }
  // Quem foi embora deixa de "descansar".
  const resting = Object.fromEntries(Object.entries(day.resting || {}).filter(([id]) => presentIds.includes(id)));
  await db.put('days', { ...day, presentIds, pending, resting });
}

export async function closeDay(dayId) {
  const day = await db.get('days', dayId);
  await db.put('days', { ...day, status: 'encerrado', pending: null, closedAt: Date.now() });
}

export async function dayMatches(dayId) {
  return (await db.getByIndex('matches', 'dayId', dayId)).sort((a, b) => a.seq - b.seq);
}

// ---------- Partida ----------

export async function proposeMatch(dayId, { reroll = false, forceDraw = false } = {}) {
  const day = await db.get('days', dayId);
  const players = new Map((await db.getAll('players')).map((p) => [p.id, p]));
  const matches = await dayMatches(dayId);
  // Quem está descansando fica fora do sorteio (sem perder a prioridade da fila).
  const resting = activeRestingIds(day.resting, matches.length + 1);
  const present = day.presentIds.filter((id) => !resting.has(id)).map((id) => players.get(id)).filter(Boolean);
  let avoidKey = null;
  if (reroll && day.pending) {
    const get = (ids) => ids.map((id) => ({ id }));
    avoidKey = matchKey(get(day.pending.teamA), get(day.pending.teamB));
  }
  const m = nextMatch({ present, matches, teamSize: day.teamSize, avoidKey, forceDraw });
  if (m.error) return { error: m.error };
  const pending = {
    teamA: m.teamA.map((p) => p.id),
    teamB: m.teamB.map((p) => p.id),
    streakA: m.streakA,
    streakB: m.streakB,
    reason: m.reason,
    warning: m.warning,
  };
  await db.put('days', { ...day, pending });
  return { pending };
}

// ---------- Descanso ----------

// mode: 'next' (só o próximo jogo dele) ou 'until' (até avisar).
// Se a pessoa está no jogo sorteado, sai só ela: entra quem tem prioridade no banco,
// escolhido para manter a média do time. Retorna {error} se não houver gente para jogar.
export async function restPlayer(dayId, playerId, mode) {
  const day = await db.get('days', dayId);
  const matches = await dayMatches(dayId);
  const num = matches.length + 1;
  const pend = day.pending;
  const inGame = !!pend && (pend.teamA.includes(playerId) || pend.teamB.includes(playerId));
  // No banco com um jogo já sorteado, ele já está fora desse jogo: o descanso vale para o seguinte.
  const untilSeq = mode === 'until' ? null : pend && !inGame ? num + 1 : num;
  const resting = { ...(day.resting || {}), [playerId]: { untilSeq } };
  let pending = pend;
  let redraw = false;

  if (inGame) {
    const players = new Map((await db.getAll('players')).map((p) => [p.id, p]));
    const restingNow = activeRestingIds(resting, num);
    const onCourt = new Set([...pend.teamA, ...pend.teamB]);
    const bench = day.presentIds.filter((id) => !onCourt.has(id) && !restingNow.has(id)).map((id) => players.get(id)).filter(Boolean);
    const key = pend.teamA.includes(playerId) ? 'teamA' : 'teamB';
    if (bench.length) {
      const team = pend[key].map((id) => players.get(id)).filter(Boolean);
      const rest = team.filter((p) => p.id !== playerId);
      const [sub] = pickGroup(bench, 1, dayStats(matches), { target: avgMmr(team), base: rest });
      pending = { ...pend, [key]: pend[key].map((id) => (id === playerId ? sub.id : id)) };
    } else {
      pending = null; // sem banco: refaz o sorteio do jogo sem ele
      redraw = true;
    }
  }
  await db.put('days', { ...day, resting, pending });
  if (redraw) {
    const r = await proposeMatch(dayId);
    if (r.error) {
      // Desfaz o descanso se não sobrar gente para jogar.
      await db.put('days', { ...(await db.get('days', dayId)), resting: day.resting || {}, pending: pend });
      return { error: r.error };
    }
  }
  return { untilSeq };
}

export async function endRest(dayId, playerId) {
  const day = await db.get('days', dayId);
  const resting = { ...(day.resting || {}) };
  delete resting[playerId];
  await db.put('days', { ...day, resting });
}

// Troca dois jogadores entre times ou entre time e banco (ajuste manual do organizador).
export async function swapPlayers(dayId, idX, idY) {
  const day = await db.get('days', dayId);
  if (!day.pending) return;
  const swap = (arr) => arr.map((id) => (id === idX ? idY : id === idY ? idX : id));
  await db.put('days', { ...day, pending: { ...day.pending, teamA: swap(day.pending.teamA), teamB: swap(day.pending.teamB) } });
}

export function pendingChance(pending, playersById) {
  const t = (ids) => ids.map((id) => playersById.get(id)).filter(Boolean);
  return winChance(t(pending.teamA), t(pending.teamB));
}

export async function recordResult(dayId, winner) {
  const day = await db.get('days', dayId);
  const pend = day.pending;
  if (!pend) throw new Error('Nenhuma partida em andamento.');
  const players = new Map((await db.getAll('players')).map((p) => [p.id, p]));
  const teamA = pend.teamA.map((id) => players.get(id));
  const teamB = pend.teamB.map((id) => players.get(id));
  const deltas = computeDeltas(teamA, teamB, winner);
  const matches = await dayMatches(dayId);
  const match = {
    id: db.newId(),
    dayId,
    seq: matches.length ? matches[matches.length - 1].seq + 1 : 1,
    teamA: pend.teamA,
    teamB: pend.teamB,
    streakA: pend.streakA,
    streakB: pend.streakB,
    reason: pend.reason,
    winner,
    mmrBefore: Object.fromEntries([...teamA, ...teamB].map((p) => [p.id, p.mmr])),
    deltas,
    createdAt: Date.now(),
  };
  const ops = [{ store: 'matches', put: match }, { store: 'days', put: { ...day, pending: null } }];
  for (const p of [...teamA, ...teamB]) {
    const won = (winner === 'A') === pend.teamA.includes(p.id);
    ops.push({
      store: 'players',
      put: { ...p, mmr: p.mmr + deltas[p.id], games: p.games + 1, wins: p.wins + (won ? 1 : 0), losses: p.losses + (won ? 0 : 1) },
    });
  }
  await db.write(ops);
  // O próximo jogo só é sorteado quando o organizador pede (tela de intervalo).
  return match;
}

// Desfaz o último resultado do dia e volta a partida para "em andamento".
export async function undoLast(dayId) {
  const matches = await dayMatches(dayId);
  const last = matches[matches.length - 1];
  if (!last) return;
  const day = await db.get('days', dayId);
  const ops = [
    { store: 'matches', del: last.id },
    {
      store: 'days',
      put: { ...day, pending: { teamA: last.teamA, teamB: last.teamB, streakA: last.streakA, streakB: last.streakB, reason: last.reason, warning: null } },
    },
  ];
  for (const id of [...last.teamA, ...last.teamB]) {
    const p = await db.get('players', id);
    if (!p) continue;
    const won = (last.winner === 'A') === last.teamA.includes(id);
    ops.push({
      store: 'players',
      put: { ...p, mmr: p.mmr - (last.deltas[id] || 0), games: p.games - 1, wins: p.wins - (won ? 1 : 0), losses: p.losses - (won ? 0 : 1) },
    });
  }
  await db.write(ops);
}

// ---------- Histórico ----------

export async function listDays() {
  return (await db.getAll('days')).sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- Backup ----------

export async function exportAll() {
  const data = { app: 'pelada-volei', version: 1, exportedAt: new Date().toISOString() };
  for (const s of db.STORES) data[s] = await db.getAll(s);
  return data;
}

export async function importAll(data) {
  if (!data || data.app !== 'pelada-volei' || !Array.isArray(data.players)) throw new Error('Arquivo de backup inválido.');
  const ops = db.STORES.map((store) => ({ store, clear: true }));
  for (const s of db.STORES) for (const obj of data[s] || []) ops.push({ store: s, put: obj });
  await db.write(ops);
}

export async function wipeAll() {
  await db.write(db.STORES.map((store) => ({ store, clear: true })));
}
