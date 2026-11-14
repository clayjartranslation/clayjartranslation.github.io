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
const formAction = (cfg.match(/formAction:\s*'([^']+)'/) || [])[1] || '';
const listId = (cfg.match(/listId:\s*'([^']*)'/) || [])[1] || '';
assert.strictEqual(listId, '3');
assert.ok(formAction.startsWith('https://5b7e23a5.sibforms.com/serve/'));
assert.ok(cfg.includes("formAction: '" + formAction + "'"));
assert.ok(!/api[_-]?key\s*[:=]/i.test(cfg), 'do not put the Brevo API key in the public config');

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.match(sw, /devotional-email-config\.js/);
assert.match(sw, /devotional-email\.js/);
assert.match(sw, /unsubscribe\.html/);

function partsAt(iso, tz) {
  const p = mail.tzParts(new Date(iso), tz);
  return { iso, date: p.isoDate, key: p.key, hour: p.hour, minute: p.minute, send: mail.inSendHour(p), tz: p.timeZone };
}

const winter = partsAt('2026-11-13T09:30:00Z', 'America/New_York');
assert.strictEqual(winter.date, '2026-11-13');
assert.strictEqual(winter.key, '11-13');
assert.strictEqual(winter.hour, 4);
assert.strictEqual(winter.send, true);
assert.strictEqual(partsAt('2026-11-13T08:00:00Z', 'America/New_York').send, false, '08:00 UTC is 3 AM in November');
assert.strictEqual(partsAt('2026-11-13T09:59:00Z', 'America/New_York').send, true);
assert.strictEqual(partsAt('2026-11-13T10:00:00Z', 'America/New_York').hour, 5);
assert.strictEqual(partsAt('2026-11-13T10:00:00Z', 'America/New_York').send, false);
assert.strictEqual(partsAt('2026-07-15T08:00:00Z', 'America/New_York').send, true, '08:00 UTC is 4 AM in July');
assert.strictEqual(partsAt('2026-07-15T09:00:00Z', 'America/New_York').send, false, '09:00 UTC is 5 AM in July');
assert.strictEqual(partsAt('2026-03-08T08:00:00Z', 'America/New_York').hour, 4, 'spring-forward morning still has a 4 AM');
assert.strictEqual(partsAt('2026-11-01T09:00:00Z', 'America/New_York').hour, 4, 'fall-back morning still has a 4 AM');
assert.strictEqual(partsAt('2026-11-01T09:00:00Z', 'America/New_York').send, true);

assert.strictEqual(partsAt('2026-11-14T12:00:00Z', 'America/Los_Angeles').hour, 4);
assert.strictEqual(partsAt('2026-11-14T12:00:00Z', 'America/Los_Angeles').date, '2026-11-14');
assert.strictEqual(partsAt('2026-11-14T22:30:00Z', 'Asia/Kolkata').hour, 4);
assert.strictEqual(partsAt('2026-11-14T22:30:00Z', 'Asia/Kolkata').date, '2026-11-15');
assert.strictEqual(partsAt('2026-11-14T15:00:00Z', 'Pacific/Auckland').hour, 4);
assert.strictEqual(partsAt('2026-11-14T15:00:00Z', 'Pacific/Auckland').date, '2026-11-15');
assert.strictEqual(mail.resolveTimeZone('Not/A_Zone'), 'America/New_York');
assert.strictEqual(mail.resolveTimeZone(''), 'America/New_York');
assert.strictEqual(mail.resolveTimeZone('Europe/London'), 'Europe/London');
assert.strictEqual(mail.isValidIanaTimeZone('America/New_York'), true);
assert.strictEqual(mail.isValidIanaTimeZone('Foo/Bar'), false);

const nowNyFour = new Date('2026-11-13T09:10:00Z');
const grouped = mail.groupByTimeZone([
  { email: 'ny@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/New_York' } },
  { email: 'la@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/Los_Angeles' } },
  { email: 'again@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/New_York', LAST_DEVO_DATE: '2026-11-13' } },
  { email: 'gone@example.com', emailBlacklisted: true, attributes: { TIMEZONE: 'America/New_York' } },
  { email: 'blocked@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/New_York' } },
  { email: 'missing@example.com', emailBlacklisted: false, attributes: {} },
  { email: 'badtz@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'Not/A_Zone' } },
  { email: 'india@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'Asia/Kolkata' } },
], nowNyFour, new Set(['blocked@example.com']));

