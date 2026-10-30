// Đo lượt quét pos/gr-list.js trên Edge headless thật (CDP), ngoài extension: lượt lúc vào danh sách, lượt tạo nút đầu tiên
// (code còn "lạnh") và lượt tạo nút khi đã "ấm". Dùng để so bản cũ / mới (PM audit v0.2.0 P2.2).
//   node scripts/bench-gr-list.js <gr-list.js> [số lần chạy] [số dòng]        vd. node scripts/bench-gr-list.js src/pos/gr-list.js 8 200
//   RACE=1 …   response danh sách về ngay khi vào trang (không chờ 30 ms)
// Cột: activateMax / activatePasses (vào danh sách, chưa có response), createMax / createSlices / createTotal (tạo nút),
// buttons (số nút tạo được), warmMax (lượt tạo nút lớn nhất trong 10 lần làm lại khi code đã ấm).
// Mỗi lần chạy: hồ sơ Edge mới, trang mới (code lạnh). Số đo = stats() của chính gr-list (từng lượt quét / từng lát).
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const src = fs.readFileSync(process.argv[2], "utf8");
const runs = Number(process.argv[3] || 5);
const nRows = Number(process.argv[4] || 20);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9341;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
for (let k = 0; k < nRows; k++) {
  const status = k % 20 < 10 ? "WAITING_TO_RECEIVE" : k % 20 < 13 ? "RECEIVING" : "COMPLETED";
  rows.push({ code: `GR${String(39000 + k).padStart(5, "0")}`, status });
}
const trs = rows
  .map(
    (r, i) =>
      `<tr onclick="window.__rowClicks=(window.__rowClicks||0)+1"><td><span>${r.code}</span></td><td><span>PO0000${6700 + i}</span></td>` +
      `<td><span class="st">${r.status}</span></td><td><div class="flex items-center justify-center"><button class="ic">→</button>` +
      (i % 3 === 0 ? '<button type="button" class="circa-rfid-po-link">View on Nextwaves</button>' : "") +
      "</div></td></tr>"
  )
  .join("");
const want = rows.filter((r) => r.status !== "COMPLETED").map((r, i) => [r.code, { grId: `11111111-2222-4333-8444-${String(i).padStart(12, "0")}`, kind: "start", label: "Nhận hàng bằng RFID", title: "", disabled: false }]);

const bench = `
window.__bench = (async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  const g = globalThis.__CGN__.grList;
  g.attach({ onSelect() {}, onDomChanged() {} });
  const model = { byCode: new Map(${JSON.stringify(want)}) };
  g.activate();                       // vào danh sách (response danh sách chưa về)
  await wait(${process.env.RACE ? 0 : 30});
  const s0 = g.stats(true);
  out.activateMax = s0.maxMs; out.activatePasses = s0.applies;
  g.show(model);                      // response về → tạo nút
  await wait(200);
  const s1 = g.stats(true);
  out.createMax = s1.maxMs; out.createSlices = s1.applies; out.createTotal = s1.totalMs;
  out.buttons = document.querySelectorAll("button.cgn-rfid-btn").length;
  const warm = [];
  for (let i = 0; i < 10; i++) { g.deactivate(); g.activate(); g.stats(true); g.show(model); await wait(50); warm.push(g.stats(true).maxMs); }
  warm.sort((a, b) => a - b);
  out.warmMax = warm[9];
  return out;
})();
`;
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table><tbody id="rows">${trs}</tbody></table>
<script>${src}</script><script>${bench}</script></body></html>`;

let seq = 0;
function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
    };
    ws.onerror = reject;
    ws.onopen = () => resolve({ send: (method, params) => new Promise((r) => { const i = ++seq; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }), close: () => ws.close() });
  });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cgn-bench-"));
  const file = path.join(dir, "bench.html");
  fs.writeFileSync(file, html);
  const res = [];
  for (let i = 0; i < runs; i++) {
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), "cgn-bench-prof-"));
    const proc = spawn(EDGE, ["--headless=new", `--user-data-dir=${prof}`, `--remote-debugging-port=${PORT}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
    try {
      await sleep(2500);
      const tgt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
      const c = await cdp(tgt.webSocketDebuggerUrl);
      await c.send("Page.enable", {});
      await c.send("Page.navigate", { url: "file:///" + file.replace(/\\/g, "/") });
      await sleep(1500);
      const r = await c.send("Runtime.evaluate", { expression: "window.__bench", awaitPromise: true, returnByValue: true });
      res.push(r.result.result.value);
      c.close();
    } finally {
      proc.kill();
      await sleep(800);
      fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5 });
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  for (const k of Object.keys(res[0])) console.log(k.padEnd(14), res.map((r) => (typeof r[k] === "number" ? r[k].toFixed(3) : r[k])).join("  "));
})();
