# v0.1.4 — dev xử lý P2.4 (phiên của bản cũ khi nâng cấp giữ cùng extension ID) + chống vòng lặp tạo phiên

Người viết: dev-team, 25/10/2026. Trả lời `docs/pm/AUDIT-v0.1.2-STG-20261024.md` §P2.4.
Nhánh **`batch/v0.1-staging`**, trên `5d117d2` (bản PM vừa audit). Chưa merge, chưa ghi POS thật.

| Commit | Nội dung |
|---|---|
| `761d734` | P2.4: schema phiên / cấp phép, dọn khi nâng cấp, test. Gói dựng ra là v0.1.3 `DF493307`: **chỉ dựng nội bộ, chưa giao**, bị thay ngay vì mục §2 |
| **`91e3bd1`** | Chống vòng lặp tạo phiên trên POS (phát hiện khi chạy đột biến v0.1.3); trình duyệt giả không thể treo vì vòng lặp microtask. **Gói v0.1.4 dựng từ commit này** |
| `d9fbdb2` | Chỉ sửa bộ test (§2b): trang đã rời đi không vẽ được; giới hạn 60 s mỗi test. `src/` giống hệt `91e3bd1` |
| `6435082` | Chỉ sửa bộ test (§2b): đóng mọi trình duyệt giả sau mỗi test (`afterEach`). `src/` giống hệt `91e3bd1` |
| `49bf0a4` | Chỉ sửa bộ test (§2b): trình duyệt giả đã đóng không mở tab / tạo timer / chuyển message. `src/` giống hệt `91e3bd1` |

**T1 không đổi:** PM cho chạy T1 bằng v0.1.2 (`525BCE84`), cứ làm như vậy. P2.4 chỉ ảnh hưởng khi **nâng cấp giữ cùng extension ID**. Nạp một bản từ thư mục **mới** là extension ID mới với storage trống.

| | |
|---|---|
| Phiên bản | `0.1.4` |
| Gói | `dist/circa-gr-nextwaves-v0.1.4.zip`, 17 file |
| SHA-256 | `10a29bc4a1f746cd7d048a49601c4cbf9b0abe4ee36a8558dd14f448e531abfa` — **mã gói `10A29BC4`** |
| Bản cài | `C:\circa-gr-nextwaves-v0.1.4`, khớp 17/17 file với `src/` của `91e3bd1`; dựng lại từ checkout sạch ra cùng SHA-256 |
| Gói cũ | `FF5CD95B`, `D8CD9AFD`, `525BCE84`, `DF493307` (nội bộ) giữ nguyên hash |

**DIFF cần audit:** `git diff 5d117d2 49bf0a4 -- src tests package.json scripts`
- Thống kê: 8 file, +259 / −25.
- Bản xuất sẵn: `dist/circa-gr-nextwaves-v0.1.4-vs-5d117d2.diff` (612 dòng), không vào git.

## 1. Sửa P2.4 (`src/background.js`)

1. `SESSION_SCHEMA = 1`. Phiên và cấp phép tạo từ bản này mang `schema`; phiên mang thêm `createdBy` = version manifest.
   Không có hoặc khác `schema` nghĩa là **của bản cũ**, có thể thiếu khoá P1.6 / P1.7.
2. Phiên của bản cũ:
   - **không bao giờ được ghi**: `writeBlockers` đặt `session_outdated` lên đầu, nên `claimApply` từ chối;
   - không được tìm lại: `session:get` trả `null`, `findByNw` bỏ qua. Trang POS coi như chưa có phiên; trang Nextwaves không hiện khung, không gọi API;
   - `session:nwMatched`, `scanOk`, `received` từ chối ("Phiên của bản cũ");
   - mở lại phiếu → `session:start` **thay** phiên cũ đang hoạt động bằng phiên mới. Phiên mới tính lại khoá P1.6 và ghi log `replaced_outdated`.
3. Cấp phép không có `schema` bị bỏ khi đọc. Cấp phép mới mang `schema`.
4. `chrome.runtime.onInstalled` (lý do `update` / `install`) → xoá mọi phiên và cấp phép của bản cũ, ghi `lastUpgrade {at, reason, from, to, removedSessions, removedGrants}`. Lý do khác (ví dụ `chrome_update`) không đụng storage.
5. Popup ghi chú phiên của bản cũ; khung POS có câu cho `session_outdated`.

