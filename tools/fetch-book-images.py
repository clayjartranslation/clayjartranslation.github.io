#!/usr/bin/env python3
"""Download public-domain / CC0 book images from Wikimedia Commons, compress them, and write credits."""
import json, re, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
from io import BytesIO
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "downloads" / "images"
MAP = json.loads((ROOT / "tools" / "book-images.json").read_text())
UA = "ClayJarTranslation/1.0 (https://clayjartranslation.github.io; contact.clayjar@protonmail.com) python-urllib"
API = "https://commons.wikimedia.org/w/api.php"
MAX_EDGE = 1000
JPEG_QUALITY = 78

ALLOWED_LICENSES = re.compile(
    r"(public domain|publicdomain|cc0|cc.?0|pd-art|pd-old|pd-us|pd-1923|no rights reserved)",
    re.I,
)
BLOCKED_LICENSES = re.compile(r"(cc by(?!.*0)|attribution|share alike|sharealike|noncommercial|copyrighted|fair use|all rights reserved)", re.I)

def api(params):
    params = dict(params, format="json")
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA})
    last = None
    for attempt in range(8):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 503):
                time.sleep(8 * (attempt + 1))
                req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA})
                continue
            raise
    raise last

def file_info(title):
    if not title.lower().startswith("file:"):
        title = "File:" + title
    data = api({
        "action": "query",
        "titles": title,
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": str(MAX_EDGE),
    })
    pages = data.get("query", {}).get("pages", {})
    page = next(iter(pages.values()))
    if page.get("missing") or "imageinfo" not in page:
        return None
    info = page["imageinfo"][0]
    meta = info.get("extmetadata") or {}
    def meta_val(key):
        v = meta.get(key) or {}
        return re.sub(r"<[^>]+>", "", str(v.get("value") or "")).strip()
    license_name = meta_val("LicenseShortName") or meta_val("License") or ""
    usage = meta_val("UsageTerms") or ""
    license_url = meta_val("LicenseUrl")
    blob = " ".join([license_name, usage, license_url, meta_val("Copyrighted")])
    if BLOCKED_LICENSES.search(blob) and not ALLOWED_LICENSES.search(blob):
        return None
    if not ALLOWED_LICENSES.search(blob):
        # Some PD files only say "Public domain" in UsageTerms or Artist field notes
        if not re.search(r"public domain|cc0", blob, re.I):
            return None
    mime = (info.get("mime") or "")
    if not mime.startswith("image/") or mime in ("image/svg+xml",):
        return None
    url = info.get("thumburl") or info.get("url")
    ow, oh = int(info.get("width") or 0), int(info.get("height") or 0)
    if min(ow, oh) < 400:
        return None
    if oh and (ow / oh > 2.2 or ow / oh < 0.45):
        return None
    return {
        "title": page.get("title") or title,
        "url": url,
        "fullurl": info.get("descriptionurl") or ("https://commons.wikimedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"))),
        "mime": mime,
        "width": info.get("thumbwidth") or info.get("width"),
        "height": info.get("thumbheight") or info.get("height"),
        "license": license_name or "Public domain",
        "license_url": license_url or "https://creativecommons.org/publicdomain/mark/1.0/",
        "artist": meta_val("Artist") or meta_val("Credit") or "Unknown",
        "object": meta_val("ObjectName") or meta_val("ImageDescription") or page.get("title", "").replace("File:", ""),
        "credit": meta_val("Credit"),
        "date": meta_val("DateTimeOriginal") or meta_val("Date"),
    }

def search_files(query, limit=8):
    data = api({
        "action": "query",
        "list": "search",
        "srsearch": query + " filetype:bitmap",
        "srnamespace": "6",
        "srlimit": str(limit),
    })
    return [h["title"] for h in data.get("query", {}).get("search", [])]

def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()

