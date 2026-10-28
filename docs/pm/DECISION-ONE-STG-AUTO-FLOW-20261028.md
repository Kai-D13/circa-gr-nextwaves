# PM — một lượt staging cho luồng tự điền và tự HOÀN THÀNH (28/10/2026)

## 1. Quyết định operator và phạm vi

Operator quyết **làm tự điền + tự HOÀN THÀNH trong cùng một luồng trước pilot production**, vì không còn nhiều đơn staging chưa nhận để QC từng phiên bản. Dùng **một phiếu staging chưa nhận trên gói cuối** để kiểm E2E thật. Các bản trung gian được kiểm bằng fixture A1, server giả, Node, Edge và trang GR03887 đã COMPLETED chỉ đọc; **không tiêu thêm SO/GR staging** cho từng bản. Đây là quyết định triển khai và kế hoạch kiểm, **không phải phép nhận/ghi cho một GR mới**. Trước lượt thật operator vẫn chọn đúng GR/PO/SO, xác nhận tem và cho phép một lần theo `agent.md`.

Quyết định này thay phần “dược sĩ bấm HOÀN THÀNH” ngày 24/10 **chỉ trong chế độ tự động được cấp phép riêng theo một phiên**. Luồng thủ công hiện hành vẫn có thể dùng khi không bật tự động. Dev cập nhật bảng quyết định `agent.md` sau khi commit tài liệu PM nguyên văn; không đổi quy tắc production chỉ đọc cho tới gate PRD.

**Điều chỉnh gate trước:** `docs/pm/AUDIT-A1-GR03887-STG-v0.2.4-20261028.md` yêu cầu kiểm Chrome thật v0.2.5 rồi staging done/merge. Nay v0.2.5 là **ứng viên nội bộ cho P2/P3**: dev hoàn tất test/Edge/trace/đóng gói để PM audit source, nhưng **chưa yêu cầu operator cài hoặc chạy lượt staging trên v0.2.5, chưa merge**. Sau đó làm batch tự động (dự kiến v0.3.0). Kiểm khung đỏ trên GR03887 COMPLETED **chỉ đọc bằng gói cuối**. Một E2E staging có tác động thật cũng chỉ chạy bằng gói cuối; PM audit rồi mới xét staging done/merge. Mọi lần đổi runtime vẫn phải tăng version, ZIP và SHA-256 theo `agent.md`.

## 2. Hợp đồng hành vi cho batch tự động

### 2.1 Một cấp phép trước khi xác nhận Nextwaves

- Popup hoặc khung extension có hành động riêng ghi rõ: **“Cho phép tự điền và HOÀN THÀNH 1 lần”**. Trước khi bấm, hiển thị chính xác môi trường, cửa hàng, GR, SO, PO Nextwaves, số tem dự kiến và việc POS sẽ tự hoàn thành sau khi đọc lại đúng toàn bộ. Không tái dùng im lặng nút “Cho phép điền 1 lần” của chế độ thủ công.
- Chỉ popup extension (không phải trang web/content script) được tạo quyền. Background xác minh phiên schema hiện hành, trạng thái `nw_ready`, đúng STG/cửa hàng 2222, không khoá ghi, đúng GR/PO/SO/kho; lưu quyền một lần gắn với **session key + GR ID/code + env/store + SO/PO + tập EPC dự kiến**. TTL 30 phút; đổi phiên/đơn/cửa hàng hoặc hết hạn thì quyền vô hiệu. Không lưu token/cookie.
- Operator cấp quyền **sau khi extension khớp đúng PO Nextwaves, trước khi dược sĩ bấm “Xác nhận nhận hàng”**. Có quyền nhưng chưa có `receive-scan` 2xx và đọc lại biên nhận/UID đầy đủ thì không ghi POS. Nếu quyền hết hạn mà dược sĩ vẫn nhận hàng, extension dừng ở kế hoạch thủ công, không tự điền/hoàn thành.
- Khi không cấp quyền tự động, giữ nguyên luồng v0.2.5: kế hoạch → cấp phép điền riêng → bấm Điền → dược sĩ HOÀN THÀNH. Chế độ tự động mặc định **tắt**. PRD tiếp tục không cấp quyền ghi cho tới gate riêng.

### 2.2 Sau khi Nextwaves nhận

