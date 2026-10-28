"use strict";
// v0.3.0 — G1 (PM DECISION-ONE-STG-AUTO-FLOW-20261028 §3): tự điền + tự HOÀN THÀNH một lần, KHÔNG ghi thật.
// Chạy thật background + content POS / Nextwaves trên trình duyệt giả, dữ liệu A1 GR03887 thật (samples/*-20261028.json):
//  - phía POS: GR lúc về POS, PO, tìm GR theo SO, 15 tra QR, body 5 PUT, response status/COMPLETED (200, rỗng), GR sau COMPLETED thật;
//    server giả áp body PUT vào GR như POS (cộng dồn mã) và sau COMPLETED thêm mã lô như mẫu thật;
//  - phía Nextwaves: message của tab Nextwaves (nwMatched / scanOk / received) DỰNG từ nhật ký phiên A1 thật (expected, phiếu gửi,
//    nwResult) — lượt A1 không capture tab Nextwaves; parser Nextwaves đã có test T3 thật (tests/t3-real.test.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { createBrowser, until, settle, closeAll } = require("./browser-sim.js");
const { plan: PL, pos: P } = H.lib();

test.afterEach(() => closeAll());

const POS = "https://pos.stg.circa-v2.buymed.tech";
const NW = "https://circa-stg.nextwaves.app";
const GR_ID = "f2ae6e25-64bc-497b-81db-2de87284ec80";
const KEY = `STG:${GR_ID}`;
const STORE = H.STORE_2222;
const A1 = H.sample("ext-stg-storage-GR03887-20261028.json").sessions[KEY];
const POS_AUTH = { mark: "cgn/pos-hook", type: "auth", payload: { envId: "STG", headers: { authorization: "Bearer pos-test", "x-client-id": "1", "x-store-id": STORE, "grpc-timeout": "30S" } } };
const QR = new Map(H.sample("pos-stg-qrcode-GR03887-15uid-20261028.json").map((r) => [r.url.split("code=")[1], r.response]));
const REAL_PUTS = H.sample("pos-stg-gr-W1-GR03887-20261028.json")
  .filter((x) => x.method === "PUT")
  .map((x) => ({ detailId: x.url.split("/detail/")[1], body: x.request }));
const [REAL_COMPLETE] = H.sample("pos-stg-gr-status-COMPLETED-GR03887-20261028.json");
const COMPLETED_GR = H.sample("pos-stg-gr-GR03887-completed-20261028.json");
const CONFIRM = { grCode: "GR03887", nwPoNumber: "PO13806459", epcCount: 15 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const detailsOf = (gr) => gr.data.items.flatMap((i) => i.details);

function makeA1Server(o = {}) {
  const st = { gr: H.clone(H.sample(o.grStart || "pos-stg-gr-GR03887-truoc-20261028.json")), puts: [], completes: [], log: [], getsAfterPuts: 0, completeHeld: false, verifyHeld: false };
  if (o.grMut) o.grMut(st.gr.data);
  const applyCompleted = () => {
    st.gr.data.status = "COMPLETED";
    const done = new Map(detailsOf(COMPLETED_GR).map((d) => [d.id, d.thuocsi_qr_codes]));
    for (const d of detailsOf(st.gr)) d.thuocsi_qr_codes = (d.thuocsi_qr_codes || []).concat((done.get(d.id) || []).filter((c) => !(d.thuocsi_qr_codes || []).includes(c)));
  };
  async function handle(req) {
    st.log.push(req);
    const u = new URL(req.url);
    if (u.origin !== POS) return { status: 404, json: {} };
    if (u.pathname === "/thuocsi-warehouse/qrcode") {
      const code = u.searchParams.get("code");
      if (o.qrDelayMs) await sleep(o.qrDelayMs);
      const forced = o.qr ? o.qr(code) : null;
      if (forced) return forced;
      return { status: 200, json: QR.get(code) || { status: "OK", data: [] } };
    }
    if (!u.pathname.startsWith("/backend/v1/")) return { status: 404, json: {} };
    if (req.headers.authorization !== "Bearer pos-test") return { status: 401, json: { message: "unauthorized" } };
    let m = /^\/backend\/v1\/order\/goods-receipt\/([0-9a-f-]{36})$/.exec(u.pathname);
    if (m && req.method === "GET") {
      if (m[1] !== GR_ID) return { status: 404, json: {} };
      const snap = H.clone(st.gr);
      if (st.puts.length >= 5 && !st.completes.length) {
        st.getsAfterPuts += 1;
        // GET thứ 2 sau PUT cuối = lần đọc lại toàn phiếu trước HOÀN THÀNH (lần 1 là GET kiểm của runPlan).
        if (o.tamper && st.getsAfterPuts === 2) o.tamper(snap.data);
        if (o.verifyHold && st.getsAfterPuts === 2) {
          st.verifyHeld = true;
          await o.verifyHold; // treo lần đọc lại toàn phiếu trước HOÀN THÀNH
        }
      }
      return { status: 200, json: snap };
    }
    m = /^\/backend\/v1\/pos\/([0-9a-f-]{36})\/po\/([0-9a-f-]{36})$/.exec(u.pathname);
    if (m && req.method === "GET") {
      const po = H.sample("pos-stg-po-PO00006767-SOBD1594095-20261028.json");
      if (st.poMut) st.poMut(po); // test đổi PO SAU khi đã tạo phiên
      return { status: 200, json: po };
    }
    if (u.pathname === "/backend/v1/order/goods-receipt/search" && req.method === "GET") return { status: 200, json: H.sample("pos-stg-gr-search-so-1594095-20261028.json") };
    m = /^\/backend\/v1\/order\/goods-receipt\/([0-9a-f-]{36})\/item\/([0-9a-f-]{36})\/detail\/([0-9a-f-]{36})$/.exec(u.pathname);
    if (m && req.method === "PUT") {
      st.puts.push({ detailId: m[3], body: req.body });
      const n = st.puts.length;
      if (o.putHold && o.putHold[n]) await o.putHold[n];
      if (o.putFail && o.putFail[n]) return { status: o.putFail[n], json: { message: "lỗi giả" } };
      const d = detailsOf(st.gr).find((x) => x.id === m[3]);
      d.received_quantity = req.body.detail.received_quantity;
      d.thuocsi_qr_codes = (d.thuocsi_qr_codes || []).concat(req.body.detail.thuocsi_qr_codes);
      st.gr.data.status = "RECEIVING";
      return { status: 200, json: { success: true } };
    }
    m = /^\/backend\/v1\/order\/goods-receipt\/([0-9a-f-]{36})\/status\/COMPLETED$/.exec(u.pathname);
    if (m && req.method === "PUT") {
      st.completes.push({ at: Date.now(), body: req.body, headers: req.headers });
      if (o.completeHook) await o.completeHook(st);
      const mode = o.complete || "ok"; // ok | fail | fail_applied | noop | hang | late_apply
      if (mode === "hang") await new Promise(() => {});
      if (mode === "late_apply") {
        await sleep(2600); // trả sau khi client đã bỏ chờ (httpTimeoutMs 2000) — server vẫn hoàn thành
        applyCompleted();
        return { status: 200, json: null };
      }
      if (mode === "ok" || mode === "fail_applied") applyCompleted();
      if (mode === "fail" || mode === "fail_applied") return { status: 500, json: { message: "lỗi giả" } };
      return { status: REAL_COMPLETE.status, json: REAL_COMPLETE.response }; // A1 thật: 200, response rỗng
    }
    return { status: 404, json: { message: "no route" } };
  }
  return { st, handle };
}

const startBtn = (t) => t.view && t.view.buttons && t.view.buttons.find((x) => x.label === "Nhận hàng bằng RFID");
const viewTitle = (t) => (t.view ? t.view.title : null);
const session = (b) => b.session(KEY);
const logTypes = (b) => (session(b) || { log: [] }).log.map((l) => l.type);
const autoGrants = (b) => Object.keys(b.store.autoGrants || {});
async function sessionState(b, state, ms) {
  return until(() => {
    const s = session(b);
    return s && s.state === state && s;
  }, ms);
}
const matchFromA1 = (extra) =>
  Object.assign(
    { nwPoId: A1.nwPoId, nwPoNumber: A1.nwPoNumber, nwOrderId: A1.nwOrderId, nwRefId: A1.nwRefId, shipmentIds: A1.shipmentIds, expected: H.clone(A1.expected), receiptIdsBefore: A1.receiptIdsBefore.slice(), nwWriteLocks: [], fpRows: A1.fpRows || [], nwSearch: A1.nwSearch || null },
    extra || {}
  );

// POS mở GR03887 → bấm "Nhận hàng bằng RFID" → tab Nextwaves (không đăng nhập) báo đã khớp PO13806459 → nw_ready.
async function setup(o = {}) {
  const srv = makeA1Server(o.server);
  // uiWaitMs: khung trong luồng chờ chỗ gắn như panel thật (10 s thu còn 300 ms) — khung tạm lúc tải trang không bị coi là lỗi ngay.
  const b = createBrowser(srv.handle, { tuning: Object.assign({ autoAnchorWaitMs: 300, uiWaitMs: 300 }, o.tuning || {}), bgTuning: o.bgTuning, interceptBg: o.interceptBg });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos.post(POS_AUTH);
    (await until(() => startBtn(pos))).onClick();
    const nw = await until(() => b.tabs().find((t) => t.url.startsWith(NW)));
    await sessionState(b, "waiting_nw");
    const r = await b.sendFromTab(nw, { type: "session:nwMatched", key: KEY, match: matchFromA1(o.match), log: { type: "nw_matched" } });
    assert.equal(r.ok, true, r.error);
    await sessionState(b, "nw_ready");
    return { b, srv, pos, nw };
  } catch (err) {
    b.close();
    throw err;
  }
}
const arm = (b, confirm) => b.sendFromPopup({ type: "auto:arm", key: KEY, confirm: confirm || CONFIRM });
// Dược sĩ bấm "Xác nhận nhận hàng" (2xx) → tab Nextwaves đọc lại kết quả → báo received (payload = nwResult A1 thật, có thể sửa).
async function receive(ctx, payload) {
  const { b, nw } = ctx;
  const r1 = await b.sendFromTab(nw, { type: "session:scanOk", key: KEY, scan: { shipmentId: A1.shipmentIds[0], httpStatus: 200, sentEpcs: 15, at: Date.now() } });
  assert.equal(r1.ok, true, r1.error);
  const r2 = await b.sendFromTab(nw, { type: "session:received", key: KEY, payload: payload || H.clone(A1.nwResult) });
  assert.equal(r2.ok, true, r2.error);
}
const noComplete = (srv, why) => assert.equal(srv.st.completes.length, 0, `0 PUT status/COMPLETED — ${why}`);

