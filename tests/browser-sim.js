"use strict";
// Trình duyệt giả cho test chạy thật src/background.js + content script trong node:vm:
//  - chrome.storage.local dùng chung (onChanged gửi tới mọi ngữ cảnh), chrome.runtime.sendMessage → listener của background;
//  - tab: mỗi lần nạp / tải lại trang = ngữ cảnh vm mới, nạp đúng danh sách script ISOLATED trong src/manifest.json (trừ ui/panel.js → panel giả ghi lại view);
//  - fetch → server giả do test cấp (có thể trả chậm; AbortController của content cắt được phía client,
//    còn server giả vẫn xử lý như server thật); hook MAIN world được mô phỏng bằng tab.post({mark, type, payload}).
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "src");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const TUNING = { pollMs: 10, collectTries: 3, collectDelayMs: 5, reloadDelayMs: 5, qrConcurrency: 4, httpTimeoutMs: 2000, leaseRenewMs: 50 };
const BG_TUNING = { grantTtlMs: 60000, leaseMs: 2000, retryCooldownMs: 0 };

function isolatedScriptsFor(url) {
  const origin = new URL(url).origin;
  const cs = MANIFEST.content_scripts.find((c) => c.world !== "MAIN" && c.matches.some((m) => m.replace(/\/\*$/, "") === origin));
  return cs ? cs.js.filter((f) => f !== "ui/panel.js") : null;
}

function run(ctx, file) {
  vm.runInContext(fs.readFileSync(path.join(SRC, file), "utf8"), ctx, { filename: file });
}

