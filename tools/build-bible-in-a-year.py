#!/usr/bin/env python3
"""Build a 365-day Bible in a Year plan from a site's own canon.

Each day has four portions: Old Testament (including Apocrypha and other
extra books in the site's catalog order, except Psalms and Proverbs),
Psalms, Proverbs, and the New Testament (including any extra books listed
in the New Testament division). Readings are spread by verse count so
each stream finishes on day 365. Every chapter and verse appears once.

February 29 in a leap year reuses the February 28 reading (a catch-up or
rest day). It is not a 366th unique portion.

Usage:
  python3 tools/build-bible-in-a-year.py [repo_root]
  python3 tools/build-bible-in-a-year.py [repo_root] --fallback /path/to/other-bible

--fallback supplies book JSON for catalog entries that have no local file
(for example a Treasure Bible plan that still links unpublished books to
the Clay Jar Translation).
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import sys


DAYS = 365
PSALMS_ID = "psalms"
PROVERBS_ID = "proverbs"
OT_DIVISIONS = ("Old Testament", "Apocrypha", "Pseudepigrapha")
NT_DIVISIONS = ("New Testament",)


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def book_path(root, entry, fallback):
    rel = (entry.get("file") or "").strip() or os.path.join("data", "books", entry["id"] + ".json")
    local = os.path.join(root, rel)
    if os.path.isfile(local):
        return local, False
    if fallback:
        fb = os.path.join(fallback, rel)
        if os.path.isfile(fb):
            return fb, True
        fb2 = os.path.join(fallback, "data", "books", entry["id"] + ".json")
        if os.path.isfile(fb2):
            return fb2, True
    return None, False


def load_book(root, entry, fallback):
    path, used_fb = book_path(root, entry, fallback)
    if not path:
        raise FileNotFoundError(
            "No book file for {0} in {1}{2}".format(
                entry["id"], root, " or fallback " + fallback if fallback else ""
            )
        )
    data = load_json(path)
    return data, used_fb


def verse_items(root, catalog_books, ids, fallback):
    """List verses in catalog order as dicts with book, ch, v, words, ch_start, para_start."""
    by_id = {b["id"]: b for b in catalog_books}
    out = []
    counts = {}
    used_fallback = []
    for bid in ids:
        entry = by_id[bid]
        data, used_fb = load_book(root, entry, fallback)
        if used_fb:
            used_fallback.append(bid)
        book_counts = {}
        chapters = data.get("chapters") or []
        for ch in chapters:
            n = ch["n"]
            verses = ch.get("verses") or []
            book_counts[str(n)] = len(verses)
            paras = set(ch.get("paras") or [])
            for i, verse in enumerate(verses):
                text = verse.get("text") or ""
                words = max(1, len(text.split()))
                vn = verse["v"]
                out.append({
                    "book": bid,
                    "ch": n,
                    "v": vn,
                    "words": words,
                    "ch_start": i == 0,
                    "para_start": (vn in paras) or i == 0,
                })
        counts[bid] = book_counts
    return out, counts, used_fallback


def stream_ids(catalog_books, kind):
    """Return book ids for a stream, in the site's catalog order."""
    ids = []
    for b in catalog_books:
        bid = b["id"]
        div = b.get("division") or ""
        if kind == "ps":
            if bid == PSALMS_ID:
                ids.append(bid)
        elif kind == "pr":
            if bid == PROVERBS_ID:
                ids.append(bid)
        elif kind == "nt":
            if div in NT_DIVISIONS:
                ids.append(bid)
        elif kind == "ot":
            if div in OT_DIVISIONS and bid not in (PSALMS_ID, PROVERBS_ID):
                ids.append(bid)
    return ids


def even_size(remain, left):
    """Verses for one day so the rest can be split evenly across the days left."""
    return remain // left


def split_verses(items, days=DAYS, snap=None):
    """Cut a verse stream into `days` nearly even spans.

    Even verse counts come first. A nearby chapter or paragraph break is used
    only when it stays within `snap` verses of that even target, so a long
    chapter is split rather than dumped onto one day.
    """
    n = len(items)
    if n < days:
        raise ValueError("Stream has {0} verses, fewer than {1} days".format(n, days))
    if snap is None:
        # Tighter window for short daily streams (Psalms, Proverbs).
        avg = n / days
        # Proverbs is only about 2–3 verses a day; do not snap away from that.
        if avg < 4:
            snap = 0
        elif avg < 10:
            snap = 1
        else:
            snap = max(3, int(round(avg * 0.12)))
    cuts = []
    s = 0
    for d in range(days):
        left = days - d
        if left == 1:
            cuts.append((s, n))
            break
        remain = n - s
        tgt = even_size(remain, left)
        # some leftover days get +1 so we finish exactly
        if remain - tgt * left > 0:
            tgt += 1
        e_min = s + 1
        e_max = n - (left - 1)
        ideal = s + tgt
        e = max(e_min, min(e_max, ideal))
        window = range(max(e_min, e - snap), min(e_max, e + snap) + 1)
        cands = [i for i in window if i < n and items[i]["ch_start"]]
        if not cands:
            cands = [i for i in window if i < n and items[i]["para_start"]]
        if cands:
            e = min(cands, key=lambda i: (abs(i - ideal), abs(i - e)))
        cuts.append((s, e))
        s = e
    if cuts[-1][1] != n:
        raise AssertionError("Last cut did not reach the end of the stream")
    if len(cuts) != days:
        raise AssertionError("Expected {0} cuts, got {1}".format(days, len(cuts)))
    return cuts


