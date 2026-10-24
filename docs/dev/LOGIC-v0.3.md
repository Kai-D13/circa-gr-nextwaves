# Logic tính năng — v0.3 (dev đề xuất, 24/10/2026 tối) — thay `LOGIC-v0.2.md`

Người viết: dev-team. **Đề xuất để PM audit**, chưa phải quyết định đã chốt.
Nguồn:
- Capture luồng đầy đủ operator gửi 24/10: POS `09-03-57`, Nextwaves PO28237814 `09-08-45`.
- Ảnh trang tích hợp Circa trên Nextwaves.
- JS POS staging (build `Xmi2WXwB8q2C8iMu0_ghb`) và web Nextwaves staging.
- Các mẫu trong `samples/`.

Mức bằng chứng: **[file]** = đã kiểm từ capture / JS / mẫu; **[giả thuyết]** = chưa chứng minh.

## 0. Chỉ đạo của operator (24/10)

1. **Không có nút.** Dược sĩ mở GR là extension tự chạy GR → PO → SO → PO Nextwaves và chuyển sang Nextwaves.
2. **Hai đường vào POS:**
   - (1) mở GR từ danh sách `/danh-sach-phieu-nhan-hang/<grId>`;
   - (2) nút "Nhập SO thuocsi" → `/chi-tiet-so/<SO>` (màn nhập hàng cấp SO).
3. Chế độ nhập hàng trên POS phải là **"Scan QR tăng SL nhận"**.
4. **Không dùng tích hợp Circa của Nextwaves** (`/integrations/circa/*`: liên kết, đẩy về Circa). Đó là phần Nextwaves làm cho extension riêng của họ.
   Extension của chúng ta **tự làm trọn luồng, kể cả ghi kết quả về GR trên POS**.
   (Ảnh: kênh "Circa POS" trên Nextwaves staging đang "Cần xử lý", "Đồng bộ gần nhất: Chưa bao giờ".)
5. PO28237814 giữ lại để thử.

⇒ Phần "extension không ghi POS" của v0.2 **bỏ**. Quay về hướng v0.1 (extension ghi GR), giữ các phần đúng của v0.2: hai đường vào, lô theo dòng giao.

## 1. Luồng đầu–cuối **[file]**

```
POS  (1) /danh-sach-phieu-nhan-hang/<grId>   hoặc   (2) "Nhập SO thuocsi" → /chi-tiet-so/<SO>
      │  extension: tìm SO + GR (đọc POS)
      ▼
EXT  tìm PO Nextwaves theo SO (refId) trong các PO đang mở cùng kho; kiểm dấu vân tay
      │  mở tab Nextwaves /vi/purchases/<poId>
      ▼
NW   dược sĩ mở bảng nhận hàng (web gọi GET …/receiving)
     → đặt hàng lên reader (web Nextwaves đọc reader bằng Web Serial ngay trong trình duyệt)
     → bấm "Xác nhận nhận hàng"
     → web gọi POST /api/v1/inter-tenant-shipments/<shipmentId>/receive-scan
       {"onMissing":"keep_open","epcs":[…EPC đã quét…]}
      │  extension thấy response 2xx của lời gọi này
      ▼
EXT  đọc kết quả đã nhận → lập kế hoạch ghi POS → ghi GR (§4) → đưa dược sĩ về lại POS
      ▼
POS  dược sĩ kiểm GR, bấm HOÀN THÀNH (PUT …/status/COMPLETED) — hoặc extension bấm (PM chốt)
```

## 2. Nguồn dữ liệu

| Cần | Lấy từ | Trang nào tự tải | Căn cứ |
|---|---|---|---|
| SO (đường 1) | GR → `GET pos/<posId>/po/<poId>` → `sale_order_number` | trang GR **không** tự tải PO; extension phải đọc | **[file]** |
| SO + GR (đường 2) | URL `/chi-tiet-so/<SO>`; `GET goods-receipt/search?query=so_thuocsi=<SO>,…` | trang `/chi-tiet-so` tự tải | **[file]** |
| PO Nextwaves theo SO | `GET /purchase-orders?…` (danh sách **không có SO**: `externalNumber` null, `supplierReference` "PUSH-…") → mỗi PO đang mở cùng kho: `GET /inter-tenant-orders/purchase-orders/<id>` → `refId` | không trang nào cho sẵn | **[file]** `samples/nw-stg-purchase-orders-list.json` |
| UID ↔ EPC, sản phẩm, đơn vị | `GET …/inter-tenant-orders/purchase-orders/<id>/receiving` (`shipments[].lines[]`: productId, sku, quantity, unit, units[{epc, unitUid}]) | tải khi mở bảng nhận hàng | **[file]** |
| Lô của dòng giao | `GET /inter-tenant-shipments/<shipmentId>` (`lines[].batch {batchNumber, expiryDate}`, `epcs`) | chỉ trang dòng giao tự tải; trang PO **không** | **[file]** |
| EPC đã xác nhận nhận | body request `POST …/receive-scan` (`epcs`) + response | khi bấm "Xác nhận nhận hàng" | **[file]** (đã thấy request; chưa thấy response 2xx) |
| Kết quả sau khi nhận | `GET /purchase-orders/<id>` (`receivedUnits`), `GET /inter-tenant-shipments/<id>` (`receivedEpcs`) | — | **[giả thuyết]** theo mẫu production; chưa có mẫu staging |

