"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { pos, nw, match } = H.lib();

const gr78 = () => pos.normalizeGr(H.sample("gr-stg-GR03878-20261024.json"));
const gr77 = () => pos.normalizeGr(H.sample("gr-stg-GR03877-20261023.json"));

test("GR03878: đọc dòng, đơn vị dòng và hệ số đơn vị", () => {
  const gr = gr78();
  assert.equal(gr.code, "GR03878");
  assert.equal(gr.status, "WAITING_TO_RECEIVE");
  assert.equal(gr.posId, "64a8663b-0c9e-49c6-9626-0a4c7c4bd53d");
  assert.equal(gr.items.length, 3);
  const i1110 = gr.items.find((i) => i.productId === "1110");
  assert.equal(i1110.unit, "hộp");
  assert.equal(i1110.unitRate, 6);
  assert.equal(i1110.ratesByUnitName["vỉ"], 2);
  assert.deepEqual(i1110.details.map((d) => d.lotDate).sort(), ["261009DHAUS-121228", "A1-121229"]);
  assert.ok(pos.isReceivable(gr));
});

test("GR03878 ↔ PO00006750: mã giao SOBD1593858-F, liên kết hai chiều đạt", () => {
  const po = pos.normalizePo(H.sample("po-stg-PO00006750-SOBD1593858.json"));
  const r = pos.resolveDelivery(gr78(), po, H.STORE_2222);
  assert.deepEqual(r, { ok: true, deliveryCode: "SOBD1593858-F", soBase: "SOBD1593858", errors: [] });
});

test("P1.4: cửa hàng phải có đủ x-store-id, GR.pos_info.id, PO.pos_id và trùng nhau", () => {
  const po = pos.normalizePo(H.sample("po-stg-PO00006750-SOBD1593858.json"));
  assert.deepEqual(pos.resolveDelivery(gr78(), po, "").errors, ["store_missing"]);
  assert.deepEqual(pos.resolveDelivery(gr78(), po, null).errors, ["store_missing"]);
  const g = gr78();
  g.posId = "";
  assert.deepEqual(pos.resolveDelivery(g, po, H.STORE_2222).errors, ["store_missing"]);
  const p2 = H.clone(po);
  p2.posId = "";
  assert.deepEqual(pos.resolveDelivery(gr78(), p2, H.STORE_2222).errors, ["store_missing"]);
  assert.deepEqual(pos.resolveDelivery(gr78(), po, "00000000-0000-0000-0000-00000000abcd").errors, ["store_mismatch"]);
  const p3 = H.clone(po);
  p3.posId = "00000000-0000-0000-0000-00000000abcd";
  assert.deepEqual(pos.resolveDelivery(gr78(), p3, H.STORE_2222).errors, ["store_mismatch"]);
  assert.equal(pos.resolveDelivery(gr78(), po, H.STORE_2222.toUpperCase()).ok, true);
});

test("GR03877 tạo tay (PO IMPORT_STOCK, không mã giao) → dừng no_delivery_code", () => {
  // PO00006745 không có file mẫu; dựng lại đúng các trường operator gửi 24/10 (state.md §2.1).
  const po = pos.normalizePo({ data: { id: "b191075a-f48a-44f0-accc-f940bfef1c82", code: "PO00006745", pos_id: "64a8663b-0c9e-49c6-9626-0a4c7c4bd53d", source_type: "IMPORT_STOCK", sale_order_number: "", thuocsi_delivery_code: [], goods_receipts: [{ id: "cea7a4d0-58ad-468a-9644-8d2d09446def" }] } });
  const r = pos.resolveDelivery(gr77(), po, H.STORE_2222);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ["no_delivery_code"]);
});

test("GR không nằm trong PO / PO khác / nhiều mã giao → chặn", () => {
  const po = pos.normalizePo(H.sample("po-stg-PO00006750-SOBD1593858.json"));
  const other = H.clone(po);
  other.grIds = [];
  assert.ok(pos.resolveDelivery(gr78(), other, H.STORE_2222).errors.includes("gr_not_in_po"));
  const many = H.clone(po);
  many.deliveryCodes = ["SOBD1593858-F", "SOBD1593858-2"];
  assert.ok(pos.resolveDelivery(gr78(), many, H.STORE_2222).errors.includes("many_delivery_codes"));
  const wrongSo = H.clone(po);
  wrongSo.saleOrderNumber = "999";
  assert.ok(pos.resolveDelivery(gr78(), wrongSo, H.STORE_2222).errors.includes("sale_order_number_mismatch"));
  assert.ok(pos.resolveDelivery(gr77(), po, H.STORE_2222).errors.includes("po_mismatch"));
});

