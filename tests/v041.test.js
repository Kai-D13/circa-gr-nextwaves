"use strict";
// v0.4.1 — phiếu phần còn lại (bán gấp → POS tách phiếu), mức thư viện. Mẫu THẬT:
//  - staging 07/11: GR03877 (HOÀN THÀNH 2/2 + 1/4 + 0/6) → GR03954 vừa sinh; PO00006745; Nextwaves PO69611541 (cùng 3 sản phẩm / lượng gốc);
//  - production 07/11: GR84673 (bán gấp Arrahan) → GR84803; PO01974970; Nextwaves PO-2026-000001.
// GR84803 / PO01974970 là ảnh chụp SAU khi GR84803 đã xong → test DỰNG LẠI lúc GR84803 vừa sinh (ghi rõ ở hàm dựng).
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { pos, nw, match, resolve } = H.lib();

const g54 = () => pos.normalizeGr(H.sample("gr-stg-GR03954-phan-con-lai-moi-sinh-20261107.json"));
const g77 = () => pos.normalizeGr(H.sample("gr-stg-GR03877-tach-20261107.json"));
const po45 = () => pos.normalizePo(H.sample("po-stg-PO00006745-sau-tach-20261107.json"));
const nwBefore = () => nw.normalizeReceiving(H.sample("nw-stg-receiving-PO69611541-truoc-nhan-thieu-20261108.json").response);

// Production lúc GR84803 vừa sinh (dựng lại): chờ nhận, chưa nhận, không mã; Femalto về dòng lô gốc (SL 1, ref f52af836) — trên ảnh
// chụp cuối dòng này là dòng lô thêm tay SL 0 (P5). PO lúc đó: GR84803 chờ nhận, đã nhận = phần của GR84673.
function prodAtSplit() {
  const raw03 = H.clone(H.sample("gr-prod-GR84803-phan-con-lai-20261107.json"));
  const raw73 = H.sample("gr-prod-GR84673-tach-20261107.json");
  raw03.data.status = "WAITING_TO_RECEIVE";
  for (const it of raw03.data.items) {
    it.received_quantity = 0;
    for (const d of it.details) {
      Object.assign(d, { received_quantity: 0, thuocsi_qr_codes: [], internal_qr_codes: [] });
      if (it.product_id === 2021326) Object.assign(d, { quantity: 1, ref_id: "f52af836-cd16-4b05-a41d-da70b32e3d9b" });
    }
  }
  const poRaw = H.clone(H.sample("po-prod-PO01974970-tach-20261108.json"));
  const rec73 = new Map(raw73.data.items.map((it) => [it.ref_id, it.received_quantity]));
  poRaw.data.goods_receipts = poRaw.data.goods_receipts.map((g) => (g.code === "GR84803" ? Object.assign({}, g, { status: "WAITING_TO_RECEIVE" }) : g));
  for (const it of poRaw.data.items) it.received_quantity = rec73.get(it.id) || 0;
  return { gr: pos.normalizeGr(raw03), done: pos.normalizeGr(raw73), po: pos.normalizePo(poRaw) };
}
const nwPrd = () => {
  const j = H.sample("nw-prd-receiving-PO-2026-000001-20261106.json");
  return nw.normalizeReceiving(j.response || j);
};

test("v0.4.1 dữ liệu: GR giữ ref_id dòng / lô PO, lượng đã nhận của dòng, mã nội bộ; PO giữ dòng + phiếu kèm trạng thái", () => {
  const g = g54();
  const it = g.items.find((x) => x.productId === "5451");
  assert.equal(it.refId, "8868129f-4eab-4903-969c-f2011f111113");
  assert.equal(it.received, 0);
  assert.equal(it.details[0].refId, "045e1abe-d0ac-428b-a4e9-530dc2a65d01");
  assert.deepEqual(it.details[0].internalCodes, []);
  const p = po45();
  assert.equal(p.status, "PROCESSING");
  assert.deepEqual(p.grs.map((x) => [x.code, x.status]), [["GR03877", "COMPLETED"], ["GR03954", "WAITING_TO_RECEIVE"]]);
  assert.deepEqual(p.items.map((x) => [x.productId, x.quantity, x.baseQuantity, x.received]), [["2431732", 2, 2, 2], ["5451", 4, 40, 1], ["1110", 6, 12, 0]]);
  // mã trên phiếu đã xong production: mã QR thuocsi dược sĩ quét + UID Nextwaves POS gắn lúc HOÀN THÀNH, cùng mảng thuocsi_qr_codes
  const arr = pos.normalizeGr(H.sample("gr-prod-GR84673-tach-20261107.json")).items.find((x) => x.productId === "77749");
  assert.deepEqual(arr.details[0].qrCodes, ["1783950641470B34", "1793929018293B31"]);
});

