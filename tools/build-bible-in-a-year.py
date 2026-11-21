#!/usr/bin/env python3
"""Build data/bible-in-a-year.json: a 365-day plan (Jan 1-Dec 31; Feb 29 repeats Feb 28).
Each day has four portions: Old Testament, Psalms, Proverbs, New Testament.
Usage: python3 tools/build-bible-in-a-year.py [repo_root]  (reads data/books.json + data/books/*.json)"""
import json, sys, os, datetime
root = sys.argv[1] if len(sys.argv) > 1 else '.'
cat = json.load(open(os.path.join(root, 'data/books.json')))
books = {b['id']: b for b in cat['books']}
OT = [b['id'] for b in cat['books'] if b['division'] == 'Old Testament' and b['id'] not in ('psalms', 'proverbs')]
NT = [b['id'] for b in cat['books'] if b['division'] == 'New Testament']

def verses(ids):
    out = []  # (book, ch, v, chapterStart, paraStart)
    for bid in ids:
        d = json.load(open(os.path.join(root, books[bid]['file'])))
        for ch in d['chapters']:
            paras = set(ch.get('paras') or [])
            for i, v in enumerate(ch['verses']):
                out.append((bid, ch['n'], v['v'], i == 0, v['v'] in paras or i == 0))
    return out

def split(vs, days=365, chlo=0.6, chhi=1.6, plo=0.7, phi=1.4):
    cuts, s = [], 0
    for d in range(days):
        left = days - d
        if left == 1:
            cuts.append((s, len(vs))); break
        tgt = (len(vs) - s) / left
        ideal = s + tgt
        def best(pred, lo, hi):
            cands = [i for i in range(int(s + max(1, tgt * lo)), min(len(vs), int(s + tgt * hi) + 1) + 1)
                     if i < len(vs) and pred(vs[i])]
            return min(cands, key=lambda i: abs(i - ideal)) if cands else None
        e = best(lambda x: x[3], chlo, chhi)
        if e is None: e = best(lambda x: x[4], plo, phi)
        if e is None: e = max(s + 1, round(ideal))
        cuts.append((s, e)); s = e
    return cuts

def parts(vs, s, e):
    """Group verses s..e-1 into per-book parts [book, startCh, startV, endCh, endV, wholeChapters]."""
    res = []
    i = s
    while i < e:
        b = vs[i][0]; j = i
        while j < e and vs[j][0] == b: j += 1
        a, z = vs[i], vs[j - 1]
        whole = a[3] and (j == len(vs) or vs[j][3])
        res.append([b, a[1], a[2], z[1], z[2], 1 if whole else 0])
        i = j
    return res

def label(p):
    b, sc, sv, ec, ev, whole = p
    name = books[b]['name']
    if b == 'psalms': name = 'Psalm' if (sc == ec) else 'Psalms'
    single = books[b]['chapterCount'] == 1
    if whole:
        if single: return name
        return f'{name} {sc}' if sc == ec else f'{name} {sc}\u2013{ec}'
    if sc == ec: return f'{name} {sc}:{sv}' + ('' if sv == ev else f'\u2013{ev}')
    return f'{name} {sc}:{sv}\u2013{ec}:{ev}'

streams = {'ot': verses(OT), 'ps': verses(['psalms']), 'pr': verses(['proverbs']), 'nt': verses(NT)}
cuts = {k: split(v) for k, v in streams.items()}
days = []
start = datetime.date(2025, 1, 1)  # any non-leap year
for d in range(365):
    date = start + datetime.timedelta(days=d)
    day = {'date': date.strftime('%m-%d')}
    for k, vs in streams.items():
        s, e = cuts[k][d]
        ps = parts(vs, s, e)
        day[k] = [{'label': label(p), 'book': p[0], 'ch': p[1], 'v': p[2] if not p[5] else 1, 'verses': e - s if len(ps) == 1 else None} for p in ps]
        for x in day[k]:
            if x['verses'] is None: del x['verses']
    days.append(day)
out = {'title': 'Bible in a Year', 'note': 'Each day: Old Testament, Psalms, Proverbs, New Testament. On February 29 in a leap year, read the February 28 portion again or catch up.', 'leapDay': {'02-29': '02-28'}, 'days': days}
json.dump(out, open(os.path.join(root, 'data/bible-in-a-year.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
for k, vs in streams.items():
    sizes = [e - s for s, e in cuts[k]]
    print(k, len(vs), 'verses; per day min/max', min(sizes), max(sizes))
