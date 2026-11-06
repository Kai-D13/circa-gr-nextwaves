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
const BG_TUNING = { leaseMs: 2000, retryCooldownMs: 0, readerRelayMs: 1500, nwCloseDelayMs: 5 };

// Mẫu match của manifest ("https://*.nextwaves.app/*") → có khớp origin không (như Chrome: * ở đầu host = mọi subdomain).
function matchesOrigin(pattern, origin) {
  const m = /^(https?):\/\/([^/]+)\/\*$/.exec(pattern);
  if (!m) return false;
  const u = new URL(origin);
  if (u.protocol !== m[1] + ":") return false;
  const host = m[2];
  if (host.startsWith("*.")) return u.hostname.endsWith(host.slice(1)) && u.hostname.length > host.length - 1;
  return u.hostname === host;
}

// Như Chrome / Edge: duyệt các mục content_scripts khớp trang theo thứ tự manifest; MỘT file chỉ được nạp MỘT lần mỗi trang
// (mục đứng trước được nạp, kể cả khác world). Trả danh sách file ISOLATED thực sự được nạp (MAIN world không chạy trong
// trình duyệt giả — hook được mô phỏng bằng tab.post). ui/panel.js thay bằng panel giả.
function isolatedScriptsFor(url) {
  const origin = new URL(url).origin;
  const matching = MANIFEST.content_scripts.filter((c) => c.matches.some((m) => matchesOrigin(m, origin)));
  if (!matching.some((c) => c.world !== "MAIN")) return null;
  const injected = new Set();
  const isolated = [];
  for (const c of matching) {
    for (const f of c.js) {
      if (injected.has(f)) continue;
      injected.add(f);
      if (c.world !== "MAIN") isolated.push(f);
    }
  }
  return isolated.filter((f) => f !== "ui/panel.js");
}

