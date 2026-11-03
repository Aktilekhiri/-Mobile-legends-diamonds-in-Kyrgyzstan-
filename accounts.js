/* Каталог аккаунтов MLBB — публичная страница (данные из Cloudflare Worker) */
(function () {
  var WA = '996555920204', TG = 'topupdiamondkg';
  var accounts = [], loaded = false, loading = false, failed = false, filter = 'all', cur = null, idx = 0;

  var T = {
    ru: {
      sellBtn: '💼 Продать аккаунт', buyBtn: '🛒 Купить аккаунт', chBtn: '📣 Наш канал',
      howH: 'Как работает гарант Diamond.kg',
      how: ['Продавец подаёт объявление и платит гарантию 200 сом.', 'Мы проверяем и публикуем объявление на сайте и в канале.', 'Покупатель платит гаранту (нам), продавец передаёт аккаунт, мы переводим деньги продавцу.'],
      sellH: 'Продать аккаунт через гаранта', game: 'Игра', ttl: 'Название объявления', ttlPh: 'Например: Mythic Glory, 120 скинов', prc: 'Цена, сом', dsc: 'Описание', dscPh: 'Ранг, уровень, герои, скины, что привязано к аккаунту', cnt: 'Контакт (WhatsApp или @username Telegram)', cntPh: '+996… или @username', phs: 'Фото аккаунта (1–6)', addPh: '＋ Добавить фото', next: 'Далее: гарантия 200 сом',
      payH: 'Гарантия 200 сом', payT: 'Переведите 200 сом через Mbank или O!Банк и приложите скриншот чека.', recv: 'Получатель', rcpt: 'Чек об оплате', send: 'Отправить на проверку', okH: 'Объявление отправлено ✅', okT: 'Мы проверим оплату гарантии и опубликуем объявление, обычно в течение нескольких часов. Когда найдётся покупатель, свяжемся с вами по указанному контакту.', working: 'Отправляем…', errPhoto: 'Добавьте хотя бы одно фото', errFile: 'Прикрепите чек (картинку)', gnote: 'Гарантия нужна, чтобы мы проверили объявление и провели сделку безопасно.', done: 'Готово',
      all: 'Все', available: 'В наличии', sold: 'Продан', avail_b: 'В наличии', sold_b: 'Продан',
      empty: 'Пока нет аккаунтов в этой категории.', soon: 'Каталог аккаунтов скоро откроется.',
      fail: 'Не удалось загрузить каталог. Обновите страницу или напишите в поддержку.', loading: 'Загружаем аккаунты…',
      more: 'Подробнее →', photos: 'фото', rank: 'Ранг', level: 'Уровень', heroes: 'Героев', skins: 'Скинов',
      price: 'Сом', buy: 'Купить в WhatsApp', tg: 'Написать в Telegram', close: 'Закрыть',
      note: 'Пишите — отвечаем быстро. Оплата Mbank или O!Банк. Укажите номер аккаунта №',
      soldline: 'Этот аккаунт уже продан. Напишите нам — подберём похожий.',
      msg: function (a) { return 'Здравствуйте! Хочу купить аккаунт MLBB №' + a.id + ': ' + a.title + ' — ' + a.price + ' Сом. (diamond.kg)'; },
      seoH: 'Купить аккаунт Mobile Legends в Кыргызстане',
      seo: ['Продажа аккаунтов MLBB (Mobile Legends: Bang Bang) в Бишкеке и по всему Кыргызстану. Реальные скриншоты, честное описание: ранг, уровень, количество героев и скинов.',
        'Как купить аккаунт млбб: выберите аккаунт, нажмите «Купить», напишите в WhatsApp или Telegram, оплатите через Mbank или O!Банк и получите данные. Купить аккаунт Мобайл Легендс недорого, быстро и безопасно.']
    },
    ky: {
      sellBtn: '💼 Аккаунт сатуу', buyBtn: '🛒 Аккаунт сатып алуу', chBtn: '📣 Биздин канал',
      howH: 'Diamond.kg кепилдиги кантип иштейт',
      how: ['Сатуучу жарнама берип, 200 сом кепилдик төлөйт.', 'Биз текшерип, жарнаманы сайтка жана каналга жарыялайбыз.', 'Сатып алуучу акчаны кепилдикке (бизге) төлөйт, сатуучу аккаунтту берет, биз акчаны сатуучуга которобуз.'],
      sellH: 'Аккаунтту кепилдик менен сатуу', game: 'Оюн', ttl: 'Жарнаманын аталышы', ttlPh: 'Мисалы: Mythic Glory, 120 скин', prc: 'Баасы, сом', dsc: 'Сүрөттөмө', dscPh: 'Даража, деңгээл, баатырлар, скиндер, аккаунтка эмне байланган', cnt: 'Байланыш (WhatsApp же Telegram @username)', cntPh: '+996… же @username', phs: 'Аккаунттун сүрөттөрү (1–6)', addPh: '＋ Сүрөт кошуу', next: 'Кийинки: 200 сом кепилдик',
      payH: '200 сом кепилдик', payT: '200 сомду Mbank же O!Банк аркылуу которуп, чектин скриншотун тиркеңиз.', recv: 'Алуучу', rcpt: 'Төлөм чеги', send: 'Текшерүүгө жөнөтүү', okH: 'Жарнама жөнөтүлдү ✅', okT: 'Кепилдик төлөмүн текшерип, жарнаманы жарыялайбыз, адатта бир нече саатта. Сатып алуучу табылганда көрсөтүлгөн байланыш аркылуу чогулабыз.', working: 'Жөнөтүлүүдө…', errPhoto: 'Жок дегенде бир сүрөт кошуңуз', errFile: 'Чекти (сүрөт) тиркеңиз', gnote: 'Кепилдик жарнаманы текшерип, бүтүмдү коопсуз өткөрүү үчүн керек.', done: 'Даяр',
      all: 'Баары', available: 'Бар', sold: 'Сатылган', avail_b: 'Бар', sold_b: 'Сатылган',
      empty: 'Бул категорияда азырынча аккаунт жок.', soon: 'Аккаунттар каталогу жакында ачылат.',
      fail: 'Каталог жүктөлгөн жок. Баракчаны жаңыртыңыз же колдоого жазыңыз.', loading: 'Аккаунттар жүктөлүүдө…',
      more: 'Кененирээк →', photos: 'сүрөт', rank: 'Даража', level: 'Деңгээл', heroes: 'Баатыр', skins: 'Скин',
      price: 'сом', buy: 'WhatsApp аркылуу сатып алуу', tg: 'Telegram аркылуу жазуу', close: 'Жабуу',
      note: 'Жазыңыз — тез жооп беребиз. Mbank же O!Деңги аркылуу төлөйсүз. Аккаунттун номерин жазыңыз №',
      soldline: 'Бул аккаунт сатылып кеткен. Бизге жазыңыз — окшошун тандап беребиз.',
      msg: function (a) { return 'Саламатсызбы! MLBB аккаунтун сатып алгым келет №' + a.id + ': ' + (a.title_ky || a.title) + ' — ' + a.price + ' сом. (diamond.kg)'; },
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
  function money(n) { return Number(n || 0).toLocaleString('ru-RU') + ' Сом'; }
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
    var h = '<div class="acc-actions"><button type="button" class="acc-act pri" data-sell>' + esc(s.sellBtn) + '</button><a class="acc-act" href="https://t.me/topupdiamondskg" target="_blank" rel="noopener">' + esc(s.chBtn) + '</a></div>' +
      '<div class="acc-how"><b>' + esc(s.howH) + '</b><ol>' + s.how.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></div>';
    h += '<div class="acc-filters" role="tablist">';
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


  /* ---- продажа аккаунта через гаранта ---- */
  var SELL_GAMES = ['MLBB', 'PUBG', 'Free Fire', 'Genshin', 'Brawl Stars', 'Другая игра'];
  var PAY_NUM = '+996 702 097 127', PAY_NAME = 'Актилек К.';
  var sell = null;
  function shrink(file) {
    return createImageBitmap(file).then(function (bmp) {
      var sc = Math.min(1, 1280 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
      c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      var type = 'image/webp', q = .85, b = null, tries = 0;
      function enc() { return new Promise(function (r) { c.toBlob(r, type, q); }); }
      return enc().then(function (t0) {
        if (!t0 || t0.type !== 'image/webp') type = 'image/jpeg';
        function loop() { return enc().then(function (x) { b = x; if (b && b.size > 380 * 1024 && tries++ < 7) { q -= .1; return loop(); } return b; }); }
        return loop();
      }).then(function (blob) { if (!blob || blob.size > 440 * 1024) throw new Error('big'); return blob; });
    });
  }
  function sellEl() {
    var m = document.getElementById('sellModal');
    if (!m) {
      m = document.createElement('div'); m.id = 'sellModal'; m.className = 'acc-modal'; document.body.appendChild(m);
      m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-sclose]')) closeSell(); });
      m.addEventListener('change', onSellChange);
      m.addEventListener('click', onSellClick);
    }
    return m;
  }
  function openSell() { sell = { step: 1, photos: [], busy: false, err: '', f: { game: 'MLBB', title: '', price: '', desc: '', contact: '' }, code: '', secret: '', up: 0, rcpt: null }; drawSell(); var m = sellEl(); m.classList.add('open'); m.scrollTop = 0; document.body.style.overflow = 'hidden'; }
  function closeSell() { var m = document.getElementById('sellModal'); if (m) m.classList.remove('open'); document.body.style.overflow = ''; }
  function readForm() {
    var m = document.getElementById('sellModal'), g = function (id) { var e = m.querySelector('#' + id); return e ? e.value : ''; };
    if (sell.step === 1) sell.f = { game: g('sGame'), title: g('sTitle'), price: g('sPrice'), desc: g('sDesc'), contact: g('sContact') };
  }
  function drawSell() {
    var m = sellEl(), s = t(), f = sell.f, h = '<div class="acc-sheet sell-sheet" role="dialog" aria-modal="true"><button type="button" class="acc-x" data-sclose aria-label="' + esc(s.close) + '">✕</button><div class="acc-info sell-in">';
    var dis = sell.busy ? ' disabled' : '';
    if (sell.step === 1) {
      h += '<h3>' + esc(s.sellH) + '</h3><div class="acc-how"><ol>' + s.how.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></div>' +
        '<label class="sf-l" for="sGame">' + esc(s.game) + '</label><select id="sGame" class="sf-i">' + SELL_GAMES.map(function (g) { return '<option' + (g === f.game ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select>' +
        '<label class="sf-l" for="sTitle">' + esc(s.ttl) + '</label><input id="sTitle" class="sf-i" maxlength="80" placeholder="' + esc(s.ttlPh) + '" value="' + esc(f.title) + '">' +
        '<label class="sf-l" for="sPrice">' + esc(s.prc) + '</label><input id="sPrice" class="sf-i" type="number" inputmode="numeric" min="100" value="' + esc(f.price) + '">' +
        '<label class="sf-l" for="sDesc">' + esc(s.dsc) + '</label><textarea id="sDesc" class="sf-i" rows="4" maxlength="1500" placeholder="' + esc(s.dscPh) + '">' + esc(f.desc) + '</textarea>' +
        '<label class="sf-l" for="sContact">' + esc(s.cnt) + '</label><input id="sContact" class="sf-i" maxlength="80" placeholder="' + esc(s.cntPh) + '" value="' + esc(f.contact) + '">' +
        '<div class="sf-l">' + esc(s.phs) + '</div><div class="sf-ph">' + sell.photos.map(function (p, i) { return '<div class="sf-th"><img src="' + p.url + '" alt=""><button type="button" data-delph="' + i + '" aria-label="✕">✕</button></div>'; }).join('') +
        (sell.photos.length < 6 ? '<label class="sf-add">' + esc(s.addPh) + '<input id="sFiles" type="file" accept="image/*" multiple hidden></label>' : '') + '</div>' +
        '<p class="acc-note">' + esc(s.gnote) + '</p>';
      h += (sell.err ? '<div class="sf-err" role="alert">' + esc(sell.err) + '</div>' : '') + '<button type="button" class="sf-go" data-go1' + dis + '>' + esc(sell.busy ? s.working : s.next) + '</button>';
    } else if (sell.step === 2) {
      h += '<h3>' + esc(s.payH) + '</h3><p class="acc-desc">' + esc(s.payT) + '</p><div class="sf-pay"><span>' + esc(s.recv) + '</span><b>' + PAY_NUM + '</b><span>' + PAY_NAME + ' · Mbank / O!Банк</span></div>' +
        '<label class="sf-l" for="sRcpt">' + esc(s.rcpt) + '</label><input id="sRcpt" class="sf-i" type="file" accept="image/*">' +
        (sell.err ? '<div class="sf-err" role="alert">' + esc(sell.err) + '</div>' : '') + '<button type="button" class="sf-go" data-go2' + dis + '>' + esc(sell.busy ? s.working : s.send) + '</button>';
    } else {
      h += '<h3>' + esc(s.okH) + '</h3><p class="acc-desc">' + esc(s.okT) + '</p><button type="button" class="sf-go" data-sclose>' + esc(s.done) + '</button>';
    }
    m.innerHTML = h + '</div></div>';
  }
  function onSellChange(e) {
    if (!sell) return;
    if (e.target.id === 'sFiles') {
      readForm(); var files = Array.prototype.slice.call(e.target.files); e.target.value = '';
      var chain = Promise.resolve();
      files.forEach(function (f) { chain = chain.then(function () { if (sell.photos.length >= 6) return; return shrink(f).then(function (b) { sell.photos.push({ blob: b, url: URL.createObjectURL(b) }); }).catch(function () { sell.err = 'Фото не удалось обработать'; }); }); });
      chain.then(drawSell);
    } else if (e.target.id === 'sRcpt') { sell.rcpt = e.target.files[0] || null; }
  }
  function onSellClick(e) {
    if (!sell) return;
    var d = e.target.closest('[data-delph]');
    if (d) { readForm(); sell.photos.splice(Number(d.getAttribute('data-delph')), 1); drawSell(); return; }
    if (e.target.closest('[data-go1]')) submit1();
    else if (e.target.closest('[data-go2]')) submit2();
  }
  function post(path, body, type) {
    return fetch(api() + path, { method: 'POST', headers: { 'Content-Type': type }, body: body }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Ошибка ' + r.status); return j; }); });
  }
  function submit1() {
    readForm(); var f = sell.f; sell.err = '';
    if (!f.title.trim() || f.title.trim().length < 3) sell.err = t().ttl + '?';
    else if (!(Number(f.price) >= 100)) sell.err = t().prc + ' (≥ 100)';
    else if (f.contact.trim().length < 5) sell.err = t().cnt + '?';
    else if (!sell.photos.length) sell.err = t().errPhoto;
    if (sell.err) { drawSell(); return; }
    sell.busy = true; drawSell();
    var p = sell.code ? Promise.resolve({ code: sell.code, secret: sell.secret }) :
      post('/api/market/offers', JSON.stringify({ game: f.game, title: f.title.trim(), price: Number(f.price), description: f.desc.trim(), contact: f.contact.trim() }), 'application/json');
    p.then(function (r) {
      sell.code = r.code; sell.secret = r.secret;
      var chain = Promise.resolve();
      sell.photos.slice(sell.up).forEach(function (ph) { chain = chain.then(function () { return post('/api/market/offers/' + sell.code + '/photos?s=' + sell.secret, ph.blob, ph.blob.type).then(function () { sell.up++; }); }); });
      return chain;
    }).then(function () { sell.step = 2; sell.busy = false; sell.err = ''; drawSell(); })
      .catch(function (e) { sell.busy = false; sell.err = e.message; drawSell(); });
  }
  function submit2() {
    if (!sell.rcpt) { sell.err = t().errFile; drawSell(); return; }
    sell.busy = true; sell.err = ''; drawSell();
    shrink(sell.rcpt).then(function (b) { return post('/api/market/offers/' + sell.code + '/receipt?s=' + sell.secret, b, b.type); })
      .then(function () { sell.step = 3; sell.busy = false; drawSell(); })
      .catch(function (e) { sell.busy = false; sell.err = e.message; drawSell(); });
  }

  function init() {
    var r = root(); if (!r) return;
    var m = document.createElement('div'); m.id = 'accModal'; m.className = 'acc-modal'; document.body.appendChild(m);
    r.addEventListener('click', function (e) {
      if (e.target.closest('[data-sell]')) { openSell(); return; }
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

  window.DKAccounts = { load: load, close: close, sell: openSell };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
