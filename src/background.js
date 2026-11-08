/*
 * Service worker: cấu hình + phiên nhận hàng + quyền ghi (lease) + mở / chuyển tab + mượn / trả đầu đọc. Không gọi API POS / Nextwaves,
 * không giữ token.
 *
 * Phiên (chrome.storage.local "sessions", khoá "<ENV>:<grId>") — v0.4.0 (SESSION_SCHEMA 2):
 *   waiting_nw → nw_ready → received → applying → applied → done
 *   waiting_nw → no_nw_order (Nextwaves chưa có đơn chờ nhận của SO) → waiting_nw khi "Tìm lại"
 *   applying → apply_stopped → applying (dược sĩ bấm "Đọc lại và điền tiếp")
 *   Chuyển trạng thái do content script báo về sau khi tự kiểm; background kiểm nguồn gửi + trạng thái.
 *
 * v0.4.0 (operator 06/11): mọi cửa hàng; sau "Xác nhận nhận hàng" trên Nextwaves, tab POS TỰ điền cả phiếu (không cấp phép); extension
 * KHÔNG BAO GIỜ gửi HOÀN THÀNH — dược sĩ kiểm danh sách rồi tự bấm. Bỏ cấp phép thủ công / quyền tự động / tự HOÀN THÀNH của v0.3.x.
 *
 * Ghi GR (giữ nguyên lõi v0.3.x):
 *  - Tab POS giành quyền bằng `claimApply` kèm mã GR + mã kế hoạch → lease (chủ = token của tab), gia hạn trước mỗi PUT.
 *  - Lease hết hạn (tab đóng / treo) mới cho tab khác giành; chỉ chủ lease kết thúc được lượt ghi (`finishApply`).
 *  - Kết quả không rõ (mất kết nối, 5xx) → chờ retryCooldownMs mới cho ghi lại.
 *
 * Bất biến phiên:
 *  - content script chỉ đổi được `state` (sang applied / done) qua session:update; mọi trường khác bị bỏ qua;
 *  - khoá ghi phía POS đặt lúc tạo phiên (session:start); khoá + dữ liệu đơn Nextwaves (gồm kho) đặt MỘT lần (session:nwMatched, từ
 *    trang Nextwaves đúng tenant của phiên, khi phiên đang waiting_nw); không message nào xoá / hạ khoá;
 *  - message ghi kiểm nguồn gửi: claim / renew / finish từ trang POS; nwMatched / noOrder / scanOk / routeScan / received từ trang Nextwaves
 *    đúng tenant của phiên.
 *
 * Đầu đọc (giao thức circa-reader/v1, docs/dev/SPEC-QSL-MUON-DAU-DOC-v1.md): tab POS tự mượn trước khi mở Nextwaves (pos-content) và
 * báo kết quả trong session:start / reopenNw; background trả đầu đọc (qua một tab POS) khi: Nextwaves đã nhận (sau khi đóng tab Nextwaves
 * của phiên), không có đơn, huỷ phiên, tab Nextwaves của phiên bị đóng.
 *
 * Nâng cấp giữ cùng extension ID: phiên mang `schema` = SESSION_SCHEMA; thứ khác schema là của bản cũ → xoá lúc onInstalled.
 */
importScripts("lib/env.js", "lib/keys.js");
const E = self.__CGN__.env;
const K = self.__CGN__.keys;
const T = Object.assign({ leaseMs: 90 * 1000, retryCooldownMs: 60 * 1000, readerTtlMs: 15 * 60 * 1000, readerRelayMs: 7000, nwCloseDelayMs: 500, readerReturnTries: 5, readerReturnGapMs: 2000, qslStatusMs: 1200, qslReleaseWaitMs: 7500 }, self.__CGN__.tuning || {});
// Lượt mượn đầu đọc còn hiệu lực (chưa trả / chưa bị QR Scan Log coi là lạ) → dùng lại leaseId để gia hạn; ngược lại lượt mới.
const LEASE_DONE = new Set(["returned", "return_failed", "unknown_lease"]);
const newLeaseId = () => "gr" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const DEFAULT_CONFIG = Object.freeze({ mode: "", url: "", nwTenant: "" });
const SESSION_SCHEMA = 2;
const isCurrent = (x) => !!x && x.schema === SESSION_SCHEMA;
const appVersion = () => (chrome.runtime.getManifest ? chrome.runtime.getManifest().version : "");
const ACTIVE = new Set(["waiting_nw", "no_nw_order", "nw_ready", "received", "applying", "applied", "apply_stopped"]);
const NW_OPEN = new Set(["waiting_nw", "nw_ready"]);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const LOG_MAX = 200;
// session:update từ content script CHỈ đổi được `state`, và chỉ sang các trạng thái này.
const UPDATE_STATES = new Set(["applied", "done"]);
// Khoá ghi phía Nextwaves mà tab khớp đơn được phép đặt.
const NW_LOCKS = new Set(["nw_many_orders", "warehouse_mismatch"]); // v0.4.1 (audit F3): kho đơn đã khớp ≠ kho của cửa hàng đã biết
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEASE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Mọi thao tác đọc-sửa-ghi storage chạy nối tiếp (hai tab gửi cùng lúc không ghi đè nhau).
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

const keyOf = (envId, grId) => `${envId}:${String(grId || "").toLowerCase()}`;
const envOf = (s) => (s ? E.envFor(s.envId, s.nwTenant) : null);

async function getConfig() {
  const { config } = await chrome.storage.local.get("config");
  const c = Object.assign({}, DEFAULT_CONFIG, config || {});
  return { mode: c.mode, url: c.url, nwTenant: E.normTenant(c.nwTenant) || "" };
}

