/*
 * Trang POS (ISOLATED world) — bộ điều khiển duy nhất. Ba lối vào (v0.2, PM duyệt hướng 26/10):
 *   (1) danh sách phiếu nhận /danh-sach-phieu-nhan-hang — nút "Nhận hàng bằng RFID" trên từng dòng (DOM do pos/gr-list.js lo);
 *   (2) trang phiếu /danh-sach-phieu-nhan-hang/<grId>;
 *   (3) "Nhập SO thuocsi" → /chi-tiet-so/<SO>.
 * CHỈ TẠO PHIÊN KHI DƯỢC SĨ BẤM (bỏ tự chạy khi mở phiếu). Phiên đã có thì mở phiếu vẫn tự đọc trạng thái và đi tiếp.
 * Bấm → đọc lại GR + PO, kiểm trạng thái / cửa hàng / mã giao SO / duy nhất SO–GR → background mở màn quét Nextwaves
 * (/vi/purchases/receive?po=<SO>). Dữ liệu dòng danh sách chỉ dùng để hiện nút, không bao giờ ghi thẳng vào phiên (Spec v0.2 S1).
 * Cú bấm gắn với dòng + lượt danh sách + bộ lọc + route: kiểm lại sau mỗi `await` và ngay trước `session:start`, sai thì huỷ (R2).
 * Khi phiên sang "received" (tab Nextwaves đã đọc xong kết quả nhận): tab POS về trang phiếu (background), tra QR từng UID → kế hoạch.
 * v0.4.0 (operator 06/11): mọi cửa hàng; kế hoạch sạch → TỰ điền cả phiếu (không cấp phép), một lần mỗi lượt nhận ở tab này; dừng giữa
 * chừng → nút "Đọc lại và điền tiếp". Extension KHÔNG BAO GIỜ gửi HOÀN THÀNH: dược sĩ kiểm danh sách rồi tự bấm; extension chỉ nghe
 * lời gọi đổi trạng thái để đóng phiên.
 * Đầu đọc (circa-reader/v1): trước khi mở Nextwaves, tab này mượn đầu đọc của QR Scan Log (ping → lend); background nhờ tab POS trả.
 * Header xác thực chỉ lấy từ hook (chính app POS gửi), giữ trong bộ nhớ tab, không ghi ra storage.
 */
