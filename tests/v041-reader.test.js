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
    // Review v0.4.1 P3-5: đã bấm Ngắt (dù lock chưa nhả) = đã lấy: thử kết nối nhanh thêm vài lần, báo rõ; sau lượt vẫn nhắc Kết nối RFID.
    await until(() => nw.view && nw.view.lines.some((l) => /đã bấm Ngắt nhưng tab bán hàng chưa nhả đầu đọc — extension thử kết nối thêm vài lần/.test(l)), 3000);
    assert.equal(q.clicks, 1, "không bấm Ngắt lần hai");
    const n0 = connect.clicks;
    await until(() => connect.clicks > n0, 2000);
    assert.equal(connect.textContent, "Kết nối đầu đọc", "cổng vẫn bị giữ → chưa kết nối");
    closeModal(nw);
    await until(() => nw.view && nw.view.title === "Đầu đọc: nhận hàng xong", 3000);
    assert.equal(q.clicks, 1);
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

// Bọc listener của tab POS: đếm lệnh Ngắt (cgn:qsl-release) background gửi; `before()` chạy ngay trước khi tab POS xử lý lệnh (mô phỏng
// QR Scan Log đổi trạng thái giữa lúc background hỏi và lúc tab POS bấm).
function spyRelease(t, before) {
  const spy = { releases: 0 };
  const ls = t.ctx.runtimeListeners;
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    ls[i] = (msg, s, r) => {
      // Một message tới MỌI listener của tab (cùng lượt) → đếm / chạy before() một lần cho mỗi message.
      if (msg && msg.type === "cgn:qsl-release" && !spy.busy) {
        spy.busy = true;
        setImmediate(() => (spy.busy = false));
        spy.releases += 1;
        if (before) before();
      }
      return l(msg, s, r);
    };
  }
  return spy;
}

test("v0.4.1 QR Scan Log đổi trạng thái ngay trước cú bấm: bắt đầu gửi tem → background đọc lại, KHÔNG gửi lệnh Ngắt; lệnh đã gửi mà tab POS thấy đang gửi tem / thôi giữ cổng → KHÔNG bấm", async () => {
  for (const kind of ["bg_busy", "pos_busy", "pos_not_holding"]) {
    const b = createBrowser(server, { tuning });
    try {
      await b.setConfig({ mode: "STG", url: "" });
      const pos = b.openTab(SALE(1));
      const q = fakeQsl(pos);
      const nw = b.openTab(NW_PO);
      nwModal(nw, SHIP);
      const connect = nwConnect(nw, () => !q.lock);
      await until(() => btn(nw, "Lấy đầu đọc cho Nextwaves"), 3000);
      const spy = spyRelease(pos, kind === "pos_busy" ? () => (q.state = "processing") : kind === "pos_not_holding" ? () => (q.conn = "disconnected") : null);
      if (kind === "bg_busy") q.state = "processing";
      btn(nw, "Lấy đầu đọc cho Nextwaves").onClick();
      const want = kind === "pos_not_holding" ? /tab bán hàng không còn giữ đầu đọc/ : /tab bán hàng đang gửi tem vào giỏ — đợi gửi xong rồi bấm lại/;
      await until(() => nw.view && nw.view.lines.some((l) => want.test(l)), 3000);
      assert.equal(q.clicks, 0, `${kind}: không bấm Ngắt`);
      assert.equal(spy.releases, kind === "bg_busy" ? 0 : 1, `${kind}: số lệnh Ngắt background gửi tới tab POS`);
      assert.equal(connect.textContent, "Kết nối đầu đọc");
    } finally {
      b.close();
    }
  }
});

