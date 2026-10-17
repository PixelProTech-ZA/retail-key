/* Retail Key — offline barcode + QR encoders (no dependencies).
   Formats: code128, ean13, ean8, code39, qr.  RKCodes.render(value, format) -> {ok, svg, format, note}
   Written from the public symbology specs; verified against a reference decoder in the test suite. */
(function (root) {
  'use strict';

  /* ---------- Code 128 ---------- */
  var C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ');
  var START_B = 104, START_C = 105, CODE_B = 100, CODE_C = 99, STOP = 106;

  function code128Values(s) {
    var i, v = [], sum, digits = /^\d+$/.test(s);
    for (i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (c < 32 || c > 126) return null; }
    if (digits && s.length >= 2) {
      if (s.length % 2 === 0) { v.push(START_C); for (i = 0; i < s.length; i += 2) v.push(+s.substr(i, 2)); }
      else { v.push(START_B, s.charCodeAt(0) - 32, CODE_C); for (i = 1; i < s.length; i += 2) v.push(+s.substr(i, 2)); }
    } else {
      v.push(START_B); for (i = 0; i < s.length; i++) v.push(s.charCodeAt(i) - 32);
    }
    sum = v[0]; for (i = 1; i < v.length; i++) sum += v[i] * i;
    v.push(sum % 103, STOP);
    return v;
  }
  function code128(s) {
    var v = code128Values(s); if (!v) return null;
    var out = [], bar = true;
    v.forEach(function (val) { C128[val].split('').forEach(function (w) { out.push([bar, +w]); bar = !bar; }); bar = true; });
    return out;
  }

  /* ---------- EAN / UPC ---------- */
  var L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  function inv(b) { return b.replace(/[01]/g, function (x) { return x === '0' ? '1' : '0'; }); }
  var R = L.map(inv), G = R.map(function (b) { return b.split('').reverse().join(''); });
  var PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  function eanCheck(d) { var s = 0, n = d.length; for (var i = 0; i < n; i++) s += +d[n - 1 - i] * (i % 2 === 0 ? 3 : 1); return (10 - s % 10) % 10; }
  function bitsToRuns(bits) {
    var out = [], cur = bits[0], n = 0;
    for (var i = 0; i < bits.length; i++) { if (bits[i] === cur) n++; else { out.push([cur === '1', n]); cur = bits[i]; n = 1; } }
    out.push([cur === '1', n]); return out;
  }
  function ean13(s) {
    if (s.length === 12) s = '0' + s;
    if (!/^\d{13}$/.test(s) || eanCheck(s.slice(0, 12)) !== +s[12]) return null;
    var p = PAR[+s[0]], bits = '101';
    for (var i = 0; i < 6; i++) bits += (p[i] === 'L' ? L : G)[+s[i + 1]];
    bits += '01010';
    for (i = 7; i < 13; i++) bits += R[+s[i]];
    return bitsToRuns(bits + '101');
  }
  function ean8(s) {
    if (!/^\d{8}$/.test(s) || eanCheck(s.slice(0, 7)) !== +s[7]) return null;
    var bits = '101', i;
    for (i = 0; i < 4; i++) bits += L[+s[i]];
    bits += '01010';
    for (i = 4; i < 8; i++) bits += R[+s[i]];
    return bitsToRuns(bits + '101');
  }

  /* ---------- Code 39 ---------- */
  var C39 = { '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn', K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn', U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn', '$': 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn' };
  function code39(s) {
    s = s.toUpperCase();
    if (!/^[0-9A-Z\-. $\/+%]+$/.test(s)) return null;
    var out = [], full = '*' + s + '*';
    for (var i = 0; i < full.length; i++) {
      var p = C39[full[i]], bar = true;
      for (var j = 0; j < 9; j++) { out.push([bar, p[j] === 'w' ? 3 : 1]); bar = !bar; }
      if (i < full.length - 1) out.push([false, 1]);
    }
    return out;
  }

  /* ---------- QR (byte mode, ECC level M, versions 1-6) ---------- */
  // [data codewords per block, ec codewords per block, blocks]
  var QRV = [null, [16, 10, 1], [28, 16, 1], [44, 26, 1], [32, 18, 2], [43, 24, 2], [27, 16, 4]];
  var QRCAP = [0, 14, 26, 42, 62, 84, 106];
  function gfMul(a, b) { var r = 0; for (var i = 7; i >= 0; i--) { r = (r << 1) ^ ((r >>> 7) * 0x11D); r ^= ((b >>> i) & 1) * a; } return r & 255; }
  function rsDivisor(deg) {
    var r = [], i, j, root = 1; for (i = 0; i < deg - 1; i++) r.push(0); r.push(1);
    for (i = 0; i < deg; i++) { for (j = 0; j < deg; j++) { r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = gfMul(root, 2); }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) { var f = b ^ r.shift(); r.push(0); div.forEach(function (c, i) { r[i] ^= gfMul(c, f); }); });
    return r;
  }
  function qr(text) {
    var bytes = Array.prototype.slice.call(new TextEncoder().encode(text)), ver = 0, i;
    for (i = 1; i <= 6; i++) if (bytes.length <= QRCAP[i]) { ver = i; break; }
    if (!ver) return null;
    var info = QRV[ver], dcw = info[0] * info[2], bits = [];
    function put(val, len) { for (var k = len - 1; k >= 0; k--) bits.push((val >>> k) & 1); }
    put(4, 4); put(bytes.length, 8); bytes.forEach(function (b) { put(b, 8); });
    var cap = dcw * 8; put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = []; for (i = 0; i < bits.length; i += 8) { var byte = 0; for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[i + k]; data.push(byte); }
    var div = rsDivisor(info[1]), blocks = [], ecs = [];
    for (i = 0; i < info[2]; i++) { var blk = data.slice(i * info[0], (i + 1) * info[0]); blocks.push(blk); ecs.push(rsRemainder(blk, div)); }
    var all = [], j;
    for (i = 0; i < info[0]; i++) for (j = 0; j < blocks.length; j++) all.push(blocks[j][i]);
    for (i = 0; i < info[1]; i++) for (j = 0; j < ecs.length; j++) all.push(ecs[j][i]);

    var size = ver * 4 + 17, m = [], fn = [], y, x;
    for (y = 0; y < size; y++) { m.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function setF(px, py, d) { if (px >= 0 && py >= 0 && px < size && py < size) { m[py][px] = d; fn[py][px] = true; } }
    for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) { var d = Math.max(Math.abs(dx), Math.abs(dy)); setF(c[0] + dx, c[1] + dy, d !== 2 && d !== 4); }
    });
    if (ver >= 2) { var ap = size - 7; for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) setF(ap + ax, ap + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1); }
    function formatBits(mask) {
      var d = (0 << 3) | mask, rem = d; for (var q = 0; q < 10; q++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var b = ((d << 10) | rem) ^ 0x5412; function gb(n) { return ((b >>> n) & 1) === 1; }
      for (var a = 0; a <= 5; a++) setF(8, a, gb(a));
      setF(8, 7, gb(6)); setF(8, 8, gb(7)); setF(7, 8, gb(8));
      for (a = 9; a < 15; a++) setF(14 - a, 8, gb(a));
      for (a = 0; a < 8; a++) setF(size - 1 - a, 8, gb(a));
      for (a = 8; a < 15; a++) setF(8, size - 15 + a, gb(a));
      setF(8, size - 8, true);
    }
    formatBits(0);
    var n = 0, right, vert, jj;
    for (right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (vert = 0; vert < size; vert++) for (jj = 0; jj < 2; jj++) {
        x = right - jj; var up = ((right + 1) & 2) === 0; y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && n < all.length * 8) { m[y][x] = ((all[n >>> 3] >>> (7 - (n & 7))) & 1) === 1; n++; }
      }
    }
    var MASKS = [
      function (x, y) { return (x + y) % 2 === 0; }, function (x, y) { return y % 2 === 0; },
      function (x, y) { return x % 3 === 0; }, function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
      function (x, y) { return x * y % 2 + x * y % 3 === 0; },
      function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
      function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }];
    function penalty() {
      var p = 0, dark = 0, a, b, run, prev;
      for (a = 0; a < size; a++) {
        [0, 1].forEach(function (dir) {
          run = 0; prev = null;
          for (b = 0; b < size; b++) { var v = dir ? m[b][a] : m[a][b]; if (v === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else { prev = v; run = 1; } }
        });
      }
      for (a = 0; a < size; a++) for (b = 0; b < size; b++) {
        if (m[a][b]) dark++;
        if (a < size - 1 && b < size - 1 && m[a][b] === m[a][b + 1] && m[a][b] === m[a + 1][b] && m[a][b] === m[a + 1][b + 1]) p += 3;
      }
      p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return p;
    }
    function applyMask(k) { for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) if (!fn[yy][xx] && MASKS[k](xx, yy)) m[yy][xx] = !m[yy][xx]; }
    var best = 0, bestP = 1e9;
    for (var k2 = 0; k2 < 8; k2++) { applyMask(k2); formatBits(k2); var pp = penalty(); if (pp < bestP) { bestP = pp; best = k2; } applyMask(k2); }
    applyMask(best); formatBits(best);
    return { size: size, modules: m };
  }

  /* ---------- SVG output ---------- */
  function linearSvg(runs, quiet, height) {
    var total = 0, x = quiet, rects = '';
    runs.forEach(function (r) { total += r[1]; });
    runs.forEach(function (r) { if (r[0]) rects += '<rect x="' + x + '" y="0" width="' + r[1] + '" height="' + height + '"/>'; x += r[1]; });
    var w = total + quiet * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + height + '" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000">' + rects + '</svg>';
  }
  function qrSvg(q) {
    var quiet = 4, d = '';
    for (var y = 0; y < q.size; y++) { var x = 0; while (x < q.size) { if (q.modules[y][x]) { var s = x; while (x < q.size && q.modules[y][x]) x++; d += 'M' + (s + quiet) + ' ' + (y + quiet) + 'h' + (x - s) + 'v1h-' + (x - s) + 'z'; } else x++; } }
    var w = q.size + quiet * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + w + '" shape-rendering="crispEdges"><path fill="#000" d="' + d + '"/></svg>';
  }

  var LABELS = { code128: 'Code 128', ean13: 'EAN-13', ean8: 'EAN-8', code39: 'Code 39', qr: 'QR code' };
  function render(value, format) {
    value = String(value == null ? '' : value).trim();
    if (!value) return { ok: false, error: 'No number to draw.' };
    var f = format && format !== 'auto' ? format : null, note = '';
    if (f === 'upc_a' || f === 'upc_e') f = 'ean13';
    if (f === 'qr_code') f = 'qr';
    if (f === 'code_128') f = 'code128'; if (f === 'code_39') f = 'code39';
    if (f === 'ean_13') f = 'ean13'; if (f === 'ean_8') f = 'ean8';
    if (!f) f = 'code128';
    var order = [f].concat(['code128', 'qr'].filter(function (x) { return x !== f; })), k;
    for (k = 0; k < order.length; k++) {
      var fmt = order[k], runs = null, svg, aspect = 'linear';
      if (fmt === 'code128') runs = code128(value);
      else if (fmt === 'ean13') runs = ean13(value);
      else if (fmt === 'ean8') runs = ean8(value);
      else if (fmt === 'code39') runs = code39(value);
      else if (fmt === 'qr') { var q = qr(value); if (q) { svg = qrSvg(q); aspect = 'square'; } }
      if (runs) svg = linearSvg(runs, 10, 100);
      if (svg) {
        if (fmt !== f) note = LABELS[f] + ' can’t encode this number, so it is drawn as ' + LABELS[fmt] + '.';
        return { ok: true, svg: svg, format: fmt, label: LABELS[fmt], aspect: aspect, note: note };
      }
    }
    return { ok: false, error: 'This number can’t be drawn as a barcode. Use the number shown as text.' };
  }

  var api = { render: render, labels: LABELS, _code128Values: code128Values, _eanCheck: eanCheck };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RKCodes = api;
})(typeof self !== 'undefined' ? self : this);
