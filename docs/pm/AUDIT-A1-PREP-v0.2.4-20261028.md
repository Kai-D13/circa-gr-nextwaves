# PM audit chuẩn bị A1 trên v0.2.4 — 28/10/2026

Nguồn: `docs/dev/A1-CHUAN-BI-v0.2.4-20261028.md`, runbook A1 thêm §0 trên `main` `82b215e`, nhánh `batch/v0.2-rfid` `b90f6be`, thư mục giao `C:\circa-gr-nextwaves-release`. Runtime/ZIP vẫn là `28d1f9c`/`0BB73E2D` đã đạt audit source/gói; `b90f6be` chỉ đổi script và bài kiểm.

## Kết luận

**ĐẠT gate chuẩn bị để operator nâng v0.2.3 → v0.2.4 cùng Extension ID và kiểm staging chỉ đọc (§0b–§0d).** Chưa cho nhận hàng, cấp phép điền, PUT, HOÀN THÀNH, merge hay production. PM sẽ xem một bộ bằng chứng sau nâng trước khi chốt UI thật/A1.

PM xác nhận **nút “Mở tab Nextwaves” có thể dùng để giữ phiên**: nhánh `session:reopenNw` trong `background.js` chỉ focus/mở tab rồi `updateSession` làm mới `updatedAt`; không gọi API ghi POS/Nextwaves. Nếu phiên GR03887 còn ở popup, operator có thể bấm nút đó **ngay trên v0.2.3 trước khi nâng** để không phải chạy đua với mốc ~20:24 ngày 28/10. Đọc lại popup để xác nhận giờ cập nhật mới. Nếu phiên đã mất, dừng và báo dev/PM, không tự tạo lại. Mốc 20:00 trong runbook là biên an toàn cho phiên cũ, không phải hạn sau khi đã làm mới `updatedAt`.

## PM đã kiểm

- Hash gói giao: v0.2.4 `0BB73E2D…`, v0.2.3 `40236D67…`; script nâng và preflight khớp SHA trong `SHA256SUMS.txt`. Script nâng bản giao trùng source sau chuẩn hóa BOM/CRLF; preflight bản giao trùng source byte-for-byte.
- PM chạy **`nang-cap-v0.2.4.ps1 -Check`** trên `C:\circa-gr-nextwaves-v0.2.3`: hai ZIP đúng hash, thư mục đích đúng v0.2.3 **19/19 file**, kết thúc “KIỂM ĐẠT”, chưa đổi file. PM **không chạy lệnh nâng thật**.
- Raw log dev sau khi sửa dọn Edge/cổng CDP: rehearsal nâng bằng script giao **17/17**, cùng ID và giữ phiên `nw_ready` schema 1/cấu hình STG; Edge trang phiếu v0.2.4 **95/95 × 5**, đối chứng v0.2.3 hỏng **52/92**, Edge tổng v0.2.4 **42/42**, mỗi lượt ghi `leftover_edge=0`. Bản cũ từng có một đối chứng nối nhầm Edge v0.2.4, dev đã loại lượt đó; không dùng làm bằng chứng. PM chưa tự chạy Edge mới, chưa thấy UI v0.2.4 trên Chrome staging thật.
- `preflight-gr-page.js` chỉ đọc DOM, cuộn và dùng `elementFromPoint`; không bấm nút hay gọi mạng. Kết quả trên trang dựng lại phân biệt v0.2.4 “ĐẠT” và v0.2.3 “XEM LẠI”. Kết quả trên trang thật còn chờ operator.

## Finding mở

**P2 hiệu năng:** Một lượt sau khi Edge cập nhật đo tác vụ `ui/panel.js` **75,18 ms**, vượt ngưỡng PM đã chốt **không tác vụ extension ≥50 ms**. Lượt đó 94/95 và đã được báo rõ; năm lượt sau dài nhất 14,32–16,62 ms. Chưa biết 75,18 ms là lúc nạp script, callback hay nhiễu công cụ; không được coi như chưa xảy ra. **Không chặn nâng để kiểm chỉ đọc**, nhưng dev phải làm một phép đo có gắn tên hàm/pha nạp trên hồ sơ sạch và so với baseline không extension; nếu tái hiện do extension thì sửa/đóng gói lại trước khi chốt staging done. PM sẽ quyết mức chấp nhận cho A1 có giám sát sau UI thật và chẩn đoán ngắn này; không yêu cầu operator đo hiệu năng.

**P3 tài liệu:** `docs/dev/A1-CHUAN-BI-v0.2.4-20261028.md` §6 ghi đường dẫn `C:circa-...` thiếu `\` trong hai ô bảng; sửa thành `C:\circa-...`. Runbook §0b bước 1 nói nếu “Tải từ” khác thì operator tự thay `-Target` trong lệnh hardcode. Để tránh nâng sai thư mục, nếu đường dẫn không đúng **chính xác** `C:\circa-gr-nextwaves-v0.2.3`, operator dừng và dev đưa lệnh `-Target` đã điền cụ thể; không tự đoán. Sửa tài liệu không đổi runtime/ZIP.

## Việc tiếp theo và chủ sở hữu

1. **Operator, ngay khi thuận tiện:** nếu popup v0.2.3 còn đúng một phiên GR03887 `nw_ready`, mở trang GR03887 và bấm **“Mở tab Nextwaves” một lần** để làm mới giờ phiên; kiểm giờ mới trong popup. Không đặt tem, không bấm “Xác nhận nhận hàng”, không cấp phép điền.
2. **Operator + dev theo runbook §0b–§0d:** ghi lại ID/đường dẫn/version/popup trước nâng; nếu đúng đường dẫn, chạy `-Check` rồi lệnh nâng cùng thư mục, Reload extension, F5 hai tab. Kiểm popup/phiên/cửa hàng/PO/SO/kho/0 nhận và khung trên GR03887 ~1095px. Gửi **một bộ**: ảnh trước/sau, dòng service worker đã lọc, dòng `KET_QUA`, một ảnh trang phiếu. Bất kỳ mục sai thì dừng trước nhận; dev không tự tạo lại phiên.
3. **PM:** xem bộ bằng chứng §0. Chỉ khi UI thật đạt và finding hiệu năng được phân loại mới quyết gate A1 có giám sát. Operator sau đó mới xác nhận đủ 15 tem vật lý và cho phép riêng một lượt GR03887/PO13806459/SOBD1594095-F. Phép nâng/kiểm chỉ đọc không phải phép nhận/ghi.
4. **Dev song song:** sửa hai lỗi tài liệu P3; chẩn đoán duy nhất lượt 75,18 ms theo pha/hàm, không chạy thêm stress vô mục đích; bắt đầu discovery O1, QR POS sau HOÀN THÀNH và xung đột reader Florita **chỉ đọc**, báo spec/gate riêng. Không đụng extension/profile A1 khi làm Đợt 2.

Sau A1 trọn luồng và UI P2 đạt mới xét staging done/merge. Production Florita vẫn phụ thuộc O1/QR/reader, T1-PRD chỉ đọc và phép W1-PRD riêng; các ngày trong plan là mục tiêu có điều kiện.
