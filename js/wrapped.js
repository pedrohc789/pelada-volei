// "Wrapped" do dia: curiosidades calculadas a partir das partidas concluídas (puro, testável).
import { expected } from './elo.js';

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Todos os que empatam no maior valor (> min).
function leaders(map, min = 0) {
  let best = min;
  for (const v of map.values()) if (v > best) best = v;
  if (best <= min) return null;
  return { ids: [...map.entries()].filter(([, v]) => v === best).map(([id]) => id), value: best };
}

function pairs(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]]);
  return out;
}

// matches: partidas do dia em ordem de seq ({teamA, teamB, winner, mmrBefore}).
export function computeWrapped(matches) {
  const games = new Map();
  const wins = new Map();
  const losses = new Map();
  const results = new Map(); // id -> ['W','L',...] em ordem
  const duo = new Map(); // par de companheiros -> {together, wins}
  const rivals = new Map(); // par de adversários -> {faced, winsOf: {id: n}}
  let upset = null;

  const add = (m, id, n = 1) => m.set(id, (m.get(id) || 0) + n);

  for (const m of matches) {
    const winIds = m.winner === 'A' ? m.teamA : m.teamB;
    const loseIds = m.winner === 'A' ? m.teamB : m.teamA;
    for (const id of [...winIds, ...loseIds]) {
      add(games, id);
      add(wins, id, 0);
      add(losses, id, 0);
    }
    for (const id of winIds) {
      add(wins, id);
      results.set(id, [...(results.get(id) || []), 'W']);
    }
    for (const id of loseIds) {
      add(losses, id);
      results.set(id, [...(results.get(id) || []), 'L']);
    }
    for (const [team, won] of [[winIds, true], [loseIds, false]]) {
      for (const [a, b] of pairs(team)) {
        const k = pairKey(a, b);
        const d = duo.get(k) || { ids: [a, b], together: 0, wins: 0 };
        d.together++;
        if (won) d.wins++;
        duo.set(k, d);
      }
    }
    for (const a of winIds) {
      for (const b of loseIds) {
        const k = pairKey(a, b);
        const r = rivals.get(k) || { ids: [a, b].sort(), faced: 0, winsOf: {} };
        r.faced++;
        r.winsOf[a] = (r.winsOf[a] || 0) + 1;
        rivals.set(k, r);
      }
    }
    if (m.mmrBefore) {
      const avg = (ids) => ids.reduce((s, id) => s + (m.mmrBefore[id] ?? 1000), 0) / ids.length;
      const chance = expected(avg(winIds), avg(loseIds));
      if (chance < 0.45 && (!upset || chance < upset.chance)) upset = { ids: winIds, chance, seq: m.seq };
    }
  }

  const streaks = new Map();
  for (const [id, rs] of results) {
    let cur = 0;
    let best = 0;
    for (const r of rs) {
      cur = r === 'W' ? cur + 1 : 0;
      best = Math.max(best, cur);
    }
    streaks.set(id, best);
  }

  const duos = [...duo.values()];
  const bestDuo = duos
    .filter((d) => d.wins >= 1)
    .sort((x, y) => y.wins - x.wins || y.wins / y.together - x.wins / x.together || y.together - x.together)[0] || null;
  const inseparable = duos
    .filter((d) => d.together >= 2 && (!bestDuo || pairKey(...d.ids) !== pairKey(...bestDuo.ids)))
    .sort((x, y) => y.together - x.together)[0] || null;
  const rival = [...rivals.values()].filter((r) => r.faced >= 2).sort((x, y) => y.faced - x.faced)[0] || null;

  const played = [...games.keys()];
  return {
    totalGames: matches.length,
    totalPlayers: played.length,
    mostGames: leaders(games),
    mostWins: leaders(wins),
    mostLosses: leaders(losses),
    unbeaten: played.filter((id) => losses.get(id) === 0),
    winless: played.filter((id) => wins.get(id) === 0),
    longestStreak: leaders(streaks, 1),
    bestDuo,
    inseparable,
    rival,
    upset,
    perPlayer: Object.fromEntries(played.map((id) => [id, { games: games.get(id), wins: wins.get(id), losses: losses.get(id) }])),
  };
}
