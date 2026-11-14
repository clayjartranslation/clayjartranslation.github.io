/* Language menu. Nothing is sent to Google until a reader chooses a language.
   The choice is kept in localStorage on this site only.
   Choosing a language opens the current page on Google's translate.goog proxy.
   Google's own page script is inline, which this site's Content-Security-Policy
   does not allow, so once that view is open this file translates text that the
   page adds (Bible chapters, the devotional) by asking Google's translate
   endpoint. That request happens only after the reader opts in. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined' && document.getElementById && document.getElementById('cjtLang')) api.mount();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var KEY = 'cjt-lang';
  var TR = ['_x_tr_sl', '_x_tr_tl', '_x_tr_hl', '_x_tr_pto'];

  function pack() {
    var host = typeof globalThis !== 'undefined' ? globalThis : {};
    return host.CJT_LANGS || { LIST: [{ code: 'en', en: 'English', native: 'English' }], RTL: {} };
  }
  function validCode(code) {
    return pack().LIST.some(function (l) { return l.code === code; });
  }
  function isProxyHost(host) {
    return /\.translate\.goog$/i.test(host || '');
  }
  function toProxyHost(host) {
    return String(host).replace(/-/g, '--').replace(/\./g, '-') + '.translate.goog';
  }
  function fromProxyHost(host) {
    var h = String(host).replace(/\.translate\.goog$/i, '');
    var out = '';
    for (var i = 0; i < h.length; i++) {
      if (h.charAt(i) === '-' && h.charAt(i + 1) === '-') { out += '-'; i++; }
      else if (h.charAt(i) === '-') out += '.';
      else out += h.charAt(i);
    }
    return out;
  }
  function proxyUrl(href, lang) {
    var u = new URL(href);
    if (isProxyHost(u.hostname)) u.hostname = fromProxyHost(u.hostname);
    u.protocol = 'https:';
    u.port = '';
    u.hostname = toProxyHost(u.hostname);
    TR.forEach(function (k) { u.searchParams.delete(k); });
    u.searchParams.delete('cjt_lang');
    u.searchParams.set('_x_tr_sl', 'en');
    u.searchParams.set('_x_tr_tl', lang);
    u.searchParams.set('_x_tr_hl', lang);
    u.searchParams.set('_x_tr_pto', 'wapp');
    return u.href;
  }
  function originalUrl(href, langParam) {
    var u = new URL(href);
    if (isProxyHost(u.hostname)) {
      u.protocol = 'https:';
      u.port = '';
      u.hostname = fromProxyHost(u.hostname);
    }
    TR.forEach(function (k) { u.searchParams.delete(k); });
    u.searchParams.delete('cjt_lang');
    if (langParam) u.searchParams.set('cjt_lang', langParam);
    return u.href;
  }
  function pageLang() {
    try {
      if (typeof location !== 'undefined' && isProxyHost(location.hostname)) {
        var q = new URL(location.href).searchParams.get('_x_tr_tl');
        if (q && validCode(q)) return q;
      }
    } catch (e) {}
    return 'en';
  }
  function labelFor(l) {
    if (!l.native || l.native.toLowerCase() === l.en.toLowerCase()) return l.en;
    return l.native + ' (' + l.en + ')';
  }
  function localHost() {
    var h = location.hostname;
    return location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '';
  }
  function remember(code) {
    try {
      if (!code || code === 'en') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, code);
    } catch (e) {}
  }
  function onPick() {
    var sel = document.getElementById('cjtLang');
    if (!sel) return;
    var code = sel.value;
    if (!validCode(code)) return;
    if (isProxyHost(location.hostname)) {
      location.assign(originalUrl(location.href, code === 'en' ? 'en' : code));
      return;
    }
    remember(code);
    if (code === 'en' || localHost() || navigator.onLine === false) return;
    location.assign(proxyUrl(location.href, code));
  }
  function fillSelect() {
    var sel = document.getElementById('cjtLang');
    if (!sel) return;
    var cur = 'en';
    try {
      if (isProxyHost(location.hostname)) cur = pageLang();
      else cur = localStorage.getItem(KEY) || 'en';
    } catch (e) {}
    if (!validCode(cur)) cur = 'en';
    var rtl = pack().RTL;
    sel.textContent = '';
    pack().LIST.forEach(function (l) {
      var opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = labelFor(l);
      if (rtl[l.code]) opt.dir = 'rtl';
      sel.appendChild(opt);
    });
    sel.value = cur;
    if (!sel.dataset.bound) {
      sel.dataset.bound = '1';
      sel.addEventListener('change', onPick);
    }
  }

  var seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  var queue = [];
  var timer = null;
  var primed = false;
  var activeLang = '';
  var observer = null;

  function googleOwnsIt() {
    var host = typeof globalThis !== 'undefined' ? globalThis : {};
    return !!(host.google && host.google.translate && host.google.translate.TranslateService);
  }
  function skipEl(el) {
    if (!el || !el.closest) return true;
    return !!el.closest('script, style, textarea, input, select, option, noscript, .notranslate, [translate="no"], .skiptranslate, #goog-gt-tt');
  }
  function worth(text) {
    var t = String(text).replace(/\s+/g, ' ').trim();
    if (t.length < 2) return false;
    return /[A-Za-z]/.test(t);
  }
  function consider(node) {
    if (!node || node.nodeType !== 3) return;
    if (seen && seen.has(node)) return;
    if (!worth(node.nodeValue)) return;
    if (skipEl(node.parentElement)) return;
    if (seen) seen.add(node);
    queue.push(node);
  }
  function walk(node) {
    if (!node) return;
    if (node.nodeType === 3) { consider(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.nodeType === 1 && skipEl(node)) return;
    var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = w.nextNode())) consider(n);
  }
  function translateOne(text, lang) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl='
      + encodeURIComponent(lang) + '&dt=t&q=' + encodeURIComponent(text);
    return fetch(url, { credentials: 'omit', mode: 'cors' }).then(function (r) {
      if (!r.ok) throw new Error('translate');
      return r.json();
    }).then(function (data) {
      var parts = data && data[0];
      if (!parts || !parts.length) return text;
      var out = '';
      for (var i = 0; i < parts.length; i++) out += (parts[i] && parts[i][0]) || '';
      return out || text;
    }).catch(function () { return text; });
  }
  function flush() {
    timer = null;
    if (googleOwnsIt()) {
      queue.length = 0;
      if (observer) { observer.disconnect(); observer = null; }
      return;
    }
    var lang = activeLang;
    var batch = queue.splice(0, 4);
    if (!batch.length) return;
    Promise.all(batch.map(function (node) {
      var original = node.nodeValue;
      return translateOne(original, lang).then(function (out) {
        if (node.nodeValue === original && out) node.nodeValue = out;
      });
    })).then(function () {
      if (queue.length) timer = setTimeout(flush, 40);
    });
  }
  function kick() {
    if (timer) return;
    var wait = primed ? 40 : 900;
    primed = true;
    timer = setTimeout(flush, wait);
  }
  function startTranslate(lang) {
    if (!lang || lang === 'en' || !validCode(lang) || !document.body) return;
    activeLang = lang;
    if (pack().RTL[lang]) document.documentElement.dir = 'rtl';
    document.documentElement.lang = lang;
    observer = new MutationObserver(function (recs) {
      if (googleOwnsIt()) return;
      recs.forEach(function (r) {
        r.addedNodes.forEach(function (node) { walk(node); });
      });
      if (queue.length) kick();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    walk(document.body);
    if (queue.length) kick();
  }
  function mount() {
    fillSelect();
    var notice = document.getElementById('mtNotice');
    if (typeof location !== 'undefined' && isProxyHost(location.hostname)) {
      if (notice) notice.hidden = false;
      startTranslate(pageLang());
    }
  }
  return {
    KEY: KEY,
    proxyUrl: proxyUrl,
    originalUrl: originalUrl,
    toProxyHost: toProxyHost,
    fromProxyHost: fromProxyHost,
    labelFor: labelFor,
    validCode: validCode,
    mount: mount,
  };
});
