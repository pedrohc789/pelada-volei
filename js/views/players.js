// Cadastro do grupo. Listas mostram só nomes; o MMR aparece apenas na ficha do jogador.
import { listPlayers, getPlayer, savePlayer, setPlayerActive, resetPlayerMmr } from '../store.js';
import { LEVELS } from '../elo.js';
import { esc, openDialog, closeDialog, toast, plural, askConfirm, initials } from '../ui.js';

export const title = 'Jogadores';

export async function render(root, ctx) {
  const all = await listPlayers();
  const active = all.filter((p) => p.active);
  const inactive = all.filter((p) => !p.active);
  const item = (p) => `<li><button class="row" data-id="${p.id}"><span class="av">${esc(initials(p.name))}</span><span class="grow">${esc(p.name)}</span><span class="chev">›</span></button></li>`;

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
  const levelId = p ? p.level : 'intermediario';
  const levelIdx = Math.max(0, LEVELS.findIndex((l) => l.id === levelId));
  openDialog(`
    <form method="dialog" class="form" id="pform">
      <h2>${p ? 'Ficha do jogador' : 'Novo jogador'}</h2>
      <label>Nome<input name="name" required maxlength="40" autocomplete="off" value="${esc(p?.name)}"></label>
      <div class="level-field">
        <div class="level-head"><span>Nível inicial</span><strong id="level-label">${LEVELS[levelIdx].label}</strong></div>
        <input type="range" class="level-range" id="level-range" min="0" max="${LEVELS.length - 1}" step="1" value="${levelIdx}" aria-label="Nível inicial" aria-valuetext="${LEVELS[levelIdx].label}">
        <input type="hidden" name="level" value="${LEVELS[levelIdx].id}">
        <div class="level-ticks">${LEVELS.map((l, i) => `<span style="left:${(i / (LEVELS.length - 1)) * 100}%">${l.label}</span>`).join('')}</div>
      </div>
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
    const range = dlg.querySelector('#level-range');
    const syncLevel = () => {
      const lvl = LEVELS[Number(range.value)];
      form.elements.level.value = lvl.id;
      dlg.querySelector('#level-label').textContent = lvl.label;
      range.setAttribute('aria-valuetext', lvl.label);
      range.style.setProperty('--fill', `${(range.value / (LEVELS.length - 1)) * 100}%`);
    };
    range.addEventListener('input', syncLevel);
    syncLevel();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const saved = await savePlayer({ id: p?.id, name: form.elements.name.value, level: form.elements.level.value });
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
      if (!(await askConfirm('Voltar o MMR para o valor do nível selecionado?'))) return;
      await savePlayer({ id: p.id, name: form.elements.name.value, level: form.elements.level.value });
      await resetPlayerMmr(p.id);
      closeDialog();
      toast('MMR redefinido');
      ctx.rerender();
    });
  });
}
