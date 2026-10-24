/*
 * Service worker: cấu hình + phiên nhận hàng + cấp phép ghi + mở / chuyển tab. Không gọi API POS / Nextwaves, không giữ token.
 *
 * Phiên (chrome.storage.local "sessions", khoá "<ENV>:<grId>"):
 *   waiting_nw → nw_ready → received → applying → applied → done
 *   (applying → apply_stopped → applying khi có cấp phép mới) — chuyển trạng thái do content script báo về sau khi tự kiểm.
 *
 * Ghi GR (PM audit 24/10 P1.3 / P1.5):
 *  - Không có chế độ ghi lâu dài. Operator cấp phép MỘT lần cho MỘT phiếu (mã GR) trong popup, có hạn GRANT_TTL_MS.
 *    Chỉ popup (không phải trang web / content script) tạo được cấp phép; production không nhận cấp phép.
 *  - Tab POS giành quyền bằng `claimApply` kèm mã GR + mã kế hoạch: tiêu cấp phép, nhận lease (chủ = token của tab).
 *  - Lease phải được gia hạn trong lúc ghi; trước mỗi PUT tab gọi `renewLease` — mất lease thì dừng.
 *    Lease hết hạn (tab đóng / treo) mới cho tab khác giành; LEASE_MS > thời hạn một PUT (grpc-timeout 30S + hết giờ phía client).
 *  - Chỉ chủ lease kết thúc được lượt ghi (`finishApply`). Kết quả không rõ (mất kết nối) → chờ RETRY_COOLDOWN_MS mới cho ghi lại.
 *
 * Bất biến phiên (PM audit v0.1.1 P1.7):
 *  - content script chỉ đổi được `state` (sang applied / done) qua session:update; mọi trường khác bị bỏ qua;
 *  - khoá ghi phía POS đặt lúc tạo phiên (session:start, từ trang POS); khoá + dữ liệu đơn Nextwaves đặt MỘT lần (session:nwMatched,
 *    từ trang Nextwaves, khi phiên đang waiting_nw); không message nào xoá / hạ khoá;
 *  - message ghi kiểm nguồn gửi: claim / renew / finish từ trang POS, nwMatched / scanOk / received từ trang Nextwaves của môi trường.
 */
importScripts("lib/env.js", "lib/keys.js");
const E = self.__CGN__.env;
const K = self.__CGN__.keys;
const T = Object.assign({ grantTtlMs: 30 * 60 * 1000, leaseMs: 90 * 1000, retryCooldownMs: 60 * 1000 }, self.__CGN__.tuning || {});

const DEFAULT_CONFIG = Object.freeze({ mode: "", url: "" });
const ACTIVE = new Set(["waiting_nw", "nw_ready", "received", "applying", "applied", "apply_stopped"]);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const LOG_MAX = 200;
// session:update từ content script CHỈ đổi được `state`, và chỉ sang các trạng thái này (PM audit v0.1.1 P1.7).
// Mọi dữ liệu khác của phiên (khoá ghi, dữ liệu nhận dạng đơn Nextwaves, lease, …) đi qua message riêng có kiểm nguồn gửi.
const UPDATE_STATES = new Set(["applied", "done"]);
// Khoá ghi phía Nextwaves mà tab khớp đơn được phép đặt.
const NW_LOCKS = new Set(["nw_many_orders"]);

// Mọi thao tác đọc-sửa-ghi storage chạy nối tiếp (hai tab gửi cùng lúc không ghi đè nhau).
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

const keyOf = (envId, grId) => `${envId}:${String(grId || "").toLowerCase()}`;
const grantKey = (envId, grCode) => `${envId}:${String(grCode || "").trim().toUpperCase()}`;

async function getConfig() {
  const { config } = await chrome.storage.local.get("config");
  const c = Object.assign({}, DEFAULT_CONFIG, config || {});
  return { mode: c.mode, url: c.url }; // bỏ mọi trường cũ (writeMode "auto" của v0.1.0 không còn tác dụng)
}

async function setConfig(patch) {
  const cur = await getConfig();
  const next = { mode: patch && "mode" in patch ? patch.mode : cur.mode, url: patch && "url" in patch ? patch.url : cur.url };
  if (next.mode && !E.envById(next.mode)) next.mode = "";
  if (next.url && !E.envFromAnyUrl(next.url)) throw new Error("URL không thuộc môi trường đã biết (STG / PRD)");
  await chrome.storage.local.set({ config: next });
  return next;
}

