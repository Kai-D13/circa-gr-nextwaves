/*
 * Đọc response POS (GR, PO, tìm GR theo SO) thành dạng gọn và kiểm liên kết GR ↔ PO ↔ mã giao. Thuần.
 * Không giữ dữ liệu ngoài phạm vi cần (không giá, không thông tin người dùng).
 */
(function (root) {
  "use strict";
  const keys = root.__CGN__ && root.__CGN__.keys ? root.__CGN__.keys : typeof require === "function" ? require("./keys.js") : null;

  const RECEIVABLE = new Set(["WAITING_TO_RECEIVE", "RECEIVING"]);
  const lower = (s) => String(s || "").toLowerCase();
  const dataOf = (json) => (json && typeof json === "object" && "data" in json ? json.data : json);

  function normalizeGr(json) {
    const d = dataOf(json);
    if (!d || typeof d !== "object" || !d.id || !Array.isArray(d.items)) return null;
    return {
      id: lower(d.id),
      code: String(d.code || ""),
      status: String(d.status || ""),
      poId: lower(d.purchase_order_id),
      poCode: String(d.purchase_order_code || ""),
      posId: lower(d.pos_info && d.pos_info.id),
      updatedAt: String(d.updated_at || ""),
      items: d.items.map((it) => {
        const units = Array.isArray(it.retail_units) ? it.retail_units : [];
        const lineUnit = units.find((u) => lower(u.id) === lower(it.unit_id));
        const ratesByUnitName = {};
        for (const u of units) {
          if (u && u.unit && Number(u.convert_rate) > 0) ratesByUnitName[String(u.unit).trim().toLowerCase()] = Number(u.convert_rate);
        }
        return {
          id: lower(it.id),
          productId: String(it.product_id),
          productName: String(it.product_name || ""),
          unit: String(it.unit || ""),
          unitId: lower(it.unit_id),
          unitRate: lineUnit ? Number(lineUnit.convert_rate) : null,
          quantity: Number(it.quantity),
          baseQuantity: Number(it.base_quantity),
          ratesByUnitName,
          details: (Array.isArray(it.details) ? it.details : []).map((dt) => ({
            id: lower(dt.id),
            lotId: lower(dt.lot_id),
            lotDate: String(dt.lot_date || "").toUpperCase(),
            quantity: Number(dt.quantity),
            received: Number(dt.received_quantity) || 0,
            qrCodes: [...new Set(Array.isArray(dt.thuocsi_qr_codes) ? dt.thuocsi_qr_codes.map(String) : [])],
          })),
        };
      }),
    };
  }

  function normalizePo(json) {
    const d = dataOf(json);
    if (!d || typeof d !== "object" || !d.id) return null;
    return {
      id: lower(d.id),
      code: String(d.code || ""),
      posId: lower(d.pos_id),
      sourceType: String(d.source_type || ""),
      saleOrderNumber: String(d.sale_order_number || ""),
      deliveryCodes: Array.isArray(d.thuocsi_delivery_code) ? d.thuocsi_delivery_code.map(String).filter(Boolean) : [],
      grIds: (Array.isArray(d.goods_receipts) ? d.goods_receipts : []).map((g) => lower(g && g.id)).filter(Boolean),
    };
  }

  function normalizeGrSearch(json) {
    const d = dataOf(json);
    const list = d && Array.isArray(d.goods_receipts) ? d.goods_receipts : [];
    return list.map((g) => ({ id: lower(g.id), code: String(g.code || ""), status: String(g.status || ""), poId: lower(g.purchase_order_id), poCode: String(g.purchase_order_code || ""), posId: lower(g.pos_info && g.pos_info.id) }));
  }

  const isReceivable = (gr) => !!gr && RECEIVABLE.has(gr.status);

  // GR + PO → {ok, soBase, deliveryCode, errors[]}. Một mã giao ↔ một PO ↔ một GR (operator chốt 24/10).
  function resolveDelivery(gr, po) {
    const errors = [];
    if (!gr) errors.push("gr_unreadable");
    if (!po) errors.push("po_unreadable");
    if (errors.length) return { ok: false, errors };
    if (gr.poId !== po.id) errors.push("po_mismatch");
    if (!po.grIds.includes(gr.id)) errors.push("gr_not_in_po");
    if (gr.posId && po.posId && gr.posId !== po.posId) errors.push("store_mismatch");
    if (po.deliveryCodes.length === 0) errors.push("no_delivery_code");
    if (po.deliveryCodes.length > 1) errors.push("many_delivery_codes");
    const deliveryCode = po.deliveryCodes.length === 1 ? po.deliveryCodes[0] : "";
    const base = keys.soBase(deliveryCode);
    if (deliveryCode && !base) errors.push("delivery_code_format");
    if (base && po.saleOrderNumber && keys.soDigits(base) !== po.saleOrderNumber) errors.push("sale_order_number_mismatch");
    return { ok: errors.length === 0, deliveryCode, soBase: base, errors };
  }

  // Tóm tắt GR để đối chiếu dấu vân tay ở tab Nextwaves (không chứa mã QR / lô).
  function grFingerprintSource(gr) {
    return gr.items.map((it) => ({ productId: it.productId, baseQuantity: it.baseQuantity, ratesByUnitName: it.ratesByUnitName }));
  }

  // GET <posOrigin>/thuocsi-warehouse/qrcode?code=<uid> → {ok, productId, lot, expiredDate} | {ok:false, reason}.
  // Chỉ nhận bản ghi có uniqueId / shortId đúng UID; nhiều bản ghi khác nhau → không đoán.
  function normalizeQrLookup(json, uid) {
    if (!json || typeof json !== "object") return { ok: false, reason: "unreadable" };
    if (json.status && json.status !== "OK") return { ok: false, reason: String(json.status) };
    const list = Array.isArray(json.data) ? json.data : [];
    const want = String(uid || "").trim().toUpperCase();
    const hits = list.filter((d) => d && want && (String(d.uniqueId || "").toUpperCase() === want || String(d.shortId || "").toUpperCase() === want));
    if (!hits.length) return { ok: false, reason: "not_found" };
    const sig = (d) => [d.productId, String(d.lot || "").toUpperCase(), d.expiredDate].join("|");
    if (new Set(hits.map(sig)).size > 1) return { ok: false, reason: "ambiguous" };
    const d = hits[0];
    return { ok: true, productId: d.productId === undefined || d.productId === null ? null : d.productId, lot: String(d.lot || ""), expiredDate: String(d.expiredDate || ""), status: String(d.status || "") };
  }

  const lib = { normalizeGr, normalizePo, normalizeGrSearch, isReceivable, resolveDelivery, grFingerprintSource, normalizeQrLookup, RECEIVABLE };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.pos = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
