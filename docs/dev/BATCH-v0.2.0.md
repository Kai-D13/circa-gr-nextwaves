# Batch v0.2.0 — nút "Nhận hàng bằng RFID" trên danh sách GR, chỉ tạo phiên khi bấm, sửa lỗi tồn, hiệu năng (27/10/2026)

**Căn cứ:**
- `docs/dev/PLAN-v0.2-RFID-BUTTON-PROD.md` (Spec Đợt 1 rev 1 + rev 2);
- PM: `docs/pm/REVIEW-PLAN-v0.2-RFID-BUTTON-PROD-20261026.md`, `REVIEW-PLAN-v0.2-REV1-20261026.md`, `CORRECTION-G0-v0.2-20261026.md` (cho code ngay trên nhánh riêng; bằng chứng trang thật dùng để chốt tích hợp / merge / cài).

**Nhánh:** `batch/v0.2-rfid` từ `b4017d7` (UI v0.1.6). Các commit `24d0070`, `d7d2cbd`, `b0129a4`, `ef67a7b` (runtime cuối), `682c509` (đầu nhánh, chỉ test). **Gói:** `dist/circa-gr-nextwaves-v0.2.0.zip`, 19 file, SHA-256 `096d97d993f341bf3ec107c517c40ede5abf9a96ab247f504d8ec2b97f3b221e`, **mã gói `096D97D9`**. Giải nén `C:\circa-gr-nextwaves-v0.2.0`.

**Chưa cài cho operator. Chưa dùng để nhận / ghi staging.** Còn chờ PM audit G1 / G2 và bằng chứng trang thật G0.

## 1. Spec hiệu lực v0.2.0 (hợp nhất rev 1 + rev 2, thay mọi mô tả cũ)

### Lối vào và luật tạo phiên

- **Ba lối vào:**
  - danh sách `/danh-sach-phieu-nhan-hang`: nút trên từng dòng;
  - trang phiếu `/danh-sach-phieu-nhan-hang/<grId>`: nút trong khung;
  - `/chi-tiet-so/<SO>`: chọn phiếu, rồi nút.
- **Chỉ tạo phiên khi bấm.** Mở phiếu / SO không tạo phiên, không mở Nextwaves, không tìm GR theo SO. Trang phiếu chỉ đọc GR + PO, để biết có hiện nút hay không.
- **Phiên đã có thì tiếp tục như cũ** ở mọi trạng thái `waiting_nw` / `nw_ready` / `received` / `applying` / `applied` / `apply_stopped`. Mở phiếu thì tự hiện trạng thái, lập kế hoạch khi đã nhận, không cần bấm.
- **Bấm (S1)** → `startFromGr`, chạy lần lượt:
  1. GET GR: đúng `id`, đúng mã dòng, nhận được, `pos_info.id` = cửa hàng đã xác nhận.
  2. Phiên đang có thì dùng lại.
  3. GET PO → `resolveDelivery`: cùng cửa hàng, đúng một mã giao SO thuocsi. Không có SO → "không nhận bằng RFID được", ẩn nút dòng đó.
  4. Tìm GR theo SO (`checkSoGrs` / `soWriteLock`, khoá ghi như cũ).
  5. Kiểm lần cuối.
  6. `session:start`.

  Dữ liệu dòng danh sách chỉ dùng để hiện nút. Phiên chỉ nhận dữ liệu GR / PO vừa đọc.
- **Danh sách:**
  - nút chỉ ở dòng `WAITING_TO_RECEIVE` / `RECEIVING` của đúng cửa hàng đã xác nhận, `id` là UUID;
  - dòng có phiên thì hiện "Đang nhận trên Nextwaves" (mở lại tab Nextwaves) hoặc "Đã nhận / Đã điền — mở phiếu";
  - bấm xong, tab POS **ở lại danh sách**. Nhận xong, background đưa tab POS về trang phiếu (`returnUrl`).