Hai lớp độc lập: (a) dọn khi nâng cấp, (b) kiểm schema ở mọi đường ghi / tìm. Nếu (a) không chạy, (b) vẫn chặn ghi.

## 2. Phát hiện thêm khi chạy đột biến: vòng lặp tạo phiên (`src/pos/pos-content.js`)

- Lần chạy đột biến trên `761d734` cho kết quả 57/57, nhưng ca "P2.4 mở lại phiếu giữ phiên bản cũ" chỉ bị bắt vì **bộ test treo hết giờ**.
- Nguyên nhân: nếu `session:start` trả về một phiên mà `session:get` không trả lại, trang POS tạo phiên lại liên tục. Mỗi vòng đọc GR, đọc PO và tìm GR theo SO, tức là **dội API POS**.
- Mã hiện tại không rơi vào ca này vì hai đường đều dùng cùng một phép kiểm schema. Tuy vậy đó là lỗ hổng tiềm ẩn nếu có lỗi khác.
- **Sửa:**
  - Trong cùng tab, vừa tạo phiên cho phiếu này (≤ 10 s) mà vẫn không đọc lại được phiên → báo lỗi "không đọc lại được phiên vừa tạo", **không tạo lại**.
  - Nút "Thử lại" do người dùng bấm mới bỏ chốt.
  - Đường bấm "Nhận bằng Nextwaves" không bị ảnh hưởng.
- **Trình duyệt giả:**
  - `fetch` và message tới background giờ trả về ở lượt sự kiện sau (macrotask), như mạng / IPC thật. Một vòng lặp lỗi làm test **hỏng gọn** thay vì bỏ đói timer và treo tiến trình.
  - Thêm `interceptBg` để mô phỏng background lỗi.
- **Test:** "Chống vòng lặp tạo phiên: background không trả lại phiên vừa tạo → POS tạo phiên đúng một lần rồi báo lỗi, không gọi API lặp".
  `session:get` luôn trả rỗng → đọc PO 2 lần, tìm GR theo SO 1 lần, mở Nextwaves 1 lần, rồi dừng.
- Kiểm lại: bỏ chốt chặn → test này hỏng sau 11 s; ca "mở lại phiếu giữ phiên bản cũ" → test P2.4 hỏng sau 11 s. Không còn treo.

## 2b. Sửa bộ test: một test có thể treo cả file (`d9fbdb2`, `6435082`, `49bf0a4`; không đổi `src/`)

- **Hiện tượng.**
  - Lần chạy đột biến đầu trên `91e3bd1` báo 58/58, nhưng **6 ca chỉ "bị bắt" vì hết giờ 240 s**.
  - Chạy bộ test thật nhiều lần thì cũng **treo 1/6 lần** khi máy bận (file runtime dừng ở 70/82).
  - ⇒ Kết quả lần đó **không dùng làm bằng chứng**; đã chạy lại (§6).
- **Nguyên nhân (lỗi của trình duyệt giả, không phải extension).**
  1. Khi tab POS giả được tải lại, ngữ cảnh trang cũ đã "chết" nhưng lời gọi đang dở của nó vẫn trả về và vẫn vẽ được khung.
  2. Khung đó có nút "Nhận bằng Nextwaves" gắn vào trang cũ, đè lên khung của trang mới.
  3. Test bấm nhầm nút đó → nút chờ một message không bao giờ trả lời → test chờ mãi.

  Trình duyệt thật không cho trang đã rời đi vẽ lên trang mới.
