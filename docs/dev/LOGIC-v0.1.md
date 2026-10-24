# Logic tính năng — Nhận hàng POS qua Nextwaves (dev đề xuất v0.1, 24/10/2026)

> **ĐÃ ĐƯỢC THAY bởi [`LOGIC-v0.2.md`](LOGIC-v0.2.md)** (24/10 chiều). Ba điểm chính đã đổi:
> - Không có nút "Nhận bằng RFID": mở GR là extension tự chạy.
> - Có hai đường vào: trang GR và trang `/chi-tiet-so`.
> - Nextwaves đã tự ghi GR Circa qua tích hợp Circa.
>
> Giữ file này để tra cứu.

Người viết: dev-team. **Đề xuất để PM audit và đưa vào spec**, chưa phải quyết định đã chốt.
Nguồn: giải thích luồng của operator 24/10, các mẫu trong `samples/`, mã trang GR của POS (capture 19/10), bundle web Nextwaves.
Mức bằng chứng ghi ở cuối mỗi mục: **[file]** = đã kiểm từ mẫu; **[giả thuyết]** = chưa có dữ liệu chứng minh.

## 0. Một tính năng duy nhất

> Dược sĩ mở phiếu nhận hàng (GR) trên POS → bấm **"Nhận bằng RFID"** → extension mở **đúng PO Nextwaves** của lô hàng đó →
> dược sĩ đặt hàng lên reader và bấm **"Xác nhận nhận hàng"** trên Nextwaves → extension lấy kết quả đã nhận →
> ghi số lượng + mã QR (UID) vào **GR trên POS** → dược sĩ kiểm và bấm **HOÀN THÀNH** như bình thường.

Mục tiêu nghiệp vụ:
- Hàng vào kho Nextwaves theo từng UID / EPC, chính xác.
- Phiếu nhận trên POS khớp đúng những gì đã nhận ở Nextwaves.
- Dược sĩ vẫn bắt đầu và kết thúc trên POS.

## 1. Luồng thật và vì sao mã PO hai bên không khớp (operator giải thích 24/10)

1. thuocsi / Buymed tạo **SO** (`SOBD<số>`): danh sách hàng, product_id, UID, EPC đã map. Lúc này **chưa có PO POS**.
2. Buymed đẩy SO sang Nextwaves → Nextwaves sinh **inter-tenant order** (`refId` = `SOBD<số>-<hậu tố>`) và **PO Nextwaves riêng** (ví dụ PO28237814). Số PO này **không bao giờ** trùng PO POS.
3. Khi Buymed **giao thành công**, POS mới sinh **PO POS** (`source_type` SO_THUOCSI, `sale_order_number` = `<số>`) và **GR** (`created_by` = Hệ thống).
4. ⇒ Khoá nối hai bên là **số SO**, không phải số PO. Lúc dược sĩ mở GR, PO Nextwaves đã tồn tại (đã ở trạng thái shipped / CONFIRMED). **[file]**

## 2. Khoá liên kết

| Cần nối | Khoá | Ví dụ staging | Nguồn |
|---|---|---|---|
| GR → PO POS | `GR.purchase_order_id`; kiểm ngược `grId ∈ PO.goods_receipts` | GR03878 → PO00006750 | **[file]** |
| PO POS → SO | `PO.sale_order_number` (số); kiểm thêm cụm số trong `thuocsi_delivery_code[]` | "1593858", "SOBD1593858-F" | **[file]** |
| SO → đơn Nextwaves | cụm số đầu tiên của `refId` = số SO | "SOBD1593858-1056745" → PO28237814 | **[file]** |
| Sản phẩm | `product_id` POS = phần sau "CIRCA-" của `sku` Nextwaves (**không** dùng `externalProductId`, null 2/3 ở staging) | 1110 ↔ CIRCA-1110 | **[file]** |
| UID → sản phẩm, đơn vị (trước khi nhận) | `GET /inter-tenant-orders/purchase-orders/<poId>/receiving` → `shipments[].lines[]` {productId, sku, quantity, **unit**, units[{epc, unitUid}]} | 5 dòng giao, quantity = số UID 5/5 | **[file]** |
| UID đã nhận (sau khi nhận) | `GET /purchase-orders/<poId>` → `items[].receivedUnits[]` {epc, unitUid, receiptNumber}; `receipts[]` | mẫu production PO62830114 | **[file]** (production) |
| UID → lô POS | tra QR trên POS (`thuocsi-warehouse/qrcode?code=<uid>`) → `lot` + `expiredDate` → detail có `lot_date` = `lot-ddmmyy` | chưa có dữ liệu staging (D4) | **[giả thuyết]** |
| Lượng | 1 UID = 1 đơn vị `line.unit` của dòng giao; đổi sang POS bằng `retail_units[].convert_rate` cùng tên đơn vị | 1 vỉ = 2 viên; hộp 1110 = 6 viên → 3 UID = 1 hộp | **[file]** |

