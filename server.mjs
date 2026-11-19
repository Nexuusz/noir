// language: JavaScript (Node 18+, ESM), file: server.mjs
// purpose: servidor estático com Range (seek de vídeo), catálogo, ping de embed, contas e progresso
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readdir, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scrypt as scrypt_cb, timingSafeEqual } from 'node:crypto';
import { brotliCompress as brotli_cb, gzip as gzip_cb, constants as zlib_const } from 'node:zlib';
import { promisify } from 'node:util';

const scrypt = promisify(scrypt_cb);
const brotli = promisify(brotli_cb);
const gzip = promisify(gzip_cb);

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const MEDIA = join(ROOT, 'media');
const DATA = join(ROOT, 'data');
const STORE_FILE = join(DATA, 'store.json');
const PORT = Number(process.env.PORT) || 4321;
const HOST = process.env.HOST || '0.0.0.0';

/* ───────── IPTV (credenciais via env) ───────── */
const IPTV_BASE = (process.env.IPTV_BASE || 'http://ultrap.top').replace(/\/$/, '');
const IPTV_USER = process.env.IPTV_USER || '';
const IPTV_PASS = process.env.IPTV_PASS || '';
const IPTV_ENABLED = !!(IPTV_USER && IPTV_PASS);

const SESSION_COOKIE = 'fehd_sid';
const SESSION_DAYS = 60;
const SESSION_TTL = SESSION_DAYS * 24 * 60 * 60 * 1000;
const MAX_BODY = 64 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
};

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.webm', '.ogv', '.mkv', '.mov']);
const SUB_EXT = new Set(['.vtt']);

/* ───────────────────────── compressão ───────────────────────── */
/* catalog.json são 3,4 MB crus — br leva para ~500 KB, gzip para ~700 KB.
   O resultado fica em memória preso ao ETag: recomprimir só quando o arquivo muda. */

const COMPRESSIVEL = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.vtt', '.srt']);
const comp_cache = new Map();
const COMP_CACHE_MAX = 24;
const COMP_MIN = 1024;

function encoding_aceito(req, nome) {
  const raw = String(req.headers['accept-encoding'] || '').toLowerCase();
  return raw.split(',').some((p) => {
    const [tipo, q] = p.trim().split(';');
    if (tipo !== nome) return false;
    return q ? Number(q.split('=')[1]) > 0 : true;
  });
}

async function comprimir(chave, buf, encoding) {
  const guardado = comp_cache.get(chave);
  if (guardado && guardado[encoding]) return guardado[encoding];

  const saida =
    encoding === 'br'
      ? await brotli(buf, {
          params: {
            [zlib_const.BROTLI_PARAM_QUALITY]: 9,
            [zlib_const.BROTLI_PARAM_SIZE_HINT]: buf.length,
          },
        })
      : await gzip(buf, { level: 9 });

  const registro = guardado || {};
  registro[encoding] = saida;
  comp_cache.delete(chave);
  comp_cache.set(chave, registro);
  if (comp_cache.size > COMP_CACHE_MAX) comp_cache.delete(comp_cache.keys().next().value);
  return saida;
}


/* ───────────────────────── armazenamento ───────────────────────── */

const empty_store = () => ({ users: [], sessions: [], progress: [], seq: 1 });
let store = empty_store();
let writing = Promise.resolve();

async function load_store() {
  await mkdir(DATA, { recursive: true });
  try {
    const bruto = await readFile(STORE_FILE, 'utf8');
    const parsed = JSON.parse(bruto);
    store = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      progress: Array.isArray(parsed.progress) ? parsed.progress : [],
      seq: Number(parsed.seq) || 1,
    };
  } catch {
    store = empty_store();
  }
  prune_sessions();
}

// grava numa fila serial: sem corrida entre requisições concorrentes
function save_store() {
  const snapshot = JSON.stringify(store);
  writing = writing.then(async () => {
    const tmp = STORE_FILE + '.tmp';
    await writeFile(tmp, snapshot);
    await rename(tmp, STORE_FILE);
  }).catch((err) => console.error('store:', err.message));
  return writing;
}

function prune_sessions() {
  const agora = Date.now();
  const antes = store.sessions.length;
  store.sessions = store.sessions.filter((s) => s.exp > agora);
  if (store.sessions.length !== antes) save_store();
}

/* ───────────────────────── senhas e sessões ───────────────────────── */

