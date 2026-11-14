/* Build the CC BY 4.0 downloads from data/books.
   Free tools only: Node writes the files, Typst writes the PDF,
   Pandoc writes the EPUB, epubcheck checks it.
   Usage: node tools/build-downloads.js
   EPUBCHECK=/path/to/epubcheck.jar to validate. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'downloads');
const WORK = path.join(OUT, '.build');
const EPUBCHECK = process.env.EPUBCHECK || '/tmp/epubcheck-5.2.1/epubcheck.jar';

const USFM = {
  genesis: 'GEN', exodus: 'EXO', leviticus: 'LEV', numbers: 'NUM', deuteronomy: 'DEU',
  joshua: 'JOS', judges: 'JDG', ruth: 'RUT', '1-samuel': '1SA', '2-samuel': '2SA',
  '1-kings': '1KI', '2-kings': '2KI', '1-chronicles': '1CH', '2-chronicles': '2CH',
  ezra: 'EZR', nehemiah: 'NEH', esther: 'EST', job: 'JOB', psalms: 'PSA', proverbs: 'PRO',
  ecclesiastes: 'ECC', 'song-of-songs': 'SNG', isaiah: 'ISA', jeremiah: 'JER',
  lamentations: 'LAM', ezekiel: 'EZK', daniel: 'DAN', hosea: 'HOS', joel: 'JOL',
  amos: 'AMO', obadiah: 'OBA', jonah: 'JON', micah: 'MIC', nahum: 'NAM', habakkuk: 'HAB',
  zephaniah: 'ZEP', haggai: 'HAG', zechariah: 'ZEC', malachi: 'MAL',
  tobit: 'TOB', judith: 'JDT', 'additions-to-esther': 'ESG', 'wisdom-of-solomon': 'WIS',
  'sirach-ben-sira': 'SIR', baruch: 'BAR', 'letter-of-jeremiah': 'LJE',
  'additions-to-daniel-prayer-of-azariah-and-song-of-the-three': 'S3Y',
  'additions-to-daniel-susanna': 'SUS', 'additions-to-daniel-bel-and-the-dragon': 'BEL',
  '1-maccabees': '1MA', '2-maccabees': '2MA', '3-maccabees': '3MA', '4-maccabees': '4MA',
  '1-esdras': '1ES', '2-esdras': '2ES', 'prayer-of-manasseh': 'MAN', 'psalm-151': 'PS2',
  matthew: 'MAT', mark: 'MRK', luke: 'LUK', john: 'JHN', acts: 'ACT', romans: 'ROM',
  '1-corinthians': '1CO', '2-corinthians': '2CO', galatians: 'GAL', ephesians: 'EPH',
  philippians: 'PHP', colossians: 'COL', '1-thessalonians': '1TH', '2-thessalonians': '2TH',
  '1-timothy': '1TI', '2-timothy': '2TI', titus: 'TIT', philemon: 'PHM', hebrews: 'HEB',
  james: 'JAS', '1-peter': '1PE', '2-peter': '2PE', '1-john': '1JN', '2-john': '2JN',
  '3-john': '3JN', jude: 'JUD', revelation: 'REV',
  '1-enoch': 'ENO', jubilees: 'JUB', '2-enoch': '2EN', '2-baruch': '2BA', '4-baruch': '4BA',
  'testaments-of-the-twelve-patriarchs': 'T12', 'psalms-of-solomon': 'PSS',
  'psalms-152-to-155': 'PSX', 'odes-of-solomon': 'ODS', 'life-of-adam-and-eve': 'LAE',
  'joseph-and-aseneth': 'JAE', 'apocalypse-of-abraham': 'APA', 'ascension-of-isaiah': 'AIS',
  'letter-of-aristeas': 'LAR',
};

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function htmlEsc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function typstEsc(s) {
  return String(s).split('\n').map((line) => {
    let t = line.replace(/\\/g, '\\\\').replace(/[#$*_`<>@[\]|]/g, (ch) => '\\' + ch);
    t = t.replace(/\/\//g, '/\u200b/');
    if (t.startsWith('=') || t.startsWith('+') || t.startsWith('-') || t.startsWith('/')) t = '\u200b' + t;
    return t;
  }).join('\n');
}
function plain(s) { return String(s).replace(/\{[a-z]+\}/g, '').replace(/\s+/g, ' ').trim(); }

function loadBooks() {
  const cat = readJSON(path.join(ROOT, 'data', 'books.json'));
  const codes = new Set();
  const books = cat.books.map((meta) => {
    const full = readJSON(path.join(ROOT, meta.file));
    const usfm = USFM[meta.id];
    if (!usfm || codes.has(usfm)) throw new Error('USFM id missing or duplicate for ' + meta.id + ' ' + usfm);
    codes.add(usfm);
    return { meta, full, usfm };
  });
  return { cat, books };
}

function chapterParagraphs(ch) {
  const starts = new Set((ch.paras && ch.paras.length) ? ch.paras : [1]);
  const groups = [];
  let cur = [];
  for (const v of ch.verses || []) {
    if (starts.has(v.v) && cur.length) { groups.push(cur); cur = []; }
    cur.push(v);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function writeJSON(books, cat) {
  const doc = {
    format: 'cjt-text',
    version: 2,
    title: 'Clay Jar Translation',
    edition: cat.edition || 'Draft 0.1',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    copyright: '© 2026 Jose Santiago',
    attribution: 'Clay Jar Translation (CJT), © 2026 Jose Santiago, CC BY 4.0.',
    trademark: 'Clay Jar Translation™, Clay Jar Treasure Bible™ and their logos are trademarks of Jose Santiago. The CC BY license covers the text, not the names or logos, which may be used only to credit the source.',
    language: 'en',
    books: books.map(({ meta, full, usfm }) => ({
      id: meta.id,
      name: full.name || meta.name,
      division: meta.division,
      usfm,
      sourceNote: full.sourceNote || '',
      chapters: (full.chapters || []).map((ch) => ({
        n: ch.n,
        heading: ch.heading || null,
        title: ch.title || null,
        paras: ch.paras || [],
        subheads: ch.subheads || null,
        verses: (ch.verses || []).map((v) => ({ v: v.v, text: v.text })),
        notes: (ch.notes || []).map((n) => ({ m: n.m, ref: n.ref, text: n.text })),
      })),
    })),
  };
  const file = path.join(OUT, 'clay-jar-translation.json');
  fs.writeFileSync(file, JSON.stringify(doc));
  return file;
}

function writeText(books) {
  const parts = [];
  parts.push('CLAY JAR TRANSLATION');
  parts.push('© 2026 Jose Santiago. Licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0).');
  parts.push('https://creativecommons.org/licenses/by/4.0/');
  parts.push('Suggested attribution: Clay Jar Translation (CJT), © 2026 Jose Santiago, CC BY 4.0.');
  parts.push('Clay Jar Translation™, Clay Jar Treasure Bible™ and their logos are trademarks of Jose Santiago. The CC BY license covers the text, not the names or logos, which may be used only to credit the source.');
  parts.push('Draft 0.1. Not yet reviewed by scholars.');
  parts.push('');
  for (const { full } of books) {
    parts.push(full.name.toUpperCase());
    parts.push('');
    for (const ch of full.chapters || []) {
      parts.push('Chapter ' + ch.n);
      if (ch.heading) parts.push(ch.heading);
      if (ch.title) parts.push(ch.title.replace(/\{[a-z]+\}/g, ''));
      parts.push('');
      for (const group of chapterParagraphs(ch)) {
        const line = group.map((v) => v.v + ' ' + v.text.replace(/\{([a-z]+)\}/g, '[$1]').replace(/\n/g, '\n')).join(' ');
        parts.push(line);
        parts.push('');
      }
      if (ch.notes && ch.notes.length) {
        parts.push('Notes');
        for (const n of ch.notes) parts.push(n.m + ' (' + n.ref + ') ' + n.text);
        parts.push('');
      }
    }
    parts.push('');
  }
  const file = path.join(OUT, 'clay-jar-translation.txt');
  fs.writeFileSync(file, parts.join('\n'));
  return file;
}

function usfmEscape(s) { return String(s).replace(/\\/g, ''); }
function writeUsfm(books) {
  const dir = path.join(WORK, 'usfm');
  fs.mkdirSync(dir, { recursive: true });
  const names = [];
  for (const { meta, full, usfm } of books) {
    const lines = [
      '\\id ' + usfm,
      '\\ide UTF-8',
      '\\rem © 2026 Jose Santiago. Licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0). https://creativecommons.org/licenses/by/4.0/',
      '\\rem Suggested attribution: Clay Jar Translation (CJT), © 2026 Jose Santiago, CC BY 4.0.',
      '\\rem Clay Jar Translation™, Clay Jar Treasure Bible™ and their logos are trademarks of Jose Santiago. The CC BY license covers the text, not the names or logos, which may be used only to credit the source.',
      '\\h ' + usfmEscape(full.name),
      '\\toc1 ' + usfmEscape(full.name),
      '\\mt1 ' + usfmEscape(full.name),
    ];
    for (const ch of full.chapters || []) {
      lines.push('\\c ' + ch.n);
      if (ch.heading) lines.push('\\s1 ' + usfmEscape(ch.heading));
      if (ch.title) lines.push('\\d ' + usfmEscape(ch.title.replace(/\{[a-z]+\}/g, '')));
      for (const v of ch.verses || []) {
        const ref = ch.n + ':' + v.v;
        let text = usfmEscape(v.text).replace(/\{([a-z]+)\}/g, (_, m) => {
          const note = (ch.notes || []).find((n) => n.m === m);
          const ft = note ? usfmEscape(note.text).replace(/\s+/g, ' ').trim() : '';
          return '\\f + \\fr ' + ref + ' \\ft ' + ft + '\\f*';
        });
        if (text.includes('\n')) {
          const bits = text.split('\n');
          lines.push('\\q1');
          lines.push('\\v ' + v.v + ' ' + bits[0].trim());
          bits.slice(1).forEach((bit) => lines.push('\\q1 ' + bit.trim()));
        } else {
          lines.push('\\v ' + v.v + ' ' + text.replace(/\s+/g, ' ').trim());
        }
      }
    }
    const name = usfm + '.usfm';
    fs.writeFileSync(path.join(dir, name), lines.join('\n') + '\n');
    names.push(name);
  }
  const zip = path.join(OUT, 'clay-jar-translation-usfm.zip');
  const script = `
import zipfile, pathlib, os
src = pathlib.Path(os.environ['USFM_DIR'])
out = pathlib.Path(os.environ['USFM_ZIP'])
with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for p in sorted(src.glob('*.usfm')):
        z.write(p, p.name)
`;
  const made = spawnSync('python3', ['-c', script], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { USFM_DIR: dir, USFM_ZIP: zip }),
  });
  if (made.status !== 0) throw new Error(made.stderr || 'zip failed');
  return zip;
}

function htmlVerse(bookId, ch, v) {
  const text = htmlEsc(v.text).replace(/\{([a-z]+)\}/g, (_, m) => `<sup class="fn">${m}</sup>`).replace(/\n/g, '<br>');
  return `<sup class="v">${v.v}</sup> ${text}`;
}

function writeHtml(books) {
  const body = [];
  body.push('<div class="front">');
  body.push('<p class="eyebrow">CC BY 4.0</p>');
  body.push('<p class="site-title">Clay Jar Translation</p>');
  body.push('<p>© 2026 Jose Santiago. Licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0). <a href="https://creativecommons.org/licenses/by/4.0/">https://creativecommons.org/licenses/by/4.0/</a></p>');
  body.push('<p>Suggested attribution: “Clay Jar Translation (CJT), © 2026 Jose Santiago, CC BY 4.0.”</p>');
  body.push('<p>Clay Jar Translation™, Clay Jar Treasure Bible™ and their logos are trademarks of Jose Santiago. The CC BY license covers the text, not the names or logos, which may be used only to credit the source.</p>');
  body.push('<p>Draft 0.1, made with AI assistance and not yet reviewed by scholars.</p>');
  body.push('</div>');
  for (const { meta, full } of books) {
    const bid = 'b-' + meta.id;
    body.push(`<h1 id="${htmlEsc(bid)}">${htmlEsc(full.name)}</h1>`);
    body.push(`<p class="div">${htmlEsc(meta.division)}</p>`);
    body.push('<div class="book-toc"><p>Chapters</p><ol>');
    for (const ch of full.chapters || []) {
      body.push(`<li><a href="#${bid}-c${ch.n}">Chapter ${ch.n}</a></li>`);
    }
    body.push('</ol></div>');
    for (const ch of full.chapters || []) {
      body.push(`<h2 id="${bid}-c${ch.n}">Chapter ${ch.n}</h2>`);
      if (ch.heading) body.push(`<p class="ch-heading">${htmlEsc(ch.heading)}</p>`);
      if (ch.title) body.push(`<p class="ch-title">${htmlEsc(ch.title).replace(/\{([a-z]+)\}/g, '<sup>$1</sup>')}</p>`);
      let first = true;
      for (const group of chapterParagraphs(ch)) {
        const poetry = group.some((v) => String(v.text).includes('\n'));
        const cls = (first ? 'first' : '') + (poetry ? ' poem' : '');
        const inner = group.map((v) => {
          const sub = ch.subheads && ch.subheads[v.v] ? `<strong class="sub">${htmlEsc(ch.subheads[v.v])}</strong> ` : '';
          return sub + htmlVerse(meta.id, ch, v);
        }).join(' ');
        body.push(`<p class="${cls.trim()}">${inner}</p>`);
        first = false;
      }
      if (ch.notes && ch.notes.length) {
        body.push('<ol class="notes">');
        for (const n of ch.notes) {
          body.push(`<li><sup>${htmlEsc(n.m)}</sup> ${htmlEsc(n.ref)} ${htmlEsc(n.text)}</li>`);
        }
        body.push('</ol>');
      }
    }
    if (full.sourceNote) body.push(`<p class="source">${htmlEsc(full.sourceNote)}</p>`);
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Clay Jar Translation</title>
</head>
<body>
${body.join('\n')}
</body>
</html>
`;
  const file = path.join(WORK, 'book.html');
  fs.writeFileSync(file, html);
  const css = `body{font-family:Georgia,serif;line-height:1.55;}
h1{page-break-before:always;font-size:1.6rem;}
h2{font-size:1.15rem;margin-top:1.4rem;}
.v,.fn{font-size:.65em;font-weight:700;vertical-align:super;}
p{margin:.45em 0;}
.poem{margin-left:1em;}
.book-toc{font-size:.9rem;}
.notes{font-size:.85rem;}
.front h1{page-break-before:auto;}
`;
  fs.writeFileSync(path.join(WORK, 'epub.css'), css);
  return file;
}

function writeTypst(books) {
  const out = [];
  out.push(`#set document(title: "Clay Jar Translation", author: "Jose Santiago", description: "© 2026 Jose Santiago. Licensed under CC BY 4.0. https://creativecommons.org/licenses/by/4.0/")`);
  out.push(`#set text(font: "Libertinus Serif", size: 11pt, lang: "en")`);
  out.push(`#set page(width: 5.5in, height: 8.5in, margin: (inside: 0.7in, outside: 0.55in, top: 0.72in, bottom: 0.65in), numbering: "1")`);
  out.push(`#set par(justify: true, leading: 0.68em, spacing: 0.72em, first-line-indent: 0pt)`);
  out.push(`#let vn(n) = super(text(size: 0.62em, weight: "bold", fill: rgb("#6b3a22"))[#n])`);
  out.push(`#show heading.where(level: 1): it => { pagebreak(weak: true); v(1.2em); align(center, text(size: 22pt, weight: "bold", it.body)); v(0.8em) }`);
  out.push(`#align(center)[
    #text(size: 22pt, weight: "bold")[Clay Jar Translation]
    #v(0.7em)
    © 2026 Jose Santiago. Licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0).
    #v(0.4em)
    #link("https://creativecommons.org/licenses/by/4.0/")[https://creativecommons.org/licenses/by/4.0/]
    #v(0.6em)
    Suggested attribution: “Clay Jar Translation (CJT), © 2026 Jose Santiago, CC BY 4.0.”
    #v(0.6em)
    Clay Jar Translation™, Clay Jar Treasure Bible™ and their logos are trademarks of Jose Santiago. The CC BY license covers the text, not the names or logos, which may be used only to credit the source.
    #v(0.6em)
    Draft 0.1. Made with AI assistance and not yet reviewed by scholars.
  ]`);
  out.push(`#pagebreak()`);
  out.push(`#outline(title: [Contents], depth: 1)`);
  out.push(`#pagebreak()`);
  for (const { full } of books) {
    out.push(`= ${typstEsc(full.name)}`);
    out.push(`#align(center)[#emph[${typstEsc(full.division || '')}]]`);
    for (const ch of full.chapters || []) {
      out.push(`== Chapter ${ch.n}`);
      if (ch.heading) out.push(`#align(center)[#smallcaps[${typstEsc(ch.heading)}]]`);
      if (ch.title) out.push(`#align(center)[#emph[${typstEsc(String(ch.title).replace(/\{[a-z]+\}/g, ''))}]]`);
      for (const group of chapterParagraphs(ch)) {
        const poetry = group.some((v) => String(v.text).includes('\n'));
        if (poetry) {
          for (const v of group) {
            if (ch.subheads && ch.subheads[v.v]) out.push(`#emph[${typstEsc(ch.subheads[v.v])}]`);
            const lines = String(v.text).split('\n');
            const bits = lines.map((line, i) => {
              const marked = line.split(/(\{[a-z]+\})/g).map((part) => {
                const mm = part.match(/^\{([a-z]+)\}$/);
                if (mm) return `#super[${mm[1]}]`;
                return typstEsc(part);
              }).join('');
              return (i === 0 ? `#vn(${v.v}) ` : '#h(1.1em) ') + marked;
            });
            out.push(bits.join(' \\\n'));
          }
        } else {
          const sentence = group.map((v) => {
            const sub = ch.subheads && ch.subheads[v.v] ? `#emph[${typstEsc(ch.subheads[v.v])}] ` : '';
            const marked = String(v.text).split(/(\{[a-z]+\})/g).map((part) => {
              const mm = part.match(/^\{([a-z]+)\}$/);
              if (mm) return `#super[${mm[1]}]`;
              return typstEsc(part);
            }).join('');
            return sub + `#vn(${v.v}) ` + marked;
          }).join(' ');
          out.push(sentence);
          out.push('');
        }
      }
      if (ch.notes && ch.notes.length) {
        out.push('#v(0.4em)');
        out.push('#text(size: 9pt)[');
        out.push('#strong[Notes]');
        for (const n of ch.notes) out.push(`- ${typstEsc(n.m)} (${typstEsc(n.ref)}) ${typstEsc(n.text)}`);
        out.push(']');
      }
    }
  }
  const file = path.join(WORK, 'book.typ');
  fs.writeFileSync(file, out.join('\n\n'));
  return file;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error(cmd + ' failed');
  }
  return r;
}

function writePage(files) {
  const rows = files.map((f) => {
    const size = fs.statSync(f.path).size;
    const label = size >= 1048576 ? (size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(size / 1024)) + ' KB';
    return { href: f.name, title: f.title, detail: f.detail, size, label };
  });
  // Site nav lives in this template. A rebuild replaces downloads/index.html,
  // so a nav added only to that file would disappear (that happened once).
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self' https://*.sibforms.com; script-src 'self' 'sha256-XfiOjixlN6OMWa4rVzxY5TwF+kBlnWUkmTaaMqDpIjc=' https://clayjartranslation.github.io https://www.gstatic.com https://apis.google.com https://www.google.com; style-src 'self' https://clayjartranslation.github.io; img-src 'self' https://clayjartranslation.github.io data: blob:; font-src 'self' data:; connect-src 'self' https://clayjartranslation.github.io https://www.gstatic.com https://www.googleapis.com https://www.google.com https://firebase.googleapis.com https://firebaseinstallations.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com wss://firestore.googleapis.com https://huggingface.co https://cdn-lfs.huggingface.co https://cdn-lfs-us-1.huggingface.co https://us.aws.cdn.hf.co https://eu.aws.cdn.hf.co https://cas-bridge.xethub.hf.co https://translate.googleapis.com; media-src 'self' blob: https://huggingface.co https://cdn-lfs.huggingface.co https://cdn-lfs-us-1.huggingface.co https://us.aws.cdn.hf.co https://eu.aws.cdn.hf.co https://cas-bridge.xethub.hf.co; worker-src 'self' blob:; manifest-src 'self'; frame-src https://accounts.google.com https://*.firebaseapp.com https://*.web.app https://apis.google.com https://www.google.com https://recaptcha.google.com; upgrade-insecure-requests">
  <title>Downloads · Clay Jar Translation</title>
  <meta name="description" content="Free downloads of the whole Clay Jar Translation: PDF, EPUB, JSON, plain text, and USFM. © 2026 Jose Santiago, CC BY 4.0.">
  <link rel="icon" href="../icons/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="icon" href="../icons/favicon-48.png" sizes="48x48" type="image/png">
  <link rel="stylesheet" href="../css/style.css">
  <script src="../js/boot.js"></script>
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>
  <header class="bar">
    <div class="bar-main"><a class="brand" href="../"><img src="../icons/emblem-96.png" alt="" width="30" height="30"><span>CJT</span></a></div>
    <nav class="site-nav" aria-label="Site">
      <a href="../">Read</a>
      <a href="../devotional.html">Devotional</a>
      <a href="./" aria-current="page">Downloads</a>
      <div class="lang-switch">
        <label class="lang-label" for="cjtLang">
          <svg class="lang-globe" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9s1.3-6.2 3.8-9z"/></svg>
          <span class="lang-word">Language</span>
        </label>
        <select id="cjtLang" aria-label="Language" autocomplete="off"></select>
      </div>
    </nav>
    <p class="mt-notice" id="mtNotice" hidden>Machine translation by Google. The English text is the official Clay Jar Translation.</p>
  </header>
  <main id="content" class="prose downloads">
    <p class="eyebrow">CC BY 4.0</p>
    <h1>Download the Clay Jar Translation</h1>
    <p class="notranslate" translate="no">© 2026 Jose Santiago. Licensed under the <a href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License (CC BY 4.0)</a>. Suggested attribution: “Clay Jar Translation (CJT), © 2026 Jose Santiago, CC BY 4.0.” These files are the whole draft: all 98 books. You may copy, share, adapt, and redistribute the text, including commercially, if you give that attribution. This is Draft 0.1, made with AI assistance and not yet reviewed by scholars.</p>
    <p class="notranslate" translate="no">Clay Jar Translation™, Clay Jar Treasure Bible™ and their logos are trademarks of Jose Santiago. The CC BY license covers the text, not the names or logos, which may be used only to credit the source.</p>
    <p>Nothing here is an account. The files are the Bible text, not anyone’s bookmarks.</p>
    <div class="card">
      ${rows.map((r) => `<div class="file-row"><a href="${htmlEsc(r.href)}">${htmlEsc(r.title)}</a><span class="size">${htmlEsc(r.label)}</span></div><p class="muted file-detail">${htmlEsc(r.detail)}</p>`).join('\n')}
    </div>
    <h2>Kindle</h2>
    <p>Amazon’s Send to Kindle accepts EPUB. On a computer, open <a href="https://www.amazon.com/sendtokindle">Send to Kindle</a>, sign in, and drop <em>clay-jar-translation.epub</em> onto the page. On a phone, use the Send to Kindle app or share the file to it. The book then appears in your Kindle library. You do not buy it. It is the CC BY 4.0 file.</p>
    <h2>Apple Books</h2>
    <p>On a Mac, open the EPUB and it offers Apple Books. On an iPhone or iPad, download the EPUB in Safari, tap the file, and choose Books, or use the Files app and share it to Books. The book is stored on that device.</p>
    <h2>Other reading apps</h2>
    <p>The JSON file is one object per book, chapter, and verse. The shape is described in <a href="SCHEMA.md">SCHEMA.md</a>. The plain-text file is for search and print scripts. The USFM zip is one file per book for translation tools that read USFM.</p>
    <p>These files are rebuilt from the site’s book data when the text changes. <a href="../terms.html">Terms</a> · <a href="../privacy.html">Privacy</a> · <a href="../">Back to the reader</a></p>
  </main>
  <footer class="foot"><p class="accept">By using this site you agree to the <a href="../terms.html">Terms of Service</a> and the <a href="../privacy.html">Privacy Policy</a>.</p><p class="foot-links"><a href="../">Home</a> <a href="../devotional.html">Devotional</a> <a href="./">Downloads</a> <a href="../terms.html">Terms</a> <a href="../privacy.html">Privacy</a></p></footer>
  <script src="../js/languages.js"></script>
  <script src="../js/language.js"></script>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  fs.writeFileSync(path.join(OUT, 'sizes.json'), JSON.stringify(rows.map((r) => ({ file: r.href, bytes: r.size, label: r.label })), null, 2));
}

function main() {
  fs.mkdirSync(WORK, { recursive: true });
  console.log('Loading books…');
  const { cat, books } = loadBooks();
  console.log(books.length + ' books');
  writeJSON(books, cat);
  writeText(books);
  writeUsfm(books);
  const html = writeHtml(books);
  const typ = writeTypst(books);
  console.log('EPUB…');
  run('pandoc', [
    html, '-o', path.join(OUT, 'clay-jar-translation.epub'),
    '--from=html', '--to=epub3',
    '--toc', '--toc-depth=2',
    '--split-level=1',
    '--css', path.join(WORK, 'epub.css'),
    '--metadata', 'title=Clay Jar Translation',
    '--metadata', 'lang=en',
    '--metadata', 'creator=Jose Santiago',
    '--metadata', 'rights=© 2026 Jose Santiago. Licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0). https://creativecommons.org/licenses/by/4.0/',
    '--metadata', 'identifier=urn:uuid:6f1e4b3a-9c2d-4e7a-8b15-0a1c2d3e4f50',
    '--metadata', 'description=Draft 0.1 of the Clay Jar Translation. © 2026 Jose Santiago, CC BY 4.0.',
  ]);
  if (fs.existsSync(EPUBCHECK)) {
    console.log('epubcheck…');
    run('java', ['-jar', EPUBCHECK, path.join(OUT, 'clay-jar-translation.epub')]);
  } else {
    console.warn('epubcheck jar not found, skipped');
  }
  console.log('PDF…');
  run('typst', ['compile', '--root', WORK, typ, path.join(OUT, 'clay-jar-translation.pdf')]);
  const files = [
    { path: path.join(OUT, 'clay-jar-translation.pdf'), name: 'clay-jar-translation.pdf', title: 'Full Bible PDF', detail: 'Readable pages, a contents list of every book, and PDF bookmarks for each book and chapter. Verse numbers are in the text. Footnotes sit at the end of each chapter.' },
    { path: path.join(OUT, 'clay-jar-translation.epub'), name: 'clay-jar-translation.epub', title: 'EPUB', detail: 'EPUB 3 with a navigation document. Each book is its own section, with a chapter list at the start of the book and in the contents.' },
    { path: path.join(OUT, 'clay-jar-translation.json'), name: 'clay-jar-translation.json', title: 'JSON', detail: 'Book, chapter, and verse structure, plus footnotes. See SCHEMA.md.' },
    { path: path.join(OUT, 'clay-jar-translation.txt'), name: 'clay-jar-translation.txt', title: 'Plain text', detail: 'One file, chapter by chapter, for search and simple printing.' },
    { path: path.join(OUT, 'clay-jar-translation-usfm.zip'), name: 'clay-jar-translation-usfm.zip', title: 'USFM (zip)', detail: 'One USFM file per book, for tools that edit or convert Bible text.' },
  ];
  for (const f of files) {
    const n = fs.statSync(f.path).size;
    console.log(f.name, n);
    if (n > 95 * 1024 * 1024) throw new Error(f.name + ' is over 95 MB. Host it on a GitHub Release instead of Pages.');
  }
  writePage(files);
  console.log('Done');
}

main();