const byTz = Object.fromEntries(grouped.map((g) => [g.timeZone, g]));
assert.strictEqual(byTz['America/New_York'].due, true);
assert.strictEqual(byTz['America/New_York'].localDate, '2026-11-13');
assert.deepStrictEqual(byTz['America/New_York'].recipients.map((c) => c.email).sort(), [
  'badtz@example.com', 'missing@example.com', 'ny@example.com',
]);
assert.strictEqual(byTz['America/New_York'].skippedAlready, 1);
assert.strictEqual(byTz['America/New_York'].skippedExcluded, 2);
assert.strictEqual(byTz['America/Los_Angeles'].due, false);
assert.strictEqual(byTz['America/Los_Angeles'].recipients.length, 0);
assert.strictEqual(byTz['America/Los_Angeles'].skippedWrongHour, 1);
assert.ok(!byTz['Asia/Kolkata'].due);
assert.strictEqual(mail.dueCount(grouped), 3);
assert.strictEqual(mail.alreadySentTodayCount(grouped), 1);

const atAucklandFour = mail.groupByTimeZone([
  { email: 'akl@example.com', attributes: { TIMEZONE: 'Pacific/Auckland' } },
  { email: 'ny@example.com', attributes: { TIMEZONE: 'America/New_York' } },
], new Date('2026-11-14T15:00:00Z'), new Set());
const akl = atAucklandFour.find((g) => g.timeZone === 'Pacific/Auckland');
const nyLater = atAucklandFour.find((g) => g.timeZone === 'America/New_York');
assert.strictEqual(akl.due, true);
assert.strictEqual(akl.localDate, '2026-11-15');
assert.strictEqual(akl.recipients[0].email, 'akl@example.com');
assert.strictEqual(nyLater.due, false);

const limited = mail.applyDailyLimit([
  { due: true, recipients: new Array(200).fill({ email: 'a@b.co' }), skippedAlready: 0 },
  { due: true, recipients: new Array(80).fill({ email: 'c@d.co' }), skippedAlready: 0 },
], 50);
assert.strictEqual(limited.groups[0].recipients.length, 200);
assert.strictEqual(limited.groups[1].recipients.length, 50);
assert.strictEqual(limited.truncated, 30);

const entry = data.devotionals.find((e) => e.date === '11-13');
const email = mail.buildEmail(entry, '2026-11-13', mail.unsubscribeUrl('reader@example.com'));
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
assert.ok(email.text.includes(mail.unsubscribeUrl('reader@example.com')));
assert.ok(!email.text.includes('{{ unsubscribe }}'));
assert.ok(email.html.includes(entry.verseText));
assert.ok(email.html.includes(entry.reflection));
assert.ok(email.html.includes(entry.prayer));
assert.ok(email.html.includes(mail.NOTICE));
assert.ok(email.html.includes('href="' + mail.unsubscribeUrl('reader@example.com') + '"'));
assert.ok(!email.html.includes('{{ unsubscribe }}'));
assert.ok(email.html.includes('https://clayjartranslation.github.io/devotional.html?d=11-13'));
assert.ok(!email.html.includes('<script'), 'email html has no scripts');

const tricky = mail.buildEmail({
  date: '01-02',
  title: 'A & B',
  verseReference: 'Psalms 1:1',
  verseText: 'Line <one>\nline two',
  reflection: 'Stay & see.',
  prayer: 'Amen.',
}, '2027-01-02', mail.unsubscribeUrl(''));
assert.ok(tricky.text.includes('Line <one>\nline two'));
assert.ok(tricky.html.includes('Line &lt;one&gt;'));
assert.ok(tricky.html.includes('A &amp; B'));
assert.ok(!tricky.html.includes('Line <one>'));

const logs = [];
const log = (line) => logs.push(String(line));

async function quiet(env, deps) {
  logs.length = 0;
  const code = await mail.run(env, Object.assign({ log, load: () => data.devotionals }, deps));
  return { code, logs: logs.slice() };
}

function mockRequest(handlers) {
  return async (key, method, url, body) => {
    const fn = handlers[method + ' ' + url] || handlers[method] || handlers['*'];
    if (!fn) throw new Error('unexpected ' + method + ' ' + url);
    return fn(key, method, url, body);
  };
}