const hash_password = async (senha) => {
  const salt = randomBytes(16).toString('hex');
  const buf = await scrypt(senha, salt, 64);
  return `scrypt$${salt}$${buf.toString('hex')}`;
};

const check_password = async (senha, guardado) => {
  const [tipo, salt, hex] = String(guardado || '').split('$');
  if (tipo !== 'scrypt' || !salt || !hex) return false;
  const buf = await scrypt(senha, salt, 64);
  const alvo = Buffer.from(hex, 'hex');
  if (alvo.length !== buf.length) return false;
  return timingSafeEqual(buf, alvo);
};

const novo_token = () => randomBytes(32).toString('hex');

const public_user = (u) => ({ id: u.id, name: u.name, email: u.email, since: u.since, role: u.role || 'user', supporter: !!u.supporter });

const OWNERS = (process.env.OWNER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const ehDono = (u) => {
  if (!u) return false;
  if (u.role === 'owner') return true;
  const nome = String(u.name || '').toLowerCase();
  const email = String(u.email || '').toLowerCase();
  if (nome === 'nexuusz' || nome === 'nakaw') return true;
  if (OWNERS.includes(email)) return true;
  return false;
};

function cookie_get(req, nome) {
  const raw = req.headers.cookie || '';
  for (const parte of raw.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return '';
}

function cookie_set(res, nome, valor, max_age_s) {
  const partes = [
    `${nome}=${encodeURIComponent(valor)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${max_age_s}`,
  ];
  const anterior = res.getHeader('Set-Cookie');
  const lista = anterior ? (Array.isArray(anterior) ? anterior : [anterior]) : [];
  res.setHeader('Set-Cookie', [...lista, partes.join('; ')]);
}

function sessao_atual(req) {
  const token = cookie_get(req, SESSION_COOKIE);
  if (!token) return null;
  const s = store.sessions.find((x) => x.token === token && x.exp > Date.now());
  if (!s) return null;
  return s;
}

function usuario_da_sessao(req) {
  const s = sessao_atual(req);
  if (!s) return null;
  return store.users.find((u) => u.id === s.uid) || null;
}

function criar_sessao(req, res, uid) {
  const token = novo_token();
  store.sessions.push({
    token,
    uid,
    exp: Date.now() + SESSION_TTL,
    ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().slice(0, 60),
    ua: String(req.headers['user-agent'] || '').slice(0, 160),
  });
  cookie_set(res, SESSION_COOKIE, token, Math.floor(SESSION_TTL / 1000));
  return token;
}

/* ───────────────────────── utilidades HTTP ───────────────────────── */

function send_json(res, code, body, extra = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': MIME['.json'],
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(payload);
}

/* versão comprimida do JSON grande (catálogo, busca) — mesma ideia do estático */
async function send_json_comp(req, res, code, body, cache = 'no-cache') {
  const bruto = Buffer.from(JSON.stringify(body), 'utf8');
  const etag = `W/"${bruto.length.toString(16)}-${(bruto.length * 31 + code).toString(16)}"`;

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cache, Vary: 'Accept-Encoding' });
    return res.end();
  }

  const encoding = encoding_aceito(req, 'br') ? 'br' : encoding_aceito(req, 'gzip') ? 'gzip' : '';
  const headers = {
    'Content-Type': MIME['.json'],
    'Cache-Control': cache,
    ETag: etag,
    Vary: 'Accept-Encoding',
  };

  if (encoding && bruto.length >= COMP_MIN) {
    try {
      const saida = await comprimir(`api:${etag}`, bruto, encoding);
      res.writeHead(code, {
        ...headers,
        'Content-Encoding': encoding,
        'Content-Length': saida.length,
      });
      return res.end(saida);
    } catch { /* cai para cru */ }
  }

  res.writeHead(code, { ...headers, 'Content-Length': bruto.length });
  return res.end(bruto);
}

async function read_body(req) {
  const partes = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY) throw new Error('corpo grande demais');
    partes.push(chunk);
  }
  if (!partes.length) return {};
  try {
    return JSON.parse(Buffer.concat(partes).toString('utf8'));
  } catch {
    throw new Error('json inválido');
  }
}

const limpar = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const email_ok = (e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e);

