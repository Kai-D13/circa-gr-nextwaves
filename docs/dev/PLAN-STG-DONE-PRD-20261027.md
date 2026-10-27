# Kế hoạch tới production — staging done → E2E staging → production Florita (dev đề xuất, 27/10/2026)

**Mục tiêu:** chốt tiến độ, không mở thêm phạm vi. Mỗi bước có người làm, ngày, điều kiện xong và **một** danh sách bằng chứng (xin một lần).

## 0. Hiện trạng (27/10, tối)

| Gate | Trạng thái |
|---|---|
| G0 (response / DOM thật), G1 (source / test), G2 (gói / Edge) | **Đạt** — v0.2.2 / v0.2.3 |
| G3a (UI chỉ đọc trên Chrome staging) | **Đạt** — v0.2.3 (`docs/pm/DECISION-G3a-v0.2.3-20261027.md`) |
| G3b (nhận hàng xong → POS tự về đúng phiếu) | Chưa — cần một lượt nhận thật |
| W1 (điền GR bằng extension) + HOÀN THÀNH trên v0.2 | Chưa — từng đạt trên v0.1.5 (GR03880, 26/10), chưa chạy lại với lối vào v0.2 |
| P2 (khung trang phiếu che cột "SL nhận" ở 1095px) | Mở — cần batch UI riêng |
| Merge `batch/v0.2-rfid` → `main` | Chưa |
| Production Florita (Đợt 2) | Chưa bắt đầu |

**Phiên sẵn có:** Chrome staging của operator đang có phiên **GR03887 `nw_ready`** (SOBD1594095 → PO13806459, 15 tem, kho CIRCA FLORITA staging), dùng ngay cho G3b / W1.

## 1. Đóng băng phạm vi tới khi production Go

- Chỉ làm: G3b / W1 / HOÀN THÀNH staging, P2, merge, Đợt 2 (O1 + cấu hình Florita + T1-PRD / W1-PRD).
- Không thêm tính năng. Lỗi mới chỉ sửa nếu **chặn** một gate; còn lại ghi backlog.
- Bằng chứng mỗi gate gom một lần (danh sách bên dưới). Không xin ảnh UI Nextwaves trừ khi có rủi ro cụ thể.

## 2. Giai đoạn A — STAGING DONE (mục tiêu: thứ Sáu 30/10)

