# Plan v0.4.0 — mọi POS + luồng nhận hàng liền mạch (06/11/2026, sửa lần 2 khuya)

**Nguồn:**
- Yêu cầu operator 06/11 tối + chỉnh sửa khuya.
- Review toàn bộ mã v0.3.1 (`batch/v0.3.1-prd` `2d35a8c`) hai lượt.
- Lỗi GR84570; dữ liệu Lumina GR84715.
- Nextwaves public API (đọc).

**Operator duyệt làm bản mới đầy đủ (06/11 khuya).** Số bản: v0.4.0.

**Mục tiêu (operator):**
1. Dược sĩ bấm "Nhận hàng bằng RFID" trên POS.
2. Tab Nextwaves mở đúng màn nhận, **đầu đọc tự kết nối**: lấy lại từ tab khác nếu cần.
3. Dược sĩ đặt hàng lên đầu đọc → bấm "Xác nhận nhận hàng".
4. Extension về thẳng POS và **tự điền mã cho cả phiếu**.
5. Dược sĩ kiểm danh sách rồi bấm **HOÀN THÀNH**.

Chạy ở **mọi cửa hàng** cài extension.

## 0. Hiện trạng

- **Review lượt 1 + lượt 2: không có lỗi P1.** Đường ghi (kế hoạch, đọc lại phiếu trước / sau mỗi lần điền, khớp cuối) dừng an toàn ở mọi ca thử.
  - Lượt 2 chạy lại dữ liệu thật: kế hoạch dựng lại **đúng từng byte 15 PUT** của GR84674 (cả ca 12 chai → 1 thùng, 10 gói → 1 hộp, 5 UID, dòng 2 lô).
  - Mất response ở PUT #7 → lập lại kế hoạch còn 8 bước, tổng đúng 15 PUT.
  - Phiếu có mã lạ / sai lô / nhập lượng tay → dừng.
  - Hai tab giành nhau được xếp hàng; đổi cửa hàng giữa chừng → huỷ.
  - Hàng đợi ghi storage tuần tự.
- **Lỗi GR84570 (P2-1).**
  - Nextwaves không có đơn chờ nhận cho `SOBD38560757`.
  - Extension ghi `nw_match_failed` (`nw-content.js:195` → `background.js:712`) → `storage.onChanged` (`nw-content.js:468`, `changes.sessions && !ctx`) → `refresh()` → tìm lại. Vòng lặp không dừng:
    - khung "Đang tìm…";
    - gọi API Nextwaves liên tục;
    - nhật ký phiên đầy;
    - phiên không hết hạn.
  - Mọi lý do thất bại đều dính.
- **Giới hạn cửa hàng:**
  - `env.js` `storeAllowlist` + `warehouseByStore`;
  - `pos-content.js:421-430`;
  - `background.js:172, :373, :443`;
  - `resolve.js:62`, `nw-model.js:132, :181`.
  - Vì vậy ở Lumina không có nút.

## 1. Nhận dạng đơn Nextwaves — đã kiểm lại (06/11 khuya)

**Nextwaves production (public API, đọc):**
- Tenant `circa` có 2 kho:
  - **Florita** `eb5e2b4f…`: `code` = `buymedCustomerId` = **410478**;
  - **Lumina** `3f7bd541-7370-4ce0-9048-231cf061e91a`: `code` = `buymedCustomerId` = **406918**.
- Đơn Lumina `915536a8…` = PO-2026-000006: kho Lumina, `refId` **`SOBD38567297-16026967`**, trạng thái `shipped` (Nextwaves chưa nhận; POS GR84715 đã nhận tay).
- Đơn Florita PO-2026-000002: `refId` `SOBD38567266-16026945`, `received`.

**POS:** cửa hàng Lumina `31493e74…` có `thuocsi_id` **392301 ≠ 406918**; Florita 410478 = 410478. Số 410478 không có trong GR / PO / trang SO của POS, chỉ có ở `thuocsi_id`.
→ **Không dùng `thuocsi_id` để ghép kho.** Trên POS không có nguồn nào đáng tin cho mã khách Buymed của cửa hàng.

**Cách nhận dạng v0.4.0 — theo SO, không cần bảng cửa hàng:**
- **Chọn đơn:** đơn Nextwaves hợp lệ cho phiếu khi đủ cả bốn điều kiện:
  1. `refId` bắt đầu bằng đúng SO gốc của phiếu (`SOBD<số>-`);
  2. bên bán `counterparty.tenantSlug === "buymed"`;
  3. dấu vân tay sản phẩm / số lượng khớp phiếu;
  4. đơn đang chờ nhận.
