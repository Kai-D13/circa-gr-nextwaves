# PM review G3a lần 1 và spec sửa F3/F4 — v0.2.3

Ngày 27/10/2026. PM đọc `docs/dev/G3a-KET-QUA-v0.2.2-20261027.md`, xem trực tiếp bốn ảnh trong Downloads và đối chiếu mã nhánh `batch/v0.2-rfid` tại `3218cae`. Ảnh có tên nhân viên, **không đưa ảnh gốc vào repo**.

## Quyết định gate

- **G3a đạt một phần:** trước bấm, nút nằm đúng 7 dòng và dòng cao 57px; bấm GR03879 giữ POS ở trang danh sách; trên GR03878 khung không che HỦY/HOÀN THÀNH ở hai trạng thái. Đây là kết luận cho đúng các điểm đã thấy, chưa phải G0.3/G3a đạt toàn bộ.
- **F3 và F4 là lỗi UI thật, chặn merge/vận hành v0.2.2.** Dev được triển khai v0.2.3 trên nhánh batch để sửa và kiểm; không cần đợi ảnh Nextwaves còn thiếu mới viết code. Runtime đổi phải tăng version, ZIP, SHA theo `agent.md`.
- **G0.3/G3a còn chờ** kiểm khung trên màn quét Nextwaves sau cuộn, số tab mở, popup phiên và version cài. Kiểm Nextwaves nhằm xác nhận khung không che nút “Xác nhận nhận hàng” trên trang thật; một ảnh khung mở rộng có cả nút sau cuộn **hoặc** dev/PM quan sát trực tiếp và ghi kích thước/trạng thái là đủ. **Không yêu cầu operator chụp khung thu nhỏ**; Edge đã kiểm trạng thái này trên trang dựng, dev có thể tự quan sát thêm nếu tiện. Không nhận hàng/ghi POS để thu các mục này.

## F3 — bảng dàn lại vì nhãn trạng thái dài (P2, bắt buộc sửa)

**Bằng chứng:** ảnh `G3a-2-danh-sach.png` trước bấm: dòng 57px, cột/tiêu đề gọn. Ảnh `G3a-3-sau-khi-bam.png` ở vùng trang 1095×756: tiêu đề bảng và thời gian xuống dòng, hàng cao khoảng 73px. Mã hiện tại đổi nhãn từ `Nhận hàng bằng RFID` sang `Đang nhận trên Nextwaves`; các nhãn `Đã nhận — mở phiếu` và `Đã điền — mở phiếu` có cùng rủi ro.

**Duyệt hướng dev, với hợp đồng rõ:**

1. Nhãn nhìn thấy ở danh sách: chưa có phiên `Nhận hàng bằng RFID`; đang kiểm `Đang kiểm…`; phiên `waiting_nw`/`nw_ready` `Mở Nextwaves`; đã nhận/đã điền/dừng điền `Mở phiếu`. Không đổi hành động: `open_nw` vẫn mở lại tab đúng phiên; `open_gr` vẫn mở đúng GR; nút busy không nhận click.
2. Nghĩa đầy đủ và **trạng thái cụ thể** (`waiting_nw`, `nw_ready`, `received`, `applying`, `applied`, `apply_stopped`) giữ trong `title` và `aria-label` của nút, popup/khung trên trang phiếu. Không chỉ dựa vào tooltip vì màn cảm ứng và bàn phím có thể không hiện tooltip. Không lấy trạng thái POS làm trạng thái Nextwaves.
3. Giới hạn bề rộng nút ở mức **không lớn hơn nút `Nhận hàng bằng RFID` đang hiển thị** trên trang thật; giữ chữ một dòng, cắt bằng `…` khi thiếu chỗ. Tiêu đề/aria-label vẫn đầy đủ. Không sửa độ cao 24px. Kiểm mọi `kind` của nút, không chỉ trạng thái sau bấm.

**Gate F3:** ở 1095×756 (viewport có side panel), 1366×768 và 1440×900, so trước/sau `start → busy → open_nw → open_gr`: không làm cột/tiêu đề dàn lại; dòng có và không có nút giữ cùng chiều cao trên cùng trang (mốc thực tế 57px ở 1095); nút vẫn nằm cạnh hai icon và click không mở dòng POS. Có test trạng thái/nhãn/`title`/`aria-label`, Edge trên bản giải nén và ảnh/quan sát Chrome thật sau sửa.

