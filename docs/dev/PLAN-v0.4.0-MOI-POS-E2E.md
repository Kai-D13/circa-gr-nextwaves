# Plan v0.4.0 — mọi POS + luồng nhận hàng liền mạch (06/11/2026)

Nguồn: yêu cầu operator 06/11 tối, review toàn bộ mã v0.3.1 (`batch/v0.3.1-prd` `2d35a8c`), lỗi GR84570, dữ liệu Lumina GR84715.

**Mục tiêu (operator):**
1. Dược sĩ vào màn nhận hàng POS, nhập / quét mã SO hoặc bấm "Nhận hàng bằng RFID".
2. Extension mở tab Nextwaves, **đầu đọc tự kết nối**: lấy lại quyền đầu đọc từ tab khác nếu cần.
3. Dược sĩ đặt hàng lên đầu đọc → bấm "Xác nhận nhận hàng" trên Nextwaves.
4. Extension về thẳng POS và **tự điền mã cho cả phiếu**.
5. Dược sĩ kiểm danh sách rồi bấm **HOÀN THÀNH**.

Chạy ở **mọi cửa hàng** đã cài extension.

## 0. Hiện trạng (review 06/11)

- **Không có lỗi P1.** Đường ghi (kế hoạch, đọc lại phiếu trước / sau mỗi lần điền, khớp cuối, gửi HOÀN THÀNH một lần) dừng an toàn ở mọi ca thử:
  - SO tách giao hai phiên;
  - hai tab cùng phiếu;
  - phiên tạo lại mà tab Nextwaves còn cũ;
  - đổi cửa hàng giữa chừng.
- **Lỗi GR84570 (P2-1, đã xác nhận trong mã).**
  - Nextwaves không có đơn chờ nhận cho `SOBD38560757`, khớp lượt chạy thử lần 60.
  - Extension ghi `nw_match_failed` vào phiên (`nw-content.js:195` → `background.js:712`). Phiên đổi thì kho đổi, và `storage.onChanged` (`nw-content.js:468`, `changes.sessions && !ctx`) lại gọi `refresh()`, tức là tìm lại.
  - Kết quả là vòng lặp không dừng:
    - khung luôn ở "Đang tìm đơn Nextwaves…";
    - gọi API Nextwaves liên tục (mô phỏng: 1 262 lần tìm trong 1,5 giây);
    - nhật ký phiên đầy 200 dòng lỗi;
    - phiên không bao giờ hết hạn 24 giờ.
  - Mọi lý do thất bại đều dính vòng lặp này, không chỉ "không có đơn". Test hiện có chưa cho tab Nextwaves đi qua ca thất bại.
- **Giới hạn cửa hàng** (đúng một cửa hàng Florita):
  - `lib/env.js` / `main/env.js`: `storeAllowlist` + `warehouseByStore`;
  - `pos-content.js:421-430`: gỡ nút khi cửa hàng không có trong danh sách;
  - `background.js:172, :373`: `storeAllowed`;
  - `background.js:443`: `warehouse_unmapped`;
  - `resolve.js:62`, `nw-model.js:132, :181`: kiểm kho, **bỏ qua khi không có kho** (P3-1).
  - Vì vậy ở Lumina (`31493e74…`, POS0012) không có nút.

## 1. Batch A — sửa lỗi review

| # | Mức | Sửa |
|---|---|---|
| A1 | P2-1 | **Tab Nextwaves tìm đơn đúng một lần mỗi lượt.**<br>• Chỉ tìm lại khi chữ ký phiên đổi (key, state, nwPoId, createdAt), khi bấm "Tìm lại", khi đổi URL, hoặc khi có auth mới sau lỗi 401.<br>• Không ghi lại lý do trùng lý do vừa ghi.<br>• Không có đơn → phiên sang `no_nw_order`. Dòng POS và popup ghi "Nextwaves chưa có đơn — nhận tay". Khung Nextwaves ghi "Nextwaves chưa có đơn chờ nhận cho SOBD… → nhận tay trên POS", kèm nút **Tìm lại** và **Về POS**. |
| A2 | P2-2 | Nextwaves nhận xong mà phiên đã bị xoá / hết hạn: báo đỏ "Nextwaves ĐÃ nhận, POS CHƯA điền — nhận tay". Hiện nay khung tắt im lặng (`background.js:583`, `nw-content.js:409`). |
| A3 | P2-3 | Về POS sau khi nhận: chỉ dùng tab gốc khi tab đó đang ở danh sách phiếu hoặc đúng phiếu này. Ngược lại mở tab mới, không giật tab đang làm phiếu khác (`background.js:590`). |
| A4 | P2-4 | Chờ auth Nextwaves quá 20 giây → "Bấm F5 tab Nextwaves". Auth đổi sau lỗi 401 → tìm lại một lần. |
| A5 | P3-3 | "Mở tab Nextwaves": tab cũ không còn đúng `?po=` → mở tab mới. |
| — | P3-4 | Phiếu có hai dòng cùng sản phẩm (hàng mua + hàng tặng): giữ dừng an toàn → nhận tay. Ghi vào giới hạn, chưa làm. |

