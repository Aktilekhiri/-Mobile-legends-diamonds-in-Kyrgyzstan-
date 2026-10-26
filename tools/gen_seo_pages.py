#!/usr/bin/env python3
"""Генерирует SEO-страницы игр (/<slug>/index.html), sitemap.xml. Цены берутся из index.html.
Запуск после изменения цен:  python3 tools/gen_seo_pages.py"""
import re, json, os, html, datetime
TODAY = datetime.date.today().isoformat()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
games_data = json.loads(re.search(r'const gamesData = (\{.*?\});\n', src, re.S).group(1))
# MLBB Global: из packagesData.global
gl = re.search(r'global: \[(.*?)\n  \],', src, re.S).group(1)
mlbb = []
for m in re.finditer(r"\{type:'(diamond|pass)'(?:, name:'([^']+)')?(?:, diam:(\d+), bonus:(\d+))?, price:(\d+)", gl):
    t, name, d, b, price = m.groups()
    mlbb.append(dict(name=name, amt=int(d) if d else None, bonus=int(b) if b else 0, price=int(price)))
BASE = 'https://diamond.kg'
SLUG = {'mlbb': 'mobile-legends-almazy', 'pubg': 'pubg-mobile-uc', 'freefire': 'free-fire-almazy',
        'hok': 'honor-of-kings-tokeny', 'genshin': 'genshin-impact-kristally', 'wuwa': 'wuthering-waves-lunite'}
