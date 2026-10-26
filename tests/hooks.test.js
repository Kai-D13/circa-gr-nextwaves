"use strict";
// Hook MAIN world (pos-hook.js, nw-hook.js) chạy trong node:vm với XMLHttpRequest / fetch giả: chỉ quan sát, báo đúng tin.
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const H = require("./helpers.js");
const { pos } = H.lib();

const SRC = path.join(__dirname, "..", "src");
const GR_ID = "2de6c0ec-2ea8-4038-8616-659fa3f5820a";
const SHIP = "34e67fb9-ea76-4606-ab65-4c515934c0e1";

class FakeXHR {
  constructor() {
    this.listeners = {};
    this.status = 0;
    this.responseType = "";
    this.responseText = "";
    this.sent = null;
    this.headers = {};
  }
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k, v) {
    this.headers[k] = v;
  }
  send(body) {
    this.sent = body === undefined ? null : body;
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  finish(status, text) {
    this.status = status;
    this.responseText = text;
    for (const fn of this.listeners.loadend || []) fn();
  }
}

function loadHook(origin, file, pagePath = "/") {
  const posted = [];
  const listeners = [];
  const popListeners = [];
  const fetchCalls = [];
  const loc = { href: origin + pagePath, origin, pathname: pagePath };
  const win = {
    console,
    URL,
    location: loc,
    // history giả: pushState đổi URL như SPA (không tải lại trang).
    history: {
      pushState: (_s, _t, url) => {
        const u = new URL(url, loc.href);
        loc.href = u.href;
        loc.pathname = u.pathname;
      },
      replaceState: (_s, _t, url) => {
        const u = new URL(url, loc.href);
        loc.href = u.href;
        loc.pathname = u.pathname;
      },
    },
    XMLHttpRequest: FakeXHR,
    postMessage: (data) => posted.push(JSON.parse(JSON.stringify(data))),
    addEventListener: (type, fn) => (type === "message" ? listeners.push(fn) : type === "popstate" ? popListeners.push(fn) : null),
    fetch: async (input, init) => {
      fetchCalls.push({ input, init });
      const res = win.__nextFetch || { status: 200, text: "{}" };
      return { status: res.status, clone: () => ({ text: async () => res.text }) };
    },
  };
  win.window = win;
  vm.createContext(win);
  const g = vm.runInContext("globalThis", win);
  // Đúng danh sách file MAIN world trong manifest cho trang này (env + hook).
  const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
  const entry = manifest.content_scripts.find((c) => c.world === "MAIN" && c.js.includes(file) && c.matches.some((m) => m.startsWith(origin)));
  assert.ok(entry, `manifest không có mục MAIN cho ${file} trên ${origin}`);
  for (const f of entry.js) vm.runInContext(fs.readFileSync(path.join(SRC, f), "utf8"), win, { filename: f });
  const xhr = () => vm.runInContext("new XMLHttpRequest()", win);
  const fetch = (url, init) => vm.runInContext("fetch", win)(url, init);
  const hello = (mark) => listeners.forEach((fn) => fn({ source: g, data: { mark, type: "hello" } }));
  const history = () => vm.runInContext("window.history", win);
  const popstate = () => popListeners.forEach((fn) => fn({}));
  return { win, posted, xhr, fetch, hello, fetchCalls, history, popstate, loc };
}

const flush = () => new Promise((r) => setImmediate(r));

