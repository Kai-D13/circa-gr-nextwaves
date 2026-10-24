# Spec v0.1 — GR POS ↔ PO Nextwaves, staging

Ngày: 24/10/2026. Trạng thái: **PM giao được B1 chỉ đọc; B2–B4 phụ thuộc gate; chưa cho phép thao tác ghi**. Các quyết định nghiệp vụ ở §2 là đề xuất để operator/stakeholder chốt. Phạm vi thử: POS staging, cửa hàng 2222, Nextwaves `circa-stg`, kho `82bf85e4-84e2-4158-ae27-1aaa6fe1bc57`. Cặp đối chiếu: GR03877 / PO00006745 ↔ PO28237814. Production chỉ là nguồn đối chiếu, chưa là môi trường nghiệm thu.

## 1. Bằng chứng và giới hạn

| Mức | Kết luận |
|---|---|
| Đã kiểm từ file | GR03877 ở trạng thái `WAITING_TO_RECEIVE`, 3 dòng, `received_quantity=0`; PO28237814 ở trạng thái `CONFIRMED`, 3 dòng, 12 UID trong đơn inter-tenant, chưa có receipt. Ba cặp `product_id` POS ↔ hậu tố `mappedProduct.sku` Nextwaves và `base_quantity` ↔ `localQuantity` đều khớp. PO POS staging tạo tay, không có SO. |
| Dev tự báo | Chưa có dev implementation hoặc kết quả test. |
| Đã thấy trên môi trường thật | `state.md` ghi nhận capture production 19/10 và dữ liệu staging do operator lấy 24/10; PM phiên này chưa trực tiếp thao tác trên phiên đăng nhập staging. |
| Còn thiếu | D1–D4 tại `state.md` §6: hành vi tìm kiếm/danh sách Nextwaves, PO/receiving detail, QR lookup staging và chuỗi máy quét; thêm cách web Nextwaves xác thực. Chưa có bằng chứng nhận xong sẽ trả UID theo schema nào hoặc mỗi UID tăng đúng một đơn vị GR. |

**Phát hiện khi kiểm mẫu:** `units[].lineId` của inter-tenant order **khác** `lines[].lineId`: 5 ID của các nhóm UID đều không nằm trong 3 ID dòng đơn. `units[]` chỉ có `productTitle`, `lineId`, `epc`, `uid` và thông tin shipment; không có `product_id`, SKU hay lô. Không được ghép UID vào sản phẩm bằng `lineId` của hai mảng này hoặc bằng tên hàng. D3 phải chỉ ra quan hệ dòng shipment → dòng PO/sản phẩm và lô trước khi tự động áp UID.

## 2. Quyết định thiết kế đề xuất

1. **Ghép GR → PO:** đọc GR theo ID từ URL; đọc PO POS bằng `purchase_order_id`; xác nhận GR nằm trong `goods_receipts`, cùng `pos_id`. Trên staging không có SO nên liệt kê *đầy đủ* PO Nextwaves còn mở của đúng kho (phân trang, kiểm lỗi/giới hạn), rồi đối chiếu tập đa dòng `(product_id, base_quantity)` với `(mappedProduct.sku = CIRCA-<product_id>, localQuantity)`. Không cộng gộp dòng trùng, không so tên hoặc `localUnit`. Mọi kết quả chỉ là **ứng viên**. Hiện số PO, kho, trạng thái, dòng hàng và cho người dùng xác nhận. Nhiều ứng viên: người dùng chọn sau khi đối chiếu chứng từ; không tự chọn. Không có ứng viên, thiếu trang, thiếu trường hoặc schema khác mẫu: dừng, báo lý do; không cho chọn tùy ý để tiếp tục ghi.
2. **Đường SO cho production:** sau này ưu tiên A nếu D1/T1 chứng minh `q` tìm đúng `refId`; nếu không, B với giới hạn số gọi và phân trang đầy đủ. Dù tìm bằng SO vẫn đối chiếu kho, trạng thái, chứng từ giao và dấu vân tay E; SO không đủ để phân biệt nhiều lần giao. Hướng C là yêu cầu backend dài hạn, không thuộc v0.1. Không đưa đường SO vào gate staging vì PO00006745 không có SO.
3. **Xác thực:** dùng phiên đăng nhập POS và Nextwaves của operator trong đúng tab, đúng tenant; extension không lưu token/JWT/cookie. Cơ chế gọi Nextwaves phải được xác minh qua D3 và khảo sát frontend: nếu content script không thể gọi API dưới phiên web một cách tin cậy, dev đề xuất bridge chỉ chuyển dữ liệu cần thiết trong bộ nhớ, rà quyền truy cập và vòng đời token trước khi code. JWT hết hạn → yêu cầu đăng nhập lại, không tự ghi token vào cấu hình/file. Không dùng khoá API cho v0.1 khi chưa có bằng chứng quyền.
4. **Áp UID vào GR:** hướng ưu tiên là phát lần lượt chuỗi quét qua ô “Scan QR tăng SL nhận” của POS để POS tự tra QR và ghép lô. Đây vẫn là thao tác **ghi thật**. Không gọi trực tiếp PUT/POST detail ở v0.1. Chỉ mở batch ghi khi D3, D4 chứng minh UID ↔ sản phẩm/lô, QR staging tra được và mỗi UID tăng đúng đơn vị GR. Nếu một trong các điều kiện không đạt, giữ chế độ xem/đối chiếu; không cố ép số lượng hoặc tự tạo lô.
5. **Hoàn thành và sai lệch:** dược sĩ/operator bấm `HOÀN THÀNH` trên POS sau khi kiểm số lượng, lô và QR. Extension không gọi `status/COMPLETED`. Nhận thiếu/thừa ở Nextwaves, UID trùng, UID không tra được, sai PO, lệch đơn vị (R1), lệch lô, thay đổi GR/PO trong lúc làm: dừng trước khi ghi hoặc dừng ngay khi phát hiện; báo dữ liệu đã ghi, không tự thử lại hay tự bù. Cần quyết định nghiệp vụ Q1–Q4/Q7 cho cách xử lý sau đó.

