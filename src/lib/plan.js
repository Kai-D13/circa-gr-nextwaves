/*
 * Kế hoạch ghi GR (W1) từ UID đã nhận ở Nextwaves. Thuần, tất định.
 *
 * Luật (docs/dev/LOGIC-v0.3.md §3 + PM audit 24/10 P1.2 / P2.2 / P2.3):
 *  - Mọi UID (kể cả UID đã nằm trên GR) đều qua cùng một phép đối chiếu:
 *    sản phẩm (sku Nextwaves "CIRCA-<product_id>" = dòng GR = productId tra QR POS), lô, quy đổi lượng.
 *  - Tra QR POS là BẮT BUỘC cho từng UID: phải có productId, lô, hạn. Lô dòng giao Nextwaves (nếu có) phải trùng lô tra QR.
 *    Lô "<lô>-<DDMMYY>" = lot_date chi tiết GR. Không tạo lô / chi tiết mới.
 *  - Lượng: mỗi UID = 1 đơn vị `unitName` của dòng giao → đơn vị gốc POS (convert_rate cùng tên) → chia convert_rate đơn vị dòng GR.
 *    Phải nguyên, không vượt `quantity` của chi tiết.
 *  - UID đã có trên GR chỉ được bỏ qua khi nằm ĐÚNG chi tiết tính được. Sai chi tiết / nằm ở nhiều chi tiết → chặn.
 *  - Mọi chi tiết: received_quantity phải bằng lượng quy đổi từ các UID đang nằm trên nó (không có lượng "tay" lẫn vào).
 *  - Mã trên GR không có trong kết quả Nextwaves, hoặc mã bị nối trùng → chặn.
 *  - Có bất kỳ chặn nào → KHÔNG ghi gì (cả gói).
 *  - Kế hoạch mang ảnh chụp toàn phiếu (`snapshot`) để apply.js dừng khi phiếu đổi ở bất kỳ chi tiết nào,
 *    và mã kế hoạch (`hash`) để gắn lượt cho phép ghi với đúng kế hoạch.
 */
