# PM audit — batch v0.1 staging

Ngày 24/10/2026. Phạm vi: nhánh `batch/v0.1-staging`, commit `a08d541`; báo cáo dev `docs/dev/BATCH-v0.1-STG.md`; gói `FF5CD95B`. **Kết luận: chưa qua gate merge hoặc gate ghi POS.** Có thể làm T1 chỉ đọc trên staging với `writeMode=off`, theo hướng dẫn dev, để lấy bằng chứng UI/API thật. Không chạy T3 cho tới khi các finding P1 và điều kiện dữ liệu thật được xử lý.

## Bằng chứng đã kiểm

- Mã chỉ ở nhánh batch; `main` tại `debd60b` có tài liệu và mẫu, chưa có `src/`. Worktree audit tách riêng tại commit `a08d541`; không sửa mã dev.
- PM chạy `npm test` một lần: **48 pass, 0 fail, 0 skip**. Báo cáo 8 lần chạy liên tiếp và 8/8 đột biến là **dev tự báo**, PM chưa chạy lại các phép đó.
- SHA-256 ZIP là `ff5cd95be48e859a894e9b5f3b2864f80ea4b636ddd19d34e22944f6ad5b0948`; 16/16 file giải nén khớp từng hash với `src/` tại `a08d541`. Bản cài `C:\circa-gr-nextwaves-v0.1.0` cũng khớp 16/16. Quét mẫu bí mật theo `agent.md` §7 trên commit: 0 kết quả.
- Dev báo Edge headless nạp service worker và hook trên Nextwaves staging; PM chưa tự kiểm UI đăng nhập thật. 48 test chạy với browser giả; `tests/helpers.js` dựng lại response 2xx nhận hàng, PO sau nhận của PO28237814, `/receiving` của PO này và 10/12 QR lookup.
- Môi trường thật còn K1: PO28237814 bị `400 tagged_unit_unsupported`; chưa có lượt nhận thành công theo luồng inter-tenant và chưa có PUT W1 được phép trên POS staging.

## Finding P1 — phải sửa trước khi merge

### P1.1 — Tìm PO trên tập ứng viên chưa đầy đủ

`src/lib/env.js:133` cố định `pageSize=50`. `src/nw/nw-content.js:157-184` bỏ qua `total`, cắt còn 10 ứng viên và tiếp tục chọn đúng một PO nếu một ứng viên khác đọc detail/receiving lỗi. Vì vậy “duy nhất” có thể chỉ là duy nhất trong phần dữ liệu đã đọc, không phải duy nhất của SO. Mẫu search thật có trường `total` (`samples/nw-stg-receiving-search-q-SOBD1593859.json`).

**Yêu cầu:** đọc đủ mọi trang, giữ tổng số/điểm dừng rõ ràng, hoặc fail closed khi vượt giới hạn. Bất kỳ GET ứng viên nào lỗi, thiếu schema hoặc không rõ trạng thái phải chặn chọn PO, không bỏ qua rồi chọn ứng viên khác. Test tối thiểu: 11+ ứng viên, `total > items.length`, hai PO khớp ở hai trang, một GET ứng viên timeout, và 0/1/n ứng viên hợp lệ. Gate staging: response tìm **SO mục tiêu `SOBD1593858`** và `total` được ghi nhận; chỉ mở tiếp khi đã kiểm toàn bộ tập ứng viên.

### P1.2 — UID có trên GR nhưng ở sai sản phẩm/lô vẫn được coi là đã điền

`src/lib/plan.js:41-61` lưu UID đã có rồi `continue` trước khi kiểm sản phẩm, lô và lượng. `src/pos/pos-content.js:376-379` chuyển phiên sang `applied` nếu mọi UID hiện diện ở đâu đó trên GR. PM chạy tái hiện trên GR03878: đặt một UID vào detail khác với batch Nextwaves → `alreadyOnGr=1`, `blocked=[nothing_to_write]`, nhánh UI sẽ đánh dấu `applied`.

**Yêu cầu:** với UID đã có, vẫn xác minh đúng item/detail, lô, quy đổi lượng và tính nhất quán `received_quantity` với nhóm UID; UID trùng ở hai detail phải chặn. Chỉ bỏ qua UID sau khi đối chiếu đúng. Gate: test UID đúng chỗ, sai lô, sai sản phẩm, trùng detail, thiếu/thừa lượng; các ca sai không được chuyển `applied` hoặc ghi bước còn lại.