async function setConfig(patch) {
  const cur = await getConfig();
  const p = patch || {};
  const next = { mode: "mode" in p ? p.mode : cur.mode, url: "url" in p ? p.url : cur.url, nwTenant: "nwTenant" in p ? String(p.nwTenant || "").trim().toLowerCase() : cur.nwTenant };
  if (next.mode && !E.envById(next.mode)) next.mode = "";
  if (next.url && !E.envFromAnyUrl(next.url)) throw new Error("URL không thuộc môi trường đã biết (STG / PRD)");
  if (next.nwTenant && !E.normTenant(next.nwTenant)) throw new Error("Tenant Nextwaves chỉ gồm chữ thường, số, gạch ngang (ví dụ circa, circa-medly)");
  // Review v0.4.0 P3-7: tenant của staging / tên "api-…" ở Production dựng origin sai môi trường → tab Nextwaves chờ mãi.
  const envSel = next.mode ? E.envById(next.mode) : next.url ? E.envFromAnyUrl(next.url) : null;
  if (next.nwTenant && envSel && !envSel.nwTenantFixed && E.withTenant(envSel, next.nwTenant).nwTenant !== E.normTenant(next.nwTenant)) {
    throw new Error(`Tenant Nextwaves "${next.nwTenant}" không dùng được cho ${envSel.label}`);
  }
  await chrome.storage.local.set({ config: next });
  return next;
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

// session:log từ content: bỏ mục trùng (cùng type + reason với mục cuối) — không ghi storage, không đánh thức các tab (A1).
async function contentLog(key, log) {
  const s = (await getSessions())[key];
  if (!s || !log || typeof log.type !== "string") return s || null;
  const last = (s.log || [])[(s.log || []).length - 1];
  if (last && last.type === log.type && (last.reason || null) === (log.reason || null) && /_failed$|_problem$|_partial$|_other_shipment$/.test(log.type)) return s;
  return updateSession(key, null, log);
}

const leaseLive = (s, now) => s.state === "applying" && !!s.lease && s.lease.expiresAt > (now || Date.now());

// session:update từ content script: chỉ trường `state` (các trường khác bị bỏ qua), chỉ sang applied / done.
async function contentUpdate(key, patch, logEvent) {
  const s = (await getSessions())[key];
  if (!s) return null;
  if (!patch || !("state" in patch)) return logEvent ? updateSession(key, null, logEvent) : s;
  const state = patch.state;
  if (!UPDATE_STATES.has(state)) throw new Error(`Không chuyển trạng thái ${state} qua session:update`);
  if (leaseLive(s) && state !== "done") throw new Error("Phiên đang ghi");
  // v0.4.0 (review lượt 2 P3-A): tab chết sau PUT cuối → applying hết lease được coi như apply_stopped.
  const stale = s.state === "applying" && !leaseLive(s);
  if (state === "applied" && !(["received", "apply_stopped"].includes(s.state) || stale)) throw new Error(`Không chuyển ${s.state} → applied`);
  const s2 = await updateSession(key, { state }, logEvent);
  // Review v0.4.0 P3-6: phiếu xong trên POS khi phiên còn ở bước Nextwaves → tab nhận hàng không còn việc: đóng rồi trả đầu đọc.
  if (state === "done" && (NW_OPEN.has(s.state) || s.state === "no_nw_order")) laterCloseNwAndReturn(s2, s.nwTabId, "gr_done");
  return s2;
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
const requireNwTab = (s, sender, what) => requireOrigin(sender, envOf(s).nwUiOrigin, what);
const requirePosTab = (s, sender, what) => requireOrigin(sender, envOf(s).posOrigin, what);

const isStr = (x) => typeof x === "string" && x.length > 0;
const isStrList = (x, min) => Array.isArray(x) && x.length >= (min || 0) && x.every(isStr);
const shortStr = (x, n) => (typeof x === "string" ? x.slice(0, n) : "");

// Tab Nextwaves báo đã khớp đúng một đơn (lib/resolve.js). Một lần cho mỗi phiên, chỉ từ trang Nextwaves đúng tenant của phiên,
// chỉ khi phiên đang chờ (waiting_nw). Kho của phiên = kho của đơn đã khớp (v0.4.0). Khoá ghi phía Nextwaves không đổi được về sau.
async function nwMatched(msg, sender) {
  const s = (await getSessions())[msg.key];
  if (!s) throw new Error("Không có phiên");
  requireNwTab(s, sender, "session:nwMatched");
  if (!isCurrent(s)) throw new Error("Phiên của bản cũ — mở lại phiếu trên POS");
  if (s.state !== "waiting_nw" || s.nwPoId) throw new Error("Phiên đã khớp đơn Nextwaves — không khớp lại / đổi được");
  const m = msg.match || {};
  const ok =
    isStr(m.nwPoId) &&
    isStr(m.nwPoNumber) &&
    isStr(m.nwOrderId) &&
    isStr(m.nwRefId) &&
    K.sameSo(m.nwRefId, s.soBase) &&
    isStr(m.warehouseId) &&
    UUID_RE.test(m.warehouseId) &&
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
      warehouseId: m.warehouseId.toLowerCase(),
      warehouseName: shortStr(m.warehouseName, 60),
      warehouseCode: shortStr(m.warehouseCode, 40),
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

// Nextwaves chưa có đơn chờ nhận của SO (tìm đọc đủ, không đơn nào cùng SO): phiếu nhận tay. Trả đầu đọc.
async function noOrder(msg, sender) {
  const s = (await getSessions())[msg.key];
  if (!s) return null;
  requireNwTab(s, sender, "session:noOrder");
  if (!isCurrent(s) || s.state !== "waiting_nw") return s;
  const r = msg.result || {};
  // v0.4.1: "nw_partial_received" = đơn của SO đã được nhận một phần trước đó (phiếu gửi đã dùng, Nextwaves không nhận tiếp được).
  const reason = r.reason === "nw_partial_received" ? "nw_partial_received" : "no_order";
  const s2 = await updateSession(msg.key, { state: "no_nw_order", noOrderAt: Date.now(), noOrderReason: reason }, { type: "nw_no_order", reason, total: Number.isFinite(r.total) ? r.total : null, read: Number.isFinite(r.read) ? r.read : null });
  // Không có đơn → màn quét Nextwaves không mở modal quét (không giữ cổng): trả đầu đọc ngay, tab vẫn mở cho dược sĩ đọc thông báo.
  laterReturnReader(s2, "no_order");
  return s2;
}

// "Tìm lại" trên tab Nextwaves: no_nw_order → waiting_nw, mượn lại đầu đọc (review v0.4.0 P2-3: lượt mượn cũ đã trả).
async function retryNw(key, sender) {
  const s = (await getSessions())[key];
  if (!s || s.state !== "no_nw_order") return s || null;
  if (sender && sender.tab) requireNwTab(s, sender, "session:retryNw");
  const s2 = await updateSession(key, { state: "waiting_nw" }, { type: "nw_retry" });
  laterLend(s2, "retry");
  return s2;
}

async function tabOrNull(tabId) {
  if (!Number.isInteger(tabId)) return null;
  try {
    return (await chrome.tabs.get(tabId)) || null;
  } catch (_) {
    return null;
  }
}
const tabUrl = (tab) => (tab && (tab.url || tab.pendingUrl)) || "";

async function openOrFocus(tabId, url) {
  const tab = await tabOrNull(tabId);
  if (tab) {
    try {
      await chrome.tabs.update(tabId, url ? { active: true, url } : { active: true });
      if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
      return tabId;
    } catch (_) {
      /* tab vừa đóng → mở mới */
    }
  }
  const t = await chrome.tabs.create({ url, active: true });
  return t.id;
}

// C1: một tab Nextwaves nhận hàng tại một thời điểm — tab nhận hàng còn mở là còn giữ cổng đầu đọc. Tái dùng tab nhận hàng (đúng
// tenant) mà extension đã mở cho một phiên khác; phiên đó mất tab (mở lại được từ POS).
async function openNwFor(all, s) {
  const env = envOf(s);
  const url = E.api.nwReceivePage(env, s.soBase);
  const own = await tabOrNull(s.nwTabId);
  if (own && E.classifyNwPage(tabUrl(own), env)) {
    const page = E.classifyNwPage(tabUrl(own), env);
    const same = K.soBase(page.po) === s.soBase;
    return { tabId: await openOrFocus(s.nwTabId, same ? null : url), reusedFrom: null };
  }
  for (const o of Object.values(all)) {
    if (o.key === s.key || !o.nwTabId) continue;
    const t = await tabOrNull(o.nwTabId);
    if (t && E.classifyNwPage(tabUrl(t), env)) {
      const id = await openOrFocus(o.nwTabId, url);
      return { tabId: id, reusedFrom: o.key };
    }
  }
  return { tabId: await openOrFocus(null, url), reusedFrom: null };
}

function readerFrom(msg) {
  const r = msg && msg.reader;
  if (!r || typeof r !== "object") return null;
  return {
    leaseId: LEASE_ID_RE.test(String(r.leaseId || "")) ? String(r.leaseId) : null,
    supported: r.supported === true,
    state: shortStr(r.state, 20) || null,
    reason: shortStr(r.reason, 30) || null,
    at: Date.now(),
  };
}

// v0.4.1 — phiếu phần còn lại (pos-model.remainderOf đạt ở tab POS): phiếu đã xong của PO + mã trên các phiếu đó. Sai dạng → null
// (phiên chạy như v0.4.0, khoá so_many_gr giữ nguyên).
const REMAINDER_UIDS_MAX = 5000;
function remainderFrom(msg) {
  const r = msg && msg.remainder;
  if (!r || typeof r !== "object" || !Array.isArray(r.completed) || !Array.isArray(r.excludeUids)) return null;
  if (!r.completed.length || r.completed.length > 20 || r.excludeUids.length > REMAINDER_UIDS_MAX) return null;
  if (!r.completed.every((g) => g && E.isUuid(g.id) && isStr(g.code) && g.code.length <= 20)) return null;
  if (!r.excludeUids.every((u) => isStr(u) && u.length <= 64)) return null;
  return { completed: r.completed.map((g) => ({ id: String(g.id).toLowerCase(), code: g.code })), excludeUids: [...new Set(r.excludeUids)] };
}

// v0.4.1 (audit F2): tóm tắt phiếu cho tab Nextwaves kiểm trước khi xác nhận. Chỉ để hiển thị — sai dạng → null (bỏ phần kiểm trước).
function grSummaryFrom(msg) {
  const a = msg && msg.grSummary;
  if (!Array.isArray(a) || !a.length || a.length > 300) return null;
  const num = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0;
  const out = [];
  for (const it of a) {
    if (!it || !/^\d{1,12}$/.test(String(it.productId)) || !num(it.baseQuantity) || !num(it.received) || !num(it.codes)) return null;
    const rates = {};
    for (const [k, v] of Object.entries(it.ratesByUnitName || {})) if (k.length <= 20 && num(v) && v > 0) rates[k] = v;
    out.push({ productId: String(it.productId), unitRate: num(it.unitRate) && it.unitRate > 0 ? it.unitRate : null, baseQuantity: it.baseQuantity, received: it.received, codes: it.codes, ratesByUnitName: rates });
  }
  return out;
}

async function startSession(msg, sender) {
  const base = E.envById(msg.envId);
  if (!base) throw new Error("env");
  const env = E.withTenant(base, msg.nwTenant);
  requireOrigin(sender, env.posOrigin, "session:start");
  if (!K.soBase(msg.soBase)) throw new Error("soBase");
  if (!E.isUuid(msg.posId)) throw new Error("store");
  if (!E.isUuid(msg.grId)) throw new Error("grId");
  // Đích quay về luôn là trang phiếu của đúng GR, do background dựng — không điều hướng theo URL từ trang.
  const returnUrl = E.api.posGrPage(env, String(msg.grId).toLowerCase());
  if (msg.returnUrl !== undefined && msg.returnUrl !== returnUrl) throw new Error("bad_return_url");
  const key = keyOf(env.id, msg.grId);
  const all = await getSessions();
  const cur = all[key];
  const reader = readerFrom(msg);
  if (cur && isCurrent(cur) && ACTIVE.has(cur.state) && cur.state !== "no_nw_order") {
    // Không mở thêm tab khi tải lại trang. Tab POS vừa mượn đầu đọc (leaseId mới) → giữ lượt mượn mới nhất để trả đúng.
    return reader && reader.leaseId ? updateSession(key, { reader }) : cur;
  }
  const remainder = remainderFrom(msg);
  const remainderNote = shortStr(msg.remainderNote, 40) || null;
  const grSummary = grSummaryFrom(msg);
  let s;
  if (cur && isCurrent(cur) && cur.state === "no_nw_order") {
    // Bấm lại phiếu "không có đơn": tìm lại trên Nextwaves (giữ phiên, giữ khoá).
    // Review v0.4.0 P3-5: dữ liệu vừa đọc lại ở POS (khoá ghi, vân tay, tab) thắng; khoá chỉ thêm, không bao giờ bớt — trừ một
    // trường hợp (v0.4.1): POS vừa chứng minh đây là phiếu phần còn lại (cộng sổ theo dòng PO đạt) → bỏ so_many_gr cũ.
    const keep = (cur.writeLocks || []).filter((l) => !(remainder && l === "so_many_gr"));
    const locks = [...new Set([].concat(keep, Array.isArray(msg.writeLocks) ? msg.writeLocks.map(String) : []))];
    s = Object.assign(cur, { state: "waiting_nw", updatedAt: Date.now(), reader: reader || cur.reader || null, writeLocks: locks, fingerprint: msg.fingerprint || cur.fingerprint || [], remainder, remainderNote, grSummary, posTabId: sender && sender.tab ? sender.tab.id : cur.posTabId });
    s.log = (s.log || []).concat([{ at: new Date().toISOString(), type: "nw_retry", writeLocks: locks, remainder: remainder ? remainder.completed.map((g) => g.code) : null }]).slice(-LOG_MAX);
  } else {
    const replaced = cur && !isCurrent(cur) ? { type: "replaced_outdated", oldState: cur.state, oldCreatedBy: cur.createdBy || null } : null;
    s = {
      schema: SESSION_SCHEMA,
      createdBy: appVersion(),
      key,
      envId: env.id,
      nwTenant: env.nwTenant,
      grId: String(msg.grId).toLowerCase(),
      grCode: msg.grCode,
      poPosId: msg.poPosId,
      poPosCode: msg.poPosCode,
      posId: String(msg.posId).toLowerCase(),
      posName: shortStr(msg.posName, 60),
      deliveryCode: msg.deliveryCode,
      soBase: K.soBase(msg.soBase),
      warehouseId: null, // v0.4.0: đặt từ đơn Nextwaves đã khớp (session:nwMatched)
      fingerprint: msg.fingerprint || [],
      writeLocks: Array.isArray(msg.writeLocks) ? msg.writeLocks.map(String) : [], // khoá ghi phía POS: đặt lúc tạo phiên, không đổi được
      nwWriteLocks: [], // khoá ghi phía Nextwaves: chỉ session:nwMatched đặt, một lần
      remainder, // v0.4.1: phiếu phần còn lại {completed[{id, code}], excludeUids[]} | null
      remainderNote, // v0.4.1: PO nhiều phiếu nhưng cộng sổ không đạt (lý do ngắn) — chỉ để hiển thị
      grSummary, // v0.4.1 (audit F2): tóm tắt phiếu để tab Nextwaves kiểm trước khi xác nhận
      returnUrl,
      posTabId: sender && sender.tab ? sender.tab.id : null,
      nwTabId: null,
      reader,
      state: "waiting_nw",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      log: [replaced, { type: "start", deliveryCode: msg.deliveryCode, writeLocks: msg.writeLocks || [], reader: reader ? reader.state : null, remainder: remainder ? { completed: remainder.completed.map((g) => g.code), excluded: remainder.excludeUids.length } : null, remainderNote }].filter(Boolean).map((l) => Object.assign({ at: new Date().toISOString() }, l)),
    };
  }
  all[key] = s;
  await saveSessions(all);
  const opened = await openNwFor(await getSessions(), s);
  if (opened.reusedFrom) await updateSession(opened.reusedFrom, { nwTabId: null }, { type: "nw_tab_reused", by: s.grCode });
  return updateSession(key, { nwTabId: opened.tabId });
}

// Trang Nextwaves ?po=<SO | số PO | id PO> → phiên đang mở tương ứng (đúng môi trường + tenant).
// SO tách giao có thể có nhiều phiên cùng SO → tab do extension mở cho phiên nào thì gắn ĐÚNG phiên đó; tab khác chỉ gắn khi có đúng MỘT.
async function findByNw(envId, tenant, po, sender) {
  const env = E.envFor(envId, tenant);
  if (!env) return null;
  const all = await getSessions();
  const p = String(po || "").trim();
  const base = K.soBase(p);
  const list = Object.values(all).filter(
    (s) =>
      isCurrent(s) &&
      s.envId === env.id &&
      s.nwTenant === env.nwTenant &&
      ACTIVE.has(s.state) &&
      ((base && s.soBase === base) || (s.nwPoId && s.nwPoId === p.toLowerCase()) || (s.nwPoNumber && s.nwPoNumber.toUpperCase() === p.toUpperCase()))
  );
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  const tabId = sender && sender.tab ? sender.tab.id : null;
  const own = tabId === null || tabId === undefined ? [] : list.filter((s) => s.nwTabId === tabId);
  if (own.length) return own[0];
  return list.length === 1 ? list[0] : null;
}

// Lý do không được ghi phiên này (rỗng = được).
function writeBlockers(s) {
  const env = E.envById(s.envId);
  const out = [];
  if (!isCurrent(s)) out.push("session_outdated");
  if (!env || !env.writeEnabled) out.push("env_read_only");
  if (!s.warehouseId) out.push("nw_not_matched");
  for (const l of [].concat(s.writeLocks || [], s.nwWriteLocks || [])) out.push(l);
  return out;
}

async function claimApply(msg, sender) {
  const s = (await getSessions())[msg.key];
  const now = Date.now();
  const no = (reason) => ({ ok: false, reason });
  if (!s) return no("no_session");
  requirePosTab(s, sender, "session:claimApply");
  const blockers = writeBlockers(s);
  if (blockers.length) return no(blockers[0]);
  const leaseExpired = s.state === "applying" && !leaseLive(s, now);
  if (!(s.state === "received" || s.state === "apply_stopped" || leaseExpired)) return no(s.state === "applying" ? "lease_held" : `state_${s.state}`);
  if (s.retryNotBefore && s.retryNotBefore > now) return no("cooldown");
  if (!msg.token || !/^[0-9A-F]{8}$/.test(String(msg.planHash || ""))) return no("bad_request");
  if (String(msg.grCode || "").toUpperCase() !== String(s.grCode || "").toUpperCase()) return no("gr_mismatch");
  const how = msg.how === "retry" ? "retry" : "auto";
  // Review v0.4.0 P3-4: tự điền (không ai bấm) chỉ cho lượt vừa nhận; sau khi đã dừng / tab chết thì phải có cú bấm "điền tiếp".
  if (how === "auto" && s.state !== "received") return no("auto_once");
  await updateSession(
    msg.key,
    { state: "applying", applyToken: msg.token, lease: { token: msg.token, expiresAt: now + T.leaseMs }, applyClaim: { how, planHash: msg.planHash, at: now }, applyError: null },
    { type: "apply_claimed", planHash: msg.planHash, how, takeover: leaseExpired }
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

// Lượt "Xác nhận nhận hàng" 2xx của đúng phiếu gửi thuộc đơn đã khớp.
async function scanOk(msg, sender) {
  const s = (await getSessions())[msg.key];
  if (!s) throw new Error("Không có phiên — Nextwaves đã nhận nhưng extension không còn phiên của phiếu này");
  requireNwTab(s, sender, "session:scanOk");
  if (!isCurrent(s)) throw new Error("Phiên của bản cũ — mở lại phiếu trên POS");
  if (s.state !== "nw_ready") return s.scanOk ? s : null;
  const scan = msg.scan || {};
  if (!Array.isArray(s.shipmentIds) || !s.shipmentIds.includes(String(scan.shipmentId || "").toLowerCase())) throw new Error("session:scanOk: phiếu gửi không thuộc đơn đã khớp");
  if (!(scan.httpStatus >= 200 && scan.httpStatus < 300)) throw new Error("session:scanOk: không phải lượt 2xx");
  const scanAt = Number.isFinite(scan.at) ? new Date(scan.at).toISOString() : null;
  return updateSession(msg.key, { scanOk: scan, scanOkAt: Date.now() }, { type: "scan_ok", shipmentId: scan.shipmentId, httpStatus: scan.httpStatus, sentEpcs: scan.sentEpcs === undefined ? null : scan.sentEpcs, scanAt });
}

// A7 (review lượt 2 P2-A): lượt 2xx ở một tab Nextwaves mà phiếu gửi KHÔNG thuộc phiên của tab đó (SO tách giao, tab tự mở, nhiều phiên
// cùng SO) → giao cho ĐÚNG MỘT phiên nw_ready cùng môi trường + tenant có phiếu gửi đó. Không có / nhiều → null (không đoán).
async function routeScan(msg, sender) {
  const env = E.envFor(msg.envId, msg.tenant);
  if (!env) return null;
  requireOrigin(sender, env.nwUiOrigin, "session:routeScan");
  const scan = msg.scan || {};
  const sid = String(scan.shipmentId || "").toLowerCase();
  if (!UUID_RE.test(sid) || !(scan.httpStatus >= 200 && scan.httpStatus < 300)) return null;
  const all = await getSessions();
  const hits = Object.values(all).filter((s) => isCurrent(s) && s.envId === env.id && s.nwTenant === env.nwTenant && s.state === "nw_ready" && Array.isArray(s.shipmentIds) && s.shipmentIds.includes(sid));
  if (hits.length !== 1) return null;
  const s = hits[0];
  if (s.scanOk) return s;
  const tabId = sender && sender.tab ? sender.tab.id : null;
  return updateSession(
    s.key,
    Object.assign({ scanOk: { shipmentId: sid, httpStatus: scan.httpStatus, sentEpcs: scan.sentEpcs === undefined ? null : scan.sentEpcs, at: Date.now() }, scanOkAt: Date.now() }, tabId !== null ? { nwTabId: tabId } : {}),
    { type: "scan_ok", shipmentId: sid, httpStatus: scan.httpStatus, routed: true }
  );
}

// Nextwaves đã nhận đủ: chỉ khi phiên nw_ready + đã ghi nhận lượt 2xx. Đưa dược sĩ về đúng trang phiếu POS (tab gốc nếu đang ở danh sách
// phiếu / đúng phiếu này; không thì tab mới — A3), đóng tab Nextwaves của phiên, trả đầu đọc. Tab POS tự điền khi thấy "received".
async function received(key, payload, sender) {
  const cur = (await getSessions())[key];
  if (!cur) throw new Error("Không có phiên — Nextwaves ĐÃ nhận nhưng POS CHƯA điền: nhận tay trên POS");
  requireNwTab(cur, sender, "session:received");
  if (!isCurrent(cur)) throw new Error("Phiên của bản cũ — mở lại phiếu trên POS");
  if (cur.state !== "nw_ready" || !cur.scanOk) throw new Error("Chưa có lượt xác nhận nhận hàng 2xx của phiên");
  const s = await updateSession(key, { state: "received", nwResult: payload, receivedAt: Date.now() }, { type: "nw_received", units: (payload.units || []).length });
  const env = envOf(s);
  let posTabId = null;
  const tab = await tabOrNull(s.posTabId);
  const page = tab ? E.classifyPosPage(tabUrl(tab), env) : null;
  if (page && (page.kind === "gr_list" || (page.kind === "gr" && page.grId === s.grId))) {
    try {
      posTabId = await openOrFocus(s.posTabId, page.kind === "gr" ? null : s.returnUrl);
    } catch (_) {
      posTabId = null;
    }
  }
  if (!posTabId) posTabId = await openOrFocus(null, s.returnUrl);
  const nwTabId = sender && sender.tab ? sender.tab.id : s.nwTabId;
  const s2 = await updateSession(key, { posTabId, nwTabId: null }, { type: "pos_focused", tabId: posTabId, reusedTab: posTabId === s.posTabId });
  laterCloseNwAndReturn(s2, nwTabId, "received");
  return s2;
}

async function focusPos(key) {
  const s = (await getSessions())[key];
  if (!s) return null;
  const env = envOf(s);
  const tab = await tabOrNull(s.posTabId);
  const page = tab ? E.classifyPosPage(tabUrl(tab), env) : null;
  const ok = page && (page.kind === "gr_list" || (page.kind === "gr" && page.grId === s.grId));
  const posTabId = await openOrFocus(ok ? s.posTabId : null, ok && page.kind === "gr" ? null : s.returnUrl);
  return updateSession(key, { posTabId });
}

// A5: mở lại tab Nextwaves của phiên — tab cũ không còn đúng trang nhận của SO → mở / tái dùng tab nhận hàng.
async function reopenNw(msg, sender) {
  let s = (await getSessions())[msg.key];
  if (!s) return null;
  if (sender && sender.tab) requirePosTab(s, sender, "session:reopenNw");
  // Review v0.4.0 P3-6: chỉ ở bước Nextwaves (đã nhận xong thì không mở lại màn quét / không giữ đầu đọc).
  if (!(NW_OPEN.has(s.state) || s.state === "no_nw_order")) throw new Error("Phiên không còn ở bước nhận trên Nextwaves");
  if (s.state === "no_nw_order") s = await updateSession(msg.key, { state: "waiting_nw" }, { type: "nw_retry" });
  const reader = readerFrom(msg);
  if (reader) s = await updateSession(msg.key, { reader });
  const opened = await openNwFor(await getSessions(), s);
  if (opened.reusedFrom) await updateSession(opened.reusedFrom, { nwTabId: null }, { type: "nw_tab_reused", by: s.grCode });
  return updateSession(msg.key, { nwTabId: opened.tabId });
}

async function cancelSession(key) {
  const all = await getSessions();
  const s = all[key];
  if (!s) return true;
  if (leaseLive(s)) throw new Error("Phiên đang ghi — chờ xong mới huỷ");
  delete all[key];
  await saveSessions(all);
  // Review v0.4.0 P2-3: màn quét có thể đang giữ cổng → đóng tab Nextwaves của phiên trước, rồi mới trả đầu đọc.
  laterCloseNwAndReturn(s, s.nwTabId, "cancel");
  return true;
}

// ---------- đầu đọc (circa-reader/v1, qua một tab POS) ----------

function sendToTab(tabId, msg, ms) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, ms);
    try {
      chrome.tabs.sendMessage(tabId, msg, (r) => {
        void chrome.runtime.lastError;
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(r || null);
      });
    } catch (_) {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

// Mọi tab POS có thể nói chuyện với QR Scan Log: tab của phiên trước, rồi các tab POS khác của môi trường.
async function posTabsFor(s) {
  const env = envOf(s);
  const out = [];
  const tab = await tabOrNull(s.posTabId);
  if (tab && senderOrigin({ tab }) === env.posOrigin.toLowerCase()) out.push(tab.id);
  try {
    for (const t of (await chrome.tabs.query({ url: env.posOrigin + "/*" })) || []) if (Number.isInteger(t.id) && !out.includes(t.id)) out.push(t.id);
  } catch (_) {
    /* không liệt kê được tab */
  }
  return out;
}

// Gửi lệnh đầu đọc qua một tab POS (pos-content relay → window.postMessage). Ngoài hàng đợi serial (mỗi lần chờ tối đa readerRelayMs).
// Tab vừa điều hướng / mới mở có thể chưa nạp xong (không có listener, QR Scan Log chưa trả lời ping) → thử tab khác.
async function readerRelay(s, cmd, leaseId) {
  if (!s || !leaseId) return null;
  let last = null;
  for (const tabId of await posTabsFor(s)) {
    const r = await sendToTab(tabId, { type: "cgn:reader", cmd, leaseId, ttlMs: T.readerTtlMs, label: s.grCode }, T.readerRelayMs);
    if (r && (r.ok || r.reason === "unknown_lease" || r.reason === "busy" || r.reason === "off_unknown")) return r;
    last = r || last;
  }
  return last;
}

// Ghi trạng thái đầu đọc CHỈ khi phiên còn đúng lượt mượn đó (review v0.4.0 P3-3: lượt cũ về muộn không đè lượt mới).
function setReader(key, leaseId, patch, log) {
  return serial(async () => {
    const s = (await getSessions())[key];
    if (!s || !s.reader || s.reader.leaseId !== leaseId) return s || null;
    return updateSession(key, { reader: Object.assign({}, s.reader, patch, { at: Date.now() }) }, log);
  }).catch(() => null);
}

// Trả đầu đọc, thử lại có giãn cách (review v0.4.0 P2-1: tab POS vừa điều hướng về phiếu / tab mới còn đang tải).
function laterReturnReader(s, why) {
  if (!s || !s.reader || !s.reader.leaseId || !s.reader.supported || LEASE_DONE.has(s.reader.state)) return;
  const key = s.key;
  const leaseId = s.reader.leaseId;
  setTimeout(async () => {
    let r = null;
    for (let i = 0; i < T.readerReturnTries; i++) {
      if (i > 0) await new Promise((res) => setTimeout(res, T.readerReturnGapMs));
      r = await readerRelay(s, "return", leaseId).catch(() => null);
      if (r && (r.ok || r.reason === "unknown_lease")) break;
    }
    const state = r && r.ok ? "returned" : r && r.reason === "unknown_lease" ? "unknown_lease" : "return_failed";
    await setReader(key, leaseId, { state }, { type: "reader_return", why, ok: !!(r && r.ok), state: (r && (r.state || r.reason)) || null });
  }, 0);
}

// Mượn (lại) đầu đọc qua tab POS: gia hạn cùng leaseId nếu lượt còn hiệu lực, không thì lượt mới.
function laterLend(s, why) {
  if (!s || !s.reader || !s.reader.supported) return;
  const key = s.key;
  const leaseId = s.reader.leaseId && !LEASE_DONE.has(s.reader.state) ? s.reader.leaseId : newLeaseId();
  setTimeout(async () => {
    const r = await readerRelay(s, "lend", leaseId).catch(() => null);
    await serial(async () => {
      const cur = (await getSessions())[key];
      if (!cur) return null;
      return updateSession(key, { reader: Object.assign({}, cur.reader || {}, { leaseId, supported: true, state: r ? (r.ok ? r.state || "lent" : r.reason || "error") : "no_answer", at: Date.now() }) }, { type: "reader_lend", why, ok: !!(r && r.ok) });
    }).catch(() => null);
  }, 0);
}

function laterCloseNwAndReturn(s, nwTabId, why) {
  if (!s) return;
  const env = envOf(s);
  setTimeout(async () => {
    const tab = await tabOrNull(nwTabId);
    if (tab && E.classifyNwPage(tabUrl(tab), env)) {
      try {
        await chrome.tabs.remove(nwTabId);
      } catch (_) {
        /* đã đóng */
      }
      await new Promise((r) => setTimeout(r, T.nwCloseDelayMs));
    }
    laterReturnReader(s, why || "received");
  }, 0);
}

// Tab Nextwaves ("Mượn lại đầu đọc" / gia hạn định kỳ / thử lại khi QR Scan Log bận) → mượn qua tab POS.
async function readerLendFromNw(msg, sender) {
  const s = (await getSessions())[msg.key];
  if (!s) return null;
  requireNwTab(s, sender, "reader:lend");
  if (!(NW_OPEN.has(s.state) || s.state === "no_nw_order")) return { ok: false, reason: "not_nw_step" };
  if (!s.reader || !s.reader.supported) return { ok: false, reason: "no_qsl" };
  const leaseId = s.reader.leaseId && !LEASE_DONE.has(s.reader.state) ? s.reader.leaseId : newLeaseId();
  const r = await readerRelay(s, "lend", leaseId);
  await serial(async () => {
    const cur = (await getSessions())[msg.key];
    if (!cur) return null;
    return updateSession(msg.key, { reader: Object.assign({}, cur.reader || {}, { leaseId, supported: true, state: r ? (r.ok ? r.state || "lent" : r.reason || "error") : "no_answer", at: Date.now() }) }, { type: "reader_lend", from: msg.why || "nw", ok: !!(r && r.ok) });
  });
  return r || { ok: false, reason: "no_answer" };
}

// ---------- vòng đời ----------
// Nâng cấp / cài lại giữ cùng extension ID: xoá phiên của bản cũ + dữ liệu cấp phép / tự động của v0.3.x (không còn dùng).
async function dropOutdated(details) {
  const all = await getSessions();
  const removed = [];
  for (const k of Object.keys(all)) {
    if (!isCurrent(all[k])) {
      removed.push({ key: k, state: all[k].state });
      delete all[k];
    }
  }
  const lastUpgrade = { at: new Date().toISOString(), reason: details.reason, from: details.previousVersion || null, to: appVersion(), removedSessions: removed };
  await chrome.storage.local.set({ sessions: all, lastUpgrade });
  await chrome.storage.local.remove(["grants", "autoGrants"]);
  return lastUpgrade;
}

if (chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details && (details.reason === "update" || details.reason === "install")) serial(() => dropOutdated(details));
  });
}

// Tab Nextwaves của phiên bị đóng (dược sĩ đóng / extension tái dùng tab sang phiên khác) → cổng đã trống: trả đầu đọc nếu phiên còn
// ở bước Nextwaves; phiên mất tab (mở lại từ POS được).
async function onTabRemoved(tabId) {
  const all = await getSessions();
  for (const s of Object.values(all)) {
    if (s.nwTabId !== tabId) continue;
    const s2 = await updateSession(s.key, { nwTabId: null }, { type: "nw_tab_closed" });
    if (s2 && (NW_OPEN.has(s2.state) || s2.state === "no_nw_order")) laterReturnReader(s2, "nw_tab_closed");
  }
}
if (chrome.tabs && chrome.tabs.onRemoved) chrome.tabs.onRemoved.addListener((tabId) => serial(() => onTabRemoved(tabId)));

// Lệnh chạy NGOÀI hàng đợi serial (chờ tab khác trả lời, không giữ hàng đợi).
// ---------- v0.4.1: đầu đọc bị QR Scan Log giữ (bấm hộ Ngắt — operator 08/11) ----------
// Tab Nextwaves (màn quét của phiên, hoặc modal nhận hàng mở thẳng từ trang PO — có thể không có phiên) hỏi trạng thái QR Scan Log ở các
// tab POS của môi trường, và CHỈ khi dược sĩ bấm "Lấy đầu đọc cho Nextwaves" mới nhờ đúng MỘT tab đang giữ đầu đọc bấm "Ngắt kết nối".
// Chỉ nhận từ trang Nextwaves đúng tenant đang chọn. Không gửi gì cho QR Scan Log ngoài cú bấm đó (pos-content làm, sau khi tự kiểm).
async function nwEnvOfSender(sender, what) {
  const env = E.envFromConfig(await getConfig());
  if (!env) throw new Error(`${what}: chưa chọn môi trường`);
  requireOrigin(sender, env.nwUiOrigin, what);
  return env;
}

async function qslStatusAll(env) {
  let tabs = [];
  try {
    tabs = (await chrome.tabs.query({ url: env.posOrigin + "/*" })) || [];
  } catch (_) {
    tabs = [];
  }
  const out = [];
  for (const t of tabs) {
    if (!Number.isInteger(t.id)) continue;
    const r = await sendToTab(t.id, { type: "cgn:qsl-status" }, T.qslStatusMs);
    if (r && r.ok && r.present) out.push({ tabId: t.id, displayed: !!r.displayed, connection: shortStr(r.connection, 20), state: shortStr(r.state, 20), holding: !!r.holding, busy: !!r.busy, canRelease: !!r.canRelease });
  }
  return out;
}

async function readerQslStatus(msg, sender) {
  const env = await nwEnvOfSender(sender, "reader:qslStatus");
  const all = await qslStatusAll(env);
  const holders = all.filter((x) => x.holding);
  return { present: all.length, holders: holders.length, busy: holders.some((x) => x.busy), canRelease: holders.length === 1 && holders[0].canRelease };
}

async function readerTakeFromQsl(msg, sender) {
  const env = await nwEnvOfSender(sender, "reader:takeFromQsl");
  // Phiên (nếu tab có phiên): chỉ để ghi nhật ký + nhắc "Kết nối RFID lại" trên khung POS sau lượt.
  let key = null;
  if (msg && typeof msg.key === "string") {
    const s = (await getSessions())[msg.key];
    if (s && isCurrent(s) && envOf(s).nwUiOrigin.toLowerCase() === env.nwUiOrigin.toLowerCase()) key = s.key;
  }
  const done = async (r) => {
    if (key) await serial(() => updateSession(key, r.ok ? { readerTakenAt: Date.now() } : null, { type: "reader_qsl_release", ok: !!r.ok, reason: r.reason || null })).catch(() => {});
    return r;
  };
  const holders = (await qslStatusAll(env)).filter((x) => x.holding);
  if (holders.length !== 1) return done({ ok: false, reason: holders.length ? "many_holders" : "no_holder", holders: holders.length });
  if (holders[0].busy) return done({ ok: false, reason: "busy" });
  const r = await sendToTab(holders[0].tabId, { type: "cgn:qsl-release" }, T.qslReleaseWaitMs);
  return done(r ? { ok: !!r.ok, reason: r.ok ? null : shortStr(r.reason, 30) || "error", released: !!r.released } : { ok: false, reason: "no_answer" });
}

// "Mở tab bán hàng": tab đang giữ đầu đọc (đúng một) → tab có khung QR Scan Log đang hiện → tab /ban-hang bất kỳ.
async function readerFocusSale(msg, sender) {
  const env = await nwEnvOfSender(sender, "reader:focusSale");
  const all = await qslStatusAll(env);
  const holders = all.filter((x) => x.holding);
  let tabId = holders.length === 1 ? holders[0].tabId : (all.find((x) => x.displayed) || {}).tabId;
  if (!Number.isInteger(tabId)) {
    try {
      const t = ((await chrome.tabs.query({ url: env.posOrigin + "/ban-hang/*" })) || [])[0];
      tabId = t ? t.id : null;
    } catch (_) {
      tabId = null;
    }
  }
  if (!Number.isInteger(tabId)) return { ok: false, reason: "no_sale_tab" };
  await openOrFocus(tabId, null);
  return { ok: true };
}

const OUTSIDE = { "reader:lend": readerLendFromNw, "reader:qslStatus": readerQslStatus, "reader:takeFromQsl": readerTakeFromQsl, "reader:focusSale": readerFocusSale };

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const type = msg && msg.type;
  const run = OUTSIDE[type] ? OUTSIDE[type](msg, sender) : serial(() => handle(msg, sender));
  Promise.resolve(run).then(
    (data) => reply({ ok: true, data }),
    (err) => reply({ ok: false, error: String((err && err.message) || err) })
  );
  return true;
});

