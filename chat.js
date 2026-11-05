// ИИ-чат Diamond.kg: плавающее окно, приём заказа в диалоге. Включается, когда на сервере задан ключ ИИ.
(function () {
  var API = String(window.DK_API || '').replace(/\/+$/, '');
  if (!API) return;
  var KEY = 'dkChat1', msgs = [], busy = false, sid = '', polls = {}, root, box, input, sendBtn, fab;

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
          if (r.ok) { st.textContent = '✅ Чек получен. Проверяем оплату, обычно 5–10 минут.'; watch(a); return; }
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

  function send(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    busy = true; sendBtn.disabled = true; input.value = '';
    bubble('user', text); msgs.push({ role: 'user', content: text }); save();
    var typing = bubble('assistant', '…'); typing.classList.add('typing');
    var ctrl = new AbortController(), tm = setTimeout(function () { ctrl.abort(); }, 40000);
    var h = { 'Content-Type': 'application/json' };
    try { var u = JSON.parse(localStorage.getItem('dk_user') || 'null'); if (u && u.token) h.Authorization = 'Bearer ' + u.token; } catch (e) {}
    fetch(API + '/api/chat', { method: 'POST', headers: h, body: JSON.stringify({ messages: msgs.slice(-14), sid: sid }), signal: ctrl.signal })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        typing.remove();
        var reply = x.ok ? x.j.reply : (x.j.error || 'Не получилось ответить');
        bubble('assistant', reply); msgs.push({ role: 'assistant', content: reply }); save();
        (x.j.actions || []).forEach(showAction);
      })
      .catch(function () { typing.remove(); bubble('assistant', 'Нет связи. Попробуйте ещё раз.'); })
      .then(function () { clearTimeout(tm); busy = false; sendBtn.disabled = false; input.focus(); });
  }

  function build() {
    var css = '#dkc-fab{position:fixed;right:16px;bottom:88px;z-index:300;width:56px;height:56px;border-radius:50%;border:0;background:linear-gradient(135deg,#22d3ee,#6366f1);color:#fff;font-size:26px;box-shadow:0 6px 20px rgba(30,40,100,.35);cursor:pointer}' +
      '#dkc{position:fixed;right:16px;bottom:88px;z-index:310;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 120px));background:var(--surface,#fff);color:var(--text,#101828);border:1px solid rgba(127,140,170,.3);border-radius:18px;box-shadow:0 12px 40px rgba(10,20,60,.35);display:none;flex-direction:column;overflow:hidden;font-family:Nunito,system-ui,sans-serif}' +
      '#dkc.open{display:flex}#dkc header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:linear-gradient(135deg,#22d3ee,#6366f1);color:#fff;font-weight:800}#dkc header button{background:none;border:0;color:#fff;font-size:22px;cursor:pointer}' +
      '.dkc-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}.dkc-m{max-width:86%;padding:9px 12px;border-radius:14px;font-size:.93rem;line-height:1.45;word-wrap:break-word}.dkc-m.bot{background:rgba(127,140,170,.16);align-self:flex-start}.dkc-m.me{background:#4f6df5;color:#fff;align-self:flex-end}.dkc-m.typing{opacity:.6}' +
      '.dkc-card{align-self:stretch;border:1px solid rgba(127,140,170,.35);border-radius:14px;padding:11px;font-size:.9rem;line-height:1.5}.dkc-sub{font-size:.8rem;opacity:.75;margin-top:6px}.dkc-num{font-size:1.05rem;letter-spacing:.3px}' +
      '.dkc-btn{display:inline-block;margin-top:8px;padding:9px 14px;border-radius:12px;background:linear-gradient(135deg,#22d3ee,#6366f1);color:#fff!important;font-weight:800;text-decoration:none;cursor:pointer}.dkc-cp{border:1px solid rgba(127,140,170,.5);background:transparent;color:inherit;border-radius:8px;padding:2px 8px;font-size:.78rem;cursor:pointer}.dkc-st{margin-top:6px;font-size:.85rem}' +
      '.dkc-chips{display:flex;gap:6px;flex-wrap:wrap;padding:0 12px 8px}.dkc-chips button{border:1px solid rgba(127,140,170,.45);background:transparent;color:inherit;border-radius:999px;padding:6px 11px;font-size:.82rem;cursor:pointer}' +
      '.dkc-in{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(127,140,170,.25)}.dkc-in input{flex:1;min-width:0;border:1px solid rgba(127,140,170,.45);background:transparent;color:inherit;border-radius:12px;padding:10px 12px;font-size:16px}.dkc-in button{border:0;border-radius:12px;padding:0 14px;background:#4f6df5;color:#fff;font-weight:800;cursor:pointer}.dkc-in button:disabled{opacity:.5}' +
      '@media(max-width:600px){#dkc{right:8px;left:8px;width:auto;bottom:8px;height:calc(100vh - 16px);height:calc(100dvh - 16px)}}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    fab = el('button', '', '💬'); fab.id = 'dkc-fab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Чат с помощником');
    root = el('div'); root.id = 'dkc'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Чат с помощником Diamond.kg');
    root.innerHTML = '<header><span>💎 Помощник Diamond.kg</span><button type="button" aria-label="Закрыть">×</button></header><div class="dkc-body"></div><div class="dkc-chips"></div><form class="dkc-in"><input type="text" maxlength="500" placeholder="Напишите, что нужно пополнить" autocomplete="off"><button type="submit">➤</button></form>';
    document.body.appendChild(fab); document.body.appendChild(root);
    box = root.querySelector('.dkc-body'); input = root.querySelector('input'); sendBtn = root.querySelector('.dkc-in button');
    var chips = root.querySelector('.dkc-chips');
    ['Telegram Stars', 'Алмазы Mobile Legends', 'Roblox', 'Статус заказа'].forEach(function (t) { var b = el('button', '', t); b.type = 'button'; b.onclick = function () { chips.style.display = 'none'; send(t === 'Статус заказа' ? 'Хочу узнать статус заказа' : 'Мне нужны ' + t); }; chips.appendChild(b); });
    root.querySelector('form').onsubmit = function (e) { e.preventDefault(); chips.style.display = 'none'; send(input.value); };
    root.querySelector('header button').onclick = function () { root.classList.remove('open'); fab.style.display = ''; };
    fab.onclick = function () { root.classList.add('open'); fab.style.display = 'none'; input.focus(); scroll(); };
    load();
    if (!msgs.length) bubble('assistant', 'Здравствуйте! Я помощник Diamond.kg. Подскажите, что нужно пополнить: игру или сервис? Например, Telegram Stars или алмазы Mobile Legends.');
    else { msgs.forEach(function (m) { bubble(m.role, m.content); }); chips.style.display = 'none'; }
  }

  fetch(API + '/api/chat/status').then(function (r) { return r.json(); }).then(function (d) { if (d && d.enabled) build(); }).catch(function () {});
})();