## F4 — khung thông báo che phân trang/hành động (P1, bắt buộc sửa)

**Bằng chứng:** `G3a-3-sau-khi-bam.png`: khung thành công cố định góc dưới phải che mũi tên phân trang và cột Hành động/dòng cuối. Không duyệt **chỉ chuyển khung xuống góc trái**: cùng kích thước 460px ở viewport này sẽ che mã phiếu/dòng đầu cột trái. Tự thu nhỏ sau 5 giây cũng để nút bị che trong 5 giây và dải thu nhỏ có thể vẫn nằm trên phân trang.

**Hợp đồng UI cho trang danh sách:**

1. Trạng thái chuẩn bị thể hiện bằng nút `Đang kiểm…` đã vô hiệu; khi tạo phiên thành công, nút thành `Mở Nextwaves` và tab Nextwaves mở. **Không giữ khung nổi thành công trên danh sách.** Có thể báo ngắn bằng vùng thông báo trong luồng trang, nhưng không phủ bảng.
2. Lỗi/hủy/cảnh báo phải còn thông điệp rõ và nút đóng/thử lại nếu cần. Đặt chúng **trong luồng trang ngoài bảng** (ví dụ vùng báo ở trên bảng) hoặc giải pháp tương đương chứng minh không phủ bất kỳ icon, nút RFID, dòng có thể bấm, chọn số dòng hay mũi tên phân trang. Không dùng fixed panel góc trái/phải trên danh sách làm giải pháp duy nhất. Dùng textContent, không chèn HTML từ response. Chuyển route khỏi danh sách thì dọn thông báo.
3. POS trang phiếu và Nextwaves giữ hành vi khung hiện tại; F4 chỉ áp cho đường `/danh-sach-phieu-nhan-hang`. Không thay hàng rào tạo phiên, grant hay logic ghi.

**Gate F4:** Edge/DOM theo mẫu thật và Chrome staging ở 1095×756 sau bấm thành công, khi đang kiểm và khi có lỗi/hủy mô phỏng: không che nút RFID, hai icon dòng, mã GR, phân trang và chọn số dòng; các điểm đó còn click được. Kiểm route rời/quay lại, thay trang/filter và không có vòng MutationObserver. Không thêm request API khi chỉ xem danh sách. Thành công không tự tạo phiên/tab thứ hai khi refresh.

**Điểm sửa dự kiến:** `src/pos/pos-content.js` quyết nhãn theo phiên và điều kiện hiện thông báo; `src/pos/gr-list.js` giữ kích thước nút, tooltip và tên đọc được bằng bàn phím/thiết bị hỗ trợ; nếu cần vùng thông báo mới, chỉ áp nó cho trang danh sách, không làm đổi `src/ui/panel.js` của trang GR/Nextwaves. Test cần so trạng thái trước/sau click trên cùng bảng, không chỉ thử render ban đầu.

## Quan sát khác và việc còn thiếu

- Trên GR03878 tại viewport 1095×756, khung mở rộng che một phần nút `SL nhận` (+/−/xoá) của dòng sản phẩm; khung thu nhỏ làm các nút này dùng được. **Chưa tính là F3/F4**, nhưng là hạn chế tương tác P2 cần xét trước W1 vận hành. Dev ghi riêng phương án để mở rộng khung mà vẫn thao tác được, hoặc hướng dẫn thu nhỏ rõ ràng; không che HỦY/HOÀN THÀNH vẫn là gate bắt buộc.
- **Operator xác nhận lần bấm GR03879 đầu đã bấm và thấy “Danh sách đã đổi — bấm lại”.** Như vậy đây không phải cú bấm im lặng; extension đã báo huỷ và không tạo phiên. Thông báo phù hợp với hàng rào huỷ khi danh sách đổi, nhưng ảnh/lời kể chưa chứng minh sự kiện nào làm danh sách đổi tại thời điểm đó. Không cần thử nhận hàng để tái hiện; nếu thông báo lặp lại khi danh sách đã ổn định, dev mới đối chiếu nhật ký request và click cancellation.
- Còn thiếu kiểm G3a-4 trên Nextwaves thật sau cuộn với **khung mở rộng và nút Xác nhận nhận hàng cùng hiện**, số tab Nextwaves, G3a-8 popup một phiên GR03879, G3a-1 version 0.2.2 và tình trạng phiên trước cài. G3a-5 (ảnh khung thu nhỏ) là bằng chứng phụ, **không là điều kiện bắt buộc**. Dev ưu tiên tự quan sát chỉ đọc trên tab đang mở; chỉ nhờ operator khi không truy cập được. Ảnh có tên nhân viên phải che trước khi đưa repo; PM có thể xem file gốc cục bộ để review.