// ---------- chuỗi dương ----------
test("G1 A1 thật: arm → nhận 2xx → 15 tra QR → kế hoạch #EF0E020C → 5 PUT/GET đúng body thật → GET toàn phiếu → 1 PUT COMPLETED (không body) → GET COMPLETED → done; quyền tiêu, không gửi trùng, trang COMPLETED không khung", async () => {
  const ctx = await setup();
  const { b, srv, pos } = ctx;
  try {
    const g = await arm(b);
    assert.equal(g.ok, true, g.error);
    assert.deepEqual([g.data.grCode, g.data.nwPoNumber, g.data.epcs.length, g.data.posName], ["GR03887", "PO13806459", 15, "2222"]);
    assert.deepEqual(autoGrants(b), [KEY]);
    await receive(ctx);
    await sessionState(b, "done", 8000);
    // Ghi đúng như lượt thật.
    assert.deepEqual(srv.st.puts, REAL_PUTS, "5 PUT trùng thứ tự + body lượt A1 thật");
    assert.equal(srv.st.completes.length, 1, "đúng MỘT lệnh HOÀN THÀNH");
    assert.equal(srv.st.completes[0].body, null, "PUT status/COMPLETED không body như A1");
    assert.equal(srv.st.completes[0].headers.authorization, "Bearer pos-test");
    const iComplete = srv.st.log.findIndex((r) => r.url.endsWith("/status/COMPLETED"));
    const iLastPut = srv.st.log.map((r) => r.method === "PUT" && r.url.includes("/detail/")).lastIndexOf(true);
    assert.ok(srv.st.log.slice(iLastPut + 1, iComplete).filter((r) => r.method === "GET" && r.url.endsWith(GR_ID)).length >= 2, "có GET kiểm sau PUT cuối + GET đọc lại toàn phiếu trước HOÀN THÀNH");
    assert.ok(srv.st.log.slice(iComplete + 1).some((r) => r.method === "GET" && r.url.endsWith(GR_ID)), "GET sau HOÀN THÀNH");
    // Phiên + nhật ký.
    const s = session(b);
    assert.deepEqual([s.authorization.auto, s.authorization.planHash, s.applyResult.hash, s.applyResult.uids], [true, "EF0E020C", "EF0E020C", 15]);
    assert.deepEqual([s.completeResult.source, s.completeResult.httpStatus, s.completeResult.grStatus], ["auto", 200, "COMPLETED"]);
    const t = logTypes(b).filter((x) => !/^apply_(sending|done)$/.test(x) && x !== "plan");
    assert.deepEqual(t, ["start", "nw_matched", "auto_armed", "scan_ok", "nw_received", "auto_ready", "auto_claimed", "applied", "auto_complete_claimed", "auto_complete_sent", "auto_completed"]);
    assert.equal(s.log.filter((l) => l.type === "apply_done").length, 5);
    assert.ok(s.log.filter((l) => l.type === "plan").every((l) => l.hash === "EF0E020C" && l.ok));
    assert.deepEqual(autoGrants(b), [], "quyền tự động đã tiêu");
    assert.ok(!JSON.stringify(b.store).includes("Bearer"), "không lưu token");
    // Tải lại → trang COMPLETED (không #all-receipt) → không khung, không lỗi. location.reload nạp trang ở lượt sự kiện sau: chờ
    // trang mới nạp xong rồi mới gửi header (không thì message rơi vào trang cũ đã chết).
    await until(() => pos.reloads >= 1 && pos.loads >= 2);
    pos.setAnchor(false);
    pos.post(POS_AUTH);
    await settle(500); // quá thời gian chờ chỗ gắn
    assert.equal(pos.view, null);
    assert.ok(!pos.floatViews.some((v) => /^Giao diện phiếu nhận đã đổi/.test(v.title || "")));
    assert.equal(srv.st.completes.length, 1, "không gửi lại sau khi tải lại");
    assert.equal(srv.st.puts.length, 5);
  } finally {
    b.close();
  }
});

