# Case: mã giao thuocsi bên Nextwaves (`deliveryOrderCode`) — 10/11/2026

**Trạng thái:** đã khảo sát chỉ đọc trên production: chỉ GET, không mở màn quét, không đụng đầu đọc. **Chưa code.**

**Operator 10/11:** Nextwaves đã thêm trường để nối GR ↔ PO ↔ SO ↔ đơn Nextwaves. Yêu cầu: "kiểm tra trước, review, check và tìm kiếm evidence, hướng build, flow chuẩn. Chưa implement".

**Link operator gửi:**
- Nextwaves: `…/vi/purchases/receive?po=SOBD38573495`.
- POS: `/chi-tiet-so/38573495` và phiếu nhận `a012e434-…` (GR85041).

## 1. Kết luận

1. **Nextwaves đã có trường.**
   - Tên bên Nextwaves là **`deliveryOrderCode`** (chuỗi).
   - Bên POS là `thuocsi_delivery_code` (mảng).
   - Giá trị trùng nhau từng ký tự: `SOBD38573495-P1`.
2. **Trường chỉ có ở `GET …/inter-tenant-orders/purchase-orders/<poId>`.**
   - Extension đã gọi đúng API này cho mọi đơn ứng viên.
   - Vì vậy không phải thêm lời gọi mới.
3. **Chỉ đơn mới có giá trị.**
   - PO-2026-000021 (tạo 10/11) có mã giao.
   - 7 đơn đang chờ nhận tạo 09/11 có trường nhưng giá trị là `null`; Nextwaves chưa điền bù.
4. **Tìm theo mã giao và mở màn quét theo mã giao:**
   - Tìm `receiving?q=SOBD38573495-P1` ra đúng 1 đơn.
   - Màn quét `…/receive?po=<mã giao>` sẽ mở thẳng đơn đó, không phải chọn. Đây là kết luận suy từ mã trang và kết quả API. Không mở trang thật, để khỏi tự kết nối đầu đọc.
   - Tìm kiếm khớp **một phần chuỗi**, ví dụ `-P1` cũng ra đơn này. Vì vậy extension phải tự so **bằng nhau** với `deliveryOrderCode`.
5. **v0.4.1 không bị ảnh hưởng** vì nó bỏ qua trường lạ.
   - Cặp GR85041 ↔ PO-2026-000021 khớp **126/126 sản phẩm** theo cách hiện tại (SO + vân tay).
   - Vì vậy phiếu này nhận được bằng v0.4.1 ngay, không cần chờ bản mới.

## 2. Bằng chứng (production 10/11, chỉ GET)

### 2.1 POS — SO 38573495 ở Lumina

| PO POS | `thuocsi_delivery_code` | Trạng thái | Dòng / SL | GR |
|---|---|---|---|---|
| PO01975131 (gốc) | `[]` | SEPERATED (đã tách) | 128 / 237 | không có; `list_child_po` = PO01975528, PO01975529 |
| PO01975528 | `["SOBD38573495-P1"]` | WAIT_FOR_PROCESS, `source_type` SO_THUOCSI, `origin_po` PO01975131 | 126 / 235 | **GR85041** Chờ nhận, chưa nhận gì |
| PO01975529 | `["SOBD38573495-P2"]` | ORDERED | 2 / 2 | chưa có |

**Nơi đọc mã giao:**
- Có trên chi tiết PO: `GET /v1/pos/<pos>/po/<po>?order_by_detail=desc`. v0.4.1 đã đọc đúng chỗ này (`pos-model.js`, `deliveryCodes`).
- Trên dòng của danh sách PO, trường này là mảng rỗng.

**Định dạng production:**
- `SOBD<SO 8 chữ số>-F` khi giao đủ.
- `-P1` / `-P2` khi tách giao.
- Ví dụ khác cùng ngày: `SOBD38575003-F`, `SOBD38576689-P1` / `-P2`, `SOBD38580216-P1` / `-P2`.

### 2.2 Nextwaves — đơn của SO 38573495

`GET …/inter-tenant-orders/purchase-orders/94c0d6bf-d998-47cf-9277-ec7f9e45d641`:

| Trường | Giá trị |
|---|---|
| `purchaseOrderNumber` | PO-2026-000021 |
| `deliveryOrderCode` | **`SOBD38573495-P1`** |
| `refId` | `SOBD38573495-16032161` (như cũ: SO + số của Buymed) |
| `status` / `purchaseOrderStatus` | shipped / CONFIRMED |
| bên bán / kho | buymed / `3f7bd541…` = kho Lumina (bảng cửa hàng ↔ kho của v0.4.1) |
| phiếu gửi | 1 phiếu, pending: IT-BUYMED-20261110102601-5303 — 126 dòng, 358 tem, mọi dòng gắn tem |
| `createdAt` | 2026-11-10 10:26 UTC (17:26 giờ VN) |

### 2.3 API nào có trường

| API (đều là GET) | Có `deliveryOrderCode`? | Extension dùng ở bước |
|---|---|---|
| `/v1/inter-tenant-orders/receiving?q=` (danh sách chờ nhận) | Không | tìm ứng viên |
| `/v1/inter-tenant-orders/purchase-orders/<poId>` | **Có** | kiểm từng ứng viên |
| `/v1/inter-tenant-orders/purchase-orders/<poId>/receiving` | Không | dòng giao + UID (vân tay) |
| `/v1/purchase-orders/<poId>` | Không | biên nhận sau khi nhận |

Ghi chú:
- Bước "kiểm từng ứng viên" là `nwOrderOfPo`.
- Danh sách chờ nhận chỉ có các khoá sau: `id`, `purchaseOrderId` / `Number` / `Status`, `counterparty`, `origin`, `status`, `warehouse`, `openShipmentCount`, `updatedAt`.

### 2.4 Tìm kiếm `receiving?q=`

| q | Kết quả |
|---|---|
| `SOBD38573495` (theo SO, cách đang dùng) | PO-2026-000021 |
| `SOBD38573495-P1`, `sobd38573495-p1` | PO-2026-000021 |
| `SOBD38573495-P2` | không có — P2 chưa lên Nextwaves |
| `SOBD38573495-F` | không có |
| `SOBD38573495-P`, `38573495-P1`, `-P1`, `16032161` | PO-2026-000021 |
| `SOBD` | 8 đơn chờ nhận (PO-2026-000014 … 000021) |

Kết luận về tìm kiếm:
- Không phân biệt hoa thường.
- Khớp một phần chuỗi, trên cả `refId` lẫn `deliveryOrderCode`.
- Danh sách chỉ có đơn còn chờ nhận.

### 2.5 Màn quét `…/purchases/receive?po=`

Nguồn: bundle production 10/11 `page-BEp8ltQl.js`, chỉ GET file JS công khai.

**Trang xử lý `po` như sau:**
- `po` là UUID → mở thẳng đơn đó.
- `po` là chuỗi khác → trang tìm `receiving?q=<po>`:
  - đúng 1 kết quả, hoặc có kết quả trùng đúng số PO → mở thẳng màn quét, `autoConnect: true`;
  - 0 kết quả → "không tìm thấy";
  - từ 2 kết quả → danh sách để chọn.

**So với bản 08/11:** logic không đổi. Trang không đọc `deliveryOrderCode`; trang chỉ dựa vào tìm kiếm.

**Hệ quả:**
- `?po=SOBD38573495-P1` mở thẳng PO-2026-000021.
- `?po=<mã giao>` của đơn cũ (mã giao `null`) → trang báo "không tìm thấy".

### 2.6 Vân tay GR85041 ↔ PO-2026-000021

- 126/126 sản phẩm bằng nhau theo đơn vị gốc POS: tổng 11 618 bên GR = 11 618 bên Nextwaves.
- 9 dòng Nextwaves tính theo đơn vị khác dòng GR. Các dòng này được quy đổi bằng đơn vị bán lẻ của GR, giống v0.4.1.
- GR85041: 126 dòng, SL 235, chưa nhận gì.

### 2.7 8 đơn Nextwaves đang chờ nhận ↔ POS