test("v0.4.1 remainderOf staging: GR03954 + GR03877 + PO00006745 → phiếu phần còn lại, vân tay CẤP PO khớp Nextwaves PO69611541", () => {
  const r = pos.remainderOf(g54(), po45(), [g77()]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.completed, [{ id: "cea7a4d0-58ad-468a-9644-8d2d09446def", code: "GR03877" }]);
  assert.deepEqual(r.excludeUids, [], "nhập số tay → không có mã nào trên phiếu đã xong");
  assert.deepEqual(r.source.map((x) => [x.productId, x.baseQuantity]), [["2431732", 2], ["5451", 40], ["1110", 12]]);
  assert.equal(r.source.find((x) => x.productId === "2431732").ratesByUnitName["chai"], 1, "tỉ lệ của sản phẩm chỉ còn ở phiếu đã xong");
  const fp = match.fingerprint(r.source, nwBefore());
  assert.equal(fp.ok, true, JSON.stringify(fp.rows));
  // v0.4.0: vân tay CỦA PHIẾU đang mở so cả đơn → lệch (phiếu phần còn lại không bao giờ khớp)
  const fpOld = match.fingerprint(pos.grFingerprintSource(g54()), nwBefore());
  assert.equal(fpOld.ok, false);
});

test("v0.4.1 remainderOf production (dựng lại lúc vừa tách): excludeUids ∩ UID đơn Nextwaves = đúng tem Arrahan đã bán gấp", () => {
  const { gr, done, po } = prodAtSplit();
  const r = pos.remainderOf(gr, po, [done]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.completed.map((g) => g.code), ["GR84673"]);
  const nwUids = new Set(nwPrd().shipments.flatMap((s) => s.lines.flatMap((l) => l.units.map((u) => u.uid))));
  assert.deepEqual(r.excludeUids.filter((u) => nwUids.has(u)), ["1793929018293B31"], "mã POS gắn lúc HOÀN THÀNH = UID Nextwaves; mã QR thuocsi không trùng UID nào");
  const fp = match.fingerprint(r.source, nwPrd());
  assert.equal(fp.ok, true, JSON.stringify(fp.rows.filter((x) => !x.ok)));
});

test("v0.4.1 remainderOf: thiếu / lệch bất kỳ điều kiện nào → không phải phiếu phần còn lại (giữ khoá như v0.4.0)", () => {
  const base = () => ({ gr: g54(), po: po45(), done: [g77()] });
  const run = (mut) => {
    const x = base();
    mut(x);
    return pos.remainderOf(x.gr, x.po, x.done);
  };
  assert.equal(run(() => {}).ok, true);
  assert.equal(run((x) => (x.po.grs = x.po.grs.filter((g) => g.code === "GR03954"))).reason, "single_gr");
  assert.equal(run((x) => (x.po.grs.find((g) => g.code === "GR03877").status = "RECEIVING")).reason, "other_gr_open");
  assert.equal(run((x) => (x.po.grs.find((g) => g.code === "GR03877").status = "CANCELLED")).reason, "single_gr", "phiếu đã huỷ không tính");
  assert.equal(run((x) => (x.done = [])).reason, "completed_unread");
  assert.equal(run((x) => (x.done[0].status = "RECEIVING")).reason, "completed_unread");
  assert.equal(run((x) => (x.done[0].poId = "00000000-0000-4000-8000-000000000000")).reason, "completed_unread");
  assert.equal(run((x) => (x.gr.items[0].details[0].received = 1)).reason, "open_gr_touched", "phiếu mở đã nhận tay một phần");
  assert.equal(run((x) => (x.gr.items[0].details[0].qrCodes = ["X"])).reason, "open_gr_touched");
  assert.equal(run((x) => (x.gr.items[0].received = 1)).reason, "open_gr_touched");
  assert.equal(run((x) => (x.gr.items[0].refId = "")).reason, "line_not_in_po");
  assert.equal(run((x) => (x.gr.items.find((i) => i.productId === "5451").baseQuantity = 40)).reason, "line_mismatch", "phiếu mở còn nguyên SL dòng PO");
  assert.equal(run((x) => (x.done[0].items.find((i) => i.productId === "5451").details[0].received = 2)).reason, "received_inconsistent");
  assert.equal(
    run((x) => {
      const it = x.done[0].items.find((i) => i.productId === "5451");
      it.details[0].received = 2;
      it.received = 2;
    }).reason,
    "line_mismatch"
  );
  assert.equal(run((x) => (x.po.items.find((p) => p.productId === "5451").received = 2)).reason, "po_received_mismatch");
  assert.equal(run((x) => (x.done[0].items.find((i) => i.productId === "5451").unitRate = null)).reason, "rate_missing");
  assert.equal(run((x) => (x.done[0].items.find((i) => i.productId === "1110").ratesByUnitName["vỉ"] = 3)).reason, "rate_conflict");
  assert.equal(run((x) => x.gr.items.push(Object.assign(H.clone(x.gr.items[0]), { id: "dup" }))).reason, "line_split");
  assert.equal(pos.remainderOf(null, po45(), []).reason, "data");
});

