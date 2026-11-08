# QA / QC v0.4.1 trên máy dev (08/11/2026)

**Mục đích:** kiểm v0.4.1 trên production bằng máy dev, **không ghi** (không bấm "Xác nhận nhận hàng", không HOÀN THÀNH). Đạt thì operator cho phép cài máy POS (Florita, Lumina) — `docs/BUSINESS-FLOW.md` §6.

- Gói / hướng dẫn: `docs/dev/BATCH-v0.4.1.md`, `docs/dev/RUNBOOK-v0.4.1.md`.
- Máy dev tải extension từ `C:\circa-gr-nextwaves-v0.2.3` (đang 0.4.0 `79D4269C`). Cài = chép gói **BF5A9AD9** đè vào đó (sao lưu bản đang có trước), operator Reload.
- Claude chạy trên Chrome máy dev qua Claude in Chrome: chỉ đọc trang + bấm nút của extension. Hộp chọn cổng của Chrome và nút của QR Scan Log: operator bấm.

**Cần operator chuẩn bị:** một tab bán hàng `/ban-hang/<mã>` đang mở sẵn với QR Scan Log **đã kết nối RFID** (không mở trang bán hàng mới — có thể tạo đơn nháp production); đầu đọc cắm máy dev.

## Danh sách kiểm

| # | Làm | Kỳ vọng |
|---|---|---|
| Q1 | `chrome://extensions` → Reload thẻ "Circa GR ← Nextwaves" | Thẻ ghi **0.4.1**, không "Errors" đỏ. Popup giữ Production, tenant trống |
| Q2 | Phiếu Florita / Lumina **có** đơn Nextwaves chờ nhận → "Nhận hàng bằng RFID" | Khung Nextwaves "Sẵn sàng nhận hàng", kho đúng cửa hàng (không dòng "kho KHÁC"), **"Kiểm trước khi nhận: số lượng khớp phiếu — điền được N UID"** (N = số UID dự kiến). `kiem-truoc.js`: `phanConLai` null, `temBanGap` 0. Không xác nhận; xong popup → Xoá phiên |
| Q3 | Mở modal "Nhận hàng bằng cách quét" (từ màn quét của Q2, hoặc thẳng từ trang PO Nextwaves) khi QR Scan Log đang giữ đầu đọc | Khung "Đầu đọc…": tự bấm "Kết nối đầu đọc" (không được) → trong vài giây **"tab bán hàng (QR Scan Log) đang giữ — bấm “Lấy đầu đọc cho Nextwaves”"** + nút. Trước khi bấm: QR Scan Log vẫn kết nối (extension không tự Ngắt). Nếu tab bán hàng đã chuyển sang trang khác của POS: khung ghi "một tab POS (… đang ở trang khác trang Bán hàng) đang giữ" — vẫn bấm được |
| Q4 | Bấm **"Lấy đầu đọc cho Nextwaves"** | Tab bán hàng: QR Scan Log chuyển **đã ngắt** (một lần). Tab Nextwaves: **"Đầu đọc: đã kết nối"** trong vài giây (Chrome hỏi chọn cổng thì operator chọn đầu đọc). Không nút nào khác của Nextwaves bị bấm |
| Q5 | Bấm "Hủy" đóng modal | Khung nhắc **"sang tab bán hàng bấm “Kết nối RFID” (chọn cổng)"**. Operator làm theo → QR Scan Log kết nối lại, bán tiếp được |
| Q6 | Lúc modal mở (Q3) | Khung extension **không che** nút "Kết nối đầu đọc" của Nextwaves (finding UI-1 v0.4.0); khung không cao quá ~nửa màn |
| Q7 (nếu có) | SO tách giao có 2 đơn chờ nhận (ví dụ Lumina SO 38569460): mở phiên phiếu này, trong modal chọn phiếu gửi của **đơn kia** | Khung **đỏ "Đang mở nhầm phiếu gửi IT-…"**; chọn lại đúng phiếu gửi → hết đỏ. Không xác nhận |
| Q8 (nếu có) | Phiếu phần còn lại thật (POS tách phiếu sau khi bán gấp, món bán gấp đã quét QR) | Khung Nextwaves "Phiếu phần còn lại — đã nhận trước ở GR…", "N UID cần quét (đơn M, trừ K món đã bán gấp)", kiểm trước "điền được N UID"; `kiem-truoc.js` `phanConLai.phieuXong`. Không xác nhận |

**Đạt khi:** Q1–Q6 đạt. Q7 / Q8 cần dữ liệu đúng loại; chưa có thì chuyển sang lượt đầu máy POS (có `kiem-truoc.js` / `kiem-sau.js`).

**Gửi Claude một lần:** đạt / không đạt từng mục; kết quả `kiem-truoc.js` của Q2; ảnh chỉ khi một mục không đạt.
