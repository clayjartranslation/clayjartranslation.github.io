/* Merge reading progress for optional account sync.
   Safe to load on every page: it does not talk to the network.
   Bookmarks and highlights keep a deleted flag so a removal on one device
   is not put back by an older copy on another device. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CJT_SYNC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var COLORS = ['yellow', 'green', 'blue', 'pink'];
  var DEFAULTS = {
    theme: 'auto', size: 19, notes: true, resume: false, rate: 1, voice: '', voiceName: '',
    autoNext: true, sleepChoice: 'off', sleepCustom: 20, narr: '', updatedAt: 0,
  };
  var SLEEP = ['off', '5', '10', '15', '30', '45', '60', '90', 'eoc', 'custom'];
  var NARR = ['', 'device', 'af_heart', 'am_michael', 'drama_f', 'drama_m'];
  var SETTING_FIELDS = ['theme', 'size', 'notes', 'resume', 'rate', 'voice', 'voiceName', 'autoNext', 'sleepChoice', 'sleepCustom', 'narr'];

  function num(n, fallback) { return typeof n === 'number' && isFinite(n) ? n : fallback; }
  function str(s, n) { return typeof s === 'string' ? s.slice(0, n) : ''; }
  function intIn(n, max) { return Number.isInteger(n) && n >= 0 && n < max; }

  function cleanBookmark(b) {
    if (!b || typeof b !== 'object') return null;
    if (!intIn(b.ch, 1000) || !intIn(b.v, 1000) || typeof b.book !== 'string' || !b.book) return null;
    var id = str(b.id, 40);
    if (!id) return null;
    return {
      id: id, book: str(b.book, 80), name: str(b.name, 80), ch: b.ch, v: b.v,
      text: str(b.text, 400), t: num(b.t, 0), deleted: !!b.deleted,
    };
  }

  function cleanHighlight(h) {
    if (!h || typeof h !== 'object') return null;
    if (!intIn(h.ch, 1000) || !intIn(h.v, 1000) || !intIn(h.s, 100000) || !intIn(h.e, 100000)) return null;
    if (h.e <= h.s || COLORS.indexOf(h.color) < 0 || typeof h.text !== 'string' || typeof h.book !== 'string' || !h.book) return null;
    var id = str(h.id, 40);
    if (!id) return null;
    return {
      id: id, book: str(h.book, 80), name: str(h.name, 80), ch: h.ch, v: h.v, s: h.s, e: h.e,
      color: h.color, text: str(h.text, 3000), whole: !!h.whole, t: num(h.t, 0), deleted: !!h.deleted,
    };
  }

  function cleanPos(p, withTime) {
    if (!p || typeof p !== 'object' || typeof p.book !== 'string' || !p.book || !intIn(p.ch, 1000)) return null;
    var v = intIn(p.v, 1000) ? p.v : 0;
    var out = { book: str(p.book, 80), name: str(p.name, 80), ch: p.ch, v: v, t: num(p.t, 0) };
    if (withTime) out.time = Math.max(0, Math.min(86400, num(p.time, 0)));
    return out;
  }

  function cleanSettings(s) {
    var src = s && typeof s === 'object' ? s : {};
    var size = parseInt(src.size, 10);
    var rate = Number(src.rate);
    var sleepCustom = parseInt(src.sleepCustom, 10);
    return {
      theme: src.theme === 'light' || src.theme === 'dark' || src.theme === 'auto' ? src.theme : DEFAULTS.theme,
      size: size >= 14 && size <= 30 ? size : DEFAULTS.size,
      notes: src.notes !== false,
      resume: !!src.resume,
      rate: rate >= 0.5 && rate <= 2 ? rate : DEFAULTS.rate,
      voice: str(src.voice, 200),
      voiceName: str(src.voiceName, 120),
      autoNext: src.autoNext !== false,
      sleepChoice: SLEEP.indexOf(src.sleepChoice) >= 0 ? src.sleepChoice : DEFAULTS.sleepChoice,
      sleepCustom: sleepCustom >= 1 && sleepCustom <= 600 ? sleepCustom : DEFAULTS.sleepCustom,
      narr: NARR.indexOf(src.narr) >= 0 ? src.narr : '',
      updatedAt: num(src.updatedAt, 0),
    };
  }

  function newer(a, b) { return (a.t || 0) >= (b.t || 0) ? a : b; }

  // Last write wins per id. The same verse (or the same highlighted span) saved
  // independently on two devices collapses to the newer copy, and the other id
  // is remembered as deleted so it does not come back.
  function mergeItems(listA, listB, keyFn) {
    var byId = new Map();
    var all = listA.concat(listB);
    for (var i = 0; i < all.length; i++) {
      var item = all[i];
      var prev = byId.get(item.id);
      if (!prev || (item.t || 0) >= (prev.t || 0)) byId.set(item.id, Object.assign({}, item));
    }
    var byKey = new Map();
    byId.forEach(function (item) {
      var k = keyFn(item);
      var prev = byKey.get(k);
      if (!prev) { byKey.set(k, item); return; }
      var win = newer(item, prev);
      var lose = win === item ? prev : item;
      if (lose.id !== win.id && !lose.deleted && (win.t || 0) >= (lose.t || 0)) {
        byId.set(lose.id, Object.assign({}, lose, { deleted: true, t: win.t || 0 }));
      }
      if (win.deleted && lose.id !== win.id && !lose.deleted && (win.t || 0) >= (lose.t || 0)) {
        byId.set(lose.id, Object.assign({}, lose, { deleted: true, t: win.t || 0 }));
      }
      byKey.set(k, win);
    });
    var out = [];
    byId.forEach(function (item) { out.push(item); });
    return out;
  }

  function prune(list, now) {
    var cutoff = (now || Date.now()) - 180 * 24 * 60 * 60 * 1000;
    return list.filter(function (x) { return !x.deleted || (x.t || 0) >= cutoff; });
  }

  function sameSettings(a, b) {
    return SETTING_FIELDS.every(function (k) { return a[k] === b[k]; });
  }

  function mergeSettings(local, remote, now) {
    var a = cleanSettings(local);
    var b = cleanSettings(remote);
    if (sameSettings(a, b)) return (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b;
    if ((a.updatedAt || 0) > (b.updatedAt || 0)) return a;
    if ((b.updatedAt || 0) > (a.updatedAt || 0)) return b;
    return Object.assign({}, a, { updatedAt: now || Date.now() });
  }

  function mergePos(a, b) {
    if (!a) return b;
    if (!b) return a;
    return (a.t || 0) >= (b.t || 0) ? a : b;
  }

  function normalize(s) {
    s = s || {};
    return {
      bookmarks: (Array.isArray(s.bookmarks) ? s.bookmarks : []).map(cleanBookmark).filter(Boolean).slice(0, 5000),
      highlights: (Array.isArray(s.highlights) ? s.highlights : []).map(cleanHighlight).filter(Boolean).slice(0, 8000),
      reading: cleanPos(s.reading, false),
      audio: cleanPos(s.audio, true),
      settings: cleanSettings(s.settings),
    };
  }

  function mergeState(local, remote, now) {
    var L = normalize(local);
    var R = normalize(remote);
    var when = now || Date.now();
    return {
      bookmarks: prune(mergeItems(L.bookmarks, R.bookmarks, function (b) { return b.book + '|' + b.ch + '|' + b.v; }), when),
      highlights: prune(mergeItems(L.highlights, R.highlights, function (h) { return h.book + '|' + h.ch + '|' + h.v + '|' + h.s + '|' + h.e; }), when),
      reading: mergePos(L.reading, R.reading),
      audio: mergePos(L.audio, R.audio),
      settings: mergeSettings(L.settings, R.settings, when),
    };
  }

  function visible(list) { return (list || []).filter(function (x) { return !x.deleted; }); }

  function emptyState() {
    return { bookmarks: [], highlights: [], reading: null, audio: null, settings: cleanSettings(null) };
  }

  return {
    COLORS: COLORS,
    DEFAULTS: DEFAULTS,
    SETTING_FIELDS: SETTING_FIELDS,
    normalize: normalize,
    mergeState: mergeState,
    visible: visible,
    emptyState: emptyState,
    cleanSettings: cleanSettings,
  };
});
