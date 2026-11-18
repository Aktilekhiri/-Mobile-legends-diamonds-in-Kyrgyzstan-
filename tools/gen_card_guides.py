#!/usr/bin/env python3
"""Страницы-инструкции «пополнить игру картой Google Play / App Store»: Standoff 2, Brawl Stars, Clash of Clans.
Цены берутся из index.html (gamesData). Запуск после изменения цен: python3 tools/gen_card_guides.py"""
import re, json, os, html
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
gd = json.loads(re.search(r'const gamesData = (\{.*?\});\n', src, re.S).group(1))
e = html.escape
BASE = 'https://diamond.kg'
ANDROID = [('gplay', 'США'), ('gplay_tr', 'Турция'), ('gplay_de', 'Германия'), ('gplay_uk', 'Великобритания'), ('gplay_ae', 'ОАЭ')]
IOS = [('apple_us', 'США'), ('apple_tr', 'Турция'), ('apple_ru', 'Россия')]
GAMES = {
 'standoff2': dict(slug='standoff-2-gold-kyrgyzstan', name='Standoff 2', cur='Gold', img='standoff2',
   what='золото (Gold)', shop='магазине внутри игры'),
 'brawlstars': dict(slug='brawl-stars-kyrgyzstan', name='Brawl Stars', cur='гемы', img='brawlstars',
   what='гемы', shop='магазине внутри игры'),
 'clashofclans': dict(slug='clash-of-clans-kyrgyzstan', name='Clash of Clans', cur='самоцветы', img='clashofclans',
   what='самоцветы (гемы)', shop='магазине внутри игры'),
}
def minp(g): return min(p['price'] for p in gd[g]['packs'])
def row(items, store):
    out = ''
    for g, reg in items:
        out += f"<a class='rg' href='/?game={g}'><b>{store} · {reg}</b><span>от {minp(g):,} сом</span></a>".replace(',', ' ')
    return out
