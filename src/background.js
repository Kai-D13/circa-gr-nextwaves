/*
 * Service worker: cấu hình + phiên nhận hàng + mở / chuyển tab. Không gọi API POS / Nextwaves, không giữ token.
 *
 * Phiên (chrome.storage.local "sessions", khoá "<ENV>:<grId>"):
 *   waiting_nw → nw_ready → received → applying → applied → done
 *   (applying → apply_stopped → applying khi bấm Thử lại) — mọi chuyển trạng thái do content script báo về sau khi tự kiểm.
 */
importScripts("lib/env.js", "lib/keys.js");
const E = self.__CGN__.env;
const K = self.__CGN__.keys;

const DEFAULT_CONFIG = Object.freeze({ mode: "", url: "", writeMode: "off" });
const ACTIVE = new Set(["waiting_nw", "nw_ready", "received", "applying", "applied", "apply_stopped"]);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const APPLY_STALE_MS = 2 * 60 * 1000;
const LOG_MAX = 200;

// Mọi thao tác đọc-sửa-ghi "sessions" chạy nối tiếp (hai tab gửi cùng lúc không ghi đè nhau).
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

const keyOf = (envId, grId) => `${envId}:${String(grId || "").toLowerCase()}`;

async function getConfig() {
  const { config } = await chrome.storage.local.get("config");
  return Object.assign({}, DEFAULT_CONFIG, config || {});
}

async function setConfig(patch) {
  const cur = await getConfig();
  const next = Object.assign({}, cur, patch || {});
  if (!["off", "confirm", "auto"].includes(next.writeMode)) next.writeMode = "off";
  if (next.mode && !E.envById(next.mode)) next.mode = "";
  if (next.url && !E.envFromAnyUrl(next.url)) throw new Error("URL không thuộc môi trường đã biết (STG / PRD)");
  await chrome.storage.local.set({ config: next });
  return next;
}

async function getSessions() {
  const { sessions } = await chrome.storage.local.get("sessions");
  return sessions || {};
}

async function saveSessions(all) {
  const now = Date.now();
  for (const k of Object.keys(all)) if (now - (all[k].updatedAt || 0) > SESSION_TTL_MS) delete all[k];
  await chrome.storage.local.set({ sessions: all });
}

async function updateSession(key, patch, logEvent) {
  const all = await getSessions();
  const s = all[key];
  if (!s) return null;
  Object.assign(s, patch || {}, { updatedAt: Date.now() });
  if (logEvent) s.log = (s.log || []).concat([Object.assign({ at: new Date().toISOString() }, logEvent)]).slice(-LOG_MAX);
  all[key] = s;
  await saveSessions(all);
  return s;
}

async function openOrFocus(tabId, url) {
  if (tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab) {
        await chrome.tabs.update(tabId, url ? { active: true, url } : { active: true });
        if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
        return tabId;
      }
    } catch (_) {
      /* tab đã đóng → mở mới */
    }
  }
  const t = await chrome.tabs.create({ url, active: true });
  return t.id;
}

async function startSession(msg, sender) {
  const env = E.envById(msg.envId);
  if (!env) throw new Error("env");
  if (!K.soBase(msg.soBase)) throw new Error("soBase");
  const key = keyOf(env.id, msg.grId);
  const all = await getSessions();
  const cur = all[key];
  if (cur && ACTIVE.has(cur.state)) return cur; // không mở thêm tab khi tải lại trang
  const s = {
    key,
    envId: env.id,
    grId: String(msg.grId).toLowerCase(),
    grCode: msg.grCode,
    poPosId: msg.poPosId,
    poPosCode: msg.poPosCode,
    posId: msg.posId,
    deliveryCode: msg.deliveryCode,
    soBase: K.soBase(msg.soBase),
    warehouseId: msg.warehouseId || null,
    fingerprint: msg.fingerprint || [],
    returnUrl: msg.returnUrl,
    posTabId: sender && sender.tab ? sender.tab.id : null,
    nwTabId: null,
    state: "waiting_nw",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    log: [{ at: new Date().toISOString(), type: "start", deliveryCode: msg.deliveryCode }],
  };
  all[key] = s;
  await saveSessions(all);
  s.nwTabId = await openOrFocus(null, E.api.nwReceivePage(env, s.soBase));
  return updateSession(key, { nwTabId: s.nwTabId });
}

