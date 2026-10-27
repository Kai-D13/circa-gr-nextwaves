// Kiểm extension trên TRÌNH DUYỆT THẬT (Edge / Chrome headless, hồ sơ tạm, không đăng nhập, không gọi server POS thật).
// Sinh ra sau lỗi T1 25/10 (env.js nạp trùng → ISOLATED world thiếu env) mà trình duyệt giả trong tests/ không thấy.
//
//   node scripts/edge-check.js <thư mục extension>        vd. node scripts/edge-check.js C:\circa-gr-nextwaves-v0.2.0
//
// Các phép kiểm (CDP Fetch trả trang POS giả + dữ liệu mẫu samples/; request của chính trang giả mang header x-cgn-test-page,
// request không có header đó là của extension):
//  1. Service worker nạp được, đúng version.
//  2. Trang Nextwaves staging thật (trang đăng nhập): MAIN world có env + hook; ISOLATED world có env + thư viện + content script.
//  3. Trang phiếu GR03878 (v0.2: CHỈ TẠO PHIÊN KHI BẤM): mở phiếu → khung có nút "Nhận hàng bằng RFID", chỉ đọc GR + PO, KHÔNG tự
//     mở Nextwaves / tạo phiên; bấm nút → tìm GR theo SO, phiên waiting_nw, mở Nextwaves ?po=SOBD1593858; storage không token.
//  4. (v0.1.6) Khung không chồng nút HOÀN THÀNH góc dưới phải (mở rộng / thu nhỏ ≤ 330px); bỏ nút → khung về mép dưới 16px.
//  5. (v0.2) Trang danh sách giả (bảng 20 dòng, script của trang gọi API danh sách): nút chỉ ở dòng chờ / đang nhận đúng cửa hàng,
//     nằm cạnh nút .circa-rfid-po-link của extension Nextwaves (không đè); chỉ xem → 0 request của extension; bấm nút không mở dòng;
//     bấm → một phiên, mở Nextwaves, tab POS ở lại danh sách.
//  6. (v0.2) Hiệu năng: bơm 300 thay đổi DOM trên danh sách và trên trang bán hàng giả. CPU quy cho script extension đo bằng
//     CDP Profiler (lọc chrome-extension://), thời gian từng lượt quét nút đo trong gr-list; 0 request của extension.
//     Ngân sách: mỗi lượt quét < 2 ms — cùng ngưỡng cho lượt lúc tải trang (kể cả lượt đầu "lạnh") và lượt trong bão DOM;
//     tổng CPU extension trong cả đợt < 50 ms (⇒ không có task > 50 ms do extension).
//     Trace CDP (devtools.timeline) từ lúc mở trang danh sách / bán hàng: in TOÀN BỘ tác vụ của extension (dòng "ĐO": mỗi lời gọi
//     cấp cao nhất vào script extension + mỗi lần nạp script, có tên file / hàm / dòng); kiểm không tác vụ nào ≥ 50 ms.
//     CGN_TRACE_OUT=<file> ghi trace trang danh sách ra file để phân tích thêm.
//  7. (v0.2) Trang bán hàng giả: không khung, không nút, không request của extension.
// In "ĐẠT" / "HỎNG" từng mục; mã thoát 0 nếu tất cả đạt.
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const EXT = path.resolve(process.argv[2] || path.join(__dirname, "..", "src"));
const ROOT = path.join(__dirname, "..");
const PORT = 9339;
const POS = "https://pos.stg.circa-v2.buymed.tech";
const NW_PAGE = "https://circa-stg.nextwaves.app/vi/purchases/receive?po=SOBD1593858";
const GR_ID = "2de6c0ec-2ea8-4038-8616-659fa3f5820a";
const STORE = "64a8663b-0c9e-49c6-9626-0a4c7c4bd53d";
const OTHER_STORE = "00000000-0000-0000-0000-00000000abcd";
const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];
const sample = (n) => fs.readFileSync(path.join(ROOT, "samples", n), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "ĐẠT " : "HỎNG"}  ${name}${detail ? "  — " + detail : ""}`);
};

// ---------- trang POS giả ----------
const PASS_BUDGET_MS = 2; // ngân sách PM: mỗi lượt quét nút < 2 ms
const AUTH_JS = `{"authorization":"Bearer kiem-thu","x-client-id":"1","x-store-id":"${STORE}","grpc-timeout":"30S","x-cgn-test-page":"1"}`;
// Trang phiếu: nút HOÀN THÀNH cố định góc dưới phải (vị trí như POS thật, operator 26/10).
const GR_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>POS giả — phiếu</title></head><body>POS staging (trang giả để kiểm extension)' +
  '<div style="position:fixed;right:24px;bottom:12px"><button id="cgn-test-done" style="width:180px;height:44px">HOÀN THÀNH</button></div></body></html>';
// 20 dòng: GR03878 thật + 9 chờ nhận + 3 đang nhận (cửa hàng 2222), 5 đã nhận, 1 huỷ, 1 chờ nhận cửa hàng khác. Nút kỳ vọng: 13.
const ROWS = (() => {
  const out = [{ id: GR_ID, code: "GR03878", status: "WAITING_TO_RECEIVE", store: STORE }];
  const add = (n, status, store) => {
    for (let i = 0; i < n; i++) {
      const k = out.length;
      out.push({ id: `11111111-2222-4333-8444-${String(k).padStart(12, "0")}`, code: `GR0390${String(k).padStart(2, "0")}`, status, store: store || STORE });
    }
  };
  add(9, "WAITING_TO_RECEIVE");
  add(3, "RECEIVING");
  add(5, "COMPLETED");
  add(1, "CANCELED");
  add(1, "WAITING_TO_RECEIVE", OTHER_STORE);
  return out;
})();
const EXPECTED_BUTTONS = ROWS.filter((r) => r.store === STORE && (r.status === "WAITING_TO_RECEIVE" || r.status === "RECEIVING")).map((r) => r.code).sort();
const LIST_API = `${POS}/backend/v1/order/goods-receipt/search?query=pos_id=${STORE},,with_items=true,with_details=true,is_count_all_status=true&limit=20&page=1&order_by=created_at=desc`;
function listBody() {
  const gr = JSON.parse(sample("gr-stg-GR03878-20261024.json")).data;
  const rows = ROWS.map((r) => Object.assign({}, gr, { id: r.id, code: r.code, status: r.status, pos_info: Object.assign({}, gr.pos_info, { id: r.store }) }));
  return JSON.stringify({ success: true, data: { goods_receipts: rows, total: rows.length, page: 1, limit: 20, status_count: {} } });
}
// Bảng giống dạng bảng POS (ô cuối div.flex chứa icon); vài dòng có sẵn nút .circa-rfid-po-link như extension Nextwaves.
// Bấm vào dòng → đếm window.__rowClicks (POS thật mở phiếu khi bấm dòng). Script của trang gọi API danh sách + một API khác.
function tableHtml(title, withListCall) {
  const trs = ROWS.map(
    (r, i) =>
      `<tr onclick="window.__rowClicks=(window.__rowClicks||0)+1"><td><span>${r.code}</span></td><td><span>PO0000${6700 + i}</span></td>` +
      `<td><span class="st">${r.status}</span></td><td><div class="flex items-center justify-center"><button class="ic">→</button>` +
      (i % 3 === 0 ? '<button type="button" class="circa-rfid-po-link">View on Nextwaves</button>' : "") +
      "</div></td></tr>"
  ).join("");
  const call = (url) => `(function(){var x=new XMLHttpRequest();x.open("GET",${JSON.stringify(url)});var h=${AUTH_JS};for(var k in h)x.setRequestHeader(k,h[k]);x.send();})();`;
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><div id="app"><table><thead><tr><th>Mã</th><th>PO</th><th>Trạng thái</th><th></th></tr></thead>` +
    `<tbody id="rows">${trs}</tbody></table></div><script>${call(`${POS}/backend/v1/entity`)}${withListCall ? call(LIST_API) : ""}</script></body></html>`
  );
}

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
const newPage = async () => (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
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

// Mở trang, theo dõi execution context; fetchHandler (tuỳ chọn) trả response cho URL khớp mẫu.
// opts.trace: ghi trace CDP (devtools.timeline) từ TRƯỚC khi điều hướng; stopTrace() trả mọi sự kiện.
async function openPage(url, fetchPattern, fetchHandler, opts = {}) {
  const tgt = await newPage();
  const ctxs = [];
  const traceEvents = [];
  let traceDone = null;
  let page = null;
  page = await cdp(tgt.webSocketDebuggerUrl, async (m) => {
    if (m.method === "Tracing.dataCollected") for (const e of m.params.value) traceEvents.push(e);
    if (m.method === "Tracing.tracingComplete" && traceDone) traceDone();
    if (m.method === "Runtime.executionContextCreated") ctxs.push(m.params.context);
    if (m.method === "Runtime.executionContextDestroyed") {
      const i = ctxs.findIndex((c) => c.id === m.params.executionContextId);
      if (i >= 0) ctxs.splice(i, 1);
    }
    if (m.method === "Runtime.executionContextsCleared") ctxs.length = 0;
    if (m.method === "Fetch.requestPaused") {
      const r = fetchHandler(m.params.request);
      await page.send("Fetch.fulfillRequest", { requestId: m.params.requestId, responseCode: r.status, responseHeaders: [{ name: "Content-Type", value: r.type }], body: Buffer.from(r.body, "utf8").toString("base64") });
    }
  });
  await page.send("Runtime.enable", {});
  if (fetchPattern) await page.send("Fetch.enable", { patterns: [{ urlPattern: fetchPattern }] });
  await page.send("Page.enable", {});
  if (opts.trace) await page.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,v8.execute", transferMode: "ReportEvents" });
  await page.send("Page.navigate", { url });
  const stopTrace = async () => {
    const done = new Promise((r) => (traceDone = r));
    await page.send("Tracing.end", {});
    await done;
    return traceEvents;
  };
  return { page, ctxs, targetId: tgt.id, stopTrace };
}
const isolatedCtx = (ctxs) => ctxs.filter((c) => c.auxData && c.auxData.type === "isolated" && /Circa GR/.test(c.name)).pop();
const mainCtx = (ctxs) => ctxs.filter((c) => c.auxData && c.auxData.isDefault).pop();

// Shadow root (đóng) của khung extension — CDP DOM xuyên shadow.
async function panelShadow(page) {
  const doc = await page.send("DOM.getDocument", { depth: -1, pierce: true });
  let host = null;
  const walk = (n) => {
    if (!n || host) return;
    if (n.attributes && n.attributes.includes("data-cgn-panel")) host = n;
    (n.children || []).forEach(walk);
    (n.shadowRoots || []).forEach(walk);
  };
  walk(doc.result.root);
  return host && host.shadowRoots && host.shadowRoots[0] ? host.shadowRoots[0] : null;
}

async function panelText(page) {
  const sr = await panelShadow(page);
  if (!sr) return "";
  const html = (await page.send("DOM.getOuterHTML", { nodeId: sr.nodeId })).result.outerHTML;
  return html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, " | ").replace(/(\s*\|\s*)+/g, " | ").trim();
}

