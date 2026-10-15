// Mini test runner no navegador.
const tests = [];
let currentGroup = '';

export function describe(name, fn) {
  currentGroup = name;
  fn();
  currentGroup = '';
}

export function it(name, fn) {
  tests.push({ name: currentGroup ? `${currentGroup} › ${name}` : name, fn });
}

export function assert(cond, msg = 'asserção falhou') {
  if (!cond) throw new Error(msg);
}

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} esperado ${e}, obtido ${a}`);
}

export async function run(el) {
  let pass = 0;
  let fail = 0;
  const lines = [];
  for (const t of tests) {
    try {
      await t.fn();
      pass++;
      lines.push(`<li class="ok">✔ ${t.name}</li>`);
    } catch (e) {
      fail++;
      lines.push(`<li class="fail">✘ ${t.name}<pre>${e.message}</pre></li>`);
      console.error(t.name, e);
    }
  }
  el.innerHTML = `<h2 id="summary" data-pass="${pass}" data-fail="${fail}">${fail ? '❌' : '✅'} ${pass} passaram, ${fail} falharam</h2><ul>${lines.join('')}</ul>`;
  document.title = `${fail ? 'FALHOU' : 'OK'} ${pass}/${pass + fail}`;
}
