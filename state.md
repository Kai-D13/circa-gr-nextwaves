# state.md — circa-gr-nextwaves

Cập nhật: **24/10/2026 (lần 14, PM audit v0.1.2)**. Giai đoạn: **v0.1.2 trên nhánh `batch/v0.1-staging` (mã `6eeb3c0`, đầu nhánh `5d117d2`, gói `525BCE84`); P1.6/P1.7 đạt gate source/test local; chưa qua gate merge / ghi; T1 chỉ đọc có thể thử**. Luật làm việc và môi trường: `agent.md`.

## 0. Tóm tắt 30 giây

- Đã hiểu luồng nhận hàng trên POS hiện tại (capture production 19/10, §1).
- Đã kiểm chuỗi khoá ba bên trên SO 38468903 (§2). Mã SO là khoá chung **ở production**. GR không có SO, nhưng PO của GR có SO.
- 24/10: người dùng chốt **build trên staging trước**.
  - Môi trường staging đã đủ ba bên: POS staging (cửa hàng 2222), Nextwaves `circa-stg`, Buymed `buymed-stag`.
  - Cặp thử: GR03877 ↔ PO Nextwaves PO28237814 (§2.1).
- **Phát hiện chính (lần 2):**
  - PO staging của GR03877 là `IMPORT_STOCK` tạo tay, **không có SO**, nên chuỗi SO không dùng được trên staging.
  - Cặp (`product_id`, số lượng đơn vị gốc) khớp **8/8 dòng** ở cả hai môi trường. Đây là "dấu vân tay" để tìm hoặc kiểm PO Nextwaves khi thiếu SO (§3).
- **Phát hiện chính (lần 3, §2.2):**
  - Staging đã có GR03878 sinh từ SO 1593858 (PO00006750). SO trùng `refId` của PO28237814, nên **chuỗi SO chạy được trên staging**.
  - Dấu vân tay khớp cả GR03877 lẫn GR03878 (R9 đã xảy ra). Vì vậy dấu vân tay chỉ để kiểm, không dùng làm cách tìm.
  - GR03878 có 2/3 dòng mà **số UID ≠ số lượng dòng** (6 UID cho 2 hộp; 4 UID cho 2 hộp), R11.
  - Phản hồi dev cho PM: `docs/dev/DEV-REVIEW-SPEC-STG-v0.1.md`.
- **Lần 4 (operator giải thích luồng thật, §2.3):**
  - PO Nextwaves do Nextwaves tự sinh khi nhận SO, **không bao giờ** trùng PO POS. PO / GR POS chỉ sinh khi Buymed giao thành công ⇒ khoá nối là **SO**.
  - API `/receiving` cho dòng giao kèm productId / sku / unit / UID ⇒ R10 đã giải.
  - Dev viết logic chi tiết đề xuất: `docs/dev/LOGIC-v0.1.md`.
- **Lần 5 (capture 24/10 chiều, §2.4) — đổi hướng lớn:**
  - **Nextwaves đã có tích hợp Circa**: liên kết PO Nextwaves ↔ GR Circa, đẩy hàng + UID và hoàn tất GR trên Circa.
    Đề xuất extension **không ghi POS**; chỉ tìm đúng PO, chuyển màn, đảm bảo liên kết và kiểm kết quả.
  - Không có nút: mở GR là tự chạy. Hai đường vào: trang GR và `/chi-tiet-so/<SO>`.
  - Logic mới: `docs/dev/LOGIC-v0.2.md` (thay v0.1).
- **Lần 6 (operator 24/10 tối, capture luồng đầy đủ) — `docs/dev/LOGIC-v0.3.md` thay v0.2:**
  - **Không dùng tích hợp Circa của Nextwaves.** Extension tự ghi GR trên POS.
  - "Xác nhận nhận hàng" = `POST /inter-tenant-shipments/<id>/receive-scan {onMissing, epcs}`.
  - PO28237814 bị Nextwaves từ chối `tagged_unit_unsupported` (dòng 1110 theo vỉ; đơn vị gốc Nextwaves là hộp) ⇒ **chưa nhận được (K1)**.
  - Web Nextwaves đọc reader bằng Web Serial. Danh sách PO Nextwaves không có SO.
- **Lần 7 (24/10 khuya, `LOGIC-v0.3.md` §9):**
  - Operator chốt: **Q1** dùng API thường của Nextwaves (không dùng `/integrations/circa/*`); **Q3 = W1** (extension `PUT …/detail`); chưa gỡ K1.
  - Tra QR POS staging được UID Circa (lô + hạn, dùng cho Soffell); `circaReceiptCode` / `circaUnitName` rỗng.
  - Mẫu nhận thành công của Nextwaves đi đường hub-order (không dùng); phần dùng được là `GET /purchase-orders/<id>` sau khi nhận.
- **Lần 9 (24/10 khuya, operator chốt a–d, dev build):**
  - Dược sĩ bấm HOÀN THÀNH. Khi Nextwaves nhận xong, extension đưa về POS và **điền sẵn mọi UID đã map** (W1) để dược sĩ không quét tay.
  - Bắt theo `thuocsi_delivery_code`: 1 mã giao ↔ 1 PO POS ↔ 1 GR. Không cần chế độ nhập hàng POS. Đích chuyển màn: `/vi/purchases/receive?po=<SO>`.
  - Dev build xong v0.1 (`docs/dev/BATCH-v0.1-STG.md`):
    - 48 test, gồm chạy trọn luồng trên trình duyệt giả; đột biến 8/8 bị bắt.
    - Service worker và hook nạp được trên Edge thật.
  - Chưa thử với dữ liệu thật phần sau khi nhận (K1), và chưa kiểm hợp đồng ghi W1 (P1).
- **Lần 10 (24/10, PM audit):** PM chạy lại 48/48 test local; ZIP và bản giải nén khớp 16/16 file của `a08d541`. Audit `docs/pm/AUDIT-BATCH-v0.1-STG-20261024.md` kết luận **chưa qua gate merge/ghi**: tìm PO trên tập ứng viên có thể chưa đầy đủ, UID có sẵn sai lô vẫn bị coi đã điền, chế độ `auto` không có phép từng lượt, kiểm cửa hàng trực tiếp GR chưa bắt buộc đủ trường, và lease một tab có thể hết hạn khi PUT còn chạy. K1 và W1 thật vẫn thiếu bằng chứng.
- **Lần 11 (24/10 khuya, dev sửa):** v0.1.1 `d124453`, gói `D8CD9AFD` (`C:\circa-gr-nextwaves-v0.1.1`). Báo cáo `docs/dev/FIX-AUDIT-BATCH-v0.1-STG.md`.
  - **Bỏ chế độ ghi lâu dài.** Ghi W1 chỉ khi operator **cấp phép một lần cho một mã GR** trong popup (30 phút) và bấm nút mang mã kế hoạch. Production chỉ đọc.
  - Đã sửa P1.1–P1.5 và P2.1–P2.3; khoá ghi P3 (SO nhiều GR / Nextwaves nhiều đơn cùng SO).
  - 73 test, đột biến 32/32 (dev tự báo; `scripts/mutate-v0.1.1.py` để PM chạy lại).
  - Vẫn chưa có bằng chứng staging thật: K1, W1, hợp đồng "đã nhận" theo đường inter-tenant.
