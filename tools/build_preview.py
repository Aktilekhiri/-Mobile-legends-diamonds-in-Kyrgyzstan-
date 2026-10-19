#!/usr/bin/env python3
"""Builds /index.html (noindex redesign preview) from the live index.html.
Prices, packages, payment code, order logic are copied byte-for-byte; only
decorative layers (intro, overlay, canvases, particles, tilt/magnetic) are
dropped and new/theme.css is added."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
s = (root/'index.html').read_text(encoding='utf-8')

def cut(pattern, repl='', flags=re.S, count=1):
    global s
    s, n = re.subn(pattern, repl, s, count=count, flags=flags)
    assert n >= 1, pattern
    return n

# --- head
cut(r'<meta name="robots" content="[^"]*">', '<meta name="robots" content="noindex, nofollow">')
cut(r'<link rel="canonical" href="https://diamond.kg/">', '<link rel="canonical" href="https://diamond.kg/new/">')
cut(r'<meta property="og:url" content="https://diamond.kg/">', '<meta property="og:url" content="https://diamond.kg/new/">')
# relative assets -> ../
for name in ['favicon-16.png','favicon-32.png','favicon-48.png','favicon-180.png','favicon.ico','accounts.css','api-config.js','accounts.js','script.js']:
    s = s.replace('"%s'%name, '"../%s'%name)
s = re.sub(r'(src|href)="(reviews/)', r'\1="../\2', s)
cut(r'(<link rel="stylesheet" href="\.\./accounts\.css\?v=1">)', r'\1\n<link rel="stylesheet" href="theme.css?v=1">')
cut(r'<body data-page="home">', '<body data-page="home" class="v2">')

# --- decorative layers
cut(r'<!-- IMPOSSIBLE DIAMOND: cinematic intro.*?(?=<div id="pageTransitionOverlay")')
cut(r'<div id="pageTransitionOverlay"[^>]*></div>\s*')
cut(r'<canvas id="particleCanvas"></canvas>\s*')
cut(r'(<div class="bg-(?:mesh|grid|aurora|gridfx|scan|noise)"[^>]*></div>\s*)+')

# --- particle IIFE + first enhancement script (intro/tilt/magnetic/burst/overlay)
cut(r'// Частицы\n\(function\(\) \{.*?\n  draw\(\);\n\}\)\(\);\n')
cut(r'<script>\n/\* =+\n   IMPOSSIBLE DIAMOND — presentation/animation layer only.*?</script>\n', '')

# --- hero: drop gem + canvas, regroup
m = re.search(r'<section class="hero">.*?</section>', s, re.S)
hero = m.group(0)
qb = re.search(r'<div class="quick-buy">.*?</button></div>', hero, re.S).group(0)
badge = re.search(r'<div class="hero-badge">.*?</div>', hero).group(0)
h1 = re.search(r'<h1>.*?</h1>', hero, re.S).group(0)
cta = re.search(r'<div class="hero-cta-group">.*?</div>', hero, re.S).group(0)
timer = re.search(r'<div class="hero-timer">.*?</div>', hero).group(0)
stats = re.search(r'<div class="hero-stats">.*</div></div></div>', hero).group(0)
new_hero = ('<section class="hero">\n    <div class="hero-copy">\n      %s\n      %s\n'
 '      <p class="hero-lead">Алмазы, UC и кристаллы за сомы · Оплата через Mbank и O!Банк</p>\n      %s\n    </div>\n'
 '    %s\n    %s\n    %s\n  </section>') % (badge, h1, cta, qb, timer, stats)
s = s.replace(hero, new_hero)
s = re.sub(r'<div class="disclaimer" style="[^"]*">', '<div class="disclaimer">', s, count=1)
s = s.replace('<section style="padding-bottom:72px"><div style="background:linear-gradient(135deg,rgba(46,125,237,.14),rgba(255,186,8,.07)); border-radius:22px; padding:46px 26px; text-align:center">',
              '<section class="final-cta"><div class="final-cta-box">')

# --- tiny nav scroll helper
s = s.replace('</body>', '''<script>
(function(){var n=document.querySelector('nav');if(!n)return;var t=false;
function f(){n.classList.toggle('nav-scrolled',(window.scrollY||0)>8);t=false}
window.addEventListener('scroll',function(){if(!t){t=true;requestAnimationFrame(f)}},{passive:true});f();})();
</script>
</body>''', 1)

(root/'new').mkdir(exist_ok=True)
(root/'new'/'index.html').write_text(s, encoding='utf-8')
print('ok', len(s))