(async () => {
  let r = await quiet({ EVENT_NAME: 'schedule', NOW: '2026-11-13T08:00:00Z', BREVO_API_KEY: 'x', BREVO_LIST_ID: '3', BREVO_SENDER_EMAIL: 'a@b.co' }, {
    request: mockRequest({
      'POST': async () => ({ ok: true, status: 201, json: {}, text: '' }),
      'GET': async (key, method, url) => {
        if (url.startsWith('/contacts?')) return { ok: true, status: 200, json: { contacts: [
          { email: 'ny@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/New_York' } },
        ] }, text: '' };
        if (url.startsWith('/smtp/blockedContacts')) return { ok: true, status: 200, json: { contacts: [] }, text: '' };
        throw new Error('unexpected GET ' + url);
      },
    }),
  });
  assert.strictEqual(r.code, 0);
  assert.match(r.logs.join('\n'), /Nothing was sent|not in the 4 AM hour|No subscribers are in the 4 AM hour/);

  r = await quiet({ EVENT_NAME: 'schedule', NOW: '2026-11-13T09:30:00Z' });
  assert.strictEqual(r.code, 0);
  assert.match(r.logs.join('\n'), /BREVO_API_KEY/);
  assert.match(r.logs.join('\n'), /Skipping/);

  r = await quiet({ EVENT_NAME: 'schedule', NOW: '2026-07-15T08:05:00Z', BREVO_API_KEY: 'x', BREVO_LIST_ID: '3', BREVO_SENDER_EMAIL: 'a@b.co' }, {
    request: mockRequest({
      'POST': async (key, method, url) => {
        if (url.startsWith('/contacts/attributes/')) return { ok: true, status: 201, json: {}, text: '' };
        throw new Error('should not send when there is no devotional ' + url);
      },
      'GET': async (key, method, url) => {
        if (url.startsWith('/contacts?')) return { ok: true, status: 200, json: { contacts: [
          { email: 'ny@example.com', attributes: { TIMEZONE: 'America/New_York' } },
        ] }, text: '' };
        if (url.startsWith('/smtp/blockedContacts')) return { ok: true, status: 200, json: { contacts: [] }, text: '' };
        throw new Error('unexpected GET ' + url);
      },
    }),
  });
  assert.strictEqual(r.code, 0);
  assert.match(r.logs.join('\n'), /No devotional/);

  r = await quiet({ EVENT_NAME: 'workflow_dispatch', DRY_RUN: 'true', NOW: '2026-11-13T15:00:00Z' });
  assert.strictEqual(r.code, 0);
  const dry = r.logs.join('\n');
  assert.ok(dry.includes(entry.verseText));
  assert.ok(dry.includes(mail.NOTICE));
  assert.ok(dry.includes(mail.UNSUBSCRIBE_PAGE));
  assert.ok(!dry.includes('{{ unsubscribe }}'));
  assert.match(dry, /not sent|Nothing is sent/i);

  const stored = [];
  const calls = [];
  r = await quiet({
    EVENT_NAME: 'schedule',
    NOW: '2026-11-13T09:10:00Z',
    BREVO_API_KEY: 'secret-key',
    BREVO_LIST_ID: '3',
    BREVO_SENDER_EMAIL: 'news@example.com',
  }, {
    request: mockRequest({
      '*': async (key, method, url, body) => {
        calls.push({ key, method, url, body });
        if (method === 'POST' && url.startsWith('/contacts/attributes/')) return { ok: false, status: 400, json: { message: 'Attribute already exists' }, text: 'Attribute already exists' };
        if (method === 'GET' && url.startsWith('/contacts?')) return { ok: true, status: 200, json: { contacts: [
          { email: 'due@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/New_York' } },
          { email: 'done@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/New_York', LAST_DEVO_DATE: '2026-11-13' } },
          { email: 'west@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/Los_Angeles' } },
          { email: 'left@example.com', emailBlacklisted: true, attributes: { TIMEZONE: 'America/New_York' } },
        ] }, text: '' };
        if (method === 'GET' && url.startsWith('/smtp/blockedContacts')) return { ok: true, status: 200, json: { contacts: [] }, text: '' };
        if (method === 'POST' && url === '/smtp/email') {
          return { ok: true, status: 201, json: { messageIds: ['<id-1>'] }, text: '' };
        }
        if (method === 'POST' && url === '/contacts/batch') {
          stored.push(body);
          return { ok: true, status: 204, json: null, text: '' };
        }
        throw new Error('unexpected ' + method + ' ' + url);
      },
    }),
  });
  assert.strictEqual(r.code, 0);
  const sendCalls = calls.filter((c) => c.url === '/smtp/email');
  assert.strictEqual(sendCalls.length, 1, 'only the 4 AM New York group is emailed');
  assert.deepStrictEqual(sendCalls[0].body.messageVersions.map((v) => v.to), [[{ email: 'due@example.com' }]]);
  assert.ok(sendCalls[0].body.htmlContent.includes(entry.verseText));
  assert.ok(sendCalls[0].body.messageVersions[0].htmlContent.includes(mail.unsubscribeUrl('due@example.com')));
  assert.ok(!JSON.stringify(sendCalls[0].body).includes('west@example.com'));
  assert.ok(!JSON.stringify(sendCalls[0].body).includes('done@example.com'));
  assert.ok(!JSON.stringify(sendCalls[0].body).includes('left@example.com'));
  assert.strictEqual(stored.length, 1);
  assert.strictEqual(stored[0].contacts[0].email, 'due@example.com');
  assert.strictEqual(stored[0].contacts[0].attributes.LAST_DEVO_DATE, '2026-11-13');
  assert.match(r.logs.join('\n'), /America\/New_York/);
  assert.match(r.logs.join('\n'), /Sent Clay Jar devotional 2026-11-13 to 1 subscriber/);
  assert.ok(!r.logs.join('\n').includes('secret-key'), 'logs must not print the API key');

  const second = [];
  r = await quiet({
    EVENT_NAME: 'schedule',
    NOW: '2026-11-13T09:40:00Z',
    BREVO_API_KEY: 'secret-key',
    BREVO_LIST_ID: '3',
    BREVO_SENDER_EMAIL: 'news@example.com',
  }, {
    request: mockRequest({
      '*': async (key, method, url, body) => {
        second.push({ method, url, body });
        if (method === 'POST' && url.startsWith('/contacts/attributes/')) return { ok: true, status: 201, json: {}, text: '' };
        if (method === 'GET' && url.startsWith('/contacts?')) return { ok: true, status: 200, json: { contacts: [
          { email: 'due@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/New_York', LAST_DEVO_DATE: '2026-11-13' } },
        ] }, text: '' };
        if (method === 'GET' && url.startsWith('/smtp/blockedContacts')) return { ok: true, status: 200, json: { contacts: [] }, text: '' };
        throw new Error('should not send again ' + method + ' ' + url);
      },
    }),
  });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(second.filter((c) => c.url === '/smtp/email').length, 0, 'reruns must not double-send');
  assert.match(r.logs.join('\n'), /already received|already sent|Nothing was sent/i);

  const dryCalls = [];
  r = await quiet({
    EVENT_NAME: 'workflow_dispatch',
    DRY_RUN: 'true',
    NOW: '2026-11-13T09:10:00Z',
    BREVO_API_KEY: 'secret-key',
    BREVO_LIST_ID: '3',
    BREVO_SENDER_EMAIL: 'news@example.com',
  }, {
    request: mockRequest({
      '*': async (key, method, url, body) => {
        dryCalls.push({ method, url, body });
        if (method === 'POST' && url.startsWith('/contacts/attributes/')) return { ok: true, status: 201, json: {}, text: '' };
        if (method === 'GET' && url.startsWith('/contacts?')) return { ok: true, status: 200, json: { contacts: [
          { email: 'due@example.com', attributes: { TIMEZONE: 'America/New_York' } },
          { email: 'west@example.com', attributes: { TIMEZONE: 'America/Los_Angeles' } },
        ] }, text: '' };
        if (method === 'GET' && url.startsWith('/smtp/blockedContacts')) return { ok: true, status: 200, json: { contacts: [] }, text: '' };
        throw new Error('dry run must not send ' + method + ' ' + url);
      },
    }),
  });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(dryCalls.filter((c) => c.url === '/smtp/email' || c.url === '/contacts/batch').length, 0);
  assert.match(r.logs.join('\n'), /America\/New_York/);
  assert.match(r.logs.join('\n'), /America\/Los_Angeles/);
  assert.match(r.logs.join('\n'), /1 due/);
  assert.ok(r.logs.join('\n').includes(entry.verseText));
  assert.ok(!r.logs.join('\n').includes('secret-key'), 'logs must not print the API key');

  const yml = fs.readFileSync(path.join(root, '.github/workflows/devotional-email.yml'), 'utf8');
  assert.match(yml, /cron:\s*'0 \* \* \* \*'/);
  assert.ok(!/cron:\s*'0 8 \* \* \*'/.test(yml));
  assert.ok(!/cron:\s*'0 9 \* \* \*'/.test(yml));
  assert.match(yml, /workflow_dispatch:/);
  assert.match(yml, /dry_run:/);
  assert.match(yml, /test_email:/);
  assert.match(yml, /TEST_EMAIL:/);
  assert.match(yml, /BREVO_API_KEY/);
  assert.match(yml, /BREVO_LIST_ID/);
  assert.match(yml, /BREVO_SENDER_EMAIL/);
  assert.match(yml, /vars\.BREVO_LIST_ID/);
  assert.match(yml, /node tools\/send-devotional-email\.js/);

  const forms = [
    fs.readFileSync(path.join(root, 'devotional.html'), 'utf8'),
    fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'),
  ];
  forms.forEach((src) => {
    assert.match(src, /name="TIMEZONE"/);
    assert.match(src, /4:00 in the morning in your time zone/);
  });
  const emailJs = fs.readFileSync(path.join(root, 'js/devotional-email.js'), 'utf8');
  assert.ok(emailJs.includes('resolvedOptions().timeZone'));
  assert.ok(emailJs.includes('TIMEZONE'));

  const child = spawnSync(process.execPath, [path.join(root, 'tools/send-devotional-email.js')], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, EVENT_NAME: 'schedule', NOW: '2026-11-13T09:30:00Z' },
  });
  assert.strictEqual(child.status, 0, child.stderr);
  assert.match(child.stdout, /Skipping/);
  assert.doesNotMatch(child.stdout + child.stderr, /Error|throw/i);

  assert.strictEqual(mail.parseTestEmail({}).set, false);
  assert.strictEqual(mail.parseTestEmail({ TEST_EMAIL: 'not-an-email' }).ok, false);
  assert.deepStrictEqual(mail.parseTestEmail({ TEST_EMAIL: ' reader@example.com ' }), {
    set: true, ok: true, email: 'reader@example.com',
  });
  const stripped = mail.forTestSend(email.html + '\n' + email.text);
  assert.ok(!stripped.includes(mail.unsubscribeUrl('reader@example.com')));
  assert.ok(stripped.includes('This was a one-off test. The subscriber list was not emailed.'));

  r = await quiet({
    EVENT_NAME: 'schedule',
    TEST_EMAIL: 'not-an-email',
    NOW: '2026-11-13T15:00:00Z',
  });
  assert.strictEqual(r.code, 1);
  assert.match(r.logs.join('\n'), /not an email address/);

  const testCalls = [];
  let listed = 0;
  r = await quiet({
    EVENT_NAME: 'schedule',
    TEST_EMAIL: 'reader@example.com',
    NOW: '2026-11-13T15:00:00Z',
    BREVO_API_KEY: 'secret-key',
    BREVO_LIST_ID: '3',
    BREVO_SENDER_EMAIL: 'news@example.com',
  }, {
    listContacts: async () => { listed += 1; return []; },
    request: async (key, method, url, body) => {
      testCalls.push({ key, method, url, body });
      if (method === 'POST' && url === '/smtp/email') {
        return { ok: true, status: 201, json: { messageId: '<test-message-id@smtp-relay.mailin.fr>' }, text: '{"messageId":"<test-message-id@smtp-relay.mailin.fr>"}' };
      }
      throw new Error('unexpected ' + method + ' ' + url);
    },
  });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(listed, 0, 'a test send must not load the list');
  assert.strictEqual(testCalls.length, 1);
  assert.strictEqual(testCalls[0].url, '/smtp/email');
  assert.deepStrictEqual(testCalls[0].body.to, [{ email: 'reader@example.com' }]);
  assert.ok(testCalls[0].body.subject.startsWith('[Test] '));
  assert.ok(testCalls[0].body.htmlContent.includes(entry.verseText));
  assert.ok(!testCalls[0].body.htmlContent.includes('unsubscribe.html'));
  assert.ok(!JSON.stringify(testCalls[0].body).includes('listIds'));
  assert.match(r.logs.join('\n'), /only to reader@example.com/);
  assert.match(r.logs.join('\n'), /messageId <test-message-id@smtp-relay.mailin.fr>/);
  assert.match(r.logs.join('\n'), /The list was not emailed/);
  assert.ok(!r.logs.join('\n').includes('secret-key'), 'logs must not print the API key');

  console.log('devotional email tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
