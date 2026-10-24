"use strict";
// Nạp mẫu thật trong samples/ và dựng dữ liệu "sau khi nhận" cho cặp GR03878 ↔ PO28237814.
// PHẦN DỰNG LẠI (chưa có lượt nhận thành công theo đường đơn liên kết, K1): PO detail sau khi nhận và 10/12 kết quả tra QR.
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

// /receiving của PO28237814 — DỰNG LẠI từ inter-tenant (units: epc+uid) + shipment (dòng giao: unit, epcs). Chưa có mẫu thật.
function receivingPO28237814() {
  const it = sample("nw-stg-intertenant-PO28237814-SOBD1593858.json");
  const sh = sample("nw-stg-shipment-34e67fb9-PO28237814.json");
  const uidByEpc = new Map(it.units.map((u) => [u.epc, u.uid]));
  return {
    order: { id: it.id, purchaseOrderId: it.purchaseOrderId, purchaseOrderNumber: it.purchaseOrderNumber, status: it.status, counterparty: it.counterparty },
    purchaseOrderStatus: it.purchaseOrderStatus,
    warehouse: it.warehouse,
    shipments: [
      {
        id: sh.id,
        shipmentNumber: sh.shipmentNumber,
        status: sh.status,
        needsAccept: true,
        lines: sh.lines.map((l) => ({
          lineId: l.lineId,
          productId: l.productId,
          product: { id: l.product.id, title: l.product.title, sku: l.product.sku },
          quantity: l.quantity,
          unit: l.unit,
          tagged: true,
          units: l.epcs.map((e) => ({ epc: e, unitUid: uidByEpc.get(e) })),
        })),
      },
    ],
    receipts: [],
  };
}

// GET /purchase-orders/<PO28237814> SAU KHI NHẬN — DỰNG LẠI: lấy PO detail thật (trước khi nhận) và điền receivedUnits = 12 UID dự kiến.
// receipts[] dựng theo cấu trúc mẫu thật PO88508353 ({id, receiptNumber, warehouseId, receivedAt, items[{epcs}]}).
const RECEIPT_ID = "00000000-0000-4000-8000-00000000d1a1";
function poDetailPO28237814Received() {
  const po = clone(sample("nw-stg-po-PO28237814-detail.json"));
  const it = sample("nw-stg-intertenant-PO28237814-SOBD1593858.json");
  const sh = sample("nw-stg-shipment-34e67fb9-PO28237814.json");
  const uidByEpc = new Map(it.units.map((u) => [u.epc, u.uid]));
  po.status = "RECEIVED";
  const receiptItems = [];
  for (const item of po.items) {
    const epcs = sh.lines.filter((l) => l.product.sku === item.productSku).flatMap((l) => l.epcs);
    item.receivedUnits = epcs.map((e) => ({ epc: e, unitUid: uidByEpc.get(e), receiptId: RECEIPT_ID, receiptNumber: "GRN-DUNG-LAI" }));
    item.receivedQuantity = item.quantity;
    item.remainingQuantity = 0;
    receiptItems.push({ id: `ri-${item.id}`, receiptId: RECEIPT_ID, purchaseOrderItemId: item.id, quantity: epcs.length, epcs });
  }
  po.receipts = [{ id: RECEIPT_ID, receiptNumber: "GRN-DUNG-LAI", purchaseOrderId: po.id, warehouseId: po.warehouseId, receivedAt: "2026-10-24T15:00:00.000Z", items: receiptItems }];
  return po;
}

// GET /inter-tenant-shipments/<34e67fb9> SAU KHI NHẬN — DỰNG LẠI: mẫu thật trước khi nhận + receivedEpcs = epcs của từng dòng.
function shipmentPO28237814Received() {
  const sh = clone(sample("nw-stg-shipment-34e67fb9-PO28237814.json"));
  sh.status = "received";
  for (const l of sh.lines) l.receivedEpcs = l.epcs.slice();
  return sh;
}

// Tra QR trên POS cho 12 UID: 2 kết quả THẬT (samples/pos-stg-qrcode-uid-circa.json), 10 DỰNG LẠI từ lô của dòng giao.
// Soffell UID thứ hai (1792379055069AA1) giả định lô còn lại của GR03878 (261016KHASUFDB, 06-06-2027) — chưa kiểm thật.
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
