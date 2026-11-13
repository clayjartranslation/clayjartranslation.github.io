const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mail = require('../tools/send-devotional-email.js');
const ui = require('../js/devotional-email.js');
const data = require('../data/devotionals.json');

const root = path.join(__dirname, '..');

assert.strictEqual(ui.ready({ formAction: '', listId: '' }), null);
assert.strictEqual(ui.ready({ formAction: 'https://example.sibforms.com/serve/abc', listId: '' }), null);
assert.strictEqual(ui.ready({ formAction: '', listId: '4' }), null);
assert.strictEqual(ui.ready({ formAction: 'http://example.sibforms.com/serve/abc', listId: '4' }), null);
assert.strictEqual(ui.ready({ formAction: 'https://example.sibforms.com/serve/abc', listId: '0' }), null);
assert.deepStrictEqual(
  ui.ready({ formAction: ' https://abc.sibforms.com/serve/XYZ ', listId: ' 12 ' }),
  { formAction: 'https://abc.sibforms.com/serve/XYZ', listId: '12' }
);

const cfg = fs.readFileSync(path.join(root, 'js/devotional-email-config.js'), 'utf8');
assert.match(cfg, /formAction:\s*''/);
assert.match(cfg, /listId:\s*''/);

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.match(sw, /devotional-email-config\.js/);
assert.match(sw, /devotional-email\.js/);
assert.match(sw, /devotional-email-config/);

function partsAt(iso) {
  const p = mail.nyParts(new Date(iso));
  return { iso, date: p.isoDate, key: p.key, hour: p.hour, minute: p.minute, send: mail.inSendHour(p) };
}

const winter = partsAt('2026-11-13T09:30:00Z');
assert.strictEqual(winter.date, '2026-11-13');
assert.strictEqual(winter.key, '11-13');
assert.strictEqual(winter.hour, 4);
assert.strictEqual(winter.send, true);
assert.strictEqual(partsAt('2026-11-13T08:00:00Z').send, false, '08:00 UTC is 3 AM in November');
assert.strictEqual(partsAt('2026-11-13T09:59:00Z').send, true);
assert.strictEqual(partsAt('2026-11-13T10:00:00Z').hour, 5);
assert.strictEqual(partsAt('2026-11-13T10:00:00Z').send, false);
assert.strictEqual(partsAt('2026-07-15T08:00:00Z').send, true, '08:00 UTC is 4 AM in July');
assert.strictEqual(partsAt('2026-07-15T09:00:00Z').send, false, '09:00 UTC is 5 AM in July');
assert.strictEqual(partsAt('2026-03-08T08:00:00Z').hour, 4, 'spring-forward morning still has a 4 AM');

const entry = data.devotionals.find((e) => e.date === '11-13');
const email = mail.buildEmail(entry, '2026-11-13');
assert.strictEqual(email.name, 'Clay Jar devotional 2026-11-13');
assert.ok(email.subject.includes(entry.title));
assert.ok(email.subject.includes('November 13, 2026'));
assert.ok(email.text.includes(entry.title));
assert.ok(email.text.includes('November 13, 2026'));
assert.ok(email.text.includes(entry.verseText), 'plain text keeps the verse exactly');
assert.ok(email.text.includes(entry.reflection));
assert.ok(email.text.includes(entry.prayer));
assert.ok(email.text.includes('https://clayjartranslation.github.io/devotional.html?d=11-13'));
assert.ok(email.text.includes(mail.NOTICE));
assert.ok(email.text.includes('{{ unsubscribe }}'));
assert.ok(email.html.includes(entry.verseText));
assert.ok(email.html.includes(entry.reflection));
assert.ok(email.html.includes(entry.prayer));
assert.ok(email.html.includes(mail.NOTICE));
assert.ok(email.html.includes('href="{{ unsubscribe }}"'));
assert.ok(email.html.includes('https://clayjartranslation.github.io/devotional.html?d=11-13'));
assert.ok(!email.html.includes('<script'), 'email html has no scripts');

const tricky = mail.buildEmail({
  date: '01-02',
  title: 'A & B',
  verseReference: 'Psalms 1:1',
  verseText: 'Line <one>\nline two',
  reflection: 'Stay & see.',
  prayer: 'Amen.',
}, '2027-01-02');
assert.ok(tricky.text.includes('Line <one>\nline two'));
assert.ok(tricky.html.includes('Line &lt;one&gt;'));
assert.ok(tricky.html.includes('A &amp; B'));
assert.ok(!tricky.html.includes('Line <one>'));

assert.strictEqual(mail.classify([
  { id: 1, name: 'Clay Jar devotional 2026-11-13', status: 'sent' },
], '2026-11-13').action, 'skip');
assert.strictEqual(mail.classify([
  { id: 2, name: 'Treasure devotional 2026-11-13', status: 'sent' },
], '2026-11-13').action, 'create');
assert.strictEqual(mail.classify([
  { id: 3, name: 'Clay Jar devotional 2026-11-13', status: 'draft' },
], '2026-11-13').action, 'send-draft');
assert.strictEqual(mail.classify([
  { id: 4, name: 'Clay Jar devotional 2026-11-12', status: 'sent' },
], '2026-11-13').action, 'create');
assert.strictEqual(mail.classify([
  { id: 5, name: 'Clay Jar devotional 2026-11-13', status: 'queued' },
  { id: 6, name: 'Clay Jar devotional 2026-11-13', status: 'draft' },
], '2026-11-13').action, 'skip');

const logs = [];
const log = (line) => logs.push(String(line));