def parts(items, s, e):
    """Group verses s..e-1 into per-book parts."""
    res = []
    i = s
    while i < e:
        bid = items[i]["book"]
        j = i
        while j < e and items[j]["book"] == bid:
            j += 1
        a, z = items[i], items[j - 1]
        whole = a["ch_start"] and (j == len(items) or items[j]["ch_start"])
        res.append({
            "book": bid,
            "sc": a["ch"],
            "sv": a["v"],
            "ec": z["ch"],
            "ev": z["v"],
            "whole": whole,
            "verses": j - i,
            "words": sum(x["words"] for x in items[i:j]),
        })
        i = j
    return res


def label(part, books):
    b = books[part["book"]]
    name = b["name"]
    if part["book"] == "psalms":
        name = "Psalm" if part["sc"] == part["ec"] else "Psalms"
    single = (b.get("chapterCount") == 1) or (len(books) and False)
    # use actual chapter count from the part/book metadata when possible
    ch_count = b.get("chapterCount")
    if part["whole"]:
        if ch_count == 1 and part["sc"] == part["ec"]:
            return name
        if part["sc"] == part["ec"]:
            return "{0} {1}".format(name, part["sc"])
        return "{0} {1}\u2013{2}".format(name, part["sc"], part["ec"])
    if part["sc"] == part["ec"]:
        if part["sv"] == part["ev"]:
            return "{0} {1}:{2}".format(name, part["sc"], part["sv"])
        return "{0} {1}:{2}\u2013{3}".format(name, part["sc"], part["sv"], part["ev"])
    return "{0} {1}:{2}\u2013{3}:{4}".format(name, part["sc"], part["sv"], part["ec"], part["ev"])


def portion_entries(part_list, books):
    out = []
    for p in part_list:
        entry = {
            "label": label(p, books),
            "book": p["book"],
            "ch": p["sc"],
            "v": 1 if p["whole"] else p["sv"],
            "verses": p["verses"],
        }
        out.append(entry)
    return out


def extra_nt_ids(catalog_books):
    """New Testament books beyond the traditional 27, if the site lists any."""
    traditional = {
        "matthew", "mark", "luke", "john", "acts", "romans",
        "1-corinthians", "2-corinthians", "galatians", "ephesians",
        "philippians", "colossians", "1-thessalonians", "2-thessalonians",
        "1-timothy", "2-timothy", "titus", "philemon", "hebrews", "james",
        "1-peter", "2-peter", "1-john", "2-john", "3-john", "jude", "revelation",
    }
    return [b["id"] for b in catalog_books if b.get("division") in NT_DIVISIONS and b["id"] not in traditional]


def summarize_cuts(name, items, cuts):
    sizes = [e - s for s, e in cuts]
    words = [sum(x["words"] for x in items[s:e]) for s, e in cuts]
    return {
        "stream": name,
        "verses": len(items),
        "words": sum(x["words"] for x in items),
        "days": len(cuts),
        "verse_min": min(sizes),
        "verse_max": max(sizes),
        "verse_avg": sum(sizes) / len(sizes),
        "word_min": min(words),
        "word_max": max(words),
        "word_avg": sum(words) / len(words),
        "last_end": cuts[-1][1] == len(items),
    }