/* tentativas por IP: freia ataque de senha sem travar uso normal */
const tentativas = new Map();
function limite_login(ip) {
  const agora = Date.now();
  const reg = tentativas.get(ip) || { n: 0, ate: 0 };
  if (reg.ate && reg.ate > agora) return Math.ceil((reg.ate - agora) / 1000);
  return 0;
}
function falhou_login(ip) {
  const agora = Date.now();
  const reg = tentativas.get(ip) || { n: 0, ate: 0 };
  reg.n = (reg.ate && reg.ate < agora ? 0 : reg.n) + 1;
  if (reg.n >= 8) { reg.ate = agora + 60000; reg.n = 0; }
  tentativas.set(ip, reg);
}
function limpou_login(ip) { tentativas.delete(ip); }

/* ───────────────────────── catálogo e mídia ───────────────────────── */

let catalogo_cache = null;
let catalogo_em = 0;

async function ler_catalogo() {
  const agora = Date.now();
  if (catalogo_cache && agora - catalogo_em < 5000) return catalogo_cache;
  const bruto = await readFile(join(ROOT, 'catalog.json'), 'utf8');
  const dados = JSON.parse(bruto);
  catalogo_cache = dados;
  catalogo_em = agora;
  return dados;
}

/* ───────── IPTV: parse M3U em runtime ───────── */
let iptv_cache = null;
let iptv_cache_em = 0;
const IPTV_CACHE_TTL = 30 * 60 * 1000; // 30 min

const IPTV_LIVE_GROUPS = new Set([
  'GLOBO SUDESTE','GLOBO NORDESTE','GLOBO SUL','GLOBO NORTE','GLOBO CENTRO-OESTE',
  'RECORD TV','SBT','BAND','ABERTOS','NOTICIAS','HBO','TELECINE','CINE',
  'ESPN','ESPORTES','LUTAS / UFC','PREMIERE','SPORTV','DOCUMENTÁRIOS',
  'INFANTIS','VARIEDADES','RELIGIOSOS','CULINÁRIA','FILMES E SÉRIES',
  'HBO MAX PPV','DAZN PPV','PRIME VIDEO PPV','DISNEY+ PPV','GOAT PPV',
  'SPORTYNET PPV','CAZÉ TV PPV','PARAMOUNT+ PPV','APPLE TV+ PPV',
  'PAY-PER-VIEW','LUTAS','CAMPEONATOS ESTADUAIS','COPINHA 2026',
  'A FAZENDA 18','FILMES E SÉRIES',
]);

const IPTV_EXCLUDE_GROUPS = new Set([
  '24H INFANTIS/DESENHOS','24H SÉRIES/PROGRAMAS','24H-BRASILEIRINHAS ADULTOS +18',
  '24H DISCOVERY+','24H DORAMAS','24H FILMES','24H-PARODIAS EROTICAS ADULTOS +18',
  'ADULTOS +18','ADULTOS +18 - ONLY FANS/PRIVACY','ADULTOS 18+ GAYS/TRANS',
  'Reels | Shorts','RÁDIOS','RÁDIOS RELIGIOSAS','RÁDIOS NOTÍCIAS/JORNALISMO',
  'RÁDIOS DIVERSAS',
]);

async function fetch_iptv_m3u() {
  if (!IPTV_ENABLED) return null;
  const url = `${IPTV_BASE}/get.php?username=${encodeURIComponent(IPTV_USER)}&password=${encodeURIComponent(IPTV_PASS)}&type=m3u_plus`;
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'NOIR/2.0' } });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    console.error('IPTV fetch:', e.message);
    return null;
  }
}

function parse_iptv_m3u(texto) {
  const channels = [];
  const seen = new Set();
  let current = null;
  for (const raw of texto.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF')) {
      const nameM = line.match(/tvg-name="([^"]*)"/);
      const logoM = line.match(/tvg-logo="([^"]*)"/);
      const groupM = line.match(/group-title="([^"]*)"/);
      current = {
        name: nameM ? nameM[1] : '',
        logo: logoM ? logoM[1] : '',
        group: groupM ? groupM[1] : '',
      };
    } else if (line && !line.startsWith('#') && current) {
      // extract channel id from URL path
      const urlM = line.match(/\/(\d+)\.ts$/);
      const channelId = urlM ? urlM[1] : null;
      const group = current.group;
      if (!IPTV_EXCLUDE_GROUPS.has(group) && IPTV_LIVE_GROUPS.has(group)) {
        if (!seen.has(current.name)) {
          seen.add(current.name);
          channels.push({
            name: current.name,
            logo: current.logo,
            group: group,
            channelId: channelId,
          });
        }
      }
      current = null;
    }
  }
  return channels;
}

