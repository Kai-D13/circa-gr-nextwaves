# v0.1.2 — dev sửa theo PM audit lại v0.1.1 (P1.6, P1.7)

Người viết: dev-team, 24/10/2026. Trả lời `docs/pm/AUDIT-v0.1.1-STG-20261024.md`.
Nhánh **`batch/v0.1-staging`**, trên `8e443fa` ← `d124453` (bản PM vừa audit). Chưa merge, chưa ghi POS thật.

| Commit | Nội dung |
|---|---|
| **`6eeb3c0`** | Sửa mã P1.6 / P1.7 + test + `scripts/mutate-v0.1.2.py` (gói v0.1.2 dựng từ commit này) |
| `5d117d2` | Chỉ thêm khẳng định test P1.7 (bắt một đột biến còn sống, §5); `src/` giống hệt `6eeb3c0` |

| | |
|---|---|
| Phiên bản | `0.1.2` |
| Gói | `dist/circa-gr-nextwaves-v0.1.2.zip`, 17 file |
| SHA-256 | `525bce842bebaff045e5efe3341bd4c8bf6bd2451ef6d6356f59af692ff805d1` — **mã gói `525BCE84`** |
| Bản cài | `C:\circa-gr-nextwaves-v0.1.2`, khớp 17/17 file với `src/` của `6eeb3c0` |
| Gói cũ | `FF5CD95B` (v0.1.0) và `D8CD9AFD` (v0.1.1) giữ nguyên hash, không ghi đè |

**DIFF cần audit:** `git diff d124453 5d117d2 -- src tests package.json scripts`
- Thống kê: 10 file, +554 / −78.
- Trong đó `scripts/mutate-v0.1.2.py` là `mutate-v0.1.1.py` (`8e443fa`) đổi tên và thêm ca.
- Bản xuất sẵn: `dist/circa-gr-nextwaves-v0.1.2-vs-d124453.diff` (922 dòng) và `.stat.txt` (không vào git).

## 1. P1.6 — danh sách GR theo SO phải đọc đủ và rõ

**Sửa** (`src/lib/pos-model.js` `normalizeGrSearchPage`, `checkSoGrs`, `soWriteLock`; `src/pos/pos-content.js` `searchGrsOfSo`):

1. Đọc trang kết quả kèm `data.total`, `page`, `limit`. Thiếu `goods_receipts` mảng hoặc một trong ba số → `search_unreadable`.
2. Bắt buộc `page = 1`, `limit ≥ 1`, số dòng ≤ `limit` (`search_paging`), và `total = số dòng đã đọc` (`search_incomplete`).
   **Chưa phân trang:** kết quả nhiều trang thì fail closed, không kết luận.
3. **Không lọc rồi đếm.** Dòng thiếu `id` / trạng thái / `pos_info.id` → `row_incomplete`. Dòng của cửa hàng khác, hoặc chưa biết cửa hàng đăng nhập → `row_other_store`.
4. `soWriteLock`:
   - kiểm không đạt, hoặc GR đang mở không có trong danh sách → `so_gr_unknown`;
   - có hơn một GR chưa huỷ → `so_many_gr`;
   - đúng một GR chưa huỷ, là GR đang mở → không khoá.
5. **Hai đường vào dùng chung phép kiểm:**
   - Đường mở GR: tạo phiên kèm khoá ghi (đọc vẫn tiếp tục).
   - Đường `/chi-tiet-so`: kiểm không đạt thì **dừng**, không mở Nextwaves; hai GR đủ dữ liệu thì cho chọn để đọc, và phiên mang khoá `so_many_gr`.

**Test gate:**
- `models.test.js` "P1.6: danh sách GR theo SO phải đọc đủ (total / page / limit) và rõ từng dòng, không lọc rồi đếm". Các ca: mẫu thật; total 2 / 1 dòng; `page=2`; `limit=0`; thiếu `limit`; `total` dạng chuỗi; `goods_receipts=null`; số dòng > `limit`; dòng thiếu `pos_info`; dòng thiếu trạng thái; cửa hàng khác; hai GR; GR kia đã huỷ; GR đang mở vắng mặt.
- `runtime.test.js` "P1.6 đường mở GR …". 5 biến thể:
  - total 2 / trang trả 1 dòng;
  - `page=2`;
  - thiếu `limit`;
  - một dòng thiếu `pos_info.id`;
  - hai GR đủ dữ liệu.

  Mỗi biến thể: phiên mang khoá đúng; có cấp phép vẫn chỉ xem; claim bị từ chối; **0 PUT**.