// ---------- quyền ----------
test("G1 quyền: không arm → đường thủ công (kế hoạch chỉ xem), không nhật ký auto, 0 PUT, 0 COMPLETED", async () => {
  const ctx = await setup();
  const { b, srv, pos } = ctx;
  try {
    await receive(ctx);
    await until(() => viewTitle(pos) === "Chỉ xem kế hoạch — chưa có cấp phép điền");
    await settle(200);
    assert.equal(srv.st.puts.length, 0);
    noComplete(srv, "không arm");
    assert.ok(!logTypes(b).some((x) => x.startsWith("auto_")));
  } finally {
    b.close();
  }
});

test("G1 quyền: hết hạn trước khi nhận → không kích hoạt, đường thủ công, 0 PUT / 0 COMPLETED", async () => {
  const ctx = await setup({ bgTuning: { autoTtlMs: 80 } });
  const { b, srv, pos } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await sleep(150);
    await receive(ctx);
    await until(() => viewTitle(pos) === "Chỉ xem kế hoạch — chưa có cấp phép điền");
    await settle(200);
    assert.equal(srv.st.puts.length, 0);
    noComplete(srv, "hết hạn");
    assert.ok(!session(b).autoRun);
  } finally {
    b.close();
  }
});

test("G1 quyền: phiên bị xoá rồi tạo lại (cùng GR) → huỷ phiên thu hồi quyền ngay (audit F3); quyền còn sót gắn phiên cũ → auto_skipped grant_invalid; 0 PUT / 0 COMPLETED", async () => {
  const ctx = await setup();
  const { b, srv, pos, nw } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    const stale = H.clone(b.store.autoGrants[KEY]);
    assert.equal((await b.sendFromPopup({ type: "session:cancel", key: KEY })).ok, true);
    assert.deepEqual(autoGrants(b), [], "huỷ phiên → thu hồi quyền tự động");
    pos.reload();
    pos.post(POS_AUTH);
    (await until(() => startBtn(pos))).onClick();
    await sessionState(b, "waiting_nw");
    assert.equal((await b.sendFromTab(nw, { type: "session:nwMatched", key: KEY, match: matchFromA1() })).ok, true);
    await sessionState(b, "nw_ready");
    // Lớp thứ hai: quyền của phiên cũ còn sót trong kho (vd. ghi trước khi có F3) → không khớp giờ tạo phiên → không tự chạy.
    b.store.autoGrants = { [KEY]: stale };
    await receive(ctx);
    await until(() => logTypes(b).includes("auto_skipped"));
    assert.equal(session(b).log.find((l) => l.type === "auto_skipped").reason, "grant_invalid");
    // Chặn ngay ở điểm kích hoạt (không chờ tab POS hỏi auto:status mới bỏ qua): không giao lượt cho tab nào.
    assert.ok(!session(b).autoRun, "điểm kích hoạt không giao lượt cho quyền không khớp phiên");
    assert.ok(!logTypes(b).includes("auto_ready"));
    assert.deepEqual(autoGrants(b), [], "quyền sót bị thu hồi");
    await settle(300);
    assert.equal(srv.st.puts.length, 0);
    noComplete(srv, "phiên tạo lại");
  } finally {
    b.close();
  }
});

test("G1 quyền: arm chỉ từ popup, chỉ khi nw_ready, xác nhận phải khớp phiên (mã / PO / số tem), PRD không arm được", async () => {
  const ctx = await setup();
  const { b, pos } = ctx;
  try {
    const fromPage = await b.sendFromTab(pos, { type: "auto:arm", key: KEY, confirm: CONFIRM });
    assert.match(fromPage.error, /Chỉ cho phép tự động từ popup/);
    for (const bad of [{ grCode: "GR3887" }, { nwPoNumber: "PO00000000" }, { epcCount: 14 }]) {
      const r = await arm(b, Object.assign({}, CONFIRM, bad));
      assert.match(r.error, /không khớp phiên hiện tại/, JSON.stringify(bad));
    }
    assert.deepEqual(autoGrants(b), []);
    // Phiên PRD giả (cùng dữ liệu) → môi trường chỉ đọc.
    await b.patchSession("PRD:" + GR_ID, Object.assign(H.clone(session(b)), { key: "PRD:" + GR_ID, envId: "PRD" }));
    const prd = await b.sendFromPopup({ type: "auto:arm", key: "PRD:" + GR_ID, confirm: CONFIRM });
    assert.match(prd.error, /chỉ đọc/);
    await receive(ctx);
    await sessionState(b, "received");
    const late = await arm(b);
    assert.match(late.error, /CHƯA xác nhận nhận hàng/, "đã nhận rồi thì không arm");
    assert.deepEqual(autoGrants(b), []);
  } finally {
    b.close();
  }
});

// ---------- lượt nhận ----------
test("G1 nhận: EPC nhận khác tập đã cấp quyền / 0 hoặc 2 biên nhận mới → auto_skipped, 0 PUT / 0 COMPLETED", async () => {
  const variants = [
    ["thiếu 1 EPC", (p) => p.units.pop(), "epc_set"],
    ["EPC lạ", (p) => (p.units[0].epc = "E280F302000000000000DEAD"), "epc_set"],
    ["0 biên nhận mới", (p) => (p.receiptIds = []), "receipts"],
    ["2 biên nhận mới", (p) => p.receiptIds.push("00000000-0000-4000-8000-00000000beef"), "receipts"],
  ];
  for (const [name, mut, reason] of variants) {
    const ctx = await setup();
    const { b, srv } = ctx;
    try {
      assert.equal((await arm(b)).ok, true);
      const p = H.clone(A1.nwResult);
      mut(p);
      await receive(ctx, p);
      await until(() => logTypes(b).includes("auto_skipped"));
      assert.equal(session(b).log.find((l) => l.type === "auto_skipped").reason, reason, name);
      assert.ok(!session(b).autoRun, name);
      assert.deepEqual(autoGrants(b), [], `${name}: quyền tự động đã thu hồi`);
      await settle(250);
      assert.equal(srv.st.puts.length, 0, name);
      noComplete(srv, name);
    } finally {
      b.close();
    }
  }
});

// ---------- kế hoạch ----------
test("G1 kế hoạch: QR thiếu / sai lô / sai sản phẩm → kế hoạch chặn → auto_skipped plan_blocked, 0 PUT / 0 COMPLETED", async () => {
  const uid = A1.nwResult.units[0].uid;
  const variants = [
    ["QR không tra được", (code) => (code === uid ? { status: 503, json: { message: "tạm lỗi" } } : null)],
    ["QR sai lô", (code) => (code === uid ? { status: 200, json: Object.assign(H.clone(QR.get(code)), { data: [Object.assign(H.clone(QR.get(code).data[0] || QR.get(code).data), { lot: "LOKHAC" })] }) } : null)],
  ];
  for (const [name, qr] of variants) {
    const ctx = await setup({ server: { qr } });
    const { b, srv } = ctx;
    try {
      assert.equal((await arm(b)).ok, true);
      await receive(ctx);
      await until(() => logTypes(b).includes("auto_skipped"));
      assert.equal(session(b).log.find((l) => l.type === "auto_skipped").reason, "plan_blocked", name);
      await settle(200);
      assert.equal(srv.st.puts.length, 0, name);
      noComplete(srv, name);
    } finally {
      b.close();
    }
  }
});

