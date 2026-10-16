// Grupo sincronizado via Supabase: sessão anônima, criar/entrar/sair do grupo, espelho e tempo real.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as db from './db.js';
import { KIND, ConflictError, stripMeta } from './remoteOps.js';

const GROUP_KEY = 'pelada.group';
let client = null;
let channel = null;
let status = 'local'; // local | syncing | ok | offline
const statusListeners = new Set();
let onRemoteChange = () => {};

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function groupInfo() {
  try {
    return JSON.parse(localStorage.getItem(GROUP_KEY));
  } catch {
    return null;
  }
}

function saveGroupInfo(g) {
  try {
    if (g) localStorage.setItem(GROUP_KEY, JSON.stringify(g));
    else localStorage.removeItem(GROUP_KEY);
  } catch {
    /* sem armazenamento: o grupo vale só nesta sessão */
  }
}

export const getStatus = () => status;
export function onStatus(fn) {
  statusListeners.add(fn);
  fn(status);
}
function setStatus(s) {
  if (s === status) return;
  status = s;
  statusListeners.forEach((fn) => fn(s));
}

export function inviteLink(code) {
  return `${location.origin}${location.pathname.replace(/index\.html$/, '')}#/entrar/${code}`;
}

// A biblioteca (~110 KB) só é carregada quando o grupo é usado.
async function loadLib() {
  if (window.supabase) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/supabase.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Não foi possível carregar a sincronização. Verifique a internet.'));
    document.head.appendChild(s);
  });
}

// Uma única criação do cliente (e do login anônimo), mesmo se várias telas pedirem ao mesmo tempo.
let clientPromise = null;
function getClient() {
  if (!clientPromise) {
    clientPromise = createClientOnce().catch((e) => {
      clientPromise = null; // permite tentar de novo (ex.: estava sem internet)
      throw e;
    });
  }
  return clientPromise;
}

async function createClientOnce() {
  if (!isConfigured()) throw new Error('A sincronização ainda não foi configurada.');
  await loadLib();
  const c = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pelada-auth' },
  });
  const { data } = await c.auth.getSession();
  if (!data.session) {
    const { error } = await c.auth.signInAnonymously();
    if (error) throw new Error(`Não foi possível conectar: ${error.message}`);
  }
  client = c;
  return c;
}

async function rpc(name, args) {
  const c = await getClient();
  const { data, error } = await c.rpc(name, args);
  if (error) {
    if (/conflict/.test(error.message)) throw new ConflictError();
    if (/invalid_code/.test(error.message)) throw new Error('Link de grupo inválido ou expirado.');
    if (/forbidden/.test(error.message)) throw new Error('Este aparelho não faz parte do grupo.');
    throw new Error(error.message);
  }
  return data;
}

// Baixa todos os documentos do grupo (em páginas de 1000) e substitui o espelho.
async function pullAll(groupId) {
  const c = await getClient();
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await c.from('docs').select('kind,id,data,version').eq('group_id', groupId).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  await db.mirrorReplace(rows);
}

let rerenderTimer = null;
function scheduleRerender() {
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => onRemoteChange(), 150);
}

async function subscribe(groupId) {
  const c = await getClient();
  if (channel) await c.removeChannel(channel);
  channel = c
    .channel(`docs-${groupId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'docs', filter: `group_id=eq.${groupId}` }, (p) => apply({ row: p.new }))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'docs', filter: `group_id=eq.${groupId}` }, (p) => apply({ row: p.new }))
    // Exclusões não aceitam filtro: chegam de todos os grupos, só com a chave; filtramos aqui.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'docs' }, (p) => {
      if (p.old && p.old.group_id === groupId) apply({ deleted: { kind: p.old.kind, id: p.old.id } });
    })
    .subscribe((s) => {
      if (s === 'SUBSCRIBED') setStatus('ok');
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus(navigator.onLine ? 'syncing' : 'offline');
    });
}

async function apply(change) {
  if (await db.mirrorApply(change)) scheduleRerender();
}

// Liga o modo grupo: espelho local + servidor + tempo real.
async function connect(g) {
  db.useGroup(g.id, {
    isOnline: () => navigator.onLine && status !== 'offline',
    applyOps: (ops) => rpc('apply_ops', { p_group: g.id, p_ops: ops }),
  });
  if (!navigator.onLine) {
    setStatus('offline');
    return;
  }
  setStatus('syncing');
  try {
    await pullAll(g.id);
    await subscribe(g.id);
  } catch (e) {
    console.warn('Sincronização indisponível', e);
    setStatus('offline');
  }
}

// Chamado na abertura do app. onChange: re-render quando chegam mudanças de outros aparelhos.
export async function start(onChange) {
  onRemoteChange = onChange;
  window.addEventListener('offline', () => groupInfo() && setStatus('offline'));
  window.addEventListener('online', async () => {
    const g = groupInfo();
    if (!g) return;
    await connect(g); // ao voltar, baixa tudo de novo (pode ter perdido mudanças)
    onRemoteChange();
  });
  const g = groupInfo();
  if (g && isConfigured()) await connect(g);
}

// Cria um grupo com os dados atuais deste aparelho.
export async function createGroup(name) {
  const local = await db.readLocalDb();
  const docs = [];
  for (const [store, list] of Object.entries(local)) {
    for (const obj of list) docs.push({ kind: KIND[store], id: obj.id, data: stripMeta(obj) });
  }
  const g = await rpc('create_group', { p_name: name, p_docs: docs });
  const info = { id: g.id, name: g.name, code: g.invite_code };
  saveGroupInfo(info);
  await connect(info);
  return info;
}

export async function joinGroup(code) {
  const g = await rpc('join_group', { p_code: code });
  const info = { id: g.id, name: g.name, code: g.invite_code };
  saveGroupInfo(info);
  await connect(info);
  return info;
}

// Volta ao modo local. Os dados locais antigos continuam no aparelho.
export async function leaveGroup() {
  const g = groupInfo();
  if (g && client) {
    try {
      await rpc('leave_group', { p_group: g.id });
    } catch (e) {
      console.warn('Não foi possível sair no servidor', e);
    }
    if (channel) await client.removeChannel(channel);
    channel = null;
  }
  saveGroupInfo(null);
  db.useLocal();
  setStatus('local');
}

// Força uma nova sincronização (usado depois de um conflito).
export async function refresh() {
  const g = groupInfo();
  if (g && navigator.onLine) await pullAll(g.id);
}
