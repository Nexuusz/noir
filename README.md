# NOIR

Catálogo de filmes, séries, animes e desenhos **dublados em português**, servido localmente em
`http://127.0.0.1:4321`. O site não hospeda arquivo: cada título abre em um player
brasileiro (SuperFlix / StreamBetter) por dentro de um iframe, com 4 fontes por título.

Criado por **nexuusz** e **nakaw**.

## Subir

```powershell
cd C:\Users\GROSSO\site2.0
node server.mjs
```

Porta e host mudam por ambiente: `$env:PORT=8080; node server.mjs`.

## Arquivos

| Arquivo | O que é |
|---|---|
| `server.mjs` | servidor HTTP: estático com Range, compressão br/gzip/ETag, contas, progresso, busca |
| `catalog.json` | catálogo (3,4 MB · 5686 títulos · 5684 com TMDB) |
| `build-catalog.mjs` | gera o catálogo a partir do Cinemeta (`v3-cinemeta.strem.io`) |
| `map-tmdb.mjs` | preenche `tmdb` por título — Cinemeta e, no resto, Wikidata (P345 → P4947) |
| `index.html` | home: destaque do dia, trilhos, top 10, categorias, busca modal, conta |
| `filme.html` | ficha: servidores, temporadas/episódios, ficha técnica, parecidos |
| `player.html` | player com iframe, chips de servidor, ping, episódios, anterior/próximo |
| `login.html` | entrar / criar conta |
| `apoiar.html` | apoio ao projeto (R$ 0,99) |
| `dono.html` | painel do dono (nexuusz/nakaw) |
| `aovivo.html` | aba AO VIVO (futebol) — prévia, tudo marcado "em breve" |
| `data/store.json` | usuários, sessões e progresso (criado em tempo de execução) |

## Novidades da 2.0

- Tema roxo/lilás Y2K com grade de fundo.
- Busca modal com filtros por tipo (Filmes, Séries, Animes, Desenhos).
- Aba e trilho de Desenhos animados.
- Player com gaveta de episódios para séries (temporadas/episódios).
- Conta com selo Apoiador (R$ 0,99) e Painel do dono (nexuusz/nakaw).
- Modo sem anúncios para apoiadores e donos.
- Botão Início em todas as páginas.

## Contas

- `POST /api/register` `{name,email,password}` → 201 + cookie `fehd_sid`
- `POST /api/login` → 200, `POST /api/logout` → 200
- `GET /api/me` → `{user, progress}`
- `GET|POST|DELETE /api/progress` — guarda título, tipo, temporada e episódio
- `POST /api/support` — marca o usuário como Apoiador (R$ 0,99)
- `GET /api/owner` — painel do dono (restrito a nexuusz/nakaw)
- Senha em `scrypt` com sal por usuário · cookie `httpOnly`, `SameSite=Lax`, 60 dias

## Rotas

| Rota | Uso |
|---|---|
| `GET /api/catalog` | catálogo JSON (br/gzip + ETag) |
| `GET /api/busca?q=&n=` | busca sem acento por nome |
| `GET /api/library` | arquivos de `media/` |
| `GET /api/ping?u=` | testa se a fonte responde (duas tentativas: 8 s e 12 s) |

## Fontes (só dublado, só BR)

```
SuperFlix      https://superflixapi.boats/filme/{tmdb}         espelho: .cv
StreamBetter   https://streambetter.shop/filme/{tmdb}          espelho: .lat
séries         /serie/{tmdb}/{temporada}/{episodio}  nas duas
```

## Notas

- Progresso em segundos não existe em iframe de outro domínio. "Continuar assistindo"
  guarda título, temporada e episódio — e retoma neles.
- `media/` está vazio; o player do catálogo nunca usa arquivo local.
- Ads dos players são de terceiros (SuperFlix/StreamBetter) e não podem ser removidos
  pelo NOIR. Apoiadores e donos ganham o selo "Modo sem anúncios" e dicas ocultas.
