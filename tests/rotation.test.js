import { describe, it, assert, eq } from './runner.js';
import { makeRng } from '../js/rng.js';
import { nextMatch, dayStats, activeRestingIds } from '../js/rotation.js';

function roster(n, rng) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, mmr: 800 + Math.round(rng() * 600), games: 20 }));
}

// Simula o dia: gera partidas e aplica vencedores pela função `winnerOf`.
function simulate(present, games, winnerOf, seed = 1, teamSize = 6) {
  const rng = makeRng(seed);
  const matches = [];
  for (let seq = 1; seq <= games; seq++) {
    const m = nextMatch({ present, matches, teamSize, rng });
    if (m.error) throw new Error(m.error);
    matches.push({
      seq,
      teamA: m.teamA.map((p) => p.id),
      teamB: m.teamB.map((p) => p.id),
      streakA: m.streakA,
      streakB: m.streakB,
      reason: m.reason,
      winner: winnerOf(seq, m),
    });
  }
  return matches;
}

describe('Rodízio', () => {
  it('primeiro jogo é sorteio completo', () => {
    const present = roster(14, makeRng(1));
    const m = nextMatch({ present, matches: [], teamSize: 6, rng: makeRng(2) });
    eq(m.reason, 'inicio');
    eq(m.teamA.length, 6);
    eq(m.teamB.length, 6);
  });

  it('vencedor fica no máximo 2 jogos seguidos e depois os dois saem', () => {
    const present = roster(18, makeRng(5));
    // Time A sempre vence: A permanece (streak 2), depois sorteio completo, e assim por diante.
    const ms = simulate(present, 6, () => 'A');
    eq(ms.map((m) => m.reason), ['inicio', 'vencedor-fica', 'dois-saem', 'vencedor-fica', 'dois-saem', 'vencedor-fica']);
    eq(ms[1].teamA, ms[0].teamA, 'vencedor permaneceu');
    eq(ms[1].streakA, 2);
    for (const m of ms) assert(m.streakA <= 2 && m.streakB <= 2);
  });

  it('desafiante que vence fica e começa com sequência 1', () => {
    const present = roster(18, makeRng(6));
    const ms = simulate(present, 3, () => 'B');
    eq(ms[1].reason, 'vencedor-fica');
    eq(ms[1].teamA, ms[0].teamB);
    eq(ms[1].streakA, 2); // jogou o 1º como recém-sorteado e agora o 2º seguido
    eq(ms[2].teamA, ms[1].teamB, 'desafiante venceu e ficou');
    eq(ms[2].streakA, 2);
  });

  it('desafiante sai da fila de quem jogou menos', () => {
    const present = roster(18, makeRng(7));
    const ms = simulate(present, 2, () => 'A');
    const firstIds = new Set([...ms[0].teamA, ...ms[0].teamB]);
    for (const id of ms[1].teamB) assert(!firstIds.has(id), `${id} jogou o 1º e entrou de novo antes de quem não jogou`);
  });

  it('partidas jogadas ficam equilibradas ao longo do dia (18 presentes, 6x6)', () => {
    const present = roster(18, makeRng(8));
    for (let seed = 1; seed <= 10; seed++) {
      const rng = makeRng(seed * 101);
      const ms = simulate(present, 24, () => (rng() < 0.5 ? 'A' : 'B'), seed);
      const stats = dayStats(ms);
      const counts = present.map((p) => (stats[p.id] ? stats[p.id].games : 0));
      const spread = Math.max(...counts) - Math.min(...counts);
      assert(spread <= 2, `seed ${seed}: diferença ${spread} (${counts.join(',')})`);
    }
  });

  it('poucos presentes reduz o tamanho do time e avisa', () => {
    const present = roster(9, makeRng(9));
    const m = nextMatch({ present, matches: [], teamSize: 6, rng: makeRng(1) });
    eq(m.size, 4);
    assert(m.warning);
  });

  it('menos de 4 presentes dá erro', () => {
    const m = nextMatch({ present: roster(3, makeRng(1)), matches: [], teamSize: 6 });
    assert(m.error);
  });

  it('jogador do time vencedor que foi embora é substituído', () => {
    const all = roster(18, makeRng(10));
    const ms = simulate(all, 1, () => 'A');
    const leaving = ms[0].teamA[0];
    const present = all.filter((p) => p.id !== leaving);
    const m = nextMatch({ present, matches: ms, teamSize: 6, rng: makeRng(3) });
    eq(m.reason, 'vencedor-fica-substituicao');
    eq(m.teamA.length, 6);
    assert(!m.teamA.some((p) => p.id === leaving));
  });
});

describe('Descanso', () => {
  it('"só o próximo jogo" vale até o untilSeq e depois volta sozinho', () => {
    const resting = { p1: { untilSeq: 4 } };
    eq([...activeRestingIds(resting, 4)], ['p1']);
    eq([...activeRestingIds(resting, 5)], []);
  });

  it('"até avisar" continua valendo', () => {
    const resting = { p2: { untilSeq: null } };
    eq([...activeRestingIds(resting, 1)], ['p2']);
    eq([...activeRestingIds(resting, 99)], ['p2']);
  });

  it('sem descanso registrado não quebra', () => {
    eq(activeRestingIds(undefined, 3).size, 0);
  });

  it('vencedor que vai descansar é substituído e o time continua', () => {
    const all = roster(18, makeRng(11));
    const ms = simulate(all, 1, () => 'A');
    const resting = activeRestingIds({ [ms[0].teamA[1]]: { untilSeq: 2 } }, 2);
    const present = all.filter((p) => !resting.has(p.id));
    const m = nextMatch({ present, matches: ms, teamSize: 6, rng: makeRng(4) });
    eq(m.reason, 'vencedor-fica-substituicao');
    assert(!m.teamA.some((p) => resting.has(p.id)) && !m.teamB.some((p) => resting.has(p.id)));
  });
});