### P1.3 — Chế độ `auto` có thể ghi thật mà không có phép cho từng lượt

`src/popup/popup.html:41-46` và `src/background.js:12,36` lưu chế độ `auto` lâu dài; `src/pos/pos-content.js:400-401` tự PUT khi phiên chuyển sang `received`. Điều này không đáp ứng luật `agent.md` §4: **ghi dữ liệu thật phải được operator cho phép từng lần**. Mặc định `off` chỉ giảm xác suất, không chặn khi ai đó đã chọn `auto` trước đó. Cùng gói hiện cũng cho chọn PRD dù chưa qua gate production; `src/lib/env.js:34-38` không có mapping kho cho mọi cửa hàng production và `src/lib/nw-model.js:129` chỉ so kho khi có `warehouseId`.

**Yêu cầu:** vô hiệu `auto` trong bản staging, và PRD chỉ đọc/không ghi cho tới gate production. Ghi W1 phải có thao tác cho phép gắn với **GR/PO/plan cụ thể** sau khi operator cho phép lần đó; không lấy thiết lập popup tồn tại qua nhiều phiên làm uỷ quyền. Gate: test chế độ cũ `auto` sau nâng cấp không tự PUT; chưa cấp phép cho GR hiện tại thì 0 PUT; STG/PRD chéo môi trường và PRD cửa hàng chưa map đều 0 PUT.

### P1.4 — Kiểm cửa hàng ở đường mở thẳng GR chưa fail closed

`src/pos/pos-content.js:212-214` chỉ so `x-store-id` với `gr.posId` khi cả hai có giá trị. Nếu hook có Authorization nhưng thiếu `x-store-id`, GR staging 2222 vẫn đi tiếp. `src/lib/pos-model.js:79` cũng cho liên kết GR/PO đi qua khi thiếu một `posId`.

**Yêu cầu:** yêu cầu đủ `x-store-id`, `GR.pos_info.id`, `PO.pos_id` và ba giá trị khớp tuyệt đối trước khi mở phiên; staging vẫn phải đúng 2222. Gate: test thiếu từng trường và sai cửa hàng cho cả hai đường vào; tất cả dừng trước khi mở tab Nextwaves, 0 PUT.

### P1.5 — Quyền ghi một tab có thể hết hạn trong lúc PUT còn chạy

`src/background.js:131-140` cho tab khác giành quyền sau 2 phút dựa vào `updatedAt`; không có lease token/heartbeat được xác minh trước từng PUT. Nếu một lời gọi GET/PUT treo quá 2 phút, tab thứ hai có thể chạy kế hoạch khi tab đầu vẫn còn hoạt động. `src/lib/apply.js:31-61` đọc GR rồi PUT, không có khoá server hoặc kiểm lease giữa hai bước; cả hai có thể đọc cùng trạng thái và gửi cùng UID.

**Yêu cầu:** lease có chủ sở hữu và gia hạn trong khi đang ghi; trước mỗi PUT phải xác minh còn quyền, khi mất quyền dừng. Sau service worker restart/tab đóng, chỉ cho tiếp tục qua đọc lại GR và kế hoạch mới. Gate: browser-sim hai tab, một PUT bị treo > ngưỡng stale, tab hai xin quyền; tổng số PUT cho mỗi detail/UID vẫn đúng một và tab mất lease không gửi tiếp.

## Finding P2 — sửa hoặc chứng minh trước gate ghi

