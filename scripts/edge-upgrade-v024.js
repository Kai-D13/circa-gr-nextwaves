// Diễn tập PM AUDIT-POST-REVERT-v0.2.4 bước 1: nâng v0.2.3 → v0.2.4 TRONG CÙNG thư mục bằng chính script giao operator
// (nang-cap-v0.2.4.ps1), trên Edge thật với hồ sơ tạm. Phiên schema 1 `nw_ready` kiểu GR03887 (mã giả) + cấu hình STG phải còn nguyên
// sau Reload, cùng extension ID; phiên không schema (bản trước v0.1.3) bị xoá → chứng minh onInstalled "update" đã chạy thật.
// Kèm các ca script phải DỪNG mà không đổi thư mục: thư mục không đúng v0.2.3, có file thừa, gói sai SHA; chạy lại sau khi nâng thì không chép.
//   node scripts/edge-upgrade-v024.js [thư mục giao, mặc định C:\circa-gr-nextwaves-release]
"use strict";
const { spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { killProfile, portBusy } = require("./edge-proc.js");

const REL = process.argv[2] || "C:\\circa-gr-nextwaves-release";
const PORT = 9337;
const SP = fs.mkdtempSync(path.join(os.tmpdir(), "cgn-upg024-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
function check(name, ok, detail) {
  if (!ok) fails += 1;
  console.log((ok ? "ĐẠT " : "HỎNG ") + name + (detail ? " — " + detail : ""));
}

// ---------- file ----------
function tree(dir) {
  const out = {};
  const walk = (d, pre) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name), pre + e.name + "/");
      else out[pre + e.name] = crypto.createHash("sha256").update(fs.readFileSync(path.join(d, e.name))).digest("hex");
    }
  };
  walk(dir, "");
  return out;
}
const sameTree = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
function unzip(zip, dir) {
  const r = spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dir}' -Force`], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("Expand-Archive: " + r.stderr);
}
function runPs(rel, args) {
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(rel, "nang-cap-v0.2.4.ps1"), "-Release", rel, ...args], { encoding: "utf8", timeout: 120000 });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const killEdge = () => killProfile(SP);
const backups = (rel) => (fs.existsSync(path.join(rel, "backup")) ? fs.readdirSync(path.join(rel, "backup")) : []);
const lastLine = (s) => s.trim().split(/\r?\n/).pop().slice(0, 160);

