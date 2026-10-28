"use strict";
// A1 (operator 28/10 21:32–21:54, v0.2.4): GR03887 / PO00006767 / SO 1594095 ↔ Nextwaves PO13806459 (refId SOBD1594095-1056823).
// Mẫu từ ba Net Capture tab POS (chỉ body; xem samples/README.md) + chrome.storage của extension. Không có capture tab Nextwaves.
// Lượt thật: phiên tạo từ nút danh sách → receive-scan 200 (15 EPC) → kế hoạch #EF0E020C (5 lô, 15 UID) → cấp phép → 5 PUT 200
// → HOÀN THÀNH (trang POS) 200.
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { pos, plan, apply } = H.lib();

const GR = "f2ae6e25-64bc-497b-81db-2de87284ec80";
const KEY = `STG:${GR}`;
const EPC_TAILS = ["EF01C9CA", "EF01C9C9", "EF01C9C8", "EF01A9CB", "EF01A9CA", "EF01A9C9", "EF01A9C8", "EF0189CB", "EF0189CA", "EF0189C9", "EF0189C8", "EB01E9CB", "EB01E9CA", "EB01E9C9", "EB01E9C8"];
const RUNBOOK_EPCS = EPC_TAILS.map((t) => `E280F30200000000${t}`).sort();
const grBefore = () => pos.normalizeGr(H.sample("pos-stg-gr-GR03887-truoc-20261028.json"));
const storage = () => H.sample("ext-stg-storage-GR03887-20261028.json");
const session = () => storage().sessions[KEY];
const units = () => session().nwResult.units;
const qrByUid = () => {
  const out = {};
  for (const r of H.sample("pos-stg-qrcode-GR03887-15uid-20261028.json")) {
    const uid = r.url.split("code=")[1];
    out[uid] = pos.normalizeQrLookup(r.response, uid);
  }
  return out;
};
const w1 = () => H.sample("pos-stg-gr-W1-GR03887-20261028.json");
const realPuts = () =>
  w1()
    .filter((x) => x.method === "PUT")
    .map((x) => ({ detailId: x.url.split("/detail/")[1], body: x.request, status: x.status }));
const details = (gr) => new Map(gr.items.flatMap((it) => it.details.map((d) => [d.id, d])));
// Mã POS thêm vào từng lô khi HOÀN THÀNH: lotDate → mã thêm.
const addedByLot = (filled, done) => {
  const before = details(filled);
  const out = {};
  for (const [id, d] of details(done)) out[d.lotDate] = d.qrCodes.filter((c) => !before.get(id).qrCodes.includes(c));
  return out;
};

test("A1 thật — T1 phía POS: PO00006767 nối SO 1594095, tìm GR theo SO đủ một trang, chỉ GR03887, không khoá ghi", () => {
  const gr = grBefore();
  assert.deepEqual([gr.code, gr.status], ["GR03887", "WAITING_TO_RECEIVE"]);
  const po = pos.normalizePo(H.sample("pos-stg-po-PO00006767-SOBD1594095-20261028.json"));
  const link = pos.resolveDelivery(gr, po, H.STORE_2222);
  assert.equal(link.ok, true, link.reason);
  assert.deepEqual([link.soBase, link.deliveryCode], ["SOBD1594095", "SOBD1594095-F"]);
  const check = pos.checkSoGrs(H.sample("pos-stg-gr-search-so-1594095-20261028.json"), H.STORE_2222);
  assert.deepEqual([check.ok, check.total, check.read, check.list.map((g) => g.code)], [true, 1, 1, ["GR03887"]]);
  assert.equal(pos.soWriteLock(check, GR), null);
});

test("A1 thật — Nextwaves nhận đúng 15 EPC của runbook §1 (= EPC dự kiến), mỗi EPC có UID, một biên nhận mới", () => {
  const s = session();
  const up = (l) => l.map((x) => x.toUpperCase()).sort();
  assert.deepEqual(up(units().map((u) => u.epc)), RUNBOOK_EPCS);
  const expected = up(s.expected.shipments.flatMap((sh) => sh.lines.flatMap((l) => l.units.map((u) => u.epc))));
  assert.deepEqual(expected, RUNBOOK_EPCS, "không tem lạ / thiếu so với phiếu gửi");
  assert.ok(units().every((u) => /^\d{13}AA1$/.test(u.uid)));
  assert.equal(new Set(units().map((u) => u.uid)).size, 15);
  assert.deepEqual([s.receiptIdsBefore, s.nwResult.receiptIds.length], [[], 1]);
});

