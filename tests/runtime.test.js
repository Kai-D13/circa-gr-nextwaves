"use strict";
// Chạy thật background + content script (POS, Nextwaves) trên trình duyệt giả, dữ liệu mẫu GR03878 ↔ PO28237814.
// Phần "sau khi nhận" của Nextwaves là DỰNG LẠI (K1: chưa có lượt nhận thành công thật) — xem tests/helpers.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { createBrowser, until, settle } = require("./browser-sim.js");

const POS = "https://pos.stg.circa-v2.buymed.tech";
const NW = "https://circa-stg.nextwaves.app";
const NWAPI = "https://api-circa-stg.nextwaves.app";
const GR_ID = "2de6c0ec-2ea8-4038-8616-659fa3f5820a";
const STORE = "64a8663b-0c9e-49c6-9626-0a4c7c4bd53d";
const SHIP = "34e67fb9-ea76-4606-ab65-4c515934c0e1";
const KEY = `STG:${GR_ID}`;
const POS_AUTH = { mark: "cgn/pos-hook", type: "auth", payload: { envId: "STG", headers: { authorization: "Bearer pos-test", "x-client-id": "1", "x-store-id": STORE } } };
const NW_AUTH = { mark: "cgn/nw-hook", type: "auth", payload: { envId: "STG", headers: { authorization: "Bearer nw-test" } } };
const scan = (httpStatus, response) => ({ mark: "cgn/nw-hook", type: "receive-scan", payload: { envId: "STG", shipmentId: SHIP, httpStatus, response: response || {}, sentEpcs: 12 } });

