# PM review kế hoạch v0.2 — nút RFID, hiệu năng, production Florita

Ngày 26/10/2026. Đối tượng: `docs/dev/PLAN-v0.2-RFID-BUTTON-PROD.md` tại `main` `650c24a`; đối chiếu `src/` hiện hành v0.1.5 và nhánh UI v0.1.6 `b4017d7`. **Đây là review kế hoạch, chưa phải audit build v0.2.0.** Commit `650c24a` chỉ đổi tài liệu và `state.md`, không có DIFF runtime, test runner hoặc ZIP v0.2.0.

## Quyết định

**Duyệt hướng sản phẩm:** nút “Nhận hàng bằng RFID” trên danh sách GR; bấm mới tạo phiên; tab POS ở lại danh sách trong lúc nhận trên Nextwaves; sau khi nhận thì tab POS đến đúng phiếu GR; production đầu tiên chỉ Florita. Quyết định mới thay quy tắc tự tạo phiên khi mở GR/SO ngày 24/10. Mở lại phiếu có **phiên đang tồn tại** vẫn phải tự đọc trạng thái và tiếp tục lập kế hoạch sau khi Nextwaves đã nhận; chỉ thao tác **tạo phiên mới** đòi cú bấm.

**Duyệt Đợt 0 chỉ đọc. Đợt 1 được triển khai theo đặc tả/gate dưới đây sau khi v0.1.6 qua UI staging thật và có mẫu danh sách/DOM đã làm sạch.** Nếu bằng chứng cho thấy DOM hoặc API khác giả định, dev báo PM sửa spec trước khi code selector/hợp đồng tương ứng. Chưa duyệt merge v0.1.6, chưa duyệt ZIP v0.2.0, chưa cấp phép lượt nhận/ghi staging mới, chưa bật ghi production. Đợt 2/O1 cần spec và gate riêng; không gộp thành điều kiện mặc nhiên của v0.2.0.

## Bằng chứng và finding

| Mức | Kết quả |
|---|---|
| Source PM kiểm | `classifyPosPage()` hiện chỉ có `gr`/`so`; `evaluate()` chuyển mọi trang không phải `gr` vào `evaluateSo()`. Thêm `gr_list` mà không tách nhánh sẽ gọi luồng SO với `so` rỗng. `evaluateGr()` hiện tự `start()` khi chưa có phiên. Background `received()` đã dùng `returnUrl` để chuyển tab POS tới trang phiếu. `startSession()` nhận phiên active sẵn và không mở tab thứ hai. |
| Source PM kiểm | `pos-hook.js` hiện chỉ gửi header và trạng thái GR; chưa có hợp đồng response danh sách. `pos-content.js` làm mới khi mọi grant thay đổi; tra QR lại ở mỗi lần `planAndOffer()`. `background.js` lưu `scan_ok` qua `Object.assign({at: ISO}, scan)`, nên `scan.at` dạng số có thể đè timestamp log. |
| Dev báo | Response danh sách POS ngày 26/10 12:08 có `id/code/status/PO/pos_info`; Nextwaves `circa-rfid` có cách chèn nút tham khảo; đã audit hiệu năng theo source. Chưa có mẫu response danh sách và outerHTML đã làm sạch trong repo để PM xác nhận hình dạng/selector. |
| Môi trường thật | T1/T3/W1 v0.1.5 đã qua gate staging trước đây. Chưa có ảnh UI v0.1.6 trên POS/Nextwaves staging thật và chưa có lượt click danh sách v0.2.0. |

### P1 — phải sửa trong đặc tả/thiết kế trước khi code lối vào danh sách

