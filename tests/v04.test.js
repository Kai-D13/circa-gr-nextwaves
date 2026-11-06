"use strict";
// v0.4.0 (operator 06/11): mọi cửa hàng; sau "Xác nhận nhận hàng" trên Nextwaves → về POS TỰ điền cả phiếu (không cấp phép), extension
// KHÔNG BAO GIỜ gửi HOÀN THÀNH; tìm đơn Nextwaves một lần (không vòng lặp), "không có đơn" → nhận tay; giao lượt nhận đúng phiên;
// mượn / trả đầu đọc QR Scan Log (circa-reader/v1); tự bấm "Kết nối đầu đọc" của Nextwaves.
// Chạy thật background + content trên trình duyệt giả; dữ liệu POS là lượt A1 GR03887 thật (samples/*-20261028.json) — xem auto.test.js
// cũ (v0.3.x) đã thay bằng file này.
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const H = require("./helpers.js");
const { createBrowser, until, settle, closeAll } = require("./browser-sim.js");

test.afterEach(() => closeAll());

const POS = "https://pos.stg.circa-v2.buymed.tech";
const NW = "https://circa-stg.nextwaves.app";
const NWAPI = "https://api-circa-stg.nextwaves.app";
const GR_ID = "f2ae6e25-64bc-497b-81db-2de87284ec80";
const GR_PAGE = `${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`;
const KEY = `STG:${GR_ID}`;
const STORE = H.STORE_2222;
const A1 = H.sample("ext-stg-storage-GR03887-20261028.json").sessions[KEY];
const POS_AUTH = { mark: "cgn/pos-hook", type: "auth", payload: { envId: "STG", headers: { authorization: "Bearer pos-test", "x-client-id": "1", "x-store-id": STORE, "grpc-timeout": "30S" } } };
const NW_AUTH = (tok = "Bearer nw-test") => ({ mark: "cgn/nw-hook", type: "auth", payload: { envId: "STG", tenant: "circa-stg", headers: { authorization: tok } } });
const QR = new Map(H.sample("pos-stg-qrcode-GR03887-15uid-20261028.json").map((r) => [r.url.split("code=")[1], r.response]));
const REAL_PUTS = H.sample("pos-stg-gr-W1-GR03887-20261028.json")
  .filter((x) => x.method === "PUT")
  .map((x) => ({ detailId: x.url.split("/detail/")[1], body: x.request }));
const APPLIED_TITLE = "GR03887: đã điền 15 mã vào 5 lô — kiểm danh sách rồi bấm HOÀN THÀNH";
const TWIN_SHIP = "00000000-0000-4000-8000-0000000000c1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const detailsOf = (gr) => gr.data.items.flatMap((i) => i.details);

// POS A1 thật (+ Nextwaves tuỳ test qua o.nw(req)).
function makeServer(o = {}) {
  const st = { gr: H.clone(H.sample(o.grStart || "pos-stg-gr-GR03887-truoc-20261028.json")), puts: [], completes: [], log: [], nwSearches: 0, getsAfterLast: 0 };
  if (o.grMut) o.grMut(st.gr.data);
  async function handle(req) {
    st.log.push(req);
    const u = new URL(req.url);
    if (u.origin === NWAPI) {
      if (u.pathname.includes("/integrations/")) throw new Error("extension gọi API tích hợp Nextwaves");
      if (req.method !== "GET") throw new Error("extension gọi API ghi Nextwaves");
      if (u.pathname === "/api/v1/inter-tenant-orders/receiving") st.nwSearches += 1;
      if (o.nw) return o.nw(req, st);
      return { status: 404, json: {} };
    }
    if (u.origin !== POS) throw new Error("extension gọi host lạ: " + u.origin);
    if (u.pathname === "/thuocsi-warehouse/qrcode") {
      const code = u.searchParams.get("code");
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
      // o.tamperFinal: GET thứ 2 sau PUT cuối (lần đọc lại CẢ phiếu — khớp cuối) thấy phiếu bị đổi.
      if (o.tamperFinal && st.puts.length >= 5 && ++st.getsAfterLast >= 2) o.tamperFinal(snap.data); // từ lần đọc CẢ phiếu trở đi (phiếu bị đổi thật)
      return { status: 200, json: snap };
    }
    m = /^\/backend\/v1\/pos\/([0-9a-f-]{36})\/po\/([0-9a-f-]{36})$/.exec(u.pathname);
    if (m && req.method === "GET") return { status: 200, json: H.sample("pos-stg-po-PO00006767-SOBD1594095-20261028.json") };
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
    if (/\/status\/COMPLETED$/.test(u.pathname)) {
      st.completes.push(req);
      return { status: 200, json: null };
    }
    return { status: 404, json: { message: "no route" } };
  }
  return { st, handle };
}

const startBtn = (t) => t.view && t.view.buttons && t.view.buttons.find((x) => x.label === "Nhận hàng bằng RFID");
const viewTitle = (t) => (t.view ? t.view.title : null);
const session = (b, key = KEY) => b.session(key);
const sessionState = (b, state, ms) => until(() => { const s = session(b); return s && s.state === state && s; }, ms);
const matchFromA1 = (extra) =>
  Object.assign(
    { nwPoId: A1.nwPoId, nwPoNumber: A1.nwPoNumber, nwOrderId: A1.nwOrderId, nwRefId: A1.nwRefId, warehouseId: A1.warehouseId, warehouseName: "CIRCA FLORITA", warehouseCode: "30145", shipmentIds: A1.shipmentIds, expected: H.clone(A1.expected), receiptIdsBefore: A1.receiptIdsBefore.slice(), nwWriteLocks: [], fpRows: A1.fpRows || [], nwSearch: A1.nwSearch || null },
    extra || {}
  );

