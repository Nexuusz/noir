// Cloudflare Worker — proxy IPTV com egress no PoP próximo do usuário (BR).
// Contorna o bloqueio de IP (Render/Oregon) do provedor ultrap.top.
// Deploy: dash.cloudflare.com -> Workers & Pages -> Create -> Worker -> colar este código
// Vars (Settings -> Variables): IPTV_BASE, IPTV_USER, IPTV_PASS

const BASE = (env) => (env.IPTV_BASE || 'https://ultrap.top').replace(/\/$/, '');
const USER = (env) => env.IPTV_USER || '';
const PASS = (env) => env.IPTV_PASS || '';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': '*',
};

const b64e = (s) => btoa(unescape(encodeURIComponent(s)));
const b64d = (s) => decodeURIComponent(escape(atob(s)));

const edgeCache = new Map();
const EDGE_TTL = 60_000;

async function resolveEdge(env, id) {
  const now = Date.now();
  const c = edgeCache.get(id);
  if (c && now - c.em < EDGE_TTL) return c;
  const base = BASE(env), u = USER(env), p = PASS(env);
  let loc = null;
  try {
    const r = await fetch(`${base}/${u}/${p}/${id}.ts`, { redirect: 'manual' });
    loc = r.headers.get('location');
  } catch {}
  if (!loc) return null;
  const u2 = new URL(loc);
  const rec = { host: u2.host, token: u2.search, em: now };
  edgeCache.set(id, rec);
  if (edgeCache.size > 400) {
    for (const [k, v] of edgeCache) if (Date.now() - v.em > EDGE_TTL) edgeCache.delete(k);
  }
  return rec;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/play') {
      const id = (url.searchParams.get('id') || '').replace(/\D/g, '');
      if (!id) return new Response('id obrigatório', { status: 400, headers: CORS });
      const edge = await resolveEdge(env, id);
      if (!edge) return new Response('canal indisponível', { status: 502, headers: CORS });
      let up;
      try { up = await fetch(`http://${edge.host}/auth/${id}.m3u8${edge.token}`); }
      catch { return new Response('manifesto indisponível', { status: 502, headers: CORS }); }
      if (!up.ok) return new Response('manifesto indisponível', { status: 502, headers: CORS });
      const txt = await up.text();
      const origin = url.origin;
      const h = b64e(edge.host);
      const t = b64e(edge.token);
      const out = txt.split('\n').map((l) => {
        const s = l.trim();
        if (!s || s.startsWith('#')) return l;
        return `${origin}/seg?h=${h}&p=${b64e(s)}&t=${t}`;
      }).join('\n');
      return new Response(out, {
        headers: { ...CORS, 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-store' },
      });
    }

    if (url.pathname === '/seg') {
      let host, caminho, token;
      try { host = b64d(url.searchParams.get('h') || ''); caminho = b64d(url.searchParams.get('p') || ''); token = b64d(url.searchParams.get('t') || ''); }
      catch { return new Response('parâmetros inválidos', { status: 400, headers: CORS }); }
      if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) || !/^\/hls\/[\w.-]+\.ts$/.test(caminho)) {
        return new Response('alvo inválido', { status: 400, headers: CORS });
      }
      let up;
      try { up = await fetch(`http://${host}${caminho}${token}`); }
      catch { return new Response('segmento indisponível', { status: 502, headers: CORS }); }
      if (!up.ok || !up.body) return new Response('segmento indisponível', { status: up.status || 502, headers: CORS });
      const headers = new Headers(CORS);
      headers.set('content-type', 'video/mp2t');
      headers.set('cache-control', 'no-store');
      const cl = up.headers.get('content-length');
      if (cl) headers.set('content-length', cl);
      return new Response(up.body, { status: 200, headers });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'noir-iptv-proxy' }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      });
    }

    return new Response('not found', { status: 404, headers: CORS });
  },
};