function makeServer(opts = {}) {
  const it = H.sample("nw-stg-intertenant-PO28237814-SOBD1593858.json");
  const st = { gr: H.clone(H.sample("gr-stg-GR03878-20261024.json")), nwReceived: false, puts: [], log: [], putFailures: opts.putFailures || 0 };
  const qr = H.qrByUidPO28237814();
  const searchItem = { id: it.id, purchaseOrderId: it.purchaseOrderId, purchaseOrderNumber: it.purchaseOrderNumber, purchaseOrderStatus: it.purchaseOrderStatus, counterparty: it.counterparty, status: it.status, warehouse: it.warehouse, openShipmentCount: 1 };
  async function handle(req) {
    st.log.push(req);
    const u = new URL(req.url);
    if (u.origin === POS) {
      if (u.pathname === "/thuocsi-warehouse/qrcode") {
        const code = u.searchParams.get("code");
        const q = qr[code];
        return { status: 200, json: { status: "OK", data: q ? [{ uniqueId: code, shortId: code, productId: q.productId, lot: q.lot, expiredDate: q.expiredDate, status: "NORMAL" }] : [] } };
      }
      if (!u.pathname.startsWith("/backend/v1/")) return { status: 404, json: {} };
      if (req.headers.authorization !== "Bearer pos-test") return { status: 401, json: { message: "unauthorized" } };
      let m = /^\/backend\/v1\/order\/goods-receipt\/([0-9a-f-]{36})$/.exec(u.pathname);
      if (m && req.method === "GET") return m[1] === st.gr.data.id ? { status: 200, json: H.clone(st.gr) } : { status: 404, json: {} };
      m = /^\/backend\/v1\/pos\/([0-9a-f-]{36})\/po\/([0-9a-f-]{36})$/.exec(u.pathname);
      if (m && req.method === "GET") return { status: 200, json: H.sample("po-stg-PO00006750-SOBD1593858.json") };
      if (u.pathname === "/backend/v1/order/goods-receipt/search" && req.method === "GET") return { status: 200, json: H.sample("pos-stg-gr-search-so-1593858.json") };
      m = /^\/backend\/v1\/order\/goods-receipt\/([0-9a-f-]{36})\/item\/([0-9a-f-]{36})\/detail\/([0-9a-f-]{36})$/.exec(u.pathname);
      if (m && req.method === "PUT") {
        st.puts.push(req);
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
      if (u.pathname === "/api/v1/inter-tenant-orders/receiving") return { status: 200, json: u.searchParams.get("q") === "SOBD1593858" ? { items: [searchItem], total: 1 } : { items: [], total: 0 } };
      if (u.pathname === `/api/v1/inter-tenant-orders/purchase-orders/${it.purchaseOrderId}`) return { status: 200, json: H.clone(it) };
      if (u.pathname === `/api/v1/inter-tenant-orders/purchase-orders/${it.purchaseOrderId}/receiving`) return { status: 200, json: H.receivingPO28237814() };
      if (u.pathname === `/api/v1/purchase-orders/${it.purchaseOrderId}`) {
        if (!st.nwReceived) return { status: 200, json: H.sample("nw-stg-po-PO28237814-detail.json") };
        const po = H.poDetailPO28237814Received();
        if (opts.dropReceivedEpc) for (const x of po.items) x.receivedUnits = x.receivedUnits.filter((r) => r.epc !== opts.dropReceivedEpc);
        return { status: 200, json: po };
      }
      if (u.pathname === `/api/v1/inter-tenant-shipments/${SHIP}`) return { status: 200, json: H.sample("nw-stg-shipment-34e67fb9-PO28237814.json") };
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

// Mở GR trên POS → chờ tab Nextwaves → khớp đơn. Trả {b, srv, pos, nw}.
async function openToReady(opts = {}) {
  const srv = makeServer(opts.server);
  const b = createBrowser(srv.handle);
  await b.setConfig({ mode: "STG", url: "", writeMode: opts.writeMode || "auto" });
  const pos = b.openTab(opts.posUrl || `${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
  pos.post(POS_AUTH);
  const nw = await until(() => b.tabs().find((t) => t.url.startsWith(NW)));
  nw.post(NW_AUTH);
  await sessionState(b, "nw_ready");
  await until(() => nw.view && nw.view.title === "Sẵn sàng nhận hàng");
  return { b, srv, pos, nw };
}

const codesOnGr = (srv) => srv.st.gr.data.items.flatMap((i) => i.details).reduce((n, d) => n + (d.thuocsi_qr_codes || []).length, 0);

test("E2E STG GR03878 (tự điền): GR → tab Nextwaves ?po=SOBD1593858 → khớp PO28237814 → nhận → điền 6 lô / 12 UID → HOÀN THÀNH", async () => {
  const { b, srv, pos, nw } = await openToReady();
  try {
    assert.equal(nw.url, `${NW}/vi/purchases/receive?po=SOBD1593858`);
    const s1 = b.session(KEY);
    assert.equal(s1.deliveryCode, "SOBD1593858-F");
    assert.equal(s1.nwPoNumber, "PO28237814");
    assert.equal(s1.nwRefId, "SOBD1593858-1056745");
    assert.deepEqual(s1.shipmentIds, [SHIP]);
    await until(() => pos.view && pos.view.title.startsWith("Đã khớp đơn Nextwaves"));

    // Dược sĩ bấm "Xác nhận nhận hàng" trên Nextwaves → 2xx.
    srv.st.nwReceived = true;
    const focusBefore = pos.focusCount;
    nw.post(scan(200));
    const s2 = await sessionState(b, "applied");
    assert.equal(s2.nwResult.units.length, 12);
    assert.ok(pos.focusCount > focusBefore, "đưa dược sĩ về tab POS");
    assert.equal(srv.st.puts.length, 6);
    for (const p of srv.st.puts) {
      assert.deepEqual(Object.keys(p.body.detail).sort(), ["lot_id", "received_quantity", "thuocsi_qr_codes"]);
      assert.equal(p.body.detail.received_quantity, 1);
      assert.equal(p.headers.authorization, "Bearer pos-test");
      assert.equal(p.headers["content-type"], "application/json");
    }
    assert.equal(codesOnGr(srv), 12);
    await until(() => pos.reloads >= 1 && pos.loads >= 2);
    pos.post(POS_AUTH); // trang POS tải lại → app gọi API → hook báo lại header
    await until(() => pos.view && pos.view.title === "GR03878: đã điền 12 UID từ Nextwaves");

    // Dược sĩ bấm HOÀN THÀNH trên POS.
    srv.st.gr.data.status = "COMPLETED";
    pos.post({ mark: "cgn/pos-hook", type: "gr-status", payload: { envId: "STG", grId: GR_ID, status: "COMPLETED", httpStatus: 200 } });
    await sessionState(b, "done");
    await until(() => pos.view && pos.view.title === "GR03878: đã HOÀN THÀNH");

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

test("writeMode off: chỉ hiện kế hoạch, không PUT; chuyển sang confirm → bấm nút → điền", async () => {
  const { b, srv, pos, nw } = await openToReady({ writeMode: "off" });
  try {
    srv.st.nwReceived = true;
    nw.post(scan(200));
    await sessionState(b, "received");
    await until(() => pos.view && pos.view.title === "Chế độ ghi đang TẮT — chỉ xem kế hoạch");
    assert.equal(pos.view.table.rows.length, 6);
    await settle();
    assert.equal(srv.st.puts.length, 0);

    await b.setConfig({ mode: "STG", url: "", writeMode: "confirm" });
    const btn = await until(() => pos.view && pos.view.buttons && pos.view.buttons.find((x) => x.label === "Điền vào phiếu (12 UID)"));
    assert.equal(srv.st.puts.length, 0, "confirm: chưa ghi trước khi bấm");
    btn.onClick();
    await sessionState(b, "applied");
    assert.equal(srv.st.puts.length, 6);
    assert.equal(codesOnGr(srv), 12);
  } finally {
    b.close();
  }
});

test("Nextwaves trả 400 tagged_unit_unsupported (K1): báo lỗi trên tab Nextwaves, không về POS, không ghi", async () => {
  const { b, srv, pos, nw } = await openToReady();
  try {
    const resp = H.sample("nw-stg-receive-scan-400-PO28237814.json")[0].response;
    const focusBefore = pos.focusCount;
    nw.post(scan(400, resp));
    await until(() => nw.view && nw.view.title === "Nextwaves CHƯA nhận (HTTP 400)");
    assert.match(nw.view.lines.join("\n"), /tagged_unit_unsupported/);
    await settle();
    assert.equal(b.session(KEY).state, "nw_ready");
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
    await until(() => nw.view && nw.view.title === "Nextwaves mới nhận 11/12 UID");
    await settle();
    assert.equal(b.session(KEY).state, "nw_ready");
    assert.equal(srv.st.puts.length, 0);
  } finally {
    b.close();
  }
});

test("PUT lỗi ở bước đầu → dừng (apply_stopped), bấm Thử lại → đọc lại phiếu rồi điền đủ", async () => {
  const { b, srv, pos, nw } = await openToReady({ server: { putFailures: 1 } });
  try {
    srv.st.nwReceived = true;
    nw.post(scan(200));
    const s = await sessionState(b, "apply_stopped");
    assert.equal(s.applyError.reason, "put_failed");
    assert.equal(s.applyError.status, 500);
    assert.equal(srv.st.puts.length, 1);
    const retry = await until(() => pos.view && pos.view.buttons && pos.view.buttons.find((x) => x.label === "Thử lại"));
    retry.onClick();
    await sessionState(b, "applied");
    assert.equal(srv.st.puts.length, 7);
    assert.equal(codesOnGr(srv), 12);
  } finally {
    b.close();
  }
});

test("Đường (2) /chi-tiet-so/SOBD1593858: tìm GR theo SO → cùng luồng, quay về trang SO", async () => {
  const { b, srv, pos } = await openToReady({ posUrl: `${POS}/chi-tiet-so/SOBD1593858` });
  try {
    assert.equal(b.session(KEY).returnUrl, `${POS}/chi-tiet-so/SOBD1593858`);
    const search = srv.st.log.find((r) => r.url.includes("/goods-receipt/search"));
    assert.match(decodeURIComponent(search.url), /so_thuocsi=1593858,pos_id=64a8663b-0c9e-49c6-9626-0a4c7c4bd53d/);
    await until(() => pos.view && pos.view.title.startsWith("Đã khớp đơn Nextwaves"));
  } finally {
    b.close();
  }
});

test("Cửa hàng đăng nhập khác cửa hàng của GR → báo lỗi, không mở Nextwaves", async () => {
  const srv = makeServer();
  const b = createBrowser(srv.handle);
  try {
    await b.setConfig({ mode: "STG", url: "", writeMode: "auto" });
    const pos = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos.post({ mark: "cgn/pos-hook", type: "auth", payload: { envId: "STG", headers: { authorization: "Bearer pos-test", "x-store-id": "00000000-0000-0000-0000-00000000abcd" } } });
    await until(() => pos.view && pos.view.tone === "err");
    assert.equal(pos.view.title, "Phiếu nhận thuộc cửa hàng khác cửa hàng đang đăng nhập");
    await settle();
    assert.equal(b.tabs().length, 1);
    assert.equal(b.session(KEY), null);
  } finally {
    b.close();
  }
});

test("Chế độ STG trên trang POS production → không làm gì, không gọi host nào", async () => {
  const srv = makeServer();
  const b = createBrowser(srv.handle);
  try {
    await b.setConfig({ mode: "STG", url: "", writeMode: "auto" });
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
  for (const cfg of [{ mode: "", url: "", writeMode: "auto" }, { mode: "PRD", url: "", writeMode: "auto" }]) {
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

test("Huỷ phiên trên POS → tải lại trang không tự mở Nextwaves; bấm 'Nhận bằng Nextwaves' → mở lại", async () => {
  const { b, pos } = await openToReady();
  try {
    const nwTabs = () => b.tabs().filter((t) => t.url.startsWith(NW)).length;
    const before = nwTabs();
    await pos.view.buttons.find((x) => x.label === "Huỷ phiên").onClick();
    await until(() => b.session(KEY) === null);
    pos.reload();
    pos.post(POS_AUTH);
    const start = await until(() => pos.view && pos.view.buttons && pos.view.buttons.find((x) => x.label === "Nhận bằng Nextwaves"));
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

test("Hai tab POS cùng mở GR03878 (tự điền): chỉ một tab ghi, không nhân đôi mã", async () => {
  const { b, srv, pos, nw } = await openToReady();
  try {
    const pos2 = b.openTab(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`);
    pos2.post(POS_AUTH);
    await until(() => pos2.view && pos2.view.title.startsWith("Đã khớp đơn Nextwaves"));
    assert.equal(b.tabs().filter((t) => t.url.startsWith(NW)).length, 1, "tab thứ hai không mở thêm Nextwaves");
    srv.st.nwReceived = true;
    nw.post(scan(200));
    await sessionState(b, "applied");
    await settle(150);
    assert.equal(srv.st.puts.length, 6);
    const all = srv.st.gr.data.items.flatMap((i) => i.details).flatMap((d) => d.thuocsi_qr_codes || []);
    assert.equal(all.length, 12);
    assert.equal(new Set(all).size, 12);
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
    await until(() => nw.view && nw.view.title === "Lượt nhận vừa rồi thuộc phiếu gửi khác");
    await settle();
    assert.equal(b.session(KEY).state, "nw_ready");
    assert.equal(pos.focusCount, focusBefore);
    assert.equal(srv.st.puts.length, 0);
  } finally {
    b.close();
  }
});

test("background: quyền điền phiếu chỉ giao cho một tab; chỉ giành từ received / apply_stopped", async () => {
  const { b, srv, nw } = await openToReady({ writeMode: "off" });
  try {
    assert.equal((await b.sendFromPopup({ type: "session:claimApply", key: KEY, token: "a" })).data, false, "nw_ready: chưa được ghi");
    srv.st.nwReceived = true;
    nw.post(scan(200));
    await sessionState(b, "received");
    const [r1, r2] = await Promise.all([
      b.sendFromPopup({ type: "session:claimApply", key: KEY, token: "a" }),
      b.sendFromPopup({ type: "session:claimApply", key: KEY, token: "b" }),
    ]);
    assert.deepEqual([r1.data, r2.data], [true, false]);
    assert.equal(b.session(KEY).applyToken, "a");
    await b.sendFromPopup({ type: "session:update", key: KEY, patch: { state: "apply_stopped" } });
    assert.equal((await b.sendFromPopup({ type: "session:claimApply", key: KEY, token: "b" })).data, true);
  } finally {
    b.close();
  }
});
