# Logic tính năng — v0.2 (dev đề xuất, 24/10/2026 chiều) — thay `LOGIC-v0.1.md`

> **ĐÃ ĐƯỢC THAY bởi [`LOGIC-v0.3.md`](LOGIC-v0.3.md)** (24/10 tối). Operator chỉ đạo **không dùng tích hợp Circa của Nextwaves**.
> Extension tự ghi GR, nên phần "extension không ghi POS" (C3, §2, §4) **không còn hiệu lực**.

Người viết: dev-team. **Đề xuất để PM audit**, chưa phải quyết định đã chốt.
Nguồn:
- 4 capture operator gửi 24/10 (POS staging mở GR; Nextwaves PO / dòng giao cũ và PO28237814; POS "Nhập SO thuocsi").
- JS trang POS staging (build `Xmi2WXwB8q2C8iMu0_ghb`) và web Nextwaves staging (module `circa`, `circa-receipt-link`).
- Các mẫu trong `samples/`.

Mức bằng chứng: **[file]** = đã kiểm từ capture / mẫu / JS; **[giả thuyết]** = chưa chứng minh.

## 0. Thay đổi so với v0.1

| # | v0.1 | v0.2 | Căn cứ |
|---|---|---|---|
| C1 | Dược sĩ bấm nút "Nhận bằng RFID" trên GR | **Không có nút.** Dược sĩ mở GR là extension tự nhận GR → PO → SO → PO Nextwaves và tự chuyển sang Nextwaves | operator 24/10 |
| C2 | Một đường vào (trang GR) | **Hai đường vào:** (1) mở GR từ danh sách; (2) nút "Nhập SO thuocsi" → `/chi-tiet-so/<SO>` | operator 24/10 + capture 08-43-25 **[file]** |
| C3 | Extension tự ghi số lượng + UID vào GR (`PUT detail`) | **Nextwaves đã tự làm việc này** qua tích hợp Circa: liên kết PO Nextwaves ↔ GR Circa, rồi đẩy hàng đã nhận + UID và **hoàn tất GR trên Circa** khi nhận đủ. Đề xuất extension **không ghi POS** | JS web Nextwaves **[file]** (§2) |
| C4 | Lô của UID lấy qua tra QR trên POS | Lấy được từ dòng giao Nextwaves: `GET /inter-tenant-shipments/<id>` có `batch {batchNumber, expiryDate}`, khớp 4/4 lô GR03878 | **[file]** |
| C5 | Chế độ nhập hàng: chưa bàn | Operator yêu cầu chế độ "Scan QR tăng SL nhận" (ý nghĩa cần làm rõ, §6 Q-M) | operator 24/10 |

## 1. Hai đường vào trên POS **[file]**

| Đường | URL | Lấy SO | Lấy GR |
|---|---|---|---|
| (1) Mở GR từ danh sách | `/danh-sach-phieu-nhan-hang/<grId>` | GR → `purchase_order_id` → `GET pos/<posId>/po/<poId>` → `sale_order_number` | `grId` trên URL (`GET goods-receipt/<grId>`) |
| (2) "Nhập SO thuocsi" | `/chi-tiet-so/<SO>` (ví dụ `/chi-tiet-so/1593858`) | **cụm số trên URL** | `GET goods-receipt/search?query=so_thuocsi=<SO>,pos_id=…,with_items=true,with_seller_code=true,with_details=true&limit=1000&is_with_retail_unit=true&is_with_lot=true` → `goods_receipts[]` (mẫu `pos-stg-gr-search-so-1593858.json`: đúng GR03878) |

- Cả hai màn đều là **màn nhập hàng** có chọn chế độ (mặc định "Điền thủ công", state trên trang).
- Màn `/chi-tiet-so` có thêm "Nhận đủ hàng", "Reset tất cả", in tem.
- Ô quét của cả hai màn: chuỗi **bắt buộc chứa `/qr/`**, và mỗi lượt quét cộng **+1 đơn vị dòng**, không quy đổi.
- Tem Circa staging lại có dạng `https://qr.v2.circa.vn/item/<UID>`, không có `/qr/`.
  - ⇒ Quét các tem này vào ô quét POS sẽ báo "Mã QR không đúng định dạng".
  - Đây là thêm một lý do để không ghi POS bằng cách gõ lại mã. **[file]**

