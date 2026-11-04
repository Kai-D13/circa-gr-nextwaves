// v0.3.1 — kiểm SAU lượt (chỉ đọc): tóm tắt phiên + nhật ký để gửi Claude, thay cho file xuất storage.
// Service worker → Console → sửa mã phiếu ở dòng GR → dán → Enter → chép kết quả gửi Claude.
// Lượt tự động đạt: state "done"; hoanThanh.source "auto"; quyenDaDung.auto true; nwReceipts 1; autoGrantsConLai 0;
// soLoDaDien = số lô trên phiếu; nhật ký có receive_scan 2xx → scan_ok → nw_received → auto_ready → auto_claimed → applied → auto_completed.
{
  const GR = "GR?????"; // ← mã phiếu, ví dụ GR03929
  chrome.storage.local.get(["sessions", "autoGrants", "grants", "config"]).then(({ sessions = {}, autoGrants = {}, grants = {}, config = {} }) => {
    const t = (v) => (v ? new Date(v).toLocaleTimeString("vi-VN") : null);
    // Chọn phiên theo mã phiếu + môi trường đang chọn trong popup (Production / Staging), mới nhất; có hơn một phiên trùng mã thì báo.
    const cands = Object.values(sessions).filter((x) => x.grCode === GR && (!config.mode || x.envId === config.mode)).sort((a, b) => b.updatedAt - a.updatedAt);
    const s = cands[0];
    if (!s) return console.log(`KHÔNG có phiên ${GR} (phiên tự xoá sau 24 giờ không cập nhật)`);
    const r = s.nwResult || {};
    console.log(
      JSON.stringify(
        {
          v: chrome.runtime.getManifest().version,
          env: s.envId,
          phienTrungMa: cands.length - 1,
          gr: s.grCode,
          state: s.state,
          scanOkAt: t(s.scanOkAt),
          autoRun: s.autoRun ? { at: t(s.autoRun.at), skipped: s.autoRun.skipped || null } : null,
          quyenDaDung: s.authorization ? { auto: !!s.authorization.auto, plan: s.authorization.planHash, cap: t(s.authorization.grantedAt), dung: t(s.authorization.usedAt) } : null,
          hoanThanh: s.completeResult ? { source: s.completeResult.source || null, at: t(s.completeResult.at) } : null,
          dungDien: s.applyError || null,
          nwUnits: (r.units || []).length,
          nwReceipts: (r.receiptIds || []).length,
          autoGrantsConLai: Object.keys(autoGrants).filter((k) => autoGrants[k].expiresAt > Date.now()).length,
          capPhepConHan: Object.values(grants).filter((g) => g.expiresAt > Date.now()).length,
          // Mỗi lô ghi 2 dòng apply_* (+ dòng plan): chỉ đếm, để phiếu nhiều lô vẫn giữ đủ mốc start … auto_completed (nhật ký tối đa 200 dòng).
          soLoDaDien: (s.log || []).filter((l) => l.type === "apply_done").length,
          log: (s.log || []).filter((l) => !/^(apply_sending|apply_done|plan)$/.test(l.type)).slice(-60).map((l) => [t(l.at), l.type, l.reason || l.httpStatus || l.status || l.source || l.epcs || l.units || ""].join(" ")),
        },
        null,
        1
      )
    );
  });
}