(function () {
  "use strict";
  if (window.__CGN_POS_CONTENT__) return;
  window.__CGN_POS_CONTENT__ = true;

  const C = globalThis.__CGN__;
  const E = C.env;
  const K = C.keys;
  const P = C.pos;
  const PL = C.plan;
  const A = C.apply;
  const L = C.grList;
  const T = Object.assign({ pollMs: 3000, qrConcurrency: 4, reloadDelayMs: 800, httpTimeoutMs: 30000, leaseRenewMs: 15000, qrTtlMs: 10 * 60 * 1000, listSessionsDebounceMs: 300, autoAnchorWaitMs: 8000, readerPingMs: 300, readerLendMs: 5500, readerTtlMs: 15 * 60 * 1000, qslPollMs: 200, qslReleaseMs: 5000 }, C.tuning || {});
  const HOOK = "cgn/pos-hook";
  const ME = "cgn/pos-content";
  // Khung nổi: trang /chi-tiet-so và báo lỗi giao diện khi trang phiếu không có chỗ gắn khung. Không che nút thao tác của phiếu
  // (operator 26/10: che HOÀN THÀNH).
  const floatPanel = C.ui.createPanel("GR ← Nextwaves", { avoidButtons: /^(hoàn thành|hủy|huỷ|hủy phiếu|huỷ phiếu)$/iu });
  // v0.2.4 (PM P2): trên trang phiếu, khung nằm TRONG LUỒNG trang ngay trước "Danh sách sản phẩm nhập kho" (#all-receipt) của đúng
  // phiếu đang xem — không nổi, không che cột "SL nhận" / HỦY / HOÀN THÀNH. Không có chỗ gắn → báo lỗi giao diện, W1 đóng.
  const grPanel = C.ui.createInlinePanel("GR ← Nextwaves", { find: grAnchor, onMissing: onGrUiMissing, onFound: onGrUiFound });
  const tabToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const lower = (s) => String(s || "").toLowerCase();
  const ACTIVE = new Set(["waiting_nw", "no_nw_order", "nw_ready", "received", "applying", "applied", "apply_stopped"]);
  const START_LABEL = "Nhận hàng bằng RFID";
  const LIST_CHANGED = "Danh sách đã đổi — bấm lại";

  const LINK_MSG = {
    gr_unreadable: "Không đọc được phiếu nhận",
    po_unreadable: "Không đọc được PO của phiếu nhận",
    po_mismatch: "PO đọc được không phải PO của phiếu nhận",
    gr_not_in_po: "Phiếu nhận không nằm trong PO",
    store_missing: "Thiếu thông tin cửa hàng trên phiếu nhận / PO",
    store_mismatch: "Phiếu nhận / PO thuộc cửa hàng khác cửa hàng đang đăng nhập",
    many_delivery_codes: "PO có nhiều mã giao thuocsi — chưa hỗ trợ",
    delivery_code_format: "Mã giao thuocsi không đúng dạng",
    sale_order_number_mismatch: "Mã giao thuocsi không khớp số SO của PO",
  };
  const APPLY_MSG = {
    read_failed: "Không đọc lại được phiếu nhận trước khi ghi",
    gr_not_receivable: "Phiếu không còn ở trạng thái chờ nhận / đang nhận",
    detail_missing: "Không còn chi tiết lô cần ghi trên phiếu",
    gr_changed: "Phiếu vừa bị thay đổi (quét tay hoặc tab khác) — dừng để không ghi đè",
    lease_lost: "Mất quyền ghi (tab khác đã tiếp quản hoặc quyền hết hạn) — dừng",
    put_failed: "POS từ chối ghi",
    unknown: "Mất kết nối / hết giờ khi ghi — chưa rõ POS đã lưu chưa. Phải chờ rồi đọc lại phiếu, lập kế hoạch mới",
    put_uncertain: "POS báo lỗi máy chủ (5xx) khi ghi — chưa rõ đã lưu chưa. Chờ rồi đọc lại phiếu, lập kế hoạch mới",
    verify_read_failed: "Ghi xong nhưng không đọc lại được phiếu để kiểm",
    verify_failed: "Đọc lại phiếu không thấy đúng số lượng / mã vừa ghi",
    plan_not_ok: "Kế hoạch có chặn",
  };
  const CLAIM_MSG = {
    env_read_only: "Môi trường này chỉ đọc",
    nw_not_matched: "Phiên chưa khớp đơn Nextwaves",
    so_many_gr: "SO có nhiều phiếu nhận trên cùng PO — chưa chứng minh được đúng lần giao",
    so_gr_unknown: "Không kiểm được đủ / rõ danh sách phiếu nhận của SO",
    nw_many_orders: "Nextwaves có nhiều đơn cùng SO — chưa chứng minh được đúng lần giao",
    warehouse_mismatch: "Đơn Nextwaves đã khớp nằm ở kho khác kho của cửa hàng đang đăng nhập — không điền (nhận tay, báo vận hành)",
    lease_held: "Tab khác đang điền phiếu này",
    cooldown: "Lần ghi trước có kết quả chưa rõ — chờ thêm rồi thử lại",
    session_outdated: "Phiên tạo bởi bản extension cũ — mở lại phiếu để tạo phiên mới",
    gr_mismatch: "Phiên không đúng phiếu",
    no_session: "Không còn phiên của phiếu này",
    auto_once: "Lượt tự điền đã chạy — bấm “Đọc lại và điền tiếp” để điền phần còn lại",
  };
  const SO_CHECK_MSG = {
    search_unreadable: "Kết quả tìm phiếu nhận theo SO không đúng dạng (thiếu goods_receipts / total / page / limit)",
    search_paging: "Kết quả tìm phiếu nhận theo SO có trang / giới hạn không hợp lệ",
    search_incomplete: "Danh sách phiếu nhận của SO chưa đọc đủ (nhiều trang hoặc total lệch)",
    row_incomplete: "Một phiếu nhận trong kết quả thiếu id / trạng thái / cửa hàng",
    row_other_store: "Kết quả có phiếu nhận của cửa hàng khác",
  };
  const STATE_LABEL = {
    waiting_nw: "Chờ nhận hàng trên Nextwaves",
    no_nw_order: "Nextwaves chưa có đơn chờ nhận — nhận tay",
    nw_ready: "Đã khớp đơn Nextwaves — chờ nhận hàng",
    received: "Nextwaves đã nhận — chờ điền phiếu",
    applying: "Đang điền phiếu",
    applied: "Đã điền phiếu — chờ HOÀN THÀNH",
    apply_stopped: "Điền phiếu bị dừng",
    done: "Đã HOÀN THÀNH",
  };

  let config = null;
  // envId → {headers, confirmed}. `confirmed` = bộ header có x-store-id (Spec v0.2 S3). Chỉ trong bộ nhớ tab.
  const authByEnv = {};
  let lastHref = "";
  let running = false;
  let again = false;
  let applying = false;
  let reloading = false;
  // Phiên của trang đang mở: đổi trạng thái / dữ liệu nhận / cấp phép của đúng phiếu này thì đánh giá lại (S6).
  let watched = { key: null, sig: null, envId: null, grCode: null };
  let chosenGrId = null; // đường (3): GR dược sĩ chọn khi SO có nhiều GR
  let click = null; // cú bấm đang chuẩn bị phiên (một lúc chỉ một)
  let clickSeq = 0;

  // ---- trạng thái trang danh sách ----
  const list = { envId: null, latestReqSeq: 0, shownSeq: 0, shownQueryKey: null, ok: false, rows: new Map() };
  let onList = false;
  let listCtx = null; // {env, storeId}
  let listSessions = new Map(); // grId → phiên đang hoạt động
  let listNote = null; // thông báo của cú bấm gần nhất trên danh sách
  const notLinkable = new Set(); // grId đã biết không đi từ SO thuocsi (nhớ trong tab)
  let listSessionsTimer = null;

  // ---- khung trang phiếu (v0.2.4) ----
  let uiMissing = null; // "missing" | "unstable": trang phiếu không gắn được khung → lỗi giao diện ở khung nổi, W1 đóng

  // ---- tự điền: một lần mỗi lượt nhận ở tab này (khoá phiên + giờ nhận) ----
  const autoTried = new Set();

  // ---- tra QR: một lần mỗi phiên + lượt nhận (S6) ----
  const qrCache = new Map(); // `${scope}|${uid}` → {at, r}
  let qrForce = false;

  // ---------- tiện ích ----------
  async function bg(type, extra) {
    const r = await chrome.runtime.sendMessage(Object.assign({ type }, extra || {}));
    if (!r || !r.ok) throw new Error((r && r.error) || "background");
    return r.data;
  }
  const logTo = (key, log) => bg("session:log", { key, log }).catch(() => {});

  // Lỗi mạng / hết giờ / bị huỷ → NÉM (người gọi quyết: đọc thì báo lỗi, PUT thì "kết quả không rõ").
  async function http(url, opts) {
    const o = opts || {};
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), T.httpTimeoutMs) : null;
    if (ac && o.signal) {
      if (o.signal.aborted) ac.abort();
      else o.signal.addEventListener("abort", () => ac.abort(), { once: true });
    }
    try {
      const res = await fetch(url, { method: o.method || "GET", headers: o.headers || {}, body: o.body, cache: "no-store", signal: ac ? ac.signal : undefined });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (_) {
        json = null;
      }
      return { ok: res.ok, status: res.status, json };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ---------- đầu đọc: circa-reader/v1 với QR Scan Log (docs/dev/SPEC-QSL-MUON-DAU-DOC-v1.md) ----------
  const RNS = "circa-reader/v1";
  const readerWait = new Map(); // reqId → {resolve, timer}
  const rid = () => "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.ns !== RNS || m.from !== "qsl" || typeof m.reqId !== "string") return;
    const w = readerWait.get(m.reqId);
    if (!w) return;
    readerWait.delete(m.reqId);
    clearTimeout(w.timer);
    w.resolve(m);
  });
  function readerAsk(msg, ms) {
    return new Promise((resolve) => {
      const reqId = rid();
      const timer = setTimeout(() => {
        readerWait.delete(reqId);
        resolve(null);
      }, ms);
      readerWait.set(reqId, { resolve, timer });
      try {
        window.postMessage(Object.assign({ ns: RNS, from: "gr-nextwaves", reqId }, msg), location.origin);
      } catch (_) {
        readerWait.delete(reqId);
        clearTimeout(timer);
        resolve(null);
      }
    });
  }
  // Lượt mượn còn hiệu lực → gia hạn cùng leaseId; đã trả / hỏng → lượt mới (review v0.4.0 P3-3: lệnh trả muộn của lượt cũ không huỷ lượt mới).
  const reuseLease = (r) => (r && r.leaseId && !["returned", "return_failed", "unknown_lease"].includes(r.state) ? r.leaseId : null);
  // Lượt mượn không gắn được vào phiên (cú bấm bị huỷ / tạo phiên lỗi) → trả ngay (review v0.4.0 P3-1).
  function readerGiveBack(reader) {
    if (!reader || !reader.supported || !reader.leaseId || !["released", "free", "lent"].includes(reader.state)) return;
    readerAsk({ type: "return", leaseId: reader.leaseId }, T.readerLendMs).catch(() => {});
  }
  // Mượn (hoặc gia hạn, cùng leaseId) đầu đọc trước khi mở Nextwaves. QR Scan Log không trả lời ping → bản chưa hỗ trợ: đi tiếp, khung
  // Nextwaves hướng dẫn bấm Ngắt RFID ở tab bán hàng.
  async function readerLend(label, leaseId) {
    const pong = await readerAsk({ type: "ping" }, T.readerPingMs);
    if (!pong) return { supported: false, leaseId: null, state: "no_qsl" };
    const id = leaseId || "gr" + rid();
    const r = await readerAsk({ type: "lend", leaseId: id, ttlMs: T.readerTtlMs, label: String(label || "").slice(0, 40) }, T.readerLendMs);
    return { supported: true, leaseId: id, state: r ? (r.ok ? String(r.state || "lent") : String(r.reason || "error")) : "no_answer" };
  }
  // Background nhờ tab này trả / mượn lại đầu đọc (tab POS là nơi duy nhất nói chuyện được với QR Scan Log).
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || msg.type !== "cgn:reader" || !sender || sender.id !== chrome.runtime.id || sender.tab) return undefined;
    (async () => {
      const pong = await readerAsk({ type: "ping" }, T.readerPingMs);
      if (!pong) return { ok: false, reason: "no_qsl" };
      if (msg.cmd === "return") return (await readerAsk({ type: "return", leaseId: msg.leaseId }, T.readerLendMs)) || { ok: false, reason: "no_answer" };
      if (msg.cmd === "lend") return (await readerAsk({ type: "lend", leaseId: msg.leaseId, ttlMs: msg.ttlMs || T.readerTtlMs, label: String(msg.label || "").slice(0, 40) }, T.readerLendMs)) || { ok: false, reason: "no_answer" };
      return { ok: false, reason: "bad_request" };
    })().then(reply, () => reply({ ok: false, reason: "error" }));
    return true;
  });

  // v0.4.1 — đầu đọc bị QR Scan Log giữ (operator 08/11: bấm hộ "Ngắt kết nối" của QR Scan Log, CHỈ khi dược sĩ bấm "Lấy đầu đọc cho
  // Nextwaves" trên tab Nextwaves). Background hỏi trạng thái (chỉ đọc) rồi nhờ đúng MỘT tab bấm. QR Scan Log đang gửi tem vào giỏ
  // (data-state = processing) → không bấm (Ngắt của QR Scan Log 0.9.6 huỷ lượt đang gửi). Bấm xong chờ QR Scan Log nhả Web Lock (cổng
  // đã đóng) rồi mới trả lời — tab Nextwaves kết nối ngay sau đó.
  // Web Lock của QR Scan Log đang bị giữ (theo origin — mọi tab POS cùng thấy)? true / false; không đọc được → null.
  async function qslLockHeld() {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    try {
      if (nav && nav.locks && typeof nav.locks.query === "function") {
        const q = await nav.locks.query();
        return ((q && q.held) || []).some((l) => l && l.name === P.QSL_LOCK);
      }
    } catch (_) {
      /* không đọc được khoá */
    }
    return null;
  }
  async function qslLockFree() {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    try {
      if (nav && nav.locks && typeof nav.locks.query === "function") {
        const q = await nav.locks.query();
        return !((q && q.held) || []).some((l) => l && l.name === P.QSL_LOCK);
      }
    } catch (_) {
      /* không đọc được khoá → dựa vào trạng thái khung QR Scan Log */
    }
    return !P.qslView(document).holding;
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || (msg.type !== "cgn:qsl-status" && msg.type !== "cgn:qsl-release") || !sender || sender.id !== chrome.runtime.id || sender.tab) return undefined;
    if (msg.type === "cgn:qsl-status") {
      const v = P.qslView(document);
      const base = { ok: true, present: v.present, displayed: v.displayed, connection: v.connection, state: v.state, holding: v.holding, hiddenHolding: v.hiddenHolding, busy: v.busy, canRelease: !!v.button };
      if (!v.hiddenHolding) {
        reply(Object.assign(base, { lockHeld: null }));
        return undefined;
      }
      // Khung ẩn ở trạng thái giữ: kèm Web Lock để background biết tab này còn giữ cổng thật (review v0.4.1 P2-1).
      qslLockHeld().then((held) => reply(Object.assign(base, { lockHeld: held })), () => reply(Object.assign(base, { lockHeld: null })));
      return true;
    }
    (async () => {
      const v = P.qslView(document);
      // Tab có khung ẩn (đã rời trang Bán hàng) chỉ được bấm khi background chọn nó là tab giữ VÀ Web Lock vẫn đang bị giữ.
      const hiddenOk = msg.hidden === true && v.hiddenHolding && (await qslLockHeld()) === true;
      if (!v.holding && !hiddenOk) return { ok: false, reason: "not_holding" };
      if (v.busy) return { ok: false, reason: "busy" };
      if (!v.button) return { ok: false, reason: "no_button" };
      try {
        v.button.click();
      } catch (_) {
        return { ok: false, reason: "click_failed" };
      }
      const t0 = Date.now();
      for (;;) {
        await new Promise((r) => setTimeout(r, T.qslPollMs));
        if (await qslLockFree()) return { ok: true, released: true, ms: Date.now() - t0 };
        if (Date.now() - t0 >= T.qslReleaseMs) return { ok: false, reason: "lock_timeout", clicked: true };
      }
    })().then(reply, () => reply({ ok: false, reason: "error" }));
    return true;
  });

  function apiHeaders(env, withBody) {
    const a = authByEnv[env.id];
    const h = Object.assign({}, (a && a.headers) || {});
    if (withBody) h["content-type"] = "application/json";
    return h;
  }
  const posGet = (env, url, signal) => http(url, { headers: apiHeaders(env, false), signal });
  const posPut = (env, url, body) => http(url, { method: "PUT", headers: apiHeaders(env, true), body: JSON.stringify(body) });

  function httpError(what, r) {
    const msg = r && r.json && (r.json.message || r.json.error) ? ` — ${String(r.json.message || r.json.error).slice(0, 200)}` : "";
    const hint = r && r.status === 401 ? " Phiên đăng nhập POS có thể đã hết hạn: tải lại trang." : "";
    return `${what}: HTTP ${r ? r.status : "?"}${msg}.${hint}`;
  }

  function pageNow() {
    const env = E.envFromConfig(config);
    return env ? E.classifyPosPage(location.href, env) : null;
  }

  // Chỗ gắn khung trang phiếu: #all-receipt (bảng đầu tiên của trang là bảng THÔNG TIN phiếu, không dùng). Có `code` thì thẻ thông
  // tin phải hiện đúng một mã GR = `code`, breadcrumb không được mang mã khác (pos-model.grPageAnchor — PM audit rev 1 P1).
  function grAnchor(code) {
    return P.grPageAnchor(document, code);
  }

  function retryUi() {
    uiMissing = null;
    floatPanel.hide();
    grPanel.hide();
    refresh();
  }

  function onGrUiMissing(reason) {
    uiMissing = reason;
    if (watched.key) logTo(watched.key, { type: "ui_anchor_missing", reason });
    if (applying) {
      floatPanel.show({ tone: "busy", title: "Đang điền phiếu — không gắn được khung vào trang", lines: ["Không tải lại / rời trang tới khi điền xong."] });
      return;
    }
    floatPanel.show({
      tone: "err",
      title: "Giao diện phiếu nhận đã đổi — extension không điền phiếu này",
      lines: [
        reason === "unstable" ? "Trang liên tục vẽ lại vùng “Danh sách sản phẩm nhập kho”, không gắn được khung." : "Không thấy vùng “Danh sách sản phẩm nhập kho” của đúng phiếu này.",
        "Extension đã dừng, không ghi gì vào phiếu. Bấm “Kiểm tra lại” hoặc tải lại trang; vẫn lỗi thì báo dev.",
      ],
      buttons: [{ label: "Kiểm tra lại", onClick: retryUi }],
    });
  }

  function onGrUiFound() {
    uiMissing = null;
    floatPanel.hide();
    refresh();
  }

  // URL lúc bắt đầu lượt đánh giá (evaluate) gần nhất. View đến khi trang đã khác URL đó = kết quả của lượt cũ về muộn sau khi đổi
  // route (SPA) → bỏ (PM audit sơ bộ v0.2.4 P2).
  let evalHref = null;
  // v0.2.5 (PM AUDIT-A1 P2): tăng khi phiếu đang xem vừa HOÀN THÀNH (hook báo 2xx). Lượt đánh giá bắt đầu trước đó (GET cũ về muộn,
  // phiếu còn "đang nhận") không được vẽ nữa.
  let statusEpoch = 0;
  let evalEpoch = 0;
  const fresh = () => (evalHref === null || location.href === evalHref) && evalEpoch === statusEpoch;

  // Một chỗ vẽ: trang phiếu → khung trong luồng (view mang grCode thì chỉ gắn cạnh bảng của đúng phiếu đó); /chi-tiet-so → khung
  // nổi. Danh sách dùng vùng thông báo của chính nó (F4), trang không liên quan không có khung → không vẽ gì.
  const panel = {
    show(view) {
      if (!fresh()) return;
      const page = pageNow();
      if (!page || page.kind === "gr_list") return;
      if (page.kind !== "gr") {
        grPanel.hide();
        return floatPanel.show(view);
      }
      if (!uiMissing) floatPanel.hide();
      grPanel.show(view, view.grCode || null);
    },
    hide() {
      uiMissing = null;
      floatPanel.hide();
      grPanel.hide();
    },
  };
  // Trang /chi-tiet-so đang xem: URL + các phiếu nhận của SO đó (đọc ở lượt evaluateSo của CHÍNH URL này).
  let soPage = null; // {href, grIds:Set}
  // View của một phiếu chỉ vẽ trên trang của chính phiếu đó, hoặc trên /chi-tiet-so của đúng SO chứa phiếu đó. Ngược lại (lượt đánh
  // giá cũ về muộn, tiến trình ghi của phiếu A khi đã sang trang phiếu / SO khác — PM audit rev 1 P2) → bỏ, không vẽ.
  const showGr = (gr, view) => {
    const page = pageNow();
    const id = String(gr.id).toLowerCase();
    if (!page) return;
    if (page.kind === "gr" && page.grId !== id) return;
    if (page.kind === "so" && !(soPage && soPage.href === location.href && soPage.grIds.has(id))) return;
    return panel.show(Object.assign({}, view, { grCode: gr.code }));
  };

  function showError(title, lines, buttons, gr) {
    const v = { tone: "err", title, lines: [].concat(lines || []), buttons: buttons || [] };
    return gr ? showGr(gr, v) : panel.show(v);
  }

  const sessionSig = (s) => JSON.stringify([s.state, (s.nwResult && s.nwResult.at) || null, s.applyError || null, !!s.scanOk, s.retryNotBefore || null, s.readerTakenAt || null]);
  const unwatch = () => (watched = { key: null, sig: null, envId: null, grCode: null });

  // ---------- header cửa hàng (Spec v0.2 S3) ----------
  // Có x-store-id → bộ mới, đã xác nhận. Thiếu x-store-id: giữ bộ đã xác nhận nếu cùng authorization + x-client-id;
  // khác token / client → bộ chưa xác nhận: mọi lượt chuẩn bị dừng tới khi POS gửi lại request đủ header.
  function onAuth(envId, headers) {
    const cur = authByEnv[envId] || null;
    const before = cur ? `${cur.confirmed}|${lower(cur.headers["x-store-id"])}|${cur.headers.authorization}` : "";
    if (headers["x-store-id"]) authByEnv[envId] = { headers, confirmed: true };
    else if (cur && cur.confirmed && cur.headers.authorization === headers.authorization && (cur.headers["x-client-id"] || "") === (headers["x-client-id"] || "")) return false;
    else authByEnv[envId] = { headers, confirmed: false };
    const a = authByEnv[envId];
    const after = `${a.confirmed}|${lower(a.headers["x-store-id"])}|${a.headers.authorization}`;
    if (before && after !== before) cancelClick("Phiên đăng nhập / cửa hàng POS vừa đổi — bấm lại");
    return !cur || after !== before;
  }

  function currentStore(env) {
    const a = authByEnv[env.id];
    return a && a.confirmed ? lower(a.headers["x-store-id"]) : "";
  }

  // ---------- cú bấm (Spec v0.2 S4 / rev 2 R2) ----------
  const CANCELLED = new Error("cancelled");

  function newClick(fields) {
    clickSeq += 1;
    click = Object.assign({ nonce: clickSeq, route: location.href, ac: typeof AbortController === "function" ? new AbortController() : null, cancelled: false, reason: null }, fields);
    return click;
  }

  function cancelClick(reason) {
    if (!click || click.cancelled) return;
    click.cancelled = true;
    click.reason = reason;
    try {
      if (click.ac) click.ac.abort();
    } catch (_) {
      /* bỏ qua */
    }
  }

  function stillValid(tok) {
    if (!tok || !click || click.nonce !== tok.nonce || tok.cancelled) return false;
    const env = E.envFromConfig(config);
    if (!env || env.id !== tok.envId || currentStore(env) !== tok.storeId) return false;
    if (location.href !== tok.route) return false;
    if (tok.kind === "list") {
      if (list.latestReqSeq !== tok.reqSeq || list.shownSeq !== tok.reqSeq || list.shownQueryKey !== tok.queryKey) return false;
      const r = list.rows.get(tok.code);
      if (!r || r.id !== tok.grId) return false;
      if (!L || !L.rowValid(tok.row, tok.code, tok.grId)) return false;
    }
    return true;
  }

  // Đọc lại GR + PO, kiểm đủ rồi mới tạo phiên. Kết quả: {status: started|existing|not_linkable|cancelled|error, …}.
  async function startFromGr(env, storeId, grId, code, tok) {
    const guard = () => {
      if (!stillValid(tok)) throw CANCELLED;
    };
    const signal = tok.ac ? tok.ac.signal : undefined;
    const fail = (message) => ({ status: "error", message });
    try {
      guard();
      const g = await posGet(env, E.api.grDetail(env, grId), signal);
      guard();
      if (!g.ok) return fail(httpError("GET phiếu nhận", g));
      const gr = P.normalizeGr(g.json);
      if (!gr) return fail("Phiếu nhận: response không đúng dạng.");
      if (gr.id !== grId) return fail("Phiếu nhận đọc được không đúng phiếu đã chọn.");
      if (code && gr.code !== code) return { status: "cancelled", message: LIST_CHANGED };
      if (!gr.posId || gr.posId !== storeId) return fail(`${gr.code}: phiếu nhận thuộc cửa hàng khác cửa hàng đang đăng nhập (hoặc thiếu cửa hàng).`);
      if (!P.isReceivable(gr)) return fail(`${gr.code}: phiếu không còn ở trạng thái chờ nhận / đang nhận.`);
      const s0 = await bg("session:get", { envId: env.id, grId: gr.id });
      guard();
      if (s0 && ACTIVE.has(s0.state) && s0.state !== "no_nw_order") return { status: "existing", session: s0, gr };
      const p = await posGet(env, E.api.poDetail(env, gr.posId, gr.poId), signal);
      guard();
      if (!p.ok) return fail(httpError("GET PO", p));
      const po = P.normalizePo(p.json);
      const link = P.resolveDelivery(gr, po, storeId);
      if (!link.ok) {
        if (link.errors.length === 1 && link.errors[0] === "no_delivery_code") return { status: "not_linkable", gr };
        return fail(`${gr.code}: không nối được tới SO thuocsi — ${link.errors.map((c) => LINK_MSG[c] || c).join("; ")}`);
      }
      // Khoá ghi phía POS (PM P3 / P1.6): SO phải có đúng một phiếu nhận (chưa huỷ) ở cửa hàng này, đọc đủ, và đó là phiếu này —
      // trừ phiếu phần còn lại (v0.4.1): PO có các phiếu khác đều đã xong và cộng sổ theo dòng PO khớp.
      const found = await searchGrsOfSo(env, storeId, link.soBase, signal);
      guard();
      const rem = await remainderFor(env, gr, po, signal, guard);
      // Review v0.4.1 P3-7: không đọc được phiếu đã xong (mạng / máy chủ) là lỗi tạm — không tạo phiên khoá "nhận tay", bảo bấm lại.
      if (rem && !rem.ok && (rem.reason === "completed_read_failed" || rem.reason === "completed_unreadable")) return fail(`${gr.code}: không đọc được phiếu đã xong ${rem.code || ""} của cùng PO — thử bấm lại.`);
      const lock = P.soWriteLock(found, gr.id, rem);
      guard();
      // Mượn đầu đọc TRƯỚC khi mở Nextwaves (màn quét tự kết nối lúc mở). Không có QR Scan Log hỗ trợ → đi tiếp.
      const reader = await readerLend(gr.code, reuseLease(s0 && s0.reader));
      try {
        guard(); // ngay trước khi tạo phiên (giữa hai chỗ này không có await)
      } catch (e) {
        readerGiveBack(reader);
        throw e;
      }
      const s = await bg("session:start", {
        envId: env.id,
        nwTenant: env.nwTenant,
        reader,
        grId: gr.id,
        grCode: gr.code,
        poPosId: gr.poId,
        poPosCode: gr.poCode,
        posId: gr.posId,
        posName: gr.posName || "",
        deliveryCode: link.deliveryCode,
        soBase: link.soBase,
        // Phiếu phần còn lại: đơn Nextwaves ứng với CẢ PO (nhận một lần cho phần còn lại) → vân tay cấp PO.
        fingerprint: rem && rem.ok ? rem.source : P.grFingerprintSource(gr),
        remainder: rem && rem.ok ? { completed: rem.completed, excludeUids: rem.excludeUids } : null,
        remainderNote: rem && !rem.ok && rem.reason !== "single_gr" ? rem.reason : null,
        // v0.4.1 (audit F2): tóm tắt phiếu để tab Nextwaves kiểm trước khi dược sĩ xác nhận (match.precheck).
        grSummary: gr.items.map((it) => ({
          productId: it.productId,
          unitRate: it.unitRate,
          baseQuantity: it.baseQuantity,
          received: it.details.reduce((n, d) => n + (Number(d.received) || 0), 0),
          codes: it.details.reduce((n, d) => n + d.qrCodes.length, 0),
          ratesByUnitName: it.ratesByUnitName,
        })),
        writeLocks: lock ? [lock] : [],
      }).catch((e) => {
        readerGiveBack(reader);
        throw e;
      });
      if (!s) return fail(`${gr.code}: không đọc lại được phiên vừa tạo.`);
      return { status: "started", session: s, gr };
    } catch (err) {
      // Chỉ cú bấm bị huỷ thật mới là "danh sách đã đổi"; GET hết giờ / mất kết nối là lỗi mạng (không báo nhầm cho dược sĩ).
      if (err === CANCELLED || (tok && tok.cancelled)) return { status: "cancelled", message: (tok && tok.reason) || LIST_CHANGED };
      if (err && err.name === "AbortError") return fail("Hết giờ / mất kết nối khi đọc dữ liệu POS — thử lại.");
      return fail(String((err && err.message) || err));
    }
  }

  // v0.4.1 — phiếu phần còn lại: PO có ≥ 2 phiếu chưa huỷ → GET từng phiếu đã xong theo id (dạng response đã kiểm trên production;
  // không dựa vào dòng tìm theo SO) rồi cộng sổ theo dòng PO (pos-model.remainderOf). null = PO một phiếu (luồng thường).
  async function remainderFor(env, gr, po, signal, guard) {
    const live = (po && Array.isArray(po.grs) ? po.grs : []).filter((g) => !/^CANCEL/i.test(g.status));
    if (live.length < 2) return null;
    const done = [];
    for (const o of live) {
      if (o.id === gr.id || o.status !== "COMPLETED") continue;
      const r = await posGet(env, E.api.grDetail(env, o.id), signal);
      guard();
      if (!r.ok) return { ok: false, reason: "completed_read_failed", code: o.code };
      const g = P.normalizeGr(r.json);
      if (!g || g.id !== o.id) return { ok: false, reason: "completed_unreadable", code: o.code };
      done.push(g);
    }
    return P.remainderOf(gr, po, done);
  }

  // ---------- vòng đánh giá ----------
  async function refresh() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await evaluate();
      } while (again);
    } catch (err) {
      if (onList) setListNote("err", "Lỗi extension", String((err && err.message) || err));
      else if (!applying) showError("Lỗi extension", String((err && err.message) || err), [{ label: "Thử lại", onClick: refresh }]);
    } finally {
      running = false;
    }
  }

  async function evaluate() {
    evalHref = location.href;
    evalEpoch = statusEpoch;
    if (applying || reloading) return;
    const env = E.envFromConfig(config);
    const page = env ? E.classifyPosPage(location.href, env) : null;
    if (!page || page.kind !== "gr_list") leaveList();
    if (!page) {
      unwatch();
      panel.hide();
      return;
    }
    if (!authByEnv[env.id]) {
      if (page.kind !== "gr_list") panel.show({ tone: "busy", title: "Đang chờ POS tải dữ liệu…", lines: [] });
      return;
    }
    // Cửa hàng đang đăng nhập (đã xác nhận) là điều kiện bắt buộc của mọi lối vào (PM P1.4, Spec v0.2 S3).
    const storeId = currentStore(env);
    if (!storeId) {
      unwatch();
      if (page.kind === "gr_list") return clearListButtons();
      return showError("Không xác định được cửa hàng đang đăng nhập", "POS chưa gửi x-store-id — extension không chạy.");
    }
    if (page.kind === "gr") return evaluateGr(env, storeId, page.grId);
    if (page.kind === "gr_list") return evaluateGrList(env, storeId);
    return evaluateSo(env, storeId, page.so);
  }

  // Tìm GR theo SO + kiểm đọc đủ / rõ (pos-model.checkSoGrs — PM audit v0.1.1 P1.6). Dùng chung cho các lối vào.
  async function searchGrsOfSo(env, storeId, so, signal) {
    const digits = K.soDigits(so);
    if (!digits) return { ok: false, reason: "so_unreadable", error: "Không đọc được số SO" };
    const r = await posGet(env, E.api.grSearchBySo(env, digits, storeId), signal);
    if (!r.ok) return { ok: false, reason: "http", error: httpError("Tìm GR theo SO", r) };
    const check = P.checkSoGrs(r.json, storeId);
    if (!check.ok) return Object.assign({}, check, { error: soCheckText(check) });
    return check;
  }

  function soCheckText(c) {
    const facts = c.total === undefined ? "" : ` (total ${c.total}, đã đọc ${c.read})`;
    return (SO_CHECK_MSG[c.reason] || c.reason) + facts + (c.code ? ` — ${c.code}` : "");
  }

  // Đường (3): /chi-tiet-so/<SO>
  async function evaluateSo(env, storeId, so) {
    const href = location.href;
    soPage = null;
    const found = await searchGrsOfSo(env, storeId, so);
    if (found.ok) soPage = { href, grIds: new Set(found.list.map((g) => String(g.id).toLowerCase())) };
    if (!found.ok) {
      unwatch();
      return showError("Không đọc đủ danh sách phiếu nhận của SO — extension không đi tiếp", found.error, [{ label: "Thử lại", onClick: refresh }]);
    }
    const all = found.list;
    if (chosenGrId && all.some((g) => g.id === chosenGrId)) return evaluateGr(env, storeId, chosenGrId);
    const receivable = all.filter(P.isReceivable);
    if (receivable.length === 1) return evaluateGr(env, storeId, receivable[0].id);
    if (receivable.length === 0) {
      for (const g of all) {
        const s = await bg("session:get", { envId: env.id, grId: g.id });
        if (s) return evaluateGr(env, storeId, g.id);
      }
      unwatch();
      return panel.show({ tone: "info", title: `SO ${so}: không có phiếu nhận đang chờ nhận`, lines: [] });
    }
    unwatch();
    panel.show({
      tone: "warn",
      title: `SO ${so} có ${receivable.length} phiếu nhận đang chờ`,
      lines: ["Chọn phiếu muốn nhận bằng RFID (SO tách giao: mỗi phiếu một lần nhận; hai phiếu cùng PO thì điền phiếu bị khoá):"],
      buttons: receivable.map((g) => ({
        label: `${g.code} · ${g.poCode}`,
        onClick: () => {
          chosenGrId = g.id;
          refresh();
        },
      })),
    });
  }

  // Đường (2) (và (3) sau khi đã chọn được GR). Không tự tạo phiên: chỉ hiện nút; phiên đã có thì đi tiếp.
  async function evaluateGr(env, storeId, grId) {
    const g = await posGet(env, E.api.grDetail(env, grId));
    if (!g.ok) return showError("Không đọc được phiếu nhận", httpError("GET phiếu nhận", g), [{ label: "Thử lại", onClick: refresh }]);
    const gr = P.normalizeGr(g.json);
    if (!gr) return showError("Không đọc được phiếu nhận", "Response không đúng dạng.");
    if (!gr.posId) return showError("Phiếu nhận thiếu thông tin cửa hàng (pos_info.id)", gr.code);
    if (gr.posId !== storeId) return showError("Phiếu nhận thuộc cửa hàng khác cửa hàng đang đăng nhập", gr.code);

    let s = await bg("session:get", { envId: env.id, grId: gr.id });
    if (!P.isReceivable(gr)) {
      const liveLease = s && s.state === "applying" && s.lease && s.lease.expiresAt > Date.now();
      if (s && gr.status === "COMPLETED" && s.state !== "done" && !liveLease) {
        // v0.4.0 (A8): applying hết lease (tab chết sau PUT cuối) cũng đóng được khi POS đã HOÀN THÀNH.
        try {
          s = await bg("session:update", { key: s.key, patch: { state: "done" }, log: { type: "gr_completed_seen" } });
        } catch (_) {
          /* giữ phiên như cũ */
        }
      }
      // v0.2.5 (PM AUDIT-A1 P2): phiếu đã kết thúc. Trang phiếu COMPLETED không còn #all-receipt và không còn gì để điền → không vẽ,
      // huỷ chờ chỗ gắn, không báo lỗi giao diện (A1 28/10: khung đỏ sai sau HOÀN THÀNH). /chi-tiet-so vẫn hiện phiên ở khung nổi.
      if (s && !onGrPageOf(gr)) return renderSession(env, gr, s);
      unwatch();
      if (fresh()) panel.hide(); // lượt cũ về muộn sau khi đổi route không gỡ khung của trang mới
      return;
    }

    if (!s) {
      unwatch();
      const p = await posGet(env, E.api.poDetail(env, gr.posId, gr.poId));
      if (!p.ok) return showError("Không đọc được PO của phiếu nhận", httpError("GET PO", p), [{ label: "Thử lại", onClick: refresh }]);
      const po = P.normalizePo(p.json);
      const link = P.resolveDelivery(gr, po, storeId);
      if (!link.ok) {
        // PO không có mã giao thuocsi: không phải phiếu từ thuocsi → không phải việc của extension.
        if (link.errors.length === 1 && link.errors[0] === "no_delivery_code") return panel.hide();
        return showError(`${gr.code}: không nối được tới SO thuocsi`, link.errors.map((c) => LINK_MSG[c] || c));
      }
      const codes = gr.items.reduce((n, it) => n + it.details.reduce((m, d) => m + d.qrCodes.length, 0), 0);
      // v0.4.1: PO nhiều phiếu (bán gấp → POS tách phiếu) — cộng sổ theo dòng PO lúc dược sĩ bấm (không GET thêm ở đây).
      const sibs = po ? po.grs.filter((g) => g.id !== gr.id && !/^CANCEL/i.test(g.status)) : [];
      return showGr(gr, {
        tone: codes > 0 ? "warn" : "info",
        title: `${gr.code} · ${link.deliveryCode}`,
        lines: [
          codes > 0
            ? `Phiếu đã có ${codes} mã quét. Kết quả Nextwaves phải chứa đúng các mã này, đúng lô, thì mới điền tiếp được.`
            : "Bấm “Nhận hàng bằng RFID” để mở màn quét Nextwaves cho phiếu này.",
          sibs.length ? `PO ${gr.poCode} còn ${sibs.length} phiếu khác (${sibs.map((g) => `${g.code} ${g.status === "COMPLETED" ? "đã xong" : "chưa xong"}`).join(", ")}): nếu đây là phiếu phần còn lại sau bán gấp, extension cộng sổ theo PO khi bấm.` : null,
        ].filter(Boolean),
        buttons: [{ label: START_LABEL, onClick: () => startOnGrPage(env, storeId, gr) }],
      });
    }
    if (s.posId && s.posId !== storeId) return showError("Phiên này thuộc cửa hàng khác cửa hàng đang đăng nhập", s.grCode);
    if (s.state === "done") {
      // v0.2.5 (PM AUDIT-A1 P2): phiên ghi "đã HOÀN THÀNH" mà POS đọc lại vẫn chờ nhận / đang nhận → phiên không phải bằng chứng POS
      // đã hoàn thành: chỉ cảnh báo + đọc lại; không nút điền, không tạo phiên mới.
      watched = { key: s.key, sig: sessionSig(s), envId: env.id, grCode: s.grCode };
      return showGr(gr, {
        tone: "warn",
        title: `${gr.code}: POS chưa ở trạng thái hoàn thành`,
        lines: sessionLines(s).concat([`Extension đã thấy lệnh HOÀN THÀNH, nhưng đọc lại phiếu vẫn là ${gr.status}. Không điền gì.`, "Bấm “Đọc lại”; vẫn vậy thì kiểm tra phiếu trên POS và báo dev."]),
        buttons: [{ label: "Đọc lại", onClick: refresh }, cancelButton(env, s)],
      });
    }
    return renderSession(env, gr, s);
  }

  async function startOnGrPage(env, storeId, gr) {
    if (click) return;
    const tok = newClick({ kind: "gr", grId: gr.id, code: gr.code, envId: env.id, storeId });
    showGr(gr, { tone: "busy", title: `Đang kiểm ${gr.code}…`, lines: ["Đọc lại phiếu, PO và SO trước khi mở Nextwaves."] });
    const res = await startFromGr(env, storeId, gr.id, gr.code, tok);
    if (click === tok) click = null;
    if (res.status === "started" || res.status === "existing") return refresh();
    if (res.status === "cancelled") return refresh();
    if (res.status === "not_linkable") return refresh();
    showError(`${gr.code}: chưa mở được Nextwaves`, res.message, [{ label: "Thử lại", onClick: refresh }], gr);
  }

  // ---------- trang danh sách ----------
  // v0.2.3 (PM F4): trên danh sách KHÔNG dùng khung nổi. Đang kiểm / thành công thể hiện bằng chính nút của dòng; huỷ / lỗi /
  // phiếu không liên kết được báo trong vùng thông báo thuộc luồng trang, ở trên bảng (L.notice) — không phủ dòng, icon, nút, phân trang.
  function showListNote() {
    if (L) L.notice(onList ? listNote : null);
    panel.hide();
  }
  function setListNote(tone, title, lines) {
    listNote = {
      tone,
      title,
      lines: [].concat(lines || []),
      buttons: [
        {
          label: "Đóng",
          onClick: () => {
            listNote = null;
            showListNote();
          },
        },
      ],
    };
    showListNote();
  }

  function leaveList() {
    if (!onList) return;
    onList = false;
    listCtx = null;
    listNote = null;
    if (listSessionsTimer) clearTimeout(listSessionsTimer);
    listSessionsTimer = null;
    if (L) L.deactivate(); // gỡ cả nút lẫn vùng thông báo
  }

  // Danh sách chưa được dùng (cửa hàng chưa xác nhận / không thuộc danh sách chạy thử): gỡ nút; còn lý do huỷ cú bấm thì vẫn báo.
  function clearListButtons() {
    listCtx = null;
    if (onList && L) L.show(null);
    showListNote();
  }

  async function loadListSessions(env) {
    const all = await bg("session:list");
    const m = new Map();
    for (const s of all || []) if (s.envId === env.id && ACTIVE.has(s.state)) m.set(s.grId, s);
    listSessions = m;
  }

  async function evaluateGrList(env, storeId) {
    unwatch();
    if (!onList) {
      onList = true;
      if (L) L.activate();
    }
    listCtx = { env, storeId };
    await loadListSessions(env);
    renderList();
    showListNote();
  }

  // v0.2.3 (PM F3): nhãn nhìn thấy không dài hơn START_LABEL (bảng POS không dàn lại); nghĩa đầy đủ — mã GR + trạng thái PHIÊN
  // extension (không phải trạng thái POS) + hành động — nằm ở title và aria-label (gr-list.js).
  const SESSION_STATE_VI = {
    waiting_nw: "chờ mở / nhận trên Nextwaves",
    no_nw_order: "Nextwaves chưa có đơn chờ nhận — nhận tay",
    nw_ready: "Nextwaves đã sẵn sàng nhận",
    received: "Nextwaves đã nhận, chờ điền POS",
    applying: "đang điền POS",
    applied: "đã điền POS",
    apply_stopped: "dừng điền POS",
  };
  const sessionText = (s) => `phiên ${SESSION_STATE_VI[s.state] || s.state} (${s.state})`;
  function listButton(r, s) {
    if (click && click.kind === "list" && click.grId === r.id) return { kind: "busy", label: "Đang kiểm…", disabled: true, title: `${r.code} · đang kiểm phiếu, PO và SO trước khi mở Nextwaves` };
    if (s && (s.state === "waiting_nw" || s.state === "nw_ready")) return { kind: "open_nw", label: "Mở Nextwaves", title: `${r.code} · ${sessionText(s)} · Mở lại tab Nextwaves của phiên này` };
    if (s && s.state === "no_nw_order") return { kind: "open_nw", label: "Không có đơn NW", title: `${r.code} · ${sessionText(s)} · Bấm để tìm lại trên Nextwaves` };
    if (s) return { kind: "open_gr", label: "Mở phiếu", title: `${r.code} · ${sessionText(s)} · Mở phiếu để lập kế hoạch / điền / HOÀN THÀNH` };
    return { kind: "start", label: START_LABEL, disabled: !!click, title: `${r.code} · chưa có phiên · Nhận hàng bằng RFID: đọc lại phiếu, PO, SO rồi mở màn quét Nextwaves` };
  }

  function renderList() {
    if (!L || !onList) return;
    const ctx = listCtx;
    if (!ctx || list.envId !== ctx.env.id || !list.ok) return L.show(null);
    const byCode = new Map();
    for (const r of list.rows.values()) {
      if (!P.isReceivable({ status: r.status }) || r.posId !== ctx.storeId || notLinkable.has(r.id)) continue;
      byCode.set(r.code, Object.assign({ grId: r.id }, listButton(r, listSessions.get(r.id))));
    }
    L.show({ byCode });
  }

  function scheduleListSessions() {
    if (!onList || !listCtx) return;
    if (listSessionsTimer) clearTimeout(listSessionsTimer);
    listSessionsTimer = setTimeout(async () => {
      listSessionsTimer = null;
      if (!onList || !listCtx) return;
      try {
        await loadListSessions(listCtx.env);
        renderList();
      } catch (_) {
        /* bỏ qua */
      }
    }, T.listSessionsDebounceMs);
  }

  async function onListSelect(row, grId, code, kind) {
    const ctx = listCtx;
    if (!ctx || !onList) return;
    const { env, storeId } = ctx;
    const r = list.rows.get(code);
    if (!r || r.id !== grId) return;
    if (kind === "open_nw") {
      const s = listSessions.get(grId);
      if (s) reopenNw(s).catch(() => {});
      return;
    }
    if (kind === "open_gr") return location.assign(E.api.posGrPage(env, grId));
    if (kind !== "start" || click) return;
    const tok = newClick({ kind: "list", grId, code, row, reqSeq: list.shownSeq, queryKey: list.shownQueryKey, envId: env.id, storeId });
    listNote = null; // đang kiểm: nút của dòng thành "Đang kiểm…" (vô hiệu), không có khung / thông báo
    showListNote();
    renderList();
    const res = await startFromGr(env, storeId, grId, code, tok);
    if (click === tok) click = null;
    if (!onList) return;
    if (res.status === "started" || res.status === "existing") {
      listNote = null; // thành công: nút thành "Mở Nextwaves", tab Nextwaves đã mở
      showListNote();
    } else if (res.status === "not_linkable") {
      notLinkable.add(grId);
      setListNote("info", `${code}: không nhận bằng RFID được`, "Phiếu này không đi từ SO thuocsi (PO không có mã giao).");
    } else if (res.status === "cancelled") {
      setListNote("warn", `${code}: ${res.message || LIST_CHANGED}`);
    } else {
      setListNote("err", `${code}: chưa mở được Nextwaves`, res.message);
    }
    refresh();
  }

  if (L)
    L.attach({
      onSelect: (row, grId, code, kind) => {
        onListSelect(row, grId, code, kind).catch((err) => {
          if (click) click = null;
          if (onList) setListNote("err", "Lỗi extension", String((err && err.message) || err));
          else showError("Lỗi extension", String((err && err.message) || err));
        });
      },
      onDomChanged: () => {
        if (click && click.kind === "list" && !stillValid(click)) cancelClick(LIST_CHANGED);
      },
    });

  function onListRequest(p) {
    if (!E.envById(p.envId) || !(p.reqSeq > 0)) return;
    list.latestReqSeq = Math.max(list.latestReqSeq, p.reqSeq);
    if (click && click.kind === "list" && p.reqSeq > click.reqSeq) cancelClick(LIST_CHANGED);
  }

  // Chỉ nhận response của lượt request mới nhất đã gửi (rev 2 R1). Lượt mới nhất lỗi → xoá hết nút.
  function onListResponse(p) {
    if (!E.envById(p.envId) || !(p.reqSeq > 0)) return;
    list.latestReqSeq = Math.max(list.latestReqSeq, p.latestReqSeq || 0, p.reqSeq);
    if (p.reqSeq !== list.latestReqSeq || p.reqSeq <= list.shownSeq) return;
    list.shownSeq = p.reqSeq;
    list.shownQueryKey = p.queryKey || null;
    list.envId = p.envId;
    list.ok = !!p.ok && Array.isArray(p.rows);
    list.rows = new Map();
    if (list.ok) {
      for (const r of p.rows) {
        if (!r || !r.code || !E.isUuid(r.id)) continue;
        list.rows.set(String(r.code), { id: lower(r.id), code: String(r.code), status: String(r.status || ""), poId: lower(r.poId), posId: lower(r.posId) });
      }
    }
    if (click && click.kind === "list" && !stillValid(click)) cancelClick(LIST_CHANGED);
    renderList();
  }

  // ---------- phiên ----------
  const REMAINDER_NOTE = {
    open_gr_touched: "phiếu này đã được nhận tay một phần",
    other_gr_open: "PO còn phiếu khác chưa HOÀN THÀNH",
    completed_read_failed: "không đọc được phiếu đã xong của PO",
    completed_unreadable: "phiếu đã xong của PO không đúng dạng",
    completed_unread: "chưa đọc đủ các phiếu đã xong của PO",
    line_not_in_po: "có dòng không thuộc PO",
    line_mismatch: "số lượng các phiếu không cộng đúng dòng PO",
    po_received_mismatch: "lượng đã nhận trên PO không khớp các phiếu",
    received_inconsistent: "lượng đã nhận của phiếu đã xong không nhất quán",
    rate_missing: "thiếu hệ số đơn vị",
    rate_conflict: "hệ số đơn vị lệch giữa các phiếu",
    line_split: "một dòng PO nằm ở nhiều dòng phiếu",
    po_line_unreadable: "dòng PO thiếu số lượng",
  };

  function sessionLines(s) {
    const wh = s.warehouseName || s.warehouseCode ? ` · kho ${[s.warehouseName, s.warehouseCode ? `(${s.warehouseCode})` : ""].filter(Boolean).join(" ")}` : "";
    const out = [`Phiếu ${s.grCode} · ${s.poPosCode} · mã giao ${s.deliveryCode}${s.posName ? ` · ${s.posName}` : ""}`, s.nwPoNumber ? `Nextwaves: ${s.nwPoNumber} (${s.nwRefId || s.soBase})${wh}` : `Nextwaves: tìm theo ${s.soBase}`];
    // v0.4.1 — phiếu phần còn lại (bán gấp → POS tách phiếu).
    if (s.remainder) out.push(`Phiếu phần còn lại của ${s.poPosCode} — đã nhận trước ở ${s.remainder.completed.map((g) => g.code).join(", ")}; món đã bán gấp không điền lại.`);
    else if (s.remainderNote) out.push(`PO ${s.poPosCode} có nhiều phiếu nhận nhưng chưa nhận ra được phiếu phần còn lại: ${REMAINDER_NOTE[s.remainderNote] || s.remainderNote} — nhận tay.`);
    // v0.4.1: extension đã bấm hộ "Ngắt kết nối" của QR Scan Log cho lượt này → QR Scan Log đang Ngắt, không tự lấy lại.
    if (s.readerTakenAt && !["waiting_nw", "nw_ready"].includes(s.state)) out.push("Đầu đọc: đã lấy từ tab bán hàng cho lượt nhận này — xong việc, sang tab bán hàng bấm “Kết nối RFID” (chọn cổng) để bán tiếp.");
    return out;
  }

  // v0.4.1 — phiếu phần còn lại: UID đã nằm trên phiếu POS đã xong của PO (món bán gấp; POS gắn UID Nextwaves lúc HOÀN THÀNH) không
  // điền lại vào phiếu này. Không phải phiếu phần còn lại → nguyên kết quả nhận như v0.4.0.
  function unitsForPlan(s) {
    const units = (s && s.nwResult && s.nwResult.units) || [];
    const ex = new Set((s && s.remainder && s.remainder.excludeUids) || []);
    return ex.size ? units.filter((u) => !ex.has(u.uid)) : units;
  }
  // I6: tem món đã bán gấp mà Nextwaves vẫn nhận (hàng còn trên đầu đọc lúc nhận) → tồn Nextwaves dư.
  function soldReadOf(s) {
    const units = (s && s.nwResult && s.nwResult.units) || [];
    const ex = new Set((s && s.remainder && s.remainder.excludeUids) || []);
    return ex.size ? units.filter((u) => ex.has(u.uid)).map((u) => u.uid) : [];
  }
  function remainderNotes(s) {
    const out = [];
    const sold = soldReadOf(s);
    if (sold.length) out.push(`⚠ Nextwaves đã nhận cả ${sold.length} tem món đã bán gấp (${sold.slice(0, 5).join(", ")}${sold.length > 5 ? "…" : ""}) — tồn Nextwaves dư ${sold.length}, báo vận hành điều chỉnh. Phiếu này không điền các tem đó.`);
    const om = s && s.nwResult && s.nwResult.onMissing;
    if (s && s.remainder && om === "close_short") out.push("⚠ Lượt nhận Nextwaves chọn “Đóng đơn dù còn thiếu” — Nextwaves đã báo Buymed giao thiếu; báo vận hành.");
    return out;
  }
  const SPLIT_HINT = "Bấm HOÀN THÀNH bây giờ thì POS tách phần chưa đủ sang một phiếu mới.";

  // Mở lại / tìm lại trên Nextwaves: mượn lại đầu đọc (cùng leaseId) trước khi đưa tab Nextwaves lên.
  async function reopenNw(s) {
    if (!["waiting_nw", "nw_ready", "no_nw_order"].includes(s.state)) return null;
    const reader = await readerLend(s.grCode, reuseLease(s.reader));
    return bg("session:reopenNw", { key: s.key, reader }).catch((e) => {
      readerGiveBack(reader);
      throw e;
    });
  }

  function cancelButton(env, s) {
    return {
      label: "Huỷ phiên",
      secondary: true,
      onClick: async () => {
        try {
          await bg("session:cancel", { key: s.key });
        } catch (err) {
          return showError("Không huỷ được phiên", String((err && err.message) || err));
        }
        refresh();
      },
    };
  }

  async function renderSession(env, gr, s) {
    watched = { key: s.key, sig: sessionSig(s), envId: env.id, grCode: s.grCode };
    switch (s.state) {
      case "waiting_nw":
      case "nw_ready":
        return showGr(gr, {
          tone: "busy",
          title: STATE_LABEL[s.state],
          lines: sessionLines(s).concat(["Trên tab Nextwaves: đặt hàng lên reader rồi bấm “Xác nhận nhận hàng”. Nhận đủ xong extension đưa về đây và lập kế hoạch điền phiếu."]),
          buttons: [{ label: "Mở tab Nextwaves", onClick: () => reopenNw(s).catch(() => {}) }, cancelButton(env, s)],
        });
      case "no_nw_order":
        if (s.noOrderReason === "nw_partial_received") {
          return showGr(gr, {
            tone: "warn",
            title: `${gr.code}: Nextwaves không còn phiếu gửi chờ nhận cho SO này — nhận tay`,
            // Review v0.4.1 P3-9: không khẳng định "phần còn lại không vào kho Nextwaves" (có thể chỉ là hàng không tem, hoặc lần giao khác chưa
            // lên Nextwaves) — cho Tìm lại.
            lines: sessionLines(s).concat(["Đơn Nextwaves của SO này đã được nhận một phần trước đó (mỗi phiếu gửi chỉ nhận một lần). Nhận phiếu này trên POS như hiện nay. Nếu SO còn lần giao khác chưa lên Nextwaves: bấm “Tìm lại trên Nextwaves” sau."]),
            buttons: [{ label: "Tìm lại trên Nextwaves", onClick: () => reopenNw(s).catch(() => {}) }, cancelButton(env, s)],
          });
        }
        return showGr(gr, {
          tone: "warn",
          title: `${gr.code}: Nextwaves chưa có đơn chờ nhận — nhận tay`,
          lines: sessionLines(s).concat([
            s.remainder
              ? "Phiếu phần còn lại: Nextwaves có thể đã nhận hết đơn này từ trước (lúc nhận phiếu gốc). Nhận phiếu này trên POS như hiện nay."
              : "Nhận phiếu này trên POS như hiện nay. Hàng có tem RFID mà vẫn báo vậy: kiểm tài khoản Nextwaves có quyền kho của cửa hàng rồi bấm “Tìm lại trên Nextwaves”.",
          ]),
          buttons: [{ label: "Tìm lại trên Nextwaves", onClick: () => reopenNw(s).catch(() => {}) }, cancelButton(env, s)],
        });
      case "received":
      case "apply_stopped":
        return planAndOffer(env, gr, s);
      case "applying": {
        const expired = !(s.lease && s.lease.expiresAt > Date.now());
        if (expired) return planAndOffer(env, gr, s);
        return showGr(gr, { tone: "busy", title: "Đang điền phiếu ở tab khác", lines: sessionLines(s) });
      }
      case "applied":
        return renderApplied(env, gr, s);
      case "done":
        return showGr(gr, {
          tone: "ok",
          title: `${s.grCode}: đã HOÀN THÀNH`,
          lines: sessionLines(s),
          buttons: [{ label: "Đóng", secondary: true, onClick: () => panel.hide() }],
        });
      default:
        return showGr(gr, { tone: "warn", title: `Trạng thái phiên lạ: ${s.state}`, lines: sessionLines(s), buttons: [cancelButton(env, s)] });
    }
  }

  // Khớp cuối lệch (đã lưu trong phiên — audit v0.4.0 P3-4).
  function verifyFailedView(gr, diffs, lead) {
    return {
      tone: "warn",
      title: `${gr.code}: đã điền nhưng đọc lại chưa khớp hoàn toàn — kiểm từng lô trước khi HOÀN THÀNH`,
      lines: (lead || []).concat([`Lệch: ${(diffs || []).slice(0, 6).map((d) => d.why + (d.detailId ? " " + String(d.detailId).slice(0, 8) : "")).join(", ")}.`, "Dược sĩ kiểm số lượng / mã từng lô trên phiếu; đúng thì bấm HOÀN THÀNH, sai thì báo dev. Cảnh báo này là kết quả lúc điền — giữ tới khi phiếu HOÀN THÀNH (tải lại không xoá)."]),
      buttons: [{ label: "Tải lại phiếu", onClick: () => location.reload() }],
    };
  }

  function renderApplied(env, gr, s) {
    const uids = unitsForPlan(s).map((u) => u.uid);
    const extra = remainderNotes(s);
    const codes = new Set(gr.items.flatMap((it) => it.details.flatMap((d) => d.qrCodes)));
    const missing = uids.filter((u) => !codes.has(u));
    // Khớp cuối (giữ được qua mọi lần vẽ lại): mã trên phiếu không thuộc lượt nhận Nextwaves = phiếu bị đổi sau khi điền (kế hoạch đã
    // chặn mã lạ từ trước khi ghi).
    const uidAll = new Set(uids);
    const foreign = [...codes].filter((c) => !uidAll.has(c));
    if (foreign.length) {
      return showGr(gr, {
        tone: "warn",
        title: `${gr.code}: đã điền nhưng đọc lại chưa khớp hoàn toàn — kiểm từng lô trước khi HOÀN THÀNH`,
        lines: sessionLines(s).concat(extra, [`Phiếu có ${foreign.length} mã không thuộc lượt nhận Nextwaves: ${foreign.slice(0, 10).join(", ")}${foreign.length > 10 ? "…" : ""}`, "Dược sĩ kiểm số lượng / mã từng lô; đúng thì bấm HOÀN THÀNH, sai thì báo dev."]),
        buttons: [{ label: "Đọc lại", onClick: refresh }],
      });
    }
    if (missing.length) {
      return showGr(gr, {
        tone: "warn",
        title: `${gr.code}: phiếu thiếu ${missing.length}/${uids.length} UID đã điền`,
        lines: sessionLines(s).concat(extra, [`Thiếu: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? "…" : ""}`, "Kiểm tra phiếu trước khi bấm HOÀN THÀNH."]),
      });
    }
    // Audit v0.4.0 P3-4: khớp cuối đã lệch lúc ghi (lưu trong phiên) → giữ cảnh báo qua F5 thay vì khung xanh. Mã lạ / thiếu UID ở trên
    // cụ thể hơn nên xét trước.
    const fv = s.applyResult && s.applyResult.verify;
    if (fv && fv.ok === false) return showGr(gr, verifyFailedView(gr, fv.diffs, sessionLines(s).concat(extra)));
    const uidSet = new Set(uids);
    const lots = gr.items.reduce((n, it) => n + it.details.filter((d) => d.qrCodes.some((c) => uidSet.has(c))).length, 0);
    // Review v0.4.0 P2-2: dòng Nextwaves không gắn tem (không có UID) vẫn nằm trên phiếu với lượng thiếu → nói rõ, không để khung "xanh".
    const short = gr.items
      .map((it) => ({ name: it.productName || it.sku || it.productId, got: it.details.reduce((n, d) => n + (Number(d.received) || 0), 0), want: Number(it.quantity) || 0 }))
      .filter((x) => x.got < x.want);
    if (short.length) {
      return showGr(gr, {
        tone: "warn",
        title: `${gr.code}: đã điền ${uids.length} mã — còn ${short.length} sản phẩm CHƯA nhận đủ`,
        lines: sessionLines(s).concat(extra, short.slice(0, 20).map((x) => `• ${x.name}: ${x.got}/${x.want}`), ["Hàng này không có tem RFID (hoặc Nextwaves chưa giao): dược sĩ nhận tay phần còn thiếu, kiểm lại rồi mới bấm HOÀN THÀNH.", SPLIT_HINT]),
      });
    }
    return showGr(gr, {
      tone: extra.length ? "warn" : "ok",
      title: `${gr.code}: đã điền ${uids.length} mã vào ${lots} lô — kiểm danh sách rồi bấm HOÀN THÀNH`,
      lines: sessionLines(s).concat(extra, ["Kiểm số lượng từng lô trên phiếu, đúng thì bấm HOÀN THÀNH của POS. Extension không tự HOÀN THÀNH."]),
    });
  }

  // ---------- kế hoạch + ghi ----------
  // Tra QR có cache theo phiên + lượt nhận (`scope`), TTL qrTtlMs; kết quả lỗi không cache; "Kiểm tra lại" tra lại hết (S6).
  async function lookupQr(env, uids, scope) {
    const out = {};
    const force = qrForce;
    qrForce = false;
    const now = Date.now();
    const need = [];
    for (const uid of uids) {
      const c = force ? null : qrCache.get(`${scope}|${uid}`);
      if (c && now - c.at < T.qrTtlMs) out[uid] = c.r;
      else need.push(uid);
    }
    if (qrCache.size > 5000) qrCache.clear();
    let i = 0;
    async function worker() {
      while (i < need.length) {
        const uid = need[i++];
        try {
          const r = await http(E.api.qrLookup(env, uid));
          out[uid] = r.ok ? P.normalizeQrLookup(r.json, uid) : { ok: false, reason: `http_${r.status}` };
        } catch (_) {
          out[uid] = { ok: false, reason: "network" };
        }
        if (out[uid] && out[uid].ok) qrCache.set(`${scope}|${uid}`, { at: Date.now(), r: out[uid] });
      }
    }
    await Promise.all(Array.from({ length: Math.min(T.qrConcurrency, need.length) }, worker));
    return out;
  }

  function planTable(plan) {
    return {
      head: ["Sản phẩm", "Lô", "Đơn vị", "Đã nhận → sau", "UID"],
      rows: plan.steps.map((st) => [`${st.productName || st.productId}`, st.lotDate, st.unit, `${st.before} → ${st.target} / ${st.quantity}`, String(st.uids.length)]),
    };
  }

  function blockedLines(plan) {
    return plan.blocked.slice(0, 30).map((b) => `• ${b.message}${b.uid ? ` — ${b.uid}` : ""}${b.lot ? ` (lô ${b.lot})` : ""}`);
  }

  async function planAndOffer(env, gr, s) {
    const units = unitsForPlan(s);
    showGr(gr, { tone: "busy", title: `Đang tra ${units.length} UID trên POS…`, lines: sessionLines(s) });
    // Tra QR MỌI UID (kể cả UID đã nằm trên phiếu — PM P1.2 / P2.2).
    const scope = `${s.key}|${(s.nwResult && s.nwResult.at) || ""}`;
    const qrByUid = await lookupQr(env, [...new Set(units.map((u) => u.uid).filter(Boolean))], scope);
    const plan = PL.buildPlan(gr, units, qrByUid);
    logTo(s.key, { type: "plan", ok: plan.ok, complete: plan.complete, hash: plan.hash, steps: plan.steps.length, blocked: plan.blocked.map((b) => b.code), summary: plan.summary });

    const liveLease = s.state === "applying" && s.lease && s.lease.expiresAt > Date.now();
    if (plan.complete && !liveLease) {
      // Mọi UID đã nằm đúng lô, lượng nhất quán: không ghi gì, chỉ đóng bước điền (kể cả applying hết lease — A8).
      const s2 = await bg("session:update", { key: s.key, patch: { state: "applied" }, log: { type: "applied_already", hash: plan.hash } });
      return renderApplied(env, gr, s2 || s);
    }
    if (!plan.ok) {
      return showGr(gr, {
        tone: "err",
        title: `${gr.code}: không điền được — ${plan.blocked.length} điểm chặn`,
        lines: sessionLines(s).concat(["Không ghi gì vào phiếu (chặn cả gói) — dược sĩ nhận tay phần này hoặc báo dev.", ...blockedLines(plan)]),
        buttons: [
          {
            label: "Kiểm tra lại",
            onClick: () => {
              qrForce = true;
              refresh();
            },
          },
          cancelButton(env, s),
        ],
      });
    }
    // Review v0.4.0 P3-10: mọi trạng thái sau lượt vừa nhận (đã dừng, tab chết giữa chừng) đều là "điền tiếp", không phải tự điền.
    const stopped = s.state !== "received";
    const head = sessionLines(s).concat(
      stopped && s.applyError ? [`Lần điền trước dừng: ${APPLY_MSG[s.applyError.reason] || s.applyError.reason}${s.applyError.status ? ` (HTTP ${s.applyError.status})` : ""}`] : stopped ? ["Lần điền trước bị ngắt giữa chừng (tab đóng / tải lại)."] : [],
      remainderNotes(s),
      [`Kế hoạch #${plan.hash}: điền ${plan.summary.toWrite} UID vào ${plan.steps.length} lô${plan.summary.alreadyOnGr ? ` (${plan.summary.alreadyOnGr} UID đã nằm đúng lô)` : ""}.`],
      plan.warnings.map((w) => `• Sản phẩm ${w.productId}: sau khi điền mới ${w.received}/${w.quantity} — phần còn lại dược sĩ xử lý tay.`),
      plan.warnings.length ? [SPLIT_HINT] : []
    );
    const blockers = await bg("session:writeBlockers", { key: s.key });
    if (blockers.length) {
      return showGr(gr, {
        tone: "warn",
        title: "Chỉ xem kế hoạch — chưa được điền phiếu",
        lines: head.concat(blockers.map((b) => `• ${CLAIM_MSG[b] || b}`)),
        table: planTable(plan),
        buttons: [cancelButton(env, s)],
      });
    }
    if (!onGrPageOf(gr)) {
      // Nút / tự điền chỉ trong khung của trang phiếu; trang khác (vd. /chi-tiet-so) chỉ mở phiếu.
      return showGr(gr, {
        tone: stopped ? "warn" : "info",
        title: `${gr.code}: Nextwaves đã nhận — mở phiếu để điền`,
        lines: head.concat([`Mở trang phiếu ${gr.code}: extension tự điền đúng kế hoạch #${plan.hash}.`]),
        table: planTable(plan),
        buttons: [{ label: `Mở phiếu ${gr.code}`, onClick: () => location.assign(E.api.posGrPage(env, gr.id)) }, cancelButton(env, s)],
      });
    }
    // v0.4.0 (C3): lượt vừa nhận → TỰ điền một lần ở tab này (đợi khung gắn đúng trang phiếu). Dừng giữa chừng → nút "Đọc lại và điền tiếp".
    const autoKey = `${s.key}|${(s.nwResult && s.nwResult.at) || ""}`;
    if (s.state === "received" && !autoTried.has(autoKey)) {
      showGr(gr, { tone: "busy", title: `${gr.code}: Nextwaves đã nhận — chuẩn bị tự điền`, lines: head, table: planTable(plan) });
      // Đánh dấu khi thật sự thử (kế hoạch sạch): kế hoạch chặn (vd. tra QR lỗi tạm) → "Kiểm tra lại" xong vẫn tự điền được.
      autoTried.add(autoKey);
      if (await waitAnchored(gr, T.autoAnchorWaitMs)) {
        runApply(env, gr, s, plan, { how: "auto" }); // không chờ trong vòng đánh giá (applying chặn vẽ lại tới khi xong)
        return;
      }
    }
    const cooling = s.retryNotBefore && s.retryNotBefore > Date.now();
    return showGr(gr, {
      tone: stopped ? "warn" : "info",
      title: stopped ? `${gr.code}: điền phiếu bị dừng` : `${gr.code}: sẵn sàng điền`,
      lines: head.concat(cooling ? [`Kết quả lần trước chưa rõ — chờ tới ${new Date(s.retryNotBefore).toLocaleTimeString("vi-VN")} rồi bấm.`] : []),
      table: planTable(plan),
      buttons: [{ label: stopped ? `Đọc lại và điền tiếp · #${plan.hash} (${plan.summary.toWrite} UID)` : `Điền vào phiếu ${gr.code} · #${plan.hash} (${plan.summary.toWrite} UID)`, onClick: () => runApply(env, gr, s, plan, { how: stopped ? "retry" : "auto" }) }, cancelButton(env, s)],
    });
  }

  async function waitAnchored(gr, ms) {
    const t0 = Date.now();
    for (;;) {
      if (onGrPageOf(gr) && grPanel.anchoredFor(gr.code)) return true;
      if (Date.now() - t0 >= ms) return false;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  function onGrPageOf(gr) {
    const page = pageNow();
    return !!page && page.kind === "gr" && page.grId === String(gr.id).toLowerCase();
  }

  async function runApply(env, gr, s, plan, opts) {
    const how = opts && opts.how === "retry" ? "retry" : "auto";
    if (applying) return;
    // Chỉ ghi khi khung đang gắn đúng chỗ trên trang của đúng phiếu (fail closed).
    if (!onGrPageOf(gr) || !grPanel.anchoredFor(gr.code)) {
      showError("Không điền được", [`Khung extension chưa gắn đúng trang phiếu ${gr.code} — không ghi gì.`], [{ label: "Kiểm tra lại", onClick: retryUi }], gr);
      return;
    }
    applying = true; // chặn vòng đánh giá vẽ lại panel trong lúc giành quyền / ghi
    let claim = null;
    try {
      claim = await bg("session:claimApply", { key: s.key, token: tabToken, grCode: gr.code, planHash: plan.hash, how });
    } catch (err) {
      claim = { ok: false, reason: String((err && err.message) || err) };
    }
    if (!claim || !claim.ok) {
      applying = false;
      showError("Không điền được", [CLAIM_MSG[claim && claim.reason] || (claim && claim.reason) || "?"], [{ label: "Kiểm tra lại", onClick: refresh }], gr);
      return;
    }
    let leaseLost = false;
    const renew = async () => {
      if (leaseLost) return false;
      let ok = false;
      try {
        ok = (await bg("session:renewLease", { key: s.key, token: tabToken })) === true;
      } catch (_) {
        ok = false;
      }
      if (!ok) leaseLost = true;
      return ok;
    };
    const renewTimer = setInterval(renew, T.leaseRenewMs);
    const n = plan.steps.length;
    let i = 0;
    let res = null;
    try {
      const api = {
        getGr: async () => {
          const r = await posGet(env, E.api.grDetail(env, gr.id));
          if (!r.ok) throw new Error(`http ${r.status}`);
          return P.normalizeGr(r.json);
        },
        beforePut: renew, // gia hạn và xác nhận còn quyền ngay trước mỗi PUT
        putDetail: async (step, body) => {
          const r = await posPut(env, E.api.grDetailLine(env, gr.id, step.itemId, step.detailId), body);
          return { ok: r.ok, status: r.status, body: r.json };
        },
      };
      res = await A.runPlan(plan, api, (e) => {
        if (e.type === "done" || e.type === "already") i += 1;
        if (e.type === "sending") showGr(gr, { tone: "busy", title: `Đang điền ${i + 1}/${n} — CHƯA bấm HOÀN THÀNH`, lines: [`${e.step.productName || e.step.productId} · lô ${e.step.lotDate}: ${e.step.before} → ${e.step.target}`, `Kế hoạch #${plan.hash}. Bấm HOÀN THÀNH lúc đang điền dở, POS sẽ đóng phiếu thiếu.`] });
        logTo(s.key, { type: `apply_${e.type}`, detailId: e.step && e.step.detailId, reason: e.reason, status: e.status });
      });
    } catch (err) {
      res = { ok: false, reason: "unknown", error: String((err && err.message) || err) };
    } finally {
      clearInterval(renewTimer);
    }
    // v0.4.0 (A9): PUT trả 5xx / 0 có thể đã lưu muộn → "chưa rõ" (chờ cooldown, đọc lại rồi lập kế hoạch mới), không chạy lại ngay.
    if (!res.ok && res.reason === "put_failed" && (!res.status || res.status >= 500)) res = Object.assign({}, res, { reason: "put_uncertain" });
    const uncertain = !res.ok && ["unknown", "verify_read_failed", "verify_failed", "put_uncertain"].includes(res.reason);
    // Khớp cuối (plan C3): đọc lại CẢ phiếu — mọi lô đúng kế hoạch, đúng tập UID Nextwaves, không mã lạ. Audit v0.4.0 P3-4: làm TRƯỚC khi
    // kết thúc lượt ghi để kết quả lưu vào phiên (applyResult.verify) — tải lại trang (F5) vẫn thấy cảnh báo, không thành khung xanh.
    let v = null;
    if (res.ok) {
      let fresh = null;
      try {
        const r = await posGet(env, E.api.grDetail(env, gr.id));
        fresh = r.ok ? P.normalizeGr(r.json) : null;
      } catch (_) {
        fresh = null;
      }
      v = fresh ? PL.verifyFinal(plan, fresh, unitsForPlan(s)) : { ok: false, diffs: [{ why: "read_failed", detailId: null }] };
    }
    let finished = false;
    try {
      finished = await bg("session:finishApply", {
        key: s.key,
        token: tabToken,
        ok: res.ok,
        uncertain,
        result: res.ok ? { at: Date.now(), hash: plan.hash, steps: n, uids: plan.summary.toWrite + plan.summary.alreadyOnGr, notFull: plan.warnings.length, verify: v ? { ok: v.ok, diffs: v.diffs.slice(0, 10) } : null } : null,
        error: res.ok ? null : { reason: res.reason, status: res.status || null, detailId: res.step ? res.step.detailId : null, hash: plan.hash },
      });
    } catch (_) {
      finished = false;
    }
    if (res.ok && finished && v && !v.ok) {
      applying = false;
      logTo(s.key, { type: "final_verify_failed", diffs: v.diffs.slice(0, 10) });
      return showGr(gr, verifyFailedView(gr, v.diffs));
    }
    applying = false;
    if (res.ok && finished) {
      // Tải lại để màn POS hiện số lượng / mã vừa điền; sau đó khung báo "kiểm danh sách rồi bấm HOÀN THÀNH".
      reloading = true;
      showGr(gr, { tone: "ok", title: `Đã điền ${plan.summary.toWrite} mã — đang tải lại phiếu…`, lines: ["Chưa bấm HOÀN THÀNH: chờ phiếu tải lại rồi kiểm danh sách."] });
      setTimeout(() => location.reload(), T.reloadDelayMs);
      return;
    }
    if (!finished) {
      showError("Mất quyền điền phiếu", ["Tab khác đã tiếp quản hoặc quyền hết hạn. Tab này đã dừng; kiểm tra lại phiếu."], [{ label: "Kiểm tra lại", onClick: refresh }], gr);
      return;
    }
    refresh();
  }

  // ---------- sự kiện ----------
  function onRoute(href) {
    if (href === lastHref) return;
    lastHref = href;
    chosenGrId = null;
    cancelClick("Đã rời trang — huỷ lượt chuẩn bị");
    // v0.2.4: gỡ khung của trang cũ ngay, kể cả khi đang ghi (PM audit rev 1 P2) — tiến trình ghi vẫn chạy tới hết; view của nó chỉ
    // hiện lại nếu quay về đúng trang phiếu (showGr).
    panel.hide();
    refresh();
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.mark !== HOOK || !m.payload) return;
    if (m.type === "auth" && E.envById(m.payload.envId) && m.payload.headers && m.payload.headers.authorization) {
      if (onAuth(m.payload.envId, m.payload.headers)) refresh();
    } else if (m.type === "gr-status") onGrStatus(m.payload);
    else if (m.type === "gr-list-request") onListRequest(m.payload);
    else if (m.type === "gr-list") onListResponse(m.payload);
    else if (m.type === "route") onRoute(location.href);
  });

  async function onGrStatus(p) {
    if (p.status !== "COMPLETED" || !(p.httpStatus >= 200 && p.httpStatus < 300)) return;
    // v0.2.5 (PM AUDIT-A1 P2): phiếu ĐANG XEM vừa HOÀN THÀNH → trang sắp bỏ vùng sản phẩm. Gỡ ngay khung, dừng chờ chỗ gắn, bỏ lỗi
    // giao diện cũ, bỏ view của lượt đánh giá đang dở. GET lại phiếu (refresh bên dưới) mới là nguồn trạng thái cuối.
    const page = pageNow();
    if (page && page.kind === "gr" && page.grId === lower(p.grId)) {
      statusEpoch += 1;
      panel.hide();
    }
    try {
      const s = await bg("session:get", { envId: p.envId, grId: p.grId });
      if (s && s.state !== "done") await bg("session:update", { key: s.key, patch: { state: "done" }, log: { type: "gr_completed" } });
    } catch (_) {
      /* bỏ qua */
    }
    refresh();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.config) {
      config = changes.config.newValue || null;
      refresh();
      return;
    }
    if (changes.sessions) {
      if (watched.key) {
        // Chỉ khi trạng thái / dữ liệu nhận / lỗi điền / lượt nhận / hạ nhiệt đổi — bỏ qua posTabId / lease / log.
        const s = (changes.sessions.newValue || {})[watched.key];
        if (!s || sessionSig(s) !== watched.sig) refresh();
      } else if (onList) scheduleListSessions();
    }
  });

  // Dự phòng khi hook chưa báo đổi route (vd. trang đổi URL theo cách hook không thấy).
  setInterval(() => {
    if (location.href !== lastHref) onRoute(location.href);
  }, T.pollMs);

  bg("config:get")
    .then((c) => {
      config = c;
      lastHref = location.href;
      refresh();
    })
    .catch(() => {});
  window.postMessage({ mark: ME, type: "hello" }, location.origin);
})();
