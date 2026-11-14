// language: JavaScript (Node 18+, ESM), file: build-catalog.mjs
// purpose: monta catalog.json (filmes + séries + animes) a partir do Cinemeta, sem chave de API
import { writeFile } from 'node:fs/promises';

const BASE = 'https://v3-cinemeta.strem.io';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';

const GENRES = [
  'Action', 'Animation', 'Adventure', 'Comedy', 'Crime', 'Drama', 'Family',
  'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'War',
  'Western', 'Biography', 'Documentary', 'Music', 'Sport', 'History',
];

/* animes buscados por nome — o catálogo de gênero do Cinemeta só devolve 50 itens */
const ANIMES = [
  'Naruto', 'Naruto Shippuden', 'One Piece', 'Dragon Ball Z', 'Dragon Ball Super',
  'Demon Slayer', 'Attack on Titan', 'Jujutsu Kaisen', 'My Hero Academia', 'Death Note',
  'Fullmetal Alchemist Brotherhood', 'Chainsaw Man', 'Spy x Family', 'Tokyo Revengers',
  'Bleach', 'Hunter x Hunter', 'Sword Art Online', 'Black Clover', 'Fairy Tail',
  'Sailor Moon', 'Pokémon', 'Digimon Adventure', 'Yu-Gi-Oh!', 'Saint Seiya',
  'One Punch Man', 'Mob Psycho 100', 'Vinland Saga', 'Haikyu!!', 'Kuroko no Basket',
  'Blue Lock', 'Solo Leveling', 'Frieren', 'Kaiju No. 8', 'Boruto', 'Dandadan',
  'Tokyo Ghoul', 'Steins Gate', 'Cowboy Bebop', 'Evangelion', 'Gintama', 'Sakamoto Days',
  'Dr. Stone', 'Fire Force', 'Seven Deadly Sins', 'Overlord', 'Re:Zero', 'Kaguya-sama',
  'Akame ga Kill', 'Code Geass', 'Fate Zero', 'Psycho-Pass', 'Noragami', 'Toradora',
];

const norm = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get_json(path, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE + path, { headers: { 'user-agent': UA } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await sleep(250 * (i + 1));
  }
  return null;
}

const tirarAno = (m) => {
  const bruto = m.year ?? m.released ?? m.releaseInfo ?? '';
  const achado = String(bruto).match(/(19|20)\d{2}/);
  return achado ? Number(achado[0]) : 0;
};

const porId = new Map();

function guardar(m, tipo, extra = {}) {
  if (!m || !m.id || !m.name) return;
  const ano = tirarAno(m);
  if (!ano || ano < 1950 || ano > 2030) return;

  const poster = m.poster || `https://images.metahub.space/poster/medium/${m.id}/img`;
  if (!poster || /undefined/.test(poster)) return;

  const registro = {
    id: m.id,
    tmdb: m.moviedb_id ? String(m.moviedb_id) : '',
    type: tipo,
    name: m.name,
    year: ano,
    poster: poster.replace('/poster/small/', '/poster/medium/'),
    background: (m.background || `https://images.metahub.space/background/medium/${m.id}/img`).replace('/background/small/', '/background/medium/'),
    rating: String(m.imdbRating || ''),
    runtime: m.runtime || '',
    genres: m.genre || m.genres || [],
    plot: String(m.description || '').slice(0, 620),
    cast: (m.cast || []).slice(0, 5),
    director: (m.director || []).slice(0, 2),
    country: m.country || '',
    popularity: Number(m.popularities?.moviedb || m.popularity || 0) || 0,
    anime: Boolean(extra.anime),
  };

  const anterior = porId.get(m.id);
  if (!anterior) { porId.set(m.id, registro); return; }

  /* mantém o registro mais rico, sem perder a marcação de anime */
  const melhor = { ...anterior, ...registro };
  melhor.rating = registro.rating || anterior.rating;
  melhor.plot = registro.plot.length >= anterior.plot.length ? registro.plot : anterior.plot;
  melhor.cast = registro.cast.length ? registro.cast : anterior.cast;
  melhor.background = registro.background || anterior.background;
  melhor.anime = anterior.anime || registro.anime;
  melhor.type = anterior.type === 'series' || registro.type === 'series' ? 'series' : 'movie';
  porId.set(m.id, melhor);
}

