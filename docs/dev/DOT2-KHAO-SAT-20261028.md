# Đợt 2 — khảo sát chỉ đọc, bước đầu (28/10/2026)

Theo PM `docs/pm/AUDIT-A1-PREP-v0.2.4-20261028.md` mục 4. **Bước đầu chỉ dùng dữ liệu đã có:**
- mẫu trong `samples/`;
- mã JS của web Nextwaves staging, nằm trong Net Capture tab Nextwaves 26/10 (`net-capture-2026-10-26T05-38-39.zip`, chỉ đọc các file `.js`, không mở token / cookie / header);
- mã `circa-qr-scan-log` (chỉ đọc).

Không đụng extension / hồ sơ Chrome của A1, không gọi API có đăng nhập. Một lần GET không đăng nhập tới trang tra QR của POS staging trả `307` (chuyển sang đăng nhập), dừng ở đó. Không ghi gì.

Mỗi mục tách **sự thật** (có nguồn) và **suy luận**.

## 1. O1 — tìm lại đơn đã nhận khi mất phiên

### Sự thật

| Nguồn | Sau khi nhận |
|---|---|
| `GET /api/v1/inter-tenant-orders/receiving?pageSize=50&q=<SO>` (mẫu T3 25/10 + GR03880 26/10) | `{"items":[],"total":0}` — đơn đã nhận rời danh sách **chờ nhận** |
| `GET /api/v1/inter-tenant-orders/purchase-orders/<poId>/receiving` (T3) | `shipments []`, `receipts [1]` (id = id response `receive-scan`) |
| `GET /api/v1/purchase-orders/<poId>` (T3) | `RECEIVED`, biên nhận `GRN…` cùng kho, `receivedUnits` theo UID |
| `GET /api/v1/inter-tenant-shipments/<shipmentId>` (T3) | `status received`, `receivedEpcs` từng dòng |
| `GET /api/v1/purchase-orders?page&pageSize` (mẫu 24/10) | PO liên tenant có `externalNumber` null — danh sách PO không chứa SO |

Mọi đường đọc "đã nhận" ở trên đều cần **`poId` hoặc `shipmentId`**. Hai id này nằm trong phiên của extension; mất phiên là mất chúng.

**Mã web Nextwaves** (module `inter-tenant-orders`, bundle 26/10) có các lời gọi đọc chưa dùng tới:
- `GET /api/v1/inter-tenant-orders` với tham số:
  - `direction`;
  - `status` ∈ `sent | pending | accepted | rejected | cancelled | shipped | received`;
  - `linkId`;
  - `q` (cắt ≤ 100 ký tự);
  - `page`, `pageSize`.

  Trang giao diện: `/vi/stock/inter-tenant/orders`.
- `GET /api/v1/inter-tenant-orders/<id>`: chi tiết đơn.
- `GET /api/v1/inter-tenant-orders/<id>/receipts`: biên nhận của đơn.
- `GET /api/v1/inter-tenant-orders/purchase-orders/<poId>`: trạng thái theo PO (404 / `INTER_TENANT_ORDER_NOT_FOUND` → null).

### Suy luận — đường khôi phục ứng viên

1. Có mã SO trên GR POS: `thuocsi_delivery_code` `SOBD…-F`.
2. Gọi `inter-tenant-orders?status=received&q=<SOBD…>`. Đơn liên tenant mang `refId` `SOBD…-<số>`.
3. Lấy `purchaseOrderId` → đường đọc PO / biên nhận đang dùng → kế hoạch như thường.

**Chưa kiểm:**
- `q` có khớp `refId` / SO không;
- danh sách có trả đơn `received` không;
- một SO có nhiều đơn (nhiều `refId`) thì phân biệt thế nào.

Không có bằng chứng thì không viết parser. PM đã chốt: fail closed + quy trình nhập tay.

### Cần lấy — một lần, chỉ đọc

- **Khi nào:** sau A1, hoặc trên hồ sơ không dùng cho A1.
- **Ở đâu:** Nextwaves staging, trang `/vi/stock/inter-tenant/orders`. Đây là D1 trong `state.md`, còn treo.
- **Làm gì:**
  - Tìm `SOBD1593849` (GR03880, đã nhận 26/10) và `SOBD1593858` (T3, đã nhận 25/10). Lọc trạng thái "đã nhận" nếu giao diện có.
  - **Copy response** của request `inter-tenant-orders?…q=…`.
  - Mở một đơn → Copy response chi tiết + biên nhận.
- **Không bấm nút nào.**

### Ca gián đoạn cho spec (theo PM review)

- mất phiên sau `receive-scan` 2xx;
- trước khi điền (W1);
- sau PUT một phần;
- khi nâng cấp / đổi Extension ID.

## 2. Mã QR POS thêm sau HOÀN THÀNH

### Sự thật (GR03880, mẫu `pos-stg-gr-GR03880-W1-sau` → `…-completed`, 26/10)

| Sản phẩm / chi tiết | Sau W1 (UID Nextwaves) | Thêm sau HOÀN THÀNH |
|---|---|---|
| Pymefucan, lô 1 | 3 mã `179213…AA1` | `1791530171312AA1` |
| Pymefucan, lô 2 | 3 mã | `1791521558471AA1` |
| Vinmotop, lô 1 | 2 mã | `1791530815461AA1` |
| Vinmotop, lô 2 | 2 mã | `1791448234209AA1` |
| Soffell | 1 mã | `1791802323643AA1` |

