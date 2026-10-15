import { describe, it, assert, eq } from './runner.js';
import { makeRng } from '../js/rng.js';
import { avgMmr } from '../js/elo.js';
import { allSplits, balancedSplit, combinations, countCombinations, priorityGroups, selectPlayers, pickGroup, matchKey } from '../js/balance.js';

const players = (mmrs) => mmrs.map((mmr, i) => ({ id: `p${i}`, mmr, games: 0 }));
const MMRS12 = [1400, 1350, 1200, 1200, 1150, 1000, 1000, 980, 900, 850, 800, 800];

describe('Combinações', () => {
  it('conta e gera corretamente', () => {
    eq(countCombinations(12, 6), 924);
    eq([...combinations([1, 2, 3, 4], 2)].length, 6);
  });

  it('12 jogadores geram 462 divisões 6x6', () => {
    eq(allSplits(players(MMRS12), 6).length, 462);
  });
});

describe('Divisão equilibrada', () => {
  it('times têm o mesmo tamanho e todos os jogadores', () => {
    const { teamA, teamB } = balancedSplit(players(MMRS12), 6, { rng: makeRng(1) });
    eq(teamA.length, 6);
    eq(teamB.length, 6);
    eq(new Set([...teamA, ...teamB].map((p) => p.id)).size, 12);
  });

  it('custo fica dentro da tolerância do ótimo (força bruta)', () => {
    const ps = players(MMRS12);
    const best = Math.min(...allSplits(ps, 6).map((s) => s.cost));
    for (let seed = 1; seed <= 20; seed++) {
      const { cost } = balancedSplit(ps, 6, { rng: makeRng(seed) });
      assert(cost <= best + 15, `seed ${seed}: ${cost} > ${best} + 15`);
    }
  });

  it('aleatoriedade gera divisões diferentes', () => {
    const ps = players(MMRS12);
    const keys = new Set();
    for (let seed = 1; seed <= 20; seed++) {
      const { teamA, teamB } = balancedSplit(ps, 6, { rng: makeRng(seed) });
      keys.add(matchKey(teamA, teamB));
    }
    assert(keys.size > 1, 'sempre a mesma divisão');
  });

  it('"sortear de novo" evita repetir o confronto atual', () => {
    const ps = players(MMRS12);
    const first = balancedSplit(ps, 6, { rng: makeRng(3) });
    const k = matchKey(first.teamA, first.teamB);
    for (let seed = 1; seed <= 10; seed++) {
      const again = balancedSplit(ps, 6, { rng: makeRng(seed), avoidKey: k });
      assert(matchKey(again.teamA, again.teamB) !== k);
    }
  });
});

describe('Prioridade por partidas no dia', () => {
  it('quem jogou menos sempre entra antes', () => {
    const ps = players(new Array(10).fill(1000));
    const stats = {};
    ps.forEach((p, i) => (stats[p.id] = { games: i < 4 ? 0 : 2, lastSeq: i < 4 ? -1 : 3 }));
    for (let seed = 1; seed <= 10; seed++) {
      const chosen = selectPlayers(ps, 6, stats, makeRng(seed)).map((p) => p.id);
      for (let i = 0; i < 4; i++) assert(chosen.includes(`p${i}`), `p${i} ficou de fora`);
    }
  });

  it('separa obrigatórios e grupo empatado', () => {
    const ps = players(new Array(6).fill(1000));
    const stats = { p0: { games: 0, lastSeq: -1 }, p1: { games: 1, lastSeq: 1 }, p2: { games: 1, lastSeq: 1 }, p3: { games: 1, lastSeq: 1 }, p4: { games: 2, lastSeq: 2 }, p5: { games: 2, lastSeq: 2 } };
    const g = priorityGroups(ps, 3, stats, makeRng(1));
    eq(g.mandatory.map((p) => p.id), ['p0']);
    eq(g.tie.length, 3);
    eq(g.need, 2);
  });

  it('entre empatados escolhe o grupo de média mais próxima do alvo', () => {
    const ps = players([1400, 1400, 800, 800, 1000, 1000]);
    const group = pickGroup(ps, 2, {}, { target: 1000, rng: makeRng(1), tolerance: 0 });
    const a = avgMmr(group);
    assert(a === 1000, `média ${a}`);
  });
});