- **Lần 12 (24/10, PM audit lại):** PM chạy `npm test` tại `d124453`: 73/73; đối chiếu ZIP và bản cài 17/17 file. Báo cáo `docs/pm/AUDIT-v0.1.1-STG-20261024.md`: P1.1–P1.5/P2.1–P2.3 có sửa local, nhưng **chưa qua gate merge/ghi**. Phát hiện P1.6: tìm GR theo SO bỏ qua `data.total/page/limit`, có thể mở khoá ghi trên danh sách thiếu. P1.7: `nwWriteLocks` có thể bị xoá qua `session:update`. Cả hai đã tái hiện trên browser-sim. K1/W1 vẫn thiếu bằng chứng live.
- **Lần 13 (24/10 khuya, dev sửa):** v0.1.2, gói `525BCE84` (`C:\circa-gr-nextwaves-v0.1.2`). Báo cáo `docs/dev/FIX-AUDIT-v0.1.1-STG.md`.
  - P1.6: tìm GR theo SO phải đủ `total / page / limit` và đủ trường từng dòng (không lọc rồi đếm). Thiếu → khoá ghi (đường GR) hoặc dừng (đường `/chi-tiet-so`).
  - P1.7: `session:update` chỉ đổi `state`. Khớp đơn Nextwaves qua `session:nwMatched` một lần, từ trang Nextwaves. Message ghi kiểm nguồn gửi.
  - 78 test; đột biến 47/47 trên `5d117d2` (lần đầu 46/47, đã thêm test). Nextwaves và POS đều **fail closed ở một trang** (chưa phân trang).
- **Lần 14 (24/10, PM audit v0.1.2):** `docs/pm/AUDIT-v0.1.2-STG-20261024.md`. PM chạy lại 78/78 test, kiểm ZIP và bản cài 17/17 file khớp source; P1.6/P1.7 đóng ở mức source/test local. Dev tự báo 47/47 đột biến, PM chưa chạy lại. T1 chỉ đọc bằng v0.1.2 có thể chạy; chưa qua gate merge/ghi vì K1, response thật sau nhận và W1 còn thiếu. P2.4: trước khi nâng cấp giữ cùng extension ID, cần xử lý phiên active từ bản cũ thiếu khoá.

## 1. Luồng nhận hàng hiện tại trên POS (capture Net Capture, POS-02 Florita, 19/10/2026, production)

Nguồn: `Downloads\net-capture-2026-10-19T04-47-41.zip` (chứa token thật, KHÔNG đưa vào project). 2 GR nhận trọn, 31 lượt quét, 31/31 khớp.

1. Mở `/danh-sach-phieu-nhan-hang/<grId>` → `GET /v1/order/goods-receipt/<grId>`.
   - `items[]` có quantity theo đơn vị dòng, base_quantity, unit_id, retail_units, lots[] ứng viên.
   - `items[].details[]` có lot_id, lot_date `LOT-ddmmyy`, quantity, received_quantity, thuocsi_qr_codes. Detail đã tạo sẵn theo lô từ PO.
2. Chọn **Chế độ nhập hàng**: Điền thủ công (mặc định) / Scan QR tăng SL nhận / Scan QR + in tem thường / Scan QR + in tem RFID.
   Đây là state trên trang, mất khi tải lại.
3. Mỗi lượt quét:
   - Chuỗi quét phải chứa `/qr/`, lấy phần mã phía sau.
   - `GET pos.v2.circa.vn/thuocsi-warehouse/qrcode?code=<mã>` → productId, circaSku, lot, expiredDate (DD-MM-YYYY), circaReceiptCode (= mã PO POS), circaUnitName.
   - Khớp dòng theo productId. Nhiều dòng cùng sản phẩm: ưu tiên dòng có unit `buymed_base_unit`, rồi convert_rate lớn nhất; dòng đầy thì chuyển dòng còn thiếu cùng unit.
   - Khớp detail theo lô + hạn → `PUT /v1/order/goods-receipt/<gr>/item/<item>/detail/<detail>`, body
     `{detail:{received_quantity: <CỘNG DỒN>, lot_id, thuocsi_qr_codes:[<mã vừa quét>]}}`. Server nối mã vào danh sách.
   - Không có detail khớp → `POST …/item/<item>/detail` (lô có sẵn) hoặc tạo lô trước.
   - Đủ số lượng → "Số lượng đã nhận vượt quá số lượng cần nhận!".
   - Client **không** kiểm mã đã quét trong phiếu.
4. **HOÀN THÀNH** → `PUT …/status/COMPLETED` (không body). **HỦY** → `status/CANCELED`.
   - Trạng thái đi từ WAITING_TO_RECEIVE qua RECEIVING tới COMPLETED.
   - Florita bật `is_auto_put` → có phiếu PUT sau khi hoàn thành.
5. Bất thường: sau COMPLETED, `thuocsi_qr_codes` của mỗi detail **nhân đôi** (mỗi mã 2 lần, thứ tự đổi). Bên đọc danh sách phải loại trùng.
6. Thời gian: tra QR khoảng 86 ms, PUT khoảng 183 ms, quét → xong khoảng 0,28 s (trung vị).

## 2. Chuỗi khoá ba bên (đã kiểm trên SO 38468903, dữ liệu production)

```
POS  GR 2eea8d52 (GR82004)
      └─ purchase_order_id ─► PO POS 5b4a9f0a (PO01970951)        samples/po-prod-PO01970951-SOBD38468903.json
                               ├─ goods_receipts: [GR82004]        ← khớp hai chiều
                               ├─ sale_order_number: "38468903"
                               ├─ thuocsi_delivery_code: ["SOBD38468903-F"]
                               └─ origin_po PO01970737; list_po_code_with_same_thuocsi_id [PO01970737, PO01970951]
                                     ║ khoá chung: cụm số đầu tiên "38468903"
NW   inter-tenant order f8171434 (direction outbound, counterparty buymed)
      ├─ refId: "SOBD38468903-15942586"
      └─ purchaseOrderId ─► PO Nextwaves d3e7e409 (PO62830114, status RECEIVED)
                               ├─ externalNumber: null, supplierReference: "PUSH-…"   ← PO KHÔNG chứa SO
                               └─ items[].receivedUnits[] {epc, unitUid, receiptNumber}  (16 UID)
```