async function ler_iptv() {
  const agora = Date.now();
  if (iptv_cache && agora - iptv_cache_em < IPTV_CACHE_TTL) return iptv_cache;
  const texto = await fetch_iptv_m3u();
  if (!texto) {
    if (iptv_cache) return iptv_cache;
    return { total: 0, groups: [], channels: [], by_group: {} };
  }
  const channels = parse_iptv_m3u(texto);
  const by_group = {};
  for (const ch of channels) {
    (by_group[ch.group] = by_group[ch.group] || []).push(ch);
  }
  const groups = Object.keys(by_group).sort();
  // construct URLs at runtime
  for (const ch of channels) {
    if (ch.channelId) {
      ch.url = `${IPTV_BASE}/${IPTV_USER}/${IPTV_PASS}/${ch.channelId}.ts`;
    }
  }
  iptv_cache = { total: channels.length, groups, channels, by_group };
  iptv_cache_em = agora;
  return iptv_cache;
}

function parse_range(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, raw_start, raw_end] = m;
  if (raw_start === '' && raw_end === '') return { invalid: true };
  if (raw_start === '') {
    const suffix = Number(raw_end);
    if (!Number.isFinite(suffix) || suffix <= 0) return { invalid: true };
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }
  const start = Number(raw_start);
  const end = raw_end === '' ? size - 1 : Math.min(Number(raw_end), size - 1);
  if (!Number.isFinite(start) || start > end || start >= size) return { invalid: true };
  return { start, end };
}

async function build_library() {
  await mkdir(MEDIA, { recursive: true });
  const entries = await readdir(MEDIA, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);

  const videos = [];
  for (const name of files) {
    const ext = extname(name).toLowerCase();
    if (!VIDEO_EXT.has(ext)) continue;
    const full = join(MEDIA, name);
    const info = await stat(full);
    const base = name.slice(0, name.length - ext.length);
    const subs = files
      .filter((f) => SUB_EXT.has(extname(f).toLowerCase()))
      .filter((f) => f.slice(0, f.lastIndexOf('.')) === base ||
                     f.slice(0, f.lastIndexOf('.')).startsWith(base + '.'))
      .map((f) => ({
        label: f.slice(base.length).replace(/^\./, '').replace(/\.vtt$/i, '') || 'Português',
        src: '/media/' + encodeURIComponent(f),
      }));
    videos.push({
      file: name,
      url: '/media/' + encodeURIComponent(name),
      size: info.size,
      ext,
      name: base,
      subtitles: subs,
    });
  }
  return videos;
}

