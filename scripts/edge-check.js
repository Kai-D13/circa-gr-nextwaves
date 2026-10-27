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
//  Trang giả dựng theo DOM THẬT lấy chỉ đọc 27/10 (samples/*-20261027.*): dòng danh sách MUI, thanh thao tác HỦY / HOÀN THÀNH,
//  chân modal màn quét Nextwaves, 20 dòng thật của response danh sách.
//  4. (v0.1.6) Khung không chồng HỦY / HOÀN THÀNH của thanh thao tác thật (mở rộng ở cỡ mặc định, 1366×768, 1440×900; thu nhỏ
//     ≤ 330px); bỏ thanh → khung về mép dưới 16px.
//  4b. Màn quét Nextwaves cấu trúc thật (modal, thân cuộn, chân modal cuối thân cuộn): cuộn xuống cuối → khung không chồng
//     "Xác nhận nhận hàng" ở 1366×768 / 1440×900; in thêm độ chồng ngay sau khi cuộn (trước lượt đặt lại ≤ 1 s).
//  5. (v0.2) Trang danh sách (20 dòng thật, script của trang gọi API danh sách, body cỡ thật ~76 KB): nút chỉ ở dòng chờ / đang
//     nhận đúng cửa hàng, nằm cạnh nút .circa-rfid-po-link của extension Nextwaves (không đè); chỉ xem → 0 request của extension;
//     bấm nút không mở dòng; bấm → một phiên, mở Nextwaves, tab POS ở lại danh sách.
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

// ---------- trang POS / Nextwaves dựng theo DOM THẬT (G0 27/10, samples/*-20261027.*) ----------
const PASS_BUDGET_MS = 2; // ngân sách PM: mỗi lượt quét nút < 2 ms
const AUTH_JS = `{"authorization":"Bearer kiem-thu","x-client-id":"1","x-store-id":"${STORE}","grpc-timeout":"30S","x-cgn-test-page":"1"}`;
const stripComment = (s) => s.replace(/^\s*<!--[\s\S]*?-->\s*/, "").trim();
const REAL_ROW = stripComment(sample("pos-stg-gr-list-row-GR03887-20261027.html"));
const REAL_BAR = stripComment(sample("pos-stg-gr-action-bar-GR03878-20261027.html"));
const REAL_NW_FOOTER = stripComment(sample("nw-stg-receive-modal-footer-20261027.html"));
const REAL_LIST = JSON.parse(sample("pos-stg-gr-list-page1-20261027.json")).data;
// Lớp Tailwind / MUI mà mẫu thật dùng (CSS thật của POS không có ở đây): đủ để vị trí / kích thước khớp số đo trên trang thật
// (thanh thao tác 246×75 sát góc dưới phải; HỦY 69×43; HOÀN THÀNH 126×43; dòng bảng 57px).
const POS_CSS =
  "<style>body{margin:0;font:14px system-ui}table{border-collapse:collapse;width:100%}td,th{padding:16px;border-bottom:1px solid #eee}" +
  ".fixed{position:fixed}.bottom-0{bottom:0}.right-0{right:0}.z-50{z-index:50}.bg-white{background:#fff}.flex{display:flex}" +
  ".items-center{align-items:center}.justify-center{justify-content:center}.gap-x-5{column-gap:20px}.px-4{padding-left:16px;padding-right:16px}" +
  ".py-4{padding-top:16px;padding-bottom:16px}.absolute{position:absolute}.w-full{width:100%}.h-full{height:100%}.opacity-0{opacity:0}" +
  "button{box-sizing:border-box}.css-wvgad3{width:69px;height:43px}.css-uhqrjh{width:126px;height:43px}" +
  "svg{display:block;vertical-align:middle}</style>"; // preflight Tailwind: icon 24px không thừa dòng chữ → dòng 57px như trang thật
// Trang phiếu: thanh thao tác THẬT (ô nhập ẩn của máy quét + HỦY + HOÀN THÀNH) cố định góc dưới phải.
const GR_HTML =
  `<!doctype html><html><head><meta charset="utf-8"><title>POS giả — phiếu (thanh thao tác thật)</title>${POS_CSS}</head><body>` +
  `POS staging (trang giả để kiểm extension)${REAL_BAR}</body></html>`;