- Chỉ kích hoạt trên sự kiện `session:received` của **chính** lượt `receive-scan` 2xx với 1 biên nhận mới, đủ EPC/UID theo phiếu gửi, không thiếu/thừa, đúng kho. Không tự kích hoạt từ phiên cũ, refresh trang, `nw_ready` hoặc kết quả tìm kiếm đơn. Background/pos-content chỉ chuyển quyền tự động cho **một** tab POS đúng GR; claim được tuần tự hoá qua hàng đợi background hiện có.
- Trên POS, GET lại GR và PO, kiểm môi trường/cửa hàng/SO/PO, trạng thái còn nhận được, 0 mã lạ/0 số lượng nhận trước ngoài kế hoạch, trang/anchor đúng GR. Tra từng UID và xây kế hoạch như W1 hiện tại. Điều kiện tự chạy: `plan.ok`, **0 blocked, 0 warning, đủ toàn bộ dòng/lô/UID, không nhận thiếu**, và kế hoạch trùng các khoá đã cấp quyền. Bất kỳ lệch nào dừng trước PUT; không chuyển sang tự HOÀN THÀNH.
- Tái sử dụng `runPlan` và kiểm GET sau từng PUT. Quyền tự động được tiêu **một lần khi claim W1**, ghi vào phiên hash kế hoạch + dấu quyền tự HOÀN THÀNH; hai tab/nhấp hai lần chỉ một chủ lease. Sau khi đã claim, reload/crash/rời trang/lease mất **không tự resume**. Nếu ghi một phần, lỗi mạng hoặc kết quả không rõ, dừng và yêu cầu người vận hành đối chiếu; không tự thử lại PUT.

### 2.3 Chốt GR và lệnh HOÀN THÀNH

- Mã hiện tại tải lại trang sau `finishApply`. Ở chế độ tự động, **không reload trước bước xác minh cuối**; dùng GET mới từ POS để so toàn bộ GR với snapshot kế hoạch và quyền: đúng GR/PO/cửa hàng, status `RECEIVING`, cùng tập detail ID/lot ID/sản phẩm/lô/hạn/đơn vị, từng số lượng nhận đúng target, tập UID trên từng detail đúng hoàn toàn, không UID lạ/trùng, tổng số dòng và UID đúng. `plan.complete` một mình không đủ nếu chưa so snapshot toàn phiếu. Không đổi quy đổi hay body W1.
- Chỉ sau GET trên đạt, background cấp **claimComplete một lần** cho đúng session/token/planHash sau `finishApply` thành công; claim này đặt dấu “đã gửi hoặc kết quả chưa rõ” **trước** khi gọi POS `PUT …/status/COMPLETED` (không body, như request A1). Tab khác hoặc lần gọi lại không được gửi thêm. Ngay trước PUT kiểm lại route/GR/phiên/lease; operator không bấm nút HOÀN THÀNH thủ công khi chế độ tự động đang chạy.
- Sau PUT, GET GR mới. Chỉ đánh dấu `done` khi GET trả `COMPLETED` đúng GR; nếu HTTP lỗi/timeout/2xx nhưng GET chưa xác nhận, trạng thái là **chưa rõ**, dừng và **không tự retry** lệnh HOÀN THÀNH. Nếu GET thấy đã COMPLETED do thao tác khác, ghi nhận nguồn không chắc; không gửi thêm PUT. Hook đang nghe `status/COMPLETED` không được đánh dấu `done` sớm cho phiên đang `auto_completing` trước GET xác nhận.
- Sau xác nhận, tải lại POS để người dùng thấy trạng thái cuối. Trang COMPLETED không có `#all-receipt`: áp dụng sửa P2 của v0.2.5, không hiện khung đỏ. QR POS tự thêm sau hoàn thành chỉ được ghi nhận; **không** lấy chúng làm UID RFID hoặc gửi thêm PUT.

### 2.4 Dừng và phục hồi

- Các trạng thái cần phân biệt trong log/popup: `auto_armed`, `auto_claimed`, `apply_stopped`, `auto_complete_claimed`, `auto_complete_unknown`, `done`. Log chỉ mã/ID/hash/số lượng/status/giờ, không token/headers/cookie hay tên nhân viên.
- Nếu Nextwaves đã nhận nhưng POS không đọc được UID hoặc quyền đã hết hạn: không ghi POS, không nhận lại Nextwaves; áp dụng O1/SOP nhập tay sau khi operator xác nhận. Nếu W1 đã ghi một phần: không tự HOÀN THÀNH, không tự cấp quyền lại. Nếu lệnh HOÀN THÀNH chưa rõ: chỉ GET kiểm, không gửi lại PUT. Mọi nhánh lỗi phải có thông báo bước tiếp theo, không báo “xong” khi chưa xác nhận.

## 3. Gate kỹ thuật và **một** lượt staging thật

### G0 — v0.2.5 nội bộ

Dev hoàn tất bộ đột biến, Edge, trace có tên và gói v0.2.5 đang làm; gửi PM diff/test/SHA. PM audit P2/P3 ở source/gói. **Không yêu cầu operator cài v0.2.5 hoặc dùng đơn staging.** P2/P3 được giữ nguyên khi đưa vào ứng viên cuối.

### G1 — batch tự động trên dữ liệu A1, không có ghi thật