const findNode = (n, pred) => {
  if (!n) return null;
  if (pred(n)) return n;
  for (const c of n.children || []) {
    const x = findNode(c, pred);
    if (x) return x;
  }
  return null;
};
const hasClass = (n, cls) => {
  const ci = n.attributes ? n.attributes.indexOf("class") : -1;
  return ci >= 0 && n.attributes[ci + 1].split(" ").includes(cls);
};
async function rectOf(page, n) {
  if (!n) return null;
  const q = (await page.send("DOM.getBoxModel", { nodeId: n.nodeId })).result.model.border;
  return { left: q[0], top: q[1], right: q[2], bottom: q[5], width: q[2] - q[0], height: q[5] - q[1] };
}
async function clickAt(page, r) {
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  for (const type of ["mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
}

// Rect của khung, nút thu nhỏ và nút có nhãn `label` (nếu có) trong khung.
async function panelRects(page, label) {
  const sr = await panelShadow(page);
  if (!sr) return null;
  const btn = label
    ? findNode(sr, (n) => n.nodeName === "BUTTON" && n.children && n.children.some((c) => c.nodeType === 3 && c.nodeValue === label))
    : null;
  return { box: await rectOf(page, findNode(sr, (n) => hasClass(n, "box"))), min: await rectOf(page, findNode(sr, (n) => hasClass(n, "x"))), btn: await rectOf(page, btn) };
}
const overlap = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// CPU (ms) quy cho script extension trong một hồ sơ CDP Profiler: tổng self-time của nút có callFrame.url chrome-extension://…
function extensionCpuMs(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  let ext = 0;
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = (profile.timeDeltas[i] || 0) / 1000;
    const n = byId.get(profile.samples[i]);
    if (!n) continue;
    if (n.callFrame.functionName !== "(idle)" && n.callFrame.functionName !== "(program)") total += dt;
    if (String(n.callFrame.url || "").startsWith("chrome-extension://")) ext += dt;
  }
  return { ext, total };
}

// TOÀN BỘ tác vụ của extension từ trace CDP (devtools.timeline), không phụ thuộc số đo tự báo của gr-list (PM audit v0.2.1 G0.4):
// mỗi lời gọi JS cấp cao nhất từ trình duyệt vào script extension (FunctionCall: bộ nghe sự kiện / message, timer, MutationObserver)
// và mỗi lần nạp script (EvaluateScript), kể cả việc nằm ngoài lát quét như querySelectorAll('tr').
function extensionTasks(events) {
  const dataOf = (e) => (e.args && e.args.data) || {};
  return events
    .filter((e) => e.ph === "X" && typeof e.dur === "number" && (e.name === "FunctionCall" || e.name === "EvaluateScript") && String(dataOf(e).url || "").startsWith("chrome-extension://"))
    .map((e) => ({ load: e.name === "EvaluateScript", file: String(dataOf(e).url).replace(/^chrome-extension:\/\/[^/]+\//, ""), fn: dataOf(e).functionName || "", line: dataOf(e).lineNumber, ms: e.dur / 1000 }));
}
function taskSummary(tasks) {
  const calls = tasks.filter((t) => !t.load).sort((a, b) => b.ms - a.ms);
  const loads = tasks.filter((t) => t.load).sort((a, b) => b.ms - a.ms);
  const fmt = (t) => `${t.ms.toFixed(2)} ms ${t.file}${t.fn ? ":" + t.fn : ""}${t.line !== undefined ? " L" + (t.line + 1) : ""}`;
  return {
    callMax: calls.length ? calls[0].ms : 0,
    loadMax: loads.length ? loads[0].ms : 0,
    all: tasks.length ? Math.max(...tasks.map((t) => t.ms)) : 0,
    text: `gọi ${calls.length} lần, dài nhất ${calls.slice(0, 3).map(fmt).join("; ") || "—"} · nạp script ${loads.length} file, tổng ${loads.reduce((s, t) => s + t.ms, 0).toFixed(1)} ms, dài nhất ${loads[0] ? fmt(loads[0]) : "—"}`,
  };
}
const info = (name, detail) => console.log(`ĐO    ${name}  — ${detail}`);

// 300 thay đổi DOM trên bảng (đổi chữ, thêm / gỡ phần tử) theo 30 lượt, mỗi lượt cách nhau 50 ms (~1,5 s liên tục).
const STORM_JS = `(async () => {
  const tb = document.getElementById("rows");
  for (let b = 0; b < 30; b++) {
    for (let i = 0; i < 10; i++) {
      const tr = tb.children[(b * 10 + i) % tb.children.length];
      const st = tr.querySelector(".st");
      st.textContent = st.textContent.endsWith(".") ? st.textContent.slice(0, -1) : st.textContent + ".";
      const s = document.createElement("span");
      s.className = "tmp";
      tr.firstElementChild.appendChild(s);
      s.remove();
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return true;
})()`;

(async () => {
  const browser = BROWSERS.find((b) => fs.existsSync(b));
  if (!browser) {
    console.log("HỎNG  không thấy Edge / Chrome");
    process.exit(2);
  }
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "cgn-edge-check-"));
  const proc = spawn(browser, ["--headless=new", `--user-data-dir=${prof}`, `--remote-debugging-port=${PORT}`, "--no-first-run", "--disable-features=DisableLoadExtensionCommandLineSwitch", `--load-extension=${EXT}`, "about:blank"], { stdio: "ignore" });
  try {
    await sleep(4000);
    const manifest = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8"));
    const sw = await serviceWorker();
    check("service worker nạp được", !!sw, sw ? `version ${await evalIn(sw, "chrome.runtime.getManifest().version")} (manifest ${manifest.version})` : "trình duyệt không nạp extension");
    if (!sw) throw new Error("dừng");
    await evalIn(sw, "chrome.storage.local.set({config:{mode:'STG',url:''}}).then(()=>true)");

    // 2) Nextwaves staging thật (chưa đăng nhập → trang đăng nhập, cùng origin nên script vẫn nạp).
    const nw = await openPage(NW_PAGE);
    await sleep(6000);
    const nwIso = isolatedCtx(nw.ctxs);
    const nwMain = mainCtx(nw.ctxs);
    const nwIsoKeys = nwIso ? JSON.parse((await evalIn(nw.page, "JSON.stringify(Object.keys(globalThis.__CGN__||{}))", nwIso.id)) || "[]") : [];
    const nwMainInfo = nwMain ? JSON.parse((await evalIn(nw.page, "JSON.stringify({env: !!(window.__CGN__&&window.__CGN__.env), hook: !!window.__CGN_NW_HOOK__})", nwMain.id)) || "{}") : {};
    check("Nextwaves · MAIN world có env + hook", nwMainInfo.env === true && nwMainInfo.hook === true, JSON.stringify(nwMainInfo));
    check("Nextwaves · ISOLATED world có env, nw, match, resolve, ui", ["env", "keys", "nw", "match", "resolve", "ui"].every((k) => nwIsoKeys.includes(k)), JSON.stringify(nwIsoKeys));
    nw.page.close();
    await closeTarget(nw.targetId);
    await sleep(500);

    // Server POS giả (CDP Fetch). Request của trang giả mang x-cgn-test-page; còn lại là của extension.
    const reqs = [];
    const handler = (r) => {
      const u = new URL(r.url);
      const page = !!(r.headers["x-cgn-test-page"] || r.headers["X-Cgn-Test-Page"]);
      if (u.pathname.startsWith("/backend/")) reqs.push({ method: r.method, path: u.pathname, search: u.search, page, auth: !!(r.headers.authorization || r.headers.Authorization), store: r.headers["x-store-id"] || "" });
      if (/^\/danh-sach-phieu-nhan-hang\/[0-9a-f-]{36}\/?$/.test(u.pathname)) return { status: 200, type: "text/html; charset=utf-8", body: GR_HTML };
      if (/^\/danh-sach-phieu-nhan-hang\/?$/.test(u.pathname)) return { status: 200, type: "text/html; charset=utf-8", body: tableHtml("POS giả — danh sách", true) };
      if (/^\/ban-hang\/?$/.test(u.pathname)) return { status: 200, type: "text/html; charset=utf-8", body: tableHtml("POS giả — bán hàng", false) };
      if (u.pathname === `/backend/v1/order/goods-receipt/${GR_ID}`) return { status: 200, type: "application/json", body: sample("gr-stg-GR03878-20261024.json") };
      if (/^\/backend\/v1\/pos\/.+\/po\//.test(u.pathname)) return { status: 200, type: "application/json", body: sample("po-stg-PO00006750-SOBD1593858.json") };
      if (u.pathname === "/backend/v1/order/goods-receipt/search") {
        if (/so_thuocsi=/.test(decodeURIComponent(u.search))) return { status: 200, type: "application/json", body: sample("pos-stg-gr-search-so-1593858.json") };
        return { status: 200, type: "application/json", body: listBody() };
      }
      if (u.pathname === "/backend/v1/entity") return { status: 200, type: "application/json", body: "{}" };
      return { status: 404, type: "application/json", body: "{}" };
    };
    const extReqs = () => reqs.filter((r) => !r.page);
    const nwTabIds = async () => (await listTargets()).filter((t) => t.type === "page" && t.url.startsWith("https://circa-stg.nextwaves.app/")).map((t) => t.id);
    const sessions = async () => JSON.parse((await evalIn(sw, "chrome.storage.local.get('sessions').then(x=>JSON.stringify(Object.values(x.sessions||{})))")) || "[]");

    // 3) Trang phiếu GR03878: không tự chạy; bấm mới tạo phiên.
    const nwBefore = new Set(await nwTabIds());
    const pos = await openPage(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`, `${POS}/*`, handler);
    await sleep(3000);
    const posIso = isolatedCtx(pos.ctxs);
    const posMain = mainCtx(pos.ctxs);
    const posIsoKeys = posIso ? JSON.parse((await evalIn(pos.page, "JSON.stringify(Object.keys(globalThis.__CGN__||{}))", posIso.id)) || "[]") : [];
    check("POS · ISOLATED world có env, pos, plan, apply, ui, grList", ["env", "keys", "pos", "plan", "apply", "ui", "grList"].every((k) => posIsoKeys.includes(k)), JSON.stringify(posIsoKeys));
    // Tin "auth" như pos-hook gửi khi app POS gọi API (trang phiếu giả không gọi API).
    await evalIn(pos.page, `window.postMessage({mark:"cgn/pos-hook", type:"auth", payload:{envId:"STG", headers:{authorization:"Bearer kiem-thu", "x-client-id":"1", "x-store-id":"${STORE}", "grpc-timeout":"30S"}}}, location.origin), true`, posMain && posMain.id);
    await sleep(4000);
    const viewReqs = extReqs().map((r) => r.path);
    const text = await panelText(pos.page);
    const opened0 = (await nwTabIds()).filter((id) => !nwBefore.has(id));
    check(
      "POS · mở phiếu: khung có nút 'Nhận hàng bằng RFID', chỉ đọc GR + PO, KHÔNG tự mở Nextwaves / tạo phiên",
      /Nhận hàng bằng RFID/.test(text) && /SOBD1593858-F/.test(text) && opened0.length === 0 && (await sessions()).length === 0 && viewReqs.some((p) => p.endsWith(GR_ID)) && viewReqs.some((p) => p.includes("/po/")) && !viewReqs.some((p) => p.includes("/search")),
      `khung: ${text.slice(0, 120)} · tab Nextwaves mới ${opened0.length} · API ${JSON.stringify(viewReqs)}`
    );
    const pr0 = await panelRects(pos.page, "Nhận hàng bằng RFID");
    if (pr0 && pr0.btn) await clickAt(pos.page, pr0.btn);
    await sleep(4000);
    const api = extReqs();
    const s = (await sessions()).find((x) => x.grId === GR_ID);
    const opened1 = (await nwTabIds()).filter((id) => !nwBefore.has(id));
    check("POS · bấm nút → tìm GR theo SO kèm header + cửa hàng, phiên waiting_nw (schema, không khoá), mở MỘT tab Nextwaves", !!s && s.state === "waiting_nw" && s.schema === 1 && s.writeLocks.length === 0 && opened1.length === 1 && api.some((r) => r.path.endsWith("/search")) && api.every((r) => r.auth && r.store === STORE), s ? JSON.stringify({ state: s.state, returnUrl: s.returnUrl, createdBy: s.createdBy, tabs: opened1.length }) : "không có phiên");
    check("Storage không chứa token", (await evalIn(sw, "chrome.storage.local.get(null).then(x=>!JSON.stringify(x).includes('Bearer'))")) === true);

    // 4) Khung không che nút HOÀN THÀNH của trang.
    const btnRect = async () => JSON.parse((await evalIn(pos.page, "JSON.stringify(document.getElementById('cgn-test-done').getBoundingClientRect())", posMain && posMain.id)) || "null");
    const vh = await evalIn(pos.page, "innerHeight", posMain && posMain.id);
    const btn = await btnRect();
    let pr = await panelRects(pos.page);
    check("POS · khung (mở rộng) không chồng nút HOÀN THÀNH góc dưới phải", !!pr && !!pr.box && !overlap(pr.box, btn) && pr.box.top >= 0, pr && pr.box ? `khung ${JSON.stringify(pr.box)} · nút ${JSON.stringify(btn)} · vh ${vh}` : "không đọc được khung");
    if (pr && pr.min) {
      await clickAt(pos.page, pr.min);
      await sleep(600);
      pr = await panelRects(pos.page);
    }
    check("POS · khung thu nhỏ gọn (≤ 330px) và vẫn không chồng nút", !!pr && !!pr.box && pr.box.width <= 330 && !overlap(pr.box, btn), pr && pr.box ? JSON.stringify(pr.box) : "không đọc được khung");
    await evalIn(pos.page, "document.getElementById('cgn-test-done').remove(), true", posMain && posMain.id);
    await sleep(1600);
    pr = await panelRects(pos.page);
    check("POS · bỏ nút → khung về mép dưới 16px", !!pr && !!pr.box && Math.abs(vh - pr.box.bottom - 16) <= 1, pr && pr.box ? `mép dưới cách đáy ${Math.round(vh - pr.box.bottom)}px` : "không đọc được khung");
    pos.page.close();
    await closeTarget(pos.targetId);

    // 5) Danh sách: dọn phiên để GR03878 lại có nút "Nhận hàng bằng RFID".
    await evalIn(sw, "chrome.storage.local.set({sessions:{}}).then(()=>true)");
    for (const id of await nwTabIds()) await closeTarget(id);
    await sleep(500);
    reqs.length = 0;
    const lst = await openPage(`${POS}/danh-sach-phieu-nhan-hang`, `${POS}/*`, handler, { trace: true });
    await sleep(4000);
    const lMain = mainCtx(lst.ctxs);
    const lIso = isolatedCtx(lst.ctxs);
    const btns = JSON.parse((await evalIn(lst.page, `JSON.stringify([...document.querySelectorAll("button.cgn-rfid-btn")].map(b=>({code:b.getAttribute("data-cgn-code"), text:b.textContent, type:b.type, sameCell: !!b.parentElement.querySelector(".circa-rfid-po-link"), inLastCell: b.closest("td")===b.closest("tr").lastElementChild})))`, lMain && lMain.id)) || "[]");
    const codes = btns.map((b) => b.code).sort();
    check("Danh sách · nút chỉ ở dòng chờ / đang nhận đúng cửa hàng (13/20), type=button, ở ô cuối", JSON.stringify(codes) === JSON.stringify(EXPECTED_BUTTONS) && btns.every((b) => b.type === "button" && b.text === "Nhận hàng bằng RFID" && b.inLastCell), `${codes.length} nút: ${codes.join(",")}`);
    const theirs = await evalIn(lst.page, 'document.querySelectorAll(".circa-rfid-po-link").length', lMain && lMain.id);
    check("Danh sách · sống chung nút .circa-rfid-po-link (không gỡ / không đè)", theirs === 7 && btns.filter((b) => b.sameCell).length >= 4, `circa-rfid-po-link ${theirs}/7, cùng ô ${btns.filter((b) => b.sameCell).length}`);
    check("Danh sách · chỉ xem: 0 request API của extension, không khung", extReqs().length === 0 && !(await panelShadow(lst.page)), JSON.stringify(extReqs().map((r) => r.path)));

    // 6) Hiệu năng: bão DOM trên danh sách (extension đang chạy observer) — CPU quy cho extension + số đo từng lượt quét.
    await lst.page.send("Profiler.enable", {});
    await lst.page.send("Profiler.setSamplingInterval", { interval: 100 });
    // Lượt quét lúc tải trang (tạo 13 nút) đo riêng rồi đặt lại số đo, để đợt bão chỉ tính lượt do thay đổi DOM.
    const stats0 = JSON.parse((await evalIn(lst.page, "JSON.stringify(globalThis.__CGN__.grList.stats(true))", lIso && lIso.id)) || "{}");
    await lst.page.send("Profiler.start", {});
    await evalIn(lst.page, STORM_JS, lMain && lMain.id);
    await sleep(800);
    const prof1 = (await lst.page.send("Profiler.stop", {})).result.profile;
    const stats1 = JSON.parse((await evalIn(lst.page, "JSON.stringify(globalThis.__CGN__.grList.stats())", lIso && lIso.id)) || "{}");
    const cpuList = extensionCpuMs(prof1);
    const listTrace = await lst.stopTrace();
    if (process.env.CGN_TRACE_OUT) fs.writeFileSync(process.env.CGN_TRACE_OUT, JSON.stringify(listTrace));
    const listTasks = taskSummary(extensionTasks(listTrace));
    info("Toàn bộ tác vụ extension · danh sách từ lúc mở trang tới hết bão DOM (trace CDP)", listTasks.text);
    check("Hiệu năng · không tác vụ extension nào ≥ 50 ms trên danh sách (long task)", listTasks.all < 50, `dài nhất ${listTasks.all.toFixed(2)} ms`);
    // Cùng một ngưỡng cho mọi lượt (PM audit v0.2.0 P2.2): lượt lúc tải trang (kể cả lượt đầu "lạnh") và lượt trong bão DOM.
    check(
      `Hiệu năng · lúc tải danh sách (tạo ${EXPECTED_BUTTONS.length} nút): mỗi lượt quét < ${PASS_BUDGET_MS} ms`,
      stats0.applies >= 1 && stats0.maxMs < PASS_BUDGET_MS,
      `${stats0.applies} lượt, tối đa ${Number(stats0.maxMs).toFixed(3)} ms, tổng ${Number(stats0.totalMs).toFixed(2)} ms`
    );
    check(
      `Hiệu năng · danh sách + 300 thay đổi DOM (~1,5 s liên tục): quét lại ≥ 2 lượt (chờ tối đa 1 s), mỗi lượt < ${PASS_BUDGET_MS} ms, CPU extension < 50 ms, 0 request`,
      stats1.applies >= 2 && stats1.maxMs < PASS_BUDGET_MS && cpuList.ext < 50 && extReqs().length === 0,
      `bão: ${stats1.applies} lượt (gom từ ${stats1.mutationBatches} đợt thay đổi), tối đa ${Number(stats1.maxMs).toFixed(3)} ms, tổng ${Number(stats1.totalMs).toFixed(2)} ms · CPU extension ${cpuList.ext.toFixed(1)} ms / trang ${cpuList.total.toFixed(1)} ms`
    );

    // Bấm nút của ta: không mở dòng; tạo một phiên, mở Nextwaves, tab POS ở lại danh sách.
    await evalIn(lst.page, 'document.querySelector("button.cgn-rfid-btn[data-cgn-code=\\"GR03878\\"]").click(), true', lMain && lMain.id);
    await sleep(4000);
    const rowClicks = await evalIn(lst.page, "window.__rowClicks||0", lMain && lMain.id);
    const s2 = (await sessions()).filter((x) => x.grId === GR_ID);
    const listUrl = await evalIn(lst.page, "location.href", lMain && lMain.id);
    const nwTabs2 = await nwTabIds();
    const label = await evalIn(lst.page, 'document.querySelector("button.cgn-rfid-btn[data-cgn-code=\\"GR03878\\"]").textContent', lMain && lMain.id);
    check(
      "Danh sách · bấm nút: không mở dòng, MỘT phiên (returnUrl = trang phiếu), MỘT tab Nextwaves, POS ở lại danh sách",
      rowClicks === 0 && s2.length === 1 && s2[0].returnUrl === `${POS}/danh-sach-phieu-nhan-hang/${GR_ID}` && nwTabs2.length === 1 && /\/danh-sach-phieu-nhan-hang$/.test(listUrl),
      `bấm dòng ${rowClicks} · phiên ${s2.length} · tab Nextwaves ${nwTabs2.length} · nút giờ: "${label}" · URL ${listUrl}`
    );
    lst.page.close();
    await closeTarget(lst.targetId);

    // 7) Trang bán hàng giả: extension không làm gì; bão DOM để so CPU.
    reqs.length = 0;
    const sale = await openPage(`${POS}/ban-hang`, `${POS}/*`, handler, { trace: true });
    await sleep(3000);
    const sMain = mainCtx(sale.ctxs);
    await sale.page.send("Profiler.enable", {});
    await sale.page.send("Profiler.setSamplingInterval", { interval: 100 });
    await sale.page.send("Profiler.start", {});
    await evalIn(sale.page, STORM_JS, sMain && sMain.id);
    await sleep(800);
    const cpuSale = extensionCpuMs((await sale.page.send("Profiler.stop", {})).result.profile);
    const ours = await evalIn(sale.page, 'document.querySelectorAll("button.cgn-rfid-btn").length', sMain && sMain.id);
    const saleTasks = taskSummary(extensionTasks(await sale.stopTrace()));
    info("Toàn bộ tác vụ extension · trang bán hàng từ lúc mở trang tới hết bão DOM (trace CDP)", saleTasks.text);
    check(
      "Trang bán hàng · không khung, không nút, 0 request của extension; CPU extension trong bão DOM ≈ 0",
      !(await panelShadow(sale.page)) && ours === 0 && extReqs().length === 0 && cpuSale.ext < 5,
      `CPU extension ${cpuSale.ext.toFixed(1)} ms / trang ${cpuSale.total.toFixed(1)} ms · request extension ${extReqs().length}`
    );
    sale.page.close();
    sw.close();
  } catch (e) {
    if (e.message !== "dừng") check("chạy kiểm tra", false, e.stack || e.message);
  } finally {
    proc.kill();
    await sleep(800);
    try {
      fs.rmSync(prof, { recursive: true, force: true });
    } catch (_) {
      /* hồ sơ tạm có thể còn khoá — bỏ qua */
    }
  }
  const ok = results.length > 0 && results.every(Boolean);
  console.log(ok ? `TẤT CẢ ĐẠT (${results.length})` : `CÓ MỤC HỎNG (${results.filter((x) => !x).length}/${results.length})`);
  process.exit(ok ? 0 : 1);
})();
