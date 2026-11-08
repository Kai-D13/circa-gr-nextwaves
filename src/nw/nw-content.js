/*
 * Màn quét Nextwaves /vi/purchases/receive?po=<SO | số PO> (ISOLATED world), chỉ trên tenant Nextwaves đang chọn. Chỉ chạy khi có
 * phiên do tab POS mở.
 *  1. Tìm đơn liên kết theo SO trên TOÀN BỘ ứng viên (lib/resolve.js): refId / bên bán / huỷ / cùng kho / dấu vân tay. MỘT lần mỗi lượt
 *     (v0.4.0 A1): lỗi giữ nguyên trên khung, chỉ tìm lại khi bấm "Tìm lại", đổi URL, phiên đổi, hoặc có token mới sau 401.
 *     Không có đơn nào cùng SO → phiên "no_nw_order": nhận tay trên POS.
 *  2. Đầu đọc (v0.4.0 C2, operator 06/11): màn quét Nextwaves tự kết nối đầu đọc bằng cổng đã cấp quyền; cổng bận lúc mở thì extension
 *     bấm nút "Kết nối đầu đọc" của Nextwaves (đường dùng lại cổng đã cấp quyền, không hộp chọn) — tối đa vài lần. Extension KHÔNG bấm
 *     nút nào khác của Nextwaves (không bao giờ bấm "Xác nhận nhận hàng").
 *  3. Chờ dược sĩ bấm "Xác nhận nhận hàng" (hook thấy POST …/receive-scan).
 *  4. 2xx → ghi nhận lượt này vào phiên (phiếu gửi thuộc phiên khác → giao đúng phiên đó, A7) → đọc lại PO + phiếu gửi → UID đã nhận
 *     kèm bằng chứng biên nhận (biên nhận mới, đúng kho, chứa đúng EPC) → nhận đủ thì báo background: về POS, POS tự điền.
 * Chỉ GET API thường của Nextwaves. Không gọi /integrations/circa/*, không gọi API ghi.
 */
