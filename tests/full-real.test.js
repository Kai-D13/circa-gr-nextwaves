"use strict";
// FULL-STG lượt 1 (operator 26/10 12:08–12:33, v0.1.5): GR03880 / PO00006754 / SO 1593849 ↔ Nextwaves PO76458756.
// Mẫu từ Net Capture tab POS (chỉ body; xem samples/README.md) + chrome.storage của extension (units extension đã dùng).
// Lượt thật: receive-scan 200 (11 EPC) → kế hoạch #E33C777A (5 lô, 11 UID) → cấp phép → 5 PUT 200 → HOÀN THÀNH (POS) 200.
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { pos, plan, apply } = H.lib();

const GR = "d0e9cfe4-69b1-4f4b-9a4a-1319d9f9898d";
const KEY = `STG:${GR}`;
const grBefore = () => pos.normalizeGr(H.sample("pos-stg-gr-GR03880-truoc-20261026.json"));
const storage = () => H.sample("ext-stg-storage-GR03878-GR03880-20261026.json");
const units = () => storage().sessions[KEY].nwResult.units;
const qrByUid = () => {
  const out = {};
  for (const r of H.sample("pos-stg-qrcode-GR03880-11uid-20261026.json")) {
    const uid = r.url.split("code=")[1];
    out[uid] = pos.normalizeQrLookup(r.response, uid);
  }
  return out;
};
const w1 = () => H.sample("pos-stg-gr-W1-GR03880-20261026.json");
const realPuts = () =>
  w1()
    .filter((x) => x.method === "PUT")
    .map((x) => ({ detailId: x.url.split("/detail/")[1], body: x.request, status: x.status }));

test("FULL thật — T1 phía POS: PO00006754 nối SO 1593849, tìm GR theo SO đủ một trang, chỉ GR03880, không khoá ghi", () => {
  const gr = grBefore();
  assert.deepEqual([gr.code, gr.status], ["GR03880", "WAITING_TO_RECEIVE"]);
  const po = pos.normalizePo(H.sample("pos-stg-po-PO00006754-SOBD1593849-20261026.json"));
  const link = pos.resolveDelivery(gr, po, H.STORE_2222);
  assert.equal(link.ok, true, link.reason);
  assert.equal(link.soBase, "SOBD1593849");
  const check = pos.checkSoGrs(H.sample("pos-stg-gr-search-so-1593849-20261026.json"), H.STORE_2222);
  assert.deepEqual([check.ok, check.total, check.read, check.list.map((g) => g.code)], [true, 1, 1, ["GR03880"]]);
  assert.equal(pos.soWriteLock(check, GR), null);
});

test("FULL thật — kế hoạch tính lại từ GR trước + units extension đã dùng + 11 tra QR thật = #E33C777A, đúng 5 PUT đã gửi", () => {
  const u = units();
  assert.equal(u.length, 11);
  const p = plan.buildPlan(grBefore(), u, qrByUid());
  assert.deepEqual([p.ok, p.blocked.map((b) => b.code), p.complete], [true, [], false]);
  assert.equal(p.hash, "E33C777A", "mã kế hoạch trên khung / nhật ký thật");
  const puts = realPuts();
  assert.deepEqual(
    p.steps.map((s) => ({ detailId: s.detailId, body: { detail: { received_quantity: s.target, lot_id: s.lotId, thuocsi_qr_codes: s.uids } } })),
    puts.map(({ detailId, body }) => ({ detailId, body })),
    "thứ tự + nội dung từng PUT",
  );
  assert.ok(puts.every((x) => x.status === 200));
  // 1110: 3 vỉ = 1 hộp; 5451: 2 túi = 1 hộp; Soffell: 1 chai.
  assert.deepEqual(p.steps.map((s) => [s.productId, s.unit, s.uids.length, s.before, s.target]), [
    ["2431732", "chai", 1, 0, 1],
    ["1110", "hộp", 3, 0, 1],
    ["1110", "hộp", 3, 0, 1],
    ["5451", "hộp", 2, 0, 1],
    ["5451", "hộp", 2, 0, 1],
  ]);
});

