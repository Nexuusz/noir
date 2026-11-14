// language: JavaScript (Node 18+, ESM), file: map-tmdb.mjs
// purpose: fecha os buracos de TMDB no catalog.json — Cinemeta primeiro, Wikidata só no que sobrar.
// retomável: grava em disco a cada lote (tmp + rename), então queda no meio não perde trabalho.
import { readFile, writeFile, rename } from 'node:fs/promises';

const CATALOG = new URL('./catalog.json', import.meta.url);
const CINEMETA = 'https://v3-cinemeta.strem.io';
const ENDPOINT = 'https://query.wikidata.org/sparql';
const UA = 'filmes-em-hd/1.0 (local build)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok_tmdb = (v) => /^\d{1,8}$/.test(String(v ?? ''));

async function gravar(data) {
  const tmp = new URL('./catalog.json.tmp', import.meta.url);
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, CATALOG);
}

/* ───── Cinemeta: uma chamada por título, devolve moviedb_id ───── */
async function cinemeta(tipo, id) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 12000);
  try {
    const r = await fetch(`${CINEMETA}/meta/${tipo}/${encodeURIComponent(id)}.json`, {
      headers: { 'user-agent': UA },
      signal: c.signal,
    });
    clearTimeout(t);
    if (!r.ok) return '';
    const d = await r.json();
    const v = d?.meta?.moviedb_id;
    return ok_tmdb(v) ? String(v) : '';
  } catch {
    clearTimeout(t);
    return '';
  }
}

/* ───── Wikidata: P345 (imdb) → P4947 (tmdb), só para os restantes ───── */
async function wikidata(ids) {
  const map = new Map();
  const CHUNK = 90;
  for (let off = 0; off < ids.length; off += CHUNK) {
    const chunk = ids.slice(off, off + CHUNK);
    const q = `SELECT ?imdb ?tmdb WHERE {
      VALUES ?imdb { ${chunk.map((i) => `"${i}"`).join(' ')} }
      ?f wdt:P345 ?imdb; wdt:P4947 ?tmdb.
    }`;
    for (let tent = 0; tent < 3; tent++) {
      try {
        const r = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(q)}`, {
          headers: { 'user-agent': UA, accept: 'application/sparql-results+json' },
        });
        if (r.status === 429 || r.status >= 500) { await sleep(2500 * (tent + 1)); continue; }
        if (!r.ok) { await sleep(1200 * (tent + 1)); continue; }
        const j = await r.json();
        for (const b of j?.results?.bindings || []) {
          if (ok_tmdb(b.tmdb.value)) map.set(b.imdb.value, String(b.tmdb.value));
        }
        break;
      } catch {
        await sleep(2000 * (tent + 1));
      }
    }
    process.stdout.write(`\r  wikidata ${Math.min(off + CHUNK, ids.length)}/${ids.length}  achados: ${map.size}   `);
    await sleep(600);
  }
  console.log('');
  return map;
}

/* ───── 0) sanear o que já está no arquivo ───── */
const data = JSON.parse(await readFile(CATALOG, 'utf8'));
const media = data.media || [];

let limpos = 0;
for (const m of media) {
  if (m.tmdb != null && !ok_tmdb(m.tmdb)) { delete m.tmdb; limpos++; }
}
const antes = media.filter((m) => m.tmdb).length;
console.log(`total ${media.length} · já com tmdb ${antes} · descartados inválidos ${limpos}`);

/* ───── 1) Cinemeta nos buracos ───── */
let faltando = media.filter((m) => !m.tmdb && /^tt\d+$/.test(m.id));
console.log(`  buracos: ${faltando.length} — resolvendo por Cinemeta`);

const CONC = 8;
let feitos = 0;

for (let off = 0; off < faltando.length; off += CONC) {
  const lote = faltando.slice(off, off + CONC);
  const achados = await Promise.all(
    lote.map(async (m) => [m, await cinemeta(m.type === 'series' ? 'series' : 'movie', m.id)])
  );
  for (const [m, tmdb] of achados) {
    if (tmdb) { m.tmdb = tmdb; feitos++; }
  }
  process.stdout.write(`\r  cinemeta ${Math.min(off + CONC, faltando.length)}/${faltando.length}  preenchidos: ${feitos}   `);
  await sleep(80);
}
console.log('');

/* ───── 2) Wikidata nos que o Cinemeta não deu ───── */
faltando = media.filter((m) => !m.tmdb && /^tt\d+$/.test(m.id));
if (faltando.length) {
  console.log(`  restantes: ${faltando.length} — tentando Wikidata`);
  const wd = await wikidata(faltando.map((m) => m.id));
  for (const m of faltando) {
    const v = wd.get(m.id);
    if (v) { m.tmdb = v; feitos++; }
  }
}

/* ───── 3) gravar e conferir ───── */
const total = media.filter((m) => m.tmdb).length;
data.tmdb_count = total;
data.tmdb_updated = new Date().toISOString();
await gravar(data);

const pct = ((total / media.length) * 100).toFixed(1);
console.log(`\ntmdb id em ${total}/${media.length} títulos (${pct}%) · preenchidos agora: ${feitos}`);

const restantes = media.filter((m) => !m.tmdb);
if (restantes.length) {
  console.log('  sem id (o player cai para o IMDb nesses):');
  for (const m of restantes.slice(0, 20)) console.log(`    ${m.id}  ${m.type}  ${m.name}`);
}

for (const [nome, id] of [['Cars', 'tt0317219'], ['Breaking Bad', 'tt0903747'], ['Attack on Titan', 'tt2560140'], ['One Piece', 'tt0388629'], ['Death Note', 'tt0877057']]) {
  const m = media.find((x) => x.id === id);
  console.log(`  ${nome}: ${m ? `tmdb=${m.tmdb || '—'}` : 'fora do catálogo'}`);
}