test("G1 kế hoạch (thuần, dữ liệu A1): autoPlanCheck chỉ nhận phiếu sạch + nhận đủ; verifyFinal bắt lệch UID / lô / lượng / mã lạ / trùng", () => {
  const gr = P.normalizeGr(H.sample("pos-stg-gr-GR03887-truoc-20261028.json"));
  const units = A1.nwResult.units;
  const qr = {};
  for (const [code, json] of QR) qr[code] = P.normalizeQrLookup(json, code);
  const plan = PL.buildPlan(gr, units, qr);
  assert.equal(plan.hash, "EF0E020C");
  assert.deepEqual(PL.autoPlanCheck(gr, plan, units), { ok: true });
  // Nhận thiếu một lô (3 vỉ) → cảnh báo nhận thiếu.
  const lot = units.filter((u) => u.batchNumber === "261009DHAUS").map((u) => u.uid);
  const part = units.filter((u) => !lot.includes(u.uid));
  assert.equal(PL.autoPlanCheck(gr, PL.buildPlan(gr, part, qr), part).reason, "plan_warning");
  // Phiếu không sạch: lô đã nhận 1 không mã → chặn received_mismatch.
  const dirty = H.clone(H.sample("pos-stg-gr-GR03887-truoc-20261028.json"));
  dirty.data.items[0].details[0].received_quantity = 1;
  const gd = P.normalizeGr(dirty);
  assert.equal(PL.autoPlanCheck(gd, PL.buildPlan(gd, units, qr), units).reason, "plan_blocked");
  // Kế hoạch thiếu UID so Nextwaves.
  assert.equal(PL.autoPlanCheck(gr, plan, units.concat([{ uid: "1790000000000AA1", epc: "X" }])).reason, "uid_set");
  // verifyFinal: phiếu sau 5 PUT thật = khớp; từng kiểu lệch bị bắt.
  const after = P.normalizeGr(H.sample("pos-stg-gr-GR03887-W1-sau-20261028.json"));
  assert.deepEqual(PL.verifyFinal(plan, after, units), { ok: true, diffs: [] });
  assert.equal(PL.autoPlanCheck(after, PL.buildPlan(after, units, qr), units).reason, "uid_already_on_gr", "phiếu đã có UID từ trước");
  const raw = () => H.clone(H.sample("pos-stg-gr-GR03887-W1-sau-20261028.json"));
  const cases = [
    ["thiếu 1 UID", (d) => d.items[1].details[0].thuocsi_qr_codes.pop(), "codes"],
    ["mã lạ", (d) => d.items[1].details[0].thuocsi_qr_codes.push("1790000000000AA1"), "codes"],
    ["mã nối trùng", (d) => d.items[1].details[0].thuocsi_qr_codes.push(d.items[1].details[0].thuocsi_qr_codes[0]), "duplicate_codes"],
    ["lượng lệch", (d) => (d.items[0].details[0].received_quantity = 2), "received"],
    ["đổi lô", (d) => (d.items[0].details[0].lot_id = "00000000-0000-4000-8000-000000000001"), "lot"],
    ["chưa ở RECEIVING", (d) => (d.status = "COMPLETED"), "status"],
    ["thêm chi tiết", (d) => d.items[0].details.push(Object.assign({}, d.items[0].details[0], { id: "00000000-0000-4000-8000-000000000002", thuocsi_qr_codes: [] })), "detail_new"],
  ];
  for (const [name, mut, why] of cases) {
    const x = raw();
    mut(x.data);
    const v = PL.verifyFinal(plan, P.normalizeGr(x), units);
    assert.equal(v.ok, false, name);
    assert.ok(v.diffs.some((d) => d.why === why), `${name}: ${JSON.stringify(v.diffs)}`);
  }
});

test("G1 trang: khung chưa gắn đúng trang phiếu (thiếu #all-receipt) khi tới lượt tự chạy → auto_skipped ui_not_anchored, 0 PUT / 0 COMPLETED", async () => {
  const ctx = await setup();
  const { b, srv, pos } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    pos.setAnchor(false);
    await receive(ctx);
    await until(() => logTypes(b).includes("auto_skipped"), 6000);
    assert.equal(session(b).log.find((l) => l.type === "auto_skipped").reason, "ui_not_anchored");
    await settle(200);
    assert.equal(srv.st.puts.length, 0);
    noComplete(srv, "chưa gắn khung");
  } finally {
    b.close();
  }
});

// ---------- sau khi điền ----------
test("G1 đọc lại sau W1 lệch (thiếu 1 UID / mã lạ / lượng lệch / lô khác) → auto_verify_failed, phiên applied, 0 COMPLETED", async () => {
  const variants = [
    ["thiếu 1 UID", (d) => d.items[1].details[0].thuocsi_qr_codes.pop()],
    ["mã lạ", (d) => d.items[2].details[0].thuocsi_qr_codes.push("1790000000000AA1")],
    ["lượng lệch", (d) => (d.items[0].details[0].received_quantity = 2)],
    ["lô khác", (d) => (d.items[0].details[0].lot_id = "00000000-0000-4000-8000-000000000001")],
  ];
  for (const [name, tamper] of variants) {
    const ctx = await setup({ server: { tamper } });
    const { b, srv, pos } = ctx;
    try {
      assert.equal((await arm(b)).ok, true);
      await receive(ctx);
      await until(() => logTypes(b).includes("auto_verify_failed"), 6000);
      await settle(200);
      assert.equal(session(b).state, "applied", name);
      assert.equal(srv.st.puts.length, 5, name);
      noComplete(srv, name);
      assert.match(viewTitle(pos), /KHÔNG tự HOÀN THÀNH/, name);
    } finally {
      b.close();
    }
  }
});

test("G1 PUT thứ 3 lỗi 500 / hết giờ → apply_stopped, không PUT thêm, 0 COMPLETED; mở lại không tự chạy lại", async () => {
  for (const [name, server] of [["500", { putFail: { 3: 500 } }], ["hết giờ", { putHold: { 3: new Promise(() => {}) } }]]) {
    const ctx = await setup({ server });
    const { b, srv, pos } = ctx;
    try {
      assert.equal((await arm(b)).ok, true);
      await receive(ctx);
      await sessionState(b, "apply_stopped", 8000);
      await settle(300);
      assert.equal(srv.st.puts.length, 3, name);
      noComplete(srv, name);
      pos.reload();
      pos.post(POS_AUTH);
      await settle(400);
      assert.equal(srv.st.puts.length, 3, `${name}: tải lại không tự chạy lại`);
      noComplete(srv, `${name} sau tải lại`);
      assert.equal(logTypes(b).filter((x) => x === "auto_claimed").length, 1);
    } finally {
      b.close();
    }
  }
});

test("G1 hai tab: tab thứ hai cùng phiếu không tự chạy (other_tab) và không giành được claim tự động; cả lượt đúng 5 PUT + 1 COMPLETED", async () => {
  let release;
  const hold = new Promise((r) => (release = r));
  const ctx = await setup({ server: { putHold: { 1: hold } } });
  const { b, srv } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    const pos2 = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos2.post(POS_AUTH);
    await receive(ctx);
    await until(() => srv.st.puts.length === 1);
    const steal = await b.sendFromTab(pos2, { type: "session:claimApply", key: KEY, token: "tab2", grCode: "GR03887", planHash: "EF0E020C", auto: true, uids: A1.nwResult.units.map((u) => u.uid) });
    assert.equal(steal.data.ok, false);
    release();
    await sessionState(b, "done", 8000);
    await settle(300);
    assert.equal(srv.st.puts.length, 5);
    assert.equal(srv.st.completes.length, 1);
    assert.equal(logTypes(b).filter((x) => x === "auto_claimed").length, 1);
  } finally {
    release();
    b.close();
  }
});

