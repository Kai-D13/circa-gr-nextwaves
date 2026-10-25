# v0.1.5 — sửa lỗi T1: content script không có `env` (env.js nạp trùng)

Người viết: dev-team, 25/10/2026. Nguồn: báo cáo T1 của operator (v0.1.4, staging, GR03878).
Nhánh **`batch/v0.1-staging`**, commit **`456205a`** (trên `49bf0a4`, bản PM đã audit). Chưa merge, chưa ghi POS thật.

## 1. Hiện tượng (operator báo)

Mở GR03878 trên POS staging (đã đăng nhập cửa hàng 2222, cấu hình Staging):
- Extension **không mở tab Nextwaves**.
- Khung hiện "GR ← Nextwaves · Lỗi extension — Cannot read properties of undefined (reading 'envFromConfig')".
- Trang lỗi extension chỉ vào dòng `if (m.type === "auth" && E.envById(…)`.

## 2. Nguyên nhân (đã tái hiện trên Edge thật)

- `src/manifest.json` khai `lib/env.js` ở **cả hai** mục `content_scripts` khớp cùng trang: mục MAIN world (hook) và mục ISOLATED world (logic).
- **Chrome / Edge chỉ nạp một file một lần cho mỗi trang**, vào mục đứng trước (MAIN). ISOLATED world vì thế không có `__CGN__.env` → `E` undefined → mọi lần đánh giá trang đều ném lỗi.
- Đo trên Edge 156, v0.1.4, trang Nextwaves staging:

  ```
  MAIN world:     __CGN__ = ["env"]
  ISOLATED world: __CGN__ = ["keys","nw","match","resolve","ui"]   ← thiếu env
  ```

- **Có từ v0.1.0, mọi bản đều dính** (cả v0.1.2 và v0.1.4 mà PM cho phép làm T1).
- **Vì sao không lộ sớm:**
  - Trình duyệt giả (`tests/browser-sim.js`) nạp danh sách ISOLATED của manifest một cách độc lập, không mô phỏng việc trình duyệt bỏ file trùng.
  - Các lần kiểm Edge trước chỉ đọc MAIN world và service worker. Trang POS staging chưa đăng nhập chuyển sang SSO nên content script POS không chạy.
  - Đây là sơ suất của dev.

## 3. Sửa

1. `src/main/env.js`: **bản sao y hệt** `src/lib/env.js`, dùng cho mục MAIN world. Manifest MAIN dùng `main/env.js`, ISOLATED dùng `lib/env.js`. Mã logic không đổi.
2. Ghi chú ở đầu `lib/env.js` (và bản sao) giải thích lý do. `tests/manifest.test.js` bắt hai file phải **giống từng byte**.
3. **Test mới `tests/manifest.test.js`:**
   - không file nào nằm ở hai mục cùng khớp một trang;
   - từng origin: MAIN = `main/env.js` + hook, ISOLATED bắt đầu bằng `lib/env.js` và kết thúc bằng content script;
   - mọi file tồn tại;
   - `main/env.js` == `lib/env.js`.
4. **Trình duyệt giả nạp như Chrome:** duyệt các mục khớp trang theo thứ tự manifest, một file chỉ một lần mỗi trang.
   Kiểm lại: dùng manifest kiểu cũ → **27/28 test runtime hỏng**. `hooks.test.js` nạp đúng danh sách MAIN của manifest.
5. **`scripts/edge-check.js`: kiểm trên trình duyệt thật** (Edge / Chrome headless, hồ sơ tạm, không đăng nhập, không gọi server POS thật). Gồm:
   - service worker;
   - hai world trên trang Nextwaves staging thật;
   - đường POS GR03878: CDP Fetch trả dữ liệu mẫu `samples/`, gửi tin "auth" như hook, rồi kiểm lời gọi GR / PO / tìm GR theo SO, khung hiển thị, phiên, tab Nextwaves mở ra, storage không có token.

   PM chạy được bằng `node` (không cần Python):

   ```
   node scripts/edge-check.js C:\circa-gr-nextwaves-v0.1.5
   ```

## 4. Gói

| | |
|---|---|
| Phiên bản | `0.1.5` |
| Gói | `dist/circa-gr-nextwaves-v0.1.5.zip`, **18 file** (thêm `main/env.js`) |
| SHA-256 | `cdd02c3d1461b946d2946957b7d3fc03e9ccf2f385c83b85c027ad4a44b40e3b` — **mã gói `CDD02C3D`** |
| Bản cài | `C:\circa-gr-nextwaves-v0.1.5`, khớp 18/18 file với `src/` của `456205a`; dựng lại từ checkout sạch ra cùng SHA-256 |

