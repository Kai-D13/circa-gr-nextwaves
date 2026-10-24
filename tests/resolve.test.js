"use strict";
// P1.1 (PM audit 24/10): chọn đơn Nextwaves trên TOÀN BỘ ứng viên, fail closed khi đọc thiếu / lỗi.
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { pos, resolve } = H.lib();

const it = H.sample("nw-stg-intertenant-PO28237814-SOBD1593858.json");
const FP = pos.grFingerprintSource(pos.normalizeGr(H.sample("gr-stg-GR03878-20261024.json")));
const CTX = { soBase: "SOBD1593858", buymedSlug: "buymed-stag", warehouseId: H.STG_CTX.warehouseId };

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const searchItemOf = (o) => ({ id: o.id, purchaseOrderId: o.purchaseOrderId, purchaseOrderNumber: o.purchaseOrderNumber, purchaseOrderStatus: o.purchaseOrderStatus, counterparty: o.counterparty, status: o.status, warehouse: o.warehouse, openShipmentCount: 1 });

// Đơn giả: refId / số lượng tuỳ chọn; mặc định là đơn khác SO.
function decoy(n, { refId = `SOBD9${String(n).padStart(6, "0")}-1`, sameFingerprint = false } = {}) {
  const order = Object.assign(H.clone(it), { id: uuid(n), purchaseOrderId: uuid(1000 + n), purchaseOrderNumber: `PO9${String(n).padStart(7, "0")}`, refId });
  const receiving = H.receivingPO28237814();
  receiving.order.id = order.id;
  receiving.order.purchaseOrderId = order.purchaseOrderId;
  receiving.order.purchaseOrderNumber = order.purchaseOrderNumber;
  if (!sameFingerprint) receiving.shipments[0].lines = receiving.shipments[0].lines.slice(1); // thiếu một dòng → lệch số lượng
  return { order, receiving };
}
const target = () => ({ order: H.clone(it), receiving: H.receivingPO28237814() });

// Server giả: map poId → {order, receiving}; fail[poId] = "throw" | số HTTP.
function world(list, { total, fail = {}, failReceiving = {} } = {}) {
  const byPo = new Map(list.map((x) => [x.order.purchaseOrderId, x]));
  const calls = { order: [], receiving: [] };
  const answer = (kind, poId, failMap) => {
    calls[kind].push(poId);
    if (failMap[poId] === "throw") return Promise.reject(new Error("timeout"));
    if (failMap[poId]) return Promise.resolve({ ok: false, status: failMap[poId], json: null });
    const x = byPo.get(poId);
    return Promise.resolve(x ? { ok: true, status: 200, json: H.clone(kind === "order" ? x.order : x.receiving) } : { ok: false, status: 404, json: null });
  };
  const items = list.map((x) => searchItemOf(x.order));
  return {
    calls,
    args: {
      search: { ok: true, status: 200, json: { items, total: total === undefined ? items.length : total } },
      ctx: CTX,
      fingerprintSource: FP,
      getOrder: (poId) => answer("order", poId, fail),
      getReceiving: (poId) => answer("receiving", poId, failReceiving),
    },
  };
}

test("1 ứng viên hợp lệ → chọn PO28237814, không khoá ghi", async () => {
  const w = world([target()]);
  const r = await resolve.resolveNwOrder(w.args);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.chosen.order.poNumber, "PO28237814");
  assert.deepEqual([r.total, r.read, r.candidates, r.verified], [1, 1, 1, 1]);
  assert.deepEqual(r.writeLocks, []);
});

test("12 ứng viên (11 đơn SO khác + đơn đúng) → đọc hết cả 12, chọn đúng", async () => {
  const list = Array.from({ length: 11 }, (_, i) => decoy(i + 1)).concat([target()]);
  const w = world(list);
  const r = await resolve.resolveNwOrder(w.args);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.chosen.order.poNumber, "PO28237814");
  assert.equal(w.calls.order.length, 12, "không cắt bớt ứng viên");
  assert.deepEqual([r.candidates, r.verified], [12, 1]);
});

