"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { pos, nw, plan, apply } = H.lib();

function inputs() {
  const gr = pos.normalizeGr(H.sample("gr-stg-GR03878-20261024.json"));
  const rec = nw.buildReceivedUnits(
    nw.normalizePoDetail(H.poDetailPO28237814Received()),
    [nw.normalizeShipment(H.shipmentPO28237814Received())],
    nw.normalizeReceiving(H.receivingPO28237814())
  );
  return { gr, units: rec.units, qr: H.qrByUidPO28237814() };
}

const codesOf = (p) => p.blocked.map((b) => b.code);
const detailOf = (gr, lotDate, productId) => gr.items.find((i) => i.productId === productId).details.find((d) => d.lotDate === lotDate);
// Đặt UID lên một chi tiết như POS đã lưu (mã + lượng).
function put(gr, productId, lotDate, uids, received) {
  const d = detailOf(gr, lotDate, productId);
  d.qrCodes = d.qrCodes.concat(uids);
  d.qrCodeCount = (d.qrCodeCount || 0) + uids.length;
  d.received = received;
  return d;
}

test("GR03878: 12 UID → 6 lần ghi, mỗi lô +1 đơn vị dòng (3 vỉ = 1 hộp, 2 túi = 1 hộp, 1 chai)", () => {
  const { gr, units, qr } = inputs();
  const p = plan.buildPlan(gr, units, qr);
  assert.equal(p.ok, true, JSON.stringify(p.blocked));
  assert.equal(p.complete, false);
  assert.match(p.hash, /^[0-9A-F]{8}$/);
  assert.equal(p.steps.length, 6);
  assert.deepEqual(p.steps.map((s) => [s.productId, s.lotDate, s.before, s.delta, s.target, s.uids.length]).sort(), [
    ["1110", "261009DHAUS-121228", 0, 1, 1, 3],
    ["1110", "A1-121229", 0, 1, 1, 3],
    ["2431732", "261016KHASUFDB-060627", 0, 1, 1, 1],
    ["2431732", "A98-060627", 0, 1, 1, 1],
    ["5451", "261009KSDHAU-121228", 0, 1, 1, 2],
    ["5451", "A1-121228", 0, 1, 1, 2],
  ]);
  assert.deepEqual(p.warnings, []);
  assert.deepEqual(p.summary, { uids: 12, alreadyOnGr: 0, toWrite: 12, details: 6 });
  // Soffell (không lô bên Nextwaves): lô lấy từ tra QR thật 1792379018917AA1 → A98-060627.
  assert.ok(p.steps.find((s) => s.lotDate === "A98-060627").uids.includes("1792379018917AA1"));
  // Mã kế hoạch tất định; phiếu khác → mã khác.
  assert.equal(plan.buildPlan(gr, units, qr).hash, p.hash);
  const g2 = H.clone(gr);
  g2.items[0].details[0].quantity += 1;
  assert.notEqual(plan.buildPlan(g2, units, qr).hash, p.hash);
});

test("một chặn bất kỳ → không ghi gì (cả gói)", () => {
  const { gr, units, qr } = inputs();
  qr["1792145819958AA1"] = { ok: false, reason: "404" };
  const p = plan.buildPlan(gr, units, qr);
  assert.equal(p.ok, false);
  // UID bị chặn kéo theo 2 UID còn lại của lô thành lượng lẻ → thêm "fraction"; cả gói vẫn không ghi.
  assert.deepEqual(codesOf(p), ["qr_lookup_failed", "fraction"]);
  assert.equal(p.blocked[0].uid, "1792145819958AA1");
});

test("lô Nextwaves ≠ lô tra QR → lot_conflict; lô không có trên GR → lot_not_on_gr", () => {
  const { gr, units, qr } = inputs();
  const q1 = H.clone(qr);
  q1["1792145819958AA1"].lot = "KHAC";
  assert.deepEqual(codesOf(plan.buildPlan(gr, units, q1)), ["lot_conflict", "fraction"]);
  const u2 = H.clone(units);
  const x = u2.find((u) => u.uid === "1792145819958AA1");
  x.batchNumber = "ZZZ";
  const q2 = H.clone(qr);
  q2["1792145819958AA1"].lot = "ZZZ";
  assert.deepEqual(codesOf(plan.buildPlan(gr, u2, q2)), ["lot_not_on_gr", "fraction"]);
});

