/* Retail Key — balance engine.
   A balance is never guessed. It is: the last balance YOU confirmed (from a till slip, SMS or the retailer's app)
   plus every purchase / redemption logged after that moment. */
(function (root) {
  'use strict';

  var KINDS = {
    points: { label: 'Points', unit: 'pts' },
    cashback: { label: 'Cashback', unit: 'R' },
    stamps: { label: 'Stamps', unit: 'stamps' }
  };

  var RETAILERS = [
    { name: 'Shoprite Xtra Savings', rx: /shoprite/i }, { name: 'Checkers Xtra Savings', rx: /checkers/i },
    { name: 'Pick n Pay Smart Shopper', rx: /pick\s*(n|'n|&|and)\s*pay|smart\s*shopper/i }, { name: 'Clicks ClubCard', rx: /clicks|club\s*card/i },
    { name: 'Woolworths WRewards', rx: /woolworths|wrewards/i }, { name: 'Dis-Chem Benefit Programme', rx: /dis-?chem/i },
    { name: 'SPAR Rewards', rx: /\bspar\b/i }, { name: 'Makro mCard', rx: /makro/i }, { name: 'Builders', rx: /builders/i },
    { name: 'Shell V+', rx: /\bshell\b/i }, { name: 'Engen 1app', rx: /engen/i }
  ];

  var PALETTES = [
    ['#3342ff', '#0b1370', '#9fb0ff'], ['#ff3d8b', '#6d0a42', '#ffb3d1'], ['#00c2a8', '#00433f', '#9ff5e6'], ['#ffb020', '#7a3f00', '#ffe2a1'],
    ['#8b5cf6', '#2f1480', '#d3c0ff'], ['#ff4b3e', '#610c0e', '#ffc0b8'], ['#a3e635', '#26510a', '#e3ffa8'], ['#9aa4b5', '#222834', '#e6ebf3']
  ];

  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ---------- numbers ---------- */
  function parseAmount(raw) {
    if (raw == null) return null;
    var s = String(raw).replace(/[Rr]\s?/g, '').replace(/ /g, ' ').trim().replace(/\s+/g, '');
    if (!/^\d[\d.,]*$/.test(s)) return null;
    var lastDot = s.lastIndexOf('.'), lastCom = s.lastIndexOf(',');
    if (lastDot > -1 && lastCom > -1) {
      var dec = Math.max(lastDot, lastCom), thousand = dec === lastDot ? ',' : '.';
      s = s.split(thousand).join('').replace(dec === lastDot ? '.' : ',', '.');
    } else if (lastCom > -1) {
      s = /,\d{1,2}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '.') : s.split(',').join('');
    } else if (lastDot > -1) {
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.split('.').join('');
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  /* ---------- earn rules ---------- */
  // points: floor(spend * pointsPerRand); cashback: floor to the cent of spend * pct; stamps: 1 per visit.
  function earnFor(card, spend) {
    spend = +spend;
    if (!(spend >= 0)) return 0;
    if (card.kind === 'cashback') return Math.floor(spend * (+card.cashbackPct || 0)) / 100;
    if (card.kind === 'stamps') return spend >= (+card.minSpend || 0) ? 1 : 0;
    return Math.floor(spend * (+card.pointsPerRand || 0) + 1e-9);
  }

  /* ---------- balance ---------- */
  function sortedEntries(card) {
    return (card.entries || []).slice().sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : (a.n || 0) - (b.n || 0); });
  }
  function balanceOf(card, now) {
    now = now || Date.now();
    var list = sortedEntries(card), anchorIdx = -1, i;
    for (i = list.length - 1; i >= 0; i--) if (list[i].type === 'confirm') { anchorIdx = i; break; }
    var base = 0, since = 0, sinceCount = 0, anchor = null, status;
    if (anchorIdx > -1) { anchor = list[anchorIdx]; base = anchor.value; }
    for (i = anchorIdx + 1; i < list.length; i++) { if (list[i].type !== 'confirm') { since += list[i].delta; sinceCount++; } }
    var value = base + since;
    if (card.kind === 'cashback') { value = round2(value); since = round2(since); }
    if (anchorIdx > -1) status = sinceCount ? 'tracked' : 'confirmed';
    else status = list.length ? 'unanchored' : 'empty';
    var ageDays = anchor ? Math.floor((now - new Date(anchor.t).getTime()) / 864e5) : null;
    var stale = anchor ? ageDays > 45 : false;
    var rand = card.kind === 'points' ? round2(value * (+card.pointValue || 0)) : card.kind === 'cashback' ? value : 0;
    var goal = +card.goal || 0, progress = goal > 0 ? Math.max(0, Math.min(1, value / goal)) : null;
    return { value: value, base: base, since: since, sinceCount: sinceCount, anchor: anchor, status: status, ageDays: ageDays, stale: stale, rand: rand, goal: goal, progress: progress };
  }
  function expiryOf(card, now) {
    if (!card.expiry) return null;
    now = now || Date.now();
    var end = new Date(card.expiry + 'T23:59:59').getTime(), days = Math.ceil((end - now) / 864e5);
    return { days: days, level: days < 0 ? 'expired' : days <= 14 ? 'soon' : days <= 60 ? 'near' : 'ok' };
  }
  function totalRand(cards, now) {
    return round2(cards.reduce(function (s, c) { return s + balanceOf(c, now).rand; }, 0));
  }
  // running balance after each entry, newest first, for the ledger view
  function ledger(card) {
    var list = sortedEntries(card), run = 0, out = [];
    list.forEach(function (e) { run = e.type === 'confirm' ? e.value : run + e.delta; if (card.kind === 'cashback') run = round2(run); out.push({ e: e, after: run }); });
    return out.reverse();
  }
  // per-day net movement for the last N days (for sparkline)
  function series(card, days, now) {
    now = now || Date.now();
    var out = [], list = sortedEntries(card), d, start = new Date(now); start.setHours(0, 0, 0, 0);
    for (d = days - 1; d >= 0; d--) {
      var end = new Date(start.getTime() - d * 864e5 + 864e5 - 1).getTime(), run = 0;
      list.forEach(function (e) { if (new Date(e.t).getTime() <= end) run = e.type === 'confirm' ? e.value : run + e.delta; });
      out.push(run);
    }
    return out;
  }

  /* ---------- slip / SMS reader ---------- */
  var NUM = '(\\d[\\d\\s.,]*\\d|\\d)';
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function firstMatch(text, patterns) {
    for (var i = 0; i < patterns.length; i++) { var m = text.match(patterns[i]); if (m) { var v = parseAmount(m[1]); if (v != null) return { value: v, text: m[0].trim() }; } }
    return null;
  }
  function parseDate(text) {
    var m = text.match(/\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = text.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})\b/);
    if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    m = text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/i);
    if (m) return iso(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
    return null;
  }
  function iso(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(y, mo - 1, d); if (dt.getMonth() !== mo - 1) return null;
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function parseSlip(text) {
    var t = String(text || '').replace(/ /g, ' '), out = { retailer: null, spend: null, earned: null, redeemed: null, balance: null, cashbackBalance: null, stamps: null, date: parseDate(t) };
    RETAILERS.some(function (r) { if (r.rx.test(t)) { out.retailer = r.name; return true; } });

    // spend: a strong "total" wording wins; card/tender lines are the fallback. Sub-totals are skipped.
    var best = null, AMT = '[\\s:.=\\-R]{0,6}(\\d[\\d\\s.,]*[.,]\\d{2})\\b';
    var strong = new RegExp('(?<!sub\\s?)(?<!sub-)(?:grand\\s+total|total\\s+due|amount\\s+due|amount\\s+paid|total\\s+paid|to\\s+pay|sale\\s+total|total)' + AMT, 'gi'), m, v;
    while ((m = strong.exec(t))) { v = parseAmount(m[1]); if (v != null && v > 0) { best = v; break; } }
    if (best == null) {
      var weak = new RegExp('(?:tendered|card\\s+payment|visa|mastercard|debit|spent|purchase\\s+of|payment\\s+of)' + AMT, 'i');
      m = t.match(weak); if (m) best = parseAmount(m[1]);
    }
    out.spend = best;

    var e = firstMatch(t, [new RegExp('(?:you\\s+)?(?:have\\s+)?earned\\s+' + NUM + '\\s*(?:points?|pts)', 'i'), new RegExp('points?\\s+earned\\s*(?:today|this\\s+(?:visit|purchase))?\\s*[:\\-]?\\s*' + NUM, 'i'), new RegExp('\\+\\s?' + NUM + '\\s*(?:points?|pts)', 'i')]);
    if (e) out.earned = e.value;
    var r = firstMatch(t, [new RegExp('(?:redeemed|used|spent)\\s+' + NUM + '\\s*(?:points?|pts)', 'i'), new RegExp('points?\\s+(?:redeemed|used)\\s*[:\\-]?\\s*' + NUM, 'i')]);
    if (r) out.redeemed = r.value;
    var b = firstMatch(t, [
      new RegExp('(?:new|current|total|available|updated)?\\s*(?:points?\\s+)?balance\\s*(?:is|of)?\\s*[:\\-]?\\s*' + NUM + '\\s*(?:points?|pts)', 'i'),
      new RegExp('points?\\s+balance\\s*(?:is|of)?\\s*[:\\-]?\\s*' + NUM, 'i'),
      new RegExp(NUM + '\\s*(?:points?|pts)\\s*(?:available|balance|in\\s+total|to\\s+spend|now)', 'i'),
      new RegExp('you\\s*(?:\'ve|\\s+have|\\s+now\\s+have|\\s+currently\\s+have)\\s+' + NUM + '\\s*(?:points?|pts)', 'i')]);
    if (b) out.balance = b.value;
    var c = firstMatch(t, [/(?:cash\s?back|rewards?|savings?|wallet)\s*(?:balance|available|total)?\s*(?:is|of)?\s*[:\-]?\s*R\s?(\d[\d\s.,]*[.,]\d{2}|\d+)/i, /balance\s*(?:is|of)?\s*[:\-]?\s*R\s?(\d[\d\s.,]*[.,]\d{2})\s*(?:cash\s?back|reward)/i]);
    if (c) out.cashbackBalance = c.value;
    var s = t.match(/(\d+)\s*(?:of|\/)\s*(\d+)\s*stamps?/i);
    if (s) out.stamps = { have: +s[1], goal: +s[2] };
    out.found = ['spend', 'earned', 'redeemed', 'balance', 'cashbackBalance', 'stamps', 'date', 'retailer'].filter(function (k) { return out[k] != null; });
    return out;
  }

  /* ---------- formatting ---------- */
  function money(n) {
    n = +n || 0;
    var neg = n < 0, s = Math.abs(n).toFixed(2).split('.'), int = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '−' : '') + 'R ' + int + ',' + s[1];
  }
  function count(n) { n = Math.round(+n || 0); var neg = n < 0; return (neg ? '−' : '') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function amountFor(card, n) { return card.kind === 'cashback' ? money(n) : count(n); }
  function unitFor(card) { return card.kind === 'cashback' ? '' : card.kind === 'stamps' ? 'stamps' : 'points'; }
  function ago(iso, now) {
    var d = Math.floor(((now || Date.now()) - new Date(iso).getTime()) / 864e5);
    if (d <= 0) return 'today'; if (d === 1) return 'yesterday'; if (d < 31) return d + ' days ago';
    var mo = Math.floor(d / 30); return mo + (mo === 1 ? ' month ago' : ' months ago');
  }

  var api = { KINDS: KINDS, RETAILERS: RETAILERS, PALETTES: PALETTES, hash: hash, parseAmount: parseAmount, earnFor: earnFor, balanceOf: balanceOf, expiryOf: expiryOf, totalRand: totalRand, ledger: ledger, series: series, parseSlip: parseSlip, money: money, count: count, amountFor: amountFor, unitFor: unitFor, ago: ago, round2: round2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RKEngine = api;
})(typeof self !== 'undefined' ? self : this);
