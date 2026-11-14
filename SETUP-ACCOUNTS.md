# Turn on optional sign-in (free)

Reading and listening stay free either way. With the config file left blank, the site has no
Sign in button and does not contact Google. These steps create a free Firebase project so a
reader who wants to can sign in and keep a reading place, bookmarks, highlights, and listening
place on their other devices. Anyone who does not sign in keeps using the site exactly as it
works today, with everything saved only on that device.

You need a free Google account. You do not need a credit card. Stay on the Spark (free) plan.
Do not turn on billing.

The public site is `https://clayjartranslation.github.io`. The `/treasure/` path is a different
project. Do not change it while doing this.

Time: about 20 minutes the first time.

## 1. Create the Firebase project

1. Open <https://console.firebase.google.com> and sign in with the Google account that should own the project.
2. Click **Create a project** (or **Add project**).
3. Project name: `Clay Jar Translation` (the id underneath can stay whatever Firebase suggests, such as `clay-jar-translation`). Click **Continue**.
4. On **Google Analytics**, turn the switch **off**. This site does not use analytics. Click **Create project**.
5. Wait until it says the project is ready, then click **Continue**.

## 2. Add the web app and copy the config

1. On the project overview, click the **Web** icon (`</>`).
2. App nickname: `CJT website`. Do not check Firebase Hosting. Click **Register app**.
3. Firebase shows a `firebaseConfig` block. Keep this tab open. You will paste those values in step 6.
4. Click **Continue to console**. You can ignore the "Add Firebase SDK" instructions. The website already loads Firebase only after the config file is filled in.

## 3. Turn on sign-in methods

1. In the left menu, open **Build**, then **Authentication**.
2. Click **Get started**.
3. Open the **Sign-in method** tab.
4. Click **Google**.
   - Turn **Enable** on.
   - Project support email: pick your email from the list.
   - Click **Save**.
5. Click **Email/Password**.
   - Turn **Email/Password** on (the first switch).
   - Leave **Email link (passwordless sign-in)** off.
   - Click **Save**.
6. Leave **Apple** off for now. It needs a paid Apple Developer account. Step 9 is for later.

## 4. Allow this website

1. Still in **Authentication**, open **Settings** (or the gear), then **Authorized domains**.
2. `localhost` is already there. That lets you try sign-in on your own computer.
3. Click **Add domain**.
4. Type `clayjartranslation.github.io` with no `https://` and no path. Click **Add**.

If you later use another domain, add that domain here too. Sign-in fails with a domain error until the domain is on this list.

## 5. Create the database and publish the rules

1. In the left menu, open **Build**, then **Firestore Database**.
2. Click **Create database**.
3. Database ID: leave `(default)`.
4. Choose **Standard edition** if it asks. Do not choose a paid edition.
5. Location: pick the region closest to most readers (for example `nam5 (United States)`). You cannot change this later. Click **Next**.
6. Start in **production mode** (locked). Click **Create**.
7. Open the **Rules** tab.
8. Select everything in the editor and delete it.
9. Open `firestore.rules` from this project and paste the whole file into the editor.
10. Click **Publish**. The rules say: a signed-in person may read and write only the document `users/{their own id}`. No one else can read it. There is no public data.

Those rules are what protect readers. The values in the config file are not secret. Firebase expects them in the web page. The rules, not a hidden key, stop one person from opening another person's bookmarks.

## 6. Paste the config into the site

1. Open `js/account-config.js` in this project.
2. From the Firebase tab you kept in step 2 (or **Project settings**, gear, **Your apps**, **Config**), copy each value into the matching line. Leave the quotes. Example shape, with fake values:

```javascript
window.CJT_ACCOUNTS = {
  apiKey: "AIza...your key...",
  authDomain: "clay-jar-translation.firebaseapp.com",
  projectId: "clay-jar-translation",
  appId: "1:1234567890:web:abc123",
  storageBucket: "clay-jar-translation.appspot.com",
  messagingSenderId: "1234567890",
  appleSignIn: false,
  phone: false,
};
```