- **`returnUrl` (S4):** background tự dựng `<posOrigin>/danh-sach-phieu-nhan-hang/<grId>`. Message gửi URL khác → `bad_return_url`; `grId` phải là UUID.

### R1 — thứ tự lượt danh sách (hook `pos-hook.js`, MAIN)

- Chỉ bắt request **của chính trang**: GET 2xx `<posApiBase>/v1/order/goods-receipt/search` có `pos_id=` và không có `so_thuocsi=`, khi đang ở trang danh sách.
- **Lúc gửi:** `reqSeq += 1`, phát `gr-list-request {envId, reqSeq, queryKey}`. `queryKey` = path + mọi tham số query, sắp theo tên.
- **Lúc về:** phát `gr-list {envId, reqSeq, latestReqSeq (lớn nhất đã gửi), queryKey, ok, page, limit, total, rows:[{id, code, status, poId, posId}]}`. Không body thô, không header. Body > 2 MB / > 200 dòng / lỗi / sai dạng → `ok:false`.
- **Content:**
  - chỉ nhận khi `reqSeq === latestReqSeq` và `reqSeq > shownSeq`;
  - lượt mới nhất `ok:false` → xoá hết nút;
  - content nạp muộn thì chào, hook gửi lại danh sách gần nhất.

### R2 — cú bấm gắn dòng / lượt / bộ lọc / route

- Lúc bấm, tạo `clickToken = {nonce, grId, code, row, reqSeq, queryKey, route, envId, storeId, AbortController}`.
- `stillValid` kiểm:
  - nonce còn hiệu lực;
  - môi trường và cửa hàng đã xác nhận không đổi;
  - `location.href` không đổi;
  - (danh sách) không có lượt danh sách mới hơn, `shownSeq` / `queryKey` giữ nguyên, bảng vẫn ánh xạ `code → grId`;
  - `<tr>` còn trên trang, còn đúng chữ mã, còn đúng nút.
- Kiểm sau GET GR, sau GET PO, và sau tìm GR theo SO, tức ngay trước `session:start`; giữa hai chỗ cuối không có `await`.
- **Huỷ ngay** (abort GET đang chạy) khi:
  - có `gr-list-request` mới;
  - observer thấy DOM dòng đổi;
  - hook báo đổi route;
  - header đăng nhập / cửa hàng đổi.
- Thông báo: "Danh sách đã đổi — bấm lại" / "Đã rời trang — huỷ lượt chuẩn bị" / "Phiên đăng nhập / cửa hàng POS vừa đổi — bấm lại".
- GET hết giờ (30 s) hoặc mất kết nối **không** phải huỷ: báo "Hết giờ / mất kết nối khi đọc dữ liệu POS — thử lại", không tạo phiên. Chỉ cú bấm bị huỷ thật mới báo "Danh sách đã đổi".
- Bấm hai lần, hoặc bấm ở hai tab, chỉ tạo **một** phiên / **một** tab Nextwaves. Lý do: mỗi tab một lượt chuẩn bị, và background trả phiên đang có.

### S3 — header cửa hàng

- Request có `x-store-id` → bộ header **đã xác nhận**.
- Thiếu `x-store-id` nhưng cùng `authorization` + `x-client-id` → giữ bộ cũ.
- Token / client khác mà thiếu cửa hàng → **chưa xác nhận**: gỡ nút, dừng mọi lượt chuẩn bị, vẫn báo lý do.
- `pos_id` trong query danh sách không dùng làm bằng chứng cửa hàng.

### S5 — nút trên danh sách (`pos/gr-list.js`, chỉ DOM)

- `<button type="button" class="cgn-rfid-btn" data-cgn-gr data-cgn-code data-cgn-kind>`.
- Chặn mousedown / pointerdown / touch / keydown / click lan lên dòng.
- Tìm dòng: ô lá có chữ đúng `/^GR\d{5,}$/` trong `<tr>`. Đặt nút vào `div.flex` của ô cuối, hoặc vào chính ô cuối. Không đụng `.circa-rfid-po-link`.
- MutationObserver chỉ khi trang là danh sách. Gom thay đổi: chờ yên 250 ms, **tối đa 1 s**. Bỏ qua thay đổi do chính nút. Ngắt khi rời trang.