## 2. Batch B — mọi cửa hàng

- **B1. Bỏ** `storeAllowlist` và `warehouseByStore` (PRD và STG).
  - Cửa hàng vẫn lấy từ `x-store-id` đã xác nhận (như nay).
  - Extension đọc `GET /v1/entity/pos/<storeId>` (chỉ đọc, header của trang) để lấy `thuocsi_id`, `code`, `name`.
- **B2. Kho Nextwaves tự ghép.** Đơn Nextwaves hợp lệ khi **`warehouse.buymedCustomerId` = `thuocsi_id` của cửa hàng**.
  - Đọc từ `GET /v1/purchase-orders/<id>`.
  - `warehouseId` lấy từ đơn đã khớp, rồi kiểm như hiện nay trên kết quả tìm, trên đơn, và trên biên nhận sau khi nhận.
  - Trường hợp `thuocsi_id` trống / 0, Nextwaves thiếu trường, hoặc hai số lệch → dừng: "kho Nextwaves không thuộc cửa hàng này". Lỗi P3-1 hết theo cách này.
  - Bằng chứng:
    - staging: cửa hàng `64a8663b` có `thuocsi_id` 30145, kho Nextwaves `82bf85e4` có `buymedCustomerId` 30145 (capture 28/10);
    - production: Florita `thuocsi_id` 410478, Lumina 392301; **chưa thấy phía Nextwaves → V1**.
  - Staging 15/10 từng có `thuocsi_id` 0, nên phải dừng an toàn khi trống.
- **B3.** Nút và ô SO hiện ở mọi cửa hàng. Khung extension ghi mã + tên cửa hàng, ví dụ "POS0012 · CIRCA LUMINA".
- **B4.** Tài khoản Nextwaves trên máy phải thấy kho của cửa hàng. Không thấy thì Nextwaves trả rỗng → báo như A1, kèm "kiểm tài khoản Nextwaves có quyền kho của cửa hàng".

## 3. Batch C — luồng E2E

- **C1. Ô "Nhận hàng RFID theo mã SO"** ở đầu danh sách phiếu nhận (nhập hoặc quét `SOBD…`, `SOBD…-P1`, hoặc chỉ số).
  - Extension tìm phiếu chờ nhận của SO ở cửa hàng hiện tại (`grSearchBySo`).
  - Đúng một phiếu → như bấm nút trên dòng.
  - Nhiều phiếu (SO tách giao) → hiện danh sách để chọn.
  - Không có phiếu → báo.
- **C2.** Bấm → (D1: mượn đầu đọc) → mở hoặc đưa lên trước **một** tab Nextwaves cho lượt đó.
- **C3. Đầu đọc trên tab Nextwaves.**
  - Màn quét Nextwaves đã tự kết nối khi mở: bản staging 26/10 có `autoConnect:!0`, dùng lại cổng đã cấp quyền, không mở hộp chọn. Cách này chỉ hỏng khi cổng bị tab khác giữ.
  - Extension theo dõi trạng thái đầu đọc của màn quét. Khi cổng trống mà Nextwaves chưa kết nối, extension bấm nút kết nối của Nextwaves. Đường này dùng lại cổng đã cấp quyền, không cần cú bấm của người.
  - Khung ghi "Đầu đọc: đã kết nối" hoặc "đang chờ tab bán hàng nhả đầu đọc".
- **C4. Tự điền ngay, không cấp phép.**
  - Sau "Xác nhận nhận hàng": đọc kết quả nhận (như nay) → về POS (A3) → điền **cả phiếu**.
  - Mọi lớp kiểm giữ nguyên: khớp đơn, kế hoạch, đọc lại sau mỗi lô, khớp cuối.
  - Khung ghi:
    - khi đang điền: "Đang điền i/n — chưa bấm HOÀN THÀNH";
    - khi xong: "Đã điền N mã vào M lô — kiểm danh sách rồi bấm HOÀN THÀNH".
  - Lý do bỏ cấp phép: cú bấm "Xác nhận nhận hàng" của dược sĩ là hành động rõ ràng. Extension chỉ ghi khi khớp chính xác, và **không bao giờ HOÀN THÀNH**.
