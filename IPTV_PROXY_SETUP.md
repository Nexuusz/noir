# IPTV Proxy — setup (Cloudflare Worker)

O Render (Oregon) é bloqueado pelo provedor (404 do nginx). O proxy roda no PoP
da Cloudflare mais próximo do usuário (Brasil) e resolve isso.

## 1. Criar o Worker
1. dash.cloudflare.com → Workers & Pages → Create → Create Worker
2. Nome sugerido: noir-iptv
3. Cole o conteúdo de worker.js → Deploy

## 2. Variáveis (Settings → Variables and Secrets)
- IPTV_BASE = https://ultrap.top
- IPTV_USER = 003008
- IPTV_PASS = 440144634

## 3. Ativar no Render
No serviço noir → Environment → adicionar:
- IPTV_PROXY = https://noir-iptv.<seu-subdominio>.workers.dev
Save → o Render reinicia e os canais passam a tocar.

## Observações
- O Worker segue o redirect 302 do painel para o edge (HTTP) e devolve bytes
  por HTTPS — sem mixed content no navegador.
- Limite gratuito: 100k req/dia. Para uso heavy, considere o plano pago.
- O site local (192.168.1.104:4321) continua usando o proxy nativo do server.mjs.