## 2. Tích hợp Circa có sẵn trong Nextwaves **[file: JS web staging]**

API (module `circa`):

| API | Ý nghĩa (theo tên + chữ hiển thị) |
|---|---|
| `GET /integrations/circa/connection` · `PUT` · `DELETE` · `POST /integrations/circa/test` | Kết nối Nextwaves ↔ POS Circa (trang `/settings/integrations/circa`) |
| `POST /integrations/circa/pull-purchase-orders` · `POST /integrations/circa/backfill` | Kéo PO từ Circa về |
| `GET /integrations/circa/goods-receipts?purchaseOrderId&scope&search&page` | Danh sách GR Circa để chọn, có **độ khớp %**, "Khớp nhất" nằm trên cùng |
| `GET /integrations/circa/purchase-orders/<poId>/link` | `{eligible, linked, pulled, circaPurchaseOrderId, circaPurchaseOrderCode, goodsReceiptId, goodsReceiptCode, goodsReceiptStatus}` — PO28237814 hiện `eligible: true, linked: false` |
| `PUT /integrations/circa/purchase-orders/<poId>/link` `{goodsReceiptId}` · `DELETE …/link` | Liên kết / bỏ liên kết PO Nextwaves với GR Circa. Response có `pushed {pushed, completed}` |
| `GET /integrations/circa/scan/availability` · `GET /integrations/circa/scan/qr?code&warehouseId` | Tra QR Circa từ Nextwaves |

Chữ hiển thị (nguyên văn):
- "Hàng nhận và UID sẽ được ghi vào phiếu này, và phiếu được hoàn tất trên Circa khi đơn nhận đủ."
- "Trước khi hoàn tất, hãy chọn phiếu nhận hàng Circa của đơn này. Hàng và UID sẽ được hoàn tất trên Circa."
- "Đã liên kết với phiếu nhận hàng Circa {code}. Hàng đã nhận và UID đã được gửi, phiếu đã hoàn tất trên Circa."
- "Một số dòng chưa gửi được sang Circa, hệ thống sẽ tự gửi lại."
- "Tiếp tục, không dùng Circa."

⇒ Phần "gửi kết quả về POS để done PO" (operator mô tả) **Nextwaves đã làm ở backend**. Điều kiện: PO Nextwaves được liên kết với đúng GR Circa trước hoặc lúc hoàn tất nhận. **Chưa thấy chạy thật** (chưa có capture nhận hàng có liên kết) → **[giả thuyết]** cho tới khi thử PO28237814.

## 3. Khoá liên kết (cập nhật)

| Cần nối | Khoá | Căn cứ |
|---|---|---|
| GR → SO | đường (1): GR → PO POS → `sale_order_number`; đường (2): cụm số trên URL `/chi-tiet-so/<SO>` | **[file]** |
| SO → đơn Nextwaves | cụm số đầu của `refId` (`SOBD1593858-1056745`) | **[file]** |
| Kiểm đúng đơn | dấu vân tay: Σ(số UID × `convert_rate` POS của `line.unit`) = `base_quantity` dòng GR, theo từng sản phẩm. Phân biệt đúng PO28237814 (SO 1593858) với PO76458756 (SO 1593849) | **[file]** |
| UID → sản phẩm, đơn vị | `/receiving` (`shipments[].lines[]`) hoặc `/inter-tenant-shipments/<id>` (`lines[]`: `epcs` + `batch`) + `units` (EPC → UID) | **[file]** |
| UID → lô GR | `batchNumber` + `expiryDate` (YYYY-MM-DD) → `lot_date` = `<batch>-<DDMMYY>`; khớp 4/4. Sản phẩm không quản lý lô (Soffell): **không có lô** bên Nextwaves trong khi POS có 2 lô | **[file]** |
| PO Nextwaves ↔ GR Circa | `PUT /integrations/circa/purchase-orders/<poId>/link {goodsReceiptId}` | **[file]** (JS) |

