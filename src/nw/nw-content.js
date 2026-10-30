/*
 * Màn quét Nextwaves /vi/purchases/receive?po=<SO | số PO> (ISOLATED world). Chỉ chạy khi có phiên do tab POS mở.
 *  1. Tìm đơn liên kết theo SO trên TOÀN BỘ ứng viên (lib/resolve.js, PM audit 24/10 P1.1); kiểm refId / bên bán / kho / dấu vân tay.
 *  2. Chờ dược sĩ bấm "Xác nhận nhận hàng" (hook thấy POST …/receive-scan).
 *  3. 2xx → ghi nhận lượt này vào phiên → đọc lại PO + phiếu gửi → UID đã nhận (sản phẩm, đơn vị, lô) kèm bằng chứng biên nhận
 *     (biên nhận mới, đúng kho, chứa đúng EPC; phiếu gửi ghi nhận EPC — PM P2.1) → nhận đủ thì báo background đưa về POS.
 *  Mở lại trang mà phiên chưa có lượt 2xx: chỉ đọc và hiển thị, không tự chuyển về POS.
 * Chỉ GET API thường của Nextwaves. Không gọi /integrations/circa/*, không gọi API ghi, không bấm nút hộ dược sĩ.
 */
(function () {
  "use strict";
  if (window.__CGN_NW_CONTENT__) return;
  window.__CGN_NW_CONTENT__ = true;

  const C = globalThis.__CGN__;
  const E = C.env;
  const N = C.nw;
  const R = C.resolve;
  const T = Object.assign({ pollMs: 700, collectTries: 6, collectDelayMs: 1500, httpTimeoutMs: 30000 }, C.tuning || {});
  const HOOK = "cgn/nw-hook";
  const ME = "cgn/nw-content";
  // Khung không được che nút nhận hàng của màn quét.
  const panel = C.ui.createPanel("GR ← Nextwaves", { avoidButtons: /^xác nhận nhận hàng$/iu });
  const OPEN = new Set(["waiting_nw", "nw_ready"]);

  // Mã lỗi nhận hàng của Nextwaves (từ bundle web) → câu cho dược sĩ. Extension không tự xử lý, chỉ báo.
  const NW_REASON = {
    tagged_unit_unsupported: "Dòng có thẻ không nhận được theo đơn vị này (Nextwaves chỉ nhận theo đơn vị gốc)",
    epc_count_mismatch: "Số thẻ quét không khớp số lượng của dòng",
    batch_required: "Dòng cần số lô",
    duplicate_epc: "Thẻ bị trùng",
    epc_mismatch: "Thẻ đã quét không khớp với thẻ đã gửi",
    epc_line_must_be_complete: "Phải quét đủ thẻ của từng dòng",
    epcs_required: "Chưa quét thẻ nào",
    over_receipt: "Nhận vượt số lượng",
    other_shipments_open: "Còn phiếu gửi khác đang mở",
    accept_required: "Phiếu gửi cần được chấp nhận trước khi nhận hàng",
  };

  let config = null;
  const authByEnv = {};
  let lastHref = "";
  let running = false;
  let again = false;
  let collecting = false;
  let ctx = null; // {env, key, po, nwPoId, nwPoNumber, shipmentIds, expected, grCode, soBase, fingerprint, receiptIdsBefore, warehouseId}
  let note = null; // thông báo gần nhất của lượt nhận (giữ khi vẽ lại)
  let autoGrant = null; // v0.3.0: quyền tự động một lần của phiên đang mở — CHỈ để hiện (background mới là nơi kiểm)
  let ctxCreatedAt = null; // giờ tạo phiên đang mở — quyền tự động chỉ hiện khi gắn đúng phiên này (audit F3)
  let pendingScan = null; // lượt "Xác nhận nhận hàng" đến trước khi khớp xong đơn → xử lý ngay sau khi khớp

  async function bg(type, extra) {
    const r = await chrome.runtime.sendMessage(Object.assign({ type }, extra || {}));
    if (!r || !r.ok) throw new Error((r && r.error) || "background");
    return r.data;
  }
  const logTo = (key, log) => bg("session:log", { key, log }).catch(() => {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Lỗi mạng / hết giờ → NÉM; người gọi coi là "không đọc được" (chặn, không bỏ qua).
  async function nwGet(env, url) {
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), T.httpTimeoutMs) : null;
    try {
      const res = await fetch(url, { method: "GET", headers: Object.assign({}, authByEnv[env.id] || {}), cache: "no-store", signal: ac ? ac.signal : undefined });
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

  function httpError(what, r) {
    const msg = r && r.json && r.json.message ? ` — ${String(r.json.message).slice(0, 200)}` : "";
    const hint = r && r.status === 401 ? " Phiên Nextwaves có thể đã hết hạn: tải lại trang." : "";
    return `${what}: HTTP ${r ? r.status : "?"}${msg}.${hint}`;
  }

  function nwErrorText(resp) {
    const msg = String((resp && resp.message) || "");
    const reason = String((resp && resp.params && resp.params.reason) || (msg.includes("__") ? msg.split("__").pop() : ""));
    const vi = NW_REASON[reason] || NW_REASON[msg.split("__").pop()] || "";
    const code = [msg, reason].filter(Boolean).join(" / ");
    return `${vi || "Nextwaves trả lỗi"}${code ? ` [${code}]` : ""}`;
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
      panel.show({ tone: "err", title: "Lỗi extension", lines: [String((err && err.message) || err)], buttons: [{ label: "Thử lại", onClick: refresh }] });
    } finally {
      running = false;
    }
  }

  async function evaluate() {
    if (collecting) return;
    const env = E.envFromConfig(config);
    const page = env ? E.classifyNwPage(location.href, env) : null;
    if (!page) {
      ctx = null;
      pendingScan = null;
      return panel.hide();
    }
    const s = await bg("session:findByNw", { envId: env.id, po: page.po });
    if (!s) {
      ctx = null;
      pendingScan = null;
      return panel.hide();
    }
    if (!OPEN.has(s.state)) {
      ctx = null;
      return panel.show({
        tone: "ok",
        title: `${s.grCode}: Nextwaves đã nhận xong`,
        lines: ["Phiếu nhận trên POS đang được điền / đã điền."].concat(autoLineAfter(s)),
        buttons: [{ label: "Về POS", onClick: () => bg("session:focusPos", { key: s.key }) }],
      });
    }
    if (!authByEnv[env.id]) return panel.show({ tone: "busy", title: "Đang chờ Nextwaves tải dữ liệu…", lines: [] });

    if (s.nwPoId && s.expected && Array.isArray(s.shipmentIds) && Array.isArray(s.receiptIdsBefore)) {
      // Đã khớp đơn ở lần mở trước: giữ ảnh chụp "dự kiến" + biên nhận chụp TRƯỚC khi nhận, không tìm lại.
      ctx = ctxFromSession(env, s, page.po);
    } else {
      const found = await resolveOrder(env, s, page.po);
      if (!found) return;
      ctx = found;
    }
    if (pendingScan) {
      const p = pendingScan;
      pendingScan = null;
      return onReceiveScan(p);
    }
    ctxCreatedAt = s.createdAt;
    await loadAutoGrant();
    if (!note) {
      if (s.scanOk) await collect({}); // tải lại trang giữa lúc đọc kết quả của lượt 2xx đã ghi nhận
      else await peekReceived();
    }
    renderReady();
  }

  function ctxFromSession(env, s, po) {
    return {
      env,
      key: s.key,
      po,
      nwPoId: s.nwPoId,
      nwPoNumber: s.nwPoNumber,
      shipmentIds: s.shipmentIds,
      expected: s.expected,
      grCode: s.grCode,
      soBase: s.soBase,
      fingerprint: s.fpRows || [],
      receiptIdsBefore: s.receiptIdsBefore,
      warehouseId: s.warehouseId,
      nwWriteLocks: s.nwWriteLocks || [],
      nwSearch: s.nwSearch || null,
    };
  }

  async function resolveOrder(env, s, po) {
    panel.show({ tone: "busy", title: `Đang tìm đơn Nextwaves cho ${s.soBase}…`, lines: [] });
    let search;
    try {
      search = await nwGet(env, E.api.nwReceivingSearch(env, s.soBase));
    } catch (err) {
      search = { ok: false, status: 0 };
    }
    const r = await R.resolveNwOrder({
      search,
      ctx: { soBase: s.soBase, buymedSlug: env.buymedSlug, warehouseId: s.warehouseId },
      fingerprintSource: s.fingerprint,
      getOrder: (poId) => nwGet(env, E.api.nwOrderOfPo(env, poId)),
      getReceiving: (poId) => nwGet(env, E.api.nwReceiving(env, poId)),
    });
    if (!r.ok) {
      logTo(s.key, { type: "nw_match_failed", reason: r.reason, total: r.total, read: r.read, candidates: r.candidates, verified: r.verified, poNumber: r.poNumber || null, detail: r.detail || null });
      const facts = [`SO ${s.soBase}: kết quả tìm total = ${r.total === null ? "?" : r.total}, đã đọc ${r.read}; ứng viên Buymed cùng kho ${r.candidates}; refId đúng SO ${r.verified}.`];
      if (r.poNumber) facts.push(`Đơn ${r.poNumber}${r.detail ? `: ${r.detail}` : ""}`);
      panel.show({
        tone: "err",
        title: r.message,
        lines: facts.concat(["Extension không đi tiếp. Báo lại operator."]),
        table: r.reports.length ? { head: ["Đơn Nextwaves", "Lý do loại"], rows: r.reports } : null,
        buttons: [{ label: "Thử lại", onClick: refresh }],
      });
      return null;
    }
    const g = r.chosen;
    // Biên nhận đã có TRƯỚC lượt nhận: để nhận ra biên nhận mới của lượt này (P2.1).
    let pd;
    try {
      pd = await nwGet(env, E.api.nwPoDetail(env, g.order.poId));
    } catch (err) {
      pd = { ok: false, status: 0 };
    }
    const poDetail = pd.ok ? N.normalizePoDetail(pd.json) : null;
    if (!poDetail) {
      panel.show({ tone: "err", title: "Không đọc được PO Nextwaves", lines: [httpError("Đọc PO", pd)], buttons: [{ label: "Thử lại", onClick: refresh }] });
      return null;
    }
    const fpRows = g.fp.rows.map((x) => ({ productId: x.productId, grBase: x.grBase, nwBase: x.nwBase }));
    const shipmentIds = g.receiving.shipments.map((x) => x.id);
    const receiptIdsBefore = poDetail.receipts.map((x) => x.id);
    const preReceived = poDetail.items.reduce((n, it) => n + it.receivedUnits.length, 0);
    // Background chỉ nhận một lần, từ trang Nextwaves của môi trường; khoá ghi đặt ở đây không đổi / xoá được về sau (PM P1.7).
    let s2;
    try {
      s2 = await bg("session:nwMatched", {
        key: s.key,
        match: {
          nwPoId: g.order.poId,
          nwPoNumber: g.order.poNumber,
          nwOrderId: g.order.orderId,
          nwRefId: g.order.refId,
          shipmentIds,
          expected: g.receiving,
          fpRows,
          receiptIdsBefore,
          nwWriteLocks: r.writeLocks,
          nwSearch: { total: r.total, read: r.read, candidates: r.candidates, verified: r.verified },
        },
        log: { type: "nw_matched", nwPoNumber: g.order.poNumber, refId: g.order.refId, shipments: shipmentIds.length, total: r.total, candidates: r.candidates, verified: r.verified, receiptsBefore: receiptIdsBefore.length, preReceived, writeLocks: r.writeLocks },
      });
    } catch (err) {
      panel.show({ tone: "err", title: "Không ghi được kết quả khớp đơn vào phiên", lines: [String((err && err.message) || err), "Huỷ phiên ở tab POS rồi mở lại phiếu."], buttons: [{ label: "Thử lại", onClick: refresh }] });
      return null;
    }
    if (preReceived > 0) note = { tone: "warn", title: "Đơn đã có hàng nhận trước khi mở phiên", text: `Nextwaves đã ghi nhận ${preReceived} UID trước lượt này. Extension chỉ chuyển về POS sau một lượt “Xác nhận nhận hàng” mới trong phiên.` };
    return ctxFromSession(env, s2, po);
  }

  function expectedCount(c) {
    return ((c && c.expected && c.expected.shipments) || []).reduce((n, s) => n + s.lines.reduce((m, l) => m + l.units.length, 0), 0);
  }

  async function loadAutoGrant() {
    try {
      const { autoGrants } = await chrome.storage.local.get("autoGrants");
      const g = ctx ? (autoGrants || {})[ctx.key] : null;
      // audit v0.3.0 F3: chỉ quyền gắn ĐÚNG phiên đang mở (phiên tạo lại cùng GR không thừa hưởng).
      autoGrant = g && g.expiresAt > Date.now() && g.sessionCreatedAt === ctxCreatedAt ? g : null;
    } catch (_) {
      autoGrant = null;
    }
  }

  // v0.3.0 (P2.5, audit F4): dòng trạng thái tự động sau lượt nhận — theo trạng thái THẬT của phiên, không để hiểu nhầm là vẫn tự
  // HOÀN THÀNH khi lượt tự động đã dừng / chưa rõ.
  function autoLineAfter(s) {
    const log = s.log || [];
    const auto = !!s.autoRun || !!(s.authorization && s.authorization.auto);
    const stopped = (s.autoRun && s.autoRun.skipped) || log.some((l) => l.type === "auto_skipped" || l.type === "auto_verify_failed");
    if (!auto) return stopped ? ["Tự động đã dừng — POS xử lý theo luồng thủ công."] : [];
    if (s.state === "done") return [s.completeResult ? "Tự động: POS đã tự HOÀN THÀNH." : "POS đã HOÀN THÀNH."];
    if (s.state === "auto_completing") return ["Tự động: đang gửi HOÀN THÀNH trên POS — không bấm HOÀN THÀNH."];
    if (s.state === "auto_complete_unknown") return ["Tự động: chưa rõ POS đã HOÀN THÀNH chưa — kiểm tra trên POS, extension không gửi lại."];
    if (stopped || s.state === "apply_stopped") return ["Tự động đã dừng — POS xử lý theo luồng thủ công."];
    return ["Tự động: POS tự điền và tự HOÀN THÀNH khi đọc lại phiếu khớp hoàn toàn."];
  }

  function renderReady() {
    if (!ctx) return;
    const key = ctx.key;
    const lines = [`Phiếu ${ctx.grCode} ↔ Nextwaves ${ctx.nwPoNumber} (${ctx.soBase}) — ${expectedCount(ctx)} UID dự kiến.`];
    if (note) lines.push(note.text);
    else lines.push("Đặt hàng lên reader rồi bấm “Xác nhận nhận hàng”. Nhận đủ xong extension đưa về POS và lập kế hoạch điền phiếu.");
    const q = ctx.nwSearch;
    if (q) lines.push(`Tìm theo ${ctx.soBase}: total ${q.total}, đã đọc ${q.read}; ứng viên Buymed cùng kho ${q.candidates}; refId đúng SO ${q.verified}.`);
    lines.push(
      autoGrant
        ? `Tự động: ĐÃ CHO PHÉP 1 lần (hết hạn ${new Date(autoGrant.expiresAt).toLocaleTimeString("vi-VN")}) — nhận xong, POS sẽ tự điền và tự HOÀN THÀNH khi đọc lại khớp.`
        : "Tự động: chưa cho phép — nhận xong, điền phiếu POS thủ công."
    );
    if (ctx.nwWriteLocks && ctx.nwWriteLocks.length) lines.push("Lưu ý: Nextwaves có nhiều đơn cùng SO — điền phiếu POS sẽ bị khoá (chỉ xem).");
    panel.show({
      tone: note ? note.tone : "info",
      title: note ? note.title : "Sẵn sàng nhận hàng",
      lines,
      table: ctx.fingerprint && ctx.fingerprint.length ? { head: ["Sản phẩm POS", "SL GR (gốc)", "SL Nextwaves (gốc)"], rows: ctx.fingerprint.map((r) => [r.productId, String(r.grBase), String(r.nwBase)]) } : null,
      buttons: [
        { label: "Đọc lại kết quả nhận", secondary: true, onClick: () => collectOrPeek() },
        { label: "Về POS", secondary: true, onClick: () => bg("session:focusPos", { key }) },
      ],
    });
  }

  async function collectOrPeek() {
    if (!ctx) return;
    const s = await bg("session:findByNw", { envId: ctx.env.id, po: ctx.po });
    if (s && s.scanOk) await collect({});
    else await peekReceived();
    renderReady();
  }

  // Đọc kết quả nhận để HIỂN THỊ (chưa có lượt 2xx trong phiên): không bao giờ chuyển về POS.
  async function peekReceived() {
    if (!ctx) return;
    const c = ctx;
    let pd;
    try {
      pd = await nwGet(c.env, E.api.nwPoDetail(c.env, c.nwPoId));
    } catch (_) {
      return;
    }
    const po = pd.ok ? N.normalizePoDetail(pd.json) : null;
    if (!po) return;
    const n = po.items.reduce((m, it) => m + it.receivedUnits.length, 0);
    if (n > 0) note = { tone: "warn", title: `Nextwaves đang có ${n} UID đã nhận`, text: "Phiên chưa thấy lượt “Xác nhận nhận hàng” 2xx nào — extension không tự chuyển về POS." };
  }

  // Đọc kết quả của lượt 2xx đã ghi nhận; đủ bằng chứng thì báo background đưa về POS.
  async function collect(opts) {
    if (!ctx || collecting) return;
    collecting = true;
    const c = ctx; // trang có thể đổi giữa chừng → dùng bản chụp
    const { env, key } = c;
    const tries = opts.tries || T.collectTries;
    let rec = null;
    let err = null;
    try {
      for (let i = 0; i < tries; i++) {
        if (i > 0) await sleep(T.collectDelayMs);
        err = null;
        let pd;
        try {
          pd = await nwGet(env, E.api.nwPoDetail(env, c.nwPoId));
        } catch (e) {
          err = `Đọc PO Nextwaves: ${String((e && e.message) || e)}`;
          continue;
        }
        const poDetail = pd.ok ? N.normalizePoDetail(pd.json) : null;
        if (!poDetail) {
          err = httpError("Đọc PO Nextwaves", pd);
          continue;
        }
        const shipments = [];
        for (const id of c.shipmentIds) {
          let r;
          try {
            r = await nwGet(env, E.api.nwShipment(env, id));
          } catch (e) {
            err = `Đọc phiếu gửi Nextwaves: ${String((e && e.message) || e)}`;
            break;
          }
          const sh = r.ok ? N.normalizeShipment(r.json) : null;
          if (!sh || sh.id !== id) {
            err = httpError("Đọc phiếu gửi Nextwaves", r);
            break;
          }
          shipments.push(sh);
        }
        if (err) continue;
        rec = N.buildReceivedUnits(poDetail, shipments, c.expected, { receiptIdsBefore: c.receiptIdsBefore, warehouseId: c.warehouseId });
        if (rec.units.length > 0 && rec.missing.length === 0 && rec.problems.length === 0) break;
      }
    } finally {
      collecting = false;
    }
    if (err) {
      note = { tone: "err", title: "Không đọc được kết quả nhận", text: err };
      return;
    }
    if (!rec || rec.units.length === 0) {
      note = { tone: "warn", title: "Nextwaves chưa ghi nhận UID nào", text: "Chờ vài giây rồi bấm “Đọc lại kết quả nhận”." };
      return;
    }
    const expected = expectedCount(c);
    if (rec.problems.length || rec.unexpected.length) {
      logTo(key, { type: "nw_result_problem", problems: rec.problems.slice(0, 50), unexpected: rec.unexpected.slice(0, 50) });
      note = {
        tone: "err",
        title: "Kết quả nhận chưa đủ bằng chứng / không khớp dữ liệu đơn",
        text: [rec.problems.length ? `Vấn đề: ${rec.problems.slice(0, 10).join(", ")}` : "", rec.unexpected.length ? `EPC ngoài danh sách dự kiến: ${rec.unexpected.slice(0, 10).join(", ")}` : ""].filter(Boolean).join("\n") + "\nExtension không chuyển về POS. Báo lại operator.",
      };
      return;
    }
    if (rec.missing.length) {
      logTo(key, { type: "nw_result_partial", received: rec.units.length, missing: rec.missing.length });
      note = {
        tone: "warn",
        title: `Nextwaves mới nhận ${rec.units.length}/${expected || rec.units.length + rec.missing.length} UID`,
        text: "Quét tiếp phần còn thiếu rồi bấm “Xác nhận nhận hàng” lại. Extension chỉ đưa về POS khi đã nhận đủ.",
      };
      return;
    }
    note = { tone: "ok", title: `Đã nhận đủ ${rec.units.length} UID`, text: `Đang chuyển về POS để lập kế hoạch điền phiếu ${c.grCode}…` };
    renderReady();
    await bg("session:received", { key, payload: { units: rec.units, nwPoNumber: c.nwPoNumber, receiptIds: rec.receiptIds, at: Date.now() } });
    ctx = null;
    note = null;
    refresh();
  }

  async function onReceiveScan(p) {
    if (!ctx) {
      pendingScan = p;
      return refresh();
    }
    if (p.envId !== ctx.env.id) return;
    if (!ctx.shipmentIds.includes(p.shipmentId)) {
      logTo(ctx.key, { type: "receive_scan_other_shipment", shipmentId: p.shipmentId, httpStatus: p.httpStatus });
      note = { tone: "warn", title: "Lượt nhận vừa rồi thuộc phiếu gửi khác", text: "Không phải phiếu gửi của đơn đã khớp — extension bỏ qua." };
      return renderReady();
    }
    const resp = p.response || null;
    logTo(ctx.key, {
      type: "receive_scan",
      httpStatus: p.httpStatus,
      sentEpcs: p.sentEpcs,
      message: resp && resp.message ? String(resp.message) : null,
      reason: resp && resp.params && resp.params.reason ? String(resp.params.reason) : null,
    });
    if (p.httpStatus >= 200 && p.httpStatus < 300) {
      await bg("session:scanOk", { key: ctx.key, scan: { shipmentId: p.shipmentId, httpStatus: p.httpStatus, sentEpcs: p.sentEpcs === undefined ? null : p.sentEpcs, at: Date.now() } });
      note = { tone: "busy", title: "Nextwaves đã nhận — đang đọc kết quả…", text: `${p.sentEpcs === null || p.sentEpcs === undefined ? "?" : p.sentEpcs} thẻ đã gửi.` };
      renderReady();
      await collect({});
      if (ctx) renderReady();
      return;
    }
    note = { tone: "err", title: `Nextwaves CHƯA nhận (HTTP ${p.httpStatus || "?"})`, text: `${nwErrorText(resp)}\nXử lý trên Nextwaves rồi bấm xác nhận lại. Extension chưa chuyển về POS.` };
    renderReady();
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
    } else if (m.type === "receive-scan") {
      onReceiveScan(m.payload).catch((err) => {
        note = { tone: "err", title: "Lỗi extension khi đọc kết quả nhận", text: String((err && err.message) || err) };
        renderReady();
      });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.config) {
      config = changes.config.newValue || null;
      refresh();
    } else if (changes.sessions && !ctx) refresh();
    else if (changes.autoGrants && ctx) loadAutoGrant().then(renderReady);
  });

  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      ctx = null;
      note = null;
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
