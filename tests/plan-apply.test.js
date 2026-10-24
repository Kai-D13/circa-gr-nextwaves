"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { pos, nw, plan, apply } = H.lib();

function inputs() {
  const gr = pos.normalizeGr(H.sample("gr-stg-GR03878-20261024.json"));
  const rec = nw.buildReceivedUnits(
    nw.normalizePoDetail(H.poDetailPO28237814Received()),
    [nw.normalizeShipment(H.sample("nw-stg-shipment-34e67fb9-PO28237814.json"))],
    nw.normalizeReceiving(H.receivingPO28237814())
  );
  return { gr, units: rec.units, qr: H.qrByUidPO28237814() };
}

test("GR03878: 12 UID → 6 lần ghi, mỗi lô +1 đơn vị dòng (3 vỉ = 1 hộp, 2 túi = 1 hộp, 1 chai)", () => {
  const { gr, units, qr } = inputs();
  const p = plan.buildPlan(gr, units, qr);
  assert.equal(p.ok, true, JSON.stringify(p.blocked));
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
});

test("một chặn bất kỳ → không ghi gì (cả gói)", () => {
  const { gr, units, qr } = inputs();
  qr["1792145819958AA1"] = { ok: false, reason: "404" };
  const p = plan.buildPlan(gr, units, qr);
  assert.equal(p.ok, false);
  // UID bị chặn kéo theo 2 UID còn lại của lô thành lượng lẻ → thêm "fraction"; cả gói vẫn không ghi.
  assert.deepEqual(p.blocked.map((b) => b.code), ["qr_lookup_failed", "fraction"]);
  assert.equal(p.blocked[0].uid, "1792145819958AA1");
});

test("lô Nextwaves ≠ lô tra QR → lot_conflict; lô không có trên GR → lot_not_on_gr", () => {
  const { gr, units, qr } = inputs();
  const q1 = H.clone(qr);
  q1["1792145819958AA1"].lot = "KHAC";
  assert.deepEqual(plan.buildPlan(gr, units, q1).blocked.map((b) => b.code), ["lot_conflict", "fraction"]);
  const u2 = H.clone(units);
  const x = u2.find((u) => u.uid === "1792145819958AA1");
  x.batchNumber = "ZZZ";
  const q2 = H.clone(qr);
  q2["1792145819958AA1"].lot = "ZZZ";
  assert.deepEqual(plan.buildPlan(gr, u2, q2).blocked.map((b) => b.code), ["lot_not_on_gr", "fraction"]);
});

test("quy đổi lẻ → fraction; vượt số lượng lô → over; đơn vị lạ → unit_unknown", () => {
  const { gr, units, qr } = inputs();
  const fewer = units.filter((u) => u.uid !== "1792145819958AA1"); // lô DHAUS còn 2 vỉ = 4 viên = 2/3 hộp
  const pf = plan.buildPlan(gr, fewer, qr);
  assert.ok(pf.blocked.some((b) => b.code === "fraction"));
  const g2 = H.clone(gr);
  g2.items.find((i) => i.productId === "2431732").details.find((d) => d.lotDate === "A98-060627").quantity = 0;
  assert.ok(plan.buildPlan(g2, units, qr).blocked.some((b) => b.code === "over"));
  const u3 = H.clone(units);
  u3.find((u) => u.uid === "1792379018917AA1").unitName = "thùng xx";
  assert.ok(plan.buildPlan(gr, u3, qr).blocked.some((b) => b.code === "unit_unknown"));
});

test("UID đã có trên GR → bỏ qua; mã lạ trên GR → chặn gr_has_foreign_codes", () => {
  const { gr, units, qr } = inputs();
  const g1 = H.clone(gr);
  const soffell = g1.items.find((i) => i.productId === "2431732").details.find((d) => d.lotDate === "A98-060627");
  soffell.qrCodes = ["1792379018917AA1"];
  soffell.received = 1;
  const p1 = plan.buildPlan(g1, units, qr);
  assert.equal(p1.ok, true);
  assert.equal(p1.steps.length, 5);
  assert.equal(p1.summary.alreadyOnGr, 1);
  const g2 = H.clone(gr);
  g2.items[0].details[0].qrCodes = ["MA-QUET-TAY"];
  assert.deepEqual(plan.buildPlan(g2, units, qr).blocked.map((b) => b.code), ["gr_has_foreign_codes"]);
});

