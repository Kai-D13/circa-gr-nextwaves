// v0.2.4 (PM P2, docs/pm/REVIEW-A1-RUNBOOK-P2-v0.2.4-20261027.md §2) — khung trang phiếu TRONG LUỒNG trang, kiểm trên TRÌNH DUYỆT
// THẬT (Edge / Chrome headless, hồ sơ tạm, không đăng nhập, không gọi server thật):
//
//   node scripts/edge-gr-page.js <thư mục extension giải nén>     vd. node scripts/edge-gr-page.js C:\circa-gr-nextwaves-v0.2.4
//
// Trang phiếu = DOM + CSS THẬT của trang phiếu POS staging (samples/pos-stg-gr-page-GR03887-20261027.*, lấy chỉ đọc 27/10; mã
// phiếu / PO thay bằng GR03880 / PO00006754). Dữ liệu = lượt thật GR03880 26/10: GR trước điền, 11 tra QR, phiên extension (đặt lại
// trạng thái) — server giả qua CDP Fetch. Trên trang thật cả trang (window) cuộn; khung `overflow-scroll` không cuộn (đo 27/10).
// Kiểm:
//  1. Mỗi trạng thái (đã khớp Nextwaves, kế hoạch chỉ xem, có cấp phép, lần trước dừng + có cấp phép, đang điền ở tab khác, lỗi đọc
//     phiếu, đã điền) ở 1095×756, 1366×768, 1440×900: đúng MỘT khung, ngay trước #all-receipt, position static (không nổi / không
//     dính), nằm dưới thẻ thông tin; mọi điều khiển của vùng sản phẩm (ô tìm, −, ô số, +, 2 icon, "+ Thêm lot-date", …), HỦY,
//     HOÀN THÀNH và mọi nút trong khung: cuộn tới giữa khung nhìn rồi điểm giữa trúng chính nó.
//  2. Thu nhỏ tay → dải tiêu đề; có cấp phép (cần thao tác) → tự mở lại; đang thu nhỏ mà cảnh báo đổi nội dung (lý do dừng khác,
//     cùng tiêu đề + nút) → tự mở lại (PM audit sơ bộ P2).
//  3. Vẽ lại: lọc (gỡ / thêm dòng), thay cả thẻ sản phẩm (khung bị gỡ theo), thay cả cột nội dung; đổi route SPA sang phiếu khác rồi
//     quay lại → luôn ≤ 1 khung, đúng chỗ, không nút Điền trên phiếu khác; nghỉ 2 s không gắn lại lần nào (không vòng observer).
//     PM audit sơ bộ P1: chỉ đổi CHỮ mã phiếu trên thẻ thông tin / breadcrumb (giữ #all-receipt, không đổi route) và bấm Điền trong
//     CÙNG tác vụ (trước observer) → 0 PUT, cấp phép còn; observer gỡ khung; quá 10 s → khung nổi báo lỗi; mã đúng trở lại → gắn lại.
//     PM audit rev 1 P1: mã KHÔNG đồng nhất (chỉ thẻ thông tin đổi, hoặc chỉ breadcrumb đổi) + bấm Điền cùng tác vụ → 0 claim, 0 PUT.
//     Trang liên tục gỡ khung → bỏ gắn (không vòng vô hạn), khung nổi báo lỗi, không nút Điền; hết tranh giành → "Kiểm tra lại".
//  4. W1 bằng BÀN PHÍM: focus nút "Điền" + Enter → 5 PUT đúng kế hoạch #E33C777A của lượt thật → tải lại → "đã điền 11 UID".
//  5. Trace CDP từ lúc mở trang: không tác vụ nào của extension ≥ 50 ms.
//  6. Trang không có #all-receipt → sau 10 s: khung nổi báo lỗi giao diện, không nút Điền, 0 PUT, cấp phép còn.
//  7. v0.2.5 (PM AUDIT-A1-GR03887 P2): trang "đã điền" → trang tự gửi PUT status/COMPLETED qua hook thật → bỏ #all-receipt → quá
//     10 s: không khung nào (không khung đỏ), phiên done, không ui_anchor_missing; mở lại phiếu COMPLETED thật → không khung, không lỗi.
//     Trace có tên cho trang mục 6 (nhánh thiếu chỗ gắn) và mục 7: không tác vụ extension ≥ 50 ms.
// Đối chứng: chạy với gói v0.2.3 phải HỎNG mục "điều khiển SL nhận bấm được" ở 1095×756.
//
// Chẩn đoán hiệu năng (PM AUDIT-A1-PREP P2, 28/10): mỗi mục kiểm đặt một mốc console.timeStamp vào trace → mỗi tác vụ extension
// in pha nạp / gọi hàm, file:dòng:cột, bước (mục kiểm kế tiếp), thời gian thực vs CPU luồng, phần con lớn nhất (Layout, GC…).
//   node scripts/edge-gr-page.js --baseline     cùng trang phiếu, cùng 3 khung nhìn + đoạn hit-test, KHÔNG nạp extension → luồng
//                                               chính của trang làm mốc so sánh với cửa sổ "mở trang → hết nw_ready" của lượt có extension.
//   CGN_TRACE_OUT=<file.json>                   ghi phần trace liên quan (tác vụ extension, tác vụ luồng chính ≥ 5 ms, mốc) để phân tích lại.
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { killProfile, portBusy } = require("./edge-proc.js");

