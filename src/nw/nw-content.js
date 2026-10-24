/*
 * Màn quét Nextwaves /vi/purchases/receive?po=<SO | số PO> (ISOLATED world). Chỉ chạy khi có phiên do tab POS mở.
 *  1. Tìm đơn liên kết theo SO (GET …/inter-tenant-orders/receiving?q=<SO>), kiểm refId / bên bán / kho, kiểm dấu vân tay với GR.
 *  2. Chờ dược sĩ bấm "Xác nhận nhận hàng" (hook thấy POST …/receive-scan).
 *  3. 2xx → đọc lại PO + phiếu gửi → danh sách UID đã nhận (sản phẩm, đơn vị, lô) → nhận đủ thì báo background đưa về POS.
 * Chỉ GET API thường của Nextwaves. Không gọi /integrations/circa/*, không gọi API ghi, không bấm nút hộ dược sĩ.
 */
(function () {
  "use strict";
  if (window.__CGN_NW_CONTENT__) return;
  window.__CGN_NW_CONTENT__ = true;

  const C = globalThis.__CGN__;
  const E = C.env;
  const N = C.nw;
  const M = C.match;
  const T = Object.assign({ pollMs: 700, collectTries: 6, collectDelayMs: 1500, maxCandidates: 10 }, C.tuning || {});
  const HOOK = "cgn/nw-hook";
  const ME = "cgn/nw-content";
  const panel = C.ui.createPanel("GR ← Nextwaves");
  const OPEN = new Set(["waiting_nw", "nw_ready"]);

  const VERIFY_MSG = {
    order_unreadable: "không đọc được đơn",
    so_mismatch: "refId không cùng SO",
    counterparty_mismatch: "bên bán không phải Buymed của môi trường này",
    warehouse_mismatch: "kho nhận không phải kho của cửa hàng",
    order_cancelled: "đơn đã huỷ / từ chối",
  };
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
  let ctx = null; // {env, key, po, nwPoId, nwPoNumber, shipmentIds, expected, grCode}
  let note = null; // thông báo gần nhất của lượt nhận (giữ khi vẽ lại)
  let pendingScan = null; // lượt "Xác nhận nhận hàng" đến trước khi khớp xong đơn → xử lý ngay sau khi khớp

  async function bg(type, extra) {
    const r = await chrome.runtime.sendMessage(Object.assign({ type }, extra || {}));
    if (!r || !r.ok) throw new Error((r && r.error) || "background");
    return r.data;
  }
  const logTo = (key, log) => bg("session:log", { key, log }).catch(() => {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function nwGet(env, url) {
    const res = await fetch(url, { method: "GET", headers: Object.assign({}, authByEnv[env.id] || {}), cache: "no-store" });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_) {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
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
        lines: ["Phiếu nhận trên POS đang được điền / đã điền."],
        buttons: [{ label: "Về POS", onClick: () => bg("session:focusPos", { key: s.key }) }],
      });
    }
    if (!authByEnv[env.id]) return panel.show({ tone: "busy", title: "Đang chờ Nextwaves tải dữ liệu…", lines: [] });

    if (s.nwPoId && s.expected && Array.isArray(s.shipmentIds)) {
      // Đã khớp đơn ở lần mở trước: giữ ảnh chụp "dự kiến" chụp TRƯỚC khi nhận, không tìm lại.
      ctx = { env, key: s.key, po: page.po, nwPoId: s.nwPoId, nwPoNumber: s.nwPoNumber, shipmentIds: s.shipmentIds, expected: s.expected, grCode: s.grCode, soBase: s.soBase, fingerprint: s.fpRows || [] };
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
    if (!note) await collect({ onLoad: true });
    renderReady();
  }

  async function resolveOrder(env, s, po) {
    panel.show({ tone: "busy", title: `Đang tìm đơn Nextwaves cho ${s.soBase}…`, lines: [] });
    const r = await nwGet(env, E.api.nwReceivingSearch(env, s.soBase));
    if (!r.ok) {
      panel.show({ tone: "err", title: "Không tìm được đơn Nextwaves", lines: [httpError("Tìm đơn theo SO", r)], buttons: [{ label: "Thử lại", onClick: refresh }] });
      return null;
    }
    const candidates = N.normalizeReceivingSearch(r.json)
      .filter((c) => c.slug === env.buymedSlug && (!s.warehouseId || c.warehouseId === s.warehouseId))
      .slice(0, T.maxCandidates);
    const good = [];
    const reports = [];
    for (const c of candidates) {
      const o = await nwGet(env, E.api.nwOrderOfPo(env, c.poId));
      const order = o.ok ? N.normalizeOrderOfPo(o.json) : null;
      const v = N.verifyOrder(order, { soBase: s.soBase, buymedSlug: env.buymedSlug, warehouseId: s.warehouseId });
      if (!v.ok) {
        reports.push([c.poNumber, v.errors.map((x) => VERIFY_MSG[x] || x).join(", ")]);
        continue;
      }
      const rc = await nwGet(env, E.api.nwReceiving(env, c.poId));
      const receiving = rc.ok ? N.normalizeReceiving(rc.json) : null;
      if (!receiving) {
        reports.push([c.poNumber, rc.ok ? "không đọc được danh sách nhận" : httpError("receiving", rc)]);
        continue;
      }
      const fp = M.fingerprint(s.fingerprint, receiving);
      if (!fp.ok) {
        const bad = fp.rows.filter((x) => !x.ok).map((x) => `SP ${x.productId}: GR ${x.grBase} ≠ NW ${x.nwBase}${x.problems.length ? ` (${x.problems.join(", ")})` : ""}`);
        reports.push([c.poNumber, `lệch số lượng — ${bad.join("; ")}`]);
        continue;
      }
      good.push({ order, receiving, fp });
    }
    if (good.length !== 1) {
      logTo(s.key, { type: "nw_match_failed", candidates: candidates.length, good: good.length });
      panel.show({
        tone: "err",
        title: good.length ? `Có ${good.length} đơn Nextwaves cùng khớp ${s.grCode} — không tự chọn` : `Không có đơn Nextwaves khớp phiếu ${s.grCode}`,
        lines: [`SO ${s.soBase}: tìm thấy ${candidates.length} đơn liên kết của Buymed cho kho này.`, "Extension sẽ không chuyển kết quả về POS. Báo lại operator."],
        table: reports.length ? { head: ["Đơn Nextwaves", "Lý do loại"], rows: reports } : null,
        buttons: [{ label: "Thử lại", onClick: refresh }],
      });
      return null;
    }
    const g = good[0];
    const fpRows = g.fp.rows.map((x) => ({ productId: x.productId, grBase: x.grBase, nwBase: x.nwBase }));
    const shipmentIds = g.receiving.shipments.map((x) => x.id);
    await bg("session:update", {
      key: s.key,
      patch: { state: "nw_ready", nwPoId: g.order.poId, nwPoNumber: g.order.poNumber, nwOrderId: g.order.orderId, nwRefId: g.order.refId, shipmentIds, expected: g.receiving, fpRows },
      log: { type: "nw_matched", nwPoNumber: g.order.poNumber, refId: g.order.refId, shipments: shipmentIds.length },
    });
    return { env, key: s.key, po, nwPoId: g.order.poId, nwPoNumber: g.order.poNumber, shipmentIds, expected: g.receiving, grCode: s.grCode, soBase: s.soBase, fingerprint: fpRows };
  }

  function expectedCount(c) {
    return ((c && c.expected && c.expected.shipments) || []).reduce((n, s) => n + s.lines.reduce((m, l) => m + l.units.length, 0), 0);
  }

  function renderReady() {
    if (!ctx) return;
    const key = ctx.key;
    const lines = [`Phiếu ${ctx.grCode} ↔ Nextwaves ${ctx.nwPoNumber} (${ctx.soBase}) — ${expectedCount(ctx)} UID dự kiến.`];
    if (note) lines.push(note.text);
    else lines.push("Đặt hàng lên reader rồi bấm “Xác nhận nhận hàng”. Nhận đủ xong extension tự đưa về POS và điền phiếu.");
    panel.show({
      tone: note ? note.tone : "info",
      title: note ? note.title : "Sẵn sàng nhận hàng",
      lines,
      table: ctx.fingerprint && ctx.fingerprint.length ? { head: ["Sản phẩm POS", "SL GR (gốc)", "SL Nextwaves (gốc)"], rows: ctx.fingerprint.map((r) => [r.productId, String(r.grBase), String(r.nwBase)]) } : null,
      buttons: [
        { label: "Đọc lại kết quả nhận", secondary: true, onClick: () => collect({}).then(renderReady) },
        { label: "Về POS", secondary: true, onClick: () => bg("session:focusPos", { key }) },
      ],
    });
  }

  // Đọc kết quả đã nhận. onLoad: chỉ một lần đọc, im lặng nếu chưa nhận gì (mở lại trang sau khi đã bấm xác nhận).
  async function collect(opts) {
    if (!ctx || collecting) return;
    collecting = true;
    const c = ctx; // trang có thể đổi giữa chừng → dùng bản chụp
    const { env, key } = c;
    const tries = opts.onLoad ? 1 : T.collectTries;
    let rec = null;
    let err = null;
    try {
      for (let i = 0; i < tries; i++) {
        if (i > 0) await sleep(T.collectDelayMs);
        err = null;
        const pd = await nwGet(env, E.api.nwPoDetail(env, c.nwPoId));
        if (!pd.ok) {
          err = httpError("Đọc PO Nextwaves", pd);
          continue;
        }
        const shipments = [];
        for (const id of c.shipmentIds) {
          const r = await nwGet(env, E.api.nwShipment(env, id));
          const sh = r.ok ? N.normalizeShipment(r.json) : null;
          if (!sh) err = httpError("Đọc phiếu gửi Nextwaves", r);
          else shipments.push(sh);
        }
        if (err) continue;
        rec = N.buildReceivedUnits(N.normalizePoDetail(pd.json), shipments, c.expected);
        if (opts.onLoad || (rec.units.length > 0 && rec.missing.length === 0)) break;
      }
    } finally {
      collecting = false;
    }
    if (err) {
      if (!opts.onLoad) note = { tone: "err", title: "Không đọc được kết quả nhận", text: err };
      return;
    }
    if (!rec || rec.units.length === 0) {
      if (!opts.onLoad) note = { tone: "warn", title: "Nextwaves chưa ghi nhận UID nào", text: "Chờ vài giây rồi bấm “Đọc lại kết quả nhận”." };
      return;
    }
    const expected = expectedCount(c);
    if (rec.problems.length || rec.unexpected.length) {
      logTo(key, { type: "nw_result_problem", problems: rec.problems.slice(0, 50), unexpected: rec.unexpected.slice(0, 50) });
      note = {
        tone: "err",
        title: "Kết quả nhận không khớp dữ liệu đơn",
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
    note = { tone: "ok", title: `Đã nhận đủ ${rec.units.length} UID`, text: `Đang chuyển về POS để điền phiếu ${c.grCode}…` };
    renderReady();
    await bg("session:received", { key, payload: { units: rec.units, nwPoNumber: c.nwPoNumber, at: Date.now() } });
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
