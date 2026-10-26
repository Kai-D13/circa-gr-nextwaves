"use strict";
// v0.1.6 (operator 26/10): khung extension che nút HOÀN THÀNH của POS → khung tự nâng lên trên nút thao tác của trang.
// Phần hình học (liftFor) kiểm ở đây; bố cục thật kiểm trên Edge bằng scripts/edge-check.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { liftFor } = require("../src/ui/panel.js");

const VH = 720;
// Khung mặc định: right 16, rộng 460 trên cửa sổ 1280 → left 804, right 1264.
const BOX = { left: 804, right: 1264, height: 300 };
const rect = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h });

test("liftFor: không có nút cần tránh → giữ mép dưới 16px", () => {
  assert.equal(liftFor(BOX, [], VH), 16);
  assert.equal(liftFor(BOX, undefined, VH), 16);
});

test("liftFor: nút HOÀN THÀNH góc dưới phải nằm dưới khung → khung nâng lên trên nút, hở 12px", () => {
  const done = rect(1076, 664, 180, 44); // right 24, bottom 12
  const b = liftFor(BOX, [done], VH);
  assert.equal(b, VH - 664 + 12);
  const boxBottomEdge = VH - b;
  assert.ok(boxBottomEdge <= done.top - 12, "mép dưới khung ở trên nút");
});

test("liftFor: nút không chồng khung (lệch ngang / ở trên cao) → không nâng", () => {
  assert.equal(liftFor(BOX, [rect(100, 664, 180, 44)], VH), 16, "nút góc trái");
  assert.equal(liftFor(BOX, [rect(1076, 100, 180, 44)], VH), 16, "nút phía trên, ngoài vùng khung");
  assert.equal(liftFor(BOX, [rect(1076, 664, 0, 44)], VH), 16, "nút ẩn (rộng 0)");
});

test("liftFor: hai nút chồng nhau theo chiều dọc (HUỶ trên HOÀN THÀNH) → nâng qua cả hai", () => {
  const done = rect(1076, 664, 180, 44);
  const cancel = rect(1076, 610, 180, 44);
  const b = liftFor(BOX, [done, cancel], VH);
  assert.equal(b, VH - 610 + 12);
});

test("liftFor: cửa sổ thấp → không đẩy khung ra khỏi mép trên (chừa dải tiêu đề)", () => {
  const b = liftFor({ left: 804, right: 1264, height: 300 }, [rect(1076, 20, 180, 44)], 120);
  assert.ok(b <= 120 - 8 - 40, `bottom ${b}`);
});

test("content script khai đúng nút cần tránh: POS 'HOÀN THÀNH' / 'Hủy', Nextwaves 'Xác nhận nhận hàng' (không phân biệt hoa thường, NFC)", () => {
  const lit = (file) => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", file), "utf8");
    const m = src.match(/createPanel\("GR ← Nextwaves", \{ avoidButtons: (\/.+\/[a-z]*) \}\)/);
    assert.ok(m, `${file}: thiếu avoidButtons`);
    return new Function(`return ${m[1]};`)();
  };
  const norm = (s) => s.normalize("NFC").replace(/\s+/g, " ").trim();
  const pos = lit("pos/pos-content.js");
  for (const s of ["HOÀN THÀNH", "Hoàn thành", "  HOÀN   THÀNH ", "HOÀN THÀNH".normalize("NFD"), "Hủy", "HUỶ PHIẾU"]) assert.ok(pos.test(norm(s)), s);
  for (const s of ["Hoàn thành phiếu khác", "In tem toàn bộ sản phẩm", "Điền vào phiếu GR03878"]) assert.ok(!pos.test(norm(s)), s);
  const nw = lit("nw/nw-content.js");
  assert.ok(nw.test(norm("Xác nhận nhận hàng")));
  assert.ok(nw.test(norm("XÁC NHẬN NHẬN HÀNG")));
  assert.ok(!nw.test(norm("Kết nối đầu đọc")));
});
