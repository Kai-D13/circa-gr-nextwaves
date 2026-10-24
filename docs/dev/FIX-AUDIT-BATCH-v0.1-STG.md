# Batch v0.1-staging — dev sửa theo PM audit 24/10 (v0.1.1)

Người viết: dev-team, 24/10/2026. Trả lời `docs/pm/AUDIT-BATCH-v0.1-STG-20261024.md`.
Nhánh **`batch/v0.1-staging`**, trên `a08d541` (bản PM đã audit). Chưa merge, chưa ghi POS thật.

| Commit | Nội dung |
|---|---|
| **`d124453`** | Toàn bộ sửa mã + test (gói v0.1.1 dựng từ commit này) |
| `8e443fa` | Chỉ thêm `scripts/mutate-v0.1.1.py`; không đổi `src/` |

DIFF cần audit: `git diff a08d541 d124453 -- src tests package.json`. Thống kê: 20 file, +1725 / −486; file mới `src/lib/resolve.js`, `tests/resolve.test.js`.
Bản xuất sẵn: `dist/circa-gr-nextwaves-v0.1.1-vs-a08d541.diff` (3532 dòng) và `.stat.txt` (không vào git).

| | |
|---|---|
| Phiên bản | `0.1.1` |
| Gói | `dist/circa-gr-nextwaves-v0.1.1.zip`, 17 file |
| SHA-256 | `d8cd9afd88e4639c1e65d09d3aa55da40a78c7e1477c019ace163c85403a1758` — **mã gói `D8CD9AFD`** |
| Bản giải nén để cài | `C:\circa-gr-nextwaves-v0.1.1` (đối chiếu từng file với `src/` của `d124453`) |
| Gói cũ | `FF5CD95B` (v0.1.0) giữ nguyên, không ghi đè. Không còn dùng để thử |

## 1. Finding P1 → sửa → test

Mức bằng chứng của mọi dòng dưới đây: **đã kiểm từ source + test local** (trình duyệt giả). Chưa có bằng chứng staging thật.

