// Backup e informações do app.
import { exportAll, importAll, wipeAll } from '../store.js';
import { MAX_STREAK } from '../rotation.js';
import { toast, todayIso, askConfirm } from '../ui.js';

export const title = 'Ajustes';

export async function render(root, ctx) {
  root.innerHTML = `
    <section class="card">
      <h2>Backup</h2>
      <p class="muted small">Os dados ficam só neste aparelho. Exporte de vez em quando para não perder nada ou para passar para outro celular.</p>
      <button class="btn primary block" id="export">Exportar backup (.json)</button>
      <label class="btn block file">Importar backup<input type="file" id="import" accept="application/json,.json" hidden></label>
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
    <section class="card">
      <h2>Apagar tudo</h2>
      <button class="btn ghost danger block" id="wipe">Apagar todos os dados</button>
    </section>
  `;

  root.querySelector('#export').addEventListener('click', async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pelada-volei-backup-${todayIso()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  root.querySelector('#import').addEventListener('change', async (e) => {
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

  root.querySelector('#wipe').addEventListener('click', async () => {
    if (!(await askConfirm('Apagar TODOS os jogadores, dias e partidas deste aparelho?'))) return;
    if (!(await askConfirm('Tem certeza? Isso não pode ser desfeito (exporte um backup antes).'))) return;
    await wipeAll();
    toast('Dados apagados');
    ctx.rerender();
  });
}
