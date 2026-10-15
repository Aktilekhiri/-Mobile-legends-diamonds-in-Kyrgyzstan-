/* Каталог аккаунтов MLBB — публичная страница (данные из Cloudflare Worker) */
(function () {
  var WA = '996555920204', TG = 'topupdiamondkg';
  var accounts = [], loaded = false, loading = false, failed = false, filter = 'all', cur = null, idx = 0;

  var T = {
    ru: {
      all: 'Все', available: 'В наличии', sold: 'Продан', avail_b: 'В наличии', sold_b: 'Продан',
      empty: 'Пока нет аккаунтов в этой категории.', soon: 'Каталог аккаунтов скоро откроется.',
      fail: 'Не удалось загрузить каталог. Обновите страницу или напишите в поддержку.', loading: 'Загружаем аккаунты…',
      more: 'Подробнее →', photos: 'фото', rank: 'Ранг', level: 'Уровень', heroes: 'Героев', skins: 'Скинов',
      price: 'KGS', buy: 'Купить в WhatsApp', tg: 'Написать в Telegram', close: 'Закрыть',
      note: 'Пишите — отвечаем быстро. Оплата Mbank или O!Деньги. Укажите номер аккаунта №',
      soldline: 'Этот аккаунт уже продан. Напишите нам — подберём похожий.',
      msg: function (a) { return 'Здравствуйте! Хочу купить аккаунт MLBB №' + a.id + ': ' + a.title + ' — ' + a.price + ' KGS. (diamond.kg)'; },
      seoH: 'Купить аккаунт Mobile Legends в Кыргызстане',
      seo: ['Продажа аккаунтов MLBB (Mobile Legends: Bang Bang) в Бишкеке и по всему Кыргызстану. Реальные скриншоты, честное описание: ранг, уровень, количество героев и скинов.',
        'Как купить аккаунт млбб: выберите аккаунт, нажмите «Купить», напишите в WhatsApp или Telegram, оплатите через Mbank или O!Деньги и получите данные. Купить аккаунт Мобайл Легендс недорого, быстро и безопасно.']
    },
    ky: {
      all: 'Баары', available: 'Бар', sold: 'Сатылган', avail_b: 'Бар', sold_b: 'Сатылган',
      empty: 'Бул категорияда азырынча аккаунт жок.', soon: 'Аккаунттар каталогу жакында ачылат.',
      fail: 'Каталог жүктөлгөн жок. Баракчаны жаңыртыңыз же колдоого жазыңыз.', loading: 'Аккаунттар жүктөлүүдө…',
      more: 'Кененирээк →', photos: 'сүрөт', rank: 'Даража', level: 'Деңгээл', heroes: 'Баатыр', skins: 'Скин',
      price: 'KGS', buy: 'WhatsApp аркылуу сатып алуу', tg: 'Telegram аркылуу жазуу', close: 'Жабуу',
      note: 'Жазыңыз — тез жооп беребиз. Mbank же O!Деңги аркылуу төлөйсүз. Аккаунттун номерин жазыңыз №',
      soldline: 'Бул аккаунт сатылып кеткен. Бизге жазыңыз — окшошун тандап беребиз.',
      msg: function (a) { return 'Саламатсызбы! MLBB аккаунтун сатып алгым келет №' + a.id + ': ' + (a.title_ky || a.title) + ' — ' + a.price + ' KGS. (diamond.kg)'; },
      seoH: 'Кыргызстанда Mobile Legends аккаунтун сатып алуу',
      seo: ['Бишкекте жана бүт Кыргызстанда MLBB (Mobile Legends: Bang Bang) аккаунттарын сатуу. Чыныгы скриншоттор, так сүрөттөмө: даража, деңгээл, баатырлар жана скиндер саны.',
        'Млбб аккаунтун кантип сатып алуу керек: аккаунтту тандаңыз, «Сатып алуу» баскычын басыңыз, WhatsApp же Telegram аркылуу жазыңыз, Mbank же O!Деңги аркылуу төлөңүз жана маалыматты алыңыз. Мобайл Легендс аккаунтун арзан, тез жана коопсуз сатып алыңыз.']
    }
  };
  function lang() { try { return localStorage.getItem('lang') === 'ky' ? 'ky' : 'ru'; } catch (e) { return 'ru'; } }
  function t() { return T[lang()]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api() { return (window.DK_API || '').replace(/\/+$/, ''); }
  function img(id) { return api() + '/img/' + id; }
  function title(a) { return (lang() === 'ky' && a.title_ky) || a.title; }
  function desc(a) { return (lang() === 'ky' && a.description_ky) || a.description; }
  function seo(a) { return (lang() === 'ky' ? a.seo_ky : a.seo_ru) || ''; }
  function money(n) { return Number(n || 0).toLocaleString('ru-RU') + ' KGS'; }
  function root() { return document.getElementById('accountsRoot'); }

  function load() {
    var r = root(); if (!r) return;
    if (!api()) { r.innerHTML = '<div class="acc-msg">' + esc(t().soon) + '</div>'; return; }
    if (loaded || loading) { render(); return; }
    loading = true; failed = false; render();
    fetch(api() + '/api/accounts').then(function (x) { if (!x.ok) throw 0; return x.json(); })
      .then(function (d) { accounts = d.accounts || []; loaded = true; loading = false; render(); jsonld(); })
      .catch(function () { failed = true; loading = false; render(); });
  }

  function render() {
    var r = root(); if (!r) return;
    var s = t();
    if (loading) { r.innerHTML = '<div class="acc-msg">' + esc(s.loading) + '</div>'; return; }
    if (failed) { r.innerHTML = '<div class="acc-msg">' + esc(s.fail) + '</div>'; return; }
    var list = accounts.filter(function (a) { return filter === 'all' || a.status === filter; });
    var h = '<div class="acc-filters" role="tablist">';
    ['all', 'available', 'sold'].forEach(function (f) {
      h += '<button type="button" class="acc-chip' + (filter === f ? ' on' : '') + '" data-f="' + f + '">' + esc(s[f]) + '</button>';
    });
    h += '</div>';
    if (!list.length) h += '<div class="acc-empty">' + esc(s.empty) + '</div>';
    else {
      h += '<div class="acc-grid">';
      list.forEach(function (a) {
        var sold = a.status === 'sold';
        h += '<button type="button" class="acc-card' + (sold ? ' is-sold' : '') + '" data-id="' + a.id + '">' +
          '<div class="acc-cover">' +
          (a.photos.length ? '<img loading="lazy" src="' + img(a.photos[0]) + '" alt="' + esc(title(a)) + '">' : '<div class="acc-ph">🎮</div>') +
          '<span class="acc-badge' + (sold ? ' sold' : '') + '">' + esc(sold ? s.sold_b : s.avail_b) + '</span>' +
          (a.photos.length > 1 ? '<span class="acc-count">📷 ' + a.photos.length + '</span>' : '') +
          '</div><div class="acc-body"><h3 class="acc-title">' + esc(title(a)) + '</h3><div class="acc-tags">' +
          (a.rank ? '<span class="acc-tag">🏆 ' + esc(a.rank) + '</span>' : '') +
          (a.level ? '<span class="acc-tag">' + esc(s.level) + ' ' + a.level + '</span>' : '') +
          (a.heroes ? '<span class="acc-tag">🦸 ' + a.heroes + '</span>' : '') +
          (a.skins ? '<span class="acc-tag">🎭 ' + a.skins + '</span>' : '') +
          '</div><div class="acc-foot"><span class="acc-price">' + money(a.price) + '</span><span class="acc-more">' + esc(s.more) + '</span></div></div></button>';
      });
      h += '</div>';
    }
    h += '<div class="acc-seo"><h2>' + esc(s.seoH) + '</h2><p>' + esc(s.seo[0]) + '</p><p>' + esc(s.seo[1]) + '</p></div>';
    r.innerHTML = h;
  }

  function jsonld() {
    try {
      var old = document.getElementById('accountsLd'); if (old) old.remove();
      var items = accounts.filter(function (a) { return a.status === 'available'; }).map(function (a, i) {
        return {
          '@type': 'ListItem', position: i + 1,
          item: {
            '@type': 'Product', name: a.title, description: a.seo_ru || a.description || a.title,
            image: a.photos.length ? img(a.photos[0]) : undefined,
            offers: { '@type': 'Offer', priceCurrency: 'KGS', price: a.price, availability: 'https://schema.org/InStock' }
          }
        };
      });
      if (!items.length) return;
      var s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'accountsLd';
      s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Аккаунты Mobile Legends', itemListElement: items });
      document.head.appendChild(s);
    } catch (e) { }
  }

  /* ---- окно карточки ---- */
  function open(id) {
    cur = accounts.filter(function (a) { return a.id === id; })[0]; if (!cur) return;
    idx = 0; drawModal();
    var m = document.getElementById('accModal'); m.classList.add('open'); m.scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }
  function close() {
    var m = document.getElementById('accModal'); if (m) m.classList.remove('open');
    document.body.style.overflow = ''; cur = null;
  }
  function drawModal() {
    var m = document.getElementById('accModal'), a = cur, s = t(); if (!a) return;
    var ph = a.photos, sold = a.status === 'sold';
    var wa = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(s.msg(a));
    var tg = 'https://t.me/' + TG;
    var h = '<div class="acc-sheet" role="dialog" aria-modal="true" aria-label="' + esc(title(a)) + '">' +
      '<button type="button" class="acc-x" data-close aria-label="' + esc(s.close) + '">✕</button>';
    if (ph.length) {
      h += '<div class="acc-gal" id="accGal"><img id="accMain" src="' + img(ph[idx]) + '" alt="' + esc(title(a)) + '">' +
        (ph.length > 1 ? '<button type="button" class="acc-nav prev" data-nav="-1" aria-label="←">‹</button><button type="button" class="acc-nav next" data-nav="1" aria-label="→">›</button>' : '') + '</div>';
      if (ph.length > 1) {
        h += '<div class="acc-thumbs">';
        ph.forEach(function (p, i) { h += '<button type="button" data-th="' + i + '" class="' + (i === idx ? 'on' : '') + '"><img loading="lazy" src="' + img(p) + '" alt=""></button>'; });
        h += '</div>';
      }
    }
    h += '<div class="acc-info"><h3>' + esc(title(a)) + '</h3><div class="acc-price">' + money(a.price) + '</div><div class="acc-specs">' +
      (a.rank ? '<div class="acc-spec"><b>' + esc(a.rank) + '</b><span>' + esc(s.rank) + '</span></div>' : '') +
      (a.level ? '<div class="acc-spec"><b>' + a.level + '</b><span>' + esc(s.level) + '</span></div>' : '') +
      (a.heroes ? '<div class="acc-spec"><b>' + a.heroes + '</b><span>' + esc(s.heroes) + '</span></div>' : '') +
      (a.skins ? '<div class="acc-spec"><b>' + a.skins + '</b><span>' + esc(s.skins) + '</span></div>' : '') +
      '</div>';
    if (desc(a)) h += '<div class="acc-desc">' + esc(desc(a)) + '</div>';
    if (sold) h += '<div class="acc-soldline">' + esc(s.soldline) + '</div>';
    h += '<div class="acc-cta">' +
      (sold ? '' : '<a class="btn-wa" href="' + wa + '" target="_blank" rel="noopener">📲 ' + esc(s.buy) + '</a>') +
      '<a class="btn-tg" href="' + tg + '" target="_blank" rel="noopener">✈️ ' + esc(s.tg) + '</a></div>' +
      '<p class="acc-note">' + esc(s.note) + a.id + '</p>';
    if (seo(a)) h += '<p class="acc-seo-t">' + esc(seo(a)) + '</p>';
    h += '</div></div>';
    m.innerHTML = h;
  }
  function go(d) {
    if (!cur) return; var n = cur.photos.length; if (n < 2) return;
    idx = (idx + d + n) % n;
    var im = document.getElementById('accMain'); if (im) im.src = img(cur.photos[idx]);
    var th = document.querySelectorAll('#accModal .acc-thumbs button');
    for (var i = 0; i < th.length; i++) th[i].classList.toggle('on', i === idx);
  }

  function init() {
    var r = root(); if (!r) return;
    var m = document.createElement('div'); m.id = 'accModal'; m.className = 'acc-modal'; document.body.appendChild(m);
    r.addEventListener('click', function (e) {
      var c = e.target.closest('.acc-chip'); if (c) { filter = c.getAttribute('data-f'); render(); return; }
      var k = e.target.closest('.acc-card'); if (k) open(Number(k.getAttribute('data-id')));
    });
    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.closest('[data-close]')) { close(); return; }
      var n = e.target.closest('[data-nav]'); if (n) { go(Number(n.getAttribute('data-nav'))); return; }
      var th = e.target.closest('[data-th]'); if (th) { idx = Number(th.getAttribute('data-th')); go(0); drawModal(); }
    });
    var sx = null;
    m.addEventListener('touchstart', function (e) { if (e.target.closest('#accGal')) sx = e.touches[0].clientX; }, { passive: true });
    m.addEventListener('touchend', function (e) {
      if (sx == null) return; var dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener('keydown', function (e) {
      if (!cur) return;
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1);
    });
    /* смена языка: перерисовать каталог */
    document.addEventListener('click', function (e) {
      if (e.target.closest('.lang-toggle button')) setTimeout(function () { render(); if (cur) drawModal(); }, 60);
    });
  }

  window.DKAccounts = { load: load, close: close };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
