// Utilitários de interface.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// Abre um <dialog> com o HTML dado; `onReady(dialog)` liga os eventos. Fecha com [data-close].
export function openDialog(html, onReady) {
  const dlg = document.getElementById('dialog');
  dlg.innerHTML = html;
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  onReady?.(dlg);
  dlg.showModal();
  return dlg;
}

// Confirmação própria do app: o confirm() nativo é bloqueado em alguns navegadores/PWAs
// (retorna false sem mostrar nada). Resolve true só ao tocar no botão de confirmar.
export function askConfirm(message, okLabel = 'Confirmar') {
  const dlg = document.getElementById('confirm');
  dlg.innerHTML = `
    <form method="dialog" class="form">
      <p>${esc(message)}</p>
      <div class="actions">
        <button value="no" class="btn">Cancelar</button>
        <button value="yes" class="btn primary">${esc(okLabel)}</button>
      </div>
    </form>`;
  dlg.returnValue = '';
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'yes'), { once: true });
    dlg.showModal();
  });
}

export function closeDialog() {
  document.getElementById('dialog').close();
}

export function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}