const ARGS = process.argv.slice(2);
const BASELINE = ARGS.includes("--baseline");
const EXT = path.resolve(ARGS.find((a) => !a.startsWith("--")) || path.join(__dirname, "..", "src"));
const TRACE_OUT = process.env.CGN_TRACE_OUT || "";
const ROOT = path.join(__dirname, "..");
const PORT = 9341;
const POS = "https://pos.stg.circa-v2.buymed.tech";
const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];
const sample = (n) => fs.readFileSync(path.join(ROOT, "samples", n), "utf8");
const json = (n) => JSON.parse(sample(n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const checkNames = [];
let phaseMark = null; // (nhãn) → mốc console.timeStamp trên trang đang trace
const check = (name, ok, detail) => {
  results.push(ok);
  checkNames.push(name);
  if (phaseMark) phaseMark(`cgn#${results.length}`);
  console.log(`${ok ? "ĐẠT " : "HỎNG"}  ${name}${detail ? "  — " + detail : ""}`);
};
const info = (name, detail) => console.log(`ĐO    ${name}  — ${detail}`);

// ---------- dữ liệu thật GR03880 ----------
const GR0 = json("pos-stg-gr-GR03880-truoc-20261026.json");
const GR_ID = GR0.data.id;
const GR_CODE = GR0.data.code;
const STORE = GR0.data.pos_info.id;
const KEY = `STG:${GR_ID}`;
const OTHER_ID = "0f0f0f0f-1111-4222-8333-444455556666";
const QR = new Map(json("pos-stg-qrcode-GR03880-11uid-20261026.json").map((r) => [r.url.split("code=")[1], r.response]));
const SESSION0 = json("ext-stg-storage-GR03878-GR03880-20261026.json").sessions[KEY];
const PLAN_HASH = "E33C777A"; // kế hoạch của lượt thật (tests/full-real.test.js)
const AUTH = { authorization: "Bearer kiem-thu", "x-client-id": "1", "x-store-id": STORE, "grpc-timeout": "30S" };

// ---------- trang phiếu DOM + CSS thật ----------
const stripComment = (s) => s.replace(/^\s*<!--[\s\S]*?-->\s*/, "").trim();
const REAL_HTML = stripComment(sample("pos-stg-gr-page-GR03887-20261027.html")).replaceAll("GR03887", GR_CODE).replaceAll("PO00006767", GR0.data.purchase_order_code);
const REAL_CSS = sample("pos-stg-gr-page-GR03887-20261027.css");
// Mẫu chụp lúc POS đang hiện một toast tự đóng sau 2 s ("Chức năng thông báo sẽ không hoạt động…", góc trên phải) → ẩn đi.
const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${REAL_CSS}\n.Toastify{display:none}</style></head><body>${body}</body></html>`;
const GR_PAGE = page("POS giả — trang phiếu (DOM thật)", REAL_HTML);
const GR_PAGE_NO_ANCHOR = page("POS giả — trang phiếu không có #all-receipt", REAL_HTML.replace('id="all-receipt"', 'id="x-receipt"'));
// Đoạn kiểm chỉ đọc giao operator cho v0.2.5 (đếm khung extension trên trang phiếu).
const KIEM_KHUNG_JS = fs.readFileSync(path.join(__dirname, "kiem-khung-gr.js"), "utf8");
const VIEWPORTS = [
  [1095, 756],
  [1366, 768],
  [1440, 900],
];

// Hình học khung + chỗ đứng trong luồng (main world).
const GEO_JS = `(() => {
  const a = document.getElementById("all-receipt");
  const hosts = [...document.querySelectorAll("[data-cgn-panel]")];
  const h = hosts[0] || null;
  const r = (e) => e.getBoundingClientRect();
  const info = a && a.previousElementSibling && a.previousElementSibling.hasAttribute("data-cgn-panel") ? a.previousElementSibling.previousElementSibling : a && a.previousElementSibling;
  return JSON.stringify({ vw: innerWidth, vh: innerHeight, hosts: hosts.length, inline: hosts.filter((x) => x.hasAttribute("data-cgn-inline")).length,
    beforeAnchor: !!h && !!a && h.nextElementSibling === a, pos: h ? getComputedStyle(h).position : null, hostH: h ? Math.round(r(h).height) : 0,
    hostTop: h ? Math.round(r(h).top + scrollY) : 0, infoBottom: info ? Math.round(r(info).bottom + scrollY) : 0, anchorTop: a ? Math.round(r(a).top + scrollY) : 0 });
})()`;
// Điều khiển của trang: cuộn tới giữa khung nhìn, điểm giữa phải trúng chính nó (không bị gì của extension phủ).
const PAGE_CLICK_JS = `(() => {
  const a = document.getElementById("all-receipt");
  const els = [...a.querySelectorAll("button, input")].filter((e) => e.getBoundingClientRect().width > 0);
  const bar = [...document.querySelectorAll("div.fixed.bottom-0 button")];
  const bad = [];
  const hitOk = (el) => {
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el) && hit.tagName === "LABEL");
  };
  const name = (el, hit) => (el.textContent || el.value || el.className || el.tagName).toString().trim().slice(0, 24) + "→" + (hit ? hit.tagName + (hit.hasAttribute && hit.hasAttribute("data-cgn-panel") ? "[khung extension]" : "." + String(hit.className).slice(0, 20)) : "null");
  for (const el of els) {
    el.scrollIntoView({ block: "center", inline: "nearest" });
    if (!hitOk(el)) { const b = el.getBoundingClientRect(); bad.push(name(el, document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2))); }
  }
  scrollTo(0, 0);
  for (const el of bar) if (!hitOk(el)) { const b = el.getBoundingClientRect(); bad.push(name(el, document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2))); }
  return JSON.stringify({ n: els.length, bar: bar.length, bad });
})()`;
// Đếm số lần khung được gắn (thêm vào DOM) trong ms mili-giây.
const COUNT_PLACES_JS = (ms) => `new Promise((res) => { let n = 0; const o = new MutationObserver((ms) => { for (const m of ms) for (const x of m.addedNodes) if (x.nodeType === 1 && x.hasAttribute("data-cgn-panel")) n++; });
  o.observe(document.documentElement, { childList: true, subtree: true }); setTimeout(() => { o.disconnect(); res(n); }, ${ms}); })`;

// ---------- CDP ----------
let seq = 0;
function cdp(wsUrl, onEvent) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      } else if (m.method && onEvent) onEvent(m);
    };
    ws.onerror = reject;
    ws.onopen = () =>
      resolve({
        send: (method, params) => new Promise((r) => { const i = ++seq; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }),
        close: () => ws.close(),
      });
  });
}
const evalIn = (c, expression, contextId) =>
  c.send("Runtime.evaluate", Object.assign({ expression, awaitPromise: true, returnByValue: true }, contextId ? { contextId } : {})).then((r) => (r.result && r.result.result ? r.result.result.value : undefined));
const listTargets = async () => (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const newTarget = async () => (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const closeTarget = async (id) => fetch(`http://127.0.0.1:${PORT}/json/close/${id}`).catch(() => null);

async function serviceWorker() {
  for (let i = 0; i < 30; i++) {
    for (const t of (await listTargets()).filter((x) => x.type === "service_worker" && /\/background\.js$/.test(x.url))) {
      const c = await cdp(t.webSocketDebuggerUrl);
      if (String(await evalIn(c, "chrome.runtime.getManifest().name")).startsWith("Circa GR")) return c;
      c.close();
    }
    await sleep(500);
  }
  return null;
}

async function openPage(url, handler, opts = {}) {
  const tgt = await newTarget();
  const ctxs = [];
  const traceEvents = [];
  let traceDone = null;
  let p = null;
  p = await cdp(tgt.webSocketDebuggerUrl, async (m) => {
    if (m.method === "Tracing.dataCollected") for (const e of m.params.value) traceEvents.push(e);
    if (m.method === "Tracing.tracingComplete" && traceDone) traceDone();
    if (m.method === "Runtime.executionContextCreated") ctxs.push(m.params.context);
    if (m.method === "Runtime.executionContextDestroyed") {
      const i = ctxs.findIndex((c) => c.id === m.params.executionContextId);
      if (i >= 0) ctxs.splice(i, 1);
    }
    if (m.method === "Runtime.executionContextsCleared") ctxs.length = 0;
    if (m.method === "Fetch.requestPaused") {
      const r = await handler(m.params.request);
      await p.send("Fetch.fulfillRequest", { requestId: m.params.requestId, responseCode: r.status, responseHeaders: [{ name: "Content-Type", value: r.type }], body: Buffer.from(r.body, "utf8").toString("base64") });
    }
  });
  await p.send("Runtime.enable", {});
  await p.send("Fetch.enable", { patterns: [{ urlPattern: `${POS}/*` }] });
  await p.send("Page.enable", {});
  await p.send("DOM.enable", {});
  if (opts.trace) await p.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,v8.execute", transferMode: "ReportEvents" });
  await p.send("Page.navigate", { url });
  const stopTrace = async () => {
    const done = new Promise((r) => (traceDone = r));
    await p.send("Tracing.end", {});
    await done;
    return traceEvents;
  };
  return { page: p, ctxs, targetId: tgt.id, stopTrace };
}
const mainCtx = (ctxs) => ctxs.filter((c) => c.auxData && c.auxData.isDefault).pop();