## 4. Máy trạng thái đề xuất (extension không ghi POS)

```
S0 nhận trang → S1 tìm SO → S2 tìm PO Nextwaves → S3 chuyển sang Nextwaves → S4 đảm bảo liên kết GR → S5 dược sĩ nhận → S6 kiểm kết quả
```

- **S0** — trang POS là `/danh-sach-phieu-nhan-hang/<grId>` hoặc `/chi-tiet-so/<SO>`.
  - Host khớp chế độ STG / PRD; cửa hàng hợp lệ (STG chỉ 2222).
  - GR ở trạng thái chờ nhận / đang nhận.
  - Tự chạy, **không có nút** (C1). Cần chặn chạy lặp khi trang tải lại: mỗi GR một phiên.
- **S1** — đường (1): GR → PO POS → SO, kiểm hai chiều (`grId ∈ goods_receipts`). Đường (2): SO trên URL → `search so_thuocsi` → danh sách GR.
  - SO có > 1 GR đang chờ → mỗi GR một phiên. Đường (2) xử lý theo từng GR: cần chốt (Q-S).
  - Không có SO → dừng, báo "phiếu không đến từ đơn Buymed".
- **S2** — tìm đơn inter-tenant theo SO, lọc theo đối tác Buymed / kho / hướng, rồi kiểm dấu vân tay qua `/receiving`.
  - Đúng 1 → đi tiếp. 0 hoặc ≥ 2 → dừng, kèm bảng lệch.
  - Đọc `GET …/link`:
    - đã liên kết **GR khác** → dừng (cảnh báo nhầm phiếu);
    - đã liên kết **đúng GR** → đi tiếp;
    - chưa liên kết → sang S4.
- **S3** — mở tab Nextwaves tới trang PO `/vi/purchases/<poId>` (hoặc trang dòng giao `/vi/stock/inter-tenant/<shipmentId>`, cần chốt Q-N).
  - Hiện thanh trạng thái: "GR03878 (PO00006750) ↔ PO28237814 — SO 1593858".
- **S4** — đảm bảo PO Nextwaves liên kết đúng GR:
  - (a) Extension gọi `PUT …/link {goodsReceiptId: <grId>}`. Đây là **ghi trên Nextwaves**, cần PM / operator duyệt.
  - (b) Extension không ghi, chỉ chỉ cho dược sĩ chọn đúng mã GR trong bộ chọn "Phiếu nhận hàng Circa" của Nextwaves (phiếu khớp nhất nằm trên cùng); extension đối chiếu mã sau khi chọn.
  - Đề xuất: **(b) cho batch đầu**, (a) sau khi thử.
- **S5** — dược sĩ đặt hàng lên reader và bấm "Xác nhận nhận hàng". **Nextwaves** đẩy hàng + UID sang GR Circa và hoàn tất GR khi nhận đủ. Extension chỉ quan sát.
- **S6** — extension kiểm kết quả, chỉ đọc:
  - `GET …/link`: `goodsReceiptStatus` = COMPLETED?
  - `GET goods-receipt/<grId>` trên POS: trạng thái, `received_quantity` từng chi tiết, `thuocsi_qr_codes` (loại trùng).
  - So với UID đã nhận trên Nextwaves (`purchase-orders/<id>` → `receivedUnits`).
  - Hiện "Khớp" hoặc danh sách lệch.
  - Lệch thì **không tự sửa**; báo dược sĩ / operator.
  - Cuối cùng chuyển dược sĩ về lại trang GR trên POS.

Bất biến:
- Extension **không** gọi API ghi của POS.
- Không ghi Nextwaves ngoài `PUT link` (nếu PM duyệt phương án a).
- Không bấm nút hộ dược sĩ.
- Không lưu token.
- Không gọi host khác môi trường.

