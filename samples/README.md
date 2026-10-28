# samples/

Response thật do operator lấy ("Copy response" hoặc cURL đã bỏ token), dùng làm dữ liệu khảo sát và fixture test.
**Không chứa token / cookie.** Tên nhân viên đã thay bằng `<nhân viên>` (repo public). Thông tin công ty (Buymed) giữ nguyên.

| File | Môi trường | Nguồn API | Ghi chú |
|---|---|---|---|
| `gr-prod-GR83174-20261024.json` | PRD | `GET /v1/order/goods-receipt/<id>` | GR WAITING_TO_RECEIVE, 10 dòng, Florita |
| `po-prod-PO01970951-SOBD38468903.json` | PRD | `GET /v1/pos/<posId>/po/<poId>` | PO từ SO 38468903; GR82004 COMPLETED |
| `gr-stg-GR03877-20261023.json` | STG | `GET /backend/v1/order/goods-receipt/<id>` | GR tạo tay (PO00006745 IMPORT_STOCK, **không SO**) — ca âm |
| `gr-stg-GR03878-20261024.json` | STG | `GET /backend/v1/order/goods-receipt/<id>` | GR hệ thống tạo từ SO 1593858 (PO00006750) — **cặp thử chính** |
| `po-stg-PO00006750-SOBD1593858.json` | STG | `GET /backend/v1/pos/<posId>/po/<poId>` | `sale_order_number` 1593858, `thuocsi_delivery_code` SOBD1593858-F |
| `nw-stg-intertenant-PO28237814-SOBD1593858.json` | STG | `GET /api/v1/inter-tenant-orders/purchase-orders/<poId>` | `refId` SOBD1593858-1056745, 12 UID dự kiến (shipment pending) |
| `nw-stg-po-PO28237814-detail.json` | STG | `GET /api/v1/purchase-orders/<poId>` | CONFIRMED, chưa nhận, `receivedUnits` rỗng |
| `nw-stg-shipment-34e67fb9-PO28237814.json` | STG | `GET /api/v1/inter-tenant-shipments/<shipmentId>` | Dòng giao PO28237814: `batch {batchNumber, expiryDate}`, `epcs`, `receivedQuantity` (null trước khi nhận) |
| `nw-stg-shipment-mapping-candidates-34e67fb9.json` | STG | `GET /api/v1/inter-tenant-shipments/<id>/mapping-candidates` | Ghép sản phẩm theo sku |
| `nw-stg-circa-link-PO28237814.json` | STG | `GET /api/v1/integrations/circa/purchase-orders/<poId>/link` | `eligible: true, linked: false` |
| `nw-stg-receiving-summary-PO28237814.json` | STG | `GET /api/v1/purchase-orders/<poId>/receiving-summary` | ordered / received / outstanding theo đơn vị gốc |
| `pos-stg-gr-search-so-1593858.json` | STG | `GET /backend/v1/order/goods-receipt/search?query=so_thuocsi=1593858,…` | Đường vào (2) "Nhập SO thuocsi": trả GR03878 |
| `nw-stg-receive-scan-400-PO28237814.json` | STG | `POST /api/v1/inter-tenant-shipments/<shipmentId>/receive-scan` | Lời gọi "Xác nhận nhận hàng" (body `{onMissing, epcs}`): lần 14 EPC và lần 12 EPC, đều `400 tagged_unit_unsupported` |
| `nw-stg-purchase-orders-list.json` | STG | `GET /api/v1/purchase-orders?page=1&pageSize=25` | 11 PO, **không có SO** (`externalNumber` null) |
| `pos-stg-qrcode-uid-circa.json` | STG | `GET <POS>/thuocsi-warehouse/qrcode?code=<UID>` | Tra 2 UID Circa: có lot + hạn; `circaReceiptCode` / `circaUnitName` rỗng |
| `nw-stg-po-PO88508353-received.json` | STG | `GET /api/v1/purchase-orders/<poId>` | PO **đã nhận** (mẫu Nextwaves dựng theo hub-order pos.dev): `receivedUnits`, `receipts[].items[].batchNumber/epcs`. Tên nhà cung cấp thử đã thay |
| `nw-stg-receiving-PO76458756.json` | STG | `GET /api/v1/inter-tenant-orders/purchase-orders/<poId>/receiving` | PO76458756 (SO khác, **không** phải của GR03878): dòng giao có productId / sku / unit / UID |
| `nw-stg-receiving-PO60017570.json` | STG | `GET /api/v1/inter-tenant-orders/purchase-orders/<poId>/receiving` | PO60017570 (SO 1593859, không phải của GR03878) |
| `nw-stg-receiving-search-q-SOBD1593859.json` | STG | `GET /api/v1/inter-tenant-orders/receiving?…q=SOBD1593859` | Tìm đơn theo SO khác: total 1 (PO60017570) |
| `pos-stg-gr-search-so-1593858-T1-20261025.json` | STG | `GET /backend/v1/order/goods-receipt/search?query=so_thuocsi=1593858,…&limit=1000…` | **T1 lần 2** (v0.1.5, phiên đăng nhập thật, 25/10): total 1 / page 1 / limit 1000, chỉ GR03878; trùng mẫu 24/10 trừ `updated_at`. Bản gốc sha256 `78c6b9e5…`, chỉ đổi CRLF → LF |
| `nw-stg-receiving-search-q-SOBD1593858-T1-20261025.json` | STG | `GET /api/v1/inter-tenant-orders/receiving?…q=SOBD1593858` | **T1 lần 2**: total 1, PO28237814 CONFIRMED / shipped, `buymed-stag`, kho CIRCA FLORITA `82bf85e4…`, `openShipmentCount` 1. Bản gốc sha256 `e8b95ffb…` |
| `nw-stg-po-PO28237814-T3-truoc-20261025.json` | STG | `GET /api/v1/purchase-orders/<poId>` | **T3** (Net Capture tab Nextwaves, 25/10 23:45:25, extension đọc lúc mở trang): CONFIRMED, `receipts []`. So mẫu 24/10: thêm `product.salePriceReasonCode/Text` (null). sha256 `907d3566…` |
| `nw-stg-receiving-PO28237814-T3-truoc-20261025.json` | STG | `GET /api/v1/inter-tenant-orders/purchase-orders/<poId>/receiving` | **T3**, 23:45:25, trước khi nhận: 1 phiếu gửi, 5 dòng giao, 12 UID. sha256 `cad061fe…` |
| `nw-stg-receive-scan-200-PO28237814-T3-20261025.json` | STG | `POST /api/v1/inter-tenant-shipments/<shipmentId>/receive-scan` | **T3**, 23:46:05: **200**, 12/12, `orderStatus received`. `id` = biên nhận inter-tenant `ea603c18…` (khác biên nhận PO). Dạng bọc như mẫu 400. sha256 body req `4c2f22fa…` / resp `c8cb66ff…` |
| `nw-stg-receiving-search-q-SOBD1593858-T3-sau-20261025.json` | STG | `GET /api/v1/inter-tenant-orders/receiving?…q=SOBD1593858` | **T3**, sau khi nhận: `{"items":[],"total":0}` — đơn đã nhận rời danh sách chờ nhận. sha256 `4bf7c863…` |
| `nw-stg-receiving-PO28237814-T3-sau-20261025.json` | STG | `GET /api/v1/inter-tenant-orders/purchase-orders/<poId>/receiving` | **T3**, sau khi nhận: `shipments []`, `receipts [1]` (id = id response receive-scan). sha256 `2b6829e8…` |
| `nw-stg-po-PO28237814-T3-sau-20261025.json` | STG | `GET /api/v1/purchase-orders/<poId>` | **T3**, 23:46:05 (extension đọc sau 200): RECEIVED, biên nhận `GRN96438872` `7bec38d2…` cùng kho, `receivedUnits` 12. sha256 `92a87c8b…` |
| `nw-stg-shipment-34e67fb9-T3-sau-20261025.json` | STG | `GET /api/v1/inter-tenant-shipments/<shipmentId>` | **T3**, 23:46:05 (extension đọc sau 200): `status received`, `receivedEpcs` = `epcs` từng dòng; timeline accepted → received cùng lượt. sha256 `61a70928…` |