- **Sửa.**
  - Ngữ cảnh đã chết thì không vẽ khung, và `fetch` của nó không trả về (như điều hướng thật).
  - Ca "Lượt xác nhận của phiếu gửi khác" chờ theo nhật ký hành vi (`receive_scan_other_shipment`) thay vì tiêu đề khung. Lý do: lần đọc lại đang chạy có thể vẽ đè khung "đang có N UID đã nhận", hành vi đó đúng.
  - `npm test` và script đột biến chạy với `--test-timeout=60000`: nếu còn treo thì lộ đúng tên test, không treo cả file.
  - **`afterEach` đóng mọi trình duyệt giả** (`6435082`).
    - Lý do: test bị `--test-timeout` cắt thì `finally { b.close() }` không chạy, timer của trình duyệt giả giữ tiến trình nên file vẫn không kết thúc.
    - Lần chạy đột biến thứ hai (`d9fbdb2`) vẫn có 1 ca quá 240 s vì điều này. Lần đó dev chạy thêm stress đè lên, máy quá tải; kết quả **không tính**.
    - Đã thử: một test cố ý treo, có trình duyệt giả đang mở → bị cắt sau 3 s, file thoát.
  - **Trình duyệt giả đã đóng thì "chết hẳn"** (`49bf0a4`).
    - Lần chạy đột biến thứ ba (`6435082`, chạy một mình) vẫn có ca "P1.3 cấp phép dùng nhiều lần" quá 240 s.
    - Tái hiện: ca đó treo **2/5 lần** sau khi mọi test đã xong. Không còn timer nào, chỉ còn socket stdio.
    - Nguyên nhân: một message background còn dở lúc test kết thúc (tạo phiên, đưa về POS) **mở tab mới sau `close()`**. Tab mới có timer mới mà không ai dọn.
    - Sửa: `close()` đặt cờ `closed` → không nạp trang, không tạo timer, không chuyển message hay sự kiện storage.
    - Sau sửa: ca đó 10/10 lần hỏng gọn sau khoảng 10 s; bộ test thật 18/18 lượt (3 song song × 6 vòng) đạt 82/82.
- **Kiểm dưới tải.**
  - 18 lượt (6 vòng × 3 bộ song song) và 16 lượt chạy cùng lúc với bộ đột biến: **34/34 lượt đều 82/82**, mỗi lượt khoảng 6–7 s, không treo.
  - Hai ca từng treo (bỏ chốt chặn; giữ phiên cũ khi mở lại phiếu) giờ hỏng gọn sau khoảng 11 s.

## 3. Test gate P2.4 (`tests/runtime.test.js`, trình duyệt giả có `onInstalled` + `getManifest`)

- "P2.4: phiên bản cũ (không schema, thiếu khoá) không được ghi / tìm lại / nhận lượt; mở lại phiếu → phiên mới kiểm lại khoá":
  - phiên `received` của bản cũ có `writeLocks: []` + cấp phép kiểu cũ;
  - claim → `session_outdated`; `grant:get` / `session:get` / `findByNw` → `null`; `received` → từ chối;
  - tải lại phiếu, khi danh sách GR theo SO trả `total=2` → phiên mới `schema 1`, `createdBy 0.1.4`, `writeLocks ["so_gr_unknown"]`, có log `replaced_outdated`;
  - 0 PUT.
  - Phiên mới ở `waiting_nw` hoặc `nw_ready` đều đúng: tab Nextwaves cũ đã có header có thể tự khớp đơn ngay. Bản nháp đầu đòi `waiting_nw` nên chập chờn 2/10 lần.
- "P2.4: trang Nextwaves không nhận phiên bản cũ (không tìm, không khớp đơn, không gọi API)".
- "P2.4: onInstalled (update, cùng extension ID) xoá phiên + cấp phép của bản cũ, giữ của bản hiện hành, ghi lastUpgrade" (kèm ca `chrome_update` không đụng storage).

## 4. Trình duyệt thật (dev tự báo, Edge 156 headless, hồ sơ tạm, đã tắt sạch)

**Nâng cấp giữ cùng extension ID:**
1. Nạp v0.1.2 từ một thư mục tạm.
2. Ghi vào storage một phiên `received` kiểu cũ (`writeLocks: []`) và một cấp phép kiểu cũ.
3. Chép đè v0.1.4 vào **cùng thư mục**, gọi `chrome.runtime.reload()`.

Kết quả nguyên văn:

```
1) nạp: 0.1.2 id gkcgannkomjbijnfickecechcidphplk
2) storage trước nâng cấp: {"sessions":["STG:2de6c0ec-2ea8-4038-8616-659fa3f5820a"],"grants":["STG:GR03878"]}
3) sau reload: 0.1.4 id gkcgannkomjbijnfickecechcidphplk (CÙNG ID)
4) storage sau nâng cấp: {"sessions":{},"grants":{},"lastUpgrade":{"at":"2026-10-24T17:43:19.386Z","from":"0.1.2","reason":"update","removedGrants":1,"removedSessions":[{"key":"STG:2de6c0ec-2ea8-4038-8616-659fa3f5820a","state":"received"}],"to":"0.1.4"}}
```

