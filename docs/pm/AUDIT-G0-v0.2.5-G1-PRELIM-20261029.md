# PM audit G0 v0.2.5 và review sơ bộ G1 v0.3.0 — 29/10/2026

## Quyết định

**G0 v0.2.5 ĐẠT ở phạm vi ứng viên nội bộ P2/P3.** Dev được giữ P2/P3 làm nền cho v0.3.0. **Không cài v0.2.5 cho operator, không dùng đơn staging, chưa staging done/merge.** Một lượt E2E thật vẫn chỉ chạy trên gói cuối theo `docs/pm/DECISION-ONE-STG-AUTO-FLOW-20261028.md`.

**G1 v0.3.0 CHƯA có kết luận.** Source đang thay đổi trong worktree chung và bộ đột biến chưa hoàn tất. Dừng mọi thao tác sửa song song cùng file; chốt một owner dev trước khi đóng gói/chạy gate. PM không sửa file v0.3.0 và chưa kiểm test 204/204 trên một commit cố định.

## 1. G0 — bằng chứng và giới hạn

| Mục | PM kiểm / nguồn |
|---|---|
| Commit và diff | `batch/v0.2-rfid` `02f2575` cố định; so `13170bc..02f2575`: runtime đổi đúng `src/pos/pos-content.js`, `src/popup/popup.js`, `src/manifest.json`; `src/background.js` không đổi. `git diff --check` sạch. |
| ZIP | `dist/circa-gr-nextwaves-v0.2.5.zip` SHA-256 **`792817B909171EE7A6DC4EA2B86D5BBFEAC396F81633593226177AA72FD63A64`** trùng báo cáo. PM so từng entry: **19/19 file ZIP = source tại `02f2575`**, không thiếu/thừa. |
| Node | PM chạy `npm test` trên checkout tách tại `02f2575`: **180/180 đạt**, 0 fail. |
| P2 source | Hook `COMPLETED` 2xx đúng GR gỡ khung/timer ngay; lượt đánh giá cũ bị chặn bằng epoch; GET thấy GR không còn nhận được thì không chờ `#all-receipt`; GR đang nhận thiếu anchor vẫn đi nhánh chặn W1. |
| P3 source | Popup kiểm phiên schema hiện hành/cùng môi trường/mã GR trước `grant:create`, không khớp hoặc lỗi đọc thì không cấp. Background không đổi khoá ghi. |
| Edge/đột biến/hiệu năng | **Dev báo:** 146/146 đột biến, Edge GR 103/103 ×3, đối chứng v0.2.4 100/103, Edge tổng 42/42; trace gói v0.2.5 tác vụ extension dài nhất 21,71 ms (<50 ms), layout dài ≥50 ms cũng có ở baseline không extension. PM xem kịch bản Edge §7: gửi PUT status qua MAIN hook, bỏ `#all-receipt`, đợi >10 s, kiểm không khung/log/PUT thêm; mở lại phiếu COMPLETED. PM **chưa tự chạy Edge/đột biến**. |
| Còn lại | Chưa kiểm v0.2.5 trên Chrome staging thật theo quyết định tiết kiệm đơn test; kiểm GR03887 COMPLETED chỉ đọc ở G2 bằng **gói cuối**. G0 không phải phép ghi hoặc merge. |

## 2. G1 — review đề xuất v0.3.0 và một finding phải đóng

Đề xuất `docs/dev/DE-XUAT-v0.3.0-TU-DONG-20261028.md` bám đúng hợp đồng PM: quyền tự động một lần gắn phiên/GR/PO/EPC; `received()` là điểm kích hoạt; claim W1 có lease; GET toàn GR trước một claimComplete; PUT COMPLETED đặt dấu trước khi gửi, kết quả không rõ không retry. Mã đề xuất không thay hợp đồng body W1. Duyệt hướng để dev tiếp tục sau khi ổn định owner; **chưa duyệt runtime G1**.

**P2.5 — trạng thái quyền sau khi tự động đã bị bỏ qua (phát hiện trên source v0.3.0 chưa commit):** background đã có `autoRun.skipped` và `auto:skip`, đúng tinh thần một lượt: sau lỗi QR/kế hoạch, refresh không tự chạy lại. Nhưng `autoGrants` còn lưu, popup `autoBlock` hiện “Tự động: ĐÃ CHO PHÉP 1 lần” chỉ vì grant còn tồn tại. Người vận hành sẽ hiểu nhầm rằng extension còn tự hoàn thành phiếu, trong khi `auto:status` đã từ chối vĩnh viễn lượt này. Trước G1, dev đồng bộ trạng thái UI với quyết định skip: khi skip, quyền auto phải bị thu hồi/vô hiệu và popup/Nextwaves hiển thị rõ **“Tự động đã dừng — xử lý theo luồng thủ công”**, không hiện “ĐÃ CHO PHÉP”. Không cho arm lại cùng phiên đã nhận để tự chạy lại. Test: QR lỗi → skip; QR sau đó bình thường + F5 vẫn 0 auto PUT; popup/Nextwaves không báo đang armed; chỉ quy trình thủ công mới có thể tiếp tục sau phép riêng.

**Đồng bộ proposal với source:** thêm `autoRun.skipped`, `auto:skip` và `grant_expired` vào tài liệu, vì chúng hiện có trong worktree nhưng chưa nằm trong đề xuất đã commit. Giữ nguyên trường hợp quyền hết hạn trước nhận: Nextwaves có thể đã nhận, POS chỉ đưa về kế hoạch thủ công và không tự ghi.

## 3. Điều phối worktree chung và gate tiếp theo

Dev report phát hiện hai phiên cùng sửa `background.js`, `pos-content.js`, `auto.test.js` trong cùng worktree khi làm v0.3.0. **Một owner duy nhất** tiếp tục nhánh này: ưu tiên phiên đã viết luồng chính và 204/204 test; phiên còn lại dừng ghi, chuyển những thay đổi `autoRun.skipped`/`auto:skip`/`grant_expired` để owner rà và nhận có chủ đích. Không xóa/sửa đè phần chưa rõ nguồn. Trước khi chạy đột biến và Edge, owner chốt diff, commit một SHA cố định, dọn `scripts/__pycache__/` khỏi phần giao và báo PM file nào do phiên kia thêm. PM audit G1 trên SHA/gói đó, không trên worktree đang đổi.

**Gate G1 còn:** test âm cho skip/expiry/UI quyền, 184 ca đột biến theo bộ cuối (báo số thật), Edge chuỗi tự động trên gói giải nén với server giả và trace, đối chứng/không ghi production, ZIP/SHA/source = gói, script nâng từ v0.2.4 cùng Extension ID. Nếu Edge hoặc contract khác fixture A1, dev báo PM trước khi dùng đơn staging. Operator **chưa cần cài hoặc cho phép lượt nhận mới**.