test("tìm GR theo SO (đường /chi-tiet-so) → GR03878", () => {
  const list = pos.normalizeGrSearch(H.sample("pos-stg-gr-search-so-1593858.json"));
  assert.deepEqual(list.map((g) => [g.code, g.status, g.poCode]), [["GR03878", "WAITING_TO_RECEIVE", "PO00006750"]]);
});

test("P1.6: danh sách GR theo SO phải đọc đủ (total / page / limit) và rõ từng dòng, không lọc rồi đếm", () => {
  const GR = "2de6c0ec-2ea8-4038-8616-659fa3f5820a";
  const base = () => H.clone(H.sample("pos-stg-gr-search-so-1593858.json"));
  const check = (j, store = H.STORE_2222) => pos.checkSoGrs(j, store);
  // Mẫu thật: total 1, page 1, limit 1000, một GR → không khoá.
  const ok = check(base());
  assert.deepEqual([ok.ok, ok.total, ok.read, ok.list.map((g) => g.code)], [true, 1, 1, ["GR03878"]]);
  assert.equal(pos.soWriteLock(ok, GR), null);
  // total 2, trang chỉ trả 1 dòng (GR thứ hai ở trang sau) → chưa đủ → khoá.
  const j1 = base();
  j1.data.total = 2;
  assert.deepEqual([check(j1).ok, check(j1).reason, check(j1).total, check(j1).read], [false, "search_incomplete", 2, 1]);
  assert.equal(pos.soWriteLock(check(j1), GR), "so_gr_unknown");
  // page / limit sai hoặc thiếu.
  for (const [patch, reason] of [[{ page: 2 }, "search_paging"], [{ limit: 0 }, "search_paging"], [{ limit: undefined }, "search_unreadable"], [{ total: "1" }, "search_unreadable"], [{ goods_receipts: null }, "search_unreadable"]]) {
    const j = base();
    Object.assign(j.data, patch);
    assert.equal(check(j).reason, reason, JSON.stringify(patch));
    assert.equal(pos.soWriteLock(check(j), GR), "so_gr_unknown");
  }
  const jl = base();
  jl.data.limit = 1;
  jl.data.total = 2;
  jl.data.goods_receipts.push(Object.assign(H.clone(jl.data.goods_receipts[0]), { id: "11111111-2222-4333-8444-555555555555", code: "GR03999" }));
  assert.equal(check(jl).reason, "search_paging", "số dòng > limit");
  // Một dòng thiếu pos_info.id → không lọc bỏ, mà khoá.
  const j2 = base();
  j2.data.total = 2;
  j2.data.goods_receipts.push(Object.assign(H.clone(j2.data.goods_receipts[0]), { id: "11111111-2222-4333-8444-555555555555", code: "GR03999", pos_info: null }));
  assert.deepEqual([check(j2).reason, check(j2).code], ["row_incomplete", "GR03999"]);
  assert.equal(pos.soWriteLock(check(j2), GR), "so_gr_unknown");
  const j3 = base();
  j3.data.goods_receipts[0].status = "";
  assert.equal(check(j3).reason, "row_incomplete");
  // Dòng của cửa hàng khác / chưa biết cửa hàng đăng nhập.
  const j4 = base();
  j4.data.goods_receipts[0].pos_info = { id: "00000000-0000-0000-0000-00000000abcd" };
  assert.equal(check(j4).reason, "row_other_store");
  assert.equal(check(base(), "").reason, "row_other_store");
  // Hai GR đủ dữ liệu → đọc được nhưng khoá so_many_gr; GR kia đã huỷ → không khoá.
  const j5 = base();
  j5.data.total = 2;
  j5.data.goods_receipts.push(Object.assign(H.clone(j5.data.goods_receipts[0]), { id: "11111111-2222-4333-8444-555555555555", code: "GR03999" }));
  assert.equal(check(j5).ok, true);
  assert.equal(pos.soWriteLock(check(j5), GR), "so_many_gr");
  j5.data.goods_receipts[1].status = "CANCELED";
  assert.equal(pos.soWriteLock(check(j5), GR), null);
  // GR đang mở không có trong danh sách → khoá.
  assert.equal(pos.soWriteLock(ok, "99999999-0000-4000-8000-000000000000"), "so_gr_unknown");
});

