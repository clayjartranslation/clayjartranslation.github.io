const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { KEY, KEY_LOCATION, BASE, urlFor, urlsFromFiles } = require('../tools/ping-indexnow');

const root = path.join(__dirname, '..');

const keyFile = path.join(root, KEY + '.txt');
assert.ok(fs.existsSync(keyFile), 'IndexNow key file must live at the site root');
assert.strictEqual(fs.readFileSync(keyFile, 'utf8').trim(), KEY);
assert.strictEqual(KEY_LOCATION, 'https://clayjartranslation.github.io/' + KEY + '.txt');
assert.match(KEY, /^[a-zA-Z0-9-]{8,128}$/);

const yandex = fs.readFileSync(path.join(root, 'yandex_53cf987660058f19.html'), 'utf8');
assert.ok(yandex.includes('Verification: 53cf987660058f19'));
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(index.includes('<meta name="yandex-verification" content="53cf987660058f19" />'));
assert.ok(index.includes('<meta name="naver-site-verification" content="899dabad1790dc9b12d9b187413966eb658379d2" />'));
const naver = fs.readFileSync(path.join(root, 'naver17874dff61b908f064b379fb28bfa3d6.html'));
assert.strictEqual(naver.toString('utf8'), 'naver-site-verification: naver17874dff61b908f064b379fb28bfa3d6.html');
assert.ok(!naver.includes(10), 'Naver verification file must have no trailing newline');

assert.strictEqual(urlFor('index.html'), BASE);
assert.strictEqual(urlFor('devotional.html'), BASE + 'devotional.html');
assert.strictEqual(urlFor('bible-in-a-year.html'), BASE + 'bible-in-a-year.html');
assert.strictEqual(urlFor('downloads/index.html'), BASE + 'downloads/');
assert.strictEqual(urlFor('s/genesis/1.html'), BASE + 's/genesis/1.html');
assert.strictEqual(urlFor('data/devotionals.json'), BASE + 'devotional.html');
assert.strictEqual(urlFor('data/bible-in-a-year.json'), BASE + 'bible-in-a-year.html');
assert.strictEqual(urlFor('yandex_53cf987660058f19.html'), null);
assert.strictEqual(urlFor('naver17874dff61b908f064b379fb28bfa3d6.html'), null);
assert.strictEqual(urlFor('google0e7f4b7c27f37d53.html'), null);
assert.strictEqual(urlFor('tools/ping-indexnow.js'), null);
assert.strictEqual(urlFor('sw.js'), null);
assert.strictEqual(urlFor(KEY + '.txt'), null);

const urls = urlsFromFiles([
  'index.html',
  'devotional.html',
  'data/devotionals.json',
  'yandex_53cf987660058f19.html',
  'tools/build-sitemap.js',
]);
assert.deepStrictEqual(urls.sort(), [BASE, BASE + 'devotional.html'].sort());

console.log('indexnow tests passed');
