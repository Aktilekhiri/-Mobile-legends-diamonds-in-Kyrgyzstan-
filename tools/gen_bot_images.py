#!/usr/bin/env python3
"""Картинки для Telegram-бота: карточка игры (img/bot/<id>.png) и сетка иконок (img/bot/games.png).
Иконки берутся из img/games. Запуск: python3 tools/gen_bot_images.py"""
import re, os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = (23, 33, 43)
src = open(os.path.join(ROOT, 'worker/src/shop_data.js'), encoding='utf-8').read()
ids = re.findall(r'"id":"([a-z0-9_]+)","region"', src)
MLBB = {'global', 'russia', 'indonesia', 'turkey', 'malaysia', 'philippines', 'singapore', 'brazil', 'usa'}
def icon(i):
    p = os.path.join(ROOT, 'img/games', ('mlbb' if i in MLBB else i) + '.webp')
    return Image.open(p).convert('RGBA') if os.path.exists(p) else None
os.makedirs(os.path.join(ROOT, 'img/bot'), exist_ok=True)
have = []
for i in ids:
    im = icon(i)
    if not im: continue
    have.append(i)
    c = Image.new('RGB', (360, 360), BG); a = im.resize((256, 256), Image.LANCZOS); c.paste(a, (52, 52), a)
    c.save(os.path.join(ROOT, 'img/bot', i + '.png'), optimize=True)
seen, uniq = set(), []
for i in have:
    k = 'mlbb' if i in MLBB else i
    if k not in seen: seen.add(k); uniq.append(k)
cols, cell, pad = 6, 120, 16
rows = (len(uniq) + cols - 1) // cols
g = Image.new('RGB', (cols * cell + pad, rows * cell + pad), BG)
for n, k in enumerate(uniq):
    a = icon(k).resize((cell - pad, cell - pad), Image.LANCZOS); g.paste(a, (pad // 2 + (n % cols) * cell + pad // 2, pad // 2 + (n // cols) * cell + pad // 2), a)
g.save(os.path.join(ROOT, 'img/bot/games.png'), optimize=True)
print(len(have), 'карточек,', len(uniq), 'иконок в сетке')