test("sản phẩm lạ / tra QR ra sản phẩm khác → chặn; không có gì để ghi → nothing_to_write", () => {
  const { gr, units, qr } = inputs();
  const u1 = H.clone(units);
  u1[0].posProductId = "9999";
  assert.ok(plan.buildPlan(gr, u1, qr).blocked.some((b) => b.code === "product_not_on_gr"));
  const q2 = H.clone(qr);
  q2["1792145819958AA1"].productId = 5451;
  assert.ok(plan.buildPlan(gr, units, q2).blocked.some((b) => b.code === "qr_product_mismatch"));
  assert.deepEqual(plan.buildPlan(gr, [], qr).blocked.map((b) => b.code), ["nothing_to_write"]);
});

// ---- apply (W1) với API giả giữ GR trong bộ nhớ ----
function fakeApi(gr, opts = {}) {
  const state = H.clone(gr);
  const calls = [];
  let n = 0;
  return {
    state,
    calls,
    getGr: async () => {
      if (opts.mutateBeforeRead) opts.mutateBeforeRead(state, calls.length);
      return H.clone(state);
    },
    putDetail: async (step, body) => {
      n += 1;
      calls.push({ step: step.detailId, body: H.clone(body) });
      if (opts.failAt === n) return { ok: false, status: 400, body: { message: "X" } };
      if (opts.throwAt === n) throw new Error("network");
      const d = state.items.flatMap((i) => i.details).find((x) => x.id === step.detailId);
      d.received = body.detail.received_quantity;
      if (!opts.dropCodes) d.qrCodes = d.qrCodes.concat(body.detail.thuocsi_qr_codes);
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
  assert.equal(r.ok, true);
  assert.equal(api.calls.length, 6);
  const first = api.calls[0].body.detail;
  assert.deepEqual(Object.keys(first).sort(), ["lot_id", "received_quantity", "thuocsi_qr_codes"]);
  assert.equal(first.received_quantity, 1);
  assert.equal(events.filter((t) => t === "done").length, 6);
  assert.equal(api.state.items.flatMap((i) => i.details).reduce((n, d) => n + d.qrCodes.length, 0), 12);
});

test("W1: chạy lại sau khi đã ghi đủ → không PUT thêm (already)", async () => {
  const { gr, units, qr } = inputs();
  const p = plan.buildPlan(gr, units, qr);
  const api = fakeApi(gr);
  await apply.runPlan(p, api);
  const again = await apply.runPlan(p, api);
  assert.equal(again.ok, true);
  assert.equal(api.calls.length, 6, "không gửi lại");
  assert.ok(again.results.every((x) => x.status === "already"));
});

test("W1: GR bị đổi trước khi ghi → dừng gr_changed đúng ở bước đó, không PUT bước đó", async () => {
  const { gr, units, qr } = inputs();
  const p = plan.buildPlan(gr, units, qr);
  const target = p.steps[0].detailId;
  const api = fakeApi(gr, { mutateBeforeRead: (s) => (s.items.flatMap((i) => i.details).find((d) => d.id === target).received = 1) });
  const r = await apply.runPlan(p, api);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "gr_changed");
  assert.equal(r.step.detailId, target);
  assert.equal(api.calls.length, 0);
  // Đổi ở bước 4 → 3 bước đầu đã ghi, dừng trước bước 4.
  const t4 = p.steps[3].detailId;
  let reads = 0;
  const api4 = fakeApi(gr, { mutateBeforeRead: (s) => { reads += 1; if (reads === 7) s.items.flatMap((i) => i.details).find((d) => d.id === t4).received = 1; } });
  const r4 = await apply.runPlan(p, api4);
  assert.equal(r4.reason, "gr_changed");
  assert.equal(api4.calls.length, 3);
});

test("W1: PUT lỗi ở bước 3 → dừng put_failed sau 3 lời gọi; chạy lại bỏ qua 2 bước đã xong", async () => {
  const { gr, units, qr } = inputs();
  const p = plan.buildPlan(gr, units, qr);
  const api = fakeApi(gr, { failAt: 3 });
  const r = await apply.runPlan(p, api);
  assert.equal(r.reason, "put_failed");
  assert.equal(api.calls.length, 3);
  const api2 = { getGr: api.getGr, putDetail: async (s, b) => ({ ok: true, status: 200, _: await (async () => { const d = api.state.items.flatMap((i) => i.details).find((x) => x.id === s.detailId); d.received = b.detail.received_quantity; d.qrCodes = d.qrCodes.concat(b.detail.thuocsi_qr_codes); })() }) };
  const r2 = await apply.runPlan(p, api2);
  assert.equal(r2.ok, true);
  assert.equal(r2.results.filter((x) => x.status === "already").length, 2);
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
