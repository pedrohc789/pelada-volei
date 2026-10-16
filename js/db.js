// Wrapper mínimo de IndexedDB com promises, com dois modos e a mesma API:
//  - local: os dados vivem só neste aparelho (banco "pelada-volei");
//  - grupo: o IndexedDB vira um espelho do grupo no Supabase (banco "pelada-grupo-<id>").
//    Leituras vêm do espelho (rápido e funciona offline); gravações vão primeiro ao servidor
//    (com controle de versão) e só então atualizam o espelho.
import { toRemoteOps, fromRow, STORE, OfflineError } from './remoteOps.js';

const LOCAL_DB = 'pelada-volei';
const DB_VERSION = 1;
export const STORES = ['players', 'days', 'matches'];

const opened = new Map();
let dbName = LOCAL_DB;
// remote: {applyOps(ops) → resultados, isOnline() → bool} quando em modo grupo.
let remote = null;

function openDb(name = dbName) {
  if (opened.has(name)) return opened.get(name);
  const p = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('players')) db.createObjectStore('players', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('matches')) {
        db.createObjectStore('matches', { keyPath: 'id' }).createIndex('dayId', 'dayId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  opened.set(name, p);
  return p;
}

export function useLocal() {
  dbName = LOCAL_DB;
  remote = null;
}

export function useGroup(groupId, remoteApi) {
  dbName = `pelada-grupo-${groupId}`;
  remote = remoteApi;
}

export const isGroupMode = () => remote !== null;

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store) {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).getAll());
}

export async function get(store, id) {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).get(id));
}

export async function getByIndex(store, index, value) {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).index(index).getAll(value));
}

// Grava no IndexedDB atual numa única transação. ops: [{store, put} | {store, del} | {store, clear}].
async function writeLocal(ops, name = dbName) {
  if (!ops.length) return;
  const db = await openDb(name);
  const names = [...new Set(ops.map((o) => o.store))];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    for (const o of ops) {
      const s = tx.objectStore(o.store);
      if (o.clear) s.clear();
      else if (o.del !== undefined) s.delete(o.del);
      else s.put(o.put);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// No modo grupo, envia ao servidor (tudo ou nada; ConflictError se outro aparelho mudou antes)
// e depois reflete no espelho com as versões novas.
export async function write(ops) {
  if (!remote) return writeLocal(ops);
  if (!remote.isOnline()) throw new OfflineError();
  const versions = new Map();
  for (const o of ops) {
    if (o.del !== undefined) versions.set(`${o.store}:${o.del}`, (await get(o.store, o.del))?._version || 0);
  }
  const results = await remote.applyOps(toRemoteOps(ops, (store, id) => versions.get(`${store}:${id}`) || 0));
  const byKey = new Map(results.map((r) => [`${STORE[r.kind]}:${r.id}`, r]));
  const local = ops.map((o) => {
    if (o.del !== undefined) return o;
    const r = byKey.get(`${o.store}:${o.put.id}`);
    return { store: o.store, put: { ...o.put, _version: r ? r.version : o.put._version } };
  });
  await writeLocal(local);
}

export const put = (store, obj) => write([{ store, put: obj }]);
export const del = (store, id) => write([{ store, del: id }]);

// ---------- Espelho do grupo (usado pelo sync.js) ----------

// Substitui todo o espelho pelos dados vindos do servidor (linhas de `docs`).
export async function mirrorReplace(rows) {
  const ops = STORES.map((store) => ({ store, clear: true }));
  for (const row of rows) ops.push({ store: STORE[row.kind], put: fromRow(row) });
  await writeLocal(ops);
}

// Aplica uma mudança recebida em tempo real. Retorna true se o espelho mudou.
// change: {row} para inserção/atualização ou {deleted: {kind, id}}.
export async function mirrorApply(change) {
  if (change.deleted) {
    const store = STORE[change.deleted.kind];
    if (!store || !(await get(store, change.deleted.id))) return false;
    await writeLocal([{ store, del: change.deleted.id }]);
    return true;
  }
  const store = STORE[change.row.kind];
  const cur = await get(store, change.row.id);
  if (cur && (cur._version || 0) >= change.row.version) return false; // eco da nossa própria gravação
  await writeLocal([{ store, put: fromRow(change.row) }]);
  return true;
}

// Lê todos os documentos do banco local (fora do modo grupo), para criar um grupo a partir dele.
export async function readLocalDb() {
  const out = {};
  const db = await openDb(LOCAL_DB);
  for (const s of STORES) out[s] = await wrap(db.transaction(s).objectStore(s).getAll());
  return out;
}

export function newId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
