/* MLBBDiamond.kg — язык RU/KY + чат Tawk.to */
(function () {
  "use strict";

  /* ========== 1. TAWK.TO ==========
     ru — ваш текущий виджет.
     ky — вставьте сюда "PropertyID/WidgetID" второго виджета (кыргызского).
     Как создать: tawk.to → Administration → Chat Widget → добавить виджет,
     затем Widget Content → Language / Edit Content и впишите тексты на кыргызском.
     Пока ky пустой, на KY-версии загружается обычный (русский) виджет. */
  var TAWK = {
    ru: "6ab8154687c1a3344351dece/1k3fh67ko",
    ky: ""
  };

  /* ========== 2. ЯЗЫК ========== */
  var lang = "ru";
  try { lang = localStorage.getItem("lang") === "ky" ? "ky" : "ru"; } catch (e) {}

  function tawkId(l) { return TAWK[l] || TAWK.ru; }
  var loadedTawkId = tawkId(lang);

  /* Позиция виджета: не перекрывает кнопки внизу экрана */
  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_LoadStart = new Date();
  window.Tawk_API.customStyle = {
    visibility: {
      desktop: { position: "br", xOffset: 20, yOffset: 20 },
      mobile: { position: "br", xOffset: 10, yOffset: 80 }
    }
  };

  function loadTawk() {
    var s1 = document.createElement("script");
    var s0 = document.getElementsByTagName("script")[0];
    s1.async = true;
    s1.src = "https://embed.tawk.to/" + loadedTawkId;
    s1.charset = "UTF-8";
    s1.setAttribute("crossorigin", "*");
    s0.parentNode.insertBefore(s1, s0);
  }

  /* ========== 3. СЛОВАРЬ RU → KY ========== */
  var KY = {
    "Главная": "Башкы бет",
    "Пополнить": "Толуктоо",
    "Поддержка": "Колдоо",
    "История": "Тарых",
    "Онлайн": "Онлайн",
    "👤 Войти": "👤 Кирүү",
    "👤 Гость": "👤 Конок",
    "💎 Купить →": "💎 Сатып алуу →",
    "🏠 Главная": "🏠 Башкы бет",
    "💎 Пополнить": "💎 Толуктоо",
    "💬 Поддержка": "💬 Колдоо",
    "📜 История": "📜 Тарых",
    "Вход / Гость": "Кирүү / Конок",
    "Войти": "Кирүү",
    "Гость": "Конок",
    "Закрыть": "Жабуу",
    "⚡ Пополнение за 5–10 минут": "⚡ 5–10 минутта толуктоо",
    "🔒 Безопасно": "🔒 Коопсуз",
    "Пополнение": "Mobile Legends",
    "алмазов": "алмаздарын",
    "Mobile Legends": "толуктоо",
    "в Кыргызстане": "Кыргызстанда",
    "MLBB Diamond Top Up · Оплата через Mbank и O!Деньги": "MLBB Diamond Top Up · Mbank жана O!Деньги аркылуу төлөө",
    "💎 Купить алмазы": "💎 Алмаз сатып алуу",
    "⏱ Среднее время зачисления:": "⏱ Эсепке түшүүнүн орточо убактысы:",
    "5–10 минут": "5–10 мүнөт",
    "5-10 мин": "5-10 мүн",
    "Доставка": "Жеткирүү",
    "⚠️ Неофициальный сервис. Не связан с Moonton.": "⚠️ Расмий эмес сервис. Moonton менен байланышы жок.",
    "Доверие": "Ишеним",
    "Почему нам": "Эмне үчүн бизге",
    "доверяют": "ишенишет",
    "Успешные пополнения": "Ийгиликтүү толуктоолор",
    "Игроки из Бишкека, Оша, Чолпон-Аты.": "Бишкек, Ош, Чолпон-Атадан оюнчулар.",
    "24/7 без выходных": "Дем алышсыз 24/7",
    "Пополняйте в любое время.": "Каалаган убакта толуктаңыз.",
    "Без пароля": "Сырсөзсүз",
    "Только ID игрока.": "Оюнчунун ID гана керек.",
    "Гарантия возврата": "Кайтарып берүү кепилдиги",
    "Вернём деньги при ошибке.": "Ката кетсе, акчаңызды кайтарабыз.",
    "Преимущества": "Артыкчылыктар",
    "Почему": "Эмне үчүн",
    "мы": "биз",
    "Быстрое зачисление": "Тез чегерүү",
    "Локальные платежи": "Жергиликтүү төлөмдөр",
    "Безопасно": "Коопсуз",
    "Не запрашиваем пароль": "Сырсөз сурабайбыз",
    "Процесс": "Процесс",
    "Как": "Кантип",
    "работает": "иштейт",
    "Введите ID": "ID киргизиңиз",
    "ID и сервер из профиля": "Профилден ID жана сервер",
    "Выберите пакет": "Пакет тандаңыз",
    "Любое количество алмазов": "Каалаган көлөмдөгү алмаз",
    "Оплатите": "Төлөңүз",
    "Mbank или O!Деньги, отправьте чек в WhatsApp": "Mbank же O!Деньги аркылуу төлөп, чекти WhatsApp'ка жөнөтүңүз",
    "Получите алмазы": "Алмаздарды алыңыз",
    "Через 5–10 минут": "5–10 мүнөттөн кийин",
    "Готов пополнить": "Алмаз толуктоого",
    "алмазы": "даярсызбы",
    "💎 Пополнить сейчас": "💎 Азыр толуктоо",
    "💎 Пополнить алмазы": "💎 Алмаз толуктоо",
    "Введите ID, выберите пакет. Зачисление за 5–10 минут.": "ID киргизип, пакет тандаңыз. 5–10 мүнөттө эсепке түшөт.",
    "Данные игрока": "Оюнчунун маалыматы",
    "ID ИГРОКА": "ОЮНЧУНУН ID",
    "🌍 Глобальный": "🌍 Глобал",
    "🇵🇭 Филиппины": "🇵🇭 Филиппин",
    "📖 Как найти ID?": "📖 ID'ди кайдан табам?",
    "Профиль → ваш ID (123456789) и сервер в скобках (1234)": "Профиль → сиздин ID (123456789) жана кашаадагы сервер (1234)",
    "ВЫБРАННЫЙ ПАКЕТ": "ТАНДАЛГАН ПАКЕТ",
    "Перейти к оплате →": "Төлөмгө өтүү →",
    "💳 Оплата заказа": "💳 Буйрутмага төлөө",
    "Выберите банк, переведите сумму и отправьте чек в WhatsApp": "Банкты тандап, сумманы которуп, чекти WhatsApp'ка жөнөтүңүз",
    "📋 Ваш заказ": "📋 Сиздин буйрутма",
    "Mobile Legends — Алмазы": "Mobile Legends — Алмаздар",
    "ID игрока": "Оюнчунун ID",
    "Итого": "Жыйынтык",
    "📋 Инструкция": "📋 Нускама",
    "Выберите способ оплаты (Mbank или O!Деньги)": "Төлөм ыкмасын тандаңыз (Mbank же O!Деньги)",
    "Переведите": "Которуңуз",
    "сумму": "сумма",
    "на номер": "→ номер:",
    "Сделайте скриншот чека": "Чектин скриншотун тартыңыз",
    "Нажмите кнопку ниже — откроется WhatsApp с готовым сообщением": "Төмөнкү баскычты басыңыз — WhatsApp даяр билдирүү менен ачылат",
    "Прикрепите чек и отправьте": "Чекти тиркеп, жөнөтүңүз",
    "🏦 Выберите банк для перевода": "🏦 Которуу үчүн банкты тандаңыз",
    "📱 Ваш телефон для связи": "📱 Байланыш үчүн телефонуңуз",
    "Номер телефона (WhatsApp)": "Телефон номери (WhatsApp)",
    "Выберите банк": "Банкты тандаңыз",
    "Выберите банк, затем нажмите отправить": "Банкты тандаңыз, анан жөнөтүү баскычын басыңыз",
    "📲 Отправить заказ в WhatsApp": "📲 Буйрутманы WhatsApp'ка жөнөтүү",
    "Заказ отправлен!": "Буйрутма жөнөтүлдү!",
    "Заказ отправлен! Откройте WhatsApp и прикрепите чек.": "Буйрутма жөнөтүлдү! WhatsApp'ты ачып, чекти тиркеңиз.",
    "Алмазы придут через 5–10 минут после получения чека": "Чек алынгандан кийин алмаздар 5–10 мүнөттө түшөт",
    ". После отправки чека в WhatsApp алмазы придут через 5–10 минут.": ". Чек WhatsApp'ка жөнөтүлгөндөн кийин алмаздар 5–10 мүнөттө түшөт.",
    "📲 Написать в WhatsApp": "📲 WhatsApp'ка жазуу",
    "Новый заказ": "Жаңы буйрутма",
    "Отвечаем за 1–5 минут 24/7": "1–5 мүнөттө жооп беребиз, 24/7",
    "Написать": "Жазуу",
    "Как найти ID?": "ID'ди кайдан табам?",
    "Профиль → ваш ID (123456789) и сервер в скобках (1234).": "Профиль → сиздин ID (123456789) жана кашаадагы сервер (1234).",
    "Что после оплаты?": "Төлөмдөн кийин эмне болот?",
    "Отправьте скриншот чека и ID в WhatsApp / Telegram.": "Чектин скриншотун жана ID'ди WhatsApp / Telegram'га жөнөтүңүз.",
    "Сколько ждать?": "Канча күтөм?",
    "5–10 минут после получения чека.": "Чек алынгандан кийин 5–10 мүнөт.",
    "📋 История заказов": "📋 Буйрутмалар тарыхы",
    "Нет заказов. Пополните алмазы!": "Буйрутма жок. Алмаз толуктаңыз!",
    "Войдите, чтобы видеть историю": "Тарыхты көрүү үчүн кириңиз",
    "Ожидает чека": "Чек күтүлүүдө",
    "Только первое пополнение": "Биринчи толуктоого гана",
    "Объявления аккаунтов MLBB": "MLBB аккаунттарынын жарнамалары",
    "Продажа, обмен, покупка — канал WhatsApp": "Сатуу, алмашуу, сатып алуу — WhatsApp каналы",
    "Перейти →": "Өтүү →",
    "Неофициальный сервис пополнения алмазов Mobile Legends в Кыргызстане": "Кыргызстандагы Mobile Legends алмаздарын толуктоонун расмий эмес сервиси",
    "© 2026 MLBBDiamond.kg · Не связан с Moonton": "© 2026 MLBBDiamond.kg · Moonton менен байланышы жок",
    /* атрибуты */
    "Ваше имя": "Атыңыз",
    "Закрыть рекламу": "Жарнаманы жабуу",
    /* alert() */
    "Ошибка: нет данных заказа": "Ката: буйрутма маалыматы жок",
    "Введите ваш номер телефона для связи": "Байланыш үчүн телефон номериңизди киргизиңиз",
    "Введите имя": "Атыңызды киргизиңиз"
  };

  /* Фразы с подстановкой (числа, название банка) */
  var RULES = [
    [/(\d+)\s+алмазов/g, "$1 алмаз"],
    [/✅ Выбран (.+?)\. Переведите сумму/, "✅ $1 тандалды. Сумманы"]
  ];

  function tr(str) {
    var m = str.match(/^(\s*)([\s\S]*?)(\s*)$/);
    var core = m[2];
    if (!core) return str;
    var out = Object.prototype.hasOwnProperty.call(KY, core) ? KY[core] : core;
    if (out === core) {
      for (var i = 0; i < RULES.length; i++) out = out.replace(RULES[i][0], RULES[i][1]);
    }
    return m[1] + out + m[3];
  }

  /* ========== 4. ПЕРЕВОД СТРАНИЦЫ ========== */
  var store = new WeakMap();
  var observer = null;
  var scheduled = false;

  function eachTextNode(fn) {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "CANVAS") return NodeFilter.FILTER_REJECT;
        return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var n;
    while ((n = w.nextNode())) fn(n);
  }

  function eachAttr(fn) {
    var els = document.querySelectorAll("[placeholder],[aria-label]");
    for (var i = 0; i < els.length; i++) {
      ["placeholder", "aria-label"].forEach(function (a) {
        if (els[i].hasAttribute(a)) fn(els[i], a);
      });
    }
  }

  function apply() {
    if (observer) observer.disconnect();
    document.documentElement.lang = lang;

    if (lang === "ky") {
      eachTextNode(function (n) {
        var cur = n.nodeValue;
        var rec = store.get(n);
        if (rec && cur === rec.t) return;
        var t = tr(cur);
        if (t !== cur) { store.set(n, { o: cur, t: t }); n.nodeValue = t; }
      });
      eachAttr(function (el, a) {
        var key = "data-ru-" + a;
        var orig = el.hasAttribute(key) ? el.getAttribute(key) : el.getAttribute(a);
        var t = tr(orig);
        if (t !== orig) { el.setAttribute(key, orig); el.setAttribute(a, t); }
      });
    } else {
      eachTextNode(function (n) {
        var rec = store.get(n);
        if (rec && n.nodeValue === rec.t) { n.nodeValue = rec.o; store.delete(n); }
      });
      eachAttr(function (el, a) {
        var key = "data-ru-" + a;
        if (el.hasAttribute(key)) { el.setAttribute(a, el.getAttribute(key)); el.removeAttribute(key); }
      });
    }

    if (observer) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /* Переводим и то, что сайт рисует динамически (пакеты, заказы, подсказки) */
  function startObserver() {
    observer = new MutationObserver(function () {
      if (lang !== "ky" || scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () { scheduled = false; apply(); });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /* alert() на выбранном языке */
  var nativeAlert = window.alert;
  window.alert = function (msg) {
    nativeAlert.call(window, lang === "ky" ? tr(String(msg)) : msg);
  };

  /* ========== 5. ПЕРЕКЛЮЧАТЕЛЬ RU / KY ========== */
  function markButtons() {
    var btns = document.querySelectorAll(".lang-toggle button");
    for (var i = 0; i < btns.length; i++) {
      var code = btns[i].textContent.trim().toLowerCase();
      btns[i].classList.toggle("active", code === lang);
    }
  }

  function setLang(l) {
    if (l === lang) return;
    lang = l;
    try { localStorage.setItem("lang", l); } catch (e) {}
    markButtons();
    apply();
    /* Если для языка задан отдельный виджет Tawk — перезагружаем страницу */
    if (tawkId(l) !== loadedTawkId) location.reload();
  }

  function initToggle() {
    /* на телефоне .nav-links скрыт, поэтому добавляем переключатель в мобильное меню */
    var mm = document.getElementById("mobileMenu");
    if (mm && !mm.querySelector(".lang-toggle")) {
      var box = document.createElement("div");
      box.className = "lang-toggle";
      box.style.margin = "12px 16px";
      box.innerHTML = "<button>RU</button><button>KY</button>";
      mm.appendChild(box);
    }
    var btns = document.querySelectorAll(".lang-toggle button");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function (e) {
        e.stopPropagation();
        setLang(this.textContent.trim().toLowerCase() === "ky" ? "ky" : "ru");
      });
    }
    markButtons();
  }

  function init() {
    initToggle();
    startObserver();
    if (lang === "ky") apply();
    loadTawk();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