- Khớp sản phẩm: `product_id` POS = `product.externalProductId` Nextwaves (5/5).
- UID có cùng định dạng mã QR thuocsi: 13 chữ số ms + mã máy + số thứ tự, ví dụ `1791877162941B81`.
- Chuẩn hoá SO: POS tự lấy cụm số đầu tiên (`\d+`) khi tìm phiếu theo SO. Nextwaves `refId` → cụm số đầu cũng là 38468903.
- Thứ tự tạo không cố định: Nextwaves nhận ngày 13/10, PO01970951 trên POS tạo ngày 14/10.

### 2.1 Cặp thử staging (người dùng cung cấp 24/10)

```
POS stg  GR03877 cea7a4d0 (cửa hàng 2222, WAITING_TO_RECEIVE)     samples/gr-stg-GR03877-20261023.json
          └─ PO00006745 b191075a: status WAIT_FOR_PROCESS, source_type IMPORT_STOCK, created_by_action IMPORT_STOCK,
             sale_order_number "", thuocsi_delivery_code [], origin_po null, goods_receipts [GR03877]
             → TẠO TAY bởi "<nhân viên>", KHÔNG gắn SO
NW stg   inter-tenant f930f66d (outbound, counterparty buymed-stag, status shipped)   samples/nw-stg-intertenant-PO28237814-SOBD1593858.json
          ├─ refId "SOBD1593858-1056745"
          └─ PO28237814 55bd221f: purchaseOrderStatus CONFIRMED, chưa nhận; kho "CIRCA FLORITA" 82bf85e4
             shipment IT-BUYMED-STAG-20261019092009-7938 (pending); units = 12 UID/EPC dự kiến (đã có TRƯỚC khi nhận)
```

| SP | POS GR03877 | Nextwaves PO28237814 | UID dự kiến |
|---|---|---|---|
| 1110 Pymefucan | 6 vỉ (base 12) | 6 vỉ, local 12 "hộp", trackBatch | 6 (2 dòng giao × 3) |
| 2431732 Soffell | 2 chai (base 2) | 2 chai, local 2 chai | 2 |
| 5451 Vinmotop | 4 túi (base 40) | 4 túi, local 40 "hộp", trackBatch | 4 (2 dòng giao × 2) |

- Dòng hàng hai bên trùng khớp (sản phẩm, số lượng, đơn vị dòng), nhưng **không có khoá SO nào nối chúng**.
- Tem QR staging là tem riêng đã map EPC (có tem vật lý). Mã production không tra được trên staging.
- Nextwaves `localUnit` ghi "hộp" nhưng con số là đơn vị gốc POS (viên): 6 vỉ × 2 = 12, 4 túi × 10 = 40. **Không dùng nhãn `localUnit`**, chỉ dùng con số.
- `units[].lineId` là mã **dòng giao hàng** (5 dòng), khác mã dòng đơn `lines[].lineId` (3 dòng).
  Unit chỉ có `productTitle`, **không có productId**. Muốn gán UID → sản phẩm trước khi nhận phải có API khác (§6 D3).

### 2.2 Cặp thử staging có SO (operator gửi 24/10 chiều) — đề xuất làm cặp chính

```
POS stg  GR03878 2de6c0ec (2222, WAITING_TO_RECEIVE, created_by "Hệ thống")      samples/gr-stg-GR03878-20261024.json
          └─ PO00006750 f7678788: source_type SO_THUOCSI, sale_order_number "1593858",          samples/po-stg-PO00006750-SOBD1593858.json
             thuocsi_delivery_code ["SOBD1593858-F"], list_po_code_with_same_thuocsi_id [PO00006749, PO00006750],
             origin_po_id 9b1ff47a…, goods_receipts [GR03878]
NW stg   PO28237814 (refId SOBD1593858-1056745) — như §2.1                                    samples/nw-stg-po-PO28237814-detail.json
```

| SP | GR03878 | Lô POS (mỗi lô 1 đơn vị dòng) | Nextwaves | UID | 1 UID = |
|---|---|---|---|---|---|
| 1110 | 2 hộp (1 hộp = 6 viên), base 12 | A1-121229, 261009DHAUS-121228 | 6 vỉ, local 12 | 6 (2 dòng giao × 3) | 1 vỉ = 1/3 hộp |
| 5451 | 2 hộp (1 hộp = 20 viên), base 40 | 261009KSDHAU-121228, A1-121228 | 4 túi, local 40 | 4 (2 × 2) | 1 túi = 1/2 hộp |
| 2431732 | 2 chai, base 2 | 261016KHASUFDB-060627, A98-060627 | 2 chai | 2 (1 dòng giao) | 1 chai |

- Cùng SO, POS lại sinh 2 PO (PO00006749 là PO gốc; chỉ PO00006750 có GR), giống production (R2).
- Dấu vân tay `(product_id, base_quantity)` của GR03878 **trùng hệt** GR03877 (R9).
- Giả thuyết: mỗi dòng giao Nextwaves là một lô (3 vỉ = 1 hộp / lô; 2 túi = 1 hộp / lô). Chưa xác nhận (D3 / D4).
  Soffell: 2 lô POS nhưng 1 dòng giao → lô từng UID chỉ lấy được từ tra QR.
- PO Nextwaves chi tiết (`GET /purchase-orders/<id>`):
  - `items[].externalLineKey` = `lines[].lineId` của inter-tenant (3/3).
  - `quantity` tính theo đơn vị gốc (12 / 40 / 2); `receivedUnits` rỗng trước khi nhận.
  - `externalProductId` **null 2/3** → chỉ dùng `productSku` "CIRCA-<id>".
  - Kho "CIRCA FLORITA" code WH-30145 (`buymedCustomerId` 30145).
- Seller POS staging của PO này: `CC4DM8DN9F1` (khác `CXH7DN9F1YA` của PO00006745).

### 2.3 Luồng thật (operator 24/10) và API `/receiving`

1. thuocsi / Buymed tạo SO (hàng, product_id, UID, EPC; **chưa có PO POS**).
2. Buymed đẩy SO sang Nextwaves → inter-tenant order (`refId` SOBD<số>-<hậu tố>) + **PO Nextwaves tự sinh** (không trùng PO POS).
3. Buymed giao thành công → POS sinh PO (SO_THUOCSI, `sale_order_number`) + GR (Hệ thống).
4. Dược sĩ mở GR → extension mở đúng PO Nextwaves → dược sĩ nhận bằng reader, bấm **"Xác nhận nhận hàng"** →
   extension đưa kết quả về POS để hoàn tất GR / PO trên POS.

