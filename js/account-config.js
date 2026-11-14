/* Clay Jar Translation — optional account sync
   ------------------------------------------------
   Reading and listening stay free with no account. Fill this in only if you
   want a Sign in button that saves progress across devices.

   Leave apiKey as an empty string and nothing changes: no sign-in button,
   no requests to Google, and every bookmark stays on this device only.

   Click-by-click setup: SETUP-ACCOUNTS.md
   These values are public (they identify the Firebase project). They are not
   a secret. Access is limited by firestore.rules, which only lets a signed-in
   person read and write their own document.

   appleSignIn: set to true only after Sign in with Apple is enabled on the
   Firebase project. That needs a paid Apple Developer account. Leave false
   until then; Google and email still work.

   phone: set to true only after Phone sign-in is enabled AND the project is
   on the Blaze plan. Text messages cost money, so leave this false on the
   free Spark plan. Google and email still work. */
window.CJT_ACCOUNTS = {
  apiKey: 'AIzaSyDyLUz3OtUMcazzoLHMT4vi3lsdaL5QTSk',
  authDomain: 'clayjar-bible.firebaseapp.com',
  projectId: 'clayjar-bible',
  appId: '1:504034531119:web:0170b2bda12275933af3da',
  storageBucket: 'clayjar-bible.firebasestorage.app',
  messagingSenderId: '504034531119',
  appleSignIn: false,
  phone: false,
};