// 20 dòng THẬT của trang 1 danh sách cửa hàng 2222 (27/10): 5 chờ nhận + 2 đang nhận → 7 nút; còn lại đã nhận.
const ROWS = REAL_LIST.goods_receipts.map((g) => ({ id: g.id, code: g.code, status: g.status, store: g.pos_info.id, po: g.purchase_order_code }));
const EXPECTED_BUTTONS = ROWS.filter((r) => r.store === STORE && (r.status === "WAITING_TO_RECEIVE" || r.status === "RECEIVING")).map((r) => r.code).sort();
const LINK_EVERY = 3; // dòng i % 3 === 0 có sẵn nút .circa-rfid-po-link (như extension Nextwaves)
const EXPECTED_SAME_CELL = ROWS.filter((r, i) => i % LINK_EVERY === 0 && EXPECTED_BUTTONS.includes(r.code)).length;
const LINKS = ROWS.filter((r, i) => i % LINK_EVERY === 0).length;
const LIST_API = `${POS}/backend/v1/order/goods-receipt/search?query=pos_id=${STORE},,with_items=true,with_details=true,is_count_all_status=true&limit=20&page=1&order_by=created_at=desc`;
// Body cỡ thật (~76 KB): dòng thật + items / details lấy từ dòng đầu nguyên vẹn của response thật.
function listBody() {
  const items = REAL_LIST.goods_receipts_full_first.items;
  const rows = REAL_LIST.goods_receipts.map((g) => Object.assign({}, REAL_LIST.goods_receipts_full_first, { id: g.id, code: g.code, status: g.status, purchase_order_id: g.purchase_order_id, purchase_order_code: g.purchase_order_code, created_at: g.created_at, items, pos_info: Object.assign({}, REAL_LIST.goods_receipts_full_first.pos_info, g.pos_info) }));
  return JSON.stringify({ success: true, data: { goods_receipts: rows, total: REAL_LIST.total, page: 1, limit: 20, status_count: REAL_LIST.status_count } });
}
const STATUS_VI = { WAITING_TO_RECEIVE: "Chờ nhận", RECEIVING: "Đang nhận", COMPLETED: "Đã nhận", CANCELED: "Đã hủy" };
// Bảng từ outerHTML THẬT của một dòng (MUI, 7 cột, ô cuối div.flex chứa icon). Dòng thật mở phiếu bằng bộ nghe React; ở đây thay bằng
// onclick đếm window.__rowClicks. Script của trang gọi API danh sách + một API khác.
function tableHtml(title, withListCall) {
  const trs = ROWS.map((r, i) => {
    let tr = REAL_ROW.replace("<tr class=", `<tr onclick="window.__rowClicks=(window.__rowClicks||0)+1" class=`)
      .replace(">GR03887<", `>${r.code}<`)
      .replace(">PO00006767<", `>${r.po}<`)
      .replace(">Chờ nhận<", `>${STATUS_VI[r.status] || r.status}<`);
    if (i % LINK_EVERY === 0) tr = tr.replace(/<\/div><\/div><\/td><\/tr>$/, '</div><button type="button" class="circa-rfid-po-link">View on Nextwaves</button></div></td></tr>');
    return tr;
  }).join("");
  const head = ["Mã phiếu kiểm", "Phiếu nhập hàng", "Mã phiếu PUT", "Trạng thái", "Thời gian tạo", "Thời gian hoàn thành", "Hành động"].map((h) => `<th>${h}</th>`).join("");
  const call = (url) => `(function(){var x=new XMLHttpRequest();x.open("GET",${JSON.stringify(url)});var h=${AUTH_JS};for(var k in h)x.setRequestHeader(k,h[k]);x.send();})();`;
  // Như trang thật: bảng trong khung MUI; dưới bảng là chọn số dòng + mũi tên phân trang (F4: thông báo không được phủ các điều khiển này).
  const pager =
    '<div class="pager" style="display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:8px 16px">Hiển thị mỗi trang ' +
    '<select id="cgn-test-size"><option>20</option></select><span>từ 1 đến 20 trong 32 phiếu nhận hàng</span>' +
    '<button type="button" id="cgn-test-prev">‹</button><button type="button" id="cgn-test-next">›</button></div>';
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${POS_CSS}</head><body><div id="app"><div class="MuiTableContainer-root"><table><thead><tr>${head}</tr></thead>` +
    `<tbody id="rows">${trs}</tbody></table></div>${pager}</div><script>${call(`${POS}/backend/v1/entity`)}${withListCall ? call(LIST_API) : ""}</script></body></html>`
  );
}
// v0.2.3 (PM F3 / F4): bề rộng trang có side panel Claude trên máy operator (1095×756) + hai cỡ màn hình thường gặp.
const LIST_VIEWPORTS = [
  [1095, 756],
  [1366, 768],
  [1440, 900],
];
// Hình học bảng danh sách (main world): cao tiêu đề, cao dòng có / không nút, bề rộng nút theo kind, nút nằm trong ô.
const LIST_GEO_JS = `(() => {
  const r = (el) => el.getBoundingClientRect();
  const rows = [...document.querySelectorAll("#rows tr")];
  const btns = [...document.querySelectorAll("button.cgn-rfid-btn")];
  const inCell = btns.every((b) => { const c = b.closest("td"); if (!c) return false; const x = r(b), y = r(c); return x.left >= y.left - 0.5 && x.right <= y.right + 0.5 && x.top >= y.top - 0.5 && x.bottom <= y.bottom + 0.5; });
  return JSON.stringify({
    vw: innerWidth,
    headH: Math.round(r(document.querySelector("thead tr")).height),
    rowsWith: [...new Set(rows.filter((tr) => tr.querySelector("button.cgn-rfid-btn")).map((tr) => Math.round(r(tr).height)))],
    rowsWithout: [...new Set(rows.filter((tr) => !tr.querySelector("button.cgn-rfid-btn")).map((tr) => Math.round(r(tr).height)))],
    startW: Math.max(0, ...btns.filter((b) => b.getAttribute("data-cgn-kind") === "start").map((b) => r(b).width)),
    maxW: Math.max(0, ...btns.map((b) => r(b).width)),
    inCell,
    n: btns.length,
    perRow: Math.max(0, ...rows.map((tr) => tr.querySelectorAll("button.cgn-rfid-btn").length)),
  });
})()`;
// F4: điểm giữa từng điều khiển của bảng / phân trang phải trúng chính nó (không bị thứ gì của extension phủ).
const LIST_CLICKABLE_JS = `(() => {
  const els = [...document.querySelectorAll("button.cgn-rfid-btn"), ...document.querySelectorAll(".circa-rfid-po-link"),
    ...[...document.querySelectorAll("#rows tr")].slice(0, 4).flatMap((tr) => [tr.cells[0], ...tr.lastElementChild.querySelectorAll("div.cursor-pointer")]),
    document.getElementById("cgn-test-size"), document.getElementById("cgn-test-prev"), document.getElementById("cgn-test-next")].filter(Boolean);
  const bad = [];
  for (const el of els) {
    el.scrollIntoView({ block: "center", inline: "center" });
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    if (!hit || !(hit === el || el.contains(hit))) bad.push((el.id || el.className || el.tagName) + "→" + (hit ? hit.tagName + "." + hit.className : "null"));
  }
  scrollTo(0, 0);
  return JSON.stringify({ n: els.length, bad });
})()`;
// Màn quét Nextwaves dựng theo cấu trúc THẬT: modal phủ khung nhìn; modal 980 rộng, cách đỉnh 30, thân cuộn; chân modal (Hủy + Xác nhận
// nhận hàng, outerHTML thật) nằm CUỐI thân cuộn — ở 1440×900 chưa cuộn thì nút ngoài khung nhìn, cuộn xuống cuối thì vào góc dưới phải.
const NW_MODAL_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>Nextwaves giả — màn quét (cấu trúc thật)</title><style>' +
  "body{margin:0;font:14px system-ui}.Nwc-Modal-Dialog__Container{position:fixed;inset:0;display:flex;justify-content:center;align-items:flex-start;background:rgba(0,0,0,.3)}" +
  ".Nwc-Modal-Dialog__Modal{position:relative;width:980px;margin-top:30px;height:min(840px,calc(100vh - 60px));overflow:hidden;display:flex;flex-direction:column;background:#fff}" +
  ".hdr{height:53px;flex:none;padding:16px;box-sizing:border-box}.Nwc-Modal__Body{position:relative;flex:1;overflow-y:auto;padding:16px 26px 16px 16px;box-sizing:border-box}" +
  ".fill{height:816px}.Nwc-InlineStack{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}.Nwc-Button{height:32px;padding:0 12px;box-sizing:border-box}" +
  '</style></head><body><div class="Nwc-Modal-Dialog__Container"><div class="Nwc-Modal-Dialog__Modal Nwc-Modal-Dialog--sizeLarge"><div class="hdr">Nhận hàng bằng cách quét</div>' +
  `<div class="Nwc-Modal__Body Nwc-Scrollable Nwc-Scrollable--vertical"><div class="fill">Danh sách sản phẩm / thẻ…</div>${REAL_NW_FOOTER}</div></div></div></body></html>`;
const VIEWPORTS = [
  [1366, 768],
  [1440, 900],
];

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
      const st = tr.cells[3].querySelector("span"); // chữ trạng thái (ô thứ 4 của dòng thật)
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

    // 4) Khung không che thanh thao tác THẬT của trang (HỦY + HOÀN THÀNH), ở cỡ cửa sổ mặc định và cỡ màn hình POS thường gặp.
    const barRects = async () => JSON.parse((await evalIn(pos.page, 'JSON.stringify([...document.querySelectorAll("div.fixed button")].map((b) => Object.assign({ text: b.textContent.trim() }, b.getBoundingClientRect().toJSON())))', posMain && posMain.id)) || "[]");
    const vh = await evalIn(pos.page, "innerHeight", posMain && posMain.id);
    const fmtBtns = (bs) => bs.map((b) => `${b.text} ${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}×${Math.round(b.height)}`).join("; ");
    let bar = await barRects();
    let pr = await panelRects(pos.page);
    check("POS · khung (mở rộng) không chồng HỦY / HOÀN THÀNH (thanh thao tác thật)", !!pr && !!pr.box && bar.length === 2 && !bar.some((b) => overlap(pr.box, b)) && pr.box.top >= 0, pr && pr.box ? `khung ${JSON.stringify(pr.box)} · nút ${fmtBtns(bar)} · vh ${vh}` : "không đọc được khung");
    for (const [w, h] of VIEWPORTS) {
      await pos.page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await sleep(1600); // khung đặt lại theo resize / mỗi 1 s
      bar = await barRects();
      const p = await panelRects(pos.page);
      check(`POS · ${w}×${h}: khung (mở rộng) không chồng HỦY / HOÀN THÀNH`, !!p && !!p.box && bar.length === 2 && !bar.some((b) => overlap(p.box, b)) && p.box.top >= 0, p && p.box ? `khung ${Math.round(p.box.left)},${Math.round(p.box.top)} ${Math.round(p.box.width)}×${Math.round(p.box.height)} · nút ${fmtBtns(bar)}` : "không đọc được khung");
    }
    await pos.page.send("Emulation.clearDeviceMetricsOverride", {});
    await sleep(1600);
    bar = await barRects();
    pr = await panelRects(pos.page);
    if (pr && pr.min) {
      await clickAt(pos.page, pr.min);
      await sleep(600);
      pr = await panelRects(pos.page);
    }
    check("POS · khung thu nhỏ gọn (≤ 330px) và vẫn không chồng HỦY / HOÀN THÀNH", !!pr && !!pr.box && pr.box.width <= 330 && !bar.some((b) => overlap(pr.box, b)), pr && pr.box ? JSON.stringify(pr.box) : "không đọc được khung");
    await evalIn(pos.page, 'document.querySelector("div.fixed").remove(), true', posMain && posMain.id);
    await sleep(1600);
    pr = await panelRects(pos.page);
    const vh2 = await evalIn(pos.page, "innerHeight", posMain && posMain.id); // cỡ cửa sổ sau khi bỏ giả lập có thể khác lúc đầu
    check("POS · bỏ thanh thao tác → khung về mép dưới 16px", !!pr && !!pr.box && Math.abs(vh2 - pr.box.bottom - 16) <= 1, pr && pr.box ? `mép dưới cách đáy ${Math.round(vh2 - pr.box.bottom)}px (vh ${vh2})` : "không đọc được khung");
    pos.page.close();
    await closeTarget(pos.targetId);

    // 4b) Màn quét Nextwaves dựng theo cấu trúc THẬT (phiên waiting_nw của bước 3 tìm theo ?po=): sau khi cuộn thân modal xuống
    //     cuối, khung không chồng "Xác nhận nhận hàng". Khung đặt lại theo resize và mỗi 1 s (không theo cuộn) → ghi cả độ chồng
    //     ngay sau khi cuộn (trước lượt đặt lại) làm số đo.
    for (const id of await nwTabIds()) await closeTarget(id); // tab Nextwaves thật (trang đăng nhập) do bấm nút mở
    const nwm = await openPage(NW_PAGE, "https://circa-stg.nextwaves.app/*", () => ({ status: 200, type: "text/html; charset=utf-8", body: NW_MODAL_HTML }));
    await sleep(3500);
    const nwmMain = mainCtx(nwm.ctxs);
    const confirmRect = async () => JSON.parse((await evalIn(nwm.page, 'JSON.stringify([...document.querySelectorAll("button")].find((b) => /Xác nhận nhận hàng/.test(b.textContent)).getBoundingClientRect())', nwmMain && nwmMain.id)) || "null");
    const nwText = await panelText(nwm.page);
    for (const [w, h] of VIEWPORTS) {
      await nwm.page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await evalIn(nwm.page, 'document.querySelector(".Nwc-Modal__Body").scrollTop = 0, true', nwmMain && nwmMain.id);
      await sleep(1600);
      const before = await confirmRect();
      await evalIn(nwm.page, 'document.querySelector(".Nwc-Modal__Body").scrollTop = 1e6, true', nwmMain && nwmMain.id);
      await sleep(120); // vài khung hình — trước lượt kiểm 1 s
      const justAfter = await panelRects(nwm.page);
      const cr = await confirmRect();
      check(
        `Nextwaves · ${w}×${h}: ngay sau khi cuộn thân modal (120 ms, trước lượt kiểm 1 s) khung đã tránh "Xác nhận nhận hàng"`,
        !!justAfter && !!justAfter.box && !!cr && !overlap(justAfter.box, cr),
        justAfter && justAfter.box && cr ? `khung ${Math.round(justAfter.box.left)},${Math.round(justAfter.box.top)} ${Math.round(justAfter.box.width)}×${Math.round(justAfter.box.height)} · nút ${Math.round(cr.left)},${Math.round(cr.top)}` : "không đọc được"
      );
      await sleep(1300);
      const p = await panelRects(nwm.page);
      check(
        `Nextwaves · ${w}×${h}: màn quét cấu trúc thật — cuộn xuống cuối, khung không chồng "Xác nhận nhận hàng"`,
        !!p && !!p.box && !!cr && !overlap(p.box, cr) && p.box.top >= 0,
        p && p.box && cr ? `nút trước cuộn y ${Math.round(before.top)} (vh ${h}) → sau cuộn ${Math.round(cr.left)},${Math.round(cr.top)} ${Math.round(cr.width)}×${Math.round(cr.height)} · khung ${Math.round(p.box.left)},${Math.round(p.box.top)} ${Math.round(p.box.width)}×${Math.round(p.box.height)} · khung: ${nwText.slice(0, 60)}` : `không đọc được (khung: ${nwText.slice(0, 60)})`
      );
    }
    nwm.page.close();
    await closeTarget(nwm.targetId);

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
    check(`Danh sách (20 dòng thật) · nút chỉ ở dòng chờ / đang nhận đúng cửa hàng (${EXPECTED_BUTTONS.length}/${ROWS.length}), type=button, ở ô cuối`, JSON.stringify(codes) === JSON.stringify(EXPECTED_BUTTONS) && btns.every((b) => b.type === "button" && b.text === "Nhận hàng bằng RFID" && b.inLastCell), `${codes.length} nút: ${codes.join(",")}`);
    const theirs = await evalIn(lst.page, 'document.querySelectorAll(".circa-rfid-po-link").length', lMain && lMain.id);
    const sameCell = btns.filter((b) => b.sameCell).length;
    check("Danh sách · sống chung nút .circa-rfid-po-link (không gỡ / không đè)", theirs === LINKS && sameCell === EXPECTED_SAME_CELL, `circa-rfid-po-link ${theirs}/${LINKS}, cùng ô ${sameCell}/${EXPECTED_SAME_CELL}`);
    check("Danh sách · chỉ xem: 0 request API của extension, không khung", extReqs().length === 0 && !(await panelShadow(lst.page)), JSON.stringify(extReqs().map((r) => r.path)));
    // G0 27/10 + G3a (PM F3): nút không làm dòng cao thêm — ở cả 3 bề rộng, đo lại sau mỗi lần nút đổi trạng thái (bên dưới).
    const geoAt = async (w, h) => {
      await lst.page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await sleep(400);
      return JSON.parse((await evalIn(lst.page, LIST_GEO_JS, lMain && lMain.id)) || "{}");
    };
    const fmtGeo = (g) => `tiêu đề ${g.headH}px · dòng có nút ${g.rowsWith.join("/")}px · không nút ${g.rowsWithout.join("/")}px · nút rộng tối đa ${Math.round(g.maxW)}px`;
    const geoBefore = {};
    for (const [w, h] of LIST_VIEWPORTS) {
      const g = (geoBefore[w] = await geoAt(w, h));
      check(`Danh sách · ${w}×${h} trước khi bấm: nút không làm dòng cao thêm, nằm trong ô`, g.rowsWith.length > 0 && g.rowsWithout.length > 0 && Math.max(...g.rowsWith) <= Math.max(...g.rowsWithout) && g.inCell, fmtGeo(g));
    }
    await lst.page.send("Emulation.clearDeviceMetricsOverride", {});
    await sleep(300);

    // 6) Hiệu năng: bão DOM trên danh sách (extension đang chạy observer) — CPU quy cho extension + số đo từng lượt quét.
    await lst.page.send("Profiler.enable", {});
    await lst.page.send("Profiler.setSamplingInterval", { interval: 100 });
    // Lượt quét lúc tải trang (tạo 13 nút) đo riêng rồi đặt lại số đo, để đợt bão chỉ tính lượt do thay đổi DOM.
    const stats0 = JSON.parse((await evalIn(lst.page, "JSON.stringify(globalThis.__CGN__.grList.stats(true))", lIso && lIso.id)) || "{}");
    // Bước lấy dòng (querySelectorAll('tr') + Array.from) nằm trước lát quét đầu và không vào stats(): đo riêng trong chính world của
    // extension; ngưỡng mỗi lượt áp cho (lát dài nhất + lấy dòng dài nhất) — chặn trên cho "lượt quét tính cả bước lấy dòng" (PM 27/10).
    const collect = JSON.parse((await evalIn(lst.page, "(() => { const t = []; for (let i = 0; i < 50; i++) { const a = performance.now(); Array.from(document.querySelectorAll('tr')); t.push(performance.now() - a); } t.sort((x, y) => x - y); return JSON.stringify({ med: t[25], max: t[49] }); })()", lIso && lIso.id)) || '{"med":0,"max":0}');
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
    const lay = `lấy dòng tối đa ${Number(collect.max).toFixed(3)} ms (trung vị ${Number(collect.med).toFixed(3)})`;
    check(
      `Hiệu năng · lúc tải danh sách (tạo ${EXPECTED_BUTTONS.length} nút): mỗi lượt quét tính cả bước lấy dòng < ${PASS_BUDGET_MS} ms`,
      stats0.applies >= 1 && stats0.maxMs + collect.max < PASS_BUDGET_MS,
      `${stats0.applies} lượt, lát tối đa ${Number(stats0.maxMs).toFixed(3)} ms + ${lay} = ${(stats0.maxMs + collect.max).toFixed(3)} ms; tổng ${Number(stats0.totalMs).toFixed(2)} ms`
    );
    check(
      `Hiệu năng · danh sách + 300 thay đổi DOM (~1,5 s liên tục): quét lại ≥ 2 lượt (chờ tối đa 1 s), mỗi lượt tính cả bước lấy dòng < ${PASS_BUDGET_MS} ms, CPU extension < 50 ms, 0 request`,
      stats1.applies >= 2 && stats1.maxMs + collect.max < PASS_BUDGET_MS && cpuList.ext < 50 && extReqs().length === 0,
      `bão: ${stats1.applies} lượt (gom từ ${stats1.mutationBatches} đợt thay đổi), lát tối đa ${Number(stats1.maxMs).toFixed(3)} ms + lấy dòng ${Number(collect.max).toFixed(3)} ms, tổng ${Number(stats1.totalMs).toFixed(2)} ms · CPU extension ${cpuList.ext.toFixed(1)} ms / trang ${cpuList.total.toFixed(1)} ms`
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

    // v0.2.3 PM F3: sau khi bấm (open_nw) và khi phiên sang received / applied (open_gr) — bảng không dàn lại, nút không rộng hơn
    // nút bắt đầu, không khung nổi trên danh sách (F4: thành công thể hiện bằng nút).
    const btnInfo = async (code) => JSON.parse((await evalIn(lst.page, `JSON.stringify((b => b && { text: b.textContent, kind: b.getAttribute("data-cgn-kind"), aria: b.getAttribute("aria-label"), title: b.title })(document.querySelector('button.cgn-rfid-btn[data-cgn-code="${code}"]')))`, lMain && lMain.id)) || "null");
    const setState = (state) => evalIn(sw, `chrome.storage.local.get("sessions").then((x) => { const s = x.sessions || {}; for (const k in s) if (s[k].grId === "${GR_ID}") s[k].state = "${state}"; return chrome.storage.local.set({ sessions: s }).then(() => true); })`);
    const geoCheck = async (phase) => {
      for (const [w, h] of LIST_VIEWPORTS) {
        const g = await geoAt(w, h);
        const b0 = geoBefore[w];
        check(
          `Danh sách · ${w}×${h} ${phase}: bảng không dàn lại (tiêu đề / dòng như trước khi bấm), nút ≤ nút bắt đầu, trong ô`,
          g.headH === b0.headH && Math.max(...g.rowsWith, ...g.rowsWithout) === Math.max(...b0.rowsWith, ...b0.rowsWithout) && g.maxW <= b0.startW + 0.5 && g.inCell && g.perRow === 1,
          `${fmtGeo(g)} (trước: ${fmtGeo(b0)}; nút bắt đầu ${Math.round(b0.startW)}px)`
        );
      }
      await lst.page.send("Emulation.clearDeviceMetricsOverride", {});
      await sleep(300);
    };
    const i1 = await btnInfo("GR03878");
    check('Danh sách · sau khi bấm: nút "Mở Nextwaves" (open_nw), aria-label / title đầy đủ có mã GR + trạng thái phiên; không khung nổi', !!i1 && i1.text === "Mở Nextwaves" && i1.kind === "open_nw" && /^GR03878 · .*\(waiting_nw\)/.test(i1.aria) && i1.title === i1.aria && !(await panelShadow(lst.page)), JSON.stringify(i1));
    await geoCheck("sau khi bấm (Mở Nextwaves)");
    await setState("received");
    await sleep(1200);
    const i2 = await btnInfo("GR03878");
    await geoCheck("phiên received (Mở phiếu)");
    await setState("applied");
    await sleep(1200);
    const i3 = await btnInfo("GR03878");
    check('Danh sách · received → applied: cùng nhãn "Mở phiếu" nhưng aria-label / title đổi theo trạng thái phiên', !!i2 && !!i3 && i2.text === "Mở phiếu" && i3.text === "Mở phiếu" && i2.kind === "open_gr" && /\(received\)/.test(i2.aria) && /\(applied\)/.test(i3.aria) && i3.title === i3.aria, `${i2 && i2.aria} → ${i3 && i3.aria}`);

    // v0.2.3 PM F4: lỗi (GR03887: GET phiếu 404 trên trang giả) → thông báo TRONG LUỒNG TRANG ngay trên bảng; không phủ nút / icon / mã /
    // chọn số dòng / phân trang ở 1095×756; không vòng MutationObserver; Đóng thì gỡ.
    await lst.page.send("Emulation.setDeviceMetricsOverride", { width: 1095, height: 756, deviceScaleFactor: 1, mobile: false });
    await evalIn(lst.page, 'document.querySelector(\'button.cgn-rfid-btn[data-cgn-code="GR03887"]\').click(), true', lMain && lMain.id);
    await sleep(3000);
    const note = JSON.parse((await evalIn(lst.page, `JSON.stringify((n => n && { text: n.textContent, role: n.getAttribute("role"), beforeTable: n.nextElementSibling === document.querySelector(".MuiTableContainer-root"), above: n.getBoundingClientRect().bottom <= document.querySelector(".MuiTableContainer-root").getBoundingClientRect().top + 0.5, pos: getComputedStyle(n).position })(document.querySelector(".cgn-rfid-note")))`, lMain && lMain.id)) || "null");
    const clk = JSON.parse((await evalIn(lst.page, LIST_CLICKABLE_JS, lMain && lMain.id)) || "{}");
    check(
      "Danh sách · 1095×756 lỗi: thông báo trong luồng trang ngay trên bảng (không khung nổi), đọc được, mọi nút / icon / mã / phân trang còn bấm được",
      !!note && note.beforeTable && note.above && note.pos === "static" && note.role === "alert" && /GR03887: chưa mở được Nextwaves/.test(note.text) && /Đóng/.test(note.text) && !(await panelShadow(lst.page)) && clk.n >= 15 && clk.bad.length === 0,
      note ? `"${note.text.slice(0, 70)}…" · role ${note.role} · ${clk.n} điều khiển, bị phủ ${clk.bad.length}${clk.bad.length ? " " + clk.bad.join("; ") : ""}` : "không thấy thông báo"
    );
    await evalIn(lst.page, "JSON.stringify(globalThis.__CGN__.grList.stats(true))", lIso && lIso.id);
    await sleep(1500);
    const idle = JSON.parse((await evalIn(lst.page, "JSON.stringify(globalThis.__CGN__.grList.stats())", lIso && lIso.id)) || "{}");
    check("Danh sách · có thông báo, trang đứng yên 1,5 s: không vòng MutationObserver (0 lượt quét)", idle.applies === 0, `lượt quét ${idle.applies}, đợt thay đổi ${idle.mutationBatches}`);
    await evalIn(lst.page, '[...document.querySelectorAll(".cgn-rfid-note button")].find((b) => b.textContent === "Đóng").click(), true', lMain && lMain.id);
    await sleep(400);
    check("Danh sách · bấm Đóng → gỡ thông báo", (await evalIn(lst.page, '!document.querySelector(".cgn-rfid-note")', lMain && lMain.id)) === true);
    await lst.page.send("Emulation.clearDeviceMetricsOverride", {});

    // Rời / quay lại danh sách trong SPA (hook báo route), đổi trang / bộ lọc, tải lại trang: dọn thông báo, nút đúng, không phiên / tab thứ hai.
    await evalIn(lst.page, 'document.querySelector(\'button.cgn-rfid-btn[data-cgn-code="GR03886"]\').click(), true', lMain && lMain.id);
    await sleep(3000);
    const hadNote = await evalIn(lst.page, '!!document.querySelector(".cgn-rfid-note")', lMain && lMain.id);
    await evalIn(lst.page, 'history.pushState(null, "", "/ban-hang"), true', lMain && lMain.id);
    await sleep(800);
    const away = JSON.parse((await evalIn(lst.page, 'JSON.stringify({ note: !!document.querySelector(".cgn-rfid-note"), btns: document.querySelectorAll("button.cgn-rfid-btn").length })', lMain && lMain.id)) || "{}");
    await evalIn(lst.page, 'history.pushState(null, "", "/danh-sach-phieu-nhan-hang"), true', lMain && lMain.id);
    await sleep(1500);
    const back = JSON.parse((await evalIn(lst.page, LIST_GEO_JS, lMain && lMain.id)) || "{}");
    const backNote = await evalIn(lst.page, '!!document.querySelector(".cgn-rfid-note")', lMain && lMain.id);
    check("Danh sách · rời trang (SPA) → gỡ nút + thông báo; quay lại → nút đủ, không hiện thông báo cũ", hadNote === true && !away.note && away.btns === 0 && !backNote && back.n === EXPECTED_BUTTONS.length && back.perRow === 1, `trước khi rời: thông báo ${hadNote} · khi rời: thông báo ${away.note}, nút ${away.btns} · quay lại: nút ${back.n}, thông báo ${backNote}`);
    const pageCall = `(function(){var x=new XMLHttpRequest();x.open("GET",${JSON.stringify(LIST_API.replace("page=1", "page=2"))});var h=${AUTH_JS};for(var k in h)x.setRequestHeader(k,h[k]);x.send();})(), true`;
    await evalIn(lst.page, pageCall, lMain && lMain.id);
    await sleep(1500);
    const paged = JSON.parse((await evalIn(lst.page, LIST_GEO_JS, lMain && lMain.id)) || "{}");
    check("Danh sách · đổi trang / bộ lọc (request danh sách mới): nút đủ, mỗi dòng một nút", paged.n === EXPECTED_BUTTONS.length && paged.perRow === 1, `nút ${paged.n}, tối đa ${paged.perRow} nút / dòng`);
    await lst.page.send("Page.reload", {});
    await sleep(4500);
    const s3 = (await sessions()).filter((x) => x.grId === GR_ID);
    const nwTabs3 = await nwTabIds();
    check("Danh sách · tải lại trang sau khi đã tạo phiên: vẫn MỘT phiên, MỘT tab Nextwaves", s3.length === 1 && nwTabs3.length === 1, `phiên ${s3.length} · tab Nextwaves ${nwTabs3.length}`);
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