test("G1 tab chết sau claim (tải lại giữa PUT thứ 2) → không tự chạy tiếp: lease hết → chỉ đường thủ công, 0 COMPLETED", async () => {
  const ctx = await setup({ server: { putHold: { 2: new Promise(() => {}) } }, bgTuning: { leaseMs: 300 } });
  const { b, srv, pos } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    await until(() => srv.st.puts.length === 2);
    pos.reload(); // tab cũ chết: PUT thứ 2 không bao giờ trả về
    pos.post(POS_AUTH);
    await sleep(800); // quá hạn lease
    pos.post(POS_AUTH);
    await settle(400);
    assert.equal(srv.st.puts.length, 2, "không PUT tiếp");
    noComplete(srv, "tab chết sau claim");
    const steal = await b.sendFromTab(pos, { type: "session:claimApply", key: KEY, token: "moi", grCode: "GR03887", planHash: "EF0E020C", auto: true, uids: A1.nwResult.units.map((u) => u.uid) });
    assert.equal(steal.data.reason, "auto_state", "claim tự động lần hai bị từ chối");
  } finally {
    b.close();
  }
});

// ---------- HOÀN THÀNH ----------
test("G1 HOÀN THÀNH 500 / hết giờ / 2xx nhưng GET chưa COMPLETED → auto_complete_unknown, đúng 1 PUT status; tải lại + 'Đọc lại' không gửi lại", async () => {
  for (const mode of ["fail", "hang", "noop"]) {
    const ctx = await setup({ server: { complete: mode } });
    const { b, srv, pos } = ctx;
    try {
      assert.equal((await arm(b)).ok, true);
      await receive(ctx);
      await sessionState(b, "auto_complete_unknown", 9000);
      assert.equal(srv.st.completes.length, 1, mode);
      assert.match(viewTitle(pos), /chưa rõ POS đã HOÀN THÀNH chưa — extension KHÔNG gửi lại/, mode);
      pos.reload();
      pos.post(POS_AUTH);
      const v = await until(() => pos.view && /chưa rõ/.test(pos.view.title) && pos.view);
      assert.deepEqual(Array.from(v.buttons, (x) => x.label), ["Đọc lại"], mode);
      v.buttons[0].onClick();
      await settle(300);
      assert.equal(srv.st.completes.length, 1, `${mode}: không gửi lại`);
      assert.equal(session(b).state, "auto_complete_unknown");
    } finally {
      b.close();
    }
  }
});

test("G1 HOÀN THÀNH hết giờ nhưng server vẫn hoàn thành → chưa rõ; 'Đọc lại' thấy COMPLETED → done, không gửi lại", async () => {
  const ctx = await setup({ server: { complete: "late_apply" } });
  const { b, srv, pos } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    await sessionState(b, "auto_complete_unknown", 9000);
    await sleep(800); // server xử lý xong sau khi client bỏ chờ
    pos.view.buttons[0].onClick();
    await sessionState(b, "done", 4000);
    assert.equal(srv.st.completes.length, 1);
    assert.ok(logTypes(b).includes("gr_completed_seen"));
  } finally {
    b.close();
  }
});

test("G1 HOÀN THÀNH trả 500 nhưng GET đã COMPLETED → done nguồn 'khong_chac', không gửi lại", async () => {
  const ctx = await setup({ server: { complete: "fail_applied" } });
  const { b, srv } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    const s = await sessionState(b, "done", 8000);
    assert.deepEqual([s.completeResult.source, s.completeResult.httpStatus], ["khong_chac", 500]);
    await settle(200);
    assert.equal(srv.st.completes.length, 1);
  } finally {
    b.close();
  }
});

test("G1 hook báo COMPLETED sớm (trước GET xác nhận) → không đánh dấu done sớm; tab chủ GET xác nhận rồi mới done", async () => {
  let pos = null;
  let stateAtHook = null;
  const ctx = await setup({
    server: {
      completeHook: async () => {
        // Trang POS (hook MAIN world) báo COMPLETED 2xx trong lúc lệnh tự động còn chưa trả về.
        pos.post({ mark: "cgn/pos-hook", type: "gr-status", payload: { envId: "STG", grId: GR_ID, status: "COMPLETED", httpStatus: 200 } });
        await sleep(250);
        stateAtHook = (ctx2.b.session(KEY) || {}).state;
      },
    },
  });
  const ctx2 = ctx;
  pos = ctx.pos;
  const { b, srv } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    await sessionState(b, "done", 8000);
    assert.equal(stateAtHook, "auto_completing", "hook không đóng phiên đang tự HOÀN THÀNH");
    const t = logTypes(b);
    assert.ok(!t.includes("gr_completed"), "không có done từ hook");
    assert.ok(t.indexOf("auto_completed") > t.indexOf("auto_complete_sent"));
    assert.equal(srv.st.completes.length, 1);
  } finally {
    b.close();
  }
});

test("G1 tab khác GET thấy phiếu COMPLETED trong lúc lệnh tự động chưa trả về → background từ chối done (chỉ tab chủ kết thúc); tab chủ GET xác nhận rồi mới done", async () => {
  let release;
  const hold = new Promise((r) => (release = r));
  const ctx = await setup({ server: { completeHook: () => hold } });
  const { b, srv } = ctx;
  const grGets = () => srv.st.log.filter((r) => r.method === "GET" && r.url.endsWith(GR_ID)).length;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    await until(() => srv.st.completes.length === 1, 8000);
    assert.equal(session(b).state, "auto_completing");
    // Server đã hoàn thành nhưng response chưa về tab chủ. Tab thứ hai mở phiếu: evaluateGr thấy COMPLETED → xin done.
    srv.st.gr.data.status = "COMPLETED";
    const n0 = grGets();
    const pos2 = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos2.post(POS_AUTH);
    await until(() => grGets() > n0, 4000);
    pos2.post({ mark: "cgn/pos-hook", type: "gr-status", payload: { envId: "STG", grId: GR_ID, status: "COMPLETED", httpStatus: 200 } });
    await until(() => grGets() > n0 + 1, 4000);
    await settle(300);
    assert.equal(session(b).state, "auto_completing", "tab khác không đóng phiên đang tự HOÀN THÀNH");
    assert.ok(!logTypes(b).some((x) => x === "gr_completed_seen" || x === "gr_completed"));
    release();
    await sessionState(b, "done", 6000);
    assert.equal(session(b).completeResult.source, "auto");
    assert.ok(logTypes(b).includes("auto_completed"));
    assert.equal(srv.st.completes.length, 1);
  } finally {
    release();
    b.close();
  }
});

