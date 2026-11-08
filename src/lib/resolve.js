/*
 * Chọn đúng MỘT đơn Nextwaves cho SO của phiếu nhận. Thuần: I/O qua getOrder / getReceiving tiêm vào (test được).
 * PM audit 24/10 P1.1 — fail closed:
 *  - kết quả tìm phải có `total` và đọc đủ (total = số dòng đã đọc); nhiều trang / lệch → chặn, không chọn trên phần đã đọc;
 *  - không giới hạn số ứng viên; ứng viên thiếu trường → chặn;
 *  - bất kỳ GET ứng viên nào lỗi / hết giờ / sai dạng → chặn cả lượt (không bỏ qua rồi chọn ứng viên khác);
 *  - chỉ loại ứng viên khi dữ liệu nói rõ là của nơi khác: bên bán khác, refId khác SO, đơn đã huỷ, lệch số lượng.
 * v0.4.0 (mọi cửa hàng): không còn bảng cửa hàng → kho. Mỗi SO Buymed thuộc MỘT khách Buymed = một kho Nextwaves, nên đơn đúng SO là đơn
 * của đúng cửa hàng. Mọi đơn cùng SO (đã qua kiểm refId / bên bán / huỷ) phải cùng MỘT kho, không rỗng; kho của phiên = kho đơn đã chọn.
 * Không có đơn nào cùng SO (tìm đọc đủ) → "no_order": phiếu nhận tay, tab Nextwaves không tìm lại.
 * Khoá ghi nw_many_orders (PM P3; v0.3.1 06/11 thu hẹp): SO tách giao có nhiều đơn → chọn được khi ĐÚNG MỘT đơn khớp số lượng và mọi
 * đơn khác lệch RÕ (so được mà khác). Đơn cùng SO không so được (dòng thiếu mã sản phẩm, số tem ≠ số lượng, chưa có phiếu gửi) → vẫn khoá.
 */
