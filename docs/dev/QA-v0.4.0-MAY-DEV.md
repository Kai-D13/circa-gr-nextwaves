# QA / QC v0.4.0 trên máy dev (07/11/2026)

**Mục đích:** kiểm v0.4.0 trên production bằng máy dev, **không ghi** (không bấm "Xác nhận nhận hàng", không HOÀN THÀNH). Đạt thì operator cho phép cài máy POS vận hành (`docs/BUSINESS-FLOW.md` §6).

- Gói / hướng dẫn: `docs/dev/BATCH-v0.4.0.md`, `docs/dev/RUNBOOK-v0.4.0.md`.
- Máy dev tải extension từ `C:\circa-gr-nextwaves-v0.2.3`. Claude đã chép gói v0.4.0 **79D4269C** vào đó (bản v0.3.1 sao lưu ở `C:\circa-gr-nextwaves-release\backup\v0.2.3-truoc-v0.4.0-20261107\`).

**Máy dev (operator xác nhận 07/11):** có đầu đọc RFID + QR Scan Log đang kết nối; POS production chuyển được giữa các cửa hàng; tài khoản Nextwaves `https://circa.nextwaves.app` thấy kho Florita + Lumina (kho mới cũng tự thấy).

## Danh sách kiểm

| # | Làm | Kỳ vọng |
|---|---|---|
| Q1 | `chrome://extensions` → Reload (↻) thẻ "Circa GR ← Nextwaves" | Thẻ ghi **0.4.0**, không có nút "Errors" đỏ |
| Q2 | Popup → Môi trường **Production**, Tenant **để trống** → Lưu | Dòng dưới: "Production: POS https://pos.v2.circa.vn · Nextwaves https://circa.nextwaves.app · mọi cửa hàng (theo cửa hàng đang đăng nhập POS)", không có "CHỈ ĐỌC". "Phiên gần đây" trống (phiên của v0.3.1 bị xoá khi nâng) |
| Q3 | F5 tab POS → Danh sách phiếu nhận hàng | Dòng phiếu chờ nhận có nút **"Nhận hàng bằng RFID"** |
| Q4 | Bấm nút trên một phiếu **không có** đơn Nextwaves chờ nhận. Operator đưa hai phiếu (07/11): `…/danh-sach-phieu-nhan-hang/a4943005-bb77-4ee7-a165-e8ebc3e1a1d1` (GR84570, Florita — phiếu từng treo "Đang tìm…") và `…/danh-sach-phieu-nhan-hang/6f961d14-5e8c-4fee-a2ec-4828477d8ee9`. POS chuyển đúng cửa hàng của phiếu trước khi mở | Tab Nextwaves mở. Trong ~10 giây khung ghi **"Nextwaves chưa có đơn chờ nhận cho SOBD…"** kèm "nhận tay trên POS", không treo "Đang tìm…". Danh sách POS ghi **"Không có đơn NW"**. Bấm "Tìm lại" → báo lại như cũ. Xong: popup → Xoá phiên |
| Q5 | Bấm nút trên một phiếu **có** đơn Nextwaves chờ nhận (khi có) | Khung Nextwaves **"Sẵn sàng nhận hàng"**: đúng mã phiếu, đơn PO-…, số UID, **"Kho Nextwaves: <tên kho> (<mã>)"** đúng cửa hàng (Lumina 406918, Florita 410478). Dán `kiem-truoc.js` vào Console của Service worker. **Không bấm "Xác nhận nhận hàng".** Xong: popup → Xoá phiên → tab Nextwaves tự đóng |
| Q6 | Như Q5, với QR Scan Log đang kết nối RFID ở tab bán hàng | Khung: "Đầu đọc: chưa kết nối — extension đang tự kết nối…" → sau tối đa 3 lần: **"đang bận ở tab khác — sang tab bán hàng bấm Ngắt RFID rồi quay lại tab này"**. Sang tab bán hàng bấm Ngắt → quay lại tab Nextwaves → **"Đầu đọc: đã kết nối."** Extension không bấm nút nào khác trên Nextwaves |
| Q7 | Mở trang một phiếu chờ nhận, dán `kiem-khung-gr.js` vào Console tab POS | Khung extension không che nút HOÀN THÀNH / HỦY của POS |

**Đạt khi:** Q1–Q4 và Q7 đạt. Q5 / Q6 cần phiếu có đơn Nextwaves chờ nhận (màn quét + nút đầu đọc chỉ có khi Nextwaves có đơn). Chưa có thì Q5 / Q6 chuyển sang lượt đầu máy POS.

**Gửi Claude một lần:**
- đạt / không đạt từng mục;
- kết quả `kiem-sau.js` sau Q4 (có trạng thái `no_nw_order`, số lần tìm đơn trong nhật ký) và `kiem-truoc.js` của Q5 nếu có;
- ảnh chụp chỉ khi một mục không đạt.

## Không nằm trong QA máy dev

- **Lượt ghi thật** (nhận trên Nextwaves → tự điền → HOÀN THÀNH): làm ở lượt đầu trên máy POS vận hành, đúng phiếu operator cho phép, có `kiem-sau.js`. Muốn chạy trên máy dev thì cần phiếu có hàng gắn tem tại máy dev + operator cho phép bằng chữ đúng phiếu.
- Mượn / trả đầu đọc tự động với QR Scan Log (hoãn 07/11).