- `runtime.test.js` "P1.6 đường /chi-tiet-so …": cùng 5 biến thể.
  - Bốn ca chưa đủ / không rõ: dừng, không mở Nextwaves, không có phiên.
  - Ca hai GR: chọn được, phiên khoá `so_many_gr`, 0 PUT.

## 2. P1.7 — khoá Nextwaves bất biến

**Sửa** (`src/background.js`, `src/nw/nw-content.js`):

1. **`session:update` từ content chỉ đổi được `state`, và chỉ sang `applied` / `done`.** Danh sách cho phép thay cho danh sách cấm; mọi trường khác bị bỏ qua.
2. Khớp đơn Nextwaves đi qua message riêng **`session:nwMatched`**:
   - chỉ từ trang Nextwaves của đúng môi trường;
   - chỉ khi phiên đang `waiting_nw` và chưa khớp, tức là **một lần**;
   - kiểm `refId` cùng SO, có phiếu gửi, `expected` đúng dạng;
   - khoá chỉ nhận giá trị đã biết (`nw_many_orders`).

   Sau đó không message nào xoá hay hạ khoá được, và dữ liệu nhận dạng PO / phiếu gửi không đổi được.
3. Kiểm nguồn gửi (theo `sender.origin` / `url`):
   - `session:start`, `claimApply`, `renewLease`, `finishApply`: từ trang POS của môi trường;
   - `nwMatched`, `scanOk`, `received`: từ trang Nextwaves của môi trường;
   - `scanOk` còn phải là lượt 2xx của phiếu gửi thuộc đơn đã khớp.
4. Trình duyệt giả gửi kèm `sender.url` / `origin` như Chrome.

**Test gate:**
- `runtime.test.js` "P1.7: Nextwaves có đơn cùng SO khác lần giao → khoá nw_many_orders; tab POS / Nextwaves không xoá được khoá, không đổi được đơn; claim bị từ chối, 0 PUT":
  - server giả có đơn "song sinh" cùng SO, lệch số lượng; dấu vân tay vẫn chọn đúng PO28237814, khoá `nw_many_orders`;
  - tab POS và tab Nextwaves gửi `session:update` xoá khoá, đổi `nwPoId` / `shipmentIds` / `warehouseId` / `scanOk` → phiên không đổi;
  - `session:nwMatched` lần hai (từ Nextwaves) → "đã khớp"; từ POS / popup → "nguồn gửi không hợp lệ";
  - sau lượt nhận + cấp phép: vẫn chỉ xem, claim `nw_many_orders`, **0 PUT**.
- `runtime.test.js` "P1.7: session:nwMatched — chỉ từ trang Nextwaves, chỉ khi phiên chờ, kiểm refId cùng SO và khoá hợp lệ, chỉ một lần":
  - refId khác SO / khoá lạ / thiếu phiếu gửi / gửi từ POS → từ chối;
  - luồng hợp lệ tạo `nw_ready` và khoá đúng (khoá trùng được gộp); lần hai từ chối;
  - `scanOk` phiếu gửi lạ / từ POS / không 2xx → từ chối;
  - `received` từ POS → từ chối;
  - `session:start` từ popup / Nextwaves → từ chối.
- Test "background: giành quyền ghi …" thêm: claim từ popup / tab Nextwaves → "nguồn gửi không hợp lệ"; gia hạn từ tab Nextwaves → từ chối.
- Luồng hợp lệ trọn vẹn: test E2E (tạo phiên → khớp đơn → nhận → cấp phép → 6 PUT) vẫn đạt.

## 3. Đính chính theo nhận xét PM

- **P1.1:** chính xác là **fail closed ở một trang**: chặn khi `total` ≠ số dòng đã đọc, **chưa phân trang** Nextwaves.
  Báo cáo v0.1.1 viết "chọn trên toàn bộ ứng viên" chỉ đúng khi `total` = số dòng của trang 1. P1.6 phía POS cũng theo cách này.
