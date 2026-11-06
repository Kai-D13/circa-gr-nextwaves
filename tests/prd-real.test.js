"use strict";
// v0.3.1 — dữ liệu PRODUCTION thật 06/11/2026 (đọc chỉ đọc qua Chrome của operator; samples/*prd*-20261106.json, bỏ tên):
//  - dòng giao / chi tiết PO Nextwaves production để product.sku trống ở 29/32 dòng → mã sản phẩm POS lấy từ barcode / externalProductId /
//    productIdentifier "CIRCA-<id>" (đã đối chiếu tra QR POS: 61/61 UID đúng sản phẩm);
//  - SO 38565378 tách giao: hai đơn Nextwaves cùng SO (PO-2026-000001 "-16025426", PO-2026-000003 "-16025427"), POS tách PO con -P1 / -P2.
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { keys, nw: N, match: M, resolve, env: E } = H.lib();

const FP = H.sample("pos-prd-gr-fingerprint-20261106.json");
const RCV2 = H.sample("nw-prd-receiving-PO-2026-000002-20261106.json");
const RCV1 = H.sample("nw-prd-receiving-PO-2026-000001-20261106.json");
const RCV3 = H.sample("nw-prd-receiving-PO-2026-000003-20261106.json");
const SPLIT = H.sample("prd-so-split-SOBD38565378-20261106.json");
const FLORITA = "c476efb2-415c-429a-978e-d389b4b06607";
const PRD = E.ENVS.PRD;

test("posProductIdOf: sku CIRCA-<id> / productIdentifier / externalProductId / barcode; mọi nguồn có mặt phải trùng; lệch hoặc không có → rỗng", () => {
  assert.equal(keys.posProductIdOf({ sku: "CIRCA-1110", barcode: null }), "1110", "staging: chỉ sku");
  assert.equal(keys.posProductIdOf({ sku: null, barcode: "4117" }), "4117", "production: sku trống, barcode");
  assert.equal(keys.posProductIdOf({ sku: "CIRCA2222.THI-VIA-001", barcode: "5816" }), "5816", "sku dạng khác bị bỏ qua");
  assert.equal(keys.posProductIdOf({ sku: null, barcode: "4117", externalProductId: "4117", productIdentifier: "CIRCA-4117" }), "4117");
  assert.equal(keys.posProductIdOf({ sku: "CIRCA-2019036", barcode: "2019036" }), "2019036");
  assert.equal(keys.posProductIdOf({ sku: "CIRCA-1", barcode: "2" }), "", "sku và barcode lệch → không đoán");
  assert.equal(keys.posProductIdOf({ barcode: "4117", externalProductId: "4118" }), "", "barcode và externalProductId lệch");
  assert.equal(keys.posProductIdOf({ barcode: "8935001234567" }), "", "barcode 13 số (EAN) không phải mã POS");
  assert.equal(keys.posProductIdOf({ barcode: "41A7" }), "");
  assert.equal(keys.posProductIdOf({}), "");
  assert.equal(keys.posProductIdOf(null), "");
  assert.equal(keys.posProductIdOf({ sku: null, barcode: null }, "CIRCA-77"), "77", "sku truyền riêng (productSku chi tiết PO)");
  assert.equal(keys.posProductIdOf({ externalProductId: 5816, barcode: " 5816 " }), "5816", "số / khoảng trắng");
  assert.equal(keys.posProductIdOf({ barcode: "12345678" }), "12345678", "8 số vẫn nhận (bước khớp số lượng / tra QR chặn nếu không phải mã POS)");
});

test("production PO-2026-000002: sku trống / sai dạng 13/14 dòng → vẫn đủ mã POS từ barcode; khớp số lượng GR84674 14/14", () => {
  const r = N.normalizeReceiving(RCV2);
  const lines = r.shipments[0].lines;
  assert.equal(lines.length, 14);
  assert.equal(lines.filter((l) => !keys.posProductIdFromSku(RCV2.shipments[0].lines.find((x) => x.lineId === l.lineId).product.sku)).length, 13, "chỉ theo sku: 13/14 dòng không có mã");
  assert.deepEqual(lines.map((l) => l.posProductId), ["4117", "207527", "2014494", "3950", "2005619", "2019036", "89261", "11906", "13873", "77811", "852265", "2004280", "5816", "2011191"]);
  assert.equal(lines.reduce((n, l) => n + l.units.length, 0), 39);
  assert.ok(lines.every((l) => l.units.every((u) => u.uid && u.epc)), "mọi tem có EPC + UID (unitUid)");
  const fp = M.fingerprint(FP.GR84674, r);
  assert.equal(fp.ok, true, JSON.stringify(fp.rows.filter((x) => !x.ok)));
  assert.equal(fp.rows.length, 14);
  // 4117: Nextwaves 12 chai = POS 1 thùng (12 gốc); 207527: 10 gói = 1 hộp (10 gốc).
  assert.deepEqual(fp.rows.filter((x) => ["4117", "207527"].includes(x.productId)).map((x) => [x.productId, x.grBase, x.nwBase]), [["4117", 12, 12], ["207527", 10, 10]]);
});