- **Vì sao đúng kho:** mỗi SO Buymed thuộc **một** khách Buymed. Nextwaves đẩy đơn vào kho có `buymedCustomerId` của khách đó. Phiếu POS của SO đó là của cửa hàng đó. Đơn đúng SO thì tự nhiên đúng kho.
- **Kho lấy từ đơn đã khớp** (`warehouseId`). Mọi kiểm kho hiện có (kết quả tìm, đơn, biên nhận sau khi nhận) dùng kho này. Các đơn ứng viên cùng SO mà khác kho → dừng.
- **Hiển thị cho dược sĩ:** "POS0012 · CIRCA LUMINA ↔ Kho Nextwaves: Lumina (406918)" (tên cửa hàng POS + tên / mã kho Nextwaves).
- **Phiếu phải thuộc cửa hàng đang đăng nhập** (`x-store-id` = `pos_info.id` của GR / PO), như hiện nay.
- **SO tách giao `-P1` / `-P2`:** giữ luật v0.3.1 (đúng một đơn khớp dấu vân tay, đơn khác lệch rõ; không so được thì khoá).
  - `refId` có đuôi số (`-16026967`), không phải `-P1`. POS không có số này.
  - Ghép chính xác theo mã giao **làm sau**, khi Nextwaves có trường mã giao (operator chốt).
  - Gợi ý cho lúc đó: Nextwaves có `POST /api/v1/public/integrations/circa/purchase-orders/links` (đọc, ghép PO Circa → PO Nextwaves) nhưng cần API key, không gọi được từ trình duyệt.

## 2. Batch A — sửa lỗi review

| # | Mức | Sửa |
|---|---|---|
| A1 | P2-1 | **Tab Nextwaves tìm đơn đúng một lần mỗi lượt.**<br>• Chỉ tìm lại khi chữ ký phiên đổi (key, state, nwPoId, createdAt), khi bấm "Tìm lại", khi đổi URL, hoặc khi có auth mới sau 401.<br>• Không ghi lại lý do trùng.<br>• Không có đơn → phiên `no_nw_order`. Dòng POS / popup ghi "Nextwaves chưa có đơn — nhận tay". Khung Nextwaves ghi "Nextwaves chưa có đơn chờ nhận cho SOBD… → nhận tay trên POS", nút **Tìm lại** / **Về POS**, rồi trả đầu đọc. |
| A2 | P2-2 | Nextwaves nhận xong mà phiên đã mất: báo đỏ "Nextwaves ĐÃ nhận, POS CHƯA điền — nhận tay", không tắt im lặng. |
| A3 | P2-3 | Về POS: tab gốc chỉ khi đang ở danh sách phiếu hoặc đúng phiếu này; ngược lại mở tab mới. |
| A4 | P2-4 | Chờ auth Nextwaves > 20 giây → "Bấm F5 tab Nextwaves". Auth đổi sau 401 → tìm lại một lần. |
| A5 | P3-3 | "Mở tab Nextwaves": tab cũ không còn đúng `?po=` → mở tab mới. |
| A6 | P3-1 | Không có kho (đơn thiếu `warehouseId`) → dừng, không bỏ qua kiểm kho. |
| A7 | P2-A (lượt 2) | Nhận hàng ở **tab Nextwaves khác** của cùng SO (SO tách giao, tab tự mở, shipment Buymed thêm sau): hiện chỉ ghi `receive_scan_other_shipment` → phiếu kia mất đường tự điền. Sửa: mọi receive-scan 2xx gửi `shipmentId` về background, background giao `scanOk` cho **đúng một** phiên đang mở có `shipmentIds` chứa nó (không có / nhiều → báo, không điền). |
| A8 | P3-A (lượt 2) | Phiên kẹt `applying` khi tab chết sau PUT cuối: lease hết hạn thì coi như `apply_stopped` (đọc lại → điền tiếp / đã đủ → `applied`); GR đã COMPLETED → `done`. |
| A9 | P3-B (lượt 2) | PUT trả 5xx / 0: coi là **chưa rõ** (như mất kết nối), chờ rồi đọc lại — không chạy lại ngay (tránh ghi trùng mã khi máy chủ lưu muộn). |
| A10 | P3-C (lượt 2) | Chữ trên `/chi-tiet-so` còn nói khoá theo SO — sửa theo khoá theo PO (v0.3.1). |
| — | P3-4 | Phiếu có hai dòng cùng sản phẩm: giữ dừng an toàn → nhận tay (giới hạn, ghi rõ). |