G = {
 'mlbb': dict(name='Mobile Legends: Bang Bang', short='MLBB', unit='алмазов', cur='алмазы', icon='💎',
   h1='Пополнение алмазов Mobile Legends (Мобайл Легендс, MLBB) в Кыргызстане',
   title='Купить алмазы Mobile Legends (MLBB) в Кыргызстане от {min} сом | Mbank, O!Банк',
   desc='Пополнение алмазов Mobile Legends: Bang Bang в Кыргызстане. Оплата через Mbank и O!Банк, зачисление за 5–10 минут, без пароля от аккаунта. Цены от 45 сом.',
   kw='алмазы mlbb, пополнение mlbb кыргызстан, купить алмазы mobile legends бишкек, алмазы mlbb mbank, алмазы mlbb обанк, weekly diamond pass',
   idinfo='ID игрока и Zone ID (сервер) — в профиле игры: ваш ID и число в скобках рядом с ним.',
   needs='ID игрока и Zone ID', extra='Доступны регионы Global и Россия, Weekly Diamond Pass, Twilight Pass и Elite Pack.',
   dev='Moonton', fresh='Дополнительно: Weekly Diamond Pass, Weekly и Monthly Elite Pack, Twilight Pass.'),
 'pubg': dict(name='PUBG Mobile', short='PUBG Mobile', unit='UC', cur='UC', icon='🔫',
   h1='Пополнение UC PUBG Mobile (ПУБГ Мобайл) в Кыргызстане',
   title='Купить UC PUBG Mobile в Кыргызстане от {min} сом | Mbank, O!Банк',
   desc='Купить UC PUBG Mobile в Кыргызстане: оплата Mbank и O!Банк, пополнение по ID за 5–10 минут, без пароля. Prime, Elite Pass и UC от 115 сом.',
   kw='uc pubg mobile кыргызстан, пополнение uc pubg mbank, купить uc pubg бишкек, uc pubg обанк, pubg mobile uc по id, elite pass pubg',
   idinfo='Откройте PUBG Mobile, нажмите на аватар — там указан ID персонажа (только цифры).',
   needs='ID персонажа', extra='Есть Prime и Elite Pass.', dev='Krafton / Tencent', fresh=''),
 'freefire': dict(name='Free Fire', short='Free Fire', unit='алмазов', cur='алмазы', icon='🔥',
   h1='Пополнение алмазов Free Fire (Фри Фаер) в Кыргызстане',
   title='Купить алмазы Free Fire (Фри Фаер) в Кыргызстане от {min} сом | Mbank',
   desc='Алмазы Free Fire (Фри Фаер) в Кыргызстане по ID игрока: оплата Mbank и O!Банк, зачисление за 5–10 минут. Недельная и месячная подписки, пакеты от 49 сом.',
   kw='алмазы free fire кыргызстан, пополнение free fire mbank, купить алмазы фри фаер бишкек, free fire обанк, подписка free fire',
   idinfo='В Free Fire нажмите на аватар в левом верхнем углу — ID игрока указан под ником.',
   needs='ID игрока', extra='Есть недельная и месячная подписки (Membership).', dev='Garena', fresh=''),
 'hok': dict(name='Honor of Kings', short='Honor of Kings', unit='токенов', cur='токены', icon='👑',
   h1='Пополнение токенов Honor of Kings в Кыргызстане',
   title='Купить токены Honor of Kings в Кыргызстане от {min} сом | Mbank',
   desc='Пополнение токенов Honor of Kings в Кыргызстане по ID игрока: оплата Mbank и O!Банк, зачисление за 5–10 минут, без пароля от аккаунта.',
   kw='honor of kings токены кыргызстан, пополнение honor of kings mbank, honor of kings tokens, купить токены hok бишкек, weekly card honor of kings',
   idinfo='Откройте профиль в Honor of Kings — ID игрока указан рядом с ником.',
   needs='ID игрока', extra='Есть Weekly Card.', dev='Tencent (TiMi Studio)', fresh=''),
 'genshin': dict(name='Genshin Impact', short='Genshin Impact', unit='кристаллов', cur='кристаллы', icon='✨',
   h1='Пополнение Genesis Crystals Genshin Impact (Геншин Импакт) в Кыргызстане',
   title='Купить кристаллы Genshin Impact в Кыргызстане от {min} сом | Mbank',
   desc='Genesis Crystals и Благословение полой луны (Welkin Moon) для Genshin Impact в Кыргызстане. Оплата Mbank и O!Банк, пополнение по UID без пароля.',
   kw='genshin impact кристаллы кыргызстан, пополнение genshin impact mbank, genesis crystals купить, welkin moon купить бишкек, геншин донат кыргызстан',
   idinfo='UID (9 цифр) указан внизу справа в главном меню и в меню Паймон. Выберите свой сервер: America, Asia, Europe или TW, HK, MO.',
   needs='UID и сервер', extra='Есть Благословение полой луны (Welkin Moon).', dev='HoYoverse', fresh=''),
 'wuwa': dict(name='Wuthering Waves', short='Wuthering Waves', unit='Lunite', cur='Lunite', icon='🌊',
   h1='Пополнение Lunite Wuthering Waves (WuWa) в Кыргызстане',
   title='Купить Lunite Wuthering Waves (WuWa) в Кыргызстане от {min} сом | Mbank',
   desc='Пополнение Lunite и Lunite Subscription для Wuthering Waves (WuWa) в Кыргызстане. Оплата Mbank и O!Банк, пополнение по UID без пароля.',
   kw='wuthering waves lunite кыргызстан, wuwa донат кыргызстан, пополнение wuthering waves mbank, lunite купить бишкек, lunite subscription',
   idinfo='UID (9 цифр) указан в меню в разделе профиля. Выберите свой сервер: Asia, America, Europe, SEA или TW, HK, MO.',
   needs='UID и сервер', extra='Есть Lunite Subscription (месячная подписка).', dev='Kuro Games', fresh=''),
}
def packs(g):
    if g == 'mlbb':
        out = []
        for p in mlbb:
            if p['name']: out.append((p['name'], p['price'], True))
            else: out.append((f"{p['amt']+p['bonus']} {G[g]['unit']}" + (f" ({p['amt']}+{p['bonus']})" if p['bonus'] else ''), p['price'], False))
        out.sort(key=lambda x: (x[2], x[1]))
        return out
    out = []
    for p in games_data[g]['packs']:
        if p.get('name'): out.append((p['name'], p['price'], True))
        else: out.append((f"{p['amt']+p.get('bonus',0)} {G[g]['unit']}" + (f" ({p['amt']}+{p['bonus']})" if p.get('bonus') else ''), p['price'], False))
    out.sort(key=lambda x: (x[2], x[1])); return out