test("production chi tiết PO Nextwaves: productSku trống → mã POS từ product (barcode / externalProductId / productIdentifier)", () => {
  const pd = N.normalizePoDetail(H.sample("nw-prd-po-detail-items-shape-20261106.json"));
  assert.deepEqual(pd.items.map((x) => x.posProductId), ["4117", "2019036", "5816"]);
});

test("phiếu gửi đọc SAU khi nhận (normalizeShipment): sku trống kiểu production → mã POS từ barcode / productIdentifier (mẫu staging T3 bỏ sku)", () => {
  const ship = H.clone(H.sample("nw-stg-shipment-34e67fb9-T3-sau-20261025.json"));
  const want = N.normalizeShipment(ship).lines.map((l) => l.posProductId);
  assert.ok(want.length && want.every(Boolean));
  for (const [i, l] of ship.lines.entries()) {
    const id = keys.posProductIdFromSku(l.product.sku);
    l.product.sku = null;
    if (i % 2 === 0) l.product.barcode = id; // nửa dòng có barcode, nửa chỉ còn productIdentifier
    else l.product.barcode = null;
  }
  assert.deepEqual(N.normalizeShipment(ship).lines.map((l) => l.posProductId), want);
  ship.lines[0].product.barcode = "999999"; // lệch productIdentifier → không đoán
  assert.equal(N.normalizeShipment(ship).lines[0].posProductId, "");
});

function args(search, orders, receivings, fingerprintSource, soBase) {
  return {
    search: { ok: true, status: 200, json: search },
    ctx: { soBase, buymedSlug: PRD.buymedSlug, warehouseId: null }, // v0.4.0: kho lấy từ đơn đã khớp
    fingerprintSource,
    getOrder: async (id) => (orders[id] ? { ok: true, status: 200, json: orders[id] } : { ok: false, status: 404 }),
    getReceiving: async (id) => (receivings[id] ? { ok: true, status: 200, json: receivings[id] } : { ok: false, status: 404 }),
  };
}

test("production SO tách giao 38565378: 2 đơn Nextwaves cùng SO, đúng một đơn khớp GR84673 → chọn PO-2026-000001, KHÔNG khoá ghi; đơn kia ghi lý do lệch", async () => {
  const recv = { "be7e2d4b-1864-437b-8b4e-1baeb4bf2803": RCV1, "b4db032d-7977-4d9a-b747-a6e47ad87795": RCV3 };
  const r = await resolve.resolveNwOrder(args(SPLIT.search, SPLIT.orders, recv, FP.GR84673, "SOBD38565378"));
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.chosen.order.poNumber, "PO-2026-000001");
  assert.equal(r.chosen.order.refId, "SOBD38565378-16025426");
  assert.deepEqual([r.total, r.candidates, r.verified], [2, 2, 2]);
  assert.deepEqual(r.writeLocks, []);
  assert.equal(r.reports.length, 1);
  assert.equal(r.reports[0][0], "PO-2026-000003");
  assert.match(r.reports[0][1], /lệch số lượng/);
  // Audit 06/11 P2-2: đơn kia KHÔNG SO ĐƯỢC (dòng thiếu mã sản phẩm / số tem ≠ số lượng / chưa có phiếu gửi) → vẫn chọn đơn khớp nhưng giữ khoá.
  const variants = [
    ["dòng thiếu mã sản phẩm", (r3) => { r3.shipments[0].lines[0].product.barcode = null; }],
    ["số tem ≠ số lượng", (r3) => { r3.shipments[0].lines[0].quantity = 2; }],
    ["chưa có phiếu gửi", (r3) => { r3.shipments = []; }],
  ];
  for (const [name, mut] of variants) {
    const r3 = JSON.parse(JSON.stringify(RCV3));
    mut(r3);
    const rv = await resolve.resolveNwOrder(args(SPLIT.search, SPLIT.orders, { "be7e2d4b-1864-437b-8b4e-1baeb4bf2803": RCV1, "b4db032d-7977-4d9a-b747-a6e47ad87795": r3 }, FP.GR84673, "SOBD38565378"));
    assert.equal(rv.ok, true, name);
    assert.equal(rv.chosen.order.poNumber, "PO-2026-000001", name);
    assert.deepEqual(rv.writeLocks, ["nw_many_orders"], name);
  }
  // Phiếu khớp cả hai đơn (giả: hai đơn cùng nội dung) → vẫn dừng "ambiguous".
  const twin = JSON.parse(JSON.stringify(RCV1));
  twin.order.purchaseOrderId = "b4db032d-7977-4d9a-b747-a6e47ad87795";
  const r2 = await resolve.resolveNwOrder(args(SPLIT.search, SPLIT.orders, { "be7e2d4b-1864-437b-8b4e-1baeb4bf2803": RCV1, "b4db032d-7977-4d9a-b747-a6e47ad87795": twin }, FP.GR84673, "SOBD38565378"));
  assert.deepEqual([r2.ok, r2.reason], [false, "ambiguous"]);
});