test("quy đổi lẻ → fraction; vượt số lượng lô → over; đơn vị lạ → unit_unknown", () => {
  const { gr, units, qr } = inputs();
  const fewer = units.filter((u) => u.uid !== "1792145819958AA1"); // lô DHAUS còn 2 vỉ = 4 viên = 2/3 hộp
  const pf = plan.buildPlan(gr, fewer, qr);
  assert.ok(pf.blocked.some((b) => b.code === "fraction"));
  const g2 = H.clone(gr);
  detailOf(g2, "A98-060627", "2431732").quantity = 0;
  assert.ok(plan.buildPlan(g2, units, qr).blocked.some((b) => b.code === "over"));
  const u3 = H.clone(units);
  u3.find((u) => u.uid === "1792379018917AA1").unitName = "thùng xx";
  assert.ok(plan.buildPlan(gr, u3, qr).blocked.some((b) => b.code === "unit_unknown"));
});

test("sản phẩm lạ / tra QR ra sản phẩm khác → chặn; không có UID nào → nothing_to_write", () => {
  const { gr, units, qr } = inputs();
  const u1 = H.clone(units);
  u1[0].posProductId = "9999";
  assert.ok(plan.buildPlan(gr, u1, qr).blocked.some((b) => b.code === "product_not_on_gr"));
  const q2 = H.clone(qr);
  q2["1792145819958AA1"].productId = 5451;
  assert.ok(plan.buildPlan(gr, units, q2).blocked.some((b) => b.code === "qr_product_mismatch"));
  assert.deepEqual(codesOf(plan.buildPlan(gr, [], qr)), ["nothing_to_write"]);
});

test("P2.2: thiếu kết quả tra QR / QR thiếu productId hoặc lô → chặn trước khi ghi", () => {
  const { gr, units, qr } = inputs();
  const q1 = H.clone(qr);
  delete q1["1792379018917AA1"];
  assert.deepEqual(codesOf(plan.buildPlan(gr, units, q1)), ["qr_lookup_missing"]);
  const q2 = H.clone(qr);
  q2["1792379018917AA1"].productId = null;
  assert.deepEqual(codesOf(plan.buildPlan(gr, units, q2)), ["qr_incomplete"]);
  const q3 = H.clone(qr);
  q3["1792379018917AA1"].lot = "";
  assert.deepEqual(codesOf(plan.buildPlan(gr, units, q3)), ["qr_incomplete"]);
  const q4 = H.clone(qr);
  q4["1792379018917AA1"] = { ok: false, reason: "incomplete" };
  assert.deepEqual(codesOf(plan.buildPlan(gr, units, q4)), ["qr_incomplete"]);
  assert.deepEqual(codesOf(plan.buildPlan(gr, units, null)).filter((c) => c !== "fraction")[0], "qr_lookup_missing");
});

// ---- P1.2: UID đã có trên GR phải được đối chiếu như UID mới ----

test("P1.2: UID đã nằm ĐÚNG lô, lượng nhất quán → bỏ qua; đủ 12 → complete, không bước nào", () => {
  const { gr, units, qr } = inputs();
  const g1 = H.clone(gr);
  put(g1, "2431732", "A98-060627", ["1792379018917AA1"], 1);
  const p1 = plan.buildPlan(g1, units, qr);
  assert.equal(p1.ok, true, JSON.stringify(p1.blocked));
  assert.equal(p1.steps.length, 5);
  assert.equal(p1.summary.alreadyOnGr, 1);
  assert.equal(p1.complete, false);
  // Phiếu đã có đủ 12 UID đúng lô (như sau một lần điền thành công).
  const full = H.clone(gr);
  for (const st of plan.buildPlan(gr, units, qr).steps) put(full, st.productId, st.lotDate, st.uids, st.target);
  const pf = plan.buildPlan(full, units, qr);
  assert.deepEqual([pf.ok, pf.complete, pf.steps.length, pf.summary.alreadyOnGr], [true, true, 0, 12]);
});