### S6 — cache tra QR và lọc refresh

- Khoá cache = phiên + `nwResult.at` + UID, TTL 10 phút. Kết quả lỗi không cache. "Kiểm tra lại" tra lại hết.
- Refresh khi:
  - cấp phép của **đúng** `env:GR` đổi;
  - chữ ký phiên đổi (`state`, `nwResult.at`, `applyError`, `scanOk`, `retryNotBefore`).
- Bỏ qua thay đổi `posTabId` / `lease` / `log`.
- Ghi phiếu (`apply.js`) không đổi: mỗi PUT vẫn đọc GR mới, so ảnh chụp, dùng mã kế hoạch hiện tại.

### Khác

- **Route:** theo sự kiện (hook vá `pushState` / `replaceState` + `popstate`), dự phòng dò mỗi 3 s (trước đây 700 ms).
- **Log `scan_ok`:** `at` luôn là ISO lúc ghi, giờ lượt nhận ghi riêng `scanAt`.
- **Ô cấp phép:** chỉ ra ký tự sai (chữ O thay số 0, ký tự ẩn, khoảng trắng). Luật `^GR\d+$` giữ nguyên.
- **Không đổi:** khung (`panel.js` v0.1.6), Nextwaves, `plan.js`, `apply.js`, luật một chặn thì không ghi cả GR, production chỉ đọc.

## 2. Diff

`git diff --stat b4017d7 682c509`: 15 file, +1845 / −217. Riêng `src/`: 7 file, +771 / −127 (`src/` không đổi sau `ef67a7b`).

DIFF đầy đủ: `dist/circa-gr-nextwaves-v0.2.0-vs-b4017d7.diff` + `.stat.txt` (cùng thư mục với gói, ngoài git), hoặc `git diff b4017d7 origin/batch/v0.2-rfid`.

| File | Nội dung |
|---|---|
| `src/lib/env.js` = `src/main/env.js` | Trang `gr_list`; `posGrListCall` (queryKey); `api.posGrPage`; `isUuid` |
| `src/pos/pos-hook.js` | Bắt danh sách (reqSeq lúc gửi, giới hạn); route; chào → gửi lại |
| `src/pos/gr-list.js` (mới) | DOM nút; observer; rowValid; số đo `stats()` |
| `src/pos/pos-content.js` | Bộ điều khiển duy nhất (viết lại phần lối vào): `startFromGr`, `clickToken` / `stillValid`, nhánh `gr_list`, header S3, cache QR, lọc refresh, route sự kiện |
| `src/background.js` | `returnUrl` tự dựng + `grId` UUID; log `scan_ok`; gợi ý ô cấp phép |
| `src/manifest.json` | 0.2.0; `pos/gr-list.js` trước `pos/pos-content.js` |
| `tests/*` | `v02.test.js` mới; `hooks`, `runtime`, `env-keys`, `browser-sim` (bộ giả `grList`, `location.assign`) |
| `scripts/edge-check.js`, `scripts/mutate-v0.2.0.py` | Edge thật + đo hiệu năng; đột biến |

## 3. Kiểm

