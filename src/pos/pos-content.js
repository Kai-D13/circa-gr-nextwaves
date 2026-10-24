/*
 * Trang POS (ISOLATED world). Hai đường vào:
 *   (1) /danh-sach-phieu-nhan-hang/<grId>
 *   (2) "Nhập SO thuocsi" → /chi-tiet-so/<SO>
 * GR → PO POS → thuocsi_delivery_code → SO gốc → background mở màn quét Nextwaves (/vi/purchases/receive?po=<SO>).
 * Khi phiên sang "received" (tab Nextwaves đã đọc xong kết quả nhận): tra QR từng UID trên POS → kế hoạch → ghi W1 theo writeMode.
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
  const T = Object.assign({ pollMs: 700, qrConcurrency: 4, reloadDelayMs: 800 }, C.tuning || {});
  const HOOK = "cgn/pos-hook";
  const ME = "cgn/pos-content";
  const panel = C.ui.createPanel("GR ← Nextwaves");
  const tabToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const lower = (s) => String(s || "").toLowerCase();

  const LINK_MSG = {
    gr_unreadable: "Không đọc được phiếu nhận",
    po_unreadable: "Không đọc được PO của phiếu nhận",
    po_mismatch: "PO đọc được không phải PO của phiếu nhận",
    gr_not_in_po: "Phiếu nhận không nằm trong PO",
    store_mismatch: "PO thuộc cửa hàng khác",
    many_delivery_codes: "PO có nhiều mã giao thuocsi — chưa hỗ trợ",
    delivery_code_format: "Mã giao thuocsi không đúng dạng",
    sale_order_number_mismatch: "Mã giao thuocsi không khớp số SO của PO",
  };
  const APPLY_MSG = {
    read_failed: "Không đọc lại được phiếu nhận trước khi ghi",
    gr_not_receivable: "Phiếu không còn ở trạng thái chờ nhận / đang nhận",
    detail_missing: "Không còn chi tiết lô cần ghi trên phiếu",
    gr_changed: "Phiếu vừa bị thay đổi (quét tay hoặc tab khác) — dừng để không ghi đè",
    put_failed: "POS từ chối ghi",
    unknown: "Mất kết nối khi ghi — chưa rõ POS đã lưu chưa. Bấm Thử lại: extension đọc lại phiếu trước khi ghi tiếp",
    verify_read_failed: "Ghi xong nhưng không đọc lại được phiếu để kiểm",
    verify_failed: "Đọc lại phiếu không thấy đủ số lượng / mã vừa ghi",
    plan_not_ok: "Kế hoạch có chặn",
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

  // ---------- tiện ích ----------
  async function bg(type, extra) {
    const r = await chrome.runtime.sendMessage(Object.assign({ type }, extra || {}));
    if (!r || !r.ok) throw new Error((r && r.error) || "background");
    return r.data;
  }
  const logTo = (key, log) => bg("session:log", { key, log }).catch(() => {});

  async function http(url, opts) {
    const o = opts || {};
    const res = await fetch(url, { method: o.method || "GET", headers: o.headers || {}, body: o.body, cache: "no-store" });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_) {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
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
    if (page.kind === "gr") return evaluateGr(env, page.grId, location.href);
    return evaluateSo(env, page.so);
  }

  function currentStore(env) {
    return lower((authByEnv[env.id] || {})["x-store-id"]);
  }

  function showStoreNotAllowed(env) {
    watched = { key: null, state: null };
    panel.show({ tone: "info", title: `${env.label}: extension chỉ chạy cho cửa hàng thử`, lines: ["Cửa hàng đang đăng nhập không thuộc danh sách chạy thử của môi trường này."] });
  }

  // Đường (2): /chi-tiet-so/<SO>
  async function evaluateSo(env, so) {
    const storeId = currentStore(env);
    if (!storeId) return showError("Không xác định được cửa hàng đang đăng nhập", "POS chưa gửi x-store-id.");
    if (!E.storeAllowed(env, storeId)) return showStoreNotAllowed(env);
    const digits = K.soDigits(so);
    if (!digits) return showError("Không đọc được số SO từ đường dẫn", so);
    const r = await posGet(env, E.api.grSearchBySo(env, digits, storeId));
    if (!r.ok) return showError("Không tìm được phiếu nhận của SO", httpError("Tìm GR theo SO", r), [{ label: "Thử lại", onClick: refresh }]);
    const all = P.normalizeGrSearch(r.json).filter((g) => !g.posId || g.posId === storeId);
    if (chosenGrId && all.some((g) => g.id === chosenGrId)) return evaluateGr(env, chosenGrId, location.href);
    const receivable = all.filter(P.isReceivable);
    if (receivable.length === 1) return evaluateGr(env, receivable[0].id, location.href);
    if (receivable.length === 0) {
      for (const g of all) {
        const s = await bg("session:get", { envId: env.id, grId: g.id });
        if (s) return evaluateGr(env, g.id, location.href);
      }
      watched = { key: null, state: null };
      return panel.show({ tone: "info", title: `SO ${so}: không có phiếu nhận đang chờ nhận`, lines: [] });
    }
    watched = { key: null, state: null };
    panel.show({
      tone: "warn",
      title: `SO ${so} có ${receivable.length} phiếu nhận đang chờ`,
      lines: ["Chọn phiếu muốn nhận bằng Nextwaves:"],
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
  async function evaluateGr(env, grId, returnUrl) {
    const g = await posGet(env, E.api.grDetail(env, grId));
    if (!g.ok) return showError("Không đọc được phiếu nhận", httpError("GET phiếu nhận", g), [{ label: "Thử lại", onClick: refresh }]);
    const gr = P.normalizeGr(g.json);
    if (!gr) return showError("Không đọc được phiếu nhận", "Response không đúng dạng.");
    const storeId = currentStore(env);
    if (storeId && gr.posId && storeId !== gr.posId) return showError("Phiếu nhận thuộc cửa hàng khác cửa hàng đang đăng nhập", gr.code);
    if (!E.storeAllowed(env, gr.posId)) return showStoreNotAllowed(env);

    let s = await bg("session:get", { envId: env.id, grId: gr.id });
    if (!P.isReceivable(gr)) {
      if (s && gr.status === "COMPLETED" && s.state !== "done") s = await bg("session:update", { key: s.key, patch: { state: "done" }, log: { type: "gr_completed_seen" } });
      if (s) return renderSession(env, gr, s);
      watched = { key: null, state: null };
      return panel.hide();
    }

    if (!s || s.state === "done") {
      const p = await posGet(env, E.api.poDetail(env, gr.posId, gr.poId));
      if (!p.ok) return showError("Không đọc được PO của phiếu nhận", httpError("GET PO", p), [{ label: "Thử lại", onClick: refresh }]);
      const link = P.resolveDelivery(gr, P.normalizePo(p.json));
      if (!link.ok) {
        watched = { key: null, state: null };
        // PO không có mã giao thuocsi: không phải phiếu từ thuocsi → không phải việc của extension.
        if (link.errors.length === 1 && link.errors[0] === "no_delivery_code") return panel.hide();
        return showError(`${gr.code}: không nối được tới SO thuocsi`, link.errors.map((c) => LINK_MSG[c] || c));
      }
      const start = async () => {
        setDismissed(env.id, gr.id, false);
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
          lines: codes > 0 ? [`Phiếu đã có ${codes} mã quét. Kết quả Nextwaves phải chứa đúng các mã này thì mới điền tiếp được.`] : ["Đã huỷ nhận bằng Nextwaves cho phiếu này trong tab."],
          buttons: [{ label: "Nhận bằng Nextwaves", onClick: start }],
        });
      }
      await start();
      return;
    }
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
        await bg("session:cancel", { key: s.key });
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
          lines: sessionLines(s).concat(["Trên tab Nextwaves: đặt hàng lên reader rồi bấm “Xác nhận nhận hàng”. Nhận đủ xong extension tự đưa về đây và điền phiếu."]),
          buttons: [{ label: "Mở tab Nextwaves", onClick: () => bg("session:reopenNw", { key: s.key }) }, cancelButton(env, s)],
        });
      case "received":
      case "apply_stopped":
        return planAndMaybeApply(env, gr, s);
      case "applying": {
        const stale = Date.now() - (s.updatedAt || 0) > 2 * 60 * 1000;
        return panel.show({
          tone: stale ? "warn" : "busy",
          title: stale ? "Lần điền phiếu trước bị gián đoạn" : "Đang điền phiếu ở tab khác",
          lines: sessionLines(s),
          buttons: stale ? [{ label: "Kiểm tra và điền tiếp", onClick: () => planAndMaybeApply(env, gr, s, { force: true }) }] : [],
        });
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

  async function planAndMaybeApply(env, gr, s, opts) {
    const units = (s.nwResult && s.nwResult.units) || [];
    const onGr = new Set(gr.items.flatMap((it) => it.details.flatMap((d) => d.qrCodes)));
    panel.show({ tone: "busy", title: `Đang tra ${units.length} UID trên POS…`, lines: sessionLines(s) });
    const qrByUid = await lookupQr(env, units.map((u) => u.uid).filter((u) => u && !onGr.has(u)));
    const plan = PL.buildPlan(gr, units, qrByUid);
    logTo(s.key, { type: "plan", ok: plan.ok, steps: plan.steps.length, blocked: plan.blocked.map((b) => b.code), summary: plan.summary });

    const allThere = units.length > 0 && plan.summary && plan.summary.alreadyOnGr === units.length;
    if (!plan.ok && allThere && plan.blocked.every((b) => b.code === "nothing_to_write")) {
      const s2 = await bg("session:update", { key: s.key, patch: { state: "applied" }, log: { type: "applied_already" } });
      return renderApplied(env, gr, s2);
    }
    const warnLines = plan.warnings.map((w) => `• Sản phẩm ${w.productId}: sau khi điền mới ${w.received}/${w.quantity} — phần còn lại dược sĩ xử lý tay.`);
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
      [`Sẽ điền ${plan.summary.toWrite} UID vào ${plan.steps.length} lô${plan.summary.alreadyOnGr ? ` (${plan.summary.alreadyOnGr} UID đã có trên phiếu)` : ""}.`],
      warnLines
    );
    const mode = (config && config.writeMode) || "off";
    const go = () => runApply(env, gr, s, plan);
    if (mode === "off") {
      return panel.show({ tone: "warn", title: "Chế độ ghi đang TẮT — chỉ xem kế hoạch", lines: head.concat(["Bật ghi trong popup extension để điền phiếu."]), table: planTable(plan), buttons: [cancelButton(env, s)] });
    }
    if (mode === "auto" && !stopped && !(opts && opts.force)) return go();
    return panel.show({
      tone: stopped ? "warn" : "info",
      title: stopped ? "Điền phiếu bị dừng" : "Kế hoạch điền phiếu",
      lines: head,
      table: planTable(plan),
      buttons: [{ label: stopped || (opts && opts.force) ? "Thử lại" : `Điền vào phiếu (${plan.summary.toWrite} UID)`, onClick: go }, cancelButton(env, s)],
    });
  }

  async function runApply(env, gr, s, plan) {
    if (applying) return;
    applying = true; // chặn vòng đánh giá vẽ lại panel trong lúc giành quyền / ghi
    let claimed = false;
    try {
      claimed = await bg("session:claimApply", { key: s.key, token: tabToken });
    } catch (_) {
      claimed = false;
    }
    if (!claimed) {
      applying = false;
      return refresh();
    }
    let ok = false;
    const n = plan.steps.length;
    let i = 0;
    try {
      const api = {
        getGr: async () => {
          const r = await posGet(env, E.api.grDetail(env, gr.id));
          if (!r.ok) throw new Error(`http ${r.status}`);
          return P.normalizeGr(r.json);
        },
        putDetail: async (step, body) => {
          const r = await posPut(env, E.api.grDetailLine(env, gr.id, step.itemId, step.detailId), body);
          return { ok: r.ok, status: r.status, body: r.json };
        },
      };
      const res = await A.runPlan(plan, api, (e) => {
        if (e.type === "done" || e.type === "already") i += 1;
        if (e.type === "sending") panel.show({ tone: "busy", title: `Đang điền ${i + 1}/${n}`, lines: [`${e.step.productName || e.step.productId} · lô ${e.step.lotDate}: ${e.step.before} → ${e.step.target}`] });
        logTo(s.key, { type: `apply_${e.type}`, detailId: e.step && e.step.detailId, reason: e.reason, status: e.status });
      });
      if (res.ok) {
        ok = true;
        await bg("session:update", { key: s.key, patch: { state: "applied", applyToken: null, applyResult: { at: Date.now(), steps: n, uids: plan.summary.toWrite + plan.summary.alreadyOnGr } }, log: { type: "applied" } });
      } else {
        await bg("session:update", {
          key: s.key,
          patch: { state: "apply_stopped", applyToken: null, applyError: { reason: res.reason, status: res.status || null, detailId: res.step ? res.step.detailId : null } },
          log: { type: "apply_stopped", reason: res.reason, status: res.status || null },
        });
      }
    } catch (err) {
      await bg("session:update", { key: s.key, patch: { state: "apply_stopped", applyToken: null, applyError: { reason: "unknown" } }, log: { type: "apply_error", message: String((err && err.message) || err) } }).catch(() => {});
    } finally {
      applying = false;
    }
    if (ok) {
      // Tải lại để màn POS hiện số lượng / mã vừa điền.
      reloading = true;
      panel.show({ tone: "ok", title: `Đã điền ${plan.summary.toWrite} UID — đang tải lại phiếu…`, lines: [] });
      setTimeout(() => location.reload(), T.reloadDelayMs);
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