// Shadow root (đóng) của khung extension — CDP DOM xuyên shadow. Trả {host, sr} của khung đầu tiên.
async function panelNodes(p) {
  const doc = await p.send("DOM.getDocument", { depth: -1, pierce: true });
  let host = null;
  const walk = (n) => {
    if (!n || host) return;
    if (n.attributes && n.attributes.includes("data-cgn-panel")) host = n;
    (n.children || []).forEach(walk);
    (n.shadowRoots || []).forEach(walk);
  };
  walk(doc.result.root);
  return host && host.shadowRoots && host.shadowRoots[0] ? { host, sr: host.shadowRoots[0], inline: host.attributes.includes("data-cgn-inline") } : null;
}
async function panelText(p) {
  const n = await panelNodes(p);
  if (!n) return "";
  const r = await p.send("DOM.getOuterHTML", { backendNodeId: n.sr.backendNodeId });
  const html = r.result ? r.result.outerHTML : "";
  return html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, " | ").replace(/(\s*\|\s*)+/g, " | ").trim();
}
const all = (n, pred, out = []) => {
  if (!n) return out;
  if (pred(n)) out.push(n);
  for (const c of n.children || []) all(c, pred, out);
  return out;
};
const textOf = (n) => all(n, (x) => x.nodeType === 3).map((x) => x.nodeValue).join("");
async function centerOf(p, backendNodeId) {
  const r = await p.send("DOM.getBoxModel", { backendNodeId });
  if (!r.result) return null;
  const q = r.result.model.border;
  return { x: (q[0] + q[2]) / 2, y: (q[1] + q[5]) / 2, w: q[2] - q[0], h: q[5] - q[1], top: q[1] };
}
// Nút trong khung: cuộn khung vào giữa khung nhìn, điểm giữa từng nút phải trúng chính nút đó (xuyên shadow).
async function panelButtonsHit(p, ctxId) {
  const n = await panelNodes(p);
  if (!n) return { n: 0, bad: ["không có khung"] };
  await evalIn(p, 'document.querySelector("[data-cgn-panel]").scrollIntoView({ block: "center" }), true', ctxId);
  await sleep(50);
  const btns = all(n.sr, (x) => x.nodeName === "BUTTON");
  const bad = [];
  // Chuột thật (CDP Input) tới điểm giữa nút: nút phải nhận :hover — không có gì của trang / extension phủ lên.
  for (const b of btns) {
    const label = (textOf(b) || "?").slice(0, 16);
    const c = await centerOf(p, b.backendNodeId);
    if (!c) {
      bad.push(`${label}: không đo được`);
      continue;
    }
    await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
    const o = await p.send("DOM.resolveNode", { backendNodeId: b.backendNodeId });
    const hov = o.result ? await p.send("Runtime.callFunctionOn", { objectId: o.result.object.objectId, functionDeclaration: "function () { return this.matches(':hover'); }", returnByValue: true }) : null;
    if (!(hov && hov.result && hov.result.result.value === true)) bad.push(`${label}@${Math.round(c.x)},${Math.round(c.y)}`);
  }
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
  await evalIn(p, "scrollTo(0, 0), true", ctxId);
  return { n: btns.length, bad, labels: btns.map(textOf) };
}
async function clickPanelButton(p, label) {
  const n = await panelNodes(p);
  const b = n ? all(n.sr, (x) => x.nodeName === "BUTTON" && textOf(x) === label)[0] : null;
  if (!b) return false;
  await p.send("DOM.scrollIntoViewIfNeeded", { backendNodeId: b.backendNodeId });
  const c = await centerOf(p, b.backendNodeId);
  for (const type of ["mousePressed", "mouseReleased"]) await p.send("Input.dispatchMouseEvent", { type, x: c.x, y: c.y, button: "left", clickCount: 1 });
  return true;
}