`GET /api/v1/inter-tenant-orders/purchase-orders/<poId>/receiving` (mẫu `samples/nw-stg-receiving-PO76458756.json`, PO76458756, CONFIRMED, chưa nhận):
- `{order (không có refId), purchaseOrderStatus, warehouse, shipments[], receipts[]}`.
- `shipments[]`: `{id, shipmentNumber, status pending, needsAccept true, lines[]}`.
- `lines[]`: `{lineId, productId, product{id, title, sku, barcode}, name, quantity, unit, tagged, units[{epc, unitUid}], qrUnitUids[]}`.
- `quantity` = số UID ở 5/5 dòng. Mỗi UID = 1 `unit` của dòng giao.
- ⇒ Gán UID → sản phẩm + đơn vị **trước khi nhận** bằng `productId` / `sku`, không cần dựa vào tên (R10 đã giải).
- Dòng giao **không có trường lô**. Lô của UID vẫn phải lấy qua tra QR trên POS (D4).
- PO76458756 (1110: 6 vỉ, 5451: 4 túi, Soffell **1** chai) **không khớp** GR03878 (Soffell 2 chai).
  PO của GR03878 là PO28237814 (SO 1593858). Dấu vân tay đã phân biệt đúng.

### 2.4 Capture 24/10 chiều: hai đường vào POS, tích hợp Circa của Nextwaves, lô theo dòng giao

Chi tiết: `docs/dev/LOGIC-v0.2.md`. Tóm tắt **[đã kiểm từ capture / JS]**:
- **Đường vào (2)** "Nhập SO thuocsi":
  - Danh sách GR → nhập SO → `GET goods-receipt/search?query=so_thuocsi=1593858,…` → `/chi-tiet-so/1593858` (màn nhập hàng cấp SO).
  - Mẫu `samples/pos-stg-gr-search-so-1593858.json` trả đúng GR03878.
- **Ô quét POS staging** (cả trang GR và `/chi-tiet-so`), giống production:
  - bắt buộc chuỗi có `/qr/`; +1 đơn vị dòng mỗi lượt; không quy đổi.
  - Tem Circa staging có dạng `https://qr.v2.circa.vn/item/<UID>` (không có `/qr/`), nên POS sẽ báo sai định dạng.
- **Tích hợp Circa trong Nextwaves** (module `circa`, `circa-receipt-link`):
  - Các API: `/integrations/circa/connection`, `pull-purchase-orders`, `goods-receipts`, `purchase-orders/<id>/link` (GET / PUT `{goodsReceiptId}` / DELETE), `scan/qr`.
  - Chữ hiển thị: liên kết xong thì "Hàng nhận và UID sẽ được ghi vào phiếu này, và phiếu được hoàn tất trên Circa khi đơn nhận đủ".
  - PO28237814: `eligible: true, linked: false`.
- **Lô:** `GET /inter-tenant-shipments/<id>` có `batch {batchNumber, expiryDate}` từng dòng giao → `<batch>-<DDMMYY>` khớp 4/4 lô GR03878.
  Soffell không có lô bên Nextwaves (POS có 2 lô).
- PO76458756 thuộc SO 1593849 (operator). Danh sách tem quét có 2 UID ngoài PO28237814. Chuỗi máy quét bị rơi ký tự.

## 3. Bài toán GR → PO Nextwaves

**Phía POS (giải được):** grId trên URL → GR.purchase_order_id → `GET /v1/pos/<posId>/po/<poId>` → sale_order_number + thuocsi_delivery_code.
Kiểm thêm: grId phải nằm trong `po.goods_receipts`. Trang GR không tự gọi API PO, nên extension phải tự gọi.

**Phía Nextwaves (chưa chốt):**

| Hướng | Cách | Trạng thái |
|---|---|---|
| A | `GET /api/v1/inter-tenant-orders?direction=outbound&q=<SO>` → khớp `refId` → `purchaseOrderId` | API có trong bundle web; **chưa kiểm `q` có tìm theo refId** |
| B | `GET /api/v1/purchase-orders/open?warehouseId=<kho>` → từng PO gọi `inter-tenant-orders/purchase-orders/<id>` lấy refId | Không cần Nextwaves sửa; gọi N+1 |
| C | Nextwaves ghi SO vào `externalNumber` lúc Buymed push + cho tìm kiếm | Cần sửa backend Nextwaves; bền nhất |
| D | Đi ngược: nhận ở Nextwaves trước → refId → POS `goods-receipt/search?query=so_thuocsi=<số>` → GR | POS có sẵn API; đảo luồng stakeholder muốn |

| E | **Dấu vân tay dòng hàng:** với mỗi PO Nextwaves đang mở của kho, so tập {(`product.sku` = `CIRCA-<product_id POS>`, `localQuantity`)} với tập {(`product_id`, `base_quantity`)} của GR | Khớp 8/8 dòng ở cả hai môi trường (production SO 38468903, staging GR03877). Dùng được khi thiếu SO |

**Dấu vân tay (kiểm 24/10):**
- So `localQuantity` của Nextwaves với `base_quantity` của POS: production 5/5, staging 3/3.
- So số UID với số lượng dòng POS: 7/8. Ngoại lệ 2399 (R1).
- Hai đơn trùng hệt hàng và số lượng thì dấu vân tay không phân biệt được. Khi đó phải để người dùng chọn.

**Đề xuất tạm (chưa duyệt):**
1. Có SO (production): dùng A hoặc B tìm theo SO, rồi **kiểm lại bằng dấu vân tay E**.
2. Không có SO (staging GR03877, PO tạo tay): tìm trong các PO đang mở cùng kho bằng E.
   - Đúng một PO khớp → đề xuất PO đó, người dùng xác nhận.
   - Không khớp hoặc nhiều PO khớp → hiện danh sách để người dùng chọn.
3. Về lâu dài vẫn xin C.

**Quay lại POS (đề xuất tạm, chưa duyệt):**
- Gõ lại từng UID vào ô quét của POS (chế độ "Scan QR tăng SL nhận", dạng `thuocsi.vn/qr/<uid>`) để POS tự khớp dòng / lô.
- Trước đó tra từng UID: `circaReceiptCode` phải bằng `purchase_order_code` của GR.
- Nút HOÀN THÀNH do dược sĩ bấm.

## 4. API đã biết

**POS** (đường dẫn tương đối với API base của từng môi trường, xem `agent.md` §3):

