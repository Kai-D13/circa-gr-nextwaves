// v0.4.1 — = scripts/edge-v040.js (mục 1–6 giữ nguyên) + mục 7–8 của v0.4.1. Bản v0.4.0:
// kiểm trên TRÌNH DUYỆT THẬT (Edge / Chrome headless, hồ sơ tạm, không đăng nhập, không gọi server thật), thay
// scripts/edge-gr-page.js (v0.2.4 → v0.3.x, dựa trên cấp phép điền đã bỏ ở v0.4.0). Dùng lại nguyên hạ tầng của script cũ: DOM + CSS
// THẬT của trang phiếu POS staging, lượt thật GR03880 (GR trước điền, 11 tra QR, phiên extension), server giả qua CDP Fetch, trace CDP.
//
//   node scripts/edge-v041.js <thư mục extension giải nén>
//
// Kiểm:
//  1. nw_ready: khung trong luồng ngay trước #all-receipt ở 1095×756 / 1366×768 / 1440×900, mọi điều khiển trang + nút khung bấm được.
//  2. received → extension TỰ điền (không cấp phép): 5 PUT đúng kế hoạch #E33C777A (11 UID), KHÔNG PUT status/COMPLETED → tải lại →
//     khung "đã điền 11 mã vào 5 lô — kiểm danh sách rồi bấm HOÀN THÀNH" đúng chỗ.
//  3. apply_stopped (lần trước 503) → nút "Đọc lại và điền tiếp" → bấm bằng BÀN PHÍM (focus + Enter) → điền đủ (how retry).
//  4. Trace CDP từ lúc mở trang: không tác vụ nào của extension ≥ 50 ms.
//  5. Trang không có #all-receipt khi phiên received → KHÔNG tự điền; sau 10 s khung nổi báo lỗi giao diện, chỉ "Kiểm tra lại", 0 PUT.
//  6. HOÀN THÀNH do trang gửi (hook thật) → bỏ #all-receipt → quá 10 s không khung, phiên done; mở lại phiếu COMPLETED → không khung.
//  7. v0.4.1 phiếu phần còn lại: phiên received + remainder (1 tem = món đã bán gấp) → TỰ điền 10 UID, bỏ tem đó; khung vàng
//     'còn 1 sản phẩm CHƯA nhận đủ' + cảnh báo tồn Nextwaves dư (I6) + câu POS tách phiếu (I7).
//  8. v0.4.1 đầu đọc bị QR Scan Log giữ: trang bán hàng giả (QR Scan Log giả, Web Lock THẬT) + trang PO Nextwaves giả mở modal
//     (không phiên) → tự bấm Kết nối 3 lần → nút 'Lấy đầu đọc cho Nextwaves' (chưa Ngắt) → chuột thật bấm → Ngắt ĐÚNG một lần →
//     nhả lock → Nextwaves kết nối; không bấm 'Xác nhận nhận hàng'; đóng modal → nhắc Kết nối RFID; khung nổi ≤ 45vh (P3-9);
//     không tác vụ ≥ 50 ms trên cả hai trang.
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
const PO0 = json("pos-stg-po-PO00006754-SOBD1593849-20261026.json"); // mục 8: chế độ tự động đọc lại PO / SO trước khi tự điền
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

// ---------- v0.4.1: trang bán hàng giả (QR Scan Log giả) + trang PO Nextwaves giả (modal nhận hàng) ----------
// QR Scan Log giả theo hợp đồng tạm (docs/dev/REQUEST-QSL-v0.4.1-DAU-DOC.md): host #circa-rfid-demo-root (shadow open), panel
// #circa-rfid-demo-panel data-connection / data-state, button[data-action="disconnect"], Web Lock "circa-qr-scan-log:rfid-reader" THẬT.
// Bấm Ngắt → data-connection "disconnected", nhả lock sau 300 ms. Modal Nextwaves giả theo samples/nw-stg-receive-modal-markers-20261108.json.
const SALE_ID = "5a1e0000-0000-4000-8000-000000000001";
const NW_UI = "https://circa-stg.nextwaves.app";
const NW_PO_ID = "8932565c-6ade-4552-a419-ac8c6fafac5c";
const NW_SHIP = "IT-BUYMED-STAG-20261012083025-6398";
const SALE_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>POS giả — bán hàng (QR Scan Log giả)</title></head><body>
<h1>Bán hàng (giả)</h1><div id="circa-rfid-demo-root"></div>
<script>
  window.__qsl = { clicks: 0, releasedAt: 0 };
  const sr = document.getElementById("circa-rfid-demo-root").attachShadow({ mode: "open" });
  sr.innerHTML = '<div id="circa-rfid-demo-panel" data-connection="connected" data-state="idle"><span>RFID: đã kết nối</span> <button type="button" data-action="disconnect">Ngắt kết nối</button></div>';
  let release = null;
  navigator.locks.request("circa-qr-scan-log:rfid-reader", () => new Promise((r) => (release = r)));
  sr.querySelector("button").addEventListener("click", () => {
    window.__qsl.clicks += 1;
    sr.getElementById("circa-rfid-demo-panel").setAttribute("data-connection", "disconnected");
    setTimeout(() => { if (release) release(); window.__qsl.releasedAt = Date.now(); }, 300);
  });