test("P1.2: UID nằm sai lô (cùng sản phẩm) → uid_on_wrong_detail, không complete (tái hiện PM)", () => {
  const { gr, units, qr } = inputs();
  const g = H.clone(gr);
  // 1792379018917AA1 thuộc lô A98-060627 (tra QR) nhưng đang nằm ở lô 261016KHASUFDB-060627.
  put(g, "2431732", "261016KHASUFDB-060627", ["1792379018917AA1"], 1);
  const p = plan.buildPlan(g, units, qr);
  assert.equal(p.ok, false);
  assert.equal(p.complete, false);
  assert.ok(codesOf(p).includes("uid_on_wrong_detail"));
  assert.equal(p.blocked.find((b) => b.code === "uid_on_wrong_detail").uid, "1792379018917AA1");
  // Chỉ một UID, nằm sai chỗ: trước đây "alreadyOnGr=1 + nothing_to_write" → nay chặn.
  const only = units.filter((u) => u.uid === "1792379018917AA1");
  const p1 = plan.buildPlan(g, only, qr);
  assert.deepEqual([p1.ok, p1.complete, codesOf(p1).includes("uid_on_wrong_detail")], [false, false, true]);
});

test("P1.2: UID nằm ở dòng sản phẩm khác / ở hai lô / mã bị nối trùng → chặn", () => {
  const { gr, units, qr } = inputs();
  const g1 = H.clone(gr);
  put(g1, "5451", "A1-121228", ["1792379018917AA1"], 0);
  assert.ok(codesOf(plan.buildPlan(g1, units, qr)).includes("uid_on_wrong_detail"));
  const g2 = H.clone(gr);
  put(g2, "2431732", "A98-060627", ["1792379018917AA1"], 1);
  put(g2, "2431732", "261016KHASUFDB-060627", ["1792379018917AA1"], 1);
  assert.ok(codesOf(plan.buildPlan(g2, units, qr)).includes("uid_on_many_details"));
  const g3 = H.clone(gr);
  const d = put(g3, "2431732", "A98-060627", ["1792379018917AA1"], 1);
  d.qrCodeCount = 2; // server lưu 2 lần cùng một mã
  assert.ok(codesOf(plan.buildPlan(g3, units, qr)).includes("gr_duplicate_codes"));
});

test("P1.2: received_quantity lệch với UID đang nằm trên lô (thiếu / thừa / có lượng mà không mã) → received_mismatch", () => {
  const { gr, units, qr } = inputs();
  const g1 = H.clone(gr);
  put(g1, "2431732", "A98-060627", ["1792379018917AA1"], 0); // có mã, lượng chưa tăng
  assert.deepEqual(codesOf(plan.buildPlan(g1, units, qr)), ["received_mismatch"]);
  const g2 = H.clone(gr);
  put(g2, "2431732", "A98-060627", ["1792379018917AA1"], 2); // lượng thừa so với 1 chai
  assert.deepEqual(codesOf(plan.buildPlan(g2, units, qr)), ["received_mismatch"]);
  const g3 = H.clone(gr);
  detailOf(g3, "A1-121229", "1110").received = 1; // lượng nhập tay, không mã (cộng thêm 1 hộp từ UID → vượt)
  assert.deepEqual(codesOf(plan.buildPlan(g3, units, qr)), ["received_mismatch", "over"]);
  const g4 = H.clone(gr);
  put(g4, "1110", "261009DHAUS-121228", ["1792145819958AA1"], 0); // 1/3 hộp trên lô
  assert.ok(codesOf(plan.buildPlan(g4, units, qr)).includes("fraction_on_gr"));
});

test("UID đã có trên GR nhưng không thuộc kết quả Nextwaves → gr_has_foreign_codes", () => {
  const { gr, units, qr } = inputs();
  const g2 = H.clone(gr);
  g2.items[0].details[0].qrCodes = ["MA-QUET-TAY"];
  g2.items[0].details[0].qrCodeCount = 1;
  assert.equal(g2.items[0].details[0].received, 0);
  assert.deepEqual(codesOf(plan.buildPlan(g2, units, qr)), ["gr_has_foreign_codes"]);
});