**Cài mới v0.1.4 từ `C:\circa-gr-nextwaves-v0.1.4`:**
- service worker `0.1.4`; `STG.writeEnabled = true`, `PRD.writeEnabled = false`;
- `lastUpgrade` lý do `install`;
- hook nạp trên `circa-stg.nextwaves.app`;
- POS staging chưa đăng nhập chuyển sang SSO.

## 5. Kết quả test nguyên văn

`npm test` tại `49bf0a4`: **82/82** (thêm 4 so với v0.1.2). Dưới tải: 18 lượt song song tại `49bf0a4` (cộng 34 lượt tại `d9fbdb2`) đều 82/82 (dev tự báo).
Phân bố: `env-keys` 7, `hooks` 5, `models` 15, `plan-apply` 19, `resolve` 8, `runtime` 28.

```
✔ chế độ STG / PRD / URL → đúng môi trường; URL lạ hoặc http → null (1.3708ms)
✔ nhận dạng trang POS: GR, chi-tiet-so; sai origin hoặc trang khác → null (1.2108ms)
✔ đường dẫn API đúng từng môi trường (staging /backend/v1, production api.v2/v1) (1.0056ms)
✔ phạm vi cửa hàng: STG chỉ 2222; PRD theo phiên; bảng kho (0.3348ms)
✔ nhận dạng lời gọi xác nhận nhận hàng Nextwaves và hoàn tất GR POS (0.7103ms)
✔ khoá SO: mã giao POS và refId Nextwaves cùng gốc; định dạng lạ → rỗng (0.4184ms)
✔ khoá lô: batch Nextwaves và tra QR POS ra cùng lot_date POS (0.6374ms)
✔ pos-hook: báo header của API POS (chỉ các header cần), không trùng; chào lại → gửi lại (4.8136ms)
✔ pos-hook: PUT …/status/COMPLETED (XHR và fetch) → báo gr-status kèm HTTP status (6.1579ms)
✔ nw-hook: Authorization của API Nextwaves; POST receive-scan (XHR) → status, response, số EPC gửi (2.691ms)
✔ nw-hook: receive-scan qua fetch; API tích hợp / host lạ không báo (2.5646ms)
✔ tra QR POS: đúng UID → sản phẩm / lô / hạn; không có / nhiều bản ghi khác nhau → không đoán (0.7309ms)
✔ GR03878: đọc dòng, đơn vị dòng và hệ số đơn vị (1.8527ms)
✔ GR03878 ↔ PO00006750: mã giao SOBD1593858-F, liên kết hai chiều đạt (3.6485ms)
✔ P1.4: cửa hàng phải có đủ x-store-id, GR.pos_info.id, PO.pos_id và trùng nhau (3.5366ms)
✔ GR03877 tạo tay (PO IMPORT_STOCK, không mã giao) → dừng no_delivery_code (0.5514ms)
✔ GR không nằm trong PO / PO khác / nhiều mã giao → chặn (2.4421ms)
✔ tìm GR theo SO (đường /chi-tiet-so) → GR03878 (1.149ms)
✔ P1.6: danh sách GR theo SO phải đọc đủ (total / page / limit) và rõ từng dòng, không lọc rồi đếm (11.5344ms)
✔ Nextwaves: tìm receiving theo SO, đọc đơn liên kết và kiểm SO / đối tác / kho (1.4283ms)
✔ Nextwaves: /receiving thật (PO76458756, PO60017570) và dòng giao có lô (PO28237814) (1.4695ms)
✔ PO Nextwaves sau khi nhận (mẫu thật PO88508353): 25 receivedUnits, biên nhận chứa đúng EPC (0.9551ms)
✔ dấu vân tay: GR03878 khớp PO28237814 (dựng lại) nhưng KHÔNG khớp PO76458756 / PO60017570 (thật) (2.2831ms)
✔ dựng UID đã nhận: đơn vị và lô theo dòng giao, không thiếu / không lạ, có bằng chứng biên nhận (2.7417ms)
✔ dựng UID đã nhận: nhận thiếu → missing; EPC lạ → unexpected (1.6276ms)
✔ P2.1: thiếu bằng chứng nhận → problems (phiếu gửi chưa ghi nhận EPC, biên nhận thiếu / lạ / sai kho, không có biên nhận mới) (5.154ms)
✔ P2.2: tra QR phải có productId số, lô, hạn DD-MM-YYYY (0.5583ms)
✔ GR03878: 12 UID → 6 lần ghi, mỗi lô +1 đơn vị dòng (3 vỉ = 1 hộp, 2 túi = 1 hộp, 1 chai) (13.541ms)
✔ một chặn bất kỳ → không ghi gì (cả gói) (2.8852ms)
✔ lô Nextwaves ≠ lô tra QR → lot_conflict; lô không có trên GR → lot_not_on_gr (3.1371ms)
✔ quy đổi lẻ → fraction; vượt số lượng lô → over; đơn vị lạ → unit_unknown (3.6909ms)
✔ sản phẩm lạ / tra QR ra sản phẩm khác → chặn; không có UID nào → nothing_to_write (3.1797ms)
✔ P2.2: thiếu kết quả tra QR / QR thiếu productId hoặc lô → chặn trước khi ghi (3.4522ms)
✔ P1.2: UID đã nằm ĐÚNG lô, lượng nhất quán → bỏ qua; đủ 12 → complete, không bước nào (3.3357ms)
✔ P1.2: UID nằm sai lô (cùng sản phẩm) → uid_on_wrong_detail, không complete (tái hiện PM) (1.6102ms)
✔ P1.2: UID nằm ở dòng sản phẩm khác / ở hai lô / mã bị nối trùng → chặn (1.5537ms)
✔ P1.2: received_quantity lệch với UID đang nằm trên lô (thiếu / thừa / có lượng mà không mã) → received_mismatch (2.1207ms)
✔ UID đã có trên GR nhưng không thuộc kết quả Nextwaves → gr_has_foreign_codes (1.4529ms)
✔ W1: 6 PUT tuần tự, body đúng (received tuyệt đối, lot_id, UID của lô), đọc lại xác nhận (4.6982ms)
✔ W1: chạy lại sau khi đã ghi đủ → không PUT thêm (already) (2.3607ms)
✔ W1: chi tiết của bước bị đổi trước khi ghi → dừng gr_changed đúng ở bước đó, không PUT bước đó (1.5228ms)
✔ P2.3: phiếu đổi ở chi tiết KHÁC (quét tay giữa chừng) → dừng trước bước kế, không ghi tiếp (1.516ms)
✔ P1.5: mất quyền ghi (lease) trước một PUT → dừng lease_lost, không gửi tiếp (1.6684ms)
✔ W1: PUT lỗi ở bước 3 → dừng put_failed sau 3 lời gọi; chạy lại bỏ qua 2 bước đã xong (1.5541ms)
✔ W1: lỗi mạng → unknown; server không lưu mã → verify_failed (1.4635ms)
✔ W1: kế hoạch có chặn → không chạy; GR đã hoàn tất → dừng (1.5692ms)
✔ 1 ứng viên hợp lệ → chọn PO28237814, không khoá ghi (5.5761ms)
✔ 12 ứng viên (11 đơn SO khác + đơn đúng) → đọc hết cả 12, chọn đúng (4.7271ms)
✔ total > số dòng đọc được (2 trang, đơn khớp có thể ở trang 2) → search_incomplete, không chọn (15.964ms)
✔ kết quả tìm thiếu total / items, hoặc lỗi HTTP → chặn (1.157ms)
✔ một GET ứng viên hết giờ / lỗi HTTP → chặn cả lượt dù đơn đúng vẫn đọc được (4.4547ms)
✔ ứng viên thiếu trường (bên bán / kho / refId / status) → candidate_schema (2.4587ms)
✔ 0 / n ứng viên khớp: lệch số lượng → no_match; hai đơn cùng khớp → ambiguous (2.1046ms)
✔ loại rõ ràng: bên bán khác / kho khác / đơn huỷ; còn đơn cùng SO lệch số lượng → chọn được nhưng khoá ghi (3.0637ms)
✔ E2E STG GR03878: GR → Nextwaves ?po=SOBD1593858 → khớp PO28237814 → nhận → kế hoạch chỉ xem → cấp phép 1 lần → điền 6 lô / 12 UID → HOÀN THÀNH (243.3732ms)
✔ P1.3: cấu hình cũ writeMode=auto (v0.1.0) sau nâng cấp → không tự PUT; config không còn writeMode (200.0217ms)
✔ P1.3: cấp phép cho phiếu khác / đã hết hạn → 0 PUT; content script không tự cấp phép được (286.5784ms)
✔ P1.3: production chỉ đọc — không cấp phép được, phiên PRD không giành được quyền ghi (7.2358ms)
✔ P1.3: PUT lỗi → dừng; cấp phép đã tiêu nên thử lại cần cấp phép MỚI, rồi điền tiếp đủ (103.0621ms)
✔ P1.4: thiếu / sai cửa hàng ở đường mở GR và đường /chi-tiet-so → dừng trước khi mở Nextwaves (799.8599ms)
✔ P1.5: PUT treo quá giờ ở tab 1 → kết quả không rõ + hạ nhiệt; tab 2 chỉ giành được sau đó và mỗi lô vẫn đúng một PUT (798.7276ms)
✔ P1.5: tab mất lease giữa chừng (tab khác tiếp quản) → không gửi PUT kế tiếp, không ghi đè trạng thái phiên (319.3805ms)
✔ P3: SO có 2 phiếu nhận ở cửa hàng → phiên khoá ghi; có cấp phép vẫn chỉ xem, claim bị từ chối, content không gỡ được khoá (132.5972ms)
✔ P2.1: tải lại trang Nextwaves sau khi đơn đã nhận nhưng phiên chưa thấy lượt 2xx → chỉ hiển thị, không về POS (132.6421ms)
✔ P2.1: lượt 2xx nhưng không có biên nhận mới so với lúc khớp đơn → không về POS (81.579ms)
✔ Nextwaves trả 400 tagged_unit_unsupported (K1): báo lỗi trên tab Nextwaves, không về POS, không ghi (117.9321ms)
✔ Nhận thiếu 1 UID (keep_open): giữ ở Nextwaves, báo 11/12, không về POS (166.755ms)
✔ Đường (2) /chi-tiet-so/SOBD1593858: tìm GR theo SO + cửa hàng → cùng luồng, quay về trang SO (30.2803ms)
✔ Chế độ STG trên trang POS production → không làm gì, không gọi host nào (167.7265ms)
✔ Chưa chọn môi trường / môi trường PRD → không làm gì trên POS staging (332.9052ms)
✔ Huỷ phiên trên POS → tải lại trang không tự mở Nextwaves; bấm 'Nhận bằng Nextwaves' → mở lại (139.0429ms)
✔ Hai tab POS cùng GR03878, một cấp phép: bấm ở cả hai tab → chỉ một tab ghi, không nhân đôi mã (211.1385ms)
✔ Lượt 'Xác nhận nhận hàng' của phiếu gửi khác → bỏ qua, không về POS (132.1358ms)
✔ background: giành quyền ghi — chỉ từ trang POS; đúng một lần cho một cấp phép; chỉ từ received / apply_stopped; chỉ chủ lease gia hạn / kết thúc (42.8461ms)
✔ P1.6 đường mở GR: tìm GR theo SO chưa đủ / không rõ / nhiều GR → phiên khoá ghi; có cấp phép vẫn 0 PUT (472.8018ms)
✔ P1.6 đường /chi-tiet-so: danh sách chưa đủ / không rõ → dừng, không mở Nextwaves; hai GR → chọn được nhưng phiên khoá ghi (432.6081ms)
✔ P1.7: Nextwaves có đơn cùng SO khác lần giao → khoá nw_many_orders; tab POS / Nextwaves không xoá được khoá, không đổi được đơn; claim bị từ chối, 0 PUT (102.1947ms)
✔ P1.7: session:nwMatched — chỉ từ trang Nextwaves, chỉ khi phiên chờ, kiểm refId cùng SO và khoá hợp lệ, chỉ một lần (18.9003ms)
✔ P2.4: phiên bản cũ (không schema, thiếu khoá) không được ghi / tìm lại / nhận lượt; mở lại phiếu → phiên mới kiểm lại khoá (129.4183ms)
✔ P2.4: trang Nextwaves không nhận phiên bản cũ (không tìm, không khớp đơn, không gọi API) (252.4937ms)
✔ P2.4: onInstalled (update, cùng extension ID) xoá phiên + cấp phép của bản cũ, giữ của bản hiện hành, ghi lastUpgrade (130.9529ms)
✔ Chống vòng lặp tạo phiên: background không trả lại phiên vừa tạo → POS tạo phiên đúng một lần rồi báo lỗi, không gọi API lặp (333.6114ms)
ℹ tests 82
ℹ suites 0
ℹ pass 82
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6453.9148
```