| API | Ghi chú |
|---|---|
| `GET /v1/order/goods-receipt/<id>` | GR chi tiết (mẫu trong `samples/`) |
| `GET /v1/order/goods-receipt/search?query=pos_id=…,with_items=true,with_details=true,is_count_all_status=true&limit&page&order_by` | Danh sách GR |
| `GET /v1/order/goods-receipt/search?query=so_thuocsi=<số SO>,pos_id=…,with_items=true,with_seller_code=true,with_details=true&limit=1000&is_with_retail_unit=true&is_with_lot=true` | POS dùng cho ô "mã SO" + trang `/chi-tiet-so/<số>` |
| `PUT /v1/order/goods-receipt/<gr>/item/<item>/detail/<detail>` · `POST …/detail` · `DELETE …/detail/<id>` · `PUT …/item/<item>` `{qr_unit_id}` | Ghi — chưa được phép gọi |
| `PUT /v1/order/goods-receipt/<gr>/status/COMPLETED` · `/status/CANCELED` | Ghi — chưa được phép gọi |
| `GET /v1/pos/<posId>/po/<poId>?order_by_detail=desc` | PO, có `sale_order_number`, `thuocsi_delivery_code`, `goods_receipts` |
| `GET <trang POS>/thuocsi-warehouse/qrcode?code=<mã>` | Tra mã QR (production đi qua origin trang POS, không header Authorization). Staging: chưa biết |

**Nextwaves** (production `https://api-circa.nextwaves.app/api/v1`, staging `https://api-circa-stg.nextwaves.app/api/v1`).
Cần JWT người dùng sống 1 giờ; chưa biết khoá API có quyền không. Bundle web staging (`index-D_eyV8vC`) khác production (`index-BW5N3Ayt`).

| API | Ghi chú |
|---|---|
| `GET /purchase-orders/<id>` | PO + items[].receivedUnits + receipts |
| `GET /purchase-orders?page&pageSize&search&status&supplierId&warehouseId` | `search` khớp trường nào: chưa biết |
| `GET /purchase-orders/open?warehouseId=` | PO đang mở của kho |
| `GET /inter-tenant-orders?direction&status&linkId&q(≤100)&page&pageSize` | Có `refId` trong kết quả? chưa kiểm |
| `GET /inter-tenant-orders/purchase-orders/<poId>` · `/receiving` | Trạng thái + refId + units |
| `POST /inter-tenant-shipments/<id>/receive-scan` | Ghi — chưa được phép gọi |
| UI: `/vi/purchases/<id>`, `/vi/stock/inter-tenant/orders/<id>` | Đường dẫn mở cho người dùng |

## 5. Khảo sát STAGING so với PRODUCTION (24/10/2026)

Nguồn: `samples/gr-prod-GR83174-20261024.json` (PO01972730, 10 dòng / 11 đơn vị) và `samples/gr-stg-GR03877-20261023.json`
(PO00006745, 3 dòng / 12 đơn vị), cả hai đang WAITING_TO_RECEIVE. Cùng hai cURL người dùng gửi.

### 5.1 Giống nhau
- **Schema GR giống hệt:** mọi đường dẫn khoá ở mọi cấp (data, items[], details[], lots[], retail_units[], sale_product) trùng nhau, không có trường đổi kiểu.
- GR không có trường SO ở cả hai môi trường. `note` rỗng.
- Cùng `client_id` = 1, cùng header `x-client-id: 1` + `x-store-id`, cùng `grpc-timeout: 30S`, cùng OAuth `clientID` SSO.
- `sale_product.manage_lot_date_vat` = 0 ở mọi dòng cả hai bên.

### 5.2 Khác về hạ tầng

| | PRODUCTION | STAGING | Hệ quả |
|---|---|---|---|
| API base | `https://api.v2.circa.vn/v1` | `https://pos.stg.circa-v2.buymed.tech/backend/v1` | Nhận diện / gọi API theo cấu hình môi trường. `host_permissions` khác nhau |
| Gọi API | khác origin (`sec-fetch-site: same-site`) | cùng origin (`same-origin`) | Hook fetch / XHR trong trang chạy được cả hai; khác CORS nếu extension tự gọi |
| Xác thực | Bearer | Bearer + cookie `session_token` / `session_expires_at` | Lấy token từ trang theo từng môi trường |
| SSO | `sso.thuocsi.vn` | `sso.stg.buymed.tech` | Tài khoản staging tách riêng |
| Cửa hàng | Florita `c476efb2…` | "2222" `64a8663b…` | Bảng ánh xạ cửa hàng → kho Nextwaves riêng cho từng môi trường |

### 5.3 Khác về dữ liệu
- **Người tạo GR:** production do "Hệ thống" tạo (`created_by` = `00000000-…-0001`, sinh từ SO). Staging GR03877 do người dùng "<nhân viên>" tạo tay.
  → **Đã xác nhận 24/10:** PO00006745 có `source_type` IMPORT_STOCK, `sale_order_number` rỗng, `thuocsi_delivery_code` rỗng, tức **không gắn SO** (§2.1).
  Production PO01970951: `source_type` SO_THUOCSI, `created_by_action` SO_THUOCSI.
- **Seller / SKU:** production `seller_code` CIRCA, SKU `CIRCA.*`. Staging `CXH7DN9F1YA`, SKU `CXH7DN9F1YA.*`.
- **Độ dài mã:** production PO01972730 / GR83174. Staging PO00006745 / GR03877.
- **Đơn vị:**
  - Production: 10/10 dòng có đơn vị dòng = đơn vị RFID = `buymed_base_unit`, tức 1 QR = 1 đơn vị dòng.
  - Staging là dữ liệu thử, **không giữ bất biến đó**:
    - 1110 Pymefucan: dòng `vỉ`, RFID `vỉ`, nhưng `buymed_base_unit` = `viên`. "h/20v" mà `hộp` = 6 viên.
    - 5451: dòng `túi`, RFID `hộp`, **không có** `buymed_base_unit`.
  - Hệ quả: staging hợp để thử các ca lệch đơn vị, nhưng không đại diện cho dữ liệu production.
- **Đơn vị in tem `qr_unit_name`:** production có ở 9/10 dòng (55224 in `tuýp`, RFID `hộp`). Staging rỗng 3/3.
- **`retail_units[].buymed_sync_data`:** production null 21/21. Staging có object ở 2/12 (`unit_sync_type`, `last_sync_at`, `ref_unit_id`, `unit_name`). Parser phải chịu được cả null lẫn object.

