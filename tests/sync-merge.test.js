const assert = require('assert');
const { mergeState, visible, normalize } = require('../js/sync-merge.js');

const now = 1_700_000_000_000;

const T = (age) => now - age;
function bm(id, v, t, extra) {
  return Object.assign({ id, book: 'genesis', name: 'Genesis', ch: 1, v, text: 'verse ' + v, t, deleted: false }, extra);
}
function hl(id, s, e, t, extra) {
  return Object.assign({
    id, book: 'genesis', name: 'Genesis', ch: 1, v: 1, s, e, color: 'yellow', text: 'words', whole: false, t, deleted: false,
  }, extra);
}
function state(partial) {
  return Object.assign({ bookmarks: [], highlights: [], reading: null, audio: null, settings: { updatedAt: 0 } }, partial);
}

// Two devices bookmarked different verses: both survive.
{
  const merged = mergeState(
    state({ bookmarks: [bm('a', 1, T(10))] }),
    state({ bookmarks: [bm('b', 2, T(20))] }),
    now,
  );
  assert.strictEqual(visible(merged.bookmarks).length, 2);
}

// Same verse, two ids: keep the newer, tombstone the older so it cannot return.
{
  const merged = mergeState(
    state({ bookmarks: [bm('a', 3, T(5000))] }),
    state({ bookmarks: [bm('b', 3, T(1000), { text: 'newer' })] }),
    now,
  );
  const live = visible(merged.bookmarks);
  assert.strictEqual(live.length, 1);
  assert.strictEqual(live[0].id, 'b');
  assert.strictEqual(live[0].text, 'newer');
  assert.ok(merged.bookmarks.some((b) => b.id === 'a' && b.deleted));
}

// A delete with a later timestamp removes the bookmark on the other device.
{
  const merged = mergeState(
    state({ bookmarks: [bm('a', 1, T(1000), { deleted: true })] }),
    state({ bookmarks: [bm('a', 1, T(4000))] }),
    now,
  );
  assert.strictEqual(visible(merged.bookmarks).length, 0);
}

// An edit newer than a delete keeps the bookmark.
{
  const merged = mergeState(
    state({ bookmarks: [bm('a', 1, T(8000), { deleted: true })] }),
    state({ bookmarks: [bm('a', 1, T(1000), { text: 'back' })] }),
    now,
  );
  assert.strictEqual(visible(merged.bookmarks).length, 1);
  assert.strictEqual(visible(merged.bookmarks)[0].text, 'back');
}

// Highlight color change on the same id follows the later timestamp.
{
  const merged = mergeState(
    state({ highlights: [hl('h', 0, 5, T(5000), { color: 'yellow' })] }),
    state({ highlights: [hl('h', 0, 5, T(1000), { color: 'blue' })] }),
    now,
  );
  assert.strictEqual(visible(merged.highlights).length, 1);
  assert.strictEqual(visible(merged.highlights)[0].color, 'blue');
}

// Same span highlighted on two devices: one highlight remains.
{
  const merged = mergeState(
    state({ highlights: [hl('h1', 0, 4, T(5000), { color: 'green' })] }),
    state({ highlights: [hl('h2', 0, 4, T(1000), { color: 'pink' })] }),
    now,
  );
  const live = visible(merged.highlights);
  assert.strictEqual(live.length, 1);
  assert.strictEqual(live[0].id, 'h2');
  assert.strictEqual(live[0].color, 'pink');
}

// Reading place and audio place: the later timestamp wins, including time.
{
  const merged = mergeState(
    state({
      reading: { book: 'genesis', name: 'Genesis', ch: 1, v: 4, t: T(5000) },
      audio: { book: 'genesis', name: 'Genesis', ch: 1, v: 4, time: 12.5, t: T(5000) },
    }),
    state({
      reading: { book: 'exodus', name: 'Exodus', ch: 2, v: 1, t: T(1000) },
      audio: { book: 'genesis', name: 'Genesis', ch: 1, v: 8, time: 3, t: T(2000) },
    }),
    now,
  );
  assert.strictEqual(merged.reading.book, 'exodus');
  assert.strictEqual(merged.audio.v, 8);
  assert.strictEqual(merged.audio.time, 3);
}

