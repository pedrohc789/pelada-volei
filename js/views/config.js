// Grupo sincronizado, backup e informações do app.
import { exportAll, importAll, wipeAll } from '../store.js';
import { MAX_STREAK } from '../rotation.js';
import { toast, todayIso, askConfirm, esc, openDialog, closeDialog } from '../ui.js';
import * as sync from '../sync.js';

export const title = 'Ajustes';

function groupSection(g) {
  if (!sync.isConfigured()) {
    return `<section class="card"><h2>Grupo</h2><p class="muted small" style="margin:0">A sincronização em grupo ainda não foi configurada neste app.</p></section>`;
  }
  if (!g) {
    return `
      <section class="card">
        <h2>Grupo</h2>
        <p class="muted small">Hoje os dados ficam só neste aparelho. Crie um grupo para que todos com o link vejam e registrem os jogos, sincronizado na hora.</p>
        <button class="btn primary block" id="g-create">Criar grupo com os dados deste aparelho</button>
        <button class="btn block" id="g-join">Entrar com um link de grupo</button>
      </section>`;
  }
  const status = { ok: '🟢 Sincronizado', syncing: '🔄 Sincronizando…', offline: '⚪ Offline — só leitura' }[sync.getStatus()] || '';
  return `
    <section class="card hero volt">
      <span class="eyebrow">Grupo · ${status}</span>
      <h2>${esc(g.name)}</h2>
      <p>Quem tiver o link pode ver e registrar os jogos.</p>
    </section>
    <section class="card">
      <h2>Convidar</h2>
      <p class="group-code">${esc(sync.inviteLink(g.code))}</p>
      <div class="row-actions" style="margin:12px 0 0">
        <button class="btn primary" id="g-copy">Copiar link</button>
        <a class="btn" id="g-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Entra no grupo da pelada "${g.name}": ${sync.inviteLink(g.code)}`)}">WhatsApp</a>
      </div>
      <button class="btn ghost danger block" id="g-leave" style="margin:10px 0 0">Sair do grupo</button>
    </section>`;
}

export async function render(root, ctx) {
  const g = sync.groupInfo();
  root.innerHTML = `
    ${groupSection(g)}
    <section class="card">
      <h2>Backup</h2>
      <p class="muted small">${g ? 'Salva uma cópia dos dados do grupo neste aparelho.' : 'Os dados ficam só neste aparelho. Exporte de vez em quando para não perder nada ou para passar para outro celular.'}</p>
      <button class="btn primary block" id="export">Exportar backup (.json)</button>
      ${g ? '' : '<label class="btn block file">Importar backup<input type="file" id="import" accept="application/json,.json" hidden></label>'}
    </section>
    <section class="card">
      <h2>Como o sorteio funciona</h2>
      <ul class="rules">
        <li>Entra primeiro quem jogou <b>menos partidas hoje</b>; empate: quem está há mais tempo sem jogar.</li>
        <li>Entre os empatados, o app escolhe a combinação que deixa os times mais equilibrados e sorteia entre as opções quase iguais.</li>
        <li><b>Vencedor fica</b>, no máximo ${MAX_STREAK} jogos seguidos. Ao completar o ${MAX_STREAK}º, os dois times saem e há sorteio novo.</li>
        <li>Cada jogador tem uma nota interna (MMR) que sobe ao vencer e desce ao perder, mais quando o adversário era mais forte. Ela só aparece na ficha do jogador.</li>
      </ul>
    </section>
    ${g ? '' : `
    <section class="card">
      <h2>Apagar tudo</h2>
      <button class="btn ghost danger block" id="wipe">Apagar todos os dados</button>
    </section>`}
  `;
  bindGroup(root, ctx);

  root.querySelector('#export').addEventListener('click', async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pelada-volei-backup-${todayIso()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  root.querySelector('#import')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!(await askConfirm(`Substituir todos os dados atuais pelo backup (${data.players?.length ?? 0} jogadores)?`))) return;
      await importAll(data);
      toast('Backup importado');
      ctx.rerender();
    } catch (err) {
      toast(err.message || 'Não foi possível ler o arquivo.');
    } finally {
      e.target.value = '';
    }
  });

  root.querySelector('#wipe')?.addEventListener('click', async () => {
    if (!(await askConfirm('Apagar TODOS os jogadores, dias e partidas deste aparelho?'))) return;
    if (!(await askConfirm('Tem certeza? Isso não pode ser desfeito (exporte um backup antes).'))) return;
    await wipeAll();
    toast('Dados apagados');
    ctx.rerender();
  });
}

function bindGroup(root, ctx) {
  const g = sync.groupInfo();
  root.querySelector('#g-create')?.addEventListener('click', () => {
    openDialog(`
      <form class="form" id="g-form">
        <h2>Criar grupo</h2>
        <label>Nome do grupo<input name="gname" maxlength="40" autocomplete="off" placeholder="Pelada de quinta"></label>
        <p class="muted small">Os jogadores, dias e partidas deste aparelho vão para o grupo. Depois é só mandar o link para os outros organizadores.</p>
        <div class="actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Criar</button></div>
      </form>`, (dlg) => {
      const form = dlg.querySelector('#g-form');
      setTimeout(() => form.elements.gname.focus(), 50);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('.btn.primary');
        btn.disabled = true;
        btn.textContent = 'Criando…';
        try {
          await sync.createGroup(form.elements.gname.value);
          closeDialog();
          toast('Grupo criado! Agora é só convidar.');
          ctx.rerender();
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
          btn.textContent = 'Criar';
        }
      });
    });
  });

  root.querySelector('#g-join')?.addEventListener('click', () => {
    openDialog(`
      <form class="form" id="j-form">
        <h2>Entrar no grupo</h2>
        <label>Link ou código do grupo<input name="code" autocomplete="off" placeholder="https://…/#/entrar/…"></label>
        <p class="muted small">Os dados que estão só neste aparelho ficam guardados; você pode voltar a eles saindo do grupo.</p>
        <div class="actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Entrar</button></div>
      </form>`, (dlg) => {
      const form = dlg.querySelector('#j-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const raw = form.elements.code.value.trim();
        const code = raw.includes('/entrar/') ? raw.split('/entrar/')[1].split(/[?#/]/)[0] : raw;
        if (!code) return toast('Cole o link do grupo.');
        closeDialog();
        location.hash = `#/entrar/${code}`;
      });
    });
  });

  root.querySelector('#g-copy')?.addEventListener('click', async (e) => {
    const link = sync.inviteLink(g.code);
    try {
      await navigator.clipboard.writeText(link);
      e.target.textContent = 'Copiado ✓';
    } catch {
      toast('Não deu para copiar; selecione o link acima.');
    }
  });

  root.querySelector('#g-leave')?.addEventListener('click', async () => {
    if (!(await askConfirm(`Sair do grupo "${g.name}"? Este aparelho volta a usar só os dados locais. Você pode entrar de novo pelo link.`, 'Sair'))) return;
    await sync.leaveGroup();
    toast('Você saiu do grupo');
    ctx.rerender();
  });
}