test("review v0.4.1 P2-1: tab POS đã rời trang Bán hàng (khung QR Scan Log ẩn) mà Web Lock vẫn bị giữ → nhận ra tab giữ, nút 'Lấy đầu đọc' bấm hộ Ngắt tab đó; lock KHÔNG bị giữ → không coi khung ẩn là đang giữ", async () => {
  // (a) khung ẩn + lock giữ → đúng một tab giữ (ẩn) → bấm hộ được
  {
    const b = createBrowser(server, { tuning });
    try {
      await b.setConfig({ mode: "STG", url: "" });
      const pos = b.openTab(`${POS}/danh-sach-phieu-nhan-hang`); // tab bán hàng đã chuyển sang trang khác bằng điều hướng trong trang
      const q = fakeQsl(pos, { displayed: false, releaseMs: 40 });
      const nw = b.openTab(NW_PO);
      nwModal(nw, SHIP);
      const connect = nwConnect(nw, () => !q.lock);
      await until(() => btn(nw, "Lấy đầu đọc cho Nextwaves"), 3000);
      assert.match(nw.view.lines.join("\n"), /một tab POS \(QR Scan Log, đang ở trang khác trang Bán hàng\) đang giữ/);
      assert.equal(q.clicks, 0);
      btn(nw, "Lấy đầu đọc cho Nextwaves").onClick();
      await until(() => connect.textContent === "Bắt đầu quét", 3000);
      assert.equal(q.clicks, 1, "bấm hộ nút Ngắt (đang ẩn) của đúng tab đó một lần");
    } finally {
      b.close();
    }
  }
  // (b) khung ẩn nhưng lock KHÔNG bị giữ (thuộc tính cũ) → không phải tab giữ → không nút bấm hộ, không bấm
  {
    const b = createBrowser(server, { tuning });
    try {
      await b.setConfig({ mode: "STG", url: "" });
      const pos = b.openTab(`${POS}/danh-sach-phieu-nhan-hang`);
      const q = fakeQsl(pos, { displayed: false });
      q.lock = false;
      const nw = b.openTab(NW_PO);
      nwModal(nw, SHIP);
      nwConnect(nw, () => false);
      await until(() => nw.view && nw.view.lines.some((l) => /chưa kết nối được\. Nếu tab bán hàng đang dùng RFID/.test(l)), 3000);
      assert.ok(!btn(nw, "Lấy đầu đọc cho Nextwaves"));
      assert.equal(q.clicks, 0);
    } finally {
      b.close();
    }
  }
});

test("review v0.4.1 P3-12: biết QR Scan Log đang giữ ngay sau lần tự bấm đầu tiên → nút 'Lấy đầu đọc' hiện sớm, không đợi hết 3 lần (mỗi lần cách 10 s)", async () => {
  const b = createBrowser(server, { tuning: Object.assign({}, tuning, { readerGapMs: 60000 }) });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(SALE(1));
    const q = fakeQsl(pos);
    const nw = b.openTab(NW_PO);
    nwModal(nw, SHIP);
    const connect = nwConnect(nw, () => !q.lock);
    await until(() => btn(nw, "Lấy đầu đọc cho Nextwaves"), 2000);
    assert.equal(connect.clicks, 1, "mới tự bấm một lần");
    assert.equal(q.clicks, 0, "chưa Ngắt khi dược sĩ chưa bấm");
  } finally {
    b.close();
  }
});

test("review v0.4.1: tab thứ hai bắt đầu giữ đầu đọc ngay trước cú bấm → background đọc lại thấy hai tab → KHÔNG gửi lệnh Ngắt; 'Mở tab bán hàng' không có tab nào → nói rõ trên khung", async () => {
  const b = createBrowser(server, { tuning });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const p1 = b.openTab(SALE(1));
    const q1 = fakeQsl(p1);
    const nw = b.openTab(NW_PO);
    nwModal(nw, SHIP);
    nwConnect(nw, () => !q1.lock);
    await until(() => btn(nw, "Lấy đầu đọc cho Nextwaves"), 3000);
    const p2 = b.openTab(SALE(2));
    const q2 = fakeQsl(p2);
    const s1 = spyRelease(p1);
    const s2 = spyRelease(p2);
    btn(nw, "Lấy đầu đọc cho Nextwaves").onClick();
    await until(() => nw.view && nw.view.lines.some((l) => /có nhiều tab bán hàng đang mở/.test(l)), 3000);
    assert.deepEqual([s1.releases, s2.releases, q1.clicks, q2.clicks], [0, 0, 0, 0]);
  } finally {
    b.close();
  }
  // Không còn tab POS nào → "Mở tab bán hàng" báo rõ (trước: im lặng).
  const c = createBrowser(server, { tuning });
  try {
    await c.setConfig({ mode: "STG", url: "" });
    const nw = c.openTab(NW_PO);
    nwModal(nw, SHIP);
    nwConnect(nw, () => false);
    await until(() => btn(nw, "Mở tab bán hàng"), 3000);
    btn(nw, "Mở tab bán hàng").onClick();
    await until(() => nw.view && nw.view.lines.some((l) => /không thấy tab POS nào đang mở trang Bán hàng/.test(l)), 3000);
  } finally {
    c.close();
  }
});

