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

function loadHook(origin, file) {
  const posted = [];
  const listeners = [];
  const fetchCalls = [];
  const win = {
    console,
    URL,
    location: { href: origin + "/", origin },
    XMLHttpRequest: FakeXHR,
    postMessage: (data) => posted.push(JSON.parse(JSON.stringify(data))),
    addEventListener: (type, fn) => type === "message" && listeners.push(fn),
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
  return { win, posted, xhr, fetch, hello, fetchCalls };
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
