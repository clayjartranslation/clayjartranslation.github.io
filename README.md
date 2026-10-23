# Clay Jar Translation™ (CJT): reading website and installable app

A free, static Bible reader for the Clay Jar Translation. The translation text is dedicated to the
public domain. No login, no accounts, no ads, no paywall, no tracking or analytics, and no third-party
scripts, fonts, or CDNs: every file is in this folder, and all paths are relative, so it runs from a
domain root or a subpath (for example `https://USERNAME.github.io/cjt-bible/`).

## What is here

```
index.html              the app shell (one page, hash routes such as #/read/genesis/1)
css/style.css           all styling (light and dark, palette from the CJT logo)
js/app.js               the reader: home, books, chapters, footnotes, search, front matter
sw.js                   service worker: saves everything for offline reading
manifest.webmanifest    install-to-home-screen info and icons
icons/                  logo and app icons, made from the CJT logo
data/books.json         the canon: all 98 books in 4 collections, with which chapters are done
data/front-matter.json  name, dedication, prayer, method, conventions, sources, draft note
data/books/genesis.json Genesis 1-11: verses, paragraph starts, lettered footnotes
tools/add-book.js       adds a new or updated book JSON (validates it, updates the catalog)
tools/extract-from-canvas.js  re-extracts the text from the project Page's source
```

## Try it on a computer

```
cd cjt-app
python3 -m http.server 8000
```
Then open http://localhost:8000. (Opening index.html directly from disk will not work, because
browsers block loading the data files from `file://`.)

## Adding a new book or more chapters

1. Write the book as JSON in the same shape as `data/books/genesis.json`:
   ```json
   { "id": "exodus", "name": "Exodus", "division": "Old Testament",
     "sourceNote": "Translated from ...",
     "chapters": [
       { "n": 1, "paras": [1, 8, 15],
         "verses": [ { "v": 1, "text": "These are the names{a} of the sons of Israel ..." } ],
         "notes":  [ { "m": "a", "ref": "1:1", "text": "Hebrew shemot ..." } ] } ] }
   ```
   * `paras` lists the verse numbers where a paragraph begins (always starting with 1).
   * Footnote markers go inline as `{a}`, `{b}`, ... and each needs a matching note.
   * The `id` must match one in `data/books.json` (lowercase name with dashes, such as `1-maccabees`).
2. Run `node tools/add-book.js path/to/exodus.json`.
   It checks the file, saves it as `data/books/exodus.json`, marks the chapters as ready (the book
   stops showing "coming soon"), and bumps the offline cache version in `sw.js` so installed copies update.
3. Upload the changed files to the host.

To pull everything again from the project Page, save the Page source to a text file and run
`node tools/extract-from-canvas.js page-source.txt`, then bump `VERSION` in `sw.js` (for example
`cjt-v1` to `cjt-v2`). Whenever you change CSS, JS, or icons by hand, bump `VERSION` too.

## Putting it on GitHub Pages (free)

Needs: a free GitHub account. Nothing else.

1. Create a new **public** repository, for example `cjt-bible`.
2. Upload the contents of this folder (not the folder itself) to the repository root:
   on github.com, "Add file" then "Upload files", and drag everything in, including `.nojekyll`.
3. Go to Settings, then Pages. Under "Build and deployment", pick "Deploy from a branch",
   branch `main`, folder `/ (root)`, and Save.
4. After a minute the site is live at `https://USERNAME.github.io/cjt-bible/`.
5. Optional: a custom domain (such as `clayjarbible.org`, about $10-15 a year from a registrar) can be
   added in the same Pages settings; GitHub provides free HTTPS.

Installing on a phone: open the site, then on iPhone use Share, "Add to Home Screen";
on Android, Chrome offers "Install app" (or menu, "Add to Home screen").
