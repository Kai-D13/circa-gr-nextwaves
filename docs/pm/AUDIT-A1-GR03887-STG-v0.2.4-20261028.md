# PM audit A1 GR03887 — staging v0.2.4 (28/10/2026)

## Quyết định

**A1 đạt gate chức năng E2E trên staging, có giới hạn nguồn Nextwaves.** Lượt GR03887 / PO13806459 / SOBD1594095-F đã đi qua nhận 15 EPC → kế hoạch #EF0E020C → ghi 5 lô / 15 UID → POS `COMPLETED`. Không yêu cầu chạy lại một lượt ghi chỉ để lấy thêm capture Nextwaves.

**Chưa chốt “staging done”, chưa cho merge `batch/v0.2-rfid` vào `main`.** Trên phiếu đã COMPLETED, v0.2.4 hiện khung đỏ “Giao diện phiếu nhận đã đổi” sai ngữ cảnh. Đây là P2 chặn gate phát hành; dev sửa và giao gói mới v0.2.5 theo §2, PM audit lại trước merge. Ngưỡng hiệu năng cũng phải được kiểm trên gói cuối. Hai quyết định này tách rõ việc dữ liệu A1 đã đúng với chất lượng bản sẽ phát hành.

Nguồn: `main` `675abf8` (`docs/dev/A1-KET-QUA-GR03887-20261028.md`), nhánh `batch/v0.2-rfid` `13170bc` (9 mẫu thật + `tests/a1-real.test.js`), 8 file gốc trong `C:\Users\Administrator\Downloads` chỉ đọc tại máy. PM không sửa runtime và không chạy thao tác ghi nào.

## 1. Bằng chứng PM kiểm độc lập

| Mục | Kết quả |
|---|---|
| Nguồn gốc | SHA-256 của 3 Net Capture POS, export storage và 4 ảnh **khớp đủ 8/8** với §8 báo cáo dev. File gốc có credential chỉ ở máy operator; PM không đưa nội dung/header vào repo hoặc chat. |
| Test | PM chạy `npm test` trong checkout tách tại `13170bc`: **167/167 đạt**, gồm 7 test A1 thật. `src/` ở `13170bc` **không đổi** so với runtime đã audit `28d1f9c`/gói `0BB73E2D`. |
| Nhận Nextwaves | Ảnh màn quét hiện “Đã quét đủ”, 15/15. Export storage gốc có đúng một phiên GR03887 `done`, `receive_scan` 200, `nwResult.units` 15, một biên nhận mới; fixture đối chiếu 15 EPC với runbook và 15 UID duy nhất. **Không có capture tab Nextwaves** nên PM không tuyên bố đã thấy request/body `receive-scan` trực tiếp. |
| POS trước ghi | Capture POS đầu có **15 GET tra QR, 15 UID riêng, đều 200**. Ảnh khung điểm dừng 1 ghi kế hoạch #EF0E020C, 5 lô/15 UID, chưa có cấp phép. Test tính lại kế hoạch từ GR + UID + tra QR ra đúng hash và body 5 PUT. |
| W1 | Trong capture POS 21:51 có **5 PUT detail HTTP 200**, đúng một GR; PM đối chiếu **body từng PUT với mẫu: 5/5 trùng**. Test kiểm GET sau ghi: 5 lô mỗi lô nhận 1, 15 UID đúng chi tiết, GR `RECEIVING`. Capture đầu không có PUT tới GR03879; capture cuối lặp lại 5 PUT của lượt trước trong bộ đệm, không phải lượt ghi thứ hai. |
| HOÀN THÀNH | Capture cuối có đúng **một** PUT `/status/COMPLETED` 200 lúc 21:54:25; GET sau trả `COMPLETED`, phần `items` của response gốc **trùng mẫu**; ảnh cho thấy 5 lô nhận 1. Dev/ảnh cho biết dược sĩ bấm nút. Trace ghi initiator ở `pos-hook.js` vì extension bọc XHR; mã hook chỉ gọi `send.apply`, mã extension không có lời gọi ghi `/status/COMPLETED`. Vì vậy quy kết “trang POS gửi” dựa trên thao tác operator + mã, không riêng trường initiator. |
| Sau hoàn thành | Ảnh gốc cho thấy khung đỏ sai; log có `ui_anchor_missing`. Trang COMPLETED không có `#all-receipt` theo đoạn kiểm chỉ đọc dev ghi; mã `grPageAnchor` cần anchor đó, sau 10 giây panel báo `missing`. |

