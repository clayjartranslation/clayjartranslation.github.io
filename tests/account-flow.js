/* End-to-end: empty config leaves the site unchanged, and a test config
   (in-memory stand-in for Firebase Auth + Firestore) signs in, merges, syncs
   to a second page, resets a password, and deletes the account.
   Run: node tests/account-flow.js
   Needs Chrome and puppeteer-core (installed for this check under /tmp/cjt-tools). */
const assert = require('assert');
const path = require('path');
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) { puppeteer = require('/tmp/cjt-tools/node_modules/puppeteer-core'); }

const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';

function installFake(apple, phone) {
  window.CJT_ACCOUNTS_TEST = {
    apiKey: 'test-key',
    authDomain: 'cjt-test.firebaseapp.com',
    projectId: 'cjt-test',
    appId: '1:1:web:test',
    appleSignIn: !!apple,
    phone: !!phone,
  };
  window.CJT_BACKEND_FACTORY = function () {
    var authListeners = [];
    var watchers = {};
    function read(key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    }
    function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
    function fail(code) { var err = new Error(code); err.code = code; return Promise.reject(err); }
    function session() { return read('cjt-test-session', null); }
    function users() { return read('cjt-test-users', {}); }
    function database() { return read('cjt-test-db', {}); }
    function emitAuth() {
      var current = session();
      authListeners.forEach(function (cb) { cb(current); });
    }
    function emitWatch(uid) {
      var doc = database()[uid] || null;
      (watchers[uid] || []).forEach(function (cb) { try { cb(doc); } catch (e) {} });
    }
    window.addEventListener('storage', function (e) {
      if (e.key === 'cjt-test-db') Object.keys(watchers).forEach(emitWatch);
      if (e.key === 'cjt-test-session') emitAuth();
    });
    function pack(email, record) {
      return { uid: record.uid, email: email, displayName: record.displayName || '', providerIds: record.providerIds.slice() };
    }
    function signInRecord(email, record) {
      var packed = pack(email, record);
      write('cjt-test-session', packed);
      emitAuth();
      return packed;
    }
    return {
      signInGoogle: function () {
        var email = 'google.user@example.com';
        var all = users();
        if (!all[email]) all[email] = { uid: 'google-user', password: '', providerIds: ['google.com'], displayName: 'Google Reader' };
        write('cjt-test-users', all);
        return Promise.resolve(signInRecord(email, all[email]));
      },
      signInApple: function () {
        var email = 'apple.user@example.com';
        var all = users();
        if (!all[email]) all[email] = { uid: 'apple-user', password: '', providerIds: ['apple.com'], displayName: 'Apple Reader' };
        write('cjt-test-users', all);
        return Promise.resolve(signInRecord(email, all[email]));
      },
      signInEmail: function (email, password) {
        email = String(email || '').trim().toLowerCase();
        if (!email || email.indexOf('@') < 0) return fail('auth/invalid-email');
        var record = users()[email];
        if (!record || record.password !== password) return fail('auth/invalid-credential');
        return Promise.resolve(signInRecord(email, record));
      },
      createEmail: function (email, password) {
        email = String(email || '').trim().toLowerCase();
        if (!email || email.indexOf('@') < 0) return fail('auth/invalid-email');
        if (!password || String(password).length < 6) return fail('auth/weak-password');
        var all = users();
        if (all[email]) return fail('auth/email-already-in-use');
        all[email] = { uid: 'u-' + email, password: String(password), providerIds: ['password'], displayName: '' };
        write('cjt-test-users', all);
        return Promise.resolve(signInRecord(email, all[email]));
      },
      sendPhoneCode: function (e164) {
        if (!/^\+[1-9]\d{6,14}$/.test(String(e164 || ''))) return fail('auth/invalid-phone-number');
        write('cjt-test-sms', { e164: String(e164), code: '123456' });
        return Promise.resolve();
      },
      confirmPhoneCode: function (code) {
        var sms = read('cjt-test-sms', null);
        if (!sms || String(code) !== sms.code) return fail('auth/invalid-verification-code');
        var all = users();
        var key = sms.e164;
        if (!all[key]) all[key] = { uid: 'phone-' + key, password: '', providerIds: ['phone'], displayName: '', phoneNumber: key };
        write('cjt-test-users', all);
        var packed = { uid: all[key].uid, email: '', displayName: '', phoneNumber: key, providerIds: ['phone'] };
        write('cjt-test-session', packed);
        emitAuth();
        return Promise.resolve(packed);
      },
      resetPassword: function (email) {
        email = String(email || '').trim().toLowerCase();
        if (!email || email.indexOf('@') < 0) return fail('auth/invalid-email');
        var list = read('cjt-test-resets', []);
        list.push(email);
        write('cjt-test-resets', list);
        return Promise.resolve();
      },
      signOut: function () {
        localStorage.removeItem('cjt-test-session');
        emitAuth();
        return Promise.resolve();
      },
      deleteAccount: function (password) {
        var current = session();
        if (!current) return fail('auth/requires-recent-login');
        var all = users();
        var email = current.email;
        var record = all[email];
        if (current.providerIds.indexOf('password') >= 0) {
          if (!password) return fail('auth/missing-password');
          if (!record || record.password !== password) return fail('auth/invalid-credential');
        }
        delete all[email];
        write('cjt-test-users', all);
        var docs = database();
        delete docs[current.uid];
        write('cjt-test-db', docs);
        localStorage.removeItem('cjt-test-session');
        emitWatch(current.uid);
        emitAuth();
        return Promise.resolve();
      },
      watch: function (uid, cb) {
        watchers[uid] = watchers[uid] || [];
        watchers[uid].push(cb);
        cb(database()[uid] || null);
        return function () { watchers[uid] = (watchers[uid] || []).filter(function (fn) { return fn !== cb; }); };
      },
      save: function (uid, data) {
        var n = read('cjt-test-writes', 0) + 1;
        write('cjt-test-writes', n);
        console.log('CJT_SYNC_WRITE', n, (data.bookmarks || []).map(function (b) { return b.v + (b.deleted ? 'd' : ''); }).join(','), (data.reading && data.reading.v) + '@' + (data.reading && data.reading.t));
        if (n > 12) return Promise.resolve();
        var docs = database();
        docs[uid] = JSON.parse(JSON.stringify(data));
        write('cjt-test-db', docs);
        setTimeout(function () { emitWatch(uid); }, 0);
        return Promise.resolve();
      },
      listen: function (cb) {
        authListeners.push(cb);
        cb(session());
        return function () {};
      },
    };
  };
}

