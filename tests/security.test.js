const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pages = ['index.html', 'devotional.html', 'privacy.html', 'terms.html', 'downloads/index.html'];
const htmls = pages.map((file) => ({ file, html: fs.readFileSync(path.join(root, file), 'utf8') }));
const csp = htmls[0].html.match(/Content-Security-Policy" content="([^"]+)"/)[1];

assert.ok(csp.includes("default-src 'self'"));
assert.ok(!/unsafe-inline/.test(csp));
assert.ok(!/unsafe-eval/.test(csp));
assert.ok(csp.includes('https://translate.googleapis.com'));
assert.ok(csp.includes('https://*.sibforms.com'));
assert.ok(csp.includes('https://us.aws.cdn.hf.co'));
assert.ok(csp.includes('https://identitytoolkit.googleapis.com'));
assert.ok(csp.includes('upgrade-insecure-requests'));

htmls.forEach(({ file, html }) => {
  assert.ok(html.includes('name="referrer" content="strict-origin-when-cross-origin"'), file);
  assert.ok(html.includes(csp), file + ' CSP should match the reader page');
  assert.ok(html.includes('js/boot.js'), file);
  assert.ok(!/<script(?![^>]*\bsrc=)(?![^>]*type="importmap")[^>]*>/i.test(html), file + ' has an inline script');
  const blanks = html.match(/<a\b[^>]*target\s*=\s*["']_blank["'][^>]*>/gi) || [];
  blanks.forEach((tag) => {
    assert.ok(/rel\s*=\s*["'][^"']*noopener[^"']*["']/i.test(tag), file + ' ' + tag);
    assert.ok(/noreferrer/i.test(tag), file);
  });
});

const index = htmls[0].html;
assert.ok(/type="importmap"/.test(index));
assert.ok(index.includes('sha384-P+iFrwsiok461zJMFNzaLCJ6d5taHsN2f/1LvJIbpS0rtmujFeLbSOgCXf/crZvt'));

const boot = fs.readFileSync(path.join(root, 'js/boot.js'), 'utf8');
assert.ok(boot.includes('window.top !== window.self'));
assert.ok(boot.includes("localStorage.getItem('cjt-lang')") || boot.includes('cjt-lang'));

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.ok(sw.includes("'js/language.js'"));
assert.ok(sw.includes("'js/boot.js'"));
assert.ok(/const VERSION = 'cjt-v30[6-9]'|const VERSION = 'cjt-v3[1-9]\d'|const VERSION = 'cjt-v[4-9]/.test(sw) || Number(sw.match(/cjt-v(\d+)/)[1]) >= 306);

const sec = fs.readFileSync(path.join(root, '.well-known/security.txt'), 'utf8');
assert.ok(sec.includes('Contact: mailto:contact.clayjar@protonmail.com'));
assert.ok(sec.includes('Expires:'));
assert.ok(sec.includes('Canonical: https://clayjartranslation.github.io/.well-known/security.txt'));

const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
assert.ok(rules.includes('request.auth.uid == userId'));
assert.ok(!/allow read, write: if true/.test(rules));

['devotional-email.yml', 'downloads.yml'].forEach((name) => {
  const yml = fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8');
  assert.ok(!/uses: actions\/checkout@v\d/.test(yml), name + ' should pin checkout');
  assert.ok(!/uses: actions\/setup-node@v\d/.test(yml), name + ' should pin setup-node');
  assert.ok(/uses: actions\/checkout@[0-9a-f]{40}/.test(yml), name);
  assert.ok(/uses: actions\/setup-node@[0-9a-f]{40}/.test(yml), name);
});

console.log('security tests passed');