// patch: {file: (mã) => mã} — chỉ test công tắc tắt ghi (v0.3.1) vá env.js của background; mặc định chạy đúng file trong src/.
function run(ctx, file, patch) {
  let code = fs.readFileSync(path.join(SRC, file), "utf8");
  if (patch && patch[file]) code = patch[file](code);
  vm.runInContext(code, ctx, { filename: file });
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
  const removedListeners = []; // chrome.tabs.onRemoved
  // v0.4.0: QR Scan Log giả (circa-reader/v1) trên mọi tab POS — opts.qsl: {mode: "ok" | "none" | "busy" | "silent_lend"}; mọi lệnh ghi lại.
  const qsl = Object.assign({ mode: "none", calls: [], lent: null }, opts.qsl || {});
  // Sau close(): không mở tab / nạp trang, không tạo timer, không chuyển message hay sự kiện storage.
  // (Một message background đang dở lúc test kết thúc có thể mở tab mới → timer mới không ai dọn → tiến trình test sống mãi.)
  let closed = false;

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
      if (!closed) for (const l of storageListeners.slice()) setImmediate(() => !closed && l(clone(changes), "local"));
    },
  };

  function timerApi(owner) {
    const track = (h) => (owner.add(h), allTimers.add(h), h);
    return {
      setTimeout: (fn, ms, ...a) => {
        if (closed) return null;
        const h = setTimeout(() => {
          owner.delete(h);
          allTimers.delete(h);
          fn(...a);
        }, ms);
        return track(h);
      },
      clearTimeout: (h) => clearTimeout(h),
      setInterval: (fn, ms) => (closed ? null : track(setInterval(fn, ms))),
      clearInterval: (h) => clearInterval(h),
    };
  }

  function sendMessage(tab, msg) {
    // Như Chrome: content script có sender.tab + url + origin của trang; popup không có tab.
    const sender = tab ? { tab: { id: tab.id, url: tab.url }, url: tab.url, origin: new URL(tab.url).origin } : { url: "chrome-extension://cgn-test/popup/popup.html" };
    // Test có thể thay câu trả lời của background cho một số message (mô phỏng background lỗi).
    if (closed) return new Promise(() => {});
    const forced = opts.interceptBg ? opts.interceptBg(clone(msg), tab) : undefined;
    if (forced !== undefined) return Promise.resolve(clone(forced));
    // Như IPC thật: message tới background ở lượt sự kiện sau (macrotask), không phải ngay trong microtask.
    return new Promise((resolve) => setImmediate(() => !closed && bgListener(clone(msg), sender, (resp) => resolve(clone(resp)))));
  }

  // ---- background ----
  const bgTimers = new Set();
  const bg = Object.assign({ console, URL, URLSearchParams }, timerApi(bgTimers));
  bg.self = bg;
  bg.__CGN__ = { tuning: bgTuning };
  bg.importScripts = (...files) => files.forEach((f) => run(bg, f, opts.bgSrcPatch));
  bg.chrome = {
    storage: { local: storage, onChanged: { addListener: (l) => storageListeners.push(l) } },
    runtime: {
      id: "cgn-test",
      lastError: undefined,
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
      remove: async (id) => {
        const t = tabs.get(id);
        if (!t || t.closed) throw new Error("No tab with id " + id);
        api.closeTab(t);
      },
      query: async (q) => {
        const pat = q && q.url ? String(q.url).replace(/\*$/, "") : "";
        return [...tabs.values()].filter((t) => !t.closed && (!pat || t.url.startsWith(pat))).map((t) => ({ id: t.id, url: t.url, windowId: 1 }));
      },
      // background → content script của một tab (như chrome.tabs.sendMessage: sender không có tab, id = extension).
      sendMessage: (id, msg, cb) => {
        const t = tabs.get(id);
        const ls = t && !t.closed && t.ctx && !t.ctx.dead ? t.ctx.runtimeListeners.slice() : [];
        if (!ls.length) return setImmediate(() => cb && cb(undefined));
        let answered = false;
        const reply = (r) => {
          if (answered) return;
          answered = true;
          setImmediate(() => cb && cb(clone(r)));
        };
        setImmediate(() => {
          let keep = false;
          for (const l of ls) if (l(clone(msg), { id: "cgn-test" }, reply) === true) keep = true;
          if (!keep && !answered) reply(undefined);
        });
      },
      update: async (id, props) => {
        const t = tabs.get(id);
        if (!t || t.closed) throw new Error("No tab with id " + id);
        if (props.active) t.focusCount += 1;
        if (props.url) navigate(t, props.url);
        return { id };
      },
      create: async (props) => ({ id: openTab(props.url).id }),
      onRemoved: { addListener: (l) => removedListeners.push(l) },
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
    t.viewKind = null;
    if (closed) return;
    const files = isolatedScriptsFor(t.url);
    if (!files) return;
    const c = { dead: false, timers: new Set(), listeners: [], runtimeListeners: [] };
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
      assign(url) {
        setImmediate(() => !c.dead && navigate(t, String(url)));
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
      runtime: {
        id: "cgn-test",
        sendMessage: (msg) => (c.dead ? new Promise(() => {}) : sendMessage(t, msg)),
        onMessage: { addListener: (l) => c.runtimeListeners.push(l) },
      },
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
    // Khung trong luồng trang phiếu (v0.2.4): anchor có / không do test đặt bằng t.setAnchor(bool) (mặc định có).
    // Không có anchor → view chờ chỗ gắn; hết `tuning.uiWaitMs` (mặc định 0 = lượt sự kiện kế tiếp; panel thật 10 giây) mà VẪN chờ
    // (chưa hide, anchor chưa có lại) → onMissing("missing") một lần. hide huỷ lượt chờ như panel thật (v0.2.5). Anchor có lại sau
    // khi đã báo thiếu → onFound(); trước khi báo → chỉ gắn khung.
    const inline = { opts: null, view: null, code: null, waiting: false, failed: false, timer: null };
    c.inline = inline;
    inline.arm = () => {
      if (inline.waiting || inline.failed) return;
      inline.waiting = true;
      const fire = () => {
        inline.timer = null;
        if (c.dead || !inline.waiting || !inline.view || t.anchor) return;
        inline.waiting = false;
        inline.failed = true;
        inline.opts.onMissing("missing");
      };
      if (tuning.uiWaitMs) inline.timer = setTimeout(fire, tuning.uiWaitMs);
      else setImmediate(fire);
    };
    inline.disarm = () => {
      if (inline.timer) clearTimeout(inline.timer);
      inline.timer = null;
      inline.waiting = inline.failed = false;
    };
    win.__CGN__ = {
      tuning,
      ui: {
        createPanel: () => ({
          // Trang đã rời đi không vẽ được lên tab (không để khung / nút của trang cũ đè trang mới).
          show: (v) => {
            if (c.dead) return;
            t.view = v;
            t.viewKind = "float";
            t.views.push(v);
            t.floatViews.push(v);
          },
          hide: () => {
            if (!c.dead && t.viewKind === "float") t.view = null;
          },
        }),
        createInlinePanel: (brand, o) => {
          inline.opts = o;
          return {
            show: (v, code) => {
              if (c.dead) return;
              inline.view = v;
              inline.code = code || null;
              if (!t.anchor) return inline.arm();
              t.view = v;
              t.viewKind = "inline";
              t.views.push(v);
              t.inlineViews.push(v);
            },
            hide: () => {
              inline.view = inline.code = null;
              inline.disarm();
              if (!c.dead && t.viewKind === "inline") t.view = null;
            },
            anchoredFor: (code) => !c.dead && t.anchor && !!inline.view && inline.code === (code || null) && t.viewKind === "inline",
          };
        },
      },
      // pos/gr-list.js (DOM) thay bằng bộ giả: ghi lại model nút theo mã GR; "dòng" là object {code, connected}
      // test tự tạo / đổi để mô phỏng DOM danh sách đổi (rev 2 R2).
      grList: {
        attach: (ctrl) => {
          t.grListCtrl = ctrl;
        },
        activate: () => {
          if (!c.dead) t.grListActive = true;
        },
        deactivate: () => {
          if (c.dead) return;
          t.grListActive = false;
          t.grListModel = null;
          t.grListNotice = null;
        },
        show: (m) => {
          if (c.dead) return;
          t.grListModel = m;
          t.grListModels.push(m);
        },
        // v0.2.3: vùng thông báo trong luồng trang danh sách (thay khung nổi)
        notice: (v) => {
          if (c.dead || !t.grListActive) return;
          t.grListNotice = v || null;
          if (v) t.grListNotices.push(v);
        },
        rowValid: (row, code, grId) => {
          const v = t.grListModel && t.grListModel.byCode ? t.grListModel.byCode.get(code) : null;
          return !!row && row.connected !== false && row.code === code && !!v && v.grId === grId;
        },
      },
    };
    vm.createContext(win);
    c.global = vm.runInContext("globalThis", win);
    const posOrigins = ["https://pos.stg.circa-v2.buymed.tech", "https://pos.v2.circa.vn"];
    if (posOrigins.includes(new URL(t.url).origin) && qsl.mode !== "none") {
      c.listeners.push((e) => {
        const m = e.data;
        if (!m || m.ns !== "circa-reader/v1" || m.from !== "gr-nextwaves") return;
        qsl.calls.push({ tab: t.id, type: m.type, leaseId: m.leaseId || null, ttlMs: m.ttlMs || null, label: m.label || null });
        const out = { ns: "circa-reader/v1", from: "qsl", reqId: m.reqId };
        if (m.type === "ping") Object.assign(out, { type: "pong", protocol: 1, version: "0.9.x-test", holder: qsl.lent ? "none" : "tab", lent: qsl.lent });
        else if (m.type === "lend") {
          if (qsl.mode === "silent_lend") return;
          if (qsl.mode === "busy") Object.assign(out, { type: "lend:result", leaseId: m.leaseId, ok: false, reason: "busy" });
          else {
            qsl.lent = { leaseId: m.leaseId, label: m.label, until: Date.now() + (m.ttlMs || 0) };
            Object.assign(out, { type: "lend:result", leaseId: m.leaseId, ok: true, state: "released", until: qsl.lent.until });
          }
        } else if (m.type === "return") {
          if (qsl.lent && qsl.lent.leaseId === m.leaseId) {
            qsl.lent = null;
            Object.assign(out, { type: "return:result", leaseId: m.leaseId, ok: true, state: "reclaiming" });
          } else Object.assign(out, { type: "return:result", leaseId: m.leaseId, ok: false, reason: "unknown_lease" });
        } else return;
        win.postMessage(out);
      });
    }
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
    const t = { id: nextTabId++, url, closed: false, ctx: null, view: null, viewKind: null, views: [], loads: 0, reloads: 0, focusCount: 0, ss: new Map(), post: () => {}, grListCtrl: null, grListActive: false, grListModel: null, grListModels: [], grListNotice: null, grListNotices: [], anchor: true, floatViews: [], inlineViews: [] };
    // Trang phiếu có / mất chỗ gắn khung (#all-receipt của đúng phiếu). Có lại khi khung đang chờ → onFound như trình duyệt thật.
    t.setAnchor = (on) => {
      t.anchor = !!on;
      const inl = t.ctx && !t.ctx.dead ? t.ctx.inline : null;
      if (!inl || !inl.opts) return;
      if (!on && t.viewKind === "inline") {
        t.view = null;
        if (inl.view) inl.arm();
      } else if (on && inl.view && (inl.waiting || inl.failed)) {
        const wasFailed = inl.failed;
        inl.disarm();
        t.view = inl.view;
        t.viewKind = "inline";
        t.views.push(inl.view);
        t.inlineViews.push(inl.view);
        if (wasFailed) setImmediate(() => !t.ctx.dead && inl.opts.onFound());
      }
    };
    tabs.set(t.id, t);
    load(t);
    return t;
  }

  const api = {
    store,
    qsl,
    openTab,
    tabs: () => [...tabs.values()].filter((t) => !t.closed),
    closeTab: (t) => {
      t.closed = true;
      kill(t.ctx);
      if (!closed) for (const l of removedListeners) setImmediate(() => !closed && l(t.id, {}));
    },
    setConfig: (cfg) => storage.set({ config: cfg }),
    session: (key) => clone((store.sessions || {})[key] || null),
    // Đổi trực tiếp vài trường của một phiên trong storage (vd. state) — listener storage của content chạy như trên Chrome.
    patchSession: (key, patch) => storage.set({ sessions: Object.assign({}, store.sessions, { [key]: Object.assign({}, (store.sessions || {})[key], patch) }) }),
    sendFromPopup: (msg) => sendMessage(null, msg),
    sendFromTab: (t, msg) => sendMessage(t, msg),
    // Như chrome.runtime.onInstalled (vd. {reason: "update", previousVersion}).
    fireInstalled: (details) => installedListeners.forEach((l) => l(clone(details))),
    close: () => {
      closed = true;
      OPEN.delete(api);
      for (const t of tabs.values()) kill(t.ctx);
      for (const h of allTimers) {
        clearTimeout(h);
        clearInterval(h);
      }
    },
  };
  OPEN.add(api);
  return api;
}

// Mọi trình duyệt giả đang mở. Test bị cắt vì quá giờ thì `finally` của nó có thể không bao giờ chạy;
// gọi closeAll() trong afterEach để timer của trình duyệt đó không giữ tiến trình test sống mãi.
const OPEN = new Set();
const closeAll = () => [...OPEN].forEach((b) => b.close());

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

module.exports = { createBrowser, until, settle, closeAll };
