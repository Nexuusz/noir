// language: JavaScript (Node 18+, ESM), file: classify.mjs
// purpose: separa animação japonesa (anime) de animação ocidental (desenho) e grava `anim` no catálogo.
// regra: origem japonesa (country) ou anime já marcado na curadoria → anime; resto com gênero Animation → desenho.
import { readFile, writeFile, rename } from 'node:fs/promises';

const CATALOG = new URL('./catalog.json', import.meta.url);

const data = JSON.parse(await readFile(CATALOG, 'utf8'));
const media = data.media || [];

const japones = (c) => /japan/i.test(Array.isArray(c) ? c.join(', ') : String(c || ''));

let anime = 0;
let desenho = 0;
let nenhum = 0;

for (const m of media) {
  const generos = m.genres || [];
  let rotulo = null;

  // animação ocidental (Pixar, DreamWorks, Cartoon Network) não é anime — mesmo que a
  // curadoria antiga tenha marcado. Anime é animação de origem japonesa, ou título sem
  // metadado de gênero que a curadoria tenha listado.
  if (generos.includes('Animation')) rotulo = japones(m.country) ? 'anime' : 'desenho';
  else if (m.anime) rotulo = 'anime';

  if (rotulo) m.anim = rotulo;
  else delete m.anim;

  rotulo === 'anime' ? anime++ : rotulo === 'desenho' ? desenho++ : nenhum++;
}

data.counts = {
  total: media.length,
  filmes: media.filter((m) => m.type !== 'series' && m.anim !== 'desenho' && m.anim !== 'anime').length,
  series: media.filter((m) => m.type === 'series' && !m.anim).length,
  animes: media.filter((m) => m.anim === 'anime').length,
  desenhos: media.filter((m) => m.anim === 'desenho').length,
  com_tmdb: media.filter((m) => m.tmdb).length,
};

const tmp = new URL('./catalog.json.tmp', import.meta.url);
await writeFile(tmp, JSON.stringify(data));
await rename(tmp, CATALOG);

console.log(`total ${media.length}`);
console.log(`  filmes   ${data.counts.filmes}`);
console.log(`  séries   ${data.counts.series}`);
console.log(`  animes   ${data.counts.animes}`);
console.log(`  desenhos ${data.counts.desenhos}`);
console.log(`  com tmdb ${data.counts.com_tmdb}`);

for (const [nome, id] of [['Attack on Titan', 'tt2560140'], ['One Piece', 'tt0388629'], ['Cars', 'tt0317219'], ['Toy Story', 'tt0114709'], ['Violet Evergarden', 'tt7078184'], ['Bob Esponja', 'tt0206512']]) {
  const m = media.find((x) => x.id === id);
  console.log(`  ${nome}: ${m ? `anim=${m.anim || '—'} (${m.type})` : 'fora do catálogo'}`);
}
