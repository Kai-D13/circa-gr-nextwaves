// v0.3.1 — kiểm TRƯỚC (chỉ đọc): phiên của một phiếu sau khi bấm "Nhận hàng bằng RFID", trước khi cho phép tự động.
// chrome://extensions → thẻ "Circa GR ← Nextwaves" → "Service worker" → Console → dán cả đoạn → Enter. Đang có nhiều phiếu thì
// sửa mã phiếu ở dòng GR0; để nguyên thì lấy phiên mới nhất.
// Chỉ đọc chrome.storage của extension: không ghi, không gọi mạng, không in token / tên người.
// Kỳ vọng: state "nw_ready"; cuaHang / so / nwPo đúng phiếu; scanOk false; bienNhanTruoc 0; khoa []; kho có; mọi dòng "có tem";
// tem = temKhongTrung = số tem vật lý; thieuUid 0; grNw mỗi sản phẩm SL GR = SL Nextwaves.
{
  const GR0 = "GR?????"; // ← mã phiếu, ví dụ GR84674 (để nguyên = phiên mới nhất)
  chrome.storage.local.get(["sessions", "autoGrants", "grants", "config"]).then(({ sessions = {}, autoGrants = {}, grants = {}, config = {} }) => {
    // Để nguyên GR????? → lấy phiên cập nhật gần nhất ở môi trường đang chọn trong popup (kết quả in rõ mã phiếu đã lấy).
    const GR = /^GR\d+$/.test(GR0) ? GR0 : ((Object.values(sessions).filter((x) => !config.mode || x.envId === config.mode).sort((a, b) => b.updatedAt - a.updatedAt)[0] || {}).grCode || GR0);
    // Chọn phiên theo mã phiếu + môi trường đang chọn trong popup (Production / Staging), mới nhất; có hơn một phiên trùng mã thì báo.
    const cands = Object.values(sessions).filter((x) => x.grCode === GR && (!config.mode || x.envId === config.mode)).sort((a, b) => b.updatedAt - a.updatedAt);
    const s = cands[0];
    if (!s) return console.log(`KHÔNG có phiên ${GR}${config.mode ? ` (${config.mode})` : ""} — bấm “Nhận hàng bằng RFID” trên dòng ${GR} trước`);
    const sh = (s.expected && s.expected.shipments) || [];
    const us = sh.flatMap((x) => x.lines.flatMap((l) => l.units));
    const t = (v) => (v ? new Date(v).toLocaleString("vi-VN") : null);
    console.log(
      JSON.stringify({
        v: chrome.runtime.getManifest().version,
        mode: config.mode,
        env: s.envId,
        phienTrungMa: cands.length - 1,
        gr: s.grCode,
        state: s.state,
        schema: s.schema,
        tao: t(s.createdAt),
        cuaHang: s.posName,
        so: s.deliveryCode,
        nwPo: s.nwPoNumber,
        kho: !!s.warehouseId,
        scanOk: !!s.scanOk,
        bienNhanTruoc: (s.receiptIdsBefore || []).length,
        khoa: [].concat(s.writeLocks || [], s.nwWriteLocks || []),
        timNw: s.nwSearch,
        phieuGui: sh.map((x) => ({ status: x.status, needsAccept: x.needsAccept, dong: x.lines.map((l) => [l.posProductId || l.sku, l.unit, l.quantity, l.tagged ? "có tem" : "KHÔNG tem", l.units.length]) })),
        tem: us.length,
        temKhongTrung: new Set(us.map((u) => u.epc)).size,
        thieuUid: us.filter((u) => !u.uid).length,
        grNw: (s.fpRows || []).map((r) => [r.productId, r.grBase, r.nwBase]),
        autoGrants: Object.keys(autoGrants).length,
        capPhepConHan: Object.values(grants).filter((g) => g.expiresAt > Date.now()).map((g) => g.grCode),
      })
    );
  });
}
