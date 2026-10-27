// Đột biến phần DOM (pos/gr-list.js, ui/panel.js, chỗ gắn khung lib/pos-model.js grPageAnchor) — bộ test Node dùng bộ giả grList / panel
// nên chỉ Edge thật bắt được. Mỗi ca: chép src/ sang thư mục tạm, gỡ đúng MỘT hàng rào, chạy script Edge của ca trên bản đó; script
// phải thoát khác 0 (có mục HỎNG, hoặc treo quá giờ) = KILLED.
//   node scripts/mutate-edge-v0.2.4.js          # mọi ca (9 ca v0.2.3 trên edge-check.js + 12 ca P2 + 2 ca PM audit sơ bộ + 2 ca PM audit rev 1 trên edge-gr-page.js)
//   node scripts/mutate-edge-v0.2.4.js 9        # chỉ ca P2
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const EC = "edge-check.js";
const GP = "edge-gr-page.js";
const MUTS = [
  [EC, "pos/gr-list.js", "    e.stopPropagation();\n    if (e.type !== \"click\") return;", "    if (e.type !== \"click\") return;", "sự kiện trên nút lan lên dòng POS (dòng mở phiếu)"],
  [EC, "pos/gr-list.js", "      for (const ev of EVENTS) document.addEventListener(ev, onButtonEvent, true);", "      for (const ev of EVENTS) document.addEventListener(ev, onButtonEvent, false);", "bộ nghe ở pha bubble (dòng nhận click trước)"],
  [EC, "pos/gr-list.js", "    e.preventDefault();\n    activate(btn);", "    e.preventDefault();", "bấm nút không làm gì"],
  // v0.2.2 — G0 27/10
  [EC, "pos/gr-list.js", "padding:0 10px;height:24px;", "padding:0 10px;height:28px;", "nút danh sách cao 28px (dòng POS cao thêm)"],
  [EC, "ui/panel.js", '        document.addEventListener("scroll", onScroll, { capture: true, passive: true });\n', "", "khung không đặt lại khi cuộn (chờ lượt kiểm 1 s)"],
  [EC, "ui/panel.js", '        document.addEventListener("scroll", onScroll, { capture: true, passive: true });', '        document.addEventListener("scroll", onScroll, { capture: false, passive: true });', "nghe cuộn ở pha bubble (cuộn trong khung cuộn không tới document)"],
  // v0.2.3 — PM F3 / F4 (G3a 27/10)
  [EC, "pos/gr-list.js", '      cur.title === full &&\n      cur.getAttribute("aria-label") === full &&\n', "", "F3 đồng bộ nút bỏ qua title / aria-label (received → applied giữ tên cũ)"],
  [EC, "pos/gr-list.js", "    if (anchor && anchor.parentElement) {", "    if (false) {", "F4 thông báo không đặt trên bảng (lên đầu trang)"],
  [EC, "pos/gr-list.js", "      noticeView = null; // rời danh sách: dọn cả vùng thông báo\n      if (noticeEl) noticeEl.remove();\n      noticeEl = null;\n", "", "F4 rời danh sách không gỡ thông báo"],
  // v0.2.4 — PM P2: khung trang phiếu trong luồng trang trước #all-receipt
  [GP, "ui/panel.js", "    :host { all: initial; display: block; }\n    .box { position: static;", "    :host { all: initial; display: block; position: fixed; right: 16px; bottom: 16px; width: 460px; z-index: 2147483646; }\n    .box { position: static;", "P2 khung trang phiếu nổi góc dưới phải (che SL nhận như v0.2.3)"],
  [GP, "ui/panel.js", "      a.parentNode.insertBefore(host, a);", "      a.parentNode.appendChild(host);", "P2 khung gắn cuối cột nội dung (không ngay trước #all-receipt)"],
  [GP, "ui/panel.js", "        observer = new MutationObserver(check);", "        observer = { observe() {}, disconnect() {} };", "P2 trang vẽ lại gỡ khung → không gắn lại"],
  [GP, "ui/panel.js", "    if (valid()) return stopWait();", "    if (false) return stopWait();", "P2 khung đã đúng chỗ vẫn gắn lại (vòng observer)"],
  [GP, "ui/panel.js", '      if (places.length > o.maxPlaces) return fail("unstable");', "", "P2 bỏ giới hạn gắn lại (trang tranh giành → vòng vô hạn)"],
  [GP, "ui/panel.js", "      if (minimized && needsAttention(v) && viewSig(v) !== minSig) {", "      if (false) {", "P2 đang thu nhỏ không tự mở lại khi cần thao tác"],
  [GP, "ui/panel.js", '        if (!valid()) fail("missing");', "", "P2 thiếu chỗ gắn không bao giờ báo lỗi giao diện"],
  [GP, "ui/panel.js", "subtree: true, characterData: true }", "subtree: true }", "P2 không nghe đổi chữ (mã phiếu trở lại sau khi đã báo thiếu chỗ gắn)"],
  [GP, "ui/panel.js", "        if (wasMissing && failed === null) o.onFound();", "", "P2 có lại chỗ gắn không gỡ khung nổi báo lỗi"],
  // chỗ gắn + phiếu đang hiển thị: lib/pos-model.js grPageAnchor (từ PM audit rev 1; trước đó grAnchor trong pos/pos-content.js)
  [GP, "lib/pos-model.js", '    while (info && info.hasAttribute("data-cgn-panel")) info = info.previousElementSibling;\n', "", "P2 lấy khung extension làm thẻ thông tin"],
  [GP, "lib/pos-model.js", "    if (!code) return a;", "    return a;", "P2 không kiểm mã phiếu trên thẻ thông tin"],
  [GP, "lib/pos-model.js", '    const a = doc && doc.getElementById("all-receipt");', '    const a = doc && doc.querySelector("table");', "P2 chỗ gắn = bảng đầu tiên của trang (bảng thông tin phiếu)"],
  // PM audit sơ bộ v0.2.4 (docs/pm/AUDIT-PRELIM-v0.2.4-P2-20261027.md)
  [GP, "ui/panel.js", "    const anchoredFor = (c) => !failed && !!view && !!c && code === c && valid();", "    const anchoredFor = (c) => !failed && !!view && !!c && code === c && placed();", "PM P1 bấm Điền ngay sau khi trang đổi mã phiếu (trước observer) vẫn ghi"],
  [GP, "ui/panel.js", '    JSON.stringify([v.tone || "info", v.title || "", v.lines || [], ', '    JSON.stringify([v.tone || "info", v.title || "", ', "PM P2 thu nhỏ: cảnh báo đổi nội dung không mở lại"],
  // PM audit rev 1 v0.2.4 (docs/pm/AUDIT-REV1-v0.2.4-P2-20261027.md): mã phiếu không đồng nhất thẻ thông tin / breadcrumb
  [GP, "lib/pos-model.js", "    if (main.length !== 1 || main[0] !== code) return null;\n", "", "PM rev1 P1 thẻ thông tin GR khác, breadcrumb mã cũ vẫn mở khoá Điền"],
  [GP, "lib/pos-model.js", "      if (grCodesIn(n).some((c) => c !== code)) return null;\n", "", "PM rev1 P1 breadcrumb mã khác, thẻ thông tin mã cũ vẫn mở khoá Điền"],
];

const start = Number(process.argv[2] || 0);
let killed = 0;
for (const [script, file, a, b, name] of MUTS.slice(start)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cgn-mut-edge-"));
  try {
    fs.cpSync(path.join(ROOT, "src"), dir, { recursive: true });
    const p = path.join(dir, file);
    const s = fs.readFileSync(p, "utf8");
    if (s.split(a).length !== 2) {
      console.log("ANCHOR?", name);
      continue;
    }
    fs.writeFileSync(p, s.replace(a, b));
    const r = spawnSync(process.execPath, [path.join(__dirname, script), dir], { encoding: "utf8", timeout: 420000 });
    const fails = (r.stdout || "").split("\n").filter((l) => l.startsWith("HỎNG"));
    const hung = r.status === null;
    const isKilled = r.status !== 0;
    if (isKilled) killed += 1;
    console.log((isKilled ? "KILLED " : "SURVIVED ") + `[${script}] ` + name, "|", hung ? "treo quá giờ" : fails.slice(0, 3).map((l) => l.slice(0, 110)).join(" || "));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}
const total = MUTS.length - start;
console.log(`${killed}/${total} bị bắt`);
process.exit(killed === total ? 0 : 1);
