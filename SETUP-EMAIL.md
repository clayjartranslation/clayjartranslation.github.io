# Send the daily devotional by email (free)

The site can email that day’s devotional at 4:00 in the morning in each subscriber’s own time zone. The email is optional. Reading the Bible on the site stays the same, with no account and no ads.

This uses Brevo’s free plan. The free plan sends up to 300 emails a day. One devotional is one email per person. You do not need a credit card. Do not pick a paid plan, and do not add a card if Brevo offers one.

Nothing here runs on your phone at 4:00. GitHub sends it. Your phone can be asleep.

You will end up with five values. Two go in a public file on the website. Three go in GitHub, where the public cannot see them.

| What | Example shape | Where it goes |
| --- | --- | --- |
| Form address | `https://xxxx.sibforms.com/serve/…` | `js/devotional-email-config.js` → `formAction` |
| List number | `2` | the same file → `listId`, and GitHub `BREVO_LIST_ID` |
| API key | `xkeysib-…` | GitHub secret `BREVO_API_KEY` only |
| Sender email | the address you verified | GitHub `BREVO_SENDER_EMAIL` |

The API key is a password for the Brevo account. Never put it in the website files, in a text to someone, or in an email. The website is public. GitHub secrets are not.

If you also run the Treasure Bible site, use this same free Brevo account. Make a **separate list** and a **separate form** for that site. Do not put both sites on one list, or people will get both emails. The API key can be the same. The list number must be the one for this site.

Time: about 25 minutes the first time, on an iPhone. A computer works the same way.

## 1. Create a free Brevo account

