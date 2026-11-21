const assert = require('assert');
const fs = require('fs');
const path = require('path');
const S = require('../js/verse-search.js');

const root = path.join(__dirname, '..');
const cat = JSON.parse(fs.readFileSync(path.join(root, 'data/books.json'), 'utf8'));
const books = cat.books.filter((b) => b.file);

function wordsOf(head) {
  const topic = S.topics.find((t) => t.head === head);
  assert.ok(topic, 'missing topic ' + head);
  return topic.words.map((w) => w.t);
}
assert.deepStrictEqual(wordsOf('shepherd'), ['shepherd', 'flock', 'sheep']);
assert.deepStrictEqual(wordsOf('rainbow'), ['rainbow', 'bow', 'covenant']);
assert.strictEqual(S.plain('I have set my bow{f} in the cloud.'), 'I have set my bow in the cloud.');

const src = fs.readFileSync(path.join(root, 'js/verse-search.js'), 'utf8');
assert.ok(!/\bfetch\s*\(/.test(src), 'search must not fetch');
assert.ok(!/XMLHttpRequest|WebSocket|huggingface|webgpu|wasm|analytics|googleapis/i.test(src));
assert.ok(!/https?:\/\//.test(src), 'search must not name a server');

const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const header = indexHtml.slice(0, indexHtml.indexOf('<main'));
assert.ok(header.includes('href="#/search"'), 'header Search link opens #/search');
assert.ok(header.includes('aria-label="Search"'));
const verseAt = indexHtml.indexOf('src="js/verse-search.js"');
const appAt = indexHtml.indexOf('src="js/app.js"');
assert.ok(verseAt > 0 && appAt > verseAt, 'verse search loads before the reader');
assert.ok(!indexHtml.includes('ask.html'));

const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
assert.ok(app.includes('CJT_SEARCH.search'));
assert.ok(app.includes('#/read/${e.book.id}/${e.c}/${e.v}'));
assert.ok(!app.includes('ask.html'));
assert.ok(!/webgpu|wasm|\.i8\b|feature-extraction/i.test(app));

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.ok(sw.includes("'js/verse-search.js'"), 'offline cache includes verse search');
assert.ok(Number(sw.match(/cjt-v(\d+)/)[1]) >= 330);

const yml = fs.readFileSync(path.join(root, '.github/workflows/test.yml'), 'utf8');
assert.ok(yml.includes('node tests/verse-search.test.js'));

const doc = fs.readFileSync(path.join(root, 'docs/ai-helper-progress.md'), 'utf8');
assert.ok(doc.includes('- [x] a. Find verses search on Search page (keyword/meaning, all devices, offline, no AI model)'));
assert.ok(doc.includes('- [ ] b. AI Ask & Prayer tabs'));
assert.ok(doc.includes('- [ ] c. Prompt tuning + topic synonyms verified against a test set'));
assert.ok(doc.includes('- [ ] d. AI sections in Terms & Privacy'));

const entries = [];
const chapters = [];
let order = 0;
for (const meta of books) {
  const book = JSON.parse(fs.readFileSync(path.join(root, meta.file), 'utf8'));
  const nums = new Set(book.chapters.map((c) => c.n));
  for (const n of meta.translated) {
    assert.ok(nums.has(n), meta.id + ' is missing translated chapter ' + n);
  }
  for (const c of book.chapters) {
    assert.ok(c.verses && c.verses.length, meta.id + ' ' + c.n + ' has no verses');
    let probeFrom = '';
    for (const v of c.verses) {
      const text = S.plain(v.text);
      entries.push({ kind: 'v', book: meta, c: c.n, v: v.v, text, folded: S.fold(text), order: order++ });
      if (!probeFrom) probeFrom = text;
    }
    for (const n of c.notes) {
      entries.push({
        kind: 'n', book: meta, c: c.n, v: +(String(n.ref).split(':')[1] || 0), m: n.m,
        text: n.text, folded: S.fold(n.text), order: order++,
      });
    }
    chapters.push({ key: meta.id + ':' + c.n, bookId: meta.id, n: c.n, text: probeFrom });
  }
}
assert.ok(chapters.length > 100, 'expected the translated books to be in the search');

function probeWord(text) {
  const words = S.fold(S.plain(text)).split(/[^a-z0-9]+/).filter(Boolean);
  const heads = ['shepherd', 'rainbow'];
  const safe = words.filter((w) => w.length >= 5 && !heads.some((h) => w === h || w.indexOf(h) === 0));
  const pool = safe.length ? safe : words.filter((w) => w.length >= 2);
  assert.ok(pool.length, 'verse has no searchable word: ' + text.slice(0, 80));
  return pool.sort((a, b) => b.length - a.length)[0];
}

function keyOf(h) {
  return h.kind + '|' + h.book.id + '|' + h.c + '|' + h.v + '|' + (h.m || '');
}

function legacy(raw, notes) {
  const terms = S.fold(raw).replace(/"/g, '').split(/\s+/).filter(Boolean);
  return entries.filter((e) => (e.kind === 'v' || notes) && terms.every((t) => e.folded.includes(t)));
}

const opts = { notes: false, books };
for (const q of ['beginning', 'covenant', 'moses', 'in the beginning']) {
  const got = S.search(entries, q, opts).hits;
  const old = legacy(q, false);
  assert.strictEqual(got.length, old.length, q + ' should keep the same keyword hits');
  for (let i = 0; i < got.length; i++) {
    assert.strictEqual(keyOf(got[i]), keyOf(old[i]), q + ' order changed at ' + i);
  }
}

const noted = S.search(entries, 'beginning', { notes: true, books }).hits;
const oldNoted = legacy('beginning', true);
assert.strictEqual(noted.length, oldNoted.length);
for (let i = 0; i < noted.length; i++) assert.strictEqual(keyOf(noted[i]), keyOf(oldNoted[i]));

const shepherd = S.search(entries, 'shepherd', opts).hits;
const oldShepherd = legacy('shepherd', false);
const shepherdExact = shepherd.filter((h) => h.exact);
assert.strictEqual(shepherdExact.length, oldShepherd.length, 'shepherd still finds every verse that says shepherd');
const shepherdKeys = new Set(shepherdExact.map(keyOf));
oldShepherd.forEach((h) => assert.ok(shepherdKeys.has(keyOf(h))));
const shepherdRelated = shepherd.filter((h) => !h.exact);
assert.ok(shepherdRelated.length > 0, 'shepherd should also find flock and sheep');
assert.ok(shepherdRelated.every((h) => /flock|sheep/i.test(h.text) && !/shepherd/i.test(h.text)));
assert.ok(Math.min(...shepherdExact.map((h) => h.score)) > Math.max(...shepherdRelated.map((h) => h.score)));
assert.ok(shepherd.slice(0, 12).some((h) => h.book.id === 'psalms' && h.c === 23 && h.v === 1), 'Psalms 23:1 should rank near the top');
assert.ok(shepherd.slice(0, 12).some((h) => h.book.id === 'john' && h.c === 10 && h.v === 11), 'John 10:11 should rank near the top');
assert.ok(shepherd.some((h) => h.book.id === 'john' && h.c === 10 && h.v === 3 && !h.exact));

const rainbow = S.search(entries, 'rainbow', opts).hits;
const rainbowExact = rainbow.filter((h) => h.exact);
const rainbowRelated = rainbow.filter((h) => !h.exact);
assert.ok(rainbowExact.length >= 1);
assert.ok(rainbowExact.every((h) => /rainbow/i.test(h.text)));
assert.ok(Math.min(...rainbowExact.map((h) => h.score)) > Math.max(...rainbowRelated.map((h) => h.score)));
assert.ok(rainbow[0] && /rainbow/i.test(rainbow[0].text));
const noah = rainbowRelated.findIndex((h) => h.book.id === 'genesis' && h.c === 9 && h.v === 13);
assert.strictEqual(noah, 0, 'Genesis 9:13 should be the first related rainbow verse');
assert.ok(!/rainbow/i.test(rainbowRelated[0].text));
assert.ok(rainbowRelated[0].related.indexOf('bow') !== -1 && rainbowRelated[0].related.indexOf('covenant') !== -1);
assert.ok(rainbowRelated.slice(0, 3).every((h) => !/\bbow down\b/i.test(h.text)));

function refLabel(q) {
  const found = S.search(entries, q, opts);
  assert.strictEqual(found.kind, 'ref', q);
  return found.book.id + ' ' + found.chapter + (found.verse ? ':' + found.verse : '');
}
assert.strictEqual(refLabel('Genesis 3:15'), 'genesis 3:15');
assert.strictEqual(refLabel('gen 3'), 'genesis 3');
assert.strictEqual(refLabel('Psalm 23'), 'psalms 23');
assert.strictEqual(refLabel('John 10:11'), 'john 10:11');
assert.strictEqual(S.search(entries, 'a', opts).kind, 'short');
assert.strictEqual(S.search(entries, '', opts).kind, 'short');

const note = entries.find((e) => e.kind === 'n' && probeWord(e.text).length >= 8);
assert.ok(note, 'a footnote to search');
const noteWord = probeWord(note.text);
const withNotes = S.search(entries, noteWord, { notes: true, books }).hits;
const noNotes = S.search(entries, noteWord, opts).hits;
assert.ok(withNotes.some((h) => h.kind === 'n' && h.book.id === note.book.id && h.c === note.c && h.m === note.m));
assert.ok(noNotes.every((h) => h.kind === 'v'));

const groups = new Map();
chapters.forEach((ch) => {
  const word = probeWord(ch.text);
  if (!groups.has(word)) groups.set(word, []);
  groups.get(word).push(ch);
});
const covered = new Set();
for (const [word, group] of groups) {
  const hits = S.search(entries, word, opts).hits;
  const have = new Set(hits.filter((h) => h.kind === 'v').map((h) => h.book.id + ':' + h.c));
  group.forEach((ch) => {
    assert.ok(have.has(ch.key), 'search missed ' + ch.key + ' for “' + word + '”');
    covered.add(ch.key);
  });
}
assert.strictEqual(covered.size, chapters.length, 'search should cover every chapter in the book files');
const bookIds = new Set(chapters.map((ch) => ch.bookId));
books.forEach((b) => assert.ok(bookIds.has(b.id), 'search index missing book ' + b.id));

console.log('verse search tests passed', books.length, 'books', chapters.length, 'chapters', entries.length, 'entries');