| # | Sửa | Ở đâu | Test (tên nguyên văn) |
|---|---|---|---|
| P1.1 | Chọn đơn trên **toàn bộ** ứng viên, không cắt 10. Kết quả tìm phải có `items` mảng và `total` số, và `total` = số dòng đã đọc; không thì `search_unreadable` / `search_incomplete`, không chọn. Ứng viên thiếu bên bán / kho / poId → `candidate_schema`. **Bất kỳ** GET đơn / `/receiving` nào lỗi, hết giờ (30 s) hay sai dạng → `candidate_read_failed`, chặn cả lượt. Chỉ loại ứng viên khi dữ liệu nói rõ: bên bán khác, kho khác, refId khác SO, đơn huỷ, lệch số lượng. Khung Nextwaves hiện `total / đã đọc / ứng viên / refId đúng SO` để làm bằng chứng T1 | `src/lib/resolve.js` (mới, thuần), `nw-model.normalizeReceivingSearchPage`, `nw-content.resolveOrder` | `tests/resolve.test.js`: 8 test. Gồm: 12 ứng viên đọc hết; total > số dòng đọc được (2 trang); thiếu total / items, lỗi HTTP; GET ứng viên hết giờ / lỗi; thiếu trường; 0 / n khớp; loại rõ ràng |
| P1.2 | Mọi UID, kể cả UID đã nằm trên GR, qua cùng phép đối chiếu: sản phẩm, tra QR, lô, đơn vị. Chỉ bỏ qua UID nằm **đúng** chi tiết tính được. Chặn khi: sai chi tiết (`uid_on_wrong_detail`), nằm ở nhiều chi tiết (`uid_on_many_details`), mã bị nối trùng (`gr_duplicate_codes`, đếm mã thô). Với **mọi** chi tiết, `received_quantity` phải bằng lượng quy đổi từ các UID đang nằm trên nó (`received_mismatch`, `fraction_on_gr`). "Đã điền đủ" chỉ khi `plan.complete` (không chặn, không bước, mọi UID đúng chỗ) | `src/lib/plan.js`, `pos-content.planAndOffer` | `plan-apply.test.js`: 4 test "P1.2: …", gồm ca tái hiện của PM. Thêm 1 test "UID đã có trên GR nhưng không thuộc kết quả Nextwaves" |
| P1.3 | **Bỏ hẳn** chế độ ghi lâu dài (`writeMode` off / confirm / auto). `config` chỉ còn `{mode, url}`; giá trị cũ `auto` của v0.1.0 bị bỏ khi đọc. Ghi W1 cần **cấp phép một lần cho một mã GR**, có hạn 30 phút. Chỉ popup tạo được (`sender.tab` → từ chối), và production không nhận cấp phép. Nút điền chỉ hiện khi có cấp phép đúng GR, và nhãn nút mang **mã kế hoạch** (FNV-1a của GR, PO, ảnh chụp phiếu, các bước). `claimApply` kiểm mã GR + mã kế hoạch rồi **tiêu** cấp phép. Thử lại sau khi dừng cần cấp phép mới. PRD `writeEnabled:false` ở `env.js`, background chặn `env_read_only`. Cửa hàng chưa map kho → `warehouse_unmapped` | `env.js`, `background.js` (`grant:*`, `claimApply`, `writeBlockers`), `pos-content`, `popup/*` | `runtime.test.js`, 4 test "P1.3: …": cấu hình cũ `auto` → 0 PUT; cấp phép phiếu khác / hết hạn / từ content script; PRD chỉ đọc; PUT lỗi rồi cần cấp phép mới |
| P1.4 | Cả hai đường vào: thiếu `x-store-id` thì dừng trước mọi API. Cửa hàng ngoài danh sách STG thì dừng. GR thiếu `pos_info.id` hoặc khác cửa hàng thì dừng. `resolveDelivery(gr, po, storeId)` bắt buộc đủ ba giá trị và trùng nhau (`store_missing` / `store_mismatch`). Background `session:start` cũng kiểm `storeAllowed` | `pos-content.evaluate` / `evaluateGr`, `pos-model.resolveDelivery`, `background.startSession` | `models.test.js` "P1.4: …"; `runtime.test.js` "P1.4: …" (8 ca, cả hai đường vào): đều 0 tab Nextwaves, 0 phiên, 0 PUT |
| P1.5 | Lease có chủ (`token` của tab) và hạn (`LEASE_MS` 90 s), gia hạn mỗi 15 s. **Ngay trước mỗi PUT** `apply.beforePut` gia hạn và xác nhận còn quyền; mất quyền → `lease_lost`. Tab khác chỉ giành được khi lease đã hết hạn. Chỉ chủ lease gọi được `finishApply`; tab mất lease không ghi đè trạng thái phiên. Mọi lời gọi mạng hết giờ sau 30 s. PUT hết giờ / lỗi mạng → `unknown`, rồi **hạ nhiệt 60 s** mới cho ghi lại; lần sau đọc lại phiếu, lập kế hoạch mới. Lý do chọn số: LEASE_MS (90 s) > hết giờ client (30 s) và `grpc-timeout: 30S` mà app POS gửi (extension chuyển nguyên header). Vì vậy một PUT không thể còn treo khi lease hết hạn | `background.js` (`claimApply`, `renewLease`, `finishApply`), `apply.js`, `pos-content.runApply` | `plan-apply.test.js` "P1.5: …"; `runtime.test.js`, 2 test "P1.5: …": PUT treo quá giờ → tab 2 bị `lease_held` rồi `cooldown`, sau đó lập kế hoạch mới, **mỗi lô đúng một PUT, 12 mã không trùng**; tab mất lease giữa chừng → không gửi PUT 3, không đổi trạng thái phiên |

## 2. P2 — đã sửa trong mã, hợp đồng thật còn chờ

