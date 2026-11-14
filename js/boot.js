/* Runs before the page is painted. No third-party code.
   Applies the saved theme, refuses to be framed, and sends a returning
   reader to the language they already chose. The choice itself is stored
   only in localStorage on this site. */
(function () {
  if (window.top !== window.self) {
    try {
      window.top.location = window.self.location;
    } catch (e) {
      document.documentElement.textContent = '';
    }
    return;
  }
  try {
    var s = JSON.parse(localStorage.getItem('cjt-settings') || '{}');
    var d = document.documentElement;
    if (s.theme === 'dark' || s.theme === 'light') d.dataset.theme = s.theme;
    var size = parseInt(s.size, 10);
    if (size >= 14 && size <= 30) d.style.setProperty('--read-size', size + 'px');
    if (s.notes === false) d.classList.add('notes-off');
  } catch (e) {}

  var host = location.hostname;
  if (/\.translate\.goog$/i.test(host)) return;
  if (location.protocol === 'file:') return;
  if (host === 'localhost' || host === '127.0.0.1' || host === '') return;

  var KEY = 'cjt-lang';
  function valid(code) {
    return typeof code === 'string' && /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,12}){0,2}$/.test(code);
  }
  function toProxy(href, lang) {
    var u = new URL(href);
    u.protocol = 'https:';
    u.port = '';
    u.hostname = u.hostname.replace(/-/g, '--').replace(/\./g, '-') + '.translate.goog';
    u.searchParams.delete('cjt_lang');
    u.searchParams.set('_x_tr_sl', 'en');
    u.searchParams.set('_x_tr_tl', lang);
    u.searchParams.set('_x_tr_hl', lang);
    u.searchParams.set('_x_tr_pto', 'wapp');
    return u.href;
  }
  var u;
  try { u = new URL(location.href); } catch (e) { return; }
  var set = u.searchParams.get('cjt_lang');
  if (set) {
    u.searchParams.delete('cjt_lang');
    try {
      if (set === 'en' || !valid(set)) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, set);
    } catch (e) {}
    if (set === 'en' || !valid(set)) {
      location.replace(u.href);
      return;
    }
  }
  var lang = '';
  try { lang = localStorage.getItem(KEY) || ''; } catch (e) {}
  if (!lang || lang === 'en' || !valid(lang)) return;
  if (navigator.onLine === false) return;
  location.replace(toProxy(u.href, lang));
})();
