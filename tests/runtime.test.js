"use strict";
// Chạy thật background + content script (POS, Nextwaves) trên trình duyệt giả, dữ liệu mẫu GR03878 ↔ PO28237814.
// Phần "sau khi nhận" của Nextwaves là mẫu THẬT lượt nhận 25/10 23:46; tra QR POS còn 10/12 dựng lại — xem tests/helpers.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { createBrowser, until, settle, closeAll } = require("./browser-sim.js");

// Test bị cắt vì quá giờ (--test-timeout) vẫn đóng trình duyệt giả của nó → file test luôn kết thúc được.
test.afterEach(() => closeAll());

const POS = "https://pos.stg.circa-v2.buymed.tech";
const NW = "https://circa-stg.nextwaves.app";
const NWAPI = "https://api-circa-stg.nextwaves.app";
const GR_ID = "2de6c0ec-2ea8-4038-8616-659fa3f5820a";
const STORE = H.STORE_2222;
const OTHER_STORE = "00000000-0000-0000-0000-00000000abcd";
const SHIP = "34e67fb9-ea76-4606-ab65-4c515934c0e1";
const KEY = `STG:${GR_ID}`;
const posAuth = (headers) => ({ mark: "cgn/pos-hook", type: "auth", payload: { envId: "STG", headers } });
const POS_AUTH = posAuth({ authorization: "Bearer pos-test", "x-client-id": "1", "x-store-id": STORE, "grpc-timeout": "30S" });
const NW_AUTH = { mark: "cgn/nw-hook", type: "auth", payload: { envId: "STG", headers: { authorization: "Bearer nw-test" } } };
const scan = (httpStatus, response) => ({ mark: "cgn/nw-hook", type: "receive-scan", payload: { envId: "STG", shipmentId: SHIP, httpStatus, response: response || {}, sentEpcs: 12 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const APP_VERSION = require("../src/manifest.json").version;

function makeServer(opts = {}) {
  const it = H.sample("nw-stg-intertenant-PO28237814-SOBD1593858.json");
  const st = { gr: H.clone(H.sample("gr-stg-GR03878-20261024.json")), nwReceived: false, puts: [], log: [], putFailures: opts.putFailures || 0 };
  if (opts.grNoStore) delete st.gr.data.pos_info;
  const qr = H.qrByUidPO28237814();
  const itemOf = (o) => ({ id: o.id, purchaseOrderId: o.purchaseOrderId, purchaseOrderNumber: o.purchaseOrderNumber, purchaseOrderStatus: o.purchaseOrderStatus, counterparty: o.counterparty, status: o.status, warehouse: o.warehouse, openShipmentCount: 1 });
  const searchItem = itemOf(it);
  const twin = opts.nwTwin ? Object.assign(H.clone(it), { id: "00000000-0000-4000-8000-0000000000a1", purchaseOrderId: "00000000-0000-4000-8000-0000000000b1", purchaseOrderNumber: "PO99999999", refId: "SOBD1593858-999" }) : null;
  const twinReceiving = () => {
    const r = H.receivingPO28237814();
    Object.assign(r.order, { id: twin.id, purchaseOrderId: twin.purchaseOrderId, purchaseOrderNumber: twin.purchaseOrderNumber });
    r.shipments[0].lines = r.shipments[0].lines.slice(1);
    return r;
  };
  async function handle(req) {
    st.log.push(req);
    const u = new URL(req.url);
    if (u.origin === POS) {
      if (u.pathname === "/thuocsi-warehouse/qrcode") {
        const code = u.searchParams.get("code");
        if (opts.qrHold) await opts.qrHold; // treo tra QR tới khi test cho chạy tiếp
        if (opts.qrDown && opts.qrDown.has(code)) return { status: 503, json: { message: "tạm lỗi" } };
        const q = qr[code];
        return { status: 200, json: { status: "OK", data: q ? [{ uniqueId: code, shortId: code, productId: q.productId, lot: q.lot, expiredDate: q.expiredDate, status: "NORMAL" }] : [] } };
      }
      if (!u.pathname.startsWith("/backend/v1/")) return { status: 404, json: {} };
      if (req.headers.authorization !== "Bearer pos-test") return { status: 401, json: { message: "unauthorized" } };
      let m = /^\/backend\/v1\/order\/goods-receipt\/([0-9a-f-]{36})$/.exec(u.pathname);
      if (m && req.method === "GET" && opts.grHolds && opts.grHolds[m[1]]) await opts.grHolds[m[1]]; // treo tới khi test cho chạy tiếp
      if (m && req.method === "GET") return m[1] === st.gr.data.id ? { status: 200, json: H.clone(st.gr) } : { status: 404, json: {} };
      m = /^\/backend\/v1\/pos\/([0-9a-f-]{36})\/po\/([0-9a-f-]{36})$/.exec(u.pathname);
      if (m && req.method === "GET") {
        const po = H.sample("po-stg-PO00006750-SOBD1593858.json");
        if (opts.poNoStore) delete po.data.pos_id;
        if (opts.poOtherStore) po.data.pos_id = OTHER_STORE;
        return { status: 200, json: po };
      }
      if (u.pathname === "/backend/v1/order/goods-receipt/search" && req.method === "GET") {
        if (opts.searchHold && decodeURIComponent(u.search).includes(`so_thuocsi=${opts.searchHold.so},`)) await opts.searchHold.p; // treo tìm theo SO đó
        const r = H.sample("pos-stg-gr-search-so-1593858.json");
        // Tìm theo SO khác SO mẫu (1593858) → không có phiếu nhận (đơn của SO khác không có trong dữ liệu mẫu).
        if (opts.otherSoEmpty && !decodeURIComponent(u.search).includes("so_thuocsi=1593858,")) Object.assign(r.data, { goods_receipts: [], total: 0 });
        if (opts.extraGr) {
          r.data.goods_receipts.push(Object.assign(H.clone(r.data.goods_receipts[0]), { id: "11111111-2222-4333-8444-555555555555", code: "GR03999", purchase_order_code: "PO00006999" }));
          r.data.total = 2;
        }
        if (opts.soSearch) opts.soSearch(r.data);
        return { status: 200, json: r };
      }
      m = /^\/backend\/v1\/order\/goods-receipt\/([0-9a-f-]{36})\/item\/([0-9a-f-]{36})\/detail\/([0-9a-f-]{36})$/.exec(u.pathname);
      if (m && req.method === "PUT") {
        st.puts.push(req);
        const delay = opts.putDelays && opts.putDelays[st.puts.length];
        if (delay) await sleep(delay); // server vẫn xử lý dù client đã bỏ chờ
        const hold = opts.putHolds && opts.putHolds[st.puts.length];
        if (hold) await hold; // treo tới khi test cho chạy tiếp
        if (st.putFailures > 0) {
          st.putFailures -= 1;
          return { status: 500, json: { message: "lỗi giả" } };
        }
        const item = st.gr.data.items.find((i) => i.id === m[2]);
        const d = item && item.details.find((x) => x.id === m[3]);
        if (!d) return { status: 404, json: {} };
        d.received_quantity = req.body.detail.received_quantity;
        d.thuocsi_qr_codes = (d.thuocsi_qr_codes || []).concat(req.body.detail.thuocsi_qr_codes);
        st.gr.data.status = "RECEIVING";
        return { status: 200, json: { success: true } };
      }
      return { status: 404, json: { message: "no route" } };
    }
    if (u.origin === NWAPI) {
      if (u.pathname.includes("/integrations/")) throw new Error("extension gọi API tích hợp Nextwaves");
      if (req.method !== "GET") throw new Error("extension gọi API ghi Nextwaves");
      if (req.headers.authorization !== "Bearer nw-test") return { status: 401, json: { message: "unauthorized" } };
      if (u.pathname === "/api/v1/inter-tenant-orders/receiving") {
        const items = u.searchParams.get("q") === "SOBD1593858" ? (twin ? [itemOf(twin), searchItem] : [searchItem]) : [];
        return { status: 200, json: { items, total: items.length } };
      }
      if (twin && u.pathname === `/api/v1/inter-tenant-orders/purchase-orders/${twin.purchaseOrderId}`) return { status: 200, json: H.clone(twin) };
      if (twin && u.pathname === `/api/v1/inter-tenant-orders/purchase-orders/${twin.purchaseOrderId}/receiving`) return { status: 200, json: twinReceiving() };
      if (u.pathname === `/api/v1/inter-tenant-orders/purchase-orders/${it.purchaseOrderId}`) return { status: 200, json: H.clone(it) };
      if (u.pathname === `/api/v1/inter-tenant-orders/purchase-orders/${it.purchaseOrderId}/receiving`) return { status: 200, json: H.receivingPO28237814() };
      if (u.pathname === `/api/v1/purchase-orders/${it.purchaseOrderId}`) {
        if (!st.nwReceived) {
          const before = H.sample("nw-stg-po-PO28237814-detail.json");
          if (opts.receiptBeforeScan) before.receipts = H.poDetailPO28237814Received().receipts.map((r) => Object.assign({}, r, { items: [] }));
          return { status: 200, json: before };
        }
        const po = H.poDetailPO28237814Received();
        if (opts.dropReceivedEpc) for (const x of po.items) x.receivedUnits = x.receivedUnits.filter((r) => r.epc !== opts.dropReceivedEpc);
        return { status: 200, json: po };
      }
      if (u.pathname === `/api/v1/inter-tenant-shipments/${SHIP}`) return { status: 200, json: st.nwReceived ? H.shipmentPO28237814Received() : H.sample("nw-stg-shipment-34e67fb9-PO28237814.json") };
      return { status: 404, json: { message: "no route" } };
    }
    throw new Error("extension gọi host lạ: " + u.origin);
  }
  return { st, handle };
}

async function sessionState(b, state) {
  return until(() => {
    const s = b.session(KEY);
    return s && s.state === state && s;
  });
}

const grant = (b, grCode = "GR03878", envId = "STG") => b.sendFromPopup({ type: "grant:create", envId, grCode });
const viewTitle = (t) => (t.view ? t.view.title : null);
const fillButton = (t) => t.view && t.view.buttons && t.view.buttons.find((x) => x.label.startsWith("Điền vào phiếu GR03878 · kế hoạch #"));
const codesOnGr = (srv) => srv.st.gr.data.items.flatMap((i) => i.details).flatMap((d) => d.thuocsi_qr_codes || []);
const claimMsg = (token, extra) => Object.assign({ type: "session:claimApply", key: KEY, token, grCode: "GR03878", planHash: "ABCDEF12" }, extra || {});
// v0.2: mở phiếu không tự tạo phiên — dược sĩ bấm "Nhận hàng bằng RFID".
const startBtn = (t) => t.view && t.view.buttons && t.view.buttons.find((x) => x.label === "Nhận hàng bằng RFID");

// Mở GR trên POS → bấm "Nhận hàng bằng RFID" → chờ tab Nextwaves → khớp đơn. Trả {b, srv, pos, nw}.
// Bước dựng hỏng thì tự đóng trình duyệt giả (không thì timer của nó giữ tiến trình test chạy mãi).
async function openToReady(opts = {}) {
  const srv = makeServer(opts.server);
  const b = createBrowser(srv.handle, { tuning: opts.tuning, bgTuning: opts.bgTuning });
  try {
    await b.setConfig(opts.config || { mode: "STG", url: "" });
    const pos = b.openTab(opts.posUrl || `${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos.post(POS_AUTH);
    (await until(() => startBtn(pos))).onClick();
    const nw = await until(() => b.tabs().find((t) => t.url.startsWith(NW)));
    nw.post(NW_AUTH);
    await sessionState(b, "nw_ready");
    await until(() => viewTitle(nw) === "Sẵn sàng nhận hàng");
    return { b, srv, pos, nw };
  } catch (err) {
    b.close();
    throw err;
  }
}

// … rồi Nextwaves nhận thành công (2xx) → phiên "received", POS hiện kế hoạch chỉ xem.
async function openToReceived(opts = {}) {
  const ctx = await openToReady(opts);
  try {
    ctx.srv.st.nwReceived = true;
    ctx.nw.post(scan(200));
    await sessionState(ctx.b, "received");
    return ctx;
  } catch (err) {
    ctx.b.close();
    throw err;
  }
}

test("E2E STG GR03878: GR → Nextwaves ?po=SOBD1593858 → khớp PO28237814 → nhận → kế hoạch chỉ xem → cấp phép 1 lần → điền 6 lô / 12 UID → HOÀN THÀNH", async () => {
  const { b, srv, pos, nw } = await openToReady();
  try {
    assert.equal(nw.url, `${NW}/vi/purchases/receive?po=SOBD1593858`);
    const s1 = b.session(KEY);
    assert.deepEqual([s1.deliveryCode, s1.nwPoNumber, s1.nwRefId, s1.posId], ["SOBD1593858-F", "PO28237814", "SOBD1593858-1056745", STORE]);
    assert.deepEqual(s1.shipmentIds, [SHIP]);
    assert.deepEqual([s1.writeLocks, s1.nwWriteLocks, s1.receiptIdsBefore], [[], [], []]);
    assert.deepEqual(s1.nwSearch, { total: 1, read: 1, candidates: 1, verified: 1 });
    assert.match(nw.view.lines.join("\n"), /Tìm theo SOBD1593858: total 1, đã đọc 1; ứng viên Buymed cùng kho 1; refId đúng SO 1\./);
    await until(() => pos.view && pos.view.title.startsWith("Đã khớp đơn Nextwaves"));

    // Dược sĩ bấm "Xác nhận nhận hàng" trên Nextwaves → 2xx.
    srv.st.nwReceived = true;
    const focusBefore = pos.focusCount;
    nw.post(scan(200));
    const s2 = await sessionState(b, "received");
    assert.equal(s2.nwResult.units.length, 12);
    assert.deepEqual(s2.nwResult.receiptIds, [H.RECEIPT_ID]);
    assert.equal(s2.scanOk.httpStatus, 200);
    assert.ok(pos.focusCount > focusBefore, "đưa dược sĩ về tab POS");

    // Chưa cấp phép: chỉ xem kế hoạch, 0 PUT.
    await until(() => viewTitle(pos) === "Chỉ xem kế hoạch — chưa có cấp phép điền");
    assert.equal(pos.view.table.rows.length, 6);
    await settle();
    assert.equal(srv.st.puts.length, 0);

    // Operator cấp phép 1 lần cho GR03878 (popup) → nút mang mã kế hoạch → bấm.
    await grant(b);
    const btn = await until(() => fillButton(pos));
    const hash = /#([0-9A-F]{8})/.exec(btn.label)[1];
    assert.equal(srv.st.puts.length, 0, "chưa bấm thì chưa ghi");
    btn.onClick();
    const s3 = await sessionState(b, "applied");
    assert.equal(s3.authorization.planHash, hash);
    assert.equal(s3.authorization.grCode, "GR03878");
    assert.equal(s3.lease, null);
    assert.deepEqual((await b.sendFromPopup({ type: "grant:list" })).data, [], "cấp phép đã tiêu");
    assert.equal(srv.st.puts.length, 6);
    for (const p of srv.st.puts) {
      assert.deepEqual(Object.keys(p.body.detail).sort(), ["lot_id", "received_quantity", "thuocsi_qr_codes"]);
      assert.equal(p.body.detail.received_quantity, 1);
      assert.equal(p.headers.authorization, "Bearer pos-test");
      assert.equal(p.headers["grpc-timeout"], "30S");
      assert.equal(p.headers["content-type"], "application/json");
    }
    assert.equal(codesOnGr(srv).length, 12);
    await until(() => pos.reloads >= 1 && pos.loads >= 2);
    pos.post(POS_AUTH); // trang POS tải lại → app gọi API → hook báo lại header
    await until(() => viewTitle(pos) === "GR03878: đã điền 12 UID từ Nextwaves");

    // Dược sĩ bấm HOÀN THÀNH trên POS.
    srv.st.gr.data.status = "COMPLETED";
    pos.post({ mark: "cgn/pos-hook", type: "gr-status", payload: { envId: "STG", grId: GR_ID, status: "COMPLETED", httpStatus: 200 } });
    await sessionState(b, "done");
    await until(() => viewTitle(pos) === "GR03878: đã HOÀN THÀNH");

    // Bất biến.
    const nwCalls = srv.st.log.filter((r) => r.url.startsWith(NWAPI));
    assert.ok(nwCalls.length > 0 && nwCalls.every((r) => r.method === "GET"));
    assert.ok(srv.st.log.every((r) => !r.url.includes("/integrations/")));
    const stgOrigins = new Set([POS, NWAPI]);
    assert.ok(srv.st.log.every((r) => stgOrigins.has(new URL(r.url).origin)), "chế độ STG chỉ gọi host staging");
    assert.ok(!JSON.stringify(b.store).includes("Bearer"), "không lưu token vào storage");
    assert.equal(srv.st.puts.length, 6, "không ghi thêm sau khi tải lại");
  } finally {
    b.close();
  }
});

test("v0.2 S6: tra QR một lần mỗi phiên + lượt nhận — 12 UID = 12 GET dù cấp phép / phiên đổi; lỗi không cache; 'Kiểm tra lại' tra lại hết", async () => {
  const qrGets = (srv) => srv.st.log.filter((r) => new URL(r.url).pathname === "/thuocsi-warehouse/qrcode").length;
  const { b, srv, pos } = await openToReceived();
  try {
    await until(() => viewTitle(pos) === "Chỉ xem kế hoạch — chưa có cấp phép điền");
    assert.equal(qrGets(srv), 12);
    await grant(b); // cấp phép của đúng phiếu → lập lại kế hoạch, QR lấy từ cache
    await until(() => fillButton(pos));
    await settle(100);
    const grGets = () => srv.st.log.filter((r) => r.method === "GET" && new URL(r.url).pathname === `/backend/v1/order/goods-receipt/${GR_ID}`).length;
    const g0 = grGets();
    await grant(b, "GR09999"); // cấp phép phiếu khác → không đánh giá lại (không đọc lại GR)
    await settle(150);
    assert.equal(grGets(), g0, "cấp phép phiếu khác không làm đọc lại phiếu");
    assert.equal(qrGets(srv), 12, "không tra lại khi cấp phép / phiên đổi");
  } finally {
    b.close();
  }
  // Một UID tra lỗi (503): kế hoạch chặn; lỗi không cache → lần lập lại chỉ tra UID đó; "Kiểm tra lại" tra lại cả 12.
  const down = new Set(["1792145819958AA1"]);
  const ctx = await openToReceived({ server: { qrDown: down } });
  try {
    const recheck = await until(() => ctx.pos.view && ctx.pos.view.buttons && ctx.pos.view.buttons.find((x) => x.label === "Kiểm tra lại"));
    await settle(150);
    // 12 lần đầu; có thể thêm 1 nếu phiên đổi ngay lúc vừa nhận (lập lại kế hoạch: UID OK lấy cache, chỉ UID lỗi tra lại).
    const n0 = qrGets(ctx.srv);
    assert.ok(n0 === 12 || n0 === 13, `n0=${n0}`);
    await grant(ctx.b); // đổi cấp phép của đúng phiếu → lập lại kế hoạch
    await until(() => qrGets(ctx.srv) === n0 + 1);
    await settle(100);
    assert.equal(qrGets(ctx.srv), n0 + 1, "chỉ tra lại UID lỗi");
    down.clear();
    recheck.onClick();
    await until(() => qrGets(ctx.srv) === n0 + 13);
    await until(() => fillButton(ctx.pos));
  } finally {
    ctx.b.close();
  }
});

test("T3 thật: lượt 2xx mang body receive-scan thật (25/10 23:46) → về POS, kế hoạch #60070071 như khung thật, 0 PUT khi chưa cấp phép", async () => {
  const { b, srv, pos, nw } = await openToReady();
  try {
    const [x] = H.sample("nw-stg-receive-scan-200-PO28237814-T3-20261025.json");
    srv.st.nwReceived = true;
    nw.post({ mark: "cgn/nw-hook", type: "receive-scan", payload: { envId: "STG", shipmentId: x.response.shipmentId, httpStatus: x.status, response: x.response, sentEpcs: x.request.epcs.length } });
    const s = await sessionState(b, "received");
    assert.deepEqual([s.scanOk.httpStatus, s.scanOk.sentEpcs, s.nwResult.units.length], [200, 12, 12]);
    assert.deepEqual(s.nwResult.receiptIds, [H.RECEIPT_ID]);
    await until(() => viewTitle(pos) === "Chỉ xem kế hoạch — chưa có cấp phép điền");
    assert.match(pos.view.lines.join("\n"), /Kế hoạch #60070071: điền 12 UID vào 6 lô\./);
    await settle();
    assert.equal(srv.st.puts.length, 0);
  } finally {
    b.close();
  }
});

// ---------- P1.3: không có quyền ghi lâu dài ----------

test("P1.3: cấu hình cũ writeMode=auto (v0.1.0) sau nâng cấp → không tự PUT; config không còn writeMode", async () => {
  const { b, srv, pos } = await openToReceived({ config: { mode: "STG", url: "", writeMode: "auto" } });
  try {
    await until(() => viewTitle(pos) === "Chỉ xem kế hoạch — chưa có cấp phép điền");
    await settle(150);
    assert.equal(srv.st.puts.length, 0);
    assert.deepEqual((await b.sendFromPopup({ type: "config:get" })).data, { mode: "STG", url: "" });
    await b.sendFromPopup({ type: "config:set", patch: { mode: "STG", writeMode: "auto" } });
    assert.equal(b.store.config.writeMode, undefined);
  } finally {
    b.close();
  }
});

test("P1.3: cấp phép cho phiếu khác / đã hết hạn → 0 PUT; content script không tự cấp phép được", async () => {
  const { b, srv, pos } = await openToReceived({ bgTuning: { grantTtlMs: 80 } });
  try {
    await grant(b, "GR03999");
    await settle(100);
    assert.equal(fillButton(pos), undefined);
    await grant(b); // GR03878, hết hạn sau 80 ms
    await until(() => fillButton(pos));
    await sleep(120);
    assert.deepEqual((await b.sendFromTab(pos, claimMsg("x"))).data, { ok: false, reason: "no_grant" });
    assert.equal(srv.st.puts.length, 0);
    const denied = await b.sendFromTab(pos, { type: "grant:create", envId: "STG", grCode: "GR03878" });
    assert.equal(denied.ok, false);
    assert.match(denied.error, /popup/);
  } finally {
    b.close();
  }
});

test("P1.3: production chỉ đọc — không cấp phép được, phiên PRD không giành được quyền ghi", async () => {
  const srv = makeServer();
  const b = createBrowser(srv.handle);
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const g = await grant(b, "GR03878", "PRD");
    assert.equal(g.ok, false);
    assert.match(g.error, /chỉ đọc/);
    // Phiên PRD tạo từ trang POS production (cửa hàng PRD đã map kho) ở trạng thái received → claim vẫn bị chặn.
    const prd = b.openTab(`https://pos.v2.circa.vn/danh-sach-phieu-nhan-hang/${GR_ID}`);
    const st = await b.sendFromTab(prd, { type: "session:start", envId: "PRD", grId: GR_ID, grCode: "GR03878", posId: "c476efb2-415c-429a-978e-d389b4b06607", soBase: "SOBD1", warehouseId: "eb5e2b4f-6f92-413b-90ef-6be1730b94c0" });
    assert.equal(st.ok, true, st.error);
    assert.equal(st.data.returnUrl, `https://pos.v2.circa.vn/danh-sach-phieu-nhan-hang/${GR_ID}`, "background tự dựng đích quay về");
    b.store.sessions[`PRD:${GR_ID}`].state = "received";
    const r = await b.sendFromTab(prd, claimMsg("x", { key: `PRD:${GR_ID}` }));
    assert.deepEqual(r.data, { ok: false, reason: "env_read_only" });
    assert.equal(srv.st.puts.length, 0);
  } finally {
    b.close();
  }
});

test("P1.3: PUT lỗi → dừng; cấp phép đã tiêu nên thử lại cần cấp phép MỚI, rồi điền tiếp đủ", async () => {
  const { b, srv, pos } = await openToReceived({ server: { putFailures: 1 } });
  try {
    await grant(b);
    (await until(() => fillButton(pos))).onClick();
    const s = await sessionState(b, "apply_stopped");
    assert.deepEqual([s.applyError.reason, s.applyError.status], ["put_failed", 500]);
    assert.equal(srv.st.puts.length, 1);
    // Khung "Chỉ xem kế hoạch" có thể vẽ trước khi phiên sang apply_stopped (cấp phép bị tiêu → refresh) → chờ đủ cả dòng dừng.
    await until(() => viewTitle(pos) === "Chỉ xem kế hoạch — chưa có cấp phép điền" && /Lần điền trước dừng: POS từ chối ghi \(HTTP 500\)/.test(pos.view.lines.join("\n")));
    await grant(b);
    (await until(() => fillButton(pos))).onClick();
    await sessionState(b, "applied");
    assert.equal(srv.st.puts.length, 7);
    assert.equal(codesOnGr(srv).length, 12);
  } finally {
    b.close();
  }
});

// ---------- P1.4: cửa hàng fail closed ở cả hai đường vào ----------

async function storeCase(name, { headers, server, posUrl, expectTitle }) {
  const srv = makeServer(server);
  const b = createBrowser(srv.handle);
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(posUrl || `${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos.post(posAuth(headers));
    await until(() => pos.view && pos.view.title === expectTitle);
    await settle(80);
    assert.equal(b.tabs().length, 1, `${name}: không mở Nextwaves`);
    assert.equal(b.session(KEY), null, `${name}: không có phiên`);
    assert.equal(srv.st.puts.length, 0);
    return srv;
  } finally {
    b.close();
  }
}

test("P1.4: thiếu / sai cửa hàng ở đường mở GR và đường /chi-tiet-so → dừng trước khi mở Nextwaves", async () => {
  const noStore = { authorization: "Bearer pos-test" };
  const other = { authorization: "Bearer pos-test", "x-store-id": OTHER_STORE };
  const ok = { authorization: "Bearer pos-test", "x-store-id": STORE };
  const so = `${POS}/chi-tiet-so/SOBD1593858`;
  const t1 = "Không xác định được cửa hàng đang đăng nhập";
  const notTest = "Staging: extension chỉ chạy cho cửa hàng thử";
  const srvA = await storeCase("GR thiếu x-store-id", { headers: noStore, expectTitle: t1 });
  assert.equal(srvA.st.log.length, 0, "không gọi API nào khi thiếu x-store-id");
  await storeCase("SO thiếu x-store-id", { headers: noStore, posUrl: so, expectTitle: t1 });
  await storeCase("GR cửa hàng khác", { headers: other, expectTitle: notTest });
  await storeCase("SO cửa hàng khác", { headers: other, posUrl: so, expectTitle: notTest });
  await storeCase("GR thiếu pos_info", { headers: ok, server: { grNoStore: true }, expectTitle: "Phiếu nhận thiếu thông tin cửa hàng (pos_info.id)" });
  await storeCase("PO thiếu pos_id", { headers: ok, server: { poNoStore: true }, expectTitle: "GR03878: không nối được tới SO thuocsi" });
  await storeCase("PO cửa hàng khác", { headers: ok, server: { poOtherStore: true }, expectTitle: "GR03878: không nối được tới SO thuocsi" });
  await storeCase("SO: PO cửa hàng khác", { headers: ok, server: { poOtherStore: true }, posUrl: so, expectTitle: "GR03878: không nối được tới SO thuocsi" });
});

// ---------- P1.5: lease ----------

test("P1.5: PUT treo quá giờ ở tab 1 → kết quả không rõ + hạ nhiệt; tab 2 chỉ giành được sau đó và mỗi lô vẫn đúng một PUT", async () => {
  const { b, srv, pos } = await openToReceived({
    server: { putDelays: { 1: 300 } },
    tuning: { httpTimeoutMs: 120, leaseRenewMs: 40 },
    bgTuning: { leaseMs: 1000, retryCooldownMs: 500 },
  });
  try {
    const pos2 = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos2.post(POS_AUTH);
    await grant(b);
    const btn1 = await until(() => fillButton(pos));
    await until(() => fillButton(pos2));
    btn1.onClick();
    // Tab 1 giữ lease: tab 2 không giành được.
    await until(() => b.session(KEY).state === "applying");
    await grant(b);
    assert.deepEqual((await b.sendFromTab(pos2, claimMsg("tab2"))).data, { ok: false, reason: "lease_held" });
    // Client tab 1 hết giờ ở PUT 1 (server vẫn xử lý lúc 300 ms) → apply_stopped "unknown" + hạ nhiệt.
    const s = await sessionState(b, "apply_stopped");
    assert.equal(s.applyError.reason, "unknown");
    assert.ok(s.retryNotBefore > Date.now());
    assert.deepEqual((await b.sendFromTab(pos2, claimMsg("tab2"))).data, { ok: false, reason: "cooldown" });
    assert.equal(srv.st.puts.length, 1);
    // Hết hạ nhiệt (PUT 1 đã được server xử lý) → tab 2 lập kế hoạch mới từ phiếu đọc lại → điền các lô còn lại.
    await sleep(550);
    pos2.reload();
    pos2.post(POS_AUTH);
    const btn2 = await until(() => fillButton(pos2));
    assert.ok(!btn2.label.includes("(12 UID)"), "kế hoạch mới không gồm lô đã được server ghi");
    btn2.onClick();
    await sessionState(b, "applied");
    assert.equal(srv.st.puts.length, 6, "mỗi lô đúng một PUT");
    const perDetail = new Map();
    for (const p of srv.st.puts) perDetail.set(p.url, (perDetail.get(p.url) || 0) + 1);
    assert.ok([...perDetail.values()].every((n) => n === 1));
    const codes = codesOnGr(srv);
    assert.deepEqual([codes.length, new Set(codes).size], [12, 12]);
  } finally {
    b.close();
  }
});

test("P1.5: tab mất lease giữa chừng (tab khác tiếp quản) → không gửi PUT kế tiếp, không ghi đè trạng thái phiên", async () => {
  // Cố ý vi phạm điều kiện lease > thời hạn PUT (lease 100 ms, PUT 2 treo tới khi test thả) để tab khác tiếp quản giữa chừng.
  let release;
  const gate = new Promise((r) => (release = r));
  const { b, srv, pos } = await openToReceived({ server: { putHolds: { 2: gate } }, tuning: { leaseRenewMs: 1000, httpTimeoutMs: 5000 }, bgTuning: { leaseMs: 100 } });
  try {
    await grant(b);
    (await until(() => fillButton(pos))).onClick();
    await until(() => srv.st.puts.length === 2); // PUT 2 đang treo
    await sleep(130); // lease tab 1 hết hạn
    await grant(b);
    assert.equal((await b.sendFromTab(pos, claimMsg("tab-khac"))).data.ok, true, "lease hết hạn → tab khác giành được");
    release(); // PUT 2 của tab 1 xong → tab 1 phải tự dừng trước PUT 3
    await until(() => b.session(KEY).log.some((l) => l.type === "apply_abort" && l.reason === "lease_lost"));
    await settle(100);
    assert.equal(srv.st.puts.length, 2, "không gửi PUT 3");
    assert.equal(b.session(KEY).state, "applying", "tab mất lease không đổi trạng thái phiên");
    assert.equal(b.session(KEY).applyToken, "tab-khac");
    assert.ok(b.session(KEY).log.some((l) => l.type === "apply_claimed" && l.takeover === true));
  } finally {
    b.close();
  }
});

// ---------- P3: khoá ghi khi chưa chứng minh được đúng lần giao ----------

test("P3: SO có 2 phiếu nhận ở cửa hàng → phiên khoá ghi; có cấp phép vẫn chỉ xem, claim bị từ chối, content không gỡ được khoá", async () => {
  const { b, srv, pos } = await openToReceived({ server: { extraGr: true } });
  try {
    assert.deepEqual(b.session(KEY).writeLocks, ["so_many_gr"]);
    await grant(b);
    await until(() => viewTitle(pos) === "Chỉ xem kế hoạch — chưa được điền phiếu");
    assert.match(pos.view.lines.join("\n"), /SO có nhiều phiếu nhận/);
    assert.deepEqual((await b.sendFromTab(pos, claimMsg("x"))).data, { ok: false, reason: "so_many_gr" });
    await b.sendFromTab(pos, { type: "session:update", key: KEY, patch: { writeLocks: [] } });
    assert.deepEqual(b.session(KEY).writeLocks, ["so_many_gr"]);
    await settle();
    assert.equal(srv.st.puts.length, 0);
  } finally {
    b.close();
  }
});

// ---------- P2.1: bằng chứng "đã nhận" ----------

test("P2.1: tải lại trang Nextwaves sau khi đơn đã nhận nhưng phiên chưa thấy lượt 2xx → chỉ hiển thị, không về POS", async () => {
  const { b, srv, pos, nw } = await openToReady();
  try {
    srv.st.nwReceived = true; // nhận ở nơi khác / trước khi extension thấy lượt xác nhận
    const focusBefore = pos.focusCount;
    nw.reload();
    nw.post(NW_AUTH);
    await until(() => viewTitle(nw) === "Nextwaves đang có 12 UID đã nhận");
    await settle();
    assert.equal(b.session(KEY).state, "nw_ready");
    assert.equal(pos.focusCount, focusBefore);
    const r = await b.sendFromTab(nw, { type: "session:received", key: KEY, payload: { units: [] } });
    assert.equal(r.ok, false, "background cũng từ chối khi chưa có lượt 2xx");
  } finally {
    b.close();
  }
});

test("P2.1: lượt 2xx nhưng không có biên nhận mới so với lúc khớp đơn → không về POS", async () => {
  const { b, srv, nw, pos } = await openToReady({ server: { receiptBeforeScan: true } });
  try {
    assert.deepEqual(b.session(KEY).receiptIdsBefore, [H.RECEIPT_ID]);
    const focusBefore = pos.focusCount;
    srv.st.nwReceived = true;
    nw.post(scan(200));
    await until(() => viewTitle(nw) === "Kết quả nhận chưa đủ bằng chứng / không khớp dữ liệu đơn");
    assert.match(nw.view.lines.join("\n"), /no_new_receipt/);
    assert.equal(b.session(KEY).state, "nw_ready");
    assert.equal(pos.focusCount, focusBefore);
  } finally {
    b.close();
  }
});

// ---------- các ca giữ từ v0.1.0 ----------

test("Nextwaves trả 400 tagged_unit_unsupported (K1): báo lỗi trên tab Nextwaves, không về POS, không ghi", async () => {
  const { b, srv, pos, nw } = await openToReady();
  try {
    const resp = H.sample("nw-stg-receive-scan-400-PO28237814.json")[0].response;
    const focusBefore = pos.focusCount;
    nw.post(scan(400, resp));
    await until(() => viewTitle(nw) === "Nextwaves CHƯA nhận (HTTP 400)");
    assert.match(nw.view.lines.join("\n"), /tagged_unit_unsupported/);
    await settle();
    assert.equal(b.session(KEY).state, "nw_ready");
    assert.equal(b.session(KEY).scanOk, undefined);
    assert.equal(pos.focusCount, focusBefore);
    assert.equal(srv.st.puts.length, 0);
    assert.ok(b.session(KEY).log.some((l) => l.type === "receive_scan" && l.httpStatus === 400 && l.reason === "tagged_unit_unsupported"));
  } finally {
    b.close();
  }
});

test("Nhận thiếu 1 UID (keep_open): giữ ở Nextwaves, báo 11/12, không về POS", async () => {
  const drop = H.sample("nw-stg-shipment-34e67fb9-PO28237814.json").lines[0].epcs[0];
  const { b, srv, nw } = await openToReady({ server: { dropReceivedEpc: drop } });
  try {
    srv.st.nwReceived = true;
    nw.post(scan(200));
    await until(() => viewTitle(nw) === "Nextwaves mới nhận 11/12 UID");
    await settle();
    assert.equal(b.session(KEY).state, "nw_ready");
    assert.equal(srv.st.puts.length, 0);
  } finally {
    b.close();
  }
});

test("Đường /chi-tiet-so/SOBD1593858: tìm GR theo SO + cửa hàng → bấm nút → cùng luồng; đích quay về là trang phiếu (background tự dựng)", async () => {
  const { b, srv, pos } = await openToReady({ posUrl: `${POS}/chi-tiet-so/SOBD1593858` });
  try {
    assert.equal(b.session(KEY).returnUrl, `${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    const search = srv.st.log.find((r) => r.url.includes("/goods-receipt/search"));
    assert.match(decodeURIComponent(search.url), /so_thuocsi=1593858,pos_id=64a8663b-0c9e-49c6-9626-0a4c7c4bd53d/);
    await until(() => pos.view && pos.view.title.startsWith("Đã khớp đơn Nextwaves"));
  } finally {
    b.close();
  }
});

test("Chế độ STG trên trang POS production → không làm gì, không gọi host nào", async () => {
  const srv = makeServer();
  const b = createBrowser(srv.handle);
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(`https://pos.v2.circa.vn/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos.post({ mark: "cgn/pos-hook", type: "auth", payload: { envId: "PRD", headers: { authorization: "Bearer pos-test", "x-store-id": STORE } } });
    await settle(150);
    assert.equal(pos.view, null);
    assert.equal(srv.st.log.length, 0);
    assert.equal(b.tabs().length, 1);
  } finally {
    b.close();
  }
});

test("Chưa chọn môi trường / môi trường PRD → không làm gì trên POS staging", async () => {
  for (const cfg of [{ mode: "", url: "" }, { mode: "PRD", url: "" }]) {
    const srv = makeServer();
    const b = createBrowser(srv.handle);
    try {
      await b.setConfig(cfg);
      const pos = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
      pos.post(POS_AUTH);
      await settle(150);
      assert.equal(pos.view, null);
      assert.equal(srv.st.log.length, 0);
      assert.equal(b.tabs().length, 1);
    } finally {
      b.close();
    }
  }
});

test("Huỷ phiên trên POS → tải lại trang không tự mở Nextwaves; bấm 'Nhận hàng bằng RFID' → mở lại", async () => {
  const { b, pos } = await openToReady();
  try {
    const nwTabs = () => b.tabs().filter((t) => t.url.startsWith(NW)).length;
    const before = nwTabs();
    const cancel = await until(() => pos.view && pos.view.buttons && pos.view.buttons.find((x) => x.label === "Huỷ phiên"));
    await cancel.onClick();
    await until(() => b.session(KEY) === null);
    pos.reload();
    pos.post(POS_AUTH);
    const start = await until(() => startBtn(pos));
    await settle();
    assert.equal(nwTabs(), before, "không tự mở thêm tab");
    assert.equal(b.session(KEY), null);
    await start.onClick();
    await sessionState(b, "waiting_nw");
    assert.equal(nwTabs(), before + 1);
  } finally {
    b.close();
  }
});

test("Hai tab POS cùng GR03878, một cấp phép: bấm ở cả hai tab → chỉ một tab ghi, không nhân đôi mã", async () => {
  const { b, srv, pos } = await openToReceived();
  try {
    const pos2 = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos2.post(POS_AUTH);
    await grant(b);
    const [b1, b2] = await until(() => {
      const x = fillButton(pos);
      const y = fillButton(pos2);
      return x && y && [x, y];
    });
    b1.onClick();
    b2.onClick();
    await sessionState(b, "applied");
    await settle(150);
    assert.equal(srv.st.puts.length, 6);
    const all = codesOnGr(srv);
    assert.deepEqual([all.length, new Set(all).size], [12, 12]);
    assert.equal(b.session(KEY).log.filter((l) => l.type === "apply_claimed").length, 1);
  } finally {
    b.close();
  }
});

test("Lượt 'Xác nhận nhận hàng' của phiếu gửi khác → bỏ qua, không về POS", async () => {
  const { b, srv, pos, nw } = await openToReady();
  try {
    srv.st.nwReceived = true;
    const focusBefore = pos.focusCount;
    nw.post({ mark: "cgn/nw-hook", type: "receive-scan", payload: { envId: "STG", shipmentId: "00000000-0000-0000-0000-000000000099", httpStatus: 200, response: {}, sentEpcs: 3 } });
    // Chờ theo hành vi (nhật ký), không theo tiêu đề khung: lần đọc lại đang chạy có thể vẽ đè khung "đang có N UID đã nhận".
    await until(() => b.session(KEY).log.some((l) => l.type === "receive_scan_other_shipment"));
    await settle();
    assert.equal(b.session(KEY).state, "nw_ready");
    assert.equal(b.session(KEY).scanOk, undefined);
    assert.equal(pos.focusCount, focusBefore);
    assert.equal(srv.st.puts.length, 0);
  } finally {
    b.close();
  }
});

test("background: giành quyền ghi — chỉ từ trang POS; đúng một lần cho một cấp phép; chỉ từ received / apply_stopped; chỉ chủ lease gia hạn / kết thúc", async () => {
  const { b, srv, pos, nw } = await openToReady();
  try {
    const claim = (token, extra) => b.sendFromTab(pos, claimMsg(token, extra));
    await grant(b);
    for (const from of [() => b.sendFromPopup(claimMsg("p")), () => b.sendFromTab(nw, claimMsg("n"))]) {
      const r = await from();
      assert.equal(r.ok, false);
      assert.match(r.error, /nguồn gửi không hợp lệ/);
    }
    assert.deepEqual((await claim("a")).data, { ok: false, reason: "state_nw_ready" });
    srv.st.nwReceived = true;
    nw.post(scan(200));
    await sessionState(b, "received");
    assert.deepEqual((await claim("a", { planHash: "" })).data, { ok: false, reason: "bad_request" });
    assert.deepEqual((await claim("a", { grCode: "GR00001" })).data, { ok: false, reason: "gr_mismatch" });
    const [r1, r2] = await Promise.all([claim("a"), claim("b")]);
    assert.deepEqual([r1.data.ok, r2.data], [true, { ok: false, reason: "lease_held" }]);
    assert.equal(b.session(KEY).applyToken, "a");
    assert.equal((await b.sendFromTab(pos, { type: "session:renewLease", key: KEY, token: "b" })).data, false);
    assert.equal((await b.sendFromTab(pos, { type: "session:renewLease", key: KEY, token: "a" })).data, true);
    assert.equal((await b.sendFromTab(nw, { type: "session:renewLease", key: KEY, token: "a" })).ok, false, "gia hạn từ trang Nextwaves bị từ chối");
    assert.equal((await b.sendFromTab(pos, { type: "session:finishApply", key: KEY, token: "b", ok: true })).data, false, "không phải chủ lease");
    assert.equal((await b.sendFromTab(pos, { type: "session:finishApply", key: KEY, token: "a", ok: false, error: { reason: "put_failed" } })).data, true);
    assert.equal(b.session(KEY).state, "apply_stopped");
    assert.deepEqual((await claim("b")).data, { ok: false, reason: "no_grant" });
    await grant(b);
    assert.equal((await claim("b")).data.ok, true);
  } finally {
    b.close();
  }
});

// ---------- P1.6: danh sách GR theo SO phải đọc đủ / rõ ở cả hai đường vào ----------

const TWIN_GR = "11111111-2222-4333-8444-555555555555";
const SO_VARIANTS = [
  ["total 2 / trang trả 1 dòng (GR thứ hai ở trang sau)", (d) => (d.total = 2), "so_gr_unknown"],
  ["page = 2", (d) => (d.page = 2), "so_gr_unknown"],
  ["thiếu limit", (d) => delete d.limit, "so_gr_unknown"],
  ["một dòng thiếu pos_info.id", (d) => { d.goods_receipts.push(Object.assign(JSON.parse(JSON.stringify(d.goods_receipts[0])), { id: TWIN_GR, code: "GR03999", pos_info: null })); d.total = 2; }, "so_gr_unknown"],
  ["hai GR đủ dữ liệu", (d) => { d.goods_receipts.push(Object.assign(JSON.parse(JSON.stringify(d.goods_receipts[0])), { id: TWIN_GR, code: "GR03999" })); d.total = 2; }, "so_many_gr"],
];

test("P1.6 đường mở GR: tìm GR theo SO chưa đủ / không rõ / nhiều GR → phiên khoá ghi; có cấp phép vẫn 0 PUT", async () => {
  for (const [name, mutate, lock] of SO_VARIANTS) {
    const { b, srv, pos } = await openToReceived({ server: { soSearch: mutate } });
    try {
      assert.deepEqual(b.session(KEY).writeLocks, [lock], name);
      await grant(b);
      await until(() => viewTitle(pos) === "Chỉ xem kế hoạch — chưa được điền phiếu");
      assert.deepEqual((await b.sendFromTab(pos, claimMsg("x"))).data, { ok: false, reason: lock }, name);
      await settle(50);
      assert.equal(srv.st.puts.length, 0, name);
    } finally {
      b.close();
    }
  }
});

test("P1.6 đường /chi-tiet-so: danh sách chưa đủ / không rõ → dừng, không mở Nextwaves; hai GR → chọn được nhưng phiên khoá ghi", async () => {
  for (const [name, mutate, lock] of SO_VARIANTS) {
    const srv = makeServer({ soSearch: mutate });
    const b = createBrowser(srv.handle);
    try {
      await b.setConfig({ mode: "STG", url: "" });
      const pos = b.openTab(`${POS}/chi-tiet-so/SOBD1593858`);
      pos.post(POS_AUTH);
      if (lock === "so_gr_unknown") {
        await until(() => viewTitle(pos) === "Không đọc đủ danh sách phiếu nhận của SO — extension không đi tiếp");
        await settle(80);
        assert.equal(b.tabs().length, 1, name);
        assert.equal(b.session(KEY), null, name);
      } else {
        const pick = await until(() => pos.view && pos.view.buttons && pos.view.buttons.find((x) => x.label.startsWith("GR03878")));
        assert.equal(pos.view.buttons.length, 2, name);
        pick.onClick();
        // v0.2: chọn phiếu chỉ hiện nút; chưa có phiên tới khi bấm "Nhận hàng bằng RFID".
        const start = await until(() => startBtn(pos));
        assert.equal(b.session(KEY), null, name);
        start.onClick();
        await sessionState(b, "waiting_nw");
        assert.deepEqual(b.session(KEY).writeLocks, ["so_many_gr"], name);
      }
      assert.equal(srv.st.puts.length, 0, name);
    } finally {
      b.close();
    }
  }
});

// ---------- P1.7: khoá ghi phía Nextwaves bất biến ----------

test("P1.7: Nextwaves có đơn cùng SO khác lần giao → khoá nw_many_orders; tab POS / Nextwaves không xoá được khoá, không đổi được đơn; claim bị từ chối, 0 PUT", async () => {
  const { b, srv, pos, nw } = await openToReady({ server: { nwTwin: true } });
  try {
    const s0 = b.session(KEY);
    assert.equal(s0.nwPoNumber, "PO28237814", "dấu vân tay vẫn chọn đúng đơn");
    assert.deepEqual(s0.nwWriteLocks, ["nw_many_orders"]);
    assert.deepEqual(s0.nwSearch, { total: 2, read: 2, candidates: 2, verified: 2 });
    const tamper = { nwWriteLocks: [], writeLocks: [], nwPoId: "00000000-0000-4000-8000-0000000000b1", nwPoNumber: "PO99999999", shipmentIds: ["x"], receiptIdsBefore: [], warehouseId: "kho-khac", scanOk: { httpStatus: 200 } };
    for (const t of [pos, nw]) await b.sendFromTab(t, { type: "session:update", key: KEY, patch: tamper });
    const match = { nwPoId: tamper.nwPoId, nwPoNumber: "PO99999999", nwOrderId: "00000000-0000-4000-8000-0000000000a1", nwRefId: "SOBD1593858-999", shipmentIds: ["x"], expected: { shipments: [] }, receiptIdsBefore: [], nwWriteLocks: [] };
    const again = await b.sendFromTab(nw, { type: "session:nwMatched", key: KEY, match });
    assert.equal(again.ok, false);
    assert.match(again.error, /đã khớp đơn/);
    assert.match((await b.sendFromTab(pos, { type: "session:nwMatched", key: KEY, match })).error, /nguồn gửi không hợp lệ/);
    assert.match((await b.sendFromPopup({ type: "session:nwMatched", key: KEY, match })).error, /nguồn gửi không hợp lệ/);
    const s1 = b.session(KEY);
    assert.deepEqual([s1.nwWriteLocks, s1.writeLocks, s1.nwPoId, s1.nwPoNumber, s1.shipmentIds, s1.warehouseId, s1.scanOk], [["nw_many_orders"], [], s0.nwPoId, "PO28237814", [SHIP], s0.warehouseId, undefined]);
    // Nhận thật xong, có cấp phép: vẫn chỉ xem, claim bị từ chối.
    srv.st.nwReceived = true;
    nw.post(scan(200));
    await sessionState(b, "received");
    await grant(b);
    await until(() => viewTitle(pos) === "Chỉ xem kế hoạch — chưa được điền phiếu");
    assert.match(pos.view.lines.join("\n"), /Nextwaves có nhiều đơn cùng SO/);
    for (const t of [pos, nw]) await b.sendFromTab(t, { type: "session:update", key: KEY, patch: { nwWriteLocks: [] } });
    assert.deepEqual((await b.sendFromTab(pos, claimMsg("x"))).data, { ok: false, reason: "nw_many_orders" });
    await settle(50);
    assert.equal(srv.st.puts.length, 0);
  } finally {
    b.close();
  }
});

test("P1.7: session:nwMatched — chỉ từ trang Nextwaves, chỉ khi phiên chờ, kiểm refId cùng SO và khoá hợp lệ, chỉ một lần", async () => {
  const srv = makeServer();
  const b = createBrowser(srv.handle);
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos.post(POS_AUTH);
    (await until(() => startBtn(pos))).onClick();
    const nw = await until(() => b.tabs().find((t) => t.url.startsWith(NW)));
    // Chưa gửi header Nextwaves → tab Nextwaves chưa tự khớp; phiên đang waiting_nw.
    await sessionState(b, "waiting_nw");
    const good = { nwPoId: "55bd221f-65de-4a4d-8a77-40c568a6f176", nwPoNumber: "PO28237814", nwOrderId: "f930f66d-679a-4ed8-9c8e-b48aea91a8be", nwRefId: "SOBD1593858-1056745", shipmentIds: [SHIP], expected: H.receivingPO28237814(), receiptIdsBefore: [], nwWriteLocks: [] };
    const send = (t, m) => b.sendFromTab(t, { type: "session:nwMatched", key: KEY, match: Object.assign({}, good, m || {}) });
    assert.match((await send(nw, { nwRefId: "SOBD9999999-1" })).error, /không hợp lệ/, "refId khác SO");
    assert.match((await send(nw, { nwWriteLocks: ["khoa-la"] })).error, /không hợp lệ/, "khoá lạ");
    assert.match((await send(nw, { shipmentIds: [] })).error, /không hợp lệ/, "thiếu phiếu gửi");
    assert.match((await send(pos)).error, /nguồn gửi không hợp lệ/);
    assert.equal(b.session(KEY).state, "waiting_nw");
    const ok = await send(nw, { nwWriteLocks: ["nw_many_orders", "nw_many_orders"] });
    assert.equal(ok.ok, true, ok.error);
    assert.deepEqual([ok.data.state, ok.data.nwWriteLocks], ["nw_ready", ["nw_many_orders"]]);
    assert.match((await send(nw)).error, /đã khớp đơn/, "chỉ một lần");
    // scanOk / received chỉ từ trang Nextwaves, phiếu gửi phải thuộc đơn đã khớp.
    assert.match((await b.sendFromTab(nw, { type: "session:scanOk", key: KEY, scan: { shipmentId: "00000000-0000-0000-0000-000000000099", httpStatus: 200 } })).error, /không thuộc đơn đã khớp/);
    assert.match((await b.sendFromTab(pos, { type: "session:scanOk", key: KEY, scan: { shipmentId: SHIP, httpStatus: 200 } })).error, /nguồn gửi không hợp lệ/);
    assert.match((await b.sendFromTab(nw, { type: "session:scanOk", key: KEY, scan: { shipmentId: SHIP, httpStatus: 400 } })).error, /không phải lượt 2xx/);
    assert.equal(b.session(KEY).scanOk, undefined);
    assert.match((await b.sendFromTab(pos, { type: "session:received", key: KEY, payload: { units: [] } })).error, /nguồn gửi không hợp lệ/);
    assert.equal(b.session(KEY).state, "nw_ready");
    // Tạo phiên chỉ từ trang POS của môi trường.
    const start = { type: "session:start", envId: "STG", grId: "99999999-0000-4000-8000-000000000000", grCode: "GR09999", posId: STORE, soBase: "SOBD1", warehouseId: H.STG_CTX.warehouseId, returnUrl: `${POS}/` };
    for (const r of [await b.sendFromPopup(start), await b.sendFromTab(nw, start)]) assert.match(r.error, /nguồn gửi không hợp lệ/);
    assert.equal(b.session("STG:99999999-0000-4000-8000-000000000000"), null);
    // session:update kèm state hợp lệ: chỉ state được ghi, các trường đi kèm bị bỏ.
    const before = b.session(KEY);
    await b.sendFromTab(nw, { type: "session:update", key: KEY, patch: { state: "done", nwWriteLocks: [], writeLocks: ["x"], nwPoId: "x", shipmentIds: ["x"], scanOk: { httpStatus: 200 } } });
    const after = b.session(KEY);
    assert.equal(after.state, "done");
    assert.deepEqual([after.nwWriteLocks, after.writeLocks, after.nwPoId, after.shipmentIds, after.scanOk], [before.nwWriteLocks, before.writeLocks, before.nwPoId, before.shipmentIds, undefined]);
  } finally {
    b.close();
  }
});

// ---------- P2.4: phiên / cấp phép của bản cũ khi nâng cấp giữ cùng extension ID ----------

// Biến phiên hiện hành thành "phiên bản cũ": không schema, khoá rỗng như bản trước P1.6 / P1.7; thêm cấp phép kiểu cũ.
function makeOutdated(b, key) {
  const s = b.store.sessions[key];
  delete s.schema;
  delete s.createdBy;
  s.writeLocks = [];
  s.nwWriteLocks = [];
  const now = Date.now();
  b.store.grants = { "STG:GR03878": { envId: "STG", grCode: "GR03878", createdAt: now, expiresAt: now + 3600000 } };
}

test("P2.4: phiên bản cũ (không schema, thiếu khoá) không được ghi / tìm lại / nhận lượt; mở lại phiếu → phiên mới kiểm lại khoá", async () => {
  let soIncomplete = false;
  const { b, srv, pos, nw } = await openToReceived({ server: { soSearch: (d) => { if (soIncomplete) d.total = 2; } } });
  try {
    await settle(50);
    assert.deepEqual(b.session(KEY).writeLocks, []);
    makeOutdated(b, KEY);
    soIncomplete = true; // bản mới kiểm lại sẽ thấy danh sách GR chưa đủ
    // Không ghi được, cấp phép kiểu cũ bị bỏ, không tìm lại được.
    assert.deepEqual((await b.sendFromTab(pos, claimMsg("x"))).data, { ok: false, reason: "session_outdated" });
    assert.equal((await b.sendFromPopup({ type: "grant:get", envId: "STG", grCode: "GR03878" })).data, null);
    assert.equal((await b.sendFromTab(pos, { type: "session:get", envId: "STG", grId: GR_ID })).data, null);
    assert.equal((await b.sendFromTab(nw, { type: "session:findByNw", envId: "STG", po: "SOBD1593858" })).data, null);
    assert.match((await b.sendFromTab(nw, { type: "session:received", key: KEY, payload: { units: [] } })).error, /bản cũ/);
    // Tải lại phiếu trên POS → phiên mới (schema hiện hành) thay phiên cũ, khoá tính lại theo P1.6.
    const tabsBefore = b.tabs().length;
    pos.reload();
    pos.post(POS_AUTH);
    (await until(() => startBtn(pos))).onClick(); // v0.2: phiên bản cũ không được tìm lại → cần bấm để tạo phiên mới
    const s2 = await until(() => {
      const s = b.session(KEY);
      return s && s.schema === 1 && s;
    });
    // Tab Nextwaves cũ (đã có header) có thể tự khớp đơn cho phiên mới ngay → waiting_nw hoặc nw_ready đều đúng.
    assert.ok(["waiting_nw", "nw_ready"].includes(s2.state), s2.state);
    assert.deepEqual(s2.writeLocks, ["so_gr_unknown"]);
    assert.equal(s2.createdBy, APP_VERSION);
    assert.ok(s2.log.some((l) => l.type === "replaced_outdated" && l.oldState === "received"));
    assert.equal(b.tabs().length, tabsBefore + 1, "mở lại màn quét Nextwaves cho phiên mới");
    await grant(b);
    await settle(50);
    assert.equal(srv.st.puts.length, 0);
  } finally {
    b.close();
  }
});

test("P2.4: trang Nextwaves không nhận phiên bản cũ (không tìm, không khớp đơn, không gọi API)", async () => {
  const { b, srv, nw } = await openToReady();
  try {
    await settle(50);
    makeOutdated(b, KEY);
    b.store.sessions[KEY].state = "waiting_nw";
    delete b.store.sessions[KEY].nwPoId;
    const calls = srv.st.log.length;
    nw.reload();
    nw.post(NW_AUTH);
    await settle(150);
    assert.equal(nw.view, null, "không có phiên → không hiện khung");
    assert.equal(srv.st.log.length, calls, "không gọi API Nextwaves");
    const match = { nwPoId: "55bd221f-65de-4a4d-8a77-40c568a6f176", nwPoNumber: "PO28237814", nwOrderId: "f930f66d-679a-4ed8-9c8e-b48aea91a8be", nwRefId: "SOBD1593858-1056745", shipmentIds: [SHIP], expected: H.receivingPO28237814(), receiptIdsBefore: [], nwWriteLocks: [] };
    assert.match((await b.sendFromTab(nw, { type: "session:nwMatched", key: KEY, match })).error, /bản cũ/);
    b.store.sessions[KEY].state = "nw_ready";
    b.store.sessions[KEY].shipmentIds = [SHIP];
    assert.match((await b.sendFromTab(nw, { type: "session:scanOk", key: KEY, scan: { shipmentId: SHIP, httpStatus: 200 } })).error, /bản cũ/);
    assert.equal(b.session(KEY).scanOk, undefined);
  } finally {
    b.close();
  }
});

test("P2.4: onInstalled (update, cùng extension ID) xoá phiên + cấp phép của bản cũ, giữ của bản hiện hành, ghi lastUpgrade", async () => {
  const { b } = await openToReady();
  try {
    await settle(50);
    await grant(b); // cấp phép hiện hành (có schema)
    const cur = JSON.parse(JSON.stringify(b.store.sessions[KEY]));
    const oldKey = "STG:99999999-0000-4000-8000-0000000000aa";
    b.store.sessions[oldKey] = Object.assign({}, cur, { key: oldKey, grId: "99999999-0000-4000-8000-0000000000aa", grCode: "GR09998", state: "received" });
    delete b.store.sessions[oldKey].schema;
    b.store.grants["STG:GR09998"] = { envId: "STG", grCode: "GR09998", createdAt: Date.now(), expiresAt: Date.now() + 3600000 };
    b.fireInstalled({ reason: "update", previousVersion: "0.1.2" });
    await until(() => b.store.lastUpgrade);
    assert.deepEqual(Object.keys(b.store.sessions), [KEY]);
    assert.deepEqual(Object.keys(b.store.grants), ["STG:GR03878"]);
    const u = b.store.lastUpgrade;
    assert.deepEqual([u.reason, u.from, u.to, u.removedSessions, u.removedGrants], ["update", "0.1.2", APP_VERSION, [{ key: oldKey, state: "received" }], 1]);
    // Lý do khác (vd. chrome_update) không đụng storage.
    delete b.store.lastUpgrade;
    b.fireInstalled({ reason: "chrome_update" });
    await settle(50);
    assert.equal(b.store.lastUpgrade, undefined);
  } finally {
    b.close();
  }
});

test("Không tạo phiên lặp: background không trả lại phiên vừa tạo → một lần tạo + mở Nextwaves, không gọi API lặp; chỉ còn nút để bấm lại", async () => {
  const srv = makeServer();
  // session:get luôn trả "không có phiên" (mô phỏng background / storage hỏng).
  const b = createBrowser(srv.handle, { interceptBg: (msg) => (msg.type === "session:get" ? { ok: true, data: null } : undefined) });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos.post(POS_AUTH);
    await until(() => startBtn(pos));
    await settle(100);
    assert.equal(b.tabs().filter((t) => t.url.startsWith(NW)).length, 0, "mở phiếu không tự mở Nextwaves");
    startBtn(pos).onClick();
    await until(() => b.tabs().some((t) => t.url.startsWith(NW)));
    await until(() => startBtn(pos)); // phiên không đọc lại được → chỉ hiện lại nút, không tự tạo
    await settle(200);
    const count = () => [srv.st.log.filter((r) => /\/backend\/v1\/pos\/.+\/po\//.test(new URL(r.url).pathname)).length, srv.st.log.filter((r) => r.url.includes("/goods-receipt/search")).length];
    const c1 = count();
    await settle(400);
    assert.deepEqual(count(), c1, "không gọi API lặp");
    assert.equal(c1[1], 1, "tìm GR theo SO đúng một lần (lượt bấm)");
    assert.equal(b.tabs().filter((t) => t.url.startsWith(NW)).length, 1, "chỉ mở Nextwaves một lần");
  } finally {
    b.close();
  }
});

// ---------- v0.2.4 (PM P2): khung trang phiếu nằm trong luồng trang trước #all-receipt ----------
const isFill = (v) => !!v && (v.buttons || []).some((x) => /^Điền vào phiếu/.test(x.label));
const grantCount = async (b) => (await b.sendFromPopup({ type: "grant:list" })).data.length;

test("P2: trang phiếu — mọi trạng thái (nút bắt đầu, đang kiểm, đã khớp Nextwaves, tra UID, kế hoạch chỉ xem, có cấp phép, đang điền, đã điền, HOÀN THÀNH) vẽ vào khung TRONG LUỒNG mang mã GR03878; không khung nổi", async () => {
  const { b, srv, pos } = await openToReceived();
  try {
    await until(() => viewTitle(pos) === "Chỉ xem kế hoạch — chưa có cấp phép điền");
    await grant(b);
    (await until(() => fillButton(pos))).onClick();
    await sessionState(b, "applied");
    await until(() => pos.reloads >= 1 && pos.loads >= 2);
    pos.post(POS_AUTH);
    await until(() => viewTitle(pos) === "GR03878: đã điền 12 UID từ Nextwaves");
    srv.st.gr.data.status = "COMPLETED";
    pos.post({ mark: "cgn/pos-hook", type: "gr-status", payload: { envId: "STG", grId: GR_ID, status: "COMPLETED", httpStatus: 200 } });
    await until(() => viewTitle(pos) === "GR03878: đã HOÀN THÀNH");
    assert.equal(pos.floatViews.length, 0, "trang phiếu không dùng khung nổi");
    const titles = pos.inlineViews.map((v) => v.title);
    for (const t of ["GR03878 · SOBD1593858-F", "Đang kiểm GR03878…", "Đã khớp đơn Nextwaves — chờ nhận hàng", "Đang tra 12 UID trên POS…", "Chỉ xem kế hoạch — chưa có cấp phép điền", "Đã có cấp phép điền GR03878 (1 lần)", "GR03878: đã điền 12 UID từ Nextwaves", "GR03878: đã HOÀN THÀNH"]) {
      assert.ok(titles.includes(t), `thiếu trạng thái "${t}" trong khung trong luồng`);
    }
    assert.ok(titles.some((t) => /^Đang điền 1\/6 · kế hoạch #[0-9A-F]{8}$/.test(t)), "đang điền");
    const untagged = pos.inlineViews.filter((v) => v.grCode !== "GR03878").map((v) => v.title);
    assert.deepEqual([...new Set(untagged)].filter((t) => t !== "Đang chờ POS tải dữ liệu…"), [], "view của phiếu mang mã phiếu (chỉ gắn cạnh bảng của đúng phiếu)");
    assert.equal(srv.st.puts.length, 6);
  } finally {
    b.close();
  }
});

test("P2: trang phiếu không có chỗ gắn khung → lỗi giao diện ở khung nổi CHỈ có 'Kiểm tra lại'; có cấp phép vẫn không có nút Điền, 0 PUT, cấp phép giữ, nhật ký phiên ghi chẩn đoán; chỗ gắn có lại → khung trong luồng + điền đủ", async () => {
  const { b, srv, pos } = await openToReceived();
  try {
    await until(() => viewTitle(pos) === "Chỉ xem kế hoạch — chưa có cấp phép điền");
    pos.setAnchor(false);
    await until(() => pos.viewKind === "float" && /^Giao diện phiếu nhận đã đổi/.test(viewTitle(pos)));
    await grant(b);
    await settle(150);
    assert.equal(pos.viewKind, "float");
    assert.match(viewTitle(pos), /^Giao diện phiếu nhận đã đổi — extension không điền phiếu này$/);
    assert.deepEqual(Array.from(pos.view.buttons, (x) => x.label), ["Kiểm tra lại"]);
    assert.ok(!pos.floatViews.some(isFill), "khung nổi không bao giờ có nút Điền");
    assert.equal(srv.st.puts.length, 0);
    assert.equal(await grantCount(b), 1, "cấp phép còn nguyên");
    assert.equal(b.session(KEY).state, "received");
    assert.ok(b.session(KEY).log.some((l) => l.type === "ui_anchor_missing" && l.reason === "missing"), "nhật ký phiên có chẩn đoán");
    // "Kiểm tra lại" khi trang vẫn thiếu chỗ gắn → vẫn lỗi giao diện, vẫn 0 PUT.
    pos.view.buttons[0].onClick();
    await settle(150);
    assert.match(viewTitle(pos), /^Giao diện phiếu nhận đã đổi/);
    assert.ok(!pos.floatViews.some(isFill));
    assert.equal(srv.st.puts.length, 0);
    // Trang vẽ xong vùng sản phẩm → khung về trong luồng, có nút Điền; điền đủ.
    pos.setAnchor(true);
    const btn = await until(() => pos.viewKind === "inline" && fillButton(pos));
    btn.onClick();
    await sessionState(b, "applied");
    assert.equal(srv.st.puts.length, 6);
    assert.equal(codesOnGr(srv).length, 12);
  } finally {
    b.close();
  }
});

test("P2: bấm Điền khi khung vừa mất chỗ gắn, hoặc khi URL đã sang trang khác → không giành quyền, không tiêu cấp phép, 0 PUT", async () => {
  const { b, srv, pos } = await openToReceived();
  try {
    await grant(b);
    const btn = await until(() => fillButton(pos));
    pos.setAnchor(false);
    btn.onClick();
    await settle(150);
    assert.equal(srv.st.puts.length, 0);
    assert.equal(await grantCount(b), 1);
    assert.equal(b.session(KEY).state, "received");
    assert.ok(!b.session(KEY).lease, "không giành quyền ghi");

    pos.setAnchor(true);
    const btn2 = await until(() => pos.viewKind === "inline" && fillButton(pos));
    pos.url = `${POS}/ban-hang`; // SPA đổi URL, hook chưa báo route
    btn2.onClick();
    await settle(150);
    assert.equal(srv.st.puts.length, 0);
    assert.equal(await grantCount(b), 1);
    assert.equal(b.session(KEY).state, "received");
  } finally {
    b.close();
  }
});

test("P2: đổi route trong SPA (trang phiếu → danh sách) → gỡ khung phiếu cũ ngay; quay lại phiếu → khung trong luồng + nút Điền (cấp phép chưa tiêu)", async () => {
  const { b, srv, pos } = await openToReceived();
  try {
    await grant(b);
    await until(() => fillButton(pos));
    const LIST = `${POS}/danh-sach-phieu-nhan-hang`;
    pos.url = LIST;
    pos.post({ mark: "cgn/pos-hook", type: "route", payload: { href: LIST } });
    await until(() => pos.view === null);
    await settle(100);
    assert.equal(pos.view, null, "danh sách không có khung");
    const back = `${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`;
    pos.url = back;
    pos.post({ mark: "cgn/pos-hook", type: "route", payload: { href: back } });
    await until(() => pos.viewKind === "inline" && fillButton(pos));
    assert.equal(srv.st.puts.length, 0);
    assert.equal(await grantCount(b), 1);
  } finally {
    b.close();
  }
});

test("P2: trang /chi-tiet-so (khung nổi) có cấp phép → chỉ nút 'Mở phiếu GR03878', KHÔNG nút Điền; bấm → sang trang phiếu, khung trong luồng có nút Điền", async () => {
  const { b, srv } = await openToReceived();
  try {
    await grant(b);
    const so = b.openTab(`${POS}/chi-tiet-so/SOBD1593858`);
    so.post(POS_AUTH);
    const open = await until(() => so.view && so.view.buttons && so.view.buttons.find((x) => x.label === "Mở phiếu GR03878"));
    assert.equal(so.viewKind, "float");
    assert.equal(so.view.title, "Đã có cấp phép điền GR03878 (1 lần)");
    assert.ok(!so.views.some(isFill), "trang /chi-tiet-so không bao giờ có nút Điền");
    open.onClick();
    await until(() => so.url === `${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    so.post(POS_AUTH);
    await until(() => so.viewKind === "inline" && isFill(so.view));
    assert.equal(srv.st.puts.length, 0);
    assert.equal(await grantCount(b), 1);
  } finally {
    b.close();
  }
});

test("P2: đổi route sang phiếu khác (GET phiếu mới còn chờ) → khung phiếu cũ gỡ ngay, không còn nút Điền của GR03878 trên trang phiếu khác", async () => {
  const OTHER = "0f0f0f0f-1111-4222-8333-444455556666";
  let release;
  const hold = new Promise((r) => (release = r));
  const { b, srv, pos } = await openToReceived({ server: { grHolds: { [OTHER]: hold } } });
  try {
    await grant(b);
    await until(() => fillButton(pos));
    const other = `${POS}/danh-sach-phieu-nhan-hang/${OTHER}`;
    pos.url = other;
    pos.post({ mark: "cgn/pos-hook", type: "route", payload: { href: other } });
    await settle(60);
    assert.equal(pos.view, null, "GET phiếu mới chưa về: không còn khung / nút của phiếu cũ");
    release();
    await until(() => viewTitle(pos) === "Không đọc được phiếu nhận");
    assert.ok(!isFill(pos.view));
    assert.equal(srv.st.puts.length, 0);
  } finally {
    release();
    b.close();
  }
});

test("P2: lượt đánh giá cũ về muộn sau khi đổi route (tra QR GR03878 còn chờ) → view của GR03878 KHÔNG vẽ lên trang phiếu khác", async () => {
  const OTHER = "0f0f0f0f-1111-4222-8333-444455556666";
  let releaseQr;
  let releaseGr;
  const qrHold = new Promise((r) => (releaseQr = r));
  const grHold = new Promise((r) => (releaseGr = r));
  const { b, srv, pos } = await openToReceived({ server: { qrHold, grHolds: { [OTHER]: grHold } } });
  try {
    await until(() => viewTitle(pos) === "Đang tra 12 UID trên POS…");
    const other = `${POS}/danh-sach-phieu-nhan-hang/${OTHER}`;
    pos.url = other;
    pos.post({ mark: "cgn/pos-hook", type: "route", payload: { href: other } });
    await until(() => pos.view === null);
    releaseQr(); // lượt cũ (GR03878) tra xong, lập kế hoạch, vẽ — trong khi trang đã là phiếu khác
    await until(() => srv.st.log.filter((r) => new URL(r.url).pathname === "/thuocsi-warehouse/qrcode").length >= 12);
    await settle(150);
    assert.equal(pos.view, null, "không vẽ view kế hoạch của GR03878 trên trang phiếu khác");
    assert.ok(!pos.views.slice(-3).some((v) => v && v.grCode === "GR03878" && /kế hoạch/i.test(v.title)), "không có view kế hoạch GR03878 sau khi đổi route");
    releaseGr();
    await until(() => viewTitle(pos) === "Không đọc được phiếu nhận");
    assert.equal(srv.st.puts.length, 0);
  } finally {
    releaseQr();
    releaseGr();
    b.close();
  }
});

for (const [where, path] of [["danh sách phiếu nhận", "/danh-sach-phieu-nhan-hang"], ["trang không liên quan (bán hàng)", "/ban-hang"]]) {
  test(`P2 (PM audit sơ bộ): lượt đánh giá GR03878 về muộn sau khi SPA sang ${where} → 0 khung (nổi / trong luồng), 0 nút Điền, 0 PUT; danh sách không khung nổi (F4)`, async () => {
    let releaseQr;
    const qrHold = new Promise((r) => (releaseQr = r));
    const { b, srv, pos } = await openToReceived({ server: { qrHold } });
    try {
      await grant(b);
      await until(() => viewTitle(pos) === "Đang tra 12 UID trên POS…");
      const float0 = pos.floatViews.length;
      const to = `${POS}${path}`;
      pos.url = to;
      pos.post({ mark: "cgn/pos-hook", type: "route", payload: { href: to } });
      await until(() => pos.view === null);
      releaseQr(); // lượt cũ (GR03878, đã có cấp phép) tra xong, lập kế hoạch, vẽ — trong khi trang đã đổi
      await until(() => srv.st.log.filter((r) => new URL(r.url).pathname === "/thuocsi-warehouse/qrcode").length >= 12);
      await settle(200);
      assert.equal(pos.view, null, "không khung nào trên trang mới");
      assert.equal(pos.floatViews.length, float0, "không vẽ khung nổi");
      assert.ok(!pos.views.some((v, i) => i >= pos.views.length - 3 && isFill(v)));
      assert.equal(srv.st.puts.length, 0);
      assert.equal(await grantCount(b), 1, "cấp phép còn");
    } finally {
      releaseQr();
      b.close();
    }
  });
}

test("P2 (PM audit sơ bộ): lỗi của phiếu cũ về muộn (GET phiếu A còn chờ, SPA sang phiếu GR03878) → không vẽ lên trang GR03878", async () => {
  const OTHER = "0f0f0f0f-1111-4222-8333-444455556666";
  let release;
  const hold = new Promise((r) => (release = r));
  const srv = makeServer({ grHolds: { [OTHER]: hold } });
  const b = createBrowser(srv.handle);
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${OTHER}`);
    pos.post(POS_AUTH);
    await until(() => srv.st.log.some((r) => r.url.endsWith(`/goods-receipt/${OTHER}`)));
    const to = `${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`;
    pos.url = to;
    pos.post({ mark: "cgn/pos-hook", type: "route", payload: { href: to } });
    await settle(30);
    release(); // GET phiếu A về 404 → lượt cũ báo "Không đọc được phiếu nhận" — trong khi trang đã là GR03878
    await until(() => startBtn(pos));
    assert.ok(!pos.views.some((v) => v && v.title === "Không đọc được phiếu nhận"), "lỗi của phiếu cũ không hiện trên trang phiếu mới");
  } finally {
    release();
    b.close();
  }
});

test("P2 (PM audit sơ bộ): đang điền (PUT treo) mà SPA sang danh sách → tiến trình điền không vẽ khung nổi trên danh sách; vẫn điền đủ", async () => {
  let release;
  const hold = new Promise((r) => (release = r));
  const { b, srv, pos } = await openToReceived({ server: { putHolds: { 1: hold } } });
  try {
    await grant(b);
    (await until(() => fillButton(pos))).onClick();
    await until(() => srv.st.puts.length === 1);
    const float0 = pos.floatViews.length;
    const LIST = `${POS}/danh-sach-phieu-nhan-hang`;
    pos.url = LIST;
    pos.post({ mark: "cgn/pos-hook", type: "route", payload: { href: LIST } });
    await settle(30);
    release();
    await sessionState(b, "applied");
    await settle(100);
    assert.equal(pos.floatViews.length, float0, "không khung nổi trên danh sách (F4)");
    assert.equal(srv.st.puts.length, 6);
  } finally {
    release();
    b.close();
  }
});

test("P2 (PM audit rev 1): đang điền GR03878 (PUT treo) mà SPA sang /chi-tiet-so của SO KHÁC → 0 khung / nút của GR03878 trên trang SO đó; tiến trình ghi vẫn xong đúng hợp đồng (6 PUT, applied, lease trả)", async () => {
  let release;
  const hold = new Promise((r) => (release = r));
  const { b, srv, pos } = await openToReceived({ server: { putHolds: { 1: hold }, otherSoEmpty: true } });
  try {
    await grant(b);
    (await until(() => fillButton(pos))).onClick();
    await until(() => srv.st.puts.length === 1);
    const n0 = pos.views.length;
    const to = `${POS}/chi-tiet-so/SOBD1599999`;
    pos.url = to;
    pos.post({ mark: "cgn/pos-hook", type: "route", payload: { href: to } });
    await settle(30);
    assert.equal(pos.view, null, "đổi trang: gỡ khung của GR03878 ngay, kể cả khi đang ghi");
    release();
    const s = await sessionState(b, "applied");
    assert.equal(s.lease, null);
    assert.equal(srv.st.puts.length, 6);
    assert.equal(codesOnGr(srv).length, 12);
    await until(() => pos.loads >= 2); // trang SO B tự tải lại sau khi ghi xong
    pos.post(POS_AUTH);
    await until(() => viewTitle(pos) === "SO SOBD1599999: không có phiếu nhận đang chờ nhận");
    const shown = pos.views.slice(n0);
    assert.ok(!shown.some((v) => v && (v.grCode === "GR03878" || /GR03878/.test(v.title || ""))), `không view nào của GR03878 trên SO B: ${shown.map((v) => v && v.title).join(" | ")}`);
  } finally {
    release();
    b.close();
  }
});

test("P2 (PM audit rev 1): lượt evaluateSo của SO A về muộn sau khi SPA sang SO B → không vẽ phiếu của SO A trên trang SO B", async () => {
  let release;
  const p = new Promise((r) => (release = r));
  const srv = makeServer({ searchHold: { so: "1593858", p }, otherSoEmpty: true });
  const b = createBrowser(srv.handle);
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(`${POS}/chi-tiet-so/SOBD1593858`);
    pos.post(POS_AUTH);
    await until(() => srv.st.log.some((r) => decodeURIComponent(r.url).includes("so_thuocsi=1593858,")));
    const to = `${POS}/chi-tiet-so/SOBD1599999`;
    pos.url = to;
    pos.post({ mark: "cgn/pos-hook", type: "route", payload: { href: to } });
    await settle(30);
    release(); // tìm theo SO A về → lượt cũ đọc GR03878, vẽ nút "Nhận hàng bằng RFID" của nó — trong khi trang đã là SO B
    await until(() => viewTitle(pos) === "SO SOBD1599999: không có phiếu nhận đang chờ nhận");
    await settle(100);
    assert.ok(!pos.views.some((v) => v && (v.grCode === "GR03878" || /GR03878|SOBD1593858/.test(v.title || ""))), pos.views.map((v) => v && v.title).join(" | "));
    assert.equal(b.tabs().filter((t) => t.url.startsWith(NW)).length, 0);
  } finally {
    release();
    b.close();
  }
});

test("P2 (PM audit rev 1): đã xem /chi-tiet-so SO A (chứa GR03878) → về phiếu, điền (PUT treo) → SPA sang SO B → không dùng danh sách phiếu cũ của SO A để vẽ GR03878 trên SO B", async () => {
  let release;
  const hold = new Promise((r) => (release = r));
  const { b, srv, pos } = await openToReceived({ server: { putHolds: { 1: hold }, otherSoEmpty: true } });
  try {
    await grant(b);
    await until(() => fillButton(pos));
    const route = (href) => {
      pos.url = href;
      pos.post({ mark: "cgn/pos-hook", type: "route", payload: { href } });
    };
    route(`${POS}/chi-tiet-so/SOBD1593858`); // SO A: phiếu GR03878 hiện ở khung nổi, chỉ nút "Mở phiếu"
    await until(() => pos.view && pos.view.buttons && pos.view.buttons.some((x) => x.label === "Mở phiếu GR03878"));
    route(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    (await until(() => pos.viewKind === "inline" && fillButton(pos))).onClick();
    await until(() => srv.st.puts.length === 1);
    const n0 = pos.views.length;
    route(`${POS}/chi-tiet-so/SOBD1599999`);
    await settle(30);
    release();
    await sessionState(b, "applied");
    await settle(100);
    const shown = pos.views.slice(n0).filter((v) => v && v.grCode === "GR03878");
    assert.deepEqual(shown.map((v) => v.title), [], "không view nào của GR03878 trên SO B");
    assert.equal(srv.st.puts.length, 6);
  } finally {
    release();
    b.close();
  }
});
