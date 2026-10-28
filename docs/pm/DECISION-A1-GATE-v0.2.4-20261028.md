# PM quyết định gate A1 — v0.2.4 / GR03887 (28/10/2026)

## Kết luận

**GO A1 có giám sát trên staging, đúng một lượt GR03887 / PO13806459 / SOBD1594095-F**, theo `docs/dev/RUNBOOK-A1-GR03887-20261027.md` trên extension v0.2.4, gói SHA-256 `0BB73E2D8297840CD1796D5510BB5350302A6212FCF8386B16E9A66188C03D57`. Phạm vi lượt đã được operator xác nhận trong `docs/dev/A1-S0-KET-QUA-v0.2.4-20261028.md` §4: có đúng 15 tem và cho phép một lượt nhận → điền → HOÀN THÀNH. Đây là quyết định mở gate PM; không thay thế thao tác và trách nhiệm kiểm tra tại máy của operator/dược sĩ.

**§0 đạt theo ngoại lệ operator chấp nhận.** Theo báo cáo dev từ ảnh/chữ operator trên Chrome staging: nâng cùng thư mục/Extension ID, v0.2.4, STG, 0 cấp phép, phiên GR03887 `nw_ready` còn nguyên, Nextwaves 0/15, một khung trong luồng trang GR, đoạn kiểm DOM tại `vw=1216` trả `ĐẠT` và không điều khiển nào bị che. PM chưa trực tiếp xem ảnh gốc trong lượt audit này. Chưa có ảnh/đoạn kiểm trên Chrome thật tại 1050–1150px; operator đã quyết không chạy lại mục đó. Bài Edge ở 1095×756 trên DOM/CSS thật đạt, là bằng chứng bổ trợ, không được gọi là kiểm Chrome thật ở 1095px. Phiên GR03878 `waiting_nw` khác SO, không có cấp phép và không chặn A1; để yên.

**Hiệu năng P2 chưa đóng cho staging done.** Lượt Edge `ui/panel.js` 75,18 ms chưa truy được trace gốc, nên không thể gán nguyên nhân chắc chắn. Tám lượt sau không tái hiện; ba lượt trace có tên dài nhất 10,47 ms, baseline trang không extension có layout 60–78 ms. Báo cáo `docs/dev/PERF-75MS-v0.2.4-20261028.md` đủ để cho A1 một lượt có giám sát, không đủ để tuyên bố tiêu chí mọi tác vụ extension <50 ms luôn đạt. Dev giữ trace có tên và báo lại nếu tái hiện; PM xét riêng trước staging done.

## Hợp đồng vận hành A1

1. **Ngay trước khi đặt tem:** xác nhận lại v0.2.4/STG/đúng phiên và phiếu; POS GR03887 còn Chờ nhận, Nextwaves đúng PO/SO/kho, đã nhận 0/15. Bật capture ở cả hai tab và thấy một GET mới trên mỗi tab. Nếu phiên/hàng/trạng thái/capture khác dự kiến thì dừng trước nhận.
2. **Nhận:** dược sĩ quét đúng 15 EPC theo năm dòng `1/1, 3/3, 3/3, 4/4, 4/4`, còn lại 0, ngoài phiếu 0; bấm “Xác nhận nhận hàng” một lần. Không chọn đóng đơn khi thiếu và không thử lại khi lỗi/không rõ kết quả.
3. **Điểm dừng 1:** POS tự về GR03887 và khung lập kế hoạch năm lô, tổng 15 UID, không điểm chặn. Operator **chưa cấp phép, chưa bấm Điền**. Dev đối chiếu lô, quy đổi, UID, mã kế hoạch với runbook và báo rõ đạt/chặn rồi mới đi chặng 2. Nếu POS không tra được UID sau khi Nextwaves đã nhận, giữ nguyên chứng cứ, không ghi POS và không nhận lại Nextwaves; xử lý theo runbook §4.
4. **Điền:** chỉ khi điểm dừng 1 đạt, operator cấp phép đúng GR03887 một lần và bấm Điền một lần. Sau đó đọc lại năm lô, mỗi lô nhận 1, tổng 15 UID đúng kế hoạch. Lỗi hoặc ghi một phần thì dừng, không cấp phép hay bấm lại.
5. **Điểm dừng 2 và HOÀN THÀNH:** khi dữ liệu POS đã được đối chiếu đủ, dược sĩ tự bấm HOÀN THÀNH một lần. Giữ capture tới GET GR sau HOÀN THÀNH, xuất nhật ký phiên trong hạn. Dev giao bằng chứng request/response và trạng thái theo runbook §5; PM mới quyết A1 đạt hay chưa.

Không cài, Reload hay đổi extension từ trước chặng nhận tới sau HOÀN THÀNH. Nếu capture không có response body, báo đúng giới hạn; không suy diễn body từ HTTP 200. A1 không bao gồm thao tác ghi production.

## Yêu cầu mới sau A1

Đề xuất “xác nhận nhận hàng trên Nextwaves thì POS tự điền và tự HOÀN THÀNH” là thay đổi nghiệp vụ riêng. A1 giữ quyết định hiện hành trong `agent.md`: cấp phép + bấm Điền, rồi dược sĩ bấm HOÀN THÀNH. Dev được khảo sát chỉ đọc và đề xuất spec sau khi có kết quả A1; chưa đổi runtime theo yêu cầu này. Spec phải chốt riêng điều kiện 15 UID/5 lô, thời điểm và quyền cho phép ghi, xử lý ghi một phần/mất phiên, kiểm sau ghi, hành vi khi POS tự thêm QR sau HOÀN THÀNH, công tắc cửa hàng/môi trường, rollback và gate STG/PRD. Không gộp thay đổi này vào bản A1 hoặc lấy lượt A1 làm phép production.

## Mốc tiếp theo

- **Operator + dev:** chạy đúng một lượt A1 theo hai điểm dừng, giao báo cáo có nguồn bằng chứng rõ; nếu dừng giữa chừng thì giữ trạng thái và báo PM, không tự dùng lượt khác.
- **PM:** audit request/response, kế hoạch, từng PUT/GET và GR cuối; nếu A1 đạt, xem gate staging done/merge cùng finding hiệu năng và UI còn mở.
- **Dev song song:** discovery O1, QR tự thêm sau HOÀN THÀNH, reader Florita chỉ đọc; production Florita vẫn cần spec, T1-PRD chỉ đọc, gate W1-PRD và phép operator riêng. Lịch chỉ là mục tiêu theo gate.