## 5. Dữ kiện khác từ capture **[file]**

- PO76458756 thuộc SO **1593849** (operator xác nhận). Dấu vân tay đã loại đúng: Soffell 1 so với 2.
- Danh sách tem operator quét gồm **14 UID**: 12 UID của PO28237814 + `1792379169035AA1`, `1792379204759AA1` (không thuộc PO này).
  Nếu hai tem này nằm trên reader lúc nhận, Nextwaves sẽ báo EPC lạ.
- Chuỗi máy quét bị **rơi ký tự** (ví dụ `https:/qr.v2ccirca.vn379177779AA1`). Không dựa vào chuỗi gõ phím của máy quét cho việc gì cần chính xác.
- `/receiving` không có `refId`. `refId` chỉ có ở `GET /inter-tenant-orders/purchase-orders/<id>`.
- Màn nhận hàng Nextwaves là trang dòng giao `/vi/stock/inter-tenant/<shipmentId>` (`GET /inter-tenant-shipments/<id>`, `…/mapping-candidates`).
  Trang PO gọi `/receiving-summary` và `/integrations/circa/purchase-orders/<id>/link`.
- Capture "PO cũ" (`8932565c`, PO11623096) cũng **chưa nhận** (CONFIRMED). Chưa có capture nào của lời gọi "Xác nhận nhận hàng".

## 6. Cần PM / operator chốt

| # | Câu hỏi | Dev đề xuất |
|---|---|---|
| Q-L | Tích hợp Circa của Nextwaves (liên kết + đẩy + hoàn tất GR) có đang bật và dùng được cho POS staging cửa hàng 2222 không? Nếu có, extension **không ghi POS** (tránh ghi hai lần) | Dùng tích hợp có sẵn |
| Q-A | Liên kết PO ↔ GR: extension tự `PUT link` (a) hay hướng dẫn dược sĩ chọn trong bộ chọn của Nextwaves (b)? | (b) trước, (a) sau thử |
| Q-N | Mở trang PO hay trang dòng giao (nơi bấm "Xác nhận nhận hàng")? | Trang PO, vì thẻ liên kết Circa nằm ở đó |
| Q-M | "Chế độ nhập hàng phải là Scan QR tăng SL nhận": extension tự chọn chế độ này khi mở GR, hay chỉ kiểm? Để làm gì, khi Nextwaves mới là bên ghi GR? | Cần operator giải thích |
| Q-S | Đường (2) `/chi-tiet-so`: SO có nhiều GR thì làm sao? | Mỗi GR một phiên; hiện danh sách |
| Q-K | Soffell (không lô bên Nextwaves, 2 lô bên POS): Nextwaves ghi vào lô nào? | Chờ kết quả thử PO28237814 |
| Q-U | Nextwaves quy đổi 6 vỉ → 2 hộp, 4 túi → 2 hộp khi đẩy sang GR Circa thế nào? | Chờ kết quả thử PO28237814 |

## 7. Dữ liệu cần thêm

1. **Trạng thái kết nối Circa trên Nextwaves staging:** ảnh trang `/vi/settings/integrations/circa`, hoặc response `GET /integrations/circa/connection`. Không gửi token / khoá nếu response có.
2. **Bộ chọn GR Circa của PO28237814:** trên trang PO28237814, mở "Chọn phiếu nhận Circa" (**không bấm liên kết**). Copy response `GET /integrations/circa/goods-receipts?…`, xem GR03878 có ở đầu danh sách với độ khớp bao nhiêu %.
3. **Phép thử chính (ghi thật — chỉ khi operator quyết định làm):**
   - Nhận PO28237814 trên Nextwaves bằng 12 tem, liên kết GR03878, bấm "Xác nhận nhận hàng".
   - Bật Net Capture cả tab Nextwaves lẫn tab POS (GR03878 trước và sau).
   - Capture này trả lời Q-L, Q-K, Q-U và cho mẫu "sau khi nhận".