1. Open Safari and go to [https://www.brevo.com](https://www.brevo.com).
2. Tap **Sign up free**.
3. Use an email you can open. Make a password. Confirm the email when Brevo sends it.
4. If it asks what the account is for, you can type `Clay Jar Translation`.
5. If it asks for a plan, stay on **Free**. Do not enter a card.
6. If it asks about a phone number, that is for your Brevo login, not for the website. The site does not show it.

## 2. Confirm the address that will send the mail

The devotional has to come from an address Brevo has checked.

1. In the Brevo app ([https://app.brevo.com](https://app.brevo.com)), open the menu (the lines or the gear).
2. Open **Settings**, then **Senders** (it may say **Senders, domains & dedicated IPs**).
3. Tap **Add a sender**.
4. Name: `Clay Jar Translation`.
5. Email: an address you can open on this phone.
6. Save. Open the message Brevo sends and tap the confirmation link or type the code.
7. Wait until that sender shows as verified.

If Brevo says the address cannot be used until you authenticate a domain, stop. That happens with some addresses, including Proton, because those companies do not let another service send as them. Pick a different email you can open, such as a free Gmail address. You do not need to buy a domain. Do not pay Brevo to fix this.

Use the verified address later as `BREVO_SENDER_EMAIL`. It does not have to be `contact.clayjar@protonmail.com`. People can still write to that Proton address. It is printed on the privacy page. It is a poor choice as the Brevo sender.

## 3. Make a list

1. In Brevo, open **CRM** or **Contacts**, then **Lists**.
2. Tap **Create a list**.
3. Name it `Clay Jar Devotional`.
4. Save.
5. Open that list. Look at the address bar. The number at the end is the list number. It may also show in a column labeled ID. Write it down. Example: if the address ends in `/2`, the number is `2`.

That number is `listId` on the website and `BREVO_LIST_ID` in GitHub. They must match. The form adds people to this list. The morning email sends to this list.

If the Treasure Bible site shares this Brevo account, create another list for it, with a different number. Do not reuse `Clay Jar Devotional`.

## 4. Make the sign-up form

The website does not use Brevo’s script. It only posts the email address to a form Brevo hosts. That form must use **double confirmation**: Brevo emails the person, and they are not on the list until they tap the link.

1. In Brevo, open **Marketing**, then **Forms**.
2. Open the **Sign-up** tab.
3. Tap **Create sign-up form**.
4. Choose **Full page / embedded**. Not a pop-up.
5. Name it `Clay Jar devotional signup`. Create the form.
6. Keep an **email** field. You do not need a name field. Remove extra fields if the editor added them.
7. Leave **CAPTCHA** off. Leave Google reCAPTCHA and Cloudflare off. A CAPTCHA would not work with this site, and the site does not load Google.
8. If you see **Enable Opt-in field**, leave it off. The confirmation email is the consent step. An extra required checkbox would block the form on this site.
9. On the list step, choose **Clay Jar Devotional** and no other list.
10. On **Settings**, choose **Double confirmation email**.
11. Template: **Default Template Double opt-in confirmation**. Do not edit it. The confirmation link has to stay.
12. You can leave the extra confirmation pages on their defaults.
13. Open **Share**. Choose the embed code (the HTML one, not only the iframe, if both are offered).
14. In that code, find the form address. It is inside `action="..."`. It looks like:

    `https://xxxxxxxx.sibforms.com/serve/a-long-string`

15. Copy **only** that `https://` address. Do not copy the rest of the code. Do not paste Brevo’s `<script>` tags into this website.
16. In the same form, add the `TIMEZONE` contact attribute as a hidden field if Brevo lets you pick attributes. The website already posts a hidden `TIMEZONE` field with the reader’s time zone (for example `America/New_York`). If the hosted form has no `TIMEZONE` field, Brevo may ignore that value, and those readers are emailed at 4:00 Eastern until the time zone is stored. The send job creates the `TIMEZONE` and `LAST_DEVO_DATE` attributes if they are missing.
16. Tap **Done** so the form is saved.

## 5. Create an API key

Do this in the same sitting. Brevo shows the key once.

1. Open [https://app.brevo.com/settings/keys/api](https://app.brevo.com/settings/keys/api). If that page will not open, use the menu: **Settings**, then **SMTP & API**, then **API keys & MCP**.
2. Tap **Generate API key**.
3. Brevo sends a code to confirm it is you. Type the code and tap **Verify**.
4. Key name: `Clay Jar website`.
5. Expiry: **No expiration** if you see that choice. Brevo still turns a key off if it is not used successfully for 90 days. The morning send counts as use once the key is saved in GitHub. Add the key to GitHub today, in the next step, so it does not sit unused.
6. Access: **Full access**. That is the simple choice. Do not turn on **Create MCP server API key**.
7. Copy the key. It starts with `xkeysib-`.
8. Leave this Brevo page open until GitHub has saved the key in step 7. If you lose the key, you cannot view it again. Generate a new one and delete the lost one.

## 6. Put the form address on the website

This file is public. It gets the form address and the list number. It does **not** get the API key.

1. On your iPhone, open [the config file](https://github.com/clayjartranslation/clayjartranslation.github.io/blob/main/js/devotional-email-config.js). Sign in as the owner of the repository if GitHub asks.
2. Tap the pencil (**Edit this file**). On a phone it may be behind the **…** menu.
3. Find the two empty quotes and fill them in. Keep the quotes. Use your real address and your real list number:

```javascript
window.CJT_DEVOTIONAL_EMAIL = {
  formAction: 'https://xxxxxxxx.sibforms.com/serve/paste-the-long-address-here',
  listId: '2',
};
```

4. Tap **Commit changes**. Commit directly to the `main` branch. A message such as `Turn on the devotional email form` is fine.
5. Wait a minute, then open the devotional page on the site. You should see **Get it by email**. Until this file is filled in, that box stays hidden on purpose.

The home page shows a smaller **Get it by email** box at the same time. It uses the same form.

## 7. Add the three GitHub secrets

Still on the iPhone. The API key goes here, not in the file you just edited.

1. Open [Actions secrets](https://github.com/clayjartranslation/clayjartranslation.github.io/settings/secrets/actions). You must be signed in as an owner. If GitHub says the page does not exist, you are not signed in as the owner.
2. Tap **New repository secret**. Do this three times:

| Name | Value |
| --- | --- |
| `BREVO_API_KEY` | the key that starts with `xkeysib-` |
| `BREVO_LIST_ID` | the list number only, such as `2` |
| `BREVO_SENDER_EMAIL` | the verified sender address |

3. Names must match exactly, including capitals. No spaces.
4. After the third one is saved, go back to Brevo and tap **I’ve saved my key** if that button is still waiting.

The list number and the sender email may instead be stored as repository **variables** (the Variables tab on that same page). The API key must be a secret. Secrets are the simplest place for all three.

## 8. Try it once

1. On the live devotional page, type your own email and tap **Subscribe**.
2. You should land on a Brevo page, not an error from this site.
3. Open your inbox and tap the confirmation link. You are not on the list until you do that. Check the spam folder if it is missing.
4. In Brevo, open the **Clay Jar Devotional** list. Your address should be there after you confirm.
5. On GitHub, open the **Actions** tab of the repository, then **Send daily devotional**, then **Run workflow**.
6. Leave **Print the email and do not send it** turned **on**. Tap **Run workflow**.
7. Open that run when it finishes and read the log. You should see a count of contacts in each time zone, today’s title, the verse, the reflection, the prayer, and the line `Devotionals © 2026 Jose Santiago, licensed CC BY 4.0`. Nobody is emailed.
8. A live run (the print switch off) still emails only people whose local time is in the 4 AM hour. To send a one-off copy to yourself, use the **test email** box. That does not email the list.
9. If the same person is due again in that local day, they are not emailed a second copy. The job stores `LAST_DEVO_DATE` on the contact after a successful send.

## What happens every morning

You do not tap anything.

GitHub starts a job at the top of every hour. The script emails only confirmed subscribers whose local time is in the 4 AM hour and who have not already received that local date’s reading. The reading itself is the one for the reader’s local date. If a time zone is missing or invalid, America/New_York is used.

Unsubscribed or blocklisted addresses are skipped. Each email has an unsubscribe link to this site’s unsubscribe page, and Brevo adds a List-Unsubscribe header so Gmail, Yahoo, and Outlook can show their own Unsubscribe control.

If that day’s reading is not in `data/devotionals.json` yet, the job stops without emailing. It does not send a different day in its place.

If the Brevo secrets are missing, the job stops without failing. That is normal until step 7 is done.

If the list has no confirmed subscribers, the job stops without failing.

## If something goes wrong

- The subscribe box is missing. The config file still has empty quotes, or the site has not updated yet. Reload after a minute. The address must start with `https://`.
- Subscribe opens an error. The form address is incomplete, or CAPTCHA or a required checkbox is turned on in Brevo. Fix the form in Brevo. Leave CAPTCHA off.
- The person never appears on the list. They have not tapped the confirmation email yet. Double confirmation waits for that tap.
- The morning job is red. Open it and read the last lines. The usual causes are: the sender is not verified, the API key was copied wrong or Brevo turned it off, or the list number does not match a list. Fix that and use a dry run first. A live run still only emails people in their 4 AM hour, and will not duplicate a send already marked on the contact.
- More than 300 people are on the list. The free plan cannot email all of them in one day. The site itself stays free.

The free plan may put a small Brevo note at the bottom of the email. That is expected. You do not need to pay to remove it.