test("FULL thật — runPlan trên chuỗi GET / PUT thật: 5/5 done, gửi đúng từng body đã thấy trên mạng", async () => {
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

test("FULL thật — GR sau khi điền: RECEIVING, 5 chi tiết đủ, 11 UID đúng chỗ → kế hoạch 'đã xong', không còn bước ghi", () => {
  const after = pos.normalizeGr(H.sample("pos-stg-gr-GR03880-W1-sau-20261026.json"));
  assert.equal(after.status, "RECEIVING");
  const p = plan.buildPlan(after, units(), qrByUid());
  assert.deepEqual([p.ok, p.complete, p.steps.length, p.blocked.length], [true, true, 0, 0]);
});

test("FULL thật — HOÀN THÀNH: PUT status/COMPLETED không body; POS THÊM mỗi chi tiết received_quantity mã QR ngoài UID Nextwaves → extension không lập kế hoạch ghi", () => {
  const [put] = H.sample("pos-stg-gr-status-COMPLETED-GR03880-20261026.json");
  assert.deepEqual([put.method, put.status, put.request, put.response], ["PUT", 200, null, null]);
  assert.ok(put.url.endsWith(`/goods-receipt/${GR}/status/COMPLETED`));
  const filled = pos.normalizeGr(H.sample("pos-stg-gr-GR03880-W1-sau-20261026.json"));
  const done = pos.normalizeGr(H.sample("pos-stg-gr-GR03880-completed-20261026.json"));
  assert.equal(done.status, "COMPLETED");
  const ours = new Set(units().map((u) => u.uid));
  const det = (gr) => new Map(gr.items.flatMap((it) => it.details.map((d) => [d.id, d])));
  const before = det(filled);
  for (const [id, d] of det(done)) {
    const b = before.get(id);
    const added = d.qrCodes.filter((c) => !b.qrCodes.includes(c));
    assert.deepEqual(b.qrCodes.filter((c) => !d.qrCodes.includes(c)), [], "không mất mã nào");
    assert.equal(added.length, d.received, `chi tiết ${id}: thêm đúng received_quantity mã`);
    assert.ok(added.every((c) => !ours.has(c)), "mã thêm không phải UID Nextwaves");
  }
  const p = plan.buildPlan(done, units(), qrByUid());
  assert.equal(p.ok, false);
  assert.ok(p.blocked.some((b) => b.code === "gr_has_foreign_codes"));
});

test("FULL thật — nhật ký extension: GR03880 nhận 200 (11 EPC) → #E33C777A → 5 apply_done → applied → gr_completed; GR03878 (25/10) 6 apply_done", () => {
  const st = storage();
  assert.deepEqual(st.grants, {});
  const s = st.sessions[KEY];
  assert.deepEqual([s.grCode, s.state, s.nwPoNumber, s.nwRefId], ["GR03880", "done", "PO76458756", "SOBD1593849-1056738"]);
  const types = s.log.map((l) => l.type);
  assert.deepEqual(types.filter((t) => !/^apply_(sending|done)$/.test(t) && t !== "plan"), ["start", "nw_matched", "receive_scan", "scan_ok", "nw_received", "apply_claimed", "applied", "gr_completed"]);
  const scan = s.log.find((l) => l.type === "receive_scan");
  assert.deepEqual([scan.httpStatus, scan.sentEpcs], [200, 11]);
  assert.ok(s.log.filter((l) => l.type === "plan").every((l) => l.hash === "E33C777A" && l.ok && l.steps === 5));
  assert.equal(s.log.filter((l) => l.type === "apply_done").length, 5);
  assert.deepEqual([s.applyResult.hash, s.applyResult.steps, s.applyResult.uids, s.authorization.planHash], ["E33C777A", 5, 11, "E33C777A"]);
  const s78 = st.sessions["STG:2de6c0ec-2ea8-4038-8616-659fa3f5820a"];
  assert.deepEqual([s78.state, s78.applyResult.hash, s78.applyResult.steps, s78.applyResult.uids], ["applied", "60070071", 6, 12]);
  assert.equal(s78.log.filter((l) => l.type === "apply_done").length, 6);
  const [search] = H.sample("nw-stg-receiving-search-q-SOBD1593849-sau-20261026.json");
  assert.deepEqual(search.response, { items: [], total: 0 });
});

test("FULL thật — HAR tab Nextwaves (chỉ request, không body): receive-scan 200 gửi đúng 11 EPC dự kiến = 11 EPC đã nhận; sau đó extension chỉ GET PO + phiếu gửi", () => {
  const har = H.sample("nw-stg-receive-scan-req-PO76458756-20261026.json");
  const [scan] = har;
  assert.deepEqual([scan.method, scan.status, scan.request.onMissing], ["POST", 200, "keep_open"]);
  assert.ok(scan.url.endsWith("/inter-tenant-shipments/efa14567-2b36-4dae-9148-6ba00d4d741d/receive-scan"));
  const s = storage().sessions[KEY];
  const up = (l) => l.map((x) => x.toUpperCase()).sort();
  const expected = up(s.expected.shipments.flatMap((sh) => sh.lines.flatMap((l) => l.units.map((u) => u.epc))));
  assert.equal(expected.length, 11);
  assert.deepEqual(up(scan.request.epcs), expected, "không tem lạ / thiếu");
  assert.deepEqual(up(s.nwResult.units.map((u) => u.epc)), expected);
  const ext = har.filter((x) => /\/purchase-orders\/900e9a9d[^/]*$|\/inter-tenant-shipments\/efa14567[^/]*$/.test(x.url));
  assert.deepEqual(ext.map((x) => [x.method, x.status]), [["GET", 200], ["GET", 200]]);
  assert.ok(har.every((x) => x.method === "GET" || /receive-scan$/.test(x.url)), "ngoài lượt bấm của dược sĩ không có request ghi");
});
