/* Optional sign-in. If js/account-config.js is still empty, this file does nothing:
   no button, no Firebase, no network. Reading stays on this device, as before.
   Automated tests may set window.CJT_ACCOUNTS_TEST and window.CJT_BACKEND_FACTORY
   before this file runs. Neither is set on the public site. */
(function () {
  'use strict';

  var cfg = window.CJT_ACCOUNTS_TEST || window.CJT_ACCOUNTS || {};
  if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) return;
  if (!window.CJT_READER || !window.CJT_SYNC) return;

  var reader = window.CJT_READER;
  var sync = window.CJT_SYNC;
  var user = null;
  var backend = null;
  var unwatch = null;
  var pushTimer = null;
  var lastRemote = null;
  var lastSavedCanon = '';
  var applying = false;
  var creating = false;
  var ready = null;

  function $(sel, el) { return (el || document).querySelector(sel); }
  function canon(state) { return JSON.stringify(sync.normalize(state)); }
  function human(err) {
    var code = err && err.code || '';
    var map = {
      'auth/invalid-email': 'That email address does not look right.',
      'auth/missing-password': 'Enter a password.',
      'auth/weak-password': 'Use a password of at least 6 characters.',
      'auth/email-already-in-use': 'That email already has an account. Sign in instead, or reset the password.',
      'auth/invalid-credential': 'That email and password do not match.',
      'auth/wrong-password': 'That email and password do not match.',
      'auth/user-not-found': 'That email and password do not match.',
      'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
      'auth/popup-closed-by-user': 'Sign-in was cancelled.',
      'auth/cancelled-popup-request': 'Sign-in was cancelled.',
      'auth/popup-blocked': 'The browser blocked the sign-in window. Allow pop-ups for this site, or try again.',
      'auth/account-exists-with-different-credential': 'An account with that email already exists with a different sign-in method. Sign in with the method you used first.',
      'auth/network-request-failed': 'The network could not be reached. Your reading is still saved on this device.',
      'auth/requires-recent-login': 'Please confirm it is you, then try deleting again.',
      'auth/unauthorized-domain': 'This website is not on the Firebase authorized domains list yet.',
      'auth/operation-not-allowed': 'That sign-in method is not turned on in the Firebase project yet.',
      'auth/invalid-api-key': 'The account config in js/account-config.js does not match a Firebase project.',
      'auth/invalid-phone-number': 'That phone number is not valid. Check the country and the digits.',
      'auth/missing-phone-number': 'Enter your phone number.',
      'auth/invalid-verification-code': 'That code does not match. Request a new one and try again.',
      'auth/code-expired': 'That code expired. Request a new one.',
      'auth/missing-verification-code': 'Enter the code from the text message.',
      'auth/captcha-check-failed': 'The sign-in check failed. Reload the page and try again.',
      'auth/quota-exceeded': 'Phone sign-in is temporarily unavailable.',
    };
    return map[code] || 'That did not work. Your reading is still saved on this device.';
  }

  function showError(msg) {
    var el = $('#accountError');
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
  }

  function setStatus(msg) {
    var nodes = document.querySelectorAll('[data-account-status]');
    nodes.forEach(function (el) { el.textContent = msg; });
  }

  function paintAccount() {
    var signedIn = !!user;
    var out = $('#accountSignedOut');
    var inn = $('#accountSignedIn');
    if (out) out.hidden = signedIn;
    if (inn) inn.hidden = !signedIn;
    var title = $('#accountTitle');
    if (title && signedIn) title.textContent = 'Account';
    if (title && !signedIn) title.textContent = creating ? 'Create account' : 'Sign in';
    var btn = $('#accountBtn');
    if (btn) btn.textContent = signedIn ? 'Account' : 'Sign in';
    var who = $('#accountWho');
    if (who) who.textContent = signedIn ? (user.phoneNumber || user.email || user.displayName || 'Signed in') : '';
    var pw = $('#accountDeletePassword');
    var pwLabel = $('#accountDeletePasswordLabel');
    var needsPw = signedIn && user.providerIds && user.providerIds.indexOf('password') >= 0;
    if (pw) pw.hidden = !needsPw;
    if (pwLabel) pwLabel.hidden = !needsPw;
    if (!signedIn) setStatus('Optional. Reading stays free without an account.');
    var apple = $('#accountApple');
    if (apple) apple.hidden = cfg.appleSignIn !== true;
    var phoneBtn = $('#accountPhone');
    if (phoneBtn) phoneBtn.hidden = cfg.phone !== true;
    var phoneBox = $('#accountPhoneBox');
    if (phoneBox && cfg.phone !== true) phoneBox.hidden = true;
    var phoneDelete = $('#accountDeleteSend');
    var phoneUser = signedIn && user.providerIds && user.providerIds.indexOf('phone') >= 0;
    if (phoneDelete) phoneDelete.hidden = !phoneUser;
    var codeLabel = $('#accountDeleteCodeLabel');
    var codeInput = $('#accountDeleteCode');
    if (codeLabel) codeLabel.hidden = !phoneUser;
    if (codeInput) codeInput.hidden = !phoneUser;
  }

  function explainCopy() {
    document.querySelectorAll('.free-line').forEach(function (el) {
      el.innerHTML = '<strong>Free forever:</strong> no account required, no ads, no tracking.';
    });
    var lead = $('#bkLead');
    if (!lead) return;
    lead.textContent = user
      ? 'Bookmarks and highlights are saved on this device and synced to your account. A backup file is an extra copy you keep yourself.'
      : 'Bookmarks and highlights are saved on this device. Sign in from the menu if you also want them on your other devices. A backup file is a copy you keep yourself.';
  }
  window.CJT_AFTER_ROUTE = explainCopy;

  function buildUI() {
    var foot = $('.settings-foot');
    var row = document.createElement('div');
    row.className = 'setting account-row';
    row.id = 'accountRow';
    row.innerHTML = '<div class="account-copy"><span class="setting-label">Account</span><p class="account-status" id="accountStatus" data-account-status>Optional. Reading stays free without an account.</p></div><button type="button" class="btn" id="accountBtn" aria-haspopup="dialog" aria-controls="accountDialog">Sign in</button>';
    if (foot && foot.parentNode) foot.parentNode.insertBefore(row, foot);
    else $('#settings').appendChild(row);

    var dialog = document.createElement('div');
    dialog.className = 'account-dialog';
    dialog.id = 'accountDialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'accountTitle');
    dialog.hidden = true;
    dialog.innerHTML = [
      '<div class="account-card">',
      '<div class="account-head"><h2 id="accountTitle">Sign in</h2><button type="button" class="icon-btn" id="accountClose" aria-label="Close account"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>',
      '<p class="account-sync-note" id="accountSyncNote">Nothing leaves this device until you sign in. Signing in is optional. If you do, this browser’s bookmarks, highlights, reading place, listening place, and reading settings are copied to your account and merged with what is already saved there, so your other devices can use them. The Bible stays free either way. No ads.</p>',
      '<p class="account-privacy">The sign-in session stays in this browser only. It is not a cookie we share with advertisers, and we do not run a separate account server. <a href="privacy.html">Privacy Policy</a> · <a href="terms.html">Terms of Service</a></p>',
      '<section class="account-backup" id="accountBackup" aria-labelledby="accountBackupTitle">',
      '<h3 id="accountBackupTitle">Backup file</h3>',
      '<p class="account-hint">No account needed. The file stays with you. Restoring merges it into this device: nothing already here is thrown away, and the newer place or setting wins.</p>',
      '<div class="account-actions">',
      '<button type="button" class="btn" id="accountExport">Save backup file</button>',
      '<label class="btn" for="accountImport">Restore from file</label>',
      '<input id="accountImport" type="file" accept="application/json,.json" class="visually-hidden">',
      '</div>',
      '<p class="account-hint" id="accountBackupMsg" role="status" aria-live="polite"></p>',
      '</section>',
      '<div id="accountSignedOut">',
      '<button type="button" class="btn primary account-wide" id="accountGoogle">Continue with <span class="notranslate" translate="no">Google</span></button>',
      '<button type="button" class="btn account-wide" id="accountGithub">Continue with <span class="notranslate" translate="no">GitHub</span></button>',
      '<button type="button" class="btn account-wide" id="accountApple">Sign in with Apple</button>',
      '<button type="button" class="btn account-wide" id="accountPhone">Continue with phone</button>',
      '<div id="accountPhoneBox" hidden>',
      '<label for="accountCountry">Country</label>',
      '<select id="accountCountry"></select>',
      '<label for="accountPhoneNumber">Phone number</label>',
      '<input id="accountPhoneNumber" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" placeholder="National number">',
      '<button type="button" class="btn account-wide" id="accountPhoneSend">Text me a code</button>',
      '<label for="accountPhoneCode">Code from the text message</label>',
      '<input id="accountPhoneCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="6 digits">',
      '<button type="button" class="btn primary account-wide" id="accountPhoneConfirm">Verify code</button>',
      '<div id="accountRecaptcha"></div>',
      '</div>',
      '<p class="account-or">or use email</p>',
      '<form id="accountForm">',
      '<label for="accountEmail">Email</label>',
      '<input id="accountEmail" name="email" type="email" autocomplete="username" inputmode="email" required maxlength="200">',
      '<label for="accountPassword">Password</label>',
      '<input id="accountPassword" name="password" type="password" autocomplete="current-password" required minlength="6" maxlength="200">',
      '<p class="account-hint">At least 6 characters. Reset it any time from this screen.</p>',
      '<p class="account-error" id="accountError" role="alert" hidden></p>',
      '<button type="submit" class="btn primary account-wide" id="accountSubmit">Sign in</button>',
      '<button type="button" class="btn account-wide" id="accountMode">Create an account</button>',
      '<button type="button" class="btn account-text" id="accountForgot">Email me a password reset</button>',
      '</form></div>',
      '<div id="accountSignedIn" hidden>',
      '<p id="accountWho"></p>',
      '<p class="account-status" data-account-status>Checking your saved progress…</p>',
      '<button type="button" class="btn account-wide" id="accountSignOut">Sign out</button>',
      '<div id="accountSignOutBox" hidden>',
      '<p>Your account stays. Choose what happens to the copy in this browser. Text size and appearance stay either way.</p>',
      '<div class="account-actions">',
      '<button type="button" class="btn" id="accountSignOutKeep">Keep data on this device</button>',
      '<button type="button" class="btn" id="accountSignOutClear">Remove bookmarks, highlights, and places from this device</button>',
      '<button type="button" class="btn" id="accountSignOutCancel">Cancel</button>',
      '</div></div>',
      '<button type="button" class="btn account-danger account-wide" id="accountDelete">Delete my data and account</button>',
      '<div id="accountDeleteBox" hidden>',
      '<p>This permanently deletes the progress stored for your account, and the bookmarks, highlights, reading place, and listening place on this device. Text size and appearance on this device stay as they are. This cannot be undone.</p>',
      '<label id="accountDeletePasswordLabel" for="accountDeletePassword">Confirm your password</label>',
      '<input id="accountDeletePassword" type="password" autocomplete="current-password">',
      '<button type="button" class="btn account-wide" id="accountDeleteSend" hidden>Text me a code to confirm</button>',
      '<label id="accountDeleteCodeLabel" for="accountDeleteCode" hidden>Code from the text message</label>',
      '<input id="accountDeleteCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" hidden>',
      '<p class="account-error" id="accountDeleteError" role="alert" hidden></p>',
      '<div class="account-actions"><button type="button" class="btn account-danger" id="accountDeleteYes">Delete everything</button><button type="button" class="btn" id="accountDeleteNo">Cancel</button></div>',
      '</div></div></div>',
    ].join('');
    document.body.appendChild(dialog);
    paintAccount();
    explainCopy();

    $('#accountBtn').addEventListener('click', function () { openDialog(); });
    $('#accountClose').addEventListener('click', closeDialog);
    dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDialog(); });
    dialog.addEventListener('keydown', trapKeys);
    $('#accountGoogle').addEventListener('click', function () { runProvider('google'); });
    $('#accountGithub').addEventListener('click', function () { runProvider('github'); });
    $('#accountApple').addEventListener('click', function () { runProvider('apple'); });
    $('#accountForm').addEventListener('submit', onSubmit);
    $('#accountMode').addEventListener('click', toggleMode);
    $('#accountForgot').addEventListener('click', onForgot);
    $('#accountSignOut').addEventListener('click', function () { $('#accountSignOutBox').hidden = false; });
    $('#accountSignOutCancel').addEventListener('click', function () { $('#accountSignOutBox').hidden = true; });
    $('#accountSignOutKeep').addEventListener('click', function () { finishSignOut(false); });
    $('#accountSignOutClear').addEventListener('click', function () { finishSignOut(true); });
    fillCountries();
    $('#accountPhone').addEventListener('click', function () {
      var box = $('#accountPhoneBox');
      box.hidden = !box.hidden;
      if (!box.hidden) $('#accountPhoneNumber').focus();
    });
    $('#accountPhoneSend').addEventListener('click', sendPhoneCode);
    $('#accountPhoneConfirm').addEventListener('click', confirmPhoneCode);
    $('#accountDelete').addEventListener('click', function () {
      $('#accountDeleteBox').hidden = false;
      paintAccount();
      var pw = $('#accountDeletePassword');
      if (pw && !pw.hidden) pw.focus(); else $('#accountDeleteYes').focus();
    });
    var deleteSend = $('#accountDeleteSend');
    if (deleteSend) deleteSend.addEventListener('click', sendPhoneCodeForDelete);
    $('#accountDeleteNo').addEventListener('click', function () {
      $('#accountDeleteBox').hidden = true;
      var err = $('#accountDeleteError'); if (err) { err.hidden = true; err.textContent = ''; }
    });
    $('#accountDeleteYes').addEventListener('click', onDelete);
    $('#accountExport').addEventListener('click', downloadBackup);
    $('#accountImport').addEventListener('change', onImportFile);
  }

  function openDialog() {
    var dialog = $('#accountDialog');
    dialog.hidden = false;
    document.body.classList.add('account-open');
    paintAccount();
    var focus = user ? $('#accountSignOut') : $('#accountEmail');
    if (focus) focus.focus();
  }
  function closeDialog() {
    var dialog = $('#accountDialog');
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    document.body.classList.remove('account-open');
    var box = $('#accountDeleteBox'); if (box) box.hidden = true;
    showError('');
    var btn = $('#accountBtn'); if (btn) btn.focus();
  }
  function trapKeys(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDialog(); return; }
    if (e.key !== 'Tab') return;
    var dialog = $('#accountDialog');
    var items = Array.prototype.slice.call(dialog.querySelectorAll('button, input, a')).filter(function (el) {
      return !el.hidden && !el.closest('[hidden]') && !el.disabled;
    });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function toggleMode() {
    creating = !creating;
    $('#accountSubmit').textContent = creating ? 'Create account' : 'Sign in';
    $('#accountMode').textContent = creating ? 'I already have an account' : 'Create an account';
    $('#accountPassword').setAttribute('autocomplete', creating ? 'new-password' : 'current-password');
    var title = $('#accountTitle'); if (title && !user) title.textContent = creating ? 'Create account' : 'Sign in';
    showError('');
  }

  function ensure() {
    if (backend) return Promise.resolve(backend);
    if (!ready) {
      ready = connect().then(function (api) { backend = api; return api; }).catch(function (err) { ready = null; throw err; });
    }
    return ready;
  }

  async function runProvider(kind, fromHome) {
    showError('');
    var btns = [].slice.call(document.querySelectorAll('[data-provider="' + kind + '"], #' + (kind === 'apple' ? 'accountApple' : kind === 'github' ? 'accountGithub' : 'accountGoogle')));
    btns.forEach(function (b) { b.disabled = true; });
    try {
      var api = await ensure();
      if (kind === 'apple') await api.signInApple();
      else if (kind === 'github') await api.signInGithub();
      else await api.signInGoogle();
    } catch (e) {
      if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        showError(human(e));
        if (fromHome) openDialog();
      }
    } finally { btns.forEach(function (b) { b.disabled = false; }); }
  }

  // Sign-in buttons on the landing page itself (not only in the menu).
  function isHome() { return !location.hash || location.hash === '#' || location.hash === '#/'; }
  function paintHomeSignIn() {
    var main = $('#main');
    if (!main) return;
    var old = $('#homeSignIn', main);
    if (user || !isHome()) { if (old) old.remove(); return; }
    if (old) return;
    var hero = $('.hero', main);
    if (!hero) return;
    var box = document.createElement('div');
    box.className = 'home-signin';
    box.id = 'homeSignIn';
    box.innerHTML = '<p class="home-signin-lead">Sign in to save your place on your other devices. Optional: your reading stays on this device unless you sign in.</p>'
      + '<div class="home-signin-btns">'
      + '<button type="button" class="btn primary" data-provider="google">Continue with <span class="notranslate" translate="no">Google</span></button>'
      + '<button type="button" class="btn" data-provider="github">Continue with <span class="notranslate" translate="no">GitHub</span></button>'
      + '<button type="button" class="btn" data-home-email>Use email</button>'
      + '</div>';
    var cta = $('.cta', hero);
    if (cta && cta.parentNode) cta.parentNode.insertBefore(box, cta.nextSibling); else hero.appendChild(box);
    $('[data-provider="google"]', box).addEventListener('click', function () { runProvider('google', true); });
    $('[data-provider="github"]', box).addEventListener('click', function () { runProvider('github', true); });
    $('[data-home-email]', box).addEventListener('click', function () { openDialog(); });
  }
  function watchHome() {
    var main = $('#main');
    if (!main || typeof MutationObserver !== 'function') return;
    new MutationObserver(function () { paintHomeSignIn(); }).observe(main, { childList: true });
    paintHomeSignIn();
  }

  async function onSubmit(e) {
    e.preventDefault();
    showError('');
    var email = $('#accountEmail').value.trim();
    var password = $('#accountPassword').value;
    var submit = $('#accountSubmit');
    submit.disabled = true;
    try {
      var api = await ensure();
      if (creating) await api.createEmail(email, password);
      else await api.signInEmail(email, password);
    } catch (err) { showError(human(err)); }
    finally { submit.disabled = false; }
  }

  async function onForgot() {
    showError('');
    var email = $('#accountEmail').value.trim();
    if (!email) { showError('Enter your email, then tap the reset button.'); return; }
    try {
      var api = await ensure();
      await api.resetPassword(email);
      reader.toast('If that email can sign in, a reset message is on its way.');
    } catch (err) {
      if (err && (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')) reader.toast('If that email can sign in, a reset message is on its way.');
      else showError(human(err));
    }
  }

  function fillCountries() {
    var sel = $('#accountCountry');
    if (!sel || !window.CJT_PHONE) return;
    var list = window.CJT_PHONE.countries;
    sel.textContent = '';
    list.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.iso;
      opt.textContent = c.name + ' +' + c.dial;
      sel.appendChild(opt);
    });
    var guess = window.CJT_PHONE.guessIso();
    if (list.some(function (c) { return c.iso === guess; })) sel.value = guess;
  }
  function phoneNumberFromForm() {
    if (!window.CJT_PHONE) return { error: 'Phone sign-in is not available.' };
    return window.CJT_PHONE.toE164($('#accountCountry').value, $('#accountPhoneNumber').value);
  }
  async function sendPhoneCode() {
    showError('');
    var parsed = phoneNumberFromForm();
    if (parsed.error) { showError(parsed.error); return; }
    var btn = $('#accountPhoneSend');
    btn.disabled = true;
    try {
      var api = await ensure();
      await api.sendPhoneCode(parsed.e164);
      reader.toast('If phone sign-in is turned on, a code is on the way.');
      $('#accountPhoneCode').focus();
    } catch (err) { showError(human(err)); }
    finally { btn.disabled = false; }
  }
  async function confirmPhoneCode() {
    showError('');
    var code = $('#accountPhoneCode').value.trim();
    if (!code) { showError('Enter the code from the text message.'); return; }
    var btn = $('#accountPhoneConfirm');
    btn.disabled = true;
    try {
      var api = await ensure();
      await api.confirmPhoneCode(code);
    } catch (err) { showError(human(err)); }
    finally { btn.disabled = false; }
  }
  async function sendPhoneCodeForDelete() {
    var errEl = $('#accountDeleteError');
    errEl.hidden = true;
    try {
      var api = await ensure();
      await api.sendPhoneCode(user.phoneNumber);
      reader.toast('A code is on the way.');
      $('#accountDeleteCode').focus();
    } catch (err) {
      errEl.hidden = false;
      errEl.textContent = human(err);
    }
  }
  function downloadBackup() {
    var text = reader.exportBackup();
    var name = 'cjt-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    var msg = $('#accountBackupMsg');
    if (msg) msg.textContent = 'Backup file saved on this device. It is not uploaded.';
  }
  async function onImportFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var msg = $('#accountBackupMsg');
    try {
      var text = await file.text();
      var result = reader.importBackup(text);
      if (msg) msg.textContent = result.err || ('Merged the file into this device (' + result.nb + ' new bookmarks, ' + result.nh + ' new highlights).');
    } catch (err) {
      if (msg) msg.textContent = 'That file could not be read.';
    }
  }
  async function finishSignOut(clear) {
    try {
      var api = await ensure();
      await api.signOut();
      if (clear) reader.clearSyncedLocal();
      var box = $('#accountSignOutBox');
      if (box) box.hidden = true;
      reader.toast(clear
        ? 'Signed out. Bookmarks, highlights, and places were removed from this device. The account is still there until you delete it.'
        : 'Signed out. The copy on this device stays here.');
    } catch (err) { showError(human(err)); }
  }

  async function onDelete() {
    var errEl = $('#accountDeleteError');
    errEl.hidden = true; errEl.textContent = '';
    var yes = $('#accountDeleteYes');
    yes.disabled = true;
    try {
      var api = await ensure();
      var phoneUser = user && user.providerIds && user.providerIds.indexOf('phone') >= 0;
      var secret = phoneUser ? ($('#accountDeleteCode') ? $('#accountDeleteCode').value.trim() : '') : ($('#accountDeletePassword') ? $('#accountDeletePassword').value : '');
      await api.deleteAccount(secret);
      reader.clearSyncedLocal();
      reader.toast('Your account and synced progress were deleted. Anything still in a backup file is untouched.');
      closeDialog();
    } catch (err) {
      errEl.hidden = false;
      errEl.textContent = human(err);
    } finally { yes.disabled = false; }
  }

  function stopWatch() {
    if (unwatch) { try { unwatch(); } catch (e) {} unwatch = null; }
    clearTimeout(pushTimer);
    lastRemote = null;
    lastSavedCanon = '';
  }

  async function pushLocal() {
    if (!user || applying || !backend) return;
    var local = reader.exportState();
    var merged = sync.mergeState(local, lastRemote || sync.emptyState());
    var text = canon(merged);
    if (text === lastSavedCanon) return;
    // Remember this payload before the write. The watch callback can run
    // before save() returns, and must not start another write of the same thing.
    lastSavedCanon = text;
    lastRemote = merged;
    try {
      await backend.save(user.uid, merged);
      setStatus('Synced across your devices.');
    } catch (e) {
      lastSavedCanon = '';
      setStatus('Saved on this device. Sync will retry when you are back online.');
    }
  }

  function onRemote(data) {
    if (!user) return;
    var remote = data || sync.emptyState();
    var remoteText = canon(remote);
    if (remoteText === lastSavedCanon) {
      lastRemote = sync.normalize(remote);
      setStatus('Synced across your devices.');
      explainCopy();
      return;
    }
    var local = reader.exportState();
    var merged = sync.mergeState(local, remote);
    var mergedText = canon(merged);
    lastRemote = merged;
    if (canon(local) !== mergedText) {
      applying = true;
      try { reader.applyRemoteState(merged); }
      finally { applying = false; }
    }
    if (mergedText !== remoteText) pushLocal();
    else { lastSavedCanon = mergedText; setStatus('Synced across your devices.'); }
    explainCopy();
  }

  function onUser(next) {
    user = next;
    paintAccount();
    explainCopy();
    paintHomeSignIn();
    stopWatch();
    if (!next) return;
    setStatus('Checking your saved progress…');
    unwatch = backend.watch(next.uid, onRemote);
  }

  reader.subscribe(function () {
    if (!user || applying) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushLocal, 800);
  });

  async function connect() {
    if (typeof window.CJT_BACKEND_FACTORY === 'function') return window.CJT_BACKEND_FACTORY(cfg);
    return connectFirebase(cfg);
  }

  async function connectFirebase(config) {
    var ver = '11.6.0';
    var base = 'https://www.gstatic.com/firebasejs/' + ver + '/';
    var appMod = await import(base + 'firebase-app.js');
    var authMod = await import(base + 'firebase-auth.js');
    var fsMod = await import(base + 'firebase-firestore.js');
    var app = appMod.initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      appId: config.appId,
      storageBucket: config.storageBucket || undefined,
      messagingSenderId: config.messagingSenderId || undefined,
    });
    var auth = authMod.getAuth(app);
    try { await authMod.setPersistence(auth, authMod.browserLocalPersistence); } catch (e) {}
    var db;
    try {
      db = fsMod.initializeFirestore(app, {
        localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
      });
    } catch (e) {
      db = fsMod.getFirestore(app);
    }
    try { await authMod.getRedirectResult(auth); } catch (e) { setTimeout(function () { showError(human(e)); openDialog(); }, 0); }

    function pack(u) {
      if (!u) return null;
      return {
        uid: u.uid,
        email: u.email || '',
        displayName: u.displayName || '',
        phoneNumber: u.phoneNumber || '',
        providerIds: (u.providerData || []).map(function (p) { return p.providerId; }),
      };
    }
    // The session lives only in this browser (local persistence). It is not a
    // cookie sent to other sites, and this project does not run its own session server.
    // setPersistence above uses browserLocalPersistence and nothing else.
    // Popup first on every device: it is started by the tap, and it does not depend on
    // storage shared between this site and the sign-in page, which phones increasingly block.
    // Redirect is only the fallback when the browser refuses the popup.
    async function withProvider(provider) {
      try { await authMod.signInWithPopup(auth, provider); }
      catch (e) {
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
          await authMod.signInWithRedirect(auth, provider);
        } else throw e;
      }
    }
    function githubProvider() {
      var p = new authMod.GithubAuthProvider();
      p.addScope('read:user');
      p.addScope('user:email');
      return p;
    }
    function googleProvider() {
      var p = new authMod.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      return p;
    }
    function appleProvider() {
      var p = new authMod.OAuthProvider('apple.com');
      p.addScope('email');
      p.addScope('name');
      return p;
    }
    var phoneConfirmation = null;
    function recaptcha() {
      if (!recaptcha.widget) {
        recaptcha.widget = new authMod.RecaptchaVerifier(auth, 'accountRecaptcha', { size: 'invisible' });
      }
      return recaptcha.widget;
    }
    async function sendPhoneCode(e164) {
      phoneConfirmation = await authMod.signInWithPhoneNumber(auth, e164, recaptcha());
    }
    async function confirmPhoneCode(code) {
      if (!phoneConfirmation) {
        var err = new Error('code');
        err.code = 'auth/code-expired';
        throw err;
      }
      var result = await phoneConfirmation.confirm(code);
      phoneConfirmation = null;
      return result;
    }
    async function reauth(password) {
      var current = auth.currentUser;
      if (!current) throw Object.assign(new Error('signed out'), { code: 'auth/requires-recent-login' });
      var ids = (current.providerData || []).map(function (p) { return p.providerId; });
      if (ids.indexOf('password') >= 0) {
        if (!password) throw Object.assign(new Error('password'), { code: 'auth/missing-password' });
        var cred = authMod.EmailAuthProvider.credential(current.email, password);
        await authMod.reauthenticateWithCredential(current, cred);
      } else if (ids.indexOf('phone') >= 0) {
        await confirmPhoneCode(password);
      } else if (ids.indexOf('google.com') >= 0) {
        await authMod.reauthenticateWithPopup(current, googleProvider());
      } else if (ids.indexOf('github.com') >= 0) {
        await authMod.reauthenticateWithPopup(current, githubProvider());
      } else if (ids.indexOf('apple.com') >= 0) {
        await authMod.reauthenticateWithPopup(current, appleProvider());
      }
    }
    return {
      signInGoogle: function () { return withProvider(googleProvider()); },
      signInGithub: function () { return withProvider(githubProvider()); },
      signInApple: function () { return withProvider(appleProvider()); },
      signInEmail: function (email, password) { return authMod.signInWithEmailAndPassword(auth, email, password); },
      createEmail: function (email, password) { return authMod.createUserWithEmailAndPassword(auth, email, password); },
      resetPassword: function (email) { return authMod.sendPasswordResetEmail(auth, email); },
      sendPhoneCode: sendPhoneCode,
      confirmPhoneCode: confirmPhoneCode,
      signOut: function () { return authMod.signOut(auth); },
      deleteAccount: async function (password) {
        var current = auth.currentUser;
        if (!current) return;
        await reauth(password);
        await fsMod.deleteDoc(fsMod.doc(db, 'users', current.uid));
        await authMod.deleteUser(current);
      },
      watch: function (uid, cb) {
        return fsMod.onSnapshot(fsMod.doc(db, 'users', uid), function (snap) {
          cb(snap.exists() ? snap.data() : null);
        }, function () {
          setStatus('Saved on this device. Sync will retry when you are back online.');
        });
      },
      save: function (uid, data) { return fsMod.setDoc(fsMod.doc(db, 'users', uid), data); },
      listen: function (cb) { return authMod.onAuthStateChanged(auth, function (u) { cb(pack(u)); }); },
    };
  }

  buildUI();
  watchHome();
  ensure().then(function (api) { api.listen(onUser); }).catch(function () {
    var msg = 'Sign-in could not be reached. You can keep reading; progress stays on this device.';
    setStatus(msg);
    showError(msg);
  });
})();
