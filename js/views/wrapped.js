// Wrapped do dia: curiosidades em slides tela cheia, estilo stories. Toque para avançar.
import { getDay, dayMatches, listPlayers } from '../store.js';
import { computeWrapped } from '../wrapped.js';
import { esc, formatDate, plural, toast, openDialog, closeDialog } from '../ui.js';

export const title = 'Wrapped do dia';

const THEMES = 6;

function listNames(ids, nameOf, max = 4) {
  const names = ids.map(nameOf);
  if (names.length > max) return `${names.slice(0, max).join(', ')} e mais ${names.length - max}`;
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

// Cada slide: {emoji, eyebrow, title, sub, share?} — `share` é a linha usada no texto compartilhado.
export function buildSlides(w, day, nameOf) {
  const names = (ids) => listNames(ids, nameOf);
  const slides = [
    { emoji: '🏐', eyebrow: `Pelada de ${formatDate(day.date)}`, title: 'Seu dia de vôlei', sub: 'Bora ver como foi? Toque para avançar.' },
  ];
  if (!w.totalGames) {
    slides.push({ emoji: '🤷', eyebrow: 'Hmm…', title: 'Nenhum jogo registrado', sub: 'Registre resultados para o wrapped ganhar vida.' });
    return slides;
  }
  slides.push({
    emoji: '📊', eyebrow: 'Em números', title: plural(w.totalGames, 'jogo', 'jogos'),
    sub: `${plural(w.totalPlayers, 'pessoa entrou', 'pessoas entraram')} em quadra`,
    share: `📊 ${plural(w.totalGames, 'jogo', 'jogos')} com ${plural(w.totalPlayers, 'pessoa', 'pessoas')}`,
  });
  if (w.mostGames) slides.push({
    emoji: '🔋', eyebrow: 'Pulmão de aço', title: names(w.mostGames.ids), sub: `${plural(w.mostGames.value, 'partida jogada', 'partidas jogadas')}`,
    share: `🔋 Pulmão de aço: ${names(w.mostGames.ids)} (${w.mostGames.value} jogos)`,
  });
  if (w.mostWins) slides.push({
    emoji: '🏆', eyebrow: 'Quem mais venceu', title: names(w.mostWins.ids), sub: plural(w.mostWins.value, 'vitória', 'vitórias'),
    share: `🏆 Mais vitórias: ${names(w.mostWins.ids)} (${w.mostWins.value})`,
  });
  if (w.longestStreak) slides.push({
    emoji: '🔥', eyebrow: 'Em chamas', title: names(w.longestStreak.ids), sub: `${w.longestStreak.value} vitórias seguidas`,
    share: `🔥 Sequência: ${names(w.longestStreak.ids)} (${w.longestStreak.value} seguidas)`,
  });
  if (w.bestDuo) slides.push({
    emoji: '🤝', eyebrow: 'Melhor dupla', title: `${nameOf(w.bestDuo.ids[0])} & ${nameOf(w.bestDuo.ids[1])}`,
    sub: `Venceram ${w.bestDuo.wins} de ${plural(w.bestDuo.together, 'jogo', 'jogos')} juntos`,
    share: `🤝 Melhor dupla: ${nameOf(w.bestDuo.ids[0])} & ${nameOf(w.bestDuo.ids[1])} (${w.bestDuo.wins}/${w.bestDuo.together})`,
  });
  if (w.inseparable) slides.push({
    emoji: '🧲', eyebrow: 'Dupla inseparável', title: `${nameOf(w.inseparable.ids[0])} & ${nameOf(w.inseparable.ids[1])}`,
    sub: `Caíram no mesmo time ${w.inseparable.together} vezes`,
    share: `🧲 Inseparáveis: ${nameOf(w.inseparable.ids[0])} & ${nameOf(w.inseparable.ids[1])} (${w.inseparable.together}x)`,
  });
  if (w.rival) {
    const [a, b] = w.rival.ids;
    const wa = w.rival.winsOf[a] || 0;
    const wb = w.rival.winsOf[b] || 0;
    slides.push({
      emoji: '⚔️', eyebrow: 'Rivalidade do dia', title: `${nameOf(a)} × ${nameOf(b)}`,
      sub: `Se enfrentaram ${w.rival.faced} vezes — placar ${wa} a ${wb}`,
      share: `⚔️ Rivais: ${nameOf(a)} ${wa} × ${wb} ${nameOf(b)}`,
    });
  }
  if (w.upset) slides.push({
    emoji: '🦓', eyebrow: 'Zebra do dia', title: names(w.upset.ids),
    sub: `No jogo nº ${w.upset.seq}, venceram com só ${Math.round(w.upset.chance * 100)}% de chance`,
    share: `🦓 Zebra: ${names(w.upset.ids)} (${Math.round(w.upset.chance * 100)}% de chance)`,
  });
  if (w.unbeaten.length) slides.push({
    emoji: '🛡️', eyebrow: w.unbeaten.length > 1 ? 'Invictos' : 'Invicto(a)', title: names(w.unbeaten), sub: `Não ${w.unbeaten.length > 1 ? 'perderam' : 'perdeu'} nenhuma hoje`,
    share: `🛡️ Invictos: ${names(w.unbeaten)}`,
  });
  if (w.mostLosses) slides.push({
    emoji: '💪', eyebrow: 'Persistência', title: names(w.mostLosses.ids), sub: `${plural(w.mostLosses.value, 'derrota', 'derrotas')} — e ${w.mostLosses.ids.length > 1 ? 'seguiram' : 'seguiu'} em quadra!`,
    share: `💪 Mais derrotas: ${names(w.mostLosses.ids)} (${w.mostLosses.value})`,
  });
  if (w.winless.length) slides.push({
    emoji: '🍀', eyebrow: 'Fica pra próxima', title: names(w.winless), sub: 'Nenhuma vitória hoje — a sorte volta!',
    share: `🍀 Sem vitória: ${names(w.winless)}`,
  });
  slides.push({ emoji: '👋', eyebrow: 'É isso!', title: 'Até a próxima pelada', sub: '', final: true });
  return slides;
}

let index = 0;
let shownDayId = null;

export async function render(root, ctx) {
  const dayId = ctx.param;
  const day = dayId && (await getDay(dayId));
  if (!day) {
    root.innerHTML = '<section class="card error"><p>Dia não encontrado.</p><a class="btn block" href="#/historico">Ver histórico</a></section>';
    return;
  }
  const [matches, players] = await Promise.all([dayMatches(day.id), listPlayers()]);
  const byId = new Map(players.map((p) => [p.id, p.name]));
  const nameOf = (id) => byId.get(id) || '?';
  const slides = buildSlides(computeWrapped(matches), day, nameOf);
  if (shownDayId !== day.id) {
    index = 0;
    shownDayId = day.id;
  }

  const shareText = [`🏐 Wrapped da pelada de ${formatDate(day.date)}`, ...slides.filter((s) => s.share).map((s) => s.share)].join('\n');

  root.innerHTML = `
    <div class="wrapped" role="dialog" aria-label="Wrapped do dia" tabindex="-1">
      <div class="w-progress">${slides.map((_, i) => `<i data-i="${i}"></i>`).join('')}</div>
      <button class="w-close" aria-label="Fechar">✕</button>
      <div class="w-stage"></div>
    </div>`;
  const wrap = root.querySelector('.wrapped');
  const stage = root.querySelector('.w-stage');

  const show = () => {
    const s = slides[index];
    wrap.dataset.theme = index % THEMES;
    root.querySelectorAll('.w-progress i').forEach((el, i) => el.classList.toggle('on', i <= index));
    stage.innerHTML = `
      <div class="w-slide">
        <div class="w-emoji">${s.emoji}</div>
        <div class="w-eyebrow">${esc(s.eyebrow)}</div>
        <div class="w-title">${esc(s.title)}</div>
        ${s.sub ? `<div class="w-sub">${esc(s.sub)}</div>` : ''}
        ${s.final ? `
          <div class="w-actions">
            <button class="btn w-btn" id="w-share">Compartilhar resumo</button>
            <button class="btn w-btn ghost" id="w-again">Ver de novo</button>
          </div>` : ''}
      </div>`;
    stage.querySelector('#w-share')?.addEventListener('click', share);
    stage.querySelector('#w-again')?.addEventListener('click', (e) => {
      e.stopPropagation();
      go(0);
    });
  };

  const go = (i) => {
    index = Math.max(0, Math.min(slides.length - 1, i));
    show();
  };

  const close = () => {
    shownDayId = null;
    if (history.length > 1) history.back();
    else location.hash = '#/historico';
  };

  // Janela com o texto e opções: compartilhar nativo (se houver), copiar e WhatsApp.
  // Nem todo navegador tem navigator.share, e a área de transferência pode ser bloqueada.
  function share(e) {
    e.stopPropagation();
    openDialog(`
      <div class="form">
        <h2>Compartilhar resumo</h2>
        <textarea class="share-text" readonly rows="10">${esc(shareText)}</textarea>
        ${navigator.share ? '<button type="button" class="btn primary" id="sh-native">Compartilhar…</button>' : ''}
        <button type="button" class="btn ${navigator.share ? '' : 'primary'}" id="sh-copy">Copiar texto</button>
        <a class="btn" id="sh-wa" href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener">Enviar no WhatsApp</a>
        <button type="button" class="btn ghost" data-close>Fechar</button>
      </div>`, (dlg) => {
      const ta = dlg.querySelector('textarea');
      dlg.querySelector('#sh-native')?.addEventListener('click', async () => {
        try {
          await navigator.share({ text: shareText });
          closeDialog();
        } catch (err) {
          if (err.name !== 'AbortError') toast('Não deu para abrir o compartilhamento; use Copiar texto.');
        }
      });
      dlg.querySelector('#sh-copy').addEventListener('click', async (ev) => {
        const ok = await copyText(shareText, ta);
        ev.target.textContent = ok ? 'Copiado ✓ — cole no grupo' : 'Selecione o texto acima e copie';
        if (!ok) {
          ta.focus();
          ta.select();
        }
      });
    });
  }

  root.querySelector('.w-close').addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  stage.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    const rect = stage.getBoundingClientRect();
    go(e.clientX - rect.left < rect.width * 0.3 ? index - 1 : index + 1);
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') go(index + 1);
    else if (e.key === 'ArrowLeft') go(index - 1);
    else if (e.key === 'Escape') close();
  });
  show();
  wrap.focus();
}

// Tenta a API de área de transferência e, se bloqueada, o método antigo com o texto selecionado.
async function copyText(text, textarea) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    textarea.focus();
    textarea.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}
