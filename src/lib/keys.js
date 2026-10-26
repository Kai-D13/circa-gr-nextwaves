/*
 * Khoá nối giữa POS và Nextwaves. Thuần.
 * - Mã giao POS:  thuocsi_delivery_code "SOBD1593849-F"      → gốc SO "SOBD1593849"
 * - refId Nextwaves: "SOBD1593858-1056745"                  → gốc SO "SOBD1593858"
 * - Lô POS:  lot_date "<lô>-<DDMMYY>" (ví dụ "A1-121229")
 */
(function (root) {
  "use strict";

  // Phần trước dấu "-" CUỐI CÙNG nếu phần sau là hậu tố giao (chữ hoặc số); không có "-" → cả chuỗi.
  function soBase(code) {
    const s = String(code || "").trim();
    if (!s) return "";
    const m = /^([A-Za-z]+\d+)(?:-[A-Za-z0-9]+)?$/.exec(s);
    return m ? m[1].toUpperCase() : "";
  }

  function soDigits(code) {
    const m = /\d+/.exec(String(code || ""));
    return m ? m[0] : "";
  }

  function sameSo(a, b) {
    const x = soBase(a);
    return !!x && x === soBase(b);
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  // "2028-12-12" → "121228"
  function ddmmyyFromIso(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    return m ? `${m[3]}${m[2]}${m[1].slice(2)}` : "";
  }

  // "12-12-2028" → "121228"
  function ddmmyyFromDmy(dmy) {
    const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(dmy || "").trim());
    return m ? `${pad2(m[1])}${pad2(m[2])}${m[3].slice(2)}` : "";
  }

  function lotKey(lot, ddmmyy) {
    const l = String(lot || "").trim();
    return l && ddmmyy ? `${l}-${ddmmyy}`.toUpperCase() : "";
  }

  const lotKeyFromBatch = (batchNumber, expiryIso) => lotKey(batchNumber, ddmmyyFromIso(expiryIso));
  const lotKeyFromQr = (lot, expiredDmy) => lotKey(lot, ddmmyyFromDmy(expiredDmy));

  // "CIRCA-1110" → "1110"
  function posProductIdFromSku(sku) {
    const m = /^CIRCA-(\d+)$/i.exec(String(sku || "").trim());
    return m ? m[1] : "";
  }

  const lib = { soBase, soDigits, sameSo, ddmmyyFromIso, ddmmyyFromDmy, lotKeyFromBatch, lotKeyFromQr, posProductIdFromSku };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.keys = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