// Trang Nextwaves ?po=<SO | số PO | id PO> → phiên đang mở tương ứng (mới nhất).
async function findByNw(envId, po) {
  const all = await getSessions();
  const p = String(po || "").trim();
  const base = K.soBase(p);
  const list = Object.values(all).filter(
    (s) =>
      s.envId === envId &&
      ACTIVE.has(s.state) &&
      ((base && s.soBase === base) || (s.nwPoId && s.nwPoId === p.toLowerCase()) || (s.nwPoNumber && s.nwPoNumber.toUpperCase() === p.toUpperCase()))
  );
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  return list[0] || null;
}

// Một tab POS giành quyền ghi GR của phiên. Phiên "applying" quá APPLY_STALE_MS (tab đóng giữa chừng) được giành lại;
// apply.js luôn đọc lại GR trước mỗi PUT nên lần chạy sau không ghi trùng.
async function claimApply(key, token) {
  const all = await getSessions();
  const s = all[key];
  if (!s) return false;
  const stale = s.state === "applying" && Date.now() - (s.updatedAt || 0) > APPLY_STALE_MS;
  if (!(s.state === "received" || s.state === "apply_stopped" || stale)) return false;
  await updateSession(key, { state: "applying", applyToken: token, applyError: null }, { type: "apply_claimed" });
  return true;
}

async function received(key, payload) {
  const s = await updateSession(key, { state: "received", nwResult: payload }, { type: "nw_received", units: (payload.units || []).length });
  if (!s) return null;
  // Đưa dược sĩ về tab POS; tab đã đóng hoặc đã rời trang thì mở lại đúng trang bắt đầu phiên.
  let posTabId = s.posTabId;
  try {
    const tab = posTabId ? await chrome.tabs.get(posTabId) : null;
    const same = tab && tab.url && tab.url.split("#")[0] === s.returnUrl.split("#")[0];
    posTabId = await openOrFocus(tab ? posTabId : null, same ? null : s.returnUrl);
  } catch (_) {
    posTabId = await openOrFocus(null, s.returnUrl);
  }
  return updateSession(key, { posTabId });
}

async function focusPos(key) {
  const s = (await getSessions())[key];
  if (!s) return null;
  let tab = null;
  try {
    tab = s.posTabId ? await chrome.tabs.get(s.posTabId) : null;
  } catch (_) {
    tab = null;
  }
  const posTabId = await openOrFocus(tab ? s.posTabId : null, tab ? null : s.returnUrl);
  return updateSession(key, { posTabId });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  serial(async () => {
    switch (msg && msg.type) {
      case "config:get":
        return getConfig();
      case "config:set":
        return setConfig(msg.patch);
      case "session:get":
        return (await getSessions())[keyOf(msg.envId, msg.grId)] || null;
      case "session:start":
        return startSession(msg, sender);
      case "session:findByNw":
        return findByNw(msg.envId, msg.po);
      case "session:update":
        return updateSession(msg.key, msg.patch, msg.log);
      case "session:log":
        return updateSession(msg.key, null, msg.log);
      case "session:received":
        return received(msg.key, msg.payload);
      case "session:claimApply":
        return claimApply(msg.key, msg.token);
      case "session:focusPos":
        return focusPos(msg.key);
      case "session:reopenNw": {
        const s = (await getSessions())[msg.key];
        if (!s) return null;
        const env = E.envById(s.envId);
        const id = await openOrFocus(s.nwTabId, null).catch(() => null);
        if (id) return updateSession(msg.key, { nwTabId: id });
        return updateSession(msg.key, { nwTabId: await openOrFocus(null, E.api.nwReceivePage(env, s.soBase)) });
      }
      case "session:cancel": {
        const all = await getSessions();
        delete all[msg.key];
        await saveSessions(all);
        return true;
      }
      case "session:list":
        return Object.values(await getSessions()).sort((a, b) => b.updatedAt - a.updatedAt);
      default:
        throw new Error("unknown message");
    }
  }).then(
    (data) => reply({ ok: true, data }),
    (err) => reply({ ok: false, error: String((err && err.message) || err) })
  );
  return true;
});
