const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
const terms = fs.readFileSync(path.join(root, 'terms.html'), 'utf8');

assert.ok(privacy.includes('Last updated November 14, 2026'));
assert.ok(terms.includes('Last updated November 14, 2026'));
assert.ok(privacy.includes('Jose Santiago'));
assert.ok(privacy.includes('Marshfield'));
assert.ok(terms.includes('Marshfield, Massachusetts'));

['Google Translate', 'policies.google.com/privacy', 'localStorage', 'Brevo', 'double opt-in', 'unsubscribe', 'PayPal', 'GDPR', 'CCPA', 'LGPD', 'PIPEDA', 'PIPL', 'APPI', 'POPIA'].forEach((s) => {
  assert.ok(privacy.includes(s), 'privacy missing ' + s);
});

['AS IS', 'AS AVAILABLE', 'US$50', 'indemnif', 'not medical advice', 'not tax-deductible', '501(c)(3)', 'Plymouth County', 'Federal Arbitration Act', 'class action', 'Jury', '30 days', 'Arbitration opt-out', 'small claims', 'one year', 'Severability', 'Where your local law gives you rights', 'Quebec', 'Australian Consumer Law', 'do not make a lawsuit impossible', 'English text is the official', 'must not be presented as the official', 'CC BY 4.0'].forEach((s) => {
  assert.ok(terms.toLowerCase().includes(s.toLowerCase()), 'terms missing ' + s);
});

['index.html', 'devotional.html', 'privacy.html', 'terms.html', 'downloads/index.html'].forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.ok(html.includes('By using this site you agree'), file);
});
assert.ok(fs.readFileSync(path.join(root, 'devotional.html'), 'utf8').includes('By subscribing you agree'));
assert.ok(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8').includes('By subscribing you agree'));
assert.ok(fs.readFileSync(path.join(root, 'tools/build-downloads.js'), 'utf8').includes('By using this site you agree'));

console.log('legal tests passed');