test("G1 claimComplete chỉ một lần, đúng tab chủ: gọi lại / tab khác / kế hoạch khác bị từ chối", async () => {
  let release;
  const hold = new Promise((r) => (release = r));
  const ctx = await setup({ server: { completeHook: () => hold } });
  const { b, srv, pos } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    await sessionState(b, "auto_completing", 8000);
    for (const [token, planHash, why] of [["khac", "EF0E020C", "tab khác"], [session(b).autoToken, "00000000", "kế hoạch khác"], [session(b).autoToken, "EF0E020C", "gọi lại"]]) {
      const r = await b.sendFromTab(pos, { type: "session:claimComplete", key: KEY, token, planHash });
      assert.equal(r.data.ok, false, why);
    }
    const cancel = await b.sendFromPopup({ type: "session:cancel", key: KEY });
    assert.match(cancel.error, /đang tự HOÀN THÀNH/, "không huỷ được phiên đang gửi");
    release();
    await sessionState(b, "done", 6000);
    assert.equal(srv.st.completes.length, 1);
  } finally {
    release();
    b.close();
  }
});

// ---------- hàng rào thêm (đột biến v0.3.0) ----------
test("G1 tab: claim tự động từ tab không được giao (auto_tab) / thiếu hoặc trùng UID (auto_uids) bị từ chối; tab không được giao chỉ hiện kế hoạch thủ công có ghi lý do", async () => {
  const ctx = await setup({ tuning: { autoAnchorWaitMs: 3000, uiWaitMs: 5000 } });
  const { b, srv, pos } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    pos.setAnchor(false); // tab được giao chờ khung gắn đúng trang → chưa giành
    const pos2 = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos2.post(POS_AUTH);
    await receive(ctx);
    const v2 = await until(() => pos2.view && pos2.view.title === "Chỉ xem kế hoạch — chưa có cấp phép điền" && pos2.view, 4000);
    assert.ok(v2.lines.some((l) => /tab POS khác/.test(l)), "tab không được giao ghi rõ lý do");
    const uids = A1.nwResult.units.map((u) => u.uid);
    const claim = (t, list) => b.sendFromTab(t, { type: "session:claimApply", key: KEY, token: "thu", grCode: "GR03887", planHash: "EF0E020C", auto: true, uids: list });
    assert.equal((await claim(pos2, uids)).data.reason, "auto_tab");
    assert.equal((await claim(pos, uids.slice(1))).data.reason, "auto_uids");
    assert.equal((await claim(pos, uids.concat([uids[0]]))).data.reason, "auto_uids");
    assert.equal(srv.st.puts.length, 0);
    pos.setAnchor(true); // trang vẽ xong → tab được giao tự chạy
    await sessionState(b, "done", 8000);
    assert.equal(srv.st.puts.length, 5);
    assert.equal(srv.st.completes.length, 1);
  } finally {
    b.close();
  }
});

test("G1 claimComplete khi phiên applied (đọc lại lệch): sai token / sai kế hoạch / phiên không phải tự động → từ chối", async () => {
  const ctx = await setup({ server: { tamper: (d) => d.items[1].details[0].thuocsi_qr_codes.pop() } });
  const { b, srv, pos } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    await until(() => logTypes(b).includes("auto_verify_failed"), 6000);
    const tok = session(b).autoToken;
    const cc = (token, planHash) => b.sendFromTab(pos, { type: "session:claimComplete", key: KEY, token, planHash });
    assert.equal((await cc("khac", "EF0E020C")).data.reason, "token");
    assert.equal((await cc(tok, "00000000")).data.reason, "not_auto");
    await b.patchSession(KEY, { authorization: Object.assign({}, session(b).authorization, { auto: false }) });
    assert.equal((await cc(tok, "EF0E020C")).data.reason, "not_auto");
    assert.equal(session(b).state, "applied");
    noComplete(srv, "claimComplete bị từ chối");
  } finally {
    b.close();
  }
});

test("G1 kế hoạch: PO đọc lại đổi mã giao / SO sau khi tạo phiên → auto_skipped link_changed, 0 PUT / 0 COMPLETED", async () => {
  const ctx = await setup();
  const { b, srv } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    srv.st.poMut = (po) => {
      po.data.thuocsi_delivery_code = ["SOBD1599999-F"];
    };
    await receive(ctx);
    await until(() => logTypes(b).includes("auto_skipped"));
    assert.equal(session(b).log.find((l) => l.type === "auto_skipped").reason, "link_changed");
    await settle(200);
    assert.equal(srv.st.puts.length, 0);
    noComplete(srv, "PO đổi");
  } finally {
    b.close();
  }
});

test("G1 nâng cấp: quyền tự động của bản cũ (khác schema) bị dọn khi onInstalled, quyền hiện hành giữ", async () => {
  const ctx = await setup();
  const { b } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    b.store.autoGrants = Object.assign({}, b.store.autoGrants, { "STG:cu": { key: "STG:cu", expiresAt: Date.now() + 60000 } });
    b.fireInstalled({ reason: "update", previousVersion: "0.2.5" });
    await until(() => b.store.lastUpgrade && b.store.lastUpgrade.to === require("../src/manifest.json").version);
    assert.deepEqual(Object.keys(b.store.autoGrants).sort(), [KEY]);
    assert.equal(b.store.lastUpgrade.removedGrants, 1);
  } finally {
    b.close();
  }
});

// ---------- một lượt nhận chỉ thử tự động MỘT lần (background giữ quyết định "bỏ qua") ----------
test("G1 một lần: lượt tự động bị bỏ qua (QR lỗi lúc đầu) → 'Kiểm tra lại' khi QR đã ổn vẫn KHÔNG tự chạy lại: đường thủ công, 0 PUT; background giữ skipped, auto:status / claim tự động bị từ chối", async () => {
  const uid = A1.nwResult.units[0].uid;
  let qrDown = true;
  const ctx = await setup({ server: { qr: (code) => (qrDown && code === uid ? { status: 503, json: { message: "tạm lỗi" } } : null) } });
  const { b, srv, pos } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    const g0 = H.clone(b.store.autoGrants[KEY]);
    await receive(ctx);
    await until(() => session(b).autoRun && session(b).autoRun.skipped);
    assert.equal(session(b).autoRun.skipped.reason, "plan_blocked");
    // P2.5: bỏ qua → thu hồi quyền ngay; khung Nextwaves báo "Tự động đã dừng", không còn báo đã cho phép.
    assert.deepEqual(autoGrants(b), [], "quyền tự động đã thu hồi khi bỏ qua");
    await until(() => ctx.nw.view && (ctx.nw.view.lines || []).some((l) => /Tự động đã dừng/.test(l)));
    const err = await until(() => pos.view && /điểm chặn/.test(pos.view.title || "") && pos.view);
    qrDown = false;
    err.buttons.find((x) => x.label === "Kiểm tra lại").onClick();
    await until(() => viewTitle(pos) === "Chỉ xem kế hoạch — chưa có cấp phép điền");
    assert.ok(pos.view.lines.some((l) => /Tự động KHÔNG chạy/.test(l)));
    await settle(250);
    assert.equal(srv.st.puts.length, 0);
    noComplete(srv, "đã bỏ qua");
    assert.equal(logTypes(b).filter((x) => x === "auto_skipped").length, 1, "ghi một lần");
    pos.reload(); // F5 khi QR đã bình thường: vẫn không tự chạy
    pos.post(POS_AUTH);
    await settle(400);
    assert.equal(srv.st.puts.length, 0, "F5 không tự chạy lại");
    // Lớp thứ hai: quyết định bỏ qua là cuối cùng kể cả khi kho lại có quyền khớp phiên (vd. lỗi ghi / hồi quy ở auto:arm).
    b.store.autoGrants = { [KEY]: g0 };
    const st = await b.sendFromTab(pos, { type: "auto:status", key: KEY });
    assert.deepEqual([st.data.eligible, st.data.reason], [false, "skipped"]);
    const c = await b.sendFromTab(pos, { type: "session:claimApply", key: KEY, token: "t", grCode: "GR03887", planHash: "EF0E020C", auto: true, uids: A1.nwResult.units.map((u) => u.uid) });
    assert.equal(c.data.reason, "auto_tab");
  } finally {
    b.close();
  }
});