3. `appleSignIn` stays `false` until step 9. `phone` stays `false`. Text messages cost money and need the Blaze plan, so phone sign-in stays off on the free Spark plan. Both values must be the boolean `false`, not the word in quotes.
4. Save the file.
5. The service worker already fetches `js/account-config.js` from the network first, so this paste is picked up without another cache bump. If you change `js/accounts.js`, `js/app.js`, or `css/style.css`, add 1 to `VERSION` in `sw.js` (`cjt-v301` becomes `cjt-v302`) so phones drop the old copy.

## 7. Put it on the live site

1. Commit the config change and push to the GitHub Pages branch (usually `main`).
2. Wait a minute, then open <https://clayjartranslation.github.io> in a private window.
3. Open the menu (the sliders icon). You should see **Account** and **Sign in**.
4. Create an account with an email you can open. Then add a bookmark in Genesis.
5. Open the same site on a second browser or phone, sign in with that email, and confirm the bookmark is there.
6. In Firebase, **Authentication → Users** shows that test account. **Firestore → users → (one document)** shows the bookmark. You should see only that user's document, and only while you are that user. A logged-out window never shows the Account data, and the reading pages still work with the menu's Account section as the only new piece.

To try it before pushing, from this folder run `python3 -m http.server 8000` and open <http://localhost:8000>. `localhost` is already an authorized domain.

## 8. What readers see

- Not signed in: nothing is uploaded. Bookmarks, highlights, reading place, listening place, and reading settings stay in that browser. The sign-in screen says this before anyone continues.
- The Account screen has **Save backup file** and **Restore from file** with no account. The file is JSON. Restoring merges it into the device. The same backup is under Bookmarks → Backup. It is not uploaded.
- Signed in: those same things sync. The session is stored only in that browser (Firebase local persistence). The first sign-in merges this device with the account. A later delete on one device is kept.
- **Sign out** asks whether to keep the copy on this device or remove bookmarks, highlights, and places from this device. Text size and appearance stay. The account itself remains until it is deleted.
- **Delete my data and account** removes the Firebase copy and the bookmarks, highlights, reading place, and listening place on this device. Text size and light or dark mode on this device stay. This cannot be undone.
- Password reset sends Firebase's own email. It does not go through this website's code.
- There is still no ad and no paywall. Closing the account dialog, or never opening it, leaves the whole Bible readable.

## 9. Later: Sign in with Apple