## 3. Batch B — mọi cửa hàng

- **B1.** Bỏ `storeAllowlist` / `warehouseByStore` (PRD và STG). Bỏ `warehouse_unmapped`.
- **B2.** Kho theo mục 1. Cửa hàng đọc `GET /v1/entity/pos/<storeId>` (chỉ đọc) để lấy `code` + `name` hiển thị; không dùng `thuocsi_id`.
- **B3.** Nút "Nhận hàng bằng RFID" hiện ở mọi cửa hàng.
- **B4.** Khoá, phiên, nhật ký dùng `grId` (UUID), không dùng mã GR một mình.
- **B6. Tenant Nextwaves theo máy (P2-B lượt 2).** Cửa hàng Circa nằm ở nhiều tenant Nextwaves (Florita + Lumina ở `circa`; QR Scan Log từng có máy ở `circa-medly`). Khoá API và trang chỉ chạy ở đúng `<tenant>.nextwaves.app` / `api-<tenant>.nextwaves.app`.
  - Popup thêm ô **Tenant Nextwaves** (mặc định `circa`, chỉ `[a-z0-9-]`), giống ô Tenant của QR Scan Log. Production dựng `https://<tenant>.nextwaves.app` + `https://api-<tenant>.nextwaves.app/api`; staging giữ `circa-stg`.
  - Manifest: host / content script cho `https://*.nextwaves.app/*`; hook + content chỉ chạy khi origin = tenant đang chọn.
  - Phiên ghi tenant; khoá nhận dạng đơn = tenant + id đơn (số PO Nextwaves chỉ duy nhất trong một tenant).
  - Chưa tự dò được tenant theo cửa hàng (POS không có trường nào trỏ sang Nextwaves) → operator đặt một lần mỗi máy.
- **B5.** Tài khoản Nextwaves trên máy phải thấy kho của cửa hàng. Nextwaves trả rỗng → báo như A1, thêm "kiểm tài khoản Nextwaves có quyền kho của cửa hàng".

**Ô nhập SO:** POS đã có sẵn ô tìm SO trên danh sách phiếu nhận. v0.4.0 **không** thêm ô. Sau này: nhập SO có `-P1` / `-P2` thì tra Nextwaves mở đúng đơn — làm khi Nextwaves có trường mã giao.

## 4. Batch C — luồng E2E

- **C1. Một tab Nextwaves nhận hàng tại một thời điểm.**
  - Bấm nút → (mượn đầu đọc, mục 5) → tái dùng tab Nextwaves nhận hàng do extension mở (điều hướng sang `?po=` mới), hoặc mở tab mới.
  - Lý do: tab nhận hàng cũ còn mở là còn giữ cổng.
- **C2. Đầu đọc trên tab Nextwaves.**
  - Màn quét Nextwaves tự kết nối khi mở (`autoConnect`, dùng lại cổng đã cấp quyền, không hộp chọn).
  - Extension theo dõi nút / trạng thái đầu đọc của màn quét. Cổng trống mà chưa kết nối → extension bấm nút kết nối của Nextwaves (đường `autoReuseAuthorized`, không cần cú bấm của người).
  - Khung ghi "Đầu đọc: đã kết nối" hoặc lý do chưa kết nối.
- **C3. Tự điền ngay, không cấp phép.**
  - Sau "Xác nhận nhận hàng": đọc kết quả nhận → về POS (A3) → điền **cả phiếu**.
  - Mọi lớp kiểm giữ nguyên: khớp đơn, kế hoạch, đọc lại sau mỗi lô, khớp cuối.
  - Khung ghi "Đang điền i/n — chưa bấm HOÀN THÀNH" → "Đã điền N mã vào M lô — kiểm danh sách rồi bấm HOÀN THÀNH".
- **C4. Bỏ:**
  - cấp phép thủ công;
  - "Cho phép tự điền và HOÀN THÀNH";
  - tự HOÀN THÀNH (`claimComplete`, `autoGrants`, `grants`, `kiem-quet.js`).
  - **Extension không bao giờ gửi `status/COMPLETED`.**
  - Điền dừng giữa chừng → nút "Đọc lại và điền tiếp": đọc lại phiếu, lập kế hoạch mới, chỉ điền phần thiếu.