// ---------- trace ----------
const dataOf = (e) => (e.args && e.args.data) || {};
// Sự kiện bọc ngoài — không tính là "phần con" của một tác vụ.
const WRAPPERS = new Set(["FunctionCall", "EvaluateScript", "EventDispatch", "TimerFire", "FireAnimationFrame", "FireIdleCallback", "RunTask", "ThreadControllerImpl::RunTask", "V8.Execute", "v8.callFunction", "v8.run", "RunMicrotasks", "ProfileCall"]);
const traceMarks = (events) =>
  events
    .filter((e) => e.name === "TimeStamp" && /^cgn#/.test(String(dataOf(e).message || "")))
    .map((e) => ({ ts: e.ts, label: String(dataOf(e).message) }))
    .sort((a, b) => a.ts - b.ts);
const stepName = (label) => {
  const m = /^cgn#(\d+)$/.exec(label || "");
  return m ? `mục ${m[1]} "${(checkNames[m[1] - 1] || "").slice(0, 70)}"` : label || "—";
};
// Phần con lớn nhất của một tác vụ (cùng luồng, nằm trọn trong tác vụ, bỏ sự kiện bọc ngoài).
function kidsOf(e, threadEvents) {
  const end = e.ts + e.dur;
  const kids = {};
  for (const k of threadEvents || []) if (k !== e && k.ts >= e.ts && k.ts + k.dur <= end && !WRAPPERS.has(k.name)) kids[k.name] = (kids[k.name] || 0) + k.dur / 1000;
  return Object.entries(kids).sort((x, y) => y[1] - x[1]).slice(0, 4);
}
function extensionTasks(events) {
  const marks = traceMarks(events);
  const byThread = new Map();
  for (const e of events) {
    if (e.ph !== "X" || typeof e.dur !== "number") continue;
    const k = `${e.pid}:${e.tid}`;
    if (!byThread.has(k)) byThread.set(k, []);
    byThread.get(k).push(e);
  }
  return events
    .filter((e) => e.ph === "X" && typeof e.dur === "number" && (e.name === "FunctionCall" || e.name === "EvaluateScript") && String(dataOf(e).url || "").startsWith("chrome-extension://"))
    .map((e) => {
      const d = dataOf(e);
      const end = e.ts + e.dur;
      const kids = kidsOf(e, byThread.get(`${e.pid}:${e.tid}`));
      const m = marks.find((x) => x.ts >= end);
      return {
        load: e.name === "EvaluateScript",
        file: String(d.url).replace(/^chrome-extension:\/\/[^/]+\//, ""),
        fn: d.functionName || "",
        line: d.lineNumber,
        col: d.columnNumber,
        ms: e.dur / 1000,
        cpu: typeof e.tdur === "number" ? e.tdur / 1000 : null,
        ts: e.ts,
        step: m ? m.label : "sau mục cuối",
        kids,
      };
    });
}
const fmtTask = (t) =>
  `${t.ms.toFixed(2)} ms${t.cpu != null ? ` (CPU ${t.cpu.toFixed(2)})` : ""} ${t.load ? "nạp script" : "gọi hàm"} ${t.file}${t.load ? "" : `:${t.line}:${t.col} ${t.fn || "(ẩn danh)"}`} · bước ${stepName(t.step)}${t.kids.length ? " · trong đó " + t.kids.map(([n, ms]) => `${n} ${ms.toFixed(1)}`).join(", ") : ""}`;
// Tác vụ luồng chính của trang POS (renderer đã parse trang POS) tới mốc `untilLabel`.
function mainThreadTasks(events, untilLabel) {
  const parse = events.find((e) => e.name === "ParseHTML" && String(((e.args || {}).beginData || {}).url || "").startsWith(POS));
  if (!parse) return null;
  const until = (traceMarks(events).find((m) => m.label === untilLabel) || {}).ts || Infinity;
  const own = events.filter((e) => e.ph === "X" && typeof e.dur === "number" && e.pid === parse.pid && e.tid === parse.tid && e.ts <= until);
  let tasks = own.filter((e) => e.name === "RunTask" || e.name === "ThreadControllerImpl::RunTask");
  if (!tasks.length) tasks = own.filter((e) => !own.some((o) => o !== e && o.ts <= e.ts && o.ts + o.dur >= e.ts + e.dur && o.dur > e.dur)); // không có RunTask: lấy sự kiện ngoài cùng
  const ext = (e) => own.some((o) => (o.name === "FunctionCall" || o.name === "EvaluateScript") && o.ts >= e.ts && o.ts + o.dur <= e.ts + e.dur && String(dataOf(o).url || "").startsWith("chrome-extension://"));
  return tasks
    .sort((a, b) => b.dur - a.dur)
    .map((e, i) => ({ ms: e.dur / 1000, cpu: typeof e.tdur === "number" ? e.tdur / 1000 : null, ts: e.ts, ...(i < 10 ? { kids: kidsOf(e, own), ext: ext(e) } : {}) }));
}
const fmtMain = (mt) =>
  !mt ? "không thấy luồng chính của trang POS trong trace" : `${mt.length} tác vụ, ≥ 50 ms: ${mt.filter((t) => t.ms >= 50).length}, 5 dài nhất: ${mt.slice(0, 5).map((t) => `${t.ms.toFixed(2)}${t.cpu != null ? ` (CPU ${t.cpu.toFixed(2)})` : ""}${t.ext ? " [có extension]" : ""}${t.kids && t.kids.length ? " [" + t.kids.slice(0, 3).map(([n, ms]) => `${n} ${ms.toFixed(1)}`).join(", ") + "]" : ""}`).join(" | ")} ms`;
const browserVersion = async () => ((await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()) || {}).Browser || "?";

// --baseline: cùng trang phiếu DOM + CSS thật, cùng 3 khung nhìn + đoạn hit-test điều khiển của trang, KHÔNG có extension.
async function runBaseline() {
  await sleep(4000);
  const ver = await browserVersion();
  const handler = async (r) =>
    /^\/danh-sach-phieu-nhan-hang\/[0-9a-f-]{36}\/?$/.test(new URL(r.url).pathname) ? { status: 200, type: "text/html; charset=utf-8", body: GR_PAGE } : { status: 404, type: "application/json", body: "{}" };
  const g = await openPage(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`, handler, { trace: true });
  const pg = g.page;
  const ctxId = () => (mainCtx(g.ctxs) || {}).id;
  phaseMark = (label) => void evalIn(pg, `console.timeStamp(${JSON.stringify(label)}), true`, ctxId()).catch(() => {});
  await sleep(2500);
  const gm = JSON.parse((await evalIn(pg, GEO_JS, ctxId())) || "{}");
  check("baseline: trang phiếu mở được, không có khung extension", gm.hosts === 0 && gm.anchorTop > 0, `${ver} · ${JSON.stringify(gm)}`);
  for (const [w, h] of VIEWPORTS) {
    await pg.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const pc = JSON.parse((await evalIn(pg, PAGE_CLICK_JS, ctxId())) || "{}");
    check(`baseline · ${w}×${h}: điều khiển vùng sản phẩm (${pc.n}) + HỦY / HOÀN THÀNH (${pc.bar}) bấm được`, pc.n >= 30 && pc.bar === 2 && pc.bad.length === 0);
  }
  await pg.send("Emulation.clearDeviceMetricsOverride", {});
  phaseMark("cgn#so-sanh");
  await sleep(300);
  phaseMark = null;
  // Một lần đọc bố cục (getBoundingClientRect) khi cả trang đang chờ layout lại — đổi khung nhìn rồi đọc ngay; đổi cỡ chữ gốc (rem)
  // rồi đọc ngay. Đây là cái giá bất kỳ script nào (kể cả extension) trả nếu nó đọc bố cục đúng lúc đó.
  const READ_JS = `(() => { const b = document.querySelector("div.fixed.bottom-0 button"); const t = performance.now(); b.getBoundingClientRect(); return +(performance.now() - t).toFixed(2); })()`;
  const forced = [];
  for (const [w, h] of VIEWPORTS.concat([[750, 485]])) {
    await pg.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    forced.push(`${w}px ${await evalIn(pg, READ_JS, ctxId())}`);
    await sleep(300);
  }
  await pg.send("Emulation.clearDeviceMetricsOverride", {});
  await sleep(300);
  for (const fsz of ["17px", ""]) {
    forced.push(`cỡ chữ ${fsz || "gốc"} ${await evalIn(pg, `(document.documentElement.style.fontSize = ${JSON.stringify(fsz)}, ${READ_JS})`, ctxId())}`);
    await sleep(300);
  }
  info("đọc bố cục khi cả trang chờ layout lại (ms)", forced.join(" | "));
  const tr = await g.stopTrace();
  const mt = mainThreadTasks(tr, "cgn#so-sanh");
  info("luồng chính trang KHÔNG extension (mở trang → 3 khung nhìn)", fmtMain(mt));
  if (TRACE_OUT) fs.writeFileSync(TRACE_OUT, JSON.stringify({ mode: "baseline", browser: ver, marks: traceMarks(tr), mainTasks: (mt || []).filter((t) => t.ms >= 5) }, null, 1));
  pg.close();
  await closeTarget(g.targetId);
}

(async () => {
  const browser = BROWSERS.find((b) => fs.existsSync(b));
  if (!browser) {
    console.log("HỎNG  không thấy Edge / Chrome");
    process.exit(2);
  }
  if (await portBusy(PORT)) {
    console.log(`HỎNG  cổng ${PORT} đang có trình duyệt khác (lượt trước còn sót?) — tắt nó rồi chạy lại`);
    process.exit(2);
  }
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "cgn-edge-gr-"));
  const extArgs = BASELINE ? [] : ["--disable-features=DisableLoadExtensionCommandLineSwitch", `--load-extension=${EXT}`];
  const proc = spawn(browser, ["--headless=new", `--user-data-dir=${prof}`, `--remote-debugging-port=${PORT}`, "--no-first-run", ...extArgs, "about:blank"], { stdio: "ignore" });
  // Trang treo (vd. vòng gắn khung vô hạn): lượt CDP không bao giờ trả về → báo HỎNG, tắt trình duyệt, không để tiến trình mồ côi.
  const watchdog = setTimeout(() => {
    console.log("HỎNG  quá 360 s — trang / extension treo");
    proc.kill();
    killProfile(prof);
    process.exit(1);
  }, 360000);
  watchdog.unref();
  if (BASELINE) {
    try {
      await runBaseline();
    } catch (err) {
      check("chạy hết kịch bản baseline", false, String((err && err.stack) || err).slice(0, 300));
    } finally {
      proc.kill();
      killProfile(prof);
    }
    const ok = results.every(Boolean);
    console.log(`\n${ok ? "TẤT CẢ ĐẠT" : "CÓ MỤC HỎNG"} (${results.filter(Boolean).length}/${results.length})`);
    process.exit(ok ? 0 : 1);
  }
  try {
    await sleep(4000);
    const ver = await browserVersion();
    const sw = await serviceWorker();
    const version = sw ? await evalIn(sw, "chrome.runtime.getManifest().version") : null;
    check("service worker nạp được", !!sw, sw ? `version ${version} · ${ver}` : "trình duyệt không nạp extension");
    if (!sw) throw new Error("dừng");

    // ---- server giả (GR03880 thật, PUT áp vào GR) ----
    const st = { gr: JSON.parse(JSON.stringify(GR0)), puts: [], grDown: false, noAnchor: false, completed: 0 };
    const handler = async (r) => {
      const u = new URL(r.url);
      if (/^\/danh-sach-phieu-nhan-hang\/[0-9a-f-]{36}\/?$/.test(u.pathname)) return { status: 200, type: "text/html; charset=utf-8", body: st.noAnchor ? GR_PAGE_NO_ANCHOR : GR_PAGE };
      if (u.pathname === "/thuocsi-warehouse/qrcode") {
        const q = QR.get(u.searchParams.get("code"));
        return q ? { status: 200, type: "application/json", body: JSON.stringify(q) } : { status: 404, type: "application/json", body: "{}" };
      }
      let m = /^\/backend\/v1\/order\/goods-receipt\/([0-9a-f-]{36})$/.exec(u.pathname);
      if (m && r.method === "GET") {
        if (st.grDown) return { status: 500, type: "application/json", body: '{"message":"lỗi giả"}' };
        return m[1] === GR_ID ? { status: 200, type: "application/json", body: JSON.stringify(st.gr) } : { status: 404, type: "application/json", body: '{"message":"không có"}' };
      }
      m = /^\/backend\/v1\/order\/goods-receipt\/([0-9a-f-]{36})\/item\/([0-9a-f-]{36})\/detail\/([0-9a-f-]{36})$/.exec(u.pathname);
      if (m && r.method === "PUT") {
        const body = JSON.parse(r.postData || "{}");
        st.puts.push({ detailId: m[3], body });
        const d = st.gr.data.items.flatMap((i) => i.details).find((x) => x.id === m[3]);
        if (!d) return { status: 404, type: "application/json", body: "{}" };
        Object.assign(d, { received_quantity: body.detail.received_quantity, lot_id: body.detail.lot_id, thuocsi_qr_codes: body.detail.thuocsi_qr_codes });
        st.gr.data.status = "RECEIVING";
        return { status: 200, type: "application/json", body: '{"success":true}' };
      }
      // HOÀN THÀNH (do trang gọi, mục 7): server giả nhận, phiếu sang COMPLETED.
      if (/^\/backend\/v1\/order\/goods-receipt\/[0-9a-f-]{36}\/status\/COMPLETED$/.test(u.pathname) && r.method === "PUT") {
        st.completed += 1;
        st.gr.data.status = "COMPLETED";
        return { status: 200, type: "application/json", body: '{"success":true}' };
      }
      return { status: 404, type: "application/json", body: "{}" };
    };
    const now = () => Date.now();
    const baseSession = () => Object.assign(JSON.parse(JSON.stringify(SESSION0)), { applyError: null, applyResult: null, applyToken: null, authorization: null, lease: null, retryNotBefore: null, log: [], posTabId: null, nwTabId: null, createdAt: now(), updatedAt: now() });
    const setSession = (patch) => evalIn(sw, `chrome.storage.local.set({ sessions: { ${JSON.stringify(KEY)}: ${JSON.stringify(Object.assign(baseSession(), patch))} } }).then(() => true)`);
    const setGrant = (on) => evalIn(sw, `chrome.storage.local.set({ grants: ${on ? JSON.stringify({ [`STG:${GR_CODE}`]: { schema: 1, envId: "STG", grCode: GR_CODE, createdAt: now(), expiresAt: now() + 30 * 60 * 1000 } }) : "{}"} }).then(() => true)`);
    const grants = async () => JSON.parse(await evalIn(sw, "chrome.storage.local.get('grants').then((x) => JSON.stringify(Object.keys(x.grants || {})))"));
    await evalIn(sw, "chrome.storage.local.set({config:{mode:'STG',url:''}}).then(()=>true)");
    await setGrant(false);
    await setSession({ state: "nw_ready", nwResult: null, scanOk: null });

    const g = await openPage(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`, handler, { trace: true });
    const pg = g.page;
    const auth = async () => evalIn(pg, `window.postMessage({mark:"cgn/pos-hook", type:"auth", payload:{envId:"STG", headers:${JSON.stringify(AUTH)}}}, location.origin), true`, (mainCtx(g.ctxs) || {}).id);
    const until = async (fn, ms = 8000) => {
      const t0 = Date.now();
      for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() - t0 > ms) return null;
        await sleep(100);
      }
    };
    const waitText = (re, ms) => until(async () => re.test(await panelText(pg)) && (await panelText(pg)), ms);
    await sleep(2500);
    await auth();

    const ctxId = () => (mainCtx(g.ctxs) || {}).id;
    phaseMark = (label) => void evalIn(pg, `console.timeStamp(${JSON.stringify(label)}), true`, ctxId()).catch(() => {});
    const geo = async () => JSON.parse((await evalIn(pg, GEO_JS, ctxId())) || "{}");
    async function layoutAt(label) {
      for (const [w, h] of VIEWPORTS) {
        await pg.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
        await sleep(300);
        const gm = await geo();
        check(
          `${label} · ${w}×${h}: một khung, trong luồng ngay trước #all-receipt, không nổi / không dính, dưới thẻ thông tin`,
          gm.hosts === 1 && gm.inline === 1 && gm.beforeAnchor && gm.pos === "static" && gm.hostTop >= gm.infoBottom && gm.anchorTop >= gm.hostTop + gm.hostH,
          JSON.stringify(gm)
        );
        const pc = JSON.parse((await evalIn(pg, PAGE_CLICK_JS, ctxId())) || "{}");
        check(`${label} · ${w}×${h}: mọi điều khiển SL nhận / vùng sản phẩm (${pc.n}) + HỦY / HOÀN THÀNH (${pc.bar}) bấm được`, pc.n >= 30 && pc.bar === 2 && pc.bad.length === 0, pc.bad.length ? pc.bad.slice(0, 6).join("; ") : "");
        const pb = await panelButtonsHit(pg, ctxId());
        check(`${label} · ${w}×${h}: nút trong khung (${pb.n}) bấm được`, pb.n >= 1 && pb.bad.length === 0, `${(pb.labels || []).join(" / ")}${pb.bad.length ? " · HỎNG: " + pb.bad.join(", ") : ""}`);
      }
      await pg.send("Emulation.clearDeviceMetricsOverride", {});
      await sleep(200);
    }

    // 1) Các trạng thái.
    const a1 = await waitText(/Đã khớp đơn Nextwaves/);
    check("nw_ready: khung trang phiếu hiện trạng thái + 'Mở tab Nextwaves'", !!a1 && /Mở tab Nextwaves/.test(a1), (a1 || (await panelText(pg))).slice(0, 140));
    await layoutAt("nw_ready");
    // Đoạn preflight giao operator (scripts/preflight-gr-page.js, runbook A1 §0d) trên đúng trạng thái preflight (nw_ready) ở 1095×756.
    {
      const src = fs.readFileSync(path.join(__dirname, "preflight-gr-page.js"), "utf8").replace('const WANT = "GR03887"', `const WANT = ${JSON.stringify(GR_CODE)}`);
      await pg.send("Emulation.setDeviceMetricsOverride", { width: 1095, height: 756, deviceScaleFactor: 1, mobile: false });
      await sleep(300);
      const pf = JSON.parse((await evalIn(pg, src, ctxId())) || "{}");
      check("đoạn preflight operator (scripts/preflight-gr-page.js) · nw_ready 1095×756: KET_QUA ĐẠT", pf.KET_QUA === "ĐẠT", JSON.stringify(pf).slice(0, 240));
      const kk = JSON.parse((await evalIn(pg, KIEM_KHUNG_JS, ctxId())) || "{}");
      check("đoạn kiểm v0.2.5 operator (scripts/kiem-khung-gr.js) · phiếu đang nhận: khung 1, trong luồng 1, nổi 0, có #all-receipt", kk.khung === 1 && kk.trongLuong === 1 && kk.noi === 0 && kk.allReceipt === true, JSON.stringify(kk));
      await pg.send("Emulation.clearDeviceMetricsOverride", {});
      phaseMark("cgn#so-sanh"); // hết nw_ready: cửa sổ so với --baseline
      await sleep(200);
    }

    await setSession({ state: "received" });
    const b1 = await waitText(/Chỉ xem kế hoạch — chưa có cấp phép điền/);
    check(`received chỉ xem: kế hoạch #${PLAN_HASH} 5 lô / 11 UID trong khung`, !!b1 && b1.includes(`#${PLAN_HASH}`) && /điền 11 UID vào 5 lô/.test(b1), (b1 || (await panelText(pg))).slice(0, 200));
    await layoutAt("received chỉ xem");

    // 2) Thu nhỏ tay → dải tiêu đề; có cấp phép → tự mở lại.
    await clickPanelButton(pg, "–");
    await sleep(300);
    const gMin = await geo();
    check("thu nhỏ tay: khung còn dải tiêu đề (≤ 48px), vẫn trong luồng trước #all-receipt", gMin.hosts === 1 && gMin.hostH > 0 && gMin.hostH <= 48 && gMin.beforeAnchor, JSON.stringify(gMin));
    await setGrant(true);
    const c1 = await waitText(new RegExp(`Điền vào phiếu ${GR_CODE} · kế hoạch #${PLAN_HASH} \\(11 UID\\)`));
    const gExp = await geo();
    check("đang thu nhỏ + có cấp phép (cần thao tác) → khung tự mở lại, nút Điền hiện", !!c1 && gExp.hostH > 120, `cao ${gExp.hostH}px`);
    await layoutAt("có cấp phép");

    await setSession({ state: "apply_stopped", applyError: { reason: "put_failed", status: 500, detailId: null, hash: PLAN_HASH } });
    const d1 = await waitText(/Lần điền trước dừng: POS từ chối ghi \(HTTP 500\)/);
    check("apply_stopped + cấp phép: cảnh báo lần trước dừng + nút Điền", !!d1 && /Điền vào phiếu/.test(d1), (d1 || "").slice(0, 160));
    await layoutAt("lần trước dừng");
    // PM audit sơ bộ P2: đang thu nhỏ, cảnh báo đổi nội dung (lý do dừng khác) mà tiêu đề + nút giữ nguyên → tự mở lại.
    await clickPanelButton(pg, "–");
    await sleep(300);
    const gMin2 = await geo();
    await setSession({ state: "apply_stopped", applyError: { reason: "gr_changed", status: null, detailId: null, hash: PLAN_HASH } });
    const d2 = await waitText(/Lần điền trước dừng: Phiếu vừa bị thay đổi/);
    await sleep(200);
    const gExp2 = await geo();
    check("đang thu nhỏ, cảnh báo đổi nội dung (lý do dừng khác), tiêu đề + nút giữ nguyên → khung tự mở lại", gMin2.hostH > 0 && gMin2.hostH <= 48 && !!d2 && gExp2.hostH > 120, `thu nhỏ ${gMin2.hostH}px → ${gExp2.hostH}px`);

    await setSession({ state: "applying", lease: { token: "tab-khac", expiresAt: now() + 10 * 60 * 1000 } });
    const e1 = await waitText(/Đang điền phiếu ở tab khác/);
    check("applying ở tab khác: khung báo, không nút Điền", !!e1 && !/Điền vào phiếu/.test(e1), (e1 || "").slice(0, 120));
    await layoutAt("đang điền ở tab khác");

    st.grDown = true;
    await setSession({ state: "received" });
    await pg.send("Page.reload", {});
    await sleep(2500);
    await auth();
    const f1 = await waitText(/Không đọc được phiếu nhận/);
    check("lỗi đọc phiếu: khung trong luồng báo lỗi + 'Thử lại'", !!f1 && /Thử lại/.test(f1), (f1 || (await panelText(pg))).slice(0, 120));
    await layoutAt("lỗi đọc phiếu");
    st.grDown = false;
    await pg.send("Page.reload", {});
    await sleep(2500);
    await auth();
    check("tải lại → có cấp phép: nút Điền", !!(await waitText(/Điền vào phiếu/)));

    // 3) Vẽ lại / route.
    const placesIdle = await evalIn(pg, COUNT_PLACES_JS(2000), ctxId());
    check("nghỉ 2 s: khung không gắn lại lần nào (không vòng observer)", placesIdle === 0, `gắn ${placesIdle} lần`);
    await evalIn(pg, `(() => { const tb = document.querySelector("#all-receipt tbody"); const rows = [...tb.children]; rows.slice(1).forEach((r) => r.remove()); rows.slice(1).forEach((r) => tb.appendChild(r)); return true; })()`, ctxId());
    await sleep(300);
    let gm = await geo();
    check("lọc (gỡ / thêm dòng bảng sản phẩm): một khung, đúng chỗ", gm.hosts === 1 && gm.beforeAnchor, JSON.stringify(gm));
    await evalIn(pg, `(() => { const a = document.getElementById("all-receipt"); const h = document.querySelector("[data-cgn-panel]"); if (h) h.remove(); a.replaceWith(a.cloneNode(true)); return true; })()`, ctxId());
    await sleep(400);
    gm = await geo();
    check("thay cả thẻ sản phẩm (#all-receipt mới, khung bị gỡ): gắn lại một khung trước anchor mới", gm.hosts === 1 && gm.beforeAnchor && /Điền vào phiếu/.test(await panelText(pg)), JSON.stringify(gm));
    await evalIn(pg, `(() => { const col = document.getElementById("all-receipt").parentElement; col.replaceChildren(...[...col.children].filter((c) => !c.hasAttribute("data-cgn-panel")).map((c) => c.cloneNode(true))); return true; })()`, ctxId());
    await sleep(400);
    gm = await geo();
    check("thay cả cột nội dung (thẻ thông tin + thẻ sản phẩm mới): một khung, đúng chỗ", gm.hosts === 1 && gm.beforeAnchor, JSON.stringify(gm));
    const placesIdle2 = await evalIn(pg, COUNT_PLACES_JS(2000), ctxId());
    check("sau các lượt vẽ lại, nghỉ 2 s: không gắn lại lần nào", placesIdle2 === 0, `gắn ${placesIdle2} lần`);

    // Route SPA sang phiếu khác (thẻ thông tin đổi mã) rồi quay lại.
    await evalIn(pg, `(() => { history.pushState({}, "", "/danh-sach-phieu-nhan-hang/${OTHER_ID}"); for (const n of document.querySelectorAll("#__next *")) for (const c of n.childNodes) if (c.nodeType === 3 && c.nodeValue.includes("${GR_CODE}")) c.nodeValue = c.nodeValue.replaceAll("${GR_CODE}", "GR09999"); return true; })()`, ctxId());
    await sleep(1500);
    gm = await geo();
    const tOther = await panelText(pg);
    check("route sang phiếu khác: ≤ 1 khung, không còn nút Điền / mã của GR03880", gm.hosts <= 1 && !/Điền vào phiếu/.test(tOther) && !tOther.includes(GR_CODE), `${gm.hosts} khung · ${tOther.slice(0, 120)}`);
    await evalIn(pg, `(() => { history.pushState({}, "", "/danh-sach-phieu-nhan-hang/${GR_ID}"); for (const n of document.querySelectorAll("#__next *")) for (const c of n.childNodes) if (c.nodeType === 3 && c.nodeValue.includes("GR09999")) c.nodeValue = c.nodeValue.replaceAll("GR09999", "${GR_CODE}"); return true; })()`, ctxId());
    const back = await waitText(/Điền vào phiếu/);
    gm = await geo();
    check("quay lại GR03880: một khung đúng chỗ, nút Điền", !!back && gm.hosts === 1 && gm.beforeAnchor, JSON.stringify(gm));

    // PM audit rev 1 P1: mã phiếu KHÔNG đồng nhất giữa thẻ thông tin (khối ngay trước #all-receipt) và breadcrumb. Trong CÙNG tác vụ:
    // đổi mã ở MỘT chỗ → bấm Điền (trước observer) → trả mã về. Cả hai chiều phải: 0 claim (phiên vẫn received), 0 PUT, cấp phép còn.
    const partStmt = (part, from, to) =>
      `{ const a = document.getElementById("all-receipt"); let info = a.previousElementSibling; while (info && info.hasAttribute("data-cgn-panel")) info = info.previousElementSibling;` +
      ` const box = ${part === "info" ? "info" : "info.previousElementSibling"}; const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); let t;` +
      ` while ((t = w.nextNode())) if (t.nodeValue.includes(${JSON.stringify(from)})) t.nodeValue = t.nodeValue.replaceAll(${JSON.stringify(from)}, ${JSON.stringify(to)}); }`;
    for (const [part, name] of [["info", "thẻ thông tin GR09999, breadcrumb vẫn GR03880"], ["crumb", "breadcrumb GR09999, thẻ thông tin vẫn GR03880"]]) {
      const puts0 = st.puts.length;
      const nn = await panelNodes(pg);
      const fb = nn && all(nn.sr, (x) => x.nodeName === "BUTTON" && /^Điền vào phiếu/.test(textOf(x)))[0];
      if (fb) {
        const ob = await pg.send("DOM.resolveNode", { backendNodeId: fb.backendNodeId });
        await pg.send("Runtime.callFunctionOn", { objectId: ob.result.object.objectId, functionDeclaration: `function () { ${partStmt(part, GR_CODE, "GR09999")} this.click(); ${partStmt(part, "GR09999", GR_CODE)} return true; }`, returnByValue: true });
      }
      await sleep(800);
      const sx = JSON.parse(await evalIn(sw, `chrome.storage.local.get("sessions").then((x) => JSON.stringify(x.sessions[${JSON.stringify(KEY)}]))`));
      const gx = (await grants()).length;
      check(`mã không đồng nhất (${name}) + bấm Điền cùng tác vụ → 0 claim (phiên vẫn received), 0 PUT, cấp phép còn`, !!fb && st.puts.length === puts0 && gx === 1 && sx.state === "received", `PUT ${st.puts.length - puts0} · cấp phép ${gx} · phiên ${sx.state}`);
      if (sx.state !== "received") break; // bản cũ đã ghi — các bước sau không còn ý nghĩa
      await clickPanelButton(pg, "Kiểm tra lại"); // bị chặn → khung báo "Không điền được"; kiểm lại → kế hoạch + nút Điền
      const ok = await waitText(/Điền vào phiếu/);
      check(`… sau đó "Kiểm tra lại" (mã đã đồng nhất) → nút Điền trở lại`, !!ok);
    }

    // PM audit sơ bộ P1: React đổi mã trên thẻ thông tin / breadcrumb sang phiếu khác, GIỮ NGUYÊN node #all-receipt, không đổi route,
    // và nút Điền bị bấm NGAY trong cùng tác vụ — trước khi MutationObserver kịp chạy → không giành quyền, không tiêu cấp phép, 0 PUT.
    // Sau đó observer gỡ khung (chữ của chính khung có mã GR03880 không được tính).
    const swapStmt = (from, to) => `for (const n of document.querySelectorAll("#__next *")) for (const c of n.childNodes) if (c.nodeType === 3 && c.nodeValue.includes(${JSON.stringify(from)})) c.nodeValue = c.nodeValue.replaceAll(${JSON.stringify(from)}, ${JSON.stringify(to)});`;
    const swapCode = (from, to) => `(() => { ${swapStmt(from, to)} return true; })()`;
    const putsP1 = st.puts.length;
    const n1 = await panelNodes(pg);
    const fill1 = n1 && all(n1.sr, (x) => x.nodeName === "BUTTON" && /^Điền vào phiếu/.test(textOf(x)))[0];
    if (fill1) {
      const o1 = await pg.send("DOM.resolveNode", { backendNodeId: fill1.backendNodeId });
      await pg.send("Runtime.callFunctionOn", { objectId: o1.result.object.objectId, functionDeclaration: `function () { ${swapStmt(GR_CODE, "GR09999")} this.click(); return true; }`, returnByValue: true });
    }
    await sleep(800);
    const sP1 = JSON.parse(await evalIn(sw, `chrome.storage.local.get("sessions").then((x) => JSON.stringify(x.sessions[${JSON.stringify(KEY)}]))`));
    const grP1 = (await grants()).length;
    check("thẻ thông tin đổi mã (giữ #all-receipt, không đổi route) + bấm Điền cùng tác vụ, trước observer → 0 PUT, cấp phép còn, phiên vẫn received", !!fill1 && st.puts.length === putsP1 && grP1 === 1 && sP1.state === "received", `PUT ${st.puts.length - putsP1} · cấp phép ${grP1} · phiên ${sP1.state}`);
    gm = await geo();
    check("… observer chạy → khung gỡ, không nằm cạnh bảng của phiếu khác", gm.hosts === 0, JSON.stringify(gm));
    await sleep(10500);
    const missText = await panelText(pg);
    gm = await geo();
    check("… quá 10 s vẫn không có bảng của đúng phiếu → khung nổi báo lỗi giao diện, không nút Điền", gm.inline === 0 && /Giao diện phiếu nhận đã đổi/.test(missText) && !/Điền vào phiếu/.test(missText), missText.slice(0, 120));
    await evalIn(pg, swapCode("GR09999", GR_CODE), ctxId()); // chỉ sửa nút chữ (characterData), không thêm / gỡ nút
    const back2 = await until(async () => { const x = await geo(); return x.hosts === 1 && x.inline === 1 && /Điền vào phiếu/.test(await panelText(pg)); }, 3000);
    gm = await geo();
    check("mã GR03880 trở lại (sửa nút chữ) → gắn lại một khung trong luồng đúng chỗ, nút Điền, khung nổi báo lỗi gỡ", !!back2 && gm.beforeAnchor, JSON.stringify(gm));

    // Trang liên tục gỡ khung (tranh giành): bỏ sau ≤ 20 lần gắn / 2 s → khung nổi báo lỗi giao diện, không nút Điền; trang hết tranh
    // giành → "Kiểm tra lại" → khung trong luồng trở lại.
    await evalIn(pg, `(() => { window.__cgnFight = new MutationObserver(() => { for (const h of document.querySelectorAll("[data-cgn-inline]")) h.remove(); }); window.__cgnFight.observe(document.documentElement, { childList: true, subtree: true }); document.querySelector("[data-cgn-inline]").remove(); return true; })()`, ctxId());
    await sleep(800);
    const fightText = await panelText(pg);
    const fn = await panelNodes(pg);
    check("trang liên tục gỡ khung → bỏ gắn, khung nổi báo 'liên tục vẽ lại', không nút Điền (không vòng vô hạn)", !!fn && !fn.inline && /liên tục vẽ lại/.test(fightText) && !/Điền vào phiếu/.test(fightText), fightText.slice(0, 140));
    await evalIn(pg, "window.__cgnFight.disconnect(), true", ctxId());
    await clickPanelButton(pg, "Kiểm tra lại");
    const back3 = await until(async () => (await geo()).inline === 1 && /Điền vào phiếu/.test(await panelText(pg)), 4000);
    gm = await geo();
    check("hết tranh giành → 'Kiểm tra lại' → một khung trong luồng đúng chỗ, nút Điền, không còn khung nổi", !!back3 && gm.hosts === 1 && gm.inline === 1 && gm.beforeAnchor, JSON.stringify(gm));

    // 4) W1 bằng bàn phím.
    const n = await panelNodes(pg);
    const fill = n && all(n.sr, (x) => x.nodeName === "BUTTON" && /^Điền vào phiếu/.test(textOf(x)))[0];
    if (fill) {
      await pg.send("DOM.focus", { backendNodeId: fill.backendNodeId });
      await pg.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
      await pg.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    }
    await until(() => st.puts.length >= 5, 10000);
    await sleep(2500); // tải lại sau khi điền
    await auth();
    const g1 = await waitText(new RegExp(`${GR_CODE}: đã điền 11 UID từ Nextwaves`), 10000);
    const steps = st.puts.map((p) => `${p.detailId.slice(0, 8)}:${p.body.detail.received_quantity}/${p.body.detail.thuocsi_qr_codes.length}`);
    check(`W1 bàn phím (focus + Enter trên nút Điền): 5 PUT đúng kế hoạch #${PLAN_HASH}, tải lại → "đã điền 11 UID"`, !!fill && st.puts.length === 5 && st.puts.reduce((s, p) => s + p.body.detail.thuocsi_qr_codes.length, 0) === 11 && !!g1, steps.join(" "));
    check("cấp phép đã tiêu sau khi điền", (await grants()).length === 0);
    await layoutAt("đã điền");

    // 5) Ngân sách tác vụ.
    phaseMark = null;
    const tr = await g.stopTrace();
    const tasks = extensionTasks(tr);
    const sorted = tasks.slice().sort((a, b) => b.ms - a.ms);
    const longest = sorted[0];
    const top3 = sorted.slice(0, 3).map((t) => `${t.ms.toFixed(2)} ms ${t.file}${t.fn ? ":" + t.fn : ""}${t.load ? " (nạp script)" : ""}`);
    info("tác vụ extension (cả lượt)", `${tasks.length} tác vụ, dài nhất ${longest ? `${longest.ms.toFixed(2)} ms ${longest.file}${longest.fn ? ":" + longest.fn : ""}` : "—"} · 3 dài nhất: ${top3.join(" | ")}`);
    sorted.slice(0, 5).forEach((t, i) => info(`  tác vụ dài #${i + 1}`, fmtTask(t)));
    // Gọi hàm theo vị trí (file:dòng:cột): số lần, dài nhất, tổng — chỉ ra hàm ẩn danh nào tốn nhất.
    const bySite = new Map();
    for (const t of tasks.filter((x) => !x.load)) {
      const k = `${t.file}:${t.line}:${t.col} ${t.fn || "(ẩn danh)"}`;
      const s = bySite.get(k) || { n: 0, max: 0, sum: 0 };
      s.n++;
      s.max = Math.max(s.max, t.ms);
      s.sum += t.ms;
      bySite.set(k, s);
    }
    const sites = [...bySite.entries()].sort((a, b) => b[1].max - a[1].max).slice(0, 5);
    info("gọi hàm theo vị trí (5 dài nhất)", sites.map(([k, s]) => `${k} ×${s.n} max ${s.max.toFixed(2)} tổng ${s.sum.toFixed(1)}`).join(" | "));
    const loads = tasks.filter((x) => x.load).sort((a, b) => b.ms - a.ms);
    info("nạp script (pha nạp)", loads.map((t) => `${t.file} ${t.ms.toFixed(2)}${t.cpu != null ? `/${t.cpu.toFixed(2)}` : ""}`).join(" | ") + " ms (thực/CPU)");
    const mt = mainThreadTasks(tr, "cgn#so-sanh");
    info("luồng chính trang CÓ extension (mở trang → hết nw_ready; so với --baseline)", fmtMain(mt));
    if (TRACE_OUT) fs.writeFileSync(TRACE_OUT, JSON.stringify({ mode: "extension", ext: EXT, version, browser: ver, checkNames, marks: traceMarks(tr), extTasks: tasks, mainTasks: (mt || []).filter((t) => t.ms >= 5) }, null, 1));
    check("không tác vụ nào của extension ≥ 50 ms (trace CDP từ lúc mở trang, gồm nạp script, vẽ lại, điền)", tasks.length > 0 && tasks.every((t) => t.ms < 50), longest ? `${longest.ms.toFixed(2)} ms` : "");
    pg.close();
    await closeTarget(g.targetId);

    // 6) Trang không có #all-receipt.
    st.noAnchor = true;
    const putsBefore = st.puts.length;
    st.gr = JSON.parse(JSON.stringify(GR0));
    await setSession({ state: "received" });
    await setGrant(true);
    const h = await openPage(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`, handler, { trace: true });
    await sleep(2500);
    await evalIn(h.page, `window.postMessage({mark:"cgn/pos-hook", type:"auth", payload:{envId:"STG", headers:${JSON.stringify(AUTH)}}}, location.origin), true`, (mainCtx(h.ctxs) || {}).id);
    await sleep(11500);
    const hn = await panelNodes(h.page);
    const ht = await panelText(h.page);
    check(
      "không có #all-receipt → sau 10 s: khung nổi báo lỗi giao diện, chỉ 'Kiểm tra lại', không nút Điền, 0 PUT, cấp phép còn",
      !!hn && !hn.inline && /Giao diện phiếu nhận đã đổi/.test(ht) && /Kiểm tra lại/.test(ht) && !/Điền vào phiếu/.test(ht) && st.puts.length === putsBefore && (await grants()).length === 1,
      ht.slice(0, 160)
    );
    const budget = async (x, label) => {
      const ts = extensionTasks(await x.stopTrace()).sort((a, b) => b.ms - a.ms);
      ts.slice(0, 3).forEach((t, i) => info(`  ${label} — tác vụ dài #${i + 1}`, fmtTask(t)));
      check(`${label}: không tác vụ nào của extension ≥ 50 ms`, ts.length > 0 && ts[0].ms < 50, ts[0] ? `${ts[0].ms.toFixed(2)} ms ${ts[0].file}:${ts[0].line}:${ts[0].col}` : "");
    };
    await budget(h, "nhánh thiếu chỗ gắn (trang mới, chờ 10 s → khung nổi)");
    h.page.close();
    await closeTarget(h.targetId);

    // 7) v0.2.5 (PM AUDIT-A1-GR03887 P2): phiếu kết thúc. A1 thật 28/10: HOÀN THÀNH 200 → trang COMPLETED không còn #all-receipt
    // → v0.2.4 hiện khung nổi đỏ sau 10 s. Ở đây trang "đã điền" (GR03880 sau W1 thật) tự gửi PUT status/COMPLETED qua hook THẬT
    // (server giả trả 200) rồi bỏ #all-receipt; quá 10 s phải: không khung nào, phiên done, không ui_anchor_missing, 0 PUT điền mới.
    const sessionNow = async () => JSON.parse(await evalIn(sw, `chrome.storage.local.get("sessions").then((x) => JSON.stringify((x.sessions || {})[${JSON.stringify(KEY)}] || null))`));
    st.noAnchor = false;
    st.gr = json("pos-stg-gr-GR03880-W1-sau-20261026.json");
    await setGrant(false);
    await setSession({ state: "applied", applyResult: { at: now(), hash: PLAN_HASH, steps: 5, uids: 11 } });
    const putsDone = st.puts.length;
    const k = await openPage(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`, handler, { trace: true });
    const kctx = () => (mainCtx(k.ctxs) || {}).id;
    await sleep(2500);
    await evalIn(k.page, `window.postMessage({mark:"cgn/pos-hook", type:"auth", payload:{envId:"STG", headers:${JSON.stringify(AUTH)}}}, location.origin), true`, kctx());
    const k1 = await until(async () => /đã điền 11 UID/.test(await panelText(k.page)) && (await panelNodes(k.page)));
    check("trang phiếu đã điền (GR03880 sau W1 thật): khung trong luồng 'đã điền 11 UID'", !!k1 && k1.inline, (await panelText(k.page)).slice(0, 120));
    const sc = await evalIn(k.page, `fetch(${JSON.stringify(`${POS}/backend/v1/order/goods-receipt/${GR_ID}/status/COMPLETED`)}, { method: "PUT", headers: ${JSON.stringify(AUTH)} }).then((r) => r.status)`, kctx());
    await evalIn(k.page, `(() => { const a = document.getElementById("all-receipt"); if (a) a.id = "x-receipt"; return true; })()`, kctx());
    await sleep(11500);
    const kn = await panelNodes(k.page);
    const ks = await sessionNow();
    const klog = ks ? ks.log.map((l) => l.type) : [];
    check(
      "HOÀN THÀNH do trang gọi (PUT status/COMPLETED 200 qua hook thật) → trang bỏ #all-receipt → quá 10 s: KHÔNG khung (không khung đỏ), phiên done, không ui_anchor_missing, 0 PUT điền mới",
      sc === 200 && st.completed === 1 && !kn && !!ks && ks.state === "done" && !klog.includes("ui_anchor_missing") && st.puts.length === putsDone,
      `HTTP ${sc} · khung ${kn ? (await panelText(k.page)).slice(0, 100) : "không"} · phiên ${ks && ks.state} · nhật ký ${klog.join(",")}`
    );
    const kk2 = JSON.parse((await evalIn(k.page, KIEM_KHUNG_JS, kctx())) || "{}");
    check("đoạn kiểm v0.2.5 operator (scripts/kiem-khung-gr.js) · phiếu đã HOÀN THÀNH: khung 0, không #all-receipt", kk2.khung === 0 && kk2.allReceipt === false, JSON.stringify(kk2));
    await budget(k, "trang đã điền → HOÀN THÀNH → bỏ #all-receipt");
    k.page.close();
    await closeTarget(k.targetId);

    // 7b) Mở lại (F5) phiếu COMPLETED thật (không có #all-receipt), phiên done → quá 10 s: không khung, không lỗi, chỉ đọc.
    st.noAnchor = true;
    st.gr = json("pos-stg-gr-GR03880-completed-20261026.json");
    await setSession({ state: "done" });
    const completedBefore = st.completed;
    const q = await openPage(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`, handler, { trace: true });
    await sleep(2500);
    await evalIn(q.page, `window.postMessage({mark:"cgn/pos-hook", type:"auth", payload:{envId:"STG", headers:${JSON.stringify(AUTH)}}}, location.origin), true`, (mainCtx(q.ctxs) || {}).id);
    await sleep(11500);
    const qn = await panelNodes(q.page);
    const qs = await sessionNow();
    check(
      "mở lại phiếu COMPLETED (GR03880 thật, không #all-receipt, phiên done) → quá 10 s: không khung, không ui_anchor_missing, không ghi",
      !qn && !!qs && !qs.log.some((l) => l.type === "ui_anchor_missing") && st.puts.length === putsDone && st.completed === completedBefore,
      qn ? (await panelText(q.page)).slice(0, 120) : "không khung"
    );
    await budget(q, "mở lại phiếu COMPLETED");
    q.page.close();
    await closeTarget(q.targetId);
  } catch (err) {
    check("chạy hết kịch bản", false, String((err && err.stack) || err).slice(0, 300));
  } finally {
    proc.kill();
    killProfile(prof);
  }
  const ok = results.every(Boolean);
  console.log(`\n${ok ? "TẤT CẢ ĐẠT" : "CÓ MỤC HỎNG"} (${results.filter(Boolean).length}/${results.length})`);
  process.exit(ok ? 0 : 1);
})();
