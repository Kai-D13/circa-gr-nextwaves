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
  const r = pos.resolveDelivery(gr78(), po);
  assert.deepEqual(r, { ok: true, deliveryCode: "SOBD1593858-F", soBase: "SOBD1593858", errors: [] });
});

test("GR03877 tạo tay (PO IMPORT_STOCK, không mã giao) → dừng no_delivery_code", () => {
  // PO00006745 không có file mẫu; dựng lại đúng các trường operator gửi 24/10 (state.md §2.1).
  const po = pos.normalizePo({ data: { id: "b191075a-f48a-44f0-accc-f940bfef1c82", code: "PO00006745", pos_id: "64a8663b-0c9e-49c6-9626-0a4c7c4bd53d", source_type: "IMPORT_STOCK", sale_order_number: "", thuocsi_delivery_code: [], goods_receipts: [{ id: "cea7a4d0-58ad-468a-9644-8d2d09446def" }] } });
  const r = pos.resolveDelivery(gr77(), po);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ["no_delivery_code"]);
});

test("GR không nằm trong PO / PO khác / nhiều mã giao → chặn", () => {
  const po = pos.normalizePo(H.sample("po-stg-PO00006750-SOBD1593858.json"));
  const other = H.clone(po);
  other.grIds = [];
  assert.ok(pos.resolveDelivery(gr78(), other).errors.includes("gr_not_in_po"));
  const many = H.clone(po);
  many.deliveryCodes = ["SOBD1593858-F", "SOBD1593858-2"];
  assert.ok(pos.resolveDelivery(gr78(), many).errors.includes("many_delivery_codes"));
  const wrongSo = H.clone(po);
  wrongSo.saleOrderNumber = "999";
  assert.ok(pos.resolveDelivery(gr78(), wrongSo).errors.includes("sale_order_number_mismatch"));
  assert.ok(pos.resolveDelivery(gr77(), po).errors.includes("po_mismatch"));
});

test("tìm GR theo SO (đường /chi-tiet-so) → GR03878", () => {
  const list = pos.normalizeGrSearch(H.sample("pos-stg-gr-search-so-1593858.json"));
  assert.deepEqual(list.map((g) => [g.code, g.status, g.poCode]), [["GR03878", "WAITING_TO_RECEIVE", "PO00006750"]]);
});

test("Nextwaves: tìm receiving theo SO, đọc đơn liên kết và kiểm SO / đối tác / kho", () => {
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

test("PO Nextwaves sau khi nhận (mẫu thật PO88508353): 25 receivedUnits", () => {
  const po = nw.normalizePoDetail(H.sample("nw-stg-po-PO88508353-received.json"));
  assert.equal(po.status, "RECEIVED");
  assert.equal(po.items.reduce((n, i) => n + i.receivedUnits.length, 0), 25);
  assert.equal(po.items[0].posProductId, "1111");
});

test("dấu vân tay: GR03878 khớp PO28237814 (dựng lại) nhưng KHÔNG khớp PO76458756 / PO60017570 (thật)", () => {
  const src = pos.grFingerprintSource(gr78());
  assert.equal(match.fingerprint(src, nw.normalizeReceiving(H.receivingPO28237814())).ok, true);
  const f76 = match.fingerprint(src, nw.normalizeReceiving(H.sample("nw-stg-receiving-PO76458756.json")));
  assert.equal(f76.ok, false);
  assert.deepEqual(f76.rows.filter((r) => !r.ok).map((r) => [r.productId, r.grBase, r.nwBase]), [["2431732", 2, 1]]);
  assert.equal(match.fingerprint(src, nw.normalizeReceiving(H.sample("nw-stg-receiving-PO60017570.json"))).ok, false);
});

test("dựng UID đã nhận: đơn vị và lô theo dòng giao, không thiếu / không lạ", () => {
  const rec = nw.buildReceivedUnits(
    nw.normalizePoDetail(H.poDetailPO28237814Received()),
    [nw.normalizeShipment(H.sample("nw-stg-shipment-34e67fb9-PO28237814.json"))],
    nw.normalizeReceiving(H.receivingPO28237814())
  );
  assert.deepEqual(rec.problems, []);
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
  const rec = nw.buildReceivedUnits(po, [nw.normalizeShipment(H.sample("nw-stg-shipment-34e67fb9-PO28237814.json"))], nw.normalizeReceiving(H.receivingPO28237814()));
  assert.equal(rec.missing.length, 1);
  assert.deepEqual(rec.unexpected, ["E280F302000000017032A729"]);
});
