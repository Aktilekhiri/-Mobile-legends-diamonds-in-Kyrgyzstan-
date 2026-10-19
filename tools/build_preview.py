#!/usr/bin/env python3
"""Builds the noindex preview /new/ from the live index.html + theme.css + tools/topup_v2.css.
Live files are never modified. Promote by copying new/theme.css -> theme.css and
applying the same markup transforms to index.html (see promote step)."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
s = (root/'index.html').read_text(encoding='utf-8')
def sub(pat, rep, flags=re.S):
    global s
    s, n = re.subn(pat, rep, s, count=1, flags=flags); assert n, pat
sub(r'<meta name="robots" content="[^"]*">', '<meta name="robots" content="noindex, nofollow">')
sub(r'<link rel="canonical" href="https://diamond.kg/">', '<link rel="canonical" href="https://diamond.kg/new/">')
for name in ['favicon-16.png','favicon-32.png','favicon-48.png','favicon-180.png','favicon.ico','accounts.css','api-config.js','accounts.js','script.js']:
    s = s.replace('"%s'%name, '"../%s'%name)
s = re.sub(r'(src|href)="(reviews/)', r'\1="../\2', s)
# wrap selected-info + buy button into a sticky bar
sub(r'(<div class="sel-info" id="selectedInfo".*?</div></div>\s*<button class="btn-primary btn-full" onclick="proceedToPayment\(\)" id="buyBtn".*?</button>)',
    r'<div class="buy-bar">\n      \1\n      </div>')
# keyboard access for package cards
s = s.replace('</body>', '''<script>
(function(){var g=document.getElementById('packagesGrid');if(!g)return;
function fix(){g.querySelectorAll('.pkg-card:not([aria-disabled])').forEach(function(c){if(c.tabIndex>=0&&c.getAttribute('role'))return;c.setAttribute('role','button');c.tabIndex=0;});}
new MutationObserver(fix).observe(g,{childList:true});fix();
g.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&e.target.classList.contains('pkg-card')){e.preventDefault();e.target.click();}});})();
</script>
</body>''', 1)
(root/'new').mkdir(exist_ok=True)
(root/'new'/'index.html').write_text(s, encoding='utf-8')
(root/'new'/'theme.css').write_text((root/'theme.css').read_text()+(root/'tools'/'topup_v2.css').read_text(), encoding='utf-8')
sub_css = (root/'new'/'index.html').read_text().replace('href="theme.css?v=1"','href="theme.css?v=2"')
(root/'new'/'index.html').write_text(sub_css, encoding='utf-8')
print('ok')