// ---------- CDP ----------
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
async function evalIn(c, expr) {
  const r = (await c.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result;
  if (r && r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails).slice(0, 200));
  return r && r.result ? r.result.value : undefined;
}
const targets = async () => (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
async function ourWorker() {
  for (let i = 0; i < 40; i++) {
    try {
      for (const t of (await targets()).filter((x) => x.type === "service_worker" && /\/background\.js$/.test(x.url))) {
        const c = await cdp(t.webSocketDebuggerUrl);
        if (String(await evalIn(c, "chrome.runtime.getManifest().name")).startsWith("Circa GR")) return { id: new URL(t.url).host, c };
        c.close();
      }
    } catch (_) {
      /* Edge chưa sẵn sàng */
    }
    await sleep(500);
  }
  throw new Error("không thấy service worker của extension");
}
// So sánh bỏ thứ tự khoá (chrome.storage trả object có khoá xếp lại).
const canon = (x) => (Array.isArray(x) ? x.map(canon) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

// ---------- dữ liệu thử (mã giả, cùng hình phiên thật) ----------
const now = Date.now();
const GR_ID = "00000000-0000-4000-8000-000000003887";
const KEY = `STG:${GR_ID}`;
const SESSION = {
  schema: 1, createdBy: "0.2.3", key: KEY, envId: "STG", grId: GR_ID, grCode: "GR03887",
  poPosId: "00000000-0000-4000-8000-000000006767", poPosCode: "PO00006767", posId: "00000000-0000-4000-8000-000000002222",
  deliveryCode: "SOBD1594095-F", soBase: "SOBD1594095", warehouseId: "00000000-0000-4000-8000-00000000f10a",
  fingerprint: [["product-1", "A98-060627", 1]], writeLocks: [], nwWriteLocks: [],
  returnUrl: `https://pos.stg.circa-v2.buymed.tech/danh-sach-phieu-nhan-hang/${GR_ID}`, posTabId: 101, nwTabId: 102, state: "nw_ready",
  nwPoId: "00000000-0000-4000-8000-000013806459", nwPoNumber: "PO13806459", nwOrderId: "00000000-0000-4000-8000-0000000004d0",
  nwRefId: "SOBD1594095-F", shipmentIds: ["00000000-0000-4000-8000-000000004520"],
  expected: { shipments: [{ id: "00000000-0000-4000-8000-000000004520", lines: 5, tags: 15 }] }, fpRows: [], receiptIdsBefore: [],
  nwSearch: null, createdAt: now - 15 * 3600e3, updatedAt: now - 14 * 3600e3,
  log: [{ at: new Date(now - 15 * 3600e3).toISOString(), type: "start" }, { at: new Date(now - 14 * 3600e3).toISOString(), type: "nw_matched" }],
};
const OLD_KEY = "STG:00000000-0000-4000-8000-000000000013";
const OUTDATED = { key: OLD_KEY, envId: "STG", grId: "00000000-0000-4000-8000-000000000013", grCode: "GR00013", state: "received", createdAt: now, updatedAt: now, log: [] };
const CONFIG = { mode: "STG", url: "" };

(async () => {
  let edge = null;
  const watchdog = setTimeout(() => {
    console.log("HỎNG quá giờ 240 s");
    killEdge();
    process.exit(1);
  }, 240000);
  try {
    // Thư mục giao tạm: chỉ script + 2 gói (bản sao lưu của diễn tập nằm ở đây, không ở thư mục giao thật).
    const rel = path.join(SP, "rel");
    for (const f of ["nang-cap-v0.2.4.ps1", "v0.2.3/circa-gr-nextwaves-v0.2.3.zip", "v0.2.4/circa-gr-nextwaves-v0.2.4.zip"]) {
      fs.mkdirSync(path.dirname(path.join(rel, f)), { recursive: true });
      fs.copyFileSync(path.join(REL, f), path.join(rel, f));
    }
    unzip(path.join(rel, "v0.2.3/circa-gr-nextwaves-v0.2.3.zip"), path.join(SP, "z-old"));
    unzip(path.join(rel, "v0.2.4/circa-gr-nextwaves-v0.2.4.zip"), path.join(SP, "z-new"));
    const OLD = tree(path.join(SP, "z-old"));
    const NEW = tree(path.join(SP, "z-new"));
    const ext = path.join(SP, "circa-gr-nextwaves-v0.2.3");
    fs.cpSync(path.join(SP, "z-old"), ext, { recursive: true });
    console.log(`Thư mục giao: ${REL} · tạm: ${SP} · ${Object.keys(OLD).length} / ${Object.keys(NEW).length} file`);

    // A. Script phải dừng, không đổi thư mục.
    let r = runPs(rel, ["-Target", ext, "-Check"]);
    check("A1 -Check trên thư mục v0.2.3: thoát 0, không đổi file, không sao lưu", r.status === 0 && /KIỂM ĐẠT/.test(r.out) && sameTree(tree(ext), OLD) && backups(rel).length === 0, lastLine(r.out));
    const tamper = path.join(SP, "tamper");
    fs.cpSync(ext, tamper, { recursive: true });
    fs.appendFileSync(path.join(tamper, "popup/popup.js"), "\n");
    const tamperBefore = tree(tamper);
    r = runPs(rel, ["-Target", tamper]);
    check("A2 thư mục lệch một file so với v0.2.3: thoát 1, không chép, không sao lưu", r.status === 1 && /khác popup\/popup\.js/.test(r.out) && sameTree(tree(tamper), tamperBefore) && backups(rel).length === 0, lastLine(r.out));
    const extra = path.join(SP, "extra");
    fs.cpSync(ext, extra, { recursive: true });
    fs.writeFileSync(path.join(extra, "ghi-chu.txt"), "x");
    const extraBefore = tree(extra);
    r = runPs(rel, ["-Target", extra]);
    check("A3 thư mục có file thừa: thoát 1, không chép", r.status === 1 && /thừa ghi-chu\.txt/.test(r.out) && sameTree(tree(extra), extraBefore) && backups(rel).length === 0, lastLine(r.out));
    const relBad = path.join(SP, "rel-bad");
    fs.cpSync(rel, relBad, { recursive: true });
    const badZip = path.join(relBad, "v0.2.4/circa-gr-nextwaves-v0.2.4.zip");
    const buf = fs.readFileSync(badZip);
    buf[buf.length - 30] ^= 1;
    fs.writeFileSync(badZip, buf);
    r = runPs(relBad, ["-Target", ext]);
    check("A4 gói v0.2.4 sai SHA-256: thoát 1, thư mục giữ v0.2.3", r.status === 1 && /SHA-256 gói v0\.2\.4 sai/.test(r.out) && sameTree(tree(ext), OLD), lastLine(r.out));
    // A5: một file đích bị khoá ghi (vd. phần mềm khác đang mở) → lỗi giữa lúc chép đè → script trả lại v0.2.3 từ bản sao lưu.
    const relLock = path.join(SP, "rel-lock");
    fs.cpSync(rel, relLock, { recursive: true });
    const locked = path.join(SP, "locked");
    fs.cpSync(ext, locked, { recursive: true });
    const lockFile = path.join(locked, "ui", "panel.js");
    const locker = spawn("powershell", ["-NoProfile", "-Command", `$f = [System.IO.File]::Open('${lockFile}', 'Open', 'Read', 'Read'); 'locked'; Start-Sleep -Seconds 60; $f.Close()`], { stdio: ["ignore", "pipe", "ignore"] });
    await new Promise((res) => locker.stdout.once("data", res));
    r = runPs(relLock, ["-Target", locked]);
    spawnSync("taskkill", ["/PID", String(locker.pid), "/T", "/F"]);
    check("A5 file đích bị khoá giữa lúc chép: thoát 1, chép trả v0.2.3, thư mục như trước", r.status === 1 && /đã chép trả v0\.2\.3/.test(r.out) && sameTree(tree(locked), OLD) && backups(relLock).length === 1, lastLine(r.out));

    // B. Edge thật, hồ sơ tạm, nạp thư mục v0.2.3.
    if (await portBusy(PORT)) throw new Error(`cổng ${PORT} đang có trình duyệt khác — tắt nó rồi chạy lại`);
    edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--user-data-dir=${path.join(SP, "prof")}`, `--remote-debugging-port=${PORT}`, "--no-first-run", "--disable-features=DisableLoadExtensionCommandLineSwitch", `--load-extension=${ext}`, "about:blank"], { stdio: "ignore" });
    await sleep(3000);
    let w = await ourWorker();
    const id1 = w.id;
    check("B1 nạp bản cũ", (await evalIn(w.c, "chrome.runtime.getManifest().version")) === "0.2.3", `id ${id1}`);
    await evalIn(w.c, `chrome.storage.local.clear().then(() => chrome.storage.local.set(${JSON.stringify({ config: CONFIG, sessions: { [KEY]: SESSION, [OLD_KEY]: OUTDATED }, grants: {} })})).then(() => true)`);
    const before = await evalIn(w.c, "chrome.storage.local.get(null)");
    check("B2 storage trước nâng: cấu hình STG + phiên nw_ready schema 1 + một phiên không schema", same(before.sessions[KEY], SESSION) && same(before.config, CONFIG) && !!before.sessions[OLD_KEY]);

    r = runPs(rel, ["-Target", ext]);
    const bk = backups(rel);
    check("B3 script nâng: thoát 0, thư mục = v0.2.4 từng byte, có một bản sao lưu = v0.2.3", r.status === 0 && /ĐÃ NÂNG/.test(r.out) && sameTree(tree(ext), NEW) && bk.length === 1 && sameTree(tree(path.join(rel, "backup", bk[0])), OLD), lastLine(r.out));
    check("B4 trước Reload extension vẫn chạy bản cũ (chép file không tự nạp)", (await evalIn(w.c, "chrome.runtime.getManifest().version")) === "0.2.3");

    await evalIn(w.c, "setTimeout(() => chrome.runtime.reload(), 50), true");
    w.c.close();
    await sleep(3000);
    w = await ourWorker();
    check("B5 sau Reload: v0.2.4, CÙNG extension ID", (await evalIn(w.c, "chrome.runtime.getManifest().version")) === "0.2.4" && w.id === id1, `id ${w.id}`);
    let after = null;
    for (let i = 0; i < 20 && !(after && after.lastUpgrade); i++) {
      await sleep(250);
      after = await evalIn(w.c, "chrome.storage.local.get(null)");
    }
    const lu = after.lastUpgrade || {};
    check("B6 onInstalled update đã chạy: lastUpgrade 0.2.3 → 0.2.4, chỉ xoá phiên không schema, 0 cấp phép", lu.reason === "update" && lu.from === "0.2.3" && lu.to === "0.2.4" && same(lu.removedSessions, [{ key: OLD_KEY, state: "received" }]) && lu.removedGrants === 0, JSON.stringify(lu));
    check("B7 phiên GR03887 nw_ready còn nguyên từng trường (kể cả updatedAt), không còn phiên khác", same(after.sessions[KEY], SESSION) && Object.keys(after.sessions).length === 1);
    check("B8 cấu hình STG giữ nguyên, không có cấp phép", same(after.config, CONFIG) && Object.keys(after.grants || {}).length === 0);

    // Popup của bản mới đọc được phiên qua background mới.
    const pt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?chrome-extension://${w.id}/popup/popup.html`, { method: "PUT" })).json();
    const pc = await cdp(pt.webSocketDebuggerUrl);
    await sleep(1500);
    const pop = await evalIn(pc, `(async () => {
      const get = await chrome.runtime.sendMessage({ type: "session:get", envId: "STG", grId: ${JSON.stringify(GR_ID)} });
      const grants = await chrome.runtime.sendMessage({ type: "grant:list" });
      return { get, grants, text: document.body.innerText };
    })()`);
    const g = pop.get && pop.get.ok && pop.get.data;
    check("B9 background v0.2.4 trả phiên qua session:get (không coi là bản cũ)", !!g && g.state === "nw_ready" && g.grCode === "GR03887" && g.nwPoNumber === "PO13806459");
    check("B10 popup v0.2.4 hiện đúng một phiên GR03887 'Đã khớp đơn Nextwaves' → PO13806459, cấp phép trống", /0\.2\.4/.test(pop.text) && /GR03887/.test(pop.text) && /Đã khớp đơn Nextwaves/.test(pop.text) && /PO13806459/.test(pop.text) && pop.grants.ok && pop.grants.data.length === 0, pop.text.replace(/\s+/g, " ").slice(0, 200));
    pc.close();

    r = runPs(rel, ["-Target", ext]);
    check("B11 chạy lại script sau khi nâng: thoát 0, báo đã là v0.2.4, không chép / không sao lưu thêm", r.status === 0 && /đã là v0\.2\.4/.test(r.out) && sameTree(tree(ext), NEW) && backups(rel).length === 1, lastLine(r.out));
    const final = await evalIn(w.c, "chrome.storage.local.get(null)");
    check("B12 sau mở popup + chạy lại script: phiên vẫn nguyên", same(final.sessions[KEY], SESSION));
    w.c.close();
  } catch (e) {
    check("lỗi không mong đợi", false, String((e && e.stack) || e).slice(0, 300));
  } finally {
    clearTimeout(watchdog);
    killEdge();
    await sleep(1500);
    fs.rmSync(SP, { recursive: true, force: true, maxRetries: 5 });
  }
  console.log(fails ? `${fails} mục HỎNG` : "Tất cả ĐẠT");
  process.exit(fails ? 1 : 0);
})();
