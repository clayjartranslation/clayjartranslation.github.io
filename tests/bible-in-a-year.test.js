const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const biay = require('../js/bible-in-a-year.js');

const root = path.join(__dirname, '..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'data/bible-in-a-year.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/books.json'), 'utf8'));
const genesis = JSON.parse(fs.readFileSync(path.join(root, 'data/books/genesis.json'), 'utf8'));
const psalms = JSON.parse(fs.readFileSync(path.join(root, 'data/books/psalms.json'), 'utf8'));
const proverbs = JSON.parse(fs.readFileSync(path.join(root, 'data/books/proverbs.json'), 'utf8'));

assert.strictEqual(plan.days.length, 365);
assert.strictEqual(plan.days[0].date, '01-01');
assert.strictEqual(plan.days[364].date, '12-31');
assert.strictEqual(plan.leapDay['02-29'], '02-28');
assert.ok(!plan.days.some((d) => d.date === '02-29'));
assert.strictEqual(plan.canonBooks, 98);
assert.strictEqual(catalog.books.length, 98);

const inPlan = new Set();
for (const day of plan.days) {
  for (const k of ['ot', 'ps', 'pr', 'nt', 'ex']) {
    assert.ok((day[k] || []).length, day.date + ' missing ' + k);
    for (const item of day[k]) {
      inPlan.add(item.book);
      assert.ok(item.verses >= 1, 'portion missing verse count: ' + JSON.stringify(item));
    }
  }
}
const catalogIds = catalog.books.map((b) => b.id);
const missing = catalogIds.filter((id) => !inPlan.has(id));
assert.deepStrictEqual(missing, [], 'every catalog book must appear');
assert.strictEqual(inPlan.size, 98);

const apoc = catalog.books.filter((b) => b.division === 'Apocrypha').map((b) => b.id);
const pseud = catalog.books.filter((b) => b.division === 'Pseudepigrapha').map((b) => b.id);
apoc.forEach((id) => assert.ok(inPlan.has(id), 'Apocrypha missing: ' + id));
pseud.forEach((id) => assert.ok(inPlan.has(id), 'Pseudepigrapha missing: ' + id));

const traditionalNt = new Set([
  'matthew', 'mark', 'luke', 'john', 'acts', 'romans',
  '1-corinthians', '2-corinthians', 'galatians', 'ephesians',
  'philippians', 'colossians', '1-thessalonians', '2-thessalonians',
  '1-timothy', '2-timothy', 'titus', 'philemon', 'hebrews', 'james',
  '1-peter', '2-peter', '1-john', '2-john', '3-john', 'jude', 'revelation',
]);
const ntExtra = catalog.books.filter((b) => b.division === 'New Testament' && !traditionalNt.has(b.id));
assert.strictEqual(ntExtra.length, 0, 'this edition lists no extra New Testament books; if any are added they belong in the NT stream');

const jan1 = plan.days[0];
assert.strictEqual(jan1.ot[0].book, 'genesis');
const janList = biay.dayPlaylist(jan1, { genesis, psalms, proverbs }, catalog);
assert.ok(janList.length >= 4);
assert.strictEqual(janList[0].kind, 'ot');
assert.strictEqual(janList[0].book, 'genesis');
assert.strictEqual(janList[0].ch, 1);
const genChs = janList.filter((s) => s.book === 'genesis').map((s) => s.ch);
assert.deepStrictEqual(genChs, [1, 2]);
assert.strictEqual(janList.find((s) => s.book === 'genesis' && s.ch === 1).fullChapter, true);

const last = plan.days[364];
assert.strictEqual(last.ps[0].book, 'psalms');
assert.ok(/Psalm 150/.test(last.ps[0].label), 'Psalms should finish on day 365: ' + last.ps[0].label);
assert.strictEqual(last.pr[0].book, 'proverbs');
assert.ok(/Proverbs 31/.test(last.pr[0].label), 'Proverbs should finish on day 365: ' + last.pr[0].label);
assert.ok(last.nt.length, 'NT portion on day 365');
assert.ok(last.ex.length, 'extra-book portion on day 365');
assert.ok(/Revelation 22/.test(last.nt[last.nt.length - 1].label), 'NT should finish on day 365: ' + last.nt[last.nt.length - 1].label);
assert.ok(/Aristeas/.test(last.ex[last.ex.length - 1].label), 'extras should finish on day 365: ' + last.ex[last.ex.length - 1].label);

const timed = biay.clipTimes({ v: { '1': 0, '2': 5.5, '3': 10, '4': 14.2 } }, 1, 3);
assert.deepStrictEqual(timed, { start: 0, end: 14.2, timed: true });
assert.strictEqual(biay.clipTimes({ v: {} }, 1, 3), null);

const check = spawnSync('python3', [path.join(root, 'tools/validate-bible-in-a-year.py'), root], { encoding: 'utf8' });
assert.strictEqual(check.status, 0, check.stdout + check.stderr);
assert.match(check.stdout, /100% coverage, no repeats, finishes in 365 days/);


const genHtml = biay.portionScripture(genesis, 1, 1, 3, { label: 'Genesis 1:1–3', kindLabel: 'Old Testament' });
assert.match(genHtml, /id="biay-v1"/);
assert.match(genHtml, /In the beginning/);
assert.match(genHtml, /<sup class="fn-mark">a<\/sup>/);
assert.match(genHtml, /Genesis 1:1–3/);
assert.doesNotMatch(genHtml, /id="biay-v4"/);
const mid = biay.portionScripture(genesis, 1, 3, 5, { label: 'Genesis 1:3–5' });
assert.match(mid, /id="biay-v3"/);
assert.doesNotMatch(mid, /id="biay-v1"/);
assert.doesNotMatch(mid, /class="ch-heading"/);

const psHtml = biay.portionScripture(psalms, 1, 1, 6, { label: 'Psalm 1', kindLabel: 'Psalms' });
assert.match(psHtml, /class="poem"/);
assert.match(psHtml, /Blessed is the man/);

const noBook = biay.portionScripture(null, 1, 1, 3);
assert.strictEqual(noBook, '');

const meta = { v: { '1': 0, '2': 5.5, '3': 10, '4': 14.2 } };
assert.strictEqual(biay.verseAtTime(meta, 0, 1, 3), 1);
assert.strictEqual(biay.verseAtTime(meta, 5.5, 1, 3), 2);
assert.strictEqual(biay.verseAtTime(meta, 9.9, 1, 3), 2);
assert.strictEqual(biay.verseAtTime(meta, 10, 1, 3), 3);
assert.strictEqual(biay.verseAtTime(meta, 14, 1, 3), 3);
assert.strictEqual(biay.verseAtTime({ v: {} }, 1, 1, 3), null);
assert.strictEqual(biay.verseAtTime(null, 1, 1, 3), null);
const lateMeta = { v: { '17': 80.1, '18': 85, '19': 90 } };
assert.strictEqual(biay.verseAtTime(lateMeta, 80.1, 17, 19), 17);
assert.strictEqual(biay.verseAtTime(lateMeta, 79, 17, 19), null);
// Mid-chapter: time before the clip start is a pending seek, not a title.
assert.strictEqual(biay.speakingTarget(lateMeta, 79, 17, 19), null);
assert.deepStrictEqual(biay.speakingTarget(lateMeta, 85, 17, 19), { kind: 'verse', v: 18 });
assert.strictEqual(biay.speakingTarget({ v: {} }, 1, 1, 3), null);

function loadTiming(name) {
  const p1 = path.join(root, 'tests/fixtures/audio-timings', name);
  const p2 = path.join(root, 'tools/fixtures/audio-timings', name);
  const file = fs.existsSync(p1) ? p1 : p2;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function chapterPageItem(meta, currentTime, lastV) {
  const items = [];
  if (meta.intro != null && meta.intro !== '') items.push({ kind: 'intro', v: 0 });
  if (meta.title != null && meta.title !== '') items.push({ kind: 'title', v: 0 });
  for (let v = 1; v <= lastV; v++) items.push({ kind: 'verse', v: v });
  const times = biay.recTimes(meta, items);
  const k = biay.itemIndexAtTime(times, currentTime);
  return k < 0 ? null : items[k];
}

const cases = [
  { file: 'af_heart_2-baruch_48.json', startV: 30, endV: 50, lastV: 50, label: '2 Baruch 48:30–50 af_heart' },
  { file: 'am_michael_2-baruch_48.json', startV: 30, endV: 50, lastV: 50, label: '2 Baruch 48:30–50 am_michael' },
  { file: 'af_heart_psalms_132.json', startV: 11, endV: 16, lastV: 18, label: 'Psalm 132:11–16 af_heart' },
  { file: 'am_michael_psalms_132.json', startV: 11, endV: 16, lastV: 18, label: 'Psalm 132:11–16 am_michael' },
  { file: 'af_heart_proverbs_29.json', startV: 10, endV: 11, lastV: 27, label: 'Proverbs 29:10–11 af_heart' },
  { file: 'am_michael_proverbs_29.json', startV: 10, endV: 11, lastV: 27, label: 'Proverbs 29:10–11 am_michael' },
  { file: 'af_heart_hebrews_13.json', startV: 1, endV: 21, lastV: 25, label: 'Hebrews 13:1–21 af_heart' },
  { file: 'am_michael_hebrews_13.json', startV: 1, endV: 21, lastV: 25, label: 'Hebrews 13:1–21 am_michael' },
  { file: 'af_heart_2-baruch_55.json', startV: 1, endV: 8, lastV: 8, label: '2 Baruch 55 af_heart' },
  { file: 'am_michael_2-baruch_55.json', startV: 1, endV: 8, lastV: 8, label: '2 Baruch 55 am_michael' },
];

for (const c of cases) {
  const meta = loadTiming(c.file);
  assert.ok(biay.timingsReliable(meta, c.startV, c.endV), c.label + ' should have reliable timings');
  const clip = biay.clipTimes(meta, c.startV, c.endV);
  assert.ok(clip, c.label + ' clip');
  if (c.endV === c.lastV) {
    assert.strictEqual(clip.end, biay.clipDuration(meta), c.label + ' last-verse clip must use meta.d');
  } else {
    assert.strictEqual(clip.end, Number(meta.v[String(c.endV + 1)]), c.label + ' end is the next verse');
  }
  // Before the seek lands, do not highlight a later verse.
  assert.strictEqual(biay.highlightForPlayback(meta, 0, c.startV, c.endV, { clipStart: clip.start, clipEnd: clip.end }), null, c.label + ' at 0');
  // Leftover currentTime from a previous long chapter must not highlight this portion.
  assert.strictEqual(biay.highlightForPlayback(meta, 400, c.startV, c.endV, { clipStart: clip.start, clipEnd: clip.end }), null, c.label + ' leftover 400s');

  const startT = Number(meta.v[String(c.startV)]);
  const samples = new Set([startT, startT + 0.2, startT + 1]);
  for (let v = c.startV; v <= c.endV; v++) {
    const ts = Number(meta.v[String(v)]);
    samples.add(ts);
    samples.add(ts + 0.5);
    if (v < c.endV) samples.add((ts + Number(meta.v[String(v + 1)])) / 2);
  }
  if (clip.end != null) samples.add(clip.end - 0.2);

  for (const t of samples) {
    const got = biay.highlightForPlayback(meta, t, c.startV, c.endV, { clipStart: clip.start, clipEnd: clip.end });
    const page = chapterPageItem(meta, t, c.lastV);
    if (!biay.inClipWindow(t, clip.start, clip.end)) {
      assert.strictEqual(got, null, c.label + ' out of window at ' + t);
      continue;
    }
    assert.ok(got, c.label + ' missing highlight at ' + t);
    assert.ok(page, c.label + ' chapter page empty at ' + t);
    assert.strictEqual(got.kind, page.kind, c.label + ' kind at ' + t);
    assert.strictEqual(got.v, page.v, c.label + ' verse at ' + t + ' biay=' + JSON.stringify(got) + ' page=' + JSON.stringify(page));
  }
}

// Female and male timings differ: the playing voice's file must be used.
const psF = loadTiming('af_heart_psalms_132.json');
const psM = loadTiming('am_michael_psalms_132.json');
const tMid = 70;
const female = biay.highlightForPlayback(psF, tMid, 11, 16, { clipStart: psF.v['11'], clipEnd: psF.v['17'] });
const male = biay.highlightForPlayback(psM, tMid, 11, 16, { clipStart: psM.v['11'], clipEnd: psM.v['17'] });
assert.ok(female && male);
assert.notStrictEqual(female.v, male.v, 'the same currentTime should not assume one voice’s verse for the other');

assert.strictEqual(biay.highlightForPlayback(psF, tMid, 11, 16, { usedFullChapter: true, clipStart: psF.v['11'], clipEnd: psF.v['17'] }), null);
assert.strictEqual(biay.timingsReliable({ v: { '1': 0, '2': 1 } }, 1, 4), false);
assert.strictEqual(biay.timingsReliable({ v: { '1': 10, '2': 5 } }, 1, 2), false);

assert.strictEqual(biay.clipTimes({ v: { '1': 3, '2': 8 }, d: 12.5 }, 1, 2).end, 12.5);

// Full chapters must play from the start of the file until "ended", not a verse-1
// seek or a timing-file duration that cuts the last words and the next intro.
const jubMeta = { v: { '1': 3.27, '33': 351.0 }, d: 360.07, intro: 0.3 };
const jubSeg = { book: 'jubilees', ch: 24, startV: 1, endV: 33, lastV: 33, fullChapter: true };
const jubWin = biay.playbackWindow(jubSeg, jubMeta);
assert.strictEqual(jubWin.start, 0, 'full chapter starts at 0 so the intro is heard');
assert.strictEqual(jubWin.end, null, 'full chapter waits for the ended event');
assert.strictEqual(jubWin.timed, false);
assert.strictEqual(jubWin.usedFullChapter, false);
assert.strictEqual(biay.shouldAdvanceAtTime(360.02, jubWin.end, true), false, 'must not cut a full chapter at meta.d');
assert.strictEqual(biay.shouldAdvanceAtTime(360.07, jubWin.end, true), false);

const psSeg = { book: 'psalms', ch: 119, startV: 17, endV: 40, lastV: 176, fullChapter: false };
const psMeta = { v: { '17': 80.1, '18': 85, '40': 200, '41': 210.5 }, d: 809.57 };
const psWin = biay.playbackWindow(psSeg, psMeta);
assert.ok(psWin.start <= 80.1 && psWin.start >= 80.1 - 0.16, 'partial clip starts with a short lead-in, got ' + psWin.start);
assert.strictEqual(psWin.end, 210.5);
assert.strictEqual(psWin.timed, true);
assert.ok(!biay.shouldAdvanceAtTime(210.46, psWin.end, true), 'must not leave a partial clip 50ms early');
assert.ok(biay.shouldAdvanceAtTime(210.5, psWin.end, true), 'partial clip advances at the next verse');
assert.ok(!biay.shouldAdvanceAtTime(209.0, psWin.end, true), 'partial clip must not advance early');
assert.ok(!biay.shouldAdvanceAtTime(210.5, psWin.end, false), 'paused clip must not advance');

const prSeg = { book: 'proverbs', ch: 29, startV: 14, endV: 15, lastV: 27, fullChapter: false };
const prMeta = { v: { '14': 70, '15': 75, '16': 80.2 }, d: 143.56 };
const prWin = biay.playbackWindow(prSeg, prMeta);
assert.ok(prWin.start <= 70 && prWin.start >= 70 - 0.16, 'proverbs lead-in, got ' + prWin.start);
assert.strictEqual(prWin.end, 80.2);

const untimed = biay.playbackWindow({ startV: 10, endV: 12, fullChapter: false }, { v: {} });
assert.strictEqual(untimed.start, 0);
assert.strictEqual(untimed.end, null);
assert.strictEqual(untimed.usedFullChapter, true);

const janWindows = janList.filter((s) => s.book === 'genesis' && s.fullChapter).map((s) => biay.playbackWindow(s, { v: { '1': 3.1, '2': 8 }, d: 200 }));
assert.ok(janWindows.length && janWindows.every((w) => w.start === 0 && w.end == null), 'January 1 whole Genesis chapters play in full');
const genPartial = janList.find((s) => s.book === 'genesis' && !s.fullChapter);
assert.ok(genPartial, 'January 1 also has a mid-chapter Genesis cut for even length');


assert.strictEqual(biay.textSource('cjt', { source: 'cjt' }, {}), 'cjt');
assert.strictEqual(biay.textSource('ctb', { source: 'cjt', fellBackToCjt: true }, { ctbPublished: true }), 'cjt');
assert.strictEqual(biay.textSource('ctb', { source: 'ctb' }, { ctbPublished: true }), 'ctb');
assert.strictEqual(biay.textSource('ctb', null, { ctbPublished: true }), 'ctb');
assert.strictEqual(biay.textSource('ctb', null, { ctbPublished: false }), 'cjt');


const psalmVerses = new Map();
for (const day of plan.days) {
  for (const item of day.ps) {
    const start = Number(item.v) || 1;
    for (let i = 0; i < item.verses; i++) {
      const key = item.book + ':' + item.ch + ':' + (start + i);
      psalmVerses.set(key, (psalmVerses.get(key) || 0) + 1);
    }
  }
}
assert.ok(psalmVerses.size >= 2461, 'all psalm verses should appear');
assert.ok([...psalmVerses.values()].every((n) => n === 1), 'the psalter is read once, with no repeats');

const dec = plan.days[364];
assert.ok(/Psalm 150/.test(dec.ps[dec.ps.length - 1].label), 'Psalms should finish on Psalm 150: ' + dec.ps[dec.ps.length - 1].label);
assert.strictEqual(dec.pr[0].book, 'proverbs');

assert.strictEqual(biay.kindLabelFor('genesis', catalog), 'Old Testament');
assert.strictEqual(biay.kindLabelFor('psalms', catalog), 'Psalms');
assert.strictEqual(biay.kindLabelFor('proverbs', catalog), 'Proverbs');
assert.strictEqual(biay.kindLabelFor('matthew', catalog), 'New Testament');
assert.strictEqual(biay.kindLabelFor('4-maccabees', catalog), 'Apocrypha');
assert.strictEqual(biay.kindLabelFor('jubilees', catalog), 'Pseudepigrapha');
assert.strictEqual(biay.kindLabelFor('joseph-and-aseneth', catalog), 'Pseudepigrapha');

assert.ok(plan.placement && plan.placement.streams);
assert.ok(plan.placement.streams.ex.includes('tobit') && plan.placement.streams.ex.includes('1-enoch'));
assert.ok(plan.placement.streams.ex.includes('4-maccabees') && plan.placement.streams.ex.includes('jubilees'));
assert.ok(plan.placement.streams.ex.includes('joseph-and-aseneth'), 'Joseph and Aseneth belongs with the extra books');
assert.ok(!plan.placement.streams.ot.includes('joseph-and-aseneth'));
assert.ok(!plan.placement.streams.nt.includes('joseph-and-aseneth'));
assert.ok(!plan.placement.streams.nt.includes('4-maccabees'));
assert.ok(!plan.placement.streams.ot.includes('jubilees'));

let jaDays = 0;
for (const day of plan.days) {
  assert.ok(!day.ot.some((item) => item.book === 'joseph-and-aseneth'), 'Joseph and Aseneth must not appear in the OT stream on ' + day.date);
  assert.ok(!day.nt.some((item) => item.book === 'joseph-and-aseneth'), 'Joseph and Aseneth must not appear in the NT stream on ' + day.date);
  if (day.ex.some((item) => item.book === 'joseph-and-aseneth')) jaDays += 1;
  const groups = biay.portionGroups(day, catalog);
  assert.ok(groups.length >= 5, day.date + ' should list every section');
  for (const g of groups) {
    for (const item of g.items) {
      const want = biay.kindLabelFor(item.book, catalog);
      assert.strictEqual(g.kindLabel, want, day.date + ' ' + item.label + ' labeled ' + g.kindLabel + ', expected ' + want);
      const div = (catalog.books.find((b) => b.id === item.book) || {}).division;
      if (div === 'Apocrypha' || div === 'Pseudepigrapha') {
        assert.strictEqual(g.kind, 'ex', item.book + ' must be in the extras stream on ' + day.date);
        assert.ok(g.kindLabel !== 'Old Testament' && g.kindLabel !== 'New Testament', item.book + ' must not be labeled as a testament on ' + day.date);
      }
      if (div === 'New Testament') assert.strictEqual(g.kindLabel, 'New Testament');
    }
  }
}
assert.ok(jaDays, 'Joseph and Aseneth must appear in the extras stream');


const swSrc = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.strictEqual(biay.CACHE_VERSION, (swSrc.match(/const VERSION = '(cjt-v\d+)'/) || [])[1], 'player version must match the service worker');

// Every verse in a mid-chapter portion should highlight, including the last
// verse right up to the next verse's timestamp.
const highlightMeta = { v: { '17': 80.1, '18': 85, '19': 90, '20': 95, '21': 100.5 }, d: 120 };
for (let v = 17; v <= 20; v++) {
  const ts = highlightMeta.v[String(v)];
  const hit = biay.highlightForPlayback(highlightMeta, ts + 0.1, 17, 20, { clipStart: 80.1 - 0.15, clipEnd: 100.5 });
  assert.ok(hit && hit.kind === 'verse' && hit.v === v, 'verse ' + v + ' should highlight at ' + (ts + 0.1) + ' got ' + JSON.stringify(hit));
}
const lastHit = biay.highlightForPlayback(highlightMeta, 100.4, 17, 20, { clipStart: 80.1 - 0.15, clipEnd: 100.5 });
assert.ok(lastHit && lastHit.v === 20, 'last verse should stay highlighted until the next verse starts, got ' + JSON.stringify(lastHit));
assert.strictEqual(biay.highlightForPlayback(highlightMeta, 100.5, 17, 20, { clipStart: 80.1 - 0.15, clipEnd: 100.5 }), null);

console.log('bible-in-a-year tests ok');
