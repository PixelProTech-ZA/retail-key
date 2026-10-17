/* Retail Key — app */
(function () {
  'use strict';
  var E = RKEngine, C = RKCodes;
  var KEY = 'retailkey.v2', OLD = 'retail-key-cards-v1', STALE_DAYS = 45;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function localISO(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function todayYMD() { return localISO().slice(0, 10); }
  function ymdToISO(ymd) { return !ymd || ymd === todayYMD() ? localISO() : ymd + 'T12:00:00'; }
  function uid() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 9)); }
  function fmtDate(iso) { var d = new Date(iso), y = d.getFullYear() !== new Date().getFullYear(); return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: y ? 'numeric' : undefined }); }
  function signed(card, n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + E.amountFor(card, Math.abs(n)); }

  /* ======================= state ======================= */
  var S = { cards: [], view: 'wallet', active: null }, shown = {}, firstRender = true, nCounter = 1;

  function normEntry(e) {
    if (!e || typeof e !== 'object' || !e.t || isNaN(new Date(e.t).getTime())) return null;
    var type = ['earn', 'redeem', 'adjust', 'confirm'].indexOf(e.type) > -1 ? e.type : null; if (!type) return null;
    var o = { id: String(e.id || uid()), n: +e.n || nCounter++, t: String(e.t), type: type, note: String(e.note || '').slice(0, 80), source: String(e.source || 'manual') };
    if (type === 'confirm') { o.value = +e.value; o.delta = 0; if (!isFinite(o.value)) return null; }
    else { o.delta = +e.delta; if (!isFinite(o.delta)) return null; if (e.amount != null && isFinite(+e.amount)) o.amount = +e.amount; }
    nCounter = Math.max(nCounter, o.n + 1);
    return o;
  }
  function normCard(c) {
    if (!c || typeof c !== 'object' || !c.retailer || c.number == null) return null;
    var kind = E.KINDS[c.kind] ? c.kind : 'points';
    var o = { id: String(c.id || uid()), retailer: String(c.retailer).slice(0, 60), number: String(c.number).slice(0, 100), format: c.format || 'auto', kind: kind,
      color: Math.abs(+c.color || 0) % 8, createdAt: c.createdAt || localISO() };
    ['pointsPerRand', 'pointValue', 'cashbackPct', 'goal', 'minSpend'].forEach(function (k) { if (c[k] != null && c[k] !== '' && isFinite(+c[k])) o[k] = +c[k]; });
    o.expiry = /^\d{4}-\d{2}-\d{2}$/.test(c.expiry || '') ? c.expiry : '';
    o.entries = (Array.isArray(c.entries) ? c.entries : []).map(normEntry).filter(Boolean);
    return o;
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var d = JSON.parse(raw); S.cards = (d.cards || []).map(normCard).filter(Boolean); return; }
      var old = localStorage.getItem(OLD);   // migrate the first prototype's cards
      if (old) {
        S.cards = JSON.parse(old).map(function (x) {
          var kind = x.rewardType === 'Cashback' ? 'cashback' : x.rewardType === 'Stamp card' ? 'stamps' : 'points';
          return normCard({ id: x.id, retailer: x.retailer, number: x.number, kind: kind, color: E.hash(x.retailer || '') % 8, entries: [] });
        }).filter(Boolean);
        save(true);
      }
    } catch (e) { S.cards = []; }
  }
  var persistAsked = false;
  function save(silent) {
    try { localStorage.setItem(KEY, JSON.stringify({ app: 'Retail Key', version: 2, cards: S.cards })); }
    catch (e) { toast('Couldn’t save. Storage is full or blocked in this browser.'); return false; }
    if (!persistAsked && navigator.storage && navigator.storage.persist) { persistAsked = true; navigator.storage.persist().catch(function () {}); }
    if (!silent) render();
    return true;
  }
  function byId(id) { return S.cards.filter(function (c) { return c.id === id; })[0]; }
  function addEntry(card, o) {
    var e = normEntry({ id: uid(), n: nCounter++, t: o.t || localISO(), type: o.type, delta: o.delta || 0, value: o.value, amount: o.amount, note: o.note, source: o.source });
    card.entries.push(e); return e;
  }

  /* ======================= small UI helpers ======================= */
  function toast(msg, actLabel, fn) {
    var el = document.createElement('div'); el.className = 'toast';
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (actLabel ? '<button>' + esc(actLabel) + '</button>' : '');
    $('#toasts').appendChild(el);
    var t = setTimeout(function () { el.remove(); }, actLabel ? 7000 : 3600);
    if (actLabel) $('button', el).onclick = function () { clearTimeout(t); el.remove(); fn(); };
  }
  function ask(title, body, ok) {
    return new Promise(function (res) {
      var d = $('#d-ask'); $('#a-title').textContent = title; $('#a-body').textContent = body; $('#a-ok').textContent = ok || 'Delete';
      d.returnValue = ''; d.onclose = function () { res(d.returnValue === 'yes'); }; d.showModal();
    });
  }
  function openD(id) { var d = $(id); if (!d.open) d.showModal(); return d; }
  function closeD(id) { var d = $(id); if (d.open) d.close(); }

  /* ======================= guilloche (banknote engraving) ======================= */
  function rng(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function hypo(R, r, d, fit) {
    var turns = r / gcd(R, r), steps = Math.min(2600, Math.round(turns * 72)), pts = [], mx = 0, i, t, x, y;
    for (i = 0; i <= steps; i++) { t = i / steps * Math.PI * 2 * turns; x = (R - r) * Math.cos(t) + d * Math.cos((R - r) / r * t); y = (R - r) * Math.sin(t) - d * Math.sin((R - r) / r * t); pts.push([x, y]); mx = Math.max(mx, Math.hypot(x, y)); }
    var k = fit / mx; return 'M' + pts.map(function (p) { return (p[0] * k).toFixed(1) + ' ' + (p[1] * k).toFixed(1); }).join('L');
  }
  var guilCache = {};
  function guilloche(seed) {
    if (guilCache[seed]) return guilCache[seed];
    var rnd = rng(E.hash(seed)), rs = [13, 17, 19, 23, 29, 31, 37], R = 60 + Math.floor(rnd() * 20);
    var r1 = rs[Math.floor(rnd() * rs.length)], r2 = rs[Math.floor(rnd() * rs.length)];
    var p1 = hypo(R, r1, r1 * (.75 + rnd() * .5), 150), p2 = hypo(R + 7, r2, r2 * (.6 + rnd() * .6), 104), p3 = hypo(R + 3, r1 + 2, (r1 + 2) * (.5 + rnd() * .5), 58);
    var cx = 232 + rnd() * 40, cy = 40 + rnd() * 40, waves = '', i, j;
    for (i = 0; i < 26; i++) {
      var amp = 5 + rnd() * 8, ph = rnd() * 6.28, fq = .018 + rnd() * .02, y0 = 118 + i * 4.4, d = 'M0 ' + y0;
      for (j = 0; j <= 360; j += 8) d += 'L' + j + ' ' + (y0 + Math.sin(j * fq + ph + i * .21) * amp * (1 + i / 26)).toFixed(1);
      waves += '<path d="' + d + '"/>';
    }
    var svg = '<svg class="guil" viewBox="0 0 340 224" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="none">' +
      '<g transform="translate(' + cx.toFixed(0) + ' ' + cy.toFixed(0) + ')" stroke="#fff" stroke-width=".45" stroke-opacity=".34"><path d="' + p1 + '"/><path d="' + p2 + '" stroke-opacity=".5"/><path d="' + p3 + '" stroke-opacity=".6"/></g>' +
      '<g stroke="#fff" stroke-width=".4" stroke-opacity=".2">' + waves + '</g>' +
      '<rect x="7" y="7" width="326" height="210" rx="17" stroke="#fff" stroke-opacity=".16" stroke-width=".6"/></svg>';
    return (guilCache[seed] = svg);
  }
  function paintBackdrop() {
    var d = hypo(97, 29, 31, 300) + hypo(101, 37, 33, 220);
    $('.bg').innerHTML = '<svg viewBox="-300 -300 600 600" fill="none" stroke="#9fb0ff" stroke-width=".7"><path d="' + d + '"/></svg>';
  }

  /* ======================= count-up numbers ======================= */
  function countUp(el, to, fmt, from) {
    if (REDUCED || from === to || from == null) { el.textContent = fmt(to); return; }
    var t0 = performance.now(), dur = 850;
    (function step(t) {
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ======================= wallet ======================= */
  function worthOf(c, b) { return c.kind === 'points' && b.rand > 0 ? '<b>≈ ' + E.money(b.rand) + '</b> · ' : ''; }
  function statusLine(c, b) {
    if (b.status === 'empty') return 'Add a balance from a slip or the shop’s app.';
    if (b.status === 'unanchored') return worthOf(c, b) + 'counted from your logs';
    return worthOf(c, b) + 'confirmed ' + E.ago(b.anchor.t);
  }
  function detailLine(c, b) {
    var pct = b.progress != null ? Math.floor(b.progress * 100) + '% to ' + E.amountFor(c, b.goal) : '';
    var d = b.status === 'tracked' ? signed(c, b.since) + ' since confirmed' : b.status === 'unanchored' ? 'Confirm a balance to make it exact' : '';
    return [pct, d].filter(Boolean).join(' · ');
  }
  function cardHTML(c, idx, deal) {
    var b = E.balanceOf(c), ex = E.expiryOf(c), p = E.PALETTES[c.color], empty = b.status === 'empty';
    var val = E.amountFor(c, b.value), long = val.length > 6;
    var unit = c.kind === 'cashback' ? '' : c.kind === 'stamps' ? (b.goal ? 'of ' + E.count(b.goal) + ' stamps' : 'stamps') : 'points';
    var chip = '';
    if (ex && ex.level === 'expired') chip = '<span class="chip bad">Expired</span>';
    else if (ex && (ex.level === 'soon' || ex.level === 'near')) chip = '<span class="chip' + (ex.level === 'soon' ? ' warn' : '') + '">Expires in ' + ex.days + (ex.days === 1 ? ' day' : ' days') + '</span>';
    else if (b.stale) chip = '<span class="chip warn">Check balance</span>';
    var bar = b.progress != null ? '<span class="bar"><i style="--p:' + b.progress.toFixed(3) + '"></i></span>' : '';
    var tail = '•••• ' + esc(c.number.replace(/\s/g, '').slice(-4));
    var spoken = c.retailer + ', ' + (empty ? 'no balance yet' : val + ' ' + (unit || 'rand'));
    var open = S.active === c.id;
    return '<div class="slot' + (open ? ' open' : '') + (deal ? ' deal' : '') + '" data-id="' + c.id + '" style="--i:' + idx + '">' +
      '<button class="card" data-act="pick" data-id="' + c.id + '" aria-expanded="' + open + '" aria-label="' + esc(spoken) + '" style="--c0:' + p[0] + ';--c1:' + p[1] + ';--c2:' + p[2] + '">' +
      guilloche(c.id + c.retailer) + '<span class="foil"></span>' +
      '<span class="c-in"><span class="c-top"><span class="c-name">' + esc(c.retailer) + '</span>' + chip + '</span>' +
      '<span class="c-bal"><span class="num' + (long ? ' long' : '') + (empty ? ' blank' : '') + '" data-id="' + c.id + '" data-val="' + (empty ? '' : b.value) + '">' + (empty ? 'Set balance' : val) + '</span>' + (empty ? '' : '<span class="unit">' + unit + '</span>') + '</span>' +
      '<span class="c-sub">' + statusLine(c, b) + '</span>' +
      '<span class="c-foot">' + bar + '<span class="c-meta"><span class="dl">' + detailLine(c, b) + '</span><span class="tail">' + tail + '</span></span></span></span></button>' +
      '<div class="panel"><div' + (open ? '' : ' inert') + '><div class="acts4">' +
      '<button class="act hot" data-act="till" data-id="' + c.id + '"><svg viewBox="0 0 24 24"><use href="#i-till"/></svg>Till</button>' +
      '<button class="act" data-act="log" data-id="' + c.id + '"><svg viewBox="0 0 24 24"><use href="#i-log"/></svg>Log</button>' +
      '<button class="act" data-act="confirm" data-id="' + c.id + '"><svg viewBox="0 0 24 24"><use href="#i-check"/></svg>Confirm</button>' +
      '<button class="act" data-act="hist" data-id="' + c.id + '"><svg viewBox="0 0 24 24"><use href="#i-hist"/></svg>History</button></div>' +
      '<div class="acts2"><button class="link" data-act="edit" data-id="' + c.id + '">Edit card</button><button class="link bad" data-act="del" data-id="' + c.id + '">Delete</button></div></div></div></div>';
  }
  function renderWallet() {
    var root = $('#v-wallet'), cards = S.cards, html = '';
    if (!cards.length) {
      html = '<h1>Know your points before you reach the till.</h1><p class="lede">Add the cards you shop with. Every balance sits in one place, and the barcode is one tap away.</p>' +
        '<div class="empty"><h2>Start with a card</h2><p>Pick a shop to begin, or scan the barcode on the plastic.</p><div class="chips">' +
        E.RETAILERS.slice(0, 8).map(function (r) { return '<button data-act="add-card" data-retailer="' + esc(r.name) + '">' + esc(r.name) + '</button>'; }).join('') +
        '<button data-act="scan-new">Scan a card</button></div></div>';
      root.innerHTML = html; return;
    }
    var alerts = [];
    cards.forEach(function (c) {
      var b = E.balanceOf(c), ex = E.expiryOf(c);
      if (ex && ex.level === 'expired') alerts.push(['bad', c, c.retailer + ' points expired ' + fmtDate(c.expiry + 'T12:00:00') + '. Log the loss or update the date.', 'edit']);
      else if (ex && ex.level === 'soon') alerts.push(['', c, c.retailer + ' expires in ' + ex.days + (ex.days === 1 ? ' day' : ' days') + '. Spend ' + (b.value ? E.amountFor(c, b.value) + ' ' + E.unitFor(c) : 'what you have') + ' first.', 'pick']);
      else if (b.status === 'empty') alerts.push(['', c, c.retailer + ' has no balance yet. Confirm one so the number is exact.', 'confirm']);
      else if (b.stale) alerts.push(['', c, c.retailer + ' was last confirmed ' + b.ageDays + ' days ago. Check it against the shop’s app or a slip.', 'confirm']);
    });
    html = '<div class="alerts">' + alerts.slice(0, 3).map(function (a) { return '<button class="alert ' + a[0] + '" data-act="' + a[3] + '" data-id="' + a[1].id + '"><i></i><span>' + esc(a[2]) + '</span></button>'; }).join('') + '</div>' +
      '<div class="stack" id="stack">' + cards.map(function (c, i) { return cardHTML(c, i, firstRender); }).join('') + '</div>';
    root.innerHTML = html;
    markAfterActive();
    $$('.num[data-val]', root).forEach(function (el) {
      var c = byId(el.dataset.id), v = el.dataset.val; if (v === '' || !c) return; v = +v;
      var from = shown[c.id] != null ? shown[c.id] : (firstRender ? 0 : v); shown[c.id] = v;
      countUp(el, v, function (n) { return E.amountFor(c, c.kind === 'cashback' ? n : Math.round(n)); }, from);
    });
    firstRender = false;
  }
  function markAfterActive() {
    $$('.slot').forEach(function (s, i, all) { s.classList.toggle('after-active', i > 0 && all[i - 1].classList.contains('open')); });
  }
  function setActive(id) {
    S.active = S.active === id ? null : id;
    $$('.slot').forEach(function (s) {
      var on = s.dataset.id === S.active; s.classList.toggle('open', on);
      $('.card', s).setAttribute('aria-expanded', on); var inner = $('.panel > div', s); if (on) inner.removeAttribute('inert'); else inner.setAttribute('inert', '');
    });
    markAfterActive();
    if (S.active) { askMotion(); setTimeout(function () { var s = $('.slot.open'); if (s) { var r = s.getBoundingClientRect(); if (r.bottom > innerHeight - 120 || r.top < 70) s.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' }); } }, 120); }
  }
  function renderTotal() {
    var tot = E.totalRand(S.cards), any = S.cards.some(function (c) { return c.kind !== 'stamps' && E.balanceOf(c).status !== 'empty'; });
    $('#total').hidden = !any || tot <= 0; $('#totalVal').textContent = E.money(tot);
  }

  /* ======================= activity ======================= */
  function renderActivity() {
    var root = $('#v-activity'), now = new Date(), ms = new Date(now.getFullYear(), now.getMonth(), 1).getTime(), rows = [];
    S.cards.forEach(function (c) { c.entries.forEach(function (e) { rows.push({ c: c, e: e }); }); });
    rows.sort(function (a, b) { return a.e.t < b.e.t ? 1 : a.e.t > b.e.t ? -1 : b.e.n - a.e.n; });
    var html = '<h1>Activity</h1><p class="lede">Everything that moved your balances.</p>';
    if (!rows.length) { root.innerHTML = html + '<div class="empty"><h2>Nothing logged yet</h2><p>Open a card and tap Log after you shop, or paste a slip to update a balance.</p><div class="chips"><button data-act="slip">Read a slip or SMS</button></div></div>'; return; }
    var month = S.cards.map(function (c) {
      var up = 0, dn = 0; c.entries.forEach(function (e) { if (new Date(e.t).getTime() >= ms && e.type !== 'confirm') { if (e.delta > 0) up += e.delta; else dn += e.delta; } });
      return up || dn ? '<div class="mrow"><i class="dot" style="--a:' + E.PALETTES[c.color][0] + ';--b:' + E.PALETTES[c.color][1] + '"></i><span>' + esc(c.retailer) + '</span><span class="up">+' + E.amountFor(c, up) + '</span><span class="dn">' + (dn ? '−' + E.amountFor(c, -dn) : '') + '</span></div>' : '';
    }).join('');
    if (month) html += '<h2 class="sec">This month</h2><div class="month">' + month + '</div>';
    var day = '';
    rows.slice(0, 120).forEach(function (r) {
      var d = fmtDate(r.e.t); if (d !== day) { day = d; html += '<div class="day">' + d + '</div>'; }
      html += evRow(r.c, r.e, true);
    });
    root.innerHTML = html;
  }
  function evLabel(c, e) {
    if (e.type === 'confirm') return 'Balance confirmed';
    if (e.type === 'earn') return e.amount != null ? 'Spent ' + E.money(e.amount) : 'Earned';
    if (e.type === 'redeem') return 'Used';
    return 'Correction';
  }
  function evRow(c, e, withShop) {
    var p = E.PALETTES[c.color], cls = e.type === 'confirm' ? 'cf' : e.delta >= 0 ? 'up' : 'dn', v = e.type === 'confirm' ? E.amountFor(c, e.value) : signed(c, e.delta);
    return '<div class="ev"><i class="dot" style="--a:' + p[0] + ';--b:' + p[1] + '"></i><div><b>' + esc(withShop ? c.retailer : evLabel(c, e)) + '</b><small>' + esc((withShop ? evLabel(c, e) : '') + (e.note ? (withShop ? ' · ' : '') + e.note : '')) + '</small></div><span class="v ' + cls + '">' + v + '</span></div>';
  }

  /* ======================= settings ======================= */
  var installEvt = null;
  function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function renderSettings() {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent), inst;
    if (isStandalone()) inst = '<p>Retail Key is installed on this device and works offline.</p>';
    else if (installEvt) inst = '<p>Put Retail Key on your home screen. It opens full screen and works without data.</p><div class="row"><button class="btn" data-act="install">Install app</button></div>';
    else inst = '<p>' + (ios ? 'On iPhone, tap Share, then Add to Home Screen.' : 'Open your browser menu and choose Install app or Add to Home screen.') + '</p>';
    $('#v-settings').innerHTML = '<h1>Settings</h1><p class="lede">Your cards live on this device. Nothing is uploaded.</p><div class="set">' +
      '<div class="setc"><h3>How your balances stay exact</h3><ol class="how"><li><b>Confirm a balance.</b> Type it from a slip, SMS or the shop’s app, or paste the slip and let Retail Key read it.</li><li><b>Log what happens next.</b> Purchases add points at your earn rate. Rewards you use take them off.</li><li><b>Confirm again now and then.</b> Retail Key flags any card not confirmed for ' + STALE_DAYS + ' days.</li></ol><p style="margin:12px 0 0">Retail Key is not connected to any shop’s systems. A balance is only ever your last confirmation plus what you logged since.</p></div>' +
      '<div class="setc"><h3>Install</h3>' + inst + '</div>' +
      '<div class="setc"><h3>Backup</h3><p>Save your cards and history to a file, or restore from one. Backups contain your card numbers, so keep them somewhere private.</p><div class="row"><button class="btn ghost" data-act="export">Save backup</button><button class="btn ghost" data-act="export-csv">Export history (CSV)</button><label class="btn ghost" style="cursor:pointer">Restore backup<input type="file" id="imp" accept="application/json,.json" hidden></label></div></div>' +
      '<div class="setc"><h3>Privacy</h3><p id="persist">Everything is stored in this browser on this device. Anyone who can unlock your phone can open the app.</p><div class="row"><button class="btn ghost" data-act="wipe">Delete everything</button></div></div>' +
      '</div><p class="small" style="margin-top:18px;color:var(--faint);font-size:12.5px">Retail Key 2.0 by PixelProTech Solutions. Not affiliated with any retailer.</p>';
    var imp = $('#imp'); if (imp) imp.onchange = function () { if (imp.files[0]) importFile(imp.files[0]); imp.value = ''; };
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(function (p) { var el = $('#persist'); if (el) el.textContent = (p ? 'Your browser has promised not to clear this data automatically. ' : 'Your browser may clear this data if the device runs low on space, so save a backup now and then. ') + 'Everything stays on this device, and anyone who can unlock your phone can open the app.'; });
  }

  /* ======================= router ======================= */
  function render() { renderTotal(); if (S.view === 'wallet') renderWallet(); else if (S.view === 'activity') renderActivity(); else renderSettings(); }
  function nav(v) {
    S.view = v;
    ['wallet', 'activity', 'settings'].forEach(function (x) { $('#v-' + x).hidden = x !== v; });
    $$('.dock [data-nav]').forEach(function (b) { var on = b.dataset.nav === v; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    render(); window.scrollTo(0, 0);
  }

  /* ======================= card form ======================= */
  var editing = null, scanTarget = null;
  function buildSwatches() {
    $('#c-sw').innerHTML = E.PALETTES.map(function (p, i) { return '<label><input type="radio" name="color" value="' + i + '"' + (i === 0 ? ' checked' : '') + ' aria-label="Colour ' + (i + 1) + '"><span style="--a:' + p[0] + ';--b:' + p[1] + '"></span></label>'; }).join('');
    $('#dl-retailers').innerHTML = E.RETAILERS.map(function (r) { return '<option value="' + esc(r.name) + '">'; }).join('');
  }
  function kindGroups() {
    var k = $('input[name=kind]:checked').value;
    $$('#f-card [data-for]').forEach(function (el) { el.hidden = el.dataset.for.split(' ').indexOf(k) < 0; });
  }
  function formatHint() {
    var v = $('#c-number').value.trim(), f = $('#c-format').value, h = $('#c-format-hint');
    if (!v) { h.textContent = 'Pick the type printed on your plastic card if the till doesn’t accept the first try.'; return; }
    var r = C.render(v, f); h.textContent = r.ok ? (r.note || 'Will be drawn as ' + r.label + '.') : r.error;
  }
  function numStr(n) { return n == null ? '' : String(n).replace('.', ','); }
  function openCardForm(card, pre) {
    pre = pre || {}; editing = card || null;
    $('#f-card').reset(); buildSwatchesOnce();
    $('#f-card-title').textContent = card ? 'Edit card' : 'New card';
    $('#c-start-wrap').hidden = !!card;
    var c = card || {};
    $('#c-retailer').value = c.retailer || pre.retailer || ''; $('#c-number').value = c.number || pre.number || '';
    $('#c-format').value = c.format || pre.format || 'auto';
    $('input[name=kind][value=' + (c.kind || 'points') + ']').checked = true;
    $('#c-ppr').value = numStr(c.pointsPerRand); $('#c-pv').value = numStr(c.pointValue); $('#c-pct').value = numStr(c.cashbackPct);
    $('#c-goal').value = c.kind === 'stamps' ? '' : numStr(c.goal); $('#c-goal-s').value = c.kind === 'stamps' ? numStr(c.goal) : ''; $('#c-min').value = numStr(c.minSpend);
    $('#c-expiry').value = c.expiry || '';
    var col = card ? card.color : (E.hash(($('#c-retailer').value || String(Date.now()))) % 8);
    $('input[name=color][value="' + col + '"]').checked = true;
    kindGroups(); formatHint(); openD('#d-card');
  }
  var swBuilt = false; function buildSwatchesOnce() { if (!swBuilt) { buildSwatches(); swBuilt = true; } }
  function submitCard(ev) {
    ev.preventDefault();
    var retailer = $('#c-retailer').value.trim(), number = $('#c-number').value.trim().replace(/\s+/g, ' ');
    if (!retailer) { $('#c-retailer').focus(); return toast('Enter the shop or programme name.'); }
    if (!number) { $('#c-number').focus(); return toast('Enter the card number.'); }
    var kind = $('input[name=kind]:checked').value, A = E.parseAmount;
    var o = { id: editing ? editing.id : uid(), retailer: retailer, number: number, format: $('#c-format').value, kind: kind, color: +$('input[name=color]:checked').value, expiry: $('#c-expiry').value,
      entries: editing ? editing.entries : [], createdAt: editing ? editing.createdAt : localISO() };
    if (kind === 'points') { var ppr = A($('#c-ppr').value), pv = A($('#c-pv').value); if (ppr != null) o.pointsPerRand = ppr; if (pv != null) o.pointValue = pv; }
    if (kind === 'cashback') { var pc = A($('#c-pct').value); if (pc != null) o.cashbackPct = pc; }
    var g = A(kind === 'stamps' ? $('#c-goal-s').value : $('#c-goal').value); if (g != null && g > 0) o.goal = g;
    if (kind === 'stamps') { var mn = A($('#c-min').value); if (mn != null) o.minSpend = mn; }
    var start = $('#c-start').value.trim(), sv = start ? A(start) : null;
    if (start && sv == null) { $('#c-start').focus(); return toast('The balance needs to be a number.'); }
    if (editing) S.cards = S.cards.map(function (c) { return c.id === o.id ? o : c; }); else { S.cards.unshift(o); }
    if (!editing && sv != null) addEntry(o, { type: 'confirm', value: sv, note: 'Starting balance' });
    S.active = o.id; if (!save()) return; closeD('#d-card'); toast(editing ? 'Card updated.' : 'Card saved.'); editing = null;
    if (S.view !== 'wallet') nav('wallet');
  }

  /* ======================= log / confirm ======================= */
  var logCard = null, amtTouched = false, warned = false;
  var L_LABEL = { points: ['Points earned', 'Points used', 'Change in points (use − to remove)'], cashback: ['Cashback earned (R)', 'Cashback used (R)', 'Change in cashback (R, use − to remove)'], stamps: ['Stamps earned', 'Stamps used', 'Change in stamps (use − to remove)'] };
  function logType() { return $('input[name=ltype]:checked').value; }
  function logRefresh() {
    var c = logCard, t = logType(), i = { earn: 0, redeem: 1, adjust: 2 }[t];
    $('#l-amt-label').textContent = L_LABEL[c.kind][i];
    $$('#f-log [data-lf]').forEach(function (el) { el.hidden = el.dataset.lf.split(' ').indexOf(t) < 0; });
    $('#l-t-earn').textContent = c.kind === 'stamps' ? 'Visit' : 'Earned';
    var h = $('#l-amt-hint'), amt = E.parseAmount($('#l-amt').value);
    if (t === 'earn') {
      var has = c.kind === 'points' ? c.pointsPerRand : c.kind === 'cashback' ? c.cashbackPct : true;
      h.textContent = has ? (c.kind === 'stamps' ? 'One stamp per visit.' : 'Worked out from your earn rate. Change it if the slip says different.') : 'No earn rate set for this card. Type the amount printed on the slip, or edit the card to set a rate.';
    } else if (t === 'redeem' && c.kind === 'points' && c.pointValue && amt) h.textContent = 'Worth about ' + E.money(amt * c.pointValue) + '.';
    else h.textContent = '';
  }
  function logAuto() {
    if (logType() !== 'earn' || amtTouched) return;
    var sp = E.parseAmount($('#l-spend').value), v = sp == null ? (logCard.kind === 'stamps' ? 1 : '') : E.earnFor(logCard, sp);
    $('#l-amt').value = v === '' ? '' : numStr(v); logRefresh();
  }
  function openLog(c) {
    logCard = c; amtTouched = false; warned = false; $('#f-log').reset();
    $('#l-title').textContent = c.retailer; $('#l-date').value = todayYMD(); $('#l-date').max = todayYMD();
    if (c.kind === 'stamps') $('#l-amt').value = '1';
    logRefresh(); openD('#d-log');
  }
  function submitLog(ev) {
    ev.preventDefault(); var c = logCard, t = logType(), amt = E.parseAmount($('#l-amt').value), sp = E.parseAmount($('#l-spend').value);
    if (t === 'adjust') { var raw = $('#l-amt').value.replace('−', '-'); amt = /^\s*-/.test(raw) ? -(E.parseAmount(raw.replace('-', '')) || NaN) : E.parseAmount(raw); }
    if (amt == null || isNaN(amt) || amt === 0) { $('#l-amt').focus(); return toast('Enter an amount.'); }
    var delta = t === 'earn' ? Math.abs(amt) : t === 'redeem' ? -Math.abs(amt) : amt, b = E.balanceOf(c);
    if (t === 'redeem' && b.status !== 'empty' && Math.abs(delta) > b.value + 1e-9 && !warned) {
      warned = true; $('#l-amt-hint').textContent = 'That’s more than the ' + E.amountFor(c, b.value) + ' this card holds. Check the number, or confirm your balance first. Tap Save again to keep it.'; return;
    }
    addEntry(c, { type: t, delta: c.kind === 'cashback' ? E.round2(delta) : delta, amount: t === 'earn' && sp != null ? sp : undefined, note: $('#l-note').value.trim(), t: ymdToISO($('#l-date').value) });
    if (save()) { closeD('#d-log'); toast(t === 'earn' ? 'Added ' + E.amountFor(c, delta) + '.' : t === 'redeem' ? 'Took off ' + E.amountFor(c, -delta) + '.' : 'Correction saved.'); }
  }
  var confCard = null;
  function openConfirm(c) {
    confCard = c; var b = E.balanceOf(c); $('#f-confirm').reset();
    $('#k-title').textContent = c.retailer; $('#k-label').textContent = c.kind === 'cashback' ? 'Cashback balance (R)' : c.kind === 'stamps' ? 'Stamps collected' : 'Points balance';
    $('#k-val').value = b.status === 'empty' ? '' : numStr(b.value); $('#k-date').value = todayYMD(); $('#k-date').max = todayYMD(); openD('#d-confirm');
    setTimeout(function () { $('#k-val').select(); }, 60);
  }
  function submitConfirm(ev) {
    ev.preventDefault(); var v = E.parseAmount($('#k-val').value);
    if (v == null) { $('#k-val').focus(); return toast('Enter the balance as a number.'); }
    addEntry(confCard, { type: 'confirm', value: confCard.kind === 'cashback' ? E.round2(v) : v, t: ymdToISO($('#k-date').value), note: 'Confirmed by you' });
    if (save()) { closeD('#d-confirm'); toast('Balance confirmed.'); }
  }

  /* ======================= slip reader ======================= */
  var slipCard = null, slipParsed = null;
  function openSlip(text, cardId) {
    slipCard = cardId || S.active || null; $('#sl-text').value = text || ''; $('#sl-out').innerHTML = '';
    openD('#d-slip'); if (text) readSlip();
  }
  function matchCard(name) {
    if (!name) return null; var pre = E.RETAILERS.filter(function (r) { return r.name === name; })[0];
    return S.cards.filter(function (c) { return (pre && pre.rx.test(c.retailer)) || c.retailer.toLowerCase().indexOf(name.split(' ')[0].toLowerCase()) > -1; })[0] || null;
  }
  function readSlip() {
    var txt = $('#sl-text').value.trim(), out = $('#sl-out');
    if (!txt) { out.innerHTML = '<div class="res"><div class="res-miss">Paste the slip or SMS text first.</div></div>'; return; }
    if (!S.cards.length) { out.innerHTML = '<div class="res"><div class="res-miss">Add a card first, then Retail Key can update it from this text.</div></div>'; return; }
    var p = slipParsed = E.parseSlip(txt), m = matchCard(p.retailer), c = (m && m.id) || slipCard || S.cards[0].id;
    slipCard = c; renderSlipResult();
  }
  function slipPlan() {
    var p = slipParsed, c = byId(slipCard), plan = [];
    if (!c) return plan;
    var earned = c.kind === 'points' && p.earned != null ? p.earned : (p.spend != null ? E.earnFor(c, p.spend) : null), derived = !(c.kind === 'points' && p.earned != null);
    if (p.spend != null || p.earned != null) {
      plan.push({ k: 'earn', amount: p.spend, delta: c.kind === 'stamps' ? 1 : earned, title: (p.spend != null ? 'Purchase ' + E.money(p.spend) : 'Points earned'), sub: c.kind === 'stamps' ? 'Adds a stamp' : earned ? 'Adds ' + E.amountFor(c, earned) + ' ' + E.unitFor(c) + (derived ? ' (from your earn rate)' : ' (printed on the slip)') : 'No earn rate set. Type the points in Log.', ok: c.kind === 'stamps' || !!earned });
    }
    if (p.redeemed != null && c.kind === 'points') plan.push({ k: 'redeem', delta: -p.redeemed, title: 'Points used ' + E.count(p.redeemed), sub: 'Takes off ' + E.count(p.redeemed) + ' points', ok: true });
    var bal = c.kind === 'points' ? p.balance : c.kind === 'cashback' ? p.cashbackBalance : p.stamps ? p.stamps.have : null;
    if (bal != null) plan.push({ k: 'confirm', value: bal, title: 'Balance ' + E.amountFor(c, bal) + ' ' + E.unitFor(c), sub: 'Confirms this as your balance', ok: true });
    return plan;
  }
  function renderSlipResult() {
    var p = slipParsed, out = $('#sl-out'), c = byId(slipCard), opts = S.cards.map(function (x) { return '<option value="' + x.id + '"' + (x.id === slipCard ? ' selected' : '') + '>' + esc(x.retailer) + '</option>'; }).join('');
    var plan = slipPlan(), html = '<div class="res"><label class="fld" style="margin:0 0 4px"><span>Update this card</span><select id="sl-card">' + opts + '</select></label>';
    if (!plan.length) html += '<div class="res-miss">' + (p.found.length ? 'Found ' + p.found.join(', ') + ', but nothing that matches a ' + E.KINDS[c.kind].label.toLowerCase() + ' card. ' : 'Couldn’t find a balance, purchase or points in this text. ') + 'Check the card choice, or type the balance with Confirm.</div></div>';
    else {
      html += plan.map(function (r, i) { return '<label class="res-row"><input type="checkbox" data-i="' + i + '"' + (r.ok ? ' checked' : ' disabled') + '><span><b>' + esc(r.title) + '</b><small>' + esc(r.sub) + '</small></span></label>'; }).join('');
      html += '<div class="acts"><button class="btn wide" data-act="slip-apply">Update ' + esc(c.retailer) + '</button></div></div>';
    }
    out.innerHTML = html + (plan.length ? '' : '');
    var sel = $('#sl-card'); if (sel) sel.onchange = function () { slipCard = sel.value; renderSlipResult(); };
  }
  function applySlip() {
    var c = byId(slipCard), plan = slipPlan(), checks = $$('#sl-out input[type=checkbox]'), t = slipParsed.date ? ymdToISO(slipParsed.date) : localISO(), n = 0, prevBal = E.balanceOf(c);
    plan.forEach(function (r, i) { if (!checks[i] || !checks[i].checked) return; n++;
      if (r.k === 'confirm') addEntry(c, { type: 'confirm', value: c.kind === 'cashback' ? E.round2(r.value) : r.value, t: t, note: 'From slip', source: 'slip' });
      else addEntry(c, { type: r.k, delta: r.delta, amount: r.amount, t: t, note: 'From slip', source: 'slip' }); });
    if (!n) return toast('Tick at least one item.');
    S.active = c.id; if (!save()) return; closeD('#d-slip');
    var nb = E.balanceOf(c); toast((c.retailer + ' is now ' + E.amountFor(c, nb.value) + ' ' + E.unitFor(c)).trim() + '.');
    if (S.view !== 'wallet') nav('wallet');
  }

  /* ======================= history ======================= */
  var histId = null;
  function sparkSVG(c) {
    var s = E.series(c, 30), mn = Math.min.apply(null, s), mx = Math.max.apply(null, s), rng = mx - mn || 1, w = 300, h = 60;
    var pts = s.map(function (v, i) { return (i / (s.length - 1) * w).toFixed(1) + ',' + (h - 6 - (v - mn) / rng * (h - 12)).toFixed(1); });
    var p = E.PALETTES[c.color];
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="Balance over the last 30 days"><defs><linearGradient id="sg" x1="0" x2="1"><stop offset="0" stop-color="' + p[0] + '"/><stop offset="1" stop-color="' + p[2] + '"/></linearGradient></defs><polyline fill="none" stroke="url(#sg)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" points="' + pts.join(' ') + '"/></svg>';
  }
  function renderHist() {
    var c = byId(histId); if (!c) return closeD('#d-hist');
    var b = E.balanceOf(c), led = E.ledger(c), root = $('#hist-in');
    root.innerHTML = '<header class="sh"><h2>' + esc(c.retailer) + '</h2><button class="x" data-close aria-label="Close">✕</button></header>' +
      '<p class="hint" style="margin-bottom:4px">' + (b.status === 'empty' ? 'No balance yet.' : '<b style="color:var(--ivory);font-size:20px">' + E.amountFor(c, b.value) + ' ' + E.unitFor(c) + '</b> · ' + (b.anchor ? 'confirmed ' + E.ago(b.anchor.t) : 'counted from logs')) + '</p>' +
      (led.length > 1 ? sparkSVG(c) + '<small>Last 30 days</small>' : '') +
      (led.length ? '<ul class="led" style="margin-top:12px">' + led.map(function (r) {
        var e = r.e, cls = e.type === 'confirm' ? 'cf' : e.delta >= 0 ? 'up' : 'dn', v = e.type === 'confirm' ? E.amountFor(c, e.value) : signed(c, e.delta);
        return '<li><span class="d">' + esc(evLabel(c, e)) + '</span><span class="v ' + cls + '">' + v + '</span><span class="s">' + fmtDate(e.t) + (e.note ? ' · ' + esc(e.note) : '') + '</span><span class="a">balance ' + E.amountFor(c, r.after) + '</span><button class="undo" data-act="rm-entry" data-eid="' + e.id + '">Remove</button></li>';
      }).join('') + '</ul>' : '<p class="hint" style="margin-top:14px">Nothing logged yet. Use Confirm to set a balance, or Log after you shop.</p>');
  }
  function removeEntry(eid) {
    var c = byId(histId), e = c.entries.filter(function (x) { return x.id === eid; })[0]; if (!e) return;
    c.entries = c.entries.filter(function (x) { return x.id !== eid; }); if (!save(true)) { c.entries.push(e); return; } render(); renderHist();
    toast('Entry removed.', 'Undo', function () { c.entries.push(e); save(true); render(); if ($('#d-hist').open) renderHist(); });
  }

  /* ======================= till mode ======================= */
  var wake = null;
  function openTill(c) {
    var b = E.balanceOf(c), r = C.render(c.number, c.format), p = E.PALETTES[c.color];
    var sub = b.status === 'empty' ? 'No balance confirmed yet' : b.status === 'unanchored' ? 'Counted from your logs' : 'Confirmed ' + E.ago(b.anchor.t) + (b.sinceCount ? ', ' + signed(c, b.since) + ' since' : '');
    $('#till-in').innerHTML = '<div class="till-top"><h2>' + esc(c.retailer) + '</h2><button class="x" data-close aria-label="Close">✕</button></div>' +
      '<div class="till-bal">' + (b.status === 'empty' ? '' : '<b>' + E.amountFor(c, b.value) + '</b><span>' + E.unitFor(c) + (c.kind === 'points' && b.rand > 0 ? ' · ≈ ' + E.money(b.rand) : '') + '</span>') + '</div><div class="till-sub">' + sub + '</div>' +
      '<div class="till-code">' + (r.ok ? '<div class="code ' + (r.aspect === 'square' ? 'sq' : 'lin') + '" role="img" aria-label="Barcode for ' + esc(c.retailer) + '">' + r.svg + '</div>' : '') +
      '<div class="till-num">' + esc(c.number) + '</div>' + (r.ok ? (r.note ? '<div class="till-note">' + esc(r.note) + '</div>' : '') : '<div class="till-note">' + esc(r.error) + '</div>') + '</div>' +
      '<div class="till-hint">Turn your screen brightness up if the scanner struggles.</div>';
    var d = openD('#d-till'); d.style.setProperty('--tc', p[0]);
    if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { wake = l; }).catch(function () {});
  }
  $('#d-till').addEventListener('close', function () { if (wake) { wake.release().catch(function () {}); wake = null; } });

  /* ======================= scanner ======================= */
  var stream = null, detector = null, scanTimer = null, scanCb = null;
  var FMT = { code_128: 'code128', ean_13: 'ean13', ean_8: 'ean8', code_39: 'code39', qr_code: 'qr', upc_a: 'ean13' };
  async function makeDetector() {
    if (!('BarcodeDetector' in window)) return null;
    try { var sup = await BarcodeDetector.getSupportedFormats(); var want = ['code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf', 'codabar'].filter(function (f) { return sup.indexOf(f) > -1; }); return new BarcodeDetector({ formats: want }); } catch (e) { return null; }
  }
  async function openScanner(cb) {
    scanCb = cb; $('#s-manual').value = ''; var st = $('#s-status'), vf = $('.viewfinder'); vf.hidden = false; openD('#d-scan'); st.textContent = 'Starting camera…';
    detector = await makeDetector();
    $('.file').hidden = !detector;
    if (!detector) { vf.hidden = true; st.textContent = 'This browser can’t read barcodes with the camera. Type the number below, or open Retail Key in Chrome on Android.'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      var v = $('#s-video'); v.srcObject = stream; await v.play(); st.textContent = 'Hold the barcode inside the frame.'; scanLoop();
    } catch (e) { vf.hidden = true; st.textContent = 'The camera is blocked. Allow camera access in your browser settings, scan from a photo, or type the number.'; }
  }
  async function scanLoop() {
    if (!stream || !detector) return;
    try { var r = await detector.detect($('#s-video')); if (r.length && r[0].rawValue) return scanDone(r[0]); } catch (e) {}
    scanTimer = setTimeout(scanLoop, 160);
  }
  function stopScanner() { clearTimeout(scanTimer); scanTimer = null; if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } $('#s-video').srcObject = null; }
  function scanDone(r) { stopScanner(); var cb = scanCb; closeD('#d-scan'); if (navigator.vibrate) navigator.vibrate(40); if (cb) cb(r.rawValue, FMT[r.format] || 'auto'); }
  $('#d-scan').addEventListener('close', stopScanner);

  /* ======================= backup ======================= */
  function download(name, type, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }
  function exportJSON() { download('retail-key-backup-' + todayYMD() + '.json', 'application/json', JSON.stringify({ app: 'Retail Key', version: 2, exportedAt: localISO(), cards: S.cards }, null, 2)); toast('Backup saved.'); }
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportCSV() {
    var rows = [['Card', 'Date', 'Type', 'Change', 'Confirmed balance', 'Spend (R)', 'Balance after', 'Note']];
    S.cards.forEach(function (c) { E.ledger(c).reverse().forEach(function (r) { var e = r.e; rows.push([c.retailer, e.t.replace('T', ' '), e.type, e.type === 'confirm' ? '' : e.delta, e.type === 'confirm' ? e.value : '', e.amount != null ? e.amount : '', r.after, e.note]); }); });
    download('retail-key-history-' + todayYMD() + '.csv', 'text/csv', rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n')); toast('History exported.');
  }
  function importFile(f) {
    var rd = new FileReader(); rd.onload = async function () {
      try {
        var d = JSON.parse(rd.result), list = (d.cards || (Array.isArray(d) ? d : [])).map(normCard).filter(Boolean);
        if (!list.length) return toast('That file has no cards in it.');
        if (!await ask('Restore ' + list.length + (list.length === 1 ? ' card?' : ' cards?'), 'Cards with the same ID are replaced. Your other cards stay.', 'Restore')) return;
        list.forEach(function (n) { var i = S.cards.findIndex(function (c) { return c.id === n.id; }); if (i > -1) S.cards[i] = n; else S.cards.push(n); });
        save(); toast('Restored ' + list.length + (list.length === 1 ? ' card.' : ' cards.'));
      } catch (e) { toast('That file couldn’t be read as a Retail Key backup.'); }
    }; rd.readAsText(f);
  }

  /* ======================= foil tilt ======================= */
  var tiltRAF = 0, gyroOK = false;
  function setFoil(el, x, y) { el.style.setProperty('--fx', x.toFixed(3)); el.style.setProperty('--fy', y.toFixed(3)); }
  document.addEventListener('pointermove', function (e) {
    if (REDUCED || e.pointerType === 'touch') return;
    var card = e.target.closest && e.target.closest('.card'); if (!card) return;
    var r = card.getBoundingClientRect(); cancelAnimationFrame(tiltRAF);
    tiltRAF = requestAnimationFrame(function () { setFoil(card, Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))); });
  });
  document.addEventListener('pointerout', function (e) { var card = e.target.closest && e.target.closest('.card'); if (card && !card.contains(e.relatedTarget)) { card.style.removeProperty('--fx'); card.style.removeProperty('--fy'); } });
  function onGyro(e) {
    if (e.gamma == null) return; if (tiltRAF) return;
    tiltRAF = requestAnimationFrame(function () { tiltRAF = 0; var x = Math.min(1, Math.max(0, .5 + e.gamma / 70)), y = Math.min(1, Math.max(0, .5 + ((e.beta || 45) - 45) / 70)); document.documentElement.style.setProperty('--fx', x.toFixed(3)); document.documentElement.style.setProperty('--fy', y.toFixed(3)); });
  }
  function askMotion() {
    if (gyroOK || REDUCED || !('DeviceOrientationEvent' in window)) return;
    var go = function () { gyroOK = true; window.addEventListener('deviceorientation', onGyro); };
    if (typeof DeviceOrientationEvent.requestPermission === 'function') DeviceOrientationEvent.requestPermission().then(function (s) { if (s === 'granted') go(); }).catch(function () {}); else go();
  }

  /* ======================= events ======================= */
  var ACTS = {
    pick: function (el) { setActive(el.dataset.id); },
    till: function (el) { openTill(byId(el.dataset.id)); },
    log: function (el) { openLog(byId(el.dataset.id)); },
    confirm: function (el) { var c = byId(el.dataset.id); if (S.view !== 'wallet') nav('wallet'); S.active = c.id; openConfirm(c); },
    hist: function (el) { histId = el.dataset.id; renderHist(); openD('#d-hist'); },
    edit: function (el) { openCardForm(byId(el.dataset.id)); },
    del: async function (el) { var c = byId(el.dataset.id); if (await ask('Delete ' + c.retailer + '?', 'The card, its balance and its history are removed from this device. Save a backup first if you may want it back.')) { var snap = S.cards.slice(); S.cards = S.cards.filter(function (x) { return x.id !== c.id; }); S.active = null; if (save()) toast(c.retailer + ' deleted.', 'Undo', function () { S.cards = snap; save(); }); } },
    'add-menu': function () { openD('#d-menu'); },
    'add-card': function (el) { closeD('#d-menu'); openCardForm(null, { retailer: el.dataset.retailer || '' }); },
    'scan-new': function () { closeD('#d-menu'); openScanner(function (v, f) { openCardForm(null, { number: v, format: f }); }); },
    'scan-into': function () { openScanner(function (v, f) { $('#c-number').value = v; $('#c-format').value = f; formatHint(); }); },
    slip: function () { closeD('#d-menu'); openSlip('', null); },
    'slip-from-confirm': function () { var id = confCard && confCard.id; closeD('#d-confirm'); openSlip('', id); },
    'slip-read': readSlip, 'slip-apply': applySlip,
    'slip-paste': function () { if (!navigator.clipboard || !navigator.clipboard.readText) return toast('Your browser won’t let Retail Key read the clipboard. Long-press the box and paste.'); navigator.clipboard.readText().then(function (t) { $('#sl-text').value = t; readSlip(); }).catch(function () { toast('Paste blocked. Long-press the box and choose Paste.'); }); },
    'rm-entry': function (el) { removeEntry(el.dataset.eid); },
    install: function () { if (!installEvt) return; installEvt.prompt(); installEvt.userChoice.finally(function () { installEvt = null; renderSettings(); }); },
    export: exportJSON, 'export-csv': exportCSV,
    wipe: async function () { if (await ask('Delete everything?', 'All cards, balances and history on this device are removed. This can’t be undone.', 'Delete everything')) { S.cards = []; S.active = null; shown = {}; try { localStorage.removeItem(KEY); localStorage.removeItem(OLD); } catch (e) {} render(); toast('Everything deleted.'); } }
  };
  document.addEventListener('click', function (e) {
    var cl = e.target.closest('[data-close]'); if (cl) { var d = cl.closest('dialog'); if (d) d.close(); return; }
    var nv = e.target.closest('[data-nav]'); if (nv) return nav(nv.dataset.nav);
    var a = e.target.closest('[data-act]'); if (a && ACTS[a.dataset.act]) ACTS[a.dataset.act](a);
  });
  $$('dialog.sheet').forEach(function (d) { d.addEventListener('click', function (e) { if (e.target === d) d.close(); }); });
  $('#f-card').addEventListener('submit', submitCard);
  $('#f-log').addEventListener('submit', submitLog);
  $('#f-confirm').addEventListener('submit', submitConfirm);
  $('#c-kind').addEventListener('change', kindGroups);
  $('#c-number').addEventListener('input', formatHint); $('#c-format').addEventListener('change', formatHint);
  $('#l-type').addEventListener('change', function () { amtTouched = false; $('#l-amt').value = logType() === 'earn' && logCard.kind === 'stamps' ? '1' : ''; logRefresh(); logAuto(); });
  $('#l-spend').addEventListener('input', logAuto);
  $('#l-amt').addEventListener('input', function () { amtTouched = true; warned = false; logRefresh(); });
  $('#s-use').addEventListener('click', function () { var v = $('#s-manual').value.trim(); if (!v) return $('#s-status').textContent = 'Type the number first.'; scanDone({ rawValue: v, format: 'auto' }); });
  $('#s-file').addEventListener('change', async function (e) {
    var f = e.target.files[0]; if (!f) return; var st = $('#s-status');
    if (!detector) detector = await makeDetector(); if (!detector) { st.textContent = 'This browser can’t read barcodes from photos. Type the number instead.'; return; }
    try { var bmp = await createImageBitmap(f), r = await detector.detect(bmp); if (r.length) scanDone(r[0]); else st.textContent = 'No barcode found in that photo. Try again closer, or type the number.'; } catch (x) { st.textContent = 'That photo couldn’t be read. Type the number instead.'; }
    e.target.value = '';
  });
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; if (S.view === 'settings') renderSettings(); });
  window.addEventListener('appinstalled', function () { installEvt = null; toast('Retail Key installed.'); if (S.view === 'settings') renderSettings(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return; render();
    if ($('#d-till').open && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { wake = l; }).catch(function () {});
  });

  /* ======================= boot ======================= */
  load(); paintBackdrop(); render();
  var q = new URLSearchParams(location.search), act = q.get('a'), shared = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n');
  if (shared) setTimeout(function () { openSlip(shared, null); }, 250); else if (act === 'slip') setTimeout(function () { openSlip('', null); }, 250); else if (act === 'add') setTimeout(function () { openCardForm(null); }, 250);
  if (location.search) history.replaceState(null, '', location.pathname);
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('service-worker.js').catch(function () {});
  window.RK = { state: S, engine: E, codes: C };
})();