test("Nextwaves: tìm receiving theo SO, đọc đơn liên kết và kiểm SO / đối tác / kho", () => {
  const page = nw.normalizeReceivingSearchPage(H.sample("nw-stg-receiving-search-q-SOBD1593859.json"));
  assert.deepEqual([page.total, page.items.length], [1, 1]);
  assert.equal(nw.normalizeReceivingSearchPage({ items: [] }), null, "thiếu total → không đọc");
  assert.equal(nw.normalizeReceivingSearchPage({ total: 0 }), null, "thiếu items → không đọc");
  const found = nw.normalizeReceivingSearch(H.sample("nw-stg-receiving-search-q-SOBD1593859.json"));
  assert.equal(found.length, 1);
  assert.equal(found[0].poNumber, "PO60017570");
  assert.equal(found[0].warehouseId, H.STG_CTX.warehouseId);
  const order = nw.normalizeOrderOfPo(H.sample("nw-stg-intertenant-PO28237814-SOBD1593858.json"));
  assert.equal(order.soBase, "SOBD1593858");
  assert.deepEqual(nw.verifyOrder(order, H.STG_CTX), { ok: true, errors: [] });
  assert.deepEqual(nw.verifyOrder(order, Object.assign({}, H.STG_CTX, { soBase: "SOBD1593849" })).errors, ["so_mismatch"]);
  assert.deepEqual(nw.verifyOrder(order, Object.assign({}, H.STG_CTX, { warehouseId: "khac" })).errors, ["warehouse_mismatch"]);
  assert.deepEqual(nw.verifyOrder(order, Object.assign({}, H.STG_CTX, { buymedSlug: "buymed" })).errors, ["counterparty_mismatch"]);
});

test("Nextwaves: /receiving thật (PO76458756, PO60017570) và dòng giao có lô (PO28237814)", () => {
  const r76 = nw.normalizeReceiving(H.sample("nw-stg-receiving-PO76458756.json"));
  assert.equal(r76.poNumber, "PO76458756");
  assert.equal(r76.shipments[0].lines.reduce((n, l) => n + l.units.length, 0), 11);
  const r60 = nw.normalizeReceiving(H.sample("nw-stg-receiving-PO60017570.json"));
  assert.deepEqual(r60.shipments[0].lines.map((l) => [l.posProductId, l.unit, l.units.length]), [["2431732", "chai", 2], ["1110", "vỉ", 3], ["5451", "hộp", 1], ["5451", "hộp", 1]]);
  const sh = nw.normalizeShipment(H.sample("nw-stg-shipment-34e67fb9-PO28237814.json"));
  assert.equal(sh.lines.length, 5);
  assert.deepEqual(sh.lines.filter((l) => l.batch).map((l) => l.batch.number).sort(), ["261009DHAUS", "261009KSDHAU", "A1", "A1"]);
  assert.equal(sh.lines.find((l) => l.posProductId === "2431732").batch, null);
});

test("PO Nextwaves sau khi nhận (mẫu thật PO88508353): 25 receivedUnits, biên nhận chứa đúng EPC", () => {
  const po = nw.normalizePoDetail(H.sample("nw-stg-po-PO88508353-received.json"));
  assert.equal(po.status, "RECEIVED");
  assert.equal(po.items.reduce((n, i) => n + i.receivedUnits.length, 0), 25);
  assert.equal(po.items[0].posProductId, "1111");
  assert.equal(po.receipts.length, 1);
  const r = po.receipts[0];
  assert.equal(r.warehouseId, H.STG_CTX.warehouseId);
  const all = po.items.flatMap((i) => i.receivedUnits);
  assert.ok(all.every((u) => u.receiptId === r.id && r.epcs.includes(u.epc)), "mọi receivedUnit thuộc biên nhận và có trong epcs của biên nhận");
});

test("dấu vân tay: GR03878 khớp PO28237814 (dựng lại) nhưng KHÔNG khớp PO76458756 / PO60017570 (thật)", () => {
  const src = pos.grFingerprintSource(gr78());
  assert.equal(match.fingerprint(src, nw.normalizeReceiving(H.receivingPO28237814())).ok, true);
  const f76 = match.fingerprint(src, nw.normalizeReceiving(H.sample("nw-stg-receiving-PO76458756.json")));
  assert.equal(f76.ok, false);
  assert.deepEqual(f76.rows.filter((r) => !r.ok).map((r) => [r.productId, r.grBase, r.nwBase]), [["2431732", 2, 1]]);
  assert.equal(match.fingerprint(src, nw.normalizeReceiving(H.sample("nw-stg-receiving-PO60017570.json"))).ok, false);
});

const RCV_OPTS = { receiptIdsBefore: [], warehouseId: H.STG_CTX.warehouseId };
const shipRcv = () => [nw.normalizeShipment(H.shipmentPO28237814Received())];

