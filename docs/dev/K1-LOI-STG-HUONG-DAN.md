# Hướng dẫn operator — thử nhánh lỗi K1 trên PO28237814 (staging, v0.1.5)

Căn cứ: `docs/pm/AUDIT-T1-LIVE-v0.1.5-STG-20261025.md` mục "Quyết định cho lượt vận hành tiếp theo" và `state.md` §9 mục 21.
Đây là **một lượt ghi thật trên Nextwaves** (bấm "Xác nhận nhận hàng"). Chỉ làm khi operator tự quyết cho phép lượt này.
Dev và extension không bấm hộ.

## 1. Mục đích và giới hạn

- **Kiểm trên phiên thật:** khi Nextwaves từ chối nhận (`400 tagged_unit_unsupported`), extension báo lỗi trên tab Nextwaves, **không chuyển sang POS, không điền GR**.
- **Kiểm dữ liệu Nextwaves:** lượt 400 có làm đổi trạng thái phiếu gửi / đơn hay không. Màn quét ghi "Phiếu gửi này sẽ được chấp nhận trước, rồi mới nhận hàng", nên không giả định 400 = không đổi gì.
  - Dấu hiệu sẵn có, chưa phải bằng chứng: sau hai lượt 400 ngày 24/10, response T1 hôm nay vẫn cho đơn `shipped`, `updatedAt` 19/10, và màn quét vẫn báo "sẽ được chấp nhận trước".
- **Kết quả 400 không đạt gate T3.** T3 cần lượt nhận 2xx (sau khi gỡ K1 hoặc dùng SO khác).
- **Chỉ bấm một lần.** Không thử lại dù khung extension gợi ý "bấm xác nhận lại".
- **Không cấp phép điền** trong popup ở cả lượt này.

## 2. Chuẩn bị

- Extension v0.1.5 (`C:\circa-gr-nextwaves-v0.1.5`), Staging. Popup còn phiên `STG · GR03878 · Đã khớp đơn Nextwaves`, danh sách cấp phép trống.
- Có reader và 12 tem staging của PO28237814 (bộ tem đã dùng ngày 24/10).
- Mọi file chỉ lấy bằng **Copy response**: không cURL, không "Copy as fetch", không chép header.
- Nếu một request không xuất hiện thì ghi "không thấy" và đi tiếp, đừng tự gọi API.

## 3. Các bước

### A. Ghi trạng thái TRƯỚC lượt bấm

1. Mở tab mới `https://circa-stg.nextwaves.app/vi/purchases/55bd221f-65de-4a4d-8a77-40c568a6f176` (trang chi tiết PO28237814). **Không bấm nút nào trên trang này** (chấp nhận / từ chối / ghép sản phẩm / nhận hàng).
2. F12 → Network, rồi F5. Copy response các request sau (lọc theo chuỗi trong ngoặc):
   - `inter-tenant-shipments/34e67fb9-…` (lọc `34e67fb9`) → `K1-truoc-shipment.json`;
   - `purchase-orders/55bd221f-…` (lọc `purchase-orders/55bd`) → `K1-truoc-po.json`;
   - nếu có `…/55bd221f-…/receiving` → `K1-truoc-receiving.json`.
3. Chụp ảnh trang chi tiết PO (phần trạng thái phiếu gửi) → `K1-truoc-po.jpg`.

### B. Lượt bấm (ghi Nextwaves, một lần)

1. Sang tab `https://circa-stg.nextwaves.app/vi/purchases/receive?po=SOBD1593858`, F5. Khung extension phải là "Sẵn sàng nhận hàng".
2. F12 → Network → **tick "Preserve log"** → lọc `receive-scan`.
3. Quét **đúng 12 tem của đơn** (bảng ở §6) bằng reader ("Kết nối đầu đọc").
   - Để tem khác **xa reader**. Lượt 24/10 đầu tiên gửi 14 EPC, có 2 tem lạ `…7032A729` và `…7032A72B`.
   - Trước khi bấm, màn phải hiện **"Đã nhận 12 / 12"**, mỗi dòng đầy: 1110 3/3 + 3/3 vỉ, Soffell 2/2 chai, 5451 2/2 + 2/2 túi. Nếu hơn 12 hoặc có tem lạ: F5 trang và quét lại.
   - Reader không kết nối được (ví dụ tab POS khác đang giữ cổng) thì có thể gõ 12 EPC ở §6 vào ô "Quét hoặc nhập EPC", Enter sau mỗi mã. Ghi lại là đã gõ tay.
   - Nếu màn hỏi "Còn thiếu … xử lý đơn mua hàng thế nào?" thì chọn **"Giữ đơn mở"** (giống 24/10: `onMissing: keep_open`).
