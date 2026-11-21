/* Keyword search over this site's own verses, plus a few topic words
   (shepherd also finds flock and sheep; rainbow also finds bow and covenant).
   Runs in the reader's browser. Nothing typed is sent to a server.
   There is no AI model in this file. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CJT_SEARCH = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // head: the query word that opens the topic.
  // words: what a verse may say instead. whole: true keeps short words
  // (bow) from matching inside bowed, bows, or rainbow.
  // pair: extra rank when two related words are in the same verse (Noah's bow).
  var TOPICS = [
    {
      head: 'shepherd',
      words: [
        { t: 'shepherd' },
        { t: 'flock', w: 5 },
        { t: 'sheep', w: 5 },
      ],
    },
    {
      head: 'rainbow',
      words: [
        { t: 'rainbow' },
        // "bow down" is the verb of worship, not the rainbow.
        { t: 'bow', w: 6, whole: true, unlessNext: ['down', 'to', 'before', 'toward', 'low'] },
        { t: 'covenant', w: 2 },
      ],
      pair: { a: 'bow', b: 'covenant', w: 28 },
    },
  ];

  function fold(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').toLowerCase();
  }

  function plain(t) {
    return String(t).replace(/\{[a-z]+\}/g, '');
  }

  function isWordChar(code) {
    return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
  }

  function countSub(folded, word) {
    var n = 0;
    var i = 0;
    while ((i = folded.indexOf(word, i)) !== -1) {
      n++;
      i += word.length;
    }
    return n;
  }

  function countWhole(folded, word, unlessNext) {
    var n = 0;
    var from = 0;
    var len = folded.length;
    var wlen = word.length;
    while (from <= len - wlen) {
      var i = folded.indexOf(word, from);
      if (i < 0) break;
      var beforeOk = i === 0 || !isWordChar(folded.charCodeAt(i - 1));
      var afterOk = i + wlen === len || !isWordChar(folded.charCodeAt(i + wlen));
      if (beforeOk && afterOk) {
        var skip = false;
        if (unlessNext && unlessNext.length) {
          var rest = /^\s+([a-z0-9]+)/.exec(folded.slice(i + wlen));
          if (rest && unlessNext.indexOf(rest[1]) !== -1) skip = true;
        }
        if (!skip) n++;
      }
      from = i + 1;
    }
    return n;
  }

  function wordCount(folded, word) {
    return word.whole ? countWhole(folded, word.t, word.unlessNext) : countSub(folded, word.t);
  }

  function topicForTerm(term) {
    var i, topic, head;
    for (i = 0; i < TOPICS.length; i++) {
      topic = TOPICS[i];
      head = topic.head;
      if (term === head || (term.indexOf(head) === 0 && term.length <= head.length + 8)) return topic;
    }
    return null;
  }

  function topicForTerms(terms) {
    var i, topic;
    for (i = 0; i < terms.length; i++) {
      topic = topicForTerm(terms[i]);
      if (topic) return topic;
    }
    return null;
  }

  function isHeadTerm(term, topic) {
    if (!topic) return false;
    var head = topic.head;
    return term === head || (term.indexOf(head) === 0 && term.length <= head.length + 8);
  }

  function parseReference(raw, books) {
    var ref = /^([1-4]?\s*[a-z][a-z .]*?)\s*(\d+)(?::(\d+))?$/i.exec(raw);
    if (!ref || !books) return null;
    var nm = fold(ref[1]).replace(/\s+/g, '');
    var i, b;
    for (i = 0; i < books.length; i++) {
      b = books[i];
      if (fold(b.name).replace(/\s+/g, '').indexOf(nm) === 0) {
        if (b.translated && b.translated.indexOf(+ref[2]) !== -1) {
          return { book: b, chapter: ref[2], verse: ref[3] || '' };
        }
        return null;
      }
    }
    return null;
  }

  function prepare(raw, opts) {
    var q = String(raw || '').trim();
    var books = (opts && opts.books) || [];
    var notes = !!(opts && opts.notes);
    if (q.length < 2) return { kind: 'short', q: q, notes: notes };
    var ref = parseReference(q, books);
    if (ref) return { kind: 'ref', book: ref.book, chapter: ref.chapter, verse: ref.verse, notes: notes };
    var terms = fold(q).replace(/"/g, '').split(/\s+/).filter(Boolean);
    if (!terms.length) return { kind: 'short', q: q, notes: notes };
    return { kind: 'hits', q: q, terms: terms, topic: topicForTerms(terms), notes: notes };
  }

  function relatedWords(topic, folded) {
    var out = [];
    var i, word;
    if (!topic) return out;
    for (i = 0; i < topic.words.length; i++) {
      word = topic.words[i];
      if (word.t === topic.head) continue;
      if (wordCount(folded, word) && out.indexOf(word.t) === -1) out.push(word.t);
    }
    return out;
  }

  function pairBonus(topic, folded) {
    if (!topic || !topic.pair) return 0;
    var pair = topic.pair;
    var spec = null;
    var i;
    for (i = 0; i < topic.words.length; i++) {
      if (topic.words[i].t === pair.a) spec = topic.words[i];
    }
    var a = spec ? wordCount(folded, spec) : countSub(folded, pair.a);
    var b = countSub(folded, pair.b);
    return a && b ? pair.w : 0;
  }

  // Score one verse or footnote. Null when it is not a hit.
  // Exact keyword matches always outrank topic-only matches.
  function scoreEntry(entry, prepared) {
    if (!entry || prepared.kind !== 'hits') return null;
    if (entry.kind === 'n' && !prepared.notes) return null;
    var folded = entry.folded || fold(entry.text || '');
    var terms = prepared.terms;
    var topic = entry.kind === 'v' ? prepared.topic : null;
    var i, term, n, best, label, word, c, s;
    var exactTerms = 0;
    var score = 0;
    var used = {};
    for (i = 0; i < terms.length; i++) {
      term = terms[i];
      n = countSub(folded, term);
      if (n) {
        exactTerms++;
        score += 100 + 8 * Math.min(n, 4);
        continue;
      }
      if (!topic || !isHeadTerm(term, topic)) return null;
      best = 0;
      label = '';
      for (var w = 0; w < topic.words.length; w++) {
        word = topic.words[w];
        c = wordCount(folded, word);
        if (!c) continue;
        s = (word.w || 12) * Math.min(c, 3);
        if (s > best) {
          best = s;
          label = word.t;
        }
      }
      if (!best) return null;
      score += best;
      if (label) used[label] = true;
    }
    var exact = exactTerms === terms.length;
    if (exact) score += 250;
    if (topic) {
      for (w = 0; w < topic.words.length; w++) {
        word = topic.words[w];
        if (!word.w || used[word.t]) continue;
        c = wordCount(folded, word);
        if (c) score += word.w * Math.min(c, 2);
      }
      score += pairBonus(topic, folded);
    }
    var tokens = folded.split(/[^a-z0-9]+/).filter(Boolean).length || 1;
    var norm = 0.75 + 0.25 * Math.min(tokens, 40) / 16;
    var related = topic ? relatedWords(topic, folded) : [];
    var marks = terms.slice();
    for (i = 0; i < related.length; i++) {
      if (marks.indexOf(related[i]) === -1) marks.push(related[i]);
    }
    return {
      kind: entry.kind,
      book: entry.book,
      c: entry.c,
      v: entry.v,
      m: entry.m,
      text: entry.text,
      order: entry.order || 0,
      exact: exact,
      score: score / norm,
      related: related,
      marks: marks,
    };
  }

  function search(entries, raw, opts) {
    var prepared = prepare(raw, opts);
    if (prepared.kind !== 'hits') return prepared;
    var hits = [];
    var i, scored;
    var list = entries || [];
    if (!prepared.topic) {
      var terms = prepared.terms;
      for (i = 0; i < list.length; i++) {
        var entry = list[i];
        if (entry.kind === 'n' && !prepared.notes) continue;
        var folded = entry.folded || fold(entry.text || '');
        var ok = true;
        for (var t = 0; t < terms.length; t++) {
          if (folded.indexOf(terms[t]) === -1) { ok = false; break; }
        }
        if (!ok) continue;
        hits.push({
          kind: entry.kind,
          book: entry.book,
          c: entry.c,
          v: entry.v,
          m: entry.m,
          text: entry.text,
          order: entry.order || 0,
          exact: true,
          score: 0,
          related: [],
          marks: terms,
        });
      }
      return { kind: 'hits', terms: terms, topic: null, hits: hits };
    }
    for (i = 0; i < list.length; i++) {
      scored = scoreEntry(list[i], prepared);
      if (scored) hits.push(scored);
    }
    hits.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    return { kind: 'hits', terms: prepared.terms, topic: prepared.topic, hits: hits };
  }

  return {
    fold: fold,
    plain: plain,
    topics: TOPICS,
    prepare: prepare,
    scoreEntry: scoreEntry,
    search: search,
  };
});