- **P1.5:** đồng ý. Trình duyệt giả không chứng minh "mỗi UID ghi đúng một lần" trên server thật; phép thử W1 có operator cho phép vẫn bắt buộc.
- **P2.1:** đồng ý. Mẫu PO88508353 thuộc đường hub-order; hợp đồng chỉ chốt sau response thật theo đường inter-tenant.

## 4. Kết quả test nguyên văn

`npm test` tại `5d117d2`: **78/78** (thêm 5 so với v0.1.1). Chạy liên tiếp 10 lần đều xanh (dev tự báo).
Phân bố: `env-keys` 7, `hooks` 5, `models` 15, `plan-apply` 19, `resolve` 8, `runtime` 24.

```
✔ chế độ STG / PRD / URL → đúng môi trường; URL lạ hoặc http → null (1.546ms)
✔ nhận dạng trang POS: GR, chi-tiet-so; sai origin hoặc trang khác → null (1.7101ms)
✔ đường dẫn API đúng từng môi trường (staging /backend/v1, production api.v2/v1) (0.7174ms)
✔ phạm vi cửa hàng: STG chỉ 2222; PRD theo phiên; bảng kho (0.235ms)
✔ nhận dạng lời gọi xác nhận nhận hàng Nextwaves và hoàn tất GR POS (0.6361ms)
✔ khoá SO: mã giao POS và refId Nextwaves cùng gốc; định dạng lạ → rỗng (1.252ms)
✔ khoá lô: batch Nextwaves và tra QR POS ra cùng lot_date POS (0.5996ms)
✔ pos-hook: báo header của API POS (chỉ các header cần), không trùng; chào lại → gửi lại (6.1215ms)
✔ pos-hook: PUT …/status/COMPLETED (XHR và fetch) → báo gr-status kèm HTTP status (9.3312ms)
✔ nw-hook: Authorization của API Nextwaves; POST receive-scan (XHR) → status, response, số EPC gửi (3.0588ms)
✔ nw-hook: receive-scan qua fetch; API tích hợp / host lạ không báo (3.7647ms)
✔ tra QR POS: đúng UID → sản phẩm / lô / hạn; không có / nhiều bản ghi khác nhau → không đoán (1.4602ms)
✔ GR03878: đọc dòng, đơn vị dòng và hệ số đơn vị (3.8356ms)
✔ GR03878 ↔ PO00006750: mã giao SOBD1593858-F, liên kết hai chiều đạt (3.9476ms)
✔ P1.4: cửa hàng phải có đủ x-store-id, GR.pos_info.id, PO.pos_id và trùng nhau (4.4561ms)
✔ GR03877 tạo tay (PO IMPORT_STOCK, không mã giao) → dừng no_delivery_code (0.8321ms)
✔ GR không nằm trong PO / PO khác / nhiều mã giao → chặn (3.5571ms)
✔ tìm GR theo SO (đường /chi-tiet-so) → GR03878 (0.8498ms)
✔ P1.6: danh sách GR theo SO phải đọc đủ (total / page / limit) và rõ từng dòng, không lọc rồi đếm (13.4813ms)
✔ Nextwaves: tìm receiving theo SO, đọc đơn liên kết và kiểm SO / đối tác / kho (1.2786ms)
✔ Nextwaves: /receiving thật (PO76458756, PO60017570) và dòng giao có lô (PO28237814) (2.0539ms)
✔ PO Nextwaves sau khi nhận (mẫu thật PO88508353): 25 receivedUnits, biên nhận chứa đúng EPC (1.3117ms)
✔ dấu vân tay: GR03878 khớp PO28237814 (dựng lại) nhưng KHÔNG khớp PO76458756 / PO60017570 (thật) (2.5495ms)
✔ dựng UID đã nhận: đơn vị và lô theo dòng giao, không thiếu / không lạ, có bằng chứng biên nhận (2.6915ms)
✔ dựng UID đã nhận: nhận thiếu → missing; EPC lạ → unexpected (1.7986ms)
✔ P2.1: thiếu bằng chứng nhận → problems (phiếu gửi chưa ghi nhận EPC, biên nhận thiếu / lạ / sai kho, không có biên nhận mới) (8.3776ms)
✔ P2.2: tra QR phải có productId số, lô, hạn DD-MM-YYYY (1.1284ms)
✔ GR03878: 12 UID → 6 lần ghi, mỗi lô +1 đơn vị dòng (3 vỉ = 1 hộp, 2 túi = 1 hộp, 1 chai) (22.4971ms)
✔ một chặn bất kỳ → không ghi gì (cả gói) (2.8584ms)
✔ lô Nextwaves ≠ lô tra QR → lot_conflict; lô không có trên GR → lot_not_on_gr (2.4793ms)
✔ quy đổi lẻ → fraction; vượt số lượng lô → over; đơn vị lạ → unit_unknown (3.119ms)
✔ sản phẩm lạ / tra QR ra sản phẩm khác → chặn; không có UID nào → nothing_to_write (2.205ms)
✔ P2.2: thiếu kết quả tra QR / QR thiếu productId hoặc lô → chặn trước khi ghi (2.4052ms)
✔ P1.2: UID đã nằm ĐÚNG lô, lượng nhất quán → bỏ qua; đủ 12 → complete, không bước nào (4.4808ms)
✔ P1.2: UID nằm sai lô (cùng sản phẩm) → uid_on_wrong_detail, không complete (tái hiện PM) (2.6209ms)
✔ P1.2: UID nằm ở dòng sản phẩm khác / ở hai lô / mã bị nối trùng → chặn (2.5805ms)
✔ P1.2: received_quantity lệch với UID đang nằm trên lô (thiếu / thừa / có lượng mà không mã) → received_mismatch (2.7594ms)
✔ UID đã có trên GR nhưng không thuộc kết quả Nextwaves → gr_has_foreign_codes (2.6244ms)
✔ W1: 6 PUT tuần tự, body đúng (received tuyệt đối, lot_id, UID của lô), đọc lại xác nhận (4.6275ms)
✔ W1: chạy lại sau khi đã ghi đủ → không PUT thêm (already) (4.8043ms)
✔ W1: chi tiết của bước bị đổi trước khi ghi → dừng gr_changed đúng ở bước đó, không PUT bước đó (3.2533ms)
✔ P2.3: phiếu đổi ở chi tiết KHÁC (quét tay giữa chừng) → dừng trước bước kế, không ghi tiếp (1.8614ms)
✔ P1.5: mất quyền ghi (lease) trước một PUT → dừng lease_lost, không gửi tiếp (2.5214ms)
✔ W1: PUT lỗi ở bước 3 → dừng put_failed sau 3 lời gọi; chạy lại bỏ qua 2 bước đã xong (3.7416ms)
✔ W1: lỗi mạng → unknown; server không lưu mã → verify_failed (2.3489ms)
✔ W1: kế hoạch có chặn → không chạy; GR đã hoàn tất → dừng (2.3693ms)
✔ 1 ứng viên hợp lệ → chọn PO28237814, không khoá ghi (5.6438ms)
✔ 12 ứng viên (11 đơn SO khác + đơn đúng) → đọc hết cả 12, chọn đúng (8.2558ms)
✔ total > số dòng đọc được (2 trang, đơn khớp có thể ở trang 2) → search_incomplete, không chọn (23.3799ms)
✔ kết quả tìm thiếu total / items, hoặc lỗi HTTP → chặn (1.1158ms)
✔ một GET ứng viên hết giờ / lỗi HTTP → chặn cả lượt dù đơn đúng vẫn đọc được (4.0394ms)
✔ ứng viên thiếu trường (bên bán / kho / refId / status) → candidate_schema (2.5781ms)
✔ 0 / n ứng viên khớp: lệch số lượng → no_match; hai đơn cùng khớp → ambiguous (2.2441ms)
✔ loại rõ ràng: bên bán khác / kho khác / đơn huỷ; còn đơn cùng SO lệch số lượng → chọn được nhưng khoá ghi (5.5225ms)
✔ E2E STG GR03878: GR → Nextwaves ?po=SOBD1593858 → khớp PO28237814 → nhận → kế hoạch chỉ xem → cấp phép 1 lần → điền 6 lô / 12 UID → HOÀN THÀNH (240.8054ms)
✔ P1.3: cấu hình cũ writeMode=auto (v0.1.0) sau nâng cấp → không tự PUT; config không còn writeMode (199.8141ms)
✔ P1.3: cấp phép cho phiếu khác / đã hết hạn → 0 PUT; content script không tự cấp phép được (266.3438ms)
✔ P1.3: production chỉ đọc — không cấp phép được, phiên PRD không giành được quyền ghi (6.017ms)
✔ P1.3: PUT lỗi → dừng; cấp phép đã tiêu nên thử lại cần cấp phép MỚI, rồi điền tiếp đủ (90.6115ms)
✔ P1.4: thiếu / sai cửa hàng ở đường mở GR và đường /chi-tiet-so → dừng trước khi mở Nextwaves (858.2459ms)
✔ P1.5: PUT treo quá giờ ở tab 1 → kết quả không rõ + hạ nhiệt; tab 2 chỉ giành được sau đó và mỗi lô vẫn đúng một PUT (779.5853ms)
✔ P1.5: tab mất lease giữa chừng (tab khác tiếp quản) → không gửi PUT kế tiếp, không ghi đè trạng thái phiên (309.3986ms)
✔ P3: SO có 2 phiếu nhận ở cửa hàng → phiên khoá ghi; có cấp phép vẫn chỉ xem, claim bị từ chối, content không gỡ được khoá (109.3005ms)
✔ P2.1: tải lại trang Nextwaves sau khi đơn đã nhận nhưng phiên chưa thấy lượt 2xx → chỉ hiển thị, không về POS (124.3614ms)
✔ P2.1: lượt 2xx nhưng không có biên nhận mới so với lúc khớp đơn → không về POS (48.8067ms)
✔ Nextwaves trả 400 tagged_unit_unsupported (K1): báo lỗi trên tab Nextwaves, không về POS, không ghi (122.7537ms)
✔ Nhận thiếu 1 UID (keep_open): giữ ở Nextwaves, báo 11/12, không về POS (139.8349ms)
✔ Đường (2) /chi-tiet-so/SOBD1593858: tìm GR theo SO + cửa hàng → cùng luồng, quay về trang SO (22.6611ms)
✔ Chế độ STG trên trang POS production → không làm gì, không gọi host nào (164.5614ms)
✔ Chưa chọn môi trường / môi trường PRD → không làm gì trên POS staging (312.0661ms)
✔ Huỷ phiên trên POS → tải lại trang không tự mở Nextwaves; bấm 'Nhận bằng Nextwaves' → mở lại (147.191ms)
✔ Hai tab POS cùng GR03878, một cấp phép: bấm ở cả hai tab → chỉ một tab ghi, không nhân đôi mã (257.1773ms)
✔ Lượt 'Xác nhận nhận hàng' của phiếu gửi khác → bỏ qua, không về POS (140.8191ms)
✔ background: giành quyền ghi — chỉ từ trang POS; đúng một lần cho một cấp phép; chỉ từ received / apply_stopped; chỉ chủ lease gia hạn / kết thúc (46.373ms)
✔ P1.6 đường mở GR: tìm GR theo SO chưa đủ / không rõ / nhiều GR → phiên khoá ghi; có cấp phép vẫn 0 PUT (503.6941ms)
✔ P1.6 đường /chi-tiet-so: danh sách chưa đủ / không rõ → dừng, không mở Nextwaves; hai GR → chọn được nhưng phiên khoá ghi (451.9212ms)
✔ P1.7: Nextwaves có đơn cùng SO khác lần giao → khoá nw_many_orders; tab POS / Nextwaves không xoá được khoá, không đổi được đơn; claim bị từ chối, 0 PUT (80.2349ms)
✔ P1.7: session:nwMatched — chỉ từ trang Nextwaves, chỉ khi phiên chờ, kiểm refId cùng SO và khoá hợp lệ, chỉ một lần (20.9163ms)
ℹ tests 78
ℹ suites 0
ℹ pass 78
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5592.6729
```

