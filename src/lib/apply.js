/*
 * Chạy kế hoạch ghi GR (W1): mỗi chi tiết một PUT, tuần tự. Thuần (I/O qua `api` tiêm vào) để test được.
 *
 *  Trước mỗi PUT: đọc lại GR. Chi tiết phải còn đúng `before` và chưa có UID nào của bước.
 *    - Đã có đủ UID + đã đạt `target` → coi như đã ghi (lần chạy trước), bỏ qua.
 *    - Khác → dừng `gr_changed` (không đoán, không ghi đè).
 *  PUT: {detail:{received_quantity: target (TUYỆT ĐỐI), lot_id, thuocsi_qr_codes: uids}}.
 *    `thuocsi_qr_codes` là NỐI THÊM phía server → không bao giờ gửi lại khi chưa đọc lại GR.
 *  Sau PUT: đọc lại GR, kiểm received = target và mọi UID có mặt. Lệch → dừng `verify_failed`.
 *  Lỗi mạng / ngoại lệ trong PUT → dừng `unknown` (kết quả không rõ); lần chạy sau sẽ đọc lại GR rồi mới quyết.
 */
(function (root) {
  "use strict";

  function findDetail(gr, step) {
    if (!gr) return null;
    const item = gr.items.find((it) => it.id === step.itemId);
    return item ? item.details.find((d) => d.id === step.detailId) || null : null;
  }

  async function runPlan(plan, api, onEvent) {
    const emit = (e) => {
      try {
        if (onEvent) onEvent(e);
      } catch (_) {
        /* nhật ký lỗi không được làm hỏng luồng ghi */
      }
    };
    const results = [];
    if (!plan || !plan.ok) return { ok: false, reason: "plan_not_ok", results };
    for (const step of plan.steps) {
      let fresh;
      try {
        fresh = await api.getGr();
      } catch (err) {
        emit({ type: "abort", step, reason: "read_failed" });
        return { ok: false, reason: "read_failed", results, step };
      }
      if (fresh && !/^(WAITING_TO_RECEIVE|RECEIVING)$/.test(fresh.status)) {
        emit({ type: "abort", step, reason: "gr_not_receivable" });
        return { ok: false, reason: "gr_not_receivable", results, step };
      }
      const d = findDetail(fresh, step);
      if (!d) {
        emit({ type: "abort", step, reason: "detail_missing" });
        return { ok: false, reason: "detail_missing", results, step };
      }
      const present = step.uids.filter((u) => d.qrCodes.includes(u));
      if (present.length === step.uids.length && d.received === step.target) {
        results.push({ detailId: step.detailId, status: "already" });
        emit({ type: "already", step });
        continue;
      }
      if (present.length > 0 || d.received !== step.before) {
        emit({ type: "abort", step, reason: "gr_changed", observed: { received: d.received, present } });
        return { ok: false, reason: "gr_changed", results, step };
      }
      emit({ type: "sending", step });
      let res;
      try {
        res = await api.putDetail(step, { detail: { received_quantity: step.target, lot_id: step.lotId, thuocsi_qr_codes: step.uids.slice() } });
      } catch (err) {
        emit({ type: "abort", step, reason: "unknown" });
        return { ok: false, reason: "unknown", results, step };
      }
      if (!res || !res.ok) {
        emit({ type: "abort", step, reason: "put_failed", status: res && res.status, body: res && res.body });
        return { ok: false, reason: "put_failed", results, step, status: res && res.status };
      }
      let after;
      try {
        after = await api.getGr();
      } catch (err) {
        emit({ type: "abort", step, reason: "verify_read_failed" });
        return { ok: false, reason: "verify_read_failed", results, step };
      }
      const d2 = findDetail(after, step);
      const allThere = !!d2 && step.uids.every((u) => d2.qrCodes.includes(u));
      if (!d2 || d2.received !== step.target || !allThere) {
        emit({ type: "abort", step, reason: "verify_failed", observed: d2 ? { received: d2.received, codes: d2.qrCodes.length } : null });
        return { ok: false, reason: "verify_failed", results, step };
      }
      results.push({ detailId: step.detailId, status: "done" });
      emit({ type: "done", step });
    }
    return { ok: true, results };
  }

  const lib = { runPlan };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.apply = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
