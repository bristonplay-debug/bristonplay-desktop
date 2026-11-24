/* BristonPlay LG — componentes de tela para controle remoto (listas, grades, diálogos, vídeo) */
var UI = (function () {
  "use strict";

  var K = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 461, ESC: 27, BKSP: 8,
    PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412,
    CHUP: 33, CHDOWN: 34, RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
  };
  function isBack(code, ev) {
    if (code === K.BACK || code === K.ESC) return true;
    if (code === K.BKSP) { var t = ev && ev.target; return !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")); }
    return false;
  }

  // ------------------------------------------------------------ Magic Remote (ponteiro)
  /** Sobe na árvore até achar um elemento com a classe (Element.closest não existe no webOS 3). */
  function up(el, cls, stop) {
    while (el && el !== stop) {
      if (el.className && (" " + el.className + " ").indexOf(" " + cls + " ") >= 0) return el;
      el = el.parentNode;
    }
    return null;
  }
  /** Liga passar o ponteiro (foca), clicar (OK) e a roda (rolar) num componente com itens data-i. */
  function pointer(comp, el, cls, onWheelKey) {
    el.addEventListener("mouseover", function (ev) {
      var it = up(ev.target, cls, el); if (!it) return;
      var i = parseInt(it.getAttribute("data-i"), 10); if (isNaN(i)) return;
      if (comp.o && comp.o.onPoint) comp.o.onPoint();
      if (i !== comp.idx || !comp.active) comp.pointTo(i);
    });
    el.addEventListener("click", function (ev) {
      var it = up(ev.target, cls, el); if (!it) return;
      var i = parseInt(it.getAttribute("data-i"), 10); if (isNaN(i)) return;
      if (comp.o && comp.o.onPoint) comp.o.onPoint();
      comp.pointTo(i);
      comp.key(K.ENTER);
    });
    if (onWheelKey) el.addEventListener("mousewheel", function (ev) {
      ev.preventDefault();
      comp.key(ev.wheelDelta < 0 ? onWheelKey[1] : onWheelKey[0]);
    });
  }

  // ------------------------------------------------------------ lista vertical
  /**
   * Lista com foco por índice. Só desenha as linhas visíveis (aguenta milhares de canais).
   * opts: el, rows, render(item, i) -> html, onMove(item, i), onEnter(item, i)
   */
  function VList(opts) {
    this.o = opts; this.el = opts.el; this.items = []; this.idx = 0; this.top = 0; this.active = false;
    this.el.className += " vlist";
    pointer(this, this.el, "row", [K.UP, K.DOWN]);
  }
  VList.prototype.pointTo = function (i) {
    if (i === this.idx) { this.draw(); return; }
    this.idx = i; this.draw();
    if (this.o.onMove) this.o.onMove(this.items[this.idx], this.idx);
  };
  VList.prototype.set = function (items, keepIdx) {
    this.items = items || [];
    if (!keepIdx) { this.idx = 0; this.top = 0; }
    this.clamp(); this.draw();
  };
  VList.prototype.clamp = function () {
    var n = this.items.length, r = this.o.rows;
    if (this.idx >= n) this.idx = Math.max(0, n - 1);
    if (this.idx < this.top) this.top = this.idx;
    if (this.idx >= this.top + r) this.top = this.idx - r + 1;
    if (this.top > Math.max(0, n - r)) this.top = Math.max(0, n - r);
    if (this.top < 0) this.top = 0;
  };
  VList.prototype.draw = function () {
    var html = "", end = Math.min(this.items.length, this.top + this.o.rows);
    for (var i = this.top; i < end; i++) {
      var cls = "row" + (i === this.idx ? (this.active ? " focus" : " cur") : "") + (this.o.isSel && this.o.isSel(this.items[i], i) ? " sel" : "");
      html += '<div class="' + cls + '" data-i="' + i + '">' + this.o.render(this.items[i], i) + "</div>";
    }
    if (!this.items.length && this.o.empty) html = '<div class="empty">' + this.o.empty + "</div>";
    this.el.innerHTML = html;
    if (this.o.scrollbar !== false && this.items.length > this.o.rows) {
      var bar = U.h("div", "sbar");
      var hpct = Math.max(6, (this.o.rows / this.items.length) * 100);
      bar.innerHTML = '<i style="height:' + hpct + "%;top:" + (this.top / this.items.length) * 100 + '%"></i>';
      this.el.appendChild(bar);
    }
  };
  VList.prototype.focus = function (on) { this.active = on; this.draw(); };
  VList.prototype.current = function () { return this.items[this.idx]; };
  VList.prototype.moveTo = function (i) {
    if (!this.items.length) return;
    this.idx = Math.max(0, Math.min(this.items.length - 1, i));
    this.clamp(); this.draw();
    if (this.o.onMove) this.o.onMove(this.items[this.idx], this.idx);
  };
  /** Devolve false quando a tecla deve sair da lista (borda). */
  VList.prototype.key = function (code) {
    var n = this.items.length;
    if (code === K.UP) { if (this.idx <= 0) return false; this.moveTo(this.idx - 1); return true; }
    if (code === K.DOWN) { if (this.idx >= n - 1) return n > 0; this.moveTo(this.idx + 1); return true; }
    if (code === K.CHUP) { this.moveTo(this.idx - this.o.rows); return true; }
    if (code === K.CHDOWN) { this.moveTo(this.idx + this.o.rows); return true; }
    if (code === K.ENTER) { if (n && this.o.onEnter) this.o.onEnter(this.items[this.idx], this.idx); return true; }
    return false;
  };

  // ------------------------------------------------------------ grade de capas
  function Grid(opts) {
    this.o = opts; this.el = opts.el; this.items = []; this.idx = 0; this.topRow = 0; this.active = false;
    this.el.className += " grid";
    pointer(this, this.el, "cell", null);
    var self = this;
    this.el.addEventListener("mousewheel", function (ev) {
      ev.preventDefault();
      var c = self.o.cols, n = self.items.length; if (!n) return;
      self.idx = ev.wheelDelta < 0 ? Math.min(n - 1, self.idx + c) : Math.max(0, self.idx - c);
      self.draw();
    });
  }
  Grid.prototype.pointTo = function (i) { this.idx = i; this.draw(); };
  Grid.prototype.set = function (items) { this.items = items || []; this.idx = 0; this.topRow = 0; this.draw(); };
  Grid.prototype.draw = function () {
    var c = this.o.cols, r = this.o.rows;
    var row = Math.floor(this.idx / c);
    if (row < this.topRow) this.topRow = row;
    if (row >= this.topRow + r) this.topRow = row - r + 1;
    var start = this.topRow * c, end = Math.min(this.items.length, start + c * r), html = "";
    for (var i = start; i < end; i++) {
      html += '<div class="cell' + (i === this.idx && this.active ? " focus" : "") + '" data-i="' + i + '">' + this.o.render(this.items[i], i) + "</div>";
    }
    if (!this.items.length && this.o.empty) html = '<div class="empty">' + this.o.empty + "</div>";
    this.el.innerHTML = html;
    if (this.o.counter && this.items.length) {
      var cnt = U.h("div", "gcounter", (this.idx + 1) + " / " + this.items.length);
      this.el.appendChild(cnt);
    }
  };
  Grid.prototype.focus = function (on) { this.active = on; this.draw(); };
  Grid.prototype.current = function () { return this.items[this.idx]; };
  Grid.prototype.key = function (code) {
    var c = this.o.cols, n = this.items.length, col = this.idx % c;
    if (!n) return false;
    if (code === K.LEFT) { if (col === 0) return false; this.idx--; this.draw(); return true; }
    if (code === K.RIGHT) { if (col === c - 1 || this.idx >= n - 1) return true; this.idx++; this.draw(); return true; }
    if (code === K.UP) { if (this.idx < c) return false; this.idx -= c; this.draw(); return true; }
    if (code === K.DOWN) { if (this.idx + c < n) this.idx += c; else if (Math.floor(this.idx / c) < Math.floor((n - 1) / c)) this.idx = n - 1; this.draw(); return true; }
    if (code === K.CHUP) { this.idx = Math.max(0, this.idx - c * this.o.rows); this.draw(); return true; }
    if (code === K.CHDOWN) { this.idx = Math.min(n - 1, this.idx + c * this.o.rows); this.draw(); return true; }
    if (code === K.ENTER) { if (this.o.onEnter) this.o.onEnter(this.items[this.idx], this.idx); return true; }
    return false;
  };

  // ------------------------------------------------------------ fileira de botões
  function Buttons(el, labels, onEnter) {
    this.el = el; this.labels = labels; this.idx = 0; this.active = false; this.onEnter = onEnter; this.o = {};
    pointer(this, el, "btn", null);
    this.draw();
  }
  Buttons.prototype.pointTo = function (i) { this.idx = i; this.active = true; this.draw(); };
  Buttons.prototype.draw = function () {
    var html = "";
    for (var i = 0; i < this.labels.length; i++) {
      html += '<div class="btn' + (i === this.idx && this.active ? " focus" : "") + '" data-i="' + i + '">' + this.labels[i] + "</div>";
    }
    this.el.innerHTML = html;
  };
  Buttons.prototype.focus = function (on) { this.active = on; this.draw(); };
  Buttons.prototype.key = function (code) {
    if (code === K.LEFT) { if (this.idx === 0) return false; this.idx--; this.draw(); return true; }
    if (code === K.RIGHT) { if (this.idx >= this.labels.length - 1) return false; this.idx++; this.draw(); return true; }
    if (code === K.ENTER) { this.onEnter(this.idx); return true; }
    return false;
  };

  // ------------------------------------------------------------ pilha de telas
  var stack = [];
  var root;
  function push(screen) {
    var top = stack[stack.length - 1];
    if (top && top.onHide) top.onHide();
    stack.push(screen);
    root.appendChild(screen.el);
    if (screen.onShow) screen.onShow();
  }
  function pop() {
    var s = stack.pop();
    if (!s) return;
    if (s.onHide) s.onHide();
    if (s.destroy) s.destroy();
    if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    var top = stack[stack.length - 1];
    if (top && top.onShow) top.onShow();
  }
  function replaceAll(screen) {
    while (stack.length) {
      var s = stack.pop();
      if (s.onHide) s.onHide();
      if (s.destroy) s.destroy();
      if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    }
    push(screen);
  }
  function top() { return stack[stack.length - 1]; }

  // ------------------------------------------------------------ diálogos
  function confirmDialog(title, msg, okLabel, cancelLabel, onOk) {
    var el = U.h("div", "screen dialog-bg");
    el.innerHTML = '<div class="dialog"><h2>' + U.esc(title) + "</h2><p>" + U.esc(msg) + '</p><div class="btns"></div></div>';
    var b = new Buttons(el.querySelector(".btns"), [okLabel, cancelLabel], function (i) { pop(); if (i === 0) onOk(); });
    b.idx = 1; b.focus(true);
    push({ el: el, onKey: function (code, ev) { if (isBack(code, ev)) { pop(); return true; } return b.key(code) || true; } });
  }

  /** Campo de texto: a TV LG abre o teclado virtual dela quando o campo recebe foco. */
  function inputDialog(title, hint, initial, type, onOk) {
    var el = U.h("div", "screen dialog-bg");
    el.innerHTML = '<div class="dialog"><h2>' + U.esc(title) + "</h2><p>" + U.esc(hint) + '</p><input class="field" type="' + (type || "text") +
      '" autocomplete="off"/><div class="btns"></div></div>';
    var input = el.querySelector("input");
    input.value = initial || "";
    var zone = "input";
    var b = new Buttons(el.querySelector(".btns"), ["Confirmar", "Cancelar"], function (i) {
      var v = input.value; pop(); if (i === 0) onOk(v);
    });
    b.o.onPoint = function () { if (zone !== "btns") setZone("btns"); };
    input.addEventListener("click", function () { if (zone !== "input") setZone("input"); });
    function setZone(z) {
      zone = z;
      if (z === "input") { input.className = "field focus"; b.focus(false); setTimeout(function () { input.focus(); }, 30); }
      else { input.className = "field"; input.blur(); b.focus(true); }
    }
    push({
      el: el,
      onShow: function () { setZone("input"); },
      onKey: function (code, ev) {
        if (isBack(code, ev)) { pop(); return true; }
        if (zone === "input") {
          if (code === K.ENTER) { var v = input.value; pop(); onOk(v); return true; }
          if (code === K.DOWN) { setZone("btns"); return true; }
          return false; // deixa o campo receber as teclas
        }
        if (code === K.UP) { setZone("input"); return true; }
        return b.key(code) || true;
      },
    });
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById("toast");
    t.innerHTML = U.esc(msg); t.className = "show";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ""; }, 3500);
  }

  // ------------------------------------------------------------ vídeo (um só elemento)
  var Video = {
    el: null, url: null, mode: "off", onEnded: null, onError: null,
    init: function () {
      var v = this.el = document.getElementById("video");
      var self = this;
      // player do YouTube (página do servidor com o player oficial embutido)
      var f = this.yf = document.createElement("iframe");
      f.id = "ytframe"; f.setAttribute("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture"); f.setAttribute("allowfullscreen", "");
      f.setAttribute("frameborder", "0"); f.style.cssText = "position:absolute;z-index:5;border:0;background:#000;display:none";
      v.parentNode.insertBefore(f, v.nextSibling);
      this.yt = false;
      v.addEventListener("ended", function () { if (self.onEnded) self.onEnded(); });
      v.addEventListener("error", function () { if (!self.url || self.yt) return; if (self.eng) { if (self.onError) self.onError(); return; } self.fail(); });
    },
    eng: null,
    /** Escolhe o motor: .m3u8 = hls.js, mp4/mkv/etc = nativo, resto (canais .ts / sem extensão) = mpegts.js */
    kind: function (url) {
      var p = String(url).split("?")[0].toLowerCase();
      if (/\.youtube$/.test(p)) return "yt";
      if (/\.m3u8$/.test(p)) return window.Hls && window.Hls.isSupported() ? "hls" : "native";
      if (/\.(mp4|m4v|mkv|webm|mov|avi|mp3|aac)$/.test(p)) return "native";
      return window.mpegts && window.mpegts.isSupported() ? "ts" : "native";
    },
    killEngine: function () {
      if (this.yt) { this.yt = false; try { this.yf.src = "about:blank"; } catch (x) { /* */ } this.yf.style.display = "none"; }
      var e = this.eng; this.eng = null;
      if (!e) return;
      try { if (e.destroy) e.destroy(); } catch (x) { /* */ }
      try { if (e.unload) e.unload(); if (e.detachMediaElement) e.detachMediaElement(); } catch (x) { /* */ }
    },
    /** Se o formato não abrir, tenta sozinho o outro leitor (HLS <-> TS/arquivo) antes de mostrar erro */
    fail: function () {
      if (!this.alt && this.url && !this.yt) {
        this.alt = true;
        var url = this.url, v = this.el, cur = this.cur;
        this.killEngine();
        try { v.removeAttribute("src"); v.load(); } catch (x) { /* */ }
        var self = this;
        if (cur !== "hls" && window.Hls && window.Hls.isSupported()) {
          this.cur = "hls";
          var hls = this.eng = new window.Hls({ enableWorker: true });
          hls.on(window.Hls.Events.ERROR, function (ev, d) { if (d && d.fatal) self.fail(); });
          hls.loadSource(url); hls.attachMedia(v);
        } else if (cur === "hls" && window.mpegts && window.mpegts.isSupported()) {
          this.cur = "ts";
          var pl = this.eng = window.mpegts.createPlayer({ type: "mpegts", isLive: true, url: url }, { enableWorker: true });
          pl.on(window.mpegts.Events.ERROR, function () { self.fail(); });
          pl.attachMediaElement(v); pl.load();
        } else { if (this.onError) this.onError(); return; }
        var p = v.play(); if (p && p.catch) p.catch(function () { /* */ });
        return;
      }
      if (this.onError) this.onError();
    },
    play: function (url, startSec) {
      var v = this.el, self = this;
      if (this.url !== url) {
        this.url = url;
        this.killEngine();
        var k = this.kind(url);
        this.alt = false; this.cur = k;
        if (k === "yt") {
          try { v.pause(); v.removeAttribute("src"); v.load(); } catch (x) { /* */ }
          this.yt = true; this.yf.src = url; this.syncYt();
          return;
        }
        if (k === "hls") {
          var hls = this.eng = new window.Hls({ enableWorker: true, lowLatencyMode: false });
          hls.on(window.Hls.Events.ERROR, function (ev, d) {
            if (!d || !d.fatal) return;
            if (d.type === window.Hls.ErrorTypes.MEDIA_ERROR) { try { hls.recoverMediaError(); return; } catch (x) { /* */ } }
            self.fail();
          });
          hls.loadSource(url); hls.attachMedia(v);
        } else if (k === "ts") {
          var pl = this.eng = window.mpegts.createPlayer({ type: "mpegts", isLive: true, url: url },
            { enableWorker: true, liveBufferLatencyChasing: false, lazyLoad: false });
          pl.on(window.mpegts.Events.ERROR, function () { self.fail(); });
          pl.attachMediaElement(v); pl.load();
        } else {
          v.src = url;
          try { v.load(); } catch (e) { /* */ }
        }
        if (startSec > 0) {
          var once = function () { v.removeEventListener("loadedmetadata", once); try { v.currentTime = startSec; } catch (e) { /* */ } };
          v.addEventListener("loadedmetadata", once);
        }
      }
      if (this.yt) return;
      var p = v.play(); if (p && p.catch) p.catch(function () { /* autoplay */ });
    },
    /** Mostra o player do YouTube no mesmo lugar do vídeo */
    syncYt: function () {
      var v = this.el, f = this.yf;
      if (!this.yt || this.mode === "off") { f.style.display = "none"; return; }
      f.style.left = v.style.left; f.style.top = v.style.top; f.style.width = v.style.width; f.style.height = v.style.height;
      f.style.borderRadius = this.mode === "full" ? "0" : "16px";
      f.style.display = "block"; v.style.display = "none";
    },
    /** Envia uma tecla do controle para o player do YouTube (play/pausa, avançar, voltar) */
    ytKey: function (k) { try { this.yf.contentWindow.postMessage({ bpKey: k }, "*"); } catch (x) { /* */ } },
    stop: function () {
      var v = this.el; this.url = null;
      try { v.pause(); } catch (e) { /* */ }
      this.killEngine();
      v.removeAttribute("src");
      try { v.load(); } catch (e) { /* */ }
      this.place("off");
    },
    /** "off" | "full" | elemento (encaixa o vídeo na área desse elemento) */
    place: function (where) {
      var v = this.el;
      if (where === "off") { v.style.display = "none"; this.mode = "off"; this.syncYt(); return; }
      v.style.display = "block";
      if (where === "full") {
        v.style.left = "0px"; v.style.top = "0px"; v.style.width = "1920px"; v.style.height = "1080px";
        this.mode = "full"; v.className = "full";
      } else {
        var r = where.getBoundingClientRect(), sc = App.scale || 1;
        var s = document.getElementById("stage").getBoundingClientRect();
        v.style.left = Math.round((r.left - s.left) / sc) + "px"; v.style.top = Math.round((r.top - s.top) / sc) + "px";
        v.style.width = Math.round(r.width / sc) + "px"; v.style.height = Math.round(r.height / sc) + "px";
        this.mode = "box"; v.className = "box";
      }
      this.syncYt();
    },
  };

  function init(rootEl) { root = rootEl; Video.init(); }

  /** Botão "‹ Voltar" na tela, para quem usa o ponteiro do Magic Remote. */
  function backButton(el, onBack) {
    var b = U.h("div", "backbtn", "&#8249; Voltar");
    b.addEventListener("click", onBack);
    el.appendChild(b);
    return b;
  }

  return {
    K: K, isBack: isBack, up: up, backButton: backButton, VList: VList, Grid: Grid, Buttons: Buttons,
    push: push, pop: pop, replaceAll: replaceAll, top: top,
    confirmDialog: confirmDialog, inputDialog: inputDialog, toast: toast, Video: Video, init: init,
  };
})();
