const assert = require('assert');
const fs = require('fs');
const path = require('path');
const langs = require('../js/languages.js');
const api = require('../js/language.js');

const list = langs.LIST;
assert.strictEqual(list[0].code, 'en');
assert.strictEqual(list[0].en, 'English');
assert.ok(list.length >= 240, 'expected the full Google Translate list, got ' + list.length);
assert.strictEqual(new Set(list.map((l) => l.code)).size, list.length);
const rest = list.slice(1).map((l) => l.en);
const sorted = rest.slice().sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
assert.deepStrictEqual(rest, sorted);
const es = list.find((l) => l.code === 'es');
assert.ok(es && es.native.indexOf('Español') === 0, JSON.stringify(es));
assert.ok(api.labelFor(es).indexOf('Spanish') > 0);
const ar = list.find((l) => l.code === 'ar');
assert.strictEqual(ar.native, 'العربية');
assert.ok(langs.RTL.ar && langs.RTL.iw && langs.RTL.fa && langs.RTL.ur);
assert.ok(api.validCode('zh-CN') && api.validCode('fa-AF') && !api.validCode('not-a-lang'));

const page = 'https://clayjartranslation.github.io/devotional.html?d=11-14#top';
const proxied = api.proxyUrl(page, 'es');
const proxiedUrl = new URL(proxied);
assert.strictEqual(proxiedUrl.hostname, 'clayjartranslation-github-io.translate.goog');
assert.strictEqual(proxiedUrl.searchParams.get('_x_tr_tl'), 'es');
assert.strictEqual(proxiedUrl.searchParams.get('_x_tr_sl'), 'en');
assert.strictEqual(proxiedUrl.searchParams.get('_x_tr_hl'), 'es');
assert.strictEqual(proxiedUrl.searchParams.get('_x_tr_pto'), 'wapp');
assert.strictEqual(proxiedUrl.searchParams.get('d'), '11-14');
assert.strictEqual(proxiedUrl.hash, '#top');
assert.ok(!proxied.includes('cjt_lang'));

const back = new URL(api.originalUrl(proxied, 'en'));
assert.strictEqual(back.hostname, 'clayjartranslation.github.io');
assert.strictEqual(back.searchParams.get('cjt_lang'), 'en');
assert.strictEqual(back.searchParams.get('d'), '11-14');
assert.strictEqual(back.searchParams.get('_x_tr_tl'), null);
assert.strictEqual(back.hash, '#top');

const chapter = api.proxyUrl('https://clayjartranslation.github.io/#/read/genesis/1', 'ar');
assert.ok(chapter.includes('_x_tr_tl=ar'));
assert.ok(chapter.endsWith('#/read/genesis/1'));
assert.strictEqual(api.fromProxyHost(api.toProxyHost('my-site.github.io')), 'my-site.github.io');

const root = path.join(__dirname, '..');
['index.html', 'devotional.html', 'privacy.html', 'terms.html', 'downloads/index.html'].forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.ok(html.includes('aria-label="Language"'), file);
  assert.ok(html.includes('id="cjtLang"'), file);
  assert.ok(html.includes('Machine translation by Google'), file);
  assert.ok(!/translate\.google\.com\/translate_a\/element\.js/.test(html), file + ' must not load the Google script');
  assert.ok(!/src=["']https?:\/\/translate\.google/i.test(html), file);
});

const src = fs.readFileSync(path.join(root, 'js/language.js'), 'utf8');
assert.ok(src.includes('localStorage'));
assert.ok(!src.includes('element.js'));
assert.ok(src.includes("localStorage.setItem(KEY") || src.includes('localStorage.setItem(KEY, code)'));

console.log('language tests passed', list.length, 'languages');
