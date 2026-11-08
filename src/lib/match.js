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

  // v0.4.1 (audit v0.4.0 F2, bản rẻ): kiểm TRƯỚC khi dược sĩ bấm "Xác nhận nhận hàng" — từ UID dự kiến của đơn (trừ tem món đã bán gấp
  // của phiếu phần còn lại) và tóm tắt phiếu POS gửi lúc tạo phiên. Không tra QR (lô / tra lỗi chỉ biết sau khi nhận).
  //   grSummary: [{productId, unitRate, baseQuantity, received, codes, ratesByUnitName}] (một mục mỗi dòng phiếu)
  //   receiving: normalizeReceiving(...) chụp lúc khớp đơn; excludeUids: UID đã nằm trên phiếu đã xong (bán gấp)
  // → {ok, units, problems[{code, productId, …}]} — problems = những gì CHẮC CHẮN làm kế hoạch điền bị chặn.
  function precheck(grSummary, receiving, excludeUids) {
    const ex = new Set(excludeUids || []);
    const gr = new Map();
    for (const it of grSummary || []) {
      const g = gr.get(it.productId) || { base: 0, received: 0, codes: 0, rates: {}, unitRate: Number(it.unitRate) || 0 };
      g.base += Number(it.baseQuantity) || 0;
      g.received += Number(it.received) || 0;
      g.codes += Number(it.codes) || 0;
      Object.assign(g.rates, it.ratesByUnitName || {});
      gr.set(it.productId, g);
    }
    const problems = [];
    const nwBase = new Map();
    let units = 0;
    for (const s of (receiving && receiving.shipments) || []) {
      for (const l of s.lines) {
        if (!l.tagged) continue; // dòng không gắn tem: dược sĩ nhận tay phần này (cảnh báo "chưa nhận đủ" sau khi điền)
        const n = l.units.filter((u) => !ex.has(u.uid)).length;
        if (!n) continue;
        units += n;
        const g = gr.get(l.posProductId);
        if (!g) {
          problems.push({ code: "product_not_on_gr", productId: l.posProductId || "?", count: n });
          continue;
        }
        const rate = g.rates[l.unit];
        if (!rate) {
          problems.push({ code: "unit_unknown", productId: l.posProductId, unit: l.unit });
          continue;
        }
        nwBase.set(l.posProductId, (nwBase.get(l.posProductId) || 0) + n * rate);
      }
    }
    for (const [pid, base] of nwBase) {
      const g = gr.get(pid);
      if (g.unitRate > 0 && base % g.unitRate !== 0) problems.push({ code: "fraction", productId: pid, nwBase: base, unitRate: g.unitRate });
      if (base > g.base) problems.push({ code: "over", productId: pid, nwBase: base, grBase: g.base });
    }
    for (const [pid, g] of gr) if (g.received > 0 && g.codes === 0) problems.push({ code: "gr_received_by_hand", productId: pid });
    return { ok: problems.length === 0, units, problems };
  }

  const lib = { fingerprint, precheck };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.match = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
