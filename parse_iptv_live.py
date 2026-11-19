import re, json

# Groups that are live TV channels (not 24H content, not radio, not adult)
live_groups = {
    'GLOBO SUDESTE', 'GLOBO NORDESTE', 'GLOBO SUL', 'GLOBO NORTE', 'GLOBO CENTRO-OESTE',
    'RECORD TV', 'SBT', 'BAND', 'ABERTOS', 'NOTICIAS', 'HBO', 'TELECINE', 'CINE',
    'ESPN', 'ESPORTES', 'LUTAS / UFC', 'PREMIERE', 'SPORTV', 'DOCUMENTÁRIOS',
    'INFANTIS', 'VARIEDADES', 'RELIGIOSOS', 'CULINÁRIA', 'FILMES E SÉRIES',
    'HBO MAX PPV', 'DAZN PPV', 'PRIME VIDEO PPV', 'DISNEY+ PPV', 'GOAT PPV',
    'SPORTYNET PPV', 'CAZÉ TV PPV', 'PARAMOUNT+ PPV', 'APPLE TV+ PPV',
    'PAY-PER-VIEW', 'LUTAS', 'CAMPEONATOS ESTADUAIS', 'COPINHA 2026',
    'A FAZENDA 18', 'RÁDIOS RELIGIOSAS', 'RÁDIOS NOTÍCIAS/JORNALISMO', 'RÁDIOS DIVERSAS',
    'CINE', 'RÁDIOS', 'LUTAS / UFC', 'CAMPEONATOS ESTADUAIS',
}

# Groups to exclude (24H content, adult, radio)
exclude_groups = {
    '24H INFANTIS/DESENHOS', '24H SÉRIES/PROGRAMAS', '24H-BRASILEIRINHAS ADULTOS +18',
    '24H DISCOVERY+', '24H DORAMAS', '24H FILMES', '24H-PARODIAS EROTICAS ADULTOS +18',
    'ADULTOS +18', 'ADULTOS +18 - ONLY FANS/PRIVACY', 'ADULTOS 18+ GAYS/TRANS',
    'Reels | Shorts', 'RÁDIOS', 'RÁDIOS RELIGIOSAS', 'RÁDIOS NOTÍCIAS/JORNALISMO',
    'RÁDIOS DIVERSAS',
}

channels = []
current = None

with open(r'C:\Users\GROSSO\Downloads\playlist_003008_plus.txt', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line.startswith('#EXTINF'):
            m = re.search(r'tvg-name="([^"]*)"', line)
            name = m.group(1) if m else ''
            m = re.search(r'tvg-logo="([^"]*)"', line)
            logo = m.group(1) if m else ''
            m = re.search(r'group-title="([^"]*)"', line)
            group = m.group(1) if m else ''
            current = {'name': name, 'logo': logo, 'group': group}
        elif line and not line.startswith('#') and current:
            current['url'] = line
            if current['group'] not in exclude_groups and current['group'] in live_groups:
                channels.append(current)
            current = None

# Deduplicate by name (keep first)
seen = set()
unique = []
for ch in channels:
    if ch['name'] not in seen:
        seen.add(ch['name'])
        unique.append(ch)

# Group by category
by_group = {}
for ch in unique:
    g = ch['group']
    by_group.setdefault(g, []).append(ch)

# Sort groups by name
sorted_groups = sorted(by_group.keys())

# Build output
output = {
    'total': len(unique),
    'groups': sorted_groups,
    'channels': unique,
    'by_group': {g: by_group[g] for g in sorted_groups}
}

with open(r'C:\Users\GROSSO\site2.0\iptv_live.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f'Total live channels: {len(unique)}')
print(f'Groups: {len(sorted_groups)}')
for g in sorted_groups:
    print(f'  {g}: {len(by_group[g])} canais')