test("G1 một lần: auto:skip từ tab KHÔNG được giao không đổi gì; tab được giao vẫn tự chạy đủ", async () => {
  const ctx = await setup({ tuning: { autoAnchorWaitMs: 3000, uiWaitMs: 5000 } });
  const { b, srv, pos } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    pos.setAnchor(false);
    const pos2 = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos2.post(POS_AUTH);
    await receive(ctx);
    await until(() => session(b).autoRun);
    await b.sendFromTab(pos2, { type: "auto:skip", key: KEY, reason: "tu_tab_khac" });
    assert.ok(!session(b).autoRun.skipped, "tab khác không bỏ qua hộ được");
    pos.setAnchor(true);
    await sessionState(b, "done", 8000);
    assert.equal(srv.st.completes.length, 1);
  } finally {
    b.close();
  }
});

test("G1 quyền: đã cho phép nhưng hết hạn trước lượt nhận → nhật ký auto_skipped grant_expired; thu hồi trước lượt nhận → không ghi", async () => {
  for (const revoke of [false, true]) {
    const ctx = await setup({ bgTuning: { autoTtlMs: revoke ? 60000 : 80 } });
    const { b, srv } = ctx;
    try {
      assert.equal((await arm(b)).ok, true);
      if (revoke) assert.equal((await b.sendFromPopup({ type: "auto:revoke", key: KEY })).ok, true);
      else await sleep(150);
      await receive(ctx);
      await settle(250);
      const sk = session(b).log.filter((l) => l.type === "auto_skipped");
      assert.deepEqual(sk.map((l) => l.reason), revoke ? [] : ["grant_expired"]);
      assert.equal(srv.st.puts.length, 0);
    } finally {
      b.close();
    }
  }
});

test("G1 HOÀN THÀNH chưa rõ: hook báo COMPLETED 2xx (dược sĩ tự bấm) không đóng phiên; chỉ GET thấy COMPLETED mới done", async () => {
  const ctx = await setup({ server: { complete: "fail" } });
  const { b, srv, pos } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    await sessionState(b, "auto_complete_unknown", 8000);
    pos.post({ mark: "cgn/pos-hook", type: "gr-status", payload: { envId: "STG", grId: GR_ID, status: "COMPLETED", httpStatus: 200 } });
    await settle(300);
    assert.equal(session(b).state, "auto_complete_unknown", "phiếu vẫn RECEIVING → hook không đóng phiên");
    srv.st.gr.data.status = "COMPLETED"; // dược sĩ hoàn thành thật trên POS
    pos.post({ mark: "cgn/pos-hook", type: "gr-status", payload: { envId: "STG", grId: GR_ID, status: "COMPLETED", httpStatus: 200 } });
    await sessionState(b, "done", 4000);
    assert.ok(logTypes(b).includes("gr_completed_seen"));
    assert.ok(!logTypes(b).includes("gr_completed"));
    assert.equal(srv.st.completes.length, 1, "extension không gửi lại");
  } finally {
    b.close();
  }
});

// ---------- audit độc lập v0.3.0 (29/10): F1–F6 + ca G1 còn thiếu ----------
test("audit F1: Nextwaves đã ghi nhận lượt nhận 2xx (đọc lại kết quả lỗi, phiên còn nw_ready) → không cho phép tự động; quyền có SAU lượt nhận → không kích hoạt (armed_after_scan)", async () => {
  const ctx = await setup();
  const { b, srv, nw } = ctx;
  try {
    const r1 = await b.sendFromTab(nw, { type: "session:scanOk", key: KEY, scan: { shipmentId: A1.shipmentIds[0], httpStatus: 200, sentEpcs: 15, at: Date.now() } });
    assert.equal(r1.ok, true);
    assert.equal(session(b).state, "nw_ready");
    const late = await arm(b);
    assert.match(late.error, /đã ghi nhận lượt xác nhận nhận hàng/);
    assert.deepEqual(autoGrants(b), []);
    // Lớp thứ hai: quyền (bằng cách nào đó) có giờ tạo SAU lượt nhận → điểm kích hoạt không nhận.
    const s = session(b);
    b.store.autoGrants = { [KEY]: { schema: 1, key: KEY, sessionCreatedAt: s.createdAt, envId: "STG", posId: s.posId, posName: "", grId: s.grId, grCode: s.grCode, soBase: s.soBase, deliveryCode: s.deliveryCode, nwPoId: s.nwPoId, nwPoNumber: s.nwPoNumber, warehouseId: s.warehouseId, epcs: A1.nwResult.units.map((u) => u.epc).sort(), createdAt: s.scanOkAt + 1000, expiresAt: Date.now() + 600000 } };
    const r2 = await b.sendFromTab(nw, { type: "session:received", key: KEY, payload: H.clone(A1.nwResult) });
    assert.equal(r2.ok, true);
    await until(() => logTypes(b).includes("auto_skipped"));
    assert.equal(session(b).log.find((l) => l.type === "auto_skipped").reason, "armed_after_scan");
    assert.deepEqual(autoGrants(b), []);
    await settle(300);
    assert.equal(srv.st.puts.length, 0);
    noComplete(srv, "quyền sau lượt nhận");
  } finally {
    b.close();
  }
});

test("audit F2: PO Nextwaves đã có biên nhận từ trước (receiptIdsBefore) → không cho phép tự động", async () => {
  const ctx = await setup({ match: { receiptIdsBefore: ["11111111-2222-4333-8444-555555555555"] } });
  const { b } = ctx;
  try {
    const r = await arm(b);
    assert.match(r.error, /đã có biên nhận từ trước/);
    assert.deepEqual(autoGrants(b), []);
  } finally {
    b.close();
  }
});

test("audit F4: tab POS được giao bị đóng trước khi giành lượt → bỏ qua tab_closed + thu hồi quyền; Nextwaves báo đã dừng; 0 PUT", async () => {
  const ctx = await setup({ tuning: { autoAnchorWaitMs: 5000, uiWaitMs: 8000 } });
  const { b, srv, pos, nw } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    pos.setAnchor(false); // tab được giao còn chờ khung gắn đúng trang
    await receive(ctx);
    await until(() => session(b).autoRun);
    b.closeTab(pos);
    await until(() => session(b).autoRun.skipped);
    assert.equal(session(b).autoRun.skipped.reason, "tab_closed");
    assert.deepEqual(autoGrants(b), []);
    await until(() => nw.view && (nw.view.lines || []).some((l) => /Tự động đã dừng/.test(l)));
    await settle(200);
    assert.equal(srv.st.puts.length, 0);
    noComplete(srv, "tab được giao đã đóng");
  } finally {
    b.close();
  }
});