- **P2.1 — Trạng thái nhận thực tế:** `src/nw/nw-content.js:146,254-289` có nhánh `collect({onLoad:true})` có thể chuyển `received` chỉ nhờ danh sách UID đọc lại, không cần sự kiện 2xx của lượt này. `src/lib/nw-model.js:141-180` không kiểm status PO/shipment/receipt hoặc receiptId thuộc đúng lượt. Có thể dùng readback để phục hồi phiên, nhưng phải định nghĩa bằng chứng trạng thái “đã nhận xong” từ response thật và xác minh cùng shipment; hiện còn dữ liệu dựng lại. Gate: response thật sau nhận thành công, status/receipt/UID và ca nhận thiếu/PO còn mở; chỉ chuyển về POS khi hợp đồng đó đạt.
- **P2.2 — QR lookup thiếu productId vẫn có thể lập plan:** `src/lib/pos-model.js:100-113` cho `ok:true` khi `productId` vắng; `src/lib/plan.js:68-83` chỉ so sản phẩm nếu QR có productId, và có thể dùng batch Nextwaves để tiếp tục. Gate: QR response thiếu/khác `productId`, UID không khớp hoặc thiếu bản ghi đều phải chặn trước PUT. Không suy sản phẩm chỉ từ tên hoặc thứ tự.
- **P2.3 — Phiếu thay đổi ở detail khác sau khi lập plan:** `src/lib/apply.js:31-56` chỉ so `received` và UID của detail sắp PUT; mã quét tay mới ở detail khác không làm dừng kế hoạch cũ. Gate: thêm test thay đổi detail khác trong lúc chạy, chặn/đọc lại toàn phiếu và lập lại plan trước bước kế.

## Quyết định PM cho các điểm dev hỏi

| Mục | Kết luận hiện tại |
|---|---|
| P1 W1 | **Chưa đạt gate ghi.** Không suy server chấp nhận một PUT nhiều UID/tăng >1 từ test giả. Chờ lượt thử POS staging riêng được operator cho phép. |
| P2 nhận thiếu | Tạm thời **không điền phần nhận thiếu**, ở lại Nextwaves; cần stakeholder chốt cách xử lý lâu dài. |
| P3 nhiều GR cùng SO | Cho hiển thị danh sách để dược sĩ chọn **ở bước đọc**. Trước ghi phải chứng minh đúng mã giao ↔ GR và đúng lần giao; chỉ trùng SO/fingerprint chưa đủ. |
| P4 GR có QR quét tay | Không tự mở tab Nextwaves; người dùng chủ động chọn. Trước khi ghi, các UID đã có phải qua P1.2. |
| P5 đường `?po=<SO>` | Chấp nhận cho T1 chỉ đọc theo quyết định operator; ghi rõ web Nextwaves có thể tự gọi API của nó. Extension không gọi `/integrations/circa/*`. |
| P6 tra QR thất bại | Chặn cả gói; bổ sung trường bắt buộc theo P2.2. |
| P7 production | Chưa nghiệm thu. Giữ một gói nhưng khoá ghi PRD cho tới khi có mapping kho, test và gate riêng. |

## Gate tiếp theo và thông tin cần nhận

1. **Dev-team:** gửi DIFF sửa P1.1–P1.5, test nguyên văn cho từng ca; làm rõ P2.1–P2.3 và cập nhật hợp đồng dữ liệu từ response thật. Không tăng phạm vi hoặc merge trước PM audit lại. Nếu thay runtime phát hành, tạo version + ZIP + SHA-256 mới theo `agent.md`.
2. **Operator:** có thể làm T1 với bản `FF5CD95B` trong STG, `writeMode=off`, chỉ mở GR03878 để chụp khung hai tab và Copy response `inter-tenant-orders/receiving?q=SOBD1593858` (kèm `total`). Không chuyển `confirm`/`auto`; không bấm xác nhận nhận hàng chỉ để thử T1.
3. **Operator / Nextwaves / Buymed:** cho biết cách gỡ K1 hoặc SO staging khác nhận được qua **đường inter-tenant**. Sau một lượt nhận thật được operator cho phép: cung cấp response 2xx `receive-scan`, GET PO, GET shipment, `/receiving` sau nhận (bỏ credential). Mẫu hub-order đã có không thay thế lượt này.
4. **Operator:** khi các gate trên đạt, chỉ định một GR staging và cho phép riêng một lần thử W1; kiểm request/response PUT, GET GR trước/sau, số lượng từng detail và UID. Chưa có phép thử đó thì không bật ghi.

PM không kiểm trực tiếp phiên staging có đăng nhập, không chạy nhận hàng hay PUT. Những điều thiếu bằng chứng live là **chưa nghiệm thu**, không được gọi là lỗi server đã xác nhận.