// ---- apply (W1) với API giả giữ GR trong bộ nhớ ----
function fakeApi(gr, opts = {}) {
  const state = H.clone(gr);
  const calls = [];
  let n = 0;
  let reads = 0;
  return {
    state,
    calls,
    getGr: async () => {
      reads += 1;
      if (opts.mutateBeforeRead) opts.mutateBeforeRead(state, reads, calls.length);
      return H.clone(state);
    },
    beforePut: opts.beforePut,
    putDetail: async (step, body) => {
      n += 1;
      calls.push({ step: step.detailId, body: H.clone(body) });
      if (opts.failAt === n) return { ok: false, status: 400, body: { message: "X" } };
      if (opts.throwAt === n) throw new Error("network");
      const d = state.items.flatMap((i) => i.details).find((x) => x.id === step.detailId);
      d.received = body.detail.received_quantity;
      if (!opts.dropCodes) {
        d.qrCodes = d.qrCodes.concat(body.detail.thuocsi_qr_codes);
        d.qrCodeCount = (d.qrCodeCount || 0) + body.detail.thuocsi_qr_codes.length;
      }
      return { ok: true, status: 200 };
    },
  };
}

test("W1: 6 PUT tuần tự, body đúng (received tuyệt đối, lot_id, UID của lô), đọc lại xác nhận", async () => {
  const { gr, units, qr } = inputs();
  const p = plan.buildPlan(gr, units, qr);
  const api = fakeApi(gr);
  const events = [];
  const r = await apply.runPlan(p, api, (e) => events.push(e.type));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(api.calls.length, 6);
  const first = api.calls[0].body.detail;
  assert.deepEqual(Object.keys(first).sort(), ["lot_id", "received_quantity", "thuocsi_qr_codes"]);
  assert.equal(first.received_quantity, 1);
  assert.equal(events.filter((t) => t === "done").length, 6);
  assert.equal(api.state.items.flatMap((i) => i.details).reduce((n, d) => n + d.qrCodes.length, 0), 12);
  // Lập lại kế hoạch trên phiếu đã điền → complete, không bước nào.
  assert.equal(plan.buildPlan(api.state, units, qr).complete, true);
});

test("W1: chạy lại sau khi đã ghi đủ → không PUT thêm (already)", async () => {
  const { gr, units, qr } = inputs();
  const p = plan.buildPlan(gr, units, qr);
  const api = fakeApi(gr);
  await apply.runPlan(p, api);
  const again = await apply.runPlan(p, api);
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.equal(api.calls.length, 6, "không gửi lại");
  assert.ok(again.results.every((x) => x.status === "already"));
});

test("W1: chi tiết của bước bị đổi trước khi ghi → dừng gr_changed đúng ở bước đó, không PUT bước đó", async () => {
  const { gr, units, qr } = inputs();
  const p = plan.buildPlan(gr, units, qr);
  const target = p.steps[0].detailId;
  const api = fakeApi(gr, { mutateBeforeRead: (s) => (s.items.flatMap((i) => i.details).find((d) => d.id === target).received = 1) });
  const r = await apply.runPlan(p, api);
  assert.equal(r.reason, "gr_changed");
  assert.equal(r.step.detailId, target);
  assert.equal(api.calls.length, 0);
  // Đổi ở bước 4 (lượt đọc thứ 7 = trước PUT bước 4) → 3 bước đầu đã ghi, dừng trước bước 4.
  const t4 = p.steps[3].detailId;
  const api4 = fakeApi(gr, { mutateBeforeRead: (s, reads) => { if (reads === 7) s.items.flatMap((i) => i.details).find((d) => d.id === t4).received = 1; } });
  const r4 = await apply.runPlan(p, api4);
  assert.equal(r4.reason, "gr_changed");
  assert.equal(api4.calls.length, 3);
});