### 5.4 Chưa so được (cần người dùng hoặc phiên đăng nhập)
- Frontend POS (build, trang GR, chế độ nhập hàng, ô tìm SO): cả hai trang chuyển sang SSO khi chưa đăng nhập.
- Tra QR trên staging: đường dẫn và dữ liệu trả về cho tem staging (§6 D4). Đã biết: mã production không tra được trên staging.
- Tìm GR theo SO trên staging (§6 D5).

## 6. Câu hỏi mở và việc cần xác minh

**Đã trả lời (người dùng, 24/10):**
- S1. Nextwaves staging = tenant `circa-stg` (`https://circa-stg.nextwaves.app`), đi cặp với POS staging và Buymed staging (`buymed-stag`).
- S2. Đã gửi PO staging PO00006745: IMPORT_STOCK, **không gắn SO** (§2.1).
- S3. Mã QR / UID production không tra được trên staging. Đã có tem QR staging map EPC đầy đủ, có tem vật lý.
- S4. Dùng cửa hàng 2222. Production theo tài khoản đăng nhập (`agent.md` §3).

**Dữ liệu cần lấy trên STAGING (chỉ đọc, lấy qua giao diện: DevTools → Network → chuột phải request → Copy → Copy response; không cần cURL / token):**
- D1. Nextwaves stg, trang `/vi/stock/inter-tenant/orders`: gõ `SOBD1593858` vào ô tìm, rồi gõ `1593858`.
  Lấy response `inter-tenant-orders?…q=…` → biết hướng A có tìm được theo refId không.
- D2. Nextwaves stg, trang `/vi/purchases`: response danh sách không lọc, và response khi tìm `SOBD1593858` / `PO28237814`.
- D3. Nextwaves stg, mở `/vi/purchases/55bd221f-65de-4a4d-8a77-40c568a6f176` (**không bấm nhận hàng**).
  Lấy response mọi API trang gọi (`purchase-orders/<id>`, `…/receiving`, shipment…) → để gán UID → sản phẩm / lô trước khi nhận.
- D4. POS stg, trang Tra cứu QR (`/tra-cuu-qr`): tra `1792145819958AA1` (1110) và `1792379177779AA1` (5451), lấy response.
  Thêm: quét một tem staging vào Notepad để thấy đúng chuỗi máy quét gõ ra (có chứa `/qr/` không).
  **Không quét ở màn phiếu nhận hàng** (sẽ ghi vào GR).
- D5. POS stg, danh sách phiếu nhận hàng → ô nhập mã SO → `1593858`. Lấy response `goods-receipt/search?query=so_thuocsi=…`.

**Production (để sau, chỉ đọc):** T1 `inter-tenant-orders?q=SOBD38468903`; T2 `purchase-orders/open?warehouseId=eb5e2b4f…`;
T3 tra `1791877162941B81` / `1791877427805C13`; T4 `goods-receipt/search?query=so_thuocsi=38468903,…`.

**Nghiệp vụ (stakeholder):**
- Q1. Hậu tố "-F" (POS) và "-15942586" (Nextwaves) nghĩa là gì? Một SO có tách thành nhiều lần giao / nhiều GR không?
- Q2. Hàng bán theo lốc gắn tem theo lốc hay theo chai (xem R1)?
- Q3. Ai bấm HOÀN THÀNH trên POS?
- Q4. Nhận thiếu / thừa ở Nextwaves (`onMissing: keep_open`) thì GR xử lý thế nào?
- Q5. Extension xác thực Nextwaves bằng gì: phiên đăng nhập web Nextwaves trên cùng Chrome (giống POS), hay khoá API có quyền purchase / inter-tenant?
- Q6. Staging không có GR sinh từ SO. Chấp nhận thử luồng tìm PO bằng dấu vân tay E trên staging, còn chuỗi SO chỉ kiểm được ở production? Hay Buymed-stag tạo được PO POS staging từ SO?
- Q7. SP trackBatch (1110, 5451) bị tách 2 dòng giao. Hai dòng là hai lô khác nhau? GR POS chỉ có một lô / dòng. Nếu tem mang lô khác, POS sẽ tạo thêm lô / detail.

## 7. Rủi ro đã thấy
- R1. **Lệch đơn vị gắn tem:** SP 2399 natri clorid, POS dòng 1 lốc (đơn vị RFID = lốc), Nextwaves 10 UID (mỗi chai một UID). Gõ lại 10 UID vào POS sẽ báo vượt số lượng từ mã thứ 2.
- R2. Một SO → 2 PO trên POS (PO01970737 origin + PO01970951). Có thể phải khớp theo lần giao, không theo SO.
- R3. Đơn vị không đồng nhất giữa hai bên:
  - `quantity` của PO Nextwaves (`purchase-orders/<id>`) tính theo đơn vị gốc (100 viên). POS tính theo đơn vị dòng (1 hộp).
  - Bên inter-tenant: `lines[].quantity` + `unit` trùng đơn vị dòng POS; `localQuantity` trùng `base_quantity` POS; nhãn `localUnit` không đáng tin (staging).
- R4. JWT Nextwaves sống 1 giờ.
- R5. QR nhân đôi sau COMPLETED (§1).
- R6. Dữ liệu staging không giữ bất biến đơn vị của production (§5.3). Test xanh trên staging chưa đủ chứng minh production.
- R7. ~~Staging không thử được chuỗi SO~~ — **đã hết** (24/10 chiều): GR03878 / PO00006750 có SO 1593858 (§2.2). GR03877 vẫn là ca không SO.
- R8. Unit Nextwaves trước khi nhận chỉ có `productTitle` + `lineId` dòng giao, không có productId. Gán theo tên là rủi ro, cần API khác (D3).
- R9. Dấu vân tay E không phân biệt được hai đơn trùng hệt hàng và số lượng → phải để người dùng chọn.
- R10. Kiểm trực tiếp mẫu inter-tenant staging 24/10: `units[].lineId` của 5 nhóm UID không trùng bất kỳ `lines[].lineId` nào trong 3 dòng PO; `units[]` không có product ID/SKU/lô. Không được ghép UID với dòng PO bằng hai `lineId` này hoặc tên hàng. Cần D3 chỉ ra quan hệ shipment line → sản phẩm/lô trước khi áp UID tự động.
  → **Phần sản phẩm đã giải (24/10):** `/receiving` trả `shipments[].lines[]` có productId / sku / unit / units (§2.3). Phần **lô** vẫn mở (D4).
- R11. **1 UID ≠ 1 đơn vị dòng GR** (GR03878: 1110 và 5451, §2.2).
  - Mã quét GR của POS production cộng +1 đơn vị dòng mỗi lần quét, không quy đổi theo đơn vị của QR.
  - Nếu staging cũng vậy, gõ lại UID vào ô quét sẽ chặn hoặc lệch lô.
  - Cần PM chọn cách ghi (`docs/dev/DEV-REVIEW-SPEC-STG-v0.1.md` §2). Cờ `is_rfid_unit` của POS cũng không khớp đơn vị tem (5451).
