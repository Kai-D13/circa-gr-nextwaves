// v0.4.1 — kiểm SAU lượt (chỉ đọc): tóm tắt phiên + nhật ký để gửi Claude, thay cho file xuất storage.
// Service worker → Console → dán → Enter (nhiều phiếu thì sửa mã ở dòng GR0) → chép kết quả gửi Claude.
// Lượt đạt: state "done" (dược sĩ đã HOÀN THÀNH) hoặc "applied" (đã tự điền, chưa HOÀN THÀNH); dien.how "auto"; dungDien null;
// nwReceipts 1; soLoDaDien = số lô trên phiếu; dauDoc "returned" (hoặc "no_qsl"); nhật ký có receive_scan 2xx → scan_ok → nw_received →
// pos_focused → apply_claimed → applied (→ gr_completed khi dược sĩ HOÀN THÀNH).
// v0.4.1: khopCuoi "ok" (khác "ok" = tên các chỗ lệch — kiểm phiếu trước khi HOÀN THÀNH). Phiếu phần còn lại: phanConLai.phieuXong có;
// khiThieu "keep_open" (Giữ đơn mở) khi thieu > 0; banGapVanNhan 0 (khác 0 = Nextwaves nhận cả tem món đã bán gấp → tồn Nextwaves dư, báo vận hành).
{
  const GR0 = "GR?????"; // ← mã phiếu, ví dụ GR84674 (để nguyên = phiên mới nhất)
  chrome.storage.local.get(["sessions", "config"]).then(({ sessions = {}, config = {} }) => {
    // Để nguyên GR????? → lấy phiên cập nhật gần nhất ở môi trường đang chọn trong popup (kết quả in rõ mã phiếu đã lấy).
    const GR = /^GR\d+$/.test(GR0) ? GR0 : ((Object.values(sessions).filter((x) => !config.mode || x.envId === config.mode).sort((a, b) => b.updatedAt - a.updatedAt)[0] || {}).grCode || GR0);
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
          tenant: s.nwTenant,
          env: s.envId,
          phienTrungMa: cands.length - 1,
          gr: s.grCode,
          cuaHang: s.posName,
          kho: [s.warehouseName || "", s.warehouseCode || ""].filter(Boolean).join(" ") || null,
          state: s.state,
          scanOkAt: t(s.scanOkAt),
          nhanAt: t(s.receivedAt),
          dien: s.applyClaim ? { how: s.applyClaim.how, plan: s.applyClaim.planHash, at: t(s.applyClaim.at) } : null,
          dungDien: s.applyError || null,
          dauDoc: s.reader ? s.reader.state : null,
          nwUnits: (r.units || []).length,
          nwReceipts: (r.receiptIds || []).length,
          khopCuoi: s.applyResult && s.applyResult.verify ? (s.applyResult.verify.ok ? "ok" : (s.applyResult.verify.diffs || []).map((d) => d.why).join(",")) : null,
          phanConLai: s.remainder ? { phieuXong: s.remainder.completed.map((g) => g.code), maDaXong: (s.remainder.excludeUids || []).length } : s.remainderNote ? `không: ${s.remainderNote}` : null,
          thieu: r.soldMissing === undefined ? null : r.soldMissing,
          khiThieu: r.onMissing || null,
          banGapVanNhan: s.remainder ? (r.units || []).filter((u) => (s.remainder.excludeUids || []).includes(u.uid)).length : 0,
          layDauDoc: t(s.readerTakenAt),
          // Mỗi lô ghi 2 dòng apply_* (+ dòng plan): chỉ đếm, để phiếu nhiều lô vẫn giữ đủ mốc (nhật ký tối đa 200 dòng).
          soLoDaDien: (s.log || []).filter((l) => l.type === "apply_done").length,
          log: (s.log || []).filter((l) => !/^(apply_sending|apply_done|plan)$/.test(l.type)).slice(-60).map((l) => [t(l.at), l.type, l.reason || l.httpStatus || l.status || l.how || l.why || l.units || ""].join(" ")),
        },
        null,
        1
      )
    );
  });
}