## 3. Kế hoạch ghi GR (giữ từ v0.1, cập nhật lô)

1. EPC đã nhận → UID (`units`) → dòng giao (`epcs` của dòng) → sản phẩm (`sku` "CIRCA-<product_id>") → dòng GR.
2. Lô: `batch.batchNumber` + `expiryDate` (YYYY-MM-DD) → `<batch>-<DDMMYY>` = `lot_date` của chi tiết GR. Khớp 4/4 ở GR03878 **[file]**.
   - Dòng giao không có lô (Soffell, `trackBatch` false) mà GR có nhiều lô → **chưa có luật** (Q5). Tạm thời chặn dòng đó.
3. Lượng:
   - Mỗi UID = 1 `unit` của dòng giao. Quy về đơn vị gốc POS bằng `retail_units[unit].convert_rate`, rồi chia `convert_rate` của đơn vị dòng GR.
   - Phải ra số nguyên và không vượt `quantity` của chi tiết.
   - Nextwaves chỉ cho nhận dòng có thẻ theo **đơn vị gốc của sản phẩm bên Nextwaves** (lỗi `tagged_unit_unsupported`, §5).
     Trong luồng chạy được, 1 UID = 1 đơn vị gốc Nextwaves. Nhưng đơn vị dòng POS vẫn có thể lớn hơn (production 2399: POS 1 lốc, tem theo chai), nên **vẫn phải quy đổi**.
4. UID đã có trên GR → bỏ qua. Mã trên GR không có trong kết quả Nextwaves → chặn.
5. Hiện bảng kế hoạch cho dược sĩ trước khi ghi.

## 4. Cách ghi GR — PM chốt

| | W1 — gọi API `PUT …/detail` | W2 — gõ lại vào ô quét POS (chế độ "Scan QR tăng SL nhận") |
|---|---|---|
| Cách | Mỗi chi tiết một lần: `{detail:{received_quantity: <đích tuyệt đối>, lot_id, thuocsi_qr_codes:[UID của chi tiết]}}`; đọc lại GR trước và sau | Extension đưa chuỗi vào ô quét. POS tự tra QR, tự khớp dòng / lô, tự `PUT` |
| Quy đổi đơn vị | Có | **Không**: POS cộng +1 đơn vị dòng mỗi lượt quét **[file]** |
| Định dạng mã | Không phụ thuộc | Ô quét bắt buộc chuỗi có `/qr/` **[file]**. Tem Circa staging là `https://qr.v2.circa.vn/item/<UID>` → phải tự dựng `…/qr/<UID>`, và cần POS tra được UID này (`thuocsi-warehouse/qrcode`, D4 chưa có) |
| Rủi ro | Cần 1 phép thử hợp đồng ghi trên staging (nhiều UID một lần, bước tăng > 1) | Sai khi 1 UID ≠ 1 đơn vị dòng; phụ thuộc focus / thời gian của trang |
| Dev đề xuất | **Chính** | Chỉ khi operator yêu cầu dùng đúng hành vi quét của POS và D4 đạt |

Câu hỏi Q3: yêu cầu "chế độ phải là Scan QR tăng SL nhận" có nghĩa là chọn **W2** không? Hay chỉ để màn POS sẵn sàng cho dược sĩ quét tay phần còn lại?

## 5. Chặn / rủi ro mới **[file]**