test("A1 thật — kế hoạch tính lại từ GR lúc về POS + units extension đã dùng + 15 tra QR thật = #EF0E020C, đúng 5 PUT đã gửi", () => {
  const u = units();
  const p = plan.buildPlan(grBefore(), u, qrByUid());
  assert.deepEqual([p.ok, p.blocked.map((b) => b.code), p.warnings.map((w) => w.code), p.complete], [true, [], [], false]);
  assert.equal(p.hash, "EF0E020C", "mã kế hoạch trên khung / nhật ký thật");
  const puts = realPuts();
  assert.deepEqual(
    p.steps.map((s) => ({ detailId: s.detailId, body: { detail: { received_quantity: s.target, lot_id: s.lotId, thuocsi_qr_codes: s.uids } } })),
    puts.map(({ detailId, body }) => ({ detailId, body })),
    "thứ tự + nội dung từng PUT",
  );
  assert.ok(puts.every((x) => x.status === 200));
  // 1110: 3 vỉ = 1 hộp; 5451: 4 vỉ = 1 hộp; Soffell: 1 chai. Mỗi lô 0 → 1.
  assert.deepEqual(p.steps.map((s) => [s.productId, s.unit, s.uids.length, s.before, s.target]), [
    ["2431732", "chai", 1, 0, 1],
    ["5451", "hộp", 4, 0, 1],
    ["5451", "hộp", 4, 0, 1],
    ["1110", "hộp", 3, 0, 1],
    ["1110", "hộp", 3, 0, 1],
  ]);
  assert.deepEqual(new Set(puts.flatMap((x) => x.body.detail.thuocsi_qr_codes)), new Set(u.map((x) => x.uid)), "UID đã PUT = UID Nextwaves");
});

test("A1 thật — runPlan trên chuỗi GET / PUT thật: 5/5 done, gửi đúng từng body đã thấy trên mạng", async () => {
  const p = plan.buildPlan(grBefore(), units(), qrByUid());
  const seq = w1();
  const gets = seq.filter((x) => x.method === "GET").map((x) => pos.normalizeGr(x.response));
  const puts = seq.filter((x) => x.method === "PUT");
  assert.deepEqual([gets.length, puts.length], [10, 5]);
  const sent = [];
  let gi = 0;
  let pi = 0;
  const r = await apply.runPlan(p, {
    getGr: async () => gets[gi++],
    beforePut: async () => true,
    putDetail: async (step, body) => {
      sent.push({ detailId: step.detailId, body });
      const x = puts[pi++];
      return { ok: x.status >= 200 && x.status < 300, status: x.status, body: x.response };
    },
  });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.results.map((x) => x.status), ["done", "done", "done", "done", "done"]);
  assert.deepEqual(sent, realPuts().map(({ detailId, body }) => ({ detailId, body })));
  assert.equal(gi, 10);
});

test("A1 thật — GR sau khi điền: RECEIVING, 5 lô nhận 1, 15 UID đúng chỗ → kế hoạch 'đã xong', không còn bước ghi", () => {
  const after = pos.normalizeGr(H.sample("pos-stg-gr-GR03887-W1-sau-20261028.json"));
  assert.equal(after.status, "RECEIVING");
  assert.deepEqual([...details(after).values()].map((d) => [d.received, d.qrCodes.length]).sort(), [[1, 1], [1, 3], [1, 3], [1, 4], [1, 4]]);
  const p = plan.buildPlan(after, units(), qrByUid());
  assert.deepEqual([p.ok, p.complete, p.steps.length, p.blocked.length], [true, true, 0, 0]);
});

