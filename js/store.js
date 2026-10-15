// Camada de serviço: regras do app sobre o IndexedDB.
import * as db from './db.js';
import { levelMmr, computeDeltas, winChance } from './elo.js';
import { nextMatch } from './rotation.js';
import { matchKey } from './balance.js';

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
  await db.put('days', { ...day, presentIds, pending });
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
  const present = day.presentIds.map((id) => players.get(id)).filter(Boolean);
  const matches = await dayMatches(dayId);
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
