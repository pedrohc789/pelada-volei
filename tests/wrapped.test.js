import { describe, it, assert, eq } from './runner.js';
import { computeWrapped } from '../js/wrapped.js';

const m = (seq, teamA, teamB, winner, mmrBefore) => ({ seq, teamA, teamB, winner, mmrBefore });

// a,b sempre juntos e vencem 3x; c perde tudo; d vence 1 com azarão.
const DAY = [
  m(1, ['a', 'b'], ['c', 'd'], 'A'),
  m(2, ['a', 'b'], ['c', 'e'], 'A'),
  m(3, ['c', 'f'], ['a', 'b'], 'B'),
  m(4, ['d', 'e'], ['c', 'f'], 'A', { d: 800, e: 800, c: 1400, f: 1400 }),
];

describe('Wrapped do dia', () => {
  const w = computeWrapped(DAY);

  it('totais', () => {
    eq(w.totalGames, 4);
    eq(w.totalPlayers, 6);
  });

  it('quem mais jogou', () => {
    eq(w.mostGames, { ids: ['c'], value: 4 });
  });

  it('quem venceu mais (empate lista todos)', () => {
    eq(w.mostWins.value, 3);
    eq(w.mostWins.ids.sort(), ['a', 'b']);
  });

  it('quem perdeu mais', () => {
    eq(w.mostLosses, { ids: ['c'], value: 4 });
  });

  it('invictos e sem vitória', () => {
    eq(w.unbeaten.sort(), ['a', 'b']);
    eq(w.winless.sort(), ['c', 'f']);
  });

  it('melhor dupla', () => {
    eq(w.bestDuo.ids.sort(), ['a', 'b']);
    eq(w.bestDuo.wins, 3);
    eq(w.bestDuo.together, 3);
  });

  it('maior sequência de vitórias', () => {
    eq(w.longestStreak.value, 3);
  });

  it('rivais: quem mais se enfrentou', () => {
    assert(w.rival.faced >= 3, `faced ${w.rival.faced}`);
  });

  it('zebra: vitória com menor chance', () => {
    eq(w.upset.seq, 4);
    assert(w.upset.chance < 0.1);
  });

  it('dia sem jogos não quebra', () => {
    const e = computeWrapped([]);
    eq(e.totalGames, 0);
    eq(e.mostWins, null);
    eq(e.bestDuo, null);
  });
});