4. Bấm **"Xác nhận nhận hàng" một lần**. Có hộp xác nhận thì xác nhận một lần.
5. Copy response request `POST …/inter-tenant-shipments/34e67fb9-…/receive-scan` → `K1-receive-scan.json`. Ghi HTTP status (cột Status) và giờ bấm.
6. **Chưa F5.** Chụp khung extension trên tab này → `K1-khung-nextwaves.jpg` (thông báo lỗi chỉ nằm trên trang đang mở; tải lại là mất). Kỳ vọng:
   - tiêu đề **"Nextwaves CHƯA nhận (HTTP 400)"**;
   - dòng "Dòng có thẻ không nhận được theo đơn vị này … [INTER_TENANT_SHIPMENT_LINE_INVALID / tagged_unit_unsupported]";
   - câu "Extension chưa chuyển về POS".
7. Chụp cả màn Nextwaves (thông báo lỗi của chính Nextwaves) → `K1-man-nextwaves.jpg`.

### C. Ghi trạng thái SAU lượt bấm

1. Lặp lại bước A.2 trên tab chi tiết PO (F5 lại), lưu thành `K1-sau-shipment.json`, `K1-sau-po.json`, `K1-sau-receiving.json`. Chụp `K1-sau-po.jpg`.
2. Tab POS (GR03878): chụp khung extension → `K1-khung-pos.jpg`. Kỳ vọng vẫn là "Đã khớp đơn Nextwaves — chờ nhận hàng", không có kế hoạch điền.
3. Trên POS, GR03878 vẫn "Chờ nhận hàng", không có UID nào: F12 → Network, lọc `goods-receipt/2de6c0ec`, F5, Copy response → `K1-sau-gr.json`.
4. Popup: chụp → `K1-popup.jpg`. Kỳ vọng phiên vẫn "Đã khớp đơn Nextwaves", không "Khoá điền", không cấp phép.

## 4. Nếu kết quả khác kỳ vọng

| Thấy | Làm |
|---|---|
| `receive-scan` trả **2xx** (Nextwaves đã sửa K1?) | **Không cấp phép điền.** Extension sẽ đọc kết quả rồi đưa về POS. Khung POS là "Chỉ xem kế hoạch — chưa có cấp phép điền", hoặc khung báo kế hoạch bị chặn kèm lý do. Vẫn làm đủ bước C, chụp khung hai tab. Bộ file này là bằng chứng T3 cho PM / dev |
| 400 nhưng `reason` khác `tagged_unit_unsupported` | Dừng, không thử lại. Gửi đủ file như trên |
| Khung extension Nextwaves không đổi sau khi bấm, hoặc báo "Lỗi extension …" | Chụp khung + gửi `K1-receive-scan.json`; không bấm lại |
| Khung POS tự chuyển sang kế hoạch / điền khi Nextwaves trả 400 | **Lỗi nghiêm trọng của extension.** Dừng, không cấp phép, gửi ngay |
| Trang chi tiết PO sau lượt bấm cho thấy phiếu gửi đổi trạng thái (đã chấp nhận…) | Ghi lại. Đây là dữ liệu PM cần, chưa phải lỗi extension |

## 5. Gửi lại

- Ảnh: `K1-truoc-po.jpg`, `K1-khung-nextwaves.jpg`, `K1-man-nextwaves.jpg`, `K1-sau-po.jpg`, `K1-khung-pos.jpg`, `K1-popup.jpg`.
- JSON (Copy response):
  - `K1-truoc-shipment.json`, `K1-truoc-po.json`, `K1-truoc-receiving.json` (nếu có);
  - `K1-receive-scan.json`;
  - `K1-sau-shipment.json`, `K1-sau-po.json`, `K1-sau-receiving.json` (nếu có), `K1-sau-gr.json`.
- Kèm HTTP status của `receive-scan` và giờ bấm.

## 6. 12 EPC của phiếu gửi IT-BUYMED-STAG-20261019092009-7938

Nguồn: `samples/nw-stg-shipment-34e67fb9-PO28237814.json`. Lượt 24/10 thứ hai gửi đúng 12 mã này.

| Dòng | Lô / hạn | EPC |
|---|---|---|
| 1110 (3 vỉ) | 261009DHAUS · 12/12/2028 | `E280F302000000017032E72B`, `E280F302000000017032E72A`, `E280F302000000017032C72A` |
| 1110 (3 vỉ) | A1 · 12/12/2029 | `E280F302000000017032872B`, `E280F3020000000170328729`, `E280F3020000000170328728` |
| 2431732 Soffell (2 chai) | — | `E280F302000000017032C729`, `E280F302000000017032C728` |
| 5451 (2 túi) | 261009KSDHAU · 12/12/2028 | `E280F302000000017032A72A`, `E280F302000000017032A728` |
| 5451 (2 túi) | A1 · 12/12/2028 | `E280F302000000017431E72B`, `E280F302000000017431E72A` |

Dev sẽ:
- so trước / sau (trạng thái phiếu gửi, `receivedEpcs`, `receipts`, `updatedAt`) và đối chiếu khung / phiên với log của extension;
- lưu mẫu vào `samples/` (bỏ token / tên nhân viên);
- báo PM.
