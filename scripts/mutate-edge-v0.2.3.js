// Đột biến phần DOM (pos/gr-list.js, ui/panel.js) — bộ test Node dùng bộ giả grList / panel nên chỉ Edge thật bắt được.
// Mỗi ca: chép src/ sang thư mục tạm, gỡ đúng MỘT hàng rào, chạy scripts/edge-check.js trên bản đó; phải có mục HỎNG (KILLED).
//   node scripts/mutate-edge-v0.2.3.js
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const MUTS = [
  ["pos/gr-list.js", "    e.stopPropagation();\n    if (e.type !== \"click\") return;", "    if (e.type !== \"click\") return;", "sự kiện trên nút lan lên dòng POS (dòng mở phiếu)"],
  ["pos/gr-list.js", "      for (const ev of EVENTS) document.addEventListener(ev, onButtonEvent, true);", "      for (const ev of EVENTS) document.addEventListener(ev, onButtonEvent, false);", "bộ nghe ở pha bubble (dòng nhận click trước)"],
  ["pos/gr-list.js", "    e.preventDefault();\n    activate(btn);", "    e.preventDefault();", "bấm nút không làm gì"],
  // v0.2.2 — G0 27/10
  ["pos/gr-list.js", "padding:0 10px;height:24px;", "padding:0 10px;height:28px;", "nút danh sách cao 28px (dòng POS cao thêm)"],
  ["ui/panel.js", '        document.addEventListener("scroll", onScroll, { capture: true, passive: true });\n', "", "khung không đặt lại khi cuộn (chờ lượt kiểm 1 s)"],
  ["ui/panel.js", '        document.addEventListener("scroll", onScroll, { capture: true, passive: true });', '        document.addEventListener("scroll", onScroll, { capture: false, passive: true });', "nghe cuộn ở pha bubble (cuộn trong khung cuộn không tới document)"],
  // v0.2.3 — PM F3 / F4 (G3a 27/10)
  ["pos/gr-list.js", '      cur.title === full &&\n      cur.getAttribute("aria-label") === full &&\n', "", "F3 đồng bộ nút bỏ qua title / aria-label (received → applied giữ tên cũ)"],
  ["pos/gr-list.js", "    if (anchor && anchor.parentElement) {", "    if (false) {", "F4 thông báo không đặt trên bảng (lên đầu trang)"],
  ["pos/gr-list.js", "      noticeView = null; // rời danh sách: dọn cả vùng thông báo\n      if (noticeEl) noticeEl.remove();\n      noticeEl = null;\n", "", "F4 rời danh sách không gỡ thông báo"],
];

let killed = 0;
for (const [file, a, b, name] of MUTS) {
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
    const r = spawnSync(process.execPath, [path.join(__dirname, "edge-check.js"), dir], { encoding: "utf8", timeout: 300000 });
    const fails = (r.stdout || "").split("\n").filter((l) => l.startsWith("HỎNG"));
    if (fails.length) killed += 1;
    console.log((fails.length ? "KILLED " : "SURVIVED ") + name, "|", fails.map((l) => l.slice(0, 110)).join(" || "));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}
console.log(`${killed}/${MUTS.length} bị bắt`);
process.exit(killed === MUTS.length ? 0 : 1);
