// ИИ-чат Diamond.kg: плавающее окно, приём заказа в диалоге. Включается, когда на сервере задан ключ ИИ.
(function () {
  var API = String(window.DK_API || '').replace(/\/+$/, '');
  if (!API) return;
  var KEY = 'dkChat2', msgs = [], busy = false, sid = '', polls = {}, root, box, input, sendBtn, fab;

  function load() { try { var d = JSON.parse(sessionStorage.getItem(KEY) || '{}'); msgs = d.msgs || []; sid = d.sid || ''; } catch (e) {} if (!sid) sid = String(Math.floor(Math.random() * 1e9)); }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ msgs: msgs.slice(-40), sid: sid })); } catch (e) {} }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function scroll() { box.scrollTop = box.scrollHeight; }

  function bubble(role, text) {
    var b = el('div', 'dkc-m ' + (role === 'user' ? 'me' : 'bot'));
    b.innerHTML = esc(text).replace(/\n/g, '<br>');
    box.appendChild(b); scroll(); return b;
  }
  function card(html) { var c = el('div', 'dkc-card', html); box.appendChild(c); scroll(); return c; }

  function copy(t, btn) { try { navigator.clipboard.writeText(t); var o = btn.textContent; btn.textContent = 'Скопировано'; setTimeout(function () { btn.textContent = o; }, 1500); } catch (e) {} }

  function compress(file) {
    return new Promise(function (res, rej) {
      if (file.size < 1300 * 1024 && /jpeg|png|webp/.test(file.type)) return res(file);
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, 1400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { URL.revokeObjectURL(url); b ? res(b) : rej(); }, 'image/jpeg', 0.8);
      };
      img.onerror = function () { rej(); }; img.src = url;
    });
  }

  function showAction(a) {
    if (a.type === 'pay') {
      var c = card('<b>Заказ ' + esc(a.id) + '</b><br>' + esc(a.label) + ' · ' + money(a.amount) + ' сом<br><a class="dkc-btn" target="_blank" rel="noopener" href="' + esc(a.url) + '">⚡ Оплатить ' + money(a.amount) + ' сом</a><div class="dkc-sub">Выберите банк или отсканируйте QR. Заказ выдастся сам после оплаты.</div>');
      watch(a);
    } else if (a.type === 'receipt') {
      var c2 = card('<b>Заказ ' + esc(a.id) + '</b><br>' + esc(a.label) + '<br>Переведите <b>' + money(a.amount) + ' сом</b> через Mbank или O!Банк на номер:<br><b class="dkc-num">' + esc(a.num) + '</b> (' + esc(a.name) + ') <button type="button" class="dkc-cp">Копировать</button><div class="dkc-sub">Затем приложите скриншот чека:</div><label class="dkc-btn">📎 Прикрепить чек<input type="file" accept="image/*" hidden></label><div class="dkc-st"></div>');
      c2.querySelector('.dkc-cp').onclick = function () { copy(a.num.replace(/\s/g, ''), this); };
      var st = c2.querySelector('.dkc-st');
      c2.querySelector('input').onchange = function () {
        var f = this.files && this.files[0]; if (!f) return;
        st.textContent = 'Отправляю чек…';
        compress(f).then(function (b) {
          return fetch(API + '/api/orders/' + a.id + '/receipt', { method: 'POST', headers: { 'Content-Type': b.type || 'image/jpeg' }, body: b });
        }).then(function (r) {
          if (r.ok) { st.textContent = '✅ Чек получен. Проверяем оплату, обычно 1–5 минут.'; watch(a); return; }
          return r.json().then(function (j) { st.textContent = '⚠️ ' + (j.error || 'Чек не принят'); });
        }).catch(function () { st.textContent = '⚠️ Чек не загрузился, попробуйте ещё раз.'; });
      };
    }
  }

  // следим за заказом и сами пишем, когда он выдан
  function watch(a) {
    if (polls[a.id]) return;
    var n = 0;
    polls[a.id] = setInterval(function () {
      if (++n > 720) { clearInterval(polls[a.id]); return; }
      fetch(API + '/api/orders/' + a.id + '?s=' + encodeURIComponent(a.secret || '')).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d) return;
        if (d.status === 'delivered') {
          clearInterval(polls[a.id]);
          var t = '✅ Доставка завершена! Заказ ' + a.id + ' (' + a.label + ') выполнен. Спасибо за покупку!';
          bubble('assistant', t); msgs.push({ role: 'assistant', content: t }); save();
          if (d.delivery) {
            var code = String(d.delivery).split('\n').filter(Boolean).join('\n');
            var c = card('Ваш код:<br><b class="dkc-num">' + esc(code).replace(/\n/g, '<br>') + '</b> <button type="button" class="dkc-cp">Копировать</button><div class="dkc-sub">Сохраните код сразу (скриншот).</div>');
            c.querySelector('.dkc-cp').onclick = function () { copy(code, this); };
          }
        } else if (['cancelled', 'refunded', 'refund_due'].indexOf(d.status) >= 0) {
          clearInterval(polls[a.id]);
          var t2 = 'Заказ ' + a.id + ' отменён' + (d.status === 'cancelled' ? '' : ', деньги вернём') + '. Если нужна помощь, напишите сюда.';
          bubble('assistant', t2); msgs.push({ role: 'assistant', content: t2 }); save();
        }
      }).catch(function () {});
    }, 5000);
  }

  // ===== сценарий заказа (без ИИ: быстро и предсказуемо) =====
  var SHOP = [], PAY = '', AI = false, S = { step: 'menu' };
  var QUICK = ['mlbb', 'tgstars', 'roblox', 'pubg', 'freefire', 'tgpremium'];
  var ALIAS = { global: 'млбб mlbb mobile legends мобайл легенд алмазы', russia: 'россия russia мл ру', indonesia: 'индонезия indonesia индо', pubg: 'пубг пабг pubg uc', freefire: 'фри фаер фф free fire', hok: 'хок honor of kings', genshin: 'геншин genshin', wuwa: 'wuthering waves вува', hsr: 'honkai star rail хср', zzz: 'zenless зенлесс', tgstars: 'звезды звёзды stars телеграм старс', tgpremium: 'премиум premium', roblox: 'роблокс roblox робукс robux', mchess: 'magic chess мэджик', deltaforce: 'delta force', marvel: 'marvel rivals', whiteout: 'whiteout survival вайтаут', lords: 'lords mobile лордс', identityv: 'identity v', fortnite: 'fortnite фортнайт', arena: 'arena breakout', bloodstrike: 'blood strike' };
  function gameById(id) { return SHOP.filter(function (g) { return g.id === id; })[0]; }
  function findGame(t) {
    t = t.toLowerCase().replace(/ё/g, 'е');
    var best = null;
    SHOP.forEach(function (g) { var words = ((ALIAS[g.id] || '') + ' ' + g.name).toLowerCase().replace(/ё/g, 'е').split(/\s+/); words.forEach(function (w) { if (w.length > 2 && t.indexOf(w) >= 0 && (!best || w.length > best.l)) best = { g: g, l: w.length }; }); });
    return best && best.g;
  }
  function chips(list) {
    var c = el('div', 'dkc-chips');
    list.forEach(function (x) { var b = el('button', '', esc(x.t)); b.type = 'button'; b.onclick = function () { c.remove(); say(x.t, true); x.f(); }; c.appendChild(b); });
    box.appendChild(c); scroll(); return c;
  }
  function say(t, me) { bubble(me ? 'user' : 'assistant', t); msgs.push({ role: me ? 'user' : 'assistant', content: t }); save(); }
  function menu() {
    S = { step: 'menu' };
    var l = QUICK.map(function (id) { var g = gameById(id === 'mlbb' ? 'global' : id); return g ? { t: id === 'mlbb' ? 'Mobile Legends' : g.name, f: function () { pickGame(g); } } : null; }).filter(Boolean);
    l.push({ t: 'Другие игры', f: allGames }); l.push({ t: 'Статус заказа', f: askStatus });
    chips(l);
  }
  function allGames() {
    say('Выберите игру или сервис:');
    chips(SHOP.map(function (g) { return { t: g.name, f: function () { pickGame(g); } }; }));
  }
  function pickGame(g) {
    S = { step: 'pack', g: g.id, page: 0 };
    if (g.id === 'global' || g.id === 'russia') S.mlbbPick = true;
    showPacks();
  }
  var PAGE = 8;
  function showPacks() {
    var g = gameById(S.g), from = S.page * PAGE, list = g.packs.slice(from, from + PAGE);
    say(g.name + ': выберите пакет' + (g.packs.some(function (p) { return p.first; }) ? ' (⚠️ «первое пополнение» подходит, только если аккаунт ещё не пополнялся)' : '') + '.');
    var l = list.map(function (p, i) { return { t: (p.first ? '⚠️ ' : '') + p.l + ' · ' + money(p.p) + ' сом', f: function () { S.pi = from + i; askId(); } }; });
    if (from + PAGE < g.packs.length) l.push({ t: 'Ещё пакеты ›', f: function () { S.page++; showPacks(); } });
    if (S.page > 0) l.push({ t: '‹ Назад', f: function () { S.page--; showPacks(); } });
    l.push({ t: '« В начало', f: function () { say('Что нужно пополнить?'); menu(); } });
    chips(l);
  }
  function askId() {
    var g = gameById(S.g), p = g.packs[S.pi]; S.step = 'id';
    if (g.none) { S.pid = ''; S.srv = ''; return askPhone(); }
    say('Вы выбрали: ' + p.l + ' · ' + money(p.p) + ' сом.\n' + (g.user ? 'Напишите ваш Telegram @username (Настройки → Имя пользователя):' : g.mlbb ? 'Напишите ID и Zone ID одним сообщением, например: 123456789 1234 (числа в скобках рядом с ID в профиле).' : g.zone ? 'Напишите ID игрока и Server ID одним сообщением (через пробел).' : 'Напишите ID игрока (только цифры).' + (g.servers ? ' Затем выберете сервер.' : '')));
  }
  function digits(s) { return String(s).replace(/\D/g, ''); }
  function onId(t) {
    var g = gameById(S.g);
    if (g.user) { var u = t.replace(/^@/, '').trim(); if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(u)) return say('Проверьте @username: 5–32 символа, латиница, цифры и _. Напишите ещё раз.'); S.pid = '@' + u; S.srv = ''; return askPhone(); }
    var parts = t.match(/\d+/g) || [], pid = parts[0] || '';
    if (g.mlbb) {
      var z = parts[1] || '';
      if (pid.length < 6 || pid.length > 10 || z.length < 3 || z.length > 5) return say('Нужны ID (6–10 цифр) и Zone ID (3–5 цифр) через пробел, например: 123456789 1234. Напишите ещё раз.');
      S.pid = pid; S.srv = z; return askPhone();
    }
    if (pid.length < 5 || pid.length > 25) return say('Проверьте ID: только цифры, 5–25 знаков. Напишите ещё раз.');
    S.pid = pid;
    if (g.servers) { S.step = 'server'; say('Выберите сервер:'); return chips(g.servers.map(function (x) { return { t: x.l, f: function () { S.srv = x.v; askPhone(); } }; })); }
    if (g.zone) { var z2 = parts[1] || ''; if (z2.length < 3 || z2.length > 8) { S.step = 'zone'; return say('Теперь напишите Server ID (3–5 цифр).'); } S.srv = z2; return askPhone(); }
    S.srv = ''; askPhone();
  }
  function askPhone() { S.step = 'phone'; say('Напишите номер телефона (например 700 123 456), чтобы мы могли связаться, если заказ придётся вернуть. Можно пропустить.'); chips([{ t: 'Пропустить', f: function () { S.phone = ''; summary(); } }]); }
  function summary() {
    var g = gameById(S.g), p = g.packs[S.pi]; S.step = 'confirm';
    var srv = S.srv && g.servers ? ((g.servers.filter(function (x) { return x.v === S.srv; })[0] || {}).l || S.srv) : S.srv;
    say('Проверьте заказ:\nИгра: ' + g.name + '\nПакет: ' + p.l + '\n' + (g.none ? '' : (g.user ? 'Username: ' : 'ID: ') + S.pid + '\n') + (srv ? 'Сервер/Zone: ' + srv + '\n' : '') + (S.phone ? 'Телефон: ' + S.phone + '\n' : '') + 'Сумма: ' + money(p.p) + ' сом' + (p.first ? '\n⚠️ Пакет только для первого пополнения аккаунта.' : '') + '\nПосле зачисления на указанный ID возврат невозможен, проверьте данные.');
    chips([{ t: '✅ Всё верно', f: function () { choosePay(); } }, { t: '✏️ Изменить ID', f: function () { askId(); } }, { t: 'Отмена', f: function () { say('Отменено. Что нужно пополнить?'); menu(); } }]);
  }
  function choosePay() {
    if (PAY) return place('qr');
    say('Оплата сейчас недоступна. Оформите заказ на сайте или напишите в WhatsApp +996 555 920 204.'); menu();
  }
  function place(how) {
    var g = gameById(S.g), p = g.packs[S.pi]; S.step = 'placing';
    var h = { 'Content-Type': 'application/json' };
    try { var u = JSON.parse(localStorage.getItem('dk_user') || 'null'); if (u && u.token) h.Authorization = 'Bearer ' + u.token; } catch (e) {}
    var url = API + '/api/orders' + (how === 'qr' ? '/' + PAY : '');
    fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ region: g.region, pkg: p.k, pkgLabel: p.l, price: p.p, phone: S.phone, playerId: S.pid, serverId: S.srv, method: how === 'qr' ? 'QR (чат)' : 'Mbank/O!Банк (чат)', deferNotify: how !== 'qr' }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { say('⚠️ ' + (x.j.error || 'Не получилось оформить заказ') + '. Проверьте данные.'); S.step = 'id'; return chips([{ t: '✏️ Изменить ID', f: askId }, { t: 'В начало', f: menu }]); }
        var j = x.j;
        if (how === 'qr') showAction({ type: 'pay', id: j.id, secret: j.secret, url: j.url, label: p.l, amount: p.p });
        else showAction({ type: 'receipt', id: j.id, secret: j.secret, label: p.l, amount: p.p, num: '', name: '' });
        say('Заказ ' + j.id + ' создан. Когда он будет выполнен, я напишу здесь.');
        S = { step: 'menu' }; chips([{ t: 'Новый заказ', f: function () { say('Что нужно пополнить?'); menu(); } }]);
      }).catch(function () { say('Нет связи с сервером. Попробуйте ещё раз.'); S.step = 'confirm'; chips([{ t: 'Повторить', f: function () { place(how); } }]); });
  }
  function askStatus() { S = { step: 'status' }; say('Напишите код заказа (например DK-1042):'); }
  function onStatus(t) {
    var id = t.toUpperCase().replace(/[^A-Z0-9]/g, ''), nm = id.match(/^(?:DK)?(\d{3,7})$/); if (nm) id = 'DK-' + nm[1];
    if (id.length < 5) return say('Не похоже на код заказа. Он начинается с DK. Напишите ещё раз.');
    var L = { new: 'ожидает оплаты', manual: 'ожидает проверки оплаты', processing: 'выполняется', delivered: 'выполнен ✅', cancelled: 'отменён', refunded: 'деньги возвращены', refund_due: 'готовится возврат' };
    fetch(API + '/api/orders/' + id).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      say(d ? 'Заказ ' + id + ': ' + (L[d.status] || d.status) + '.' : 'Заказ не найден. Проверьте код.'); S = { step: 'menu' }; menu();
    }).catch(function () { say('Нет связи. Попробуйте позже.'); });
  }
  function ask(text) {   // свободный вопрос: быстрый ИИ без права оформлять заказ
    if (!AI) { say('Выберите вариант из кнопок или напишите в WhatsApp +996 555 920 204.'); return menu(); }
    busy = true; sendBtn.disabled = true;
    var typing = bubble('assistant', '…'); typing.classList.add('typing');
    var ctrl = new AbortController(), tm = setTimeout(function () { ctrl.abort(); }, 25000);
    fetch(API + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs.slice(-8).filter(function (m) { return typeof m.content === 'string'; }), sid: sid }), signal: ctrl.signal })
      .then(function (r) { return r.json(); })
      .then(function (j) { typing.remove(); say(j.reply || j.error || 'Не получилось ответить.'); })
      .catch(function () { typing.remove(); say('Не получилось ответить. Напишите в WhatsApp +996 555 920 204.'); })
      .then(function () { clearTimeout(tm); busy = false; sendBtn.disabled = false; menu(); });
  }
  function send(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    input.value = ''; say(text, true);
    var old = box.querySelectorAll('.dkc-chips'); for (var i = 0; i < old.length; i++) old[i].remove();
    if (S.step === 'id') return onId(text);
    if (S.step === 'zone') { var z = digits(text); if (z.length < 3 || z.length > 8) return say('Server ID: 3–5 цифр. Напишите ещё раз.'); S.srv = z; return askPhone(); }
    if (S.step === 'phone') { if (/^(пропустить|нет|не надо|skip)/i.test(text)) { S.phone = ''; return summary(); } var d = digits(text); if (d.length < 9 || d.length > 13) return say('Проверьте номер: 9 цифр, например 700 123 456.'); S.phone = d.slice(-9); return summary(); }
    if (S.step === 'status') return onStatus(text);
    if (S.step === 'confirm') { if (/^(да|верно|все верно|всё верно|ок|ok|yes)/i.test(text)) return choosePay(); say('Нажмите «✅ Всё верно» или «Отмена».'); return summary(); }
    if (S.step === 'pack') { say('Выберите пакет кнопкой ниже.'); return showPacks(); }
    var g = findGame(text);
    if (g) return pickGame(g);
    if (/статус|заказ\s*dk|dk\d/i.test(text)) { var m = text.match(/dk-?\d{3,7}|dk[a-z0-9]{8}/i) || text.match(/(?:^|\s)(\d{4,7})(?:\s|$)/); return m ? onStatus(m[0]) : askStatus(); }
    if (/когда|срок|долго|сколько (ждать|времени)/i.test(text)) { say('Обычно 1–5 минут после проверки оплаты, максимум 3 дня. Как только заказ выполнится, я напишу здесь.'); return menu(); }
    ask(text);
  }

  function build() {
    var css = '#dkc-fab{position:fixed;right:16px;bottom:88px;z-index:300;width:56px;height:56px;border-radius:50%;border:0;background:linear-gradient(135deg,#22d3ee,#6366f1);color:#fff;font-size:26px;box-shadow:0 6px 20px rgba(30,40,100,.35);cursor:pointer}' +
      '#dkc{position:fixed;right:16px;bottom:88px;z-index:310;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 120px));background:var(--surface,#fff);color:var(--text,#101828);border:1px solid rgba(127,140,170,.3);border-radius:18px;box-shadow:0 12px 40px rgba(10,20,60,.35);display:none;flex-direction:column;overflow:hidden;font-family:Nunito,system-ui,sans-serif}' +
      '#dkc.open{display:flex}#dkc header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:linear-gradient(135deg,#22d3ee,#6366f1);color:#fff;font-weight:800}#dkc header button{background:none;border:0;color:#fff;font-size:22px;cursor:pointer}' +
      '.dkc-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}.dkc-m{max-width:86%;padding:9px 12px;border-radius:14px;font-size:.93rem;line-height:1.45;word-wrap:break-word}.dkc-m.bot{background:rgba(127,140,170,.16);align-self:flex-start}.dkc-m.me{background:#4f6df5;color:#fff;align-self:flex-end}.dkc-m.typing{opacity:.6}' +
      '.dkc-card{align-self:stretch;border:1px solid rgba(127,140,170,.35);border-radius:14px;padding:11px;font-size:.9rem;line-height:1.5}.dkc-sub{font-size:.8rem;opacity:.75;margin-top:6px}.dkc-num{font-size:1.05rem;letter-spacing:.3px}' +
      '.dkc-btn{display:inline-block;margin-top:8px;padding:9px 14px;border-radius:12px;background:linear-gradient(135deg,#22d3ee,#6366f1);color:#fff!important;font-weight:800;text-decoration:none;cursor:pointer}.dkc-cp{border:1px solid rgba(127,140,170,.5);background:transparent;color:inherit;border-radius:8px;padding:2px 8px;font-size:.78rem;cursor:pointer}.dkc-st{margin-top:6px;font-size:.85rem}' +
      '.dkc-chips{align-self:stretch;display:flex;gap:6px;flex-wrap:wrap;padding:2px 0 4px}.dkc-chips button{border:1px solid rgba(127,140,170,.45);background:transparent;color:inherit;border-radius:999px;padding:6px 11px;font-size:.82rem;cursor:pointer}' +
      '.dkc-in{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(127,140,170,.25)}.dkc-in input{flex:1;min-width:0;border:1px solid rgba(127,140,170,.45);background:transparent;color:inherit;border-radius:12px;padding:10px 12px;font-size:16px}.dkc-in button{border:0;border-radius:12px;padding:0 14px;background:#4f6df5;color:#fff;font-weight:800;cursor:pointer}.dkc-in button:disabled{opacity:.5}' +
      '@media(max-width:600px){#dkc{right:8px;left:8px;width:auto;bottom:8px;height:calc(100vh - 16px);height:calc(100dvh - 16px)}}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    fab = el('button', '', '💬'); fab.id = 'dkc-fab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Чат с помощником');
    root = el('div'); root.id = 'dkc'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Чат с помощником Diamond.kg');
    root.innerHTML = '<header><span>💎 Помощник Diamond.kg</span><button type="button" aria-label="Закрыть">×</button></header><div class="dkc-body"></div><form class="dkc-in"><input type="text" maxlength="500" placeholder="Напишите, что нужно пополнить" autocomplete="off"><button type="submit">➤</button></form>';
    document.body.appendChild(fab); document.body.appendChild(root);
    box = root.querySelector('.dkc-body'); input = root.querySelector('input'); sendBtn = root.querySelector('.dkc-in button');
    root.querySelector('form').onsubmit = function (e) { e.preventDefault(); send(input.value); };
    root.querySelector('header button').onclick = function () { root.classList.remove('open'); fab.style.display = ''; };
    fab.onclick = function () { root.classList.add('open'); fab.style.display = 'none'; input.focus(); scroll(); };
    load();
    if (msgs.length > 24) msgs = msgs.slice(-12);
    msgs.forEach(function (m) { bubble(m.role, m.content); });
    say(msgs.length ? 'Чем ещё помочь?' : 'Здравствуйте! Я помощник Diamond.kg. Что нужно пополнить? Выберите кнопку или напишите, например: «звёзды телеграм» или «алмазы».');
    menu();
  }

  Promise.all([fetch(API + '/api/chat/status').then(function (r) { return r.json(); }), fetch(API + '/api/chat/catalog').then(function (r) { return r.json(); })])
    .then(function (a) { if (!a[0] || !a[0].enabled || !a[1] || !a[1].shop) return; PAY = a[0].pay || ''; AI = !!a[0].ai; SHOP = a[1].shop; build(); }).catch(function () {});
})();
