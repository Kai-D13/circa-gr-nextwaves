# Audit v0.4.0 (79D4269C) trước go-live production — 07/11/2026

Phạm vi: `git diff 2d35a8c...ec4293c -- src` (nhánh `batch/v0.4-moi-pos`, 11 file, +1305 / −1177), đọc kèm hàm bao quanh, đối chiếu dữ liệu thật QA máy dev (Florita GR84570 / GR84673, Lumina SO 38569460).

## 1. Finding (13, không có P1)

**Mọi finding đều dừng an toàn (fail closed): không ghi sai POS, hậu quả xấu nhất là dược sĩ nhận tay.**

| # | Mức | Chỗ | Nội dung | Hướng sửa (v0.4.1) |
|---|---|---|---|---|
| 1 | P2 | `nw/nw-content.js:658` | SO tách giao: màn quét Nextwaves cho chọn mọi đơn của SO. Dược sĩ chọn nhầm đơn của phiếu kia mà phiếu kia chưa mở phiên → không giao được lượt nhận. Hướng dẫn "mở phiếu đó rồi Đọc lại kết quả nhận" không dùng được (tìm theo SO không còn trả đơn đã nhận) → phiếu kia nhận tay | Đọc đơn đang mở trong modal (số phiếu gửi / PO), cảnh báo đỏ trước khi xác nhận nếu khác đơn của phiếu. Gốc rễ: trường `thuocsi_delivery_code` của Nextwaves (mục 3) |
| 2 | P2 | `pos/pos-content.js:970` | Điểm chặn của kế hoạch (đơn vị lạ, lô không có trên phiếu, tra QR lỗi, lẻ, vượt) chỉ biết **sau** khi Nextwaves đã nhận (không đảo ngược), dù UID dự kiến có từ lúc khớp đơn | Lập kế hoạch thử (tra QR + quy đổi) ngay khi `nw_ready`, hiện trên khung Nextwaves "điền được N/N" hoặc lý do, trước khi dược sĩ bấm xác nhận |
| 3 | P2 | `lib/resolve.js:94` | Bỏ bảng cửa hàng → kho: kho của phiên lấy từ chính đơn đã khớp, phép kiểm "biên nhận đúng kho" thành vòng tròn. Đơn của SO nằm nhầm kho cửa hàng khác vẫn được nhận + điền | Cảnh báo / khoá khi tên kho Nextwaves không ứng với cửa hàng POS đang đăng nhập (bảng 2 dòng Florita / Lumina hoặc so tên) |
| 4 | P3 | `pos/pos-content.js:1149` | Khớp cuối lệch (lô / lượng / trạng thái / tập mã) chỉ hiện tạm; F5 → khung xanh | Lưu kết quả khớp cuối vào phiên, khung "đã điền" đọc lại |
| 5 | P3 | `manifest.json:14` | Quyền + hook trên mọi `*.nextwaves.app` (bọc fetch / XHR, phát Authorization lên window) trong khi chỉ dùng `circa` / `circa-stg` | Liệt kê đúng host `circa`, `circa-stg` (+ `api-`) |
| 6 | P3 | `background.js:490` | Nhận xong chỉ đóng tab gửi; tab Nextwaves extension mở cho phiên (nếu khác) vẫn giữ cổng đầu đọc. `routeScan` làm hai phiên chung `nwTabId` | Đóng cả `nwTabId` cũ; không gán trùng |
| 7 | P3 | `background.js:269` | Tái dùng tab Nextwaves (C1) có thể điều hướng tab đang có lượt "Xác nhận nhận hàng" chưa về → mất lượt 2xx | Không tái dùng tab của phiên `nw_ready` vừa có receive-scan / đang quét; mở tab mới |
| 8 | P3 | `nw/nw-content.js:292` | `session:noOrder` lỗi → latch view null → "Lỗi extension" | Latch luôn có view |
| 9 | P3 | `nw/nw-content.js:28` | Khung che một phần nút "Kết nối đầu đọc" (QA 07/11) | Thêm vào danh sách né |
| 10 | P3 | `nw/nw-content.js:752` | `readerTick` quét mọi nút mỗi giây trên mọi trang Nextwaves, cả khi không có phiên | Thoát sớm khi không có phiên |
| 11 | P3 | `nw/nw-content.js:724` | Chữ ký phiên gồm đầu đọc / tab của mọi phiên → GET chi tiết PO thừa | Chỉ xét phiên của trang |
| 12 | P3 | `lib/plan.js:234` | `autoPlanCheck` mã chết; chú thích còn nói tự HOÀN THÀNH | Xoá |
| 13 | P3 | `pos/pos-content.js:196` | Tập trạng thái lượt mượn + chuỗi "kho" chép nhiều chỗ | Gom về `lib` |

## 2. Tiến độ so với plan v0.4.0

| Phần | Trạng thái |
|---|---|
| A — sửa lỗi review, treo GR84570 | **Xong**, đã thấy trên production (QA máy dev) |
| B — mọi cửa hàng, tenant theo máy | **Xong**, đã khớp đúng đơn ở Florita (GR84673) và Lumina (GR84749, GR84748 — SO tách giao) |
| C — luồng E2E: tự kết nối đầu đọc, tự điền, không tự HOÀN THÀNH | **Mã xong + gate** (219 test, đột biến 195 ca, Edge 43/43). Đường ghi thật production của v0.4.0 **chưa chạy**; lõi ghi (kế hoạch / điền / đọc lại) giống v0.3.1, đã đạt thật ở GR84674 |
| D — mượn đầu đọc QR Scan Log | **Hoãn** (operator 07/11) |
| Cài máy POS | Chưa |

## 3. Go-live

**Đủ cơ sở go-live có kiểm soát ở Florita + Lumina với 79D4269C:** mọi finding dừng an toàn, lõi ghi đã đạt thật trên production, QA máy dev đạt trên dữ liệu thật hai cửa hàng. Chưa đủ cơ sở cho "chạy không ai theo dõi" trước vài lượt thật có `kiem-sau.js`.

- **Lượt đầu:** Lumina GR84749 (1 tem), Florita GR84673 (22 tem, chọn PO-2026-000001), Lumina GR84748 (62 tem, 6 dòng theo vỉ / gói — kiểm quy đổi). SO tách giao: dược sĩ đọc số PO trên màn quét trước khi xác nhận (finding 1).
- **Quay lại bản cũ:** gói v0.3.1 ở `C:\circa-gr-nextwaves-release\v0.3.1\`.
- **v0.4.1** sau vài lượt thật: finding 1–3 + P3; dùng `thuocsi_delivery_code` khi Nextwaves có (ví dụ GR84748 ↔ `SOBD38569460-P2`, đơn PUSH-20261107002548-5427 / SOBD38569460-16028754).