def compress(raw, dest: Path):
    im = Image.open(BytesIO(raw))
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        rgba = im.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    w, h = im.size
    if max(w, h) > MAX_EDGE:
        if w >= h:
            nh = int(h * MAX_EDGE / w)
            im = im.resize((MAX_EDGE, max(1, nh)), Image.Resampling.LANCZOS)
        else:
            nw = int(w * MAX_EDGE / h)
            im = im.resize((max(1, nw), MAX_EDGE), Image.Resampling.LANCZOS)
    # Grayscale engravings compress better as L
    extrema = im.convert("L").getextrema()
    # detect near-grayscale: sample
    small = im.resize((64, 64))
    pixels = list(small.getdata())
    diffs = sum(abs(r-g)+abs(g-b)+abs(r-b) for r,g,b in pixels) / len(pixels)
    if diffs < 18:
        im = im.convert("L")
        im.save(dest, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True, subsampling=0)
    else:
        im.save(dest, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return dest.stat().st_size, im.size

def pick(book, cfg):
    tried = []
    for name in cfg.get("files") or []:
        tried.append(name)
        info = file_info(name)
        if info:
            return info, tried
        time.sleep(0.2)
    # searches: preferred phrase, then a couple of narrower ones
    queries = [cfg.get("search") or book]
    # add first preferred filename without extension as a search
    for name in (cfg.get("files") or [])[:1]:
        queries.append(Path(name).stem)
    for q in queries:
        for title in search_files(q, 8):
            if title in tried:
                continue
            tried.append(title)
            info = file_info(title)
            if info:
                return info, tried
            time.sleep(0.2)
    return None, tried

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    books = json.loads((ROOT / "data" / "books.json").read_text())["books"]
    prev_path = OUT / "manifest.json"
    manifest = json.loads(prev_path.read_text()) if prev_path.exists() else {}
    missing = []
    total = 0
    for i, b in enumerate(books, 1):
        bid = b["id"]
        dest = OUT / f"{bid}.jpg"
        if dest.exists():
            try:
                from PIL import Image as _I
                im=_I.open(dest); w,h=im.size
                ok = min(w,h)>=400 and 0.45 <= (w/h) <= 2.2 and dest.stat().st_size>=25*1024
            except Exception:
                ok=False
            if ok:
                # keep previous manifest entry if present; we'll rebuild manifest at the end from disk+old
                print(f"[{i}/{len(books)}] {bid} ... skip existing")
                continue
            dest.unlink()
        print(f"[{i}/{len(books)}] {bid} ...", flush=True)
        info, tried = pick(bid, MAP.get(bid) or {"search": b["name"]})
        if not info:
            print(f"  MISS after {tried[:6]}")
            missing.append(bid)
            continue
        raw = download(info["url"])
        size, dims = compress(raw, dest)
        total += size
        caption_title = re.sub(r"\s+", " ", info["object"]).strip()
        if len(caption_title) > 90:
            caption_title = caption_title[:87].rstrip() + "…"
        artist = re.sub(r"\s+", " ", info["artist"]).strip()
        if len(artist) > 80:
            artist = artist[:77].rstrip() + "…"
        caption = ", ".join(p for p in [artist, caption_title] if p)
        manifest[bid] = {
            "file": dest.name,
            "caption": caption,
            "artist": artist,
            "title": caption_title,
            "source": info["fullurl"],
            "commons_title": info["title"],
            "license": info["license"],
            "license_url": info["license_url"],
            "bytes": size,
            "width": dims[0],
            "height": dims[1],
        }
        print(f"  OK {info['title']}  {info['license']}  {size//1024}KB  {dims[0]}x{dims[1]}")
        time.sleep(0.25)
    # Drop stale entries and sum bytes from files that still exist
    keep = {}
    for b in books:
        bid=b["id"]
        dest=OUT/f"{bid}.jpg"
        if dest.exists() and bid in manifest:
            manifest[bid]["bytes"]=dest.stat().st_size
            keep[bid]=manifest[bid]
        elif not dest.exists():
            missing.append(bid)
    manifest=keep
    total=sum(v["bytes"] for v in manifest.values())
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    # credits markdown
    lines = [
        "# Image credits for Clay Jar Translation downloads",
        "",
        "Each book in the PDF and EPUB opens with a public-domain or CC0 image.",
        "Files live in this folder and are used at https://clayjartranslation.github.io/downloads/images/.",
        "All works below were already in the public domain, or were released under CC0, at the time they were added.",
        "Faithful photographs of two-dimensional public-domain paintings are themselves in the public domain in the United States.",
        "",
        "| Book | Image | Artist / source | License | Wikimedia page |",
        "| --- | --- | --- | --- | --- |",
    ]
    names = {b["id"]: b["name"] for b in books}
    for b in books:
        bid = b["id"]
        m = manifest.get(bid)
        if not m:
            lines.append(f"| {names[bid]} | — | *no image found yet* | — | — |")
            continue
        lines.append(
            f"| {names[bid]} | `{m['file']}` | {m['artist']}: {m['title']} | {m['license']} | [{m['commons_title']}]({m['source']}) |"
        )
    lines += ["", f"Compressed total: {total/1024/1024:.1f} MB in {len(manifest)} images.", ""]
    (ROOT / "downloads" / "IMAGE-CREDITS.md").write_text("\n".join(lines))
    missing=list(dict.fromkeys(missing))
    print(f"\nDone: {len(manifest)} images, {total/1024/1024:.1f} MB, missing={missing}")
    if missing:
        sys.exit(2)

if __name__ == "__main__":
    main()
