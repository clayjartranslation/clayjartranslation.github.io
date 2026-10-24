/* Clay Jar Translation™ (CJT) reader. Plain JavaScript, no dependencies, no tracking. */
(function () {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const main = $('#main');
  const root = document.documentElement;
  const NAME = 'Clay Jar Translation';
  const TM = '<span class="tm" aria-hidden="true">™</span>';

  // ---------- Settings ----------
  const settings = Object.assign({ theme: 'auto', size: 19, notes: true }, readJSON('cjt-settings'));
  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } }
  function saveSettings() { try { localStorage.setItem('cjt-settings', JSON.stringify(settings)); } catch (e) {} }
  function applySettings() {
    if (settings.theme === 'auto') delete root.dataset.theme; else root.dataset.theme = settings.theme;
    root.style.setProperty('--read-size', settings.size + 'px');
    root.classList.toggle('notes-off', !settings.notes);
    $('#sizeOut').textContent = settings.size;
    $('#notesToggle').checked = settings.notes;
    document.querySelectorAll('[data-theme-opt]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeOpt === settings.theme)));
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#1d1410' : '#fff9eb'));
  }
  $('#sizeDown').addEventListener('click', () => { settings.size = Math.max(14, settings.size - 1); applySettings(); saveSettings(); });
  $('#sizeUp').addEventListener('click', () => { settings.size = Math.min(30, settings.size + 1); applySettings(); saveSettings(); });
  $('#notesToggle').addEventListener('change', (e) => { settings.notes = e.target.checked; applySettings(); saveSettings(); });
  document.querySelectorAll('[data-theme-opt]').forEach((b) => b.addEventListener('click', () => { settings.theme = b.dataset.themeOpt; applySettings(); saveSettings(); }));
  const settingsBtn = $('#settingsBtn'), settingsPanel = $('#settings');
  function toggleSettings(open) {
    const o = open === undefined ? settingsPanel.hidden : open;
    settingsPanel.hidden = !o; settingsBtn.setAttribute('aria-expanded', String(o));
  }
  settingsBtn.addEventListener('click', () => toggleSettings());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheet(); toggleSettings(false); } });
  applySettings();

  // ---------- Data ----------
  let catalog = null, front = null;
  const bookCache = {};
  const getJSON = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  async function loadCatalog() { return catalog || (catalog = await getJSON('data/books.json')); }
  async function loadFront() { return front || (front = await getJSON('data/front-matter.json')); }
  async function loadBook(id) {
    if (bookCache[id]) return bookCache[id];
    const cat = await loadCatalog();
    const b = cat.books.find((x) => x.id === id);
    if (!b || !b.file) return null;
    return (bookCache[id] = await getJSON(b.file));
  }

  // ---------- Helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = (t) => t.replace(/\{[a-z]+\}/g, '');
  const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').toLowerCase();
  const DIV_NOTES = {
    'Old Testament': 'The 39 books of the Hebrew Bible, translated from the Hebrew and Aramaic and checked against the Dead Sea Scrolls, the Septuagint, and the Samaritan Pentateuch.',
    Apocrypha: 'Books accepted as Scripture by Catholic and Orthodox churches, translated mainly from the Septuagint and early Hebrew and Aramaic finds.',
    'New Testament': 'The 27 books of the New Testament, translated from the Greek with the earliest papyri and codices.',
    Pseudepigrapha: 'Ancient Jewish and Christian writings included for study. 1 Enoch and Jubilees are in the Ethiopian Orthodox canon.',
  };
  function setTitle(text, onClick) {
    const t = $('#barTitle');
    if (!text) { t.hidden = true; t.onclick = null; return; }
    t.hidden = false; t.textContent = text; t.onclick = onClick;
    t.setAttribute('aria-label', text + ': choose another chapter');
  }
  function render(html, title) {
    main.innerHTML = html;
    document.title = title ? title + ' · CJT' : NAME + '™ (CJT)';
  }

  // ---------- Routes ----------
  async function route() {
    closeSheet(); toggleSettings(false);
    const hash = location.hash.replace(/^#\/?/, '');
    const [path, query] = hash.split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    try {
      if (!parts.length) await home();
      else if (parts[0] === 'books') await books(parts[1]);
      else if (parts[0] === 'read') await reader(parts[1], +parts[2] || 1, +parts[3] || 0);
      else if (parts[0] === 'search') await search(new URLSearchParams(query || '').get('q') || '');
      else if (parts[0] === 'about') await about(parts[1]);
      else await home();
    } catch (err) {
      console.error(err);
      render('<p class="empty">This page could not be loaded. If you are offline, open it once while online so it can be saved for offline reading.</p>');
    }
  }
  window.addEventListener('hashchange', () => { route().then(() => { if (!/\/read\/.+\/\d+\/\d+/.test(location.hash) && !/#\/about\/./.test(location.hash)) window.scrollTo(0, 0); }); });

  // ----- Home -----
  async function home() {
    const [fm, cat] = await Promise.all([loadFront(), loadCatalog()]);
    const prayer = fm.sections.find((s) => s.id === 'prayer');
    const done = cat.books.filter((b) => b.translated.length);
    const totalCh = cat.books.reduce((n, b) => n + (parseInt(b.chapterCount, 10) || 0), 0);
    const doneCh = cat.books.reduce((n, b) => n + b.translated.length, 0);
    const first = done[0];
    const last = readJSON('cjt-last');
    setTitle('');
    const prayerHtml = prayer.blocks.filter((b) => b.type === 'text').map((b) => `<p>${esc(b.text)}</p>`).join('');
    render(`
      <section class="hero" aria-labelledby="homeTitle">
        <img class="hero-logo" src="icons/cjt-logo-720.jpg" width="330" height="330"
             alt="Clay Jar Translation logo: a terracotta clay jar holding a scroll, with rays of light rising from it.">
        <h1 id="homeTitle">${NAME}${TM}<span class="visually-hidden"> trademark</span></h1>
        <p class="tag">A new English Bible from the oldest witnesses, given freely to the public domain.</p>
        <p class="free-line"><strong>Free forever:</strong> no sign-up, no ads, no tracking.</p>
        <div class="cta">
          ${last.book ? `<a class="btn primary" href="#/read/${esc(last.book)}/${last.ch}">Continue ${esc(last.name)} ${last.ch}</a>` : ''}
          ${first ? `<a class="btn ${last.book ? '' : 'primary'}" href="#/read/${first.id}/${first.translated[0]}">Start reading ${esc(first.name)}</a>` : ''}
          <a class="btn" href="#/books">All books</a>
        </div>
        <p class="verse-quote">“We have this treasure in clay jars, so that the surpassing power belongs to God and not to us.”<br><small>2 Corinthians 4:7</small></p>
      </section>

      <section class="card prayer" aria-labelledby="prayerTitle">
        <h2 id="prayerTitle">${esc(prayer.heading)}</h2>
        ${prayerHtml}
      </section>

      <section class="card progress" aria-labelledby="progTitle">
        <h2 id="progTitle" style="margin:0;font-size:1.1rem">Progress</h2>
        <p class="muted" style="margin:.35rem 0 0">${done.map((b) => `${esc(b.name)} ${rangeText(b.translated)}`).join(', ') || 'Nothing yet'} translated so far: ${doneCh} of about ${totalCh} chapters in ${cat.books.length} books.</p>
        <div class="meter" role="img" aria-label="${doneCh} of about ${totalCh} chapters translated"><i style="width:${Math.max(1, (doneCh / totalCh) * 100).toFixed(2)}%"></i></div>
      </section>

      <section class="card share" aria-labelledby="shareTitle" style="margin-top:1.25rem">
        <h2 id="shareTitle" style="margin:0;font-size:1.1rem">Download and share</h2>
        <p class="muted" style="margin:.35rem 0 .75rem">The translation text is in the public domain. You may copy, print, share, put it on your own website or app, translate it, or sell it, without asking anyone. The full text is available here as plain data files, and this site works offline once opened.</p>
        <div class="cta" style="justify-content:flex-start;margin:0">
          <button class="btn" type="button" id="shareBtn">Share this Bible</button>
          ${done.map((b) => `<a class="btn" href="${esc(b.file)}" download>Download ${esc(b.name)} (JSON)</a>`).join('')}
        </div>
      </section>

      <ul class="links" aria-label="More">
        <li><a href="#/about">About this translation <span>name, free dedication, method, sources</span></a></li>
        <li><a href="#/about/approach">How we translate <span>word for word, thought for thought</span></a></li>
        <li><a href="#/about/draft">A note on this draft <span>AI-assisted, awaiting review</span></a></li>
      </ul>`);
    $('#shareBtn').addEventListener('click', async () => {
      const data = { title: NAME + '™ (CJT)', text: 'A new public-domain English Bible: free to read, copy, and share.', url: location.href.split('#')[0] };
      if (navigator.share) { try { await navigator.share(data); } catch (e) {} return; }
      try { await navigator.clipboard.writeText(data.url); $('#shareBtn').textContent = 'Link copied'; } catch (e) { prompt('Copy this link:', data.url); }
    });
  }
  function rangeText(arr) {
    if (!arr.length) return '';
    const out = []; let s = arr[0], p = arr[0];
    for (const n of arr.slice(1).concat([null])) { if (n === p + 1) { p = n; continue; } out.push(s === p ? `${s}` : `${s}–${p}`); s = p = n; }
    return out.join(', ');
  }

  // ----- Book list -----
  async function books(openId) {
    const cat = await loadCatalog();
    let active = sessionStorage.getItem('cjt-div') || 'Old Testament';
    if (openId) { const b = cat.books.find((x) => x.id === openId); if (b) active = b.division; }
    setTitle('');
    const draw = () => {
      const list = cat.books.filter((b) => b.division === active);
      const tabs = cat.divisions.map((d) => {
        const n = cat.books.filter((b) => b.division === d).length;
        return `<button class="tab" role="tab" id="tab-${d.replace(/\s/g, '')}" aria-controls="bookPanel" aria-selected="${d === active}" tabindex="${d === active ? 0 : -1}" data-div="${esc(d)}">${esc(d)}<small>${n}</small></button>`;
      }).join('');
      const rows = list.map((b) => {
        const total = parseInt(b.chapterCount, 10);
        if (!b.translated.length) {
          return `<li><div class="book-row soon" aria-disabled="true"><span class="bname">${esc(b.name)}</span><span class="meta"><span class="pill">Coming soon</span></span></div></li>`;
        }
        const open = b.id === openId || (list.filter((x) => x.translated.length).length === 1 && !openId);
        let grid = '';
        if (!isNaN(total)) for (let i = 1; i <= total; i++) grid += b.translated.includes(i) ? `<a href="#/read/${b.id}/${i}" aria-label="${esc(b.name)} chapter ${i}">${i}</a>` : `<span aria-hidden="true">${i}</span>`;
        return `<li><button class="book-row" type="button" aria-expanded="${open}" aria-controls="ch-${b.id}" data-book="${b.id}"><span class="bname">${esc(b.name)}</span><span class="meta"><b>${b.translated.length}</b> of ${esc(b.chapterCount)} chapters ready</span></button>
          <div class="chapters" id="ch-${b.id}" ${open ? '' : 'hidden'} role="group" aria-label="${esc(b.name)} chapters">${grid}</div></li>`;
      }).join('');
      render(`<h1>Books</h1>
        <div class="tabs" role="tablist" aria-label="Collections">${tabs}</div>
        <div id="bookPanel" role="tabpanel" aria-labelledby="tab-${active.replace(/\s/g, '')}">
          <p class="division-note">${esc(DIV_NOTES[active] || '')}</p>
          <ul class="book-list">${rows}</ul>
        </div>`, 'Books');
      main.querySelectorAll('.tab').forEach((t) => {
        t.addEventListener('click', () => { active = t.dataset.div; sessionStorage.setItem('cjt-div', active); draw(); $('.tab[aria-selected="true"]').focus(); });
        t.addEventListener('keydown', (e) => {
          const i = cat.divisions.indexOf(active);
          const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
          if (j === null) return;
          active = cat.divisions[(j + cat.divisions.length) % cat.divisions.length]; sessionStorage.setItem('cjt-div', active); draw(); $('.tab[aria-selected="true"]').focus();
        });
      });
      main.querySelectorAll('.book-row[data-book]').forEach((btn) => btn.addEventListener('click', () => {
        const g = $('#ch-' + btn.dataset.book); g.hidden = !g.hidden; btn.setAttribute('aria-expanded', String(!g.hidden));
      }));
    };
    draw();
  }

  // ----- Reader -----
  async function reader(id, n, verse) {
    const [cat, book] = [await loadCatalog(), await loadBook(id)];
    if (!book) return books();
    const ch = book.chapters.find((c) => c.n === n) || book.chapters[0];
    const idx = book.chapters.indexOf(ch);
    const prev = book.chapters[idx - 1], next = book.chapters[idx + 1];
    const notesBy = {}; ch.notes.forEach((x) => (notesBy[x.m] = x));
    const starts = ch.paras.concat([ch.verses.length + 1]);
    const fnHtml = (t) => esc(t).replace(/\{([a-z]+)\}/g, (_, m) => notesBy[m] ? `<button type="button" class="fn" data-m="${m}" aria-label="Footnote ${m}" aria-haspopup="dialog">${m}</button>` : '');
    // Optional chapter heading (e.g., the five books of Psalms) and title (a psalm's superscription).
    const pre = (ch.heading ? `<h2 class="ch-heading">${esc(ch.heading)}</h2>` : '') + (ch.title ? `<p class="ch-title">${fnHtml(ch.title)}</p>` : '');
    const paras = ch.paras.map((s, pi) => {
      const vs = ch.verses.slice(s - 1, starts[pi + 1] - 1).map((v) => {
        const body = esc(v.text).replace(/\{([a-z]+)\}/g, (_, m) => {
          const note = notesBy[m];
          return note ? `<button type="button" class="fn" data-m="${m}" aria-label="Footnote ${m}" aria-haspopup="dialog">${m}</button>` : '';
        });
        const isFirst = v.v === 1;
        const sup = `<sup class="vnum${isFirst ? ' first' : ''}" aria-label="Verse ${v.v}">${v.v}</sup>`;
        // Poetry: a verse text may contain line breaks ("\n"); each becomes its own indented line.
        if (body.includes('\n')) {
          const lines = body.split('\n').map((l, li) => `<span class="pl">${li === 0 ? sup : ''}${l.trim()}</span>`).join('');
          return `<span class="verse" id="v${v.v}">${lines}</span>`;
        }
        return `<span class="verse" id="v${v.v}">${sup}${body}</span>`;
      }).join(' ');
      const poem = ch.verses.slice(s - 1, starts[pi + 1] - 1).some((v) => v.text.includes('\n'));
      const sub = ch.subheads && ch.subheads[s] ? `<h3 class="ch-sub">${esc(ch.subheads[s])}</h3>` : '';
      return `${sub}<p${poem ? ' class="poem"' : ''}>${vs}</p>`;
    }).join('');
    const notes = ch.notes.map((x) => `<li id="note-${x.m}"><span class="m">${x.m}</span><a class="r" href="#/read/${id}/${ch.n}/${x.ref.split(':')[1] || ''}">${esc(x.ref)}</a><span>${esc(x.text)}</span></li>`).join('');
    const bookMeta = cat.books.find((b) => b.id === id);
    setTitle(`${book.name} ${ch.n}`, () => { location.hash = '#/books/' + id; });
    render(`
      <article aria-labelledby="chTitle">
        <header class="reader-head">
          <p class="eyebrow">${esc(book.division)}</p>
          <h1 id="chTitle">${esc(book.name)} <span class="chapter-num">Chapter ${ch.n}</span></h1>
        </header>
        <div class="scripture">${pre}${paras}</div>
        <section class="notes" aria-labelledby="notesTitle">
          <h2 id="notesTitle">Footnotes to ${esc(book.name)} ${ch.n}</h2>
          <ol>${notes}</ol>
        </section>
        ${book.sourceNote && !next ? `<p class="source-note">${esc(book.sourceNote)}</p>` : ''}
        <nav class="pager" aria-label="Chapters">
          <a class="btn" ${prev ? `href="#/read/${id}/${prev.n}"` : 'aria-disabled="true" tabindex="-1"'}>← ${prev ? esc(book.name) + ' ' + prev.n : ''}</a>
          <a class="btn" ${next ? `href="#/read/${id}/${next.n}"` : 'aria-disabled="true" tabindex="-1"'}>${next ? esc(book.name) + ' ' + next.n : ''} →</a>
        </nav>
        ${!next && bookMeta && bookMeta.translated.length < parseInt(bookMeta.chapterCount, 10) ? `<p class="empty">${esc(book.name)} ${ch.n + 1} and following are coming soon.</p>` : ''}
      </article>`, `${book.name} ${ch.n}`);
    main.querySelectorAll('.fn').forEach((b) => b.addEventListener('click', () => openSheet(notesBy[b.dataset.m], b)));
    try { localStorage.setItem('cjt-last', JSON.stringify({ book: id, name: book.name, ch: ch.n })); } catch (e) {}
    if (verse) {
      const el = $('#v' + verse);
      if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
    } else window.scrollTo(0, 0);
  }

  // ---------- Footnote sheet ----------
  const sheet = $('#sheet'), backdrop = $('#sheetBackdrop');
  let lastTrigger = null;
  function openSheet(note, trigger) {
    if (!note) return;
    lastTrigger = trigger;
    document.querySelectorAll('.fn.active').forEach((x) => x.classList.remove('active'));
    trigger.classList.add('active');
    $('#sheetRef').textContent = `Note ${note.m} · ${note.ref}`;
    $('#sheetText').textContent = note.text;
    sheet.hidden = false; backdrop.hidden = false;
    $('#sheetClose').focus();
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = true; backdrop.hidden = true;
    document.querySelectorAll('.fn.active').forEach((x) => x.classList.remove('active'));
    if (lastTrigger && document.body.contains(lastTrigger)) lastTrigger.focus();
  }
  $('#sheetClose').addEventListener('click', closeSheet);
  backdrop.addEventListener('click', closeSheet);
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); $('#sheetClose').focus(); } });

  // ----- Search -----
  async function search(q) {
    setTitle('');
    const cat = await loadCatalog();
    const avail = cat.books.filter((b) => b.file);
    render(`<h1>Search</h1>
      <form class="search-box" role="search" id="searchForm">
        <label for="q" class="visually-hidden">Search the translated text</label>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="q" type="search" placeholder="Search words or a reference, e.g. Genesis 3:15" value="${esc(q)}" autocomplete="off" enterkeyhint="search">
      </form>
      <div class="search-opts"><label><input type="checkbox" id="inNotes"> Include footnotes</label></div>
      <p class="count" id="count" aria-live="polite"></p>
      <ul class="results" id="results"></ul>`, 'Search');
    const input = $('#q'), inNotes = $('#inNotes');
    inNotes.checked = sessionStorage.getItem('cjt-innotes') === '1';
    const loaded = await Promise.all(avail.map((b) => loadBook(b.id)));
    const index = [];
    loaded.forEach((book) => book && book.chapters.forEach((c) => {
      c.verses.forEach((v) => index.push({ kind: 'v', book, c: c.n, v: v.v, text: plain(v.text) }));
      c.notes.forEach((x) => index.push({ kind: 'n', book, c: c.n, v: +(x.ref.split(':')[1] || 0), m: x.m, text: x.text }));
    }));
    const run = () => {
      const raw = input.value.trim();
      history.replaceState(null, '', '#/search' + (raw ? '?q=' + encodeURIComponent(raw) : ''));
      const out = $('#results'), count = $('#count');
      if (raw.length < 2) { out.innerHTML = ''; count.textContent = raw ? 'Type at least two letters.' : `Searching ${avail.map((b) => b.name + ' ' + rangeText(b.translated)).join(', ')}.`; return; }
      // Reference lookup, e.g. "gen 3:15" or "Genesis 3"
      const ref = /^([1-4]?\s*[a-z][a-z .]*?)\s*(\d+)(?::(\d+))?$/i.exec(raw);
      if (ref) {
        const nm = fold(ref[1]).replace(/\s+/g, '');
        const b = avail.find((x) => fold(x.name).replace(/\s+/g, '').startsWith(nm));
        if (b && b.translated.includes(+ref[2])) {
          count.textContent = '';
          out.innerHTML = `<li><a href="#/read/${b.id}/${ref[2]}${ref[3] ? '/' + ref[3] : ''}"><span class="ref">Go to ${esc(b.name)} ${ref[2]}${ref[3] ? ':' + ref[3] : ''}</span></a></li>`;
          return;
        }
      }
      const terms = fold(raw).replace(/"/g, '').split(/\s+/).filter(Boolean);
      const hits = index.filter((e) => (e.kind === 'v' || inNotes.checked) && terms.every((t) => fold(e.text).includes(t)));
      count.textContent = hits.length ? `${hits.length} result${hits.length === 1 ? '' : 's'}${hits.length > 200 ? ', showing the first 200' : ''}` : 'No matches in the chapters translated so far.';
      out.innerHTML = hits.slice(0, 200).map((e) => {
        const ref = `${e.book.name} ${e.c}:${e.v}`;
        return `<li><a href="#/read/${e.book.id}/${e.c}/${e.v}"><span class="ref">${esc(ref)}${e.kind === 'n' ? ` <small>footnote ${e.m}</small>` : ''}</span><span class="txt">${highlight(e.text, terms)}</span></a></li>`;
      }).join('');
    };
    let timer;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
    inNotes.addEventListener('change', () => { sessionStorage.setItem('cjt-innotes', inNotes.checked ? '1' : '0'); run(); });
    $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); run(); input.blur(); });
    run();
    if (!q) input.focus();
  }
  function highlight(text, terms) {
    // Highlight on the folded string, map back to original positions (folding keeps length for these characters).
    const f = fold(text);
    if (f.length !== text.length) return esc(text);
    const marks = new Array(text.length).fill(false);
    terms.forEach((t) => { let i = f.indexOf(t); while (i > -1) { for (let k = i; k < i + t.length; k++) marks[k] = true; i = f.indexOf(t, i + t.length); } });
    let out = '', open = false;
    for (let i = 0; i < text.length; i++) {
      if (marks[i] && !open) { out += '<mark>'; open = true; }
      if (!marks[i] && open) { out += '</mark>'; open = false; }
      out += esc(text[i]);
    }
    return out + (open ? '</mark>' : '');
  }

  // ----- Front matter -----
  async function about(anchor) {
    const fm = await loadFront();
    setTitle('');
    const block = (b, level) => {
      switch (b.type) {
        case 'text': return `<p>${esc(b.text)}</p>`;
        case 'callout': return `<div class="callout ${esc(b.tone)}" role="note"><strong>${esc(b.lead)}</strong><p>${esc(b.text)}</p></div>`;
        case 'properties': return `<dl class="props">${b.items.map((i) => `<dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd>`).join('')}</dl>`;
        case 'steps': return `<ol class="steps">${b.steps.map((s) => `<li><b>${esc(s.title)}</b><span>${esc(s.detail)}</span></li>`).join('')}</ol>`;
        case 'table': return `<div class="table-wrap" tabindex="0" role="region" aria-label="Table"><table class="stack"><thead><tr>${b.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => `<td${b.columns[i] ? ` data-label="${esc(b.columns[i])}"` : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        case 'section': {
          const h = Math.min(level, 4);
          return `<section${b.id ? ` id="${esc(b.id)}"` : ''}><h${h}>${esc(b.heading)}</h${h}>${b.blocks.map((x) => block(x, level + 1)).join('')}</section>`;
        }
      }
      return '';
    };
    render(`<div class="fm prose">
      <p class="eyebrow">Front matter</p>
      <h1>${NAME}${TM} (CJT)</h1>
      <p class="muted">${esc(fm.summary)}</p>
      <nav class="toc" aria-label="Sections">${fm.sections.map((s) => `<a href="#/about/${s.id}">${esc(s.heading)}</a>`).join('')}</nav>
      ${fm.sections.map((s) => block(s, 2)).join('')}
    </div>`, 'About');
    if (anchor) { const el = document.getElementById(anchor); if (el) el.scrollIntoView(); }
    else window.scrollTo(0, 0);
  }

  // ---------- Offline ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Offline mode unavailable:', e.message)));
  }
  function offlineBadge() {
    let b = $('.offline-badge');
    if (navigator.onLine) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.className = 'offline-badge'; b.setAttribute('role', 'status'); b.textContent = 'Offline: reading saved copy'; document.body.appendChild(b); }
  }
  window.addEventListener('online', offlineBadge); window.addEventListener('offline', offlineBadge);

  route();
})();