## 3. Hợp đồng và bất biến chung

- Cấu hình là một gói MV3 với chế độ `STG`/`PRD` hoặc URL được chuẩn hoá vào *allowlist* host và path của môi trường tương ứng. `manifest.json` có quyền cả hai môi trường; runtime kiểm origin của tab POS, API POS, tab/API Nextwaves, tenant, `pos_id` và kho trước **mọi** thao tác. URL tuỳ ý không mở quyền host lạ hoặc tạo môi trường lai. STG tuyệt đối không gọi PRD, PRD không gọi STG, host lạ không làm gì. Staging chỉ bật khi `pos_id=64a8663b-0c9e-49c6-9626-0a4c7c4bd53d`.
- Chỉ xử lý GR ở trang `/danh-sach-phieu-nhan-hang/<grId>` và trạng thái cho phép nhận; GR/PO POS phải cùng cửa hàng và liên kết hai chiều. Không suy diễn `pos_id` từ mẫu production. Không log token, cookie, full response chứa dữ liệu nhạy cảm; log kỹ thuật che thông tin xác thực.
- Mỗi ứng viên Nextwaves phải thuộc kho staging đã chốt, tenant đúng, trạng thái còn nhận được, fingerprint khớp hoàn toàn và được người dùng xác nhận. Kết quả search thiếu trang hoặc timeout không được coi là “duy nhất”. Không dùng 12 UID dự kiến của shipment như bằng chứng đã nhận: sau QC phải đọc lại trạng thái/receipt và danh sách UID **đã nhận** từ API được xác minh.
- Trước khi ghi POS: kiểm lại GR/PO hiện thời, trạng thái Nextwaves đã nhận xong, UID duy nhất và có ánh xạ sản phẩm/lô tin cậy, tra QR từng UID trên POS staging, `circaReceiptCode` khớp `purchase_order_code` của GR, số lượng theo **đơn vị quét thực tế** không vượt từng dòng/detail; không còn QR đó trên GR. Nếu không chứng minh được ánh xạ 1 UID ↔ lượng tăng trên GR, chặn cả batch.
- Sau mỗi lượt quét: đợi POS xác nhận cập nhật, GET lại GR và xác minh đúng UID đúng detail, `received_quantity` tăng đúng lượng dự kiến. Mất kết nối/đóng tab/trang đổi/giá trị khác kỳ vọng → dừng, hiện danh sách đã xác nhận và chưa xác nhận; operator xử lý thủ công trước khi chạy tiếp. Không tự phát lại UID. Không coi QR trùng sau `COMPLETED` là hai đơn vị nhận.

## 4. Batch và gate

### B1 — Nền tảng chỉ đọc

