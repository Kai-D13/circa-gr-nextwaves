"use strict";
// v0.4.1 — đầu đọc bị QR Scan Log giữ (operator 08/11: bấm hộ "Ngắt kết nối" của QR Scan Log, CHỈ khi dược sĩ bấm nút trên Nextwaves).
// QR Scan Log giả dựng theo hợp đồng tạm (docs/dev/REQUEST-QSL-v0.4.1-DAU-DOC.md §3): host #circa-rfid-demo-root (shadow open), panel
// #circa-rfid-demo-panel data-connection / data-state, button[data-action="disconnect"], Web Lock "circa-qr-scan-log:rfid-reader".
// Modal nhận hàng Nextwaves giả theo samples/nw-stg-receive-modal-markers-20261108.json (#scan-receive-qr trong [role=dialog]).
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { pos: P } = H.lib();
const { createBrowser, until, settle, closeAll } = require("./browser-sim.js");

test.afterEach(() => closeAll());

const POS = "https://pos.stg.circa-v2.buymed.tech";
const NW = "https://circa-stg.nextwaves.app";
const NW_PRD = "https://circa.nextwaves.app";
const SALE = (n) => `${POS}/ban-hang/aaaaaaaa-0000-4000-8000-00000000000${n}`;
const NW_PO = `${NW}/vi/purchases/8932565c-6ade-4552-a419-ac8c6fafac5c`;
const SHIP = "IT-BUYMED-STAG-20261012083025-6398";
const server = async () => ({ status: 404, json: {} });
const tuning = { readerFirstClickMs: 20, readerGapMs: 40, readerFastGapMs: 20, readerPollMs: 20, qslAskMs: 30, qslPollMs: 10, qslReleaseMs: 400 };

function nwModal(t, shipment) {
  const dlg = { textContent: `Nhận hàng bằng cách quét Quét tem của phiếu gửi ${shipment}. Hàng được nhận vào CIRCA FLORITA.` };
  t.dom.byId["scan-receive-qr"] = { closest: (sel) => (sel === '[role="dialog"]' ? dlg : null) };
}
const closeModal = (t) => delete t.dom.byId["scan-receive-qr"];

// QR Scan Log giả: giữ cổng (Web Lock) tới khi bấm Ngắt; nhả lock sau releaseMs.
function fakeQsl(t, opts = {}) {
  const q = { conn: opts.conn || "connected", state: opts.state || "idle", clicks: 0, lock: true, displayed: opts.displayed !== false, disabled: !!opts.disabled };
  const panel = { getAttribute: (n) => (n === "data-connection" ? q.conn : n === "data-state" ? q.state : null) };
  const btn = {
    get disabled() {
      return q.disabled;
    },
    click: () => {
      q.clicks += 1;
      q.conn = "disconnected";
      if (opts.neverRelease) return;
      setTimeout(() => (q.lock = false), opts.releaseMs || 30);
    },
  };
  const host = {
    get style() {
      return { display: q.displayed ? "" : "none" };
    },
    shadowRoot: { querySelector: (sel) => (sel === "#circa-rfid-demo-panel" ? panel : sel === 'button[data-action="disconnect"]' ? btn : null) },
  };
  t.dom.byId["circa-rfid-demo-root"] = host;
  t.dom.locks = () => (q.lock ? [{ name: "circa-qr-scan-log:rfid-reader" }] : []);
  return q;
}

// Nút "Kết nối đầu đọc" của Nextwaves: bấm chỉ kết nối được khi cổng trống.
function nwConnect(t, portFree) {
  const b = {
    textContent: "Kết nối đầu đọc",
    disabled: false,
    clicks: 0,
    click() {
      b.clicks += 1;
      if (portFree()) b.textContent = "Bắt đầu quét";
    },
  };
  t.dom.buttons = [b];
  return b;
}
const btn = (t, label) => t.view && (t.view.buttons || []).find((x) => x.label === label);

test("v0.4.1 qslView (chỉ đọc): không có QR Scan Log / ẩn ngoài trang bán hàng / đang giữ / đang gửi tem / nút tắt", () => {
  assert.deepEqual(P.qslView({ getElementById: () => null }).present, false);
  assert.deepEqual(P.qslView(null).present, false);
  const mk = (o) => {
    const t = { dom: { byId: {} } };
    const q = fakeQsl(t, o);
    return { v: P.qslView({ getElementById: (id) => t.dom.byId[id] || null }), q };
  };
  let { v } = mk({});
  assert.deepEqual([v.present, v.displayed, v.connection, v.holding, v.busy, !!v.button], [true, true, "connected", true, false, true]);
  ({ v } = mk({ displayed: false }));
  assert.equal(v.holding, false, "khung ẩn (ngoài /ban-hang/<UUID>) → coi như không giữ (panel có thể cũ)");
  ({ v } = mk({ state: "processing" }));
  assert.deepEqual([v.holding, v.busy], [true, true]);
  ({ v } = mk({ conn: "disconnected" }));
  assert.equal(v.holding, false);
  ({ v } = mk({ disabled: true }));
  assert.equal(v.button, null);
  for (const c of ["waiting_clear", "paused"]) assert.equal(mk({ conn: c }).v.holding, true, c);
});

