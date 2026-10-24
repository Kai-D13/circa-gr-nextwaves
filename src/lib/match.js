/*
 * Dấu vân tay: lượng theo đơn vị gốc POS của từng sản phẩm phải khớp giữa GR và đơn Nextwaves. Thuần.
 * Nextwaves: mỗi UID = 1 `unit` của dòng giao → đổi sang đơn vị gốc POS bằng convert_rate cùng tên đơn vị trong GR.
 * Dùng để KIỂM (sau khi đã tìm theo SO), không dùng để tìm.
 */
(function (root) {
  "use strict";

  // grSource: [{productId, baseQuantity, ratesByUnitName}]; receiving: normalizeReceiving(...)
  function fingerprint(grSource, receiving) {
    const rows = new Map();
    const row = (pid) => {
      if (!rows.has(pid)) rows.set(pid, { productId: pid, grBase: 0, nwBase: 0, nwUnits: [], problems: [] });
      return rows.get(pid);
    };
    const rates = new Map();
    for (const it of grSource || []) {
      row(it.productId).grBase += Number(it.baseQuantity) || 0;
      rates.set(it.productId, Object.assign({}, rates.get(it.productId) || {}, it.ratesByUnitName || {}));
    }
    for (const s of (receiving && receiving.shipments) || []) {
      for (const l of s.lines) {
        const r = row(l.posProductId || "?");
        const count = l.tagged ? l.units.length : Number(l.quantity) || 0;
        const rate = (rates.get(l.posProductId) || {})[l.unit];
        r.nwUnits.push({ unit: l.unit, count, rate: rate || null });
        if (!rate) r.problems.push(`unit_not_on_gr:${l.unit}`);
        else r.nwBase += count * rate;
        if (l.tagged && l.units.length !== Number(l.quantity)) r.problems.push("tagged_count_mismatch");
      }
    }
    const list = [...rows.values()].map((r) => {
      const ok = r.problems.length === 0 && r.grBase > 0 && r.grBase === r.nwBase;
      return Object.assign(r, { ok });
    });
    return { ok: list.length > 0 && list.every((r) => r.ok), rows: list };
  }

  const lib = { fingerprint };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.match = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
