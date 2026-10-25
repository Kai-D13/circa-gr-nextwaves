"use strict";
// T1 lần 2 (operator 25/10, v0.1.5, phiên đăng nhập thật): hai response tìm kiếm thật chạy qua đúng parser của extension.
// Khung thật đã báo: POS "Đã khớp đơn Nextwaves — chờ nhận hàng", không khoá; Nextwaves "Tìm theo SOBD1593858: total 1, đã đọc 1;
// ứng viên Buymed cùng kho 1; refId đúng SO 1."
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { pos, nw, resolve } = H.lib();

const GR = "2de6c0ec-2ea8-4038-8616-659fa3f5820a";
const POS_T1 = "pos-stg-gr-search-so-1593858-T1-20261025.json";
const NW_T1 = "nw-stg-receiving-search-q-SOBD1593858-T1-20261025.json";

test("T1 thật — tìm GR theo SO 1593858: đọc đủ một trang, chỉ GR03878, không khoá ghi", () => {
  const j = H.sample(POS_T1);
  assert.deepEqual([j.data.total, j.data.page, j.data.limit, j.data.goods_receipts.length], [1, 1, 1000, 1]);
  const check = pos.checkSoGrs(j, H.STORE_2222);
  assert.deepEqual([check.ok, check.total, check.read, check.list.map((g) => [g.code, g.status])], [true, 1, 1, [["GR03878", "WAITING_TO_RECEIVE"]]]);
  assert.equal(pos.soWriteLock(check, GR), null);
  // GR03878 trong response T1 trùng mẫu 24/10 mà mã đã dựng theo (bỏ updated_at).
  const core = (g) => JSON.stringify(g, (k, v) => (k === "updated_at" ? undefined : v));
  assert.equal(core(j.data.goods_receipts[0]), core(H.sample("pos-stg-gr-search-so-1593858.json").data.goods_receipts[0]));
});

test("T1 thật — tìm đơn Nextwaves theo SOBD1593858: total 1, chọn PO28237814, không khoá ghi", async () => {
  const j = H.sample(NW_T1);
  const page = nw.normalizeReceivingSearchPage(j);
  assert.equal(page.total, 1);
  assert.deepEqual(page.items.map((i) => [i.poNumber, i.poStatus, i.status, i.slug, i.warehouseId]), [["PO28237814", "CONFIRMED", "shipped", "buymed-stag", H.STG_CTX.warehouseId]]);
  // Đơn và /receiving của ứng viên: mẫu thật trước đó (T1 không chụp hai GET này).
  const order = H.sample("nw-stg-intertenant-PO28237814-SOBD1593858.json");
  const calls = [];
  const r = await resolve.resolveNwOrder({
    search: { ok: true, status: 200, json: j },
    ctx: H.STG_CTX,
    fingerprintSource: pos.grFingerprintSource(pos.normalizeGr(H.sample("gr-stg-GR03878-20261024.json"))),
    getOrder: (poId) => (calls.push(poId), Promise.resolve(poId === order.purchaseOrderId ? { ok: true, status: 200, json: H.clone(order) } : { ok: false, status: 404, json: null })),
    getReceiving: () => Promise.resolve({ ok: true, status: 200, json: H.receivingPO28237814() }),
  });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual([r.total, r.read, r.candidates, r.verified], [1, 1, 1, 1]);
  assert.equal(r.chosen.order.poNumber, "PO28237814");
  assert.deepEqual(r.writeLocks, []);
  assert.deepEqual(calls, ["55bd221f-65de-4a4d-8a77-40c568a6f176"]);
});
