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

PO staging PO00006745 (của GR03877) chỉ ghi tóm tắt trong `state.md` §2.1, không có file.