test("P2.3: phiếu đổi ở chi tiết KHÁC (quét tay giữa chừng) → dừng trước bước kế, không ghi tiếp", async () => {
  const { gr, units, qr } = inputs();
  const p = plan.buildPlan(gr, units, qr);
  const last = p.steps[5].detailId;
  // Sau bước 2 (lượt đọc thứ 5 = trước PUT bước 3), dược sĩ quét tay một mã vào chi tiết của bước 6.
  const api = fakeApi(gr, {
    mutateBeforeRead: (s, reads) => {
      if (reads !== 5) return;
      const d = s.items.flatMap((i) => i.details).find((x) => x.id === last);
      d.qrCodes = d.qrCodes.concat(["MA-QUET-TAY"]);
      d.qrCodeCount = (d.qrCodeCount || 0) + 1;
      d.received = 1;
    },
  });
  const r = await apply.runPlan(p, api);
  assert.equal(r.reason, "gr_changed");
  assert.equal(r.step.detailId, p.steps[2].detailId);
  assert.equal(r.observed.detailId, last);
  assert.equal(api.calls.length, 2);
  // Chi tiết khác chỉ đổi lượng (không mã) cũng dừng.
  const other = gr.items.flatMap((i) => i.details).find((d) => !p.steps.some((s) => s.detailId === d.id));
  if (other) {
    const api2 = fakeApi(gr, { mutateBeforeRead: (s, reads) => { if (reads === 3) s.items.flatMap((i) => i.details).find((d) => d.id === other.id).received = 1; } });
    assert.equal((await apply.runPlan(p, api2)).reason, "gr_changed");
  }
  // Thêm chi tiết mới vào phiếu → tập chi tiết đổi → dừng.
  const api3 = fakeApi(gr, { mutateBeforeRead: (s, reads) => { if (reads === 3) s.items[0].details.push({ id: "moi", lotId: "x", lotDate: "X-010130", quantity: 1, received: 0, qrCodes: [], qrCodeCount: 0 }); } });
  const r3 = await apply.runPlan(p, api3);
  assert.equal(r3.reason, "gr_changed");
  assert.equal(api3.calls.length, 1);
});

test("P1.5: mất quyền ghi (lease) trước một PUT → dừng lease_lost, không gửi tiếp", async () => {
  const { gr, units, qr } = inputs();
  const p = plan.buildPlan(gr, units, qr);
  let asks = 0;
  const api = fakeApi(gr, { beforePut: async () => (++asks <= 2) });
  const r = await apply.runPlan(p, api);
  assert.equal(r.reason, "lease_lost");
  assert.equal(api.calls.length, 2);
  assert.equal(asks, 3);
  const api2 = fakeApi(gr, { beforePut: async () => { throw new Error("background chết"); } });
  assert.equal((await apply.runPlan(p, api2)).reason, "lease_lost");
  assert.equal(api2.calls.length, 0);
});

test("W1: PUT lỗi ở bước 3 → dừng put_failed sau 3 lời gọi; chạy lại bỏ qua 2 bước đã xong", async () => {
  const { gr, units, qr } = inputs();
  const p = plan.buildPlan(gr, units, qr);
  const api = fakeApi(gr, { failAt: 3 });
  const r = await apply.runPlan(p, api);
  assert.equal(r.reason, "put_failed");
  assert.equal(api.calls.length, 3);
  const api2 = fakeApi(api.state);
  const r2 = await apply.runPlan(p, api2);
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.equal(r2.results.filter((x) => x.status === "already").length, 2);
  assert.equal(api2.calls.length, 4);
});

test("W1: lỗi mạng → unknown; server không lưu mã → verify_failed", async () => {
  const { gr, units, qr } = inputs();
  const p = plan.buildPlan(gr, units, qr);
  assert.equal((await apply.runPlan(p, fakeApi(gr, { throwAt: 1 }))).reason, "unknown");
  assert.equal((await apply.runPlan(p, fakeApi(gr, { dropCodes: true }))).reason, "verify_failed");
});

test("W1: kế hoạch có chặn → không chạy; GR đã hoàn tất → dừng", async () => {
  const { gr, units, qr } = inputs();
  const bad = plan.buildPlan(gr, [], qr);
  assert.equal((await apply.runPlan(bad, fakeApi(gr))).reason, "plan_not_ok");
  const p = plan.buildPlan(gr, units, qr);
  const done = H.clone(gr);
  done.status = "COMPLETED";
  const api = fakeApi(done);
  assert.equal((await apply.runPlan(p, api)).reason, "gr_not_receivable");
  assert.equal(api.calls.length, 0);
});
