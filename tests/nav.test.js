const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'tools/build-downloads.js'), 'utf8');

function headerNav(file) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const header = html.slice(0, html.indexOf('<main'));
  assert.ok(header.includes('class="site-nav"'), file + ' needs a top site nav before the page content');
  assert.ok(header.includes('>Read<') || header.includes('>Read</a>'), file + ' Read link');
  assert.ok(/Devotional/.test(header), file + ' Devotional link');
  assert.ok(/Downloads/.test(header), file + ' Downloads link');
  assert.ok(!/<u>/.test(header), file + ' nav should not be underlined text');
  return html;
}

[
  'index.html',
  'devotional.html',
  'privacy.html',
  'terms.html',
  'downloads/index.html',
  'unsubscribe.html',
].forEach(headerNav);

assert.ok(builder.includes('class="site-nav"'), 'download builder must write the top nav');
assert.ok(builder.includes('../devotional.html'), 'builder keeps the devotional link');
assert.ok(builder.includes('aria-current="page">Downloads'), 'builder marks Downloads as the current page');
assert.ok(builder.includes('id="cjtLang"'), 'builder keeps the language menu');
assert.ok(builder.includes('aria-label="Language"'), 'builder labels the language menu');
assert.ok(builder.includes('../js/language.js'), 'builder loads the language script');

const downloads = fs.readFileSync(path.join(root, 'downloads/index.html'), 'utf8');
assert.ok(downloads.includes('class="site-nav"'));
assert.ok(downloads.includes('href="../devotional.html"'));
assert.ok(downloads.includes('href="./">Downloads') || downloads.includes('href="./" aria-current="page">Downloads'));

assert.match(css, /\.site-nav a[\s\S]{0,500}text-decoration:\s*none/);
assert.match(css, /\.site-nav a[\s\S]{0,500}min-height:\s*44px/);
assert.match(css, /\.site-nav \{[\s\S]{0,240}flex-wrap:\s*wrap/);

const devotional = fs.readFileSync(path.join(root, 'devotional.html'), 'utf8');
assert.match(devotional, /data-devotional-email[^>]*hidden/);
assert.ok(devotional.includes('Get it by email'));
const devWithoutCsp = devotional.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
assert.ok(!/sibforms|brevo\.com|googletagmanager/i.test(devWithoutCsp), 'the page does not embed Brevo; the CSP only names the form host');
assert.ok(!/src=["']https?:/i.test(devotional), 'devotional HTML does not load a third-party script');

const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
assert.ok(app.includes('Get it by email'));
assert.ok(app.includes('data-devotional-email'));

console.log('nav tests passed');