test("v0.4.1 remainderOf: chuỗi tách (GR → GR′ → GR″) cộng mọi phiếu đã xong", () => {
  // GR03954 (phiếu phần còn lại) nhận thêm 1/3 Vinmotop rồi HOÀN THÀNH → GR″ chỉ còn Vinmotop SL 2 + Pymefucan SL 6.
  const mid = g54();
  mid.status = "COMPLETED";
  const v = mid.items.find((i) => i.productId === "5451");
  v.details[0].received = 1;
  v.received = 1;
  const last = H.clone(g54());
  last.id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  last.code = "GR09999";
  const lv = last.items.find((i) => i.productId === "5451");
  lv.quantity = 2;
  lv.baseQuantity = 20;
  lv.details[0].quantity = 2;
  const p = po45();
  p.grs = p.grs.map((g) => (g.code === "GR03954" ? Object.assign({}, g, { status: "COMPLETED" }) : g)).concat([{ id: last.id, code: "GR09999", status: "WAITING_TO_RECEIVE" }]);
  p.items.find((x) => x.productId === "5451").received = 2;
  const r = pos.remainderOf(last, p, [g77(), mid]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.completed.map((g) => g.code).sort(), ["GR03877", "GR03954"]);
  assert.equal(match.fingerprint(r.source, nwBefore()).ok, true);
});