**DIFF:** `git diff 49bf0a4 456205a -- src tests package.json scripts`
- Thống kê: 10 file, +464 / −14.
- Phần runtime chỉ gồm: `src/manifest.json` (2 dòng `js` + version), `src/main/env.js` (mới, bản sao), ghi chú đầu `src/lib/env.js`.
- Bản xuất sẵn: `dist/circa-gr-nextwaves-v0.1.5-vs-49bf0a4.diff` (623 dòng), không vào git.

## 5. Bằng chứng (dev tự báo)

**Edge 156 thật, `scripts/edge-check.js`.** Trước / sau:

```
v0.1.5 (C:\circa-gr-nextwaves-v0.1.5)
ĐẠT   service worker nạp được  — version 0.1.5 (manifest 0.1.5)
ĐẠT   Nextwaves · MAIN world có env + hook  — {"env":true,"hook":true}
ĐẠT   Nextwaves · ISOLATED world có env, nw, match, resolve, ui  — ["env","keys","nw","match","resolve","ui"]
ĐẠT   POS · ISOLATED world có env, pos, plan, apply, ui  — ["env","keys","pos","plan","apply","ui"]
ĐẠT   POS · đọc GR, PO, tìm GR theo SO kèm header + cửa hàng  — 4 lời gọi API
ĐẠT   POS · khung hiện 'Chờ nhận hàng trên Nextwaves' + mã giao  — | GR ← Nextwaves · Chờ nhận hàng trên Nextwaves | – | Phiếu GR03878 · PO00006750 · mã giao SOBD1593858-F | Nextwaves: tìm theo SOBD1593858 | Trên tab Nextwaves:
ĐẠT   Phiên STG GR03878 tạo ra (waiting_nw, schema, không khoá)  — {"state":"waiting_nw","schema":1,"writeLocks":[],"createdBy":"0.1.5"}
ĐẠT   Extension mở tab Nextwaves /vi/purchases/receive?po=SOBD1593858  — ["https://circa-stg.nextwaves.app/vi/login?next=%2Fvi%2Fpurchases%2Freceive%3Fpo%3DSOBD1593858"]
ĐẠT   Storage không chứa token
TẤT CẢ ĐẠT (9)

v0.1.4 (C:\circa-gr-nextwaves-v0.1.4) — tái hiện đúng lỗi operator báo
ĐẠT   service worker nạp được  — version 0.1.4 (manifest 0.1.4)
ĐẠT   Nextwaves · MAIN world có env + hook  — {"env":true,"hook":true}
HỎNG  Nextwaves · ISOLATED world có env, nw, match, resolve, ui  — ["keys","nw","match","resolve","ui"]
HỎNG  POS · ISOLATED world có env, pos, plan, apply, ui  — ["keys","pos","plan","apply","ui"]
HỎNG  POS · đọc GR, PO, tìm GR theo SO kèm header + cửa hàng  — 0 lời gọi API
HỎNG  POS · khung hiện 'Chờ nhận hàng trên Nextwaves' + mã giao  — | GR ← Nextwaves · Lỗi extension | – | Cannot read properties of undefined (reading 'envFromConfig') | Thử lại |
HỎNG  Phiên STG GR03878 tạo ra (waiting_nw, schema, không khoá)  — không có phiên
HỎNG  Extension mở tab Nextwaves /vi/purchases/receive?po=SOBD1593858  — []
ĐẠT   Storage không chứa token
CÓ MỤC HỎNG (6/9)
```

**Nâng cấp giữ cùng extension ID** (`scratchpad/cdp-upgrade.js`, như bằng chứng P2.4): 0.1.2 → 0.1.5, cùng ID `gkcgannk…`, phiên + cấp phép cũ bị xoá, `lastUpgrade.to = 0.1.5`.

**`npm test` tại `456205a`: 85/85** (thêm 3 test manifest); chạy liên tiếp 5 lần đều xanh.

