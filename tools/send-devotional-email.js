/* Send today's Clay Jar devotional to the Brevo list.
   Free plan. No send while Brevo secrets are missing (exit 0).
   Scheduled runs send only during the 4 AM hour in America/New_York.
   A campaign whose name contains that calendar date is not sent again.

   Brevo's campaign API stores htmlContent and builds the plain-text
   alternative from that HTML. This script also builds an explicit
   plain-text part and prints it on a dry run. The HTML is simple paragraphs
   so the text Brevo generates keeps the same words.

   Usage: node tools/send-devotional-email.js
   Env: BREVO_API_KEY, BREVO_LIST_ID, BREVO_SENDER_EMAIL
        DRY_RUN=true prints the message and does not call Brevo
        EVENT_NAME=workflow_dispatch allows a manual run outside 4 AM
        NOW=ISO-8601 is a test clock. The workflow does not set it. */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NOTICE = 'Devotionals © 2026 Jose Santiago, licensed CC BY 4.0';
const SITE = 'https://clayjartranslation.github.io/devotional.html';
const TZ = 'America/New_York';
const MONTHS = [null, 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function nyParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const map = {};
  fmt.formatToParts(date).forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value; });
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const month = map.month;
  const day = map.day;
  return {
    hour,
    minute: Number(map.minute),
    year: map.year,
    month,
    day,
    isoDate: map.year + '-' + month + '-' + day,
    key: month + '-' + day,
  };
}

function inSendHour(parts) {
  // The whole 4 AM hour counts, so a GitHub Actions delay still sends
  // as long as New York has not reached 5:00.
  return parts.hour === 4;
}

function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return String(iso || '');
  return MONTHS[Number(m[2])] + ' ' + Number(m[3]) + ', ' + m[1];
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function campaignName(isoDate) {
  return 'Clay Jar devotional ' + isoDate;
}

function loadDevotionals(file) {
  const data = JSON.parse(fs.readFileSync(file || path.join(ROOT, 'data', 'devotionals.json'), 'utf8'));
  const list = data && Array.isArray(data.devotionals) ? data.devotionals : [];
  return list;
}

function findEntry(entries, key) {
  return (entries || []).find((e) => e && e.date === key) || null;
}

function pageUrl(key) {
  return SITE + '?d=' + encodeURIComponent(key);
}