test("audit F4: quyền hết hạn sau điểm kích hoạt, trước khi giành lượt → bỏ qua grant_invalid, 0 PUT", async () => {
  const ctx = await setup({ bgTuning: { autoTtlMs: 600 }, server: { qrDelayMs: 300 } });
  const { b, srv } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    await until(() => session(b).autoRun);
    await until(() => session(b).autoRun.skipped, 8000);
    assert.equal(session(b).autoRun.skipped.reason, "grant_invalid");
    await settle(200);
    assert.equal(srv.st.puts.length, 0);
    noComplete(srv, "quyền hết hạn sau kích hoạt");
  } finally {
    b.close();
  }
});

test("audit F4: phiếu đã có đủ UID đúng lô khi tới lượt tự động → không ghi, bỏ qua uid_already_on_gr, thu hồi quyền, 0 COMPLETED", async () => {
  const ctx = await setup({ server: { grStart: "pos-stg-gr-GR03887-W1-sau-20261028.json" } });
  const { b, srv } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    await until(() => session(b).autoRun && session(b).autoRun.skipped);
    assert.equal(session(b).autoRun.skipped.reason, "uid_already_on_gr");
    assert.deepEqual(autoGrants(b), []);
    await settle(300);
    assert.equal(srv.st.puts.length, 0);
    noComplete(srv, "phiếu đã đủ");
  } finally {
    b.close();
  }
});

test("audit F5: tab khác trong lúc tab chủ đọc lại / đang gửi HOÀN THÀNH → 'KHÔNG bấm HOÀN THÀNH', không khuyên tự bấm; Nextwaves báo đang gửi", async () => {
  let releaseVerify;
  const verifyHold = new Promise((r) => (releaseVerify = r));
  let releaseComplete;
  const completeHold = new Promise((r) => (releaseComplete = r));
  const ctx = await setup({ server: { verifyHold, completeHook: () => completeHold } });
  const { b, srv, nw } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    await until(() => srv.st.verifyHeld, 8000);
    const pos2 = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos2.post(POS_AUTH);
    const v1 = await until(() => pos2.view && /đang tự HOÀN THÀNH ở tab POS khác — KHÔNG bấm HOÀN THÀNH/.test(pos2.view.title || "") && pos2.view, 4000);
    assert.ok(!v1.lines.some((l) => /tự bấm HOÀN THÀNH/.test(l)));
    releaseVerify();
    await sessionState(b, "auto_completing", 4000);
    pos2.reload();
    pos2.post(POS_AUTH);
    const v2 = await until(() => pos2.view && /đang gửi HOÀN THÀNH tự động — KHÔNG bấm HOÀN THÀNH/.test(pos2.view.title || "") && pos2.view, 4000);
    assert.ok(!v2.lines.some((l) => /tự bấm HOÀN THÀNH/.test(l)));
    await until(() => nw.view && (nw.view.lines || []).some((l) => /đang gửi HOÀN THÀNH/.test(l)), 4000);
    releaseComplete();
    await sessionState(b, "done", 6000);
    assert.equal(srv.st.completes.length, 1);
  } finally {
    releaseVerify();
    releaseComplete();
    b.close();
  }
});

test("audit F5: trang tự HOÀN THÀNH (hook 2xx) trong lúc tab chủ đọc lại → extension KHÔNG gửi lệnh HOÀN THÀNH; phiên done theo trang", async () => {
  let release;
  const verifyHold = new Promise((r) => (release = r));
  const ctx = await setup({ server: { verifyHold } });
  const { b, srv, pos } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    await until(() => srv.st.verifyHeld, 8000);
    pos.post({ mark: "cgn/pos-hook", type: "gr-status", payload: { envId: "STG", grId: GR_ID, status: "COMPLETED", httpStatus: 200 } });
    await sessionState(b, "done", 4000);
    release();
    await settle(400);
    noComplete(srv, "trang đã tự HOÀN THÀNH");
    assert.equal(session(b).state, "done");
  } finally {
    release();
    b.close();
  }
});

test("G1 trang: đổi route sang phiếu khác trong lúc tab chủ đọc lại → không giữ lượt, 0 COMPLETED (ui_not_anchored_complete), phiên applied", async () => {
  let release;
  const verifyHold = new Promise((r) => (release = r));
  const ctx = await setup({ server: { verifyHold } });
  const { b, srv, pos } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    await until(() => srv.st.verifyHeld, 8000);
    const to = `${POS}/danh-sach-phieu-nhan-hang/0f0f0f0f-1111-4222-8333-444455556666`;
    pos.url = to;
    pos.post({ mark: "cgn/pos-hook", type: "route", payload: { href: to } });
    await settle(50);
    release();
    await until(() => (session(b).log || []).some((l) => l.type === "auto_skipped" && l.reason === "ui_not_anchored_complete"), 4000);
    await settle(200);
    assert.equal(session(b).state, "applied");
    noComplete(srv, "đổi route");
  } finally {
    release();
    b.close();
  }
});

test("G1 kế hoạch: sai sản phẩm (tra QR) / sai đơn vị (Nextwaves) / nhận thiếu so với phiếu (cảnh báo) → auto_skipped, 0 PUT / 0 COMPLETED", async () => {
  const uid = A1.nwResult.units[0].uid;
  const variants = [
    ["QR sai sản phẩm", { qr: (code) => (code === uid ? { status: 200, json: Object.assign(H.clone(QR.get(code)), { data: [Object.assign(H.clone(QR.get(code).data[0] || QR.get(code).data), { productId: 999999 })] }) } : null) }, null, "plan_blocked"],
    ["đơn vị Nextwaves lạ", {}, (p) => (p.units[0].unitName = "thùng"), "plan_blocked"],
    ["phiếu cần 2 mà chỉ nhận 1", { grMut: (d) => { d.items[0].quantity += 1; d.items[0].details[0].quantity = 2; } }, null, "plan_warning"],
  ];
  for (const [name, server, mutPayload, reason] of variants) {
    const ctx = await setup({ server });
    const { b, srv } = ctx;
    try {
      assert.equal((await arm(b)).ok, true);
      const p = H.clone(A1.nwResult);
      if (mutPayload) mutPayload(p);
      await receive(ctx, p);
      await until(() => session(b).autoRun && session(b).autoRun.skipped, 6000);
      assert.equal(session(b).autoRun.skipped.reason, reason, name);
      await settle(200);
      assert.equal(srv.st.puts.length, 0, name);
      noComplete(srv, name);
    } finally {
      b.close();
    }
  }
});

test("G1 cửa hàng: POS đổi sang cửa hàng ngoài danh sách thử trước lượt nhận → không tự chạy, 0 PUT", async () => {
  const ctx = await setup();
  const { b, srv, pos } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    pos.post({ mark: "cgn/pos-hook", type: "auth", payload: { envId: "STG", headers: { authorization: "Bearer pos-test", "x-client-id": "1", "x-store-id": "00000000-0000-0000-0000-00000000abcd", "grpc-timeout": "30S" } } });
    await settle(150);
    await receive(ctx);
    await settle(600);
    assert.equal(srv.st.puts.length, 0);
    noComplete(srv, "đổi cửa hàng");
  } finally {
    b.close();
  }
});

test("audit F6: thu hồi sau khi lượt tự động đã dùng quyền → background trả false (không còn quyền)", async () => {
  const ctx = await setup();
  const { b } = ctx;
  try {
    assert.equal((await arm(b)).ok, true);
    await receive(ctx);
    await sessionState(b, "done", 8000);
    const r = await b.sendFromPopup({ type: "auto:revoke", key: KEY });
    assert.deepEqual([r.ok, r.data], [true, false]);
  } finally {
    b.close();
  }
});
