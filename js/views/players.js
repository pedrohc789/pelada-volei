// Cadastro do grupo. Listas mostram só nomes; o MMR aparece apenas na ficha do jogador.
import { listPlayers, getPlayer, savePlayer, setPlayerActive, resetPlayerMmr } from '../store.js';
import { LEVELS } from '../elo.js';
import { esc, openDialog, closeDialog, toast, plural } from '../ui.js';

export const title = 'Jogadores';

export async function render(root, ctx) {
  const all = await listPlayers();
  const active = all.filter((p) => p.active);
  const inactive = all.filter((p) => !p.active);
  const item = (p) => `<li><button class="row" data-id="${p.id}">${esc(p.name)}<span class="chev">›</span></button></li>`;

  root.innerHTML = `
    <button class="btn primary block" id="add">+ Novo jogador</button>
    <section class="card">
      <h2>Grupo <small>${plural(active.length, 'jogador', 'jogadores')}</small></h2>
      ${active.length ? `<ul class="list">${active.map(item).join('')}</ul>` : '<p class="muted">Nenhum jogador cadastrado ainda.</p>'}
    </section>
    ${inactive.length ? `
      <details class="card">
        <summary>Inativos (${inactive.length})</summary>
        <ul class="list">${inactive.map(item).join('')}</ul>
      </details>` : ''}
  `;

  root.querySelector('#add').addEventListener('click', () => openPlayerForm(null, ctx));
  root.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => openPlayerForm(b.dataset.id, ctx)));
}

export async function openPlayerForm(id, ctx, { onSaved } = {}) {
  const p = id ? await getPlayer(id) : null;
  const levelOpts = LEVELS.map((l) => `<option value="${l.id}" ${(p ? p.level : 'intermediario') === l.id ? 'selected' : ''}>${l.label}</option>`).join('');
  openDialog(`
    <form method="dialog" class="form" id="pform">
      <h2>${p ? 'Ficha do jogador' : 'Novo jogador'}</h2>
      <label>Nome<input name="name" required maxlength="40" autocomplete="off" value="${esc(p?.name)}"></label>
      <label>Nível inicial<select name="level">${levelOpts}</select></label>
      ${p ? `
        <div class="stats">
          <div><span class="muted">MMR atual</span><strong id="mmr">${p.mmr}</strong></div>
          <div><span class="muted">Partidas</span><strong>${p.games}</strong></div>
        </div>
        <p class="muted small">${p.games ? 'O MMR é ajustado automaticamente pelos resultados. Visível só aqui.' : 'Sem partidas: o nível define o MMR inicial.'}</p>` : '<p class="muted small">O nível vira o MMR inicial; depois ele se ajusta pelos resultados.</p>'}
      <div class="actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button type="submit" class="btn primary">Salvar</button>
      </div>
      ${p ? `
        <div class="actions secondary">
          ${p.games ? '<button type="button" class="btn ghost" id="reset">Redefinir MMR pelo nível</button>' : ''}
          <button type="button" class="btn ghost danger" id="toggle">${p.active ? 'Desativar' : 'Reativar'}</button>
        </div>` : ''}
    </form>`, (dlg) => {
    const form = dlg.querySelector('#pform');
    if (!p) setTimeout(() => form.elements.name.focus(), 50);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const saved = await savePlayer({ id: p?.id, name: form.elements.name.value, level: form.level.value });
        closeDialog();
        toast(p ? 'Jogador atualizado' : 'Jogador cadastrado');
        if (onSaved) await onSaved(saved);
        else ctx.rerender();
      } catch (err) {
        toast(err.message);
      }
    });
    dlg.querySelector('#toggle')?.addEventListener('click', async () => {
      await setPlayerActive(p.id, !p.active);
      closeDialog();
      ctx.rerender();
    });
    dlg.querySelector('#reset')?.addEventListener('click', async () => {
      if (!confirm('Voltar o MMR para o valor do nível selecionado?')) return;
      await savePlayer({ id: p.id, name: form.elements.name.value, level: form.level.value });
      await resetPlayerMmr(p.id);
      closeDialog();
      toast('MMR redefinido');
      ctx.rerender();
    });
  });
}