- R12. Reader RFID dùng chung. Trên máy POS production, `circa-qr-scan-log` giữ cổng serial của reader ở tab POS. Nếu web Nextwaves cũng đọc reader qua Web Serial thì hai bên có thể giành cổng. Chưa biết Nextwaves đọc reader bằng gì.

## 8. Nhật ký quyết định
- 20/10/2026: phân tích capture luồng nhận hàng; brainstorm chuỗi khoá ba bên.
- 24/10/2026: người dùng chốt build staging trước, production sau. Tạo project `C:\QR_code\circa-gr-nextwaves` (agent.md, state.md, samples/).
- 24/10/2026 (lần 2):
  - Người dùng trả lời S1–S4: staging = POS stg cửa hàng 2222 + Nextwaves `circa-stg` + `buymed-stag`; tem staging riêng.
  - Phạm vi: production theo tài khoản đăng nhập, staging chỉ cửa hàng 2222.
  - Cặp thử GR03877 ↔ PO28237814 (§2.1). Đề xuất thêm hướng E (dấu vân tay), chưa duyệt.

- 24/10/2026 (lần 3, operator chốt):
  - Codebase `C:\QR_code\circa-gr-nextwaves`, extension riêng.
  - Repo `https://github.com/Kai-D13/circa-gr-nextwaves`.
  - Một gói, chọn môi trường STG / PRD hoặc nhập URL.
  - Vai trò: operator / dev-team Claude Code / PM Codex (`agent.md` §2–3).
  - Repo GitHub đang **public** (kiểm API 24/10) → chưa push, chờ operator.

- 24/10/2026 (lần 4, operator chốt):
  - Repo **public**. Dev thay tên nhân viên trong `samples/` bằng `<nhân viên>`, viết lại lịch sử cục bộ trước lần push đầu.
  - Operator đăng nhập GitHub cho lần push đầu.
  - PM đọc và làm việc trực tiếp trên `C:\QR_code\circa-gr-nextwaves` (máy local).
  - Máy thử staging = laptop này.
  - Operator gửi cặp GR03878 / PO00006750 (có SO) + PO Nextwaves chi tiết. Dev gửi phản hồi spec `docs/dev/DEV-REVIEW-SPEC-STG-v0.1.md`.

- 24/10/2026 (lần 5):
  - Operator giải thích luồng thật: PO Nextwaves ≠ PO POS; POS chỉ sinh PO / GR khi giao thành công; khoá là SO (§2.3).
  - Extension làm **một** tính năng (`docs/dev/LOGIC-v0.1.md` §0).
  - Gửi mẫu `/receiving` (PO76458756). Dev viết logic chi tiết đề xuất `docs/dev/LOGIC-v0.1.md` để PM audit.

- 24/10/2026 (lần 6, operator):
  - Không có nút "Nhận bằng RFID": mở GR là extension tự chạy.
  - Chế độ nhập hàng POS phải là "Scan QR tăng SL nhận" (ý nghĩa chờ làm rõ).
  - Hai đường vào (GR, "Nhập SO thuocsi").
  - PO28237814 giữ để thử.
  - Dev phát hiện tích hợp Circa có sẵn của Nextwaves, viết `docs/dev/LOGIC-v0.2.md`.

- 24/10/2026 (lần 7, operator):
  - Không dùng API tích hợp Circa của Nextwaves (Nextwaves làm extension riêng); kênh Circa POS trên Nextwaves staging "Cần xử lý", chưa đồng bộ.
  - Gửi capture luồng đầy đủ (POS nhập SO → `/chi-tiet-so`; Nextwaves PO28237814 có 3 lần xác nhận bị 400).
  - Dev viết `docs/dev/LOGIC-v0.3.md`.

- 24/10/2026 (lần 8, operator):
  - Q1: dùng API thường của Nextwaves, không dùng tích hợp Circa của Nextwaves.
  - Q3: W1. K1 chưa gỡ.
  - Gửi kết quả tra QR (D4) và mẫu nhận thành công (PO88508353, hub-order).

- 24/10/2026 (lần 9, operator):
  - a) **Dược sĩ bấm HOÀN THÀNH** (Q4 chốt). "Xác nhận nhận hàng" trên Nextwaves là xong PO bên Nextwaves; extension chuyển về POS và màn POS phải có đủ UID đã map.
  - b) Bắt theo `thuocsi_delivery_code`: mỗi mã giao ↔ 1 PO POS ↔ 1 GR.
  - c) Không cần chế độ nhập hàng trên POS; dược sĩ chỉ đặt hàng ở màn nhận của Nextwaves.
  - d) Chuyển thẳng màn quét `/vi/purchases/receive?po=<id>` (`id` = SO, số PO hoặc id PO).
  - Thử trên PO00006750 / GR03878 nếu được; "Build và test chính xác".
  - Dev build batch v0.1-staging (nhánh `batch/v0.1-staging`, commit `a08d541`, gói `FF5CD95B`, giải nén `C:\circa-gr-nextwaves-v0.1.0`). Báo cáo: `docs/dev/BATCH-v0.1-STG.md`.

- 24/10/2026 (lần 10–11):
  - PM audit `a08d541`: chưa cho merge / ghi; 5 finding P1, 3 finding P2; chốt P2 nhận thiếu, P3 nhiều GR, P4, P6, P7.
  - Dev sửa → v0.1.1 `d124453` (gói `D8CD9AFD`). Quyết định thiết kế để PM duyệt:
    - cấp phép ghi một lần / một GR / 30 phút, chỉ từ popup;
    - lease 90 s > hết giờ PUT 30 s (= `grpc-timeout` của app POS);
    - hạ nhiệt 60 s sau kết quả ghi không rõ;
    - bằng chứng "đã nhận" = lượt 2xx của phiên + biên nhận mới (cấu trúc `receipts` theo mẫu thật PO88508353) + `receivedEpcs` phiếu gửi.

- 24/10/2026 (lần 12–13):
  - PM audit lại `d124453`: chấp nhận thiết kế cấp phép một lần / một GR / 30 phút và các mốc lease / timeout / cooldown cho staging. Thêm finding P1.6, P1.7.
  - Dev sửa → v0.1.2 (`6eeb3c0`, đầu nhánh `5d117d2`, gói `525BCE84`).

