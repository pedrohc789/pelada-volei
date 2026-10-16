import { describe, it, assert, eq } from './runner.js';
import { toRemoteOps, fromRow, stripMeta } from '../js/remoteOps.js';

describe('Sincronização · operações remotas', () => {
  it('put de objeto lido envia a versão que veio com ele', () => {
    const ops = toRemoteOps([{ store: 'players', put: { id: 'p1', name: 'Ana', _version: 3 } }], () => 0);
    eq(ops, [{ op: 'put', kind: 'player', id: 'p1', data: { id: 'p1', name: 'Ana' }, expect: 3 }]);
  });

  it('objeto novo espera versão 0 (não pode existir)', () => {
    const [op] = toRemoteOps([{ store: 'matches', put: { id: 'd1:4', seq: 4 } }], () => 0);
    eq(op.expect, 0);
    eq(op.kind, 'match');
  });

  it('exclusão usa a versão do espelho', () => {
    const [op] = toRemoteOps([{ store: 'matches', del: 'd1:4' }], (store, id) => (store === 'matches' && id === 'd1:4' ? 2 : 0));
    eq(op, { op: 'del', kind: 'match', id: 'd1:4', expect: 2 });
  });

  it('"apagar tudo" não é permitido no modo grupo', () => {
    let erro = null;
    try {
      toRemoteOps([{ store: 'players', clear: true }], () => 0);
    } catch (e) {
      erro = e;
    }
    assert(erro, 'deveria recusar clear');
  });

  it('linha do servidor vira objeto do app com _version', () => {
    eq(fromRow({ kind: 'day', id: 'd1', data: { id: 'd1', status: 'aberto' }, version: 5 }), { id: 'd1', status: 'aberto', _version: 5 });
    eq(stripMeta({ id: 'x', _version: 9 }), { id: 'x' });
  });
});