test("pos-hook: báo header của API POS (chỉ các header cần), không trùng; chào lại → gửi lại", () => {
  const h = loadHook("https://pos.stg.circa-v2.buymed.tech", "pos/pos-hook.js");
  assert.deepEqual(h.posted.map((m) => m.type), ["ready"]);
  for (let i = 0; i < 2; i++) {
    const x = h.xhr();
    x.open("GET", `/backend/v1/order/goods-receipt/${GR_ID}`);
    x.setRequestHeader("Authorization", "Bearer abc");
    x.setRequestHeader("x-store-id", "64a8663b-0c9e-49c6-9626-0a4c7c4bd53d");
    x.setRequestHeader("x-client-id", "1");
    x.setRequestHeader("grpc-timeout", "30S");
    x.setRequestHeader("X-Other", "khong-lay");
    x.send();
    assert.equal(x.sent, null, "lời gọi gốc vẫn chạy");
  }
  const auths = h.posted.filter((m) => m.type === "auth");
  assert.equal(auths.length, 1);
  assert.deepEqual(auths[0], { mark: "cgn/pos-hook", type: "auth", payload: { envId: "STG", headers: { authorization: "Bearer abc", "x-client-id": "1", "x-store-id": "64a8663b-0c9e-49c6-9626-0a4c7c4bd53d", "grpc-timeout": "30S" } } });
  // URL ngoài API (tra QR) không báo.
  const q = h.xhr();
  q.open("GET", "/thuocsi-warehouse/qrcode?code=X");
  q.setRequestHeader("Authorization", "Bearer khac");
  q.send();
  assert.equal(h.posted.filter((m) => m.type === "auth").length, 1);
  h.hello("cgn/pos-content");
  assert.equal(h.posted.filter((m) => m.type === "auth").length, 2);
  h.hello("trang-khac");
  assert.equal(h.posted.filter((m) => m.type === "auth").length, 2);
});

test("pos-hook: PUT …/status/COMPLETED (XHR và fetch) → báo gr-status kèm HTTP status", async () => {
  const h = loadHook("https://pos.stg.circa-v2.buymed.tech", "pos/pos-hook.js");
  const x = h.xhr();
  x.open("PUT", `https://pos.stg.circa-v2.buymed.tech/backend/v1/order/goods-receipt/${GR_ID}/status/COMPLETED`);
  x.setRequestHeader("authorization", "Bearer abc");
  x.send("{}");
  x.finish(200, "{}");
  const st = h.posted.filter((m) => m.type === "gr-status");
  assert.deepEqual(st.map((m) => m.payload), [{ envId: "STG", grId: GR_ID, status: "COMPLETED", httpStatus: 200 }]);
  h.win.__nextFetch = { status: 500, text: "{}" };
  await h.fetch(`https://pos.stg.circa-v2.buymed.tech/backend/v1/order/goods-receipt/${GR_ID}/status/COMPLETED`, { method: "PUT", headers: { authorization: "Bearer abc" } });
  await flush();
  assert.deepEqual(h.posted.filter((m) => m.type === "gr-status").map((m) => m.payload.httpStatus), [200, 500]);
  // PUT chi tiết lô (W1 của chính extension / quét tay) không phải đổi trạng thái → không báo.
  await h.fetch(`https://pos.stg.circa-v2.buymed.tech/backend/v1/order/goods-receipt/${GR_ID}/item/${GR_ID}/detail/${GR_ID}`, { method: "PUT", headers: {} });
  await flush();
  assert.equal(h.posted.filter((m) => m.type === "gr-status").length, 2);
});

// ---------- v0.2: danh sách phiếu nhận + route (Spec S5 / rev 2 R1) ----------
const POS_ORIGIN = "https://pos.stg.circa-v2.buymed.tech";
const LIST_PATH = "/danh-sach-phieu-nhan-hang";
const LIST_URL = `${POS_ORIGIN}/backend/v1/order/goods-receipt/search?query=pos_id=64a8663b-0c9e-49c6-9626-0a4c7c4bd53d,,with_items=true,with_details=true,is_count_all_status=true&limit=20&page=1&order_by=created_at=desc`;
const LIST_BODY = JSON.stringify(H.sample("pos-stg-gr-search-so-1593858.json"));
const sendList = (h, url = LIST_URL) => {
  const x = h.xhr();
  x.open("GET", url);
  x.setRequestHeader("authorization", "Bearer abc");
  x.send();
  return x;
};
const typed = (h, type) => h.posted.filter((m) => m.type === type).map((m) => m.payload);