| Mức | Kết quả |
|---|---|
| `npm test` | **131/131**, 3 lần liên tiếp sạch sau sửa đột biến (trước đó 129/129 × 6; v0.1.6: 106) |
| Test mới | `v02.test.js` (19 ca: 8 ca R2, 1 ca GET hết giờ); `hooks` +4; `runtime` +1 (cache QR); `env-keys` +1 |
| Test cũ chỉnh | Bấm nút thay tự chạy (`openToReady`); `returnUrl` = trang phiếu; test "chống lặp" viết lại theo v0.2 (không tự chạy nên không lặp; số request ổn định); P1.6 SO / P2.4 / P1.7 thêm bước bấm |
| Edge thật `node scripts/edge-check.js C:\circa-gr-nextwaves-v0.2.0` (bản giải nén từ gói) | **16/16** (số đo ở §4). Sau khi chạy không còn tiến trình Edge / node sót |
| Đối chứng v0.1.6 trên cùng phép kiểm | **Hỏng 6/16**, đúng các điểm v0.2 sửa: mở phiếu tự mở Nextwaves ("Chờ nhận hàng trên Nextwaves"); danh sách 0 nút; không có `grList` |
| Đột biến `python -I scripts/mutate-v0.2.0.py` | **93/93**, 0 ANCHOR, 0 ca hết giờ 240 s, chạy một mình. Lượt 2 (93 ca, mã `ef67a7b`): 92/93. Sau test `682c509`, chạy lại ca 76–93 (khối R2 trở đi; ca 1–75 không dùng test đã sửa): 18/18. Lượt 1 (92 ca) và cách sửa: bảng dưới |
| Gói | `dist/circa-gr-nextwaves-v0.2.0.zip`, 19 file, SHA-256 `096d97d9…3b221e`. Giải nén `C:\circa-gr-nextwaves-v0.2.0` khớp từng file với `src/` của `682c509` (`diff -r` rỗng). `lib/env.js` = `main/env.js` |

**Đột biến lần 1 (92 ca) bắt 86, sót 6 → đã sửa trước khi đóng gói:**

| Ca sót | Nguyên nhân | Sửa |
|---|---|---|
| R2 cú bấm không gắn với dòng / lượt danh sách; R2 không huỷ ngay khi có request danh sách mới; R2 không huỷ ngay khi DOM dòng đổi | GET GR bị treo trong test vượt hạn hết giờ 2 s của trình duyệt giả. `startFromGr` coi AbortError do **hết giờ** là "huỷ", báo "Danh sách đã đổi". Test thấy đúng tiêu đề nên qua, dù không có huỷ chủ động | **Mã:** chỉ huỷ thật mới báo "Danh sách đã đổi"; hết giờ / mất kết nối báo lỗi mạng (đây cũng là lỗi thật: dược sĩ sẽ thấy sai lý do). **Test:** R2 phải hiện tiêu đề trong 1,5 s (trước hạn 2 s); thêm ca GET GR hết giờ |
| R2 bỏ kiểm sau GET GR; R2 bỏ kiểm ngay trước `session:start` | Mọi ca R2 đều có tín hiệu huỷ chủ động, nên kiểm sau `await` không bao giờ là chốt duy nhất | Thêm ca "URL đổi mà hook không báo" (không có tín hiệu chủ động, dự phòng 3 s chưa tới): treo tìm theo SO → không tạo phiên; treo GET GR mà GR trả về **đã HOÀN THÀNH** → phải báo "Danh sách đã đổi" và không GET PO. Lượt 2 (93 ca) ca "bỏ kiểm sau GET GR" vẫn sót, vì kiểm sau `session:get` chặn trước GET PO, nên không lộ tác dụng phụ. Bản test dùng GR đã HOÀN THÀNH để ca này lộ ra: thiếu kiểm thì cú bấm đã hết hiệu lực báo lỗi trạng thái phiếu (`682c509`) |
| S5 hook bỏ giới hạn số dòng | Test dùng 201 dòng GR đầy đủ, body > 2 MB nên giới hạn dung lượng chặn trước | Test dùng 201 dòng nhỏ (dưới 2 MB); 200 dòng vẫn nhận |

Thêm 1 ca đột biến (93): "R2 GET hết giờ báo nhầm là danh sách đổi".

**Ca test G1 theo PM:**
- STG / PRD / host lạ / cửa hàng khác: `env-keys`, `v02`.
- Response muộn, trang đổi dòng, thiếu trường, vượt giới hạn.
- Click / phím: Edge `button.click()`; phím là hành vi gốc của `<button>`, lan sự kiện bị chặn.
- Double click và hai tab.
- GR / PO đổi sau danh sách: khác mã, đã HOÀN THÀNH, PO không SO.
- Không tự tạo phiên khi mở GR / SO; phiên cũ tiếp tục.
- Route đổi sau từng `await`.
- Grant / QR retry.
- `scanAt` ISO.
- Không ghi khi có một chặn (test cũ `plan-apply`).