- Mỗi chi tiết thêm đúng `received_quantity` (= 1) mã. `internal_qr_codes` rỗng.
- Dạng mã: 13 chữ số + `AA1`, giống UID. 13 chữ số là `generatedTime` (ms) — mẫu tra QR thật có `generatedTime` = phần số của mã.
- **Mã thêm sinh 08–12/10/2026** (vd. `1791530171312` = 14:16 09/10). UID Nextwaves của lượt sinh 16/10 (`1792132654787` = 13:37 16/10). Mã thêm **có trước** khi gắn tem Nextwaves, không trùng UID.
- Production (Net Capture POS-02 19/10, ghi chú cũ): sau COMPLETED, mỗi mã trong `thuocsi_qr_codes` **lặp hai lần**. Hành vi khác staging, bên đọc danh sách phải loại trùng.

### Suy luận

Mã thêm có thể là mã QR thuocsi kho Buymed đã gán cho đơn vị hàng của lần giao, cấp hộp / chai. POS gộp vào khi hoàn tất. Chưa có response tra mã để xác nhận.

### Cần lấy

- **Ở đâu:** POS staging, trang **Tra cứu QR** (`/tra-cuu-qr`).
- **Làm gì:** tra `1791530171312AA1` và `1791802323643AA1`, Copy response. Đây là D4 trong `state.md`, còn treo.
- **Không quét ở màn phiếu nhận hàng.**
- **Sau đó cần nghiệp vụ trả lời:**
  - mã này có phải cùng đơn vị vật lý với các UID không;
  - bán hàng quét mã này có trừ trùng không;
  - extension có cần làm gì không. Hiện tại extension không đọc lại GR sau HOÀN THÀNH.

## 3. Reader — tranh cổng với extension bán hàng (Florita)

### Sự thật (mã)

**Nextwaves** dùng Web Serial ngay trong trang (`reader-service`):
- Màn quét nhận hàng tự kết nối khi đã có cổng được cấp quyền (`getPorts()` → `requestAndConnect({ autoReuseAuthorized })`), baud mặc định 115200.
- Lỗi mở cổng được gom thành `ReaderPortBusyError`:
  - "failed to open serial port", "already open", "device is already in use", "access denied";
  - `NetworkError`, `InvalidStateError`;
  - luồng bị khoá.
- Thông báo (vi): "Không thể kết nối vì đầu đọc đang được sử dụng. Nếu đã kết nối đầu đọc trên trang này, hãy tiếp tục quét. Nếu đang dùng đầu đọc ở tab hoặc ứng dụng khác, hãy ngắt kết nối tại đó rồi thử lại ở đây."

**`circa-qr-scan-log`** (`rfid-content.js`, chạy trên `pos.v2.circa.vn` + `pos.dev…`; không chạy trên POS staging, không chạy trên Nextwaves):
- Chỉ **tự** mở reader khi đủ cả ba điều kiện:
  - tab đang ở đơn bán hàng (`/ban-hang/<UUID>`);
  - trọng tài giữa các tab POS cho phép (không tab POS nào giữ, không bật "Ngắt toàn bộ tab");
  - tab đang hiển thị — hoặc có sự kiện cắm reader (`connect`).
- Không bao giờ mở hộp chọn cổng. Không biết tới Nextwaves.
- Rời màn bán hàng chỉ huỷ hẹn tự đọc (`cancelAutoArm`), không thấy đóng cổng trong nhánh đổi URL.

**Extension GR (`circa-gr-nextwaves`)** không đóng tab Nextwaves sau khi nhận. Không có `tabs.remove`; chỉ chuyển POS về phiếu.

### Suy luận (chưa thử trên máy thật)

- **Ca A — bán hàng giữ reader.** Tab bán hàng đang giữ reader thì màn quét Nextwaves báo thông báo trên. Cách xử lý: "Ngắt toàn bộ tab" trong `circa-qr-scan-log` (hoặc đóng tab bán hàng), rồi kết nối lại trên Nextwaves.
- **Ca B — Nextwaves giữ reader.** Sau khi nhận, nếu tab Nextwaves còn giữ cổng thì bán hàng RFID không tự nối được (tự kết nối thất bại thì bỏ cuộc tới sự kiện kế). Cần một bước "ngắt reader / đóng tab Nextwaves" sau khi nhận xong.
- Hai ca trên là suy luận từ cách Web Serial cho một cổng mở ở một nơi.

### Cần xác nhận tại Florita (B0)

- Thông tin máy: phiên bản Chrome + hồ sơ; extension đang chạy.
- Trên máy đó, **không ghi gì**:
  1. mở tab bán hàng có đơn (reader nối);
  2. mở màn quét nhận hàng Nextwaves → ghi lại thông báo;
  3. "Ngắt toàn bộ tab" → Nextwaves nối được không;
  4. đóng màn quét Nextwaves → bán hàng tự nối lại không.

## 4. Việc tiếp

1. **PM:** xem bước đầu này.
   - Ba lần lấy dữ liệu chỉ đọc: D1 Nextwaves, D4 tra QR, B0 Florita. Đề xuất gom **một lần sau A1**, để không đụng hồ sơ A1.
   - Hoặc PM cho lấy D1 / D4 sớm trên tab riêng của cùng Chrome (chỉ GET qua giao diện, không bấm gì).
2. **Dev:** có dữ liệu thì viết spec Đợt 2 gồm:
   - O1: đường khôi phục hoặc fail closed + nhập tay;
   - quy tắc QR sau HOÀN THÀNH: chờ nghiệp vụ;
   - hướng dẫn reader cho Florita.

   Không code trước khi PM duyệt.
