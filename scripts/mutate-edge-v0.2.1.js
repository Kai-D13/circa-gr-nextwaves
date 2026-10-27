// Đột biến phần DOM của nút danh sách (pos/gr-list.js) — bộ test Node dùng bộ giả grList nên chỉ Edge thật bắt được.
// Mỗi ca: chép src/ sang thư mục tạm, gỡ đúng MỘT hàng rào, chạy scripts/edge-check.js trên bản đó; phải có mục HỎNG (KILLED).
//   node scripts/mutate-edge-v0.2.1.js
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const FILE = "pos/gr-list.js";
const MUTS = [
  ["    e.stopPropagation();\n    if (e.type !== \"click\") return;", "    if (e.type !== \"click\") return;", "sự kiện trên nút lan lên dòng POS (dòng mở phiếu)"],
  ["      for (const ev of EVENTS) document.addEventListener(ev, onButtonEvent, true);", "      for (const ev of EVENTS) document.addEventListener(ev, onButtonEvent, false);", "bộ nghe ở pha bubble (dòng nhận click trước)"],
  ["    e.preventDefault();\n    activate(btn);", "    e.preventDefault();", "bấm nút không làm gì"],
];

let killed = 0;
for (const [a, b, name] of MUTS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cgn-mut-edge-"));
  try {
    fs.cpSync(path.join(ROOT, "src"), dir, { recursive: true });
    const p = path.join(dir, FILE);
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