Skip this until you have a paid Apple Developer Program membership
(<https://developer.apple.com/programs/>). Google and email keep working while `appleSignIn` is `false`.

1. In the Apple Developer account, open **Certificates, Identifiers & Profiles**.
2. Open **Identifiers**. Click the plus sign. Choose **App IDs**, then **App**. Description: `Clay Jar Translation`. Bundle ID: `org.clayjartranslation.web` (explicit). Enable **Sign in with Apple**. Register it.
3. Back in **Identifiers**, click the plus sign. Choose **Services IDs**. Description: `CJT website`. Identifier: `org.clayjartranslation.signin`. Register it, then open it again.
4. Enable **Sign in with Apple**. Click **Configure**.
   - Primary App ID: the App ID from step 2.
   - Domains: `clayjartranslation.github.io` and `YOUR-PROJECT-ID.firebaseapp.com`.
   - Return URL: `https://YOUR-PROJECT-ID.firebaseapp.com/__/auth/handler`
   - Save, then Continue, then Save on the Services ID.
5. Open **Keys**. Click the plus sign. Key name: `CJT Sign in with Apple`. Enable **Sign in with Apple**. Configure it to the App ID from step 2. Register. Download the `.p8` file once. Note the **Key ID**.
6. On the membership page, copy the **Team ID** (10 characters).
7. In Firebase, **Authentication → Sign-in method → Apple → Enable**.
   - Services ID: `org.clayjartranslation.signin`
   - Team ID, Key ID, and the contents of the `.p8` file go in the fields Apple key asks for.
   - Save.
8. In `js/account-config.js`, change `appleSignIn: false` to `appleSignIn: true` and push. The button says **Sign in with Apple**. Leave it `false` and the button is not shown.

## 10. Phone sign-in stays off on the free plan

Do not turn this on unless you mean to pay for text messages. The Spark plan does not include phone sign-in. Firebase requires the **Blaze** (pay as you go) plan, and each SMS has a price. Readers are never charged. Leave `phone: false` and skip this section.

If you later accept that cost:

1. In the Firebase console, open **Project settings** (gear) → **Usage and billing** → **Modify plan**, and upgrade to **Blaze**. A billing account is required. This is the paid step. The rest of the site does not need it.
2. Open **Authentication → Sign-in method → Phone → Enable**. Save.
3. Add the domains you already added for Google (step 4). Phone sign-in uses an invisible reCAPTCHA on those domains.
4. In `js/account-config.js`, set `phone: true` and push. The button says **Continue with phone**, with a country list and a check that the number is in international form (`+` and the digits). Set it back to `false` to hide the button again. Google and email keep working either way.

## 11. Privacy pages and the contact address

`privacy.html` and `terms.html` use [contact.clayjar@protonmail.com](mailto:contact.clayjar@protonmail.com) as the contact address. The privacy page states that data stays on the device until someone signs in, what syncs, that the session stays in the browser, and that sign-out can keep or clear this device.

## Downloads

The translation files (PDF, EPUB, JSON, plain text, USFM), © 2026 Jose Santiago, CC BY 4.0, are built by `node tools/build-downloads.js` and linked from the menu and the footer. GitHub Actions (`.github/workflows/downloads.yml`) rebuilds them when the book text changes. They are the translation, not anyone’s account. After this is on GitHub Pages they are at:

- https://clayjartranslation.github.io/downloads/
- https://clayjartranslation.github.io/downloads/clay-jar-translation.pdf
- https://clayjartranslation.github.io/downloads/clay-jar-translation.epub
- https://clayjartranslation.github.io/downloads/clay-jar-translation.json
- https://clayjartranslation.github.io/downloads/SCHEMA.md
- https://clayjartranslation.github.io/downloads/clay-jar-translation.txt
- https://clayjartranslation.github.io/downloads/clay-jar-translation-usfm.zip

## If sign-in misbehaves

- "This website is not on the Firebase authorized domains list" — repeat step 4. The domain must be exactly `clayjartranslation.github.io`.
- "That sign-in method is not turned on" — repeat step 3 and confirm Google and Email/Password are Enabled.
- The menu has no Account row — `apiKey` in `js/account-config.js` is still empty, or the browser is still on a cached copy of that file. Reload once. The service worker updates that one file from the network.
- A reader can sign in but a second device stays empty — open Firestore **Rules** and confirm they match `firestore.rules`, then **Publish** again.
- To turn accounts back off, set `apiKey` back to `''` and push. The Sign in button disappears. Books already saved on a device stay on that device. The Firebase project can sit unused on the free plan, or you can delete it from **Project settings → Delete project**.

## 12. Lock the API key, and App Check

The web API key is not a password. `firestore.rules` is what keeps one reader’s document private. Still, in Google Cloud Console (the project Firebase created), open **APIs & Services → Credentials**, open the browser key, and under **Application restrictions** choose **HTTP referrers**. Allow only:

- `https://clayjartranslation.github.io/*`
- `http://localhost:8000/*` (only if you still test on this computer)
- `https://*.firebaseapp.com/*` (Firebase’s sign-in helper)

Under **API restrictions**, limit the key to the Firebase APIs this site uses (Identity Toolkit, Token Service, Cloud Firestore). Save.

Firebase App Check can require a free reCAPTCHA v3 attestation before Firestore accepts a request. Turning it on needs the Firebase console: **App Check → Apps → Register** the web app, then **Enforce** on Cloud Firestore. Do that only after the site key is in the project. Enforcing App Check before the page sends a token would block sign-in. This repository does not turn App Check on by itself, because there is no site key to ship.