function createBrowser(server, opts = {}) {
  const tuning = Object.assign({}, TUNING, opts.tuning || {});
  const bgTuning = Object.assign({}, BG_TUNING, opts.bgTuning || {});
  const store = {};
  const storageListeners = [];
  const tabs = new Map();
  const allTimers = new Set();
  let nextTabId = 1;
  let bgListener = null;
  const installedListeners = [];

  const storage = {
    get: async (keys) => {
      const out = {};
      const ks = keys === null || keys === undefined ? Object.keys(store) : [].concat(keys);
      for (const k of ks) if (k in store) out[k] = clone(store[k]);
      return out;
    },
    set: async (obj) => {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: clone(store[k]), newValue: clone(v) };
        store[k] = clone(v);
      }
      for (const l of storageListeners.slice()) setImmediate(() => l(clone(changes), "local"));
    },
  };

  function timerApi(owner) {
    const track = (h) => (owner.add(h), allTimers.add(h), h);
    return {
      setTimeout: (fn, ms, ...a) => {
        const h = setTimeout(() => {
          owner.delete(h);
          allTimers.delete(h);
          fn(...a);
        }, ms);
        return track(h);
      },
      clearTimeout: (h) => clearTimeout(h),
      setInterval: (fn, ms) => track(setInterval(fn, ms)),
      clearInterval: (h) => clearInterval(h),
    };
  }

  function sendMessage(tab, msg) {
    // Như Chrome: content script có sender.tab + url + origin của trang; popup không có tab.
    const sender = tab ? { tab: { id: tab.id, url: tab.url }, url: tab.url, origin: new URL(tab.url).origin } : { url: "chrome-extension://cgn-test/popup/popup.html" };
    // Test có thể thay câu trả lời của background cho một số message (mô phỏng background lỗi).
    const forced = opts.interceptBg ? opts.interceptBg(clone(msg), tab) : undefined;
    if (forced !== undefined) return Promise.resolve(clone(forced));
    // Như IPC thật: message tới background ở lượt sự kiện sau (macrotask), không phải ngay trong microtask.
    return new Promise((resolve) => setImmediate(() => bgListener(clone(msg), sender, (resp) => resolve(clone(resp)))));
  }

  // ---- background ----
  const bgTimers = new Set();
  const bg = Object.assign({ console, URL, URLSearchParams }, timerApi(bgTimers));
  bg.self = bg;
  bg.__CGN__ = { tuning: bgTuning };
  bg.importScripts = (...files) => files.forEach((f) => run(bg, f));
  bg.chrome = {
    storage: { local: storage, onChanged: { addListener: (l) => storageListeners.push(l) } },
    runtime: {
      onMessage: { addListener: (l) => (bgListener = l) },
      onInstalled: { addListener: (l) => installedListeners.push(l) },
      getManifest: () => clone(MANIFEST),
    },
    tabs: {
      get: async (id) => {
        const t = tabs.get(id);
        if (!t || t.closed) throw new Error("No tab with id " + id);
        return { id: t.id, url: t.url, windowId: 1 };
      },
      update: async (id, props) => {
        const t = tabs.get(id);
        if (!t || t.closed) throw new Error("No tab with id " + id);
        if (props.active) t.focusCount += 1;
        if (props.url) navigate(t, props.url);
        return { id };
      },
      create: async (props) => ({ id: openTab(props.url).id }),
    },
    windows: { update: async () => ({}) },
  };
  vm.createContext(bg);
  run(bg, MANIFEST.background.service_worker);

  // ---- tab ----
  function kill(c) {
    if (!c) return;
    c.dead = true;
    for (const h of c.timers) {
      clearTimeout(h);
      clearInterval(h);
    }
  }

  function load(t) {
    kill(t.ctx);
    t.view = null;
    const files = isolatedScriptsFor(t.url);
    if (!files) return;
    const c = { dead: false, timers: new Set(), listeners: [] };
    const win = Object.assign({ console, URL, URLSearchParams, AbortController }, timerApi(c.timers));
    win.window = win;
    win.location = {
      get href() {
        return t.url;
      },
      get origin() {
        return new URL(t.url).origin;
      },
      reload() {
        t.reloads += 1;
        setImmediate(() => load(t));
      },
    };
    win.addEventListener = (type, fn) => {
      if (type === "message") c.listeners.push(fn);
    };
    win.postMessage = (data) => {
      const d = clone(data);
      setImmediate(() => {
        // source phải là global của ngữ cảnh (trong vm, `window` trả về global proxy chứ không phải object sandbox).
        if (!c.dead) for (const fn of c.listeners.slice()) fn({ source: c.global, origin: new URL(t.url).origin, data: d });
      });
    };
    win.sessionStorage = {
      getItem: (k) => (t.ss.has(k) ? t.ss.get(k) : null),
      setItem: (k, v) => t.ss.set(k, String(v)),
      removeItem: (k) => t.ss.delete(k),
    };
    // Trang đã rời đi (tải lại / điều hướng): như trình duyệt thật, lời gọi mới không đi, lời gọi đang chờ không bao giờ trả về.
    win.fetch = (url, init) =>
      new Promise((resolve, reject) => {
        if (c.dead) return;
        const i = init || {};
        const sig = i.signal || null;
        if (sig && sig.aborted) return reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (sig) sig.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
        const req = { tab: t.id, method: String(i.method || "GET").toUpperCase(), url: String(url), headers: clone(i.headers || {}), body: i.body === undefined ? null : JSON.parse(i.body) };
        // Như mạng thật: phản hồi đến ở lượt sự kiện sau (macrotask) → vòng lặp lỗi không bỏ đói timer của test.
        new Promise((r) => setImmediate(r))
          .then(() => server(req))
          .then((r) => {
            if (c.dead) return;
            const text = r.json === undefined ? "" : JSON.stringify(r.json);
            resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => text });
          }, (err) => {
            if (!c.dead) reject(err);
          });
      });
    win.chrome = {
      runtime: { sendMessage: (msg) => (c.dead ? new Promise(() => {}) : sendMessage(t, msg)) },
      storage: {
        local: storage,
        onChanged: {
          addListener: (l) =>
            storageListeners.push((ch, area) => {
              if (!c.dead) l(ch, area);
            }),
        },
      },
    };
    win.__CGN__ = {
      tuning,
      ui: {
        createPanel: () => ({
          // Trang đã rời đi không vẽ được lên tab (không để khung / nút của trang cũ đè trang mới).
          show: (v) => {
            if (c.dead) return;
            t.view = v;
            t.views.push(v);
          },
          hide: () => {
            if (!c.dead) t.view = null;
          },
        }),
      },
    };
    vm.createContext(win);
    c.global = vm.runInContext("globalThis", win);
    t.ctx = c;
    t.loads += 1;
    t.post = (data) => win.postMessage(data);
    t.reload = () => {
      t.reloads += 1;
      load(t);
    };
    for (const f of files) run(win, f);
  }

  function navigate(t, url) {
    t.url = url;
    load(t);
  }

  function openTab(url) {
    const t = { id: nextTabId++, url, closed: false, ctx: null, view: null, views: [], loads: 0, reloads: 0, focusCount: 0, ss: new Map(), post: () => {} };
    tabs.set(t.id, t);
    load(t);
    return t;
  }

  return {
    store,
    openTab,
    tabs: () => [...tabs.values()].filter((t) => !t.closed),
    closeTab: (t) => {
      t.closed = true;
      kill(t.ctx);
    },
    setConfig: (cfg) => storage.set({ config: cfg }),
    session: (key) => clone((store.sessions || {})[key] || null),
    sendFromPopup: (msg) => sendMessage(null, msg),
    sendFromTab: (t, msg) => sendMessage(t, msg),
    // Như chrome.runtime.onInstalled (vd. {reason: "update", previousVersion}).
    fireInstalled: (details) => installedListeners.forEach((l) => l(clone(details))),
    close: () => {
      for (const t of tabs.values()) kill(t.ctx);
      for (const h of allTimers) {
        clearTimeout(h);
        clearInterval(h);
      }
    },
  };
}

async function until(fn, timeoutMs = 4000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error("until: hết giờ chờ");
    await new Promise((r) => setTimeout(r, 5));
  }
}

const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

module.exports = { createBrowser, until, settle };