## 4. Hiệu năng (Edge thật, headless, trang giả)

| Đo | Kết quả |
|---|---|
| Trang danh sách 20 dòng, lượt quét lúc tải (tạo 13 nút) | 3 lượt, tối đa 1,8 ms / lượt |
| Bão 300 thay đổi DOM trong ~1,5 s liên tục | gom 30 đợt thay đổi thành 2 lượt quét; tối đa 0,7 ms / lượt, tổng 1,2 ms |
| CPU quy cho script extension (CDP Profiler, lọc `chrome-extension://`) trong bão | 5,0 ms (trang: 22,3 ms) |
| Trang bán hàng giả, cùng bão | CPU extension 0,0 ms (trang: 4,2 ms); 0 khung, 0 nút |
| Request API của extension khi chỉ xem danh sách / trang bán hàng | 0 / 0 |

- Ngân sách PM: mỗi lượt < 2 ms; không task > 50 ms quy cho extension. Tổng CPU extension cả đợt < 50 ms, nên không thể có task > 50 ms của extension.
- Số trên là lần chạy trên bản giải nén từ gói. Lần chạy trước trên `src/` (`b0129a4`): tải trang tối đa 1,6 ms; bão tổng 0,9 ms; CPU extension 2,2 ms / trang 18,7 ms; trang bán hàng 0,0 / 7,0 ms. Chênh nhau là dao động giữa các lần chạy, vẫn trong ngân sách.
- `PerformanceObserver('longtask')` không dùng làm bằng chứng.
- Chưa có baseline trên **POS thật** (G0 / G3). Số đo trên trang giả, cần đo lại với DOM thật.

## 5. Giới hạn và bằng chứng còn thiếu (G0)

- **DOM danh sách thật chưa có.** Selector dựa trên giả định bảng `<tr>`: ô mã chứa đúng `GR…`, ô cuối có `div.flex`. Giả định này theo mã tham khảo của extension Nextwaves.
  - Cần outerHTML một dòng thật đã làm sạch.
  - Nếu khác, sửa `rowCode` / `slotOf` trong `gr-list.js` (gói mới) rồi PM audit lại.
- **Response danh sách thật** đã thấy trong Net Capture 26/10 (dev): `id/code/status/purchase_order_id/pos_info`, 20 dòng / trang. Chưa có "Copy response" đã làm sạch trong `samples/`.
- **Ảnh UI v0.1.6 trên POS / Nextwaves thật** (gate khung) chưa có.
- **Nextwaves:** không đổi. O1, mã QR POS thêm sau HOÀN THÀNH và xung đột reader thuộc Đợt 2 (production).
- **Lấy G0:**
  - Dev không tự đăng nhập POS. Cần operator gửi file, hoặc mở phiên.
  - Nếu operator đồng ý, dev có thể đọc DOM / response **chỉ đọc** qua Claude in Chrome trên trình duyệt đang đăng nhập.

## 6. Cài đặt khi PM cho phép (S8)

1. Trước khi đổi bản:
   - popup không còn phiên `received` / `applying` / `apply_stopped` dở;
   - export `chrome.storage` (service worker Console: `copy(JSON.stringify(await chrome.storage.local.get(null), null, 2))`).
2. Nên cài từ **một thư mục cố định**, ví dụ `C:\circa-gr-nextwaves`, và cập nhật tại chỗ cho các bản sau. ID chỉ giữ khi cập nhật đúng extension đã cài từ đường dẫn đó; không chuyển phiên từ ID cũ.
3. Sau cập nhật: kiểm ID trong `chrome://extensions` và `lastUpgrade` trong storage. Không thay file khi đang nhận / điền.
4. Nạp v0.2.0 lần đầu từ thư mục mới là extension mới: chọn lại Staging.
