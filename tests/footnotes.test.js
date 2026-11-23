const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

assert.match(app, /const mdEm = \(s\) => String\(s\)\.replace/);
assert.match(app, /mdEm\(esc\(x\.text\)\)/);
assert.match(app, /sheetText'\)\.innerHTML = mdEm\(esc\(note\.text\)\)/);
assert.doesNotMatch(app, /sheetText'\)\.textContent = note\.text/);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mdEm = (s) => String(s).replace(/\*([^*<>\n]+)\*/g, '<i>$1</i>');

assert.strictEqual(
  mdEm(esc('Hebrew *Terach*; the meaning is uncertain.')),
  'Hebrew <i>Terach</i>; the meaning is uncertain.'
);
assert.strictEqual(
  mdEm(esc('Greek *logos*, “word.” Also *Petros*.')),
  'Greek <i>logos</i>, “word.” Also <i>Petros</i>.'
);
assert.strictEqual(mdEm(esc('No asterisks here.')), 'No asterisks here.');
assert.strictEqual(mdEm(esc('A lone * mark')), 'A lone * mark');
assert.strictEqual(mdEm(esc('*<script>alert(1)</script>*')), '<i>&lt;script&gt;alert(1)&lt;/script&gt;</i>');

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.ok(Number(sw.match(/cjt-v(\d+)/)[1]) >= 341);

console.log('footnote italics tests passed');