// ---------- cấp phép ghi ----------
async function getGrants() {
  const { grants } = await chrome.storage.local.get("grants");
  const all = grants || {};
  const now = Date.now();
  for (const k of Object.keys(all)) if (!(all[k].expiresAt > now)) delete all[k];
  return all;
}

async function createGrant(msg, sender) {
  if (sender && sender.tab) throw new Error("Chỉ cấp phép từ popup extension");
  const env = E.envById(msg.envId);
  if (!env) throw new Error("Môi trường không hợp lệ");
  if (!env.writeEnabled) throw new Error(`${env.label}: chỉ đọc, chưa qua gate ghi`);
  const grCode = String(msg.grCode || "").trim().toUpperCase();
  if (!/^GR\d+$/.test(grCode)) throw new Error("Mã phiếu nhận phải dạng GR + số, ví dụ GR03878");
  const all = await getGrants();
  const now = Date.now();
  all[grantKey(env.id, grCode)] = { envId: env.id, grCode, createdAt: now, expiresAt: now + T.grantTtlMs };
  await chrome.storage.local.set({ grants: all });
  return all[grantKey(env.id, grCode)];
}

async function revokeGrant(key, sender) {
  if (sender && sender.tab) throw new Error("Chỉ thu hồi từ popup extension");
  const all = await getGrants();
  delete all[key];
  await chrome.storage.local.set({ grants: all });
  return true;
}

// ---------- phiên ----------
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

// session:update từ content script: chỉ trường `state` (các trường khác bị bỏ qua), chỉ sang applied / done.
async function contentUpdate(key, patch, logEvent) {
  const s = (await getSessions())[key];
  if (!s) return null;
  if (!patch || !("state" in patch)) return logEvent ? updateSession(key, null, logEvent) : s;
  const state = patch.state;
  if (!UPDATE_STATES.has(state)) throw new Error(`Không chuyển trạng thái ${state} qua session:update`);
  if (s.state === "applying" && state !== "done") throw new Error("Phiên đang ghi");
  if (state === "applied" && !["received", "apply_stopped"].includes(s.state)) throw new Error(`Không chuyển ${s.state} → applied`);
  return updateSession(key, { state }, logEvent);
}

// Nguồn gửi message: origin của trang (content script) — "" nếu là popup / không xác định.
function senderOrigin(sender) {
  if (!sender || !sender.tab) return "";
  const u = sender.origin || sender.url || sender.tab.url || "";
  try {
    return new URL(u).origin.toLowerCase();
  } catch (_) {
    return "";
  }
}

function requireOrigin(sender, origin, what) {
  if (senderOrigin(sender) !== String(origin || "").toLowerCase()) throw new Error(`${what}: nguồn gửi không hợp lệ`);
}

const isStr = (x) => typeof x === "string" && x.length > 0;
const isStrList = (x, min) => Array.isArray(x) && x.length >= (min || 0) && x.every(isStr);

