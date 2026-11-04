// v0.3.1 — kiểm SAU lượt (chỉ đọc): tóm tắt phiên + nhật ký để gửi Claude, thay cho file xuất storage.
// Service worker → Console → sửa mã phiếu ở dòng GR → dán → Enter → chép kết quả gửi Claude.
// Lượt tự động đạt: state "done"; hoanThanh.source "auto"; quyenDaDung.auto true; nwReceipts 1; autoGrantsConLai 0;
// nhật ký có receive_scan 2xx → scan_ok → nw_received → auto_ready → auto_claimed → apply_* → applied → auto_completed.
{
  const GR = "GR?????"; // ← mã phiếu, ví dụ GR03929
  chrome.storage.local.get(["sessions", "autoGrants", "grants"]).then(({ sessions = {}, autoGrants = {}, grants = {} }) => {
    const t = (v) => (v ? new Date(v).toLocaleTimeString("vi-VN") : null);
    const s = Object.values(sessions).find((x) => x.grCode === GR);
    if (!s) return console.log(`KHÔNG có phiên ${GR} (phiên tự xoá sau 24 giờ không cập nhật)`);
    const r = s.nwResult || {};
    console.log(
      JSON.stringify(
        {
          v: chrome.runtime.getManifest().version,
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
          log: (s.log || []).slice(-40).map((l) => [t(l.at), l.type, l.reason || l.httpStatus || l.status || l.source || l.epcs || l.units || ""].join(" ")),
        },
        null,
        1
      )
    );
  });
}
