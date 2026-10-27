"use strict";
// v0.2 (Spec Đợt 1 rev 1 + rev 2, PM duyệt hướng 26/10): lối vào danh sách GR, chỉ tạo phiên khi bấm, thứ tự lượt danh sách (R1),
// huỷ cú bấm khi danh sách / route / cửa hàng đổi (R2), header cửa hàng (S3), returnUrl do background dựng (S4), trang không liên quan.
// Chạy thật background + content trên trình duyệt giả; DOM danh sách thay bằng bộ giả grList (dòng = {code, connected}).
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { createBrowser, until, settle, closeAll } = require("./browser-sim.js");

test.afterEach(() => closeAll());

const POS = "https://pos.stg.circa-v2.buymed.tech";
const NW = "https://circa-stg.nextwaves.app";
const LIST_URL = `${POS}/danh-sach-phieu-nhan-hang`;
const GR_ID = "2de6c0ec-2ea8-4038-8616-659fa3f5820a";
const PO_ID = "f7678788-28e2-47bf-b5c6-a8e10a223f7d";
const GR_PAGE = `${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`;
const STORE = H.STORE_2222;
const OTHER_STORE = "00000000-0000-0000-0000-00000000abcd";
const KEY = `STG:${GR_ID}`;
const SHIP = "34e67fb9-ea76-4606-ab65-4c515934c0e1";
const HOOK = "cgn/pos-hook";
const auth = (headers) => ({ mark: HOOK, type: "auth", payload: { envId: "STG", headers } });
const POS_AUTH = auth({ authorization: "Bearer pos-test", "x-client-id": "1", "x-store-id": STORE, "grpc-timeout": "30S" });
const listReq = (reqSeq, queryKey = "Q1") => ({ mark: HOOK, type: "gr-list-request", payload: { envId: "STG", reqSeq, queryKey } });
const listRes = (reqSeq, latestReqSeq, rows, extra) => ({
  mark: HOOK,
  type: "gr-list",
  payload: Object.assign({ envId: "STG", reqSeq, latestReqSeq, queryKey: "Q1", ok: true, page: 1, limit: 20, total: rows ? rows.length : 0, rows: rows || [] }, extra || {}),
});
const row = (code, id, status = "WAITING_TO_RECEIVE", posId = STORE) => ({ id, code, status, poId: PO_ID, posId });
const ROW78 = row("GR03878", GR_ID);
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const model = (t, code) => (t.grListModel && t.grListModel.byCode ? t.grListModel.byCode.get(code) || null : null);
const nwTabs = (b) => b.tabs().filter((t) => t.url.startsWith(NW));
const startBtn = (t) => t.view && t.view.buttons && t.view.buttons.find((x) => x.label === "Nhận hàng bằng RFID");

// Server POS giả: GR03878 / PO00006750 / tìm theo SO; `holds[kind]` treo một loại GET tới khi test cho chạy tiếp.
function makeServer(opts = {}) {
  const st = { gr: H.clone(H.sample("gr-stg-GR03878-20261024.json")), log: [], holds: {} };
  if (opts.grCode) st.gr.data.code = opts.grCode;
  if (opts.grStatus) st.gr.data.status = opts.grStatus;
  async function handle(req) {
    st.log.push(req);
    const u = new URL(req.url);
    if (u.origin !== POS) return { status: 404, json: {} }; // Nextwaves: test không gửi header Nextwaves → tab không gọi API
    if (!u.pathname.startsWith("/backend/v1/")) return { status: 404, json: {} };
    if (req.headers.authorization !== "Bearer pos-test") return { status: 401, json: {} };
    if (u.pathname === `/backend/v1/order/goods-receipt/${GR_ID}`) {
      if (st.holds.gr) await st.holds.gr;
      return { status: 200, json: H.clone(st.gr) };
    }
    if (/^\/backend\/v1\/pos\/[0-9a-f-]{36}\/po\/[0-9a-f-]{36}$/.test(u.pathname)) {
      if (st.holds.po) await st.holds.po;
      const po = H.sample("po-stg-PO00006750-SOBD1593858.json");
      if (opts.poNoSo) {
        po.data.thuocsi_delivery_code = [];
        po.data.sale_order_number = "";
      }
      return { status: 200, json: po };
    }
    if (u.pathname === "/backend/v1/order/goods-receipt/search") {
      if (st.holds.search) await st.holds.search;
      return { status: 200, json: H.sample("pos-stg-gr-search-so-1593858.json") };
    }
    return { status: 404, json: {} };
  }
  return { st, handle };
}

