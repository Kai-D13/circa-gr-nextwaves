"use strict";
// v0.2.4 — khung trong luồng trang phiếu (ui/panel.js createInlinePanel) chạy THẬT trên DOM tối thiểu (tests/fake-dom.js).
// PM audit sơ bộ 27/10 (docs/pm/AUDIT-PRELIM-v0.2.4-P2-20261027.md): P1 kiểm lại mã phiếu ngay lúc hỏi "khung có gắn đúng phiếu
// không" (kể cả trước khi observer kịp chạy); P2 cảnh báo đổi nội dung khi đang thu nhỏ → mở lại. Bố cục thật: scripts/edge-gr-page.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDom } = require("./fake-dom.js");
const { createInlinePanel } = require("../src/ui/panel.js");
const { grPageAnchor } = require("../src/lib/pos-model.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Trang phiếu rút gọn: cột nội dung = breadcrumb, thẻ thông tin, #all-receipt (như DOM thật GR03887).
function grPage(code) {
  const dom = createDom();
  const uninstall = dom.install();
  const col = dom.el("div");
  const crumb = dom.el("div", `Kho hàngDanh sách phiếu nhận hàngPhiếu nhận hàng ${code}`);
  const info = dom.el("div", `Chi tiết phiếu nhận hàng ${code} (PO00006767)Chờ nhận`);
  const anchor = dom.el("div", "Danh sách sản phẩm nhập kho", "all-receipt");
  col.append(crumb, info, anchor);
  dom.document.body.appendChild(col);
  dom.flush();
  // Chỗ gắn THẬT mà pos/pos-content.js dùng.
  const find = (c) => grPageAnchor(dom.document, c);
  // Sửa nút chữ, giữ node. `boxes` mặc định cả breadcrumb + thẻ thông tin.
  const setCode = (from, to, boxes = [crumb, info]) => {
    for (const box of boxes) for (const t of box.childNodes) if (t.nodeType === 3) t.data = t.data.replaceAll(from, to);
  };
  const hosts = () => dom.all(dom.document.documentElement, (e) => e.hasAttribute("data-cgn-panel"));
  const buttons = (host) => dom.all(host, (e) => e.tagName === "BUTTON");
  const button = (host, label) => buttons(host).find((b) => b.textContent === label);
  const boxOf = (host) => dom.all(host, (e) => /(^| )box( |$)/.test(e.className))[0];
  return { dom, uninstall, col, crumb, info, anchor, find, setCode, hosts, button, boxOf };
}

const FILL = { tone: "info", title: "Đã có cấp phép điền GR03887 (1 lần)", lines: ["Kế hoạch #ABCDEF12"], buttons: [{ label: "Điền vào phiếu GR03887 · kế hoạch #ABCDEF12 (15 UID)", onClick: () => {} }, { label: "Huỷ phiên", secondary: true, onClick: () => {} }] };

test("P1: anchoredFor kiểm lại mã phiếu NGAY LÚC GỌI — thẻ thông tin đổi sang GR khác, giữ nguyên #all-receipt, observer chưa chạy → false; observer chạy → gỡ khung; mã đúng trở lại → gắn lại", () => {
  const p = grPage("GR03887");
  try {
    const panel = createInlinePanel("GR ← Nextwaves", { find: p.find, waitMs: 60000 });
    panel.show(FILL, "GR03887");
    assert.equal(p.hosts().length, 1);
    assert.equal(p.hosts()[0].nextElementSibling, p.anchor, "khung ngay trước #all-receipt");
    assert.equal(panel.anchoredFor("GR03887"), true);
    assert.equal(panel.anchoredFor("GR03888"), false, "mã khác mã của view");

    p.setCode("GR03887", "GR03888"); // React đổi chữ, giữ node #all-receipt; observer CHƯA chạy
    assert.equal(panel.anchoredFor("GR03887"), false, "đọc lại mã trên trang ngay lúc gọi, không tin trạng thái đã gắn");
    p.dom.flush();
    assert.equal(p.hosts().length, 0, "observer: khung không còn nằm cạnh bảng của phiếu khác");
    assert.equal(panel.anchoredFor("GR03887"), false);

    p.setCode("GR03888", "GR03887");
    p.dom.flush();
    assert.equal(p.hosts().length, 1, "mã đúng trở lại → gắn lại");
    assert.equal(p.hosts()[0].nextElementSibling, p.anchor);
    assert.equal(panel.anchoredFor("GR03887"), true);
    panel.hide();
  } finally {
    p.uninstall();
  }
});

test("P2: đang thu nhỏ — cảnh báo giữ nguyên tiêu đề + nút nhưng đổi nội dung → tự mở lại; vẽ lại cùng nội dung → giữ thu nhỏ (không mở lại vô hạn)", () => {
  const p = grPage("GR03887");
  try {
    const panel = createInlinePanel("GR ← Nextwaves", { find: p.find, waitMs: 60000 });
    const warn = (reason) => Object.assign({}, FILL, { tone: "warn", lines: [`Lần điền trước dừng: ${reason}`, "Kế hoạch #ABCDEF12"] });
    panel.show(warn("POS từ chối ghi (HTTP 500)"), "GR03887");
    const host = p.hosts()[0];
    p.button(host, "–").click();
    assert.match(p.boxOf(host).className, /\bmin\b/, "đã thu nhỏ");
    panel.show(warn("POS từ chối ghi (HTTP 500)"), "GR03887");
    assert.match(p.boxOf(host).className, /\bmin\b/, "cùng nội dung: giữ thu nhỏ");
    panel.show(warn("Phiếu vừa bị thay đổi (quét tay hoặc tab khác) — dừng để không ghi đè"), "GR03887");
    assert.doesNotMatch(p.boxOf(host).className, /\bmin\b/, "nội dung cảnh báo đổi: mở lại");
    // Bảng đổi (vd. kế hoạch mới) cũng là nội dung.
    const t1 = Object.assign({}, FILL, { table: { head: ["Lô"], rows: [["A"]] } });
    panel.show(t1, "GR03887");
    p.button(host, "–").click();
    panel.show(Object.assign({}, t1), "GR03887");
    assert.match(p.boxOf(host).className, /\bmin\b/, "cùng bảng: giữ thu nhỏ");
    panel.show(Object.assign({}, t1, { table: { head: ["Lô"], rows: [["A"], ["B"]] } }), "GR03887");
    assert.doesNotMatch(p.boxOf(host).className, /\bmin\b/, "bảng đổi: mở lại");
    // View không cần thao tác (đang chờ, chỉ nút phụ) đổi nội dung: giữ thu nhỏ.
    p.button(host, "–").click();
    panel.show({ tone: "busy", title: "Đang điền 1/5", lines: ["lô A: 0 → 1"] }, "GR03887");
    panel.show({ tone: "busy", title: "Đang điền 2/5", lines: ["lô B: 0 → 1"] }, "GR03887");
    assert.match(p.boxOf(host).className, /\bmin\b/);
    panel.hide();
  } finally {
    p.uninstall();
  }
});

test("vẽ lại: khung bị gỡ → gắn lại MỘT khung trước anchor mới; khung đúng chỗ → lượt observer không gắn lại (không vòng)", () => {
  const p = grPage("GR03887");
  try {
    const panel = createInlinePanel("GR ← Nextwaves", { find: p.find, waitMs: 60000 });
    panel.show(FILL, "GR03887");
    const first = p.hosts()[0];
    assert.ok(p.dom.flush() <= 2, "gắn xong thì yên");
    p.info.appendChild(p.dom.el("span", "x")); // trang đổi chỗ khác
    assert.ok(p.dom.flush() <= 1);
    assert.equal(p.hosts()[0], first, "không gắn lại khi đã đúng chỗ");
    const fresh = p.dom.el("div", "Danh sách sản phẩm nhập kho", "all-receipt");
    first.remove();
    p.anchor.replaceWith(fresh);
    p.dom.flush();
    assert.equal(p.hosts().length, 1);
    assert.equal(p.hosts()[0].nextElementSibling, fresh, "trước anchor mới");
    assert.equal(panel.anchoredFor("GR03887"), true);
    panel.hide();
    assert.equal(p.hosts().length, 0);
    assert.equal(p.dom.observerCount(), 0, "ẩn → gỡ observer");
  } finally {
    p.uninstall();
  }
});

test("trang tranh giành (gỡ khung mỗi lần gắn) → bỏ sau maxPlaces, onMissing('unstable'), không còn khung, observer gỡ", () => {
  const p = grPage("GR03887");
  try {
    const reasons = [];
    const panel = createInlinePanel("GR ← Nextwaves", { find: p.find, waitMs: 60000, onMissing: (r) => reasons.push(r) });
    panel.show(FILL, "GR03887");
    for (let i = 0; i < 40 && !reasons.length; i++) {
      for (const h of p.hosts()) h.remove();
      p.dom.flush();
    }
    assert.deepEqual(reasons, ["unstable"]);
    assert.equal(p.hosts().length, 0);
    assert.equal(panel.anchoredFor("GR03887"), false);
    assert.equal(p.dom.observerCount(), 0);
    panel.hide();
  } finally {
    p.uninstall();
  }
});

test("thiếu #all-receipt → không chèn vào body, sau waitMs onMissing('missing'); anchor xuất hiện → gắn + onFound()", async () => {
  const p = grPage("GR03887");
  try {
    p.anchor.remove();
    p.dom.flush();
    const ev = [];
    const panel = createInlinePanel("GR ← Nextwaves", { find: p.find, waitMs: 40, pollMs: 5, onMissing: (r) => ev.push(r), onFound: () => ev.push("found") });
    panel.show(FILL, "GR03887");
    assert.equal(p.hosts().length, 0, "không có chỗ gắn thì không có khung (không vào body)");
    await sleep(80);
    assert.deepEqual(ev, ["missing"]);
    assert.equal(panel.anchoredFor("GR03887"), false);
    p.col.appendChild(p.anchor);
    p.dom.flush();
    assert.deepEqual(ev, ["missing", "found"]);
    assert.equal(p.hosts()[0].nextElementSibling, p.anchor);
    assert.equal(panel.anchoredFor("GR03887"), true);
    panel.hide();
  } finally {
    p.uninstall();
  }
});

test("grPageAnchor (PM audit rev 1 P1): mã chuẩn = thẻ thông tin (khối ngay trước #all-receipt) khớp CHÍNH XÁC; breadcrumb mang mã khác → null; khung extension đứng giữa không tính", () => {
  const p = grPage("GR03887");
  try {
    const { document: doc } = p.dom;
    assert.equal(grPageAnchor(doc, "GR03887"), p.anchor, "thẻ thông tin + breadcrumb cùng GR03887");
    assert.equal(grPageAnchor(doc, null), p.anchor, "view chưa biết phiếu: chỉ cần #all-receipt");
    assert.equal(grPageAnchor(doc, "GR0388"), null, "khớp chính xác, không phải chuỗi con");
    assert.equal(grPageAnchor(doc, "GR038870"), null);

    p.setCode("GR03887", "GR03888", [p.info]); // thẻ thông tin đã là GR03888, breadcrumb còn GR03887
    assert.equal(grPageAnchor(doc, "GR03887"), null, "thẻ thông tin khác mã: breadcrumb không tự mở khoá");
    assert.equal(grPageAnchor(doc, "GR03888"), null, "breadcrumb còn mã cũ: chưa rõ trang hiện phiếu nào");
    p.setCode("GR03888", "GR03887", [p.info]);

    p.setCode("GR03887", "GR03888", [p.crumb]); // đối xứng: breadcrumb GR03888, thẻ thông tin GR03887
    assert.equal(grPageAnchor(doc, "GR03887"), null, "breadcrumb bất đồng → fail closed");
    p.setCode("GR03888", "GR03887", [p.crumb]);

    p.crumb.textContent = "Kho hàngDanh sách phiếu nhận hàng"; // breadcrumb không có mã: chỉ thẻ thông tin quyết
    assert.equal(grPageAnchor(doc, "GR03887"), p.anchor);
    assert.equal(grPageAnchor(doc, "GR0388"), null, "khớp chính xác trên thẻ thông tin (không nhờ breadcrumb)");
    assert.equal(grPageAnchor(doc, "R03887"), null);

    p.info.appendChild(p.dom.el("span", "Phiếu liên quan GR09999")); // thẻ thông tin có HAI mã GR → không rõ
    assert.equal(grPageAnchor(doc, "GR03887"), null);
    p.info.childNodes[p.info.childNodes.length - 1].remove();

    const panel = createInlinePanel("GR ← Nextwaves", { find: (c) => grPageAnchor(doc, c), waitMs: 60000 });
    panel.show(FILL, "GR03887"); // khung (chữ có "GR03887") chèn giữa thẻ thông tin và #all-receipt
    assert.equal(p.hosts().length, 1);
    assert.equal(grPageAnchor(doc, "GR03887"), p.anchor, "bỏ qua khung để tìm thẻ thông tin");
    p.setCode("GR03887", "GR03888", [p.info]);
    assert.equal(grPageAnchor(doc, "GR03887"), null, "chữ của chính khung không thay được thẻ thông tin");
    assert.equal(panel.anchoredFor("GR03887"), false);
    panel.hide();

    p.info.remove();
    assert.equal(grPageAnchor(doc, "GR03887"), null, "không có thẻ thông tin trước bảng → null");
  } finally {
    p.uninstall();
  }
});

test("P1 (PM audit rev 1): CHỈ thẻ thông tin đổi sang GR khác (breadcrumb còn mã cũ, giữ #all-receipt), observer chưa chạy → anchoredFor false; observer → gỡ khung", () => {
  const p = grPage("GR03887");
  try {
    const panel = createInlinePanel("GR ← Nextwaves", { find: p.find, waitMs: 60000 });
    panel.show(FILL, "GR03887");
    assert.equal(panel.anchoredFor("GR03887"), true);
    p.setCode("GR03887", "GR03888", [p.info]);
    assert.equal(panel.anchoredFor("GR03887"), false);
    p.dom.flush();
    assert.equal(p.hosts().length, 0);
    p.setCode("GR03888", "GR03887", [p.info]);
    p.dom.flush();
    assert.equal(panel.anchoredFor("GR03887"), true);
    panel.hide();
  } finally {
    p.uninstall();
  }
});
