// Tradução das gravações do app (por store do IndexedDB) para as operações do Supabase.
// Puro e testável: não fala com rede nem com o banco local.

export const KIND = { players: 'player', days: 'day', matches: 'match' };
export const STORE = { player: 'players', day: 'days', match: 'matches' };

export class ConflictError extends Error {
  constructor() {
    super('Outro organizador alterou isso agora — atualizei a tela.');
    this.name = 'ConflictError';
  }
}

export class OfflineError extends Error {
  constructor() {
    super('Sem conexão — para alterar os dados do grupo, conecte-se à internet.');
    this.name = 'OfflineError';
  }
}

// Remove os campos internos de sincronização antes de enviar.
export function stripMeta(obj) {
  const { _version, ...data } = obj;
  return data;
}

// ops: [{store, put} | {store, del} | {store, clear}]; versionOf(store, id) → versão no espelho (0 se não existe).
// Retorna as operações do apply_ops: [{op, kind, id, data?, expect}].
export function toRemoteOps(ops, versionOf) {
  return ops.map((o) => {
    const kind = KIND[o.store];
    if (!kind) throw new Error(`Store desconhecida: ${o.store}`);
    if (o.clear) throw new Error('Essa ação não está disponível no modo grupo.');
    if (o.del !== undefined) return { op: 'del', kind, id: o.del, expect: versionOf(o.store, o.del) };
    // A versão esperada é a que veio junto com o objeto lido; objeto novo = 0.
    return { op: 'put', kind, id: o.put.id, data: stripMeta(o.put), expect: o.put._version || 0 };
  });
}

// Linha do Supabase → objeto do app com a versão anexada.
export function fromRow(row) {
  return { ...row.data, _version: row.version };
}