test("v0.4.1 modal nhận hàng mở thẳng từ trang PO (KHÔNG phiên), QR Scan Log giữ cổng: tự bấm 3 lần → nút 'Lấy đầu đọc cho Nextwaves' → bấm hộ Ngắt ĐÚNG một lần, chờ nhả lock → kết nối ngay → đóng modal → nhắc Kết nối RFID", async () => {
  const b = createBrowser(server, { tuning });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(SALE(1));
    const q = fakeQsl(pos, { releaseMs: 60 });
    const nw = b.openTab(NW_PO);
    nwModal(nw, SHIP);
    const connect = nwConnect(nw, () => !q.lock);
    await until(() => connect.clicks === 3, 3000);
    await until(() => btn(nw, "Lấy đầu đọc cho Nextwaves"), 3000);
    assert.equal(nw.view.title, "Đầu đọc cho màn nhận hàng");
    assert.match(nw.view.lines.join("\n"), /tab bán hàng \(QR Scan Log\) đang giữ — bấm “Lấy đầu đọc cho Nextwaves”/);
    assert.match(nw.view.lines.join("\n"), new RegExp(`Phiếu gửi ${SHIP}`));
    await settle(200);
    assert.equal(q.clicks, 0, "không bao giờ tự Ngắt khi dược sĩ chưa bấm");
    assert.equal(connect.clicks, 3, "hết lượt tự bấm → chờ dược sĩ");
    btn(nw, "Lấy đầu đọc cho Nextwaves").onClick();
    await until(() => connect.textContent === "Bắt đầu quét", 3000);
    assert.equal(q.clicks, 1, "bấm hộ Ngắt đúng một lần");
    assert.ok(!q.lock, "chỉ kết nối sau khi QR Scan Log nhả lock");
    await until(() => nw.view && nw.view.lines.some((l) => /Đã lấy từ tab bán hàng/.test(l)), 3000);
    closeModal(nw);
    await until(() => nw.view && nw.view.title === "Đầu đọc: nhận hàng xong", 3000);
    assert.match(nw.view.lines.join("\n"), /bấm “Kết nối RFID” \(chọn cổng\)/);
  } finally {
    b.close();
  }
});

test("v0.4.1 QR Scan Log đang gửi tem vào giỏ (processing) → không có nút bấm hộ, báo đợi; gửi xong → nút hiện", async () => {
  const b = createBrowser(server, { tuning });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(SALE(1));
    const q = fakeQsl(pos, { state: "processing" });
    const nw = b.openTab(NW_PO);
    nwModal(nw, SHIP);
    nwConnect(nw, () => !q.lock);
    await until(() => nw.view && nw.view.lines.some((l) => /đang gửi tem vào giỏ/.test(l)), 3000);
    assert.ok(!btn(nw, "Lấy đầu đọc cho Nextwaves"));
    assert.ok(btn(nw, "Mở tab bán hàng"));
    q.state = "idle";
    await until(() => btn(nw, "Lấy đầu đọc cho Nextwaves"), 3000);
    assert.equal(q.clicks, 0);
  } finally {
    b.close();
  }
});

test("v0.4.1 hai tab bán hàng cùng hiện QR Scan Log đang giữ → không bấm hộ (không biết tab nào), chỉ 'Mở tab bán hàng'", async () => {
  const b = createBrowser(server, { tuning });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const p1 = b.openTab(SALE(1));
    const p2 = b.openTab(SALE(2));
    const q1 = fakeQsl(p1);
    const q2 = fakeQsl(p2);
    const nw = b.openTab(NW_PO);
    nwModal(nw, SHIP);
    nwConnect(nw, () => false);
    await until(() => nw.view && nw.view.lines.some((l) => /nhiều tab bán hàng đang mở/.test(l)), 3000);
    assert.ok(!btn(nw, "Lấy đầu đọc cho Nextwaves"));
    const before = p1.focusCount + p2.focusCount;
    btn(nw, "Mở tab bán hàng").onClick();
    await until(() => p1.focusCount + p2.focusCount > before, 2000);
    assert.equal(q1.clicks + q2.clicks, 0);
  } finally {
    b.close();
  }
});

test("v0.4.1 bấm hộ Ngắt nhưng QR Scan Log không nhả lock → báo đợi rồi bấm lại, không kết nối", async () => {
  const b = createBrowser(server, { tuning });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(SALE(1));
    const q = fakeQsl(pos, { neverRelease: true });
    const nw = b.openTab(NW_PO);
    nwModal(nw, SHIP);
    const connect = nwConnect(nw, () => !q.lock);
    await until(() => btn(nw, "Lấy đầu đọc cho Nextwaves"), 3000);
    btn(nw, "Lấy đầu đọc cho Nextwaves").onClick();
    await until(() => nw.view && nw.view.lines.some((l) => /chưa nhả đầu đọc — đợi vài giây rồi bấm lại/.test(l)), 3000);
    assert.equal(q.clicks, 1);
    assert.equal(connect.textContent, "Kết nối đầu đọc");
  } finally {
    b.close();
  }
});

test("v0.4.1 modal nhận hàng trên Nextwaves KHÁC tenant đang chọn → extension không đụng (không bấm kết nối, không hỏi QR Scan Log)", async () => {
  const b = createBrowser(server, { tuning });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(SALE(1));
    const q = fakeQsl(pos);
    const nw = b.openTab(`${NW_PRD}/vi/purchases/8932565c-6ade-4552-a419-ac8c6fafac5c`);
    nwModal(nw, SHIP);
    const connect = nwConnect(nw, () => !q.lock);
    await settle(400);
    assert.equal(connect.clicks, 0);
    assert.equal(q.clicks, 0);
    assert.ok(!nw.view || nw.viewKind === null || nw.view.title !== "Đầu đọc cho màn nhận hàng");
  } finally {
    b.close();
  }
});

test("v0.4.1 không mở modal → readerTick không quét / bấm nút đầu đọc trên trang Nextwaves (audit P3-10)", async () => {
  const b = createBrowser(server, { tuning });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const nw = b.openTab(NW_PO);
    const connect = nwConnect(nw, () => true);
    await settle(300);
    assert.equal(connect.clicks, 0);
  } finally {
    b.close();
  }
});
