/*
 * Đọc response API thường của Nextwaves (đơn liên kết Buymed → PO Nextwaves) thành dạng gọn. Thuần.
 * KHÔNG dùng /integrations/circa/* (operator chốt 24/10/2026).
 */
(function (root) {
  "use strict";
  const keys = root.__CGN__ && root.__CGN__.keys ? root.__CGN__.keys : typeof require === "function" ? require("./keys.js") : null;

  const lower = (s) => String(s || "").toLowerCase();
  const upper = (s) => String(s || "").toUpperCase();
  const unitName = (s) => String(s || "").trim().toLowerCase();

  // GET /inter-tenant-orders/receiving?q=…
  function normalizeReceivingSearch(json) {
    const items = json && Array.isArray(json.items) ? json.items : [];
    return items.map((it) => ({
      orderId: lower(it.id),
      poId: lower(it.purchaseOrderId),
      poNumber: String(it.purchaseOrderNumber || ""),
      poStatus: String(it.purchaseOrderStatus || ""),
      status: String(it.status || ""),
      slug: String((it.counterparty && it.counterparty.tenantSlug) || ""),
      warehouseId: lower(it.warehouse && it.warehouse.id),
      openShipmentCount: Number(it.openShipmentCount) || 0,
    }));
  }

  // GET /inter-tenant-orders/purchase-orders/<poId>/receiving
  function normalizeReceiving(json) {
    if (!json || !json.order || !Array.isArray(json.shipments)) return null;
    const o = json.order;
    return {
      orderId: lower(o.id),
      poId: lower(o.purchaseOrderId),
      poNumber: String(o.purchaseOrderNumber || ""),
      orderStatus: String(o.status || ""),
      poStatus: String(json.purchaseOrderStatus || ""),
      slug: String((o.counterparty && o.counterparty.tenantSlug) || ""),
      warehouseId: lower(json.warehouse && json.warehouse.id),
      shipments: json.shipments.map((s) => ({
        id: lower(s.id),
        number: String(s.shipmentNumber || ""),
        status: String(s.status || ""),
        needsAccept: !!s.needsAccept,
        lines: (Array.isArray(s.lines) ? s.lines : []).map((l) => ({
          lineId: lower(l.lineId),
          sku: String((l.product && l.product.sku) || ""),
          posProductId: keys.posProductIdFromSku(l.product && l.product.sku),
          unit: unitName(l.unit),
          quantity: Number(l.quantity),
          tagged: !!l.tagged,
          units: (Array.isArray(l.units) ? l.units : []).map((u) => ({ epc: upper(u.epc), uid: String(u.unitUid || u.uid || "") })),
        })),
      })),
    };
  }

  // GET /inter-tenant-orders/purchase-orders/<poId>
  function normalizeOrderOfPo(json) {
    if (!json || !json.id || !json.purchaseOrderId) return null;
    return {
      orderId: lower(json.id),
      poId: lower(json.purchaseOrderId),
      poNumber: String(json.purchaseOrderNumber || ""),
      refId: String(json.refId || ""),
      soBase: keys.soBase(json.refId),
      direction: String(json.direction || ""),
      status: String(json.status || ""),
      poStatus: String(json.purchaseOrderStatus || ""),
      slug: String((json.counterparty && json.counterparty.tenantSlug) || ""),
      warehouseId: lower(json.warehouse && json.warehouse.id),
      shipments: (Array.isArray(json.shipments) ? json.shipments : []).map((s) => ({ id: lower(s.id), status: String(s.status || "") })),
    };
  }

  // GET /inter-tenant-shipments/<id>
  function normalizeShipment(json) {
    if (!json || !json.id || !Array.isArray(json.lines)) return null;
    return {
      id: lower(json.id),
      status: String(json.status || ""),
      poId: lower(json.purchaseOrder && json.purchaseOrder.id),
      lines: json.lines.map((l) => ({
        lineId: lower(l.lineId),
        posProductId: keys.posProductIdFromSku(l.product && l.product.sku),
        unit: unitName(l.unit),
        quantity: Number(l.quantity),
        batch: l.batch && l.batch.batchNumber ? { number: String(l.batch.batchNumber), expiry: String(l.batch.expiryDate || "") } : null,
        epcs: (Array.isArray(l.epcs) ? l.epcs : []).map(upper),
        receivedEpcs: Array.isArray(l.receivedEpcs) ? l.receivedEpcs.map(upper) : null,
      })),
    };
  }

  // GET /purchase-orders/<poId>
  function normalizePoDetail(json) {
    if (!json || !json.id || !Array.isArray(json.items)) return null;
    return {
      id: lower(json.id),
      number: String(json.poNumber || ""),
      status: String(json.status || ""),
      warehouseId: lower(json.warehouseId),
      items: json.items.map((it) => ({
        id: lower(it.id),
        posProductId: keys.posProductIdFromSku(it.productSku || (it.product && it.product.sku)),
        quantity: Number(it.quantity),
        receivedQuantity: Number(it.receivedQuantity) || 0,
        receivedUnits: (Array.isArray(it.receivedUnits) ? it.receivedUnits : []).map((u) => ({ epc: upper(u.epc), uid: String(u.unitUid || ""), receiptId: lower(u.receiptId) })),
      })),
    };
  }

  // Kiểm đơn Nextwaves tìm được có đúng là đơn của SO / cửa hàng này không.
  function verifyOrder(order, ctx) {
    const errors = [];
    if (!order) return { ok: false, errors: ["order_unreadable"] };
    if (!keys.sameSo(order.refId, ctx.soBase)) errors.push("so_mismatch");
    if (ctx.buymedSlug && order.slug !== ctx.buymedSlug) errors.push("counterparty_mismatch");
    if (ctx.warehouseId && order.warehouseId !== ctx.warehouseId) errors.push("warehouse_mismatch");
    if (/cancel|reject/i.test(order.status)) errors.push("order_cancelled");
    return { ok: errors.length === 0, errors };
  }

  // Sau khi nhận: UID đã nhận + đơn vị + lô (theo dòng giao) + đối chiếu với danh sách dự kiến.
  // expected: normalizeReceiving(...) chụp TRƯỚC khi nhận; shipments: normalizeShipment(...) đọc SAU khi nhận.
  function buildReceivedUnits(poDetail, shipments, expected) {
    const problems = [];
    if (!poDetail) return { units: [], problems: ["po_unreadable"], missing: [], unexpected: [] };
    const lineByEpc = new Map();
    for (const s of shipments || []) for (const l of s.lines) for (const e of l.epcs) lineByEpc.set(e, l);
    const expectedEpcs = new Set();
    const expectedUnitByEpc = new Map();
    for (const s of (expected && expected.shipments) || []) {
      for (const l of s.lines) for (const u of l.units) {
        expectedEpcs.add(u.epc);
        expectedUnitByEpc.set(u.epc, { unit: l.unit, posProductId: l.posProductId, uid: u.uid });
      }
    }
    const units = [];
    const seen = new Set();
    for (const it of poDetail.items) {
      for (const ru of it.receivedUnits) {
        if (seen.has(ru.epc)) {
          problems.push(`duplicate_epc:${ru.epc}`);
          continue;
        }
        seen.add(ru.epc);
        const line = lineByEpc.get(ru.epc) || null;
        const exp = expectedUnitByEpc.get(ru.epc) || null;
        const unit = (line && line.unit) || (exp && exp.unit) || "";
        const productFromLine = (line && line.posProductId) || (exp && exp.posProductId) || "";
        if (!unit) problems.push(`unit_unknown:${ru.epc}`);
        if (productFromLine && it.posProductId && productFromLine !== it.posProductId) problems.push(`product_conflict:${ru.epc}`);
        if (exp && exp.uid && ru.uid && exp.uid !== ru.uid) problems.push(`uid_conflict:${ru.epc}`);
        units.push({
          epc: ru.epc,
          uid: ru.uid || (exp && exp.uid) || "",
          posProductId: it.posProductId || productFromLine,
          unitName: unit,
          batchNumber: line && line.batch ? line.batch.number : null,
          batchExpiry: line && line.batch ? line.batch.expiry : null,
        });
      }
    }
    const missing = [...expectedEpcs].filter((e) => !seen.has(e));
    const unexpected = expectedEpcs.size ? [...seen].filter((e) => !expectedEpcs.has(e)) : [];
    for (const u of units) if (!u.uid) problems.push(`uid_missing:${u.epc}`);
    return { units, problems, missing, unexpected };
  }

  const lib = { normalizeReceivingSearch, normalizeReceiving, normalizeOrderOfPo, normalizeShipment, normalizePoDetail, verifyOrder, buildReceivedUnits };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.nw = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