(function (root) {
  "use strict";
  const N = root.__CGN__ && root.__CGN__.nw ? root.__CGN__.nw : typeof require === "function" ? require("./nw-model.js") : null;
  const M = root.__CGN__ && root.__CGN__.match ? root.__CGN__.match : typeof require === "function" ? require("./match.js") : null;

  const REASONS = {
    search_failed: "Không tìm được đơn theo SO trên Nextwaves",
    search_unreadable: "Kết quả tìm đơn không đúng dạng (thiếu items / total)",
    search_incomplete: "Kết quả tìm đơn chưa đọc đủ (nhiều trang hoặc total lệch) — không chọn trên phần đã đọc",
    candidate_schema: "Đơn ứng viên thiếu trường cần kiểm",
    candidate_read_failed: "Không đọc được một đơn ứng viên — không chọn",
    candidate_inconsistent: "Dữ liệu đơn ứng viên không nhất quán",
    no_order: "Nextwaves chưa có đơn chờ nhận của SO này",
    nw_partial_received: "Nextwaves đã nhận một phần đơn của SO này trước đó (phiếu gửi đã dùng) — không nhận tiếp được",
    no_match: "Có đơn Nextwaves của SO nhưng số lượng không khớp phiếu nhận",
    warehouse_inconsistent: "Các đơn Nextwaves cùng SO không cùng một kho (hoặc thiếu kho) — không tự chọn",
    ambiguous: "Có nhiều đơn Nextwaves cùng khớp phiếu nhận — không tự chọn",
  };
  const VERIFY = {
    so_mismatch: "refId không cùng SO",
    counterparty_mismatch: "bên bán không phải Buymed của môi trường",
    warehouse_mismatch: "kho nhận khác",
    order_cancelled: "đơn đã huỷ / từ chối",
  };

  async function safeGet(fn, id) {
    try {
      const r = await fn(id);
      return r && r.ok ? { ok: true, json: r.json } : { ok: false, detail: `HTTP ${r ? r.status : "?"}` };
    } catch (err) {
      return { ok: false, detail: String((err && err.message) || err) };
    }
  }

  // args: {search: {ok, status, json}, ctx: {soBase, buymedSlug, warehouseId}, fingerprintSource, getOrder(poId), getReceiving(poId)}
  async function resolveNwOrder(args) {
    const { search, ctx, fingerprintSource, getOrder, getReceiving } = args;
    const out = { ok: false, reason: null, message: null, total: null, read: 0, candidates: 0, verified: 0, reports: [], chosen: null, writeLocks: [], warehouseId: null };
    const fail = (reason, extra) => Object.assign(out, { reason, message: REASONS[reason] || reason }, extra || {});

    if (!search || !search.ok) return fail("search_failed", { detail: search ? `HTTP ${search.status}` : null });
    const page = N.normalizeReceivingSearchPage(search.json);
    if (!page) return fail("search_unreadable");
    out.total = page.total;
    out.read = page.items.length;
    if (page.total !== page.items.length) return fail("search_incomplete");

    const cands = [];
    for (const c of page.items) {
      if (!c.poId || !c.slug || !c.warehouseId) return fail("candidate_schema", { poNumber: c.poNumber || c.poId || "?" });
      if (c.slug !== ctx.buymedSlug) {
        out.reports.push([c.poNumber, VERIFY.counterparty_mismatch]);
        continue;
      }
      if (ctx.warehouseId && c.warehouseId !== ctx.warehouseId) {
        // Chỉ khi người gọi đã biết kho (không dùng ở v0.4.0 — kho lấy từ đơn đã khớp).
        out.reports.push([c.poNumber, VERIFY.warehouse_mismatch]);
        continue;
      }
      cands.push(c);
    }
    out.candidates = cands.length;

    const verified = [];
    for (const c of cands) {
      const r = await safeGet(getOrder, c.poId);
      if (!r.ok) return fail("candidate_read_failed", { poNumber: c.poNumber, detail: r.detail });
      const order = N.normalizeOrderOfPo(r.json);
      if (!order || !order.refId || !order.status || !order.slug || !order.warehouseId) return fail("candidate_schema", { poNumber: c.poNumber });
      if (order.poId !== c.poId) return fail("candidate_inconsistent", { poNumber: c.poNumber });
      const v = N.verifyOrder(order, ctx);
      if (!v.ok) {
        out.reports.push([c.poNumber, v.errors.map((x) => VERIFY[x] || x).join(", ")]);
        continue;
      }
      verified.push({ c, order });
    }
    out.verified = verified.length;
    if (verified.length === 0) return fail("no_order");
    // v0.4.1 (thử staging 08/11): nhận thiếu một lần là phiếu gửi đã dùng — đơn PARTIALLY_RECEIVED, openShipmentCount 0, Nextwaves không
    // sinh phiếu gửi mới. Mọi đơn cùng SO đều như vậy → báo đúng lý do (trước đây rơi vào "số lượng không khớp"). Có đơn khác còn phiếu
    // gửi thì xét như v0.4.0 (đơn đã dùng không so được → khoá nw_many_orders).
    const consumed = (v) => v.c.openShipmentCount === 0 && /^PARTIALLY_RECEIVED$/i.test(v.c.poStatus || v.order.poStatus || "");
    if (verified.every(consumed)) return fail("nw_partial_received", { poNumber: verified.map((v) => v.c.poNumber).join(", ") });
    const whs = [...new Set(verified.map((v) => v.order.warehouseId || ""))];
    if (whs.length !== 1 || !whs[0]) return fail("warehouse_inconsistent", { detail: `kho: ${whs.map((w) => (w ? w.slice(0, 8) : "trống")).join(", ")}` });
    out.warehouseId = whs[0];

    const matched = [];
    const unclear = []; // đơn cùng SO không so được với phiếu → không chứng minh được là lần giao khác
    for (const { c, order } of verified) {
      const r = await safeGet(getReceiving, c.poId);
      if (!r.ok) return fail("candidate_read_failed", { poNumber: c.poNumber, detail: r.detail });
      const receiving = N.normalizeReceiving(r.json);
      if (!receiving) return fail("candidate_schema", { poNumber: c.poNumber });
      if (receiving.poId !== c.poId) return fail("candidate_inconsistent", { poNumber: c.poNumber });
      const fp = M.fingerprint(fingerprintSource, receiving);
      if (!fp.ok) {
        const bad = fp.rows.filter((x) => !x.ok).map((x) => `SP ${x.productId}: GR ${x.grBase} ≠ NW ${x.nwBase}${x.problems.length ? ` (${x.problems.join(", ")})` : ""}`);
        out.reports.push([c.poNumber, `lệch số lượng — ${bad.join("; ")}`]);
        const shipped = receiving.shipments.some((s) => s.lines.length);
        if (!shipped || fp.rows.some((x) => x.productId === "?" || x.problems.includes("tagged_count_mismatch"))) unclear.push(c.poNumber);
        continue;
      }
      matched.push({ order, receiving, fp });
    }
    if (matched.length === 0) return fail("no_match");
    if (matched.length > 1) return fail("ambiguous", { matched: matched.map((m) => m.order.poNumber) });
    // v0.3.1 (operator 06/11): một SO tách giao nhiều lần → nhiều đơn Nextwaves cùng SO (refId "-16025426" / "-16025427"), POS tách
    // PO con "-P1" / "-P2"; hai bên không có mã chung nào. ĐÚNG MỘT đơn khớp số lượng từng sản phẩm của phiếu, mọi đơn khác lệch → chọn
    // đơn đó, không khoá ghi (trước đây khoá nw_many_orders). Hai đơn cùng khớp → "ambiguous" như cũ. Nhận nhầm đơn kia trên màn quét:
    // background chỉ nhận lượt của phiếu gửi thuộc đơn đã khớp. Audit 06/11 P2-2: đơn khác mà không so được → giữ khoá như cũ.
    if (unclear.length) out.writeLocks.push("nw_many_orders");
    return Object.assign(out, { ok: true, chosen: matched[0] });
  }

  const lib = { resolveNwOrder, REASONS };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.resolve = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