// Settings: a newer blob wins. A tie keeps the local device and stamps the time
// so the two devices do not trade copies forever.
{
  const newerRemote = mergeState(
    state({ settings: { theme: 'dark', updatedAt: T(5000) } }),
    state({ settings: { theme: 'light', size: 22, updatedAt: T(1000) } }),
    now,
  );
  assert.strictEqual(newerRemote.settings.theme, 'light');
  assert.strictEqual(newerRemote.settings.size, 22);

  const tie = mergeState(
    state({ settings: { theme: 'dark', updatedAt: T(1000) } }),
    state({ settings: { theme: 'light', updatedAt: T(1000) } }),
    now,
  );
  assert.strictEqual(tie.settings.theme, 'dark');
  assert.strictEqual(tie.settings.updatedAt, now);
}

// Junk and over-long fields are dropped or trimmed before anything is stored.
{
  const n = normalize({
    bookmarks: [{ id: 'ok', book: 'genesis', ch: 1, v: 1, text: 'x'.repeat(5000), t: 1 }, { id: '', book: 'genesis', ch: 1, v: 1 }, { nope: true }],
    highlights: [{ id: 'h', book: 'genesis', ch: 1, v: 1, s: 0, e: 2, color: 'nope', text: 'ab', t: 1 }],
    reading: { book: 'genesis', ch: -1, v: 1, t: 1 },
    settings: { theme: 'blue', size: 99, rate: 9, updatedAt: 3 },
  });
  assert.strictEqual(n.bookmarks.length, 1);
  assert.strictEqual(n.bookmarks[0].text.length, 400);
  assert.strictEqual(n.highlights.length, 0);
  assert.strictEqual(n.reading, null);
  assert.strictEqual(n.settings.theme, 'auto');
  assert.strictEqual(n.settings.size, 19);
  assert.strictEqual(n.settings.rate, 1);
}

// Empty remote on first sign-in keeps everything that was already on the device.
{
  const local = state({
    bookmarks: [bm('a', 1, T(1000))],
    highlights: [hl('h', 0, 3, T(1000))],
    reading: { book: 'genesis', name: 'Genesis', ch: 1, v: 5, t: T(1000) },
    settings: { theme: 'dark', updatedAt: T(1000) },
  });
  const merged = mergeState(local, state({}), now);
  assert.strictEqual(visible(merged.bookmarks).length, 1);
  assert.strictEqual(visible(merged.highlights).length, 1);
  assert.strictEqual(merged.reading.v, 5);
  assert.strictEqual(merged.settings.theme, 'dark');
}

// A hostile backup cannot smuggle a book id or a highlight color into markup.
{
  const merged = mergeState(state({}), state({
    bookmarks: [bm('ok', 1, T(10), { text: '<img src=x onerror=alert(1)>' }), { id: 'bad<script>', book: 'genesis', name: 'Genesis', ch: 1, v: 2, text: 'x', t: T(10) }, { id: 'badbook', book: 'gen<img>', name: 'Genesis', ch: 1, v: 3, text: 'x', t: T(10) }],
    highlights: [hl('h1', 0, 2, T(10), { color: 'yellow" onmouseover="alert(1)' })],
    settings: { size: '19;background:url(//evil)', theme: 'dark"><script>', updatedAt: 5 },
  }), now);
  const live = visible(merged.bookmarks);
  assert.strictEqual(live.length, 1);
  assert.strictEqual(live[0].id, 'ok');
  assert.strictEqual(live[0].text, '<img src=x onerror=alert(1)>');
  assert.strictEqual(visible(merged.highlights).length, 0);
  assert.strictEqual(merged.settings.size, 19);
  assert.strictEqual(merged.settings.theme, 'auto');
}

console.log('sync-merge tests passed');
