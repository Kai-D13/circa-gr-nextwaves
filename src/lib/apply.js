/*
 * Chạy kế hoạch ghi GR (W1): mỗi chi tiết một PUT, tuần tự. Thuần (I/O qua `api` tiêm vào) để test được.
 *
 *  Trước mỗi PUT: đọc lại GR và so TOÀN PHIẾU với ảnh chụp lúc lập kế hoạch (PM audit 24/10 P2.3):
 *    - phiếu phải còn chờ nhận / đang nhận; tập chi tiết không đổi;
 *    - chi tiết của bước: đúng trạng thái "trước" → ghi; đúng trạng thái "sau" (lần chạy trước đã ghi) → bỏ qua;
 *    - mọi chi tiết khác: đúng như mong đợi (trước, hoặc sau nếu là bước đã / sẽ xử lý) → khác là dừng `gr_changed`.
 *  Ngay trước PUT: `api.beforePut(step)` phải trả true (còn quyền ghi — lease, PM P1.5); không thì dừng `lease_lost`.
 *  PUT: {detail:{received_quantity: target (TUYỆT ĐỐI), lot_id, thuocsi_qr_codes: uids}}.
 *    `thuocsi_qr_codes` là NỐI THÊM phía server → không bao giờ gửi lại khi chưa đọc lại GR.
 *  Sau PUT: đọc lại GR, chi tiết của bước phải đúng trạng thái "sau", các chi tiết khác không đổi. Lệch → `verify_failed`.
 *  Lỗi mạng / hết giờ trong PUT → dừng `unknown` (kết quả không rõ); lần chạy sau phải đọc lại GR và lập kế hoạch mới.
 */
(function (root) {
  "use strict";
  const P = root.__CGN__ && root.__CGN__.plan ? root.__CGN__.plan : typeof require === "function" ? require("./plan.js") : null;

  const RECEIVABLE = /^(WAITING_TO_RECEIVE|RECEIVING)$/;
  const same = (a, b) => !!a && !!b && a.received === b.received && a.n === b.n && a.codes.length === b.codes.length && a.codes.every((c, i) => c === b.codes[i]);
  const afterOf = (before, step) => {
    const codes = [...new Set(before.codes.concat(step.uids))].sort();
    return { received: step.target, codes, n: before.n + step.uids.length };
  };

  // Chi tiết đầu tiên lệch giữa phiếu đọc được và mong đợi (bỏ qua `skipId`); null nếu khớp.
  function firstDiff(snap, expected, allowed, skipId) {
    const a = Object.keys(snap.details).sort();
    const b = Object.keys(expected).sort();
    if (a.length !== b.length || a.some((k, i) => k !== b[i])) return { detailId: null, why: "detail_set" };
    for (const id of a) {
      if (id === skipId) continue;
      if (same(snap.details[id], expected[id])) continue;
      if (allowed[id] && same(snap.details[id], allowed[id])) continue;
      return { detailId: id, why: "detail" };
    }
    return null;
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
    if (!plan || !plan.ok || !plan.snapshot) return { ok: false, reason: "plan_not_ok", results };
    const expected = JSON.parse(JSON.stringify(plan.snapshot.details));
    // Trạng thái "sau" của các bước chưa xử lý trong lượt này (lần chạy trước có thể đã ghi).
    const pendingAfter = {};
    for (const st of plan.steps) if (expected[st.detailId]) pendingAfter[st.detailId] = afterOf(expected[st.detailId], st);

    const stop = (reason, step, extra) => {
      emit(Object.assign({ type: "abort", step, reason }, extra || {}));
      return Object.assign({ ok: false, reason, results, step }, extra || {});
    };

    for (const step of plan.steps) {
      const before = expected[step.detailId];
      if (!before) return stop("detail_missing", step);
      const after = afterOf(before, step);
      delete pendingAfter[step.detailId];

      let fresh;
      try {
        fresh = await api.getGr();
      } catch (err) {
        return stop("read_failed", step);
      }
      if (!fresh || !RECEIVABLE.test(fresh.status)) return stop("gr_not_receivable", step);
      const snap = P.snapshotOf(fresh);
      const cur = snap.details[step.detailId];
      if (!cur) return stop("detail_missing", step);
      const diff = firstDiff(snap, expected, pendingAfter, step.detailId);
      if (diff) return stop("gr_changed", step, { observed: diff });
      if (same(cur, after)) {
        expected[step.detailId] = after;
        results.push({ detailId: step.detailId, status: "already" });
        emit({ type: "already", step });
        continue;
      }
      if (!same(cur, before)) return stop("gr_changed", step, { observed: { detailId: step.detailId, received: cur.received, codes: cur.codes.length } });

      if (api.beforePut) {
        let allowed = false;
        try {
          allowed = (await api.beforePut(step)) === true;
        } catch (_) {
          allowed = false;
        }
        if (!allowed) return stop("lease_lost", step);
      }
      emit({ type: "sending", step });
      let res;
      try {
        res = await api.putDetail(step, { detail: { received_quantity: step.target, lot_id: step.lotId, thuocsi_qr_codes: step.uids.slice() } });
      } catch (err) {
        return stop("unknown", step);
      }
      if (!res || !res.ok) return stop("put_failed", step, { status: res && res.status, body: res && res.body });

      let afterGr;
      try {
        afterGr = await api.getGr();
      } catch (err) {
        return stop("verify_read_failed", step);
      }
      const snap2 = afterGr ? P.snapshotOf(afterGr) : null;
      const d2 = snap2 ? snap2.details[step.detailId] : null;
      const diff2 = snap2 ? firstDiff(snap2, expected, pendingAfter, step.detailId) : { detailId: null };
      if (!same(d2, after) || diff2) return stop("verify_failed", step, { observed: d2 ? { received: d2.received, codes: d2.codes.length, n: d2.n } : null });
      expected[step.detailId] = after;
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
