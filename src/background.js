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
 * Chế độ tự động (v0.3.0, PM DECISION-ONE-STG-AUTO-FLOW-20261028, mặc định TẮT):
 *  - popup cấp "quyền tự động một lần" (autoGrants) cho đúng một phiên nw_ready (GR / cửa hàng / SO / PO / kho / EPC dự kiến, 30 phút);
 *  - received() là điểm kích hoạt duy nhất (autoRun, giao cho một tab POS); claim tự động tiêu quyền; tự điền như W1;
 *  - đọc lại toàn phiếu khớp → claimComplete (auto_completing, đặt TRƯỚC khi gửi) → tab gửi HOÀN THÀNH một lần → done / auto_complete_unknown;
 *  - không bao giờ tự chạy lại (apply_stopped, chưa rõ, tải lại sau claim).
 *
 * Bất biến phiên (PM audit v0.1.1 P1.7):
 *  - content script chỉ đổi được `state` (sang applied / done) qua session:update; mọi trường khác bị bỏ qua;
 *  - khoá ghi phía POS đặt lúc tạo phiên (session:start, từ trang POS); khoá + dữ liệu đơn Nextwaves đặt MỘT lần (session:nwMatched,
 *    từ trang Nextwaves, khi phiên đang waiting_nw); không message nào xoá / hạ khoá;
 *  - message ghi kiểm nguồn gửi: claim / renew / finish từ trang POS, nwMatched / scanOk / received từ trang Nextwaves của môi trường.
 *
 * Nâng cấp giữ cùng extension ID (PM audit v0.1.2 P2.4):
 *  - phiên và cấp phép mang `schema` = SESSION_SCHEMA. Thứ không có / khác schema là của bản cũ (trước v0.1.3), có thể thiếu khoá
 *    P1.6 / P1.7 → không bao giờ được ghi (`session_outdated`), không được tìm lại (session:get / findByNw), không nhận khớp đơn /
 *    lượt nhận; mở lại phiếu thì session:start thay bằng phiên mới (kiểm lại đủ khoá);
 *  - onInstalled (update / install): xoá mọi phiên và cấp phép của bản cũ, ghi `lastUpgrade`.
 */
importScripts("lib/env.js", "lib/keys.js");
const E = self.__CGN__.env;
const K = self.__CGN__.keys;
// autoTtlMs: hạn quyền tự động (PM §2.1). completeStaleMs: phiên kẹt auto_completing quá lâu (tab chủ chết giữa lúc gửi) mới cho
// GET thấy COMPLETED đóng phiên.
const T = Object.assign({ grantTtlMs: 30 * 60 * 1000, leaseMs: 90 * 1000, retryCooldownMs: 60 * 1000, autoTtlMs: 30 * 60 * 1000, completeStaleMs: 2 * 60 * 1000 }, self.__CGN__.tuning || {});

const DEFAULT_CONFIG = Object.freeze({ mode: "", url: "" });
// Tăng khi cấu trúc / bất biến của phiên đổi; phiên của schema khác bị coi là bản cũ (P2.4).
const SESSION_SCHEMA = 1;
const isCurrent = (x) => !!x && x.schema === SESSION_SCHEMA;
const appVersion = () => (chrome.runtime.getManifest ? chrome.runtime.getManifest().version : "");
const ACTIVE = new Set(["waiting_nw", "nw_ready", "received", "applying", "applied", "apply_stopped", "auto_completing", "auto_complete_unknown"]);
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
  for (const k of Object.keys(all)) if (!(all[k].expiresAt > now) || !isCurrent(all[k])) delete all[k];
  return all;
}

// Chỉ ra ký tự làm mã cấp phép bị từ chối (operator 25/10: ô hiện "GR03878" mà vẫn bị từ chối). Luật kiểm giữ nguyên.
function grCodeHint(code) {
  if (!code) return " — ô đang trống";
  if (!code.startsWith("GR")) return " — phải bắt đầu bằng GR";
  for (let i = 2; i < code.length; i++) {
    const ch = code[i];
    if (/\d/.test(ch)) continue;
    const pos = i + 1;
    if (ch === "O") return ` — có chữ O (không phải số 0) ở vị trí ${pos}`;
    if (/\s/.test(ch)) return ` — có khoảng trắng ở vị trí ${pos}`;
    if (/[​-‏⁠﻿­]/.test(ch) || ch.charCodeAt(0) < 32) return ` — có ký tự ẩn ở vị trí ${pos} (thường do dán), hãy gõ tay`;
    return ` — có ký tự "${ch}" ở vị trí ${pos}`;
  }
  return " — thiếu phần số sau GR";
}