| # | Nội dung |
|---|---|
| K1 | **PO28237814 hiện không nhận được trên Nextwaves.**<br>Capture 09-08-45 có 3 lần `POST …/receive-scan` (09:07:17, 09:07:23, 09:08:04), đều trả `400 INTER_TENANT_SHIPMENT_LINE_INVALID`, `reason: tagged_unit_unsupported` ở dòng giao 1110 (3 **vỉ**, lô 261009DHAUS).<br>Chữ Nextwaves: "Dòng có thẻ không thể nhận theo đơn vị này. Hãy chấp nhận theo hình thức chuyển kho, hoặc đề nghị bên gửi dùng đơn vị gốc." Đơn vị gốc của 1110 bên Nextwaves là "hộp".<br>⇒ Chưa có lượt nhận thành công trên staging. Cần operator / Nextwaves / Buymed xử lý, hoặc dùng SO thử khác có dòng theo đơn vị gốc.<br>`receivedAt` vẫn null, nên PO28237814 vẫn dùng thử được. |
| K2 | Lần gửi đầu có **14 EPC**, trong đó 2 EPC không thuộc đơn (`…A729`, `…A72B`, ứng với 2 tem ngoài danh sách). Lần 2 và 3 đúng 12/12. Extension phải hiện EPC lạ / thiếu nếu đọc được, nhưng không chặn thao tác của Nextwaves. |
| K3 | Web Nextwaves đọc reader bằng **Web Serial** (`reader-service`). Trên máy POS production, `circa-qr-scan-log` đang giữ cổng reader ở tab POS → hai tab giành cổng (R12). Trên laptop staging không gặp vì `circa-qr-scan-log` không chạy trên host staging. |
| K4 | Không tìm PO Nextwaves theo SO bằng danh sách được (không có trường SO). Phải đọc `refId` từng PO đang mở cùng kho: staging có 11 PO, Florita khoảng 6. Tìm `q=` (D1) vẫn chưa kiểm. |
| K5 | Lô Soffell: Nextwaves không có lô, POS có 2 lô (Q5). |

Bảng mã lỗi nhận hàng của Nextwaves (lấy từ bundle web) để hiện cho dược sĩ — các mã chính:
- `tagged_unit_unsupported`, `epc_count_mismatch`, `batch_required`, `duplicate_epc`;
- `RECEIPT_INVALID__epc_mismatch` ("Thẻ đã quét không khớp với thẻ đã gửi"), `__epc_line_must_be_complete`, `__epcs_required`, `__over_receipt`, `__other_shipments_open`;
- `INVALID_STATE__accept_required` ("Phiếu gửi này cần được chấp nhận trước khi nhận hàng").

Extension **không tự xử lý** các lỗi này. Chỉ ghi nhận rằng Nextwaves chưa nhận, nên không sang bước ghi POS.

## 6. Bất biến (giữ)

- Không gọi host khác môi trường.
- STG chỉ chạy với cửa hàng 2222.
- Không ghi POS khi Nextwaves chưa trả 2xx cho `receive-scan` **và** chưa đọc lại được kết quả đã nhận.
- Không tạo lô / chi tiết. Không ghi lượng lẻ hoặc vượt. Mỗi UID một chi tiết, một lần.
- Không gửi lại khi chưa đọc lại GR (mã QR nối thêm, gửi lại sẽ nhân đôi).
- Không gọi `/integrations/circa/*`. Không gọi API ghi của Nextwaves. Không bấm nút trên Nextwaves hộ dược sĩ.
- Không lưu token.

## 7. Cần operator / PM chốt

| # | Câu hỏi | Dev đề xuất |
|---|---|---|
| Q1 | "Không tham chiếu API Nextwaves" = không dùng `/integrations/circa/*` (dev hiểu vậy)? Extension có được **đọc (GET)** các API thường của web Nextwaves dưới phiên của dược sĩ không: danh sách PO, inter-tenant order, dòng giao, PO sau khi nhận? Hay chỉ được nghe những gì trang Nextwaves tự tải? | GET chỉ đọc cho 4 nhóm trên; còn lại nghe trang |
| Q2 | Gỡ K1 cho PO28237814: nhận theo "chuyển kho", hay Buymed-stag gửi lại SO theo đơn vị gốc, hay tạo SO thử khác? | Operator / Nextwaves quyết |
| Q3 | Cách ghi GR: W1 hay W2? | W1 |
| Q4 | Ai bấm HOÀN THÀNH trên POS? | Dược sĩ |
| Q5 | Lô cho dòng không quản lý lô bên Nextwaves (Soffell) khi GR có nhiều lô? | Chặn dòng, dược sĩ xử lý tay; hoặc luật PM đưa ra |
| Q6 | Đường (2): SO có nhiều GR? | Mỗi GR một phiên |

## 8. Dữ liệu còn thiếu

1. **D4 — POS staging tra được UID Circa không** (quyết định W2 có khả thi). Đăng nhập POS staging rồi mở trực tiếp hai link sau, copy JSON hiện ra:
   `https://pos.stg.circa-v2.buymed.tech/thuocsi-warehouse/qrcode?code=1792145819958AA1` và
   `https://pos.stg.circa-v2.buymed.tech/thuocsi-warehouse/qrcode?code=1792379018917AA1`.
