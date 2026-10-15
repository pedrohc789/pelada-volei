import { describe, it, assert, eq } from './runner.js';
import { expected, computeDeltas, kFactor, levelMmr } from '../js/elo.js';

const team = (mmrs, games = 20, prefix = 'x') => mmrs.map((mmr, i) => ({ id: `${prefix}${i}`, mmr, games }));

describe('Elo', () => {
  it('times iguais têm 50% de chance', () => {
    assert(Math.abs(expected(1000, 1000) - 0.5) < 1e-9);
  });

  it('soma dos deltas é zero com K iguais e times de mesmo tamanho', () => {
    const a = team([1100, 1000, 900], 20, 'a');
    const b = team([1000, 1000, 950], 20, 'b');
    const d = computeDeltas(a, b, 'A');
    const sum = Object.values(d).reduce((s, x) => s + x, 0);
    assert(Math.abs(sum) <= a.length, `soma ${sum}`); // tolerância de arredondamento
  });

  it('favorito ganha menos ao vencer do que o azarão', () => {
    const fav = team([1300, 1300], 20, 'f');
    const und = team([900, 900], 20, 'u');
    const favWins = computeDeltas(fav, und, 'A').f0;
    const undWins = computeDeltas(und, fav, 'A').u0;
    assert(favWins > 0 && undWins > favWins, `${favWins} vs ${undWins}`);
  });

  it('perdedor perde pontos', () => {
    const d = computeDeltas(team([1000], 20, 'a'), team([1000], 20, 'b'), 'B');
    assert(d.a0 < 0 && d.b0 > 0);
  });

  it('jogador novo usa K maior', () => {
    eq(kFactor(0), 40);
    eq(kFactor(10), 20);
  });

  it('nível vira MMR inicial', () => {
    eq(levelMmr('iniciante'), 800);
    eq(levelMmr('avancado'), 1400);
    eq(levelMmr('???'), 1000);
  });
});