| # | Đã làm | Còn chờ dữ liệu thật |
|---|---|---|
| P2.1 | Chuyển về POS chỉ khi **phiên đã ghi nhận một lượt `receive-scan` 2xx** của đúng phiếu gửi (`session:scanOk`; background `received` từ chối nếu thiếu). Tải lại trang mà chưa có lượt 2xx thì chỉ hiển thị "Nextwaves đang có N UID đã nhận", không chuyển. Bằng chứng mỗi UID: <br>• có `receiptId`; <br>• biên nhận có trong `receipts[]` của PO, `items[].epcs` chứa EPC, cùng kho; <br>• EPC nằm trên dòng của đúng phiếu gửi, và phiếu gửi có EPC trong `receivedEpcs`; <br>• có **ít nhất một biên nhận mới** so với lúc khớp đơn (`receiptIdsBefore`). <br>Cấu trúc `receipts` lấy từ **mẫu thật** PO88508353 (test "PO Nextwaves sau khi nhận (mẫu thật PO88508353)…") | `receivedEpcs` sau khi nhận và trạng thái PO / phiếu gửi theo **đường inter-tenant** chưa có mẫu thật (K1). Nếu response thật khác, khung Nextwaves sẽ báo đúng mã vấn đề (ví dụ `shipment_not_received:<epc>`) và **không** chuyển về POS. Dev sẽ cập nhật hợp đồng theo response thật, không nới parser |
| P2.2 | Tra QR là **bắt buộc** cho mọi UID (`qr_lookup_missing`). Kết quả phải có `productId` dạng số, `lot`, `expiredDate` DD-MM-YYYY; thiếu thì `incomplete` → `qr_incomplete`. Sản phẩm QR ≠ dòng → `qr_product_mismatch`. Lô lấy từ QR; lô Nextwaves (nếu có) phải trùng | — |
| P2.3 | Trước mỗi PUT, đọc lại GR và so **toàn phiếu** với ảnh chụp lúc lập kế hoạch: trạng thái, tập chi tiết, `received` / mã / số mã thô của từng chi tiết. Lệch ở bất kỳ chi tiết nào → `gr_changed`. Sau PUT cũng kiểm toàn phiếu | — |

## 3. Quyết định PM đã áp

- **P3 nhiều GR cùng SO:** đọc thì cho chọn. **Khoá ghi** khi SO có ≠ 1 phiếu nhận (chưa huỷ) ở cửa hàng (`so_many_gr`), không kiểm được (`so_gr_unknown`), hoặc Nextwaves có > 1 đơn cùng SO, cùng bên bán, cùng kho, dù dấu vân tay chỉ khớp một (`nw_many_orders`). Khoá do background giữ; content script không gỡ được.
- **P2 nhận thiếu:** giữ, ở lại Nextwaves. **P4:** giữ, không tự mở khi phiếu đã có mã. **P6:** chặn cả gói. **P7:** PRD chỉ đọc.

## 4. Kết quả test nguyên văn

`npm test` tại `d124453`: **73/73** đạt. Chạy liên tiếp 10 lần đều xanh (dev tự báo).
Đột biến: **32/32** bị bắt. Danh sách nằm ở §5.
Phân bố 73 test: `env-keys` 7, `hooks` 5, `models` 14, `plan-apply` 19, `resolve` 8, `runtime` 20 (chạy trọn luồng trên trình duyệt giả).

Thay đổi bộ test cần PM biết:
- `browser-sim.js`:
  - thêm `AbortController` cho content;
  - server giả được trả chậm / treo theo yêu cầu, và vẫn xử lý dù client đã bỏ chờ, như server thật;
  - tuning thời gian của background;
  - thêm `sendFromTab` (gửi tin như content script).
- `helpers.js` dựng thêm PO và phiếu gửi **sau khi nhận** (`receipts`, `receivedEpcs`). Đây là **DỰNG LẠI**, theo cấu trúc mẫu thật PO88508353.
- `runtime.test.js`: bước dựng (`openToReady` / `openToReceived`) hỏng thì tự đóng trình duyệt giả. Lý do: lần chạy đột biến đầu, ca "P2.1 tải lại trang tự chuyển" làm tiến trình test **treo** thay vì hỏng gọn, vì timer của trình duyệt chưa đóng. Sau khi sửa, ca này hỏng 16 test và thoát trong ~66 s.

Kết quả nguyên văn (`npm test`, các dòng ✔ / ✖ / ℹ):