const hold = (st, kind) => {
  let release;
  st.holds[kind] = new Promise((r) => (release = r));
  return () => {
    st.holds[kind] = null;
    release();
  };
};
const calls = (srv, re) => srv.st.log.filter((r) => re.test(new URL(r.url).pathname + new URL(r.url).search)).length;

async function openList(opts = {}) {
  const srv = makeServer(opts.server);
  const b = createBrowser(srv.handle, opts.browser);
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(LIST_URL);
    pos.post(POS_AUTH);
    pos.post(listReq(1));
    pos.post(listRes(1, 1, opts.rows || [ROW78]));
    await until(() => pos.grListActive && model(pos, "GR03878"));
    return { b, srv, pos };
  } catch (err) {
    b.close();
    throw err;
  }
}

test("danh sách: nút chỉ ở dòng chờ / đang nhận đúng cửa hàng; chỉ xem danh sách → 0 request API", async () => {
  const rows = [ROW78, row("GR03001", uuid(1), "COMPLETED"), row("GR03002", uuid(2), "RECEIVING", OTHER_STORE), row("GR03003", uuid(3), "RECEIVING"), { id: "khong-uuid", code: "GR03004", status: "WAITING_TO_RECEIVE", posId: STORE }];
  const { b, srv, pos } = await openList({ rows });
  try {
    await until(() => model(pos, "GR03003"));
    assert.deepEqual([...pos.grListModel.byCode.keys()].sort(), ["GR03003", "GR03878"]);
    assert.deepEqual([model(pos, "GR03878").kind, model(pos, "GR03878").label, model(pos, "GR03878").grId], ["start", "Nhận hàng bằng RFID", GR_ID]);
    await settle(100);
    assert.equal(srv.st.log.length, 0, "chỉ xem danh sách: không gọi API POS");
    assert.equal(nwTabs(b).length, 0);
    assert.equal(b.session(KEY), null);
    assert.equal(pos.view, null, "không có khung khi chỉ xem");
  } finally {
    b.close();
  }
});

