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
| `nw-stg-receiving-PO76458756.json` | STG | `GET /api/v1/inter-tenant-orders/purchase-orders/<poId>/receiving` | PO76458756 (SO khác, **không** phải của GR03878): dòng giao có productId / sku / unit / UID |

PO staging PO00006745 (của GR03877) chỉ ghi tóm tắt trong `state.md` §2.1, không có file.