```
✔ chế độ STG / PRD / URL → đúng môi trường; URL lạ hoặc http → null (1.6205ms)
✔ nhận dạng trang POS: GR, chi-tiet-so; sai origin hoặc trang khác → null (1.7434ms)
✔ đường dẫn API đúng từng môi trường (staging /backend/v1, production api.v2/v1) (0.8166ms)
✔ phạm vi cửa hàng: STG chỉ 2222; PRD theo phiên; bảng kho (0.2763ms)
✔ nhận dạng lời gọi xác nhận nhận hàng Nextwaves và hoàn tất GR POS (0.7426ms)
✔ khoá SO: mã giao POS và refId Nextwaves cùng gốc; định dạng lạ → rỗng (0.399ms)
✔ khoá lô: batch Nextwaves và tra QR POS ra cùng lot_date POS (0.5493ms)
✔ pos-hook: báo header của API POS (chỉ các header cần), không trùng; chào lại → gửi lại (6.193ms)
✔ pos-hook: PUT …/status/COMPLETED (XHR và fetch) → báo gr-status kèm HTTP status (8.859ms)
✔ nw-hook: Authorization của API Nextwaves; POST receive-scan (XHR) → status, response, số EPC gửi (2.7091ms)
✔ nw-hook: receive-scan qua fetch; API tích hợp / host lạ không báo (4.33ms)
✔ tra QR POS: đúng UID → sản phẩm / lô / hạn; không có / nhiều bản ghi khác nhau → không đoán (1.0751ms)
✔ GR03878: đọc dòng, đơn vị dòng và hệ số đơn vị (3.3937ms)
✔ GR03878 ↔ PO00006750: mã giao SOBD1593858-F, liên kết hai chiều đạt (4.3856ms)
✔ P1.4: cửa hàng phải có đủ x-store-id, GR.pos_info.id, PO.pos_id và trùng nhau (2.7962ms)
✔ GR03877 tạo tay (PO IMPORT_STOCK, không mã giao) → dừng no_delivery_code (0.5536ms)
✔ GR không nằm trong PO / PO khác / nhiều mã giao → chặn (2.8799ms)
✔ tìm GR theo SO (đường /chi-tiet-so) → GR03878 (0.9777ms)
✔ Nextwaves: tìm receiving theo SO, đọc đơn liên kết và kiểm SO / đối tác / kho (0.9375ms)
✔ Nextwaves: /receiving thật (PO76458756, PO60017570) và dòng giao có lô (PO28237814) (1.1541ms)
✔ PO Nextwaves sau khi nhận (mẫu thật PO88508353): 25 receivedUnits, biên nhận chứa đúng EPC (0.5912ms)
✔ dấu vân tay: GR03878 khớp PO28237814 (dựng lại) nhưng KHÔNG khớp PO76458756 / PO60017570 (thật) (2.0013ms)
✔ dựng UID đã nhận: đơn vị và lô theo dòng giao, không thiếu / không lạ, có bằng chứng biên nhận (3.3935ms)
✔ dựng UID đã nhận: nhận thiếu → missing; EPC lạ → unexpected (1.4605ms)
✔ P2.1: thiếu bằng chứng nhận → problems (phiếu gửi chưa ghi nhận EPC, biên nhận thiếu / lạ / sai kho, không có biên nhận mới) (5.3417ms)
✔ P2.2: tra QR phải có productId số, lô, hạn DD-MM-YYYY (0.7219ms)
✔ GR03878: 12 UID → 6 lần ghi, mỗi lô +1 đơn vị dòng (3 vỉ = 1 hộp, 2 túi = 1 hộp, 1 chai) (18.47ms)
✔ một chặn bất kỳ → không ghi gì (cả gói) (3.3342ms)
✔ lô Nextwaves ≠ lô tra QR → lot_conflict; lô không có trên GR → lot_not_on_gr (3.0673ms)
✔ quy đổi lẻ → fraction; vượt số lượng lô → over; đơn vị lạ → unit_unknown (4.1832ms)
✔ sản phẩm lạ / tra QR ra sản phẩm khác → chặn; không có UID nào → nothing_to_write (2.9771ms)
✔ P2.2: thiếu kết quả tra QR / QR thiếu productId hoặc lô → chặn trước khi ghi (1.7374ms)
✔ P1.2: UID đã nằm ĐÚNG lô, lượng nhất quán → bỏ qua; đủ 12 → complete, không bước nào (2.6232ms)
✔ P1.2: UID nằm sai lô (cùng sản phẩm) → uid_on_wrong_detail, không complete (tái hiện PM) (2.3216ms)
✔ P1.2: UID nằm ở dòng sản phẩm khác / ở hai lô / mã bị nối trùng → chặn (2.1886ms)
✔ P1.2: received_quantity lệch với UID đang nằm trên lô (thiếu / thừa / có lượng mà không mã) → received_mismatch (3.0077ms)
✔ UID đã có trên GR nhưng không thuộc kết quả Nextwaves → gr_has_foreign_codes (1.3575ms)
✔ W1: 6 PUT tuần tự, body đúng (received tuyệt đối, lot_id, UID của lô), đọc lại xác nhận (4.0876ms)
✔ W1: chạy lại sau khi đã ghi đủ → không PUT thêm (already) (2.1593ms)
✔ W1: chi tiết của bước bị đổi trước khi ghi → dừng gr_changed đúng ở bước đó, không PUT bước đó (2.2273ms)
✔ P2.3: phiếu đổi ở chi tiết KHÁC (quét tay giữa chừng) → dừng trước bước kế, không ghi tiếp (2.0984ms)
✔ P1.5: mất quyền ghi (lease) trước một PUT → dừng lease_lost, không gửi tiếp (2.6266ms)
✔ W1: PUT lỗi ở bước 3 → dừng put_failed sau 3 lời gọi; chạy lại bỏ qua 2 bước đã xong (2.9684ms)
✔ W1: lỗi mạng → unknown; server không lưu mã → verify_failed (1.5993ms)
✔ W1: kế hoạch có chặn → không chạy; GR đã hoàn tất → dừng (1.5532ms)
✔ 1 ứng viên hợp lệ → chọn PO28237814, không khoá ghi (6.1924ms)
✔ 12 ứng viên (11 đơn SO khác + đơn đúng) → đọc hết cả 12, chọn đúng (8.4112ms)
✔ total > số dòng đọc được (2 trang, đơn khớp có thể ở trang 2) → search_incomplete, không chọn (23.8777ms)
✔ kết quả tìm thiếu total / items, hoặc lỗi HTTP → chặn (0.7346ms)
✔ một GET ứng viên hết giờ / lỗi HTTP → chặn cả lượt dù đơn đúng vẫn đọc được (3.3888ms)
✔ ứng viên thiếu trường (bên bán / kho / refId / status) → candidate_schema (1.8001ms)
✔ 0 / n ứng viên khớp: lệch số lượng → no_match; hai đơn cùng khớp → ambiguous (2.3535ms)
✔ loại rõ ràng: bên bán khác / kho khác / đơn huỷ; còn đơn cùng SO lệch số lượng → chọn được nhưng khoá ghi (2.284ms)
✔ E2E STG GR03878: GR → Nextwaves ?po=SOBD1593858 → khớp PO28237814 → nhận → kế hoạch chỉ xem → cấp phép 1 lần → điền 6 lô / 12 UID → HOÀN THÀNH (229.3535ms)
✔ P1.3: cấu hình cũ writeMode=auto (v0.1.0) sau nâng cấp → không tự PUT; config không còn writeMode (173.2102ms)
✔ P1.3: cấp phép cho phiếu khác / đã hết hạn → 0 PUT; content script không tự cấp phép được (279.6782ms)
✔ P1.3: production chỉ đọc — không cấp phép được, phiên PRD không giành được quyền ghi (4.8534ms)
✔ P1.3: PUT lỗi → dừng; cấp phép đã tiêu nên thử lại cần cấp phép MỚI, rồi điền tiếp đủ (74.1296ms)
✔ P1.4: thiếu / sai cửa hàng ở đường mở GR và đường /chi-tiet-so → dừng trước khi mở Nextwaves (846.0647ms)
✔ P1.5: PUT treo quá giờ ở tab 1 → kết quả không rõ + hạ nhiệt; tab 2 chỉ giành được sau đó và mỗi lô vẫn đúng một PUT (760.658ms)
✔ P1.5: tab mất lease giữa chừng (tab khác tiếp quản) → không gửi PUT kế tiếp, không ghi đè trạng thái phiên (299.2322ms)
✔ P3: SO có 2 phiếu nhận ở cửa hàng → phiên khoá ghi; có cấp phép vẫn chỉ xem, claim bị từ chối, content không gỡ được khoá (109.4409ms)
✔ P2.1: tải lại trang Nextwaves sau khi đơn đã nhận nhưng phiên chưa thấy lượt 2xx → chỉ hiển thị, không về POS (111.0338ms)
✔ P2.1: lượt 2xx nhưng không có biên nhận mới so với lúc khớp đơn → không về POS (61.7542ms)
✔ Nextwaves trả 400 tagged_unit_unsupported (K1): báo lỗi trên tab Nextwaves, không về POS, không ghi (122.8731ms)
✔ Nhận thiếu 1 UID (keep_open): giữ ở Nextwaves, báo 11/12, không về POS (158.0361ms)
✔ Đường (2) /chi-tiet-so/SOBD1593858: tìm GR theo SO + cửa hàng → cùng luồng, quay về trang SO (15.5068ms)
✔ Chế độ STG trên trang POS production → không làm gì, không gọi host nào (155.2805ms)
✔ Chưa chọn môi trường / môi trường PRD → không làm gì trên POS staging (312.5708ms)
✔ Huỷ phiên trên POS → tải lại trang không tự mở Nextwaves; bấm 'Nhận bằng Nextwaves' → mở lại (112.401ms)
✔ Hai tab POS cùng GR03878, một cấp phép: bấm ở cả hai tab → chỉ một tab ghi, không nhân đôi mã (231.7004ms)
✔ Lượt 'Xác nhận nhận hàng' của phiếu gửi khác → bỏ qua, không về POS (126.5114ms)
✔ background: giành quyền ghi — đúng một lần cho một cấp phép; chỉ từ received / apply_stopped; chỉ chủ lease gia hạn / kết thúc (23.0108ms)
ℹ tests 73
ℹ suites 0
ℹ pass 73
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4336.6138
```