- Dùng 9 mẫu A1 và response `status/COMPLETED` thật để mô phỏng đủ chuỗi: arm → `receive-scan` 2xx + đọc lại → 15 tra QR → kế hoạch #EF0E020C → 5 PUT/GET → GET toàn phiếu → 1 PUT COMPLETED → GET COMPLETED. Kết quả phải khớp đúng 15 UID/5 lô, một lần hoàn thành, không có lần gửi trùng.
- Test âm bắt buộc: không arm/hết hạn/đổi GR-SO-PO-store; receipt thiếu/thừa/không có biên nhận mới; QR thiếu/sai lô/sai đơn vị; warning nhận thiếu; anchor mất/route đổi; GET sau W1 lệch một UID/lô/số lượng hoặc có mã lạ; PUT thứ 3 lỗi/timeout; hai tab cùng claim; reload/crash sau claim; status PUT 500/timeout/2xx nhưng GET không COMPLETED; hook về sớm; sau COMPLETED không khung đỏ. Mỗi ca chặn phải có **0 PUT status/COMPLETED**, trừ ca status đã gửi thì không gửi lần 2.
- Chạy Node, Edge trên gói giải nén, đột biến phần guard/claim và trace hiệu năng có tên so baseline. Dev giao số thật, đối chứng lỗi cũ, diff, ZIP/SHA-256 và xác nhận source = ZIP = bản cài. Chưa gọi staging ghi.

### G2 — preflight chỉ đọc gói cuối

PM audit G1. Sau đó cài **gói cuối** cùng thư mục/Extension ID trên máy thử; kiểm trang GR03887 đã COMPLETED không khung đỏ và popup quyền tự động hiển thị đúng, không bật quyền/nhận/ghi. Chọn **một** GR/SO/PO chưa nhận (GR03879 chỉ là ứng viên, phải GET xác minh lại), đọc trạng thái POS/NW, lô/đơn vị, EPC và quyền cửa hàng. Nếu không đủ điều kiện thì dừng, không tiêu đơn. Không dùng lại GR03887 đã COMPLETED.

### G3 — một E2E staging thật trên gói cuối

- Operator xác nhận bằng chữ đúng một GR/PO/SO và tem vật lý; cho phép riêng một lượt nhận + tự điền + tự HOÀN THÀNH. Hành động arm một lần trong extension trước khi bấm Nextwaves. Bật capture tab POS và Nextwaves, kiểm có GET mới ở cả hai trước lượt. Dược sĩ chỉ bấm nút nhận trên Nextwaves **một lần** khi đủ EPC, không bấm Điền/HOÀN THÀNH trên POS.
- Kỳ vọng: đúng một `receive-scan` 2xx; một biên nhận mới; đủ UID; kế hoạch không chặn; số PUT detail bằng số lô, mỗi PUT có GET kiểm; một PUT status/COMPLETED sau GET toàn GR khớp; GET cuối COMPLETED; grant đã tiêu, log đầy đủ, 0 ghi GR khác. Nếu dừng giữa chừng, **không dùng cùng đơn để thử lại tự động**; PM/ operator quyết phục hồi theo trạng thái thực.
- Bằng chứng tối thiểu một bộ: Net Capture hai tab (giữ file gốc có credential trên máy), export storage, ảnh màn quét trước xác nhận và ảnh GR cuối; dev làm sạch mẫu, báo status/giờ/hash và PM audit. Không xin thêm nhiều ảnh UI chỉ để xem.

**Staging done + merge** chỉ khi G0–G3 đạt trên chính gói cuối và PM chốt; không merge v0.2.5 riêng chỉ vì test nội bộ xanh. Nếu một gate thất bại, sửa và lặp test offline; lượt staging thứ hai chỉ khi operator có đơn mới và cấp phép riêng. Không biến một lượt test thành phép production.

## 4. Việc của dev và operator ngay lúc này

- **Dev:** tiếp tục hoàn tất v0.2.5 nội bộ; chưa gửi hướng dẫn cài cho operator. Sau đó đề xuất diff kỹ thuật cho batch tự động theo §2–§3, kể cả quyền một lần và xử lý reload hiện tại; báo PM trước khi code phần ghi mới nếu API/hợp đồng thật khác A1. Cập nhật `agent.md` và runbook khi spec đã được commit. Chỉ dùng fixture/server giả cho tới G2/G3.
- **Operator:** chưa cần chọn/cấp phép đơn staging ngay. Giữ một đơn chưa nhận nếu có; khi gói cuối qua G1, cung cấp hoặc cho dev đọc chỉ GET để chốt GR/PO/SO và EPC. Quyết định làm một lượt đã được ghi nhận; phép ghi thật sẽ gắn với mã phiếu cụ thể tại G3.
- **PM:** audit v0.2.5 G0 và batch tự động G1, rồi chốt gói cuối để operator kiểm G2/G3. Các cổng production O1, QR lô, reader Florita, T1-PRD và phép W1-PRD vẫn giữ nguyên.
