/*
 * MAIN world trên web Nextwaves. CHỈ QUAN SÁT, không gọi API, không ghi gì:
 *  - bắt header Authorization mà chính web Nextwaves gửi tới API (token sống ~1 giờ, web tự làm mới) → báo content script;
 *  - báo kết quả "Xác nhận nhận hàng" = POST …/inter-tenant-shipments/<id>/receive-scan (status + body response + số EPC gửi).
 * Không đụng /integrations/circa/*.
 */
(function () {
  "use strict";
  if (window.__CGN_NW_HOOK__) return;
  window.__CGN_NW_HOOK__ = true;
  const L = window.__CGN__ && window.__CGN__.env;
  if (!L) return;
  const MARK = "cgn/nw-hook";
  const ENVS = Object.values(L.ENVS);
  const MAX_TEXT = 2000000;
  let lastAuthKey = "";
  let lastAuth = null;

  function post(type, payload) {
    try {
      window.postMessage({ mark: MARK, type, payload }, location.origin);
    } catch (_) {
      /* hook không được làm hỏng trang */
    }
  }

  const apiEnvOf = (url) => ENVS.find((e) => L.isNwApiUrl(url, e)) || null;

  function reportAuth(url, auth) {
    const env = apiEnvOf(url);
    if (!env || !auth) return;
    const key = env.id + "|" + auth;
    if (key === lastAuthKey) return;
    lastAuthKey = key;
    lastAuth = { envId: env.id, headers: { authorization: String(auth) } };
    post("auth", lastAuth);
  }

  // Content script (ISOLATED) có thể nạp sau lời gọi API đầu tiên → nó chào, hook gửi lại header gần nhất.
  window.addEventListener("message", (e) => {
    try {
      if (e.source !== window || !e.data || e.data.mark !== "cgn/nw-content" || e.data.type !== "hello") return;
      if (lastAuth) post("auth", lastAuth);
    } catch (_) {
      /* bỏ qua */
    }
  });

  function epcCountOf(body) {
    try {
      const j = typeof body === "string" ? JSON.parse(body) : null;
      return j && Array.isArray(j.epcs) ? j.epcs.length : null;
    } catch (_) {
      return null;
    }
  }

  function reportReceiveScan(url, method, status, text, requestBody) {
    for (const e of ENVS) {
      const c = L.nwReceiveScanCall(url, method, e);
      if (!c) continue;
      let json = null;
      try {
        if (typeof text === "string" && text.length <= MAX_TEXT) json = JSON.parse(text);
      } catch (_) {
        json = null;
      }
      return post("receive-scan", { envId: e.id, shipmentId: c.shipmentId, httpStatus: Number(status) || 0, response: json, sentEpcs: epcCountOf(requestBody) });
    }
  }

  function headerOf(h, name) {
    try {
      if (!h) return null;
      if (typeof Headers !== "undefined" && h instanceof Headers) return h.get(name);
      if (Array.isArray(h)) {
        const f = h.find(([k]) => String(k).toLowerCase() === name);
        return f ? f[1] : null;
      }
      for (const k of Object.keys(h)) if (k.toLowerCase() === name) return h[k];
    } catch (_) {
      /* bỏ qua */
    }
    return null;
  }

  // ---- XMLHttpRequest (axios của web Nextwaves) ----
  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const open = XHR.prototype.open;
    const setHeader = XHR.prototype.setRequestHeader;
    const send = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      try {
        this.__cgn = { method: String(method || "GET"), url: new URL(String(url || ""), location.href).href, auth: null };
      } catch (_) {
        this.__cgn = null;
      }
      return open.apply(this, arguments);
    };
    XHR.prototype.setRequestHeader = function (k, v) {
      try {
        if (this.__cgn && String(k).toLowerCase() === "authorization") this.__cgn.auth = v;
      } catch (_) {
        /* bỏ qua */
      }
      return setHeader.apply(this, arguments);
    };
    XHR.prototype.send = function (body) {
      try {
        const m = this.__cgn;
        if (m && apiEnvOf(m.url)) {
          reportAuth(m.url, m.auth);
          if (/^POST$/i.test(m.method) && /\/receive-scan\/?$/i.test(new URL(m.url).pathname)) {
            const reqBody = typeof body === "string" ? body : null;
            this.addEventListener("loadend", () => {
              let text = null;
              try {
                text = this.responseType === "" || this.responseType === "text" ? this.responseText : this.responseType === "json" ? JSON.stringify(this.response) : null;
              } catch (_) {
                text = null;
              }
              reportReceiveScan(m.url, m.method, this.status, text, reqBody);
            });
          }
        }
      } catch (_) {
        /* bỏ qua */
      }
      return send.apply(this, arguments);
    };
  }

  // ---- fetch ----
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input, init) {
      let meta = null;
      try {
        const isReq = typeof Request !== "undefined" && input instanceof Request;
        const url = new URL(typeof input === "string" ? input : isReq ? input.url : String((input && input.url) || ""), location.href).href;
        const method = (init && init.method) || (isReq ? input.method : "GET");
        if (apiEnvOf(url)) {
          reportAuth(url, headerOf(init && init.headers, "authorization") || (isReq ? headerOf(input.headers, "authorization") : null));
          if (/^POST$/i.test(method) && /\/receive-scan\/?$/i.test(new URL(url).pathname)) meta = { url, method, body: init && typeof init.body === "string" ? init.body : null };
        }
      } catch (_) {
        meta = null;
      }
      const p = origFetch.apply(this, arguments);
      try {
        if (meta && p && typeof p.then === "function") {
          p.then(
            (res) => res.clone().text().then((t) => reportReceiveScan(meta.url, meta.method, res.status, t, meta.body), () => reportReceiveScan(meta.url, meta.method, res.status, null, meta.body)),
            () => reportReceiveScan(meta.url, meta.method, 0, null, meta.body)
          );
        }
      } catch (_) {
        /* bỏ qua */
      }
      return p;
    };
  }

  post("ready", { at: Date.now() });
})();