- **C5. Bỏ phần không còn dùng:**
  - cấp phép thủ công;
  - "Cho phép tự điền và HOÀN THÀNH";
  - tự HOÀN THÀNH (`claimComplete`, `autoGrants`, `grants`, `kiem-quet.js`).
  - Điền dừng giữa chừng (mất mạng, kết quả không rõ) → nút "Đọc lại và điền tiếp". Nút này đọc lại phiếu, lập kế hoạch mới và chỉ điền phần còn thiếu.
- **C6.** Điền xong → đóng tab Nextwaves của lượt (nhả cổng) → trả đầu đọc (D1).
- **C7.** Popup chỉ còn: Môi trường, Phiên gần đây (Xoá).

Nhắc dược sĩ (capture GR84674): **bấm HOÀN THÀNH khi khung báo "Đã điền"**. Bấm lúc đang điền dở, POS sẽ nhận và phiếu đóng thiếu.

## 4. Batch D — trả / mượn đầu đọc

- **D1. Hợp đồng "mượn đầu đọc" giữa hai extension** (cần sửa QR Scan Log — dự án riêng, phiên ghi riêng; operator duyệt):
  - gr-nextwaves gửi `lend` (mã phiếu, hạn 20 phút).
  - QR Scan Log đóng cổng ở tab đang giữ, **không** đặt cờ "Ngắt toàn bộ tab", và trả `{ok, released}`.
  - Hết lượt, gr-nextwaves gửi `return`. Hết hạn hoặc tab Nextwaves đóng cũng tính là trả.
  - Khi được trả, QR Scan Log tự nối lại bằng `getPorts`, không mở hộp chọn cổng.
  - gr-nextwaves thêm `key` vào manifest để Extension ID cố định trên mọi máy (QR Scan Log chỉ nhận lệnh từ ID này). Chrome sẽ coi đây là extension mới: lần cài v0.4.0 phải Load unpacked lại, phiên cũ mất.
- **D2. Khi chưa có D1:**
  - Tab Nextwaves báo "Đầu đọc đang bận ở tab bán hàng: bấm Ngắt RFID ở tab đó". Cổng trống thì extension tự kết nối (C3).
  - Sau lượt nhận, dược sĩ bấm "Kết nối RFID" ở tab bán hàng. Bản QR Scan Log hiện tại sẽ mở hộp chọn cổng.

## 5. Cần kiểm (chỉ đọc)

- **V1.** Một response Nextwaves production có `warehouse.buymedCustomerId` của Florita (kỳ vọng 410478) và / hoặc Lumina (kỳ vọng 392301): `GET api-circa.nextwaves.app/api/v1/purchase-orders/<id>`, ví dụ `915536a8-5379-46d2-a72a-6332ff8ce653`, chỉ body. Lệch thì B2 đổi sang bảng cửa hàng → kho, mỗi cửa hàng một dòng.
- **V2.** Màn quét Nextwaves production có `autoConnect` (bản staging có). Lấy từ capture tab Nextwaves ở lượt sau, không cần làm riêng.

## 6. Kiểm thử và giao

- **Unit + mô phỏng trình duyệt:**
  - tìm rỗng → đúng 1 GET, khung giữ lỗi;
  - 401 rồi có auth mới;
  - ghép kho: khớp / lệch / trống;
  - ô SO: 1 / nhiều / 0 phiếu;
  - tự điền không cấp phép;
  - điền dừng giữa chừng rồi điền tiếp;
  - **không bao giờ gửi `status/COMPLETED`**;
  - về POS bằng tab mới;
  - phiên mất sau khi nhận.
- **Đột biến** cho các hàng rào mới; Edge trên trang dựng.
- **Production:** một phiếu Florita thật, rồi một phiếu của cửa hàng khác có đơn Nextwaves.
- **Gói:** v0.4.0, một gói, cài Florita trước rồi các POS khác.
- **Thứ tự làm:** A → B → C → D2. D1 làm song song bên QR Scan Log; phần gr-nextwaves của D1 vào v0.4.0 nếu QR Scan Log xong kịp, chưa kịp thì vào bản sau.
- **Nhánh:** `batch/v0.4-moi-pos`, tách từ `batch/v0.3.1-prd` (sau khi gộp v0.3.1 vào `main`).
- **Việc cũ dời sau:** trường mã giao Nextwaves (`-F` / `-P1` / `-P2`), trước đây dự kiến v0.3.2.

## 7. Trong lúc chờ v0.4.0 (v0.3.1 đang chạy Florita)

- Chỉ bấm "Nhận hàng bằng RFID" cho phiếu có hàng gắn tem RFID (có đơn Nextwaves).
- Tab Nextwaves hiện "Không có đơn chờ nhận hàng nào khớp" → **đóng tab đó ngay**: tab còn mở là extension còn gọi API Nextwaves liên tục. Sau đó vào popup Xoá phiên của phiếu và nhận tay.