## 3. Phiên nhận và máy trạng thái

Mỗi lần dược sĩ bấm "Nhận bằng RFID" tạo **một phiên nhận**:
- Khoá: `env + grId`.
- Lưu trong `chrome.storage.local`, **không lưu token**.
- Trường: `{env, posId, grId, grCode, poPosId, poPosCode, soNumber, nwOrderId, nwPoId, nwPoNumber, state, plan, steps[], log[]}`.
- Mọi bước ghi đều có bản ghi trước và sau.

```
idle → resolving_pos → finding_nw → mapped → receiving_nw → received → planning → plan_ok → applying → applied → done
              ↓               ↓                      ↓            ↓            ↓                    ↓
           stopped(lý do) ... (mọi trạng thái đều có thể dừng có lý do; không tự quay lui để ghi lại)
```

### S0 `idle` — điều kiện hiện nút
- Đang ở `<POS>/danh-sach-phieu-nhan-hang/<grId>`, host khớp chế độ môi trường đã chọn (STG / PRD).
- Phiên POS thuộc cửa hàng hợp lệ: STG chỉ 2222; PRD theo phiên.
- `GR.status` ∈ {WAITING_TO_RECEIVE, RECEIVING}.
- Không có phiên khác đang chạy cho cùng `grId`.

### S1 `resolving_pos` — chỉ đọc POS
1. `GET goods-receipt/<grId>` → chụp **ảnh gốc GR**: items, details, `received_quantity`, `thuocsi_qr_codes`, `updated_at`.
2. `GET pos/<posId>/po/<poId>` → kiểm:
   - `pos_id` trùng;
   - `grId ∈ goods_receipts`;
   - `source_type` = SO_THUOCSI;
   - `sale_order_number` không rỗng;
   - cụm số trong `thuocsi_delivery_code` trùng `sale_order_number`.
3. Thiếu SO (ví dụ GR03877 tạo tay) → `stopped: no_so`. v0.1 **không hỗ trợ** GR không có SO (đề xuất, cần PM chốt).

### S2 `finding_nw` — chỉ đọc Nextwaves (chạy trong tab Nextwaves, xem §6)
1. Tìm đơn inter-tenant theo SO:
   - Cách A: `GET /inter-tenant-orders?direction=outbound&q=SOBD<số>`. **Chưa kiểm `q` có tìm theo refId không** (D1).
   - Cách B (dự phòng): `GET /purchase-orders/open?warehouseId=<kho>`, rồi gọi `GET /inter-tenant-orders/purchase-orders/<id>` từng PO để lấy `refId`. Phải phân trang hết.
2. Lọc ứng viên:
   - `counterparty.tenantSlug` = `buymed` (PRD) hoặc `buymed-stag` (STG);
   - `direction` outbound;
   - `warehouse.id` = kho đã cấu hình cho cửa hàng;
   - cụm số đầu của `refId` = số SO;
   - trạng thái không phải rejected / cancelled.
3. Với mỗi ứng viên: `GET …/receiving`, rồi **kiểm dấu vân tay**:
   - Mỗi sản phẩm: Σ(số UID × `convert_rate` POS của `line.unit`) = `base_quantity` của dòng GR.
   - Tập sản phẩm hai bên trùng nhau.