/* ───── 1) filmes: feeds paginados ───── */
const FEEDS_FILME = ['top', 'imdbRating', 'year', ...GENRES.map((g) => `top/genre=${g}`)];
let pedidos = 0;

for (const feed of FEEDS_FILME) {
  const paginado = !feed.includes('genre=');
  for (let skip = 0; skip <= (paginado ? 1500 : 0); skip += 50) {
    const caminho = skip ? `/catalog/movie/${feed}/skip=${skip}.json` : `/catalog/movie/${feed}.json`;
    const d = await get_json(caminho);
    pedidos++;
    const metas = d?.metas || [];
    if (!metas.length) break;
    metas.forEach((m) => guardar(m, 'movie'));
    if (!paginado) break;
    await sleep(40);
  }
  process.stdout.write(`\r  filmes: ${pedidos} chamadas · ${porId.size} títulos   `);
}
console.log('');

/* ───── 2) séries ───── */
for (const feed of ['top', 'imdbRating', 'year']) {
  for (let skip = 0; skip <= 800; skip += 50) {
    const caminho = skip ? `/catalog/series/${feed}/skip=${skip}.json` : `/catalog/series/${feed}.json`;
    const d = await get_json(caminho);
    pedidos++;
    const metas = d?.metas || [];
    if (!metas.length) break;
    metas.forEach((m) => guardar(m, 'series'));
    await sleep(40);
  }
  process.stdout.write(`\r  séries: ${pedidos} chamadas · ${porId.size} títulos   `);
}
console.log('');

/* ───── 3) animes ───── */
const blocoAnimacao = await get_json('/catalog/series/top/genre=Animation.json');
(blocoAnimacao?.metas || []).forEach((m) => guardar(m, 'series', { anime: true }));

for (const nome of ANIMES) {
  const d = await get_json(`/catalog/series/top/search=${encodeURIComponent(nome)}.json`);
  const metas = d?.metas || [];
  const alvo = norm(nome);

  let melhor = null;
  let melhorNota = -1;
  for (const m of metas) {
    const nm = norm(m.name);
    let nota = 0;
    if (nm === alvo) nota += 10;
    else if (nm.startsWith(alvo) || alvo.startsWith(nm)) nota += 6;
    else if (nm.includes(alvo) || alvo.includes(nm)) nota += 3;
    if (/reaction|dublado|review|podcast|abridged/i.test(m.name || '')) nota -= 8;
    if (nota > melhorNota) { melhorNota = nota; melhor = m; }
  }
  if (melhor && melhorNota >= 3) guardar(melhor, 'series', { anime: true });
  await sleep(45);
}
console.log(`\r  animes buscados: ${ANIMES.length} · total ${porId.size} títulos   `);

/* ───── 4) saída ───── */
const media = [...porId.values()].sort((a, b) => b.popularity - a.popularity);

const filmes = media.filter((m) => m.type === 'movie');
const series = media.filter((m) => m.type === 'series' && !m.anime);
const animes = media.filter((m) => m.anime);

const payload = {
  built: new Date().toISOString(),
  counts: { total: media.length, movies: filmes.length, series: series.length, anime: animes.length },
  media,
};

await writeFile(new URL('./catalog.json', import.meta.url), JSON.stringify(payload));

const mb = (JSON.stringify(payload).length / 1048576).toFixed(2);
console.log(`\ncatalog.json → ${media.length} títulos (${mb} MB)`);
console.log(`  filmes ${filmes.length} · séries ${series.length} · animes ${animes.length}`);
const cars = media.find((m) => m.id === 'tt0317219');
console.log('  Cars:', cars ? `${cars.name} (${cars.year})` : 'FALTANDO');
const bb = media.find((m) => m.id === 'tt0903747');
console.log('  Breaking Bad:', bb ? `${bb.name} (${bb.year})` : 'FALTANDO');