test("review v0.4.1 P3-15: màn quét /receive KHÔNG có phiên mà modal nhận hàng mở → vẫn có khung đầu đọc (không bị ẩn khi trang đánh giá lại)", async () => {
  const b = createBrowser(server, { tuning });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(SALE(1));
    const q = fakeQsl(pos);
    const nw = b.openTab(`${NW}/vi/purchases/receive?po=SOBD7777777`);
    nwModal(nw, SHIP);
    nwConnect(nw, () => !q.lock);
    await until(() => btn(nw, "Lấy đầu đọc cho Nextwaves"), 3000);
    assert.equal(nw.view.title, "Đầu đọc cho màn nhận hàng");
    // Trang đánh giá lại (đổi cấu hình → refresh) khi modal còn mở: khung đầu đọc phải còn (trước: panel.hide()).
    const n = nw.views.length;
    const h = nw.hides;
    await b.setConfig({ mode: "STG", url: "", nwTenant: "" });
    await until(() => nw.views.length > n, 2000);
    await settle(60);
    assert.ok(btn(nw, "Lấy đầu đọc cho Nextwaves"), "khung đầu đọc còn sau khi trang đánh giá lại");
    // Khung cuối chưa đủ: lượt hỏi QR Scan Log kế tiếp vẽ lại ngay, nên ẩn rồi hiện lại vẫn ra cùng khung — đếm lần ẩn.
    assert.equal(nw.hides, h, "khung đầu đọc không bị ẩn lúc trang đánh giá lại");
  } finally {
    b.close();
  }
});

test("review v0.4.1 P3-15: lời nhắc “Kết nối RFID” sau lượt (trang PO Nextwaves, KHÔNG phiên) còn nguyên khi trang đánh giá lại", async () => {
  const b = createBrowser(server, { tuning });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(SALE(1));
    const q = fakeQsl(pos);
    const nw = b.openTab(NW_PO);
    nwModal(nw, SHIP);
    const connect = nwConnect(nw, () => !q.lock);
    await until(() => btn(nw, "Lấy đầu đọc cho Nextwaves"), 3000);
    btn(nw, "Lấy đầu đọc cho Nextwaves").onClick();
    await until(() => connect.textContent === "Bắt đầu quét", 3000);
    await until(() => nw.view && nw.view.lines.some((l) => /Đã lấy từ tab bán hàng/.test(l)), 3000);
    closeModal(nw);
    await until(() => nw.view && nw.view.title === "Đầu đọc: nhận hàng xong", 3000);
    const n = nw.views.length;
    const h = nw.hides;
    await b.setConfig({ mode: "STG", url: "", nwTenant: "" });
    await until(() => nw.views.length > n, 2000);
    await settle(60);
    assert.equal(nw.view && nw.view.title, "Đầu đọc: nhận hàng xong", "lời nhắc còn sau khi trang đánh giá lại");
    assert.equal(nw.hides, h, "lời nhắc không bị ẩn lúc trang đánh giá lại");
  } finally {
    b.close();
  }
});

test("review v0.4.1 P3-10: QR Scan Log đang giữ nhưng nút Ngắt của nó đang tắt → không đưa nút 'Lấy đầu đọc' (bấm sẽ hỏng), hướng dẫn mở tab bán hàng", async () => {
  const b = createBrowser(server, { tuning });
  try {
    await b.setConfig({ mode: "STG", url: "" });
    const pos = b.openTab(SALE(1));
    const q = fakeQsl(pos, { disabled: true });
    const nw = b.openTab(NW_PO);
    nwModal(nw, SHIP);
    nwConnect(nw, () => !q.lock);
    await until(() => nw.view && nw.view.lines.some((l) => /nút Ngắt của QR Scan Log đang tắt — bấm “Mở tab bán hàng”/.test(l)), 3000);
    assert.ok(!btn(nw, "Lấy đầu đọc cho Nextwaves"));
    assert.ok(btn(nw, "Mở tab bán hàng"));
    assert.equal(q.clicks, 0);
  } finally {
    b.close();
  }
});