test("v0.4.1 soWriteLock: phiếu phần còn lại không khoá khi kết quả tìm theo SO đúng là các phiếu đã cộng sổ; lệch → so_many_gr", () => {
  const me = { id: "ac0c25c0-926a-473e-9aba-0c4a50deb773", status: "WAITING_TO_RECEIVE", poId: "p1" };
  const done = { id: "cea7a4d0-58ad-468a-9644-8d2d09446def", status: "COMPLETED", poId: "p1" };
  const check = (list) => ({ ok: true, list });
  const rem = { ok: true, completed: [{ id: done.id, code: "GR03877" }] };
  assert.equal(pos.soWriteLock(check([me, done]), me.id), "so_many_gr", "v0.4.0: không có remainder → khoá");
  assert.equal(pos.soWriteLock(check([me, done]), me.id, rem), null);
  assert.equal(pos.soWriteLock(check([me, done]), me.id, { ok: false, reason: "open_gr_touched" }), "so_many_gr");
  assert.equal(pos.soWriteLock(check([me, Object.assign({}, done, { status: "RECEIVING" })]), me.id, rem), "so_many_gr", "phiếu kia chưa xong theo kết quả tìm");
  const extra = { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", status: "COMPLETED", poId: "p1" };
  assert.equal(pos.soWriteLock(check([me, done, extra]), me.id, rem), "so_many_gr", "phiếu không có trong cộng sổ");
  assert.equal(pos.soWriteLock({ ok: false }, me.id, rem), "so_gr_unknown");
  assert.equal(pos.soWriteLock(check([me, Object.assign({}, done, { status: "CANCELLED" })]), me.id), null, "phiếu huỷ không tính");
});

test("v0.4.1 tìm theo SO sau khi nhận thiếu: openShipmentCount 0 + PARTIALLY_RECEIVED → nw_partial_received (không còn 'số lượng không khớp')", async () => {
  const search = H.sample("nw-stg-receiving-search-q-SOBD1594067-sau-nhan-thieu-20261108.json").response;
  const page = nw.normalizeReceivingSearchPage(search);
  assert.equal(page.items[0].openShipmentCount, 0);
  const order = { id: "6c3d3dac-6d41-46a8-a4b3-78e2f89e55d5", purchaseOrderId: "8abcf006-3126-4d2d-b80d-5a591a0276c2", purchaseOrderNumber: "PO69611541", refId: "SOBD1594067-1056814", status: "shipped", purchaseOrderStatus: "PARTIALLY_RECEIVED", counterparty: { tenantSlug: "buymed-stag" }, warehouse: { id: "82bf85e4-84e2-4158-ae27-1aaa6fe1bc57" }, shipments: [] };
  const after = H.sample("nw-stg-receiving-PO69611541-sau-nhan-thieu-20261108.json").response;
  const args = (s) => ({
    search: { ok: true, status: 200, json: s },
    ctx: { soBase: "SOBD1594067", buymedSlug: "buymed-stag", warehouseId: null },
    fingerprintSource: pos.remainderOf(g54(), po45(), [g77()]).source,
    getOrder: async () => ({ ok: true, json: order }),
    getReceiving: async () => ({ ok: true, json: after }),
  });
  const r = await resolve.resolveNwOrder(args(search));
  assert.equal(r.reason, "nw_partial_received");
  assert.match(r.message, /nhận một phần/);
  // openShipmentCount vắng → không coi là 0 (đơn vẫn được so như v0.4.0: phiếu gửi rỗng → lệch số lượng)
  const s2 = H.clone(search);
  delete s2.items[0].openShipmentCount;
  assert.equal(nw.normalizeReceivingSearchPage(s2).items[0].openShipmentCount, null);
  assert.equal((await resolve.resolveNwOrder(args(s2))).reason, "no_match");
});

const summaryOf = (g) => g.items.map((it) => ({ productId: it.productId, unitRate: it.unitRate, baseQuantity: it.baseQuantity, received: it.details.reduce((n, d) => n + d.received, 0), codes: it.details.reduce((n, d) => n + d.qrCodes.length, 0), ratesByUnitName: it.ratesByUnitName }));

test("v0.4.1 F2 kiểm trước khi xác nhận: staging GR03954 (món bán gấp NHẬP SỐ TAY) → báo trước sẽ không điền được (I4)", () => {
  const pc = match.precheck(summaryOf(g54()), nwBefore(), []);
  assert.equal(pc.ok, false);
  assert.deepEqual(pc.problems.map((p) => [p.code, p.productId]), [["product_not_on_gr", "2431732"], ["over", "5451"]]);
  assert.equal(pc.problems[1].nwBase, 40);
  assert.equal(pc.problems[1].grBase, 30);
});

test("v0.4.1 F2 kiểm trước khi xác nhận: production GR84803 lúc vừa tách + loại tem Arrahan đã bán gấp → khớp (21 UID)", () => {
  const { gr, done, po } = prodAtSplit();
  const r = pos.remainderOf(gr, po, [done]);
  const pc = match.precheck(summaryOf(gr), nwPrd(), r.excludeUids);
  assert.equal(pc.ok, true, JSON.stringify(pc.problems));
  assert.equal(pc.units, 21);
  // không loại tem đã bán (như v0.4.0) → Arrahan không có dòng trên phiếu phần còn lại
  assert.deepEqual(match.precheck(summaryOf(gr), nwPrd(), []).problems.map((p) => p.code), ["product_not_on_gr"]);
});

test("v0.4.1 F2 kiểm trước khi xác nhận: đơn vị lạ, số lẻ, phiếu đã nhận tay không mã", () => {
  const rec = nwBefore();
  const sum = summaryOf(g77());
  assert.equal(match.precheck(sum.map((x) => Object.assign({}, x, { received: 0 })), rec, []).ok, true, "phiếu gốc GR03877 chưa nhận: khớp 12 UID");
  const odd = sum.map((x) => Object.assign({}, x, { received: 0, ratesByUnitName: x.productId === "5451" ? { túi: 10 } : x.ratesByUnitName, unitRate: x.productId === "5451" ? 30 : x.unitRate }));
  assert.ok(match.precheck(odd, rec, []).problems.some((p) => p.code === "fraction" && p.productId === "5451"));
  const noUnit = sum.map((x) => Object.assign({}, x, { received: 0, ratesByUnitName: x.productId === "1110" ? { hộp: 6 } : x.ratesByUnitName }));
  assert.ok(match.precheck(noUnit, rec, []).problems.some((p) => p.code === "unit_unknown" && p.unit === "vỉ"));
  assert.ok(match.precheck(sum, rec, []).problems.some((p) => p.code === "gr_received_by_hand"), "GR03877 đã nhập số tay (không mã)");
});