4. Kết quả:
   - **Đúng 1** ứng viên khớp → `mapped`.
   - **0** → `stopped: nw_not_found`, kèm bảng chênh lệch. Ví dụ: PO76458756 có cùng sản phẩm nhưng Soffell 1 chai so với 2 chai của GR03878 → không khớp **[file]**.
   - **≥ 2** → `stopped: nw_ambiguous`. Hiện danh sách để người dùng chọn hay dừng hẳn: cần PM chốt.
   - Ứng viên đã nhận xong từ trước (có `receipts`, PO RECEIVED) mà GR chưa ghi → cho đi thẳng tới `received` (nối lại phiên).

### S3 `mapped` → mở trang Nextwaves
- Mở / chuyển tab tới `https://<tenant>.nextwaves.app/vi/purchases/<nwPoId>`.
- Hiện thanh trạng thái: "Đang nhận cho GR03878 (PO00006750) — SO 1593858".

### S4 `receiving_nw` — dược sĩ thao tác, extension **chỉ quan sát**
- Dược sĩ đặt hàng lên reader và bấm **"Xác nhận nhận hàng"**. Nextwaves gọi `POST /inter-tenant-shipments/<shipmentId>/receive-scan` (thấy trong bundle web).
- Extension **không bấm hộ** và không gọi API ghi của Nextwaves.
- Tín hiệu hoàn tất lấy từ **response** của lời gọi đó, không dựa vào việc click DOM.
- Khi thấy response thành công:
  - `GET /purchase-orders/<nwPoId>`;
  - `GET /inter-tenant-orders/purchase-orders/<nwPoId>`.
- Điều kiện `received`:
  - PO `RECEIVED`;
  - receipt có `missingQuantity` = 0;
  - `unexpectedEpcs` rỗng.
- Nhận thiếu (`keep_open`) → `stopped: nw_partial` (v0.1 không ghi phần thiếu; chính sách Q4 do PM chốt).

### S5 `planning` — chỉ đọc, dựng kế hoạch ghi
1. **UID đã nhận** = `receivedUnits` của PO Nextwaves.
   - Phải nằm trong danh sách UID dự kiến của `/receiving`.
   - UID lạ, thiếu hoặc trùng → chặn.
2. Mỗi UID tra QR trên POS, rồi kiểm:
   - `productId` = `product_id` dòng GR;
   - `circaReceiptCode` = `purchase_order_code` của GR (nếu staging có trường này: D4);
   - `circaUnitName` = `line.unit` của dòng giao.
3. Gán UID vào **detail** có `lot_date` = `lot`-`ddmmyy(expiredDate)`. Không có detail khớp → chặn (v0.1 không tạo lô / detail mới).
4. UID đã có trong `thuocsi_qr_codes` của bất kỳ detail nào trong GR → bỏ qua (đã ghi), không ghi lại.
5. Tính cho mỗi detail:
   - `delta` = Σ(lượng gốc của UID) ÷ `convert_rate` của đơn vị dòng.
   - **Phải là số nguyên** và `received_quantity + delta ≤ quantity`.
   - Lẻ hoặc vượt → chặn dòng đó.
6. Mỗi dòng GR: tổng đã nhận sau kế hoạch = `quantity` (đủ), hoặc đánh dấu dòng thiếu.
   - Mã QR trên GR không có trong kết quả Nextwaves (do dược sĩ quét tay) → **chặn**, vì hai bên không nhất quán.
7. Hiện bảng kế hoạch cho dược sĩ: mỗi dòng có cần nhận / Nextwaves đã nhận / sẽ ghi / lý do chặn.

**Ví dụ GR03878 ↔ PO28237814** (theo giả thuyết dòng giao = lô, chờ D4):

| Dòng GR | Detail (lô) | UID | Lượng gốc | Ghi `received_quantity` |
|---|---|---|---|---|
| 1110 (2 hộp, 1 hộp = 6 viên) | A1-121229 | 3 vỉ | 6 viên | 1 hộp |
| | 261009DHAUS-121228 | 3 vỉ | 6 viên | 1 hộp |
| 5451 (2 hộp, 1 hộp = 20 viên) | 261009KSDHAU-121228 | 2 túi | 20 viên | 1 hộp |
| | A1-121228 | 2 túi | 20 viên | 1 hộp |
| 2431732 (2 chai) | 261016KHASUFDB-060627 | 1 chai | 1 | 1 chai |
| | A98-060627 | 1 chai | 1 | 1 chai |