test("pos-hook v0.2: danh sách (XHR) — reqSeq cấp LÚC GỬI; kết quả rút gọn, không body / header; chào lại → gửi lại", () => {
  const h = loadHook(POS_ORIGIN, "pos/pos-hook.js", LIST_PATH);
  const x = sendList(h);
  const req = typed(h, "gr-list-request");
  assert.equal(req.length, 1, "báo lượt mới ngay khi gửi, chưa cần response");
  assert.equal(req[0].reqSeq, 1);
  assert.equal(req[0].envId, "STG");
  assert.match(req[0].queryKey, /^\/backend\/v1\/order\/goods-receipt\/search\?limit=20&order_by=created_at=desc&page=1&query=pos_id=/);
  assert.equal(typed(h, "gr-list").length, 0);
  x.finish(200, LIST_BODY);
  const [res] = typed(h, "gr-list");
  assert.deepEqual([res.reqSeq, res.latestReqSeq, res.ok, res.total, res.page, res.limit], [1, 1, true, 1, 1, 1000]);
  assert.deepEqual(res.rows, [{ id: GR_ID, code: "GR03878", status: "WAITING_TO_RECEIVE", poId: "f7678788-28e2-47bf-b5c6-a8e10a223f7d", posId: "64a8663b-0c9e-49c6-9626-0a4c7c4bd53d" }]);
  assert.ok(!JSON.stringify(res).includes("Bearer") && !("body" in res), "không mang token / body thô");
  h.hello("cgn/pos-content");
  assert.equal(typed(h, "gr-list").length, 2, "chào lại → gửi lại danh sách gần nhất");
});

test("pos-hook v0.2: A gửi → B gửi → B về → A về: response A mang latestReqSeq = B; lỗi / sai dạng / vượt giới hạn → ok:false", () => {
  const h = loadHook(POS_ORIGIN, "pos/pos-hook.js", LIST_PATH);
  const a = sendList(h);
  const b = sendList(h, LIST_URL.replace("page=1", "page=2"));
  b.finish(200, LIST_BODY);
  a.finish(200, LIST_BODY);
  const res = typed(h, "gr-list");
  assert.deepEqual(res.map((r) => [r.reqSeq, r.latestReqSeq]), [[2, 2], [1, 2]]);
  assert.notEqual(res[0].queryKey, res[1].queryKey, "trang khác → khoá khác");
  sendList(h).finish(500, "{}");
  sendList(h).finish(200, "không phải json");
  const big = H.sample("pos-stg-gr-search-so-1593858.json");
  big.data.goods_receipts = Array.from({ length: 201 }, () => big.data.goods_receipts[0]);
  sendList(h).finish(200, JSON.stringify(big));
  sendList(h).finish(200, "x".repeat(2 * 1024 * 1024 + 1));
  assert.deepEqual(typed(h, "gr-list").slice(2).map((r) => r.ok), [false, false, false, false]);
});

test("pos-hook v0.2: không bắt danh sách ngoài trang danh sách / tìm theo SO / API khác; fetch cũng bắt (clone)", async () => {
  const h = loadHook(POS_ORIGIN, "pos/pos-hook.js", `${LIST_PATH}/${GR_ID}`);
  sendList(h).finish(200, LIST_BODY);
  assert.equal(typed(h, "gr-list-request").length, 0, "trang phiếu: không bắt");
  const h2 = loadHook(POS_ORIGIN, "pos/pos-hook.js", LIST_PATH);
  sendList(h2, `${POS_ORIGIN}/backend/v1/order/goods-receipt/search?query=so_thuocsi=1593858,pos_id=x&limit=1000`).finish(200, LIST_BODY);
  sendList(h2, `${POS_ORIGIN}/backend/v1/order/goods-receipt/${GR_ID}`).finish(200, "{}");
  assert.equal(typed(h2, "gr-list-request").length, 0);
  h2.win.__nextFetch = { status: 200, text: LIST_BODY };
  await h2.fetch(LIST_URL, { headers: { authorization: "Bearer abc" } });
  await flush();
  await flush();
  assert.deepEqual(typed(h2, "gr-list").map((r) => [r.reqSeq, r.ok, r.rows.length]), [[1, true, 1]]);
});

test("pos-hook v0.2: route — pushState / replaceState / popstate báo đổi route, app vẫn đổi URL như thường", () => {
  const h = loadHook(POS_ORIGIN, "pos/pos-hook.js", LIST_PATH);
  h.history().pushState({}, "", `${LIST_PATH}/${GR_ID}`);
  assert.equal(h.loc.pathname, `${LIST_PATH}/${GR_ID}`);
  h.history().replaceState({}, "", "/ban-hang");
  h.popstate();
  assert.deepEqual(typed(h, "route").map((r) => r.href), [`${POS_ORIGIN}${LIST_PATH}/${GR_ID}`, `${POS_ORIGIN}/ban-hang`, `${POS_ORIGIN}/ban-hang`]);
});

