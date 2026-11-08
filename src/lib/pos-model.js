/*
 * Đọc response POS (GR, PO, tìm GR theo SO) thành dạng gọn và kiểm liên kết GR ↔ PO ↔ mã giao. Thuần (grPageAnchor đọc DOM được
 * truyền vào, không giữ gì).
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
      posName: String((d.pos_info && d.pos_info.name) || ""), // v0.3.0: hiện trong popup khi cấp quyền tự động
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
          // v0.4.1: id dòng PO (giữ nguyên qua phiếu phần còn lại) + lượng đã nhận của dòng (đơn vị dòng) — cộng sổ theo dòng PO.
          refId: lower(it.ref_id),
          received: Number(it.received_quantity) || 0,
          ratesByUnitName,
          details: (Array.isArray(it.details) ? it.details : []).map((dt) => ({
            id: lower(dt.id),
            lotId: lower(dt.lot_id),
            lotDate: String(dt.lot_date || "").toUpperCase(),
            quantity: Number(dt.quantity),
            received: Number(dt.received_quantity) || 0,
            qrCodes: [...new Set(Array.isArray(dt.thuocsi_qr_codes) ? dt.thuocsi_qr_codes.map(String) : [])],
            // Số mã thô (trước khi bỏ trùng): lớn hơn qrCodes.length nghĩa là mã đã bị nối hai lần.
            qrCodeCount: Array.isArray(dt.thuocsi_qr_codes) ? dt.thuocsi_qr_codes.length : 0,
            // v0.4.1: id dòng lô PO + mã nội bộ (chỉ dùng để biết UID đã nằm trên phiếu đã xong; không vào kế hoạch / ảnh chụp).
            refId: lower(dt.ref_id),
            internalCodes: [...new Set(Array.isArray(dt.internal_qr_codes) ? dt.internal_qr_codes.map(String) : [])],
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
      // v0.4.1 (phiếu phần còn lại): dòng PO (lượng đặt / gốc / đã nhận theo đơn vị dòng, cộng qua mọi phiếu) + phiếu của PO kèm trạng thái.
      status: String(d.status || ""),
      items: (Array.isArray(d.items) ? d.items : []).map((it) => ({
        id: lower(it && it.id),
        productId: String(it && it.product_id),
        quantity: Number(it && it.quantity),
        baseQuantity: Number(it && it.base_quantity),
        unit: String((it && it.unit) || ""),
        received: Number(it && it.received_quantity) || 0,
      })),
      grs: (Array.isArray(d.goods_receipts) ? d.goods_receipts : []).map((g) => ({ id: lower(g && g.id), code: String((g && g.code) || ""), status: String((g && g.status) || "") })).filter((g) => g.id),
    };
  }

  function normalizeGrSearch(json) {
    const d = dataOf(json);
    const list = d && Array.isArray(d.goods_receipts) ? d.goods_receipts : [];
    return list.map((g) => ({ id: lower(g.id), code: String(g.code || ""), status: String(g.status || ""), poId: lower(g.purchase_order_id), poCode: String(g.purchase_order_code || ""), posId: lower(g.pos_info && g.pos_info.id) }));
  }

  // Một trang kết quả tìm GR theo SO: {items, total, page, limit}. Thiếu goods_receipts mảng hoặc total / page / limit số → null.
  function normalizeGrSearchPage(json) {
    const d = dataOf(json);
    const num = (x) => typeof x === "number" && Number.isFinite(x);
    if (!d || typeof d !== "object" || !Array.isArray(d.goods_receipts) || !num(d.total) || !num(d.page) || !num(d.limit)) return null;
    return { items: normalizeGrSearch(json), total: d.total, page: d.page, limit: d.limit };
  }

  // Danh sách GR của SO ở cửa hàng phải đọc ĐỦ và RÕ (PM audit v0.1.1 P1.6) — dùng chung cho đường GR và đường /chi-tiet-so.
  //  - trang 1, limit ≥ 1, số dòng ≤ limit, total = số dòng đã đọc (chưa phân trang: nhiều trang → không kết luận);
  //  - mỗi dòng phải có id, trạng thái, pos_info.id và đúng cửa hàng đang đăng nhập (không lọc bỏ rồi đếm).
  // → {ok:true, list, total} | {ok:false, reason, total?, read?, code?}
  function checkSoGrs(json, storeId) {
    const page = normalizeGrSearchPage(json);
    if (!page) return { ok: false, reason: "search_unreadable" };
    const facts = { total: page.total, read: page.items.length };
    if (page.page !== 1 || !(page.limit >= 1) || page.items.length > page.limit) return Object.assign({ ok: false, reason: "search_paging", page: page.page, limit: page.limit }, facts);
    if (page.total !== page.items.length) return Object.assign({ ok: false, reason: "search_incomplete" }, facts);
    const store = lower(storeId);
    for (const g of page.items) {
      if (!g.id || !g.status || !g.posId) return Object.assign({ ok: false, reason: "row_incomplete", code: g.code || g.id || "?" }, facts);
      if (!store || g.posId !== store) return Object.assign({ ok: false, reason: "row_other_store", code: g.code }, facts);
    }
    return Object.assign({ ok: true, list: page.items }, facts);
  }

  // Khoá ghi phía POS (P3): danh sách GR của SO đọc đủ, GR đang mở có trong đó, và là GR chưa huỷ DUY NHẤT của PO của nó.
  // v0.3.1 (06/11, SO tách giao): mỗi lần giao (-P1 / -P2 / -F) có PO riêng → GR của PO khác cùng SO không khoá; đơn Nextwaves vẫn
  // phải khớp số lượng đúng phiếu này (resolve: đúng một đơn khớp, đơn khác lệch rõ). Dòng thiếu PO → không kết luận. null = không khoá.
  // v0.4.1 (phiếu phần còn lại): `rem` = remainderOf(...) đạt → không khoá, với điều kiện các phiếu khác cùng PO trong kết quả tìm theo SO
  // đúng là các phiếu đã xong đã được cộng sổ (hai nguồn PO / tìm theo SO phải nói cùng một điều). Lệch → khoá như cũ.
  function soWriteLock(check, grId, rem) {
    if (!check || !check.ok) return "so_gr_unknown";
    const live = check.list.filter((g) => !/^CANCEL/i.test(g.status));
    const me = live.find((g) => g.id === lower(grId));
    if (!me || live.some((g) => !g.poId)) return "so_gr_unknown";
    const same = live.filter((g) => g.poId === me.poId);
    if (same.length === 1) return null;
    if (rem && rem.ok && Array.isArray(rem.completed)) {
      const others = same.filter((g) => g.id !== me.id);
      const counted = new Set(rem.completed.map((g) => g.id));
      if (others.length === counted.size && others.every((g) => counted.has(g.id) && g.status === "COMPLETED")) return null;
    }
    return "so_many_gr";
  }

  // v0.4.1 (case phiếu phần còn lại, operator 07–08/11; staging GR03877 → GR03954): HOÀN THÀNH khi chưa nhận đủ → POS sinh phiếu mới
  // cùng PO, chỉ dòng chưa đủ, SL = SL dòng PO − đã nhận, cùng lô, `ref_id` dòng / lô PO giữ nguyên, không mang mã. Nhận ra phiếu phần
  // còn lại bằng cộng sổ theo DÒNG PO (đơn vị gốc). Thiếu / lệch bất kỳ điều kiện nào → không ok → khoá như v0.4.0 (dừng an toàn).
  //   gr: phiếu đang mở (normalizeGr); po: normalizePo; completed: normalizeGr của MỌI phiếu khác chưa huỷ của PO (GET theo id).
  // → {ok:true, completed[{id, code}], excludeUids[], source[{productId, baseQuantity, ratesByUnitName}]} | {ok:false, reason, …}
  //   excludeUids: mọi mã trên các phiếu đã xong. POS gắn UID Nextwaves (tem con) lúc HOÀN THÀNH cho đơn vị đã quét QR → phần giao với
  //   UID của đơn Nextwaves là các đơn vị đã nhận trước (bán gấp). Mã khác (QR thuocsi dược sĩ quét) không trùng UID nào → vô hại.
  //   source: vân tay CẤP PO (cả đơn Nextwaves ứng với cả PO, không chỉ phiếu đang mở).
  function remainderOf(gr, po, completed) {
    const no = (reason, extra) => Object.assign({ ok: false, reason }, extra || {});
    if (!gr || !po || !Array.isArray(po.items) || !Array.isArray(po.grs)) return no("data");
    const live = po.grs.filter((g) => !/^CANCEL/i.test(g.status));
    if (live.length < 2) return no("single_gr");
    if (!live.some((g) => g.id === gr.id)) return no("gr_not_in_po");
    const others = live.filter((g) => g.id !== gr.id);
    if (others.some((g) => g.status !== "COMPLETED")) return no("other_gr_open", { code: (others.find((g) => g.status !== "COMPLETED") || {}).code });
    const done = (Array.isArray(completed) ? completed : []).filter(Boolean);
    if (done.length !== others.length) return no("completed_unread");
    for (const o of others) {
      const g = done.find((x) => x.id === o.id);
      if (!g || g.status !== "COMPLETED" || g.poId !== gr.poId) return no("completed_unread", { code: o.code });
    }
    // Phiếu đang mở phải còn nguyên như lúc POS sinh: chưa nhận gì, không mã. Đã nhận tay một phần → nhận tay tiếp.
    for (const it of gr.items) {
      if (it.received) return no("open_gr_touched");
      for (const d of it.details) if (d.received || d.qrCodes.length || (d.internalCodes || []).length) return no("open_gr_touched");
    }
    const poById = new Map(po.items.map((p) => [p.id, p]));
    for (const it of gr.items) if (!it.refId || !poById.has(it.refId)) return no("line_not_in_po", { productId: it.productId });
    // Tỉ lệ đơn vị theo sản phẩm, gộp mọi phiếu của PO (sản phẩm chỉ có ở phiếu đã xong vẫn quy đổi được); cùng tên đơn vị phải cùng tỉ lệ.
    const rates = new Map();
    for (const g of [gr].concat(done)) {
      for (const it of g.items) {
        const cur = rates.get(it.productId) || {};
        for (const [u, r] of Object.entries(it.ratesByUnitName || {})) {
          if (cur[u] !== undefined && cur[u] !== r) return no("rate_conflict", { productId: it.productId, unit: u });
          cur[u] = r;
        }
        rates.set(it.productId, cur);
      }
    }
    for (const p of po.items) {
      if (!p.id || !(p.baseQuantity > 0) || !(p.quantity > 0)) return no("po_line_unreadable", { productId: p.productId });
      let doneBase = 0;
      for (const g of done) {
        for (const it of g.items) {
          if (it.refId !== p.id) continue;
          const got = it.details.reduce((n, d) => n + (Number(d.received) || 0), 0);
          if (it.received !== got) return no("received_inconsistent", { code: g.code, productId: p.productId });
          if (got && !(it.unitRate > 0)) return no("rate_missing", { code: g.code, productId: p.productId });
          doneBase += got * (it.unitRate || 0);
        }
      }
      const open = gr.items.filter((it) => it.refId === p.id);
      if (open.length > 1) return no("line_split", { productId: p.productId });
      const openBase = open.length ? open[0].baseQuantity : 0;
      if (!(openBase >= 0) || openBase + doneBase !== p.baseQuantity) return no("line_mismatch", { productId: p.productId, po: p.baseQuantity, done: doneBase, open: openBase });
      // Đối chiếu chéo với PO: received (đơn vị dòng PO) × base / quantity = phần đã nhận ở các phiếu đã xong (phiếu mở chưa nhận gì).
      if (p.received * p.baseQuantity !== doneBase * p.quantity) return no("po_received_mismatch", { productId: p.productId });
    }
    const excludeUids = [...new Set(done.flatMap((g) => g.items.flatMap((it) => it.details.flatMap((d) => d.qrCodes.concat(d.internalCodes || [])))))];
    const source = po.items.map((p) => ({ productId: p.productId, baseQuantity: p.baseQuantity, ratesByUnitName: rates.get(p.productId) || {} }));
    return { ok: true, reason: null, completed: done.map((g) => ({ id: g.id, code: g.code })), excludeUids, source };
  }

  const isReceivable = (gr) => !!gr && RECEIVABLE.has(gr.status);

  // GR + PO (+ cửa hàng đang đăng nhập) → {ok, soBase, deliveryCode, errors[]}.
  // Một mã giao ↔ một PO ↔ một GR (operator chốt 24/10). Cửa hàng: x-store-id, GR.pos_info.id, PO.pos_id phải có đủ và trùng nhau (PM P1.4).
  function resolveDelivery(gr, po, storeId) {
    const errors = [];
    if (!gr) errors.push("gr_unreadable");
    if (!po) errors.push("po_unreadable");
    if (errors.length) return { ok: false, errors };
    if (gr.poId !== po.id) errors.push("po_mismatch");
    if (!po.grIds.includes(gr.id)) errors.push("gr_not_in_po");
    const store = lower(storeId);
    if (!store || !gr.posId || !po.posId) errors.push("store_missing");
    else if (gr.posId !== store || po.posId !== store) errors.push("store_mismatch");
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
  // Thiếu productId / lô / hạn (DD-MM-YYYY) → không dùng được (PM P2.2): không suy sản phẩm từ tên hay thứ tự.
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
    const productId = d.productId === undefined || d.productId === null ? "" : String(d.productId).trim();
    const lot = String(d.lot || "").trim();
    const expiredDate = String(d.expiredDate || "").trim();
    if (!/^\d+$/.test(productId) || !lot || !/^\d{1,2}-\d{1,2}-\d{4}$/.test(expiredDate)) return { ok: false, reason: "incomplete" };
    return { ok: true, productId, lot, expiredDate, status: String(d.status || "") };
  }

  // ---- trang phiếu (v0.2.4): chỗ gắn khung + phiếu đang hiển thị. Đọc DOM được truyền vào (`doc`), không giữ gì. ----
  // DOM thật (GR03887, 27/10): cột nội dung = breadcrumb, thẻ thông tin phiếu ("Chi tiết phiếu nhận hàng GR… (PO…)", chứa bảng
  // ĐẦU TIÊN của trang), #all-receipt (bảng sản phẩm). Khung extension (data-cgn-panel) chèn ngay trước #all-receipt.
  const GR_CODE_RE = /GR\d+/g;
  const grCodesIn = (n) => [...new Set(String((n && n.textContent) || "").match(GR_CODE_RE) || [])];

  // #all-receipt nếu trang đang hiển thị ĐÚNG phiếu `code`, ngược lại null (fail closed). PM audit rev 1 P1:
  //  - mã chuẩn = thẻ thông tin phiếu (khối đứng ngay trước #all-receipt, bỏ qua khung extension): đúng MỘT mã GR và khớp CHÍNH XÁC;
  //  - khối đứng trước nữa (breadcrumb) có mã GR khác → chưa rõ trang hiện phiếu nào → null. Breadcrumb không tự mở khoá được gì.
  // Không `code` (view chưa biết phiếu, không có nút ghi): chỉ cần #all-receipt.
  function grPageAnchor(doc, code) {
    const a = doc && doc.getElementById("all-receipt");
    if (!a || !a.parentElement) return null;
    if (!code) return a;
    let info = a.previousElementSibling;
    while (info && info.hasAttribute("data-cgn-panel")) info = info.previousElementSibling;
    const main = grCodesIn(info);
    if (main.length !== 1 || main[0] !== code) return null;
    for (let n = info.previousElementSibling; n; n = n.previousElementSibling) {
      if (n.hasAttribute("data-cgn-panel")) continue;
      if (grCodesIn(n).some((c) => c !== code)) return null;
    }
    return a;
  }

  // ---- QR Scan Log (extension khác): CHỈ ĐỌC + một cú bấm "Ngắt kết nối" khi dược sĩ bấm "Lấy đầu đọc cho Nextwaves" (v0.4.1) ----
  // Hợp đồng tạm (docs/dev/REQUEST-QSL-v0.4.1-DAU-DOC.md §3, QR Scan Log 0.9.6): host #circa-rfid-demo-root (shadow root `open`, ẩn bằng
  // style.display = "none" ngoài /ban-hang/<UUID>), panel #circa-rfid-demo-panel mang data-connection / data-state, nút Ngắt
  // button[data-action="disconnect"]; Web Lock "circa-qr-scan-log:rfid-reader" nhả sau khi đóng cổng. Đọc DOM được truyền vào.
  // → {present, displayed, connection, state, holding, busy, button} (button = nút Ngắt đang bật, hoặc null).
  const QSL_HOST_ID = "circa-rfid-demo-root";
  const QSL_LOCK = "circa-qr-scan-log:rfid-reader";
  const QSL_HOLDING = new Set(["connected", "waiting_clear", "paused"]);
  function qslView(doc) {
    const host = doc && typeof doc.getElementById === "function" ? doc.getElementById(QSL_HOST_ID) : null;
    if (!host) return { present: false, displayed: false, connection: "", state: "", holding: false, hiddenHolding: false, busy: false, button: null };
    const displayed = !(host.style && host.style.display === "none");
    const root = host.shadowRoot || null;
    const q = (sel) => (root && typeof root.querySelector === "function" ? root.querySelector(sel) : null);
    const panel = q("#circa-rfid-demo-panel");
    const attr = (n) => (panel && typeof panel.getAttribute === "function" ? String(panel.getAttribute(n) || "") : "");
    const connection = attr("data-connection");
    const state = attr("data-state");
    const btn = q('button[data-action="disconnect"]');
    // hiddenHolding (review v0.4.1 P2-1): khung ẩn (tab đã rời trang Bán hàng) mà thuộc tính cuối là trạng thái giữ — QR Scan Log 0.9.6
    // vẫn giữ cổng tới khi tab đóng / tải lại. Chỉ dùng khi Web Lock của QR Scan Log đang bị giữ (background + tab POS kiểm).
    return { present: true, displayed, connection, state, holding: displayed && QSL_HOLDING.has(connection), hiddenHolding: !displayed && QSL_HOLDING.has(connection), busy: state === "processing", button: btn && !btn.disabled ? btn : null };
  }

  const lib = { normalizeGr, normalizePo, normalizeGrSearch, normalizeGrSearchPage, checkSoGrs, soWriteLock, remainderOf, isReceivable, resolveDelivery, grFingerprintSource, normalizeQrLookup, grPageAnchor, qslView, QSL_LOCK, RECEIVABLE };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.pos = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
