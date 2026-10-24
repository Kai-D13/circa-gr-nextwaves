/*
 * MAIN world trên trang POS. CHỈ QUAN SÁT, không gọi API, không ghi gì:
 *  - bắt header mà chính app POS gửi tới API (authorization, x-client-id, x-store-id, grpc-timeout…) → báo content script;
 *  - báo kết quả lời gọi đổi trạng thái phiếu nhận (PUT …/goods-receipt/<id>/status/<S>) để biết dược sĩ đã bấm HOÀN THÀNH.
 * Token chỉ đi trong bộ nhớ trang (trang vốn đã có token này); không ghi ra đâu cả.
 */
(function () {
  "use strict";
  if (window.__CGN_POS_HOOK__) return;
  window.__CGN_POS_HOOK__ = true;
  const L = window.__CGN__ && window.__CGN__.env;
  if (!L) return;
  const MARK = "cgn/pos-hook";
  const ENVS = Object.values(L.ENVS);
  const WANTED = ["authorization", "x-client-id", "x-store-id", "grpc-timeout", "accept-language"];
  let lastAuthKey = "";
  let lastAuth = null;

  function post(type, payload) {
    try {
      window.postMessage({ mark: MARK, type, payload }, location.origin);
    } catch (_) {
      /* hook không được làm hỏng trang */
    }
  }

  const apiEnvOf = (url) => ENVS.find((e) => L.isPosApiUrl(url, e)) || null;

  function reportAuth(url, headers) {
    const env = apiEnvOf(url);
    if (!env || !headers || !headers.authorization) return;
    const picked = {};
    for (const k of WANTED) if (headers[k]) picked[k] = String(headers[k]);
    const key = env.id + "|" + JSON.stringify(picked);
    if (key === lastAuthKey) return;
    lastAuthKey = key;
    lastAuth = { envId: env.id, headers: picked };
    post("auth", lastAuth);
  }

  // Content script (ISOLATED) có thể nạp sau lời gọi API đầu tiên → nó chào, hook gửi lại header gần nhất.
  window.addEventListener("message", (e) => {
    try {
      if (e.source !== window || !e.data || e.data.mark !== "cgn/pos-content" || e.data.type !== "hello") return;
      if (lastAuth) post("auth", lastAuth);
    } catch (_) {
      /* bỏ qua */
    }
  });

  function reportStatusCall(url, method, status) {
    for (const e of ENVS) {
      const c = L.posGrStatusCall(url, method, e);
      if (c) return post("gr-status", { envId: e.id, grId: c.grId, status: c.status, httpStatus: Number(status) || 0 });
    }
  }

  function headersToObject(h) {
    const out = {};
    try {
      if (!h) return out;
      if (typeof Headers !== "undefined" && h instanceof Headers) h.forEach((v, k) => (out[k.toLowerCase()] = v));
      else if (Array.isArray(h)) for (const [k, v] of h) out[String(k).toLowerCase()] = v;
      else for (const k of Object.keys(h)) out[k.toLowerCase()] = h[k];
    } catch (_) {
      /* bỏ qua */
    }
    return out;
  }

  // ---- XMLHttpRequest (axios của POS) ----
  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const open = XHR.prototype.open;
    const setHeader = XHR.prototype.setRequestHeader;
    const send = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      try {
        this.__cgn = { method: String(method || "GET"), url: new URL(String(url || ""), location.href).href, headers: {} };
      } catch (_) {
        this.__cgn = null;
      }
      return open.apply(this, arguments);
    };
    XHR.prototype.setRequestHeader = function (k, v) {
      try {
        if (this.__cgn) this.__cgn.headers[String(k).toLowerCase()] = v;
      } catch (_) {
        /* bỏ qua */
      }
      return setHeader.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      try {
        const m = this.__cgn;
        if (m && apiEnvOf(m.url)) {
          reportAuth(m.url, m.headers);
          if (/^PUT$/i.test(m.method)) this.addEventListener("loadend", () => reportStatusCall(m.url, m.method, this.status));
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
          meta = { url, method };
          reportAuth(url, Object.assign(isReq ? headersToObject(input.headers) : {}, headersToObject(init && init.headers)));
        }
      } catch (_) {
        meta = null;
      }
      const p = origFetch.apply(this, arguments);
      try {
        if (meta && /^PUT$/i.test(meta.method) && p && typeof p.then === "function") {
          p.then((res) => reportStatusCall(meta.url, meta.method, res && res.status), () => reportStatusCall(meta.url, meta.method, 0));
        }
      } catch (_) {
        /* bỏ qua */
      }
      return p;
    };
  }

  post("ready", { at: Date.now() });
})();