async function handle(msg, sender) {
  switch (msg && msg.type) {
    case "config:get":
      return getConfig();
    case "config:set":
      if (sender && sender.tab) throw new Error("Chỉ đổi cấu hình từ popup extension");
      return setConfig(msg.patch);
    case "session:get": {
      const s = (await getSessions())[keyOf(msg.envId, msg.grId)];
      return isCurrent(s) ? s : null; // phiên bản cũ coi như không có → trang POS mở phiên mới
    }
    case "session:start":
      return startSession(msg, sender);
    case "session:findByNw":
      return findByNw(msg.envId, msg.tenant, msg.po, sender);
    case "session:update":
      return contentUpdate(msg.key, msg.patch, msg.log);
    case "session:log":
      return contentLog(msg.key, msg.log);
    case "session:nwMatched":
      return nwMatched(msg, sender);
    case "session:noOrder":
      return noOrder(msg, sender);
    case "session:retryNw":
      return retryNw(msg.key, sender);
    case "session:scanOk":
      return scanOk(msg, sender);
    case "session:routeScan":
      return routeScan(msg, sender);
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
    case "session:reopenNw":
      return reopenNw(msg, sender);
    case "session:cancel":
      return cancelSession(msg.key);
    case "session:list":
      return Object.values(await getSessions()).sort((a, b) => b.updatedAt - a.updatedAt);
    default:
      throw new Error("unknown message");
  }
}
