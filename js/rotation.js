// Regra de rodízio: vencedor fica, no máximo 2 jogos seguidos; ao completar o 2º jogo
// seguido os dois times saem e há sorteio completo.
import { avgMmr } from './elo.js';
import { balancedSplit, matchKey, pickGroup, selectPlayers, getStat } from './balance.js';

export const MAX_STREAK = 2;
export const MIN_PLAYERS = 4;

// matches: partidas concluídas do dia, em ordem de seq.
export function dayStats(matches) {
  const stats = {};
  for (const m of matches) {
    for (const id of [...m.teamA, ...m.teamB]) {
      const s = getStat(stats, id);
      stats[id] = { games: s.games + 1, lastSeq: m.seq };
    }
  }
  return stats;
}

// Time que fica na quadra após a última partida (ou null se é hora de sorteio completo).
export function stayingTeam(matches) {
  const last = matches[matches.length - 1];
  if (!last || !last.winner) return null;
  const ids = last.winner === 'A' ? last.teamA : last.teamB;
  const streak = last.winner === 'A' ? last.streakA : last.streakB;
  return { ids, streak, mustLeave: streak >= MAX_STREAK };
}

// present: [{id, mmr, games}] (jogadores presentes no dia)
// Retorna {teamA, teamB, streakA, streakB, reason, size, warning} ou {error}.
// teamA é sempre o time que permaneceu, quando houver.
export function nextMatch({ present, matches, teamSize, rng = Math.random, avoidKey = null, forceDraw = false }) {
  if (present.length < MIN_PLAYERS) {
    return { error: `São necessários pelo menos ${MIN_PLAYERS} jogadores presentes.` };
  }
  const T = Math.min(teamSize, Math.floor(present.length / 2));
  const warning = T < teamSize ? `Poucos presentes: times de ${T} em vez de ${teamSize}.` : null;
  const stats = dayStats(matches);
  const stay = stayingTeam(matches);

  if (stay && !stay.mustLeave && !forceDraw) {
    const byId = new Map(present.map((p) => [p.id, p]));
    let winners = stay.ids.filter((id) => byId.has(id)).map((id) => byId.get(id));
    if (winners.length && winners.length <= T) {
      let pool = present.filter((p) => !stay.ids.includes(p.id));
      let substituted = false;
      if (winners.length < T) {
        // Alguém do time vencedor foi embora: completa com quem tem prioridade, mantendo o nível do time.
        const subs = pickGroup(pool, T - winners.length, stats, { target: avgMmr(winners), base: winners, rng });
        const subIds = new Set(subs.map((p) => p.id));
        winners = [...winners, ...subs];
        pool = pool.filter((p) => !subIds.has(p.id));
        substituted = true;
      }
      const challenger = pickGroup(pool, T, stats, {
        target: avgMmr(winners),
        rng,
        avoidKey,
        avoidKeyOf: (g) => matchKey(winners, g),
      });
      return {
        teamA: winners,
        teamB: challenger,
        streakA: stay.streak + 1,
        streakB: 1,
        reason: substituted ? 'vencedor-fica-substituicao' : 'vencedor-fica',
        size: T,
        warning,
      };
    }
  }

  const chosen = selectPlayers(present, 2 * T, stats, rng);
  const split = balancedSplit(chosen, T, { rng, avoidKey });
  let reason = 'sorteio';
  if (forceDraw) reason = 'sorteio-manual';
  else if (stay && stay.mustLeave) reason = 'dois-saem';
  else if (!matches.length) reason = 'inicio';
  return { teamA: split.teamA, teamB: split.teamB, streakA: 1, streakB: 1, reason, size: T, warning };
}
