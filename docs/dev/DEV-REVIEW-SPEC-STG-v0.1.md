# Dev-team phản hồi spec v0.1 staging — dữ liệu mới 24/10/2026 (chiều)

Người viết: dev-team (Claude Code). Gửi PM qua operator. **Không sửa spec**; spec thuộc PM.
Mọi mục dưới đây ở mức **"đã kiểm từ file"**: tính bằng script trên các mẫu trong `samples/`, không thao tác trên môi trường thật.

Dữ liệu mới operator gửi:
- `samples/gr-stg-GR03878-20261024.json`
- `samples/po-stg-PO00006750-SOBD1593858.json`
- `samples/nw-stg-po-PO28237814-detail.json` (`GET /purchase-orders/<id>`)

Bản inter-tenant không đổi so với mẫu cũ.

## 1. Sự thật mới

| # | Sự thật | Bằng chứng |
|---|---|---|
| F1 | **Staging có đường SO.** GR03878 là GR mà hệ thống tạo (`created_by_name` "Hệ thống") ∈ PO00006750 (`source_type` SO_THUOCSI, `sale_order_number` "1593858", `thuocsi_delivery_code` ["SOBD1593858-F"]). Cụm số SO trùng `refId` "SOBD1593858-1056745" của PO28237814 | PO00006750 `goods_receipts` = [GR03878]; GR03878 `purchase_order_id` = PO00006750 |
| F2 | Một SO → **2 PO POS**: `list_po_code_with_same_thuocsi_id` = [PO00006749, PO00006750], `origin_po_id` có giá trị. Chỉ PO00006750 có GR. Production cũng vậy (PO01970737 / PO01970951) | PO00006750; `samples/po-prod-…` |
| F3 | **Dấu vân tay E khớp cả GR03877 (tạo tay, không SO) lẫn GR03878 (sinh từ SO)** với PO28237814: cùng multiset {(1110,12),(5451,40),(2431732,2)}. R9 đã xảy ra trên dữ liệu thật | script đối chiếu |
| F4 | **GR03878: số UID ≠ số lượng dòng ở 2/3 dòng** (bảng dưới) | GR03878 + inter-tenant |
| F5 | GR03878 có **2 lô / sản phẩm** (mỗi lô quantity 1 theo đơn vị dòng). Nextwaves tách 1110 và 5451 thành **2 dòng giao × 3 UID / 2 UID**, tức 3 vỉ = 1 hộp, 2 túi = 1 hộp. Giả thuyết: **mỗi dòng giao là một lô**. Riêng Soffell: POS 2 lô nhưng Nextwaves chỉ 1 dòng giao (trackBatch false) | GR03878 `details[]`; inter-tenant `units[].lineId` |
| F6 | PO Nextwaves chi tiết: `items[].externalLineKey` = `lines[].lineId` của inter-tenant (khớp 3/3). Nhưng `units[].lineId` không trùng mã dòng đơn (0/12) và không trùng `items[].id` (0/12) → R10 đúng | script |
| F7 | PO Nextwaves chi tiết: `quantity` theo đơn vị gốc (12 / 40 / 2); `externalProductId` **null ở 2/3 dòng** → chỉ dùng được `productSku` "CIRCA-<product_id>"; `product.trackBatch` false trong khi nguồn Buymed `trackBatch` true; `baseUnitOfMeasure` ghi "hộp" nhưng số là viên | `nw-stg-po-PO28237814-detail.json` |
| F8 | Mã ô quét GR của **POS production** (build bắt được ngày 19/10): mỗi lần quét cộng `received_quantity + 1` theo **đơn vị dòng**, không quy đổi theo đơn vị của QR. Khi tổng nhận ≥ quantity thì báo "Số lượng đã nhận vượt quá số lượng cần nhận!". Build POS staging **chưa kiểm** (cần phiên đăng nhập) | JS trang GR trong capture 19/10 (`state.md` §1) |

**Bảng F4 — GR03878 so với PO28237814:**

| SP | Dòng POS | Lô POS | Nextwaves | UID | 1 UID = |
|---|---|---|---|---|---|
| 1110 | 2 hộp (1 hộp = 6 viên), base 12 | A1-121229 (1), 261009DHAUS-121228 (1) | 6 vỉ, local 12 | 6 (2 dòng giao × 3) | 1 vỉ = 2 viên = 1/3 hộp |
| 5451 | 2 hộp (1 hộp = 20 viên), base 40 | 261009KSDHAU-121228 (1), A1-121228 (1) | 4 túi, local 40 | 4 (2 × 2) | 1 túi = 10 viên = 1/2 hộp |
| 2431732 | 2 chai, base 2 | 261016KHASUFDB-060627 (1), A98-060627 (1) | 2 chai | 2 (1 dòng giao) | 1 chai |