- **Phạm vi:** cấu hình môi trường, nhận diện tab, đọc GR và PO POS, đọc thông tin Nextwaves qua phiên đăng nhập; hiển thị liên kết và lỗi. Không có nút ghi.
- **Module dự kiến:** `src/manifest.json`, `src/env.js`, `src/background.js`, `src/pos-content.js`, `src/nw-content.js`, `src/core/pos-read.js`, `src/core/nw-read.js`, `src/popup/`; `tests/env.test.js`, `tests/read-contract.test.js`.
- **Hợp đồng:** `GR{id,code,status,purchase_order_id,purchase_order_code,pos_info.id,items[]}`; `PO_POS{id,code,pos_id,goods_receipts[],sale_order_number,thuocsi_delivery_code[]}`; Nextwaves read response giữ nguyên ID, tenant/kho/status, không suy ra UID đã nhận từ `units[]` dự kiến.
- **Lỗi:** chưa đăng nhập, JWT hết hạn, sai tenant/cửa hàng, 401/403/404, timeout, trang chuyển hướng, schema thiếu, tab khác môi trường.
- **Gate:** test Node `node --test` báo số pass/fail thật; kiểm STG/PRD/host lạ bằng test; trên staging 2222 hiển thị GR03877/PO00006745, đọc được đúng tenant/kho Nextwaves qua GET; không có POST/PUT/DELETE trong Network; không có token trong log/file. PM audit DIFF và kết quả trước B2.

### B2 — Tìm và xác nhận PO, chỉ đọc

- **Phạm vi:** liệt kê đầy đủ PO mở cùng kho, chuẩn hoá fingerprint, cho operator xác nhận PO; hiển thị căn cứ ghép và trường hợp mơ hồ. Chưa điều hướng vào tác vụ nhận tự động.
- **Module dự kiến:** `src/core/fingerprint.js`, `src/core/po-candidates.js`, UI trong `src/popup/`; `tests/fingerprint.test.js`, `tests/candidates.test.js`.
- **Hợp đồng:** mỗi dòng POS `(product_id, base_quantity)` và dòng Nextwaves `(mappedProduct.sku, localQuantity)`; so theo multiset với số lần xuất hiện. Candidate `{poId,number,warehouseId,status,matchedLines,source,confirmedByUser}` chỉ tồn tại trong phiên, không lưu token/UID.
- **Lỗi:** 0/2+ kết quả, PO thiếu trường, dòng trùng, phân trang không hết, PO đổi trạng thái, SO rỗng. Khi 0 kết quả: chỉ hiển thị chẩn đoán, không mở đường ghi.
- **Gate:** fixture staging 3/3 cho đúng PO; test đối chứng sai 1 sản phẩm, sai lượng, trùng dòng, 2 PO giống nhau, thiếu trang đều không tự chọn; staging 2222 tìm được PO28237814 rồi operator xác nhận; không có mutation trên Network. Nếu API danh sách/chi tiết không đủ trường, dừng B2 và bổ sung hợp đồng từ D1–D3.

### B3 — Theo dõi QC và đối chiếu UID, chỉ đọc

- **Phạm vi:** mở đúng PO Nextwaves để operator QC bằng reader; sau khi operator báo xong, GET lại receipt/receivedUnits, xác định UID đã nhận; lập bảng đối chiếu UID → QR POS → dòng/detail GR và lượng dự kiến. Chỉ tạo báo cáo “đủ điều kiện ghi” hoặc lý do chặn.
- **Module dự kiến:** `src/core/received-units.js`, `src/core/qr-preflight.js`, UI trạng thái trong `src/popup/`; `tests/received-units.test.js`, `tests/qr-preflight.test.js`.
- **Hợp đồng:** UID nhận thực tế phải lấy từ response có trạng thái nhận xác thực; mapping shipment line → sản phẩm/lô phải có khoá trong API, không dựa vào `productTitle`; QR lookup `{code,productId,circaReceiptCode,lot,expiredDate,circaUnitName}` theo response thật D4.
- **Lỗi:** PO vẫn `CONFIRMED`, QC thiếu/thừa, UID trùng, thiếu mapping lô, QR 404/sai PO, lệch đơn vị, GR đã được người khác sửa, JWT hết hạn. Mọi lỗi chặn ghi.
- **Gate:** D3/D4 được lưu thành mẫu đã bỏ bí mật và hợp đồng trường rõ ràng; test đủ/thiếu/thừa/trùng/sai PO/R1/lô khác; staging 2222 hiển thị 12 UID dự kiến là **chưa nhận** trước QC và không cho ghi. Một lượt QC thật trên Nextwaves là thao tác ghi, chỉ operator thực hiện sau khi cho phép riêng lượt đó; extension chỉ GET để kiểm UID nhận thực tế. Nếu chưa có QC thật thì B3 chưa đạt, không mở B4.