</script></body></html>`;
const NW_PO_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Nextwaves giả — PO</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 0; }
  [role=dialog] { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 720px; max-width: 90vw; background: #fff; border: 1px solid #ccc; padding: 20px; box-sizing: border-box; }
  [role=dialog] button { margin: 4px; }
</style></head><body>
<h1>PO11623096 (giả)</h1>
<div id="NwcPortalsContainer"><div data-portal-id="1"><div><div data-nwc-layer data-nwc-overlay><div>
  <div role="dialog" aria-modal="true" aria-labelledby="_r_3a_" class="Nwc-Modal-Dialog">
    <h2 id="_r_3a_">Nhận hàng bằng cách quét</h2>
    <p>Quét tem của phiếu gửi ${NW_SHIP}. Hàng được nhận vào CIRCA FLORITA. Phiếu gửi này sẽ được chấp nhận trước, rồi mới nhận hàng.</p>
    <p>10 còn lại cần quét · Đã nhận 0 / 10</p>
    <button type="button" id="nw-connect">Kết nối đầu đọc</button>
    <label id="scan-receive-qrLabel" for="scan-receive-qr">Quét hoặc nhập EPC hay mã QR nhãn</label> <input id="scan-receive-qr">
    <p>Còn thiếu 10. Xử lý đơn mua hàng thế nào?</p>
    <label><input type="radio" name="_r_37_" value="keep_open" checked> Giữ đơn mở</label>
    <label><input type="radio" name="_r_37_" value="close_short"> Đóng đơn dù còn thiếu</label>
    <div><button type="button">Hủy</button> <button type="button" id="nw-confirm">Xác nhận nhận hàng</button></div>
  </div>
</div></div></div></div></div>
<script>
  window.__nw = { clicks: [], connectedAt: 0, portFree: false, confirmClicks: 0 };
  const b = document.getElementById("nw-connect");
  b.addEventListener("click", () => {
    window.__nw.clicks.push(Date.now());
    if (window.__nw.portFree) { b.textContent = "Bắt đầu quét"; window.__nw.connectedAt = Date.now(); }
  });
  document.getElementById("nw-confirm").addEventListener("click", () => (window.__nw.confirmClicks += 1));
</script></body></html>`;
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
  await p.send("Fetch.enable", { patterns: (opts.patterns || [`${POS}/*`]).map((urlPattern) => ({ urlPattern })) });
  await p.send("Page.enable", {});
  await p.send("DOM.enable", {});
  if (opts.trace) await p.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,v8.execute", transferMode: "ReportEvents" });
  await p.send("Page.navigate", { url });
  const stopTrace = async () => {
    const done = new Promise((r) => (traceDone = r));
    await p.send("Tracing.end", {});
    // v0.4.1: không chờ mãi nếu trace không đóng (vd. trace chưa bật được) — trả phần đã có, mục ngân sách sẽ HỎNG nếu rỗng.
    const ok = await Promise.race([done.then(() => true), sleep(30000).then(() => false)]);
    if (!ok) console.log("ĐO    trace không đóng trong 30 s — dùng phần sự kiện đã nhận");
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

// Khung NỔI (shadow đóng, .box position fixed): chiều cao thật + max-height tính được (CDP xuyên shadow) so với khung nhìn.
async function floatBoxGeo(p, ctxId) {
  const n = await panelNodes(p);
  if (!n) return { err: "không có khung" };
  const cls = (x) => {
    const a = x.attributes || [];
    const i = a.indexOf("class");
    return i >= 0 ? String(a[i + 1]) : "";
  };
  const box = all(n.sr, (x) => x.nodeName === "DIV" && /(^|\s)box(\s|$)/.test(cls(x)))[0];
  if (!box) return { err: "không thấy .box" };
  await p.send("CSS.enable", {});
  const cs = await p.send("CSS.getComputedStyleForNode", { nodeId: box.nodeId });
  const prop = ((cs.result && cs.result.computedStyle) || []).find((x) => x.name === "max-height");
  const bm = await centerOf(p, box.backendNodeId);
  const vh = await evalIn(p, "innerHeight", ctxId);
  return { vh, maxH: prop ? parseFloat(prop.value) : null, h: bm ? Math.round(bm.h) : null };
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
    console.log("HỎNG  quá 600 s — trang / extension treo");
    proc.kill();
    killProfile(prof);
    process.exit(1);
  }, 600000);
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
    // seq: thứ tự request ghi / đọc phiếu (mục 8: G = GET phiếu, P = PUT detail, C = PUT status/COMPLETED).
    const st = { gr: JSON.parse(JSON.stringify(GR0)), puts: [], grDown: false, noAnchor: false, completed: 0, seq: [], completedNoAnchor: false };
    const handler = async (r) => {
      const u = new URL(r.url);
      if (u.origin === NW_UI) return /^\/vi\/purchases\/[0-9a-f-]{36}\/?$/.test(u.pathname) ? { status: 200, type: "text/html; charset=utf-8", body: NW_PO_PAGE } : { status: 404, type: "application/json", body: "{}" };
      if (/^\/ban-hang\/[0-9a-f-]{36}\/?$/.test(u.pathname)) return { status: 200, type: "text/html; charset=utf-8", body: SALE_PAGE };
      if (/^\/danh-sach-phieu-nhan-hang\/[0-9a-f-]{36}\/?$/.test(u.pathname)) {
        const noAnchor = st.noAnchor || (st.completedNoAnchor && st.gr.data.status === "COMPLETED"); // trang COMPLETED thật không có #all-receipt
        return { status: 200, type: "text/html; charset=utf-8", body: noAnchor ? GR_PAGE_NO_ANCHOR : GR_PAGE };
      }
      if (/^\/backend\/v1\/pos\/[0-9a-f-]{36}\/po\/[0-9a-f-]{36}$/.test(u.pathname) && r.method === "GET") return { status: 200, type: "application/json", body: JSON.stringify(PO0) };
      if (/^\/backend\/v1\/order\/goods-receipt\/[0-9a-f-]{36}$/.test(u.pathname) && r.method === "GET") st.seq.push("G");
      if (/\/detail\/[0-9a-f-]{36}$/.test(u.pathname) && r.method === "PUT") st.seq.push("P");
      if (/\/status\/COMPLETED$/.test(u.pathname) && r.method === "PUT") st.seq.push("C");
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
    // v0.4.0: phiên schema 2, tenant staging, kho của đơn đã khớp (mẫu lượt thật đã có warehouseId).
    const baseSession = () => Object.assign(JSON.parse(JSON.stringify(SESSION0)), { schema: 2, nwTenant: "circa-stg", applyError: null, applyResult: null, applyToken: null, authorization: null, lease: null, retryNotBefore: null, log: [], posTabId: null, nwTabId: null, createdAt: now(), updatedAt: now() });
    const setSession = (patch) => evalIn(sw, `chrome.storage.local.set({ sessions: { ${JSON.stringify(KEY)}: ${JSON.stringify(Object.assign(baseSession(), patch))} } }).then(() => true)`);
    await evalIn(sw, "chrome.storage.local.set({config:{mode:'STG',url:''}}).then(()=>true)");
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
    async function layoutAt(label, minButtons = 1) {
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
        check(`${label} · ${w}×${h}: nút trong khung (${pb.n}) bấm được`, pb.n >= minButtons && pb.bad.length === 0, `${(pb.labels || []).join(" / ")}${pb.bad.length ? " · HỎNG: " + pb.bad.join(", ") : ""}`);
      }
      await pg.send("Emulation.clearDeviceMetricsOverride", {});
      await sleep(200);
    }

    const sessionNow = async () => JSON.parse(await evalIn(sw, `chrome.storage.local.get("sessions").then((x) => JSON.stringify((x.sessions || {})[${JSON.stringify(KEY)}] || null))`));
    const budget = async (x, label) => {
      const ts = extensionTasks(await x.stopTrace()).sort((a, b) => b.ms - a.ms);
      ts.slice(0, 3).forEach((t, i) => info(`  ${label} — tác vụ dài #${i + 1}`, fmtTask(t)));
      check(`${label}: không tác vụ nào của extension ≥ 50 ms`, ts.length > 0 && ts[0].ms < 50, ts[0] ? `${ts[0].ms.toFixed(2)} ms ${ts[0].file}:${ts[0].line}:${ts[0].col}` : "");
    };
    const uidsOf = (puts) => puts.reduce((n, p) => n + p.body.detail.thuocsi_qr_codes.length, 0);

    // 1) nw_ready.
    const a1 = await waitText(/Đã khớp đơn Nextwaves/);
    check("nw_ready: khung trang phiếu hiện trạng thái + 'Mở tab Nextwaves'", !!a1 && /Mở tab Nextwaves/.test(a1), (a1 || (await panelText(pg))).slice(0, 140));
    await layoutAt("nw_ready");
    {
      const kk = JSON.parse((await evalIn(pg, KIEM_KHUNG_JS, ctxId())) || "{}");
      check("đoạn kiểm operator (scripts/kiem-khung-gr.js) · phiếu đang nhận: khung 1, trong luồng 1, nổi 0, có #all-receipt", kk.khung === 1 && kk.trongLuong === 1 && kk.noi === 0 && kk.allReceipt === true, JSON.stringify(kk));
      phaseMark("cgn#so-sanh");
      await sleep(200);
    }

    // 2) received → TỰ điền.
    await setSession({ state: "received" });
    await until(() => st.puts.length >= 5, 15000);
    await sleep(500);
    const steps = st.puts.map((p) => `${p.detailId.slice(0, 8)}:${p.body.detail.received_quantity}/${p.body.detail.thuocsi_qr_codes.length}`);
    check(`received → TỰ điền (không cấp phép): 5 PUT đúng kế hoạch #${PLAN_HASH} (11 UID), không PUT status/COMPLETED`, st.puts.length === 5 && uidsOf(st.puts) === 11 && st.completed === 0, steps.join(" "));
    const s2 = await until(async () => {
      const x = await sessionNow();
      return x && x.state === "applied" && x;
    }, 8000);
    check("phiên applied; lượt tự điền ghi applyClaim auto đúng kế hoạch", !!s2 && !!s2.applyClaim && s2.applyClaim.how === "auto" && s2.applyClaim.planHash === PLAN_HASH, s2 ? JSON.stringify(s2.applyClaim) : "không applied");
    await sleep(2500); // tải lại sau khi điền
    await auth();
    const g1 = await waitText(new RegExp(`${GR_CODE}: đã điền 11 mã vào 5 lô — kiểm danh sách rồi bấm HOÀN THÀNH`), 10000);
    check("tải lại → khung 'đã điền 11 mã vào 5 lô — kiểm danh sách rồi bấm HOÀN THÀNH'", !!g1, (g1 || (await panelText(pg))).slice(0, 160));
    await layoutAt("đã điền", 0);

    // 3) apply_stopped → "Đọc lại và điền tiếp" bằng bàn phím.
    st.gr = JSON.parse(JSON.stringify(GR0));
    const p0 = st.puts.length;
    await setSession({ state: "apply_stopped", applyError: { reason: "put_uncertain", status: 503 } });
    const d1 = await waitText(/Đọc lại và điền tiếp/);
    check("apply_stopped (503): cảnh báo 'Lần điền trước dừng … (HTTP 503)' + nút 'Đọc lại và điền tiếp', 0 PUT tự động", !!d1 && /Lần điền trước dừng/.test(d1) && /HTTP 503/.test(d1) && st.puts.length === p0, (d1 || "").slice(0, 200));
    await layoutAt("dừng — điền tiếp");
    {
      const n = await panelNodes(pg);
      const btn = n && all(n.sr, (x) => x.nodeName === "BUTTON" && /^Đọc lại và điền tiếp/.test(textOf(x)))[0];
      if (btn) {
        await pg.send("DOM.focus", { backendNodeId: btn.backendNodeId });
        await pg.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
        await pg.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      }
      await until(() => st.puts.length >= p0 + 5, 10000);
      const s3 = await until(async () => {
        const x = await sessionNow();
        return x && x.state === "applied" && x;
      }, 8000);
      check("bàn phím (focus + Enter) trên 'Đọc lại và điền tiếp' → 5 PUT, phiên applied, applyClaim retry, không HOÀN THÀNH", !!btn && st.puts.length === p0 + 5 && uidsOf(st.puts.slice(p0)) === 11 && !!s3 && s3.applyClaim.how === "retry" && st.completed === 0, `PUT ${st.puts.length - p0}`);
    }
    await sleep(2500);
    await auth();
    await waitText(/đã điền 11 mã vào 5 lô/, 10000);

    // 4) Ngân sách tác vụ.
    phaseMark = null;
    {
      const tr = await g.stopTrace();
      const tasks = extensionTasks(tr);
      const sorted = tasks.slice().sort((a, b) => b.ms - a.ms);
      sorted.slice(0, 5).forEach((t, i) => info(`  tác vụ dài #${i + 1}`, fmtTask(t)));
      const mt = mainThreadTasks(tr, "cgn#so-sanh");
      info("luồng chính trang CÓ extension (mở trang → hết nw_ready)", fmtMain(mt));
      if (TRACE_OUT) fs.writeFileSync(TRACE_OUT, JSON.stringify({ mode: "extension-v041", ext: EXT, version, browser: ver, checkNames, marks: traceMarks(tr), extTasks: tasks, mainTasks: (mt || []).filter((t) => t.ms >= 5) }, null, 1));
      check("không tác vụ nào của extension ≥ 50 ms (trace CDP từ lúc mở trang, gồm nạp script, vẽ lại, tự điền, điền tiếp)", tasks.length > 0 && tasks.every((t) => t.ms < 50), sorted[0] ? `${sorted[0].ms.toFixed(2)} ms` : "");
    }
    pg.close();
    await closeTarget(g.targetId);

    // 5) Trang không có #all-receipt → KHÔNG tự điền.
    st.noAnchor = true;
    st.gr = JSON.parse(JSON.stringify(GR0));
    const putsBefore = st.puts.length;
    await setSession({ state: "received" });
    const h = await openPage(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`, handler, { trace: true });
    await sleep(2500);
    await evalIn(h.page, `window.postMessage({mark:"cgn/pos-hook", type:"auth", payload:{envId:"STG", headers:${JSON.stringify(AUTH)}}}, location.origin), true`, (mainCtx(h.ctxs) || {}).id);
    await sleep(11500);
    const hn = await panelNodes(h.page);
    const ht = await panelText(h.page);
    check(
      "received + không có #all-receipt → KHÔNG tự điền; sau 10 s: khung nổi báo lỗi giao diện, chỉ 'Kiểm tra lại', 0 PUT",
      !!hn && !hn.inline && /Giao diện phiếu nhận đã đổi/.test(ht) && /Kiểm tra lại/.test(ht) && !/Điền vào phiếu|Đọc lại và điền tiếp/.test(ht) && st.puts.length === putsBefore,
      ht.slice(0, 160)
    );
    await budget(h, "nhánh thiếu chỗ gắn (trang mới, chờ 10 s → khung nổi)");
    h.page.close();
    await closeTarget(h.targetId);

    // 6) HOÀN THÀNH do trang gửi → không khung; mở lại phiếu COMPLETED → không khung.
    st.noAnchor = false;
    st.gr = json("pos-stg-gr-GR03880-W1-sau-20261026.json");
    await setSession({ state: "applied", applyResult: { at: now(), hash: PLAN_HASH, steps: 5, uids: 11 } });
    const putsDone = st.puts.length;
    const k = await openPage(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`, handler, { trace: true });
    const kctx = () => (mainCtx(k.ctxs) || {}).id;
    await sleep(2500);
    await evalIn(k.page, `window.postMessage({mark:"cgn/pos-hook", type:"auth", payload:{envId:"STG", headers:${JSON.stringify(AUTH)}}}, location.origin), true`, kctx());
    const k1 = await until(async () => /đã điền 11 mã vào 5 lô/.test(await panelText(k.page)) && (await panelNodes(k.page)));
    check("trang phiếu đã điền (GR03880 sau điền thật): khung trong luồng 'đã điền 11 mã vào 5 lô'", !!k1 && k1.inline, (await panelText(k.page)).slice(0, 120));
    const sc = await evalIn(k.page, `fetch(${JSON.stringify(`${POS}/backend/v1/order/goods-receipt/${GR_ID}/status/COMPLETED`)}, { method: "PUT", headers: ${JSON.stringify(AUTH)} }).then((r) => r.status)`, kctx());
    await evalIn(k.page, `(() => { const a = document.getElementById("all-receipt"); if (a) a.id = "x-receipt"; return true; })()`, kctx());
    await sleep(11500);
    const kn = await panelNodes(k.page);
    const ks = await sessionNow();
    const klog = ks ? ks.log.map((l) => l.type) : [];
    check(
      "HOÀN THÀNH do trang gửi (PUT status/COMPLETED 200 qua hook thật) → bỏ #all-receipt → quá 10 s: KHÔNG khung, phiên done, không ui_anchor_missing, 0 PUT điền mới",
      sc === 200 && st.completed === 1 && !kn && !!ks && ks.state === "done" && !klog.includes("ui_anchor_missing") && st.puts.length === putsDone,
      `HTTP ${sc} · khung ${kn ? (await panelText(k.page)).slice(0, 100) : "không"} · phiên ${ks && ks.state} · nhật ký ${klog.join(",")}`
    );
    await budget(k, "trang đã điền → HOÀN THÀNH → bỏ #all-receipt");
    k.page.close();
    await closeTarget(k.targetId);
    st.noAnchor = true;
    st.gr = json("pos-stg-gr-GR03880-completed-20261026.json");
    await setSession({ state: "done" });
    const q = await openPage(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`, handler, { trace: true });
    await sleep(2500);
    await evalIn(q.page, `window.postMessage({mark:"cgn/pos-hook", type:"auth", payload:{envId:"STG", headers:${JSON.stringify(AUTH)}}}, location.origin), true`, (mainCtx(q.ctxs) || {}).id);
    await sleep(11500);
    const qn = await panelNodes(q.page);
    check("mở lại phiếu COMPLETED (không #all-receipt, phiên done) → quá 10 s: không khung, không ghi", !qn && st.puts.length === putsDone && st.completed === 1, qn ? (await panelText(q.page)).slice(0, 120) : "không khung");
    await budget(q, "mở lại phiếu COMPLETED");
    q.page.close();
    await closeTarget(q.targetId);

    // 7) v0.4.1 — phiếu phần còn lại: phiên received có remainder (1 UID của lượt nhận nằm trên phiếu đã xong = món bán gấp) → TỰ điền
    //    10 UID (bỏ tem đó), khung "đã điền 10 mã — còn 1 sản phẩm CHƯA nhận đủ" + cảnh báo tồn Nextwaves dư (I6) + câu POS tách phiếu (I7).
    st.noAnchor = false;
    st.completedNoAnchor = false;
    st.gr = JSON.parse(JSON.stringify(GR0));
    // Tem "đã bán gấp" = chai kem 2431732 (1 chai = 1 dòng, không quy đổi) → bỏ tem này không làm lẻ đơn vị; 6 vỉ + 4 túi vẫn điền đủ.
    const SOLD = SESSION0.nwResult.units.find((u) => u.posProductId === "2431732").uid;
    const putsRem = st.puts.length;
    const completedRem = st.completed; // mục 6 đã có một lần HOÀN THÀNH do trang gửi
    await setSession({ state: "received", remainder: { completed: [{ id: OTHER_ID, code: "GR03999" }], excludeUids: [SOLD, "1783950641470X99"] } });
    const rm = await openPage(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`, handler, { trace: true });
    const rctx = () => (mainCtx(rm.ctxs) || {}).id;
    await sleep(2500);
    await evalIn(rm.page, `window.postMessage({mark:"cgn/pos-hook", type:"auth", payload:{envId:"STG", headers:${JSON.stringify(AUTH)}}}, location.origin), true`, rctx());
    await until(async () => {
      const x = await sessionNow();
      return x && x.state === "applied" && x;
    }, 15000);
    const remPuts = st.puts.slice(putsRem);
    const remCodes = remPuts.flatMap((p) => p.body.detail.thuocsi_qr_codes);
    check(
      "v0.4.1 phiếu phần còn lại: TỰ điền 10 UID (bỏ tem món đã bán gấp), không PUT status/COMPLETED",
      remCodes.length === 10 && !remCodes.includes(SOLD) && st.completed === completedRem,
      `PUT ${remPuts.length}, UID ${remCodes.length}${remCodes.includes(SOLD) ? " — CÓ tem đã bán" : ""}`
    );
    await sleep(2500);
    await evalIn(rm.page, `window.postMessage({mark:"cgn/pos-hook", type:"auth", payload:{envId:"STG", headers:${JSON.stringify(AUTH)}}}, location.origin), true`, rctx());
    const rt = await until(async () => {
      const t = await panelText(rm.page);
      return /đã điền 10 mã — còn 1 sản phẩm CHƯA nhận đủ/.test(t) && t;
    }, 10000);
    check(
      "v0.4.1 phiếu phần còn lại: khung vàng 'đã điền 10 mã — còn 1 sản phẩm CHƯA nhận đủ' + cảnh báo tồn Nextwaves dư (I6) + câu POS tách phiếu (I7)",
      !!rt && /Nextwaves đã nhận cả 1 tem món đã bán gấp/.test(rt) && /POS tách phần chưa đủ sang một phiếu mới/.test(rt),
      (rt || (await panelText(rm.page))).slice(0, 220)
    );
    await budget(rm, "phiếu phần còn lại (tự điền + tải lại)");
    rm.page.close();
    await closeTarget(rm.targetId);

    // 8) v0.4.1 — đầu đọc bị QR Scan Log giữ: trang bán hàng giả (QR Scan Log giả: host #circa-rfid-demo-root shadow open, panel
    //    data-connection, nút Ngắt, Web Lock thật) + trang PO Nextwaves giả mở modal "Nhận hàng bằng cách quét" (KHÔNG phiên).
    await evalIn(sw, "chrome.storage.local.set({ sessions: {} }).then(() => true)");
    // Trace của trình duyệt chỉ một phiên một lúc: trace ở tab Nextwaves (gồm mọi tiến trình, cả tab bán hàng), tab bán hàng không trace riêng.
    const sale = await openPage(`${POS}/ban-hang/${SALE_ID}`, handler, { trace: false });
    const sctx = () => (mainCtx(sale.ctxs) || {}).id;
    await sleep(2000);
    const qslHeld = await until(async () => (await evalIn(sale.page, "navigator.locks.query().then((q) => q.held.some((l) => l.name === 'circa-qr-scan-log:rfid-reader'))", sctx())) === true, 5000);
    check("trang bán hàng giả: QR Scan Log giả giữ Web Lock đầu đọc + khung đang hiện", !!qslHeld, "");
    const nwp = await openPage(`${NW_UI}/vi/purchases/${NW_PO_ID}`, handler, { trace: true, patterns: [`${NW_UI}/*`] });
    const nctx = () => (mainCtx(nwp.ctxs) || {}).id;
    // Tab Nextwaves là tab dược sĩ đang nhìn (extension không tự bấm khi tab ẩn).
    await nwp.page.send("Page.bringToFront", {});
    await nwp.page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await nwp.page.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    const nwState = async () => JSON.parse((await evalIn(nwp.page, "JSON.stringify(window.__nw || null)", nctx())) || "null");
    const qslState = async () => JSON.parse((await evalIn(sale.page, "JSON.stringify(window.__qsl || null)", sctx())) || "null");
    const helper = await until(async () => {
      const t = await panelText(nwp.page);
      return /Đầu đọc cho màn nhận hàng/.test(t) && t;
    }, 8000);
    check("modal nhận hàng mở thẳng từ trang PO (không phiên) → khung 'Đầu đọc cho màn nhận hàng' + số phiếu gửi", !!helper && new RegExp(`Phiếu gửi ${NW_SHIP}`).test(helper), (helper || (await panelText(nwp.page))).slice(0, 200));
    // Tự bấm "Kết nối đầu đọc" (cổng bị QR Scan Log giữ → không kết nối) → sau lần đầu hỏi QR Scan Log (review v0.4.1 P3-12) → nút "Lấy đầu đọc cho Nextwaves".
    const offer = await until(async () => {
      const t = await panelText(nwp.page);
      return /Lấy đầu đọc cho Nextwaves/.test(t) && t;
    }, 40000);
    const n1 = await nwState();
    const q1 = await qslState();
    check(
      "tự bấm Kết nối không được → khung báo tab bán hàng (QR Scan Log) đang giữ + nút 'Lấy đầu đọc cho Nextwaves' (từ sau lần tự bấm đầu); CHƯA bấm Ngắt",
      !!offer && /đang giữ — bấm “Lấy đầu đọc cho Nextwaves”/.test(offer) && n1 && n1.clicks.length >= 1 && n1.clicks.length <= 3 && q1 && q1.clicks === 0 && n1.confirmClicks === 0,
      `tự bấm ${n1 && n1.clicks.length}, Ngắt ${q1 && q1.clicks}, Xác nhận ${n1 && n1.confirmClicks}`
    );
    {
      const pb = await panelButtonsHit(nwp.page, nctx());
      check("nút khung trên trang Nextwaves bấm được (chuột thật tới giữa nút)", pb.n >= 2 && pb.bad.length === 0, `${(pb.labels || []).join(" / ")}${pb.bad.length ? " · HỎNG: " + pb.bad.join(", ") : ""}`);
      const geo = await floatBoxGeo(nwp.page, nctx());
      check("khung nổi trên Nextwaves cao tối đa 45% khung nhìn (audit P3-9)", geo.vh > 0 && geo.maxH > 0 && geo.maxH <= geo.vh * 0.45 + 1 && geo.h > 0 && geo.h <= geo.vh * 0.45 + 1, JSON.stringify(geo));
    }
    // Dược sĩ bấm (chuột thật) → extension nhờ tab bán hàng bấm Ngắt đúng một lần, chờ nhả lock → bấm Kết nối ngay.
    const tClick = Date.now();
    const clicked = await clickPanelButton(nwp.page, "Lấy đầu đọc cho Nextwaves");
    const freed = await until(async () => {
      const q = await qslState();
      return q && q.releasedAt && q;
    }, 8000);
    if (freed) await evalIn(nwp.page, "(window.__nw.portFree = true, true)", nctx());
    const conn = await until(async () => {
      const n = await nwState();
      return n && n.connectedAt && n;
    }, 8000);
    const q2 = await qslState();
    check(
      "bấm 'Lấy đầu đọc cho Nextwaves' → Ngắt QR Scan Log ĐÚNG một lần → nhả lock → Nextwaves kết nối trong 5 s, không bấm 'Xác nhận nhận hàng'",
      clicked && !!freed && q2.clicks === 1 && !!conn && conn.connectedAt >= freed.releasedAt && conn.connectedAt - tClick < 5000 && conn.confirmClicks === 0,
      conn ? `nhả lock +${freed.releasedAt - tClick} ms, kết nối +${conn.connectedAt - tClick} ms, bấm Kết nối ${conn.clicks.length} lần` : "không kết nối"
    );
    const t8 = await until(async () => {
      const t = await panelText(nwp.page);
      return /Đã lấy từ tab bán hàng/.test(t) && t;
    }, 5000);
    check("khung: 'Đầu đọc: đã kết nối' + 'Đã lấy từ tab bán hàng'", !!t8 && /Đầu đọc: đã kết nối/.test(t8), (t8 || (await panelText(nwp.page))).slice(0, 200));
    await evalIn(nwp.page, '(document.getElementById("NwcPortalsContainer").remove(), true)', nctx());
    const t9 = await until(async () => {
      const t = await panelText(nwp.page);
      return /nhận hàng xong/.test(t) && t;
    }, 5000);
    check("đóng modal → khung 'Đầu đọc: nhận hàng xong' nhắc sang tab bán hàng bấm 'Kết nối RFID' (chọn cổng)", !!t9 && /Kết nối RFID/.test(t9) && /chọn cổng/.test(t9), (t9 || (await panelText(nwp.page))).slice(0, 200));
    await budget(nwp, "trang Nextwaves + trang bán hàng (modal không phiên → tự bấm → lấy đầu đọc → Ngắt hộ → đóng modal)");
    nwp.page.close();
    await closeTarget(nwp.targetId);
    sale.page.close();
    await closeTarget(sale.targetId);
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
