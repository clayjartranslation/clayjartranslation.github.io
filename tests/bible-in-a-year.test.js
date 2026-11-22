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
  for (const k of ['ot', 'ps', 'pr', 'nt']) {
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
const janList = biay.dayPlaylist(jan1, { genesis, psalms, proverbs });
assert.ok(janList.length >= 4);
assert.strictEqual(janList[0].kind, 'ot');
assert.strictEqual(janList[0].book, 'genesis');
assert.strictEqual(janList[0].ch, 1);
const genChs = janList.filter((s) => s.book === 'genesis').map((s) => s.ch);
assert.deepStrictEqual(genChs, [1, 2, 3]);

const last = plan.days[364];
assert.strictEqual(last.ps[0].book, 'psalms');
assert.ok(/Psalm 150/.test(last.ps[0].label), 'Psalms should finish on day 365: ' + last.ps[0].label);
assert.strictEqual(last.pr[0].book, 'proverbs');
assert.ok(/Proverbs 31/.test(last.pr[0].label), 'Proverbs should finish on day 365: ' + last.pr[0].label);
assert.strictEqual(last.nt[last.nt.length - 1].book, 'revelation');

const timed = biay.clipTimes({ v: { '1': 0, '2': 5.5, '3': 10, '4': 14.2 } }, 1, 3);
assert.deepStrictEqual(timed, { start: 0, end: 14.2, timed: true });
assert.strictEqual(biay.clipTimes({ v: {} }, 1, 3), null);

const check = spawnSync('python3', [path.join(root, 'tools/validate-bible-in-a-year.py'), root], { encoding: 'utf8' });
assert.strictEqual(check.status, 0, check.stdout + check.stderr);
assert.match(check.stdout, /100% coverage, no duplicates, finishes in 365 days/);

console.log('bible-in-a-year tests ok');
