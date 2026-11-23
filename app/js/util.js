/* BristonPlay LG — utilitários (ES5: roda nas TVs LG antigas, webOS 3+) */
var U = (function () {
  "use strict";

  // ---------------------------------------------------------------- SHA-256
  function sha256Bytes(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var maxWord = Math.pow(2, 32), i, j, result = [];
    var words = [], asciiBitLength = ascii.length * 8;
    var hash = [], k = [], primeCounter = 0, isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    hash = hash.slice(0, 8);
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength);
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) result.push((hash[i] >> (j * 8)) & 255);
    return result;
  }
  function utf8(s) { return unescape(encodeURIComponent(s)); }
  function sha256(s) { return sha256Bytes(utf8(s)); }

  // ---------------------------------------------------------------- storage
  function get(k, def) {
    try { var v = localStorage.getItem("bp." + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  }
  function set(k, v) { try { localStorage.setItem("bp." + k, JSON.stringify(v)); } catch (e) { /* cheio */ } }

  // ---------------------------------------------------------------- HTTP
  function http(opts) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(opts.method || "GET", opts.url, true);
      if (opts.timeout) x.timeout = opts.timeout;
      var h = opts.headers || {};
      for (var k in h) if (h.hasOwnProperty(k)) x.setRequestHeader(k, h[k]);
      if (opts.onProgress) x.onprogress = function (ev) { opts.onProgress(ev.loaded, ev.lengthComputable ? ev.total : 0); };
      x.onload = function () { resolve({ status: x.status, text: x.responseText }); };
      x.onerror = function () { reject(new Error("network")); };
      x.ontimeout = function () { reject(new Error("timeout")); };
      x.send(opts.body || null);
    });
  }

  // ---------------------------------------------------------------- texto
  var accents = /[̀-ͯ]/g;
  function norm(s) {
    if (!s) return "";
    s = String(s);
    try { s = s.normalize("NFD").replace(accents, ""); } catch (e) { /* TVs sem normalize */ }
    return s.toLowerCase().replace(/^\s+|\s+$/g, "");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = "0" + n; return n; }
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
  }
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h > 0 ? h + ":" + pad(m) : pad(m)) + ":" + pad(s);
  }

  // ---------------------------------------------------------------- DOM
  function $(sel, root) { return (root || document).querySelector(sel); }
  function h(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }

  return {
    sha256: sha256, get: get, set: set, http: http, norm: norm, esc: esc, pad: pad,
    fmtDate: fmtDate, fmtTime: fmtTime, $: $, h: h, clear: clear,
  };
})();