1. **Dữ liệu danh sách chỉ là gợi ý UI, không là căn cứ tạo phiên.** Mỗi click phải GET lại GR theo `id`, kiểm `code`, trạng thái nhận được, `pos_info.id` = cửa hàng phiên POS, PO của GR, mã giao SO, kho, kiểm duy nhất SO/GR và toàn bộ khoá ghi hiện có. `id`/`code` từ `postMessage` hoặc DOM không được ghi thẳng vào session. Response mới/filter/page mới phải vô hiệu ánh xạ cũ; click trên dòng đã đổi phải dừng. Không có response/DOM khớp thì không hiện nút hoặc báo chờ dữ liệu, không đoán theo thứ tự dòng.
2. **Định nghĩa rõ hai lối vào và trạng thái.** `gr_list` có nhánh riêng trong `evaluate()`; không rơi xuống `evaluateSo()`. `gr-list.js` chỉ phụ trách DOM/sự kiện và chuyển lựa chọn sang một controller duy nhất trong ISOLATED world; nêu cơ chế đăng ký/đợi controller khi file nạp trước. Mở GR hoặc SO không tự tạo phiên, không tự mở Nextwaves; click một lần mới tạo. Phiên `waiting_nw/nw_ready/received/applying/applied/apply_stopped` đã có thì tiếp tục hiện và xử lý như hiện hành. Double click, hai tab, refresh và quay lại danh sách không được tạo hai phiên/PO mới.
3. **Header cửa hàng không được ghép qua hai lần đăng nhập.** Request thiếu `x-store-id` không được thay header hợp lệ; chỉ được giữ header cũ khi cùng host, cùng `authorization`/`x-client-id` và cùng ngữ cảnh tab đã xác nhận. Nếu token/nhân dạng đổi hoặc không chứng minh được, dừng tới khi có request đủ header. Không dùng `pos_id` trong query danh sách như bằng chứng duy nhất về cửa hàng. Luôn so cửa hàng trong GR và PO mới đọc với phiên POS trước `session:start`.
4. **Rời trang trong lúc chuẩn bị phiên.** Huỷ được các GET chuẩn bị; sau mỗi `await` và ngay trước `session:start` kiểm lại route, môi trường, cửa hàng và đúng lượt click. Nếu phiên đã được tạo, không xoá âm thầm; hiện trạng thái phiên tại danh sách/popup. Background chỉ chấp nhận `returnUrl` là URL phiếu GR đúng môi trường và đúng `grId`, tránh điều hướng theo URL từ DOM/message.

### P2 — cần gate đo được trước khi phát hành

5. **Hợp đồng response danh sách/DOM.** Cần một mẫu `Copy response` đã bỏ token/tên người và outerHTML của dòng thật. Hook chỉ đọc `GET` thành công đúng endpoint danh sách của môi trường; giữ `request URL/query/page` và số thứ tự response để loại kết quả đến muộn, chỉ gửi các trường cần dùng, không gửi body/Authorization. Có giới hạn kích cỡ/số dòng; vượt giới hạn thì fail closed và không cản request POS. Nút có `type="button"`, dùng click/keyboard được, không làm mở dòng hoặc submit form; không đè nút của extension Nextwaves. Nút có thể xuất hiện ở GR chờ/đang nhận trước khi biết SO, nhưng sau click phải báo rõ nếu không có SO; không gắn nhãn đã xác thực trước GET PO.
6. **Cache QR và refresh.** “Một lần mỗi phiên” không đồng nghĩa cache vô hạn: nêu khoá cache gồm phiên + UID + dấu phiên nhận, TTL/điều kiện huỷ khi dữ liệu nhận đổi; không cache lỗi, cho phép retry có chủ đích. `planAndOffer` single-flight, nhưng mỗi lần chuẩn bị PUT vẫn dùng GR mới đọc và mã kế hoạch hiện tại. Lọc thay đổi grant theo đúng GR; không bỏ lỡ thay đổi `received/apply_stopped` hay grant vừa cấp.
7. **Panel/hiệu năng.** Chưa bỏ quét `a`, `[role=button]`, input hoặc giảm kiểm xuống 5 s khi chưa biết cấu trúc nút thật: phải giữ chức năng không che nút đã duyệt bằng ảnh v0.1.6, kể cả nút xuất hiện/di chuyển sau render và khi thu nhỏ. Đo trên Edge với DOM thật làm mẫu: trang bán hàng không có panel/observer/GET extension; danh sách 20 dòng và 300 DOM changes không sinh GET khi chỉ xem; đo thời gian handler/long task **có quy thuộc cho extension**, so baseline POS không cài extension. Nếu vượt ngân sách đề xuất `<2 ms` mỗi lượt hoặc có task `>50 ms`, dev nêu số đo, nguyên nhân và sửa trước gate.
8. **Nâng cấp/phiên.** ZIP và SHA mới theo version. Thư mục cài cố định chỉ giữ extension ID khi cập nhật **cùng extension đã cài từ chính đường dẫn đó**; nó không chuyển phiên từ các ID cũ. Trước khi chuyển đường dẫn/nâng cấp phải xác nhận không có phiên `received/applying/apply_stopped` dở, sao lưu trạng thái thích hợp, kiểm `chrome.runtime.id` và `lastUpgrade` sau update. Không thay file trong thư mục đang chạy khi có lượt nhận/điền. O1 chưa được giải bằng việc giữ đường dẫn.