async function serve_file(req, res, abs_path, cache) {
  let info;
  try {
    info = await stat(abs_path);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 — não encontrado');
  }
  if (info.isDirectory()) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 — diretório');
  }

  const size = info.size;
  const ext = extname(abs_path).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const range = parse_range(req.headers.range, size);
  const comprimivel = COMPRESSIVEL.has(ext) && size >= COMP_MIN;
  const etag = `W/"${size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;

  const base_headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cache,
    'Last-Modified': info.mtime.toUTCString(),
    ETag: etag,
  };
  if (comprimivel) base_headers.Vary = 'Accept-Encoding';

  if (!range && req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cache, Vary: 'Accept-Encoding' });
    return res.end();
  }

  if (range && range.invalid) {
    res.writeHead(416, { ...base_headers, 'Content-Range': `bytes */${size}` });
    return res.end();
  }

  /* estático comprimido: só sem Range, que é o caso de html/css/js/json */
  if (!range && comprimivel && req.method !== 'HEAD') {
    const encoding = encoding_aceito(req, 'br') ? 'br' : encoding_aceito(req, 'gzip') ? 'gzip' : '';
    if (encoding) {
      try {
        const bruto = await readFile(abs_path);
        const saida = await comprimir(`${abs_path}:${etag}`, bruto, encoding);
        res.writeHead(200, {
          ...base_headers,
          'Content-Encoding': encoding,
          'Content-Length': saida.length,
        });
        return res.end(saida);
      } catch { /* serve cru logo abaixo */ }
    }
  }

  if (range) {
    const { start, end } = range;
    res.writeHead(206, {
      ...base_headers,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': end - start + 1,
    });
    if (req.method === 'HEAD') return res.end();
    const stream = createReadStream(abs_path, { start, end });
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  }

  res.writeHead(200, { ...base_headers, 'Content-Length': size });
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(abs_path);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/* ───────────────────────── rotas de conta ───────────────────────── */

async function api_auth(req, res, url) {
  const rota = url.pathname;
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').toString().split(',')[0].trim();

  if (rota === '/api/me' && req.method === 'GET') {
    const u = usuario_da_sessao(req);
    if (!u) return send_json(res, 200, { user: null, progress: [] });
    const meus = store.progress
      .filter((p) => p.uid === u.id)
      .sort((a, b) => b.updated - a.updated)
      .slice(0, 60);
    return send_json(res, 200, { user: public_user(u), progress: meus });
  }

  if (rota === '/api/register' && req.method === 'POST') {
    const body = await read_body(req);
    const nome = limpar(body.name, 40);
    const email = limpar(body.email, 120).toLowerCase();
    const senha = String(body.password ?? '');

    if (nome.length < 2) return send_json(res, 400, { error: 'Informe um nome com 2 caracteres ou mais.' });
    if (!email_ok(email)) return send_json(res, 400, { error: 'E-mail inválido.' });
    if (senha.length < 6) return send_json(res, 400, { error: 'A senha precisa de pelo menos 6 caracteres.' });
    if (store.users.some((u) => u.email === email)) {
      return send_json(res, 409, { error: 'Esse e-mail já tem uma conta. Faça login.' });
    }

    const user = {
      id: store.seq++,
      name: nome,
      email,
      pass: await hash_password(senha),
      since: new Date().toISOString(),
      role: ehDono({ name: nome, email }) ? 'owner' : 'user',
      supporter: false,
    };
    store.users.push(user);
    criar_sessao(req, res, user.id);
    await save_store();
    return send_json(res, 201, { user: public_user(user), progress: [] });
  }

  if (rota === '/api/login' && req.method === 'POST') {
    const espera = limite_login(ip);
    if (espera) return send_json(res, 429, { error: `Muitas tentativas. Aguarde ${espera}s.` });

    const body = await read_body(req);
    const email = limpar(body.email, 120).toLowerCase();
    const senha = String(body.password ?? '');
    const user = store.users.find((u) => u.email === email);

    if (!user || !(await check_password(senha, user.pass))) {
      falhou_login(ip);
      return send_json(res, 401, { error: 'E-mail ou senha não conferem.' });
    }
    limpou_login(ip);
    criar_sessao(req, res, user.id);
    await save_store();
    const meus = store.progress.filter((p) => p.uid === user.id).sort((a, b) => b.updated - a.updated).slice(0, 60);
    return send_json(res, 200, { user: public_user(user), progress: meus });
  }

  if (rota === '/api/logout' && req.method === 'POST') {
    const s = sessao_atual(req);
    if (s) {
      store.sessions = store.sessions.filter((x) => x.token !== s.token);
      await save_store();
    }
    cookie_set(res, SESSION_COOKIE, '', 0);
    return send_json(res, 200, { ok: true });
  }

  return send_json(res, 404, { error: 'rota de conta desconhecida' });
}

async function api_progress(req, res, url) {
  const u = usuario_da_sessao(req);
  if (!u) return send_json(res, 401, { error: 'Entre na sua conta para salvar o progresso.' });

  if (req.method === 'GET') {
    const meus = store.progress.filter((p) => p.uid === u.id).sort((a, b) => b.updated - a.updated);
    return send_json(res, 200, { progress: meus });
  }

  if (req.method === 'DELETE') {
    const id = limpar(url.searchParams.get('id'), 40);
    store.progress = store.progress.filter((p) => !(p.uid === u.id && p.id === id));
    await save_store();
    return send_json(res, 200, { ok: true });
  }

  if (req.method !== 'POST') return send_json(res, 405, { error: 'método não permitido' });

  const body = await read_body(req);
  const id = limpar(body.id, 40);
  if (!id) return send_json(res, 400, { error: 'id ausente' });

  const tipo = body.type === 'series' ? 'series' : 'movie';
  const pos = Math.max(0, Math.min(Number(body.position) || 0, 86400 * 2));
  const dur = Math.max(0, Math.min(Number(body.duration) || 0, 86400 * 2));
  const agora = Date.now();

  const registro = {
    uid: u.id,
    id,
    type: tipo,
    name: limpar(body.name, 120),
    poster: limpar(body.poster, 300),
    year: Number(body.year) || 0,
    tmdb: limpar(body.tmdb, 20),
    season: Number(body.season) || 0,
    episode: Number(body.episode) || 0,
    position: Math.round(pos),
    duration: Math.round(dur),
    updated: agora,
    watchCount: 1,
    genres: Array.isArray(body.genres) ? body.genres.slice(0, 8) : [],
  };

  const existente = store.progress.find((p) => p.uid === u.id && p.id === id);
  if (existente) {
    registro.watchCount = (existente.watchCount || 0) + 1;
    Object.assign(existente, registro);
  } else {
    store.progress.push(registro);
  }

  // teto por conta: mantém as 80 mais recentes
  const meus = store.progress.filter((p) => p.uid === u.id).sort((a, b) => b.updated - a.updated);
  if (meus.length > 80) {
    const sobra = new Set(meus.slice(80).map((p) => p.id));
    store.progress = store.progress.filter((p) => !(p.uid === u.id && sobra.has(p.id)));
  }

  await save_store();
  return send_json(res, 200, { ok: true, item: registro });
}

/* ───────────────────────── servidor ───────────────────────── */

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    if (pathname === '/api/ping') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
      const target = url.searchParams.get('u');
      if (!target || !/^https?:\/\//i.test(target)) {
        return send_json(res, 400, { ok: false, error: 'url inválida' });
      }

      const attempt = async (timeout_ms) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout_ms);
        try {
          const r = await fetch(target, {
            method: 'GET',
            redirect: 'follow',
            signal: ctrl.signal,
            headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' },
          });
          clearTimeout(timer);
          await r.arrayBuffer().catch(() => {});
          return { ok: r.ok, status: r.status };
        } catch (err) {
          clearTimeout(timer);
          return { ok: false, status: 0, error: err.name === 'AbortError' ? 'timeout' : err.message };
        }
      };

      let out = await attempt(8000);
      if (!out.ok) out = await attempt(12000);
      return send_json(res, 200, out);
    }

    if (pathname === '/api/catalog') {
      if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); return res.end(); }
      try {
        return await send_json_comp(req, res, 200, await ler_catalogo());
      } catch {
        return send_json(res, 503, { error: 'catalog.json ainda não foi gerado. Rode node build-catalog.mjs.' });
      }
    }

    if (pathname === '/api/busca') {
      if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); return res.end(); }
      const termo = limpar(url.searchParams.get('q'), 80).toLowerCase();
      const limite = Math.min(Math.max(Number(url.searchParams.get('n')) || 24, 1), 60);
      if (!termo) return send_json(res, 200, { media: [] });
      let dados;
      try { dados = await ler_catalogo(); } catch { return send_json(res, 503, { media: [] }); }
      const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const alvo = semAcento(termo);
      const media = (dados.media || [])
        .map((m) => {
          const nome = semAcento(m.name);
          let nota = 0;
          if (nome === alvo) nota = 100;
          else if (nome.startsWith(alvo)) nota = 70;
          else if (nome.includes(alvo)) nota = 40;
          return { m, nota };
        })
        .filter((x) => x.nota > 0)
        .sort((a, b) => b.nota - a.nota || (b.m.popularity || 0) - (a.m.popularity || 0))
        .slice(0, limite)
        .map((x) => x.m);
      return send_json(res, 200, { media });
    }

    if (pathname === '/api/library') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
      return send_json(res, 200, { media: await build_library() });
    }

    if (pathname === '/api/iptv') {
      if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); return res.end(); }
      try {
        const dados = await ler_iptv();
        const grupo = url.searchParams.get('group');
        if (grupo) {
          const filtrados = (dados.channels || []).filter((c) => c.group === grupo);
          return send_json(res, 200, { total: filtrados.length, channels: filtrados });
        }
        return send_json(res, 200, dados);
      } catch (err) {
        return send_json(res, 500, { error: err.message });
      }
    }

    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/support' && req.method === 'POST') {
        const u = usuario_da_sessao(req);
        if (!u) return send_json(res, 401, { error: 'Entre na sua conta para apoiar.' });
        u.supporter = true;
        if (ehDono(u)) u.role = 'owner';
        await save_store();
        return send_json(res, 200, { ok: true, supporter: true, adFree: true });
      }

      if (pathname === '/api/owner' && req.method === 'GET') {
        const u = usuario_da_sessao(req);
        if (!u || !ehDono(u)) return send_json(res, 403, { error: 'Acesso restrito ao dono do site.' });
        const catalogo = await ler_catalogo().catch(() => ({ media: [] }));
        const stats = {
          usuarios: store.users.length,
          apoiadores: store.users.filter((x) => x.supporter).length,
          donos: store.users.filter((x) => ehDono(x)).length,
          progresso: store.progress.length,
          titulos: (catalogo.media || []).length,
          sessoes: store.sessions.length,
        };
        const usuarios = store.users.map((x) => ({
          id: x.id, name: x.name, email: x.email, role: x.role || 'user',
          supporter: !!x.supporter, since: x.since,
        }));
        return send_json(res, 200, { stats, usuarios });
      }

      if (pathname === '/api/stats' && req.method === 'GET') {
        const u = usuario_da_sessao(req);
        if (!u) return send_json(res, 401, { error: 'Entre na sua conta.' });
        const meus = store.progress.filter((p) => p.uid === u.id);
        const totalWatches = meus.reduce((s, p) => s + (p.watchCount || 0), 0);
        const totalTitles = meus.length;
        // most watched
        const mostWatched = [...meus]
          .sort((a, b) => (b.watchCount || 0) - (a.watchCount || 0))
          .slice(0, 8)
          .map((p) => ({ id: p.id, name: p.name, type: p.type, watchCount: p.watchCount || 0, poster: p.poster, year: p.year }));
        // favorite genres
        const genreCount = new Map();
        for (const p of meus) {
          for (const g of (p.genres || [])) {
            genreCount.set(g, (genreCount.get(g) || 0) + (p.watchCount || 1));
          }
        }
        const favoriteGenres = [...genreCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([g, n]) => ({ genre: g, count: n }));
        // recent activity (last 10 by updated)
        const recent = [...meus]
          .sort((a, b) => b.updated - a.updated)
          .slice(0, 10)
          .map((p) => ({ id: p.id, name: p.name, type: p.type, updated: p.updated, season: p.season, episode: p.episode, poster: p.poster }));
        // watches per day (last 7 days)
        const agora = Date.now();
        const diaMs = 24 * 60 * 60 * 1000;
        const porDia = [];
        for (let i = 6; i >= 0; i--) {
          const inicio = agora - (i + 1) * diaMs;
          const fim = agora - i * diaMs;
          const count = meus.filter((p) => p.updated >= inicio && p.updated < fim).length;
          const d = new Date(fim);
          porDia.push({ label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }), count });
        }
        return send_json(res, 200, { totalTitles, totalWatches, mostWatched, favoriteGenres, recent, porDia });
      }

      if (pathname === '/api/me' || pathname === '/api/register' || pathname === '/api/login' || pathname === '/api/logout') {
        try {
          return await api_auth(req, res, url);
        } catch (err) {
          return send_json(res, 400, { error: err.message });
        }
      }
      if (pathname === '/api/progress') {
        try {
          return await api_progress(req, res, url);
        } catch (err) {
          return send_json(res, 400, { error: err.message });
        }
      }
      return send_json(res, 404, { error: 'rota desconhecida' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }

    const abs = resolve(ROOT, '.' + normalize(pathname));
    if (!abs.startsWith(ROOT) || abs.startsWith(DATA)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('403');
    }

    const is_media = abs.startsWith(MEDIA);
    const cache = is_media ? 'no-cache' : 'no-cache';
    return serve_file(req, res, abs, cache);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 — ' + err.message);
  }
});

server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

await load_store();

server.listen(PORT, HOST, async () => {
  const lib = await build_library();
  let total = 0;
  try {
    const c = await ler_catalogo();
    total = (c.media || []).length;
  } catch { /* catálogo ainda não gerado */ }

  console.log(`\n  NOIR  →  http://${HOST}:${PORT}`);
  console.log(`  catálogo        ${total} título(s)`);
  console.log(`  contas          ${store.users.length} usuário(s) · ${store.sessions.length} sessão(ões)`);
  console.log(`  media/          ${lib.length} arquivo(s) de vídeo`);
  console.log('');
});