## 5. Đột biến (dev tự chạy trên worktree của `d124453`, không sửa `src/` của repo)

Mỗi ca gỡ đúng một hàng rào, chạy cả bộ test, và bộ test phải hỏng. PM chạy lại được:

```
python -I scripts/mutate-v0.1.1.py
```

Script tự chép `src/ tests/ samples/ package.json` sang thư mục tạm và chạy bộ test gốc trước; bộ gốc chưa xanh thì dừng. Mất khoảng 25–30 phút.

```
KILLED P1.1 chọn trên trang chưa đủ | ✖ total > số dòng đọc được (2 trang, đơn khớp có thể ở trang 2) → search
KILLED P1.1 bỏ qua ứng viên đọc lỗi | ✖ một GET ứng viên hết giờ / lỗi HTTP → chặn cả lượt dù đơn đúng vẫn đọc
KILLED P1.1 bỏ kiểm trường ứng viên | ✖ ứng viên thiếu trường (bên bán / kho / refId / status) → candidate_sch
KILLED P1.2 bỏ kiểm UID sai lô | ✖ P1.2: UID nằm sai lô (cùng sản phẩm) → uid_on_wrong_detail, không comp || ✖ P1.2: UID nằm ở dòng sản phẩm khác / ở hai lô / mã bị nối trùng → chặn
KILLED P1.2 bỏ kiểm lượng nhất quán | ✖ P1.2: received_quantity lệch với UID đang nằm trên lô (thiếu / thừa / 
KILLED P1.2 bỏ kiểm lượng không mã | ✖ P1.2: received_quantity lệch với UID đang nằm trên lô (thiếu / thừa / 
KILLED P1.2 bỏ kiểm UID nhiều lô | ✖ P1.2: UID nằm ở dòng sản phẩm khác / ở hai lô / mã bị nối trùng → chặn
KILLED P1.3 giành quyền không cần cấp phép | ✖ P1.3: cấp phép cho phiếu khác / đã hết hạn → 0 PUT; content script khô || ✖ background: giành quyền ghi — đúng một lần cho một cấp phép; chỉ từ re
KILLED P1.3 cấp phép dùng nhiều lần | ✖ E2E STG GR03878: GR → Nextwaves ?po=SOBD1593858 → khớp PO28237814 → nh || ✖ P1.3: PUT lỗi → dừng; cấp phép đã tiêu nên thử lại cần cấp phép MỚI, r
KILLED P1.3 content tự cấp phép | ✖ P1.3: cấp phép cho phiếu khác / đã hết hạn → 0 PUT; content script khô
KILLED P1.3 PRD được ghi | ✖ P1.3: production chỉ đọc — không cấp phép được, phiên PRD không giành 
KILLED P1.3 hiện nút khi chưa cấp phép | ✖ E2E STG GR03878: GR → Nextwaves ?po=SOBD1593858 → khớp PO28237814 → nh || ✖ P1.3: PUT lỗi → dừng; cấp phép đã tiêu nên thử lại cần cấp phép MỚI, r
KILLED P1.4 bỏ bắt buộc x-store-id | ✖ P1.4: thiếu / sai cửa hàng ở đường mở GR và đường /chi-tiet-so → dừng 
KILLED P1.4 PO / GR thiếu cửa hàng vẫn qua | ✖ P1.4: cửa hàng phải có đủ x-store-id, GR.pos_info.id, PO.pos_id và trù
KILLED P1.4 GR thiếu pos_info vẫn qua | ✖ P1.4: thiếu / sai cửa hàng ở đường mở GR và đường /chi-tiet-so → dừng 
KILLED P1.5 gia hạn lease không kiểm chủ | ✖ P1.5: tab mất lease giữa chừng (tab khác tiếp quản) → không gửi PUT kế || ✖ background: giành quyền ghi — đúng một lần cho một cấp phép; chỉ từ re
KILLED P1.5 bỏ kiểm lease trước PUT | ✖ P1.5: mất quyền ghi (lease) trước một PUT → dừng lease_lost, không gửi || ✖ P1.5: tab mất lease giữa chừng (tab khác tiếp quản) → không gửi PUT kế
KILLED P1.5 giành khi lease còn hạn | ✖ P1.5: PUT treo quá giờ ở tab 1 → kết quả không rõ + hạ nhiệt; tab 2 ch || ✖ background: giành quyền ghi — đúng một lần cho một cấp phép; chỉ từ re
KILLED P1.5 không phải chủ vẫn kết thúc | ✖ P1.5: tab mất lease giữa chừng (tab khác tiếp quản) → không gửi PUT kế || ✖ background: giành quyền ghi — đúng một lần cho một cấp phép; chỉ từ re
KILLED P1.5 bỏ hạ nhiệt sau kết quả không rõ | ✖ P1.5: PUT treo quá giờ ở tab 1 → kết quả không rõ + hạ nhiệt; tab 2 ch
KILLED P2.1 về POS khi chưa có lượt 2xx | ✖ P2.1: tải lại trang Nextwaves sau khi đơn đã nhận nhưng phiên chưa thấ
KILLED P2.1 bỏ kiểm biên nhận | ✖ P2.1: thiếu bằng chứng nhận → problems (phiếu gửi chưa ghi nhận EPC, b
KILLED P2.1 bỏ kiểm biên nhận mới | ✖ P2.1: lượt 2xx nhưng không có biên nhận mới so với lúc khớp đơn → khôn || ✖ P2.1: thiếu bằng chứng nhận → problems (phiếu gửi chưa ghi nhận EPC, b
KILLED P2.1 bỏ kiểm phiếu gửi đã nhận | ✖ P2.1: thiếu bằng chứng nhận → problems (phiếu gửi chưa ghi nhận EPC, b
KILLED P2.1 tải lại trang tự chuyển | ✖ E2E STG GR03878: GR → Nextwaves ?po=SOBD1593858 → khớp PO28237814 → nh || ✖ Hai tab POS cùng GR03878, một cấp phép: bấm ở cả hai tab → chỉ một tab
KILLED P2.2 QR thiếu trường vẫn dùng | ✖ P2.2: tra QR phải có productId số, lô, hạn DD-MM-YYYY (2.2075ms)
KILLED P2.2 thiếu kết quả tra QR | ✖ P2.2: thiếu kết quả tra QR / QR thiếu productId hoặc lô → chặn trước k
KILLED P2.3 bỏ so toàn phiếu | ✖ P2.3: phiếu đổi ở chi tiết KHÁC (quét tay giữa chừng) → dừng trước bướ
KILLED P3 bỏ khoá ghi | ✖ P3: SO có 2 phiếu nhận ở cửa hàng → phiên khoá ghi; có cấp phép vẫn ch
KILLED P3 content gỡ được khoá | ✖ P3: SO có 2 phiếu nhận ở cửa hàng → phiên khoá ghi; có cấp phép vẫn ch
KILLED P3 bỏ khoá nhiều đơn Nextwaves | ✖ loại rõ ràng: bên bán khác / kho khác / đơn huỷ; còn đơn cùng SO lệch 
KILLED P3 bỏ khoá SO nhiều GR | ✖ P3: SO có 2 phiếu nhận ở cửa hàng → phiên khoá ghi; có cấp phép vẫn ch
32/32 bị bắt (từ ca 1)
```

