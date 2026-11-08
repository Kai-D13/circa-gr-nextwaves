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
| Q2 | Phiếu Florita / Lumina **có** đơn Nextwaves chờ nhận → "Nhận hàng bằng RFID" | Khung Nextwaves "Sẵn sàng nhận hàng", kho đúng cửa hàng (không dòng "kho KHÁC"), **"Kiểm trước khi nhận: số lượng khớp phiếu — điền được N UID"** (N = số UID dự kiến). `kiem-truoc.js` không bắt buộc ở máy dev (Claude đọc khung; khung không có dòng "Phiếu phần còn lại" ⇔ `phanConLai` null). Không xác nhận; xong Claude huỷ phiên trên khung POS |
| Q3 | Mở modal "Nhận hàng bằng cách quét" (từ màn quét của Q2, hoặc thẳng từ trang PO Nextwaves) khi QR Scan Log đang giữ đầu đọc | Khung "Đầu đọc…": tự bấm "Kết nối đầu đọc" (không được) → trong vài giây **"tab bán hàng (QR Scan Log) đang giữ — bấm “Lấy đầu đọc cho Nextwaves”"** + nút. Trước khi bấm: QR Scan Log vẫn kết nối (extension không tự Ngắt). Nếu tab bán hàng đã chuyển sang trang khác của POS: khung ghi "một tab POS (… đang ở trang khác trang Bán hàng) đang giữ" — vẫn bấm được |
| Q4 | Bấm **"Lấy đầu đọc cho Nextwaves"** | Tab bán hàng: QR Scan Log chuyển **đã ngắt** (một lần). Tab Nextwaves: **"Đầu đọc: đã kết nối"** trong vài giây (Chrome hỏi chọn cổng thì operator chọn đầu đọc). Không nút nào khác của Nextwaves bị bấm |
| Q5 | Bấm "Hủy" đóng modal | Khung nhắc **"sang tab bán hàng bấm “Kết nối RFID” (chọn cổng)"**. Operator làm theo → QR Scan Log kết nối lại, bán tiếp được |
| Q6 | Lúc modal mở (Q3) | Khung extension **không che** nút "Kết nối đầu đọc" của Nextwaves (finding UI-1 v0.4.0); khung không cao quá ~nửa màn |
| Q7 (nếu có) | SO tách giao có 2 đơn chờ nhận (ví dụ Lumina SO 38569460): mở phiên phiếu này, trong modal chọn phiếu gửi của **đơn kia** | Khung **đỏ "Đang mở nhầm phiếu gửi IT-…"**; chọn lại đúng phiếu gửi → hết đỏ. Không xác nhận |
| Q8 (nếu có) | Phiếu phần còn lại thật (POS tách phiếu sau khi bán gấp, món bán gấp đã quét QR) | Khung Nextwaves "Phiếu phần còn lại — đã nhận trước ở GR…", "N UID cần quét (đơn M, trừ K món đã bán gấp)", kiểm trước "điền được N UID"; `kiem-truoc.js` `phanConLai.phieuXong`. Không xác nhận |

**Đạt khi:** Q1–Q6 đạt. Q7 / Q8 cần dữ liệu đúng loại; chưa có thì chuyển sang lượt đầu máy POS (có `kiem-truoc.js` / `kiem-sau.js`).

**Gửi Claude một lần:** đạt / không đạt từng mục; ảnh chỉ khi một mục không đạt.

## Kết quả lượt 1 (08/11 tối, Claude qua Claude in Chrome, chỉ đọc)

| # | Kết quả |
|---|---|
| Q1 | **Đạt.** Thẻ 0.4.1, ID `bkpbpknngkmmaclhkpnnlblofcaihadd`, tải từ `C:\circa-gr-nextwaves-v0.2.3`, không "Errors". Chạy đúng production (nút trên danh sách POS `pos.v2.circa.vn`, đọc phiếu production). Thư mục = ZIP `BF5A9AD9` (`diff -r` không khác) |
| Thêm | POS Florita có 2 phiếu Chờ nhận, cả hai dừng đúng, không tạo phiên: **GR84724** (CO01975079) "Phiếu này không đi từ SO thuocsi (PO không có mã giao)"; **GR70770** (PO00092460, 11/07) "PO có nhiều mã giao thuocsi — chưa hỗ trợ" |
| Ghi chú | Tab POS mở **trước** một lần nạp lại extension hiện "Lỗi extension — Extension context invalidated"; F5 là hết (hướng dẫn §0 bước 4 đã ghi F5 sau khi cài). Không phải lỗi v0.4.1 |
| Q2–Q8 | **Chưa chạy được — không có dữ liệu.** Nextwaves production 08/11 tối: 14/14 đơn "Đã nhận" (gồm PO-2026-000009/10/11 nhận trong ngày), không đơn nào chờ nhận → không có phiếu để mở phiên (Q2) và không mở được modal "Nhận hàng bằng cách quét" (Q3–Q6) |

**Lượt 2:** khi có đơn Nextwaves chờ nhận (giao mới + phiếu POS từ "Nhập SO thuocsi"), operator báo **trước khi dược sĩ nhận** trên máy POS. Claude chạy Q2–Q6 trên máy dev (~10 phút, không xác nhận), xoá phiên, rồi dược sĩ nhận như thường trên máy POS (v0.4.0).
