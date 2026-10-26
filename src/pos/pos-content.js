/*
 * Trang POS (ISOLATED world). Hai đường vào:
 *   (1) /danh-sach-phieu-nhan-hang/<grId>
 *   (2) "Nhập SO thuocsi" → /chi-tiet-so/<SO>
 * GR → PO POS → thuocsi_delivery_code → SO gốc → background mở màn quét Nextwaves (/vi/purchases/receive?po=<SO>).
 * Khi phiên sang "received" (tab Nextwaves đã đọc xong kết quả nhận): tra QR từng UID trên POS → kế hoạch → bảng kế hoạch.
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
  const T = Object.assign({ pollMs: 700, qrConcurrency: 4, reloadDelayMs: 800, httpTimeoutMs: 30000, leaseRenewMs: 15000, restartGuardMs: 10000 }, C.tuning || {});
  const HOOK = "cgn/pos-hook";
  const ME = "cgn/pos-content";
  // Khung không được che nút thao tác của phiếu (operator 26/10: che HOÀN THÀNH).
  const panel = C.ui.createPanel("GR ← Nextwaves", { avoidButtons: /^(hoàn thành|hủy|huỷ|hủy phiếu|huỷ phiếu)$/iu });
  const tabToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const lower = (s) => String(s || "").toLowerCase();

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
  const authByEnv = {}; // envId → header (chỉ trong bộ nhớ tab)
  let lastHref = "";
  let running = false;
  let again = false;
  let applying = false;
  let reloading = false;
  let watched = { key: null, state: null }; // phiên của trang đang mở — đổi trạng thái thì đánh giá lại
  let chosenGrId = null; // đường (2): GR dược sĩ chọn khi SO có nhiều GR
  let lastStart = { grId: null, at: 0 }; // lần tạo phiên gần nhất trong tab (chống vòng lặp tạo phiên)

  // ---------- tiện ích ----------
  async function bg(type, extra) {
    const r = await chrome.runtime.sendMessage(Object.assign({ type }, extra || {}));
    if (!r || !r.ok) throw new Error((r && r.error) || "background");
    return r.data;
  }
  const logTo = (key, log) => bg("session:log", { key, log }).catch(() => {});

  // Lỗi mạng / hết giờ → NÉM (người gọi quyết: đọc thì báo lỗi, PUT thì "kết quả không rõ").
  async function http(url, opts) {
    const o = opts || {};
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), T.httpTimeoutMs) : null;
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
    const h = Object.assign({}, authByEnv[env.id] || {});
    if (withBody) h["content-type"] = "application/json";
    return h;
  }
  const posGet = (env, url) => http(url, { headers: apiHeaders(env, false) });
  const posPut = (env, url, body) => http(url, { method: "PUT", headers: apiHeaders(env, true), body: JSON.stringify(body) });

  function httpError(what, r) {
    const msg = r && r.json && (r.json.message || r.json.error) ? ` — ${String(r.json.message || r.json.error).slice(0, 200)}` : "";
    const hint = r && r.status === 401 ? " Phiên đăng nhập POS có thể đã hết hạn: tải lại trang." : "";
    return `${what}: HTTP ${r ? r.status : "?"}${msg}.${hint}`;
  }

  function showError(title, lines, buttons) {
    panel.show({ tone: "err", title, lines: [].concat(lines || []), buttons: buttons || [] });
  }

  const dismissKey = (envId, grId) => `cgn:dismiss:${envId}:${grId}`;
  function isDismissed(envId, grId) {
    try {
      return sessionStorage.getItem(dismissKey(envId, grId)) === "1";
    } catch (_) {
      return false;
    }
  }
  function setDismissed(envId, grId, v) {
    try {
      if (v) sessionStorage.setItem(dismissKey(envId, grId), "1");
      else sessionStorage.removeItem(dismissKey(envId, grId));
    } catch (_) {
      /* bỏ qua */
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
    if (!page) {
      watched = { key: null, state: null };
      panel.hide();
      return;
    }
    if (!authByEnv[env.id]) {
      panel.show({ tone: "busy", title: "Đang chờ POS tải dữ liệu…", lines: [] });
      return;
    }
    // Cửa hàng đang đăng nhập là điều kiện bắt buộc của cả hai đường vào (PM P1.4).
    const storeId = currentStore(env);
    if (!storeId) {
      watched = { key: null, state: null };
      return showError("Không xác định được cửa hàng đang đăng nhập", "POS chưa gửi x-store-id — extension không chạy.");
    }
    if (!E.storeAllowed(env, storeId)) return showStoreNotAllowed(env);
    if (page.kind === "gr") return evaluateGr(env, storeId, page.grId, location.href);
    return evaluateSo(env, storeId, page.so);
  }

  function currentStore(env) {
    return lower((authByEnv[env.id] || {})["x-store-id"]);
  }

  function showStoreNotAllowed(env) {
    watched = { key: null, state: null };
    panel.show({ tone: "info", title: `${env.label}: extension chỉ chạy cho cửa hàng thử`, lines: ["Cửa hàng đang đăng nhập không thuộc danh sách chạy thử của môi trường này."] });
  }

  // Tìm GR theo SO + kiểm đọc đủ / rõ (pos-model.checkSoGrs — PM audit v0.1.1 P1.6). Dùng chung cho hai đường vào.
  async function searchGrsOfSo(env, storeId, so) {
    const digits = K.soDigits(so);
    if (!digits) return { ok: false, reason: "so_unreadable", error: "Không đọc được số SO" };
    const r = await posGet(env, E.api.grSearchBySo(env, digits, storeId));
    if (!r.ok) return { ok: false, reason: "http", error: httpError("Tìm GR theo SO", r) };
    const check = P.checkSoGrs(r.json, storeId);
    if (!check.ok) return Object.assign({}, check, { error: soCheckText(check) });
    return check;
  }

  function soCheckText(c) {
    const facts = c.total === undefined ? "" : ` (total ${c.total}, đã đọc ${c.read})`;
    return (SO_CHECK_MSG[c.reason] || c.reason) + facts + (c.code ? ` — ${c.code}` : "");
  }

  // Đường (2): /chi-tiet-so/<SO>
  async function evaluateSo(env, storeId, so) {
    const found = await searchGrsOfSo(env, storeId, so);
    if (!found.ok) {
      watched = { key: null, state: null };
      return showError("Không đọc đủ danh sách phiếu nhận của SO — extension không đi tiếp", found.error, [{ label: "Thử lại", onClick: refresh }]);
    }
    const all = found.list;
    if (chosenGrId && all.some((g) => g.id === chosenGrId)) return evaluateGr(env, storeId, chosenGrId, location.href);
    const receivable = all.filter(P.isReceivable);
    if (receivable.length === 1) return evaluateGr(env, storeId, receivable[0].id, location.href);
    if (receivable.length === 0) {
      for (const g of all) {
        const s = await bg("session:get", { envId: env.id, grId: g.id });
        if (s) return evaluateGr(env, storeId, g.id, location.href);
      }
      watched = { key: null, state: null };
      return panel.show({ tone: "info", title: `SO ${so}: không có phiếu nhận đang chờ nhận`, lines: [] });
    }
    watched = { key: null, state: null };
    panel.show({
      tone: "warn",
      title: `SO ${so} có ${receivable.length} phiếu nhận đang chờ`,
      lines: ["Chọn phiếu muốn nhận bằng Nextwaves (chỉ đọc; điền phiếu bị khoá khi SO có nhiều phiếu):"],
      buttons: receivable.map((g) => ({
        label: `${g.code} · ${g.poCode}`,
        onClick: () => {
          chosenGrId = g.id;
          refresh();
        },
      })),
    });
  }

  // Đường (1) (và (2) sau khi đã chọn được GR).
  async function evaluateGr(env, storeId, grId, returnUrl) {
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
      watched = { key: null, state: null };
      return panel.hide();
    }

    if (!s || s.state === "done") {
      const p = await posGet(env, E.api.poDetail(env, gr.posId, gr.poId));
      if (!p.ok) return showError("Không đọc được PO của phiếu nhận", httpError("GET PO", p), [{ label: "Thử lại", onClick: refresh }]);
      const link = P.resolveDelivery(gr, P.normalizePo(p.json), storeId);
      if (!link.ok) {
        watched = { key: null, state: null };
        // PO không có mã giao thuocsi: không phải phiếu từ thuocsi → không phải việc của extension.
        if (link.errors.length === 1 && link.errors[0] === "no_delivery_code") return panel.hide();
        return showError(`${gr.code}: không nối được tới SO thuocsi`, link.errors.map((c) => LINK_MSG[c] || c));
      }
      const start = async () => {
        setDismissed(env.id, gr.id, false);
        lastStart = { grId: gr.id, at: Date.now() };
        // Khoá ghi phía POS (PM P3 / P1.6): SO phải có đúng một phiếu nhận (chưa huỷ) ở cửa hàng này, đọc đủ, và đó là phiếu này.
        const found = await searchGrsOfSo(env, storeId, link.soBase);
        const lock = P.soWriteLock(found, gr.id);
        const writeLocks = lock ? [lock] : [];
        await bg("session:start", {
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
          writeLocks,
          returnUrl,
        });
        refresh();
      };
      const codes = gr.items.reduce((n, it) => n + it.details.reduce((m, d) => m + d.qrCodes.length, 0), 0);
      if (isDismissed(env.id, gr.id) || codes > 0) {
        watched = { key: null, state: null };
        return panel.show({
          tone: codes > 0 ? "warn" : "info",
          title: `${gr.code} · ${link.deliveryCode}`,
          lines: codes > 0 ? [`Phiếu đã có ${codes} mã quét. Kết quả Nextwaves phải chứa đúng các mã này, đúng lô, thì mới điền tiếp được.`] : ["Đã huỷ nhận bằng Nextwaves cho phiếu này trong tab."],
          buttons: [{ label: "Nhận bằng Nextwaves", onClick: start }],
        });
      }
      // Chống vòng lặp: vừa tạo phiên cho phiếu này mà background vẫn không trả lại phiên → báo lỗi, không tạo lại
      // (tránh đọc GR / PO / tìm GR liên tục lên API POS).
      if (lastStart.grId === gr.id && Date.now() - lastStart.at < T.restartGuardMs) {
        watched = { key: null, state: null };
        return showError(`${gr.code}: không đọc lại được phiên vừa tạo`, "Extension dừng để không gọi API POS lặp lại. Tải lại trang hoặc báo dev.", [
          {
            label: "Thử lại",
            onClick: () => {
              lastStart = { grId: null, at: 0 };
              refresh();
            },
          },
        ]);
      }
      await start();
      return;
    }
    if (s.posId && s.posId !== storeId) return showError("Phiên này thuộc cửa hàng khác cửa hàng đang đăng nhập", s.grCode);
    return renderSession(env, gr, s);
  }

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
        setDismissed(env.id, s.grId, true);
        refresh();
      },
    };
  }

  async function renderSession(env, gr, s) {
    watched = { key: s.key, state: s.state };
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
  async function lookupQr(env, uids) {
    const out = {};
    let i = 0;
    async function worker() {
      while (i < uids.length) {
        const uid = uids[i++];
        try {
          const r = await http(E.api.qrLookup(env, uid));
          out[uid] = r.ok ? P.normalizeQrLookup(r.json, uid) : { ok: false, reason: `http_${r.status}` };
        } catch (_) {
          out[uid] = { ok: false, reason: "network" };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(T.qrConcurrency, uids.length) }, worker));
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
    const qrByUid = await lookupQr(env, [...new Set(units.map((u) => u.uid).filter(Boolean))]);
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
        buttons: [{ label: "Kiểm tra lại", onClick: refresh }, cancelButton(env, s)],
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
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.mark !== HOOK || !m.payload) return;
    if (m.type === "auth" && E.envById(m.payload.envId) && m.payload.headers && m.payload.headers.authorization) {
      const first = !authByEnv[m.payload.envId];
      authByEnv[m.payload.envId] = m.payload.headers;
      if (first) refresh();
    } else if (m.type === "gr-status") onGrStatus(m.payload);
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
    if (changes.grants && watched.key) {
      refresh();
      return;
    }
    if (changes.sessions && watched.key) {
      const s = (changes.sessions.newValue || {})[watched.key];
      if (!s || s.state !== watched.state) refresh();
    }
  });

  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      chosenGrId = null;
      refresh();
    }
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
