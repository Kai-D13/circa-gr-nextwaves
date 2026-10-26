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
 * Ghi W1 chỉ khi operator đã cấp phép một lần cho đúng phiếu này (popup) VÀ bấm nút mang mã kế hoạch (PM audit 24/10 P1.3).
 * Dược sĩ tự bấm HOÀN THÀNH; extension chỉ nghe lời gọi đổi trạng thái để đóng phiên.
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
  const T = Object.assign({ pollMs: 3000, qrConcurrency: 4, reloadDelayMs: 800, httpTimeoutMs: 30000, leaseRenewMs: 15000, qrTtlMs: 10 * 60 * 1000, listSessionsDebounceMs: 300 }, C.tuning || {});
  const HOOK = "cgn/pos-hook";
  const ME = "cgn/pos-content";
  // Khung không được che nút thao tác của phiếu (operator 26/10: che HOÀN THÀNH).
  const panel = C.ui.createPanel("GR ← Nextwaves", { avoidButtons: /^(hoàn thành|hủy|huỷ|hủy phiếu|huỷ phiếu)$/iu });
  const tabToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const lower = (s) => String(s || "").toLowerCase();
  const ACTIVE = new Set(["waiting_nw", "nw_ready", "received", "applying", "applied", "apply_stopped"]);
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
    verify_read_failed: "Ghi xong nhưng không đọc lại được phiếu để kiểm",
    verify_failed: "Đọc lại phiếu không thấy đúng số lượng / mã vừa ghi",
    plan_not_ok: "Kế hoạch có chặn",
  };
  const CLAIM_MSG = {
    no_grant: "Chưa có cấp phép điền cho phiếu này (hoặc cấp phép đã dùng / hết hạn)",
    env_read_only: "Môi trường này chỉ đọc",
    warehouse_unmapped: "Cửa hàng chưa có bảng kho Nextwaves",
    so_many_gr: "SO có nhiều phiếu nhận — chưa chứng minh được đúng lần giao",
    so_gr_unknown: "Không kiểm được đủ / rõ danh sách phiếu nhận của SO",
    nw_many_orders: "Nextwaves có nhiều đơn cùng SO — chưa chứng minh được đúng lần giao",
    lease_held: "Tab khác đang điền phiếu này",
    cooldown: "Lần ghi trước có kết quả chưa rõ — chờ thêm rồi thử lại",
    session_outdated: "Phiên tạo bởi bản extension cũ — mở lại phiếu để tạo phiên mới",
    gr_mismatch: "Cấp phép không đúng phiếu",
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

  function showError(title, lines, buttons) {
    panel.show({ tone: "err", title, lines: [].concat(lines || []), buttons: buttons || [] });
  }

  const sessionSig = (s) => JSON.stringify([s.state, (s.nwResult && s.nwResult.at) || null, s.applyError || null, !!s.scanOk, s.retryNotBefore || null]);
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
      if (s0 && ACTIVE.has(s0.state)) return { status: "existing", session: s0, gr };
      const p = await posGet(env, E.api.poDetail(env, gr.posId, gr.poId), signal);
      guard();
      if (!p.ok) return fail(httpError("GET PO", p));
      const link = P.resolveDelivery(gr, P.normalizePo(p.json), storeId);
      if (!link.ok) {
        if (link.errors.length === 1 && link.errors[0] === "no_delivery_code") return { status: "not_linkable", gr };
        return fail(`${gr.code}: không nối được tới SO thuocsi — ${link.errors.map((c) => LINK_MSG[c] || c).join("; ")}`);
      }
      // Khoá ghi phía POS (PM P3 / P1.6): SO phải có đúng một phiếu nhận (chưa huỷ) ở cửa hàng này, đọc đủ, và đó là phiếu này.
      const found = await searchGrsOfSo(env, storeId, link.soBase, signal);
      guard();
      const lock = P.soWriteLock(found, gr.id);
      guard(); // ngay trước khi tạo phiên
      const s = await bg("session:start", {
        envId: env.id,
        grId: gr.id,
        grCode: gr.code,
        poPosId: gr.poId,
        poPosCode: gr.poCode,
        posId: gr.posId,
        deliveryCode: link.deliveryCode,
        soBase: link.soBase,
        warehouseId: E.warehouseForStore(env, gr.posId),
        fingerprint: P.grFingerprintSource(gr),
        writeLocks: lock ? [lock] : [],
      });
      if (!s) return fail(`${gr.code}: không đọc lại được phiên vừa tạo.`);
      return { status: "started", session: s, gr };
    } catch (err) {
      if (err === CANCELLED || (err && err.name === "AbortError") || (tok && tok.cancelled)) return { status: "cancelled", message: (tok && tok.reason) || LIST_CHANGED };
      return fail(String((err && err.message) || err));
    }
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
      if (!applying) showError("Lỗi extension", String((err && err.message) || err), [{ label: "Thử lại", onClick: refresh }]);
    } finally {
      running = false;
    }
  }

  async function evaluate() {
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
    if (!E.storeAllowed(env, storeId)) {
      if (page.kind === "gr_list") return clearListButtons();
      return showStoreNotAllowed(env);
    }
    if (page.kind === "gr") return evaluateGr(env, storeId, page.grId);
    if (page.kind === "gr_list") return evaluateGrList(env, storeId);
    return evaluateSo(env, storeId, page.so);
  }

  function showStoreNotAllowed(env) {
    unwatch();
    panel.show({ tone: "info", title: `${env.label}: extension chỉ chạy cho cửa hàng thử`, lines: ["Cửa hàng đang đăng nhập không thuộc danh sách chạy thử của môi trường này."] });
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
    const found = await searchGrsOfSo(env, storeId, so);
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
      lines: ["Chọn phiếu muốn nhận bằng RFID (chỉ đọc; điền phiếu bị khoá khi SO có nhiều phiếu):"],
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
      if (s && gr.status === "COMPLETED" && s.state !== "done" && s.state !== "applying") s = await bg("session:update", { key: s.key, patch: { state: "done" }, log: { type: "gr_completed_seen" } });
      if (s) return renderSession(env, gr, s);
      unwatch();
      return panel.hide();
    }

    if (!s || s.state === "done") {
      unwatch();
      const p = await posGet(env, E.api.poDetail(env, gr.posId, gr.poId));
      if (!p.ok) return showError("Không đọc được PO của phiếu nhận", httpError("GET PO", p), [{ label: "Thử lại", onClick: refresh }]);
      const link = P.resolveDelivery(gr, P.normalizePo(p.json), storeId);
      if (!link.ok) {
        // PO không có mã giao thuocsi: không phải phiếu từ thuocsi → không phải việc của extension.
        if (link.errors.length === 1 && link.errors[0] === "no_delivery_code") return panel.hide();
        return showError(`${gr.code}: không nối được tới SO thuocsi`, link.errors.map((c) => LINK_MSG[c] || c));
      }
      const codes = gr.items.reduce((n, it) => n + it.details.reduce((m, d) => m + d.qrCodes.length, 0), 0);
      return panel.show({
        tone: codes > 0 ? "warn" : "info",
        title: `${gr.code} · ${link.deliveryCode}`,
        lines: [
          codes > 0
            ? `Phiếu đã có ${codes} mã quét. Kết quả Nextwaves phải chứa đúng các mã này, đúng lô, thì mới điền tiếp được.`
            : "Bấm “Nhận hàng bằng RFID” để mở màn quét Nextwaves cho phiếu này.",
        ],
        buttons: [{ label: START_LABEL, onClick: () => startOnGrPage(env, storeId, gr) }],
      });
    }
    if (s.posId && s.posId !== storeId) return showError("Phiên này thuộc cửa hàng khác cửa hàng đang đăng nhập", s.grCode);
    return renderSession(env, gr, s);
  }

  async function startOnGrPage(env, storeId, gr) {
    if (click) return;
    const tok = newClick({ kind: "gr", grId: gr.id, code: gr.code, envId: env.id, storeId });
    panel.show({ tone: "busy", title: `Đang kiểm ${gr.code}…`, lines: ["Đọc lại phiếu, PO và SO trước khi mở Nextwaves."] });
    const res = await startFromGr(env, storeId, gr.id, gr.code, tok);
    if (click === tok) click = null;
    if (res.status === "started" || res.status === "existing") return refresh();
    if (res.status === "cancelled") return refresh();
    if (res.status === "not_linkable") return refresh();
    showError(`${gr.code}: chưa mở được Nextwaves`, res.message, [{ label: "Thử lại", onClick: refresh }]);
  }

  // ---------- trang danh sách ----------
  function leaveList() {
    if (!onList) return;
    onList = false;
    listCtx = null;
    listNote = null;
    if (listSessionsTimer) clearTimeout(listSessionsTimer);
    listSessionsTimer = null;
    if (L) L.deactivate();
  }

  function clearListButtons() {
    listCtx = null;
    if (onList && L) L.show(null);
    panel.hide();
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
    if (listNote) panel.show(listNote);
    else panel.hide();
  }

  function renderList() {
    if (!L || !onList) return;
    const ctx = listCtx;
    if (!ctx || list.envId !== ctx.env.id || !list.ok) return L.show(null);
    const byCode = new Map();
    for (const r of list.rows.values()) {
      if (!P.isReceivable({ status: r.status }) || r.posId !== ctx.storeId || notLinkable.has(r.id)) continue;
      const s = listSessions.get(r.id);
      let v;
      if (click && click.kind === "list" && click.grId === r.id) v = { kind: "busy", label: "Đang kiểm phiếu…", disabled: true };
      else if (s && (s.state === "waiting_nw" || s.state === "nw_ready")) v = { kind: "open_nw", label: "Đang nhận trên Nextwaves", title: "Mở lại tab Nextwaves của phiếu này" };
      else if (s) v = { kind: "open_gr", label: s.state === "applied" ? "Đã điền — mở phiếu" : "Đã nhận — mở phiếu", title: "Mở phiếu để lập kế hoạch / điền / HOÀN THÀNH" };
      else v = { kind: "start", label: START_LABEL, disabled: !!click, title: "Đọc lại phiếu + PO + SO rồi mở màn quét Nextwaves" };
      byCode.set(r.code, Object.assign({ grId: r.id }, v));
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
      if (s) bg("session:reopenNw", { key: s.key }).catch(() => {});
      return;
    }
    if (kind === "open_gr") return location.assign(E.api.posGrPage(env, grId));
    if (kind !== "start" || click) return;
    const tok = newClick({ kind: "list", grId, code, row, reqSeq: list.shownSeq, queryKey: list.shownQueryKey, envId: env.id, storeId });
    listNote = { tone: "busy", title: `Đang kiểm ${code}…`, lines: ["Đọc lại phiếu, PO và SO trước khi mở Nextwaves."] };
    panel.show(listNote);
    renderList();
    const res = await startFromGr(env, storeId, grId, code, tok);
    if (click === tok) click = null;
    if (!onList) return;
    if (res.status === "started" || res.status === "existing") {
      listNote = { tone: "ok", title: `${code}: đã mở màn quét Nextwaves`, lines: ["Nhận hàng trên tab Nextwaves. Nhận xong, extension tự mở phiếu này để lập kế hoạch điền."] };
    } else if (res.status === "not_linkable") {
      notLinkable.add(grId);
      listNote = { tone: "info", title: `${code}: không nhận bằng RFID được`, lines: ["Phiếu này không đi từ SO thuocsi (PO không có mã giao)."] };
    } else if (res.status === "cancelled") {
      listNote = { tone: "warn", title: res.message || LIST_CHANGED, lines: [] };
    } else {
      listNote = { tone: "err", title: `${code}: chưa mở được Nextwaves`, lines: [res.message] };
    }
    listNote.buttons = [
      {
        label: "Đóng",
        secondary: true,
        onClick: () => {
          listNote = null;
          panel.hide();
        },
      },
    ];
    refresh();
  }

  if (L)
    L.attach({
      onSelect: (row, grId, code, kind) => {
        onListSelect(row, grId, code, kind).catch((err) => {
          if (click) click = null;
          showError("Lỗi extension", String((err && err.message) || err));
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
  function sessionLines(s) {
    return [`Phiếu ${s.grCode} · ${s.poPosCode} · mã giao ${s.deliveryCode}`, s.nwPoNumber ? `Nextwaves: ${s.nwPoNumber} (${s.nwRefId || s.soBase})` : `Nextwaves: tìm theo ${s.soBase}`];
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
        return panel.show({
          tone: "busy",
          title: STATE_LABEL[s.state],
          lines: sessionLines(s).concat(["Trên tab Nextwaves: đặt hàng lên reader rồi bấm “Xác nhận nhận hàng”. Nhận đủ xong extension đưa về đây và lập kế hoạch điền phiếu."]),
          buttons: [{ label: "Mở tab Nextwaves", onClick: () => bg("session:reopenNw", { key: s.key }) }, cancelButton(env, s)],
        });
      case "received":
      case "apply_stopped":
        return planAndOffer(env, gr, s);
      case "applying": {
        const expired = !(s.lease && s.lease.expiresAt > Date.now());
        if (expired) return planAndOffer(env, gr, s);
        return panel.show({ tone: "busy", title: "Đang điền phiếu ở tab khác", lines: sessionLines(s) });
      }
      case "applied":
        return renderApplied(env, gr, s);
      case "done":
        return panel.show({
          tone: "ok",
          title: `${s.grCode}: đã HOÀN THÀNH`,
          lines: sessionLines(s),
          buttons: [{ label: "Đóng", secondary: true, onClick: () => panel.hide() }],
        });
      default:
        return panel.show({ tone: "warn", title: `Trạng thái phiên lạ: ${s.state}`, lines: sessionLines(s), buttons: [cancelButton(env, s)] });
    }
  }

  function renderApplied(env, gr, s) {
    const uids = ((s.nwResult && s.nwResult.units) || []).map((u) => u.uid);
    const codes = new Set(gr.items.flatMap((it) => it.details.flatMap((d) => d.qrCodes)));
    const missing = uids.filter((u) => !codes.has(u));
    if (missing.length) {
      return panel.show({
        tone: "warn",
        title: `${gr.code}: phiếu thiếu ${missing.length}/${uids.length} UID đã điền`,
        lines: sessionLines(s).concat([`Thiếu: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? "…" : ""}`, "Kiểm tra phiếu trước khi bấm HOÀN THÀNH."]),
      });
    }
    return panel.show({
      tone: "ok",
      title: `${gr.code}: đã điền ${uids.length} UID từ Nextwaves`,
      lines: sessionLines(s).concat(["Kiểm tra số lượng từng lô trên phiếu rồi bấm HOÀN THÀNH."]),
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
    const units = (s.nwResult && s.nwResult.units) || [];
    panel.show({ tone: "busy", title: `Đang tra ${units.length} UID trên POS…`, lines: sessionLines(s) });
    // Tra QR MỌI UID (kể cả UID đã nằm trên phiếu — PM P1.2 / P2.2).
    const scope = `${s.key}|${(s.nwResult && s.nwResult.at) || ""}`;
    const qrByUid = await lookupQr(env, [...new Set(units.map((u) => u.uid).filter(Boolean))], scope);
    const plan = PL.buildPlan(gr, units, qrByUid);
    logTo(s.key, { type: "plan", ok: plan.ok, complete: plan.complete, hash: plan.hash, steps: plan.steps.length, blocked: plan.blocked.map((b) => b.code), summary: plan.summary });

    if (plan.complete && s.state !== "applying") {
      // Mọi UID đã nằm đúng lô, lượng nhất quán: không ghi gì, chỉ đóng bước điền.
      const s2 = await bg("session:update", { key: s.key, patch: { state: "applied" }, log: { type: "applied_already", hash: plan.hash } });
      return renderApplied(env, gr, s2 || s);
    }
    if (!plan.ok) {
      return panel.show({
        tone: "err",
        title: `${gr.code}: không điền được — ${plan.blocked.length} điểm chặn`,
        lines: sessionLines(s).concat(["Không ghi gì vào phiếu (chặn cả gói).", ...blockedLines(plan)]),
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
    const stopped = s.state === "apply_stopped" && s.applyError;
    const head = sessionLines(s).concat(
      stopped ? [`Lần điền trước dừng: ${APPLY_MSG[s.applyError.reason] || s.applyError.reason}${s.applyError.status ? ` (HTTP ${s.applyError.status})` : ""}`] : [],
      [`Kế hoạch #${plan.hash}: điền ${plan.summary.toWrite} UID vào ${plan.steps.length} lô${plan.summary.alreadyOnGr ? ` (${plan.summary.alreadyOnGr} UID đã nằm đúng lô)` : ""}.`],
      plan.warnings.map((w) => `• Sản phẩm ${w.productId}: sau khi điền mới ${w.received}/${w.quantity} — phần còn lại dược sĩ xử lý tay.`)
    );
    const blockers = await bg("session:writeBlockers", { key: s.key });
    if (blockers.length) {
      return panel.show({
        tone: "warn",
        title: "Chỉ xem kế hoạch — chưa được điền phiếu",
        lines: head.concat(blockers.map((b) => `• ${CLAIM_MSG[b] || b}`)),
        table: planTable(plan),
        buttons: [cancelButton(env, s)],
      });
    }
    const grant = await bg("grant:get", { envId: env.id, grCode: gr.code });
    if (!grant) {
      return panel.show({
        tone: "info",
        title: "Chỉ xem kế hoạch — chưa có cấp phép điền",
        lines: head.concat([`Muốn điền: operator mở popup extension → “Cho phép điền 1 lần” cho ${gr.code}.`]),
        table: planTable(plan),
        buttons: [cancelButton(env, s)],
      });
    }
    return panel.show({
      tone: stopped ? "warn" : "info",
      title: `Đã có cấp phép điền ${gr.code} (1 lần)`,
      lines: head.concat([`Cấp phép hết hạn lúc ${new Date(grant.expiresAt).toLocaleTimeString("vi-VN")}. Bấm nút dưới để điền đúng kế hoạch #${plan.hash}.`]),
      table: planTable(plan),
      buttons: [{ label: `Điền vào phiếu ${gr.code} · kế hoạch #${plan.hash} (${plan.summary.toWrite} UID)`, onClick: () => runApply(env, gr, s, plan) }, cancelButton(env, s)],
    });
  }

  async function runApply(env, gr, s, plan) {
    if (applying) return;
    applying = true; // chặn vòng đánh giá vẽ lại panel trong lúc giành quyền / ghi
    let claim = null;
    try {
      claim = await bg("session:claimApply", { key: s.key, token: tabToken, grCode: gr.code, planHash: plan.hash });
    } catch (err) {
      claim = { ok: false, reason: String((err && err.message) || err) };
    }
    if (!claim || !claim.ok) {
      applying = false;
      showError("Không điền được", [CLAIM_MSG[claim && claim.reason] || (claim && claim.reason) || "?"], [{ label: "Kiểm tra lại", onClick: refresh }]);
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
        if (e.type === "sending") panel.show({ tone: "busy", title: `Đang điền ${i + 1}/${n} · kế hoạch #${plan.hash}`, lines: [`${e.step.productName || e.step.productId} · lô ${e.step.lotDate}: ${e.step.before} → ${e.step.target}`] });
        logTo(s.key, { type: `apply_${e.type}`, detailId: e.step && e.step.detailId, reason: e.reason, status: e.status });
      });
    } catch (err) {
      res = { ok: false, reason: "unknown", error: String((err && err.message) || err) };
    } finally {
      clearInterval(renewTimer);
    }
    const uncertain = !res.ok && ["unknown", "verify_read_failed", "verify_failed"].includes(res.reason);
    let finished = false;
    try {
      finished = await bg("session:finishApply", {
        key: s.key,
        token: tabToken,
        ok: res.ok,
        uncertain,
        result: res.ok ? { at: Date.now(), hash: plan.hash, steps: n, uids: plan.summary.toWrite + plan.summary.alreadyOnGr } : null,
        error: res.ok ? null : { reason: res.reason, status: res.status || null, detailId: res.step ? res.step.detailId : null, hash: plan.hash },
      });
    } catch (_) {
      finished = false;
    }
    applying = false;
    if (res.ok && finished) {
      // Tải lại để màn POS hiện số lượng / mã vừa điền.
      reloading = true;
      panel.show({ tone: "ok", title: `Đã điền ${plan.summary.toWrite} UID — đang tải lại phiếu…`, lines: [] });
      setTimeout(() => location.reload(), T.reloadDelayMs);
      return;
    }
    if (!finished) {
      showError("Mất quyền điền phiếu", ["Tab khác đã tiếp quản hoặc quyền hết hạn. Tab này đã dừng; kiểm tra lại phiếu."], [{ label: "Kiểm tra lại", onClick: refresh }]);
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
    // Cấp phép: chỉ khi bản ghi của ĐÚNG phiếu đang xem đổi (thêm / dùng / thu hồi).
    if (changes.grants && watched.key && watched.grCode) {
      const k = `${watched.envId}:${String(watched.grCode).trim().toUpperCase()}`;
      const o = (changes.grants.oldValue || {})[k] || null;
      const n = (changes.grants.newValue || {})[k] || null;
      if (JSON.stringify(o) !== JSON.stringify(n)) refresh();
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