→ 6 lời ghi, mỗi detail một lời; 12 UID.

### S6 `applying` — GHI POS (chỉ khi operator cho phép, gate B4)
Mỗi detail làm tuần tự:
1. `GET` lại GR. Detail phải còn đúng như ảnh gốc của kế hoạch (`received_quantity`, `thuocsi_qr_codes`). Khác → dừng.
2. Ghi bản ghi `sending` vào phiên.
3. Gọi `PUT goods-receipt/<gr>/item/<item>/detail/<detail>` với body
   `{detail:{received_quantity: <đích tuyệt đối>, lot_id, thuocsi_qr_codes:[UID của detail]}}`.
4. `GET` lại GR. Kiểm `received_quantity` = đích, và mọi UID có trong `thuocsi_qr_codes` (đã loại trùng). Ghi `done` hoặc `failed`.

Quy tắc an toàn:
- `received_quantity` là **giá trị tuyệt đối** (capture 19/10), nhưng `thuocsi_qr_codes` là **nối thêm**.
- Vì vậy **không gửi lại khi chưa đọc lại GR**: gửi lại mù sẽ nhân đôi mã.
- Bước đang `sending` mà mất kết nối / tải lại trang → đọc lại GR để quyết định, không tự gửi.

**Phương án ghi** (PM chốt, R11):
- **(Dev đề xuất) Gọi trực tiếp `PUT detail`** với lượng đã quy đổi và nhiều UID một lần. Đây là cách duy nhất ghi đúng khi 1 UID ≠ 1 đơn vị dòng (1110, 5451).
  - Cần **1 phép thử hợp đồng ghi trên staging**, có operator cho phép: server có nhận nhiều mã trong một lần và bước tăng > 1 không.
  - Hiện chỉ thấy POS tự gọi +1 với 1 mã mỗi lần.
- (Thay thế) Gõ lại UID vào ô quét của POS: chỉ đúng khi mọi UID = 1 đơn vị dòng. Với GR03878 sai ở 2/3 dòng.

### S7 `applied` → `done`
- Extension **không** gọi `status/COMPLETED` (đề xuất v0.1).
- Dược sĩ xem GR (số lượng, lô, mã) rồi bấm **HOÀN THÀNH** như bình thường.
- Extension nghe response `PUT …/status/COMPLETED` trên trang POS. Thấy thì `GET` GR lần cuối, đối chiếu UID (loại trùng: sau COMPLETED mã bị nhân đôi), rồi `done`.

## 4. Bất biến (vi phạm → dừng, ghi lý do, không ghi tiếp)

1. Không bao giờ gọi host của môi trường khác chế độ đang chọn. Không chạy với cửa hàng ngoài phạm vi.
2. Không ghi POS khi phía Nextwaves chưa `received`.
3. Không ghi khi tập UID đã nhận ≠ tập UID dự kiến (thừa / thiếu / lạ).
4. Không tạo lô, không tạo detail, không đổi đơn vị dòng, không đổi `qr_unit`.
5. Không ghi vượt `quantity` của detail. Không ghi lượng lẻ.
6. Mỗi UID ghi vào đúng một detail, đúng một lần.
7. Không gọi API ghi của Nextwaves. Không bấm nút trên Nextwaves hộ dược sĩ.
8. Không lưu token / cookie; log không chứa header xác thực.

## 5. Ma trận lỗi

| Tình huống | Trạng thái | Hiển thị / hành động |
|---|---|---|
| GR không có SO (tạo tay) | `stopped: no_so` | "Phiếu này không đến từ đơn Buymed — nhận như bình thường" |
| Không tìm thấy đơn Nextwaves / dấu vân tay lệch | `stopped: nw_not_found` | Bảng chênh lệch theo sản phẩm |
| Nhiều đơn Nextwaves khớp | `stopped: nw_ambiguous` | Danh sách (PM chốt cho chọn hay không) |
| Phiên Nextwaves hết hạn (401) | giữ trạng thái | "Đăng nhập lại Nextwaves", tiếp tục từ bước đang chờ |
| Nhận thiếu / thừa / UID lạ trên Nextwaves | `stopped: nw_partial` / `nw_unexpected` | Danh sách UID thiếu / lạ |
| UID tra QR lỗi / sai sản phẩm / sai PO / không có lô trên GR | `stopped: plan_blocked` | Từng UID + lý do |
| Lượng quy đổi lẻ hoặc vượt | `stopped: plan_blocked` | Dòng + con số |
| GR thay đổi giữa lúc lập kế hoạch và lúc ghi | `stopped: gr_changed` | Yêu cầu lập lại kế hoạch |
| Lỗi giữa chừng khi ghi | `stopped: apply_partial` | Detail nào xong / chưa xong, kèm số liệu GET lại |
| Dược sĩ đóng tab / tải lại | nối lại từ phiên đã lưu | Đọc lại GR và Nextwaves trước mọi bước |