// Tab Nextwaves báo đã khớp đúng một đơn (lib/resolve.js). Chỉ một lần cho mỗi phiên, chỉ từ trang Nextwaves của môi trường,
// chỉ khi phiên đang chờ (waiting_nw). Khoá ghi phía Nextwaves chỉ nhận giá trị đã biết; sau đó không đổi được (P1.7).
async function nwMatched(msg, sender) {
  const s = (await getSessions())[msg.key];
  if (!s) throw new Error("Không có phiên");
  const env = E.envById(s.envId);
  requireOrigin(sender, env && env.nwUiOrigin, "session:nwMatched");
  if (s.state !== "waiting_nw" || s.nwPoId) throw new Error("Phiên đã khớp đơn Nextwaves — không khớp lại / đổi được");
  const m = msg.match || {};
  const ok =
    isStr(m.nwPoId) &&
    isStr(m.nwPoNumber) &&
    isStr(m.nwOrderId) &&
    isStr(m.nwRefId) &&
    K.sameSo(m.nwRefId, s.soBase) &&
    isStrList(m.shipmentIds, 1) &&
    m.expected &&
    Array.isArray(m.expected.shipments) &&
    isStrList(m.receiptIdsBefore) &&
    isStrList(m.nwWriteLocks) &&
    m.nwWriteLocks.every((l) => NW_LOCKS.has(l));
  if (!ok) throw new Error("session:nwMatched: dữ liệu khớp đơn không hợp lệ");
  return updateSession(
    msg.key,
    {
      state: "nw_ready",
      nwPoId: m.nwPoId.toLowerCase(),
      nwPoNumber: m.nwPoNumber,
      nwOrderId: m.nwOrderId.toLowerCase(),
      nwRefId: m.nwRefId,
      shipmentIds: m.shipmentIds.map((x) => x.toLowerCase()),
      expected: m.expected,
      fpRows: Array.isArray(m.fpRows) ? m.fpRows : [],
      receiptIdsBefore: m.receiptIdsBefore.slice(),
      nwWriteLocks: [...new Set(m.nwWriteLocks)],
      nwSearch: m.nwSearch || null,
    },
    msg.log || { type: "nw_matched" }
  );
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
  requireOrigin(sender, env.posOrigin, "session:start");
  if (!K.soBase(msg.soBase)) throw new Error("soBase");
  if (!msg.posId || !E.storeAllowed(env, msg.posId)) throw new Error("store");
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
    posId: String(msg.posId).toLowerCase(),
    deliveryCode: msg.deliveryCode,
    soBase: K.soBase(msg.soBase),
    warehouseId: msg.warehouseId || null,
    fingerprint: msg.fingerprint || [],
    writeLocks: Array.isArray(msg.writeLocks) ? msg.writeLocks.map(String) : [], // khoá ghi phía POS: đặt lúc tạo phiên, không đổi được
    nwWriteLocks: [], // khoá ghi phía Nextwaves: chỉ session:nwMatched đặt, một lần
    returnUrl: msg.returnUrl,
    posTabId: sender && sender.tab ? sender.tab.id : null,
    nwTabId: null,
    state: "waiting_nw",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    log: [{ at: new Date().toISOString(), type: "start", deliveryCode: msg.deliveryCode, writeLocks: msg.writeLocks || [] }],
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

// Lý do không được ghi phiên này (rỗng = được, nếu có cấp phép).
function writeBlockers(s) {
  const env = E.envById(s.envId);
  const out = [];
  if (!env || !env.writeEnabled) out.push("env_read_only");
  if (!s.warehouseId) out.push("warehouse_unmapped");
  for (const l of [].concat(s.writeLocks || [], s.nwWriteLocks || [])) out.push(l);
  return out;
}

// Ghi chỉ từ tab POS của đúng môi trường phiên.
function requirePosTab(s, sender, what) {
  const env = s ? E.envById(s.envId) : null;
  requireOrigin(sender, env && env.posOrigin, what);
}

async function claimApply(msg, sender) {
  const all = await getSessions();
  const s = all[msg.key];
  const now = Date.now();
  const no = (reason) => ({ ok: false, reason });
  if (!s) return no("no_session");
  requirePosTab(s, sender, "session:claimApply");
  const blockers = writeBlockers(s);
  if (blockers.length) return no(blockers[0]);
  const leaseExpired = s.state === "applying" && !(s.lease && s.lease.expiresAt > now);
  if (!(s.state === "received" || s.state === "apply_stopped" || leaseExpired)) return no(s.state === "applying" ? "lease_held" : `state_${s.state}`);
  if (s.retryNotBefore && s.retryNotBefore > now) return no("cooldown");
  if (!msg.token || !/^[0-9A-F]{8}$/.test(String(msg.planHash || ""))) return no("bad_request");
  if (String(msg.grCode || "").toUpperCase() !== String(s.grCode || "").toUpperCase()) return no("gr_mismatch");
  const grants = await getGrants();
  const gk = grantKey(s.envId, s.grCode);
  const grant = grants[gk];
  if (!grant) return no("no_grant");
  delete grants[gk];
  await chrome.storage.local.set({ grants });
  await updateSession(
    msg.key,
    {
      state: "applying",
      applyToken: msg.token,
      lease: { token: msg.token, expiresAt: now + T.leaseMs },
      authorization: { grCode: s.grCode, planHash: msg.planHash, grantedAt: grant.createdAt, usedAt: now },
      applyError: null,
    },
    { type: "apply_claimed", planHash: msg.planHash, takeover: leaseExpired }
  );
  return { ok: true, leaseMs: T.leaseMs };
}

async function renewLease(key, token, sender) {
  const all = await getSessions();
  const s = all[key];
  const now = Date.now();
  if (s) requirePosTab(s, sender, "session:renewLease");
  if (!s || s.state !== "applying" || !s.lease || s.lease.token !== token || !(s.lease.expiresAt > now)) return false;
  s.lease = { token, expiresAt: now + T.leaseMs };
  all[key] = s;
  await chrome.storage.local.set({ sessions: all }); // không đổi updatedAt / log: gia hạn không phải thay đổi phiên
  return true;
}

async function finishApply(msg, sender) {
  const s = (await getSessions())[msg.key];
  if (s) requirePosTab(s, sender, "session:finishApply");
  if (!s || s.state !== "applying" || s.applyToken !== msg.token) return false;
  const ok = !!msg.ok;
  const patch = ok
    ? { state: "applied", applyToken: null, lease: null, applyResult: msg.result || null, applyError: null, retryNotBefore: null }
    : { state: "apply_stopped", applyToken: null, lease: null, applyError: msg.error || { reason: "unknown" }, retryNotBefore: msg.uncertain ? Date.now() + T.retryCooldownMs : null };
  await updateSession(msg.key, patch, ok ? { type: "applied" } : { type: "apply_stopped", reason: patch.applyError.reason, status: patch.applyError.status || null });
  return true;
}

// Nextwaves đã nhận đủ: chỉ nhận khi phiên đang nw_ready và đã ghi nhận lượt "Xác nhận nhận hàng" 2xx (PM P2.1).
async function received(key, payload, sender) {
  const cur = (await getSessions())[key];
  if (!cur) return null;
  requireOrigin(sender, E.envById(cur.envId).nwUiOrigin, "session:received");
  if (cur.state !== "nw_ready" || !cur.scanOk) throw new Error("Chưa có lượt xác nhận nhận hàng 2xx của phiên");
  const s = await updateSession(key, { state: "received", nwResult: payload }, { type: "nw_received", units: (payload.units || []).length });
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
      case "grant:create":
        return createGrant(msg, sender);
      case "grant:revoke":
        return revokeGrant(msg.key, sender);
      case "grant:list":
        return Object.values(await getGrants());
      case "grant:get":
        return (await getGrants())[grantKey(msg.envId, msg.grCode)] || null;
      case "session:get":
        return (await getSessions())[keyOf(msg.envId, msg.grId)] || null;
      case "session:start":
        return startSession(msg, sender);
      case "session:findByNw":
        return findByNw(msg.envId, msg.po);
      case "session:update":
        return contentUpdate(msg.key, msg.patch, msg.log);
      case "session:log":
        return updateSession(msg.key, null, msg.log);
      case "session:nwMatched":
        return nwMatched(msg, sender);
      case "session:scanOk": {
        const s = (await getSessions())[msg.key];
        if (!s || s.state !== "nw_ready") return null;
        requireOrigin(sender, E.envById(s.envId).nwUiOrigin, "session:scanOk");
        const scan = msg.scan || {};
        if (!Array.isArray(s.shipmentIds) || !s.shipmentIds.includes(String(scan.shipmentId || "").toLowerCase())) throw new Error("session:scanOk: phiếu gửi không thuộc đơn đã khớp");
        if (!(scan.httpStatus >= 200 && scan.httpStatus < 300)) throw new Error("session:scanOk: không phải lượt 2xx");
        return updateSession(msg.key, { scanOk: scan }, Object.assign({ type: "scan_ok" }, scan));
      }
      case "session:received":
        return received(msg.key, msg.payload, sender);
      case "session:writeBlockers": {
        const s = (await getSessions())[msg.key];
        return s ? writeBlockers(s) : ["no_session"];
      }
      case "session:claimApply":
        return claimApply(msg, sender);
      case "session:renewLease":
        return renewLease(msg.key, msg.token, sender);
      case "session:finishApply":
        return finishApply(msg, sender);
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
        const s = all[msg.key];
        if (s && s.state === "applying" && s.lease && s.lease.expiresAt > Date.now()) throw new Error("Phiên đang ghi — chờ xong mới huỷ");
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