## 5b. Kiểm gói và trình duyệt thật (dev tự báo)

- **Tái lập gói:** checkout sạch `d124453` → `python -I scripts/pack.py` → cùng SHA-256 `d8cd9afd88e4639c1e65d09d3aa55da40a78c7e1477c019ace163c85403a1758`.
- **Bản cài:** `C:\circa-gr-nextwaves-v0.1.1` khớp từng file (17/17) với `src/` của `d124453`. Gói `FF5CD95B` (v0.1.0) vẫn nguyên hash.
- **Quét bí mật** theo `agent.md` §7 trên commit: 0 kết quả. File DIFF xuất ra: 0 chuỗi dạng token.
- **Edge 156 headless** (hồ sơ tạm, đã tắt sạch), nạp đúng thư mục cài:
  - service worker báo `Circa GR ← Nextwaves | 0.1.1`; `STG.writeEnabled = true`, `PRD.writeEnabled = false`;
  - `chrome.storage` chạy;
  - hook MAIN world nạp trên `circa-stg.nextwaves.app`;
  - POS staging chưa đăng nhập chuyển sang `sso.stg.buymed.tech`, nên không nạp script.
- **Chưa kiểm:** phiên staging có đăng nhập, lượt nhận thật, PUT thật.

## 6. Thử staging

