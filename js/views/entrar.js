// #/entrar/<código>: entra no grupo pelo link de convite.
import * as sync from '../sync.js';
import { esc, askConfirm } from '../ui.js';

export const title = 'Entrar no grupo';

// A tela pode ser desenhada duas vezes seguidas (abertura do app + fim da sincronização);
// a entrada no grupo acontece uma vez só por código.
let joining = null;

export async function render(root, ctx) {
  const code = ctx.param;
  if (joining && joining.code === code) {
    root.innerHTML = '<section class="card"><h2>Entrando no grupo…</h2><p class="muted" style="margin:0">Baixando jogadores e partidas.</p></section>';
    return;
  }
  if (!sync.isConfigured()) {
    root.innerHTML = '<section class="card error"><p>A sincronização ainda não foi configurada neste app.</p></section>';
    return;
  }
  const current = sync.groupInfo();
  if (current && current.code === code) {
    location.replace('#/partida');
    return;
  }
  root.innerHTML = '<section class="card"><h2>Entrando no grupo…</h2><p class="muted" style="margin:0">Baixando jogadores e partidas.</p></section>';
  if (current && !(await askConfirm(`Você está no grupo "${current.name}". Trocar para o grupo do link?`, 'Trocar'))) {
    location.replace('#/config');
    return;
  }
  joining = { code };
  try {
    if (current) await sync.leaveGroup();
    const g = await sync.joinGroup(code);
    root.innerHTML = `<section class="card hero volt"><span class="eyebrow">✓ Pronto</span><h2>${esc(g.name)}</h2><p>Você entrou no grupo. Tudo o que for registrado aparece para todos.</p></section>`;
    setTimeout(() => location.replace('#/partida'), 1200);
  } catch (e) {
    root.innerHTML = `<section class="card error"><p>${esc(e.message)}</p><a class="btn block" href="#/config">Voltar</a></section>`;
  } finally {
    joining = null;
  }
}