test("bấm trên danh sách → đọc lại GR + PO + SO → MỘT phiên, mở Nextwaves, tab POS ở lại danh sách; nhận xong → tab POS về trang phiếu", async () => {
  const { b, srv, pos } = await openList();
  try {
    pos.grListCtrl.onSelect({ code: "GR03878" }, GR_ID, "GR03878", "start");
    const nw = await until(() => nwTabs(b)[0]);
    assert.equal(nw.url, `${NW}/vi/purchases/receive?po=SOBD1593858`);
    const s = await until(() => b.session(KEY));
    assert.deepEqual([s.state, s.returnUrl, s.grCode, s.deliveryCode, s.posId], ["waiting_nw", GR_PAGE, "GR03878", "SOBD1593858-F", STORE]);
    assert.deepEqual(
      [calls(srv, /goods-receipt\/2de6c0ec/), calls(srv, /\/po\//), calls(srv, /goods-receipt\/search\?query=so_thuocsi/)],
      [1, 1, 1],
      "đọc lại GR, PO, tìm GR theo SO đúng một lần"
    );
    assert.equal(pos.url, LIST_URL, "tab POS ở lại danh sách");
    await until(() => model(pos, "GR03878") && model(pos, "GR03878").kind === "open_nw");
    assert.equal(model(pos, "GR03878").label, "Mở Nextwaves");
    // v0.2.3 F4: thành công thể hiện bằng nút; không khung nổi, không vùng thông báo trên danh sách.
    assert.equal(pos.view, null, "không khung nổi trên danh sách");
    assert.equal(pos.grListNotice, null, "thành công không cần thông báo");
    // Nextwaves khớp đơn + lượt nhận 2xx + kết quả nhận (gửi từ trang Nextwaves) → background đưa tab POS về trang phiếu.
    const match = { nwPoId: "55bd221f-65de-4a4d-8a77-40c568a6f176", nwPoNumber: "PO28237814", nwOrderId: "f930f66d-679a-4ed8-9c8e-b48aea91a8be", nwRefId: "SOBD1593858-1056745", shipmentIds: [SHIP], expected: H.receivingPO28237814(), receiptIdsBefore: [], nwWriteLocks: [] };
    assert.equal((await b.sendFromTab(nw, { type: "session:nwMatched", key: KEY, match })).ok, true);
    const scanAt = Date.now();
    assert.equal((await b.sendFromTab(nw, { type: "session:scanOk", key: KEY, scan: { shipmentId: SHIP, httpStatus: 200, sentEpcs: 12, at: scanAt } })).ok, true);
    const log = b.session(KEY).log.find((l) => l.type === "scan_ok");
    assert.match(log.at, /^\d{4}-\d\d-\d\dT/, "at của log luôn ISO");
    assert.equal(log.scanAt, new Date(scanAt).toISOString());
    assert.equal((await b.sendFromTab(nw, { type: "session:received", key: KEY, payload: { units: [], nwPoNumber: "PO28237814", receiptIds: [], at: Date.now() } })).ok, true);
    await until(() => pos.url === GR_PAGE);
  } finally {
    b.close();
  }
});

// v0.2.3 (PM F3): nhãn ngắn (không dài hơn nút bắt đầu), tên đầy đủ = mã GR + trạng thái PHIÊN + hành động; đổi trạng thái phiên
// (kể cả cùng nhãn "Mở phiếu": received → applied) phải đổi tên đầy đủ trên cùng bảng.
test("F3 nút danh sách qua mọi trạng thái trên cùng bảng: nhãn ngắn, kind đúng, title gồm mã GR + trạng thái phiên + hành động", async () => {
  const { b, pos } = await openList();
  try {
    const m = () => model(pos, "GR03878");
    assert.deepEqual([m().kind, m().label], ["start", "Nhận hàng bằng RFID"]);
    assert.match(m().title, /^GR03878 · chưa có phiên · Nhận hàng bằng RFID/);
    pos.grListCtrl.onSelect({ code: "GR03878" }, GR_ID, "GR03878", "start");
    const busy = await until(() => pos.grListModels.map((x) => x && x.byCode && x.byCode.get("GR03878")).find((v) => v && v.kind === "busy"));
    assert.deepEqual([busy.label, busy.disabled], ["Đang kiểm…", true]);
    assert.match(busy.title, /^GR03878 · đang kiểm phiếu, PO và SO/);
    assert.equal(pos.view, null, "đang kiểm: không khung nổi");
    await until(() => m() && m().kind === "open_nw");
    assert.equal(m().label, "Mở Nextwaves");
    assert.match(m().title, /^GR03878 · phiên .*\(waiting_nw\) · Mở lại tab Nextwaves/);
    const seen = {};
    for (const [state, kind, label] of [
      ["nw_ready", "open_nw", "Mở Nextwaves"],
      ["received", "open_gr", "Mở phiếu"],
      ["applying", "open_gr", "Mở phiếu"],
      ["applied", "open_gr", "Mở phiếu"],
      ["apply_stopped", "open_gr", "Mở phiếu"],
    ]) {
      await b.patchSession(KEY, { state });
      const v = await until(() => m() && m().title.includes(`(${state})`) && m());
      assert.deepEqual([v.kind, v.label], [kind, label], state);
      assert.match(v.title, kind === "open_gr" ? /· Mở phiếu để lập kế hoạch/ : /· Mở lại tab Nextwaves/, state);
      seen[state] = v.title;
    }
    assert.notEqual(seen.received, seen.applied, "cùng nhãn 'Mở phiếu' nhưng tên đầy đủ đổi theo trạng thái phiên");
    for (const v of [busy, m()]) assert.ok(v.label.length <= "Nhận hàng bằng RFID".length, `nhãn "${v.label}" không dài hơn nút bắt đầu`);
  } finally {
    b.close();
  }
});

test("F4 thông báo danh sách: rời danh sách thì dọn; quay lại không hiện thông báo cũ; không khung nổi", async () => {
  const { b, pos } = await openList({ server: { grStatus: "COMPLETED" } });
  try {
    pos.grListCtrl.onSelect({ code: "GR03878" }, GR_ID, "GR03878", "start");
    await until(() => pos.grListNotice && /chưa mở được Nextwaves/.test(pos.grListNotice.title));
    assert.equal(pos.view, null);
    pos.url = `${POS}/ban-hang`;
    pos.post({ mark: HOOK, type: "route", payload: { href: `${POS}/ban-hang` } });
    await until(() => !pos.grListActive);
    assert.equal(pos.grListNotice, null, "rời danh sách → dọn thông báo");
    pos.url = LIST_URL;
    pos.post({ mark: HOOK, type: "route", payload: { href: LIST_URL } });
    await until(() => pos.grListActive);
    await settle(80);
    assert.equal(pos.grListNotice, null, "quay lại → không hiện thông báo cũ");
    assert.equal(pos.view, null);
  } finally {
    b.close();
  }
});

test("R1 thứ tự lượt: A gửi → B gửi → B về → A về → giữ B; lượt mới nhất lỗi → xoá hết nút; lượt cũ về muộn không hiện lại", async () => {
  const { b, pos } = await openList();
  try {
    pos.post(listReq(2));
    pos.post(listReq(3));
    pos.post(listRes(3, 3, [row("GR03003", uuid(3))]));
    pos.post(listRes(2, 3, [row("GR03002", uuid(2))]));
    await until(() => model(pos, "GR03003"));
    await settle(60);
    assert.deepEqual([...pos.grListModel.byCode.keys()], ["GR03003"], "lượt A (2) về muộn bị bỏ");
    // A về TRƯỚC B nhưng sau khi B đã gửi → bỏ A (B mới là lượt đang chờ); giữ bảng cũ tới khi B về.
    pos.post(listReq(4));
    pos.post(listReq(5));
    pos.post(listRes(4, 5, [row("GR03004", uuid(4))]));
    await settle(80);
    assert.equal(model(pos, "GR03004"), null, "lượt A (4) không phải lượt mới nhất đã gửi");
    assert.ok(model(pos, "GR03003"), "giữ bảng đang hiện");
    pos.post(listRes(5, 5, [row("GR03005", uuid(5))]));
    await until(() => model(pos, "GR03005"));
    pos.post(listReq(6, "Q-loc-khac"));
    pos.post(listRes(6, 6, null, { ok: false, queryKey: "Q-loc-khac" }));
    await until(() => pos.grListModel === null);
    pos.post(listRes(5, 6, [row("GR03005", uuid(5))]));
    await settle(60);
    assert.equal(pos.grListModel, null, "không hiện lại dữ liệu cũ");
  } finally {
    b.close();
  }
});

// PM audit v0.2.0 P2.1: hook THẬT (helpers.loadHook) → content THẬT nạp muộn, nhận đúng những gì hook gửi lại khi chào.
const LIST_API = (page) => `${POS}/backend/v1/order/goods-receipt/search?query=pos_id=${STORE},,with_items=true,with_details=true&limit=20&page=${page}`;
const listBody = (rows) => JSON.stringify({ data: { goods_receipts: rows.map((r) => ({ id: r.id, code: r.code, status: r.status, purchase_order_id: r.poId, pos_info: { id: r.posId } })), total: rows.length, page: 1, limit: 20 } });
function hookSend(h, page) {
  const x = h.xhr();
  x.open("GET", LIST_API(page));
  for (const [k, v] of Object.entries(POS_AUTH.payload.headers)) x.setRequestHeader(k, v); // như app POS gửi
  x.send();
  return x;
}
const forward = (h, from, tab) => h.posted.slice(from).forEach((m) => tab.post(m));
async function lateContent(h) {
  const srv = makeServer();
  const b = createBrowser(srv.handle);
  await b.setConfig({ mode: "STG", url: "" });
  const pos = b.openTab(LIST_URL); // header cửa hàng cũng đến từ lần chào hook (auth)
  const n = h.posted.length;
  h.hello("cgn/pos-content");
  forward(h, n, pos);
  return { b, srv, pos };
}

test("P2.1 hook thật → content nạp muộn: A gửi, B gửi, B về, A về → hiện nút theo B; B đang chờ → không hiện dữ liệu A, B về thì hiện", async () => {
  const h = H.loadHook(POS, "pos/pos-hook.js", "/danh-sach-phieu-nhan-hang");
  const a = hookSend(h, 1);
  const bReq = hookSend(h, 2);
  bReq.finish(200, listBody([ROW78]));
  a.finish(200, listBody([row("GR03002", uuid(2))]));
  const t1 = await lateContent(h);
  try {
    await until(() => t1.pos.grListActive && model(t1.pos, "GR03878"));
    await settle(60);
    assert.deepEqual([...t1.pos.grListModel.byCode.keys()], ["GR03878"]);
    assert.equal(t1.srv.st.log.length, 0, "chỉ xem danh sách → 0 request API");
  } finally {
    t1.b.close();
  }
  const h2 = H.loadHook(POS, "pos/pos-hook.js", "/danh-sach-phieu-nhan-hang");
  hookSend(h2, 1).finish(200, listBody([row("GR03002", uuid(2))]));
  const b2 = hookSend(h2, 2); // đang chờ khi content nạp
  const t2 = await lateContent(h2);
  try {
    await until(() => t2.pos.grListActive);
    await settle(80);
    assert.equal(model(t2.pos, "GR03002"), null, "không hiện dữ liệu lượt cũ khi lượt mới đang chờ");
    const n = h2.posted.length;
    b2.finish(200, listBody([ROW78]));
    forward(h2, n, t2.pos);
    await until(() => model(t2.pos, "GR03878"));
    assert.equal(model(t2.pos, "GR03002"), null);
  } finally {
    t2.b.close();
  }
});

// R2: thay đổi xảy ra trong lúc đang đọc GR (GET GR treo) → cú bấm bị huỷ NGAY (không chờ GET trả về), không tạo phiên,
// không mở Nextwaves. Cột 3: tiêu đề khung kỳ vọng ngay khi huỷ (null = trang đã rời danh sách, không còn khung danh sách).
const R2_CASES = [
  ["có request danh sách mới (đổi trang / bộ lọc) giữa chừng", (pos) => pos.post(listReq(2, "Q2")), "Danh sách đã đổi — bấm lại"],
  ["dòng bị gỡ khỏi DOM", (pos, r) => {
    r.connected = false;
    pos.grListCtrl.onDomChanged();
  }, "Danh sách đã đổi — bấm lại"],
  ["thẻ <tr> bị tái dùng cho mã khác", (pos, r) => {
    r.code = "GR03999";
    pos.grListCtrl.onDomChanged();
  }, "Danh sách đã đổi — bấm lại"],
  ["route đổi sang trang khác mà không tải lại trang", (pos) => {
    pos.url = `${POS}/ban-hang`;
    pos.post({ mark: HOOK, type: "route", payload: { href: `${POS}/ban-hang` } });
  }, null],
  ["route đổi trong chính danh sách (query đổi, chưa có request mới)", (pos) => {
    pos.url = `${LIST_URL}?page=2`;
    pos.post({ mark: HOOK, type: "route", payload: { href: `${LIST_URL}?page=2` } });
  }, "Đã rời trang — huỷ lượt chuẩn bị"],
  ["phiên đăng nhập POS đổi (token khác, không có cửa hàng)", (pos) => pos.post(auth({ authorization: "Bearer khac", "x-client-id": "1" })), "Phiên đăng nhập / cửa hàng POS vừa đổi — bấm lại"],
];

for (const [name, change, title] of R2_CASES) {
  test(`R2: ${name} trong lúc đọc GR → huỷ cú bấm ngay, không tạo phiên`, async () => {
    const { b, srv, pos } = await openList();
    try {
      const release = hold(srv.st, "gr");
      const r = { code: "GR03878", connected: true };
      pos.grListCtrl.onSelect(r, GR_ID, "GR03878", "start");
      await until(() => calls(srv, /goods-receipt\/2de6c0ec/) === 1);
      change(pos, r);
      // Huỷ ngay khi GET GR vẫn đang treo — trước hạn hết giờ của GET (2 s trong trình duyệt giả).
      if (title) await until(() => pos.grListNotice && pos.grListNotice.title === `GR03878: ${title}`, 1500);
      else await settle(30);
      if (title) assert.equal(pos.view, null, `${name}: báo trong vùng thông báo của danh sách, không khung nổi`);
      release();
      await settle(120);
      assert.equal(b.session(KEY), null, name);
      assert.equal(nwTabs(b).length, 0, name);
      assert.equal(calls(srv, /\/po\//), 0, `${name}: dừng trước khi đọc PO`);
    } finally {
      b.close();
    }
  });
}

// URL đổi mà hook KHÔNG báo route (dự phòng chỉ dò mỗi 3 s): không có huỷ chủ động → phải dừng nhờ kiểm sau từng await.
test("R2: URL đổi mà hook không báo — khi đang đọc GR → dừng ngay sau GET GR; khi đang tìm theo SO → không tạo phiên", async () => {
  // GR trả về đã HOÀN THÀNH: kiểm ngay sau GET GR → "Danh sách đã đổi"; thiếu kiểm đó thì lộ lỗi trạng thái phiếu của một cú bấm đã hết hiệu lực.
  for (const [kind, server] of [["gr", { grStatus: "COMPLETED" }], ["search", {}]]) {
    const { b, srv, pos } = await openList({ server });
    try {
      const release = hold(srv.st, kind);
      pos.grListCtrl.onSelect({ code: "GR03878" }, GR_ID, "GR03878", "start");
      await until(() => calls(srv, kind === "gr" ? /goods-receipt\/2de6c0ec/ : /goods-receipt\/search/) === 1);
      pos.url = `${LIST_URL}?page=3`; // không post "route"
      release();
      await until(() => pos.grListNotice && /Danh sách đã đổi — bấm lại|chưa mở được Nextwaves/.test(pos.grListNotice.title));
      assert.match(pos.grListNotice.title, /Danh sách đã đổi — bấm lại/, kind);
      assert.equal(b.session(KEY), null, kind);
      assert.equal(nwTabs(b).length, 0, kind);
      if (kind === "gr") assert.equal(calls(srv, /\/po\//), 0, "dừng ngay sau GET GR");
    } finally {
      b.close();
    }
  }
});

test("GET GR hết giờ (mạng) → báo lỗi mạng, KHÔNG báo nhầm 'Danh sách đã đổi'; không tạo phiên", async () => {
  const { b, srv, pos } = await openList();
  try {
    hold(srv.st, "gr"); // treo quá hạn hết giờ GET (2 s trong trình duyệt giả)
    pos.grListCtrl.onSelect({ code: "GR03878" }, GR_ID, "GR03878", "start");
    await until(() => pos.grListNotice && /chưa mở được Nextwaves/.test(pos.grListNotice.title), 3500);
    assert.match(pos.grListNotice.lines.join("\n"), /Hết giờ \/ mất kết nối/);
    assert.equal(pos.grListNotice.tone, "err");
    assert.equal(pos.view, null, "lỗi trên danh sách: không khung nổi");
    assert.equal(b.session(KEY), null);
  } finally {
    b.close();
  }
});

test("R2: danh sách đổi ngay trước session:start (đang tìm GR theo SO) → huỷ; bấm lại sau khi ổn định → chạy bình thường", async () => {
  const { b, srv, pos } = await openList();
  try {
    const release = hold(srv.st, "search");
    pos.grListCtrl.onSelect({ code: "GR03878" }, GR_ID, "GR03878", "start");
    await until(() => calls(srv, /goods-receipt\/search/) === 1);
    pos.post(listReq(2));
    pos.post(listRes(2, 2, [ROW78]));
    await settle(30);
    release();
    await until(() => pos.grListNotice && pos.grListNotice.title === "GR03878: Danh sách đã đổi — bấm lại");
    assert.equal(b.session(KEY), null);
    assert.equal(nwTabs(b).length, 0);
    await until(() => model(pos, "GR03878") && model(pos, "GR03878").kind === "start" && !model(pos, "GR03878").disabled);
    pos.grListCtrl.onSelect({ code: "GR03878" }, GR_ID, "GR03878", "start");
    await until(() => b.session(KEY));
    assert.equal(nwTabs(b).length, 1);
    await until(() => pos.grListNotice === null);
    assert.equal(pos.grListNotice, null, "bấm lại thành công → thông báo huỷ cũ được dọn");
  } finally {
    b.close();
  }
});

test("GR đọc lại khác dòng danh sách: mã khác → 'Danh sách đã đổi'; đã HOÀN THÀNH → báo lỗi; PO không có SO → báo + ẩn nút dòng đó", async () => {
  for (const [server, expect] of [
    [{ grCode: "GR09999" }, /Danh sách đã đổi — bấm lại/],
    [{ grStatus: "COMPLETED" }, /chưa mở được Nextwaves/],
    [{ poNoSo: true }, /không nhận bằng RFID được/],
  ]) {
    const { b, pos } = await openList({ server });
    try {
      pos.grListCtrl.onSelect({ code: "GR03878" }, GR_ID, "GR03878", "start");
      await until(() => pos.grListNotice && expect.test(pos.grListNotice.title));
      assert.equal(pos.view, null, "báo trong vùng thông báo, không khung nổi");
      assert.ok(pos.grListNotice.buttons.some((x) => x.label === "Đóng"), "có nút Đóng");
      assert.equal(b.session(KEY), null, JSON.stringify(server));
      assert.equal(nwTabs(b).length, 0);
      if (server.poNoSo) await until(() => model(pos, "GR03878") === null);
    } finally {
      b.close();
    }
  }
});

test("bấm hai lần liên tiếp và bấm ở hai tab danh sách cùng lúc → một phiên, một tab Nextwaves", async () => {
  const { b, pos } = await openList();
  try {
    pos.grListCtrl.onSelect({ code: "GR03878" }, GR_ID, "GR03878", "start");
    pos.grListCtrl.onSelect({ code: "GR03878" }, GR_ID, "GR03878", "start");
    const pos2 = b.openTab(LIST_URL);
    pos2.post(POS_AUTH);
    pos2.post(listReq(1));
    pos2.post(listRes(1, 1, [ROW78]));
    await until(() => model(pos2, "GR03878"));
    pos2.grListCtrl.onSelect({ code: "GR03878" }, GR_ID, "GR03878", model(pos2, "GR03878").kind);
    await until(() => b.session(KEY));
    await settle(200);
    assert.equal(nwTabs(b).length, 1);
  } finally {
    b.close();
  }
});

test("S3 header: request thiếu x-store-id cùng token → giữ cửa hàng (nút còn); token khác không có cửa hàng → xoá nút tới khi POS gửi lại đủ", async () => {
  const { b, pos } = await openList();
  try {
    pos.post(auth({ authorization: "Bearer pos-test", "x-client-id": "1" }));
    await settle(80);
    assert.ok(model(pos, "GR03878"), "cùng token: giữ bộ đã xác nhận");
    pos.post(auth({ authorization: "Bearer token-khac", "x-client-id": "1" }));
    await until(() => pos.grListModel === null);
    pos.post(auth({ authorization: "Bearer token-khac", "x-client-id": "1", "x-store-id": STORE }));
    await until(() => model(pos, "GR03878"));
    pos.post(auth({ authorization: "Bearer token-khac", "x-client-id": "1", "x-store-id": OTHER_STORE }));
    await until(() => pos.grListModel === null || !model(pos, "GR03878"));
  } finally {
    b.close();
  }
});

test("trang phiếu: mở không tự tạo phiên / không mở Nextwaves; phiên đã có (tạo từ danh sách) → mở phiếu tự hiện trạng thái, không cần bấm", async () => {
  const { b, pos } = await openList();
  try {
    const gr = b.openTab(GR_PAGE);
    gr.post(POS_AUTH);
    await until(() => startBtn(gr));
    await settle(100);
    assert.equal(b.session(KEY), null);
    assert.equal(nwTabs(b).length, 0);
    pos.grListCtrl.onSelect({ code: "GR03878" }, GR_ID, "GR03878", "start");
    await until(() => b.session(KEY));
    const gr2 = b.openTab(GR_PAGE);
    gr2.post(POS_AUTH);
    await until(() => gr2.view && gr2.view.title === "Chờ nhận hàng trên Nextwaves");
    assert.equal(nwTabs(b).length, 1, "không mở thêm Nextwaves");
  } finally {
    b.close();
  }
});

test("trang không liên quan (bán hàng): không gọi API, không khung, không kích hoạt danh sách; hook báo route → vẫn im", async () => {
  const srv = makeServer();
  const b = createBrowser(srv.handle);
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(`${POS}/ban-hang`);
    pos.post(POS_AUTH);
    pos.post({ mark: HOOK, type: "route", payload: { href: `${POS}/ban-hang` } });
    await settle(150);
    assert.equal(srv.st.log.length, 0);
    assert.equal(pos.view, null);
    assert.equal(pos.grListActive, false);
  } finally {
    b.close();
  }
});

test("S4 background: returnUrl luôn là trang phiếu đúng GR — URL khác bị từ chối; grId phải là UUID", async () => {
  const srv = makeServer();
  const b = createBrowser(srv.handle);
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(LIST_URL);
    const base = { type: "session:start", envId: "STG", grId: GR_ID, grCode: "GR03878", posId: STORE, soBase: "SOBD1593858", warehouseId: H.STG_CTX.warehouseId };
    assert.match((await b.sendFromTab(pos, Object.assign({}, base, { returnUrl: "https://evil.example/" }))).error, /bad_return_url/);
    assert.match((await b.sendFromTab(pos, Object.assign({}, base, { returnUrl: LIST_URL }))).error, /bad_return_url/);
    assert.match((await b.sendFromTab(pos, Object.assign({}, base, { grId: "../../x" }))).error, /grId/);
    assert.equal(b.session(KEY), null);
    const ok = await b.sendFromTab(pos, Object.assign({}, base, { returnUrl: GR_PAGE }));
    assert.equal(ok.ok, true, ok.error);
    assert.equal(ok.data.returnUrl, GR_PAGE);
  } finally {
    b.close();
  }
});

test("ô cấp phép: chỉ ra ký tự làm mã bị từ chối (chữ O, ký tự ẩn, khoảng trắng); luật kiểm giữ nguyên", async () => {
  const b = createBrowser(makeServer().handle);
  try {
    const g = (grCode) => b.sendFromPopup({ type: "grant:create", envId: "STG", grCode });
    assert.match((await g("GRO3878")).error, /chữ O \(không phải số 0\) ở vị trí 3/);
    assert.match((await g("GR03​878")).error, /ký tự ẩn ở vị trí 5/);
    assert.match((await g("GR03 878")).error, /khoảng trắng ở vị trí 5/);
    assert.match((await g("PO03878")).error, /phải bắt đầu bằng GR/);
    assert.equal((await g(" gr03878 ")).ok, true, "khoảng trắng hai đầu và chữ thường vẫn nhận như trước");
  } finally {
    b.close();
  }
});
