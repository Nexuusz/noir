// Cloudflare Worker — proxy IPTV com egress no PoP próximo do usuário (BR).
// Contorna o bloqueio de IP (Render/Oregon) do provedor ultrap.top.
// Vars (Settings -> Variables): IPTV_BASE, IPTV_USER, IPTV_PASS

const BASE = (env) => (env.IPTV_BASE || 'https://ultrap.top').replace(/\/$/, '');
const USER = (env) => env.IPTV_USER || '';
const PASS = (env) => env.IPTV_PASS || '';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': '*',
};

const UA = 'VLC/3.0.20 LibVLC/3.0.20';

const b64e = (s) => btoa(unescape(encodeURIComponent(s)));
const b64d = (s) => decodeURIComponent(escape(atob(s)));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/play') {
      const id = (url.searchParams.get('id') || '').replace(/\D/g, '');
      if (!id) return new Response('id obrigatório', { status: 400, headers: CORS });

      // Fetch manifest from ultrap.top (follows redirect to edge)
      let up;
      try {
        up = await fetch(`${BASE(env)}/${USER(env)}/${PASS(env)}/${id}.m3u8`, {
          redirect: 'follow',
          headers: { 'user-agent': UA, 'accept': '*/*' },
        });
      } catch (e) {
        return new Response('manifesto erro: ' + e.message, { status: 502, headers: CORS });
      }
      if (!up.ok) {
        const body = await up.text().catch(() => '');
        return new Response('manifesto status=' + up.status + ' body=' + body.slice(0, 120), { status: 502, headers: CORS });
      }
      const txt = await up.text();
      const origin = url.origin;
      const edgeHost = new URL(up.url).host;
      const edgeToken = new URL(up.url).search;
      const h = b64e(edgeHost);
      const t = b64e(edgeToken);
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
      try { up = await fetch(`http://${host}${caminho}${token}`, { headers: { 'user-agent': UA } }); }
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
