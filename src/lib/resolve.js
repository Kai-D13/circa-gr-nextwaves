/*
 * Chọn đúng MỘT đơn Nextwaves cho SO của phiếu nhận. Thuần: I/O qua getOrder / getReceiving tiêm vào (test được).
 * PM audit 24/10 P1.1 — fail closed:
 *  - kết quả tìm phải có `total` và đọc đủ (total = số dòng đã đọc); nhiều trang / lệch → chặn, không chọn trên phần đã đọc;
 *  - không giới hạn số ứng viên; ứng viên thiếu trường → chặn;
 *  - bất kỳ GET ứng viên nào lỗi / hết giờ / sai dạng → chặn cả lượt (không bỏ qua rồi chọn ứng viên khác);
 *  - chỉ loại ứng viên khi dữ liệu nói rõ là của nơi khác: bên bán khác, kho khác, refId khác SO, đơn đã huỷ, lệch số lượng.
 * Ghi chú khoá ghi (PM P3): còn hơn một đơn cùng SO (dù dấu vân tay chỉ khớp một) → chưa chứng minh được đúng lần giao.
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
    no_match: "Không có đơn Nextwaves khớp phiếu nhận",
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
    const out = { ok: false, reason: null, message: null, total: null, read: 0, candidates: 0, verified: 0, reports: [], chosen: null, writeLocks: [] };
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

    const matched = [];
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
        continue;
      }
      matched.push({ order, receiving, fp });
    }
    if (matched.length === 0) return fail("no_match");
    if (matched.length > 1) return fail("ambiguous", { matched: matched.map((m) => m.order.poNumber) });
    if (verified.length > 1) out.writeLocks.push("nw_many_orders");
    return Object.assign(out, { ok: true, chosen: matched[0] });
  }

  const lib = { resolveNwOrder, REASONS };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.resolve = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
