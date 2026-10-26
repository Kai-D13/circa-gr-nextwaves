"use strict";
// T3 thật (operator 25/10 23:46, v0.1.5, PO28237814 ↔ GR03878): một lượt "Xác nhận nhận hàng" trả 200 (K1 đã được Nextwaves sửa).
// Mẫu lấy từ Net Capture tab Nextwaves (chỉ body; xem samples/README.md). Trong lượt đó extension chỉ gọi 3 GET:
// PO lúc mở trang, rồi PO + phiếu gửi ngay sau 200. Khung POS thật hiện "Kế hoạch #60070071: điền 12 UID vào 6 lô".
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { pos, nw, plan, resolve } = H.lib();

const SCAN = "nw-stg-receive-scan-200-PO28237814-T3-20261025.json";
const PO_BEFORE = "nw-stg-po-PO28237814-T3-truoc-20261025.json";
const RECV_AFTER = "nw-stg-receiving-PO28237814-T3-sau-20261025.json";
const SEARCH_AFTER = "nw-stg-receiving-search-q-SOBD1593858-T3-sau-20261025.json";

const expectedT3 = () => nw.normalizeReceiving(H.receivingPO28237814());
const receivedT3 = () =>
  nw.buildReceivedUnits(nw.normalizePoDetail(H.poDetailPO28237814Received()), [nw.normalizeShipment(H.shipmentPO28237814Received())], expectedT3(), {
    receiptIdsBefore: nw.normalizePoDetail(H.sample(PO_BEFORE)).receipts.map((r) => r.id),
    warehouseId: H.STG_CTX.warehouseId,
  });

test("T3 thật — receive-scan 200: 12/12, orderStatus received, không thiếu / lạ; 12 EPC gửi đúng 12 EPC dự kiến", () => {
  const [x] = H.sample(SCAN);
  assert.equal(x.status, 200);
  const r = x.response;
  assert.deepEqual([r.orderStatus, r.expectedQuantity, r.receivedQuantity, r.missingQuantity, r.truncated], ["received", 12, 12, 0, false]);
  assert.deepEqual([r.unexpectedEpcs, r.unexpectedUnitUids], [[], []]);
  assert.equal(r.shipmentId, "34e67fb9-ea76-4606-ab65-4c515934c0e1");
  assert.ok(r.lines.every((l) => l.missing === 0 && l.received === l.expected));
  const sent = [...x.request.epcs].sort();
  const exp = expectedT3().shipments.flatMap((s) => s.lines.flatMap((l) => l.units.map((u) => u.epc))).sort();
  assert.deepEqual(sent, exp);
});

test("T3 thật — id trong response receive-scan KHÔNG phải biên nhận của PO; biên nhận PO (GRN96438872) ghi số phiếu gửi", () => {
  const [x] = H.sample(SCAN);
  const po = H.poDetailPO28237814Received();
  assert.deepEqual(po.receipts.map((r) => [r.id, r.receiptNumber]), [[H.RECEIPT_ID, "GRN96438872"]]);
  assert.notEqual(x.response.id, H.RECEIPT_ID);
  assert.ok(po.receipts[0].notes.includes(x.response.shipmentNumber));
  // /receiving đọc sau khi nhận: phiếu gửi không còn trong shipments, chuyển sang receipts với đúng id của response receive-scan.
  const after = H.sample(RECV_AFTER);
  assert.deepEqual([after.order.status, after.purchaseOrderStatus, after.shipments.length], ["received", "RECEIVED", 0]);
  assert.deepEqual(after.receipts.map((r) => r.id), [x.response.id]);
});

test("T3 thật — kết quả nhận (P2.1): biên nhận mới cùng kho, phiếu gửi ghi nhận đủ EPC, 12 UID / 5 dòng giao, không vấn đề", () => {
  const rec = receivedT3();
  assert.deepEqual([rec.problems, rec.missing, rec.unexpected, rec.receiptIds], [[], [], [], [H.RECEIPT_ID]]);
  const groups = {};
  for (const u of rec.units) {
    const k = [u.posProductId, u.unitName, u.batchNumber, u.batchExpiry].join(" ");
    (groups[k] = groups[k] || []).push(u.uid);
  }
  for (const k of Object.keys(groups)) groups[k].sort();
  assert.deepEqual(groups, {
    "1110 vỉ 261009DHAUS 2028-12-12": ["1792145819958AA1", "1792146199352AA1", "1792378987066AA1"],
    "1110 vỉ A1 2029-12-12": ["1792379244469AA1", "1792379253612AA1", "1792379520375AA1"],
    "5451 túi 261009KSDHAU 2028-12-12": ["1792379177779AA1", "1792379219323AA1"],
    "5451 túi A1 2028-12-12": ["1792379615766AA1", "1792379622167AA1"],
    // Nextwaves không có lô cho dòng Soffell: lô lấy từ tra QR trên POS.
    "2431732 chai  ": ["1792379018917AA1", "1792379055069AA1"],
  });
});

test("T3 thật — kế hoạch điền GR03878 ra đúng mã #60070071 mà khung POS hiện trong lượt thật (6 lô, 12 UID)", () => {
  const gr = pos.normalizeGr(H.sample("gr-stg-GR03878-20261024.json"));
  const p = plan.buildPlan(gr, receivedT3().units, H.qrByUidPO28237814());
  assert.equal(p.ok, true);
  assert.equal(p.hash, "60070071");
  assert.deepEqual(p.summary, { uids: 12, alreadyOnGr: 0, toWrite: 12, details: 6 });
  assert.deepEqual([p.blocked, p.warnings], [[], []]);
  assert.deepEqual(
    p.steps.map((s) => [s.productId, s.lotDate, s.before, s.target, s.uids.length]).sort(),
    [
      ["1110", "261009DHAUS-121228", 0, 1, 3],
      ["1110", "A1-121229", 0, 1, 3],
      ["2431732", "261016KHASUFDB-060627", 0, 1, 1],
      ["2431732", "A98-060627", 0, 1, 1],
      ["5451", "261009KSDHAU-121228", 0, 1, 2],
      ["5451", "A1-121228", 0, 1, 2],
    ]
  );
});

test("T3 thật — sau khi nhận, tìm theo SO trả total 0: phiên MỚI mở sau lượt nhận dừng ở 'không có đơn khớp', không chọn đơn", async () => {
  const j = H.sample(SEARCH_AFTER);
  assert.deepEqual(j, { items: [], total: 0 });
  const r = await resolve.resolveNwOrder({
    search: { ok: true, status: 200, json: j },
    ctx: H.STG_CTX,
    fingerprintSource: pos.grFingerprintSource(pos.normalizeGr(H.sample("gr-stg-GR03878-20261024.json"))),
    getOrder: () => assert.fail("không đọc đơn khi không có ứng viên"),
    getReceiving: () => assert.fail("không đọc /receiving khi không có ứng viên"),
  });
  assert.deepEqual([r.ok, r.reason, r.total, r.read, r.candidates, r.chosen], [false, "no_match", 0, 0, 0, null]);
});
