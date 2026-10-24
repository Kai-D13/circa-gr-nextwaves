/*
 * Kế hoạch ghi GR (W1) từ UID đã nhận ở Nextwaves. Thuần, tất định.
 *
 * Luật (docs/dev/LOGIC-v0.3.md §3):
 *  - UID → dòng GR theo product_id (sku Nextwaves "CIRCA-<product_id>").
 *  - Lô: batch của dòng giao (số lô + hạn) và / hoặc tra QR trên POS (lot + expiredDate) → "<lô>-<DDMMYY>" = lot_date chi tiết GR.
 *    Cả hai cùng có mà khác nhau → chặn. Không có cách nào → chặn. Không tạo lô / chi tiết mới.
 *  - Lượng: mỗi UID = 1 đơn vị `unitName` của dòng giao → đơn vị gốc POS (convert_rate cùng tên) → chia convert_rate đơn vị dòng GR.
 *    Phải nguyên, không vượt `quantity` của chi tiết.
 *  - UID đã có trên GR → bỏ qua (đã ghi). Mã trên GR không có trong kết quả Nextwaves → chặn (hai bên không nhất quán).
 *  - Có bất kỳ chặn nào → KHÔNG ghi gì (cả gói).
 */
(function (root) {
  "use strict";
  const keys = root.__CGN__ && root.__CGN__.keys ? root.__CGN__.keys : typeof require === "function" ? require("./keys.js") : null;

  const MESSAGES = {
    product_not_on_gr: "Sản phẩm của UID không có trên phiếu nhận",
    qr_lookup_failed: "POS không tra được mã QR (UID) này",
    qr_product_mismatch: "Tra QR trên POS ra sản phẩm khác với Nextwaves",
    lot_conflict: "Lô theo Nextwaves khác lô theo tra QR POS",
    lot_unknown: "Không xác định được lô của UID",
    lot_not_on_gr: "Lô của UID không có trên phiếu nhận",
    unit_unknown: "Đơn vị của UID không có trên sản phẩm POS",
    line_unit_unknown: "Không đọc được hệ số đơn vị của dòng phiếu nhận",
    fraction: "Số lượng quy đổi ra số lẻ theo đơn vị dòng",
    over: "Vượt số lượng cần nhận của lô",
    gr_has_foreign_codes: "Phiếu nhận đã có mã QR không thuộc kết quả Nextwaves",
    uid_missing: "Thiếu UID của EPC đã nhận",
    duplicate_uid: "UID xuất hiện nhiều lần",
    nothing_to_write: "Không có gì cần ghi",
  };
  const explain = (code) => MESSAGES[code] || code;

  function buildPlan(gr, units, qrByUid) {
    const blocked = [];
    const warnings = [];
    const block = (code, extra) => blocked.push(Object.assign({ code, message: explain(code) }, extra || {}));
    if (!gr) return { ok: false, steps: [], blocked: [{ code: "gr_unreadable", message: "Không đọc được phiếu nhận" }], warnings, summary: null };

    const codesOnGr = new Map(); // uid → detailId
    for (const it of gr.items) for (const d of it.details) for (const c of d.qrCodes) codesOnGr.set(c, d.id);
    const receivedUids = new Set((units || []).map((u) => u.uid).filter(Boolean));
    for (const [code] of codesOnGr) if (!receivedUids.has(code)) block("gr_has_foreign_codes", { uid: code });

    const byDetail = new Map(); // detailId → {item, detail, uids[], base}
    const seen = new Set();
    let already = 0;
    for (const u of units || []) {
      if (!u.uid) {
        block("uid_missing", { epc: u.epc });
        continue;
      }
      if (seen.has(u.uid)) {
        block("duplicate_uid", { uid: u.uid });
        continue;
      }
      seen.add(u.uid);
      if (codesOnGr.has(u.uid)) {
        already += 1;
        continue;
      }
      const item = gr.items.find((it) => it.productId === String(u.posProductId));
      if (!item) {
        block("product_not_on_gr", { uid: u.uid, productId: u.posProductId });
        continue;
      }
      const qr = qrByUid ? qrByUid[u.uid] : undefined;
      if (qr && qr.ok === false) {
        block("qr_lookup_failed", { uid: u.uid, detail: qr.reason || null });
        continue;
      }
      if (qr && qr.productId && String(qr.productId) !== item.productId) {
        block("qr_product_mismatch", { uid: u.uid, qrProductId: String(qr.productId), productId: item.productId });
        continue;
      }
      const fromBatch = u.batchNumber ? keys.lotKeyFromBatch(u.batchNumber, u.batchExpiry) : "";
      const fromQr = qr && qr.lot ? keys.lotKeyFromQr(qr.lot, qr.expiredDate) : "";
      if (fromBatch && fromQr && fromBatch !== fromQr) {
        block("lot_conflict", { uid: u.uid, fromBatch, fromQr });
        continue;
      }
      const lot = fromBatch || fromQr;
      if (!lot) {
        block("lot_unknown", { uid: u.uid });
        continue;
      }
      const detail = item.details.find((d) => d.lotDate === lot);
      if (!detail) {
        block("lot_not_on_gr", { uid: u.uid, lot, itemId: item.id });
        continue;
      }
      const rate = item.ratesByUnitName[String(u.unitName || "").toLowerCase()];
      if (!rate) {
        block("unit_unknown", { uid: u.uid, unit: u.unitName, itemId: item.id });
        continue;
      }
      const slot = byDetail.get(detail.id) || { item, detail, uids: [], base: 0 };
      slot.uids.push(u.uid);
      slot.base += rate;
      byDetail.set(detail.id, slot);
    }

    const steps = [];
    for (const { item, detail, uids, base } of byDetail.values()) {
      if (!item.unitRate) {
        block("line_unit_unknown", { itemId: item.id });
        continue;
      }
      const delta = base / item.unitRate;
      if (!Number.isInteger(delta)) {
        block("fraction", { itemId: item.id, detailId: detail.id, base, unitRate: item.unitRate });
        continue;
      }
      const target = detail.received + delta;
      if (target > detail.quantity) {
        block("over", { itemId: item.id, detailId: detail.id, received: detail.received, delta, quantity: detail.quantity });
        continue;
      }
      steps.push({
        itemId: item.id,
        detailId: detail.id,
        lotId: detail.lotId,
        lotDate: detail.lotDate,
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        before: detail.received,
        delta,
        target,
        quantity: detail.quantity,
        uids: uids.slice(),
      });
    }

    for (const it of gr.items) {
      const planned = steps.filter((s) => s.itemId === it.id).reduce((n, s) => n + s.delta, 0);
      const done = it.details.reduce((n, d) => n + d.received, 0);
      if (planned + done < it.quantity) warnings.push({ code: "item_not_full", itemId: it.id, productId: it.productId, received: done + planned, quantity: it.quantity });
    }
    if (!blocked.length && !steps.length) blocked.push({ code: "nothing_to_write", message: explain("nothing_to_write") });
    steps.sort((a, b) => (a.itemId + a.detailId).localeCompare(b.itemId + b.detailId));
    return {
      ok: blocked.length === 0,
      steps,
      blocked,
      warnings,
      summary: { uids: (units || []).length, alreadyOnGr: already, toWrite: steps.reduce((n, s) => n + s.uids.length, 0), details: steps.length },
    };
  }

  const lib = { buildPlan, explain, MESSAGES };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.plan = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