**T1 (chỉ đọc), cài `C:\circa-gr-nextwaves-v0.1.1`:**
1. Gỡ hoặc tắt v0.1.0, rồi Load unpacked bản mới.
2. Popup: Môi trường = Staging → Lưu. **Không cấp phép điền.**
3. Mở GR03878.
4. Kỳ vọng:
   - Tab Nextwaves hiện "Sẵn sàng nhận hàng", kèm dòng "Tìm theo SOBD1593858: total …, đã đọc …; ứng viên Buymed cùng kho …; refId đúng SO …".
   - Tab POS hiện "Đã khớp đơn Nextwaves — chờ nhận hàng".
5. Chụp hai khung, kèm Copy response `inter-tenant-orders/receiving?…q=SOBD1593858`.

**T3** chỉ làm khi đã gỡ K1 và PM audit lại. Lúc đó operator cấp phép một lần cho đúng GR trong popup, rồi bấm nút có mã kế hoạch.

## 7. Còn mở

- Hợp đồng ghi W1 trên POS thật (một PUT nhiều UID, `received_quantity` tuyệt đối): chưa kiểm.
- Hợp đồng "đã nhận" theo đường inter-tenant: chờ lượt nhận thật (K1).
- Production: chỉ đọc. Bảng kho mới có Florita. R12 chưa xử lý.