**FULL-STG lượt 1 (26/10 12:08–12:33, v0.1.5): GR03880 / PO00006754 / SO 1593849 ↔ Nextwaves PO76458756 (`900e9a9d…`, refId SOBD1593849-1056738).**
Nguồn:
- Net Capture tab POS: `net-capture-2026-10-26T05-14-40.zip` (điền phiếu), `…05-34-40.zip` (HOÀN THÀNH).
- Net Capture tab Nextwaves: `…05-38-39.zip`.
- chrome.storage của extension.

Chỉ lấy body, kèm url / status / giờ. Tên nhân viên đã thay. Hash = 8 ký tự đầu sha256 của file trong repo.

| File | Môi trường | Nguồn API | Ghi chú |
|---|---|---|---|
| `pos-stg-gr-GR03880-truoc-20261026.json` | STG | `GET /backend/v1/order/goods-receipt/<id>` | 12:08:45, WAITING_TO_RECEIVE, 3 dòng / 5 chi tiết theo lô, chưa có mã. `a6ca5560` |
| `pos-stg-po-PO00006754-SOBD1593849-20261026.json` | STG | `GET /backend/v1/pos/<posId>/po/<poId>` | `sale_order_number` 1593849, `thuocsi_delivery_code` SOBD1593849-F. `68c64532` |
| `pos-stg-gr-search-so-1593849-20261026.json` | STG | `GET …/goods-receipt/search?query=so_thuocsi=1593849,…` | total 1 / page 1 / limit 1000, chỉ GR03880. `d101a2f9` |
| `pos-stg-qrcode-GR03880-11uid-20261026.json` | STG | `GET <POS>/thuocsi-warehouse/qrcode?code=<UID>` | **Tra QR thật 11/11 UID** (vòng đầu, 12:10:02): productId / lot / hạn. `a445b763` |
| `pos-stg-gr-W1-GR03880-20261026.json` | STG | `GET` GR + `PUT …/item/<i>/detail/<d>` | **Lượt điền thật** 12:11:13–17: 10 GET + 5 PUT 200 theo đúng thứ tự, PUT kèm body gửi. `4f93657a` |
| `pos-stg-gr-GR03880-W1-sau-20261026.json` | STG | `GET …/goods-receipt/<id>` | Sau khi điền: RECEIVING, 5 chi tiết nhận 1, 11 mã. `b3c8997f` |
| `pos-stg-gr-status-COMPLETED-GR03880-20261026.json` | STG | `PUT …/goods-receipt/<id>/status/COMPLETED` | HOÀN THÀNH (POS gửi lúc 12:33:26): không body, 200, response rỗng. `b7c5f0f2` |
| `pos-stg-gr-GR03880-completed-20261026.json` | STG | `GET …/goods-receipt/<id>` | Sau HOÀN THÀNH: COMPLETED. **Mỗi chi tiết thêm đúng `received_quantity` mã QR mới** (không phải UID Nextwaves, không trùng). `788928be` |
| `nw-stg-receiving-search-q-SOBD1593849-sau-20261026.json` | STG | `GET /api/v1/inter-tenant-orders/receiving?…q=SOBD1593849` | Sau khi nhận: total 0. `020c5dee` |
| `ext-stg-storage-GR03878-GR03880-20261026.json` | STG | `chrome.storage.local` (operator export) | Phiên GR03878 (25/10, kế hoạch #60070071, 6 apply_done) + GR03880 (#E33C777A, 5 apply_done, gr_completed); có `units` extension đã dùng. Không có token. `1518fc53` |
| `nw-stg-receive-scan-req-PO76458756-20261026.json` | STG | `POST …/inter-tenant-shipments/<id>/receive-scan` + 4 GET ngay sau | Từ "Copy all as HAR (sanitized)" tab màn quét (DevTools, Preserve log). **Lệnh copy này không kèm body response**, nên chỉ có request body (`keep_open`, 11 EPC), status, kích thước response (`responseSize`). 12:10:00.943 receive-scan 200 (2188 B) → tìm theo SO 22 B (= total 0) → `/receiving` → extension GET PO + phiếu gửi. `58a4feac` |

PO staging PO00006745 (của GR03877) chỉ ghi tóm tắt trong `state.md` §2.1, không có file.

### G0 trang thật 27/10/2026 (chỉ đọc, trình duyệt trong app, operator tự đăng nhập; dùng cho `scripts/edge-check.js`)

| File | Môi trường | Nguồn | Ghi chú |
|---|---|---|---|
| `pos-stg-gr-list-page1-20261027.json` | STG | `GET …/goods-receipt/search?query=pos_id=…,,with_items=true,with_details=true,is_count_all_status=true&limit=20&page=1&order_by=created_at=desc` (trang danh sách) | Bản gốc 76.205 B, 20 dòng, total 32. **Rút gọn trong trang** (đủ trường parser + số item/detail mỗi dòng) + `goods_receipts_full_first` nguyên vẹn. Không có tên nhân viên. Không có sha bản gốc (không đưa body ra khỏi trang) |
| `pos-stg-gr-list-row-GR03887-20261027.html` | STG | DOM `/danh-sach-phieu-nhan-hang` | outerHTML một dòng MUI (7 cột; mã ở ô đầu; ô cuối `div.flex` 2 icon) |
| `pos-stg-gr-action-bar-GR03878-20261027.html` | STG | DOM `/danh-sach-phieu-nhan-hang/<grId>` (Đang nhận) | Thanh cố định góc dưới phải: ô nhập ẩn máy quét + HỦY + HOÀN THÀNH; kèm số đo vị trí ở 1440×900 |
| `nw-stg-receive-modal-footer-20261027.html` | STG | DOM màn quét Nextwaves `/vi/purchases/receive?po=PO76149046` (đơn "Đã xác nhận", chỉ đọc) | Chân modal (Hủy + "Xác nhận nhận hàng") nằm cuối thân cuộn; kèm cấu trúc modal và số đo trước / sau khi cuộn |
| `pos-stg-gr-page-GR03887-20261027.html` | STG | DOM trang phiếu `/danh-sach-phieu-nhan-hang/<grId>` (GR03887 Chờ nhận), 1095×756 | `#__next` outerHTML: thanh menu, khung `overflow-scroll` (không tự cuộn — cả trang cuộn), breadcrumb cố định, thẻ thông tin (bảng đầu tiên), `#all-receipt` (3 sản phẩm / 5 lô, mỗi lô −/ô số/+ và 2 icon, "+ Thêm lot-date"), thanh HỦY / HOÀN THÀNH. Ảnh bỏ `src`, `path` SVG rút gọn, tên nhân viên → `<nhân viên>`. Có một toast POS tự đóng lúc chụp ("Chức năng thông báo…") — trang dựng lại ẩn nó. Dùng cho `scripts/edge-gr-page.js`, `scripts/edge-check.js` |
| `pos-stg-gr-page-GR03887-20261027.css` | STG | `document.styleSheets` của trang trên | Chỉ các luật CSS khớp phần tử trong `#__next` (Tailwind + MUI), 288 luật, kèm `@media` |

**A1 (28/10 21:32–21:54, v0.2.4): GR03887 / PO00006767 / SO 1594095 ↔ Nextwaves PO13806459 (refId SOBD1594095-1056823).**
Nguồn:
- Net Capture tab POS: `net-capture-2026-10-28T14-37-35.zip` (danh sách → về GR, tra QR), `…14-51-28.zip` (điền), `…14-55-41.zip` (HOÀN THÀNH).
- chrome.storage của extension (`extension-storage-2.json`).
- **Không có capture tab Nextwaves.**

Chỉ lấy body, kèm url / status / giờ. Tên nhân viên → `<nhân viên>`, email → `<email>`. Hash = 8 ký tự đầu sha256 của file trong repo. Test: `tests/a1-real.test.js`.

| File | Môi trường | Nguồn API | Ghi chú |
|---|---|---|---|
| `pos-stg-gr-GR03887-truoc-20261028.json` | STG | `GET /backend/v1/order/goods-receipt/<id>` | 21:37:00, extension đọc lúc POS tự về sau nhận (dùng lập kế hoạch): WAITING_TO_RECEIVE, 3 dòng / 5 lô, chưa có mã. `0f4c4e63` |
| `pos-stg-po-PO00006767-SOBD1594095-20261028.json` | STG | `GET /backend/v1/pos/<posId>/po/<poId>` | 21:32:57 (tạo phiên): `thuocsi_delivery_code` SOBD1594095-F. `5087979f` |
| `pos-stg-gr-search-so-1594095-20261028.json` | STG | `GET …/goods-receipt/search?query=so_thuocsi=1594095,…` | 21:32:57: total 1, chỉ GR03887. `4118c72b` |
| `pos-stg-qrcode-GR03887-15uid-20261028.json` | STG | `GET <POS>/thuocsi-warehouse/qrcode?code=<UID>` | **Tra QR thật 15/15 UID** (21:37:00–01): productId / lot / hạn / đơn vị vỉ, chai. `ba31a6f5` |
| `pos-stg-gr-W1-GR03887-20261028.json` | STG | `GET` GR + `PUT …/item/<i>/detail/<d>` | **Lượt điền thật** 21:50:08–13: 10 GET + 5 PUT 200 theo đúng thứ tự, PUT kèm body gửi. `86a63989` |
| `pos-stg-gr-GR03887-W1-sau-20261028.json` | STG | `GET …/goods-receipt/<id>` | 21:50:15 (trang tải lại sau điền): RECEIVING, 5 lô nhận 1, 15 mã. `e1f30533` |
| `pos-stg-gr-status-COMPLETED-GR03887-20261028.json` | STG | `PUT …/goods-receipt/<id>/status/COMPLETED` | HOÀN THÀNH (trang POS gửi lúc 21:54:25): không body, 200, response rỗng. `4fdb8cdf` |
| `pos-stg-gr-GR03887-completed-20261028.json` | STG | `GET …/goods-receipt/<id>` | 21:54:26: COMPLETED. **Mỗi lô thêm đúng một mã = mã QR của lô** (3 lô chung với GR03880 có cùng mã). `29b095ba` |
| `ext-stg-storage-GR03887-20261028.json` | STG | `chrome.storage.local` (operator export 21:56) | Một phiên GR03887 (tạo 21:32:57 bởi 0.2.4, `done`, #EF0E020C, 5 apply_done, gr_completed, ui_anchor_missing) + cấp phép gõ nhầm `STG:GR3887`. Có `expected` + `nwResult.units`. Không có token. `bea04fff` |
