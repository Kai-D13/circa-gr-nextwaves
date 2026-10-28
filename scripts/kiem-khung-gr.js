// v0.2.5 (PM AUDIT-A1-GR03887 §2) — đoạn kiểm CHỈ ĐỌC trên Chrome staging thật sau khi cài v0.2.5 cùng Extension ID.
// Mở một trang phiếu POS (/danh-sach-phieu-nhan-hang/<id>), chờ ≥ 15 giây (quá 10 giây chờ chỗ gắn khung), F12 → Console → dán
// toàn bộ đoạn này → Enter. Chỉ đọc DOM: không bấm, không gõ, không gọi mạng, không in tên người.
//  - Phiếu ĐÃ HOÀN THÀNH (vd. GR03887): kỳ vọng "khung": 0 (không khung trong luồng, không khung nổi đỏ).
//  - Phiếu CÒN chờ nhận có mã giao thuocsi (vd. GR03879): kỳ vọng "khung": 1, "trongLuong": 1, "noi": 0, "allReceipt": true.
(() => {
  const text = document.body.innerText;
  const khung = [...document.querySelectorAll("[data-cgn-panel]")];
  return JSON.stringify({
    url: location.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, "<id>"),
    maGR: [...new Set(text.match(/GR\d{5,}/g) || [])].slice(0, 3),
    trangThai: (text.match(/Chờ nhận|Đang nhận|Đã nhận|Hoàn thành|Đã hủy/) || [])[0] || null,
    allReceipt: !!document.getElementById("all-receipt"),
    khung: khung.length,
    trongLuong: khung.filter((k) => k.hasAttribute("data-cgn-inline")).length,
    noi: khung.filter((k) => !k.hasAttribute("data-cgn-inline")).length,
  });
})();