e = html.escape
def faq(g):
    d = G[g]; n = d['name']
    return [
     (f"Как пополнить {d['cur']} {n} в Кыргызстане?", f"Нажмите «Купить», введите {d['needs']}, выберите пакет и переведите сумму через Mbank или O!Банк. Затем отправьте чек в WhatsApp — {d['cur']} придут на аккаунт обычно за 5–10 минут."),
     (f"Какие способы оплаты {n} доступны?", "Оплата переводом через Mbank и O!Банк. Цены указаны в сомах, комиссий сверх цены пакета нет."),
     (f"Нужен ли пароль от аккаунта {n}?", f"Нет. Пароль не нужен и мы его никогда не просим: пополнение идёт по {d['needs']}. {d['idinfo']}"),
     ("Сколько ждать пополнения?", "Обычно 5–10 минут после проверки оплаты. Заказы с 00:00 до 08:00 по времени Бишкека зачисляются утром, оплатить можно в любое время."),
     ("Что делать, если пополнение не пришло?", "Напишите нам в WhatsApp с кодом заказа и чеком. Если пополнение невозможно (например, указан неверный ID), мы вернём деньги."),
    ]
CSS = """*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Nunito',system-ui,sans-serif;background:#F4F7FB;color:#101828;line-height:1.6}a{color:#0E7490}
.wrap{max-width:900px;margin:0 auto;padding:0 16px}nav{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(16,24,40,.12);flex-wrap:wrap;gap:8px}
.logo{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.4rem;color:#101828;text-decoration:none}.logo b{color:#0E7490}
nav .links a{margin-left:14px;text-decoration:none;font-size:.9rem;color:#566377}h1{font-family:'Rajdhani',sans-serif;font-size:clamp(1.7rem,5vw,2.5rem);line-height:1.15;margin:28px 0 10px}
h2{font-family:'Rajdhani',sans-serif;font-size:1.5rem;margin:30px 0 10px;color:#0E7490}p{margin:8px 0;color:#344054}.lead{font-size:1.05rem}
.btn{display:inline-block;background:#0E7490;color:#fff;font-weight:800;padding:13px 24px;border-radius:12px;text-decoration:none;margin:14px 10px 6px 0}.btn.s{background:transparent;color:#101828;border:1px solid #5B63F0}
table{width:100%;border-collapse:collapse;margin:10px 0;background:#fff;border-radius:12px;overflow:hidden}td,th{padding:10px 14px;text-align:left;border-bottom:1px solid rgba(16,24,40,.12)}th{color:#566377;font-size:.8rem;text-transform:uppercase}td.p{color:#0E7490;font-weight:800;white-space:nowrap}
ol{margin:8px 0 8px 22px;color:#344054}li{margin:6px 0}details{background:#fff;border-radius:12px;padding:12px 16px;margin:8px 0}summary{cursor:pointer;font-weight:700}details p{margin-top:8px}
.games{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin:10px 0}.games a{background:#fff;border:1px solid rgba(16,24,40,.12);border-radius:12px;padding:12px;text-decoration:none;color:#101828;font-weight:700}
footer{margin:40px 0 0;padding:24px 16px;border-top:1px solid rgba(16,24,40,.12);text-align:center;color:#566377;font-size:.85rem}.note{font-size:.85rem;color:#566377}"""
def page(g):
    d = dict(G[g]); slug = SLUG[g]; url = f"{BASE}/{slug}/"; ps = packs(g); fq = faq(g)
    lo = min(ps, key=lambda x: x[1]); hi = max(ps, key=lambda x: x[1]); fmt = lambda n: f"{n:,}".replace(',', ' ')
    d['title'] = d['title'].replace('{min}', fmt(lo[1]))
    fq.insert(1, (f"Сколько стоят {d['cur']} {d['name']} в Кыргызстане?",
        f"Цены в сомах: от {fmt(lo[1])} сом ({lo[0]}) до {fmt(hi[1])} сом ({hi[0]}). Оплата через Mbank и O!Банк, без дополнительных комиссий. Полный список цен — в таблице на этой странице."))
    rows = ''.join(f"<tr><td>{e(n)}</td><td class='p'>{pr:,} сом</td></tr>".replace(',', ' ') for n, pr, _ in ps)
    ld = [
     {"@context": "https://schema.org", "@type": "Service", "name": d['h1'], "serviceType": f"Пополнение {d['name']}", "description": d['desc'],
      "areaServed": {"@type": "Country", "name": "Kyrgyzstan"}, "provider": {"@type": "Organization", "name": "Diamond.kg", "url": BASE + "/"},
      "offers": {"@type": "AggregateOffer", "priceCurrency": "KGS", "lowPrice": min(p for _, p, _ in ps), "highPrice": max(p for _, p, _ in ps), "offerCount": len(ps)}},
     {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in fq]},
     {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Diamond.kg", "item": BASE + "/"},
        {"@type": "ListItem", "position": 2, "name": d['name'], "item": url}]},
    ]
    others = ''.join(f"<a href='/{SLUG[k]}/'>{G[k]['icon']} {e(G[k]['name'])}</a>" for k in G if k != g)
    intro = (f"Нужно пополнить {d['name']} в Кыргызстане и не хочется возиться с зарубежными картами? Здесь можно купить {d['cur']} за сомы: "
             f"переводом через Mbank или O!Банк. Пополнение идёт по {d['needs']}, пароль от аккаунта не нужен. {d['extra']}")
    body = f"""<h1>{e(d['h1'])}</h1>
<p class="lead">{e(intro)}</p>
<a class="btn" href="/?game={g}">{d['icon']} Пополнить {e(d['short'])}</a><a class="btn s" href="https://wa.me/996555920204" rel="noopener">💬 Вопрос в WhatsApp</a>
<h2>Цены на {e(d['cur'])} {e(d['name'])} в сомах</h2>
<table><tr><th>Пакет</th><th>Цена</th></tr>{rows}</table>
<p class="note">Цены в сомах, без дополнительных комиссий. Актуальные цены всегда на странице оформления заказа.</p>
<h2>Как пополнить {e(d['name'])}: 4 шага</h2>
<ol><li>Нажмите «Пополнить» и выберите нужный пакет.</li><li>Введите {e(d['needs'])}. {e(d['idinfo'])}</li><li>Переведите сумму через Mbank или O!Банк по реквизитам на странице оплаты.</li><li>Отправьте чек в WhatsApp — после проверки оплаты {e(d['cur'])} поступят на аккаунт, обычно за 5–10 минут.</li></ol>
<p>Заказы, оформленные с 00:00 до 08:00 по времени Бишкека, зачисляются утром. Оплатить можно в любое время.</p>
<h2>Почему выбирают Diamond.kg</h2>
<p>Оплата в сомах через Mbank и O!Банк, без зарубежной карты. Никаких паролей от аккаунта: нужен только {e(d['needs'])}. Заказ получает код, статус можно уточнить в WhatsApp. Если пополнение невозможно, возвращаем деньги.</p>
<h2>Частые вопросы</h2>
{''.join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in fq)}
<h2>Другие игры</h2><div class="games">{others}</div>
<p class="note" style="margin-top:20px">Diamond.kg — неофициальный сервис. Не связан с {e(d['dev'])}; все названия и товарные знаки принадлежат их владельцам.</p>"""
    return f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{e(d['title'])}</title>