test("A1 thật — HOÀN THÀNH: PUT status/COMPLETED không body; POS thêm mỗi lô đúng một mã, là mã QR của LÔ (trùng GR03880 ở 3 lô chung)", () => {
  const [put] = H.sample("pos-stg-gr-status-COMPLETED-GR03887-20261028.json");
  assert.deepEqual([put.method, put.status, put.request, put.response], ["PUT", 200, null, null]);
  assert.ok(put.url.endsWith(`/goods-receipt/${GR}/status/COMPLETED`));
  const filled = pos.normalizeGr(H.sample("pos-stg-gr-GR03887-W1-sau-20261028.json"));
  const done = pos.normalizeGr(H.sample("pos-stg-gr-GR03887-completed-20261028.json"));
  assert.equal(done.status, "COMPLETED");
  const ours = new Set(units().map((u) => u.uid));
  const before = details(filled);
  for (const [id, d] of details(done)) {
    const b = before.get(id);
    assert.deepEqual(b.qrCodes.filter((c) => !d.qrCodes.includes(c)), [], "không mất mã nào");
    const added = d.qrCodes.filter((c) => !b.qrCodes.includes(c));
    assert.equal(added.length, d.received, `chi tiết ${id}: thêm đúng received_quantity mã`);
    assert.ok(added.every((c) => !ours.has(c)), "mã thêm không phải UID Nextwaves");
  }
  const a87 = addedByLot(filled, done);
  const a80 = addedByLot(pos.normalizeGr(H.sample("pos-stg-gr-GR03880-W1-sau-20261026.json")), pos.normalizeGr(H.sample("pos-stg-gr-GR03880-completed-20261026.json")));
  const shared = Object.keys(a87).filter((lot) => lot in a80).sort();
  assert.deepEqual(shared, ["261009DHAUS-121228", "261009KSDHAU-121228", "A98-060627"]);
  for (const lot of shared) assert.deepEqual(a87[lot], a80[lot], `lô ${lot}: cùng mã ở GR03880 (26/10) và GR03887 (28/10)`);
  const p = plan.buildPlan(done, units(), qrByUid());
  assert.equal(p.ok, false);
  assert.ok(p.blocked.some((b) => b.code === "gr_has_foreign_codes"));
});

test("A1 thật — nhật ký extension: phiên v0.2.4 tạo mới 21:32:57 → nhận 200 (15 EPC) → #EF0E020C → 5 apply_done → applied → gr_completed → ui_anchor_missing; cấp phép thừa 'GR3887' không trùng GR03887", () => {
  const st = storage();
  assert.deepEqual(Object.keys(st.sessions), [KEY], "kho chỉ còn một phiên");
  const s = session();
  assert.deepEqual([s.grCode, s.state, s.createdBy, s.nwPoNumber, s.nwRefId, s.deliveryCode], ["GR03887", "done", "0.2.4", "PO13806459", "SOBD1594095-1056823", "SOBD1594095-F"]);
  const types = s.log.map((l) => l.type);
  assert.deepEqual(types.filter((t) => !/^apply_(sending|done)$/.test(t) && t !== "plan"), ["start", "nw_matched", "receive_scan", "scan_ok", "nw_received", "apply_claimed", "applied", "gr_completed", "ui_anchor_missing"]);
  const scan = s.log.find((l) => l.type === "receive_scan");
  assert.deepEqual([scan.httpStatus, scan.sentEpcs], [200, 15]);
  const plans = s.log.filter((l) => l.type === "plan");
  assert.equal(plans.length, 3);
  assert.ok(plans.every((l) => l.hash === "EF0E020C" && l.ok && l.steps === 5 && l.blocked.length === 0));
  assert.equal(s.log.filter((l) => l.type === "apply_done").length, 5);
  assert.deepEqual([s.applyResult.hash, s.applyResult.steps, s.applyResult.uids, s.authorization.planHash, s.authorization.grCode], ["EF0E020C", 5, 15, "EF0E020C", "GR03887"]);
  // Cấp phép đúng mã đã dùng (xoá khỏi kho); chỉ còn cấp phép gõ nhầm, khoá không trùng phiếu nào.
  assert.deepEqual(Object.keys(st.grants), ["STG:GR3887"]);
  assert.equal(st.grants["STG:GR3887"].grCode, "GR3887");
  assert.ok(st.grants["STG:GR3887"].createdAt < s.authorization.grantedAt);
  assert.deepEqual([st.lastUpgrade.from, st.lastUpgrade.to, st.lastUpgrade.removedSessions], ["0.2.3", "0.2.4", []]);
});
