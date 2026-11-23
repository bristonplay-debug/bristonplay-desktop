/* BristonPlay LG — leitura da lista M3U (mesmas regras do app Android) */
var M3U = (function () {
  "use strict";

  var EP1 = /(?:^|[^a-z0-9])[ST](\d{1,2})\s*E(\d{1,4})(?!\d)/i;
  var EP2 = /(?:^|[^a-z0-9])(\d{1,2})x(\d{1,3})(?!\d)/i;

  var DEFAULT_TABS = [
    { tab: "kids", keywords: ["infantil", "kids", "desenho"], is_adult: false },
    { tab: "anime", keywords: ["anime"], is_adult: false },
    { tab: "adultos", keywords: ["adulto", "xxx", "+18"], is_adult: true },
  ];

  /** Abas: padrão + o que o painel mandou (o painel tem prioridade). */
  function effectiveTabs(server) {
    var m = {}, order = [], i;
    for (i = 0; i < DEFAULT_TABS.length; i++) { m[DEFAULT_TABS[i].tab] = DEFAULT_TABS[i]; order.push(DEFAULT_TABS[i].tab); }
    for (i = 0; i < (server || []).length; i++) {
      var t = server[i], k = U.norm(t.tab);
      var kws = (t.keywords || []).filter(function (x) { return x && String(x).replace(/\s/g, ""); });
      if (!k || !kws.length) continue;
      if (!m[k]) order.push(k);
      m[k] = { tab: k, keywords: kws, is_adult: !!t.is_adult };
    }
    return order.map(function (k) { return m[k]; });
  }

  function attr(line, name) {
    var low = line.toLowerCase(), i = low.indexOf(name + '="');
    if (i < 0) return null;
    var s = i + name.length + 2, e = line.indexOf('"', s);
    return e < 0 ? null : line.substring(s, e);
  }
  function title(inf) {
    var inQ = false;
    for (var i = 0; i < inf.length; i++) {
      var c = inf.charAt(i);
      if (c === '"') inQ = !inQ; else if (c === "," && !inQ) return inf.substring(i + 1).replace(/^\s+|\s+$/g, "");
    }
    return "";
  }
  function trimSeries(s) { return s.replace(/^[\s\-|:._–—([]+|[\s\-|:._–—([]+$/g, ""); }

  /**
   * Lê o texto da M3U em partes (para a TV não travar) e devolve o catálogo.
   * onProgress(itens) é chamado de tempos em tempos.
   */
  function parse(text, serverTabs, onProgress) {
    var tabs = effectiveTabs(serverTabs);
    var cat = {
      live: [], movies: [], series: [], seriesByKey: {},
      groups: { L: [], M: [], S: [] }, groupIdx: { L: {}, M: {}, S: {} },
      headerEpg: null, tabs: tabs,
    };
    var pos = 0, len = text.length, inf = null, extGrp = null, liveNum = 0, count = 0;
    if (text.charCodeAt(0) === 0xfeff) pos = 1;

    function groupOf(kind, name) {
      var idx = cat.groupIdx[kind], g = idx[name];
      if (g) return g;
      var gn = U.norm(name), t = [], adult = false;
      for (var i = 0; i < tabs.length; i++) {
        var kws = tabs[i].keywords;
        for (var j = 0; j < kws.length; j++) {
          var nk = U.norm(kws[j]);
          if (nk && gn.indexOf(nk) >= 0) { t.push(tabs[i].tab); if (tabs[i].is_adult) adult = true; break; }
        }
      }
      g = { name: name, kind: kind, tabs: t, adult: adult, items: [] };
      idx[name] = g; cat.groups[kind].push(g);
      return g;
    }

    function add(infLine, rawUrl) {
      var url = rawUrl, pipe = rawUrl.indexOf("|");
      if (pipe > 0) url = rawUrl.substring(0, pipe);
      var logo = attr(infLine, "tvg-logo");
      var tvgName = attr(infLine, "tvg-name");
      var grp = (attr(infLine, "group-title") || extGrp || "").replace(/^\s+|\s+$/g, "") || "Sem categoria";
      var name = title(infLine) || tvgName || url.substring(url.lastIndexOf("/") + 1);
      var path = url.split("?")[0].toLowerCase();
      var ep = EP1.exec(name) || EP2.exec(name);
      var type, hint = (attr(infLine, "tvg-type") || attr(infLine, "type") || "").toLowerCase();
      if (hint === "movie" || hint === "vod") type = "M";
      else if (hint === "series" || hint === "episode") type = "E";
      else if (path.indexOf("/series/") >= 0) type = "E";
      else if (path.indexOf("/movie/") >= 0) type = "M";
      else if (ep) type = "E";
      else if (/\.(mp4|mkv|avi)$/.test(path)) type = "M";
      else type = "L";
      count++;
      if (type === "L") {
        var ch = { t: "L", n: name, g: grp, u: url, l: logo || "", num: ++liveNum, id: attr(infLine, "tvg-id") || "" };
        cat.live.push(ch); groupOf("L", grp).items.push(ch);
      } else if (type === "M") {
        var mv = { t: "M", n: name, g: grp, u: url, l: logo || "" };
        cat.movies.push(mv); groupOf("M", grp).items.push(mv);
      } else {
        var season = 1, episode = 0, sname = null;
        if (ep) {
          season = parseInt(ep[1], 10) || 1; episode = parseInt(ep[2], 10) || 0;
          sname = trimSeries(name.substring(0, ep.index));
        }
        if (!sname) sname = name;
        var key = U.norm(sname);
        var s = cat.seriesByKey[key];
        if (!s) {
          s = { t: "S", n: sname, k: key, g: grp, l: logo || "", eps: [] };
          cat.seriesByKey[key] = s; cat.series.push(s); groupOf("S", grp).items.push(s);
        } else if (!s.l && logo) s.l = logo;
        s.eps.push({ t: "E", n: name, u: url, l: logo || "", s: season, e: episode, sk: key });
      }
    }

    return new Promise(function (resolve) {
      function step() {
        var deadline = Date.now() + 40;
        while (pos < len && Date.now() < deadline) {
          for (var n = 0; n < 400 && pos < len; n++) {
            var nl = text.indexOf("\n", pos);
            if (nl < 0) nl = len;
            var line = text.substring(pos, nl);
            pos = nl + 1;
            line = line.replace(/^\s+|\s+$/g, "");
            if (!line) continue;
            if (line.charAt(0) === "#") {
              var up = line.substring(0, 10).toUpperCase();
              if (up.indexOf("#EXTM3U") === 0) cat.headerEpg = attr(line, "url-tvg") || attr(line, "x-tvg-url");
              else if (up.indexOf("#EXTINF") === 0) { inf = line; extGrp = null; }
              else if (up.indexOf("#EXTGRP") === 0) extGrp = line.substring(line.indexOf(":") + 1).replace(/^\s+|\s+$/g, "");
              continue;
            }
            if (inf) { add(inf, line); inf = null; }
          }
        }
        if (onProgress) onProgress(count, pos / len);
        if (pos < len) setTimeout(step, 0);
        else {
          // episódios em ordem
          for (var i = 0; i < cat.series.length; i++) {
            cat.series[i].eps.sort(function (a, b) { return a.s - b.s || a.e - b.e; });
          }
          cat.count = count;
          resolve(cat);
        }
      }
      step();
    });
  }

  return { parse: parse, effectiveTabs: effectiveTabs };
})();