async function prepare(page, apple, phone) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    const t = msg.text();
    if (msg.type() === 'error' || t.indexOf('CJT_SYNC_WRITE') === 0) console.log('PAGE', t);
  });
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument(() => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = function () { return Promise.resolve({}); };
  });
  if (apple !== null) await page.evaluateOnNewDocument(installFake, !!apple, !!phone);
  page.__errors = errors;
  return errors;
}

async function shot(page, name) {
  const file = path.join('/tmp/cjt-audit/after', name + '.png');
  await page.screenshot({ path: file });
}

(async () => {
    const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    // --- Empty config: no account UI, no Firebase, local bookmark still saves. ---
    const plain = await browser.newPage();
    await plain.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const plainErrors = await prepare(plain, null);
    const requests = [];
    plain.on('request', (req) => requests.push(req.url()));
    await plain.goto(BASE + '#/', { waitUntil: 'networkidle0' });
    await plain.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await plain.reload({ waitUntil: 'networkidle0' });
    const empty = await plain.evaluate(() => ({
      account: !!document.getElementById('accountBtn'),
      line: (document.querySelector('.free-line') || {}).textContent || '',
    }));
    assert.strictEqual(empty.account, false, 'sign-in must stay hidden when the config is empty');
    assert.ok(empty.line.includes('no sign-up'), 'home page copy stays as it was when accounts are off');
    assert.ok(!requests.some((url) => /googleapis|gstatic|firebase|firestore/i.test(url)), 'empty config must not call Firebase');
    await plain.goto(BASE + '#/read/genesis/1', { waitUntil: 'networkidle0' });
    await plain.waitForSelector('#v1');
    await plain.evaluate(() => document.getElementById('v1').click());
    await plain.waitForSelector('#tbBm', { visible: true });
    await plain.click('#tbBm');
    const localOnly = await plain.evaluate(() => JSON.parse(localStorage.getItem('cjt-bookmarks') || '[]'));
    assert.strictEqual(localOnly.length, 1, 'logged-out bookmark stays on the device');
    const mergedFile = await plain.evaluate(() => {
      const raw = window.CJT_READER.exportBackup();
      const data = JSON.parse(raw);
      data.bookmarks.push({ id: 'from-file', book: 'genesis', name: 'Genesis', ch: 1, v: 4, text: 'from a file', t: Date.now(), deleted: false });
      const result = window.CJT_READER.importBackup(JSON.stringify(data));
      const bms = JSON.parse(localStorage.getItem('cjt-bookmarks') || '[]').map((b) => b.v);
      return { version: data.version, settings: !!data.settings, audio: Object.prototype.hasOwnProperty.call(data, 'audio'), lastRead: !!data.lastRead, result, bms };
    });
    assert.strictEqual(mergedFile.version, 2);
    assert.ok(mergedFile.settings && mergedFile.audio && mergedFile.lastRead);
    assert.ok(!mergedFile.result.err, mergedFile.result.err);
    assert.ok(mergedFile.bms.indexOf(1) >= 0 && mergedFile.bms.indexOf(4) >= 0, 'import merges and keeps both bookmarks');
    assert.ok(!plainErrors.length, plainErrors.join('\n'));

    await plain.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await plain.goto(BASE + '#/books', { waitUntil: 'networkidle0' });
    await shot(plain, 'books-390');
    const booksFit = await plain.evaluate(() => {
      const doc = document.documentElement;
      const tabs = Array.from(document.querySelectorAll('.tabs .tab'));
      const boxes = tabs.map((el) => el.getBoundingClientRect());
      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        tabs: tabs.length,
        allVisible: boxes.every((r) => r.left >= -1 && r.right <= window.innerWidth + 1 && r.height >= 44),
        heights: boxes.map((r) => Math.round(r.height)),
      };
    });
    assert.ok(booksFit.overflow <= 1, 'books page scrolls sideways: ' + booksFit.overflow);
    assert.strictEqual(booksFit.tabs, 4);
    assert.ok(booksFit.allVisible, 'a collection tab is off screen or under 44px ' + JSON.stringify(booksFit));

    await plain.goto(BASE + '#/read/genesis/1', { waitUntil: 'networkidle0' });
    await plain.click('#settingsBtn');
    await shot(plain, 'settings-390');
    const settingsFit = await plain.evaluate(() => {
      const doc = document.documentElement;
      const panel = document.getElementById('settings').getBoundingClientRect();
      const done = document.querySelector('.settings-foot [data-settings-done]').getBoundingClientRect();
      const visible = (el) => !el.closest('[hidden]') && getComputedStyle(el).display !== 'none';
      const icons = Array.from(document.querySelectorAll('.icon-btn')).filter(visible).map((el) => el.getBoundingClientRect());
      const seg = Array.from(document.querySelectorAll('.seg button')).filter(visible).map((el) => el.getBoundingClientRect());
      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        panelTop: panel.top,
        doneH: done.height,
        doneBottom: done.bottom,
        vh: window.innerHeight,
        icons: icons.every((r) => r.width >= 44 && r.height >= 44),
        seg: seg.every((r) => r.height >= 44),
        account: !!document.getElementById('accountRow'),
      };
    });
    assert.strictEqual(settingsFit.account, false);
    assert.ok(settingsFit.overflow <= 1);
    assert.ok(settingsFit.panelTop > 200, 'settings should sit in the lower part of a phone screen');
    assert.ok(settingsFit.doneH >= 44);
    assert.ok(settingsFit.doneBottom <= settingsFit.vh + 1);
    assert.ok(settingsFit.icons && settingsFit.seg);
    await plain.click('[data-settings-done]');

    await plain.click('#listenBtn');
    await plain.waitForSelector('#player:not([hidden])');
    await plain.click('#plOpts');
    await plain.waitForSelector('#plOptions:not([hidden])');
    await shot(plain, 'player-390');
    const playerFit = await plain.evaluate(() => {
      const player = document.querySelector('.player').getBoundingClientRect();
      const controls = document.querySelector('.player-main').getBoundingClientRect();
      const select = document.querySelector('#plRate');
      const sel = select.getBoundingClientRect();
      const opts = document.querySelector('.player-opts');
      return {
        playerTop: player.top,
        playerBottom: player.bottom,
        controlsBottom: controls.bottom,
        vh: window.innerHeight,
        vw: window.innerWidth,
        selRight: sel.right,
        selH: sel.height,
        font: parseFloat(getComputedStyle(select).fontSize),
        optsCanScroll: opts.scrollHeight > opts.clientHeight + 1 || player.bottom <= window.innerHeight + 1,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.ok(playerFit.playerTop >= -1 && playerFit.playerBottom <= playerFit.vh + 1, 'player is clipped by the screen ' + JSON.stringify(playerFit));
    assert.ok(playerFit.controlsBottom > playerFit.vh - 160, 'play controls should stay in thumb reach');
    assert.ok(playerFit.selRight <= playerFit.vw + 1, 'speed menu runs off the screen');
    assert.ok(playerFit.selH >= 44);
    assert.ok(playerFit.font >= 16, 'selects under 16px zoom the page on iPhone');
    assert.ok(playerFit.overflow <= 1);
    const fn = await plain.evaluate(() => {
      const r = document.querySelector('.fn').getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    assert.ok(fn.w >= 44 && fn.h >= 44, 'footnote tap area');
    await plain.close();

    // --- Test config: email account, merge, second device, reset, delete. ---
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const errors = await prepare(page, false);
    await page.goto(BASE + '#/', { waitUntil: 'networkidle0' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: 'networkidle0' });
    await shot(page, 'home-signed-out-390');
    const offered = await page.evaluate(() => {
      const line = document.querySelector('.free-line').textContent;
      const apple = document.getElementById('accountApple');
      const phone = document.getElementById('accountPhone');
      const note = document.getElementById('accountSyncNote');
      return {
        line,
        appleHidden: !apple || apple.hidden,
        phoneHidden: !phone || phone.hidden,
        hasSignIn: !!document.getElementById('accountBtn'),
        note: note ? note.textContent : '',
        exportBtn: !!document.getElementById('accountExport'),
      };
    });
    assert.ok(offered.hasSignIn);
    assert.ok(offered.appleHidden, 'Apple stays hidden until the config flag is true');
    assert.ok(offered.phoneHidden, 'Phone stays hidden until the config flag is true');
    assert.ok(offered.note.includes('Nothing leaves this device'));
    assert.ok(offered.exportBtn, 'backup file is on the account screen without signing in');
    assert.ok(offered.line.includes('no account required'));

    await page.goto(BASE + '#/read/genesis/1', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#v1');
    await page.evaluate(() => document.getElementById('v1').click());
    await page.waitForSelector('#tbBm', { visible: true });
    await page.click('#tbBm');
    await page.evaluate(() => document.getElementById('v1').click());
    await page.waitForSelector('.tb-color[data-color="blue"]', { visible: true });
    await page.click('.tb-color[data-color="blue"]');

    await page.click('#settingsBtn');
    await page.click('#accountBtn');
    await page.waitForSelector('#accountForm', { visible: true });
    await page.type('#accountEmail', 'reader@example.com');
    await page.click('#accountForgot');
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('cjt-test-resets') || '[]')).includes('reader@example.com'));
    await page.click('#accountMode');
    await page.type('#accountPassword', 'reader-pass');
    await page.click('#accountSubmit');
    await page.waitForFunction(() => {
      const who = document.getElementById('accountWho');
      return who && who.textContent.indexOf('reader@example.com') >= 0;
    });
    await shot(page, 'account-signed-in-390');
    await page.waitForFunction(() => {
      const db = JSON.parse(localStorage.getItem('cjt-test-db') || '{}');
      const bms = (((Object.values(db)[0] || {}).bookmarks) || []).filter((b) => !b.deleted);
      return bms.some((b) => b.v === 1);
    });
    const cloud = await page.evaluate(() => JSON.parse(localStorage.getItem('cjt-test-db')));
    const doc = Object.values(cloud)[0];
    assert.ok(doc.highlights.some((h) => !h.deleted && h.color === 'blue'), 'highlight color synced');
    assert.ok(doc.settings && doc.settings.theme, 'settings synced');
    const writesAfterSignIn = await page.evaluate(() => JSON.parse(localStorage.getItem('cjt-test-writes') || '0'));
    assert.ok(writesAfterSignIn < 15, 'sync wrote too many times: ' + writesAfterSignIn);

    await page.click('#accountSignOut');
    await page.waitForSelector('#accountSignOutKeep', { visible: true });
    await page.click('#accountSignOutKeep');
    await page.waitForFunction(() => !localStorage.getItem('cjt-test-session'));
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('cjt-bookmarks') || '[]').length);
    assert.strictEqual(kept, 1, 'sign out keeps the on-device copy');

    await page.waitForSelector('#accountPassword', { visible: true });
    const modeLabel = await page.$eval('#accountMode', (el) => el.textContent);
    if (modeLabel.indexOf('already') >= 0) await page.click('#accountMode');
    await page.evaluate(() => {
      document.getElementById('accountEmail').value = 'reader@example.com';
      document.getElementById('accountPassword').value = 'wrong-password';
    });
    await page.click('#accountSubmit');
    await page.waitForSelector('#accountError:not([hidden])');
    const wrong = await page.evaluate(() => document.getElementById('accountError').textContent);
    assert.ok(/do not match/i.test(wrong), wrong);

    await page.evaluate(() => { document.getElementById('accountPassword').value = 'reader-pass'; });
    await page.click('#accountSubmit');
    await page.waitForFunction(() => (document.getElementById('accountWho') || {}).textContent && document.getElementById('accountWho').textContent.indexOf('reader@') >= 0);

    const page2 = await context.newPage();
    await page2.setViewport({ width: 360, height: 780, isMobile: true, hasTouch: true });
    await prepare(page2, false);
    await page2.evaluateOnNewDocument(() => {
      ['cjt-bookmarks', 'cjt-highlights', 'cjt-tombstones', 'cjt-last', 'cjt-audio', 'cjt-settings'].forEach((k) => localStorage.removeItem(k));
    });
    await page2.goto(BASE + '#/saved/bookmarks', { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction(() => document.body.innerText.indexOf('Genesis 1:1') >= 0, { timeout: 8000 });
    await page.close();
    await page2.goto(BASE + '#/read/genesis/1', { waitUntil: 'domcontentloaded' });
    await page2.waitForSelector('#v2');
    await page2.evaluate(() => document.getElementById('v2').click());
    await page2.waitForSelector('#tbBm', { visible: true });
    await page2.click('#tbBm');
    await page2.waitForFunction(() => {
      const db = JSON.parse(localStorage.getItem('cjt-test-db') || '{}');
      const bms = ((Object.values(db)[0] || {}).bookmarks || []).filter((b) => !b.deleted);
      return bms.some((b) => b.v === 1) && bms.some((b) => b.v === 2);
    }, { timeout: 8000 });
    await page2.evaluate(() => { location.hash = '#/saved/bookmarks'; });
    await page2.waitForFunction(() => document.body.innerText.indexOf('Genesis 1:2') >= 0 && document.body.innerText.indexOf('Genesis 1:1') >= 0);

    await page2.click('#settingsBtn');
    await page2.click('#accountBtn');
    await page2.waitForSelector('#accountDelete', { visible: true });
    await page2.click('#accountDelete');
    await page2.waitForSelector('#accountDeletePassword', { visible: true });
    await page2.type('#accountDeletePassword', 'reader-pass');
    await page2.click('#accountDeleteYes');
    await page2.waitForFunction(() => !localStorage.getItem('cjt-test-session'));
    const afterDelete = await page2.evaluate(() => ({
      db: localStorage.getItem('cjt-test-db'),
      bm: localStorage.getItem('cjt-bookmarks'),
      users: JSON.parse(localStorage.getItem('cjt-test-users') || '{}'),
    }));
    assert.ok(!afterDelete.users['reader@example.com'], 'account record removed');
    const leftover = JSON.parse(afterDelete.db || '{}');
    assert.ok(!Object.keys(leftover).length, 'cloud document removed');
    assert.ok(!afterDelete.bm || JSON.parse(afterDelete.bm).length === 0, 'on-device bookmarks removed with the account');
    assert.ok(!errors.length, errors.join('\n'));
    await page2.close();
    await context.close();

    // Apple flag on: the button is shown and completes against the test backend.
    const applePage = await browser.newPage();
    await applePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const appleErrors = await prepare(applePage, true);
    await applePage.goto(BASE + '#/', { waitUntil: 'networkidle0' });
    await applePage.click('#settingsBtn');
    await applePage.click('#accountBtn');
    await applePage.waitForSelector('#accountApple', { visible: true });
    await applePage.click('#accountApple');
    await applePage.waitForFunction(() => (document.getElementById('accountWho') || {}).textContent === 'apple.user@example.com');
    assert.ok(!appleErrors.length, appleErrors.join('\n'));

    const googlePage = await browser.newPage();
    await prepare(googlePage, false);
    await googlePage.setViewport({ width: 412, height: 823, isMobile: true, hasTouch: true });
    await googlePage.goto(BASE + '#/', { waitUntil: 'networkidle0' });
    await googlePage.evaluate(() => localStorage.clear());
    await googlePage.reload({ waitUntil: 'networkidle0' });
    await googlePage.click('#settingsBtn');
    await googlePage.click('#accountBtn');
    await googlePage.click('#accountGoogle');
    await googlePage.waitForFunction(() => (document.getElementById('accountWho') || {}).textContent === 'google.user@example.com');
    const rate = await googlePage.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('cjt-settings') || '{}');
      s.rate = 1.25;
      s.updatedAt = Date.now();
      localStorage.setItem('cjt-settings', JSON.stringify(s));
      document.getElementById('plRate').value = '1.25';
      document.getElementById('plRate').dispatchEvent(new Event('change'));
      return true;
    });
    assert.ok(rate);
    await googlePage.waitForFunction(() => {
      const db = JSON.parse(localStorage.getItem('cjt-test-db') || '{}');
      const doc = Object.values(db)[0];
      return doc && doc.settings && doc.settings.rate === 1.25;
    });
    await googlePage.close();
    await applePage.close();

    const phonePage = await browser.newPage();
    await phonePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const phoneErrors = await prepare(phonePage, false, true);
    await phonePage.goto(BASE + '#/', { waitUntil: 'domcontentloaded' });
    await phonePage.evaluate(() => localStorage.clear());
    await phonePage.reload({ waitUntil: 'domcontentloaded' });
    await phonePage.waitForSelector('#accountBtn');
    const phoneFlags = await phonePage.evaluate(() => ({
      phone: !!(window.CJT_ACCOUNTS_TEST && window.CJT_ACCOUNTS_TEST.phone),
      hidden: document.getElementById('accountPhone') ? document.getElementById('accountPhone').hidden : null,
    }));
    if (!phoneFlags.phone || phoneFlags.hidden !== false) throw new Error('phone flag ' + JSON.stringify(phoneFlags));
    await phonePage.click('#settingsBtn');
    await phonePage.click('#accountBtn');
    await phonePage.waitForSelector('#accountDialog:not([hidden])');
    await phonePage.waitForSelector('#accountPhone', { visible: true });
    await phonePage.click('#accountPhone');
    await phonePage.select('#accountCountry', 'US');
    await phonePage.type('#accountPhoneNumber', '2025550143');
    await phonePage.click('#accountPhoneSend');
    await phonePage.waitForFunction(() => !!localStorage.getItem('cjt-test-sms'));
    await phonePage.type('#accountPhoneCode', '123456');
    await phonePage.click('#accountPhoneConfirm');
    await phonePage.waitForFunction(() => (document.getElementById('accountWho') || {}).textContent === '+12025550143');
    const bad = await phonePage.evaluate(() => window.CJT_PHONE.toE164('US', '12'));
    assert.ok(bad.error);
    assert.ok(!phoneErrors.length, phoneErrors.join('\n'));
    await phonePage.close();
    console.log('account flow tests passed');
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
