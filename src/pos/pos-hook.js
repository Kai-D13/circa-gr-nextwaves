/*
 * MAIN world trên trang POS. CHỈ QUAN SÁT, không gọi API, không ghi gì:
 *  - bắt header mà chính app POS gửi tới API (authorization, x-client-id, x-store-id, grpc-timeout…) → báo content script;
 *  - báo kết quả lời gọi đổi trạng thái phiếu nhận (PUT …/goods-receipt/<id>/status/<S>) để biết dược sĩ đã bấm HOÀN THÀNH;
 *  - (v0.2) trang danh sách phiếu nhận: đánh số lượt `reqSeq` LÚC GỬI request danh sách của chính trang, báo "đang có lượt mới",
 *    rồi báo kết quả rút gọn {id, code, status, poId, posId} của lượt đó (Spec v0.2 S5 / R1). Không gửi body thô / header;
 *  - (v0.2) báo đổi route của app (pushState / replaceState / popstate) để content không phải dò URL liên tục.
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
  // Danh sách phiếu nhận (v0.2): giới hạn để không làm nặng trang; vượt → báo ok:false (content không hiện nút).
  const LIST_PAGE_RE = /^\/danh-sach-phieu-nhan-hang\/?$/i;
  const LIST_MAX_BYTES = 2 * 1024 * 1024;
  const LIST_MAX_ROWS = 200;
  let listSeq = 0; // reqSeq cấp lúc GỬI
  let lastList = null; // kết quả gần nhất — gửi lại khi content chào

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

  // Content script (ISOLATED) có thể nạp sau lời gọi API đầu tiên → nó chào, hook gửi lại header + danh sách gần nhất.
  window.addEventListener("message", (e) => {
    try {
      if (e.source !== window || !e.data || e.data.mark !== "cgn/pos-content" || e.data.type !== "hello") return;
      if (lastAuth) post("auth", lastAuth);
      if (lastList) post("gr-list", lastList);
    } catch (_) {
      /* bỏ qua */
    }
  });

  // ---- danh sách phiếu nhận ----
  function listCallOf(url, method) {
    if (!LIST_PAGE_RE.test(location.pathname)) return null;
    for (const e of ENVS) {
      const c = L.posGrListCall(url, method, e);
      if (c) return { envId: e.id, queryKey: c.queryKey };
    }
    return null;
  }

  function beginList(call) {
    listSeq += 1;
    post("gr-list-request", { envId: call.envId, reqSeq: listSeq, queryKey: call.queryKey });
    return listSeq;
  }

  const str = (x) => (x === undefined || x === null ? "" : String(x));
  const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

  // `latestReqSeq` = lượt mới nhất đã GỬI tính tới lúc response này về: content chỉ nhận response của lượt mới nhất (R1).
  function finishList(call, reqSeq, status, text) {
    const base = { envId: call.envId, reqSeq, latestReqSeq: listSeq, queryKey: call.queryKey };
    let msg = Object.assign({ ok: false }, base);
    try {
      if (status >= 200 && status < 300 && typeof text === "string" && text.length <= LIST_MAX_BYTES) {
        const j = JSON.parse(text);
        const d = j && j.data ? j.data : j;
        const list = d && Array.isArray(d.goods_receipts) ? d.goods_receipts : null;
        if (list && list.length <= LIST_MAX_ROWS) {
          const rows = list.map((g) => ({ id: str(g && g.id), code: str(g && g.code), status: str(g && g.status), poId: str(g && g.purchase_order_id), posId: str(g && g.pos_info && g.pos_info.id) }));
          msg = Object.assign({ ok: true, page: num(d.page), limit: num(d.limit), total: num(d.total), rows }, base);
        }
      }
    } catch (_) {
      msg = Object.assign({ ok: false }, base);
    }
    lastList = msg;
    post("gr-list", msg);
  }

  // ---- route của app (SPA) ----
  const postRoute = () => post("route", { href: location.href });
  try {
    for (const fn of ["pushState", "replaceState"]) {
      const orig = window.history && window.history[fn];
      if (typeof orig !== "function") continue;
      window.history[fn] = function () {
        const r = orig.apply(this, arguments);
        postRoute();
        return r;
      };
    }
    window.addEventListener("popstate", postRoute);
  } catch (_) {
    /* hook không được làm hỏng trang */
  }

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
          const lc = listCallOf(m.url, m.method);
          if (lc) {
            const seq = beginList(lc);
            const xhr = this;
            this.addEventListener("loadend", () => {
              let text = null;
              try {
                if (xhr.responseType === "" || xhr.responseType === "text") text = xhr.responseText;
                else if (xhr.responseType === "json") text = JSON.stringify(xhr.response);
              } catch (_) {
                text = null;
              }
              finishList(lc, seq, xhr.status, text);
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
      let list = null;
      try {
        const isReq = typeof Request !== "undefined" && input instanceof Request;
        const url = new URL(typeof input === "string" ? input : isReq ? input.url : String((input && input.url) || ""), location.href).href;
        const method = (init && init.method) || (isReq ? input.method : "GET");
        if (apiEnvOf(url)) {
          meta = { url, method };
          reportAuth(url, Object.assign(isReq ? headersToObject(input.headers) : {}, headersToObject(init && init.headers)));
          const lc = listCallOf(url, method);
          if (lc) list = { lc, seq: beginList(lc) };
        }
      } catch (_) {
        meta = null;
        list = null;
      }
      const p = origFetch.apply(this, arguments);
      try {
        if (meta && /^PUT$/i.test(meta.method) && p && typeof p.then === "function") {
          p.then((res) => reportStatusCall(meta.url, meta.method, res && res.status), () => reportStatusCall(meta.url, meta.method, 0));
        }
        // Đọc bản sao response (clone ngay trong then đầu tiên, trước khi trang đọc body).
        if (list && p && typeof p.then === "function") {
          p.then(
            (res) => {
              let copy = null;
              try {
                copy = res && typeof res.clone === "function" ? res.clone() : null;
              } catch (_) {
                copy = null;
              }
              if (!copy) return finishList(list.lc, list.seq, res ? res.status : 0, null);
              copy.text().then(
                (t) => finishList(list.lc, list.seq, res.status, t),
                () => finishList(list.lc, list.seq, res.status, null)
              );
            },
            () => finishList(list.lc, list.seq, 0, null)
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