- **C5.** Điền xong (hoặc lượt huỷ) → đóng tab Nextwaves của lượt → trả đầu đọc.
- **C6.** Popup còn: Môi trường, Phiên gần đây (Xoá).
- **C7.** Nhắc trong khung khi đang điền: chưa bấm HOÀN THÀNH. Capture GR84674 có lần bấm sớm; bấm lúc đang điền dở thì POS nhận và phiếu đóng thiếu.

## 5. Batch D — mượn đầu đọc (giao thức `circa-reader/v1`)

> **07/11 — HOÃN phía QR Scan Log (operator).** Làm sau, khi đội QR Scan Log làm hợp đồng. v0.4.0 giữ mã phía mình: không có QR Scan Log trả lời trong 300 ms thì bỏ qua. Hiện hành dùng D2: dược sĩ Ngắt RFID ở tab bán hàng, quay lại tab Nextwaves thì extension tự kết nối lại; nhận xong dược sĩ Kết nối RFID lại ở tab bán hàng. Luồng chuẩn: `docs/BUSINESS-FLOW.md`.

- **Hợp đồng:** `docs/dev/SPEC-QSL-MUON-DAU-DOC-v1.md` (đã gửi operator cho đội QR Scan Log).
- **Kênh:** `window.postMessage` trong tab POS. Không cần Extension ID → **không thêm `key` vào manifest**: giữ Extension ID theo thư mục, máy POS chép đè `C:\circa-gr-nextwaves` như cũ, giữ phiên / cấu hình.
- **gr-nextwaves v0.4.0 cài phía mình:**
  1. `ping` (≤ 300 ms) → có `pong` thì `lend` (TTL 15 phút, gia hạn mỗi 10 phút) trước khi mở Nextwaves.
  2. `return` sau khi tab Nextwaves của lượt đã đóng.
  3. Không có `pong` → cách tay (D2).
- **D2 (QR Scan Log chưa hỗ trợ):** khung Nextwaves ghi "Đầu đọc đang bận ở tab bán hàng: bấm Ngắt RFID ở tab đó". Cổng trống thì extension tự bấm kết nối của Nextwaves.
- **Test:** bộ giả QR Scan Log theo hợp đồng (pong / lend / return / không trả lời / busy / unknown_lease).

## 6. Cần kiểm (chỉ đọc)

- **V2.** Màn quét Nextwaves production có `autoConnect` (bản staging có) và chữ / nút đầu đọc để extension theo dõi. Nguồn: bundle production, đọc từ capture tab Nextwaves, hoặc tải JS công khai của trang.
- **V3.** Response Nextwaves (API web) của tìm đơn / đơn / nhận có `warehouse` (id, code, name) để hiển thị kho. Đọc trên production bằng public API hoặc capture.

## 7. Kiểm thử và giao

- **Unit + mô phỏng trình duyệt:**
  - tìm rỗng → 1 GET, giữ lỗi;
  - 401 → auth mới;
  - đơn đúng SO khác kho / thiếu kho → dừng;
  - hai cửa hàng (Florita, Lumina) dùng dữ liệu thật;
  - tự điền không cấp phép;
  - dừng giữa chừng → điền tiếp;
  - **không bao giờ PUT status**;
  - về POS bằng tab mới;
  - phiên mất sau khi nhận;
  - mượn / trả đầu đọc (bộ giả QR Scan Log);
  - tái dùng tab Nextwaves.
- **Đột biến** cho hàng rào mới; Edge trên trang dựng.
- **Review độc lập** toàn bộ mã v0.4.0 trước khi đóng gói.
- **Production:** một phiếu Florita thật; một phiếu cửa hàng khác có đơn Nextwaves đang chờ (Lumina PO-2026-000006 hiện chờ nhận nhưng GR84715 đã HOÀN THÀNH → không dùng được).
- **Gói:** v0.4.0, một gói. Cài Florita trước, rồi các POS khác.
- **Nhánh:** `batch/v0.4-moi-pos`, tách từ `batch/v0.3.1-prd`.

## 8. Trong lúc chờ v0.4.0 (v0.3.1 đang chạy Florita)

- Chỉ bấm "Nhận hàng bằng RFID" cho phiếu có hàng gắn tem RFID (có đơn Nextwaves).
- Tab Nextwaves hiện "Không có đơn chờ nhận hàng nào khớp" → **đóng tab ngay** (extension còn gọi API liên tục), Xoá phiên trong popup, nhận tay.