function buildEmail(entry, isoDate) {
  const key = entry.date;
  const url = pageUrl(key);
  const when = longDate(isoDate);
  const title = String(entry.title || '').trim();
  const ref = String(entry.verseReference || '').trim();
  const verse = String(entry.verseText || '');
  const reflection = String(entry.reflection || '');
  const prayer = String(entry.prayer || '');
  const subject = title + ' · ' + when;
  const text = [
    title,
    when,
    '',
    ref,
    '',
    verse,
    '',
    'Reflection',
    reflection,
    '',
    'Prayer',
    prayer,
    '',
    'Read this devotional on the site:',
    url,
    '',
    NOTICE,
    '',
    'Unsubscribe: {{ unsubscribe }}',
    '',
  ].join('\n');
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#fff9eb;color:#3f2416;">
  <div style="max-width:36rem;margin:0 auto;padding:28px 20px;font-family:Georgia,'Iowan Old Style',serif;font-size:18px;line-height:1.6;">
    <p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#a6522d;">Clay Jar Translation</p>
    <h1 style="margin:0 0 8px;font-size:28px;line-height:1.2;font-weight:600;">${esc(title)}</h1>
    <p style="margin:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;color:#6b4a37;">${esc(when)}</p>
    <p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-weight:700;color:#a6522d;">${esc(ref)}</p>
    <p style="margin:0 0 20px;white-space:pre-line;font-size:19px;line-height:1.65;">${esc(verse)}</p>
    <h2 style="margin:24px 0 8px;font-size:20px;line-height:1.3;">Reflection</h2>
    <p style="margin:0 0 8px;white-space:pre-line;">${esc(reflection)}</p>
    <h2 style="margin:24px 0 8px;font-size:20px;line-height:1.3;">Prayer</h2>
    <p style="margin:0 0 8px;white-space:pre-line;">${esc(prayer)}</p>
    <p style="margin:28px 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;"><a href="${esc(url)}" style="color:#a6522d;">Read this devotional on the site</a></p>
    <p style="margin:20px 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#6b4a37;">${esc(NOTICE)}</p>
    <p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;"><a href="{{ unsubscribe }}" style="color:#a6522d;">Unsubscribe</a></p>
  </div>
</body>
</html>
`;
  const preview = (ref + ' — ' + verse.split('\n')[0].trim());
  return {
    name: campaignName(isoDate),
    subject,
    previewText: preview.length > 140 ? preview.slice(0, 137) + '...' : preview,
    html,
    text,
    isoDate,
    key,
    url,
  };
}

function readSecrets(env) {
  const apiKey = String(env.BREVO_API_KEY || '').trim();
  const listRaw = String(env.BREVO_LIST_ID || '').trim();
  const sender = String(env.BREVO_SENDER_EMAIL || '').trim();
  const missing = [];
  if (!apiKey) missing.push('BREVO_API_KEY');
  if (!listRaw) missing.push('BREVO_LIST_ID');
  if (!sender) missing.push('BREVO_SENDER_EMAIL');
  if (missing.length) return { ok: false, missing };
  if (!/^[1-9]\d*$/.test(listRaw)) return { ok: false, invalid: 'BREVO_LIST_ID is set but is not a list number.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) return { ok: false, invalid: 'BREVO_SENDER_EMAIL is set but is not an email address.' };
  return { ok: true, apiKey, listId: Number(listRaw), sender };
}

function isOurCampaign(name, isoDate) {
  const n = String(name || '');
  // Date plus our name, so a second list on the same Brevo account
  // (for example the Treasure Bible site) does not count as this send.
  return n.indexOf('Clay Jar devotional') !== -1 && n.indexOf(isoDate) !== -1;
}

function classify(campaigns, isoDate) {
  let draft = null;
  let blocked = null;
  (campaigns || []).forEach((c) => {
    if (!c || !isOurCampaign(c.name, isoDate)) return;
    const status = String(c.status || '').toLowerCase().replace(/_/g, '');
    if (status === 'draft') {
      if (!draft) draft = c;
      return;
    }
    if (!blocked) blocked = c;
  });
  if (blocked) return { action: 'skip', campaign: blocked };
  if (draft) return { action: 'send-draft', campaign: draft };
  return { action: 'create' };
}

function isEmptyAudience(status, text) {
  if (status !== 400 && status !== 404) return false;
  const t = String(text || '').toLowerCase();
  if (/no contact/.test(t) || /no recipient/.test(t)) return true;
  return /empty/.test(t) && /list|recipient|contact/.test(t);
}

function clip(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > 400 ? t.slice(0, 400) : t;
}

async function brevo(apiKey, method, urlPath, body) {
  const headers = { 'api-key': apiKey, accept: 'application/json' };
  const opts = { method, headers, signal: AbortSignal.timeout(30000) };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch('https://api.brevo.com/v3' + urlPath, opts);
  const text = await res.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch (e) { json = null; }
  }
  return { status: res.status, ok: res.ok, json, text };
}

async function listCampaigns(apiKey, request) {
  const call = request || brevo;
  const all = [];
  let offset = 0;
  const limit = 50;
  for (let page = 0; page < 20; page++) {
    const res = await call(apiKey, 'GET', '/emailCampaigns?type=classic&limit=' + limit + '&offset=' + offset + '&sort=desc&excludeHtmlContent=true');
    if (!res.ok) {
      const err = new Error('Could not list campaigns (' + res.status + '). ' + clip(res.text));
      err.result = res;
      throw err;
    }
    const batch = (res.json && res.json.campaigns) || [];
    all.push.apply(all, batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return all;
}

function clock(env, deps) {
  if (deps && deps.now) return deps.now;
  if (env.NOW) {
    const d = new Date(env.NOW);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

async function run(env, deps) {
  const log = (deps && deps.log) || console.log;
  const now = clock(env, deps);
  const parts = nyParts(now);
  const dry = String(env.DRY_RUN || '').toLowerCase() === 'true';
  const manual = env.EVENT_NAME === 'workflow_dispatch';
  const stamp = parts.isoDate + ' ' + String(parts.hour).padStart(2, '0') + ':' + String(parts.minute).padStart(2, '0') + ' America/New_York';

  if (!manual && !inSendHour(parts)) {
    log('Not the 4 AM hour in America/New_York (' + stamp + '). Skipping.');
    return 0;
  }

  const secrets = readSecrets(env);
  const entries = (deps && deps.load ? deps.load() : loadDevotionals());
  const entry = findEntry(entries, parts.key);
  const email = entry ? buildEmail(entry, parts.isoDate) : null;

  if (dry) {
    if (!email) {
      log('Dry run. No devotional is written for ' + parts.key + ' (' + parts.isoDate + '). Nothing to send.');
      return 0;
    }
    log('Dry run for ' + stamp + '. The message below is not sent.');
    log('Campaign: ' + email.name);
    log('Subject: ' + email.subject);
    log('--- plain text ---');
    log(email.text);
    log('--- html ---');
    log(email.html);
    if (!secrets.ok && secrets.missing) log('Brevo secrets are not all set (' + secrets.missing.join(', ') + '). A real run would skip.');
    return 0;
  }

  if (!secrets.ok) {
    if (secrets.invalid) {
      log(secrets.invalid);
      return 1;
    }
    log('Brevo is not configured. Missing ' + secrets.missing.join(', ') + '. Skipping without sending.');
    return 0;
  }
  if (!email) {
    log('No devotional is written for ' + parts.key + ' (' + parts.isoDate + '). Skipping without sending.');
    return 0;
  }

  const request = (deps && deps.request) || brevo;
  const campaigns = deps && deps.listCampaigns
    ? await deps.listCampaigns(secrets.apiKey)
    : await listCampaigns(secrets.apiKey, request);
  const decision = classify(campaigns, parts.isoDate);
  if (decision.action === 'skip') {
    log('A campaign named with ' + parts.isoDate + ' already exists (' + (decision.campaign && decision.campaign.status) + '). Not sending again.');
    return 0;
  }

  let id = decision.campaign && decision.campaign.id;
  if (decision.action === 'create') {
    const payload = {
      name: email.name,
      subject: email.subject,
      sender: { name: 'Clay Jar Translation', email: secrets.sender },
      replyTo: secrets.sender,
      htmlContent: email.html,
      previewText: email.previewText,
      recipients: { listIds: [secrets.listId] },
      mirrorActive: false,
      inlineImageActivation: false,
    };
    const created = await request(secrets.apiKey, 'POST', '/emailCampaigns', payload);
    if (!created.ok || !created.json || !created.json.id) {
      const err = new Error('Could not create the campaign (' + created.status + '). ' + clip(created.text));
      err.result = created;
      throw err;
    }
    id = created.json.id;
    log('Created campaign ' + id + ' (' + email.name + ').');
  } else {
    log('Found an unsent draft for ' + parts.isoDate + ' (' + id + '). Sending that instead of creating another.');
  }

  const sent = await request(secrets.apiKey, 'POST', '/emailCampaigns/' + id + '/sendNow');
  if (sent.status === 204 || sent.ok) {
    log('Sent ' + email.name + ' to list ' + secrets.listId + '.');
    return 0;
  }
  if (isEmptyAudience(sent.status, sent.text)) {
    log('The Brevo list has nobody to send to yet. Nothing was delivered. ' + clip(sent.text));
    return 0;
  }
  const err = new Error('Brevo did not send the campaign (' + sent.status + '). ' + clip(sent.text));
  err.result = sent;
  throw err;
}

async function main() {
  try {
    return await run(process.env, {});
  } catch (e) {
    console.error(e && e.message ? e.message : e);
    return 1;
  }
}

module.exports = {
  NOTICE,
  SITE,
  nyParts,
  inSendHour,
  longDate,
  campaignName,
  buildEmail,
  readSecrets,
  classify,
  isOurCampaign,
  isEmptyAudience,
  findEntry,
  loadDevotionals,
  run,
};

if (require.main === module) {
  main().then((code) => process.exit(code));
}
