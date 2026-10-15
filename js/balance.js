// Seleção de quem joga (prioridade por partidas no dia) e divisão equilibrada por MMR.
import { shuffle, pick } from './rng.js';
import { avgMmr } from './elo.js';

// Divisões cujo custo fica até TOLERANCE pontos do melhor são consideradas "empatadas"
// e uma delas é sorteada, para os times não saírem sempre iguais.
export const TOLERANCE = 15;
const MAX_COMBOS = 5000;

export function* combinations(arr, k, start = 0, prefix = []) {
  if (prefix.length === k) {
    yield prefix.slice();
    return;
  }
  for (let i = start; i <= arr.length - (k - prefix.length); i++) {
    prefix.push(arr[i]);
    yield* combinations(arr, k, i + 1, prefix);
    prefix.pop();
  }
}

export function countCombinations(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

function teamKey(team) {
  return team.map((p) => p.id).sort().join(',');
}

// Identifica um confronto independente da ordem dos times.
export function matchKey(teamA, teamB) {
  return [teamKey(teamA), teamKey(teamB)].sort().join('|');
}

export function getStat(stats, id) {
  return stats[id] || { games: 0, lastSeq: -1 };
}

// Escolhe um candidato entre os quase empatados com o melhor; evita repetir avoidKey se possível.
export function chooseWithin(cands, { rng = Math.random, tolerance = TOLERANCE, avoidKey = null } = {}) {
  let pool = cands;
  if (avoidKey && cands.length > 1) {
    const others = cands.filter((c) => c.key !== avoidKey);
    if (others.length) pool = others;
  }
  const best = Math.min(...pool.map((c) => c.cost));
  return pick(pool.filter((c) => c.cost <= best + tolerance), rng);
}

// Todas as divisões de 2T jogadores em dois times de T (o 1º jogador fica fixo no time A
// para não contar a mesma divisão espelhada duas vezes).
export function allSplits(players, T) {
  const [first, ...rest] = players;
  const out = [];
  for (const comb of combinations(rest, T - 1)) {
    const inA = new Set(comb.map((p) => p.id));
    const teamA = [first, ...comb];
    const teamB = rest.filter((p) => !inA.has(p.id));
    out.push({ teamA, teamB, cost: Math.abs(avgMmr(teamA) - avgMmr(teamB)), key: matchKey(teamA, teamB) });
  }
  return out;
}

export function balancedSplit(players, T, opts = {}) {
  const c = chooseWithin(allSplits(players, T), opts);
  return { teamA: c.teamA, teamB: c.teamB, cost: c.cost };
}

// Ordena por: menos partidas hoje, mais tempo sem jogar, aleatório. Separa quem entra com
// certeza (mandatory) do grupo empatado na linha de corte (tie), do qual entram `need`.
export function priorityGroups(candidates, n, stats, rng = Math.random) {
  const cmp = (x, y) => {
    const sx = getStat(stats, x.id);
    const sy = getStat(stats, y.id);
    return sx.games - sy.games || sx.lastSeq - sy.lastSeq;
  };
  const sorted = shuffle(candidates, rng).sort(cmp); // sort estável: embaralhar antes = desempate aleatório
  if (n >= sorted.length) return { mandatory: sorted, tie: [], need: 0 };
  const cut = sorted[n - 1];
  const tie = sorted.filter((p) => cmp(p, cut) === 0);
  const mandatory = sorted.filter((p) => cmp(p, cut) < 0);
  return { mandatory, tie, need: n - mandatory.length };
}

// Escolhe n jogadores do pool respeitando a prioridade; entre empatados, prefere a combinação
// em que a média de (base + escolhidos) fica mais perto de `target`.
export function pickGroup(pool, n, stats, { target, base = [], rng = Math.random, tolerance = TOLERANCE, avoidKeyOf = null, avoidKey = null } = {}) {
  const { mandatory, tie, need } = priorityGroups(pool, n, stats, rng);
  if (need === 0) return mandatory;
  let combos;
  if (countCombinations(tie.length, need) <= MAX_COMBOS) {
    combos = [...combinations(tie, need)];
  } else {
    combos = Array.from({ length: MAX_COMBOS }, () => shuffle(tie, rng).slice(0, need));
  }
  const cands = combos.map((c) => {
    const group = [...mandatory, ...c];
    return {
      group,
      cost: Math.abs(target - avgMmr([...base, ...group])),
      key: avoidKeyOf ? avoidKeyOf(group) : null,
    };
  });
  return chooseWithin(cands, { rng, tolerance, avoidKey }).group;
}

// Seleção simples por prioridade (desempate aleatório), usada no sorteio completo.
export function selectPlayers(candidates, n, stats, rng = Math.random) {
  const { mandatory, tie, need } = priorityGroups(candidates, n, stats, rng);
  return [...mandatory, ...shuffle(tie, rng).slice(0, need)];
}