(function (root) {
  "use strict";
  const keys = root.__CGN__ && root.__CGN__.keys ? root.__CGN__.keys : typeof require === "function" ? require("./keys.js") : null;

  const MESSAGES = {
    product_not_on_gr: "Sản phẩm của UID không có trên phiếu nhận",
    qr_lookup_missing: "Chưa tra QR trên POS cho UID này",
    qr_lookup_failed: "POS không tra được mã QR (UID) này",
    qr_incomplete: "Kết quả tra QR thiếu sản phẩm / lô / hạn",
    qr_product_mismatch: "Tra QR trên POS ra sản phẩm khác với Nextwaves",
    lot_conflict: "Lô theo Nextwaves khác lô theo tra QR POS",
    lot_not_on_gr: "Lô của UID không có trên phiếu nhận",
    unit_unknown: "Đơn vị của UID không có trên sản phẩm POS",
    line_unit_unknown: "Không đọc được hệ số đơn vị của dòng phiếu nhận",
    fraction: "Số lượng quy đổi ra số lẻ theo đơn vị dòng",
    fraction_on_gr: "Các mã đang có trên lô quy đổi ra số lẻ",
    over: "Vượt số lượng cần nhận của lô",
    gr_has_foreign_codes: "Phiếu nhận đã có mã QR không thuộc kết quả Nextwaves",
    gr_duplicate_codes: "Phiếu nhận có mã QR bị nối trùng",
    uid_on_wrong_detail: "UID đã nằm trên phiếu nhưng ở lô / dòng khác với kết quả đối chiếu",
    uid_on_many_details: "UID nằm ở nhiều lô trên phiếu",
    received_mismatch: "Số lượng đã nhận của lô không khớp số UID đang có trên lô",
    uid_missing: "Thiếu UID của EPC đã nhận",
    duplicate_uid: "UID xuất hiện nhiều lần",
    nothing_to_write: "Không có UID nào để điền",
  };
  const explain = (code) => MESSAGES[code] || code;

  // FNV-1a 32 bit → 8 ký tự hex in hoa. Chỉ để gọi tên kế hoạch, không phải bảo mật.
  function hash32(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).toUpperCase().padStart(8, "0");
  }

  function snapshotOf(gr) {
    const details = {};
    for (const it of gr.items) {
      for (const d of it.details) details[d.id] = { received: d.received, codes: d.qrCodes.slice().sort(), n: d.qrCodeCount === undefined ? d.qrCodes.length : d.qrCodeCount };
    }
    return { status: gr.status, details };
  }

  function buildPlan(gr, units, qrByUid) {
    const blocked = [];
    const warnings = [];
    const block = (code, extra) => blocked.push(Object.assign({ code, message: explain(code) }, extra || {}));
    if (!gr) return { ok: false, steps: [], blocked: [{ code: "gr_unreadable", message: "Không đọc được phiếu nhận" }], warnings, summary: null, complete: false };
    const list = units || [];

    // Vị trí từng mã đang có trên GR.
    const locByCode = new Map();
    for (const it of gr.items) {
      for (const d of it.details) {
        if ((d.qrCodeCount || 0) > d.qrCodes.length) block("gr_duplicate_codes", { detailId: d.id, raw: d.qrCodeCount, unique: d.qrCodes.length });
        for (const c of d.qrCodes) locByCode.set(c, (locByCode.get(c) || []).concat([d.id]));
      }
    }
    const receivedUids = new Set(list.map((u) => u.uid).filter(Boolean));
    for (const [code, locs] of locByCode) {
      if (!receivedUids.has(code)) block("gr_has_foreign_codes", { uid: code });
      if (locs.length > 1) block("uid_on_many_details", { uid: code, details: locs });
    }

    const byDetail = new Map(); // detailId → {item, detail, newUids, newBase, presentBase}
    const seen = new Set();
    let already = 0;
    for (const u of list) {
      if (!u.uid) {
        block("uid_missing", { epc: u.epc });
        continue;
      }
      if (seen.has(u.uid)) {
        block("duplicate_uid", { uid: u.uid });
        continue;
      }
      seen.add(u.uid);
      const item = gr.items.find((it) => it.productId === String(u.posProductId));
      if (!item) {
        block("product_not_on_gr", { uid: u.uid, productId: u.posProductId });
        continue;
      }
      const qr = qrByUid ? qrByUid[u.uid] : undefined;
      if (!qr) {
        block("qr_lookup_missing", { uid: u.uid });
        continue;
      }
      if (qr.ok === false) {
        block(qr.reason === "incomplete" ? "qr_incomplete" : "qr_lookup_failed", { uid: u.uid, detail: qr.reason || null });
        continue;
      }
      const qrProduct = qr.productId === undefined || qr.productId === null ? "" : String(qr.productId);
      const fromQr = qr.lot ? keys.lotKeyFromQr(qr.lot, qr.expiredDate) : "";
      if (!qrProduct || !fromQr) {
        block("qr_incomplete", { uid: u.uid });
        continue;
      }
      if (qrProduct !== item.productId) {
        block("qr_product_mismatch", { uid: u.uid, qrProductId: qrProduct, productId: item.productId });
        continue;
      }
      const fromBatch = u.batchNumber ? keys.lotKeyFromBatch(u.batchNumber, u.batchExpiry) : "";
      if (fromBatch && fromBatch !== fromQr) {
        block("lot_conflict", { uid: u.uid, fromBatch, fromQr });
        continue;
      }
      const detail = item.details.find((d) => d.lotDate === fromQr);
      if (!detail) {
        block("lot_not_on_gr", { uid: u.uid, lot: fromQr, itemId: item.id });
        continue;
      }
      const rate = item.ratesByUnitName[String(u.unitName || "").toLowerCase()];
      if (!rate) {
        block("unit_unknown", { uid: u.uid, unit: u.unitName, itemId: item.id });
        continue;
      }
      const locs = locByCode.get(u.uid) || [];
      if (locs.length > 1) continue; // đã chặn uid_on_many_details
      if (locs.length === 1 && locs[0] !== detail.id) {
        block("uid_on_wrong_detail", { uid: u.uid, at: locs[0], expected: detail.id, lot: fromQr });
        continue;
      }
      const slot = byDetail.get(detail.id) || { item, detail, newUids: [], newBase: 0, presentBase: 0 };
      if (locs.length === 1) {
        slot.presentBase += rate;
        already += 1;
      } else {
        slot.newUids.push(u.uid);
        slot.newBase += rate;
      }
      byDetail.set(detail.id, slot);
    }

    // Nhất quán: received_quantity của MỌI chi tiết = lượng quy đổi từ UID đang nằm trên nó.
    for (const it of gr.items) {
      for (const d of it.details) {
        const slot = byDetail.get(d.id);
        const presentBase = slot ? slot.presentBase : 0;
        if (presentBase === 0) {
          if (d.received !== 0) block("received_mismatch", { detailId: d.id, received: d.received, expected: 0 });
          continue;
        }
        if (!it.unitRate) {
          block("line_unit_unknown", { itemId: it.id });
          continue;
        }
        const presentQty = presentBase / it.unitRate;
        if (!Number.isInteger(presentQty)) block("fraction_on_gr", { detailId: d.id, base: presentBase, unitRate: it.unitRate });
        else if (d.received !== presentQty) block("received_mismatch", { detailId: d.id, received: d.received, expected: presentQty });
      }
    }

    const steps = [];
    for (const { item, detail, newUids, newBase } of byDetail.values()) {
      if (!newUids.length) continue;
      if (!item.unitRate) {
        block("line_unit_unknown", { itemId: item.id });
        continue;
      }
      const delta = newBase / item.unitRate;
      if (!Number.isInteger(delta)) {
        block("fraction", { itemId: item.id, detailId: detail.id, base: newBase, unitRate: item.unitRate });
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
        uids: newUids.slice(),
      });
    }

    for (const it of gr.items) {
      const planned = steps.filter((s) => s.itemId === it.id).reduce((n, s) => n + s.delta, 0);
      const done = it.details.reduce((n, d) => n + d.received, 0);
      if (planned + done < it.quantity) warnings.push({ code: "item_not_full", itemId: it.id, productId: it.productId, received: done + planned, quantity: it.quantity });
    }
    if (!list.length) blocked.push({ code: "nothing_to_write", message: explain("nothing_to_write") });
    steps.sort((a, b) => (a.itemId + a.detailId).localeCompare(b.itemId + b.detailId));
    const ok = blocked.length === 0;
    const snapshot = snapshotOf(gr);
    const hash = hash32(JSON.stringify({ gr: gr.id, po: gr.poId, snapshot, steps: steps.map((s) => [s.detailId, s.lotId, s.before, s.target, s.quantity, s.uids.slice().sort()]) }));
    return {
      ok,
      // Mọi UID đã nằm đúng chỗ, lượng nhất quán, không còn gì để ghi.
      complete: ok && steps.length === 0 && list.length > 0 && already === list.length,
      grId: gr.id,
      poId: gr.poId,
      hash,
      snapshot,
      steps,
      blocked,
      warnings,
      summary: { uids: list.length, alreadyOnGr: already, toWrite: steps.reduce((n, s) => n + s.uids.length, 0), details: steps.length },
    };
  }

  // v0.3.0 (PM DECISION-ONE-STG-AUTO-FLOW §2.2): kế hoạch chỉ được TỰ chạy khi phiếu sạch và nhận đủ: kế hoạch đạt, 0 chặn,
  // 0 cảnh báo, không UID nào nằm sẵn trên phiếu, mọi chi tiết của phiếu có đúng một bước 0 → quantity (chưa nhận gì, không mã),
  // tập UID kế hoạch = tập UID Nextwaves. Trả {ok} hoặc {ok:false, reason}.
  function autoPlanCheck(gr, plan, units) {
    const no = (reason) => ({ ok: false, reason });
    if (!gr || !plan) return no("no_plan");
    if (!plan.ok || plan.blocked.length) return no("plan_blocked");
    if (plan.warnings.length) return no("plan_warning");
    if (!plan.summary || plan.summary.alreadyOnGr !== 0) return no("uid_already_on_gr");
    const uids = (units || []).map((u) => u.uid);
    if (!uids.length || uids.some((u) => !u) || new Set(uids).size !== uids.length) return no("units_invalid");
    const planned = new Set(plan.steps.flatMap((s) => s.uids));
    if (planned.size !== uids.length || uids.some((u) => !planned.has(u))) return no("uid_set");
    const stepByDetail = new Map(plan.steps.map((s) => [s.detailId, s]));
    let details = 0;
    for (const it of gr.items) {
      for (const d of it.details) {
        details += 1;
        const st = stepByDetail.get(d.id);
        if (!st) return no("detail_not_planned");
        if (d.received !== 0 || d.qrCodes.length || st.before !== 0 || st.target !== d.quantity) return no("detail_not_full");
      }
    }
    if (stepByDetail.size !== details) return no("detail_set");
    return { ok: true };
  }

  // v0.3.0 (§2.3): phiếu đọc lại sau khi TỰ điền phải khớp HOÀN TOÀN kế hoạch mới được gửi HOÀN THÀNH (dùng cho phiếu sạch của chế
  // độ tự động): đúng phiếu / PO, RECEIVING, cùng tập chi tiết; mỗi bước đúng dòng / sản phẩm / đơn vị dòng, đúng lô (id + lô-hạn),
  // lượng = target, tập mã = đúng UID của bước, không mã trùng; chi tiết ngoài kế hoạch giữ nguyên; mọi mã trên phiếu là UID
  // Nextwaves và đủ số. `plan.complete` một mình không đủ. Trả {ok, diffs:[{why, detailId}]}.
  function verifyFinal(plan, gr, units) {
    const diffs = [];
    const bad = (why, detailId) => diffs.push({ why, detailId: detailId || null });
    if (!plan || !plan.snapshot || !gr) return { ok: false, diffs: [{ why: "missing", detailId: null }] };
    if (gr.id !== plan.grId) bad("gr_id");
    if (gr.poId !== plan.poId) bad("po_id");
    if (gr.status !== "RECEIVING") bad("status");
    const steps = new Map(plan.steps.map((s) => [s.detailId, s]));
    const seen = new Set();
    const codesOnGr = [];
    for (const it of gr.items) {
      for (const d of it.details) {
        seen.add(d.id);
        codesOnGr.push(...d.qrCodes);
        if ((d.qrCodeCount === undefined ? d.qrCodes.length : d.qrCodeCount) !== d.qrCodes.length) bad("duplicate_codes", d.id);
        const snap = plan.snapshot.details[d.id];
        if (!snap) {
          bad("detail_new", d.id);
          continue;
        }
        const got = d.qrCodes.slice().sort();
        const st = steps.get(d.id);
        if (!st) {
          if (d.received !== snap.received || got.join() !== snap.codes.join()) bad("detail_changed", d.id);
          continue;
        }
        if (st.itemId !== it.id || st.productId !== it.productId || st.unit !== it.unit) bad("item", d.id);
        if (st.lotId !== d.lotId || st.lotDate !== d.lotDate) bad("lot", d.id);
        if (d.received !== st.target) bad("received", d.id);
        const want = snap.codes.concat(st.uids).sort();
        if (want.length !== got.length || want.some((c, i) => c !== got[i])) bad("codes", d.id);
      }
    }
    for (const id of Object.keys(plan.snapshot.details)) if (!seen.has(id)) bad("detail_missing", id);
    const uidSet = new Set((units || []).map((u) => u.uid));
    if (codesOnGr.length !== uidSet.size || codesOnGr.some((c) => !uidSet.has(c))) bad("gr_codes");
    return { ok: diffs.length === 0, diffs };
  }

  const lib = { buildPlan, explain, snapshotOf, autoPlanCheck, verifyFinal, MESSAGES };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.plan = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