```
✔ chế độ STG / PRD / URL → đúng môi trường; URL lạ hoặc http → null (1.9576ms)
✔ nhận dạng trang POS: GR, chi-tiet-so; sai origin hoặc trang khác → null (2.6709ms)
✔ đường dẫn API đúng từng môi trường (staging /backend/v1, production api.v2/v1) (1.134ms)
✔ phạm vi cửa hàng: STG chỉ 2222; PRD theo phiên; bảng kho (0.3063ms)
✔ nhận dạng lời gọi xác nhận nhận hàng Nextwaves và hoàn tất GR POS (0.9227ms)
✔ khoá SO: mã giao POS và refId Nextwaves cùng gốc; định dạng lạ → rỗng (0.462ms)
✔ khoá lô: batch Nextwaves và tra QR POS ra cùng lot_date POS (0.6245ms)
✔ pos-hook: báo header của API POS (chỉ các header cần), không trùng; chào lại → gửi lại (6.3086ms)
✔ pos-hook: PUT …/status/COMPLETED (XHR và fetch) → báo gr-status kèm HTTP status (8.5893ms)
✔ nw-hook: Authorization của API Nextwaves; POST receive-scan (XHR) → status, response, số EPC gửi (2.7697ms)
✔ nw-hook: receive-scan qua fetch; API tích hợp / host lạ không báo (3.1517ms)
✔ tra QR POS: đúng UID → sản phẩm / lô / hạn; không có / nhiều bản ghi khác nhau → không đoán (1.1027ms)
✔ không file nào nằm ở hai mục content_scripts cùng khớp một trang (trình duyệt chỉ nạp một lần) (2.2163ms)
✔ mỗi trang: MAIN world có env + hook, ISOLATED world có env + thư viện + content script; mọi file tồn tại (2.4868ms)
✔ src/main/env.js là bản sao y hệt src/lib/env.js (0.6514ms)
✔ GR03878: đọc dòng, đơn vị dòng và hệ số đơn vị (2.0701ms)
✔ GR03878 ↔ PO00006750: mã giao SOBD1593858-F, liên kết hai chiều đạt (4.4304ms)
✔ P1.4: cửa hàng phải có đủ x-store-id, GR.pos_info.id, PO.pos_id và trùng nhau (5.1793ms)
✔ GR03877 tạo tay (PO IMPORT_STOCK, không mã giao) → dừng no_delivery_code (0.7816ms)
✔ GR không nằm trong PO / PO khác / nhiều mã giao → chặn (2.3155ms)
✔ tìm GR theo SO (đường /chi-tiet-so) → GR03878 (0.7734ms)
✔ P1.6: danh sách GR theo SO phải đọc đủ (total / page / limit) và rõ từng dòng, không lọc rồi đếm (10.0596ms)
✔ Nextwaves: tìm receiving theo SO, đọc đơn liên kết và kiểm SO / đối tác / kho (0.9753ms)
✔ Nextwaves: /receiving thật (PO76458756, PO60017570) và dòng giao có lô (PO28237814) (1.0769ms)
✔ PO Nextwaves sau khi nhận (mẫu thật PO88508353): 25 receivedUnits, biên nhận chứa đúng EPC (0.6694ms)
✔ dấu vân tay: GR03878 khớp PO28237814 (dựng lại) nhưng KHÔNG khớp PO76458756 / PO60017570 (thật) (1.19ms)
✔ dựng UID đã nhận: đơn vị và lô theo dòng giao, không thiếu / không lạ, có bằng chứng biên nhận (1.4657ms)
✔ dựng UID đã nhận: nhận thiếu → missing; EPC lạ → unexpected (0.949ms)
✔ P2.1: thiếu bằng chứng nhận → problems (phiếu gửi chưa ghi nhận EPC, biên nhận thiếu / lạ / sai kho, không có biên nhận mới) (3.9841ms)
✔ P2.2: tra QR phải có productId số, lô, hạn DD-MM-YYYY (0.6405ms)
✔ GR03878: 12 UID → 6 lần ghi, mỗi lô +1 đơn vị dòng (3 vỉ = 1 hộp, 2 túi = 1 hộp, 1 chai) (23.4379ms)
✔ một chặn bất kỳ → không ghi gì (cả gói) (3.4221ms)
✔ lô Nextwaves ≠ lô tra QR → lot_conflict; lô không có trên GR → lot_not_on_gr (3.5168ms)
✔ quy đổi lẻ → fraction; vượt số lượng lô → over; đơn vị lạ → unit_unknown (8.5194ms)
✔ sản phẩm lạ / tra QR ra sản phẩm khác → chặn; không có UID nào → nothing_to_write (1.7101ms)
✔ P2.2: thiếu kết quả tra QR / QR thiếu productId hoặc lô → chặn trước khi ghi (1.6267ms)
✔ P1.2: UID đã nằm ĐÚNG lô, lượng nhất quán → bỏ qua; đủ 12 → complete, không bước nào (1.8507ms)
✔ P1.2: UID nằm sai lô (cùng sản phẩm) → uid_on_wrong_detail, không complete (tái hiện PM) (1.2892ms)
✔ P1.2: UID nằm ở dòng sản phẩm khác / ở hai lô / mã bị nối trùng → chặn (1.4463ms)
✔ P1.2: received_quantity lệch với UID đang nằm trên lô (thiếu / thừa / có lượng mà không mã) → received_mismatch (1.9141ms)
✔ UID đã có trên GR nhưng không thuộc kết quả Nextwaves → gr_has_foreign_codes (1.6819ms)
✔ W1: 6 PUT tuần tự, body đúng (received tuyệt đối, lot_id, UID của lô), đọc lại xác nhận (3.0329ms)
✔ W1: chạy lại sau khi đã ghi đủ → không PUT thêm (already) (2.1306ms)
✔ W1: chi tiết của bước bị đổi trước khi ghi → dừng gr_changed đúng ở bước đó, không PUT bước đó (1.6658ms)
✔ P2.3: phiếu đổi ở chi tiết KHÁC (quét tay giữa chừng) → dừng trước bước kế, không ghi tiếp (1.5577ms)
✔ P1.5: mất quyền ghi (lease) trước một PUT → dừng lease_lost, không gửi tiếp (2.7243ms)
✔ W1: PUT lỗi ở bước 3 → dừng put_failed sau 3 lời gọi; chạy lại bỏ qua 2 bước đã xong (2.2154ms)
✔ W1: lỗi mạng → unknown; server không lưu mã → verify_failed (1.3142ms)
✔ W1: kế hoạch có chặn → không chạy; GR đã hoàn tất → dừng (2.2218ms)
✔ 1 ứng viên hợp lệ → chọn PO28237814, không khoá ghi (5.7805ms)
✔ 12 ứng viên (11 đơn SO khác + đơn đúng) → đọc hết cả 12, chọn đúng (6.4004ms)
✔ total > số dòng đọc được (2 trang, đơn khớp có thể ở trang 2) → search_incomplete, không chọn (15.8581ms)
✔ kết quả tìm thiếu total / items, hoặc lỗi HTTP → chặn (1.3017ms)
✔ một GET ứng viên hết giờ / lỗi HTTP → chặn cả lượt dù đơn đúng vẫn đọc được (2.3999ms)
✔ ứng viên thiếu trường (bên bán / kho / refId / status) → candidate_schema (0.9026ms)
✔ 0 / n ứng viên khớp: lệch số lượng → no_match; hai đơn cùng khớp → ambiguous (1.1642ms)
✔ loại rõ ràng: bên bán khác / kho khác / đơn huỷ; còn đơn cùng SO lệch số lượng → chọn được nhưng khoá ghi (2.2101ms)
✔ E2E STG GR03878: GR → Nextwaves ?po=SOBD1593858 → khớp PO28237814 → nhận → kế hoạch chỉ xem → cấp phép 1 lần → điền 6 lô / 12 UID → HOÀN THÀNH (261.515ms)
✔ P1.3: cấu hình cũ writeMode=auto (v0.1.0) sau nâng cấp → không tự PUT; config không còn writeMode (171.2776ms)
✔ P1.3: cấp phép cho phiếu khác / đã hết hạn → 0 PUT; content script không tự cấp phép được (263.7412ms)
✔ P1.3: production chỉ đọc — không cấp phép được, phiên PRD không giành được quyền ghi (5.6336ms)
✔ P1.3: PUT lỗi → dừng; cấp phép đã tiêu nên thử lại cần cấp phép MỚI, rồi điền tiếp đủ (106.9248ms)
✔ P1.4: thiếu / sai cửa hàng ở đường mở GR và đường /chi-tiet-so → dừng trước khi mở Nextwaves (835.2502ms)
✔ P1.5: PUT treo quá giờ ở tab 1 → kết quả không rõ + hạ nhiệt; tab 2 chỉ giành được sau đó và mỗi lô vẫn đúng một PUT (765.1012ms)
✔ P1.5: tab mất lease giữa chừng (tab khác tiếp quản) → không gửi PUT kế tiếp, không ghi đè trạng thái phiên (314.3593ms)
✔ P3: SO có 2 phiếu nhận ở cửa hàng → phiên khoá ghi; có cấp phép vẫn chỉ xem, claim bị từ chối, content không gỡ được khoá (124.5592ms)
✔ P2.1: tải lại trang Nextwaves sau khi đơn đã nhận nhưng phiên chưa thấy lượt 2xx → chỉ hiển thị, không về POS (125.077ms)
✔ P2.1: lượt 2xx nhưng không có biên nhận mới so với lúc khớp đơn → không về POS (92.2015ms)
✔ Nextwaves trả 400 tagged_unit_unsupported (K1): báo lỗi trên tab Nextwaves, không về POS, không ghi (157.6785ms)
✔ Nhận thiếu 1 UID (keep_open): giữ ở Nextwaves, báo 11/12, không về POS (169.8358ms)
✔ Đường (2) /chi-tiet-so/SOBD1593858: tìm GR theo SO + cửa hàng → cùng luồng, quay về trang SO (45.6743ms)
✔ Chế độ STG trên trang POS production → không làm gì, không gọi host nào (171.0359ms)
✔ Chưa chọn môi trường / môi trường PRD → không làm gì trên POS staging (327.9065ms)
✔ Huỷ phiên trên POS → tải lại trang không tự mở Nextwaves; bấm 'Nhận bằng Nextwaves' → mở lại (132.1044ms)
✔ Hai tab POS cùng GR03878, một cấp phép: bấm ở cả hai tab → chỉ một tab ghi, không nhân đôi mã (319.2175ms)
✔ Lượt 'Xác nhận nhận hàng' của phiếu gửi khác → bỏ qua, không về POS (138.6115ms)
✔ background: giành quyền ghi — chỉ từ trang POS; đúng một lần cho một cấp phép; chỉ từ received / apply_stopped; chỉ chủ lease gia hạn / kết thúc (58.3854ms)
✔ P1.6 đường mở GR: tìm GR theo SO chưa đủ / không rõ / nhiều GR → phiên khoá ghi; có cấp phép vẫn 0 PUT (564.347ms)
✔ P1.6 đường /chi-tiet-so: danh sách chưa đủ / không rõ → dừng, không mở Nextwaves; hai GR → chọn được nhưng phiên khoá ghi (465.6169ms)
✔ P1.7: Nextwaves có đơn cùng SO khác lần giao → khoá nw_many_orders; tab POS / Nextwaves không xoá được khoá, không đổi được đơn; claim bị từ chối, 0 PUT (107.0495ms)
✔ P1.7: session:nwMatched — chỉ từ trang Nextwaves, chỉ khi phiên chờ, kiểm refId cùng SO và khoá hợp lệ, chỉ một lần (26.9114ms)
✔ P2.4: phiên bản cũ (không schema, thiếu khoá) không được ghi / tìm lại / nhận lượt; mở lại phiếu → phiên mới kiểm lại khoá (175.0568ms)
✔ P2.4: trang Nextwaves không nhận phiên bản cũ (không tìm, không khớp đơn, không gọi API) (251.1096ms)
✔ P2.4: onInstalled (update, cùng extension ID) xoá phiên + cấp phép của bản cũ, giữ của bản hiện hành, ghi lastUpgrade (186.4271ms)
✔ Chống vòng lặp tạo phiên: background không trả lại phiên vừa tạo → POS tạo phiên đúng một lần rồi báo lỗi, không gọi API lặp (359.2944ms)
ℹ tests 85
ℹ suites 0
ℹ pass 85
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6869.1904
```

**Đột biến** (`python -I scripts/mutate-v0.1.5.py`, 60 ca = 58 cũ + 2 ca manifest "hook dùng chung lib/env.js"; đột biến trên `env.js` áp lên cả hai bản):

```
(đang chạy trên 456205a — kết quả sẽ bổ sung vào file này)
```

## 6. Ảnh hưởng tới T1

- v0.1.2 và v0.1.4 đều **không chạy được** T1 vì lỗi này.
- **T1 làm với v0.1.5** (`C:\circa-gr-nextwaves-v0.1.5`), theo `docs/dev/T1-STG-HUONG-DAN.md` (đã cập nhật).
- v0.1.5 chỉ đổi manifest + bản sao `env.js`. Logic đọc / ghi, khoá, cấp phép **không đổi** so với v0.1.4 mà PM đã audit.
- Vẫn không cấp phép điền, không ghi POS; K1 / W1 không đổi.
