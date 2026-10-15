// Elo de time: compara a média de MMR dos dois times; só vitória/derrota.

export const LEVELS = [
  { id: 'iniciante', label: 'Iniciante', mmr: 800 },
  { id: 'intermediario', label: 'Intermediário', mmr: 1000 },
  { id: 'bom', label: 'Bom', mmr: 1200 },
  { id: 'avancado', label: 'Avançado', mmr: 1400 },
];

export function levelMmr(levelId) {
  const lvl = LEVELS.find((l) => l.id === levelId);
  return lvl ? lvl.mmr : 1000;
}

export function avgMmr(team) {
  if (!team.length) return 0;
  return team.reduce((s, p) => s + p.mmr, 0) / team.length;
}

// Probabilidade de o time A vencer o time B.
export function expected(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function winChance(teamA, teamB) {
  return expected(avgMmr(teamA), avgMmr(teamB));
}

// Jogadores novos (menos de 10 partidas) ajustam mais rápido.
export function kFactor(games) {
  return games < 10 ? 40 : 20;
}

// teamA/teamB: [{id, mmr, games}]; winner: 'A' | 'B'. Retorna {id: delta}.
export function computeDeltas(teamA, teamB, winner) {
  const eA = winChance(teamA, teamB);
  const sA = winner === 'A' ? 1 : 0;
  const deltas = {};
  for (const p of teamA) deltas[p.id] = Math.round(kFactor(p.games) * (sA - eA));
  for (const p of teamB) deltas[p.id] = Math.round(kFactor(p.games) * ((1 - sA) - (1 - eA)));
  return deltas;
}
