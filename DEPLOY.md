# Como publicar o NOIR na web

## Opção 1: Render (grátis, mais fácil)

1. Crie uma conta em https://render.com (grátis)
2. Crie um repositório no GitHub com a pasta `site2.0`
3. No Render, clique "New" → "Web Service"
4. Conecte o repositório GitHub
5. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
6. Clique "Create Web Service"

O Render vai detectar o `render.yaml` automaticamente e fazer o deploy.

**URL**: `https://noir-XXXX.onrender.com`

### Limitações do plano grátis
- O servidor "dorme" após 15 min sem acesso (demora ~30s para acordar)
- O sistema de contas (store.json) **não persiste** entre restarts (arquivo efêmero)
- Para persistência, use Supabase (grátis) ou Render Postgres

## Opção 2: Railway (grátis com créditos)

1. Crie conta em https://railway.app
2. "New Project" → "Deploy from GitHub repo"
3. Selecione o repositório
4. Railway detecta o Node.js automaticamente
5. Adicione variável `PORT` = `3000`

## Opção 3: Fly.io (grátis com limites)

1. Instale o flyctl: https://fly.io/docs/hands-on/install-flyctl/
2. `fly launch` na pasta do projeto
3. `fly deploy`

## Persistência de contas (opcional)

Para que as contas dos seus amigos persistam, substitua o `data/store.json` por um banco de dados grátis:

- **Supabase** (https://supabase.com): Postgres grátis, 500MB
- **PlanetScale** (https://planetscale.com): MySQL grátis
- **Render Postgres** (https://render.com): Postgres grátis (expira em 90 dias)

Se quiser, eu adapto o `server.mjs` para usar Supabase em vez de arquivo JSON.

## Notas

- O catálogo (`catalog.json`) é servido do disco. No Render, ele fica no build (incluído no deploy).
- Se você atualizar o catálogo, faça um novo deploy (git push).
- As imagens (pôsteres) vêm do TMDB e Metahub (CDN externo), então não ocupam espaço no servidor.