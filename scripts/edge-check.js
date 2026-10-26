// Kiểm extension trên TRÌNH DUYỆT THẬT (Edge / Chrome headless, hồ sơ tạm, không đăng nhập, không gọi server POS thật).
// Sinh ra sau lỗi T1 25/10 (env.js nạp trùng → ISOLATED world thiếu env) mà trình duyệt giả trong tests/ không thấy.
//
//   node scripts/edge-check.js <thư mục extension>        vd. node scripts/edge-check.js C:\circa-gr-nextwaves-v0.1.5
//
// Các phép kiểm:
//  1. Service worker nạp được, đúng version.
//  2. Trang Nextwaves staging thật (trang đăng nhập): MAIN world có env + hook; ISOLATED world có env + thư viện + content script.
//  3. Trang POS staging GR03878 do CDP Fetch trả dữ liệu mẫu (samples/): ISOLATED world có env; sau tin "auth" như hook gửi,
//     extension đọc GR / PO / tìm GR theo SO (kèm header), hiện khung, tạo phiên waiting_nw, mở tab Nextwaves ?po=SOBD1593858;
//     storage không chứa token.
//  4. (v0.1.6) Trang POS giả có nút HOÀN THÀNH cố định góc dưới phải như POS thật: khung extension không chồng nút
//     (cả khi mở rộng lẫn thu nhỏ; khung thu nhỏ ≤ 330px); bỏ nút thì khung về lại mép dưới 16px.
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
// Trang POS giả: nút HOÀN THÀNH cố định góc dưới phải (vị trí như POS thật, operator 26/10).
const POS_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>POS giả</title></head><body>POS staging (trang giả để kiểm extension)' +
  '<div style="position:fixed;right:24px;bottom:12px"><button id="cgn-test-done" style="width:180px;height:44px">HOÀN THÀNH</button></div></body></html>';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "ĐẠT " : "HỎNG"}  ${name}${detail ? "  — " + detail : ""}`);
};

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
async function openPage(url, fetchPattern, fetchHandler) {
  const tgt = await newPage();
  const ctxs = [];
  let page = null;
  page = await cdp(tgt.webSocketDebuggerUrl, async (m) => {
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
  await page.send("Page.navigate", { url });
  return { page, ctxs, targetId: tgt.id };
}
const isolatedCtx = (ctxs) => ctxs.filter((c) => c.auxData && c.auxData.type === "isolated" && /Circa GR/.test(c.name)).pop();
const mainCtx = (ctxs) => ctxs.filter((c) => c.auxData && c.auxData.isDefault).pop();

async function panelText(page) {
  const doc = await page.send("DOM.getDocument", { depth: -1, pierce: true });
  const hosts = [];
  const walk = (n) => {
    if (!n) return;
    if (n.attributes && n.attributes.includes("data-cgn-panel")) hosts.push(n);
    (n.children || []).forEach(walk);
    (n.shadowRoots || []).forEach(walk);
  };
  walk(doc.result.root);
  const sr = hosts[0] && hosts[0].shadowRoots && hosts[0].shadowRoots[0];
  if (!sr) return "";
  const html = (await page.send("DOM.getOuterHTML", { nodeId: sr.nodeId })).result.outerHTML;
  return html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, " | ").replace(/(\s*\|\s*)+/g, " | ").trim();
}

// Rect (viewport) của khung và nút thu nhỏ trong shadow root đóng — CDP DOM xuyên shadow.
async function panelRects(page) {
  const doc = await page.send("DOM.getDocument", { depth: -1, pierce: true });
  let host = null;
  const walk = (n) => {
    if (!n || host) return;
    if (n.attributes && n.attributes.includes("data-cgn-panel")) host = n;
    (n.children || []).forEach(walk);
    (n.shadowRoots || []).forEach(walk);
  };
  walk(doc.result.root);
  const sr = host && host.shadowRoots && host.shadowRoots[0];
  if (!sr) return null;
  const find = (n, cls) => {
    if (!n) return null;
    const ci = n.attributes ? n.attributes.indexOf("class") : -1;
    if (ci >= 0 && n.attributes[ci + 1].split(" ").includes(cls)) return n;
    for (const c of n.children || []) {
      const x = find(c, cls);
      if (x) return x;
    }
    return null;
  };
  const rectOf = async (n) => {
    if (!n) return null;
    const q = (await page.send("DOM.getBoxModel", { nodeId: n.nodeId })).result.model.border;
    return { left: q[0], top: q[1], right: q[2], bottom: q[5], width: q[2] - q[0], height: q[5] - q[1] };
  };
  return { box: await rectOf(find(sr, "box")), min: await rectOf(find(sr, "x")) };
}
const overlap = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

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
    const pagesBefore = new Set((await listTargets()).filter((t) => t.type === "page").map((t) => t.id));

    // 3) POS staging GR03878 với dữ liệu mẫu (CDP Fetch thay server; API staging cùng origin).
    const reqs = [];
    const pos = await openPage(`${POS}/danh-sach-phieu-nhan-hang/${GR_ID}`, `${POS}/*`, (r) => {
      const u = new URL(r.url);
      reqs.push({ method: r.method, path: u.pathname, auth: !!(r.headers.authorization || r.headers.Authorization), store: r.headers["x-store-id"] || "" });
      if (/^\/danh-sach-phieu-nhan-hang\//.test(u.pathname)) return { status: 200, type: "text/html; charset=utf-8", body: POS_HTML };
      if (u.pathname === `/backend/v1/order/goods-receipt/${GR_ID}`) return { status: 200, type: "application/json", body: sample("gr-stg-GR03878-20261024.json") };
      if (/^\/backend\/v1\/pos\/.+\/po\//.test(u.pathname)) return { status: 200, type: "application/json", body: sample("po-stg-PO00006750-SOBD1593858.json") };
      if (u.pathname === "/backend/v1/order/goods-receipt/search") return { status: 200, type: "application/json", body: sample("pos-stg-gr-search-so-1593858.json") };
      return { status: 404, type: "application/json", body: "{}" };
    });
    await sleep(3000);
    const posIso = isolatedCtx(pos.ctxs);
    const posMain = mainCtx(pos.ctxs);
    const posIsoKeys = posIso ? JSON.parse((await evalIn(pos.page, "JSON.stringify(Object.keys(globalThis.__CGN__||{}))", posIso.id)) || "[]") : [];
    check("POS · ISOLATED world có env, pos, plan, apply, ui", ["env", "keys", "pos", "plan", "apply", "ui"].every((k) => posIsoKeys.includes(k)), JSON.stringify(posIsoKeys));
    // Tin "auth" như pos-hook gửi khi app POS gọi API (trang giả không gọi API).
    await evalIn(pos.page, `window.postMessage({mark:"cgn/pos-hook", type:"auth", payload:{envId:"STG", headers:{authorization:"Bearer kiem-thu", "x-client-id":"1", "x-store-id":"${STORE}", "grpc-timeout":"30S"}}}, location.origin), true`, posMain && posMain.id);
    await sleep(5000);
    const api = reqs.filter((r) => r.path.startsWith("/backend/v1/"));
    check("POS · đọc GR, PO, tìm GR theo SO kèm header + cửa hàng", ["/order/goods-receipt/" + GR_ID, "/po/", "/goods-receipt/search"].every((p) => api.some((r) => r.path.includes(p))) && api.every((r) => r.auth && r.store === STORE), `${api.length} lời gọi API`);
    const text = await panelText(pos.page);
    check("POS · khung hiện 'Chờ nhận hàng trên Nextwaves' + mã giao", /Chờ nhận hàng trên Nextwaves/.test(text) && /SOBD1593858-F/.test(text), text.slice(0, 160));
    // 4) Khung không che nút HOÀN THÀNH của trang.
    const btnRect = async () => JSON.parse((await evalIn(pos.page, "JSON.stringify(document.getElementById('cgn-test-done').getBoundingClientRect())", posMain && posMain.id)) || "null");
    const vh = await evalIn(pos.page, "innerHeight", posMain && posMain.id);
    const btn = await btnRect();
    let pr = await panelRects(pos.page);
    check("POS · khung (mở rộng) không chồng nút HOÀN THÀNH góc dưới phải", !!pr && !!pr.box && !overlap(pr.box, btn) && pr.box.top >= 0, pr && pr.box ? `khung ${JSON.stringify(pr.box)} · nút ${JSON.stringify(btn)} · vh ${vh}` : "không đọc được khung");
    if (pr && pr.min) {
      const cx = pr.min.left + pr.min.width / 2;
      const cy = pr.min.top + pr.min.height / 2;
      for (const type of ["mousePressed", "mouseReleased"]) await pos.page.send("Input.dispatchMouseEvent", { type, x: cx, y: cy, button: "left", clickCount: 1 });
      await sleep(600);
      pr = await panelRects(pos.page);
    }
    check("POS · khung thu nhỏ gọn (≤ 330px) và vẫn không chồng nút", !!pr && !!pr.box && pr.box.width <= 330 && !overlap(pr.box, btn), pr && pr.box ? JSON.stringify(pr.box) : "không đọc được khung");
    await evalIn(pos.page, "document.getElementById('cgn-test-done').remove(), true", posMain && posMain.id);
    await sleep(1600);
    pr = await panelRects(pos.page);
    check("POS · bỏ nút → khung về mép dưới 16px", !!pr && !!pr.box && Math.abs(vh - pr.box.bottom - 16) <= 1, pr && pr.box ? `mép dưới cách đáy ${Math.round(vh - pr.box.bottom)}px` : "không đọc được khung");
    const sessions = JSON.parse((await evalIn(sw, "chrome.storage.local.get('sessions').then(x=>JSON.stringify(Object.values(x.sessions||{})))")) || "[]");
    const s = sessions.find((x) => x.grId === GR_ID);
    check("Phiên STG GR03878 tạo ra (waiting_nw, schema, không khoá)", !!s && s.state === "waiting_nw" && s.schema === 1 && Array.isArray(s.writeLocks) && s.writeLocks.length === 0, s ? JSON.stringify({ state: s.state, schema: s.schema, writeLocks: s.writeLocks, createdBy: s.createdBy }) : "không có phiên");
    // Chỉ tính tab MỚI mở sau bước POS (chưa đăng nhập thì Nextwaves chuyển sang /vi/login?next=<đích>).
    const opened = (await listTargets()).filter((t) => t.type === "page" && !pagesBefore.has(t.id) && t.id !== pos.targetId).map((t) => t.url);
    const target = (u) => u.startsWith(NW_PAGE) || (u.startsWith("https://circa-stg.nextwaves.app/") && decodeURIComponent(u).includes("/vi/purchases/receive?po=SOBD1593858"));
    check("Extension mở tab Nextwaves /vi/purchases/receive?po=SOBD1593858", opened.some(target), JSON.stringify(opened));
    check("Storage không chứa token", (await evalIn(sw, "chrome.storage.local.get(null).then(x=>!JSON.stringify(x).includes('Bearer'))")) === true);
    pos.page.close();
    sw.close();
  } catch (e) {
    if (e.message !== "dừng") check("chạy kiểm tra", false, e.message);
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