// POS mở GR03887 → bấm "Nhận hàng bằng RFID" (mượn đầu đọc) → tab Nextwaves → (khớp đơn bằng message như tab Nextwaves) → nw_ready.
async function setup(o = {}) {
  const srv = makeServer(o.server);
  const b = createBrowser(srv.handle, { tuning: Object.assign({ uiWaitMs: 300 }, o.tuning || {}), bgTuning: o.bgTuning, qsl: o.qsl });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(GR_PAGE);
    pos.post(POS_AUTH);
    (await until(() => startBtn(pos))).onClick();
    const nw = await until(() => b.tabs().find((t) => t.url.startsWith(NW)));
    await sessionState(b, "waiting_nw");
    if (o.match !== false) {
      const r = await b.sendFromTab(nw, { type: "session:nwMatched", key: KEY, match: matchFromA1(o.match), log: { type: "nw_matched" } });
      assert.equal(r.ok, true, r.error);
      await sessionState(b, "nw_ready");
    }
    return { b, srv, pos, nw };
  } catch (err) {
    b.close();
    throw err;
  }
}
// Dược sĩ bấm "Xác nhận nhận hàng" (2xx) → tab Nextwaves đọc kết quả → báo received (nwResult A1 thật).
async function receive(ctx, payload) {
  const { b, nw } = ctx;
  const r1 = await b.sendFromTab(nw, { type: "session:scanOk", key: KEY, scan: { shipmentId: A1.shipmentIds[0], httpStatus: 200, sentEpcs: 15, at: Date.now() } });
  assert.equal(r1.ok, true, r1.error);
  const r2 = await b.sendFromTab(nw, { type: "session:received", key: KEY, payload: payload || H.clone(A1.nwResult) });
  assert.equal(r2.ok, true, r2.error);
}

async function runKiem(file, b, gr = "GR03887") {
  const src = fs.readFileSync(path.join(__dirname, "..", "scripts", file), "utf8");
  assert.equal(src.split('"GR?????"').length, 2, `${file}: đúng một chỗ sửa mã phiếu`);
  const out = [];
  const chrome = { runtime: { getManifest: () => ({ version: "0.4.0" }) }, storage: { local: { get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => k in b.store).map((k) => [k, H.clone(b.store[k])])) } } };
  vm.runInContext(src.replace('"GR?????"', JSON.stringify(gr)), vm.createContext({ chrome, console: { log: (x) => out.push(String(x)) }, JSON, Date, Object, Set, Math }), { filename: file });
  await until(() => out.length > 0);
  return out.join("\n");
}

// ---------- luồng chính ----------
test("v0.4.0 A1 thật: mượn đầu đọc → nhận 2xx → về POS → TỰ điền 5 PUT đúng body thật (không cấp phép) → đóng tab Nextwaves → trả đầu đọc; KHÔNG gửi HOÀN THÀNH; dược sĩ HOÀN THÀNH → done", async () => {
  const ctx = await setup({ qsl: { mode: "ok" } });
  const { b, srv, pos, nw } = ctx;
  try {
    const s0 = session(b);
    assert.equal(s0.reader.supported, true);
    assert.equal(s0.reader.state, "released", "QR Scan Log đã nhả đầu đọc trước khi mở Nextwaves");
    const lease = s0.reader.leaseId;
    assert.match(lease, /^[A-Za-z0-9_-]{1,64}$/);
    assert.deepEqual(b.qsl.calls.slice(0, 2).map((c) => c.type), ["ping", "lend"]);
    assert.deepEqual([b.qsl.calls[1].leaseId, b.qsl.calls[1].label, b.qsl.calls[1].ttlMs], [lease, "GR03887", 15 * 60 * 1000]);
    assert.ok(b.qsl.calls.indexOf(b.qsl.calls.find((c) => c.type === "lend")) >= 0);
    assert.deepEqual([s0.warehouseId, s0.warehouseName, s0.nwTenant], [A1.warehouseId, "CIRCA FLORITA", "circa-stg"]);

    await receive(ctx);
    const s = await sessionState(b, "applied", 8000);
    assert.deepEqual(srv.st.puts, REAL_PUTS, "5 PUT trùng thứ tự + body lượt A1 thật");
    assert.deepEqual([s.applyClaim.how, s.applyClaim.planHash, s.applyResult.hash, s.applyResult.uids], ["auto", "EF0E020C", "EF0E020C", 15]);
    await until(() => nw.closed, 2000);
    await until(() => (session(b).reader || {}).state === "returned", 2000);
    const ret = b.qsl.calls.find((c) => c.type === "return");
    assert.equal(ret.leaseId, lease, "trả đúng lượt mượn");
    assert.equal(b.qsl.lent, null);
    const types = session(b).log.map((l) => l.type).filter((x) => !/^apply_(sending|done)$/.test(x) && x !== "plan");
    // Trả đầu đọc chạy song song với lúc điền → không cố định vị trí trong nhật ký.
    assert.deepEqual(types.filter((x) => x !== "reader_return"), ["start", "nw_matched", "scan_ok", "nw_received", "pos_focused", "apply_claimed", "applied"]);
    assert.equal(types.filter((x) => x === "reader_return").length, 1);
    await until(() => pos.reloads >= 1 && pos.loads >= 2);
    pos.post(POS_AUTH);
    await until(() => viewTitle(pos) === APPLIED_TITLE);
    await settle(150);
    assert.equal(srv.st.completes.length, 0, "extension KHÔNG gửi HOÀN THÀNH");
    // Dược sĩ bấm HOÀN THÀNH trên POS.
    srv.st.gr.data.status = "COMPLETED";
    pos.post({ mark: "cgn/pos-hook", type: "gr-status", payload: { envId: "STG", grId: GR_ID, status: "COMPLETED", httpStatus: 200 } });
    await sessionState(b, "done");
    assert.equal(srv.st.puts.length, 5);
    assert.ok(!JSON.stringify(b.store).includes("Bearer"), "không lưu token");
  } finally {
    b.close();
  }
});