| Nextwaves | SO | Mã giao NW | Kho | Dòng NW | PO POS (mã giao, dòng) | GR POS |
|---|---|---|---|---|---|---|
| PO-2026-000021 | 38573495 | `SOBD38573495-P1` | Lumina | 126 | PO01975528 (-P1, 126) | GR85041 Chờ nhận |
| PO-2026-000020 | 38575003 | `null` | Lumina | 22 | PO01975621 (-F, 22) | GR85091 + GR85174 **HOÀN THÀNH** |
| PO-2026-000019 | 38576689 | `null` | Lumina | 42 | PO01975531 (-P2, 42) | GR85092 + GR85173 **HOÀN THÀNH** |
| PO-2026-000018 | 38580216 | `null` | Lumina | 26 | PO01975619 (-P1, 26) | GR85090 Đang nhận |
| PO-2026-000015 | 38577892 | `null` | Lumina | 13 | PO01975617 (-P1, 13) | GR85089 **HOÀN THÀNH** |
| PO-2026-000017 | 38576649 | `null` | Florita | 25 | PO01975676 (-P2, 25) | GR85121 Chờ nhận |
| PO-2026-000016 | 38580286 | `null` | Florita | 12 | PO01975674 (-P1, 12) | GR85120 Chờ nhận |
| PO-2026-000014 | 38577883 | `null` | Florita | 9 | PO01975679 (-P1, 9) | GR85124 Chờ nhận |

Ghi chú:
- Các cặp được ghép theo SO và số dòng bằng nhau. Chưa chạy vân tay cho 7 cặp cũ.
- Các đơn mã giao `null` đều tạo ngày 09/11.

## 3. Chuỗi khoá chuẩn

`GR` → `purchase_order_id` → `PO POS` → `thuocsi_delivery_code` (đúng 1 mã) **=** `deliveryOrderCode` của đơn Nextwaves → phiếu gửi `IT-…` → UID

- SO là phần trước hậu tố của mã giao: `SOBD38573495` ứng với `sale_order_number` 38573495. Extension vẫn dùng SO để tìm.
- Mỗi lần giao là một đơn Nextwaves riêng. Điều này đã thấy từ 06/11: cùng SO có hai `refId` `-16025426` / `-16025427`.
- Trước đây hai bên không có mã chung nào (chú thích v0.3.1 trong `resolve.js`). Nay đã có.

## 4. Luồng chuẩn (đề xuất cho bản sau v0.4.1)

1. Dược sĩ bấm "Nhận hàng bằng RFID" trên GR. Extension đọc PO và lấy đúng 1 mã giao, như v0.4.1.
2. Extension mở Nextwaves `…/receive?po=<mã giao>`. Nextwaves mở thẳng màn quét của đúng đơn, kể cả SO tách giao, không phải chọn.
3. Extension tìm theo SO như hiện nay rồi đọc `deliveryOrderCode` của từng ứng viên:
   - **Có đúng 1 đơn trùng mã giao** → chọn đơn đó. Các đơn khác cùng SO là lần giao khác: không xét, không khoá.
   - Vẫn kiểm Buymed, kho của cửa hàng và vân tay số lượng như hiện nay.
   - **Không có đơn nào trùng mã giao** (đơn cũ, hoặc Nextwaves không điền) → làm y như v0.4.1 (SO + vân tay). Nếu trang đang "không tìm thấy", extension tự chuyển một lần sang `?po=<id đơn đã khớp>`.
4. Đầu đọc → quét → dược sĩ "Xác nhận nhận hàng" → về POS → extension điền → dược sĩ bấm HOÀN THÀNH. Bước này không đổi.

| Tình huống | Khung extension | Dược sĩ làm |
|---|---|---|
| Mã giao khớp nhưng số lượng lệch | "Đúng đơn Nextwaves theo mã giao … nhưng lệch số lượng: SP …" — dừng | Nhận tay, báo vận hành |
| 2 đơn Nextwaves cùng mã giao | Dừng | Nhận tay, báo Nextwaves |
| PO POS có nhiều mã giao | Như v0.4.1: "chưa hỗ trợ" | Nhận tay |
| Phiếu phần còn lại | Cùng PO nên cùng mã giao, cùng đơn — như v0.4.1 | Như v0.4.1 |

## 5. Hướng build (chưa code)

