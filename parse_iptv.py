import re
groups = {}
count = 0
with open(r'C:\Users\GROSSO\Downloads\playlist_003008_plus.txt', encoding='utf-8') as f:
    for line in f:
        m = re.search(r'group-title="([^"]*)"', line)
        if m:
            g = m.group(1)
            groups[g] = groups.get(g, 0) + 1
            count += 1
print('Total entries:', count)
print('Groups:', len(groups))
for g, n in sorted(groups.items(), key=lambda x: -x[1]):
    print('  ', g, ':', n, 'canais')