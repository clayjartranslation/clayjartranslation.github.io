/* Daily devotional. Picks a reading from data/devotionals.json by the reader's
   local month-day, or by ?d=MM-DD. No third-party code. */
(function (factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', api.start);
    else api.start();
  }
})(function () {
  'use strict';

  var NOTICE = 'Devotionals © 2026 Jose Santiago, licensed CC BY 4.0';
  var MONTHS = [null, 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DIM = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function parseDateKey(value) {
    var m = /^(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!m) return null;
    var month = Number(m[1]);
    var day = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > DIM[month]) return null;
    return { month: month, day: day, key: pad(month) + '-' + pad(day) };
  }

  function formatKey(key) {
    var p = parseDateKey(key);
    return p ? MONTHS[p.month] + ' ' + p.day : String(key || '');
  }

  function isLeap(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function dayOfYear(year, month, day) {
    var utc = Date.UTC(year, month - 1, day);
    return Math.round((utc - Date.UTC(year, 0, 1)) / 86400000) + 1;
  }

  /* Where a month-day falls in `year`. Feb 29 in a common year sits halfway
     between Feb 28 and Mar 1 so "nearest" still has a place to measure. */
  function position(year, month, day) {
    if (month === 2 && day === 29 && !isLeap(year)) return dayOfYear(year, 2, 28) + 0.5;
    if (day > daysInMonth(year, month)) return null;
    return dayOfYear(year, month, day);
  }

  function localKey(date) {
    return pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function validEntries(entries) {
    return (entries || []).filter(function (e) { return e && parseDateKey(e.date); });
  }

  function selectDevotional(entries, now, requested) {
    var list = validEntries(entries);
    var todayKey = localKey(now);
    var ask = requested == null ? '' : String(requested).trim();
    var invalidRequest = false;
    if (ask) {
      var req = parseDateKey(ask);
      if (req) {
        var found = null;
        for (var i = 0; i < list.length; i++) if (list[i].date === req.key) { found = list[i]; break; }
        if (found) {
          return {
            entry: found,
            mode: found.date === todayKey ? 'today' : 'requested',
            todayKey: todayKey,
            invalidRequest: false,
          };
        }
      }
      invalidRequest = true;
    }
    var exact = null;
    for (var j = 0; j < list.length; j++) if (list[j].date === todayKey) { exact = list[j]; break; }
    if (exact) return { entry: exact, mode: 'today', todayKey: todayKey, invalidRequest: invalidRequest };
    if (!list.length) return { entry: null, mode: 'empty', todayKey: todayKey, invalidRequest: invalidRequest };

    var year = now.getFullYear();
    var yearLen = isLeap(year) ? 366 : 365;
    var todayPos = dayOfYear(year, now.getMonth() + 1, now.getDate());
    var best = null;
    var bestDist = Infinity;
    var bestBack = Infinity;
    for (var k = 0; k < list.length; k++) {
      var parsed = parseDateKey(list[k].date);
      var pos = position(year, parsed.month, parsed.day);
      if (pos == null) continue;
      var forward = pos - todayPos;
      if (forward < 0) forward += yearLen;
      var back = todayPos - pos;
      if (back < 0) back += yearLen;
      var dist = Math.min(forward, back);
      if (dist < bestDist - 1e-9 || (Math.abs(dist - bestDist) < 1e-9 && back < bestBack)) {
        best = list[k];
        bestDist = dist;
        bestBack = back;
      }
    }
    return { entry: best, mode: best ? 'nearest' : 'empty', todayKey: todayKey, invalidRequest: invalidRequest };
  }

  function readerHref(entry) {
    if (!entry || !/^[a-z0-9-]+$/.test(entry.book || '')) return '';
    var ch = Number(entry.chapter);
    var v = Number(entry.verse);
    if (!isFinite(ch) || ch < 1 || Math.floor(ch) !== ch) return '';
    var href = 'index.html#/read/' + entry.book + '/' + ch;
    if (isFinite(v) && v > 0 && Math.floor(v) === v) href += '/' + v;
    return href;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function paragraphs(text) {
    var wrap = document.createElement('div');
    var parts = String(text || '').split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) parts = [''];
    parts.forEach(function (part) {
      wrap.appendChild(el('p', null, part.replace(/\s*\n\s*/g, ' ')));
    });
    return wrap;
  }

  function renderEntry(entry) {
    var article = document.getElementById('devotional');
    article.replaceChildren();
    var dateLine = formatKey(entry.date);
    article.appendChild(el('p', 'eyebrow', dateLine));
    article.appendChild(el('h2', null, entry.title || 'Devotional'));

    var card = el('div', 'card');
    var ref = el('p', 'dev-ref');
    var href = readerHref(entry);
    var refText = entry.verseReference || 'Scripture';
    if (href) {
      var link = document.createElement('a');
      link.href = href;
      link.textContent = refText;
      link.setAttribute('aria-label', 'Read ' + refText + ' in the Clay Jar Translation');
      ref.appendChild(link);
    } else {
      ref.textContent = refText;
    }
    card.appendChild(ref);
    var quote = el('blockquote', 'dev-verse');
    quote.textContent = entry.verseText || '';
    card.appendChild(quote);
    article.appendChild(card);

    article.appendChild(el('h3', null, 'Reflection'));
    article.appendChild(paragraphs(entry.reflection || 'A reflection for this day has not been added yet.'));
    article.appendChild(el('h3', null, 'Prayer'));
    var prayer = el('div', 'card');
    prayer.appendChild(paragraphs(entry.prayer || 'A prayer for this day has not been added yet.'));
    article.appendChild(prayer);
    article.removeAttribute('aria-busy');
    article.setAttribute('aria-labelledby', '');
    var heading = article.querySelector('h2');
    if (heading) {
      heading.id = 'entryTitle';
      article.setAttribute('aria-labelledby', 'entryTitle');
    }
  }

  function renderArchive(entries, currentDate) {
    var list = document.getElementById('archive');
    list.replaceChildren();
    var sorted = validEntries(entries).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    sorted.forEach(function (entry) {
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = 'devotional.html?d=' + encodeURIComponent(entry.date);
      var label = el('span', null, formatKey(entry.date) + ' · ' + (entry.title || 'Devotional'));
      var meta = el('span', null, entry.verseReference || '');
      link.appendChild(label);
      link.appendChild(meta);
      if (entry.date === currentDate) link.setAttribute('aria-current', 'page');
      item.appendChild(link);
      list.appendChild(item);
    });
  }

  function setNote(text, linkHref, linkLabel) {
    var note = document.getElementById('note');
    note.replaceChildren();
    if (!text) { note.hidden = true; return; }
    note.hidden = false;
    note.appendChild(document.createTextNode(text));
    if (linkHref) {
      note.appendChild(document.createTextNode(' '));
      var a = document.createElement('a');
      a.href = linkHref;
      a.textContent = linkLabel;
      note.appendChild(a);
    }
  }

  function showMessage(text) {
    var article = document.getElementById('devotional');
    article.replaceChildren(el('p', null, text));
    article.removeAttribute('aria-busy');
  }

  function applyPick(entries, picked) {
    var title = document.getElementById('pageTitle');
    var entry = picked.entry;
    if (!entry) {
      title.textContent = "Today's devotional";
      document.title = "Today's devotional · Clay Jar Translation";
      setNote(picked.invalidRequest ? 'That date is not in the archive yet.' : '');
      showMessage('No devotionals have been added yet. When a reading is added, it will show here.');
      renderArchive(entries, '');
      return;
    }
    var shown = formatKey(entry.date);
    var todayLabel = formatKey(picked.todayKey);
    if (picked.mode === 'requested') {
      title.textContent = 'Devotional for ' + shown;
      setNote('Showing the devotional for ' + shown + '.', 'devotional.html', "Today's devotional");
    } else if (picked.mode === 'nearest') {
      title.textContent = "Today's devotional";
      var nearest = picked.invalidRequest
        ? 'That date is not in the archive, and none is set for ' + todayLabel + ' yet. Here is the nearest one, for ' + shown + '.'
        : 'No devotional is set for ' + todayLabel + ' yet. Here is the nearest one, for ' + shown + '.';
      setNote(nearest);
    } else if (picked.invalidRequest) {
      title.textContent = "Today's devotional";
      setNote("That date is not in the archive. Here is today's devotional.");
    } else {
      title.textContent = "Today's devotional";
      setNote('');
    }
    document.title = (entry.title || 'Devotional') + ' · Devotional · Clay Jar Translation';
    renderEntry(entry);
    renderArchive(entries, entry.date);
  }

  function start() {
    var article = document.getElementById('devotional');
    if (!article) return;
    var params = new URLSearchParams(location.search);
    fetch('data/devotionals.json', { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('Could not load devotionals');
      return res.json();
    }).then(function (data) {
      var entries = data && Array.isArray(data.devotionals) ? data.devotionals : (Array.isArray(data) ? data : []);
      applyPick(entries, selectDevotional(entries, new Date(), params.get('d')));
    }).catch(function () {
      setNote('');
      showMessage('The devotionals could not be loaded. Open this page once while you are online, and it can be kept for reading offline.');
    });
    if (navigator.serviceWorker) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function (e) {
          console.warn('Offline mode unavailable:', e && e.message);
        });
      });
    }
  }

  return {
    NOTICE: NOTICE,
    parseDateKey: parseDateKey,
    formatKey: formatKey,
    selectDevotional: selectDevotional,
    readerHref: readerHref,
    start: start,
  };
});