async function createGrant(msg, sender) {
  if (sender && sender.tab) throw new Error("Chỉ cấp phép từ popup extension");
  const env = E.envById(msg.envId);
  if (!env) throw new Error("Môi trường không hợp lệ");
  if (!env.writeEnabled) throw new Error(`${env.label}: chỉ đọc, chưa qua gate ghi`);
  const grCode = String(msg.grCode || "").trim().toUpperCase();
  if (!/^GR\d+$/.test(grCode)) throw new Error("Mã phiếu nhận phải dạng GR + số, ví dụ GR03878" + grCodeHint(grCode));
  const all = await getGrants();
  const now = Date.now();
  all[grantKey(env.id, grCode)] = { schema: SESSION_SCHEMA, envId: env.id, grCode, createdAt: now, expiresAt: now + T.grantTtlMs };
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

// ---------- quyền tự động một lần (v0.3.0, PM DECISION-ONE-STG-AUTO-FLOW §2.1) ----------
// Tách khỏi cấp phép thủ công (`grants`). Khoá = khoá phiên. Gắn với đúng phiên (cả giờ tạo phiên), GR, cửa hàng, SO, PO Nextwaves,
// kho và tập EPC dự kiến; hết hạn sau autoTtlMs. Chỉ popup tạo / thu hồi; mọi trường lấy từ phiên, không nhận từ trang.
async function getAutoGrants() {
  const { autoGrants } = await chrome.storage.local.get("autoGrants");
  const all = autoGrants || {};
  const now = Date.now();
  for (const k of Object.keys(all)) if (!(all[k].expiresAt > now) || !isCurrent(all[k])) delete all[k];
  return all;
}

const epcSetOf = (list) => [...new Set((list || []).map((e) => String(e || "").toUpperCase()).filter(Boolean))].sort();
const expectedEpcList = (s) => ((s.expected && s.expected.shipments) || []).flatMap((sh) => (sh.lines || []).flatMap((l) => (l.units || []).map((u) => u.epc)));

// Quyền còn hiệu lực cho ĐÚNG phiên này: đổi / tạo lại phiên, đổi đơn / cửa hàng / kho, hết hạn → vô hiệu.
function autoGrantFits(g, s) {
  return (
    !!g &&
    !!s &&
    isCurrent(g) &&
    g.expiresAt > Date.now() &&
    g.key === s.key &&
    g.sessionCreatedAt === s.createdAt &&
    g.envId === s.envId &&
    g.grId === s.grId &&
    g.posId === s.posId &&
    g.soBase === s.soBase &&
    g.nwPoId === s.nwPoId &&
    g.warehouseId === s.warehouseId
  );
}

async function armAuto(msg, sender) {
  if (sender && sender.tab) throw new Error("Chỉ cho phép tự động từ popup extension");
  const s = (await getSessions())[msg.key];
  if (!s) throw new Error("Không có phiên");
  const env = E.envById(s.envId);
  if (!isCurrent(s)) throw new Error("Phiên của bản cũ — mở lại phiếu trên POS");
  if (!env || !env.writeEnabled) throw new Error(`${env ? env.label : s.envId}: chỉ đọc, không cho phép tự động`);
  if (s.state !== "nw_ready") throw new Error("Chỉ cho phép khi phiên đã khớp đơn Nextwaves và CHƯA xác nhận nhận hàng");
  if (!E.storeAllowed(env, s.posId)) throw new Error("Cửa hàng không thuộc danh sách chạy thử");
  const blockers = writeBlockers(s);
  if (blockers.length) throw new Error(`Phiên đang bị khoá điền: ${blockers.join(", ")}`);
  const raw = expectedEpcList(s);
  const epcs = epcSetOf(raw);
  if (!s.nwPoId || !s.nwPoNumber || !epcs.length) throw new Error("Phiên thiếu dữ liệu đơn Nextwaves / tem dự kiến");
  if (epcs.length !== raw.length) throw new Error("Phiếu gửi Nextwaves có tem trùng — không cho phép tự động");
  const c = msg.confirm || {};
  if (c.grCode !== s.grCode || c.nwPoNumber !== s.nwPoNumber || c.epcCount !== epcs.length) throw new Error("Thông tin xác nhận không khớp phiên hiện tại — mở lại popup");
  const all = await getAutoGrants();
  const now = Date.now();
  const g = {
    schema: SESSION_SCHEMA,
    key: s.key,
    sessionCreatedAt: s.createdAt,
    envId: s.envId,
    posId: s.posId,
    posName: s.posName || "",
    grId: s.grId,
    grCode: s.grCode,
    soBase: s.soBase,
    deliveryCode: s.deliveryCode,
    nwPoId: s.nwPoId,
    nwPoNumber: s.nwPoNumber,
    warehouseId: s.warehouseId,
    epcs,
    createdAt: now,
    expiresAt: now + T.autoTtlMs,
  };
  all[s.key] = g;
  await chrome.storage.local.set({ autoGrants: all });
  await updateSession(s.key, null, { type: "auto_armed", grCode: s.grCode, epcs: epcs.length, expiresAt: new Date(g.expiresAt).toISOString() });
  return g;
}

async function revokeAuto(key, sender) {
  if (sender && sender.tab) throw new Error("Chỉ thu hồi từ popup extension");
  const all = await getAutoGrants();
  const had = !!all[key];
  delete all[key];
  await chrome.storage.local.set({ autoGrants: all });
  if (had) await updateSession(key, null, { type: "auto_revoked" });
  return true;
}

// Tab POS hỏi: có được TỰ chạy phiên này không (chưa tiêu quyền — claim tự động mới tiêu).
async function autoStatus(key, sender) {
  const s = (await getSessions())[key];
  if (!s) return { eligible: false, reason: "no_session" };
  requirePosTab(s, sender, "auto:status");
  const g = (await getAutoGrants())[s.key];
  if (!s.autoRun) return { eligible: false, reason: g ? "not_triggered" : "not_armed" };
  if (s.autoRun.skipped) return { eligible: false, reason: "skipped" };
  if (!autoGrantFits(g, s)) return { eligible: false, reason: "grant_invalid" };
  if (s.state !== "received" || s.authorization) return { eligible: false, reason: `state_${s.state}` };
  if (!sender || !sender.tab || sender.tab.id !== s.autoRun.tabId) return { eligible: false, reason: "other_tab" };
  return { eligible: true, expiresAt: g.expiresAt };
}

// Tab POS được giao báo lượt tự động KHÔNG chạy (kế hoạch / phiếu / trang không đạt). Quyết định cuối cho lượt nhận này: không tự
// chạy lại ở lần đánh giá sau (F5, cấp phép thủ công, chỗ gắn có lại) — phiếu đi đường thủ công. Quyền chưa tiêu, tự hết hạn.
async function skipAuto(msg, sender) {
  const s = (await getSessions())[msg.key];
  if (!s) return null;
  requirePosTab(s, sender, "auto:skip");
  if (!s.autoRun || s.autoRun.skipped || !sender.tab || sender.tab.id !== s.autoRun.tabId) return s;
  const reason = String(msg.reason || "unknown").slice(0, 60);
  return updateSession(msg.key, { autoRun: Object.assign({}, s.autoRun, { skipped: { at: Date.now(), reason } }) }, { type: "auto_skipped", reason });
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
  // v0.3.0 (§2.3): hook / tab khác không đánh dấu done sớm cho phiên đang tự HOÀN THÀNH — chỉ tab chủ (autoCompleteResult) kết thúc,
  // trừ khi tab chủ đã chết quá completeStaleMs và GET thấy COMPLETED.
  if (s.state === "auto_completing" && !(state === "done" && s.completeClaim && Date.now() - s.completeClaim.at > T.completeStaleMs)) throw new Error("Phiên đang tự HOÀN THÀNH");
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
  if (!isCurrent(s)) throw new Error("Phiên của bản cũ — mở lại phiếu trên POS");
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
  if (!E.isUuid(msg.grId)) throw new Error("grId");
  // Đích quay về luôn là trang phiếu của đúng GR, do background dựng (PM rev 1 S4) — không điều hướng theo URL từ trang.
  const returnUrl = E.api.posGrPage(env, String(msg.grId).toLowerCase());
  if (msg.returnUrl !== undefined && msg.returnUrl !== returnUrl) throw new Error("bad_return_url");
  const key = keyOf(env.id, msg.grId);
  const all = await getSessions();
  const cur = all[key];
  if (cur && ACTIVE.has(cur.state) && isCurrent(cur)) return cur; // không mở thêm tab khi tải lại trang
  const replaced = cur && !isCurrent(cur) ? { type: "replaced_outdated", oldState: cur.state, oldCreatedBy: cur.createdBy || null } : null;
  const s = {
    schema: SESSION_SCHEMA,
    createdBy: appVersion(),
    key,
    envId: env.id,
    grId: String(msg.grId).toLowerCase(),
    grCode: msg.grCode,
    poPosId: msg.poPosId,
    poPosCode: msg.poPosCode,
    posId: String(msg.posId).toLowerCase(),
    posName: typeof msg.posName === "string" ? msg.posName.slice(0, 60) : "",
    deliveryCode: msg.deliveryCode,
    soBase: K.soBase(msg.soBase),
    warehouseId: msg.warehouseId || null,
    fingerprint: msg.fingerprint || [],
    writeLocks: Array.isArray(msg.writeLocks) ? msg.writeLocks.map(String) : [], // khoá ghi phía POS: đặt lúc tạo phiên, không đổi được
    nwWriteLocks: [], // khoá ghi phía Nextwaves: chỉ session:nwMatched đặt, một lần
    returnUrl,
    posTabId: sender && sender.tab ? sender.tab.id : null,
    nwTabId: null,
    state: "waiting_nw",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    log: [replaced, { type: "start", deliveryCode: msg.deliveryCode, writeLocks: msg.writeLocks || [] }].filter(Boolean).map((l) => Object.assign({ at: new Date().toISOString() }, l)),
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
      isCurrent(s) &&
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
  if (!isCurrent(s)) out.push("session_outdated");
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
  if (msg.auto === true) {
    // v0.3.0 (§2.2): chỉ lượt đầu sau đúng điểm kích hoạt (autoRun), đúng tab POS được giao, quyền tự động còn hiệu lực, kế hoạch
    // phủ ĐÚNG tập UID Nextwaves. Không bao giờ tự chạy lại sau apply_stopped / đã có authorization. Tiêu quyền tại đây (một lần).
    if (s.state !== "received" || s.authorization) return no("auto_state");
    if (!s.autoRun || s.autoRun.skipped || !sender || !sender.tab || sender.tab.id !== s.autoRun.tabId) return no("auto_tab");
    const ag = await getAutoGrants();
    const g = ag[s.key];
    if (!autoGrantFits(g, s)) return no("auto_grant");
    const want = [...new Set(((s.nwResult && s.nwResult.units) || []).map((u) => u.uid))].sort();
    const rawUids = Array.isArray(msg.uids) ? msg.uids.map(String) : [];
    const got = [...new Set(rawUids)].sort();
    if (!want.length || got.length !== rawUids.length || want.length !== got.length || want.some((u, i) => u !== got[i])) return no("auto_uids");
    delete ag[s.key];
    await chrome.storage.local.set({ autoGrants: ag });
    await updateSession(
      msg.key,
      {
        state: "applying",
        applyToken: msg.token,
        autoToken: msg.token,
        lease: { token: msg.token, expiresAt: now + T.leaseMs },
        authorization: { auto: true, grCode: s.grCode, planHash: msg.planHash, grantedAt: g.createdAt, usedAt: now },
        applyError: null,
      },
      { type: "auto_claimed", planHash: msg.planHash, uids: got.length }
    );
    return { ok: true, leaseMs: T.leaseMs };
  }
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

// ---------- tự HOÀN THÀNH (v0.3.0, PM DECISION-ONE-STG-AUTO-FLOW §2.3) ----------
// Tab đã tự điền xong (applied) và đọc lại toàn phiếu khớp kế hoạch → giành quyền gửi HOÀN THÀNH MỘT lần. Dấu "đã gửi hoặc chưa rõ"
// (auto_completing) đặt TRƯỚC khi tab gọi POS; tab khác / lần gọi lại không bao giờ nhận lại quyền này.
async function claimComplete(msg, sender) {
  const s = (await getSessions())[msg.key];
  const no = (reason) => ({ ok: false, reason });
  if (!s) return no("no_session");
  requirePosTab(s, sender, "session:claimComplete");
  const blockers = writeBlockers(s);
  if (blockers.length) return no(blockers[0]);
  if (s.state !== "applied") return no(`state_${s.state}`);
  const a = s.authorization || {};
  if (!a.auto || a.planHash !== msg.planHash || !s.applyResult || s.applyResult.hash !== msg.planHash) return no("not_auto");
  if (!msg.token || s.autoToken !== msg.token) return no("token");
  if (s.completeClaim) return no("already_claimed");
  await updateSession(msg.key, { state: "auto_completing", completeClaim: { at: Date.now(), planHash: msg.planHash } }, { type: "auto_complete_claimed", planHash: msg.planHash });
  return { ok: true };
}

// Kết quả của lượt gửi HOÀN THÀNH: chỉ tab chủ (autoToken) báo. done chỉ khi GET sau đó thấy COMPLETED đúng phiếu; còn lại là "chưa
// rõ" — dừng, không gửi lại.
async function autoCompleteResult(msg, sender) {
  const s = (await getSessions())[msg.key];
  if (!s) return null;
  requirePosTab(s, sender, "session:autoCompleteResult");
  if (s.state !== "auto_completing" || !msg.token || s.autoToken !== msg.token) throw new Error("Không phải lượt HOÀN THÀNH của tab này");
  const r = msg.result || {};
  const info = { httpStatus: Number.isFinite(r.httpStatus) ? r.httpStatus : null, grStatus: r.grStatus ? String(r.grStatus).slice(0, 40) : null };
  if (r.done === true) {
    const source = r.source === "khong_chac" ? "khong_chac" : "auto";
    return updateSession(msg.key, { state: "done", completeResult: Object.assign({ at: Date.now(), source }, info) }, Object.assign({ type: "auto_completed", source }, info));
  }
  return updateSession(msg.key, { state: "auto_complete_unknown", completeResult: Object.assign({ at: Date.now() }, info) }, Object.assign({ type: "auto_complete_unknown" }, info));
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

// Nhật ký phiên có auto_armed mà sau đó không bị thu hồi.
function armedEarlier(s) {
  const types = (s.log || []).map((l) => l.type).filter((t) => t === "auto_armed" || t === "auto_revoked");
  return types[types.length - 1] === "auto_armed";
}

// Nextwaves đã nhận đủ: chỉ nhận khi phiên đang nw_ready và đã ghi nhận lượt "Xác nhận nhận hàng" 2xx (PM P2.1).
async function received(key, payload, sender) {
  const cur = (await getSessions())[key];
  if (!cur) return null;
  requireOrigin(sender, E.envById(cur.envId).nwUiOrigin, "session:received");
  if (!isCurrent(cur)) throw new Error("Phiên của bản cũ — mở lại phiếu trên POS");
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
  // v0.3.0 (PM §2.2): điểm kích hoạt tự động DUY NHẤT — đúng lúc phiên chuyển nw_ready → received của chính lượt 2xx. Quyền phải còn
  // hiệu lực cho đúng phiên; tập EPC nhận được = đúng tập đã cấp quyền; đúng MỘT biên nhận mới. Giao cho đúng một tab POS.
  const patch = { posTabId };
  let log = null;
  const g = (await getAutoGrants())[key];
  if (g) {
    const units = (payload && payload.units) || [];
    const got = epcSetOf(units.map((u) => u.epc));
    const before = cur.receiptIdsBefore || [];
    const fresh = [...new Set(((payload && payload.receiptIds) || []).filter((id) => !before.includes(id)))];
    let reason = null;
    if (!autoGrantFits(g, s)) reason = "grant_invalid";
    else if (got.length !== units.length || got.length !== g.epcs.length || got.some((e, i) => e !== g.epcs[i])) reason = "epc_set";
    else if (fresh.length !== 1) reason = "receipts";
    if (reason) log = { type: "auto_skipped", reason };
    else {
      patch.autoRun = { at: Date.now(), tabId: posTabId };
      log = { type: "auto_ready", tabId: posTabId, epcs: got.length };
    }
  } else if (armedEarlier(s)) {
    log = { type: "auto_skipped", reason: "grant_expired" }; // đã cho phép nhưng hết hạn / bị thu hồi trước lượt nhận → thủ công
  }
  return updateSession(key, patch, log);
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

// Nâng cấp / cài lại giữ cùng extension ID (P2.4): xoá phiên + cấp phép của bản cũ.
async function dropOutdated(details) {
  const all = await getSessions();
  const removed = [];
  for (const k of Object.keys(all)) {
    if (!isCurrent(all[k])) {
      removed.push({ key: k, state: all[k].state });
      delete all[k];
    }
  }
  const { grants } = await chrome.storage.local.get("grants");
  const kept = {};
  for (const [k, g] of Object.entries(grants || {})) if (isCurrent(g)) kept[k] = g;
  const { autoGrants } = await chrome.storage.local.get("autoGrants");
  const keptAuto = {};
  for (const [k, g] of Object.entries(autoGrants || {})) if (isCurrent(g)) keptAuto[k] = g;
  const lastUpgrade = { at: new Date().toISOString(), reason: details.reason, from: details.previousVersion || null, to: appVersion(), removedSessions: removed, removedGrants: Object.keys(grants || {}).length - Object.keys(kept).length + Object.keys(autoGrants || {}).length - Object.keys(keptAuto).length };
  await chrome.storage.local.set({ sessions: all, grants: kept, autoGrants: keptAuto, lastUpgrade });
  return lastUpgrade;
}

if (chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details && (details.reason === "update" || details.reason === "install")) serial(() => dropOutdated(details));
  });
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
      case "auto:arm":
        return armAuto(msg, sender);
      case "auto:revoke":
        return revokeAuto(msg.key, sender);
      case "auto:list":
        return Object.values(await getAutoGrants());
      case "auto:status":
        return autoStatus(msg.key, sender);
      case "auto:skip":
        return skipAuto(msg, sender);
      case "grant:get":
        return (await getGrants())[grantKey(msg.envId, msg.grCode)] || null;
      case "session:get": {
        const s = (await getSessions())[keyOf(msg.envId, msg.grId)];
        return isCurrent(s) ? s : null; // phiên bản cũ coi như không có → trang POS mở phiên mới
      }
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
        if (!isCurrent(s)) throw new Error("Phiên của bản cũ — mở lại phiếu trên POS");
        const scan = msg.scan || {};
        if (!Array.isArray(s.shipmentIds) || !s.shipmentIds.includes(String(scan.shipmentId || "").toLowerCase())) throw new Error("session:scanOk: phiếu gửi không thuộc đơn đã khớp");
        if (!(scan.httpStatus >= 200 && scan.httpStatus < 300)) throw new Error("session:scanOk: không phải lượt 2xx");
        // Nhật ký: `at` của mục log luôn là giờ ISO lúc ghi; giờ của lượt nhận ghi riêng `scanAt` (PM P3 26/10: `scan.at` dạng số từng đè `at`).
        const scanAt = Number.isFinite(scan.at) ? new Date(scan.at).toISOString() : null;
        return updateSession(msg.key, { scanOk: scan }, { type: "scan_ok", shipmentId: scan.shipmentId, httpStatus: scan.httpStatus, sentEpcs: scan.sentEpcs === undefined ? null : scan.sentEpcs, scanAt });
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
      case "session:claimComplete":
        return claimComplete(msg, sender);
      case "session:autoCompleteResult":
        return autoCompleteResult(msg, sender);
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
        if (s && s.state === "auto_completing" && !(s.completeClaim && Date.now() - s.completeClaim.at > T.completeStaleMs)) throw new Error("Phiên đang tự HOÀN THÀNH — chờ xong mới huỷ");
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