## Gate theo đợt

| Gate | Điều kiện nghiệm thu |
|---|---|
| G0 — đầu vào | Operator gửi 3 ảnh POS + 2 ảnh Nextwaves v0.1.6; PM chốt UI thật. Có response danh sách GR và outerHTML dòng/vùng nút đã làm sạch; kiểm status, PO, cửa hàng, phân trang/filter. Nếu UI v0.1.6 còn che nút thì sửa/gate bản đó trước khi làm cơ sở v0.2.0. |
| G1 — source/test v0.2.0 | Dev giao nhánh/commit, DIFF, contract response danh sách, test runner nguyên văn. Test ít nhất: STG/PRD/host lạ/cửa hàng khác; response muộn, trang đổi dòng, thiếu trường, >giới hạn; click/keyboard/double click/hai tab; GR/PO đổi sau danh sách; không tự tạo khi mở GR/SO; phiên cũ tiếp tục; route đổi giữa mọi `await`; grant/QR retry; `scanAt` ISO, `at` log vẫn ISO; không ghi khi một chặn. Đột biến phải bắt đúng lỗi, không tính timeout/neo lệch. |
| G2 — gói/Edge | Version 0.2.0, ZIP/SHA, giải nén = source từng file; `edge-check` trên bản giải nén. Đối chứng test phải tái hiện trường hợp v0.1.5 tự mở và lỗi khung cũ; thử cùng lúc với nút `.circa-rfid-po-link`; đo hiệu năng và số request như P2.7. PM audit trước khi operator cài. |
| G3 — staging thật, chỉ đọc | Trên cửa hàng 2222: nút đúng dòng, click chỉ đọc tạo đúng một phiên/mở đúng Nextwaves, tab POS giữ URL danh sách; sau nhận hàng thì về đúng GR. Phần **nhận hàng/PUT/HOÀN THÀNH** là các hành động ghi riêng, chỉ làm khi operator cho phép lượt GR/PO cụ thể; thu Net Capture hai tab, response và storage đã bỏ bí mật. Gate W1/HOÀN THÀNH đánh giá riêng sau đó. |
| G4 — production Florita | Đợt 2 có spec riêng: O1 dựa trên response đơn **đã nhận** thật, làm rõ mã QR POS thêm sau HOÀN THÀNH và hệ quả vận hành, xác nhận xung đột reader với các extension trên máy Florita. Bản PRD `writeEnabled=false`, allowlist chỉ Florita, T1-PRD chỉ đọc kiểm host/CORS/dữ liệu. W1-PRD chỉ khi các điểm mở được giải hoặc operator chấp nhận phương án vận hành cụ thể, PM audit và operator cho phép từng GR. |

## Dữ liệu còn cần, giao qua operator

1. Ảnh UI v0.1.6 trên staging thật và outerHTML dòng GR / vùng nút thao tác, bỏ tên người nếu có.
2. `Copy response` danh sách GR đang dùng cho trang danh sách (giữ `total/page/limit`, `id/code/status/PO/pos_info`; bỏ thông tin người và bí mật). Hiện plan chỉ dẫn Net Capture riêng của dev nên PM chưa xác minh hợp đồng này.
3. Response tìm đơn Nextwaves **đã nhận** theo SO và tra QR POS tự thêm; dùng để viết spec O1/production, không cần để chốt giao diện danh sách.
4. Cấu hình extension/reader trên máy Florita và một GR SO thật để chuẩn bị T1-PRD chỉ đọc.

PM không sửa runtime, không gọi API ghi hoặc phát hành gói. Dev cập nhật plan theo các điểm P1/P2 hoặc dẫn chiếu tài liệu này trong bàn giao Đợt 1.