## 6. Đột biến (dev tự chạy trên `49bf0a4`, không chạy gì khác cùng lúc; PM chạy lại được)

```
python -I scripts/mutate-v0.1.4.py
```

- Script tự chép sang thư mục tạm, chạy bộ gốc trước; khoảng 50 phút.
- 58 ca = 47 ca của v0.1.2 + 10 ca P2.4 + 1 ca chống vòng lặp.
- Ba lần chạy trước **không tính**: còn ca bị "bắt" bằng hết giờ, do lỗi bộ test ở §2b.
  - `91e3bd1`: 6 ca;
  - `d9fbdb2`: 1 ca;
  - `6435082`: 1 ca.
- Kết quả dưới là lần chạy trên `49bf0a4`:

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
KILLED P2.1 tải lại trang tự chuyển | ✖ Chống vòng lặp tạo phiên: background không trả lại phiên vừa tạo → POS || ✖ E2E STG GR03878: GR → Nextwaves ?po=SOBD1593858 → khớp PO28237814 → nh
KILLED P2.2 QR thiếu trường vẫn dùng | ✖ P2.2: tra QR phải có productId số, lô, hạn DD-MM-YYYY (2.2112ms)
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
KILLED P2.4 phiên bản cũ vẫn được ghi | ✖ P2.4: phiên bản cũ (không schema, thiếu khoá) không được ghi / tìm lại
KILLED P2.4 mở lại phiếu giữ phiên bản cũ | ✖ P2.4: phiên bản cũ (không schema, thiếu khoá) không được ghi / tìm lại
KILLED P2.4 session:get trả phiên bản cũ | ✖ P2.4: phiên bản cũ (không schema, thiếu khoá) không được ghi / tìm lại
KILLED P2.4 trang Nextwaves tìm thấy phiên bản cũ | ✖ P2.4: phiên bản cũ (không schema, thiếu khoá) không được ghi / tìm lại || ✖ P2.4: trang Nextwaves không nhận phiên bản cũ (không tìm, không khớp đ
KILLED P2.4 cấp phép kiểu cũ vẫn dùng được | ✖ P2.4: phiên bản cũ (không schema, thiếu khoá) không được ghi / tìm lại
KILLED P2.4 khớp đơn cho phiên bản cũ | ✖ P2.4: trang Nextwaves không nhận phiên bản cũ (không tìm, không khớp đ
KILLED P2.4 scanOk cho phiên bản cũ | ✖ P2.4: trang Nextwaves không nhận phiên bản cũ (không tìm, không khớp đ
KILLED P2.4 received cho phiên bản cũ | ✖ P2.4: phiên bản cũ (không schema, thiếu khoá) không được ghi / tìm lại
KILLED P2.4 nâng cấp không dọn phiên cũ | ✖ P2.4: onInstalled (update, cùng extension ID) xoá phiên + cấp phép của
KILLED P2.4 nâng cấp giữ cấp phép cũ | ✖ P2.4: onInstalled (update, cùng extension ID) xoá phiên + cấp phép của
KILLED Chống vòng lặp: bỏ chốt chặn tạo phiên lặp | ✖ Chống vòng lặp tạo phiên: background không trả lại phiên vừa tạo → POS
58/58 bị bắt (từ ca 1)
```

## 7. Còn mở (không đổi)

- **T1 chỉ đọc** (operator, v0.1.2 theo PM):
  - ảnh khung hai tab;
  - Copy response `inter-tenant-orders/receiving?…q=SOBD1593858` và `goods-receipt/search?query=so_thuocsi=1593858…` (giữ `total / page / limit`, bỏ credential).
- K1 → lượt nhận inter-tenant thật → hợp đồng "đã nhận" (P2.1) → W1 có operator cho phép. Chưa merge mã ghi.
- Tìm đơn Nextwaves và tìm GR: vẫn chỉ fail closed ở một trang, chưa phân trang.