test("v0.4.0 kiem-truoc / kiem-sau trên lượt A1 giả lập: trước (nw_ready, đầu đọc đã mượn) → sau (applied, how auto, 5 lô, đầu đọc đã trả)", async () => {
  const ctx = await setup({ qsl: { mode: "ok" } });
  const { b } = ctx;
  try {
    const truoc = JSON.parse(await runKiem("kiem-truoc.js", b));
    assert.deepEqual(
      [truoc.env, truoc.tenant, truoc.phienTrungMa, truoc.gr, truoc.state, truoc.so, truoc.nwPo, truoc.kho, truoc.dauDoc, truoc.scanOk, truoc.bienNhanTruoc, truoc.tem, truoc.temKhongTrung, truoc.thieuUid],
      ["STG", "circa-stg", 0, "GR03887", "nw_ready", "SOBD1594095-F", "PO13806459", "CIRCA FLORITA 30145", "released", false, 0, 15, 15, 0]
    );
    assert.equal(JSON.parse(await runKiem("kiem-truoc.js", b, "GR?????")).gr, "GR03887", "để nguyên mã mẫu → phiên mới nhất");
    await receive(ctx);
    await sessionState(b, "applied", 8000);
    await until(() => (session(b).reader || {}).state === "returned", 2000);
    const sau = JSON.parse(await runKiem("kiem-sau.js", b));
    assert.deepEqual([sau.env, sau.state, sau.dien.how, sau.dien.plan, sau.nwUnits, sau.nwReceipts, sau.dungDien, sau.soLoDaDien, sau.dauDoc], ["STG", "applied", "auto", "EF0E020C", 15, 1, null, 5, "returned"]);
    assert.ok(!/Bearer|authorization/i.test(JSON.stringify(sau)), "không in token");
    await b.setConfig({ mode: "PRD", url: "" });
    assert.match(await runKiem("kiem-sau.js", b), /^KHÔNG có phiên GR03887/);
    assert.ok(!fs.existsSync(path.join(__dirname, "..", "scripts", "kiem-quet.js")), "bỏ đoạn kiểm quyền tự động");
  } finally {
    b.close();
  }
});