## 9. Việc tiếp theo
1. ~~Operator quyết repo public / private~~ — đã chốt public (24/10).
2. Operator mở session PM Codex bằng `docs/PROMPT-PM-CODEX.md`. PM chốt hướng §3 / §6 và ra spec v0.1 staging chia batch.
3. Operator gửi D1–D5 (staging, Copy response) và trả lời Q1–Q7 khi PM cần.
4. Dev chỉ dựng `src/`, `tests/`, `scripts/` khi spec batch đầu được duyệt.
5. PM đã soạn `docs/SPEC-STG-v0.1.md` ngày 24/10/2026: B1 chỉ đọc có thể giao dev; B2–B3 chỉ đọc qua gate; B4 ghi POS có gate và cần operator cho phép từng lần. Các quyết định nghiệp vụ trong spec là **đề xuất**, chưa phải quyết định đã chốt.
6. PM xem `docs/dev/DEV-REVIEW-SPEC-STG-v0.1.md` (F1–F8):
   - Đổi cặp thử chính sang GR03878?
   - Đường SO trên staging.
   - Cách ghi khi 1 UID ≠ 1 đơn vị dòng (R11).
   - Chốt spec v0.2 hoặc giao B1.
7. ~~PM audit `docs/dev/LOGIC-v0.1.md`~~ → thay bằng mục 8.
15. **Hiện hành (sau PM audit v0.1.2, 24/10):**
    - **Operator — T1 chỉ đọc** (dev đề xuất cài v0.1.2 `C:\circa-gr-nextwaves-v0.1.2`; PM cho phép cả v0.1.1):
      - Staging, **không cấp phép điền**, mở GR03878;
      - gửi ảnh khung hai tab, Copy response `inter-tenant-orders/receiving?…q=SOBD1593858` và `goods-receipt/search?query=so_thuocsi=1593858…` (giữ `total / page / limit`, bỏ token).
    - K1 → lượt nhận thật (2xx `receive-scan`, GET PO, GET shipment, GET `/receiving` sau nhận). W1 chỉ sau đó và PM audit lại.
    - **Dev:** trước khi nâng cấp giữ cùng extension ID, xử lý phiên active từ bản cũ thiếu khoá (P2.4); kiểm thử phiên cũ. Chưa merge mã ghi.
14. (cũ, thay bằng mục 15) PM audit lại v0.1.2 theo `docs/dev/FIX-AUDIT-v0.1.1-STG.md`; kết quả ở `docs/pm/AUDIT-v0.1.2-STG-20261024.md`.
13. (cũ, thay bằng mục 14) Sau PM audit lại v0.1.1:
    - **Dev:** sửa P1.6/P1.7 theo `docs/pm/AUDIT-v0.1.1-STG-20261024.md`, gửi DIFF và test nguyên văn; runtime đổi thì version/ZIP/SHA-256 mới. PM audit lại trước merge.
    - **Operator — T1 chỉ đọc bằng v0.1.1:**
      - cài `C:\circa-gr-nextwaves-v0.1.1`, Staging, **không cấp phép điền**, mở GR03878;
      - chụp hai khung, Copy response `inter-tenant-orders/receiving?…q=SOBD1593858` và `goods-receipt/search?query=so_thuocsi=1593858…` (giữ `total/page/limit`).
    - Operator / Nextwaves / Buymed gỡ **K1** → lượt nhận thật. Dev cần các response sau để thay phần dựng lại:
      - 2xx `receive-scan`;
      - `purchase-orders/<id>` và `inter-tenant-shipments/<id>` sau khi nhận.
    - W1: chỉ khi gate trên đạt và PM audit lại. Operator chỉ định 1 GR staging rồi cấp phép một lần trong popup.
12. (cũ, thay bằng mục 13) PM audit lại v0.1.1 theo báo cáo dev, T1 chỉ đọc.
11. (cũ, thay bằng mục 12) Sau batch v0.1:
     - PM đã audit nhánh `batch/v0.1-staging` theo `docs/pm/AUDIT-BATCH-v0.1-STG-20261024.md`; **chưa cho merge hoặc ghi POS**. Dev sửa P1.1–P1.5, báo gate để PM audit lại.
    - Operator thử **T1 (chỉ đọc)** trên laptop này: cài `C:\circa-gr-nextwaves-v0.1.0`, Staging, điền phiếu = Tắt, mở GR03878 (§6 file báo cáo).
    - Operator / Nextwaves / Buymed gỡ **K1** (hoặc tạo SO thử có dòng theo đơn vị gốc) → **T3**: lượt nhận thành công thật.
      Dev cần capture lượt đó (response 2xx `receive-scan`, `purchase-orders/<id>` và `inter-tenant-shipments/<id>` sau khi nhận) để thay phần dựng lại trong test.
    - Operator chọn **1 GR staging cho phép ghi thử W1** (P1). Chỉ ghi khi operator cho phép lần đó.
10. (cũ, trước khi code) **Hiện hành cũ:**
    - PM: viết **spec v0.2** từ `docs/dev/LOGIC-v0.3.md` (§0–§9) + quyết định Q1 / Q3, rồi giao **B1 (chỉ đọc)**.
    - Operator chốt:
      - Q4: ai bấm HOÀN THÀNH;
      - Q6: SO nhiều GR;
      - chế độ "Scan QR tăng SL nhận" còn cần không khi đã chọn W1;
      - đích chuyển màn: `/vi/purchases/<id>` hay `/vi/purchases/receive?po=<id>`.
    - Operator lấy (chỉ đọc, không bấm xác nhận):
      - **R1:** mở `https://circa-stg.nextwaves.app/vi/purchases/receive?po=SOBD1593858` → Copy response `inter-tenant-orders/receiving?…q=SOBD1593858`;
      - **R2:** mở `…/vi/purchases/receive?po=PO28237814` → Copy response `…receiving?…q=PO28237814`.
    - Để sau (B3 / B4):
      - một lượt nhận thành công theo đường đơn liên kết (sau khi gỡ K1);
      - một GR staging operator cho phép dev ghi thử W1.
9. (cũ) PM audit `docs/dev/LOGIC-v0.3.md` và chốt Q1–Q6 (§7 của file đó). Q1, Q3 đã chốt 24/10; D4 đã có.
8. (cũ) PM audit `docs/dev/LOGIC-v0.2.md` và chốt Q-L, Q-A, Q-N, Q-M, Q-S, Q-K, Q-U (§6 của file đó).
   Operator lấy dữ liệu §7 của file đó: trạng thái kết nối Circa, bộ chọn GR của PO28237814, phép thử nhận PO28237814 có liên kết GR03878.
   Mục 7 cũ:
   Operator lấy dữ liệu §8 của file đó: D4 cho 12 UID, `/receiving` của PO28237814, lời gọi "Xác nhận nhận hàng", D1.