(function () {
  "use strict";
  if (window.__CGN_NW_CONTENT__) return;
  window.__CGN_NW_CONTENT__ = true;

  const C = globalThis.__CGN__;
  const E = C.env;
  const K = C.keys;
  const N = C.nw;
  const R = C.resolve;
  const M = C.match;
  const T = Object.assign({ pollMs: 700, collectTries: 6, collectDelayMs: 1500, httpTimeoutMs: 30000, authWaitMs: 20000, readerPollMs: 1000, readerFirstClickMs: 1500, readerGapMs: 10000, readerMaxClicks: 3, readerRenewMs: 10 * 60 * 1000, readerRetryMs: 15000, readerRetryMax: 8, readerFastMs: 6000, readerFastGapMs: 1500, qslAskMs: 5000 }, C.tuning || {});
  const HOOK = "cgn/nw-hook";
  const ME = "cgn/nw-content";
  // Khung không được che nút nhận hàng của màn quét.
  const panel = C.ui.createPanel("GR ← Nextwaves", { avoidButtons: /^xác nhận nhận hàng$/iu });
  const OPEN = new Set(["waiting_nw", "nw_ready"]);
  // Nút đầu đọc của màn quét Nextwaves (bản dịch vi / en của web Nextwaves: stock.connectReader / startScan / stop).
  const READER_CONNECT = /^(kết nối đầu đọc|connect reader)$/iu;
  const READER_IDLE = /^(bắt đầu quét|start scan)$/iu;
  const READER_READING = /^(dừng|stop)$/iu;

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
  const authByKey = {}; // `${envId}|${tenant}` → headers (chỉ trong bộ nhớ tab)
  let lastHref = "";
  let running = false;
  let again = false;
  let collecting = false;
  let ctx = null; // {env, key, po, nwPoId, nwPoNumber, shipmentIds, expected, grCode, soBase, fingerprint, receiptIdsBefore, warehouseId, …}
  let note = null; // thông báo gần nhất của lượt nhận (giữ khi vẽ lại)
  let pendingScan = null; // lượt "Xác nhận nhận hàng" đến trước khi khớp xong đơn → xử lý ngay sau khi khớp
  let latch = null; // A1: {sig, view, status, authKey} — lỗi tìm đơn của phiên này, giữ tới khi Tìm lại / phiên đổi / token mới sau 401
  let force = false; // "Tìm lại": bỏ latch một lần
  let sessionsSig = ""; // chữ ký gọn của mọi phiên (bỏ log) — chỉ đánh giá lại khi đổi
  let authWaitTimer = null;
  let curSession = null; // phiên của trang (để vẽ dòng đầu đọc)
  const rd = { state: "none", since: 0, clicks: [], lastClick: 0, gaveUp: false, el: null, away: false, fastUntil: 0 }; // đầu đọc của màn quét (el = đúng nút đầu đọc; away = dược sĩ đã rời tab)
  const lend = { key: null, last: 0, tries: 0 }; // gia hạn / mượn lại đầu đọc của phiên đang mở (QR Scan Log)
  let lastChoice = null; // lựa chọn khi thiếu trên modal nhận hàng đã vẽ gần nhất (v0.4.1)
  // v0.4.1 — đầu đọc cho modal nhận hàng (kể cả không phiên): modal mở / phiếu gửi, trạng thái QR Scan Log, đang lấy / đã lấy đầu đọc.
  const rh = { open: false, shipment: null, status: null, asking: false, lastAsk: 0, taking: false, taken: false, msg: null, reminder: false };

  async function bg(type, extra) {
    const r = await chrome.runtime.sendMessage(Object.assign({ type }, extra || {}));
    if (!r || !r.ok) throw new Error((r && r.error) || "background");
    return r.data;
  }
  const logTo = (key, log) => bg("session:log", { key, log }).catch(() => {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const authKeyOf = (env) => (env ? `${env.id}|${env.nwTenant}` : "");
  const authOf = (env) => authByKey[authKeyOf(env)] || null;

  // Lỗi mạng / hết giờ → NÉM; người gọi coi là "không đọc được" (chặn, không bỏ qua).
  async function nwGet(env, url) {
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), T.httpTimeoutMs) : null;
    try {
      const res = await fetch(url, { method: "GET", headers: Object.assign({}, authOf(env) || {}), cache: "no-store", signal: ac ? ac.signal : undefined });
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

  const sigOf = (s) => (s ? JSON.stringify([s.key, s.state, s.createdAt, s.nwPoId || null]) : "none");

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
      panel.show({ tone: "err", title: "Lỗi extension", lines: [String((err && err.message) || err)], buttons: [{ label: "Thử lại", onClick: retry }] });
    } finally {
      running = false;
    }
  }

  function retry() {
    force = true;
    latch = null;
    refresh();
  }

  async function evaluate() {
    if (collecting) return;
    const env = E.envFromConfig(config);
    const page = env ? E.classifyNwPage(location.href, env) : null;
    if (!page) {
      ctx = null;
      curSession = null;
      pendingScan = null;
      // v0.4.1: trang khác màn quét (vd. trang PO Nextwaves) — chỉ còn khung đầu đọc khi đang mở modal nhận hàng (readerTick vẽ).
      return rh.open ? renderHelper() : panel.hide();
    }
    const s = await bg("session:findByNw", { envId: env.id, tenant: env.nwTenant, po: page.po });
    curSession = s;
    if (!s) {
      ctx = null;
      if (pendingScan) {
        const p = pendingScan;
        pendingScan = null;
        return onReceiveScan(p, true);
      }
      return panel.hide();
    }
    if (s.state === "no_nw_order") {
      ctx = null;
      return showNoOrder(s, latch && latch.sig === sigOf(s) ? latch.reports : null);
    }
    if (!OPEN.has(s.state)) {
      ctx = null;
      return panel.show({
        tone: "ok",
        title: `${s.grCode}: Nextwaves đã nhận xong`,
        lines: ["Phiếu nhận trên POS đang được điền / đã điền. Dược sĩ kiểm danh sách trên POS rồi bấm HOÀN THÀNH."],
        buttons: [{ label: "Về POS", onClick: () => bg("session:focusPos", { key: s.key }) }],
      });
    }
    if (!authOf(env)) return waitAuth(env);
    clearAuthWait();

    if (s.nwPoId && s.expected && Array.isArray(s.shipmentIds) && Array.isArray(s.receiptIdsBefore)) {
      // Đã khớp đơn ở lần mở trước: giữ ảnh chụp "dự kiến" + biên nhận chụp TRƯỚC khi nhận, không tìm lại.
      ctx = ctxFromSession(env, s, page.po);
    } else {
      // A1: lỗi tìm đơn của đúng phiên này còn giữ → chỉ vẽ lại, không gọi API lại.
      if (latch && latch.sig === sigOf(s) && !force) return panel.show(latch.view);
      force = false;
      const found = await resolveOrder(env, s, page.po);
      if (!found) return;
      ctx = found;
    }
    latch = null;
    if (pendingScan) {
      const p = pendingScan;
      pendingScan = null;
      return onReceiveScan(p, true);
    }
    if (!note) {
      if (s.scanOk) await collect({}); // tải lại trang giữa lúc đọc kết quả của lượt 2xx đã ghi nhận
      else await peekReceived();
    }
    renderReady();
  }

  // A4: chưa thấy web Nextwaves gọi API (chưa có token) — quá authWaitMs thì hướng dẫn F5 / đăng nhập đúng tenant.
  function waitAuth(env) {
    panel.show({ tone: "busy", title: "Đang chờ Nextwaves tải dữ liệu…", lines: [] });
    if (!authWaitTimer) {
      authWaitTimer = setTimeout(() => {
        authWaitTimer = null;
        if (authOf(env)) return;
        panel.show({
          tone: "warn",
          title: "Chưa thấy Nextwaves tải dữ liệu",
          lines: [`Bấm F5 tab này. Vẫn vậy: kiểm tra đã đăng nhập Nextwaves (${env.nwUiOrigin}) bằng tài khoản thấy được kho của cửa hàng.`],
          buttons: [{ label: "Tải lại trang", onClick: () => location.reload() }],
        });
      }, T.authWaitMs);
    }
  }
  function clearAuthWait() {
    if (authWaitTimer) clearTimeout(authWaitTimer);
    authWaitTimer = null;
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
      posName: s.posName || "",
      fingerprint: s.fpRows || [],
      receiptIdsBefore: s.receiptIdsBefore,
      warehouseId: s.warehouseId,
      warehouseName: s.warehouseName || "",
      warehouseCode: s.warehouseCode || "",
      nwWriteLocks: s.nwWriteLocks || [],
      nwSearch: s.nwSearch || null,
      // v0.4.1: phiếu phần còn lại — UID đã nằm trên phiếu đã xong của PO (món bán gấp) không cần quét lại.
      remainder: s.remainder || null,
      lastScan: null, // lượt "Xác nhận nhận hàng" 2xx gần nhất: {onMissing, missingUids[]} (đối chiếu với kết quả đọc lại)
      grSummary: Array.isArray(s.grSummary) ? s.grSummary : null, // v0.4.1 (audit F2): kiểm trước khi xác nhận
    };
  }

  // v0.4.1 (audit v0.4.0 F2): những gì chắc chắn làm kế hoạch điền bị chặn, biết được TRƯỚC khi dược sĩ xác nhận nhận hàng.
  const PRE_MSG = {
    product_not_on_gr: (p) => `SP ${p.productId}: ${p.count} tem không có dòng trên phiếu`,
    unit_unknown: (p) => `SP ${p.productId}: đơn vị “${p.unit}” của Nextwaves không có trên sản phẩm POS`,
    fraction: (p) => `SP ${p.productId}: quy đổi ra số lẻ theo đơn vị dòng`,
    over: (p) => `SP ${p.productId}: Nextwaves ${p.nwBase} > phiếu ${p.grBase} (đơn vị gốc)`,
    gr_received_by_hand: (p) => `SP ${p.productId}: phiếu đã có lượng nhận tay (không mã)`,
  };
  function precheckLines(c) {
    if (!c || !Array.isArray(c.grSummary) || !M || !M.precheck) return { lines: [], warn: false };
    const pc = M.precheck(c.grSummary, c.expected, c.remainder ? c.remainder.excludeUids : []);
    if (pc.ok) return { lines: [`Kiểm trước khi nhận: số lượng khớp phiếu — điền được ${pc.units} UID (lô kiểm sau khi nhận).`], warn: false };
    const why = pc.problems.slice(0, 4).map((p) => (PRE_MSG[p.code] ? PRE_MSG[p.code](p) : p.code)).join("; ");
    const hint = c.remainder && pc.problems.some((p) => p.code === "over" || p.code === "product_not_on_gr") ? " Món nhận trước (bán gấp) có thể đã nhập số tay, không quét QR." : "";
    return { lines: [`⚠ Kiểm trước khi nhận: extension sẽ KHÔNG điền được phiếu POS — ${why}.${hint} Nhận Nextwaves vẫn được; phiếu POS nhận tay.`], warn: true };
  }

  // v0.4.1: UID / EPC của đơn đã nằm trên phiếu POS đã xong (bán gấp) — chỉ phần giao với UID của đơn có tác dụng.
  function soldOf(c) {
    const ex = new Set((c && c.remainder && c.remainder.excludeUids) || []);
    const uids = new Set();
    const epcs = new Set();
    for (const s of (c && c.expected && c.expected.shipments) || []) {
      for (const l of s.lines) for (const u of l.units) if (u.uid && ex.has(u.uid)) {
        uids.add(u.uid);
        epcs.add(u.epc);
      }
    }
    return { uids, epcs };
  }

  function showNoOrder(s, reports) {
    const rows = reports || (latch && latch.reports) || [];
    const partial = s.noOrderReason === "nw_partial_received";
    panel.show({
      tone: "warn",
      title: partial ? `Nextwaves đã nhận một phần đơn của ${s.soBase} trước đó — không nhận tiếp được` : `Nextwaves chưa có đơn chờ nhận cho ${s.soBase}`,
      lines: partial
        ? [
            `Phiếu ${s.grCode} (${s.deliveryCode || s.soBase}): nhận tay trên POS.`,
            "Phiếu gửi Nextwaves chỉ nhận được MỘT lần; lần nhận thiếu trước đã dùng phiếu gửi đó. Phần còn lại không vào kho Nextwaves được nữa — báo vận hành.",
          ]
        : [
            `Phiếu ${s.grCode} (${s.deliveryCode || s.soBase}): nhận tay trên POS như hiện nay.`,
            s.remainder
              ? `Phiếu phần còn lại (đã nhận trước ở ${s.remainder.completed.map((g) => g.code).join(", ")}): Nextwaves có thể đã nhận hết đơn này từ trước.`
              : "Hàng có tem RFID mà vẫn báo vậy: kiểm tra tài khoản Nextwaves đang đăng nhập có quyền kho của cửa hàng, rồi bấm “Tìm lại”.",
          ],
      table: rows.length ? { head: ["Đơn Nextwaves tìm thấy", "Lý do loại"], rows } : null,
      buttons: [
        {
          label: "Tìm lại",
          onClick: async () => {
            try {
              await bg("session:retryNw", { key: s.key });
            } catch (_) {
              /* vẽ lại theo phiên */
            }
            retry();
          },
        },
        { label: "Về POS", secondary: true, onClick: () => bg("session:focusPos", { key: s.key }) },
      ],
    });
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
      ctx: { soBase: s.soBase, buymedSlug: env.buymedSlug, warehouseId: null },
      fingerprintSource: s.fingerprint,
      getOrder: (poId) => nwGet(env, E.api.nwOrderOfPo(env, poId)),
      getReceiving: (poId) => nwGet(env, E.api.nwReceiving(env, poId)),
    });
    if (!r.ok) {
      logTo(s.key, { type: "nw_match_failed", reason: r.reason, total: r.total, read: r.read, candidates: r.candidates, verified: r.verified, poNumber: r.poNumber || null, detail: r.detail || null });
      if (r.reason === "no_order" || r.reason === "nw_partial_received") {
        // Tìm đọc đủ mà không có đơn nào cùng SO (hoặc mọi đơn cùng SO đã nhận một phần, phiếu gửi đã dùng — v0.4.1): phiên → no_nw_order
        // (background trả đầu đọc). Vẽ theo phiên mới.
        let s2 = null;
        try {
          s2 = await bg("session:noOrder", { key: s.key, result: { total: r.total, read: r.read, reason: r.reason } });
        } catch (_) {
          s2 = null;
        }
        latch = { sig: sigOf(s2 || s), view: null, reports: r.reports };
        showNoOrder(s2 || s, r.reports);
        return null;
      }
      const facts = [`SO ${s.soBase}: kết quả tìm total = ${r.total === null ? "?" : r.total}, đã đọc ${r.read}; ứng viên Buymed ${r.candidates}; refId đúng SO ${r.verified}.`];
      if (r.poNumber) facts.push(`Đơn ${r.poNumber}${r.detail ? `: ${r.detail}` : ""}`);
      const view = {
        tone: "err",
        title: r.message,
        lines: facts.concat(["Extension không đi tiếp — phiếu nhận tay trên POS, hoặc xử lý trên Nextwaves rồi bấm “Tìm lại”."]),
        table: r.reports.length ? { head: ["Đơn Nextwaves", "Lý do loại"], rows: r.reports } : null,
        buttons: [{ label: "Tìm lại", onClick: retry }, { label: "Về POS", secondary: true, onClick: () => bg("session:focusPos", { key: s.key }) }],
      };
      latch = { sig: sigOf(s), view, status: search && search.status, authKey: authKeyOf(env) + "|" + ((authOf(env) || {}).authorization || "") };
      panel.show(view);
      return null;
    }
    const g = r.chosen;
    // Biên nhận đã có TRƯỚC lượt nhận: để nhận ra biên nhận mới của lượt này.
    let pd;
    try {
      pd = await nwGet(env, E.api.nwPoDetail(env, g.order.poId));
    } catch (err) {
      pd = { ok: false, status: 0 };
    }
    const poDetail = pd.ok ? N.normalizePoDetail(pd.json) : null;
    if (!poDetail) {
      const view = { tone: "err", title: "Không đọc được PO Nextwaves", lines: [httpError("Đọc PO", pd)], buttons: [{ label: "Tìm lại", onClick: retry }] };
      latch = { sig: sigOf(s), view, status: pd && pd.status, authKey: authKeyOf(env) + "|" + ((authOf(env) || {}).authorization || "") };
      panel.show(view);
      return null;
    }
    const fpRows = g.fp.rows.map((x) => ({ productId: x.productId, grBase: x.grBase, nwBase: x.nwBase }));
    const shipmentIds = g.receiving.shipments.map((x) => x.id);
    const receiptIdsBefore = poDetail.receipts.map((x) => x.id);
    const preReceived = poDetail.items.reduce((n, it) => n + it.receivedUnits.length, 0);
    // Background chỉ nhận một lần, từ trang Nextwaves đúng tenant của phiên; khoá ghi + kho đặt ở đây không đổi / xoá được về sau.
    let s2;
    try {
      s2 = await bg("session:nwMatched", {
        key: s.key,
        match: {
          nwPoId: g.order.poId,
          nwPoNumber: g.order.poNumber,
          nwOrderId: g.order.orderId,
          nwRefId: g.order.refId,
          warehouseId: r.warehouseId,
          warehouseName: g.receiving.warehouseName || "",
          warehouseCode: g.receiving.warehouseCode || "",
          shipmentIds,
          expected: g.receiving,
          fpRows,
          receiptIdsBefore,
          nwWriteLocks: r.writeLocks,
          nwSearch: { total: r.total, read: r.read, candidates: r.candidates, verified: r.verified },
        },
        log: { type: "nw_matched", nwPoNumber: g.order.poNumber, refId: g.order.refId, warehouseId: r.warehouseId, shipments: shipmentIds.length, total: r.total, candidates: r.candidates, verified: r.verified, receiptsBefore: receiptIdsBefore.length, preReceived, writeLocks: r.writeLocks },
      });
    } catch (err) {
      panel.show({ tone: "err", title: "Không ghi được kết quả khớp đơn vào phiên", lines: [String((err && err.message) || err), "Huỷ phiên ở tab POS rồi mở lại phiếu."], buttons: [{ label: "Tìm lại", onClick: retry }] });
      return null;
    }
    if (preReceived > 0) note = { tone: "warn", title: "Đơn đã có hàng nhận trước khi mở phiên", text: `Nextwaves đã ghi nhận ${preReceived} UID trước lượt này. Extension chỉ chuyển về POS sau một lượt “Xác nhận nhận hàng” mới trong phiên.` };
    return ctxFromSession(env, s2, po);
  }

  function expectedCount(c) {
    return ((c && c.expected && c.expected.shipments) || []).reduce((n, s) => n + s.lines.reduce((m, l) => m + l.units.length, 0), 0);
  }

  // v0.4.1: tem thiếu "thật" = tem thiếu trừ tem món đã bán gấp (UID nằm trên phiếu POS đã xong của PO). Không phải phiếu phần còn lại
  // → mọi tem thiếu đều thật (như v0.4.0). Danh sách thiếu Nextwaves tự báo (response receive-scan) cũng phải nằm trong phần đã bán.
  function realMissing(c, rec) {
    const sold = soldOf(c);
    const real = rec.missing.filter((e) => !sold.epcs.has(e));
    if (c && c.lastScan && Array.isArray(c.lastScan.missingUids)) for (const u of c.lastScan.missingUids) if (!sold.uids.has(u)) real.push(`uid:${u}`);
    return [...new Set(real)];
  }

  // Lựa chọn khi thiếu trên modal nhận hàng: "keep_open" (Giữ đơn mở) / "close_short" (Đóng đơn dù còn thiếu) / null (không có modal).
  function missingChoice() {
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc || !doc.querySelector) return null;
    const close = doc.querySelector('input[type="radio"][value="close_short"]');
    const keep = doc.querySelector('input[type="radio"][value="keep_open"]');
    if (close && close.checked) return "close_short";
    if (keep && keep.checked) return "keep_open";
    return null;
  }

  // ---------- đầu đọc của màn quét (C2) ----------
  function readerButton() {
    const doc = typeof document !== "undefined" ? document : null;
    const btns = doc && doc.querySelectorAll ? Array.from(doc.querySelectorAll("button")) : [];
    const text = (b) => String(b.textContent || "").replace(/\s+/g, " ").trim();
    // Review v0.4.0 P3-8: bám ĐÚNG phần tử nút đầu đọc đã thấy (nút này đổi chữ Kết nối → Đang kết nối… → Dừng / Bắt đầu quét);
    // một nút "Dừng" khác trên trang không bao giờ được coi là đầu đọc.
    if (rd.el && btns.includes(rd.el)) {
      const t = text(rd.el);
      const state = READER_CONNECT.test(t) ? "disconnected" : READER_IDLE.test(t) ? "connected" : READER_READING.test(t) ? "reading" : "busy";
      return { btn: rd.el, state, tracked: true };
    }
    for (const [re, state] of [[READER_CONNECT, "disconnected"], [READER_IDLE, "connected"]]) {
      const b = btns.find((x) => re.test(text(x)));
      if (b) {
        rd.el = b;
        return { btn: b, state, tracked: true };
      }
    }
    // Chưa thấy nút đầu đọc ở trạng thái Kết nối / Bắt đầu quét (vd. màn quét tự kết nối và đang quét ngay): "Dừng" chỉ để hiển thị.
    const stop = btns.find((x) => READER_READING.test(text(x)));
    return stop ? { btn: null, state: "reading", tracked: false } : { btn: null, state: "none", tracked: false };
  }

  // v0.4.1 — modal "Nhận hàng bằng cách quét" (trang PO Nextwaves hoặc màn quét /receive): dấu hiệu cấu trúc ổn định (DOM chụp 08/11,
  // samples/nw-stg-receive-modal-markers-20261108.json): ô quét #scan-receive-qr nằm trong [role=dialog]; câu "Quét tem của phiếu gửi
  // IT-…". Không dựa vào chữ nút đầu đọc (đổi theo trạng thái) hay radio (chỉ có khi còn thiếu).
  function receiveModal() {
    // Chỉ trên Nextwaves của tenant đang chọn (content script chạy trên mọi *.nextwaves.app).
    const env = E.envFromConfig(config);
    if (!env || String(location.origin || "").toLowerCase() !== env.nwUiOrigin.toLowerCase()) return { open: false, shipment: null };
    const doc = typeof document !== "undefined" ? document : null;
    const input = doc && typeof doc.getElementById === "function" ? doc.getElementById("scan-receive-qr") : null;
    const dlg = input && typeof input.closest === "function" ? input.closest('[role="dialog"]') : null;
    if (!dlg) return { open: false, shipment: null };
    const m = /Quét tem của phiếu gửi (IT-[A-Z0-9-]+)/i.exec(String(dlg.textContent || ""));
    return { open: true, shipment: m ? m[1].toUpperCase() : null };
  }

  const RH_REASON = {
    busy: "tab bán hàng đang gửi tem vào giỏ — đợi gửi xong rồi bấm lại",
    no_holder: "không thấy tab bán hàng nào đang giữ đầu đọc",
    many_holders: "có nhiều tab bán hàng đang mở — bấm “Mở tab bán hàng” rồi Ngắt kết nối ở đó",
    lock_timeout: "đã bấm Ngắt nhưng tab bán hàng chưa nhả đầu đọc — đợi vài giây rồi bấm lại",
    not_holding: "tab bán hàng không còn giữ đầu đọc",
    no_button: "không bấm được nút Ngắt của QR Scan Log — mở tab bán hàng để Ngắt tay",
    click_failed: "không bấm được nút Ngắt của QR Scan Log — mở tab bán hàng để Ngắt tay",
    no_answer: "tab bán hàng không trả lời — mở tab bán hàng để Ngắt tay",
  };

  function readerLine() {
    const s = curSession;
    const sup = s && s.reader ? s.reader : null;
    const lent = sup && sup.supported ? (sup.state === "returned" ? "" : " Tab bán hàng (QR Scan Log) đã nhả đầu đọc cho lượt này.") : "";
    switch (rd.state) {
      case "reading":
        return "Đầu đọc: đang quét — đặt hàng lên đầu đọc.";
      case "busy":
        return "Đầu đọc: đang kết nối…";
      case "connected":
        return "Đầu đọc: đã kết nối." + lent + (rh.taken ? " Đã lấy từ tab bán hàng — xong việc, sang tab bán hàng bấm “Kết nối RFID” để bán tiếp." : "");
      case "disconnected": {
        if (rh.taking) return "Đầu đọc: đang lấy từ tab bán hàng…";
        if (!rd.gaveUp) return "Đầu đọc: chưa kết nối — extension đang tự kết nối…";
        if (sup && sup.supported) return "Đầu đọc: chưa kết nối được — bấm “Mượn lại đầu đọc”, hoặc bấm “Kết nối đầu đọc” của Nextwaves.";
        const why = rh.msg ? ` (${rh.msg})` : "";
        const st = rh.status;
        if (st && st.holders === 1) {
          return st.busy
            ? `Đầu đọc: tab bán hàng (QR Scan Log) đang giữ và đang gửi tem vào giỏ — đợi xong rồi bấm “Lấy đầu đọc cho Nextwaves”.${why}`
            : `Đầu đọc: tab bán hàng (QR Scan Log) đang giữ — bấm “Lấy đầu đọc cho Nextwaves”.${why}`;
        }
        if (st && st.holders > 1) return `Đầu đọc: nhiều tab bán hàng đang mở — bấm “Mở tab bán hàng”, Ngắt kết nối ở đó rồi quay lại tab này (extension tự kết nối).${why}`;
        // Không thấy QR Scan Log giữ (hoặc QR Scan Log đổi giao diện — extension không nhận ra): vẫn giữ hướng dẫn cũ + khả năng khác.
        if (st && st.holders === 0) return `Đầu đọc: chưa kết nối được. Nếu tab bán hàng đang dùng RFID: bấm “Mở tab bán hàng”, Ngắt kết nối ở đó rồi quay lại tab này (extension tự kết nối). Nếu không: kiểm cáp đầu đọc, hoặc bấm “Kết nối đầu đọc” của Nextwaves (lần đầu chọn cổng).${why}`;
        return `Đầu đọc: đang bận ở tab khác — sang tab bán hàng bấm Ngắt kết nối rồi quay lại tab này, extension tự kết nối lại.${why}`;
      }
      default:
        return "";
    }
  }

  // Nút đầu đọc trên khung (có phiên: renderReady; không phiên: renderHelper). Chỉ khi đã tự bấm hết lượt mà vẫn chưa kết nối.
  function readerButtons() {
    const out = [];
    if (rd.state !== "disconnected" || !rd.gaveUp || rh.taking) return out;
    const sup = curSession && curSession.reader && curSession.reader.supported;
    if (sup) return out;
    if (rh.status && rh.status.holders === 1 && !rh.status.busy) out.push({ label: "Lấy đầu đọc cho Nextwaves", onClick: () => takeFromQsl() });
    out.push({ label: "Mở tab bán hàng", secondary: true, onClick: () => bg("reader:focusSale").catch(() => {}) });
    return out;
  }

  // Khung khi KHÔNG có phiên mà đang mở modal nhận hàng (vd. trang PO Nextwaves): chỉ lo đầu đọc. Có phiên → renderReady lo.
  function renderHelper() {
    if (ctx) return renderReady();
    if (!rh.open) {
      if (rh.reminder) {
        return panel.show({
          tone: "info",
          title: "Đầu đọc: nhận hàng xong",
          lines: ["Extension đã lấy đầu đọc từ tab bán hàng cho lượt nhận này. Sang tab bán hàng bấm “Kết nối RFID” (chọn cổng) để bán tiếp."],
          buttons: [
            { label: "Mở tab bán hàng", onClick: () => bg("reader:focusSale").catch(() => {}) },
            {
              label: "Đóng",
              secondary: true,
              onClick: () => {
                rh.reminder = false;
                panel.hide();
              },
            },
          ],
        });
      }
      return panel.hide();
    }
    const line = readerLine();
    // Đầu đọc đã kết nối / đang quét và không có gì để báo → không che màn quét.
    if (!line || ((rd.state === "connected" || rd.state === "reading") && !rh.taken)) return panel.hide();
    const warn = rd.state === "disconnected" && rd.gaveUp;
    panel.show({ tone: warn ? "warn" : "info", title: "Đầu đọc cho màn nhận hàng", lines: [line].concat(rh.shipment ? [`Phiếu gửi ${rh.shipment}.`] : []), buttons: readerButtons() });
  }
  const rerender = () => (ctx ? renderReady() : renderHelper());

  // Hỏi trạng thái QR Scan Log ở các tab POS (chỉ đọc) khi đã tự bấm hết lượt mà vẫn chưa kết nối — tối đa mỗi qslAskMs một lần.
  function askQsl(now) {
    if (rh.asking || now - rh.lastAsk < T.qslAskMs) return;
    rh.asking = true;
    rh.lastAsk = now;
    bg("reader:qslStatus")
      .then((st) => {
        rh.status = st || null;
      })
      .catch(() => {
        rh.status = null;
      })
      .finally(() => {
        rh.asking = false;
        rerender();
      });
  }

  // Dược sĩ bấm "Lấy đầu đọc cho Nextwaves": background nhờ tab bán hàng đang giữ bấm "Ngắt kết nối" (QR Scan Log) và chờ cổng trống,
  // rồi tab này bấm "Kết nối đầu đọc" NGAY (còn trong hiệu lực cú bấm của dược sĩ — lần đầu Chrome có thể hỏi chọn cổng).
  async function takeFromQsl() {
    if (rh.taking) return;
    rh.taking = true;
    rh.msg = null;
    rerender();
    let r = null;
    try {
      r = await bg("reader:takeFromQsl", { key: ctx ? ctx.key : null });
    } catch (e) {
      r = { ok: false, reason: "no_answer" };
    }
    rh.taking = false;
    if (r && r.ok) {
      rh.taken = true;
      rd.clicks = [];
      rd.gaveUp = false;
      rd.lastClick = 0;
      rd.since = 0;
      rd.fastUntil = Date.now() + T.readerFastMs;
      connectNow();
    } else {
      rh.msg = RH_REASON[(r && r.reason) || "no_answer"] || String((r && r.reason) || "lỗi");
      rh.lastAsk = 0; // hỏi lại trạng thái ngay lượt sau
    }
    rerender();
  }

  // Bấm "Kết nối đầu đọc" của Nextwaves một lần (đường dùng lại cổng đã cấp quyền).
  function connectNow() {
    const r = readerButton();
    if (r.state !== "disconnected" || !r.btn || r.btn.disabled) return;
    const now = Date.now();
    rd.clicks.push(now);
    rd.lastClick = now;
    try {
      r.btn.click();
    } catch (_) {
      /* bỏ qua */
    }
    if (ctx) logTo(ctx.key, { type: "reader_connect_click", n: rd.clicks.length, after: rh.taken ? "qsl_release" : null });
  }

  function readerTick() {
    const now = Date.now();
    // v0.4.1: modal nhận hàng mở / đóng (cả khi không có phiên).
    const modal = receiveModal();
    if (modal.open !== rh.open || modal.shipment !== rh.shipment) {
      const closed = rh.open && !modal.open;
      rh.open = modal.open;
      rh.shipment = modal.shipment;
      if (closed) {
        // Đóng modal: lượt bấm / lượt hỏi của modal cũ hết hiệu lực; đã lấy đầu đọc từ tab bán hàng → nhắc kết nối lại ở đó.
        Object.assign(rd, { clicks: [], gaveUp: false, lastClick: 0, since: now, fastUntil: 0 });
        if (rh.taken) rh.reminder = true;
        Object.assign(rh, { status: null, msg: null, taken: false, lastAsk: 0 });
      } else if (modal.open) rh.reminder = false;
      rerender();
    }
    // v0.4.1: phiếu phần còn lại — dược sĩ đổi lựa chọn khi thiếu (Giữ đơn mở / Đóng đơn) → vẽ lại dòng hướng dẫn / cảnh báo.
    const choice = missingChoice();
    if (choice !== lastChoice) {
      lastChoice = choice;
      if (ctx && ctx.remainder) renderReady();
    }
    lendTick(now);
    // Audit v0.4.0 P3-10: chỉ quét nút đầu đọc khi có màn quét của phiên hoặc modal nhận hàng — không quét mọi trang Nextwaves mỗi giây.
    if (!ctx && !rh.open) return;
    const r = readerButton();
    if (r.state !== rd.state) {
      rd.state = r.state;
      rd.since = now;
      // Review v0.4.0 P3-8: chỉ đặt lại khi chính nút đầu đọc báo đã kết nối / đang quét; chữ tạm (đang kết nối…) không mở thêm lượt bấm.
      if (r.tracked && (r.state === "connected" || r.state === "reading")) {
        rd.clicks = [];
        rd.gaveUp = false;
        rh.msg = null;
      }
      rerender();
    }
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    // 07/11 (chưa tích hợp QR Scan Log): hết lượt bấm vì cổng bị tab bán hàng giữ → dược sĩ sang tab bán hàng Ngắt rồi QUAY LẠI
    // tab này → mở một lượt bấm mới (vẫn tối đa readerMaxClicks lần, cách readerGapMs). Không quay lại thì không bấm thêm.
    if (hidden) rd.away = true;
    else if (rd.away) {
      rd.away = false;
      if (rd.gaveUp && r.state === "disconnected") {
        rd.clicks = [];
        rd.gaveUp = false;
        rd.since = now;
        rerender();
      }
    }
    if (r.state !== "disconnected" || !r.btn || hidden) return;
    if (rd.gaveUp) {
      if (!(curSession && curSession.reader && curSession.reader.supported)) askQsl(now);
      return;
    }
    // Cho màn quét tự kết nối trước (autoConnect của Nextwaves), rồi mới bấm; tối đa readerMaxClicks lần cho MỘT lượt mất kết nối,
    // cách readerGapMs (ngay sau khi lấy đầu đọc từ tab bán hàng: cách readerFastGapMs). Hết lượt: hỏi QR Scan Log, chờ dược sĩ bấm.
    const fast = now < (rd.fastUntil || 0);
    if ((!fast && now - rd.since < T.readerFirstClickMs) || now - rd.lastClick < (fast ? T.readerFastGapMs : T.readerGapMs) || r.btn.disabled) return;
    if (rd.clicks.length >= T.readerMaxClicks) {
      rd.gaveUp = true;
      rh.lastAsk = 0;
      if (!(curSession && curSession.reader && curSession.reader.supported)) askQsl(now);
      rerender();
      return;
    }
    connectNow();
  }

  // Lượt mượn đầu đọc có hạn (TTL ở QR Scan Log): gia hạn mỗi readerRenewMs khi phiên còn ở màn quét; QR Scan Log bận / không trả lời
  // lúc mượn → thử lại mỗi readerRetryMs (tối đa readerRetryMax lần). Chỉ khi QR Scan Log có hỗ trợ (phiên có reader.supported).
  function lendTick(now) {
    const s = curSession;
    if (!ctx || !s || s.key !== ctx.key || !s.reader || !s.reader.supported || !OPEN.has(s.state)) return;
    if (lend.key !== s.key) Object.assign(lend, { key: s.key, last: now, tries: 0 });
    const ok = ["released", "free", "off", "lent"].includes(s.reader.state);
    const due = ok ? now - lend.last >= T.readerRenewMs : now - lend.last >= T.readerRetryMs && lend.tries < T.readerRetryMax;
    if (!due) return;
    lend.last = now;
    if (!ok) lend.tries += 1;
    bg("reader:lend", { key: s.key, why: ok ? "renew" : "retry" }).catch(() => {});
  }

  async function lendAgain() {
    if (!ctx) return;
    rd.clicks = [];
    rd.gaveUp = false;
    rd.lastClick = 0;
    try {
      await bg("reader:lend", { key: ctx.key });
    } catch (_) {
      /* khung tự báo trạng thái đầu đọc */
    }
    renderReady();
  }

  function renderReady() {
    if (!ctx) return;
    const key = ctx.key;
    const wh = ctx.warehouseName || ctx.warehouseCode ? `Kho Nextwaves: ${[ctx.warehouseName, ctx.warehouseCode ? `(${ctx.warehouseCode})` : ""].filter(Boolean).join(" ")}` : "";
    const sold = soldOf(ctx);
    const exp = expectedCount(ctx);
    const lines = [
      `Phiếu ${ctx.grCode}${ctx.posName ? ` · ${ctx.posName}` : ""} ↔ Nextwaves ${ctx.nwPoNumber} (${ctx.soBase}) — ${sold.uids.size ? `${exp - sold.uids.size} UID cần quét (đơn ${exp}, trừ ${sold.uids.size} món đã bán gấp)` : `${exp} UID dự kiến`}.`,
    ];
    // v0.4.1 — phiếu phần còn lại (operator 08/11: thiếu đúng món bán gấp → "Giữ đơn mở").
    let choiceWarn = false;
    if (ctx.remainder) {
      lines.push(`Phiếu phần còn lại — đã nhận trước ở ${ctx.remainder.completed.map((g) => g.code).join(", ")}.`);
      if (sold.uids.size) lines.push(`Màn quét sẽ báo thiếu ${sold.uids.size} tem món đã bán gấp: để “Giữ đơn mở” rồi bấm “Xác nhận nhận hàng”.`);
      if (missingChoice() === "close_short") {
        choiceWarn = true;
        lines.push("ĐANG CHỌN “Đóng đơn dù còn thiếu”: Nextwaves sẽ báo Buymed giao thiếu (sai — món đã giao và đã bán). Chọn “Giữ đơn mở”.");
      }
    }
    if (wh) lines.push(wh);
    if (!note) {
      const pre = precheckLines(ctx);
      lines.push(...pre.lines);
      if (pre.warn) choiceWarn = true;
    }
    const rl = readerLine();
    if (rl) lines.push(rl);
    if (note) lines.push(note.text);
    else lines.push("Đặt hàng lên đầu đọc rồi bấm “Xác nhận nhận hàng”. Nhận đủ xong extension về POS và TỰ điền phiếu; dược sĩ kiểm rồi bấm HOÀN THÀNH trên POS.");
    const q = ctx.nwSearch;
    if (q) lines.push(`Tìm theo ${ctx.soBase}: total ${q.total}, đã đọc ${q.read}; ứng viên Buymed ${q.candidates}; refId đúng SO ${q.verified}.`);
    if (ctx.nwWriteLocks && ctx.nwWriteLocks.length) lines.push("Lưu ý: Nextwaves có nhiều đơn cùng SO chưa so được — điền phiếu POS sẽ bị khoá (chỉ xem).");
    else if (q && q.verified > 1) lines.push(`Nextwaves có ${q.verified} đơn cùng SO (tách giao): trên màn quét chọn ĐÚNG đơn ${ctx.nwPoNumber} — đơn khớp số lượng phiếu ${ctx.grCode}.`);
    const buttons = [
      { label: "Đọc lại kết quả nhận", secondary: true, onClick: () => collectOrPeek() },
      { label: "Về POS", secondary: true, onClick: () => bg("session:focusPos", { key }) },
    ];
    if (rd.state === "disconnected" && rd.gaveUp && curSession && curSession.reader && curSession.reader.supported) buttons.unshift({ label: "Mượn lại đầu đọc", onClick: () => lendAgain() });
    buttons.unshift(...readerButtons()); // v0.4.1: "Lấy đầu đọc cho Nextwaves" / "Mở tab bán hàng" (QR Scan Log chưa có circa-reader/v1)
    panel.show({
      tone: note ? note.tone : choiceWarn ? "warn" : "info",
      title: note ? note.title : "Sẵn sàng nhận hàng",
      lines,
      table: ctx.fingerprint && ctx.fingerprint.length ? { head: ["Sản phẩm POS", "SL GR (gốc)", "SL Nextwaves (gốc)"], rows: ctx.fingerprint.map((r) => [r.productId, String(r.grBase), String(r.nwBase)]) } : null,
      buttons,
    });
  }

  async function collectOrPeek() {
    if (!ctx) return;
    const s = await bg("session:findByNw", { envId: ctx.env.id, tenant: ctx.env.nwTenant, po: ctx.po });
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
        if (rec.units.length > 0 && realMissing(c, rec).length === 0 && rec.problems.length === 0) break;
      }
    } finally {
      collecting = false;
    }
    if (err) {
      note = { tone: "err", title: "Không đọc được kết quả nhận", text: err + "\nBấm “Đọc lại kết quả nhận”." };
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
        text: [rec.problems.length ? `Vấn đề: ${rec.problems.slice(0, 10).join(", ")}` : "", rec.unexpected.length ? `EPC ngoài danh sách dự kiến: ${rec.unexpected.slice(0, 10).join(", ")}` : ""].filter(Boolean).join("\n") + "\nExtension không chuyển về POS — phiếu nhận tay trên POS. Báo lại operator.",
      };
      return;
    }
    const real = realMissing(c, rec);
    const sold = soldOf(c);
    const onMissing = c.lastScan ? c.lastScan.onMissing : null;
    if (real.length) {
      logTo(key, { type: "nw_result_partial", received: rec.units.length, missing: rec.missing.length, soldMissing: rec.missing.length - rec.missing.filter((e) => !sold.epcs.has(e)).length, onMissing });
      // Thử staging 08/11: Nextwaves KHÔNG sinh phiếu gửi mới cho phần thiếu — một phiếu gửi chỉ nhận một lần (không quét bổ sung được).
      note = {
        tone: "warn",
        title: `Nextwaves đã nhận ${rec.units.length}/${expected || rec.units.length + rec.missing.length} UID — còn thiếu ${rec.missing.filter((e) => !sold.epcs.has(e)).length || real.length}`,
        text: "Phiếu gửi Nextwaves chỉ nhận được MỘT lần: phần thiếu không quét bổ sung được nữa. Extension chỉ điền phiếu POS khi đã nhận đủ — dược sĩ nhận tay trên POS.",
      };
      return;
    }
    // v0.4.1 (phiếu phần còn lại): thiếu đúng các tem món đã bán gấp → coi là đủ. Tem món đã bán vẫn bị đọc → vẫn điền (POS bỏ tem đó),
    // tab POS cảnh báo tồn Nextwaves dư (I6).
    const soldRead = rec.units.filter((u) => sold.uids.has(u.uid)).map((u) => u.uid);
    if (rec.missing.length || soldRead.length) logTo(key, { type: "nw_result_remainder", received: rec.units.length, soldMissing: rec.missing.length, soldRead: soldRead.length, onMissing });
    note = {
      tone: "ok",
      title: `Đã nhận đủ ${rec.units.length} UID${rec.missing.length ? ` (thiếu ${rec.missing.length} = món đã bán gấp)` : ""}`,
      text: `Đang về POS và tự điền phiếu ${c.grCode}…`,
    };
    renderReady();
    try {
      await bg("session:received", { key, payload: { units: rec.units, nwPoNumber: c.nwPoNumber, receiptIds: rec.receiptIds, at: Date.now(), soldMissing: rec.missing.length, onMissing } });
    } catch (e) {
      // Tab Nextwaves khác của cùng phiên đã báo nhận xong trước → không phải lỗi (review v0.4.0 P3-9).
      let s3 = null;
      try {
        s3 = await bg("session:findByNw", { envId: env.id, tenant: env.nwTenant, po: c.po });
      } catch (_) {
        s3 = null;
      }
      if (s3 && s3.key === key && !OPEN.has(s3.state)) {
        ctx = null;
        note = null;
        return refresh();
      }
      // A2: phiên đã bị xoá / hết hạn / đổi → không im lặng.
      note = { tone: "err", title: "Nextwaves ĐÃ nhận — POS CHƯA điền", text: `${String((e && e.message) || e)}\nNhận tay phiếu ${c.grCode} trên POS.` };
      return renderReady();
    }
    ctx = null;
    note = null;
    refresh();
  }

  async function onReceiveScan(p, fromEval) {
    const env = E.envFromConfig(config);
    if (!env || p.envId !== env.id || (p.tenant && p.tenant !== env.nwTenant)) return;
    if (!ctx && !fromEval && (running || collecting)) {
      pendingScan = p; // đang khớp đơn → xử lý ngay sau khi khớp
      return;
    }
    const ok2xx = p.httpStatus >= 200 && p.httpStatus < 300;
    if (!ctx || !ctx.shipmentIds.includes(p.shipmentId)) {
      if (!ok2xx) {
        if (ctx) {
          note = { tone: "err", title: `Nextwaves CHƯA nhận (HTTP ${p.httpStatus || "?"})`, text: `${nwErrorText(p.response || null)}\nPhiếu gửi này không thuộc đơn đã khớp với phiếu ${ctx.grCode}.` };
          renderReady();
        }
        return;
      }
      // A7: lượt 2xx của phiếu gửi thuộc phiên khác (SO tách giao / tab tự mở) → giao đúng phiên đó, rồi đọc kết quả cho phiên đó.
      let s2 = null;
      try {
        s2 = await bg("session:routeScan", { envId: env.id, tenant: env.nwTenant, scan: { shipmentId: p.shipmentId, httpStatus: p.httpStatus, sentEpcs: p.sentEpcs === undefined ? null : p.sentEpcs } });
      } catch (_) {
        s2 = null;
      }
      if (!s2) {
        if (ctx) logTo(ctx.key, { type: "receive_scan_other_shipment", shipmentId: p.shipmentId, httpStatus: p.httpStatus });
        note = { tone: "err", title: "Nextwaves ĐÃ nhận một phiếu gửi không gắn được phiếu POS", text: "Extension không biết phiếu POS nào ứng với phiếu gửi vừa nhận — nhận tay trên POS (hoặc mở phiếu đó từ POS rồi bấm “Đọc lại kết quả nhận”)." };
        if (ctx) return renderReady();
        return panel.show({ tone: note.tone, title: note.title, lines: [note.text] });
      }
      ctx = ctxFromSession(env, s2, ctx ? ctx.po : s2.soBase);
      curSession = s2;
      note = { tone: "busy", title: `Nextwaves đã nhận cho phiếu ${s2.grCode} — đang đọc kết quả…`, text: `${p.sentEpcs === null || p.sentEpcs === undefined ? "?" : p.sentEpcs} thẻ đã gửi.` };
      renderReady();
      await collect({});
      if (ctx) renderReady();
      return;
    }
    const resp = p.response || null;
    // v0.4.1: lựa chọn khi thiếu (keep_open / close_short) + UID Nextwaves tự báo là thiếu — đối chiếu với kết quả đọc lại (collect).
    const missingUids = ok2xx && resp && Array.isArray(resp.lines) ? resp.lines.flatMap((l) => (l && Array.isArray(l.missingUnitUids) ? l.missingUnitUids.map(String) : [])) : null;
    const onMissing = resp && typeof resp.onMissing === "string" ? resp.onMissing.slice(0, 20) : null;
    if (ok2xx) ctx.lastScan = { onMissing, missingUids };
    logTo(ctx.key, {
      type: "receive_scan",
      httpStatus: p.httpStatus,
      sentEpcs: p.sentEpcs,
      message: resp && resp.message ? String(resp.message) : null,
      reason: resp && resp.params && resp.params.reason ? String(resp.params.reason) : null,
      onMissing,
      nwMissing: missingUids ? missingUids.length : null,
    });
    if (ok2xx) {
      try {
        await bg("session:scanOk", { key: ctx.key, scan: { shipmentId: p.shipmentId, httpStatus: p.httpStatus, sentEpcs: p.sentEpcs === undefined ? null : p.sentEpcs, at: Date.now() } });
      } catch (e) {
        note = { tone: "err", title: "Nextwaves ĐÃ nhận — POS CHƯA điền", text: `${String((e && e.message) || e)}\nNhận tay phiếu ${ctx.grCode} trên POS.` };
        return renderReady();
      }
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
      const env = E.envFor(m.payload.envId, m.payload.tenant);
      const k = authKeyOf(env);
      const prev = authByKey[k];
      authByKey[k] = m.payload.headers;
      const changed = !prev || prev.authorization !== m.payload.headers.authorization;
      // A1 / A4: token đầu tiên → đánh giá; token mới sau lỗi 401 của lượt tìm → tìm lại một lần.
      if (!prev) refresh();
      else if (changed && latch && latch.status === 401) {
        latch = null;
        refresh();
      }
    } else if (m.type === "receive-scan") {
      onReceiveScan(m.payload).catch((err) => {
        note = { tone: "err", title: "Lỗi extension khi đọc kết quả nhận", text: String((err && err.message) || err) };
        renderReady();
      });
    }
  });

  // A1: chỉ đánh giá lại khi danh sách phiên đổi THẬT (khoá / trạng thái / đơn / tab) — log, lease, posTabId… không đánh thức tab này.
  // Audit v0.4.0 P3-11: chỉ xét phiên CỦA TRANG (đúng SO / số PO / id PO của ?po=, hoặc phiên đang vẽ) — phiên của phiếu khác đổi
  // (đầu đọc, tab) không làm tab này đọc lại PO Nextwaves.
  function compactSig(all) {
    const env = E.envFromConfig(config);
    const page = env ? E.classifyNwPage(location.href, env) : null;
    const po = page ? String(page.po || "").trim() : "";
    const base = po ? K.soBase(po) : null;
    const mine = (s) =>
      (curSession && s.key === curSession.key) ||
      (base && s.soBase === base) ||
      (po && ((s.nwPoId && s.nwPoId === po.toLowerCase()) || (s.nwPoNumber && s.nwPoNumber.toUpperCase() === po.toUpperCase())));
    return JSON.stringify(
      Object.values(all || {})
        .filter(mine)
        .map((s) => [s.key, s.state, s.createdAt, s.nwPoId || null, s.nwTabId || null, !!s.scanOk, (s.reader && s.reader.state) || null])
        .sort()
    );
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.config) {
      config = changes.config.newValue || null;
      latch = null;
      refresh();
    } else if (changes.sessions) {
      const sig = compactSig(changes.sessions.newValue);
      if (sig === sessionsSig) return;
      sessionsSig = sig;
      refresh();
    }
  });

  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      ctx = null;
      note = null;
      latch = null;
      refresh();
    }
  }, T.pollMs);
  setInterval(readerTick, T.readerPollMs);

  bg("config:get")
    .then((c) => {
      config = c;
      lastHref = location.href;
      return chrome.storage.local.get("sessions");
    })
    .then((r) => {
      sessionsSig = compactSig((r && r.sessions) || {});
      refresh();
    })
    .catch(() => {});
  window.postMessage({ mark: ME, type: "hello" }, location.origin);
})();
