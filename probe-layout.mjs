// language: JavaScript (Node 22+, ESM), file: probe-layout.mjs
// purpose: mede a página no Edge e devolve os elementos que estouram a viewport horizontal.
// uso: node probe-layout.mjs <url> [largura] [altura]
import { spawn } from 'node:child_process';

const url = process.argv[2] || 'http://127.0.0.1:4322/';
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);
const PORT = 9333;

const edge = spawn(
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    `--remote-debugging-port=${PORT}`,
    `--window-size=${width},${height}`,
    '--user-data-dir=' + process.env.TEMP + '\\fehd-cdp',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function alvo() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const lista = await r.json();
      const pagina = lista.find((t) => t.type === 'page');
      if (pagina) return pagina;
    } catch {}
    await sleep(250);
  }
  throw new Error('Edge não abriu');
}

const pagina = await alvo();
const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pendentes = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pendentes.has(msg.id)) {
    const { res, rej } = pendentes.get(msg.id);
    pendentes.delete(msg.id);
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
  }
};
const cmd = (metodo, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pendentes.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method: metodo, params }));
  });

const avaliar = async (expr) => {
  const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result.value;
};

await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
await cmd('Page.navigate', { url });
await sleep(2500);
await avaliar(`document.fonts ? document.fonts.ready : 0`);
await sleep(2500);

const relatorio = await avaliar(`(() => {
  const vw = document.documentElement.clientWidth;
  const estourando = [];
  const rolados = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const direita = Math.round(r.right);
    if (direita > vw + 1 || r.left < -1) {
      estourando.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        cls: String(el.className || '').slice(0, 60),
        left: Math.round(r.left),
        right: direita,
        w: Math.round(r.width),
        texto: String(el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      });
    }
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') rolados.push({ tag: el.tagName.toLowerCase(), id: el.id || '', cls: String(el.className || '').slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth });
    }
  }
  return {
    vw,
    bodySW: document.body.scrollWidth,
    docSW: document.documentElement.scrollWidth,
    estourando: estourando.slice(0, 40),
    rolados: rolados.slice(0, 20),
  };
})()`);

console.log(`viewport ${relatorio.vw}px · body scrollWidth ${relatorio.bodySW} · doc ${relatorio.docSW}`);
if (relatorio.estourando.length) {
  console.log('\nestourando:');
  for (const e of relatorio.estourando) {
    console.log(`  ${e.tag}${e.id ? '#' + e.id : ''} .${e.cls.split(' ')[0]}  left=${e.left} right=${e.right} w=${e.w}`);
    console.log(`     “${e.texto}”`);
  }
} else console.log('\nnada estourando');
if (relatorio.rolados.length) {
  console.log('\nroláveis (ok):');
  for (const r of relatorio.rolados) console.log(`  ${r.tag}${r.id ? '#' + r.id : ''} .${r.cls.split(' ')[0]} sw=${r.sw} cw=${r.cw}`);
}

ws.close();
edge.kill();
process.exit(0);
