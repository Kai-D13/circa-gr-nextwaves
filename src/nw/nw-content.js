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
  const N = C.nw;
  const R = C.resolve;
  const T = Object.assign({ pollMs: 700, collectTries: 6, collectDelayMs: 1500, httpTimeoutMs: 30000, authWaitMs: 20000, readerPollMs: 1000, readerFirstClickMs: 1500, readerGapMs: 10000, readerMaxClicks: 3 }, C.tuning || {});
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
  const rd = { state: "none", since: 0, clicks: [], lastClick: 0, gaveUp: false }; // đầu đọc của màn quét

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
      return panel.hide();
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
      return showNoOrder(s);
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
    };
  }

  function showNoOrder(s) {
    panel.show({
      tone: "warn",
      title: `Nextwaves chưa có đơn chờ nhận cho ${s.soBase}`,
      lines: [
        `Phiếu ${s.grCode} (${s.deliveryCode || s.soBase}): nhận tay trên POS như hiện nay.`,
        "Hàng có tem RFID mà vẫn báo vậy: kiểm tra tài khoản Nextwaves đang đăng nhập có quyền kho của cửa hàng, rồi bấm “Tìm lại”.",
      ],
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
      if (r.reason === "no_order") {
        // Tìm đọc đủ mà không có đơn nào cùng SO: phiên → no_nw_order (background trả đầu đọc). Vẽ theo phiên mới.
        let s2 = null;
        try {
          s2 = await bg("session:noOrder", { key: s.key, result: { total: r.total, read: r.read } });
        } catch (_) {
          s2 = null;
        }
        latch = { sig: sigOf(s2 || s), view: null };
        showNoOrder(s2 || s);
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

  // ---------- đầu đọc của màn quét (C2) ----------
  function readerButton() {
    const doc = typeof document !== "undefined" ? document : null;
    const btns = doc && doc.querySelectorAll ? doc.querySelectorAll("button") : [];
    for (const b of btns) {
      const t = String(b.textContent || "").replace(/\s+/g, " ").trim();
      if (READER_CONNECT.test(t)) return { btn: b, state: "disconnected" };
      if (READER_IDLE.test(t)) return { btn: b, state: "connected" };
      if (READER_READING.test(t)) return { btn: b, state: "reading" };
    }
    return { btn: null, state: "none" };
  }

  function readerLine() {
    const s = curSession;
    const sup = s && s.reader ? s.reader : null;
    const lent = sup && sup.supported ? (sup.state === "returned" ? "" : " Tab bán hàng (QR Scan Log) đã nhả đầu đọc cho lượt này.") : "";
    switch (rd.state) {
      case "reading":
        return "Đầu đọc: đang quét — đặt hàng lên đầu đọc.";
      case "connected":
        return "Đầu đọc: đã kết nối." + lent;
      case "disconnected":
        if (rd.gaveUp) return sup && sup.supported ? "Đầu đọc: chưa kết nối được — bấm “Mượn lại đầu đọc”, hoặc bấm “Kết nối đầu đọc” của Nextwaves." : "Đầu đọc: đang bận ở tab khác — vào tab bán hàng bấm Ngắt RFID, extension tự kết nối lại ở đây.";
        return "Đầu đọc: chưa kết nối — extension đang tự kết nối…";
      default:
        return "";
    }
  }

  function readerTick() {
    const r = readerButton();
    const now = Date.now();
    if (r.state !== rd.state) {
      rd.state = r.state;
      rd.since = now;
      if (r.state !== "disconnected") {
        rd.clicks = [];
        rd.gaveUp = false;
      }
      if (ctx) renderReady();
    }
    if (!ctx || r.state !== "disconnected" || !r.btn || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
    // Cho màn quét tự kết nối trước (autoConnect của Nextwaves), rồi mới bấm; tối đa readerMaxClicks lần, cách readerGapMs.
    if (now - rd.since < T.readerFirstClickMs || now - rd.lastClick < T.readerGapMs || r.btn.disabled) return;
    rd.clicks = rd.clicks.filter((t) => now - t < T.readerGapMs * (T.readerMaxClicks + 1));
    if (rd.clicks.length >= T.readerMaxClicks) {
      if (!rd.gaveUp) {
        rd.gaveUp = true;
        renderReady();
      }
      return;
    }
    rd.clicks.push(now);
    rd.lastClick = now;
    try {
      r.btn.click();
    } catch (_) {
      /* bỏ qua */
    }
    logTo(ctx.key, { type: "reader_connect_click", n: rd.clicks.length });
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
    const lines = [`Phiếu ${ctx.grCode}${ctx.posName ? ` · ${ctx.posName}` : ""} ↔ Nextwaves ${ctx.nwPoNumber} (${ctx.soBase}) — ${expectedCount(ctx)} UID dự kiến.`];
    if (wh) lines.push(wh);
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
    panel.show({
      tone: note ? note.tone : "info",
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
        if (rec.units.length > 0 && rec.missing.length === 0 && rec.problems.length === 0) break;
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
    if (rec.missing.length) {
      logTo(key, { type: "nw_result_partial", received: rec.units.length, missing: rec.missing.length });
      note = {
        tone: "warn",
        title: `Nextwaves mới nhận ${rec.units.length}/${expected || rec.units.length + rec.missing.length} UID`,
        text: "Quét tiếp phần còn thiếu rồi bấm “Xác nhận nhận hàng” lại. Extension chỉ đưa về POS khi đã nhận đủ.",
      };
      return;
    }
    note = { tone: "ok", title: `Đã nhận đủ ${rec.units.length} UID`, text: `Đang về POS và tự điền phiếu ${c.grCode}…` };
    renderReady();
    try {
      await bg("session:received", { key, payload: { units: rec.units, nwPoNumber: c.nwPoNumber, receiptIds: rec.receiptIds, at: Date.now() } });
    } catch (e) {
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
    logTo(ctx.key, {
      type: "receive_scan",
      httpStatus: p.httpStatus,
      sentEpcs: p.sentEpcs,
      message: resp && resp.message ? String(resp.message) : null,
      reason: resp && resp.params && resp.params.reason ? String(resp.params.reason) : null,
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
  function compactSig(all) {
    return JSON.stringify(
      Object.values(all || {})
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