## Bàn giao v0.2.3

Dev giao nhánh/DIFF, danh sách file runtime đổi, version/ZIP/SHA và bản giải nén, kết quả test nguyên văn (bao gồm Edge hẹp và đối chứng v0.2.2). PM audit source/gói rồi mới cho cài v0.2.3 để lấy ảnh/quan sát Chrome staging sau sửa và kiểm lại G3a. Lượt nhận/PUT/HOÀN THÀNH staging và production chưa được duyệt trong review này.

### Thứ tự triển khai kỹ thuật cho dev

1. **Nhận tài liệu:** commit nguyên trạng file PM này và `state.md` trong commit `PM:` riêng trên `main` theo `agent.md`; code ở `batch/v0.2-rfid`. Báo trước nếu có giả định nào khác DOM/response staging đã lưu.
2. **F3:** trong `src/pos/pos-content.js`, giữ logic chọn `kind`/hành động và hàng rào phiên; chỉ đổi nhãn hiển thị và tạo tên đầy đủ theo mã GR + trạng thái phiên + hành động. Trong `src/pos/gr-list.js`, giữ nút cao 24px, giới hạn chiều rộng, ellipsis; cập nhật `title` và `aria-label` mỗi lần trạng thái đổi. `syncRow()` hiện trả về sớm khi `grId`/code/chữ/disabled giống nhau, dù `kind`/`title`/`aria-label` có thể đã đổi; sửa điều kiện đồng bộ để không giữ thông tin cũ khi `received → applied` cùng hiện “Mở phiếu”. Giữ `data-cgn-kind` đúng với hành động hiện tại.
3. **F4:** tách feedback trang danh sách khỏi `panel.show()` cố định. Trong `onListSelect()`, `evaluateGrList()`, `clearListButtons()`, `leaveList()` và nhánh lỗi ở `onSelect`, busy/success dùng trạng thái nút; cancelled/not_linkable/error hiển thị trong vùng thông báo thuộc luồng trang, ngoài bảng, với text an toàn. Tạo/gỡ idempotent qua route/filter/page đổi; tránh vòng `MutationObserver` của `gr-list.js`, không tạo phiên hay request chỉ vì render thông báo. Không thay khung GR/Nextwaves.
4. **Test:** thêm ca cho mọi `kind` và chuyển trạng thái có cùng nhãn nhưng thông tin truy cập khác; đo hình học bảng trước/sau click ở 1095×756, 1366×768, 1440×900; kiểm thông báo lỗi/hủy không phủ điều khiển, còn dùng được bàn phím và chuột; route rời/quay lại, lọc/phân trang, click hai lần/hai tab không tạo hai phiên. Giữ ngân sách quét danh sách <2 ms/lượt và tác vụ extension <50 ms; chạy `npm test` và Edge trên bản giải nén, báo số đạt/không đạt nguyên văn.
5. **Phát hành để audit:** tăng version ở `src/manifest.json` và `package.json` lên 0.2.3; tạo ZIP/bản giải nén/SHA mới theo `scripts/pack.py`, đối chiếu file source/ZIP/bản cài. Bàn giao commit/DIFF, test, trace/ảnh Edge hẹp trước và sau click, số đo hiệu năng, giới hạn còn lại. Chỉ sau PM audit nguồn/gói mới cài v0.2.3 lên Chrome staging kiểm G3a lại. Không dùng lượt kiểm này để nhận hàng hoặc ghi GR.
