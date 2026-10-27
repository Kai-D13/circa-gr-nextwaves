"use strict";
// Nạp mẫu thật trong samples/ cho cặp GR03878 ↔ PO28237814.
// /receiving, PO và phiếu gửi sau khi nhận: mẫu THẬT lượt nhận 25/10 23:46 (T3, receive-scan 200).
// Còn DỰNG LẠI: 10/12 kết quả tra QR trên POS (chưa có capture tab POS).
const fs = require("node:fs");
const path = require("node:path");

const SAMPLES = path.join(__dirname, "..", "samples");
const LIB = path.join(__dirname, "..", "src", "lib");

function sample(name) {
  return JSON.parse(fs.readFileSync(path.join(SAMPLES, name), "utf8"));
}

function lib() {
  return {
    env: require(path.join(LIB, "env.js")),
    keys: require(path.join(LIB, "keys.js")),
    pos: require(path.join(LIB, "pos-model.js")),
    nw: require(path.join(LIB, "nw-model.js")),
    match: require(path.join(LIB, "match.js")),
    plan: require(path.join(LIB, "plan.js")),
    apply: require(path.join(LIB, "apply.js")),
    resolve: require(path.join(LIB, "resolve.js")),
  };
}

const clone = (x) => JSON.parse(JSON.stringify(x));

// GET /inter-tenant-orders/purchase-orders/<PO28237814>/receiving TRƯỚC khi nhận — THẬT (25/10 23:45:25).
// Đến 25/10 các test dùng bản dựng lại từ inter-tenant + phiếu gửi; qua parser, bản dựng lại trùng hoàn toàn bản thật.
function receivingPO28237814() {
  return clone(sample("nw-stg-receiving-PO28237814-T3-truoc-20261025.json"));
}

// GET /purchase-orders/<PO28237814> SAU KHI NHẬN — THẬT (25/10 23:46:05, ngay sau receive-scan 200). Biên nhận GRN96438872.
const RECEIPT_ID = "7bec38d2-754b-4c15-8001-631c93671a10";
function poDetailPO28237814Received() {
  return clone(sample("nw-stg-po-PO28237814-T3-sau-20261025.json"));
}

// GET /inter-tenant-shipments/<34e67fb9> SAU KHI NHẬN — THẬT (25/10 23:46:05): status received, receivedEpcs từng dòng.
function shipmentPO28237814Received() {
  return clone(sample("nw-stg-shipment-34e67fb9-T3-sau-20261025.json"));
}

// Tra QR trên POS cho 12 UID: 2 kết quả THẬT (samples/pos-stg-qrcode-uid-circa.json), 10 DỰNG LẠI từ lô của dòng giao.
// Soffell UID thứ hai (1792379055069AA1) giả định lô còn lại của GR03878 (261016KHASUFDB, 06-06-2027). Bằng chứng gián tiếp:
// lượt thật 25/10 23:46 hiện kế hoạch #60070071, và tests/t3-real.test.js tính lại đúng mã đó với bảng tra này.
function qrByUidPO28237814() {
  const real = sample("pos-stg-qrcode-uid-circa.json");
  const out = {};
  for (const r of real) {
    const d = r.response.data[0];
    out[d.uniqueId] = { ok: true, productId: d.productId, lot: d.lot, expiredDate: d.expiredDate };
  }
  const it = sample("nw-stg-intertenant-PO28237814-SOBD1593858.json");
  const sh = sample("nw-stg-shipment-34e67fb9-PO28237814.json");
  const uidByEpc = new Map(it.units.map((u) => [u.epc, u.uid]));
  for (const l of sh.lines) {
    const pid = Number(l.product.sku.split("-")[1]);
    for (const e of l.epcs) {
      const uid = uidByEpc.get(e);
      if (out[uid]) continue;
      if (l.batch) {
        const [y, m, d] = l.batch.expiryDate.split("-");
        out[uid] = { ok: true, productId: pid, lot: l.batch.batchNumber, expiredDate: `${d}-${m}-${y}` };
      } else {
        out[uid] = { ok: true, productId: pid, lot: "261016KHASUFDB", expiredDate: "06-06-2027" };
      }
    }
  }
  return out;
}

const STG_CTX = { soBase: "SOBD1593858", buymedSlug: "buymed-stag", warehouseId: "82bf85e4-84e2-4158-ae27-1aaa6fe1bc57" };

const STORE_2222 = "64a8663b-0c9e-49c6-9626-0a4c7c4bd53d";

// ---------- hook MAIN world (pos-hook.js, nw-hook.js) trong node:vm với XMLHttpRequest / fetch giả ----------
const vm = require("node:vm");
const assert = require("node:assert/strict");
const SRC = path.join(__dirname, "..", "src");

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

module.exports = { FakeXHR, loadHook, sample, lib, clone, receivingPO28237814, poDetailPO28237814Received, shipmentPO28237814Received, qrByUidPO28237814, STG_CTX, STORE_2222, RECEIPT_ID };