### B4 — Áp UID vào POS staging, chỉ khi được phép từng lần

- **Điều kiện mở:** PM audit B1–B3 đạt; operator cho phép **riêng lần ghi cụ thể** trên GR staging xác định; dược sĩ xác nhận số lượng/lô/đơn vị. Dev không tự tạo dữ liệu QC trên Nextwaves để chạy test.
- **Phạm vi:** operator bấm bắt đầu áp UID; extension phát chuỗi quét tuần tự vào ô POS và kiểm lại từng kết quả. Không bấm hoàn thành GR.
- **Module dự kiến:** `src/core/replay-plan.js`, `src/core/replay-runner.js`, `src/pos-content.js`, UI tiến độ; `tests/replay-plan.test.js`, `tests/replay-stop.test.js`.
- **Hợp đồng:** immutable plan trong bộ nhớ `{grId,poPosId,poNwId,expectedGrVersion/quantities,uidSteps[]}`; mỗi bước có UID, QR lookup, dòng/detail và lượng tăng dự kiến. Không lưu token. Tiến độ chỉ dựa vào GET GR xác nhận sau từng bước.
- **Lỗi:** người dùng đổi tab/chế độ, GR thay đổi, scan API báo lỗi, số lượng sai, mất mạng, refresh, một UID không rõ đã ghi hay chưa. Dừng an toàn và yêu cầu kiểm GR trước mọi tiếp tục.
- **Gate:** test lập plan chặn mọi sai lệch; thử trên GR staging được operator chỉ định, đối chiếu số UID khác nhau và `received_quantity` từng detail trước/sau, không vượt lượng, không trùng UID; kiểm Network không có `status/COMPLETED` hoặc API ghi trực tiếp của extension. PM audit bằng số test runner nguyên văn, DIFF, kết quả staging, rủi ro còn mở. Mỗi lần ghi thật cần operator cho phép lại.

Chỉ sang batch kế sau khi PM cho qua gate hiện tại. Mỗi bản runtime đưa lên máy phải tăng version, tạo ZIP và SHA-256 mới; không ghi đè gói đã phát hành. Trước commit phải chạy lệnh quét bí mật trong `agent.md` §7. Quy trình nhánh đề xuất: một `batch/*` và một PR/batch; operator merge sau PM audit. Repo hiện public, chưa push tài liệu/mẫu nội bộ lên remote trước khi operator quyết định quyền riêng tư.

## 5. Dữ liệu tối thiểu cần operator cung cấp

Lấy **Copy response** từ DevTools Network trên staging; xoá token/cookie nếu có, không gửi cURL. Không bấm nhận/hoàn thành trong lúc khảo sát.

1. **D1:** response `inter-tenant-orders?...q=SOBD1593858` và `?...q=1593858`, kèm phân trang/tổng số; xác nhận có tìm theo `refId` hay không.
2. **D2:** response danh sách PO mở của kho staging, phân trang và response tìm `PO28237814`; cần biết API có đủ `mappedProduct.sku`, `localQuantity`, kho, trạng thái để tìm ứng viên không.
3. **D3:** mọi response GET khi mở PO28237814, nhất là PO detail, `receiving`, shipment/line và receipt; cần quan hệ `units[].lineId` với dòng sản phẩm/lô và cách nhận biết UID **đã nhận**. Cho biết web Nextwaves dùng phiên đăng nhập để gọi API ra sao, không gửi credential.
4. **D4:** QR lookup staging cho `1792145819958AA1` và `1792379177779AA1`, cộng chuỗi máy quét thực gõ ra trong Notepad; cần đơn vị mỗi QR và lô. Không quét trên GR.
5. **Q3/Q4/Q7:** operator/stakeholder xác nhận ai bấm hoàn thành; cách xử lý nhận thiếu/thừa; hai dòng giao cùng sản phẩm có khác lô không. Q1/Q2/Q5/Q6 còn là quyết định nghiệp vụ/kiến trúc cho production hoặc batch ghi.

`D5` (tìm GR theo SO trên staging) không chặn B1–B3 vì PO00006745 không có SO; có thể thu sau để hiểu hành vi UI. Không yêu cầu dữ liệu production để nghiệm thu v0.1 staging.