test("v0.4.0 PUT thứ 3 lỗi 503 → dừng 'chưa rõ', không PUT thêm; F5 không tự chạy lại; 'Đọc lại và điền tiếp' điền nốt 3 lô, không trùng mã", async () => {
  const ctx = await setup({ server: { putFail: { 3: 503 } } });
  const { b, srv, pos } = ctx;
  try {
    await receive(ctx);
    const s = await sessionState(b, "apply_stopped", 8000);
    assert.deepEqual([s.applyError.reason, s.applyError.status], ["put_uncertain", 503]);
    assert.equal(srv.st.puts.length, 3);
    pos.reload();
    pos.post(POS_AUTH);
    const btn = await until(() => pos.view && (pos.view.buttons || []).find((x) => /^Đọc lại và điền tiếp · #/.test(x.label)));
    await settle(100);
    assert.equal(srv.st.puts.length, 3, "dừng rồi không tự chạy lại sau F5");
    btn.onClick();
    await sessionState(b, "applied", 8000);
    assert.equal(srv.st.puts.length, 6);
    const codes = detailsOf(srv.st.gr).flatMap((d) => d.thuocsi_qr_codes || []);
    assert.deepEqual([codes.length, new Set(codes).size], [15, 15]);
    assert.equal(srv.st.completes.length, 0);
  } finally {
    b.close();
  }
});

test("v0.4.0 tab POS chết giữa lúc điền (tải lại ở PUT 2) → lease hết → mở lại: không tự chạy; nút điền tiếp → điền nốt, tổng 5 PUT, không trùng", async () => {
  let release;
  const hold = new Promise((r) => (release = r));
  const ctx = await setup({ server: { putHold: { 2: hold } }, bgTuning: { leaseMs: 200 } });
  const { b, srv, pos } = ctx;
  try {
    await receive(ctx);
    await until(() => srv.st.puts.length === 2);
    pos.reload(); // tab chết giữa chừng; PUT 2 vẫn tới máy chủ
    release();
    await sleep(260); // lease hết hạn
    pos.post(POS_AUTH);
    const btn = await until(() => pos.view && (pos.view.buttons || []).find((x) => /^Đọc lại và điền tiếp · #/.test(x.label)));
    assert.equal(session(b).state, "applying");
    assert.match(pos.view.lines.join("\n"), /bị ngắt giữa chừng/);
    const left = 15 - REAL_PUTS.slice(0, 2).reduce((n, p) => n + p.body.detail.thuocsi_qr_codes.length, 0);
    assert.ok(btn.label.endsWith(`(${left} UID)`), `kế hoạch mới chỉ còn 3 lô / ${left} UID: ${btn.label}`);
    btn.onClick();
    await sessionState(b, "applied", 8000);
    assert.equal(srv.st.puts.length, 5);
    const codes = detailsOf(srv.st.gr).flatMap((d) => d.thuocsi_qr_codes || []);
    assert.deepEqual([codes.length, new Set(codes).size], [15, 15]);
    assert.ok(session(b).log.some((l) => l.type === "apply_claimed" && l.takeover === true));
  } finally {
    release();
    b.close();
  }
});

test("v0.4.0 kế hoạch chặn (QR một UID không tra được) → KHÔNG tự điền, 0 PUT; phiếu đã có đủ UID đúng lô → không ghi, applied_already", async () => {
  const bad = A1.nwResult.units[0].uid;
  const c1 = await setup({ server: { qr: (code) => (code === bad ? { status: 200, json: { status: "OK", data: [] } } : null) } });
  try {
    await receive(c1);
    await until(() => /^GR03887: không điền được — \d+ điểm chặn$/.test(viewTitle(c1.pos) || ""));
    await settle(150);
    assert.equal(c1.srv.st.puts.length, 0);
    assert.equal(session(c1.b).state, "received");
  } finally {
    c1.b.close();
  }
  const c2 = await setup({ server: { grStart: "pos-stg-gr-GR03887-W1-sau-20261028.json" } });
  try {
    await receive(c2);
    await sessionState(c2.b, "applied", 8000);
    assert.equal(c2.srv.st.puts.length, 0);
    assert.ok(session(c2.b).log.some((l) => l.type === "applied_already"));
  } finally {
    c2.b.close();
  }
});

// ---------- A3 / A2: về POS, phiên mất ----------
test("v0.4.0 A3: tab POS gốc đang ở phiếu KHÁC lúc Nextwaves nhận → mở tab mới cho phiếu này, không giật tab đang làm việc", async () => {
  const ctx = await setup();
  const { b, srv, pos } = ctx;
  try {
    const other = `${POS}/danh-sach-phieu-nhan-hang/0f0f0f0f-1111-4222-8333-444455556666`;
    pos.url = other;
    pos.post({ mark: "cgn/pos-hook", type: "route", payload: { href: other } });
    await settle(30);
    await receive(ctx);
    const fresh = await until(() => b.tabs().find((t) => t.id !== pos.id && t.url === GR_PAGE));
    assert.equal(pos.url, other, "tab đang làm phiếu khác giữ nguyên");
    assert.equal(session(b).posTabId, fresh.id);
    fresh.post(POS_AUTH);
    await sessionState(b, "applied", 8000);
    assert.equal(srv.st.puts.length, 5);
  } finally {
    b.close();
  }
});

test("v0.4.0 A2: phiên bị xoá trong lúc Nextwaves nhận → scanOk / received báo lỗi rõ 'Nextwaves ĐÃ nhận … POS CHƯA điền', không im lặng", async () => {
  const ctx = await setup();
  const { b, nw } = ctx;
  try {
    assert.equal((await b.sendFromPopup({ type: "session:cancel", key: KEY })).ok, true);
    const r1 = await b.sendFromTab(nw, { type: "session:scanOk", key: KEY, scan: { shipmentId: A1.shipmentIds[0], httpStatus: 200 } });
    assert.equal(r1.ok, false);
    assert.match(r1.error, /Không có phiên/);
    const r2 = await b.sendFromTab(nw, { type: "session:received", key: KEY, payload: H.clone(A1.nwResult) });
    assert.equal(r2.ok, false);
    assert.match(r2.error, /Nextwaves ĐÃ nhận nhưng POS CHƯA điền/);
  } finally {
    b.close();
  }
});

// ---------- A7: lượt nhận ở tab Nextwaves của phiên khác ----------
test("v0.4.0 A7: lượt 2xx của phiếu gửi thuộc phiên khác cùng SO → giao đúng phiên đó (scanOk + gắn tab); không có / nhiều phiên / không 2xx / nguồn sai → không giao", async () => {
  const ctx = await setup();
  const { b, pos, nw } = ctx;
  try {
    const OTHER = "STG:11111111-2222-4333-8444-555555555555";
    const twin = Object.assign(H.clone(session(b)), { key: OTHER, grId: OTHER.slice(4), grCode: "GR03999", shipmentIds: [TWIN_SHIP], nwTabId: null, updatedAt: Date.now() });
    await b.patchSession(OTHER, twin);
    const route = (sid, httpStatus = 200, from = nw) => b.sendFromTab(from, { type: "session:routeScan", envId: "STG", tenant: "circa-stg", scan: { shipmentId: sid, httpStatus, sentEpcs: 3 } });
    assert.equal((await route(TWIN_SHIP, 400)).data, null, "không 2xx");
    assert.equal((await route("00000000-0000-4000-8000-0000000000ff")).data, null, "phiếu gửi không thuộc phiên nào");
    assert.match((await route(TWIN_SHIP, 200, pos)).error, /nguồn gửi không hợp lệ/);
    const r = await route(TWIN_SHIP);
    assert.equal(r.data.key, OTHER);
    assert.deepEqual([session(b, OTHER).scanOk.shipmentId, session(b, OTHER).nwTabId], [TWIN_SHIP, nw.id]);
    assert.equal(session(b).scanOk, undefined, "phiên của tab không bị đánh dấu");
    // Hai phiên cùng có phiếu gửi đó → không đoán.
    const third = "STG:22222222-2222-4333-8444-555555555555";
    await b.patchSession(third, Object.assign(H.clone(twin), { key: third, grId: third.slice(4), grCode: "GR03998", scanOk: undefined, state: "nw_ready" }));
    await b.patchSession(OTHER, { scanOk: undefined });
    assert.equal((await route(TWIN_SHIP)).data, null, "nhiều phiên → không giao");
  } finally {
    b.close();
  }
});

// ---------- tab Nextwaves: tìm đơn một lần, không có đơn, chờ token ----------
const nwEmpty = (req) => {
  const u = new URL(req.url);
  if (u.pathname === "/api/v1/inter-tenant-orders/receiving") return { status: 200, json: { items: [], total: 0 } };
  return { status: 404, json: {} };
};

test("v0.4.0 A1 (lỗi GR84570): Nextwaves không có đơn chờ nhận → tìm ĐÚNG MỘT lần, phiên no_nw_order, khung 'nhận tay', trả đầu đọc; POS ghi rõ; 'Tìm lại' tìm lại một lần", async () => {
  const ctx = await setup({ match: false, qsl: { mode: "ok" }, server: { nw: nwEmpty } });
  const { b, srv, pos, nw } = ctx;
  try {
    nw.post(NW_AUTH());
    await sessionState(b, "no_nw_order");
    await until(() => viewTitle(nw) === "Nextwaves chưa có đơn chờ nhận cho SOBD1594095");
    await settle(400);
    assert.equal(srv.st.nwSearches, 1, "không vòng lặp tìm lại");
    assert.equal(viewTitle(nw), "Nextwaves chưa có đơn chờ nhận cho SOBD1594095", "khung giữ nguyên");
    const s = session(b);
    assert.equal(s.log.filter((l) => l.type === "nw_match_failed").length, 1, "nhật ký không lặp");
    await until(() => (session(b).reader || {}).state === "returned", 2000);
    assert.ok(b.qsl.calls.some((c) => c.type === "return" && c.leaseId === s.reader.leaseId));
    await until(() => viewTitle(pos) === "GR03887: Nextwaves chưa có đơn chờ nhận — nhận tay");
    assert.ok(pos.view.buttons.some((x) => x.label === "Tìm lại trên Nextwaves"));
    // "Tìm lại" trên khung Nextwaves → tìm thêm đúng một lần.
    nw.view.buttons.find((x) => x.label === "Tìm lại").onClick();
    await until(() => srv.st.nwSearches === 2);
    await sessionState(b, "no_nw_order");
    await settle(300);
    assert.equal(srv.st.nwSearches, 2);
    assert.equal(srv.st.puts.length, 0);
  } finally {
    b.close();
  }
});

test("v0.4.0 A1: tìm đơn lỗi (500 / 401) → khung giữ lỗi, 1 lần gọi; token mới sau 401 → tìm lại đúng một lần; 'Tìm lại' sau 500", async () => {
  let status = 500;
  const ctx = await setup({ match: false, server: { nw: () => ({ status, json: { message: "lỗi giả" } }) } });
  const { b, srv, nw } = ctx;
  try {
    nw.post(NW_AUTH());
    await until(() => viewTitle(nw) === "Không tìm được đơn theo SO trên Nextwaves");
    await settle(300);
    assert.equal(srv.st.nwSearches, 1);
    assert.equal(session(b).state, "waiting_nw");
    status = 401;
    nw.view.buttons.find((x) => x.label === "Tìm lại").onClick();
    await until(() => srv.st.nwSearches === 2);
    await settle(200);
    assert.equal(srv.st.nwSearches, 2);
    nw.post(NW_AUTH("Bearer nw-moi")); // web Nextwaves làm mới token sau 401
    await until(() => srv.st.nwSearches === 3);
    await settle(300);
    assert.equal(srv.st.nwSearches, 3, "token mới → tìm lại đúng một lần");
  } finally {
    b.close();
  }
});

test("v0.4.0 A4: tab Nextwaves không thấy token quá hạn chờ → hướng dẫn F5 / đăng nhập đúng tenant", async () => {
  const ctx = await setup({ match: false });
  const { nw } = ctx;
  try {
    await until(() => viewTitle(nw) === "Chưa thấy Nextwaves tải dữ liệu", 3000);
    assert.match(nw.view.lines.join("\n"), /https:\/\/circa-stg\.nextwaves\.app/);
  } finally {
    ctx.b.close();
  }
});

// ---------- C2: đầu đọc trên màn quét Nextwaves ----------
test("v0.4.0 C2: màn quét chưa kết nối đầu đọc → extension bấm 'Kết nối đầu đọc' (tối đa 3 lần), KHÔNG bấm nút khác; hết lượt → 'Mượn lại đầu đọc' (cùng leaseId); kết nối được → 'đã kết nối'", async () => {
  const ctx = await setup({ qsl: { mode: "ok" } });
  const { b, nw } = ctx;
  try {
    nw.post(NW_AUTH());
    await until(() => viewTitle(nw) === "Sẵn sàng nhận hàng");
    const clicks = { connect: 0, confirm: 0 };
    const connect = { textContent: "Kết nối đầu đọc", disabled: false, click: () => (clicks.connect += 1) };
    const confirm = { textContent: "Xác nhận nhận hàng", disabled: false, click: () => (clicks.confirm += 1) };
    nw.dom.buttons = [confirm, connect];
    await until(() => clicks.connect === 3, 3000);
    const lend = await until(() => nw.view && (nw.view.buttons || []).find((x) => x.label === "Mượn lại đầu đọc"));
    assert.match(nw.view.lines.join("\n"), /Đầu đọc: chưa kết nối được/);
    await settle(200);
    assert.equal(clicks.connect, 3, "tối đa 3 lần");
    const lends0 = b.qsl.calls.filter((c) => c.type === "lend").length;
    await lend.onClick();
    await until(() => b.qsl.calls.filter((c) => c.type === "lend").length === lends0 + 1);
    assert.equal(b.qsl.calls.filter((c) => c.type === "lend").pop().leaseId, session(b).reader.leaseId, "gia hạn cùng lượt mượn");
    await until(() => clicks.connect === 4, 3000); // sau khi mượn lại: thử kết nối lại
    connect.textContent = "Bắt đầu quét"; // Nextwaves đã kết nối
    await until(() => nw.view && nw.view.lines.some((l) => /^Đầu đọc: đã kết nối\./.test(l)));
    assert.equal(clicks.confirm, 0, "không bao giờ bấm Xác nhận nhận hàng");
  } finally {
    b.close();
  }
});

test("v0.4.0 đầu đọc: QR Scan Log chưa hỗ trợ (không pong) → vẫn mở Nextwaves, phiên ghi no_qsl, không gửi lend / return; QR Scan Log bận → busy", async () => {
  const c1 = await setup({ qsl: { mode: "none" } });
  try {
    assert.deepEqual([session(c1.b).reader.supported, session(c1.b).reader.state], [false, "no_qsl"]);
    await receive(c1);
    await sessionState(c1.b, "applied", 8000);
    await settle(100);
    assert.equal(c1.b.qsl.calls.length, 0);
  } finally {
    c1.b.close();
  }
  const c2 = await setup({ qsl: { mode: "busy" } });
  try {
    assert.deepEqual([session(c2.b).reader.supported, session(c2.b).reader.state], [true, "busy"]);
  } finally {
    c2.b.close();
  }
});

test("07/11 chưa tích hợp QR Scan Log: hết 3 lần bấm (cổng bị tab bán hàng giữ) → hướng dẫn Ngắt RFID rồi quay lại; quay lại tab → thêm một lượt tối đa 3 lần; không rời tab thì không bấm thêm", async () => {
  const ctx = await setup({ qsl: { mode: "none" } });
  const { b, nw } = ctx;
  try {
    nw.post(NW_AUTH());
    await until(() => viewTitle(nw) === "Sẵn sàng nhận hàng");
    let clicks = 0;
    const connect = { textContent: "Kết nối đầu đọc", disabled: false, click: () => (clicks += 1) }; // cổng bận: bấm không ăn
    nw.dom.hidden = true; // tab Nextwaves mở nền: không bấm hộ khi dược sĩ không nhìn
    nw.dom.buttons = [connect];
    await settle(200);
    assert.equal(clicks, 0, "tab ẩn → không bấm");
    nw.dom.hidden = false;
    await until(() => clicks === 3, 3000);
    await until(() => nw.view && nw.view.lines.some((l) => /^Đầu đọc: đang bận ở tab khác — sang tab bán hàng bấm Ngắt RFID rồi quay lại tab này/.test(l)));
    assert.ok(!(nw.view.buttons || []).some((x) => x.label === "Mượn lại đầu đọc"), "không có QR Scan Log → không có nút mượn");
    await settle(300);
    assert.equal(clicks, 3, "không rời tab → không bấm thêm");
    nw.dom.hidden = true; // dược sĩ sang tab bán hàng bấm Ngắt
    await settle(150);
    assert.equal(clicks, 3, "tab ẩn → không bấm");
    nw.dom.hidden = false; // quay lại
    await until(() => clicks === 6, 3000);
    await settle(300);
    assert.equal(clicks, 6, "lượt mới vẫn tối đa 3 lần");
    connect.textContent = "Bắt đầu quét"; // lần này kết nối được
    await until(() => nw.view && nw.view.lines.some((l) => /^Đầu đọc: đã kết nối\.$/.test(l)));
    assert.equal(b.qsl.calls.length, 0);
  } finally {
    b.close();
  }
});

// ---------- C1: một tab Nextwaves nhận hàng ----------
test("v0.4.0 C1: mở phiếu khác khi tab nhận hàng Nextwaves của phiếu trước còn mở → tái dùng tab đó (một tab giữ đầu đọc); phiên trước mất tab", async () => {
  const ctx = await setup();
  const { b, pos, nw } = ctx;
  try {
    const n0 = b.tabs().filter((t) => t.url.startsWith(NW)).length;
    const other = "33333333-2222-4333-8444-555555555555";
    const r = await b.sendFromTab(pos, { type: "session:start", envId: "STG", nwTenant: "circa-stg", grId: other, grCode: "GR03777", posId: STORE, soBase: "SOBD1" });
    assert.equal(r.ok, true, r.error);
    assert.equal(b.tabs().filter((t) => t.url.startsWith(NW)).length, n0, "không mở thêm tab Nextwaves");
    assert.equal(nw.url, `${NW}/vi/purchases/receive?po=SOBD1`);
    assert.equal(session(b, `STG:${other}`).nwTabId, nw.id);
    assert.equal(session(b).nwTabId, null);
    assert.ok(session(b).log.some((l) => l.type === "nw_tab_reused" && l.by === "GR03777"));
  } finally {
    b.close();
  }
});

// ---------- B6 / A8 ----------
test("v0.4.0 B6: phiên gắn tenant Nextwaves — tab Nextwaves của tenant khác không tìm thấy phiên (số PO Nextwaves chỉ duy nhất trong một tenant)", async () => {
  const srv = makeServer();
  const b = createBrowser(srv.handle);
  try {
    await b.setConfig({ mode: "PRD", url: "", nwTenant: "circa-medly" });
    const prd = b.openTab("https://pos.v2.circa.vn/danh-sach-phieu-nhan-hang/" + GR_ID);
    const st = await b.sendFromTab(prd, { type: "session:start", envId: "PRD", nwTenant: "circa-medly", grId: GR_ID, grCode: "GR03887", posId: STORE, soBase: "SOBD1594095" });
    assert.equal(st.ok, true, st.error);
    const medly = b.tabs().find((t) => t.url.startsWith("https://circa-medly.nextwaves.app/"));
    const circa = b.openTab("https://circa.nextwaves.app/vi/purchases/receive?po=SOBD1594095");
    const find = (t, tenant) => b.sendFromTab(t, { type: "session:findByNw", envId: "PRD", tenant, po: "SOBD1594095" });
    assert.equal((await find(medly, "circa-medly")).data.key, "PRD:" + GR_ID);
    assert.equal((await find(circa, "circa")).data, null, "tenant khác → không có phiên");
    // Tab tenant khác không đặt được kết quả khớp đơn cho phiên.
    const r = await b.sendFromTab(circa, { type: "session:nwMatched", key: "PRD:" + GR_ID, match: matchFromA1() });
    assert.match(r.error, /nguồn gửi không hợp lệ/);
  } finally {
    b.close();
  }
});

test("v0.4.0 A8: tab chết ngay sau PUT cuối (phiên kẹt applying) → hết lease, mở lại phiếu → thấy đã đủ → applied, không ghi thêm", async () => {
  let release;
  const hold = new Promise((r) => (release = r));
  const ctx = await setup({ server: { putHold: { 5: hold } }, bgTuning: { leaseMs: 200 } });
  const { b, srv, pos } = ctx;
  try {
    await receive(ctx);
    await until(() => srv.st.puts.length === 5);
    pos.reload(); // tab chết khi PUT 5 còn đang đi; máy chủ vẫn lưu
    release();
    await sleep(260);
    assert.equal(session(b).state, "applying");
    pos.post(POS_AUTH);
    await sessionState(b, "applied", 4000);
    assert.ok(session(b).log.some((l) => l.type === "applied_already"));
    await until(() => viewTitle(pos) === APPLIED_TITLE);
    assert.equal(srv.st.puts.length, 5);
  } finally {
    release();
    b.close();
  }
});

test("v0.4.0 A1 lớp 2: tab Nextwaves chỉ hỏi lại background khi danh sách phiên đổi THẬT — nhật ký / lease của phiên không đánh thức tab", async () => {
  const srv = makeServer({ nw: nwEmpty });
  const asks = [];
  const b = createBrowser(srv.handle, { tuning: { uiWaitMs: 300 }, interceptBg: (msg, tab) => (tab && tab.url.startsWith(NW) && msg.type === "session:findByNw" ? (asks.push(Date.now()), undefined) : undefined) });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(GR_PAGE);
    pos.post(POS_AUTH);
    (await until(() => startBtn(pos))).onClick();
    const nw = await until(() => b.tabs().find((t) => t.url.startsWith(NW)));
    nw.post(NW_AUTH());
    await sessionState(b, "no_nw_order");
    await settle(200);
    const n0 = asks.length;
    for (let i = 0; i < 5; i++) await b.sendFromTab(pos, { type: "session:log", key: KEY, log: { type: "ghi_chu_" + i } });
    await b.patchSession(KEY, { lease: { token: "x", expiresAt: Date.now() + 1000 } });
    await settle(200);
    assert.equal(asks.length, n0, "chỉ nhật ký / lease đổi → không đánh giá lại");
    assert.equal(srv.st.nwSearches, 1);
  } finally {
    b.close();
  }
});

test("v0.4.0 bấm 'Nhận hàng bằng RFID' lại cho phiếu 'không có đơn' (tab khác / bấm đúp) → background tìm lại: waiting_nw, giữ phiên + khoá, dùng lại tab Nextwaves", async () => {
  const ctx = await setup({ match: false, server: { nw: nwEmpty } });
  const { b, pos, nw } = ctx;
  try {
    nw.post(NW_AUTH());
    await sessionState(b, "no_nw_order");
    const before = session(b);
    const n0 = b.tabs().filter((t) => t.url.startsWith(NW)).length;
    const r = await b.sendFromTab(pos, { type: "session:start", envId: "STG", nwTenant: "circa-stg", grId: GR_ID, grCode: "GR03887", posId: STORE, soBase: "SOBD1594095", writeLocks: ["so_many_gr"] });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.data.createdAt, before.createdAt, "giữ phiên cũ");
    assert.ok(r.data.writeLocks.includes("so_many_gr"), "khoá vừa tính lại ở POS được gộp vào (chỉ thêm, không bớt)");
    assert.ok(r.data.log.some((l) => l.type === "nw_retry"));
    assert.ok(["waiting_nw", "no_nw_order"].includes(session(b).state));
    assert.equal(b.tabs().filter((t) => t.url.startsWith(NW)).length, n0, "dùng lại tab Nextwaves");
  } finally {
    b.close();
  }
});

// ---------- review v0.4.0 (07/11) ----------
test("review P2-1: trả đầu đọc khi QR Scan Log của tab POS chưa trả lời (trang vừa tải) → thử lại có giãn cách tới khi được", async () => {
  const ctx = await setup({ qsl: { mode: "ok" } });
  const { b } = ctx;
  try {
    const lease = session(b).reader.leaseId;
    b.qsl.muteUntil = Date.now() + 250; // QR Scan Log của tab POS chưa nạp xong trong ~250 ms
    await receive(ctx);
    await sessionState(b, "applied", 8000);
    await until(() => (session(b).reader || {}).state === "returned", 3000);
    assert.ok(b.qsl.calls.some((c) => c.type === "return" && c.leaseId === lease));
    assert.equal(b.qsl.lent, null);
    const log = session(b).log.filter((l) => l.type === "reader_return");
    assert.deepEqual(log.map((l) => [l.why, l.ok]), [["received", true]]);
  } finally {
    b.close();
  }
});

test("review P2-2: dòng Nextwaves không gắn tem (phiếu cần nhiều hơn số UID) → tự điền phần có tem, khung VÀNG nêu sản phẩm chưa nhận đủ (không 'kiểm rồi bấm HOÀN THÀNH' xanh)", async () => {
  let itemName = "";
  const ctx = await setup({
    server: {
      grMut: (gr) => {
        const it = gr.items[0];
        it.quantity = Number(it.quantity) + 1; // phiếu cần thêm 1 mà Nextwaves không có tem cho phần đó
        itemName = it.product_name;
      },
    },
  });
  const { b, srv, pos } = ctx;
  try {
    await receive(ctx);
    const s = await sessionState(b, "applied", 8000);
    assert.equal(srv.st.puts.length, 5);
    assert.ok(s.applyResult.notFull >= 1, "kế hoạch ghi có sản phẩm chưa đủ");
    await until(() => pos.reloads >= 1 && pos.loads >= 2);
    pos.post(POS_AUTH);
    const v = await until(() => pos.view && /CHƯA nhận đủ$/.test(pos.view.title || "") && pos.view);
    assert.equal(v.tone, "warn");
    assert.match(v.title, /^GR03887: đã điền 15 mã — còn 1 sản phẩm CHƯA nhận đủ$/);
    assert.ok(v.lines.some((l) => l.startsWith(`• ${itemName}: `)), v.lines.join(" | "));
    assert.equal(srv.st.completes.length, 0);
  } finally {
    b.close();
  }
});

test("review P2-3: huỷ phiên → đóng tab Nextwaves TRƯỚC rồi mới trả đầu đọc; 'Tìm lại' trên phiếu không có đơn → mượn lượt MỚI (lượt cũ đã trả)", async () => {
  const c1 = await setup({ qsl: { mode: "ok" } });
  try {
    const lease = session(c1.b).reader.leaseId;
    assert.equal((await c1.b.sendFromPopup({ type: "session:cancel", key: KEY })).ok, true);
    await until(() => c1.nw.closed, 2000);
    await until(() => c1.b.qsl.calls.some((c) => c.type === "return" && c.leaseId === lease), 3000);
    assert.equal(c1.b.qsl.lent, null);
  } finally {
    c1.b.close();
  }
  const c2 = await setup({ match: false, qsl: { mode: "ok" }, server: { nw: nwEmpty } });
  try {
    const lease = session(c2.b).reader.leaseId;
    c2.nw.post(NW_AUTH());
    await sessionState(c2.b, "no_nw_order");
    await until(() => (session(c2.b).reader || {}).state === "returned", 2000);
    c2.nw.view.buttons.find((x) => x.label === "Tìm lại").onClick();
    await until(() => c2.b.qsl.calls.filter((c) => c.type === "lend").length === 2, 3000);
    const again = c2.b.qsl.calls.filter((c) => c.type === "lend").pop();
    assert.notEqual(again.leaseId, lease, "lượt mới sau khi đã trả");
    await until(() => (session(c2.b).reader || {}).leaseId === again.leaseId, 2000);
  } finally {
    c2.b.close();
  }
});

test("review P3-1: mượn đầu đọc xong mà tạo phiên lỗi → trả ngay lượt mượn (không để QR Scan Log chờ hết hạn)", async () => {
  const srv = makeServer();
  const b = createBrowser(srv.handle, { qsl: { mode: "ok" }, interceptBg: (msg) => (msg.type === "session:start" ? { ok: false, error: "lỗi giả" } : undefined) });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(GR_PAGE);
    pos.post(POS_AUTH);
    (await until(() => startBtn(pos))).onClick();
    await until(() => b.qsl.calls.some((c) => c.type === "return"), 3000);
    const lend = b.qsl.calls.find((c) => c.type === "lend");
    assert.equal(b.qsl.calls.find((c) => c.type === "return").leaseId, lend.leaseId);
    assert.equal(b.qsl.lent, null);
    assert.equal(b.tabs().filter((t) => t.url.startsWith(NW)).length, 0);
  } finally {
    b.close();
  }
});

test("review P3-2: tab Nextwaves gia hạn lượt mượn định kỳ (cùng leaseId); QR Scan Log bận lúc mượn → thử lại, có giới hạn", async () => {
  const c1 = await setup({ qsl: { mode: "ok" }, tuning: { readerRenewMs: 150 } });
  try {
    const lease = session(c1.b).reader.leaseId;
    c1.nw.post(NW_AUTH());
    await until(() => viewTitle(c1.nw) === "Sẵn sàng nhận hàng");
    await until(() => c1.b.qsl.calls.filter((c) => c.type === "lend").length >= 3, 3000);
    assert.ok(c1.b.qsl.calls.filter((c) => c.type === "lend").every((c) => c.leaseId === lease), "gia hạn cùng lượt");
  } finally {
    c1.b.close();
  }
  const c2 = await setup({ qsl: { mode: "busy" }, tuning: { readerRetryMs: 60, readerRetryMax: 3 } });
  try {
    c2.nw.post(NW_AUTH());
    await until(() => viewTitle(c2.nw) === "Sẵn sàng nhận hàng");
    await until(() => c2.b.qsl.calls.filter((c) => c.type === "lend").length === 4, 3000); // 1 lúc mở + 3 lần thử lại
    await settle(300);
    assert.equal(c2.b.qsl.calls.filter((c) => c.type === "lend").length, 4, "thử lại có giới hạn");
  } finally {
    c2.b.close();
  }
});

test("review P3-7 / P3-8: Production không nhận tenant staging / 'api-…'; nút đầu đọc đổi chữ tạm ('Đang kết nối…') không mở thêm lượt bấm", async () => {
  const srv = makeServer();
  const b = createBrowser(srv.handle);
  try {
    for (const t of ["circa-stg", "api-circa"]) {
      const r = await b.sendFromPopup({ type: "config:set", patch: { mode: "PRD", url: "", nwTenant: t } });
      assert.equal(r.ok, false, t);
      assert.match(r.error, /không dùng được cho Production/);
    }
  } finally {
    b.close();
  }
  const ctx = await setup({ qsl: { mode: "ok" } });
  const { nw } = ctx;
  try {
    nw.post(NW_AUTH());
    await until(() => viewTitle(nw) === "Sẵn sàng nhận hàng");
    let clicks = 0;
    const btn = { textContent: "Kết nối đầu đọc", disabled: false, click: () => (clicks += 1) };
    nw.dom.buttons = [{ textContent: "Dừng", disabled: false, click: () => assert.fail("không bấm nút Dừng khác") }, btn];
    await until(() => clicks === 1, 2000);
    btn.textContent = "Đang kết nối…"; // Nextwaves đang thử
    await settle(80);
    btn.textContent = "Kết nối đầu đọc"; // thất bại, về lại
    await until(() => clicks === 3, 3000);
    await settle(300);
    assert.equal(clicks, 3, "tổng vẫn tối đa 3 lần cho một lượt mất kết nối");
  } finally {
    ctx.b.close();
  }
});

test("khớp cuối (plan C3): đọc lại CẢ phiếu sau khi điền thấy mã lạ trên một lô → KHÔNG tải lại, khung vàng 'chưa khớp hoàn toàn', nhật ký final_verify_failed", async () => {
  const ctx = await setup({ server: { tamperFinal: (gr) => gr.items[0].details[0].thuocsi_qr_codes.push("MA_LA_123") } });
  const { b, srv, pos } = ctx;
  try {
    await receive(ctx);
    await sessionState(b, "applied", 8000);
    const v = await until(() => pos.view && /chưa khớp hoàn toàn/.test(pos.view.title || "") && pos.view);
    assert.equal(v.tone, "warn");
    await until(() => session(b).log.some((l) => l.type === "final_verify_failed"), 2000);
    await settle(100);
    assert.equal(pos.reloads, 0, "không tải lại (giữ thông báo)");
    assert.equal(srv.st.puts.length, 5);
    // F5 / vẽ lại bất kỳ: khung "đã điền" đọc phiếu thật vẫn phải báo mã lạ (vàng), không chuyển sang xanh.
    pos.reload();
    await until(() => pos.loads >= 2);
    pos.post(POS_AUTH);
    const v2 = await until(() => pos.view && /chưa khớp hoàn toàn|kiểm danh sách rồi bấm HOÀN THÀNH/.test(pos.view.title || "") && pos.view);
    assert.match(v2.title, /chưa khớp hoàn toàn/);
    assert.equal(v2.tone, "warn");
    assert.ok(v2.lines.some((l) => /1 mã không thuộc lượt nhận Nextwaves: MA_LA_123/.test(l)), v2.lines.join(" | "));
  } finally {
    b.close();
  }
});

test("audit F4 (v0.4.0): dược sĩ đóng tab Nextwaves khi phiên còn ở bước nhận → phiên bỏ nwTabId, nhật ký nw_tab_closed, trả đầu đọc", async () => {
  const ctx = await setup({ qsl: { mode: "ok" } });
  const { b, nw } = ctx;
  try {
    const lease = session(b).reader.leaseId;
    nw.post(NW_AUTH());
    await until(() => viewTitle(nw) === "Sẵn sàng nhận hàng");
    b.closeTab(nw);
    await until(() => session(b).nwTabId === null && session(b).log.some((l) => l.type === "nw_tab_closed"), 2000);
    await until(() => b.qsl.calls.some((c) => c.type === "return" && c.leaseId === lease), 3000);
    assert.equal(session(b).state, "nw_ready", "phiên vẫn chờ nhận (mở lại Nextwaves từ POS được)");
  } finally {
    b.close();
  }
});

test("review P3-6: phiếu HOÀN THÀNH trên POS khi phiên còn ở bước Nextwaves → đóng tab Nextwaves rồi trả đầu đọc; mở lại Nextwaves cho phiên đã xong bị từ chối", async () => {
  const ctx = await setup({ qsl: { mode: "ok" } });
  const { b, pos, nw } = ctx;
  try {
    const lease = session(b).reader.leaseId;
    pos.post({ mark: "cgn/pos-hook", type: "gr-status", payload: { envId: "STG", grId: GR_ID, status: "COMPLETED", httpStatus: 200 } });
    await sessionState(b, "done");
    await until(() => nw.closed, 2000);
    await until(() => b.qsl.calls.some((c) => c.type === "return" && c.leaseId === lease), 3000);
    const r = await b.sendFromTab(pos, { type: "session:reopenNw", key: KEY });
    assert.equal(r.ok, false);
    assert.match(r.error, /không còn ở bước nhận trên Nextwaves/);
  } finally {
    b.close();
  }
});