async function quiet(env, deps) {
  logs.length = 0;
  const code = await mail.run(env, Object.assign({ log, load: () => data.devotionals }, deps));
  return { code, logs: logs.slice() };
}

(async () => {
  let r = await quiet({ EVENT_NAME: 'schedule', NOW: '2026-11-13T08:00:00Z', BREVO_API_KEY: 'x', BREVO_LIST_ID: '4', BREVO_SENDER_EMAIL: 'a@b.co' });
  assert.strictEqual(r.code, 0);
  assert.match(r.logs.join('\n'), /Skipping/);

  r = await quiet({ EVENT_NAME: 'schedule', NOW: '2026-11-13T09:30:00Z' });
  assert.strictEqual(r.code, 0);
  assert.match(r.logs.join('\n'), /BREVO_API_KEY/);
  assert.match(r.logs.join('\n'), /Skipping/);

  r = await quiet({ EVENT_NAME: 'schedule', NOW: '2026-07-15T08:05:00Z', BREVO_API_KEY: 'x', BREVO_LIST_ID: '4', BREVO_SENDER_EMAIL: 'a@b.co' });
  assert.strictEqual(r.code, 0);
  assert.match(r.logs.join('\n'), /No devotional/);

  r = await quiet({ EVENT_NAME: 'workflow_dispatch', DRY_RUN: 'true', NOW: '2026-11-13T15:00:00Z' });
  assert.strictEqual(r.code, 0);
  const dry = r.logs.join('\n');
  assert.ok(dry.includes(entry.verseText));
  assert.ok(dry.includes(mail.NOTICE));
  assert.ok(dry.includes('{{ unsubscribe }}'));
  assert.match(dry, /not sent/i);

  let calls = [];
  r = await quiet({
    EVENT_NAME: 'schedule',
    NOW: '2026-11-13T09:10:00Z',
    BREVO_API_KEY: 'secret-key',
    BREVO_LIST_ID: '4',
    BREVO_SENDER_EMAIL: 'news@example.com',
  }, {
    listCampaigns: async () => [{ id: 9, name: 'Clay Jar devotional 2026-11-13', status: 'sent' }],
    request: async () => { calls.push('request'); return { ok: true, status: 204, json: {}, text: '' }; },
  });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(calls.length, 0, 'an existing campaign must not send again');
  assert.match(r.logs.join('\n'), /Not sending again/);

  calls = [];
  r = await quiet({
    EVENT_NAME: 'workflow_dispatch',
    DRY_RUN: 'false',
    NOW: '2026-11-13T15:00:00Z',
    BREVO_API_KEY: 'secret-key',
    BREVO_LIST_ID: '4',
    BREVO_SENDER_EMAIL: 'news@example.com',
  }, {
    listCampaigns: async () => [],
    request: async (key, method, url, body) => {
      calls.push({ key, method, url, body });
      if (method === 'POST' && url === '/emailCampaigns') return { ok: true, status: 201, json: { id: 42 }, text: '{"id":42}' };
      if (url === '/emailCampaigns/42/sendNow') return { ok: true, status: 204, json: null, text: '' };
      throw new Error('unexpected ' + method + ' ' + url);
    },
  });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].body.sender.email, 'news@example.com');
  assert.deepStrictEqual(calls[0].body.recipients.listIds, [4]);
  assert.ok(calls[0].body.htmlContent.includes(entry.verseText));
  assert.ok(calls[0].body.htmlContent.includes('{{ unsubscribe }}'));
  assert.strictEqual(calls[0].body.name, 'Clay Jar devotional 2026-11-13');
  assert.ok(!JSON.stringify(calls).includes('secret-key') || calls[0].key === 'secret-key');
  assert.ok(!r.logs.join('\n').includes('secret-key'), 'logs must not print the API key');

  calls = [];
  r = await quiet({
    EVENT_NAME: 'workflow_dispatch',
    DRY_RUN: 'false',
    NOW: '2026-11-13T15:00:00Z',
    BREVO_API_KEY: 'secret-key',
    BREVO_LIST_ID: '4',
    BREVO_SENDER_EMAIL: 'news@example.com',
  }, {
    listCampaigns: async () => [{ id: 7, name: 'Clay Jar devotional 2026-11-13', status: 'draft' }],
    request: async (key, method, url) => {
      calls.push(url);
      assert.strictEqual(url, '/emailCampaigns/7/sendNow');
      return { ok: false, status: 400, json: null, text: 'The recipients list is empty' };
    },
  });
  assert.strictEqual(r.code, 0);
  assert.match(r.logs.join('\n'), /nobody to send/);

  const yml = fs.readFileSync(path.join(root, '.github/workflows/devotional-email.yml'), 'utf8');
  assert.match(yml, /cron:\s*'0 8 \* \* \*'/);
  assert.match(yml, /cron:\s*'0 9 \* \* \*'/);
  assert.match(yml, /workflow_dispatch:/);
  assert.match(yml, /dry_run:/);
  assert.match(yml, /BREVO_API_KEY/);
  assert.match(yml, /BREVO_LIST_ID/);
  assert.match(yml, /BREVO_SENDER_EMAIL/);
  assert.match(yml, /vars\.BREVO_LIST_ID/);
  assert.match(yml, /node tools\/send-devotional-email\.js/);

  const child = spawnSync(process.execPath, [path.join(root, 'tools/send-devotional-email.js')], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, EVENT_NAME: 'schedule', NOW: '2026-11-13T09:30:00Z' },
  });
  assert.strictEqual(child.status, 0, child.stderr);
  assert.match(child.stdout, /Skipping/);
  assert.doesNotMatch(child.stdout + child.stderr, /Error|throw/i);

  console.log('devotional email tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