2. **Một lượt nhận THÀNH CÔNG trên Nextwaves** (sau khi gỡ K1), capture cả tab Nextwaves lẫn tab POS (GR trước và sau):
   - response 2xx của `receive-scan`;
   - `GET /purchase-orders/<id>` và `GET /inter-tenant-shipments/<id>` sau khi nhận.
3. **D1:** trang danh sách đơn liên kết Nextwaves, gõ `SOBD1593858` vào ô tìm → response `inter-tenant-orders?…q=…`.

## 9. Cập nhật 24/10 khuya — quyết định operator + dữ liệu mới

**Quyết định operator:**
- **Q1:** **được dùng API thường của Nextwaves** (purchase-orders, inter-tenant-orders, inter-tenant-shipments…), **không dùng** phần tích hợp Circa Nextwaves đã làm (`/integrations/circa/*`, gồm cả `hub-orders`).
- **Q3:** chọn **W1** (extension ghi GR bằng `PUT …/detail`).
- K1 (gỡ chặn nhận PO28237814): **chưa làm**.

**D4 — tra QR trên POS staging** (`samples/pos-stg-qrcode-uid-circa.json`) **[file]:**
- POS staging **tra được UID Circa**:
  - `1792145819958AA1` → productId 1110, lot `261009DHAUS`, `expiredDate` 12-12-2028 (khớp batch dòng giao Nextwaves).
  - `1792379018917AA1` → productId 2431732, lot `A98`, 06-06-2027 (khớp chi tiết `A98-060627` của GR03878).
- ⇒ **Q5 có lời giải:** lô của dòng giao không có lô (Soffell) lấy bằng tra QR từng UID trên POS. Kiểm chéo được với batch Nextwaves ở dòng có lô.
- `circaReceiptCode`, `circaSku`, `circaUnitName` **rỗng** trên staging. Không kiểm được "UID thuộc PO POS này" bằng tra QR, và không lấy được đơn vị từ tra QR.
  Đơn vị lấy từ dòng giao Nextwaves (`unit`).

**Lượt nhận thành công do Nextwaves dựng mẫu** (capture 13-44-11 + `samples/nw-stg-po-PO88508353-received.json`) **[file]:**
- Mẫu này đi theo **mô hình "hub order"** của tích hợp Circa:
  - trang `/vi/purchases/receive?po=PO000006639`;
  - `GET /integrations/circa/hub-orders/<mã PO POS>`;
  - nhận bằng `POST /integrations/circa/hub-orders/<mã>/receive {onMissing, epcs}`;
  - PO Nextwaves có `externalNumber` "circa-hub:PO000006639", dựa trên PO / GR của **pos.dev**.
- Theo Q1, extension **không dùng** đường này. Luồng của chúng ta là **mô hình đơn liên kết Buymed** (SO / `refId` → `POST /inter-tenant-shipments/<id>/receive-scan`).
- Phần **dùng được** từ mẫu: `GET /purchase-orders/<id>` **sau khi nhận** (API thường), cấu trúc giống mẫu production PO62830114:
  - `status` RECEIVED;
  - `items[].receivedUnits[] {epc, unitUid, receiptId, receiptNumber}`;
  - `receipts[].items[] {purchaseOrderItemId, quantity, batchNumber, epcs[]}`.
  - ⇒ Đây là nguồn "đã nhận" cho bước lập kế hoạch ghi GR.
- Trang `/vi/purchases/receive?po=<x>` (đường link mở thẳng màn quét, `autoConnect`):
  - `po` là UUID → mở theo `purchaseOrderId`;
  - `po` là chuỗi → tìm `GET /inter-tenant-orders/receiving?pageSize=50&q=<x>` **và** tự gọi `hub-orders/<x>`.
  - Extension có thể chuyển dược sĩ tới `…/purchases/receive?po=<UUID PO Nextwaves>`. Cần operator đồng ý vì trang này tự gọi API hub-order của Nextwaves; đó là mã của Nextwaves, extension không gọi.
- `GET /inter-tenant-orders/receiving?q=<chuỗi>` là ứng viên tốt để **tìm PO theo SO** (`q=SOBD1593858`). Chưa biết `q` khớp trường nào (R1).

**Còn thiếu trước khi code (chi tiết trong `state.md` §9):**
- PM ra spec v0.2 + giao B1.
- Operator chốt Q4, Q6, ý nghĩa chế độ "Scan QR tăng SL nhận" khi đã chọn W1, và đích chuyển màn.
- R1 / R2: response `inter-tenant-orders/receiving?q=SOBD1593858` và `?q=PO28237814`.