## 5. Đột biến (dev tự chạy; PM chạy lại được)

```
python -I scripts/mutate-v0.1.2.py
```

- Script tự chép sang thư mục tạm, chạy bộ gốc trước, rồi từng ca. Khoảng 40 phút.
- 47 ca = 32 ca cũ + 15 ca mới cho P1.6 / P1.7. Hai ca cũ có điểm neo đã đổi nên được viết lại.
- **Lần chạy đầu trên `6eeb3c0`: 46/47.** Ca "P3 / P1.7 `session:update` ghi cả trường khác state" **sống sót**: test chỉ thử patch không kèm `state`.
  Đã thêm khẳng định (`5d117d2`): patch `{state: "done", nwWriteLocks: [], writeLocks, nwPoId, shipmentIds, scanOk}` → chỉ `state` đổi.
  Mã không cần sửa, vì `src/` đã chỉ ghi `{ state }`.
- **Lần chạy lại toàn bộ trên `5d117d2`** (kết quả dưới):

```
KILLED P1.1 chọn trên trang chưa đủ | ✖ total > số dòng đọc được (2 trang, đơn khớp có thể ở trang 2) → search
KILLED P1.1 bỏ qua ứng viên đọc lỗi | ✖ một GET ứng viên hết giờ / lỗi HTTP → chặn cả lượt dù đơn đúng vẫn đọc
KILLED P1.1 bỏ kiểm trường ứng viên | ✖ ứng viên thiếu trường (bên bán / kho / refId / status) → candidate_sch
KILLED P1.2 bỏ kiểm UID sai lô | ✖ P1.2: UID nằm sai lô (cùng sản phẩm) → uid_on_wrong_detail, không comp || ✖ P1.2: UID nằm ở dòng sản phẩm khác / ở hai lô / mã bị nối trùng → chặn
KILLED P1.2 bỏ kiểm lượng nhất quán | ✖ P1.2: received_quantity lệch với UID đang nằm trên lô (thiếu / thừa / 
KILLED P1.2 bỏ kiểm lượng không mã | ✖ P1.2: received_quantity lệch với UID đang nằm trên lô (thiếu / thừa / 
KILLED P1.2 bỏ kiểm UID nhiều lô | ✖ P1.2: UID nằm ở dòng sản phẩm khác / ở hai lô / mã bị nối trùng → chặn
KILLED P1.3 giành quyền không cần cấp phép | ✖ P1.3: cấp phép cho phiếu khác / đã hết hạn → 0 PUT; content script khô || ✖ background: giành quyền ghi — chỉ từ trang POS; đúng một lần cho một c
KILLED P1.3 cấp phép dùng nhiều lần | ✖ E2E STG GR03878: GR → Nextwaves ?po=SOBD1593858 → khớp PO28237814 → nh || ✖ P1.3: PUT lỗi → dừng; cấp phép đã tiêu nên thử lại cần cấp phép MỚI, r
KILLED P1.3 content tự cấp phép | ✖ P1.3: cấp phép cho phiếu khác / đã hết hạn → 0 PUT; content script khô
KILLED P1.3 PRD được ghi | ✖ P1.3: production chỉ đọc — không cấp phép được, phiên PRD không giành 
KILLED P1.3 hiện nút khi chưa cấp phép | ✖ E2E STG GR03878: GR → Nextwaves ?po=SOBD1593858 → khớp PO28237814 → nh || ✖ P1.3: PUT lỗi → dừng; cấp phép đã tiêu nên thử lại cần cấp phép MỚI, r
KILLED P1.4 bỏ bắt buộc x-store-id | ✖ P1.4: thiếu / sai cửa hàng ở đường mở GR và đường /chi-tiet-so → dừng 
KILLED P1.4 PO / GR thiếu cửa hàng vẫn qua | ✖ P1.4: cửa hàng phải có đủ x-store-id, GR.pos_info.id, PO.pos_id và trù
KILLED P1.4 GR thiếu pos_info vẫn qua | ✖ P1.4: thiếu / sai cửa hàng ở đường mở GR và đường /chi-tiet-so → dừng 
KILLED P1.5 gia hạn lease không kiểm chủ | ✖ P1.5: tab mất lease giữa chừng (tab khác tiếp quản) → không gửi PUT kế || ✖ background: giành quyền ghi — chỉ từ trang POS; đúng một lần cho một c
KILLED P1.5 bỏ kiểm lease trước PUT | ✖ P1.5: mất quyền ghi (lease) trước một PUT → dừng lease_lost, không gửi || ✖ P1.5: tab mất lease giữa chừng (tab khác tiếp quản) → không gửi PUT kế
KILLED P1.5 giành khi lease còn hạn | ✖ P1.5: PUT treo quá giờ ở tab 1 → kết quả không rõ + hạ nhiệt; tab 2 ch || ✖ background: giành quyền ghi — chỉ từ trang POS; đúng một lần cho một c
KILLED P1.5 không phải chủ vẫn kết thúc | ✖ P1.5: tab mất lease giữa chừng (tab khác tiếp quản) → không gửi PUT kế || ✖ background: giành quyền ghi — chỉ từ trang POS; đúng một lần cho một c
KILLED P1.5 bỏ hạ nhiệt sau kết quả không rõ | ✖ P1.5: PUT treo quá giờ ở tab 1 → kết quả không rõ + hạ nhiệt; tab 2 ch
KILLED P2.1 về POS khi chưa có lượt 2xx | ✖ P2.1: tải lại trang Nextwaves sau khi đơn đã nhận nhưng phiên chưa thấ
KILLED P2.1 bỏ kiểm biên nhận | ✖ P2.1: thiếu bằng chứng nhận → problems (phiếu gửi chưa ghi nhận EPC, b
KILLED P2.1 bỏ kiểm biên nhận mới | ✖ P2.1: lượt 2xx nhưng không có biên nhận mới so với lúc khớp đơn → khôn || ✖ P2.1: thiếu bằng chứng nhận → problems (phiếu gửi chưa ghi nhận EPC, b
KILLED P2.1 bỏ kiểm phiếu gửi đã nhận | ✖ P2.1: thiếu bằng chứng nhận → problems (phiếu gửi chưa ghi nhận EPC, b
KILLED P2.1 tải lại trang tự chuyển | ✖ E2E STG GR03878: GR → Nextwaves ?po=SOBD1593858 → khớp PO28237814 → nh || ✖ Hai tab POS cùng GR03878, một cấp phép: bấm ở cả hai tab → chỉ một tab
KILLED P2.2 QR thiếu trường vẫn dùng | ✖ P2.2: tra QR phải có productId số, lô, hạn DD-MM-YYYY (2.7677ms)
KILLED P2.2 thiếu kết quả tra QR | ✖ P2.2: thiếu kết quả tra QR / QR thiếu productId hoặc lô → chặn trước k
KILLED P2.3 bỏ so toàn phiếu | ✖ P2.3: phiếu đổi ở chi tiết KHÁC (quét tay giữa chừng) → dừng trước bướ
KILLED P3 bỏ khoá ghi | ✖ P1.6 đường mở GR: tìm GR theo SO chưa đủ / không rõ / nhiều GR → phiên || ✖ P1.7: Nextwaves có đơn cùng SO khác lần giao → khoá nw_many_orders; ta
KILLED P3 / P1.7 session:update ghi cả trường khác state | ✖ P1.7: session:nwMatched — chỉ từ trang Nextwaves, chỉ khi phiên chờ, k
KILLED P1.7 session:update không state ghi được khoá | ✖ P1.7: Nextwaves có đơn cùng SO khác lần giao → khoá nw_many_orders; ta || ✖ P3: SO có 2 phiếu nhận ở cửa hàng → phiên khoá ghi; có cấp phép vẫn ch
KILLED P3 bỏ khoá nhiều đơn Nextwaves | ✖ P1.7: Nextwaves có đơn cùng SO khác lần giao → khoá nw_many_orders; ta || ✖ loại rõ ràng: bên bán khác / kho khác / đơn huỷ; còn đơn cùng SO lệch 
KILLED P3 bỏ khoá SO nhiều GR | ✖ P1.6 đường /chi-tiet-so: danh sách chưa đủ / không rõ → dừng, không mở || ✖ P1.6 đường mở GR: tìm GR theo SO chưa đủ / không rõ / nhiều GR → phiên
KILLED P1.6 bỏ kiểm total GR theo SO | ✖ P1.6 đường /chi-tiet-so: danh sách chưa đủ / không rõ → dừng, không mở || ✖ P1.6 đường mở GR: tìm GR theo SO chưa đủ / không rõ / nhiều GR → phiên
KILLED P1.6 bỏ kiểm page / limit | ✖ P1.6 đường /chi-tiet-so: danh sách chưa đủ / không rõ → dừng, không mở || ✖ P1.6 đường mở GR: tìm GR theo SO chưa đủ / không rõ / nhiều GR → phiên
KILLED P1.6 dòng thiếu trường vẫn đếm | ✖ P1.6: danh sách GR theo SO phải đọc đủ (total / page / limit) và rõ từ
KILLED P1.6 dòng cửa hàng khác vẫn đếm | ✖ P1.6: danh sách GR theo SO phải đọc đủ (total / page / limit) và rõ từ
KILLED P1.6 phiên không mang khoá SO | ✖ P1.6 đường /chi-tiet-so: danh sách chưa đủ / không rõ → dừng, không mở || ✖ P1.6 đường mở GR: tìm GR theo SO chưa đủ / không rõ / nhiều GR → phiên
KILLED P1.6 đường /chi-tiet-so đi tiếp khi chưa đủ | ✖ P1.6 đường /chi-tiet-so: danh sách chưa đủ / không rõ → dừng, không mở
KILLED P1.7 khớp đơn nhiều lần | ✖ P1.7: Nextwaves có đơn cùng SO khác lần giao → khoá nw_many_orders; ta || ✖ P1.7: session:nwMatched — chỉ từ trang Nextwaves, chỉ khi phiên chờ, k
KILLED P1.7 khớp đơn từ trang bất kỳ | ✖ P1.7: Nextwaves có đơn cùng SO khác lần giao → khoá nw_many_orders; ta || ✖ P1.7: session:nwMatched — chỉ từ trang Nextwaves, chỉ khi phiên chờ, k
KILLED P1.7 nhận khoá lạ | ✖ P1.7: session:nwMatched — chỉ từ trang Nextwaves, chỉ khi phiên chờ, k
KILLED P1.7 nhận refId khác SO | ✖ P1.7: session:nwMatched — chỉ từ trang Nextwaves, chỉ khi phiên chờ, k
KILLED P1.7 giành quyền từ trang bất kỳ | ✖ background: giành quyền ghi — chỉ từ trang POS; đúng một lần cho một c
KILLED P1.7 tạo phiên từ trang bất kỳ | ✖ P1.7: session:nwMatched — chỉ từ trang Nextwaves, chỉ khi phiên chờ, k
KILLED P1.7 scanOk phiếu gửi lạ | ✖ P1.7: session:nwMatched — chỉ từ trang Nextwaves, chỉ khi phiên chờ, k
KILLED P1.7 received từ trang bất kỳ | ✖ P1.7: session:nwMatched — chỉ từ trang Nextwaves, chỉ khi phiên chờ, k
47/47 bị bắt (từ ca 1)
```

