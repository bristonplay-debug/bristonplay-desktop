/* BristonPlay LG — identidade do aparelho e conversa com o servidor (mesma API do app Android) */
var Device = (function () {
  "use strict";

  var CFG = window.BP_CONFIG;

  /** Chamada a um serviço do webOS (luna). Sem webOS (navegador), devolve null. */
  function luna(uri, params, timeoutMs) {
    return new Promise(function (resolve) {
      if (typeof window.PalmServiceBridge === "undefined") return resolve(null);
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, timeoutMs || 2500);
      try {
        var b = new window.PalmServiceBridge();
        b.onservicecallback = function (msg) {
          if (done) return;
          done = true; clearTimeout(t);
          try { resolve(JSON.parse(msg)); } catch (e) { resolve(null); }
        };
        b.call(uri, JSON.stringify(params || {}));
      } catch (e) { done = true; clearTimeout(t); resolve(null); }
    });
  }

  function macFrom(bytes) {
    var p = [];
    for (var i = 0; i < 6; i++) p.push(U.pad(bytes[i].toString(16).toUpperCase(), 2));
    return p.join(":");
  }
  function keyFrom(bytes) {
    var n = ((bytes[6] << 24) >>> 0) + (bytes[7] << 16) + (bytes[8] << 8) + bytes[9];
    return U.pad(String(n % 1000000), 6);
  }

  /**
   * MAC e chave do app. Base: ID único da TV LG (LGUDID) + id do app, igual à lógica do Android
   * (assim não muda se a TV trocar de Wi-Fi para cabo, nem ao reinstalar o app).
   * Sem LGUDID, usa um sorteio guardado na TV.
   */
  function identity() {
    var saved = U.get("identity", null);
    if (saved && saved.mac && saved.key) return Promise.resolve(saved);
    if (window.BPDesk && window.BPDesk.seed) {
      var b = U.sha256(window.BPDesk.seed + CFG.appId);
      var did = { mac: macFrom(b), key: keyFrom(b), model: window.BPDesk.model || "Computador" };
      U.set("identity", did);
      return Promise.resolve(did);
    }
    return Promise.all([
      luna("luna://com.webos.service.sm/deviceid/getIDs", { idType: ["LGUDID"] }),
      luna("luna://com.webos.service.tv.systemproperty/getSystemInfo", { keys: ["modelName", "firmwareVersion", "sdkVersion"] }),
    ]).then(function (r) {
      var udid = null, netMac = null, model = "LG webOS";
      try { var ids = r[0] && r[0].idList; if (ids && ids.length) udid = ids[0].idValue; } catch (e) { /* */ }
      try { if (r[1] && r[1].modelName) model = "LG " + r[1].modelName + (r[1].sdkVersion ? " (webOS " + r[1].sdkVersion + ")" : ""); } catch (e) { /* */ }
      var seed = udid || netMac;
      if (!seed) {
        seed = U.get("seed", null);
        if (!seed) { seed = String(Math.random()) + Date.now() + navigator.userAgent; U.set("seed", seed); }
      }
      var bytes = U.sha256(seed + CFG.appId);
      var id = { mac: macFrom(bytes), key: keyFrom(bytes), model: model };
      U.set("identity", id);
      return id;
    });
  }

  function post(fn, body) {
    return U.http({
      method: "POST",
      url: CFG.apiBase + "/" + fn,
      headers: { "Content-Type": "application/json", apikey: CFG.anonKey },
      body: JSON.stringify(body),
      timeout: 20000,
    }).then(function (res) {
      var data = null;
      try { data = JSON.parse(res.text); } catch (e) { /* */ }
      if (res.status >= 200 && res.status < 300 && data) return data;
      var err = new Error((data && (data.message || data.error)) || ("HTTP " + res.status));
      err.code = data && data.error; err.status = res.status;
      throw err;
    });
  }

  function base(id) {
    return { mac: id.mac, device_key: id.key, app_version: CFG.version, version_code: CFG.versionCode };
  }
  function register(id, resellerCode) {
    var b = base(id); b.model = id.model;
    if (resellerCode) b.reseller_code = resellerCode;
    return post("device-register", b);
  }
  function check(id) {
    return post("device-check", base(id)).catch(function (e) {
      if (e.code === "not_found") return register(id);
      throw e;
    });
  }

  return { identity: identity, register: register, check: check, luna: luna };
})();