| File | Đổi |
|---|---|
| `src/lib/nw-model.js`, hàm `normalizeOrderOfPo` | Thêm `deliveryCode` lấy từ `deliveryOrderCode`. Giá trị `null` hoặc thiếu → `""`. So sánh sau khi cắt khoảng trắng và đổi chữ hoa |
| `src/lib/resolve.js` | Ngữ cảnh thêm mã giao POS. Sau bước kiểm từng ứng viên: 1 đơn trùng mã → chỉ xét đơn đó (vân tay phải đạt; lệch → lý do mới). Từ 2 đơn trùng → dừng, lý do mới. 0 đơn trùng → giữ nguyên đường cũ, gồm cả khoá `nw_many_orders` |
| `src/background.js` | `openNwFor` mở URL theo mã giao, thiếu mã thì theo SO. Khi ghép tab ↔ phiên: ưu tiên trùng mã giao, sau đó mới tới trùng SO |
| `src/nw/nw-content.js` | Đưa mã giao vào ngữ cảnh. Đơn được chọn theo đường cũ mà trang đang mở bằng mã giao → chuyển `?po=<id đơn>` một lần. Chữ trên khung ghi mã giao |
| `src/lib/env.js`, `src/main/env.js` | Không đổi — đã có `nwReceivePage(env, po)` |

**Không đổi:**
- phía POS;
- phiếu phần còn lại;
- kế hoạch điền và lệnh ghi;
- đầu đọc;
- quyền của extension.

**Không thêm API, không thêm lời gọi:** extension đã GET `purchase-orders/<poId>` cho từng ứng viên.

**Luật chỉ dùng mã giao để nhận đúng đơn, không dùng để loại đơn:**
- Có đơn trùng mã → chắc chắn là lần giao này.
- Không có đơn nào trùng → quay về cách cũ.
- Nếu Nextwaves đổi tên trường hoặc định dạng, kết quả chỉ là không bản nào tệ hơn v0.4.1.

**Kiểm:**
- Unit với mẫu thật: PO-2026-000021 (có mã) và PO-2026-000020 (`null`). Bỏ tên người trong mẫu (`sentByName`, …).
- Các ca:
  - P1 / P2 cùng SO;
  - mã khớp nhưng lệch số lượng;
  - 2 đơn cùng mã;
  - không có mã → các test v0.4.1 hiện có phải đạt nguyên.
- Ca đột biến cho từng luật.
- Edge thật:
  - mở theo mã giao;
  - chuyển `?po=<id>` cho đơn cũ.

**Đóng gói:** gộp với 3 việc đầu đọc của v0.4.2 (`REQUEST-QSL-v0.4.1-DAU-DOC.md` §9.3) thành **một** bản, cài một lần, theo luật "Một version = một lần cài POS".

## 6. Phát hiện thêm (vận hành, không thuộc extension)

- **Lumina: 3 đơn Nextwaves vẫn "chờ nhận" dù POS đã HOÀN THÀNH:**

  | Đơn Nextwaves | Phiếu POS đã HOÀN THÀNH |
  |---|---|
  | PO-2026-000015 | GR85089 |
  | PO-2026-000019 | GR85092 + GR85173 |
  | PO-2026-000020 | GR85091 + GR85174 |

  - Hàng đã vào POS nhưng chưa vào kho Nextwaves Lumina. Vì vậy tồn Nextwaves Lumina chưa có các tem này.
  - GR85090 (PO-2026-000018) đang nhận tay trên POS. Nếu HOÀN THÀNH mà không nhận Nextwaves, đây sẽ là ca thứ tư.
  - Theo `state.md`, máy POS Lumina chưa cài extension.
- **Có sẵn phiếu cho lượt nhận đầu bằng extension:**
  - Florita: GR85120, GR85121, GR85124.
  - Lumina: GR85041.
  - Cả 4 phiếu đều có đơn Nextwaves chờ nhận cùng SO.

## 7. Còn thiếu

**Không có thông tin nào chặn hướng build.**

Các câu đã cân nhắc và không cần hỏi:

| Câu hỏi | Vì sao không cần hỏi |
|---|---|
| Nextwaves có điền bù mã cho đơn cũ không? | Không làm đổi mã: đường cũ vẫn giữ |
| Staging đã có trường chưa? | Không làm đổi cách làm: kiểm bằng mẫu thật production và lượt nhận thật đầu tiên |
| P2 có thành đơn riêng mang `-P2` không? | Đã có bằng chứng mỗi lần giao là một đơn riêng. Khi PO01975529 lên Nextwaves, kiểm lại bằng GET lúc code |

**Cần operator:**
1. Duyệt hướng ở §4–§5 → Claude viết plan, gộp vào v0.4.2.
2. Quyết việc ở §6 (3 đơn Nextwaves ở Lumina): nhận bù trên Nextwaves hay nhờ Nextwaves đóng. Đây là việc vận hành, không phải việc của extension.