test("production SO 38567266 (một đơn): GR84674 ↔ PO-2026-000002, mã giao POS hậu tố -P1 vẫn cùng SO", async () => {
  assert.equal(keys.soBase("SOBD38567266-P1"), "SOBD38567266");
  assert.ok(keys.sameSo("SOBD38567266-16026945", "SOBD38567266-P1"));
  const search = { items: [Object.assign({}, SPLIT.search.items[1], { id: "b99b7252-6461-4279-9948-1917fdddca20", purchaseOrderId: "087bedc0-bdfa-48ff-a06c-60496a168900", purchaseOrderNumber: "PO-2026-000002" })], total: 1 };
  const orders = { "087bedc0-bdfa-48ff-a06c-60496a168900": { id: "b99b7252-6461-4279-9948-1917fdddca20", status: "shipped", refId: "SOBD38567266-16026945", counterparty: { tenantSlug: "buymed" }, purchaseOrderId: "087bedc0-bdfa-48ff-a06c-60496a168900", purchaseOrderNumber: "PO-2026-000002", warehouse: { id: "eb5e2b4f-6f92-413b-90ef-6be1730b94c0" } } };
  const r = await resolve.resolveNwOrder(args(search, orders, { "087bedc0-bdfa-48ff-a06c-60496a168900": RCV2 }, FP.GR84674, keys.soBase("SOBD38567266-P1")));
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual([r.chosen.order.poNumber, r.verified, r.writeLocks], ["PO-2026-000002", 1, []]);
});

test("production tìm GR theo SO 38567266 (capture 06/11): một phiếu GR84674 → không khoá; SO tách giao thêm phiếu -P2 PO khác → vẫn không khoá; cùng PO / thiếu PO → khoá", () => {
  const { pos } = H.lib();
  const GR84674 = "88fef544-d4cc-4aa7-b032-acca6eef5b0d";
  const real = H.sample("pos-prd-gr-search-so-38567266-20261106.json");
  const check = (j) => pos.checkSoGrs(j, FLORITA);
  const c = check(real);
  assert.deepEqual([c.ok, c.total, c.list.map((g) => [g.code, g.poCode, g.status])], [true, 1, [["GR84674", "PO01974972", "WAITING_TO_RECEIVE"]]]);
  assert.equal(pos.soWriteLock(c, GR84674), null);
  const withP2 = (patch) => {
    const j = H.clone(real);
    j.data.goods_receipts.push(Object.assign(H.clone(j.data.goods_receipts[0]), { id: "11111111-2222-4333-8444-555555555555", code: "GR84999", purchase_order_id: "22222222-3333-4444-8555-666666666666", purchase_order_code: "PO01974973" }, patch));
    j.data.total = 2;
    return check(j);
  };
  assert.equal(pos.soWriteLock(withP2({}), GR84674), null, "phiếu -P2 của PO khác");
  assert.equal(pos.soWriteLock(withP2({ status: "COMPLETED" }), GR84674), null, "phiếu -P2 đã nhận");
  assert.equal(pos.soWriteLock(withP2({ purchase_order_id: "b82a4401-b6b8-4439-aeea-0c210e3b3a96" }), GR84674), "so_many_gr", "hai phiếu cùng PO");
  assert.equal(pos.soWriteLock(withP2({ purchase_order_id: "b82a4401-b6b8-4439-aeea-0c210e3b3a96", status: "CANCELED" }), GR84674), null, "phiếu cùng PO đã huỷ");
  assert.equal(pos.soWriteLock(withP2({ purchase_order_id: null }), GR84674), "so_gr_unknown", "phiếu kia thiếu PO");
  const noPo = H.clone(real);
  delete noPo.data.goods_receipts[0].purchase_order_id;
  assert.equal(pos.soWriteLock(check(noPo), GR84674), "so_gr_unknown", "phiếu đang mở thiếu PO");
});
