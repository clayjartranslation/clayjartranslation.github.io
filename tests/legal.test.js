const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
const terms = fs.readFileSync(path.join(root, 'terms.html'), 'utf8');

assert.ok(privacy.includes('Last updated November 28, 2026'));
assert.ok(terms.includes('Last updated November 28, 2026'));
assert.ok(privacy.includes('Jose Santiago'));
assert.ok(privacy.includes('Marshfield'));
assert.ok(terms.includes('Marshfield, Plymouth County, Massachusetts'));

['Google Translate', 'policies.google.com/privacy', 'localStorage', 'Brevo', 'double opt-in', 'unsubscribe', 'PayPal', 'GDPR', 'CCPA', 'LGPD', 'PIPEDA', 'PIPL', 'APPI', 'POPIA', 'Abacus', 'visitor total'].forEach((s) => {
  assert.ok(privacy.includes(s), 'privacy missing ' + s);
});

['AS IS', 'AS AVAILABLE', 'US$50', 'DMCA', 'COPPA', 'Downloads (PDF and EPUB)', 'trademark rights are not licensed', 'Force majeure', 'Assignment', 'Termination', 'Donations are NOT tax-deductible', 'indemnif', 'not medical advice', 'not tax-deductible', '501(c)(3)', 'Plymouth County', 'chapter 218, section 21', 'class action', 'Jury', 'no arbitration', 'small claims', 'one year', 'Severability', 'Where your local law gives you rights', 'Quebec', 'Australian Consumer Law', 'Notice of Dispute', '60 days', 'hold harmless', 'California Civil Code section 1542', 'fullest extent permitted by law', 'chapter 260, section 5A', 'Feedback', 'Use at your own risk', 'English text is the official', 'must not be presented as the official', 'CC BY-NC-SA 4.0', 'not for commercial use', 'same license'].forEach((s) => {
  assert.ok(terms.toLowerCase().includes(s.toLowerCase()), 'terms missing ' + s);
});

['index.html', 'devotional.html', 'privacy.html', 'terms.html', 'downloads/index.html', 'unsubscribe.html'].forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.ok(html.includes('By using this site you agree'), file);
});
assert.ok(fs.readFileSync(path.join(root, 'devotional.html'), 'utf8').includes('By subscribing you agree'));
assert.ok(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8').includes('By subscribing you agree'));
assert.ok(fs.readFileSync(path.join(root, 'tools/build-downloads.js'), 'utf8').includes('By using this site you agree'));

assert.ok(privacy.includes('time zone'));
assert.ok(privacy.includes('Bible in a Year reading email'));
assert.ok(privacy.includes('schedule') || privacy.includes('4:00 in the morning in the time zone') || privacy.includes('time zone collected'));
assert.ok(terms.includes('Email delivery is not guaranteed'));
assert.ok(terms.includes('marked as spam by your email provider'));
const spamNote = 'check your spam or junk folder for the confirmation email';
assert.ok(fs.readFileSync(path.join(root, 'devotional.html'), 'utf8').includes(spamNote));
assert.ok(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8').includes(spamNote));
assert.ok(fs.readFileSync(path.join(root, 'devotional.html'), 'utf8').includes('contact.clayjar@protonmail.com'));

assert.ok(fs.readFileSync(path.join(root, 'devotional.html'), 'utf8').includes('type="checkbox" required'));
assert.ok(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8').includes('type="checkbox" required'));
assert.ok(fs.readFileSync(path.join(root, 'js/accounts.js'), 'utf8').includes('By continuing with any sign-in option'));
assert.ok(fs.readFileSync(path.join(root, 'tools/build-downloads.js'), 'utf8').includes('By downloading a file, you agree'));
assert.ok(privacy.includes('Security and limits'));

['Sharing verses', 'Truth Social', 'Threads', 'No endorsement'].forEach((s) => assert.ok(terms.includes(s), 'terms missing ' + s));
['Fair use, commentary, and quotation', '17 U.S.C. § 107', 'no separate “Fair Use Act.”', 'not legal advice'].forEach((s) => assert.ok(terms.includes(s), 'terms missing ' + s));
['Sharing verses', 'Web Share API', 'Truth Social', 'without a referrer'].forEach((s) => assert.ok(privacy.includes(s), 'privacy missing ' + s));
const shareJs = fs.readFileSync(path.join(root, 'js/share.js'), 'utf8');
assert.ok(!/<script|connect\.facebook|platform\.twitter|widgets\.js/.test(shareJs), 'share.js must not load third-party SDKs');
assert.ok(fs.existsSync(path.join(root, 's/genesis/1.html')), 'share pages missing');

console.log('legal tests passed');