| Bước | Ngày | Người | Việc | Xong khi |
|---|---|---|---|---|
| A0 | 28/10 sáng | PM, operator | PM duyệt plan này. Operator **cho phép một lượt** nhận + điền + HOÀN THÀNH đúng **GR03887 / PO13806459 / SOBD1594095** | Có phép bằng chữ |
| A1 | 28/10 | operator + dev | **E2E staging đầy đủ trên v0.2.3:** (1) bật Net Capture tab POS và tab Nextwaves; (2) trên màn quét GR03887, đặt 15 tem lên đầu đọc, bấm "Xác nhận nhận hàng"; (3) **G3b:** POS tự về GR03887, khung lập kế hoạch; (4) popup cấp phép GR03887 → bấm "Điền" trong khung (**W1**); (5) dược sĩ bấm **HOÀN THÀNH**; (6) export storage | Dev báo cáo trong ngày: G3b, kế hoạch (mã #), số PUT = kế hoạch, GR sau điền / sau HOÀN THÀNH khớp UID Nextwaves |
| A2 | 28/10 → 29/10 | dev → PM | **P2:** 28/10 dev gửi spec ngắn (phương án khuyên: khung trên trang phiếu **nằm trong luồng trang** phía trên bảng sản phẩm, như vùng thông báo F4 — không che gì, không tự ẩn cảnh báo). PM duyệt. 29/10 dev build **v0.2.4** + test + Edge; PM audit | PM đạt source / gói / Edge v0.2.4 |
| A3 | 29/10 → 30/10 | operator | Cài v0.2.4, xem **một** trang phiếu đang nhận ở ~1095px: cột "SL nhận" thao tác được, khung đọc được, không che HỦY / HOÀN THÀNH (chỉ đọc) | Một ảnh |
| A4 | 30/10 | PM, dev | **Gate "Staging done":** A1 + A3 đạt → merge `batch/v0.2-rfid` (v0.2.4) vào `main`; hướng dẫn cài cố định một thư mục | `main` = v0.2.4 |

**Điều kiện Staging done:** G3b + W1 + HOÀN THÀNH đạt trên dữ liệu thật; P2 đạt; merge xong.

**Nếu A1 hỏng:** dev sửa trong ngày (v0.2.4 gộp với P2), chạy lại A1 trên SO staging khác (operator tạo SO mới, giao cửa hàng 2222). Trễ tối đa 1–2 ngày.

## 3. Giai đoạn B — PRODUCTION FLORITA (build xong: thứ Tư 4/11; Go: thứ Sáu 6/11)

| Bước | Ngày | Người | Việc | Xong khi |
|---|---|---|---|---|
| B0 | trước 29/10 | operator | Thông tin máy Florita **một lần**: phiên bản Chrome + hồ sơ dùng POS; độ phân giải màn hình; extension khác đang chạy (Nextwaves `circa-rfid` tự kết nối đầu đọc? `circa-qr-scan-log`?); xác nhận cửa hàng `c476efb2…`, kho `eb5e2b4f…`, tenant Nextwaves `circa`; **một SO thật sắp giao** cho Florita (ngày dự kiến) | Đủ thông tin |
| B1 | 29 → 30/10 | dev → PM | **Spec Đợt 2:** (a) O1 — mất phiên sau khi Nextwaves đã nhận thì khôi phục được (tìm đơn đã nhận theo SO → biên nhận → kế hoạch như thường); (b) cấu hình PRD chỉ Florita, `writeEnabled=false`; (c) đầu đọc — phát hiện / hướng dẫn khi extension khác giữ cổng; (d) mã QR POS thêm sau HOÀN THÀNH — PM / nghiệp vụ chốt cách xử lý; (e) hướng dẫn cài / gỡ / quay lui tại Florita | PM duyệt spec |
| B2 | 2 → 3/11 | dev → PM | Build **v0.3.0**: O1 + cấu hình Florita (chỉ đọc) + test + đột biến + Edge (trang dựng theo DOM production nếu khác staging). PM audit | PM đạt |
| B3 | 4/11 | operator (+ dev quan sát) | **T1-PRD chỉ đọc tại Florita:** cài v0.3.0, mở danh sách GR thật, bấm nút một GR SO thật → Nextwaves production mở đúng đơn, khớp số lượng. **Không nhận** | Ảnh danh sách + khung Nextwaves khớp đơn; Net Capture |
| B4 | 5/11 | PM → operator + dev | **W1-PRD:** v0.3.1 bật `writeEnabled` **chỉ Florita**. Một lượt nhận thật có phép operator, dev quan sát trực tiếp: nhận → về POS → điền → HOÀN THÀNH | GR production đúng; PM gate |
| B5 | 6/11 | PM | **Go production Florita** + theo dõi 3 ngày đầu (dev xem nhật ký phiên mỗi ngày) | Go |

## 4. Phụ thuộc và rủi ro (chỉ những gì làm trễ)

| Rủi ro | Ảnh hưởng | Cách giảm |
|---|---|---|
| Không có đủ 15 tem thật của SOBD1594095 cho A1 | Trễ A1 | Operator xác nhận tem trong A0. Nếu không có, tạo SO staging mới có tem |
| SO thật Florita chưa có lịch giao | Trễ B3 / B4 | Hỏi lịch ngay trong B0; B3 chỉ cần một GR đang chờ nhận |
| Extension khác trên máy Florita giữ cổng đầu đọc | B4 hỏng tại quầy | Thông tin B0 + mục (c) của spec B1 |
| PM duyệt chậm hơn trong ngày | Dời mốc tương ứng | Mỗi báo cáo dev có sẵn DIFF / gói / số đo để PM audit trong ngày |
| Phiên GR03887 bị xoá (quá 24 giờ không cập nhật) trước A1 | Phải bấm lại | Bấm lại "Nhận hàng bằng RFID" (chỉ GET), không mất gì |

## 5. Việc cần ngay (28/10)

1. **PM:** duyệt plan; duyệt hướng P2.
2. **Operator:**
   - cho phép lượt A1 trên GR03887 (nhận + điền + HOÀN THÀNH), xác nhận có 15 tem;
   - gửi thông tin B0.
3. **Dev:**
   - viết hướng dẫn từng bước A1 (một trang, kèm danh sách bằng chứng);
   - spec P2;
   - bắt đầu spec Đợt 2.
