/* BristonPlay LG — telas e fluxo do app */
var App = (function () {
  "use strict";

  var CFG = window.BP_CONFIG;
  var K = UI.K;
  var state = {
    id: null, res: null, cat: null, playlistUrl: null,
    adultUnlocked: false, checkTimer: null, pollTimer: null,
  };

  // ============================================================ marca
  function applyAccent(color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color || "")) color = CFG.defaultAccent;
    // rgba em vez de #RRGGBBAA: as TVs LG antigas não entendem cor com 8 dígitos
    var r = parseInt(color.substr(1, 2), 16), g = parseInt(color.substr(3, 2), 16), bl = parseInt(color.substr(5, 2), 16);
    function rgba(a) { return "rgba(" + r + "," + g + "," + bl + "," + a + ")"; }
    var css =
      ".row.focus,.cell.focus .card,.btn.focus,.tab.focus,.field.focus,.dbanner.focus,.dcard.focus,.dsc.focus{border-color:" + color + "!important;box-shadow:0 0 0 3px " + color + ",0 0 28px " + rgba(0.6) + "}" +
      ".tab.sel{background:" + color + "}.row.sel .num,.accent{color:" + color + "}" +
      ".btn.primary,.btn.focus{background:" + color + "}.dbadge{background:" + color + "}.bar i,.prog i{background:" + color + "}" +
      ".glow{background-color:#07070A;background-image:radial-gradient(ellipse at 10% 0%," + rgba(0.33) + ",rgba(0,0,0,0) 60%)}";
    var st = document.getElementById("accent-style");
    st.textContent = css;
  }
  function brand() { return (state.res && state.res.branding) || {}; }
  function brandName() { return brand().display_name || CFG.appName; }
  function logoHtml(cls) {
    var b = brand();
    var src = b.logo_url || "img/logo.png";
    return '<img class="' + (cls || "logo") + '" src="' + U.esc(src) + '" onerror="this.src=\'img/logo.png\'"/>';
  }

  // ============================================================ início
  function start() {
    applyAccent(CFG.defaultAccent);
    showSplash("Conectando…");
    Device.identity().then(function (id) {
      state.id = id;
      return Device.register(id);
    }).then(handleResponse).catch(function (e) { failure(e); });
  }

  function failure(e) {
    var msg = (e && e.code === "invalid_key")
      ? "A chave deste aparelho não confere. Fale com seu revendedor."
      : (e && e.code === "rate_limited") ? (e.message || "Muitas tentativas. Aguarde um pouco.")
      : "Sem conexão com o servidor. Verifique a internet do computador.";
    var el = U.h("div", "screen center glow");
    el.innerHTML = logoHtml("logo-big") + "<h1>Não foi possível conectar</h1><p class=\"dim\">" + U.esc(msg) + "</p>" +
      (state.id ? '<p class="faint">MAC: ' + state.id.mac + " · Chave: " + state.id.key + "</p>" : "") + '<div class="btns"></div>';
    var b = new UI.Buttons(el.querySelector(".btns"), ["Tentar novamente"], function () { start(); });
    b.focus(true);
    UI.replaceAll({ el: el, onKey: function (code, ev) { if (UI.isBack(code, ev)) { exitApp(); return true; } return b.key(code) || true; } });
  }

  function showSplash(text) {
    var el = U.h("div", "screen center glow");
    el.innerHTML = logoHtml("logo-big") + '<div class="spinner"></div><p class="dim">' + U.esc(text) + "</p>";
    UI.replaceAll({ el: el, onKey: function (code, ev) { if (UI.isBack(code, ev)) exitApp(); return true; } });
  }

  function handleResponse(res) {
    state.res = res;
    applyAccent(brand().accent_color);
    clearInterval(state.pollTimer); state.pollTimer = null;
    if (res.status === "active") {
      var url = res.playlist && res.playlist.m3u_url;
      if (!url) return statusScreen(res, "Sem lista configurada", "Seu revendedor ainda não colocou a lista M3U neste aparelho.");
      if (state.cat && state.playlistUrl === url) return; // já carregado
      loadPlaylist(url);
      scheduleCheck();
    } else {
      statusScreen(res);
    }
  }

  /** O servidor BristonPlay avisa quando o catálogo muda (/v.php): recarrega a lista sem reiniciar o app */
  function catalogVersion(url) {
    return new Promise(function (ok) {
      var m = /^(https?:\/\/[^\/]+)/i.exec(url || ""); if (!m) return ok(null);
      var x = new XMLHttpRequest(); x.open("GET", m[1] + "/v.php", true); x.timeout = 8000;
      x.onload = function () { try { var j = JSON.parse(x.responseText); ok(typeof j.v === "number" ? j.v : null); } catch (e) { ok(null); } };
      x.onerror = x.ontimeout = function () { ok(null); };
      try { x.send(); } catch (e) { ok(null); }
    });
  }
  function checkCatalog() {
    var url = state.playlistUrl; if (!url) return;
    catalogVersion(url).then(function (v) {
      if (v == null) return;
      if (state.catV == null) { state.catV = v; return; }
      if (v !== state.catV) { state.catV = v; UI.toast("Sua lista foi atualizada. Recarregando…"); loadPlaylist(url); }
    });
  }

  function scheduleCheck() {
    clearInterval(state.checkTimer);
    state.catV = null; setTimeout(checkCatalog, 5000);
    state.checkTimer = setInterval(function () {
      Device.check(state.id).then(function (res) {
        var was = state.res && state.res.status;
        state.res = res;
        if (res.status !== "active" || was !== "active") { state.cat = null; Video.stop(); handleResponse(res); }
        else if (res.playlist && res.playlist.m3u_url !== state.playlistUrl) { UI.toast("Sua lista foi atualizada. Recarregando…"); loadPlaylist(res.playlist.m3u_url); }
        else checkCatalog();
      }).catch(function () { /* sem internet: tenta de novo depois */ });
    }, 10 * 60 * 1000);
  }

  // ============================================================ ativação / vencido / bloqueado
  function statusScreen(res, forceTitle, forceMsg) {
    var b = brand();
    var titles = {
      pending: ["Ative seu aparelho", "Envie a MAC para seu revendedor pelo WhatsApp"],
      expired: ["Seu acesso venceu", "Envie a MAC para seu revendedor pelo WhatsApp e renove seu acesso."],
      blocked: ["Acesso bloqueado", "Fale com seu revendedor."],
      reseller_expired: ["Serviço temporariamente indisponível", "Fale com seu revendedor."],
    };
    var t = titles[res.status] || ["Aguardando liberação", "Fale com seu revendedor."];
    var title = forceTitle || t[0], msg = forceMsg || t[1];
    var pending = res.status === "pending";
    var qr = b.qr_image_url || (b.whatsapp_link ? "https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=0&data=" + encodeURIComponent(b.whatsapp_link) : "");

    var el = U.h("div", "screen status glow");
    el.innerHTML =
      '<div class="st-left">' +
      '<div class="brandrow">' + logoHtml("logo-sm") + '<div><div class="bname">' + U.esc(brandName()) + '</div><div class="dim">' + U.esc(b.slogan || "") + "</div></div></div>" +
      '<h1 class="' + (pending ? "" : "accent") + '">' + U.esc(title) + '</h1><p class="dim big">' + U.esc(msg) + "</p>" +
      '<div class="macbox"><div class="faint lbl">MAC DO APARELHO</div><div class="mac">' + state.id.mac + '</div>' +
      '<div class="keyrow"><span class="faint lbl">CHAVE:</span> <span class="key">' + state.id.key + "</span></div></div>" +
      '<div class="btns"></div><div class="feedback"></div>' +
      (pending ? '<p class="faint">Esta tela atualiza sozinha quando o revendedor liberar seu acesso.</p>' : "") +
      "</div>" +
      '<div class="st-right">' + (qr
        ? '<div class="qr"><img src="' + U.esc(qr) + '"/></div><div class="qrtxt">Aponte a câmera do celular</div><div class="dim">para falar com seu revendedor</div>'
        : logoHtml("logo-big")) +
      (b.whatsapp ? '<div class="wa">WhatsApp: ' + U.esc(b.whatsapp) + "</div>" : "") + "</div>";

    var labels = pending ? ["Código do revendedor", "Verificar agora"] : ["Verificar novamente"];
    var fb = el.querySelector(".feedback");
    var btns = new UI.Buttons(el.querySelector(".btns"), labels, function (i) {
      if (pending && i === 0) {
        UI.inputDialog("Código do revendedor", "Digite o código que seu revendedor passou (ex.: BRISTON, JOAO10).", "", "text", function (code) {
          code = (code || "").replace(/\s/g, "");
          if (!code) return;
          fb.innerHTML = "Enviando…";
          Device.register(state.id, code).then(function (r) {
            fb.innerHTML = r.reseller_code_valid ? '<span class="ok">Código aceito! Agora é só aguardar a liberação.</span>' : '<span class="accent">Código não encontrado. Confira com seu revendedor.</span>';
            state.res = r; applyAccent(brand().accent_color);
            if (r.status !== "pending" || r.reseller_code_valid) handleResponse(r);
          }).catch(function (e) { fb.innerHTML = '<span class="accent">' + U.esc(e.message) + "</span>"; });
        });
      } else {
        fb.innerHTML = "Verificando…";
        Device.check(state.id).then(function (r) { fb.innerHTML = ""; handleResponse(r); }).catch(function () { fb.innerHTML = '<span class="accent">Sem conexão. Tente de novo.</span>'; });
      }
    });
    btns.focus(true);
    UI.replaceAll({ el: el, onKey: function (code, ev) { if (UI.isBack(code, ev)) { exitApp(); return true; } return btns.key(code) || true; } });

    // consulta sozinha a cada 15 s
    state.pollTimer = setInterval(function () {
      Device.check(state.id).then(function (r) { if (r.status !== res.status || r.status === "active") handleResponse(r); }).catch(function () { /* */ });
    }, 15000);
  }

  // ============================================================ carregar lista
  function loadPlaylist(url) {
    var el = U.h("div", "screen center glow");
    el.innerHTML = logoHtml("logo-big") + '<h1>Carregando conteúdo…</h1><div class="bar"><i></i></div><p class="dim info">Baixando sua lista, aguarde…</p>' +
      '<p class="faint">Listas grandes podem levar alguns minutos.</p>';
    var bar = el.querySelector(".bar i"), info = el.querySelector(".info");
    UI.replaceAll({ el: el, onKey: function (code, ev) { if (UI.isBack(code, ev)) exitApp(); return true; } });

    U.http({
      url: url, timeout: 180000,
      onProgress: function (loaded, total) {
        info.innerHTML = "Baixando… " + (loaded / 1048576).toFixed(1) + " MB";
        if (total) bar.style.width = Math.round((loaded / total) * 50) + "%";
      },
    }).then(function (r) {
      if (r.status < 200 || r.status >= 300 || r.text.indexOf("#EXT") < 0) throw new Error("Lista inválida ou fora do ar (HTTP " + r.status + ").");
      info.innerHTML = "Organizando canais, filmes e séries…";
      return M3U.parse(r.text, state.res.tabs, function (n, frac) {
        bar.style.width = (50 + Math.round(frac * 50)) + "%";
        info.innerHTML = n.toLocaleString("pt-BR") + " itens carregados";
      });
    }).then(function (cat) {
      state.cat = cat; state.playlistUrl = url;
      UI.replaceAll(new Home());
    }).catch(function (e) {
      var err = U.h("div", "screen center glow");
      err.innerHTML = logoHtml("logo-big") + "<h1>Não foi possível carregar a lista</h1><p class=\"dim\">" +
        U.esc(e && e.message === "network" ? "A lista não respondeu. Verifique a internet ou fale com seu revendedor." : (e && e.message) || "Erro desconhecido") +
        '</p><div class="btns"></div>';
      var b = new UI.Buttons(err.querySelector(".btns"), ["Tentar novamente"], function () { loadPlaylist(url); });
      b.focus(true);
      UI.replaceAll({ el: err, onKey: function (code, ev) { if (UI.isBack(code, ev)) { exitApp(); return true; } return b.key(code) || true; } });
    });
  }

  // ============================================================ favoritos e posição
  function favKey(it) { return it.t === "S" ? "S|" + it.k : it.t + "|" + it.u; }
  function favs() { return U.get("fav", []); }
  function isFav(it) { var k = favKey(it), f = favs(); for (var i = 0; i < f.length; i++) if (f[i].key === k) return true; return false; }
  function toggleFav(it) {
    var k = favKey(it), f = favs(), out = [], had = false;
    for (var i = 0; i < f.length; i++) { if (f[i].key === k) had = true; else out.push(f[i]); }
    if (!had) out.unshift({ key: k, t: it.t, n: it.n, u: it.u, l: it.l, k: it.k, g: it.g, num: it.num });
    U.set("fav", out.slice(0, 500));
    UI.toast(had ? "Removido dos favoritos" : "Adicionado aos favoritos");
    return !had;
  }
  /** Converte um favorito guardado no item atual da lista (se ainda existir). */
  function resolveFav(f) {
    var c = state.cat;
    if (f.t === "S") return c.seriesByKey[f.k] || null;
    var arr = f.t === "L" ? c.live : c.movies;
    for (var i = 0; i < arr.length; i++) if (arr[i].u === f.u) return arr[i];
    return null;
  }
  function getPos(url) { var p = U.get("pos", {}); return p[url] || 0; }
  function savePos(url, sec, dur) {
    var p = U.get("pos", {});
    if (!dur || sec < 30 || sec > dur - 60) delete p[url]; else p[url] = Math.floor(sec);
    var keys = Object.keys(p); if (keys.length > 300) delete p[keys[0]];
    U.set("pos", p);
  }

  // ============================================================ tela principal
  var TABS = [
    { id: "tv", label: "TV ao vivo" }, { id: "home", label: "Destaques" }, { id: "futebol", label: "&#9917; FUTEBOL" }, { id: "movies", label: "Filmes" }, { id: "series", label: "Séries" },
    { id: "kids", label: "Kids" }, { id: "anime", label: "Anime" }, { id: "fav", label: "Favoritos" },
    { id: "search", label: "Buscar" }, { id: "settings", label: "Ajustes" },
  ];

  function visibleGroups(kinds, tab) {
    var out = [], c = state.cat, hasAdult = false;
    for (var k = 0; k < kinds.length; k++) {
      var gs = c.groups[kinds[k]];
      for (var i = 0; i < gs.length; i++) {
        var g = gs[i];
        if (tab && g.tabs.indexOf(tab) < 0) continue;
        if (g.adult && !CFG.allowAdult) continue; // versão da loja LG: sem conteúdo adulto
        if (g.adult && !state.adultUnlocked) { hasAdult = true; continue; }
        out.push(g);
      }
    }
    return { groups: out, lockedAdult: hasAdult };
  }

  /** Procura uma pasta pelo nome (primeiro o nome exato, depois quem contém o nome) */
  function findGroup(names, kinds) {
    kinds = kinds || ["L", "M", "S"];
    var c = state.cat; if (!c) return null;
    for (var pass = 0; pass < 2; pass++) {
      for (var n = 0; n < names.length; n++) {
        var k = U.norm(names[n]); if (!k) continue;
        for (var j = 0; j < kinds.length; j++) {
          var gs = c.groups[kinds[j]];
          for (var i = 0; i < gs.length; i++) {
            var gn = U.norm(gs[i].name);
            if (pass === 0 ? gn === k : gn.indexOf(k) >= 0) {
              if (gs[i].adult && !CFG.allowAdult) continue;
              return gs[i];
            }
          }
        }
      }
    }
    return null;
  }

  function Home() {
    var self = this;
    var el = this.el = U.h("div", "screen home glow");
    el.innerHTML =
      '<div class="header">' + logoHtml("logo-hdr") + '<div class="tabs"></div><div class="hright"><div class="clock"></div><div class="faint exp"></div></div></div>' +
      '<div class="body"></div><div class="hint faint"></div>';
    this.tabsEl = el.querySelector(".tabs");
    this.body = el.querySelector(".body");
    this.hint = el.querySelector(".hint");
    this.tab = 0; this.zone = "tabs";
    // Kids e Anime só aparecem se a lista tiver pastas para elas (aba vazia confunde o usuário)
    this.tabs = TABS.filter(function (t) {
      if (t.id === "futebol") return !!findGroup(["FUTEBOL"]);
      return (t.id !== "kids" && t.id !== "anime") || visibleGroups(["M", "S"], t.id).groups.length > 0;
    });
    el.querySelector(".exp").innerHTML = state.res.expires_at ? "Válido até " + U.fmtDate(state.res.expires_at) : "";
    this.tickClock();
    this.clockTimer = setInterval(function () { self.tickClock(); }, 20000);
    this.drawTabs();
    // abre em Destaques, como no app Android
    this.openTab(this.indexOf("home"));
    // Magic Remote: clicar numa aba abre a aba
    this.tabsEl.addEventListener("click", function (ev) {
      var t = UI.up(ev.target, "tab", self.tabsEl); if (!t) return;
      var i = parseInt(t.getAttribute("data-i"), 10);
      self.zone = "tabs"; if (i !== self.tab) self.openTab(i); else self.setZone("tabs");
    });
  }
  Home.prototype.tickClock = function () {
    var d = new Date();
    this.el.querySelector(".clock").innerHTML = U.pad(d.getHours()) + ":" + U.pad(d.getMinutes());
  };
  Home.prototype.drawTabs = function () {
    var html = "";
    for (var i = 0; i < this.tabs.length; i++) {
      html += '<div class="tab' + (i === this.tab ? " sel" : "") + (i === this.tab && this.zone === "tabs" ? " focus" : "") + '" data-i="' + i + '">' + this.tabs[i].label + "</div>";
    }
    this.tabsEl.innerHTML = html;
  };
  Home.prototype.setZone = function (z) {
    this.zone = z;
    this.drawTabs();
    if (this.view && this.view.zone) this.view.zone(z);
  };
  Home.prototype.indexOf = function (id) {
    for (var i = 0; i < this.tabs.length; i++) if (this.tabs[i].id === id) return i;
    return 0;
  };
  /** Vai para uma aba pelo id e leva o foco para a barra de abas (usado pelos atalhos de Destaques). */
  Home.prototype.goTab = function (id) {
    var i = this.indexOf(id);
    this.zone = "tabs";
    this.openTab(i);
  };
  Home.prototype.openTab = function (i) {
    if (this.view && this.view.destroy) this.view.destroy();
    this.tab = i; this.drawTabs();
    U.clear(this.body);
    var id = this.tabs[i].id;
    if (id === "tv") this.view = new TvView(this);
    else if (id === "home") this.view = new DestaquesView(this);
    else if (id === "futebol") {
      var fg = findGroup(["FUTEBOL"]);
      if (fg && fg.kind === "L") this.view = new TvView(this, fg);
      else this.view = new VodView(this, ["M", "S"], null, "Futebol", fg);
    }
    else if (id === "movies") this.view = new VodView(this, ["M"], null, "Filmes");
    else if (id === "series") this.view = new VodView(this, ["S"], null, "Séries");
    else if (id === "kids") this.view = new VodView(this, ["M", "S"], "kids", "Kids");
    else if (id === "anime") this.view = new VodView(this, ["M", "S"], "anime", "Anime");
    else if (id === "fav") this.view = new FavView(this);
    else if (id === "search") this.view = new SearchView(this);
    else this.view = new SettingsView(this);
    this.view.zone(this.zone);
  };
  Home.prototype.onShow = function () { if (this.view && this.view.onShow) this.view.onShow(); };
  Home.prototype.onHide = function () { if (this.view && this.view.onHide) this.view.onHide(); };
  Home.prototype.destroy = function () { clearInterval(this.clockTimer); if (this.view && this.view.destroy) this.view.destroy(); };
  Home.prototype.onKey = function (code, ev) {
    if (this.zone === "tabs") {
      if (code === K.LEFT) { if (this.tab > 0) this.openTab(this.tab - 1); return true; }
      if (code === K.RIGHT) { if (this.tab < this.tabs.length - 1) this.openTab(this.tab + 1); return true; }
      if (code === K.DOWN || code === K.ENTER) { var z = this.view.firstZone(); if (z) this.setZone(z); return true; }
      if (UI.isBack(code, ev)) { UI.confirmDialog("Sair do app?", "Deseja realmente sair do " + brandName() + "?", "Sair", "Cancelar", exitApp); return true; }
      return true;
    }
    var r = this.view.key(code, ev);
    if (r === "pass") return false; // tecla de texto: deixa o campo de busca receber
    if (r) return true;
    if (UI.isBack(code, ev)) { this.setZone("tabs"); return true; }
    if (code === K.UP) { this.setZone("tabs"); return true; }
    return true;
  };

  // ------------------------------------------------------------ helpers de célula
  function cardHtml(it) {
    var sub = it.t === "S" ? (it.eps.length + " episódio" + (it.eps.length === 1 ? "" : "s")) : (it.t === "L" ? "Ao vivo" : (it.g || ""));
    var img = it.l ? '<img src="' + U.esc(it.l) + '" onerror="this.style.display=\'none\'"/>' : "";
    return '<div class="card"><div class="poster">' + img + '<div class="ph">' + U.esc(it.n.charAt(0)) + "</div></div>" +
      '<div class="ctitle">' + U.esc(it.n) + '</div><div class="csub faint">' + U.esc(sub) + "</div></div>";
  }
  function groupRow(g) {
    if (g.special) return '<span class="gname">' + g.label + '</span><span class="gcount faint">' + (g.count != null ? g.count : "") + "</span>";
    return '<span class="gname">' + U.esc(g.name) + '</span><span class="gcount faint">' + g.items.length + "</span>";
  }
  function openItem(it, list, idx) {
    if (it.t === "S") UI.push(new SeriesScreen(it));
    else if (it.t === "M") UI.push(new MovieScreen(it));
    else if (it.t === "L") UI.push(new PlayerScreen({ live: true, list: list || [it], idx: idx || 0 }));
  }
  function askAdultPin(onOk) {
    UI.inputDialog("Conteúdo protegido", "Digite o PIN parental (padrão 0000).", "", "password", function (v) {
      if (v === U.get("pin", "0000")) { state.adultUnlocked = true; UI.toast("Conteúdo adulto liberado até fechar o app."); onOk(); }
      else UI.toast("PIN incorreto.");
    });
  }

  // ------------------------------------------------------------ TV ao vivo
  function TvView(home, only) {
    var self = this;
    this.home = home; this.only = only || null;
    var b = home.body;
    b.innerHTML = '<div class="col groups"></div><div class="col channels"></div><div class="col preview"><div class="pbox"><div class="pmsg dim">Escolha um canal na lista</div><div class="live-tag">AO VIVO</div></div><div class="pinfo"></div></div>';
    this.pbox = b.querySelector(".pbox"); this.pinfo = b.querySelector(".pinfo"); this.pmsg = b.querySelector(".pmsg");
    this.glist = new UI.VList({
      el: b.querySelector(".groups"), rows: 13, render: groupRow,
      isSel: function (g) { return g === self.curGroup; },
      onMove: function (g) { self.selectGroup(g); },
      onEnter: function (g) { if (g.locked) askAdultPin(function () { self.reloadGroups(); }); else self.setZone("channels"); },
      onPoint: function () { if (home.zone !== "groups") home.setZone("groups"); },
    });
    this.clist = new UI.VList({
      onPoint: function () { if (home.zone !== "channels") home.setZone("channels"); },
      el: b.querySelector(".channels"), rows: 13, empty: "Nenhum canal",
      render: function (c) {
        return '<span class="num">' + U.pad(c.num, 3) + "</span>" + (c.l ? '<img class="clogo" src="' + U.esc(c.l) + '" onerror="this.style.visibility=\'hidden\'"/>' : '<span class="clogo"></span>') +
          '<span class="cname">' + U.esc(c.n) + "</span>" + (isFav(c) ? '<span class="star">★</span>' : "") + (UI.Video.url === c.u ? '<span class="playing accent">▶</span>' : "");
      },
      onMove: function () { self.schedulePreview(); },
      onEnter: function (c, i) {
        if (UI.Video.url === c.u) self.fullscreen();
        else self.preview(c);
      },
    });
    this.pbox.addEventListener("click", function () { if (UI.Video.url && self.playing) self.fullscreen(); });
    this.reloadGroups();
    this.hint = "Clique ou Enter: assistir · de novo: tela cheia · F: favoritar · Números: ir ao canal";
    home.hint.innerHTML = this.hint;
    this.digits = "";
  }
  TvView.prototype.reloadGroups = function () {
    if (this.only) { this.glist.set([this.only], true); this.selectGroup(this.only); return; }
    var v = visibleGroups(["L"]);
    var all = []; for (var i = 0; i < v.groups.length; i++) all = all.concat(v.groups[i].items);
    var favCh = favs().filter(function (f) { return f.t === "L"; }).map(resolveFav).filter(Boolean);
    var gs = [{ special: true, label: "Todos os canais", items: all, count: all.length }, { special: true, label: "★ Favoritos", items: favCh, count: favCh.length, fav: true }].concat(v.groups);
    if (v.lockedAdult) gs.push({ special: true, label: "🔒 Adultos", items: [], locked: true });
    this.glist.set(gs, true);
    this.selectGroup(this.glist.current());
  };
  TvView.prototype.selectGroup = function (g) {
    if (!g || g.locked) return;
    this.curGroup = g;
    this.clist.set(g.items);
    this.glist.draw();
  };
  TvView.prototype.firstZone = function () { return "groups"; };
  TvView.prototype.zone = function (z) {
    this.z = z;
    this.glist.focus(z === "groups"); this.clist.focus(z === "channels");
  };
  TvView.prototype.setZone = function (z) { this.home.setZone(z); };
  TvView.prototype.schedulePreview = function () {
    var self = this;
    clearTimeout(this.pt);
    this.pt = setTimeout(function () { var c = self.clist.current(); if (c && self.z === "channels") self.preview(c); }, 900);
  };
  TvView.prototype.preview = function (c) {
    this.playingList = this.clist.items; this.playing = c;
    this.pmsg.innerHTML = "Carregando…";
    var self = this;
    UI.Video.onError = function () {
      if (UI.top() !== self.home) return;
      var e = UI.Video.el.error;
      UI.Video.place("off");
      self.pmsg.innerHTML = "Canal indisponível agora" + '<div class="faint" style="font-size:22px">Código ' + (e ? e.code : 0) + "</div>";
    };
    UI.Video.place(this.pbox);
    UI.Video.play(c.u, 0);
    this.pinfo.innerHTML = '<div class="chbadge">' + U.pad(c.num, 3) + " " + U.esc(c.n) + '</div><div class="dim">' + U.esc(c.g) + "</div>";
    this.clist.draw();
  };
  TvView.prototype.fullscreen = function () {
    var list = this.clist.items, idx = this.clist.idx;
    UI.push(new PlayerScreen({ live: true, list: list, idx: idx, fromPreview: true }));
  };
  TvView.prototype.onShow = function () {
    // voltou da tela cheia: continua tocando na prévia
    if (UI.Video.url && this.playing) { UI.Video.place(this.pbox); this.clist.draw(); }
  };
  TvView.prototype.onHide = function () { clearTimeout(this.pt); };
  TvView.prototype.destroy = function () { clearTimeout(this.pt); UI.Video.stop(); };
  TvView.prototype.goNumber = function (n) {
    var all = state.cat.live;
    for (var i = 0; i < all.length; i++) {
      if (all[i].num === n) {
        this.glist.moveTo(0); this.selectGroup(this.glist.items[0]);
        this.clist.moveTo(i); this.home.setZone("channels"); this.preview(all[i]);
        return;
      }
    }
    UI.toast("Canal " + n + " não encontrado");
  };
  TvView.prototype.key = function (code, ev) {
    var self = this;
    if (code >= 48 && code <= 57) {
      this.digits += String(code - 48);
      UI.toast("Canal " + this.digits);
      clearTimeout(this.dt);
      this.dt = setTimeout(function () { var n = parseInt(self.digits, 10); self.digits = ""; if (n) self.goNumber(n); }, 1500);
      return true;
    }
    if (this.z === "groups") {
      if (code === K.RIGHT) { this.setZone("channels"); return true; }
      return this.glist.key(code);
    }
    if (this.z === "channels") {
      if (code === K.LEFT) { this.setZone("groups"); return true; }
      if (code === K.RED || code === K.YELLOW) { var c = this.clist.current(); if (c) { toggleFav(c); this.clist.draw(); } return true; }
      if (code === K.UP && this.clist.idx === 0) return false;
      return this.clist.key(code);
    }
    return false;
  };

  // ------------------------------------------------------------ Filmes / Séries / Kids / Anime
  function VodView(home, kinds, tab, title, only) {
    var self = this;
    this.home = home; this.kinds = kinds; this.tabId = tab; this.only = only || null;
    var b = home.body;
    b.innerHTML = '<div class="col groups"></div><div class="col content"></div>';
    this.glist = new UI.VList({
      el: b.querySelector(".groups"), rows: 13, render: groupRow,
      isSel: function (g) { return g === self.curGroup; },
      onMove: function (g) { self.selectGroup(g); },
      onEnter: function (g) { if (g.locked) askAdultPin(function () { self.reload(); }); else home.setZone("content"); },
      onPoint: function () { if (home.zone !== "groups") home.setZone("groups"); },
    });
    this.grid = new UI.Grid({
      el: b.querySelector(".content"), cols: 6, rows: 2, render: cardHtml, counter: true,
      empty: tab ? "Nada encontrado para " + title + ". As pastas aparecem aqui quando o nome tiver as palavras configuradas pelo revendedor." : "Nenhum conteúdo",
      onEnter: function (it) { openItem(it); },
      onPoint: function () { if (home.zone !== "content") home.setZone("content"); },
    });
    this.reload();
    home.hint.innerHTML = "Clique ou Enter: abrir · F: favoritar · PgUp/PgDn: pular página";
  }
  VodView.prototype.reload = function () {
    if (this.only) { this.glist.set([this.only], true); this.selectGroup(this.only); return; }
    var v = visibleGroups(this.kinds, this.tabId);
    var all = []; for (var i = 0; i < v.groups.length; i++) all = all.concat(v.groups[i].items);
    var gs = [{ special: true, label: "Todos", items: all, count: all.length }].concat(v.groups);
    if (v.lockedAdult) gs.push({ special: true, label: "🔒 Adultos", items: [], locked: true });
    this.glist.set(gs, true);
    this.selectGroup(this.glist.current());
  };
  VodView.prototype.selectGroup = function (g) {
    if (!g || g.locked) return;
    this.curGroup = g; this.grid.set(g.items); this.glist.draw();
  };
  VodView.prototype.firstZone = function () { return "groups"; };
  VodView.prototype.zone = function (z) { this.z = z; this.glist.focus(z === "groups"); this.grid.focus(z === "content"); };
  VodView.prototype.key = function (code) {
    if (this.z === "groups") { if (code === K.RIGHT) { this.home.setZone("content"); return true; } return this.glist.key(code); }
    if (this.z === "content") {
      if (code === K.RED || code === K.YELLOW) { var it = this.grid.current(); if (it) toggleFav(it); return true; }
      if (this.grid.key(code)) return true;
      if (code === K.LEFT) { this.home.setZone("groups"); return true; }
      return false;
    }
    return false;
  };

  // ------------------------------------------------------------ Destaques (igual ao app Android)
  var reDub = /\bdub\b|dublad|\bdual\b/;
  function DestaquesView(home) {
    var self = this, c = state.cat, b = brand();
    this.home = home;
    // filmes "recentes" = os últimos da lista (as listas costumam acrescentar no fim)
    var recent = c.movies.slice(-30).reverse();
    var dubbed = null;
    for (var i = 0; i < recent.length; i++) if (reDub.test(U.norm(recent[i].n + " " + recent[i].g))) { dubbed = recent[i]; break; }
    if (!dubbed) dubbed = recent[6] || recent[0] || null;
    var series = c.series.length ? c.series[c.series.length - 1] : null;
    var banners = (state.res.banners || []).filter(function (x) { return x && x.image_url; });
    this.slides = banners.length
      ? banners.map(function (x) { return { img: x.image_url, title: x.title || "", sub: x.subtitle || "", badge: x.badge || "Filme em destaque", name: x.action_value || x.title }; })
      : recent.slice(0, 5).map(function (m) { return { img: m.l, title: m.n, sub: m.g, badge: "Filme em destaque", item: m }; });
    this.cards = [{ it: dubbed, badge: "Dublado" }, { it: series, badge: "Série em destaque" }];
    var im = function (n) { return '<img src="img/tile_' + n + '.png" alt="">'; };
    var sc = [[im("tv"), "Canais ao vivo", "tv"], [im("filmes"), "Filmes", "movies"], [im("series"), "Séries completas", "series"]];
    if (home.indexOf("kids") && home.tabs[home.indexOf("kids")].id === "kids") sc.push([im("kids"), "Kids infantil", "kids"]);
    if (home.indexOf("anime") && home.tabs[home.indexOf("anime")].id === "anime") sc.push(['<span class="dsce accent">&#10024;</span>', "Anime dublado", "anime"]);
    var esp = findGroup(["Esportes", "Canais - Esportes", "Esporte"], ["L"]);
    if (esp) sc.push([im("esportes"), "Esportes ao vivo", function () { home.goTab("tv"); var v = home.view; if (v && v.glist) { v.glist.set([esp], true); v.selectGroup(esp); } }]);
    this.shortcuts = sc;
    this.slide = 0; this.f = 0; this.active = false;

    var html = '<div class="col content wide dest"><div class="drow"><div class="dbanner" data-f="0"></div><div class="dcards">';
    for (var k = 0; k < 2; k++) html += '<div class="dcard" data-f="' + (k + 1) + '"></div>';
    html += '</div></div><div class="dshort">';
    for (var j = 0; j < sc.length; j++) {
      html += '<div class="dsc" data-f="' + (j + 3) + '"><div class="dsci accent">' + sc[j][0] + '</div><div class="dscl">' + sc[j][1] + "</div></div>";
    }
    html += '</div><div class="dfoot"><b>' + U.esc(brandName()) + "</b>" + (b.slogan ? '<span class="dim">  •  ' + U.esc(b.slogan) + "</span>" : "") +
      '<span class="dfr dim">' + (state.res.expires_at ? "Acesso válido até " + U.fmtDate(state.res.expires_at) : "") + ' <span class="hd">HD</span></span></div></div>';
    home.body.innerHTML = html;
    this.root = home.body.querySelector(".dest");
    this.drawCards(); this.drawBanner(); this.drawFocus();
    this.timer = setInterval(function () { if (self.slides.length > 1) { self.slide = (self.slide + 1) % self.slides.length; self.drawBanner(); } }, 6000);
    // Magic Remote
    this.root.addEventListener("mouseover", function (ev) {
      var el = UI.up(ev.target, "dfx", self.root) || findF(ev.target); if (!el) return;
      var f = parseInt(el.getAttribute("data-f"), 10);
      if (home.zone !== "content") home.setZone("content");
      if (f !== self.f) { self.f = f; self.drawFocus(); }
    });
    this.root.addEventListener("click", function (ev) {
      var el = findF(ev.target); if (!el) return;
      self.f = parseInt(el.getAttribute("data-f"), 10);
      if (home.zone !== "content") home.setZone("content");
      self.drawFocus(); self.enter();
    });
    function findF(t) { while (t && t !== self.root) { if (t.getAttribute && t.getAttribute("data-f") != null) return t; t = t.parentNode; } return null; }
    home.hint.innerHTML = "Clique ou Enter: abrir · ◀ no banner: destaque anterior";
  }
  DestaquesView.prototype.drawBanner = function () {
    var el = this.root.querySelector(".dbanner"), s = this.slides[this.slide];
    if (!s) { el.innerHTML = '<div class="dempty dim">Sem destaques no momento</div>'; return; }
    var dots = "";
    for (var i = 0; i < this.slides.length; i++) dots += '<i class="' + (i === this.slide ? "on" : "") + '"></i>';
    el.innerHTML = (s.img ? '<img src="' + U.esc(s.img) + '" onerror="this.style.display=\'none\'"/>' : "") +
      '<div class="dshade"></div><div class="dtxt"><span class="dbadge">' + U.esc(s.badge) + '</span><div class="dtitle">' + U.esc(s.title) +
      '</div><div class="dsub dim">' + U.esc(s.sub) + '</div></div><div class="ddots">' + dots + "</div>";
  };
  DestaquesView.prototype.drawCards = function () {
    var els = this.root.querySelectorAll(".dcard");
    for (var i = 0; i < 2; i++) {
      var c = this.cards[i], it = c.it;
      els[i].innerHTML = it
        ? (it.l ? '<img src="' + U.esc(it.l) + '" onerror="this.style.display=\'none\'"/>' : "") + '<div class="dshade"></div><div class="dtxt"><span class="dbadge sm">' + c.badge +
          '</span><div class="dctitle">' + U.esc(it.n) + "</div></div>"
        : '<div class="dempty dim">' + c.badge + "</div>";
    }
  };
  DestaquesView.prototype.drawFocus = function () {
    var all = this.root.querySelectorAll("[data-f]");
    for (var i = 0; i < all.length; i++) {
      var f = parseInt(all[i].getAttribute("data-f"), 10), cls = all[i].className.replace(/ focus/g, "");
      all[i].className = cls + (this.active && f === this.f ? " focus" : "");
    }
  };
  DestaquesView.prototype.enter = function () {
    var f = this.f;
    if (f === 0) {
      var s = this.slides[this.slide]; if (!s) return;
      if (s.item) openItem(s.item); else openByName(s.name);
    } else if (f <= 2) {
      var it = this.cards[f - 1].it; if (it) openItem(it);
    } else {
      var a = this.shortcuts[f - 3][2];
      if (typeof a === "function") a(); else this.home.goTab(a);
    }
  };
  DestaquesView.prototype.firstZone = function () { return "content"; };
  DestaquesView.prototype.zone = function (z) { this.active = z === "content"; this.drawFocus(); };
  DestaquesView.prototype.key = function (code) {
    if (!this.active) return false;
    var f = this.f, n = this.shortcuts.length;
    if (code === K.ENTER) { this.enter(); return true; }
    if (f === 0) {
      if (code === K.RIGHT) this.f = 1;
      else if (code === K.LEFT) { if (this.slides.length > 1) { this.slide = (this.slide - 1 + this.slides.length) % this.slides.length; this.drawBanner(); } return true; }
      else if (code === K.DOWN) this.f = 3;
      else return false;
    } else if (f === 1 || f === 2) {
      if (code === K.LEFT) this.f = 0;
      else if (code === K.DOWN) this.f = f === 1 ? 2 : 3 + n - 1;
      else if (code === K.UP) { if (f === 1) return false; this.f = 1; }
      else return true;
    } else {
      var j = f - 3;
      if (code === K.LEFT) { if (j > 0) this.f = f - 1; }
      else if (code === K.RIGHT) { if (j < n - 1) this.f = f + 1; }
      else if (code === K.UP) this.f = j >= n - 1 ? 2 : 0;
      else return true;
    }
    this.drawFocus();
    return true;
  };
  DestaquesView.prototype.destroy = function () { clearInterval(this.timer); };

  /** Abre um item pelo nome (ação dos banners do painel). */
  function openByName(name) {
    var q = U.norm(name || ""), c = state.cat;
    if (!q) return;
    var lists = [c.movies, c.series, c.live], i, l, hit = null;
    for (l = 0; l < lists.length && !hit; l++) for (i = 0; i < lists[l].length; i++) if (U.norm(lists[l][i].n) === q) { hit = lists[l][i]; break; }
    for (l = 0; l < lists.length && !hit; l++) for (i = 0; i < lists[l].length; i++) if (U.norm(lists[l][i].n).indexOf(q) >= 0) { hit = lists[l][i]; break; }
    if (hit) openItem(hit, hit.t === "L" ? [hit] : null, 0);
    else UI.toast("Este conteúdo não está na sua lista");
  }

  // ------------------------------------------------------------ Favoritos
  function FavView(home) {
    this.home = home;
    home.body.innerHTML = '<div class="col content wide"></div>';
    this.grid = new UI.Grid({
      el: home.body.querySelector(".content"), cols: 7, rows: 2, render: cardHtml, counter: true,
      empty: "Sem favoritos ainda. Use o botão Favoritar em um canal, filme ou série.",
      onEnter: function (it, i) { openItem(it, it.t === "L" ? [it] : null, 0); },
      onPoint: function () { if (home.zone !== "content") home.setZone("content"); },
    });
    this.reload();
    home.hint.innerHTML = "Clique ou Enter: abrir · F: remover dos favoritos";
  }
  FavView.prototype.reload = function () { this.grid.set(favs().map(resolveFav).filter(Boolean)); };
  FavView.prototype.onShow = function () { var i = this.grid.idx; this.reload(); this.grid.idx = Math.min(i, Math.max(0, this.grid.items.length - 1)); this.grid.draw(); };
  FavView.prototype.firstZone = function () { return this.grid.items.length ? "content" : null; };
  FavView.prototype.zone = function (z) { this.z = z; this.grid.focus(z === "content"); };
  FavView.prototype.key = function (code) {
    if (this.z !== "content") return false;
    if (code === K.RED || code === K.YELLOW) { var it = this.grid.current(); if (it) { toggleFav(it); this.onShow(); if (!this.grid.items.length) this.home.setZone("tabs"); } return true; }
    return this.grid.key(code);
  };

  // ------------------------------------------------------------ Busca
  function SearchView(home) {
    var self = this;
    this.home = home;
    home.body.innerHTML = '<div class="col content wide"><input class="field search" placeholder="Digite o nome do canal, filme ou série" autocomplete="off"/><div class="sres"></div></div>';
    this.input = home.body.querySelector("input");
    this.grid = new UI.Grid({
      el: home.body.querySelector(".sres"), cols: 7, rows: 2, render: cardHtml, counter: true, empty: "",
      onEnter: function (it) { openItem(it); },
      onPoint: function () { if (home.zone !== "content") home.setZone("content"); },
    });
    this.input.addEventListener("click", function () { if (home.zone !== "input") home.setZone("input"); });
    this.input.value = this.lastQ = U.get("lastSearch", "");
    if (this.lastQ) this.run();
    this.input.addEventListener("input", function () { clearTimeout(self.t); self.t = setTimeout(function () { self.run(); }, 500); });
    home.hint.innerHTML = "Digite no campo · Seta para baixo: resultados";
  }
  SearchView.prototype.run = function () {
    var q = U.norm(this.input.value);
    U.set("lastSearch", this.input.value);
    if (q.length < 2) { this.grid.o.empty = "Digite pelo menos 2 letras."; this.grid.set([]); return; }
    // todas as palavras digitadas precisam aparecer no nome (em qualquer ordem)
    var words = q.split(/\s+/).filter(Boolean);
    function match(name) { var n = U.norm(name); for (var w = 0; w < words.length; w++) if (n.indexOf(words[w]) < 0) return false; return true; }
    var out = [], c = state.cat, lists = [c.live, c.movies, c.series], max = 300;
    for (var l = 0; l < lists.length && out.length < max; l++) {
      var arr = lists[l];
      for (var i = 0; i < arr.length && out.length < max; i++) {
        var it = arr[i];
        if (!match(it.n)) continue;
        if (!state.adultUnlocked || !CFG.allowAdult) { var gk = it.t === "L" ? "L" : it.t === "M" ? "M" : "S"; var g = c.groupIdx[gk][it.g]; if (g && g.adult) continue; }
        out.push(it);
      }
    }
    this.grid.o.empty = "Nada encontrado.";
    this.grid.set(out);
  };
  SearchView.prototype.firstZone = function () { return "input"; };
  SearchView.prototype.zone = function (z) {
    this.z = z;
    this.input.className = "field search" + (z === "input" ? " focus" : "");
    if (z === "input") { var i = this.input; setTimeout(function () { i.focus(); }, 30); } else this.input.blur();
    this.grid.focus(z === "content");
  };
  SearchView.prototype.key = function (code) {
    if (this.z === "input") {
      if (code === K.DOWN || code === K.ENTER) { this.input.blur(); this.run(); if (this.grid.items.length) this.home.setZone("content"); return true; }
      if (code === K.UP) { this.input.blur(); return false; }
      if (code === K.BACK || code === K.ESC) { this.input.blur(); return false; }
      return "pass"; // teclas de texto ficam no campo
    }
    if (this.z === "content") {
      if (code === K.UP && this.grid.idx < this.grid.o.cols) { this.home.setZone("input"); return true; }
      if (code === K.RED || code === K.YELLOW) { var it = this.grid.current(); if (it) toggleFav(it); return true; }
      return this.grid.key(code);
    }
    return false;
  };
  SearchView.prototype.destroy = function () { this.input.blur(); };

  // ------------------------------------------------------------ Ajustes
  function SettingsView(home) {
    var self = this;
    this.home = home;
    var c = state.cat;
    home.body.innerHTML =
      '<div class="col content wide settings"><div class="info">' +
      "<div><span class=\"faint\">MAC:</span> <b>" + state.id.mac + "</b></div>" +
      "<div><span class=\"faint\">Chave:</span> <b>" + state.id.key + "</b></div>" +
      "<div><span class=\"faint\">Acesso válido até:</span> <b>" + U.fmtDate(state.res.expires_at) + "</b></div>" +
      "<div><span class=\"faint\">Conteúdo:</span> " + c.live.length + " canais · " + c.movies.length + " filmes · " + c.series.length + " séries</div>" +
      "<div><span class=\"faint\">Aparelho:</span> " + U.esc(state.id.model) + " · app " + CFG.version + "</div>" +
      (brand().whatsapp ? "<div><span class=\"faint\">Suporte (WhatsApp):</span> " + U.esc(brand().whatsapp) + "</div>" : "") +
      '</div><div class="btns"></div></div>';
    var labels = CFG.allowAdult ? ["Recarregar lista", "Trocar PIN parental", "Sair do app"] : ["Recarregar lista", "Sair do app"];
    this.btns = new UI.Buttons(home.body.querySelector(".btns"), labels, function (i) {
      if (!CFG.allowAdult && i === 1) i = 2;
      if (i === 0) loadPlaylist(state.playlistUrl);
      else if (i === 1) {
        UI.inputDialog("PIN atual", "Digite o PIN atual (padrão 0000).", "", "password", function (cur) {
          if (cur !== U.get("pin", "0000")) return UI.toast("PIN incorreto.");
          UI.inputDialog("Novo PIN", "Digite o novo PIN (4 números).", "", "password", function (np) {
            if (!/^\d{4}$/.test(np)) return UI.toast("O PIN precisa ter 4 números.");
            U.set("pin", np); UI.toast("PIN alterado.");
          });
        });
      } else UI.confirmDialog("Sair do app?", "Deseja realmente sair do " + brandName() + "?", "Sair", "Cancelar", exitApp);
    });
    home.hint.innerHTML = "";
    this.btns.o.onPoint = function () { if (home.zone !== "content") home.setZone("content"); };
  }
  SettingsView.prototype.firstZone = function () { return "content"; };
  SettingsView.prototype.zone = function (z) { this.z = z; this.btns.focus(z === "content"); };
  SettingsView.prototype.key = function (code) { if (this.z !== "content") return false; return this.btns.key(code); };

  // ============================================================ detalhes do filme
  function MovieScreen(it) {
    var self = this;
    this.it = it;
    var el = this.el = U.h("div", "screen details glow");
    this.draw = function () {
      var pos = getPos(it.u);
      el.innerHTML = '<div class="dposter">' + (it.l ? '<img src="' + U.esc(it.l) + '"/>' : "") + '</div><div class="dinfo"><div class="faint">' + U.esc(it.g) +
        '</div><h1>' + U.esc(it.n) + "</h1>" + (pos ? '<p class="dim">Você parou em ' + U.fmtTime(pos) + "</p>" : "") + '<div class="btns"></div></div>';
      var labels = pos ? ["▶ Continuar", "Do início"] : ["▶ Assistir"];
      labels.push(isFav(it) ? "★ Nos favoritos" : "☆ Favoritar");
      self.btns = new UI.Buttons(el.querySelector(".btns"), labels, function (i) {
        var favIdx = labels.length - 1;
        if (i === favIdx) { toggleFav(it); self.draw(); return; }
        var start = (pos && i === 0) ? pos : 0;
        UI.push(new PlayerScreen({ live: false, list: [it], idx: 0, start: start, title: it.n }));
      });
      self.btns.focus(true);
      UI.backButton(el, function () { UI.pop(); });
    };
    this.draw();
  }
  MovieScreen.prototype.onShow = function () { this.draw(); };
  MovieScreen.prototype.onKey = function (code, ev) { if (UI.isBack(code, ev)) { UI.pop(); return true; } return this.btns.key(code) || true; };

  // ============================================================ série: temporadas e episódios
  function SeriesScreen(s) {
    var self = this;
    this.s = s;
    var seasons = [];
    for (var i = 0; i < s.eps.length; i++) if (seasons.indexOf(s.eps[i].s) < 0) seasons.push(s.eps[i].s);
    seasons.sort(function (a, b) { return a - b; });
    this.seasons = seasons;
    var el = this.el = U.h("div", "screen details series glow");
    el.innerHTML = '<div class="dposter">' + (s.l ? '<img src="' + U.esc(s.l) + '"/>' : "") + '</div><div class="dinfo"><div class="faint">' + U.esc(s.g) +
      "</div><h1>" + U.esc(s.n) + '</h1><div class="seasons"></div><div class="eps"></div><div class="favbtn"></div></div>';
    this.sbtns = new UI.Buttons(el.querySelector(".seasons"), seasons.map(function (n) { return "Temporada " + n; }), function () { self.setZone("eps"); });
    var origKey = this.sbtns.key;
    this.sbtns.key = function (code) { var r = origKey.call(self.sbtns, code); if (r && (code === K.LEFT || code === K.RIGHT)) self.fillEps(); return r; };
    this.sbtns.o.onPoint = function () { if (self.zone !== "seasons") self.setZone("seasons"); };
    this.sbtns.pointTo = function (i) { if (i !== self.sbtns.idx) { self.sbtns.idx = i; self.fillEps(); } self.sbtns.active = true; self.sbtns.draw(); };
    this.elist = new UI.VList({
      el: el.querySelector(".eps"), rows: 7, empty: "Sem episódios",
      render: function (e) {
        var p = getPos(e.u);
        return '<span class="num">E' + U.pad(e.e || 0, 2) + '</span><span class="cname">' + U.esc(e.n) + "</span>" + (p ? '<span class="faint">' + U.fmtTime(p) + "</span>" : "");
      },
      onEnter: function (e, i) {
        UI.push(new PlayerScreen({ live: false, list: self.elist.items, idx: i, start: getPos(e.u), title: s.n }));
      },
    });
    this.elist.o.onPoint = function () { if (self.zone !== "eps") self.setZone("eps"); };
    this.favBtn = el.querySelector(".favbtn");
    this.favBtn.addEventListener("click", function () { toggleFav(s); self.drawFav(); });
    UI.backButton(el, function () { UI.pop(); });
    this.fillEps();
    this.setZone(seasons.length > 1 ? "seasons" : "eps");
  }
  SeriesScreen.prototype.fillEps = function () {
    var sn = this.seasons[this.sbtns.idx];
    this.elist.set(this.s.eps.filter(function (e) { return e.s === sn; }));
  };
  SeriesScreen.prototype.drawFav = function () {
    this.favBtn.innerHTML = '<div class="btn' + (this.zone === "fav" ? " focus" : "") + '">' + (isFav(this.s) ? "★ Nos favoritos" : "☆ Favoritar série") + "</div>";
  };
  SeriesScreen.prototype.setZone = function (z) {
    this.zone = z; this.sbtns.focus(z === "seasons"); this.elist.focus(z === "eps"); this.drawFav();
  };
  SeriesScreen.prototype.onShow = function () { this.elist.draw(); };
  SeriesScreen.prototype.onKey = function (code, ev) {
    if (UI.isBack(code, ev)) { UI.pop(); return true; }
    if (this.zone === "seasons") {
      if (code === K.DOWN) { this.setZone("eps"); return true; }
      if (code === K.UP) { this.setZone("fav"); return true; }
      return this.sbtns.key(code) || true;
    }
    if (this.zone === "eps") {
      if (code === K.UP && this.elist.idx === 0) { this.setZone(this.seasons.length > 1 ? "seasons" : "fav"); return true; }
      return this.elist.key(code) || true;
    }
    if (code === K.ENTER) { toggleFav(this.s); this.drawFav(); return true; }
    if (code === K.DOWN) { this.setZone(this.seasons.length > 1 ? "seasons" : "eps"); return true; }
    return true;
  };

  // ============================================================ player em tela cheia
  function PlayerScreen(o) {
    var self = this;
    this.o = o; this.idx = o.idx;
    var el = this.el = U.h("div", "screen player");
    el.innerHTML = '<div class="ptop"><div class="ptitle"></div><div class="psub dim"></div></div><div class="pmid"></div>' +
      '<div class="pbot"><div class="prog"><i></i></div><div class="ptimes"><span class="cur"></span><span class="dur"></span></div><div class="pctl"></div><div class="phint faint"></div></div>';
    // botões na tela (Magic Remote): também funcionam com OK quando o ponteiro está em cima
    var ctl = el.querySelector(".pctl");
    var defs = o.live
      ? [["&#8249; Voltar", "back"], ["&#9650; Canal anterior", "prev"], ["&#9660; Próximo canal", "next"]]
      : [["&#8249; Voltar", "back"], ["&#9194; -10s", "rw"], ["&#9654;&#10074;&#10074; Play/Pausa", "pp"], ["+10s &#9193;", "ff"]];
    for (var d = 0; d < defs.length; d++) {
      var bt = U.h("div", "pbtn", defs[d][0]); bt.setAttribute("data-a", defs[d][1]); ctl.appendChild(bt);
    }
    ctl.addEventListener("click", function (ev) {
      var b = UI.up(ev.target, "pbtn", ctl); if (!b) return;
      var a = b.getAttribute("data-a");
      if (a === "back") UI.pop();
      else if (a === "prev") self.onKey(K.UP);
      else if (a === "next") self.onKey(K.DOWN);
      else if (a === "rw") self.onKey(K.LEFT);
      else if (a === "ff") self.onKey(K.RIGHT);
      else self.onKey(K.ENTER);
    });
    el.addEventListener("mousemove", function () { self.showOsd(); });
    this.titleEl = el.querySelector(".ptitle"); this.subEl = el.querySelector(".psub");
    this.mid = el.querySelector(".pmid"); this.progI = el.querySelector(".prog i");
    this.curEl = el.querySelector(".cur"); this.durEl = el.querySelector(".dur");
    el.querySelector(".phint").innerHTML = o.live ? "▲▼ trocar canal · Esc: sair da tela cheia · F11: tela cheia do computador" : "Espaço: pausar · ◀ ▶ voltar/avançar · Esc: sair · F11: tela cheia do computador";
    if (o.live) el.querySelector(".prog").style.display = "none";
    this.seekStep = 10;
    this.timer = setInterval(function () { self.tick(); }, 1000);
    UI.Video.onEnded = function () { self.ended(); };
    UI.Video.onError = function () {
      var e = UI.Video.el.error, code = e ? e.code : 0;
      var why = code === 4 ? "formato não suportado ou endereço inválido" : code === 3 ? "erro ao decodificar o vídeo" : code === 2 ? "falha de rede" : "erro desconhecido";
      self.mid.innerHTML = '<div class="perr">Não foi possível reproduzir agora.' + (o.live ? " Este canal pode estar fora do ar." : "") +
        '<div class="faint" style="font-size:22px;margin-top:8px">Código ' + code + " · " + why + "</div></div>";
      self.showOsd();
    };
    this.start(o.start || 0);
  }
  PlayerScreen.prototype.item = function () { return this.o.list[this.idx]; };
  PlayerScreen.prototype.start = function (startSec) {
    var it = this.item();
    this.mid.innerHTML = "";
    this.titleEl.innerHTML = this.o.live ? U.pad(it.num, 3) + " · " + U.esc(it.n) : U.esc(this.o.title || it.n);
    this.subEl.innerHTML = this.o.live ? U.esc(it.g) : (it.t === "E" ? U.esc(it.n) : "");
    UI.Video.place("full");
    UI.Video.play(it.u, startSec);
    this.showOsd();
  };
  PlayerScreen.prototype.showOsd = function () {
    var el = this.el;
    el.className = "screen player osd";
    clearTimeout(this.ot);
    this.ot = setTimeout(function () { el.className = "screen player"; }, 4000);
  };
  PlayerScreen.prototype.tick = function () {
    var v = UI.Video.el;
    if (this.o.live) return;
    var d = v.duration, c = v.currentTime;
    if (isFinite(d) && d > 0) {
      this.progI.style.width = (c / d * 100) + "%";
      this.curEl.innerHTML = U.fmtTime(c); this.durEl.innerHTML = U.fmtTime(d);
      if (Math.floor(c) % 10 === 0) savePos(this.item().u, c, d);
    }
  };
  PlayerScreen.prototype.ended = function () {
    if (this.o.live) { var self = this; setTimeout(function () { UI.Video.url = null; self.start(0); }, 1500); return; }
    savePos(this.item().u, 0, 0);
    if (this.idx < this.o.list.length - 1 && this.item().t === "E") { this.idx++; UI.toast("Próximo episódio"); this.start(getPos(this.item().u)); }
    else UI.pop();
  };
  PlayerScreen.prototype.seek = function (dir) {
    var v = UI.Video.el;
    if (!isFinite(v.duration)) return;
    var now = Date.now();
    this.seekStep = (now - (this.lastSeek || 0) < 600) ? Math.min(this.seekStep * 1.5, 300) : 10;
    this.lastSeek = now;
    try { v.currentTime = Math.max(0, Math.min(v.duration - 2, v.currentTime + dir * this.seekStep)); } catch (e) { /* */ }
    this.tick(); this.showOsd();
  };
  PlayerScreen.prototype.onKey = function (code, ev) {
    var v = UI.Video.el;
    if (UI.isBack(code, ev) || code === K.STOP) { UI.pop(); return true; }
    if (this.o.live) {
      if (code === K.UP || code === K.CHUP) { this.idx = (this.idx - 1 + this.o.list.length) % this.o.list.length; this.start(0); return true; }
      if (code === K.DOWN || code === K.CHDOWN) { this.idx = (this.idx + 1) % this.o.list.length; this.start(0); return true; }
      if (code === K.RED || code === K.YELLOW) { toggleFav(this.item()); return true; }
      if (UI.Video.yt && (code === K.ENTER || code === K.PLAY || code === K.PAUSE)) UI.Video.ytKey("pp");
      this.showOsd(); return true;
    }
    if (UI.Video.yt) {
      // vídeo do YouTube: as teclas vão para o player do YouTube
      if (code === K.ENTER || code === K.PLAY || code === K.PAUSE || code === 10252) UI.Video.ytKey("pp");
      else if (code === K.LEFT || code === K.RW) UI.Video.ytKey("rw");
      else if (code === K.RIGHT || code === K.FF) UI.Video.ytKey("ff");
      this.showOsd(); return true;
    }
    if (code === K.ENTER || code === K.PLAY || code === K.PAUSE || code === 10252) {
      if (v.paused) { v.play(); this.mid.innerHTML = ""; } else { v.pause(); this.mid.innerHTML = '<div class="pause">❚❚</div>'; }
      this.showOsd(); return true;
    }
    if (code === K.LEFT || code === K.RW) { this.seek(-1); return true; }
    if (code === K.RIGHT || code === K.FF) { this.seek(1); return true; }
    this.showOsd(); return true;
  };
  PlayerScreen.prototype.destroy = function () {
    clearInterval(this.timer); clearTimeout(this.ot);
    var v = UI.Video.el;
    if (!this.o.live) savePos(this.item().u, v.currentTime, v.duration);
    UI.Video.onEnded = null; UI.Video.onError = null;
    if (this.o.live && this.o.fromPreview) {
      // a prévia continua no canal que estava tocando
      return;
    }
    UI.Video.stop();
  };

  // ============================================================ sair
  function exitApp() {
    try { if (window.webOS && window.webOS.platformBack) { window.webOS.platformBack(); return; } } catch (e) { /* */ }
    try { if (window.PalmSystem && window.PalmSystem.platformBack) { window.PalmSystem.platformBack(); return; } } catch (e) { /* */ }
    window.close();
  }

  var Video = UI.Video;

  // ============================================================ teclado / controle
  function onKeyDown(ev) {
    var code = ev.keyCode;
    var tg = ev.target;
    var typing = tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA");
    if (code === 32 && !typing) code = UI.K.PLAY; // computador: espaço = play/pausa
    if (code === 70 && !typing) code = UI.K.RED; // F = favoritar
    var s = UI.top();
    if (!s || !s.onKey) return;
    var handled = s.onKey(code, ev);
    if (handled) { ev.preventDefault(); ev.stopPropagation(); }
  }

  // ============================================================ escala (para testar no navegador do PC)
  function fit() {
    var w = window.innerWidth, h = window.innerHeight;
    var sc = Math.min(w / 1920, h / 1080);
    App.scale = sc;
    var st = document.getElementById("stage");
    st.style.transform = "scale(" + sc + ")";
    st.style.left = Math.round((w - 1920 * sc) / 2) + "px";
    st.style.top = Math.round((h - 1080 * sc) / 2) + "px";
  }

  function boot() {
    fit();
    window.addEventListener("resize", fit);
    UI.init(document.getElementById("screens"));
    document.addEventListener("keydown", onKeyDown, true);
    // voltar ao app (webOS reabre em vez de iniciar de novo)
    document.addEventListener("webOSRelaunch", function () {
      if (state.id) Device.check(state.id).then(function (r) { if (r.status !== "active") { state.cat = null; Video.stop(); handleResponse(r); } }).catch(function () { /* */ });
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (Video.mode === "box") Video.stop(); }
    });
    start();
  }

  return { boot: boot, scale: 1 };
})();