Lượt có ba sai lệch runbook: phiên cũ bị xoá rồi tạo lại lúc 21:32:57; operator bấm nhầm GR03879 nhưng không tạo ghi cho phiếu đó; không bật capture tab Nextwaves. Báo cáo dev có ghi rõ các sai lệch. A1 vẫn kiểm được luồng tạo phiên mới và dữ liệu POS; **không** dùng lượt này làm bằng chứng rằng quy trình capture hai tab đã được tuân thủ.

## 2. Finding và phạm vi sửa được duyệt

### P2 — Khung đỏ sai trên GR không còn nhận được (chặn staging done)

Cho dev làm **v0.2.5** nhỏ, chỉ xử lý vòng đời khung khi phiếu chuyển khỏi `WAITING_TO_RECEIVE`/`RECEIVING`:

1. Khi hook báo `COMPLETED` 2xx, dừng ngay khung/observer/timer đang chờ anchor và bỏ thông báo lỗi UI cũ; sau đó GET lại phiếu như hiện tại. GET phiếu là nguồn xác nhận trạng thái cuối.
2. Khi GET cho thấy phiếu **không còn nhận được** (`!isReceivable(gr)`), ẩn khung và huỷ chờ anchor, kể cả khi phiên `done` và trang không còn `#all-receipt`. Có thể không hiện khung sau hoàn thành; trạng thái của chính POS đã đủ. Không gọi `onMissing`/`ui_anchor_missing` cho trang kết thúc bình thường.
3. Nếu phiên `done` nhưng GET vẫn cho thấy phiếu còn nhận được, không coi phiên là bằng chứng POS đã hoàn thành; giữ nhánh cảnh báo/đọc lại, không mở nút ghi. Với phiếu **đang nhận** mà anchor thật sự mất hoặc đổi mã GR, vẫn báo lỗi và khoá W1 như v0.2.4. Không làm yếu guard đúng trang/đúng phiếu.
4. Chuyển route hoặc response cũ về muộn không được vẽ lại khung của GR đã rời trang. Không thêm lời gọi ghi, thay đổi body PUT, quy đổi, khoá môi trường/cửa hàng, hay tự HOÀN THÀNH.

**Gate P2:** test viết trước tái hiện v0.2.4 rồi đạt trên v0.2.5: COMPLETED không có anchor và đợi quá 10 giây không có khung đỏ/log `ui_anchor_missing` mới; trạng thái chờ nhận thiếu anchor vẫn báo lỗi + 0 PUT; event COMPLETED lỗi HTTP không bị coi thành công; SPA đổi trang không có view cũ. Edge trên gói v0.2.5 kiểm trang phiếu đang nhận và COMPLETED. Dev kiểm chỉ đọc GR03887 đã hoàn thành trên Chrome staging thật sau khi cài gói mới cùng Extension ID: không khung đỏ; không cần lượt nhận/điền mới. Giao version/ZIP/SHA-256 mới, diff, log test và trace hiệu năng trên gói cuối.

### P3 — Cấp phép gõ nhầm mã GR (duyệt làm cùng v0.2.5, không tự nó chặn staging done)

Popup hiện cho tạo grant `STG:GR3887` dù không có phiên tương ứng. Khoá chính xác đã chặn grant này khỏi GR03887, nên **không có ghi sai**. Dev thêm cảnh báo ở popup **trước khi gửi `grant:create`**: đọc danh sách phiên hiện hành, đối chiếu nguyên mã GR và môi trường; nếu không có phiên còn hoạt động khớp chính xác, báo “Mã phiếu không khớp phiên đang có”, giữ nguyên ô nhập và **không tạo grant**. Nếu không đọc được phiên, cũng không tạo grant. Mã khớp thì giữ luồng một lần/30 phút như cũ. Không tự sửa mã người dùng nhập và không thay khoá cấp phép trong background ở lô UI này.