Cờ `is_rfid_unit` của POS cũng không khớp tem: 1110 là `vỉ` (khớp tem); 5451 là `hộp` (tem lại theo túi). Không dùng được cờ này để suy ra lượng mỗi UID.

## 2. Ảnh hưởng tới spec v0.1

1. **§2.1 / B1–B2 — cặp thử và cách ghép.**
   - Đề xuất đổi cặp thử staging chính sang **GR03878 / PO00006750 ↔ PO28237814**, chạy được đường SO.
   - Giữ GR03877 / PO00006745 làm **ca âm**: không có SO, chỉ được hiện ứng viên để người dùng chọn, **không tự ghép**.
   - Vì F3, dấu vân tay E chỉ nên là **bước kiểm** sau khi tìm theo SO, không phải cách tìm.
   - §2.2 ghi "không đưa đường SO vào gate staging". Điểm này cần PM xem lại theo F1.
2. **§2.4 / B4 — gõ lại UID vào ô quét POS.**
   - Theo F4 + F8, nếu POS staging xử lý giống production thì GR03878 **không thể** nhận đủ bằng cách gõ lại 12 UID:
     - 1110: UID thứ nhất của lô A1 đã làm detail đủ 1/1 hộp; UID thứ 2 của cùng lô sẽ bị chặn, hoặc POS đưa sang detail khác sai lô.
     - Kết quả dự kiến: chỉ nhận đúng ở dòng Soffell.
   - Cần PM chọn:
     - (a) chỉ gõ lại khi **1 UID = 1 đơn vị dòng**; dòng khác bị chặn, xử lý tay. Với GR03878 là 2/3 dòng bị chặn;
     - (b) ghi trực tiếp qua `PUT …/detail` với `received_quantity` đã quy đổi và danh sách UID theo lô. Cần một phép thử hợp đồng ghi trên staging, có operator cho phép: server có nhận nhiều `thuocsi_qr_codes` trong một lần và lượng không tròn không;
     - (c) hỏi đội POS cách nhận tem theo đơn vị nhỏ hơn đơn vị dòng.
   - B3 không bị ảnh hưởng (chỉ đọc). Dev đề xuất B3 tính sẵn lượng tăng dự kiến theo **đơn vị dòng** cho từng lô = Σ(lượng gốc của UID) / `convert_rate` của đơn vị dòng. Lẻ hoặc vượt thì chặn và ghi lý do.
3. **§3 — bất biến quy đổi.**
   - Lượng của mỗi UID không lấy từ `is_rfid_unit`, `localUnit` hay `baseUnitOfMeasure` (F4, F7).
   - Nguồn đề xuất: đơn vị của dòng Nextwaves (`lines[].unit`), quy về POS qua `retail_units[].convert_rate` cùng tên đơn vị. Kiểm chéo bằng `circaUnitName` của tra QR (D4).
   - Không suy được thì chặn.
4. **B3 — gán UID → lô.** Giả thuyết F5 (dòng giao = lô) cần D3 / D4 xác nhận trước khi dùng. Với Soffell (1 dòng giao, 2 lô POS), lô của từng UID chỉ có thể lấy từ tra QR (D4).

## 3. Dữ liệu dev cần thêm (đều chỉ đọc, operator lấy bằng Copy response)

- **D4 (quan trọng nhất):** POS staging, trang Tra cứu QR, cho **cả 12 UID** của PO28237814 (hoặc ít nhất 1 UID mỗi dòng giao):
  - `circaUnitName`, `lot`, `expiredDate`, `circaReceiptCode`, `productId`.
  - Chuỗi máy quét gõ ra khi quét 1 tem staging (Notepad).
- **D3:** mọi GET khi mở PO28237814 trên Nextwaves (`…/receiving`, shipment) → quan hệ dòng giao ↔ sản phẩm / lô.
- **D1:** `inter-tenant-orders?direction=outbound&q=SOBD1593858` và `q=1593858`.
- **D5:** POS staging, ô mã SO ở danh sách phiếu nhận hàng → `1593858` (trả GR03878? có GR của PO00006749 không?).
- **PO00006749** (PO gốc cùng SO): trạng thái và `goods_receipts`, để biết vì sao một SO sinh 2 PO.
- **Reader trên laptop thử:** web Nextwaves đọc reader bằng gì (Web Serial trong trình duyệt hay ứng dụng agent)?
  - Trên máy POS production, `circa-qr-scan-log` đang giữ cổng serial của reader ở tab POS.
  - Hai bên dùng chung một reader thì có thể giành cổng. Cần biết sớm để thiết kế.
