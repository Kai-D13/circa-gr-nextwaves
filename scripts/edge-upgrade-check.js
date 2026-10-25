// Kiểm P2.4 trên Edge thật: nạp bản CŨ từ thư mục tạm → ghi phiên + cấp phép kiểu cũ (không schema) → chép đè bản MỚI vào
// CÙNG thư mục → chrome.runtime.reload() (cùng extension ID) → onInstalled "update" phải xoá phiên / cấp phép cũ. Hồ sơ tạm.
//   node scripts/edge-upgrade-check.js <thư mục bản cũ> <thư mục bản mới>
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const OLD = process.argv[2];
const NEW = process.argv[3];
if (!OLD || !NEW) {
  console.log("Cách dùng: node scripts/edge-upgrade-check.js <thư mục bản cũ> <thư mục bản mới>");
  process.exit(2);
}
const SP = fs.mkdtempSync(path.join(os.tmpdir(), "cgn-upgrade-"));
const prof = path.join(SP, "edge-prof3");
const ext = path.join(SP, "upg-ext");
fs.rmSync(prof, { recursive: true, force: true });
fs.rmSync(ext, { recursive: true, force: true });
fs.mkdirSync(prof, { recursive: true });
fs.cpSync(OLD, ext, { recursive: true });
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--user-data-dir=${prof}`, "--remote-debugging-port=9335", "--no-first-run", "--disable-features=DisableLoadExtensionCommandLineSwitch", `--load-extension=${ext}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0;
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
    ws.onopen = () => resolve({ send: (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }), close: () => ws.close() });
  });
}
const evalIn = async (c, expr) => {
  const r = (await c.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result;
  return r && r.result ? r.result.value : r;
};
async function ourWorker() {
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch("http://127.0.0.1:9335/json/list")).json();
    for (const t of list.filter((x) => x.type === "service_worker" && /\/background\.js$/.test(x.url))) {
      const c = await cdp(t.webSocketDebuggerUrl);
      const name = await evalIn(c, "chrome.runtime.getManifest().name");
      if (String(name).startsWith("Circa GR")) return { t, c };
      c.close();
    }
    await sleep(500);
  }
  throw new Error("không thấy service worker");
}
(async () => {
  try {
    await sleep(4000);
    let w = await ourWorker();
    const id1 = new URL(w.t.url).host;
    console.log("1) nạp:", await evalIn(w.c, "chrome.runtime.getManifest().version"), "id", id1);
    const now = Date.now();
    const old = {
      key: "STG:2de6c0ec-2ea8-4038-8616-659fa3f5820a", envId: "STG", grId: "2de6c0ec-2ea8-4038-8616-659fa3f5820a", grCode: "GR03878",
      posId: "64a8663b-0c9e-49c6-9626-0a4c7c4bd53d", warehouseId: "82bf85e4-84e2-4158-ae27-1aaa6fe1bc57", soBase: "SOBD1593858",
      state: "received", writeLocks: [], nwWriteLocks: [], scanOk: { httpStatus: 200 }, createdAt: now, updatedAt: now, log: [],
    };
    const seed = { sessions: { [old.key]: old }, grants: { "STG:GR03878": { envId: "STG", grCode: "GR03878", createdAt: now, expiresAt: now + 3600000 } } };
    await evalIn(w.c, `chrome.storage.local.set(${JSON.stringify(seed)}).then(()=>true)`);
    console.log("2) storage trước nâng cấp:", await evalIn(w.c, "chrome.storage.local.get(['sessions','grants']).then(x=>JSON.stringify({sessions:Object.keys(x.sessions||{}),grants:Object.keys(x.grants||{})}))"));
    // Chép đè v0.1.3 vào CÙNG thư mục rồi reload → cùng extension ID, onInstalled reason "update".
    fs.cpSync(NEW, ext, { recursive: true, force: true });
    await evalIn(w.c, "setTimeout(()=>chrome.runtime.reload(),50), true");
    w.c.close();
    await sleep(4000);
    w = await ourWorker();
    const id2 = new URL(w.t.url).host;
    console.log("3) sau reload:", await evalIn(w.c, "chrome.runtime.getManifest().version"), "id", id2, id1 === id2 ? "(CÙNG ID)" : "(KHÁC ID)");
    await sleep(500);
    console.log("4) storage sau nâng cấp:", await evalIn(w.c, "chrome.storage.local.get(null).then(x=>JSON.stringify({sessions:x.sessions,grants:x.grants,lastUpgrade:x.lastUpgrade}))"));
    w.c.close();
  } catch (e) {
    console.error("ERR", e.message);
  } finally {
    edge.kill();
    await sleep(500);
  }
})();