test("dựng UID đã nhận: đơn vị và lô theo dòng giao, không thiếu / không lạ, có bằng chứng biên nhận", () => {
  const rec = nw.buildReceivedUnits(nw.normalizePoDetail(H.poDetailPO28237814Received()), shipRcv(), nw.normalizeReceiving(H.receivingPO28237814()), RCV_OPTS);
  assert.deepEqual(rec.problems, []);
  assert.deepEqual(rec.receiptIds, [H.RECEIPT_ID]);
  assert.deepEqual(rec.missing, []);
  assert.deepEqual(rec.unexpected, []);
  assert.equal(rec.units.length, 12);
  const u = rec.units.find((x) => x.uid === "1792145819958AA1");
  assert.deepEqual([u.posProductId, u.unitName, u.batchNumber, u.batchExpiry], ["1110", "vỉ", "261009DHAUS", "2028-12-12"]);
});

test("dựng UID đã nhận: nhận thiếu → missing; EPC lạ → unexpected", () => {
  const po = nw.normalizePoDetail(H.poDetailPO28237814Received());
  po.items[0].receivedUnits.pop();
  po.items[0].receivedUnits.push({ epc: "E280F302000000017032A729", uid: "1792379169035AA1", receiptId: "x" });
  const rec = nw.buildReceivedUnits(po, shipRcv(), nw.normalizeReceiving(H.receivingPO28237814()));
  assert.equal(rec.missing.length, 1);
  assert.deepEqual(rec.unexpected, ["E280F302000000017032A729"]);
});

test("P2.1: thiếu bằng chứng nhận → problems (phiếu gửi chưa ghi nhận EPC, biên nhận thiếu / lạ / sai kho, không có biên nhận mới)", () => {
  const exp = nw.normalizeReceiving(H.receivingPO28237814());
  const codes = (rec) => [...new Set(rec.problems.map((p) => p.split(":")[0]))].sort();
  const poOk = () => nw.normalizePoDetail(H.poDetailPO28237814Received());
  // Phiếu gửi đọc lại chưa có receivedEpcs (như trước khi nhận).
  const before = [nw.normalizeShipment(H.sample("nw-stg-shipment-34e67fb9-PO28237814.json"))];
  assert.deepEqual(codes(nw.buildReceivedUnits(poOk(), before, exp, RCV_OPTS)), ["shipment_not_received"]);
  // Không đọc được phiếu gửi nào.
  assert.deepEqual(codes(nw.buildReceivedUnits(poOk(), [], exp, RCV_OPTS)), ["epc_not_in_shipment"]);
  // Biên nhận thiếu / không có trong receipts / không chứa EPC / khác kho.
  const p1 = poOk();
  p1.items[0].receivedUnits[0].receiptId = "";
  assert.deepEqual(codes(nw.buildReceivedUnits(p1, shipRcv(), exp, RCV_OPTS)), ["receipt_missing"]);
  const p2 = poOk();
  p2.receipts = [];
  assert.deepEqual(codes(nw.buildReceivedUnits(p2, shipRcv(), exp, RCV_OPTS)), ["receipt_unknown"]);
  const p3 = poOk();
  p3.receipts[0].epcs = p3.receipts[0].epcs.slice(1);
  assert.deepEqual(codes(nw.buildReceivedUnits(p3, shipRcv(), exp, RCV_OPTS)), ["receipt_epc_mismatch"]);
  assert.deepEqual(codes(nw.buildReceivedUnits(poOk(), shipRcv(), exp, { receiptIdsBefore: [], warehouseId: "kho-khac" })), ["receipt_warehouse_mismatch"]);
  // Biên nhận đã có từ trước khi khớp đơn → không phải lượt này.
  assert.deepEqual(codes(nw.buildReceivedUnits(poOk(), shipRcv(), exp, { receiptIdsBefore: [H.RECEIPT_ID], warehouseId: H.STG_CTX.warehouseId })), ["no_new_receipt"]);
});

test("P2.2: tra QR phải có productId số, lô, hạn DD-MM-YYYY", () => {
  const d = H.sample("pos-stg-qrcode-uid-circa.json")[0].response.data[0];
  const one = (patch) => pos.normalizeQrLookup({ status: "OK", data: [Object.assign({}, d, patch)] }, d.uniqueId);
  assert.equal(one({}).ok, true);
  assert.equal(one({}).productId, "1110");
  assert.equal(one({ productId: null }).reason, "incomplete");
  assert.equal(one({ productId: undefined }).reason, "incomplete");
  assert.equal(one({ productId: "abc" }).reason, "incomplete");
  assert.equal(one({ lot: "" }).reason, "incomplete");
  assert.equal(one({ expiredDate: "" }).reason, "incomplete");
  assert.equal(one({ expiredDate: "2028-12-12" }).reason, "incomplete");
  assert.equal(one({ uniqueId: "KHAC", shortId: "KHAC" }).reason, "not_found");
});