test("total > số dòng đọc được (2 trang, đơn khớp có thể ở trang 2) → search_incomplete, không chọn", async () => {
  const w = world([target()], { total: 2 });
  const r = await resolve.resolveNwOrder(w.args);
  assert.deepEqual([r.ok, r.reason, r.total, r.read], [false, "search_incomplete", 2, 1]);
  assert.equal(w.calls.order.length, 0);
  const w2 = world(Array.from({ length: 50 }, (_, i) => decoy(i + 1)), { total: 51 });
  assert.equal((await resolve.resolveNwOrder(w2.args)).reason, "search_incomplete");
});

test("kết quả tìm thiếu total / items, hoặc lỗi HTTP → chặn", async () => {
  const w = world([target()]);
  delete w.args.search.json.total;
  assert.equal((await resolve.resolveNwOrder(w.args)).reason, "search_unreadable");
  const w2 = world([target()]);
  w2.args.search = { ok: false, status: 500, json: null };
  assert.equal((await resolve.resolveNwOrder(w2.args)).reason, "search_failed");
});

test("một GET ứng viên hết giờ / lỗi HTTP → chặn cả lượt dù đơn đúng vẫn đọc được", async () => {
  const list = [decoy(1), target(), decoy(2)];
  const w = world(list, { fail: { [list[0].order.purchaseOrderId]: "throw" } });
  const r = await resolve.resolveNwOrder(w.args);
  assert.deepEqual([r.ok, r.reason, r.chosen], [false, "candidate_read_failed", null]);
  assert.equal(r.poNumber, list[0].order.purchaseOrderNumber);
  const w2 = world(list, { fail: { [list[2].order.purchaseOrderId]: 503 } });
  assert.equal((await resolve.resolveNwOrder(w2.args)).reason, "candidate_read_failed");
  // Đơn cùng SO, đọc /receiving lỗi → chặn.
  const same = decoy(3, { refId: "SOBD1593858-777", sameFingerprint: false });
  const w3 = world([target(), same], { failReceiving: { [same.order.purchaseOrderId]: "throw" } });
  assert.equal((await resolve.resolveNwOrder(w3.args)).reason, "candidate_read_failed");
});

test("ứng viên thiếu trường (bên bán / kho / refId / status) → candidate_schema", async () => {
  const w = world([target()]);
  w.args.search.json.items[0].counterparty = null;
  assert.equal((await resolve.resolveNwOrder(w.args)).reason, "candidate_schema");
  const t = target();
  t.order.refId = "";
  assert.equal((await resolve.resolveNwOrder(world([t]).args)).reason, "candidate_schema");
  const t2 = target();
  t2.order.status = "";
  assert.equal((await resolve.resolveNwOrder(world([t2]).args)).reason, "candidate_schema");
});

test("0 / n ứng viên khớp: lệch số lượng → no_match; hai đơn cùng khớp → ambiguous", async () => {
  const bad = target();
  bad.receiving.shipments[0].lines = bad.receiving.shipments[0].lines.slice(1);
  const r0 = await resolve.resolveNwOrder(world([bad]).args);
  assert.deepEqual([r0.ok, r0.reason], [false, "no_match"]);
  assert.equal(r0.reports.length, 1);
  const twin = decoy(4, { refId: "SOBD1593858-999", sameFingerprint: true });
  const r2 = await resolve.resolveNwOrder(world([target(), twin]).args);
  assert.deepEqual([r2.ok, r2.reason], [false, "ambiguous"]);
});

test("loại rõ ràng: bên bán khác / kho khác / đơn huỷ; còn đơn cùng SO lệch số lượng → chọn được nhưng khoá ghi", async () => {
  const other = decoy(5, { refId: "SOBD1593858-555" });
  other.order.counterparty = { tenantSlug: "nha-cung-cap-khac" };
  const wh = decoy(6, { refId: "SOBD1593858-666" });
  wh.order.warehouse = { id: "kho-khac" };
  const cancelled = decoy(7, { refId: "SOBD1593858-777", sameFingerprint: true });
  cancelled.order.status = "cancelled";
  const r = await resolve.resolveNwOrder(world([other, wh, cancelled, target()]).args);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.chosen.order.poNumber, "PO28237814");
  assert.deepEqual(r.writeLocks, []);
  const sameSo = decoy(8, { refId: "SOBD1593858-888" }); // cùng SO, khác lần giao (lệch số lượng)
  const r2 = await resolve.resolveNwOrder(world([sameSo, target()]).args);
  assert.equal(r2.ok, true, r2.reason);
  assert.deepEqual(r2.writeLocks, ["nw_many_orders"]);
});