## 6. Kiểm gói và trình duyệt thật (dev tự báo)

- Tái lập: checkout sạch `6eeb3c0` → `scripts/pack.py` → cùng SHA-256 `525bce84…`. Bản cài khớp 17/17 file.
- Quét bí mật trên commit: 0. File DIFF: 0 chuỗi dạng token.
- Edge 156 headless (hồ sơ tạm, đã tắt sạch), nạp `C:\circa-gr-nextwaves-v0.1.2`:
  - service worker `0.1.2`; `STG.writeEnabled = true`, `PRD.writeEnabled = false`;
  - hook nạp trên `circa-stg.nextwaves.app`;
  - POS staging chưa đăng nhập chuyển sang SSO.

## 7. T1 và còn mở

- **T1 chỉ đọc** (operator). PM cho phép làm với v0.1.1; dev đề xuất dùng **v0.1.2** vì phần đọc giống hệt, chỉ thêm khoá đúng như PM yêu cầu:
  1. Gỡ / tắt bản cũ, Load unpacked `C:\circa-gr-nextwaves-v0.1.2`.
  2. Staging, **không cấp phép điền**, mở GR03878.
  3. Gửi ảnh khung hai tab.
  4. Gửi Copy response `inter-tenant-orders/receiving?…q=SOBD1593858` và `goods-receipt/search?query=so_thuocsi=1593858…` (giữ `total / page / limit`, bỏ token).
- K1, hợp đồng "đã nhận" inter-tenant, PUT W1: vẫn chưa có bằng chứng staging thật. Chưa merge mã ghi.