## 6. Xác thực, môi trường, cấu hình

- **POS:** hook trong trang POS bắt header `Authorization` mà chính app POS gửi, chỉ giữ trong bộ nhớ.
  - Extension gọi API POS trong ngữ cảnh trang, kèm `x-client-id`, `x-store-id` giống app.
  - Staging cùng origin (`/backend/v1`); production khác origin (`api.v2.circa.vn`).
- **Nextwaves:** access token sống 1 giờ, web tự refresh (`/auth/refresh`).
  - Extension bắt Bearer từ request của chính app Nextwaves, trong tab Nextwaves.
  - Mọi lời gọi Nextwaves chạy **trong tab Nextwaves**.
  - Vì vậy bước S2 cần tab Nextwaves mở trước: mở trang trung tính (danh sách PO), tìm xong mới chuyển sang trang PO.
- **Cấu hình theo môi trường (env.js):**
  - host POS + tiền tố API;
  - tenant Nextwaves + API;
  - slug đối tác Buymed;
  - bảng **cửa hàng → kho Nextwaves**: STG 2222 → `82bf85e4…`; PRD Florita → `eb5e2b4f…`; cửa hàng khác thêm qua cấu hình.
- Chế độ STG / PRD hoặc URL nhập tay chỉ được ánh xạ vào danh sách host cho phép. Không mở host lạ.

## 7. Điểm cần PM / operator chốt

| # | Câu hỏi | Dev đề xuất |
|---|---|---|
| P1 | Cách ghi POS khi 1 UID ≠ 1 đơn vị dòng | `PUT detail` trực tiếp + 1 phép thử hợp đồng trên staging (có cho phép) |
| P2 | Extension tự bấm HOÀN THÀNH hay dược sĩ bấm | Dược sĩ bấm (v0.1) |
| P3 | Nextwaves nhận thiếu / thừa | Dừng, không ghi POS (v0.1) |
| P4 | Lô của UID không có trên GR | Dừng, không tạo lô (v0.1) |
| P5 | GR không có SO | Không hỗ trợ ở v0.1 |
| P6 | Nhiều đơn Nextwaves khớp cùng SO | Dừng; hoặc cho chọn khi có thêm căn cứ (PM chốt) |
| P7 | Bảng cửa hàng → kho Nextwaves lấy ở đâu | Cấu hình trong extension; production thêm từng cửa hàng |

## 8. Dữ liệu còn thiếu (chỉ đọc, operator lấy bằng Copy response)

1. **D4 — tra QR staging cho 12 UID của PO28237814.** Cần `lot`, `expiredDate`, `circaUnitName`, `circaReceiptCode` → chốt UID → detail. Thêm chuỗi máy quét gõ ra khi quét tem staging.
2. **`/receiving` của PO28237814** (cặp thật của GR03878).
3. **Lời gọi "Xác nhận nhận hàng"**: request + response của `POST /inter-tenant-shipments/<id>/receive-scan`, và `GET /purchase-orders/<id>` sau khi nhận. Lấy ở đơn thử nào operator cho phép nhận; đây là thao tác ghi của dược sĩ.
4. **D1:** `inter-tenant-orders?direction=outbound&q=SOBD1593858` và `q=1593858`.
5. PO76458756 thuộc SO nào (`refId`)? Theo dấu vân tay nó không phải PO của GR03878.
6. `qrUnitUids` (đang rỗng) và `needsAccept: true` có nghĩa gì trong luồng nhận của Nextwaves?