def build(root, fallback=None, out_path=None):
    cat = load_json(os.path.join(root, "data", "books.json"))
    catalog_books = cat["books"]
    books = {b["id"]: b for b in catalog_books}
    kinds = (("ot", "Old Testament"), ("ps", "Psalms"), ("pr", "Proverbs"), ("nt", "New Testament"))
    streams = {}
    counts = {}
    fallbacks = {}
    ids_by_kind = {}
    for key, _label in kinds:
        ids = stream_ids(catalog_books, key)
        ids_by_kind[key] = ids
        items, book_counts, used_fb = verse_items(root, catalog_books, ids, fallback)
        streams[key] = items
        counts.update(book_counts)
        fallbacks[key] = used_fb

    covered_ids = set()
    for ids in ids_by_kind.values():
        covered_ids.update(ids)
    missing = [b["id"] for b in catalog_books if b["id"] not in covered_ids]
    if missing:
        raise SystemExit("Catalog books not placed in any stream: " + ", ".join(missing))

    cuts = {k: split_verses(streams[k]) for k in streams}
    start = datetime.date(2025, 1, 1)  # a non-leap year, for MM-DD labels
    days = []
    daily = []
    for d in range(DAYS):
        date = start + datetime.timedelta(days=d)
        day = {"date": date.strftime("%m-%d")}
        verse_total = 0
        word_total = 0
        for key, _label in kinds:
            s, e = cuts[key][d]
            ps = parts(streams[key], s, e)
            day[key] = portion_entries(ps, books)
            verse_total += e - s
            word_total += sum(x["words"] for x in streams[key][s:e])
        days.append(day)
        daily.append({"date": day["date"], "verses": verse_total, "words": word_total})

    apoc = [b["id"] for b in catalog_books if b.get("division") == "Apocrypha"]
    pseud = [b["id"] for b in catalog_books if b.get("division") == "Pseudepigrapha"]
    nt_extra = extra_nt_ids(catalog_books)
    note = (
        "Each day has four readings: the Old Testament (including the Apocrypha and "
        "other extra books in this edition, in this Bible’s book order), the Psalms, "
        "Proverbs, and the New Testament. On February 29 in a leap year, read the "
        "February 28 portion again, or use the day to catch up. The plan finishes on "
        "December 31."
    )
    out = {
        "title": "Bible in a Year",
        "note": note,
        "canonBooks": len(catalog_books),
        "leapDay": {"02-29": "02-28"},
        "verseCounts": counts,
        "days": days,
    }
    dest = out_path or os.path.join(root, "data", "bible-in-a-year.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    stats = {k: summarize_cuts(k, streams[k], cuts[k]) for k in streams}
    totals_v = [x["verses"] for x in daily]
    totals_w = [x["words"] for x in daily]
    report = {
        "output": dest,
        "catalog_books": len(catalog_books),
        "covered_books": len(covered_ids),
        "ot_stream_books": ids_by_kind["ot"],
        "nt_stream_books": ids_by_kind["nt"],
        "apocrypha": apoc,
        "pseudepigrapha": pseud,
        "nt_extra_books": nt_extra,
        "fallback_books": sorted({bid for ids in fallbacks.values() for bid in ids}),
        "streams": stats,
        "day_verse_min": min(totals_v),
        "day_verse_max": max(totals_v),
        "day_verse_avg": sum(totals_v) / len(totals_v),
        "day_word_min": min(totals_w),
        "day_word_max": max(totals_w),
        "day_word_avg": sum(totals_w) / len(totals_w),
        "minutes_avg_at_150wpm": (sum(totals_w) / len(totals_w)) / 150.0,
        "minutes_min_at_150wpm": min(totals_w) / 150.0,
        "minutes_max_at_150wpm": max(totals_w) / 150.0,
    }
    return out, report


def print_report(report):
    print("Wrote", report["output"])
    print("Books in catalog / covered: {0} / {1}".format(report["catalog_books"], report["covered_books"]))
    print("OT stream (incl. extra books, not Psalms/Proverbs): {0} books".format(len(report["ot_stream_books"])))
    print("  Apocrypha ({0}): {1}".format(len(report["apocrypha"]), ", ".join(report["apocrypha"])))
    print("  Pseudepigrapha ({0}): {1}".format(len(report["pseudepigrapha"]), ", ".join(report["pseudepigrapha"])))
    print("NT stream: {0} books".format(len(report["nt_stream_books"])))
    if report["nt_extra_books"]:
        print("  Extra NT books included: {0}".format(", ".join(report["nt_extra_books"])))
    else:
        print("  Extra NT books included: none listed in this edition (the NT stream is the 27 New Testament books).")
    if report["fallback_books"]:
        print("  Used fallback text for: {0}".format(", ".join(report["fallback_books"])))
    for k, s in report["streams"].items():
        print(
            "{0}: {1} verses, {2} words; per day verses {3:.2f} (min {4}, max {5}); "
            "finishes day 365: {6}".format(
                k, s["verses"], s["words"], s["verse_avg"], s["verse_min"], s["verse_max"], s["last_end"]
            )
        )
    print(
        "Daily total: {0:.1f} verses (min {1}, max {2}); {3:.0f} words (min {4}, max {5}); "
        "about {6:.0f} minutes/day at 150 words/minute (range {7:.0f}–{8:.0f}).".format(
            report["day_verse_avg"], report["day_verse_min"], report["day_verse_max"],
            report["day_word_avg"], report["day_word_min"], report["day_word_max"],
            report["minutes_avg_at_150wpm"], report["minutes_min_at_150wpm"], report["minutes_max_at_150wpm"],
        )
    )


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("root", nargs="?", default=".", help="Site repository root")
    p.add_argument("--fallback", default=None, help="Second repo root for missing book files")
    p.add_argument("--out", default=None, help="Output JSON path (default: data/bible-in-a-year.json)")
    args = p.parse_args(argv)
    _out, report = build(os.path.abspath(args.root), fallback=args.fallback and os.path.abspath(args.fallback), out_path=args.out)
    print_report(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