CSS = """*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Nunito',system-ui,sans-serif;background:#F4F7FB;color:#101828;line-height:1.65}a{color:#0E7490}
.wrap{max-width:820px;margin:0 auto;padding:0 16px 40px}nav{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(16,24,40,.12);background:#fff;gap:8px;flex-wrap:wrap}
.logo{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.4rem;color:#101828;text-decoration:none}.logo b{color:#0E7490}
nav .links a{margin-left:12px;text-decoration:none;font-size:.9rem;color:#566377}h1{font-family:'Rajdhani',sans-serif;font-size:clamp(1.7rem,5vw,2.3rem);line-height:1.15;margin:28px 0 6px}
h2{font-family:'Rajdhani',sans-serif;font-size:1.35rem;margin:26px 0 8px;color:#0E7490}p,li{margin:8px 0;color:#344054}ul,ol{margin:8px 0 8px 22px}
.warn{background:#FFF7E6;border:1px solid #F5C26B;border-radius:12px;padding:12px 14px;margin:16px 0}.warn b{color:#8A5300}
.rgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;margin:10px 0}.rg{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 12px;background:#fff;border:1px solid rgba(16,24,40,.14);border-radius:10px;text-decoration:none;color:#101828}.rg span{color:#0E7490;font-weight:700;white-space:nowrap}.rg:hover{border-color:#0E7490}
.hd{display:flex;gap:12px;align-items:center;margin-top:20px}.hd img{border-radius:14px}
footer{margin:40px 0 0;padding:24px 16px;border-top:1px solid rgba(16,24,40,.12);text-align:center;color:#566377;font-size:.85rem}"""
def page(k):
    g = GAMES[k]; n = g['name']; url = f"{BASE}/{g['slug']}/"
    title = f"Пополнить {n} в Кыргызстане картой Google Play или App Store | Diamond.kg"
    desc = f"Как пополнить {n} в Кыргызстане: купите подарочную карту Google Play или App Store, активируйте её и купите {g['what']} в игре. Важно: карта работает только в регионе вашего аккаунта."
    body = f"""<div class="hd"><img src="/img/games/{g['img']}.webp" width="64" height="64" alt="{e(n)}"><h1>Как пополнить {e(n)} в Кыргызстане</h1></div>
<p>Прямое пополнение {e(n)} по ID игрока на нашем сайте пока недоступно: игра принимает оплату только через аккаунт Google Play или App Store. Самый простой способ — купить у нас подарочную карту, активировать её на своём аккаунте и купить {e(g['what'])} в {g['shop']}.</p>
<div class="warn"><b>⚠️ Важно про регион.</b> Подарочная карта работает только в магазине той страны, в которой зарегистрирован ваш аккаунт Google Play или Apple ID. Карта США не активируется на аккаунте Турции, и наоборот. Перед покупкой проверьте регион своего аккаунта (ниже), иначе код может не активироваться.</div>
<h2>Как пополнить: 5 шагов</h2>
<ol><li>Проверьте регион аккаунта (Google Play или Apple ID) — см. ниже.</li><li>Выберите карту своего региона и номинал: Android — Google Play, iPhone/iPad — App Store.</li><li>Оплатите заказ по QR в приложении любого банка Кыргызстана. Код появится на странице заказа сразу после оплаты.</li><li>Активируйте код: Google Play → «Погасить код» или App Store → профиль → «Погасить подарочную карту или код».</li><li>Откройте {e(n)} и купите {e(g['what'])} в магазине игры: оплата пройдёт с баланса аккаунта.</li></ol>
<h2>Выберите карту для Android (Google Play)</h2><div class="rgs">{row(ANDROID, 'Google Play')}</div>
<h2>Выберите карту для iPhone и iPad (App Store)</h2><div class="rgs">{row(IOS, 'App Store')}</div>
<p>Нет карты вашего региона? Тогда есть два пути: сменить регион аккаунта на США или Турцию (см. ниже) или завести отдельный аккаунт нужного региона. Если сомневаетесь, напишите нам в чат на сайте до покупки.</p>
<h2>Как узнать регион аккаунта</h2>
<ul><li><b>Android:</b> Google Play → профиль → «Настройки» → «Основные» → «Настройки аккаунта и устройства» → «Страна и профили».</li><li><b>iPhone / iPad:</b> «Настройки» → ваше имя → «Контент и покупки» → «Посмотреть» → «Страна/регион».</li></ul>
<h2>Как сменить регион (если карты вашей страны нет)</h2>
<ul><li><b>Google Play:</b> страну можно сменить в разделе «Страна и профили». Обычно разрешено не чаще раза в год, а оставшийся баланс и подписки в прежнем регионе могут стать недоступны. Условия определяет Google.</li><li><b>Apple ID:</b> перед сменой региона нужно отменить подписки и потратить остаток баланса, условия определяет Apple.</li></ul>
<h2>Что нужно знать</h2>
<ul><li>Цены на {e(g['what'])} внутри игры устанавливает магазин приложений, они зависят от региона и валюты аккаунта.</li><li>Код приходит сразу после оплаты, никакие данные от аккаунта игры нам не нужны. Пароль от аккаунтов не сообщайте никому.</li><li>Мы не связаны с разработчиками игры, карты — это официальные подарочные карты магазинов.</li></ul>
<p><a href="/">← На главную</a> · <a href="/guides/">Все гайды</a> · <a href="/refund/">Возврат</a></p>"""
    return f"""<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{url}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:type" content="website"><meta property="og:url" content="{url}">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=4"><link rel="shortcut icon" href="/favicon.ico?v=4">
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Nunito:wght@400;700;800&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body>
<nav><a class="logo" href="/">💎 <b>Diamond</b>.kg</a><div class="links"><a href="/">Главная</a><a href="/delivery/">Доставка</a><a href="/refund/">Возврат</a><a href="/guides/">Гайды</a></div></nav>
<main class="wrap">{body}</main>
<footer>© 2026 Diamond.kg · ИП Казиев Актилек Кубанычбекович · Не связан с разработчиками игр · <a href="/">Главная</a></footer>
</body></html>"""
for k, g in GAMES.items():
    d = os.path.join(ROOT, g['slug']); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(page(k))
print('guide pages', len(GAMES))
