#!/usr/bin/env python3
"""Генерирует worker/src/shop_data.js (игры и цены для Telegram-бота) из index.html.
Запуск после изменения цен:  python3 tools/gen_bot_data.py"""
import re, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
gd = json.loads(re.search(r'const gamesData = (\{.*?\});\n', src, re.S).group(1))
hints = dict(re.findall(r"^\s*(\w+): '((?:[^'\\]|\\.)*)',?\s*$", src[src.index('const gameIds'):src.index('const gameIds') + 9000], re.M))
SKIP = set()
games = []

def mlbb(region, title):
    body = re.search(region + r': \[(.*?)\n  \],?\n', src, re.S).group(1)
    packs = []
    for line in body.split('\n'):
        m = re.search(r"\{type:'(diamond|pass)'(?:, name:'([^']+)')?(?:, diam:(\d+), bonus:(\d+))?, price:(\d+)(.*)\}", line)
        if not m: continue
        t, name, d, b, price, rest = m.groups()
        if 'out:true' in rest: continue
        if t == 'pass': key, label = name, name
        else:
            d, b = int(d), int(b or 0); key, label = f'{d}+{b}', f'{d + b} алмазов ({d}+{b})'
        p = dict(k=key, l=label, p=int(price), t=0 if t == 'pass' else d + b)
        if 'firstOnly:true' in rest: p['first'] = 1
        packs.append(p)
    packs.sort(key=lambda x: (x['t'] == 0, x['t']))
    games.append(dict(id=region, region=region, name=title, hint=hints.get('mlbb', ''), mlbb=1, packs=packs))

mlbb('global', 'Mobile Legends (Глобальный)')
mlbb('russia', 'Mobile Legends (Россия)')
mlbb('indonesia', 'Mobile Legends (Индонезия)')
mlbb('turkey', 'Mobile Legends (Турция)')
mlbb('malaysia', 'Mobile Legends (Малайзия)')
mlbb('philippines', 'Mobile Legends (Филиппины)')
mlbb('singapore', 'Mobile Legends (Сингапур)')
mlbb('brazil', 'Mobile Legends (Бразилия)')
mlbb('usa', 'Mobile Legends (США)')
for k, g in gd.items():
    if k in SKIP: continue
    packs = []
    for p in g['packs']:
        if p.get('name'): packs.append(dict(k=p['k'], l=p['name'], p=p['price'], t=0))
        else:
            tot = p['amt'] + p.get('bonus', 0)
            packs.append(dict(k=p['k'], l=f"{tot} {g['unit']}", p=p['price'], t=tot))
    packs.sort(key=lambda x: (x['t'] == 0, x['t']))
    e = dict(id=k, region=k, name=g['name'], hint=hints.get(k, ''), packs=packs)
    if g.get('kind') == 'none': e['none'] = 1
    if g.get('kind') == 'username': e['user'] = 1
    if g.get('servers'): e['servers'] = g['servers']
    if g.get('zone'): e['zone'] = 1
    games.append(e)
out = '// АВТОГЕНЕРАЦИЯ: python3 tools/gen_bot_data.py (цены берутся из index.html)\nexport const SHOP = ' + json.dumps(games, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(os.path.join(ROOT, 'worker/src/shop_data.js'), 'w', encoding='utf-8').write(out)
print('games', len(games), 'packs', sum(len(g['packs']) for g in games), 'bytes', len(out))
