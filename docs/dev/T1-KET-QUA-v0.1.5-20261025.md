# T1 lần 2 — kết quả chỉ đọc với v0.1.5 (25/10/2026)

Bản chạy: **v0.1.5, gói `CDD02C3D`** (`C:\circa-gr-nextwaves-v0.1.5`, mã `456205a`), Staging, cửa hàng 2222, **không cấp phép điền**.
Hướng dẫn: `docs/dev/T1-STG-HUONG-DAN.md`. Operator chạy trên phiên đăng nhập thật (Chrome), khoảng 21:30–21:46.
Không có thao tác ghi: không bấm "Xác nhận nhận hàng", không cấp phép, không có PUT GR.

## 1. Kết luận

**T1 đạt** với các bằng chứng đã nhận:
- Script nạp đủ ở cả hai trang (hết lỗi `envFromConfig`).
- Đi đúng chuỗi GR03878 → PO00006750 → `SOBD1593858-F` → SO `SOBD1593858`.
- Tab Nextwaves tự mở. Tìm ra đúng một đơn: PO28237814, `refId SOBD1593858-1056745`.
- Số lượng gốc ba sản phẩm khớp. Phiên chuyển sang `nw_ready`. Không có khoá ghi.

Hai response tìm kiếm thật đã chạy lại qua đúng parser của extension và cho cùng kết quả với khung (§3).

**Ảnh popup bước 3.8** (operator gửi bổ sung lúc 22:03, `popup_extension_GR.jpg`) nằm trên cùng phiên:
- Mục "Phiên gần đây" có `STG · GR03878 · Đã khớp đơn Nextwaves · SOBD1593858-F → PO28237814 · 21:35:05 25/10/2026`.
- **Không có dòng "Khoá điền"**. Popup chỉ hiện dòng này khi `writeLocks` hoặc `nwWriteLocks` khác rỗng, nên cả hai rỗng, khớp với §3.
- Không có dòng "Phiên của bản cũ", tức phiên có `schema`.
- Danh sách cấp phép điền trống: không có cấp phép nào.

Ảnh chụp không đưa vào repo (repo public). Nội dung đã chép lại đủ ở trên.

## 2. Kỳ vọng ↔ thực tế

| Bước | Kỳ vọng (hướng dẫn §3) | Thực tế | |
|---|---|---|---|
| 0–2 | Cài v0.1.5, chọn Staging, popup "Chưa có phiên" | Popup: "GR ← Nextwaves v0.1.5", Staging, chỉ cửa hàng `64a8663b…`, "Phiên gần đây: Chưa có phiên" (operator dán chữ) | Đạt |
| 3 | Khung POS "Chờ nhận hàng trên Nextwaves"; tự mở `…/vi/purchases/receive?po=SOBD1593858` | Operator xác nhận cả hai bằng lời; ảnh tab Nextwaves cho thấy đúng URL đó | Đạt |
| 4 | Response tìm GR theo SO, giữ `total / page / limit` | `T1-pos-gr-search.json`: total 1, page 1, limit 1000, 1 dòng GR03878 | Đạt |
| 5 | Khung Nextwaves "Sẵn sàng nhận hàng", dòng 1 + dòng "Tìm theo…" + bảng SL gốc khớp | `UI_extension_1.jpg` (trước F5) và `UI_extension_3.jpg` (sau F5): "Phiếu GR03878 ↔ Nextwaves PO28237814 (SOBD1593858) — 12 UID dự kiến." / "Tìm theo SOBD1593858: total 1, đã đọc 1; ứng viên Buymed cùng kho 1; refId đúng SO 1." / 1110: 12 = 12; 5451: 40 = 40; 2431732: 2 = 2 | Đạt |
| 6 | Response tìm đơn Nextwaves | `T1-nw-receiving-search.json`: total 1, PO28237814 | Đạt |
| 7 | Khung POS "Đã khớp đơn Nextwaves — chờ nhận hàng" + 2 dòng | `UI_extensin_2.jpg`: "Phiếu GR03878 · PO00006750 · mã giao SOBD1593858-F" / "Nextwaves: PO28237814 (SOBD1593858-1056745)"; nút "Mở tab Nextwaves", "Huỷ phiên" | Đạt |
| 8 | Popup: `STG · GR03878` "Đã khớp đơn Nextwaves", ghi dòng "Khoá điền" nếu có | `popup_extension_GR.jpg` (gửi bổ sung): "STG · GR03878 / Đã khớp đơn Nextwaves / SOBD1593858-F → PO28237814 · 21:35:05 25/10/2026"; không có "Khoá điền"; không có cấp phép | Đạt |

Sau F5 trang Nextwaves, khung vẫn "Sẵn sàng nhận hàng" với cùng số liệu tìm kiếm: phiên đã khớp được giữ, không tìm lại (đúng thiết kế `session:nwMatched` một lần).