<meta name="description" content="{e(d['desc'])}">
<meta name="keywords" content="{e(d['kw'])}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="{url}">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=4"><link rel="shortcut icon" href="/favicon.ico?v=4">
<meta property="og:type" content="website"><meta property="og:site_name" content="Diamond.kg"><meta property="og:locale" content="ru_RU">
<meta property="og:url" content="{url}"><meta property="og:title" content="{e(d['title'])}"><meta property="og:description" content="{e(d['desc'])}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="{e(d['title'])}"><meta name="twitter:description" content="{e(d['desc'])}">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Nunito:wght@400;700;800&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body>
<nav><a class="logo" href="/">💎 <b>Diamond</b>.kg</a><div class="links"><a href="/">Все игры</a><a href="/?game={g}">Пополнить</a></div></nav>
<main class="wrap">{body}</main>
<footer>© 2026 Diamond.kg · Пополнение игр в Кыргызстане · <a href="/">Главная</a></footer>
</body></html>"""
for g in G:
    os.makedirs(os.path.join(ROOT, SLUG[g]), exist_ok=True)
    open(os.path.join(ROOT, SLUG[g], 'index.html'), 'w', encoding='utf-8').write(page(g))
urls = [(BASE + '/', '1.0')] + [(f"{BASE}/{SLUG[g]}/", '0.9') for g in G]
sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(
    f"  <url>\n    <loc>{u}</loc>\n    <lastmod>{TODAY}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>{p}</priority>\n  </url>\n" for u, p in urls) + '</urlset>\n'
open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8').write(sm)
print('ok', list(SLUG.values()))