test("nw-hook: Authorization của API Nextwaves; POST receive-scan (XHR) → status, response, số EPC gửi", () => {
  const h = loadHook("https://circa-stg.nextwaves.app", "nw/nw-hook.js");
  const g = h.xhr();
  g.open("GET", "https://api-circa-stg.nextwaves.app/api/v1/inter-tenant-orders/receiving?q=SOBD1593858");
  g.setRequestHeader("Authorization", "Bearer nw");
  g.send();
  assert.deepEqual(h.posted.find((m) => m.type === "auth").payload, { envId: "STG", headers: { authorization: "Bearer nw" } });
  const cap = H.sample("nw-stg-receive-scan-400-PO28237814.json")[0];
  const x = h.xhr();
  x.open("POST", `https://api-circa-stg.nextwaves.app/api/v1/inter-tenant-shipments/${SHIP}/receive-scan`);
  x.setRequestHeader("Authorization", "Bearer nw");
  x.send(JSON.stringify(cap.request));
  assert.equal(h.posted.filter((m) => m.type === "receive-scan").length, 0, "chỉ báo khi có kết quả");
  x.finish(400, JSON.stringify(cap.response));
  const rs = h.posted.filter((m) => m.type === "receive-scan");
  assert.equal(rs.length, 1);
  assert.equal(rs[0].payload.shipmentId, SHIP);
  assert.equal(rs[0].payload.httpStatus, 400);
  assert.equal(rs[0].payload.sentEpcs, 14);
  assert.equal(rs[0].payload.response.params.reason, "tagged_unit_unsupported");
});

test("nw-hook: receive-scan qua fetch; API tích hợp / host lạ không báo", async () => {
  const h = loadHook("https://circa-stg.nextwaves.app", "nw/nw-hook.js");
  h.win.__nextFetch = { status: 200, text: '{"ok":true}' };
  await h.fetch(`https://api-circa-stg.nextwaves.app/api/v1/inter-tenant-shipments/${SHIP}/receive-scan`, { method: "POST", headers: { Authorization: "Bearer nw" }, body: JSON.stringify({ onMissing: "keep_open", epcs: ["A", "B"] }) });
  await flush();
  const rs = h.posted.filter((m) => m.type === "receive-scan");
  assert.deepEqual(rs.map((m) => [m.payload.httpStatus, m.payload.sentEpcs, m.payload.response.ok]), [[200, 2, true]]);
  await h.fetch("https://api-circa-stg.nextwaves.app/api/v1/integrations/circa/hub-orders/PO1/receive", { method: "POST", headers: { Authorization: "Bearer nw" }, body: "{}" });
  await h.fetch("https://example.com/api/v1/inter-tenant-shipments/x/receive-scan", { method: "POST", body: "{}" });
  await flush();
  assert.equal(h.posted.filter((m) => m.type === "receive-scan").length, 1);
});

test("tra QR POS: đúng UID → sản phẩm / lô / hạn; không có / nhiều bản ghi khác nhau → không đoán", () => {
  const real = H.sample("pos-stg-qrcode-uid-circa.json");
  const r = pos.normalizeQrLookup(real[0].response, "1792145819958AA1");
  assert.deepEqual([r.ok, r.productId, r.lot, r.expiredDate], [true, "1110", "261009DHAUS", "12-12-2028"]);
  assert.equal(pos.normalizeQrLookup(real[0].response, "KHAC").reason, "not_found");
  assert.equal(pos.normalizeQrLookup({ status: "OK", data: [] }, "X").reason, "not_found");
  assert.equal(pos.normalizeQrLookup({ status: "NOT_FOUND", data: [] }, "X").reason, "NOT_FOUND");
  const d = real[0].response.data[0];
  assert.equal(pos.normalizeQrLookup({ status: "OK", data: [d, Object.assign({}, d, { lot: "LOT2" })] }, d.uniqueId).reason, "ambiguous");
  assert.equal(pos.normalizeQrLookup({ status: "OK", data: [d, d] }, d.uniqueId).ok, true);
});
