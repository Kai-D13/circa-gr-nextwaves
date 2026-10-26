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

module.exports = { sample, lib, clone, receivingPO28237814, poDetailPO28237814Received, shipmentPO28237814Received, qrByUidPO28237814, STG_CTX, STORE_2222, RECEIPT_ID };