**Gate P3:** GR3887 với phiên GR03887 → cảnh báo, 0 grant; GR03887 đúng STG → một grant; mã đúng nhưng chỉ có phiên PRD/phiên `done` → 0 grant; lỗi đọc phiên → 0 grant. Bài kiểm không gọi POS/Nextwaves thật.

Không gộp xử lý “Extension context invalidated” hoặc `requestAnimationFrame` vào gói này nếu chưa có tái hiện/trace cho thấy cần thiết. Lượt Edge 75,18 ms cũ không có trace gốc; tám lượt sau không tái hiện. Trên gói cuối, dev chạy trace có tên và baseline cho nhánh thường + nhánh thiếu anchor; nếu tác vụ extension ≥50 ms tái hiện thì sửa và phát hành hash mới trước khi xin staging done. Không xoá finding chỉ vì lần chạy sau xanh.

## 3. Gate merge / production

**Staging done + merge** chỉ khi PM nhận v0.2.5, kiểm source/gói/test, xác nhận khung đỏ đã hết trên GR03887 COMPLETED thật, guard active GR còn chặt, và hiệu năng gói cuối đạt phép đo có tên. Dev cập nhật runbook: trong một lượt không bấm “Xoá”/“Huỷ phiên” và không bấm nút của GR khác; capture Nextwaves nếu có thể, nhưng không chạy lại A1 chỉ để bù ảnh/capture. Sau PM chốt mới merge `batch/v0.2-rfid` vào `main`, kiểm tree/runtime trên `main` khớp gói đã duyệt.

**Trước production Florita:**

1. **O1:** kiểm API tìm lại đơn đã nhận theo SO trên Nextwaves thật (chỉ GET), quyết khôi phục phiên an toàn hoặc SOP nhập tay được operator chấp nhận cho trường hợp sau nhận/chưa điền và PUT một phần. Không suy parser từ bundle web.
2. **QR sau HOÀN THÀNH:** mẫu A1 củng cố rằng mã POS thêm là mã lô, trùng giữa hai GR cùng lô và khác UID RFID. Tra QR chỉ đọc và xác nhận với nghiệp vụ POS liệu mã này ảnh hưởng tồn/tem/bán hàng thế nào; không dùng mã trên GR COMPLETED để kiểm UID.
3. **Reader Florita:** kiểm máy/hồ sơ/extension bán hàng và hai chiều tranh cổng Web Serial; có thao tác ngắt/kết nối lại rõ trong runbook.
4. **Yêu cầu tự điền + tự HOÀN THÀNH:** là thay đổi quyết định 24/10 trong `agent.md`, **chưa thuộc v0.2.5**. PM đề xuất hai gate riêng: tự điền sau Nextwaves (đúng 100% UID/lô/quy đổi và quyền ghi được operator cấp theo lượt); tự HOÀN THÀNH chỉ sau GET kiểm toàn bộ GR và quy tắc QR lô được nghiệp vụ chốt. Cần operator quyết đây là điều kiện bắt buộc cho pilot production hay lô sau. Nếu bắt buộc cho pilot, chưa Go production với luồng hiện tại. Mọi lỗi/không rõ kết quả dừng, không tự retry lệnh HOÀN THÀNH.
5. **PRD:** allowlist Florita, T1-PRD chỉ đọc trên đơn thật, rollback/cách xử lý GR dở và người trực; W1-PRD/HOÀN THÀNH có phép operator riêng sau PM gate. Ngày dự kiến trong plan không tự biến thành Go.

PM giữ `docs/pm/*` và `state.md`; dev commit nguyên văn tài liệu PM, thực hiện batch runtime sau quyết định này và gửi diff/test/gói để audit lại.