## 3. Đối chiếu response thật với parser v0.1.5

Chạy trên nhánh `batch/v0.1-staging`, commit **`0b9aeb3`** (chỉ thêm mẫu và test, **không đổi `src/`**, gói v0.1.5 giữ nguyên). Kết quả `npm test` **87/87**.

**POS** (`samples/pos-stg-gr-search-so-1593858-T1-20261025.json`):
- `checkSoGrs`: `ok`, total 1, đã đọc 1, danh sách `[GR03878 WAITING_TO_RECEIVE]`, `pos_info.id` = cửa hàng 2222.
- `soWriteLock(GR03878)` = `null`, tức không có `so_many_gr` / `so_gr_unknown`.
- `status_count`: waiting_to_receive 1, các trạng thái khác 0.
- Cấu trúc khoá trùng 100% mẫu `pos-stg-gr-search-so-1593858.json` (24/10), mẫu dùng để viết P1.6. Nội dung GR03878 trùng y hệt (bỏ `updated_at`).
- Không có dữ liệu cá nhân: `created_by` là UUID hệ thống, `created_by_name` rỗng, địa chỉ / số điện thoại cửa hàng rỗng.

**Nextwaves** (`samples/nw-stg-receiving-search-q-SOBD1593858-T1-20261025.json`):
- `normalizeReceivingSearchPage`: total 1. Đơn PO28237814 (`55bd221f…`, order `f930f66d…`): `purchaseOrderStatus` CONFIRMED, `status` shipped, `counterparty.tenantSlug` `buymed-stag`, kho `82bf85e4…` "CIRCA FLORITA", `openShipmentCount` 1.
- `resolveNwOrder` với response này cùng GET đơn / `/receiving` từ mẫu thật trước đó (T1 không chụp hai GET này) cho kết quả `ok`, chọn PO28237814, `[total, read, candidates, verified] = [1, 1, 1, 1]`, `writeLocks = []`. Kết quả khớp dòng "Tìm theo …" trên khung thật.
- Response chỉ có `items` + `total` (không có page / pageSize). Cấu trúc khoá trùng mẫu `nw-stg-receiving-search-q-SOBD1593859.json`.

Test hồi quy: `tests/t1-real.test.js` (2 test).

## 4. Quan sát thêm trên màn Nextwaves (chỉ ghi lại)

- Màn quét: "Quét tem của phiếu gửi IT-BUYMED-STAG-20261019092009-7938. Hàng được nhận vào CIRCA FLORITA. Phiếu gửi này sẽ được chấp nhận trước, rồi mới nhận hàng." Bấm xác nhận sẽ vừa chấp nhận phiếu gửi vừa nhận hàng.
- "12 còn lại cần quét · Đã nhận 0 / 12". Năm dòng theo lô: 1110 ×2 (0/3 vỉ mỗi dòng), 2431732 (0/2 chai), 5451 ×2 (0/2 túi). Tổng 12 UID, khớp phiên.
- Dòng 1110 hiện theo **vỉ**. Đây chính là dòng gây **K1** (`400 tagged_unit_unsupported`) khi bấm "Xác nhận nhận hàng" lần trước. Màn vẫn cho bấm, nhưng theo mẫu `nw-stg-receive-scan-400-PO28237814.json` lượt nhận sẽ bị từ chối.

## 5. Bước tiếp theo

1. ~~Operator chụp popup bước 3.8~~: đã gửi, đạt (§1). Phiên GR03878 vẫn ở `nw_ready`. **Không** bấm "Xác nhận nhận hàng", **không** cấp phép điền cho tới gate T3 / W1.
2. ~~PM xem T1~~: **PM đóng gate T1** (`docs/pm/AUDIT-T1-LIVE-v0.1.5-STG-20261025.md`), không finding runtime.
3. **K1 → T3:** cần một trong hai cách sau trước khi có lượt nhận thật:
   - Nextwaves / Buymed gỡ `tagged_unit_unsupported` cho dòng 1110 (gắn thẻ theo vỉ, đơn vị gốc Nextwaves là hộp);
   - hoặc tạo SO staging mới, giao cửa hàng 2222, có dòng gắn thẻ theo đơn vị gốc.

   Sau đó, với phép của operator, chạy một lượt "Xác nhận nhận hàng" thật và lấy:
   - response 2xx `receive-scan`;
   - `purchase-orders/<id>`;
   - `inter-tenant-shipments/<id>`;
   - `/receiving` sau khi nhận.

   Mục đích là nghiệm thu hợp đồng "đã nhận" (P2.1).
4. **W1** (ghi POS có phép từng lần) chỉ sau T3. Chưa merge nhánh.
