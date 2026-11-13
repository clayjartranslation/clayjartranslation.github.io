const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../js/devotional.js');
const data = require('../data/devotionals.json');

const root = path.join(__dirname, '..');
const books = JSON.parse(fs.readFileSync(path.join(root, 'data/books.json'), 'utf8'));
const byId = Object.fromEntries(books.books.map((b) => [b.id, b]));

assert.strictEqual(data.notice, api.NOTICE);
assert.strictEqual(api.NOTICE, 'Devotionals © 2026 Jose Santiago, licensed CC BY 4.0');
assert.ok(Array.isArray(data.devotionals) && data.devotionals.length >= 7);

const dates = data.devotionals.map((e) => e.date);
assert.strictEqual(new Set(dates).size, dates.length, 'dates must be unique');
['11-13', '11-14', '11-15', '11-16', '11-17', '11-18', '11-19'].forEach((d) => {
  assert.ok(dates.includes(d), 'missing ' + d);
});

data.devotionals.forEach((e) => {
  assert.ok(api.parseDateKey(e.date), 'bad date ' + e.date);
  assert.strictEqual(typeof e.title, 'string');
  assert.ok(e.title.trim(), 'title');
  assert.strictEqual(typeof e.verseReference, 'string');
  assert.strictEqual(typeof e.verseText, 'string');
  assert.strictEqual(typeof e.reflection, 'string');
  assert.strictEqual(typeof e.prayer, 'string');
  const meta = byId[e.book];
  assert.ok(meta && meta.file, 'unknown book ' + e.book);
  const book = JSON.parse(fs.readFileSync(path.join(root, meta.file), 'utf8'));
  const ch = book.chapters.find((c) => c.n === e.chapter);
  assert.ok(ch, e.book + ' chapter ' + e.chapter);
  const verse = ch.verses.find((v) => v.v === e.verse);
  assert.ok(verse, e.verseReference);
  assert.strictEqual(e.verseText, verse.text, 'quote mismatch ' + e.verseReference);
  const words = e.reflection.trim().split(/\s+/).filter(Boolean);
  assert.ok(words.length >= 120 && words.length <= 200, e.date + ' reflection words ' + words.length);
  const prayerWords = e.prayer.trim().split(/\s+/).filter(Boolean);
  assert.ok(prayerWords.length >= 15 && prayerWords.length <= 80, e.date + ' prayer words ' + prayerWords.length);
  assert.ok(e.verseReference.indexOf(String(e.chapter)) !== -1, e.verseReference);
  assert.strictEqual(api.readerHref(e), 'index.html#/read/' + e.book + '/' + e.chapter + '/' + e.verse);
});

assert.strictEqual(api.formatKey('11-13'), 'November 13');
assert.strictEqual(api.parseDateKey('02-29').key, '02-29');
assert.strictEqual(api.parseDateKey('02-30'), null);
assert.strictEqual(api.parseDateKey('11-3'), null);
assert.strictEqual(api.readerHref({ book: '../etc', chapter: 1, verse: 1 }), '');

function pick(year, month, day, requested) {
  return api.selectDevotional(data.devotionals, new Date(year, month - 1, day), requested);
}

assert.strictEqual(pick(2026, 11, 13, null).mode, 'today');
assert.strictEqual(pick(2026, 11, 13, null).entry.date, '11-13');
assert.strictEqual(pick(2026, 11, 13, '11-13').mode, 'today');
assert.strictEqual(pick(2026, 11, 12, null).mode, 'nearest');
assert.strictEqual(pick(2026, 11, 12, null).entry.date, '11-13');
assert.strictEqual(pick(2026, 11, 20, null).entry.date, '11-19');
assert.strictEqual(pick(2026, 11, 16, '11-18').mode, 'requested');
assert.strictEqual(pick(2026, 11, 16, '11-18').entry.date, '11-18');
assert.strictEqual(pick(2026, 11, 13, '13-40').mode, 'today');
assert.strictEqual(pick(2026, 11, 13, '13-40').invalidRequest, true);
assert.strictEqual(pick(2026, 11, 13, '01-01').invalidRequest, true);
assert.strictEqual(pick(2026, 11, 13, '01-01').entry.date, '11-13');
assert.strictEqual(pick(2026, 1, 1, null).entry.date, '11-19');
assert.strictEqual(pick(2026, 3, 1, null).entry.date, '11-19');
assert.strictEqual(pick(2026, 7, 1, null).entry.date, '11-13');
assert.strictEqual(pick(2026, 12, 15, null).entry.date, '11-19');
assert.strictEqual(pick(2028, 2, 29, null).mode, 'nearest');

const html = fs.readFileSync(path.join(root, 'devotional.html'), 'utf8');
assert.ok(html.includes(api.NOTICE), 'page must label the devotionals');
const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual(srcs, ['js/devotional-email-config.js', 'js/devotional-email.js', 'js/devotional.js']);
assert.ok(!/googleapis|firebase|googletagmanager|cdn\.|analytics/i.test(html));

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.match(sw, /'devotional\.html'/);
assert.match(sw, /'data\/devotionals\.json'/);
assert.match(sw, /'js\/devotional\.js'/);
const version = Number(sw.match(/const VERSION = 'cjt-v(\d+)'/)[1]);
assert.ok(version > 303, 'cache version should move past cjt-v303');

[
  ['index.html', 'href="devotional.html"'],
  ['privacy.html', 'href="devotional.html"'],
  ['terms.html', 'href="devotional.html"'],
  ['downloads/index.html', 'href="../devotional.html"'],
].forEach(([file, needle]) => {
  assert.ok(fs.readFileSync(path.join(root, file), 'utf8').includes(needle), file + ' link');
});

console.log('devotional tests passed', data.devotionals.length, 'entries, cache cjt-v' + version);
