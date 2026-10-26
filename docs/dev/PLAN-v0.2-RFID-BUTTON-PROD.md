# Kế hoạch v0.2 — nút "Nhận hàng bằng RFID" trên POS, sửa lỗi tồn, sẵn sàng production (Florita)

**Trạng thái:**
- Đề xuất của dev-team ngày 26/10/2026, operator đồng ý hướng.
- **PM duyệt hướng** (`docs/pm/REVIEW-PLAN-v0.2-RFID-BUTTON-PROD-20261026.md`, gate G0–G4).
- **Đợt 1 chỉ code khi G0 đạt.**
- **Phần "Spec Đợt 1 — rev 1" ở cuối file thay mọi chỗ mâu thuẫn trong §Đợt 1 bên dưới.**

Căn cứ:
- yêu cầu operator 26/10;
- mã tham khảo extension Nextwaves `circa-rfid` (chỉ đọc, không chạy);
- audit mã hiện tại;
- response danh sách GR thật trong Net Capture 26/10 12:08.

## Context

**Hiện trạng**
- `main` có v0.1.5 (`aa42dcc`). T1 / T3 / W1 đã qua gate PM trên staging.
- v0.1.6 (khung không che nút HOÀN THÀNH) đã qua gate source / gói. Còn chờ operator xem UI chỉ đọc trên trang thật.

**Operator yêu cầu tiếp**
1. Nút **"Nhận hàng bằng RFID"** trên **danh sách phiếu nhận** POS, giống "View on Nextwaves" của extension Nextwaves (tham khảo `Downloads\circa-rfid-enhanced\circa-rfid`). Dược sĩ không phải mở phiếu.
2. Audit đủ để chạy E2E và lên production chuẩn.
3. Sửa các lỗi đã / đang gặp.
4. Không làm chậm hay ảnh hưởng vận hành POS.

**Operator đã chốt**
- Bấm nút trên danh sách thì **bắt đầu ngay, tab POS ở lại danh sách**. Nhận xong, tab POS tự mở đúng phiếu để lập kế hoạch / điền.
- **Bỏ tự chạy khi mở phiếu**: chỉ chạy khi bấm nút. Đây là đảo quyết định 24/10, cần PM duyệt spec.
- Production đợt đầu: **chỉ Florita**.

**Theo quy trình:** kế hoạch này là đề xuất của dev. PM (Codex) duyệt spec rồi mới code. Mọi thay đổi runtime ra version / ZIP / SHA-256 mới và qua PM audit.

## Sự thật đã kiểm (căn cứ thiết kế)

**API danh sách POS mà trang tự gọi**
- `GET …/order/goods-receipt/search?query=pos_id=<store>,,with_items=true,with_details=true,is_count_all_status=true&limit=20&page=1&order_by=created_at=desc`.
- Mỗi dòng có `id`, `code`, `status`, `purchase_order_id` / `_code`, `pos_info`, `items`. **Không có SO / mã giao**, nên phải đọc PO mới biết phiếu có nối thuocsi.
- Staging hiện có GR03879 (PO00006752) Chờ nhận, GR03878 Đang nhận.

**Extension tham khảo (Nextwaves)**
- Hook XHR / fetch ở MAIN world, đọc response danh sách của chính trang, rút `code → id / purchaseOrderId`.
- Tìm ô lá có chữ khớp `/^(GR|RCV)\d{5,}$/` (trong `td, p, span, a`). Chèn `<button>` vào `div.flex` của ô cuối.
- Dùng MutationObserver toàn tài liệu, debounce 250 ms, cache 60 s, chặn sự kiện chuột lan lên dòng.
- Dấu chống trùng của họ là class `.circa-rfid-po-link`, nên **ta phải dùng class riêng**.
- Rủi ro của họ: chạy cả trang bán hàng; lookup lỗi không cache; `rfid-sale.js` **tự kết nối reader trên mọi trang POS**, có thể giành cổng với màn quét Nextwaves.

**Extension của ta**
- Mở phiếu GR nhận được thì `start()` tự chạy và mở tab Nextwaves (`src/pos/pos-content.js:331`).
- Đã có sẵn nút "Nhận bằng Nextwaves" (`:308-316`).
- Background, khi đã nhận, **chuyển tab POS về `returnUrl`** nếu đang ở trang khác (`src/background.js:357-363`). Nên bắt đầu từ danh sách với `returnUrl` = URL phiếu là chạy được.
- Tra QR không cache: GR03880 làm 3 vòng, 33 GET. Nguyên nhân là refresh khi grant bất kỳ đổi (`:607`) và chạy đua `watched.state` khi background ghi `posTabId` (`background.js:365`).
- Kiểm URL bằng `setInterval` 700 ms trên mọi trang POS (`pos-content.js:617`, `nw-content.js:434`).
- Panel v0.1.6 chạy `querySelectorAll` toàn trang mỗi 1 s khi hiện.
- `scan_ok.at` lưu dạng số (`background.js:442`).
- Header lưu có thể bị request thiếu `x-store-id` ghi đè (`pos-content.js:582`).

## Phạm vi theo đợt

### Đợt 0 — không code, làm ngay (song song)

- Commit kế hoạch này vào `docs/dev/PLAN-v0.2-RFID-BUTTON-PROD.md` (main) để PM duyệt.
- **Operator:** lượt xem UI chỉ đọc v0.1.6 theo PM (`docs/dev/FIX-UI-v0.1.6.md` §6). Có thể dùng GR03878 (Đang nhận, còn nút HOÀN THÀNH).
- **Operator lấy thêm (chỉ đọc):**
  - outerHTML một dòng danh sách phiếu nhận, và vùng nút HOÀN THÀNH / Hủy ở trang phiếu (DevTools → Elements → Copy outerHTML);
  - Nextwaves `/vi/stock/inter-tenant/orders`, tìm `SOBD1593858` (đơn **đã nhận**) → Copy response, để thiết kế khôi phục O1;
  - tra QR trên POS mã `1791530171312AA1` (mã POS thêm sau HOÀN THÀNH);
  - máy Florita có cài extension Nextwaves `circa-rfid` (tự kết nối reader) và / hoặc circa-qr-scan-log không.

### Đợt 1 — v0.2.0 (staging): lối vào mới + sửa lỗi + hiệu năng

> **Bản đầu, ĐÃ THAY.** Spec có hiệu lực là "Spec Đợt 1 — rev 1" + "rev 2" ở cuối file. Khi giao code, dev hợp nhất thành một spec duy nhất (PM rev 1, P2).

Nhánh `batch/v0.2-rfid` tách từ `main` sau khi v0.1.6 merge (hoặc gộp v0.1.6 nếu gate UI thật xong cùng lúc).

**1a. Bắt đầu chỉ khi bấm nút** (`src/pos/pos-content.js`)
- Bỏ `await start()` tự chạy ở trang phiếu và trang `/chi-tiet-so`. Thay bằng khung gọn có nút **"Nhận hàng bằng RFID"** (dùng lại nhánh nút hiện có ở `:308-316`).
- Tách `start()` thành hàm dùng chung `startFromGr(env, storeId, grId, returnUrl)`: GET GR → GET PO → `resolveDelivery` → `searchGrsOfSo` / `soWriteLock` → `session:start`.
- Hai lối vào gọi hàm này: trang phiếu và nút trên danh sách. `returnUrl` luôn là URL trang phiếu.

**1b. Nút trên danh sách** (mới `src/pos/gr-list.js`, ISOLATED; nạp trong manifest trước `pos-content.js`)
- `env.js` (cả hai bản sao giống từng byte) thêm kiểu trang `gr_list` cho `/danh-sach-phieu-nhan-hang` không có id.
- **Dữ liệu dòng:** `pos-hook.js` (MAIN) clone **chỉ** response GET `…/goods-receipt/search?query=pos_id=` (danh sách trang tự gọi; giới hạn 2 MB, tối đa 200 dòng). Gửi `{id, code, status, poId, posId}` qua `postMessage` (cùng origin, cùng mark).
  - Không phát sinh request mới khi chỉ xem danh sách.
  - Content có thể yêu cầu gửi lại khi vừa nạp.
- **Hiện nút** chỉ ở dòng có `status` ∈ {WAITING_TO_RECEIVE, RECEIVING}, đúng cửa hàng đang đăng nhập (`storeAllowed`), và môi trường đã chọn.
  - Tìm ô lá có chữ `/^GR\d{5,}$/` trong dòng bảng. Chèn `<button class="cgn-rfid-btn" data-cgn-gr=<id>>` vào `div.flex` của ô cuối, hoặc vào chính ô cuối.
  - Không trùng: một nút mỗi dòng; dòng đổi mã thì thay nút. Cùng tồn tại với `.circa-rfid-po-link`.
  - Chặn `mousedown`, `pointerdown`, `click` lan lên dòng (dòng POS mở phiếu khi bấm).
- **Theo dõi DOM:** một MutationObserver (`childList, subtree`) trên vùng nội dung. Debounce 250 ms. Bỏ qua mutation do chính nút của ta. **Chỉ gắn khi trang là `gr_list`, ngắt khi rời trang.**
- **Bấm nút:**
  - Khung báo "Đang kiểm phiếu…" → `startFromGr`.
  - Phiếu không đi từ SO thuocsi thì báo "Phiếu không nhận bằng RFID được (không có mã giao SO thuocsi)" và nhớ trong tab để ẩn nút.
  - Thành công thì background mở tab Nextwaves. Tab POS **ở lại danh sách**; dòng hiện trạng thái "Đang nhận trên Nextwaves".
  - Dòng đã có phiên thì nút đổi thành "Mở Nextwaves" (`session:focusNw`) / "Mở phiếu".
- Nhận xong: background tự đưa tab POS về trang phiếu (`returnUrl`), lập kế hoạch / cấp phép / điền như hiện tại.

**1c. Sửa lỗi**
- **Tra QR một lần mỗi phiên:** cache `uid → kết quả` theo phiên trong `pos-content.js` (TTL 10 phút; kết quả lỗi không cache). Single-flight cho `planAndOffer`.
- **Refresh chỉ khi cần:** grant đổi *của đúng GR đang xem*; bỏ qua khi phiên chỉ đổi `posTabId` / `lease` / `log`, tức so `state` + `nwResult.at` + `applyError`.
- `scan_ok.at` dạng ISO: ghi `scanAt` riêng, không đè `at` (`background.js:442`).
- **Header cửa hàng:** chỉ cập nhật bộ header khi có `x-store-id`, hoặc gộp giữ `x-store-id` cũ cùng `authorization` (`pos-content.js:582`).
- **Rời trang giữa chừng:** `AbortController` cho lượt đánh giá. Đổi trang thì huỷ GET đang chạy và không `session:start` (sửa ca agent chỉ ra ở `pos-content.js:156-172`).
- **Ô cấp phép:** khi bị từ chối, chỉ ra ký tự lạ (ví dụ "chữ O ở vị trí 3", "ký tự ẩn"). Luật kiểm `^GR\d+$` giữ nguyên.

**1d. Hiệu năng**
- Đổi URL theo sự kiện: hook MAIN vá `history.pushState` / `replaceState` + `popstate` → `postMessage`. `setInterval` dự phòng giãn 700 ms → 3 s.
- Trên trang không phải GR / danh sách / SO (ví dụ bán hàng): không observer, không timer ngoài dự phòng 3 s, không fetch, không panel.
- **Panel tránh nút:**
  - chỉ chạy khi panel hiện và không thu nhỏ;
  - tìm `button` (không `a`) trong vùng thân trang;
  - giữ danh sách nút tìm được, quét lại DOM mỗi 5 s;
  - đo vị trí mỗi 1 s chỉ trên các nút đã giữ.
- Hook: chỉ phân tích URL một lần mỗi request. Clone body chỉ cho đúng URL danh sách (1b).
- **Ngân sách đo được** (Edge): trang danh sách 20 dòng + 300 lần đổi DOM → handler của ta < 2 ms / lượt, không long task > 50 ms do extension, 0 request thêm khi chỉ xem.

**1e. Version 0.2.0**
- ZIP / SHA-256 mới. Hướng dẫn cài **từ một thư mục cố định** (`C:\circa-gr-nextwaves`) và cập nhật tại chỗ, để giữ extension ID và phiên khi nâng cấp. Giảm O1 do đổi thư mục.

### Đợt 2 — O1 + production Florita (chỉ đọc trước)

- **O1:**
  - Không xoá phiên ở trạng thái `received` / `applying` / `apply_stopped` theo hạn 24 h (chỉ xoá `done` / huỷ / cũ).
  - Khôi phục khi mất phiên: thiết kế theo capture danh sách đơn Nextwaves đã nhận (Đợt 0). Tìm PO theo SO kể cả đơn đã nhận → biên nhận chứa UID → lập kế hoạch như thường.
  - Spec riêng cho PM.
- **PRD Florita** (`src/lib/env.js` cả hai bản):
  - `storeAllowlist: ["c476efb2-415c-429a-978e-d389b4b06607"]`, `warehouseByStore` Florita → `eb5e2b4f…` (đã có), tenant `circa`.
  - `writeEnabled` **giữ false** tới gate W1-PRD.
- **T1-PRD chỉ đọc** trên một GR SO thật ở Florita (Net Capture tab POS + Nextwaves). Kiểm CORS `api.v2.circa.vn`, dạng dữ liệu production (R1 lốc / chai, R5 QR nhân đôi).
- **Gate W1-PRD** (PM): bật `writeEnabled` chỉ cho Florita, một GR có operator cho phép, quan sát trực tiếp.

**Ngoài phạm vi (cần quyết nghiệp vụ)**
- Nhận thiếu (giao thiếu thật).
- Ghi từng lô đủ hộp (PM giữ all-or-nothing).
- Ý nghĩa mã QR POS thêm sau HOÀN THÀNH.
- Phân trang (giữ fail-closed).

## File chính sẽ sửa (Đợt 1)

- `src/lib/env.js` + `src/main/env.js` (giống từng byte): kiểu trang `gr_list`; mẫu URL danh sách.
- `src/pos/pos-hook.js`: bắt response danh sách (chỉ URL đó); sự kiện đổi URL.
- `src/pos/gr-list.js` (mới): chèn / cập nhật nút theo dòng, observer có debounce, click → `startFromGr`.
- `src/pos/pos-content.js`: tách `startFromGr`, bỏ tự chạy, cache QR + single-flight, lọc refresh, header, Abort.
- `src/ui/panel.js`: tránh nút nhẹ hơn (giữ API `avoidButtons`, `liftFor`).
- `src/background.js`: `scanAt`; (Đợt 2) giữ phiên `received` / `applying`; tuỳ chọn `session:focusNw`.
- `src/manifest.json`: version, thêm `pos/gr-list.js` vào mục ISOLATED POS (giữ luật không nạp trùng file).
- Tái dùng: `pos-model.js` (`normalizeGrSearch*`, `isReceivable`, `normalizeGr`, `normalizePo`, `resolveDelivery`, `checkSoGrs`, `soWriteLock`, `grFingerprintSource`), `env.js` (`storeAllowed`, `warehouseForStore`, `E.api.*`), background `session:start` / `received` / `openOrFocus`.

## Kiểm (verification)

1. **`npm test` + test mới** (`tests/`):
   - hook bắt đúng response danh sách và không đụng URL khác;
   - `gr-list` chèn nút đúng dòng chờ nhận / đang nhận, không trùng, thay khi dòng đổi, bỏ dòng cửa hàng khác;
   - E2E trình duyệt giả: bấm nút trên danh sách → phiên → Nextwaves → nhận → tab POS về trang phiếu → kế hoạch → cấp phép → điền;
   - mở phiếu **không** tự chạy;
   - cache QR: một phiên 11 UID = 11 GET dù grant / posTabId đổi;
   - Abort khi rời trang;
   - header không mất `x-store-id`;
   - `scanAt` ISO;
   - trang bán hàng không timer / fetch.
2. **Đột biến** `scripts/mutate-v0.2.0.py` = ca cũ + ca mới (bỏ lọc trạng thái dòng, bỏ chống trùng, bỏ cache, tự chạy lại, bỏ Abort…). Chạy một mình, 0 ca hết giờ.
3. **Edge thật** `scripts/edge-check.js` mở rộng:
   - trang danh sách giả (bảng 20 dòng theo outerHTML thật của operator, có sẵn nút giả `.circa-rfid-po-link`) + CDP Fetch trả response danh sách mẫu;
   - nút chỉ ở dòng chờ / đang nhận; bấm → phiên + tab Nextwaves; trang phiếu không tự mở tab;
   - đo hiệu năng (PerformanceObserver longtask + đếm lượt handler khi bơm 300 thay đổi DOM).
4. **Staging thật:** PO để dành (GR03879). Bấm nút trên danh sách → nhận → điền → HOÀN THÀNH. Net Capture tab POS **và** tab Nextwaves (hai bản ghi) + export storage.
5. **Production:** T1-PRD chỉ đọc ở Florita; W1-PRD chỉ sau gate PM.

## Cần operator cung cấp

1. outerHTML dòng danh sách phiếu nhận và vùng nút HOÀN THÀNH / Hủy (staging).
2. Capture Nextwaves danh sách đơn liên kết khi tìm `SOBD1593858` (đơn đã nhận).
3. Tra QR `1791530171312AA1` trên POS.
4. Thông tin máy Florita:
   - có extension Nextwaves `circa-rfid` (tự kết nối reader) / circa-qr-scan-log không;
   - xác nhận `pos_id` `c476efb2…`, tenant `circa`, kho `eb5e2b4f…`;
   - một GR SO thật ở Florita để làm T1-PRD.
5. (PM G0) `Copy response` danh sách GR mà trang danh sách tự gọi: `goods-receipt/search?query=pos_id=…`. Giữ `total / page / limit`; dev sẽ bỏ tên người trước khi lưu mẫu.

---

## Spec Đợt 1 — rev 1 theo review PM (26/10)

Trả lời từng finding P1 / P2 của PM. **Chưa code. Bắt đầu khi G0 đạt.** Nếu DOM / response thật khác giả định dưới đây, dev báo PM sửa spec trước khi code phần đó.

### S1. Dòng danh sách chỉ là gợi ý hiển thị (P1.1)

**Dữ liệu dòng**
- Bảng dòng nhận từ hook. Thứ tự lượt theo **`reqSeq` cấp lúc GỬI request** (rev 2, R1), không theo lúc response về.
- Chỉ response của **request mới nhất** mới thay bảng.
- Response cũ về muộn bị bỏ.
- Request mới nhất lỗi thì xoá nút cũ.

**Ghép nút vào dòng**
- Dòng trong DOM có ô lá chữ `/^GR\d{5,}$/` **và** mã đó có trong lượt hiện tại.
- Không khớp thì không có nút. Không đoán theo thứ tự dòng.

**Khi bấm**, `startFromGr(grId, codeOnRow, clickToken)` làm lần lượt:
1. `GET GR` theo `id`. Kiểm `code` = mã trên dòng (khác thì dừng: "Danh sách đã đổi — bấm lại").
2. Kiểm trạng thái nhận được (`isReceivable`) và `pos_info.id` = cửa hàng của header đã xác nhận (S3).
3. `GET PO`, rồi `resolveDelivery`: cửa hàng PO = GR = phiên; có mã giao SO thuocsi.
4. Kho: `warehouseForStore`.
5. `searchGrsOfSo` + `checkSoGrs` + `soWriteLock`: duy nhất SO / GR, kèm khoá ghi hiện có.
6. Chỉ khi tất cả đạt mới `session:start`.

Session chỉ nhận dữ liệu từ GR / PO **vừa đọc**, không lấy `id` / `code` từ `postMessage` hay DOM.

**Nhãn nút**
- Nhãn luôn là "Nhận hàng bằng RFID" (trung tính), hiện ở GR chờ / đang nhận.
- Sau khi bấm, nếu không có SO thì báo "Phiếu này không đi từ SO thuocsi — không nhận bằng RFID được". Ghi nhớ trong tab để ẩn nút dòng đó.

### S2. Hai lối vào, một bộ điều khiển (P1.2)

**Phân nhánh trang**
- `env.js` (hai bản giống từng byte): `classifyPosPage` trả thêm `{kind: "gr_list"}`.
- `evaluate()` có nhánh **riêng** `gr_list` → `evaluateGrList()`. Không rơi xuống `evaluateSo()`. Test cố định điều này.

**Bộ điều khiển duy nhất (`pos-content.js`)**
- `gr-list.js` chỉ lo DOM / sự kiện: tìm dòng, chèn / gỡ nút, bắt click / phím.
- `gr-list.js` nạp trước `pos-content.js` và khai `C.grList = { attach(controller) }`.
- Trước khi `attach`, nó **không vẽ nút** (không có hàng đợi click mồ côi).
- `pos-content.js` gọi `C.grList.attach({ rowsFor, onSelect, rowState })` một lần khi khởi động.

**Không tự tạo phiên**
- Mở GR / SO **không tự tạo phiên, không mở Nextwaves**.
- Trang phiếu hiện nút "Nhận hàng bằng RFID" (dùng lại nhánh nút hiện có). Trang SO hiện nút mỗi GR như hiện tại, nhưng bỏ tự chạy khi chỉ có một GR.

**Phiên đã có thì tiếp tục như hiện hành**
- Áp cho mọi trạng thái `waiting_nw` / `nw_ready` / `received` / `applying` / `applied` / `apply_stopped`: `renderSession`, lập kế hoạch khi `received`.
- Trên danh sách, dòng có phiên hiện trạng thái thay vì nút tạo: "Đang chờ nhận trên Nextwaves" + "Mở Nextwaves"; "Đã nhận — mở phiếu để điền" + "Mở phiếu".

**Không tạo trùng**
- Mỗi `grId` có một lượt chuẩn bị (single-flight); nút bị khoá trong lúc chạy.
- Hai tab / tải lại / quay lại danh sách: background `startSession` đã trả phiên active sẵn, không mở tab thứ hai (`src/background.js:225`). Test thêm hai tab bấm cùng lúc → một phiên, một tab Nextwaves.

### S3. Header cửa hàng (P1.3)

Mỗi request quan sát được trong `pos-content.js` xử lý theo bảng:

| Request mới | Xử lý |
|---|---|
| Có đủ `authorization`, `x-client-id`, `x-store-id` | Thay bộ header, đánh dấu **đã xác nhận** |
| Thiếu `x-store-id`, cùng host, `authorization` và `x-client-id` **trùng** bộ đã xác nhận | Giữ bộ cũ |
| Thiếu `x-store-id`, token hoặc client khác | Bộ header **chưa xác nhận**. Mọi lượt chuẩn bị dừng với "Đang chờ POS xác nhận cửa hàng" tới khi có request đủ header |

- `pos_id` trong query danh sách **không** dùng làm bằng chứng cửa hàng.
- Trước `session:start` luôn so `pos_info.id` của GR và cửa hàng PO vừa đọc với cửa hàng của header đã xác nhận.

### S4. Rời trang giữa lúc chuẩn bị + `returnUrl` (P1.4)

**Trong `pos-content.js`**
- Mỗi lượt bấm có `AbortController` + `clickToken`. Mọi GET chuẩn bị nhận `signal`.
- Sau **mỗi** `await` và ngay trước `session:start`, kiểm lại: trang hiện tại (route), môi trường, cửa hàng đã xác nhận, `clickToken` còn hiệu lực.
- Lệch thì dừng, không tạo phiên.
- Nếu `session:start` đã gửi thì phiên vẫn còn (không xoá âm thầm). Danh sách / popup / trang phiếu hiện trạng thái phiên đó.

**Trong `background.js`**
- `session:start` **tự dựng** `returnUrl = <posOrigin của env>/danh-sach-phieu-nhan-hang/<grId>`.
- Nếu message gửi `returnUrl` khác thì từ chối (`bad_return_url`). Không điều hướng theo URL lấy từ DOM / message.

### S5. Hợp đồng response danh sách + nút (P2.5)

**Hook (`pos-hook.js`, MAIN)**
- Chỉ đọc response:
  - method `GET`, status 2xx;
  - URL = `<posApiBase của env>/v1/order/goods-receipt/search` với `query` có `pos_id=`.
- Đọc body sau khi trang đã nhận response (không chặn POS):
  - XHR: `responseText` lúc `loadend`;
  - fetch: `res.clone()`.
- Giới hạn: body ≤ 2 MB, ≤ 200 dòng. Vượt giới hạn hoặc sai dạng thì gửi `{seq, ok:false}`, và **không có nút** (fail closed).
- Gửi qua `postMessage` (cùng origin, mark `cgn/pos-hook`, type `gr-list`) gói sau:
  - `{reqSeq, latestReqSeq, queryKey, envId, page, limit, total, rows:[{id, code, status, poId, posId}]}` (rev 2, R1);
  - không body thô, không header, không tên người.

**Nút**
- `<button type="button" class="cgn-rfid-btn" data-cgn-gr="<id>">`, dùng chuột và bàn phím được.
- Chặn `mousedown` / `pointerdown` / `click` / `keydown` (Enter / Space) lan lên dòng hay form.
- Đặt trong `div.flex` ô cuối của dòng (theo outerHTML thật ở G0). Không đụng `.circa-rfid-po-link`, chèn cạnh nút đó nếu có.
- Không trùng: tối đa một nút `.cgn-rfid-btn` mỗi dòng; mã dòng đổi thì thay nút.

### S6. Cache tra QR + lọc refresh (P2.6)

**Cache**
- Khoá cache: `sessionKey | nwResult.at | uid`.
- Mất hiệu lực khi:
  - `nwResult.at` đổi (dữ liệu nhận đổi);
  - quá 10 phút;
  - người dùng bấm "Tra lại".
- Kết quả lỗi / HTTP lỗi không cache.

**`planAndOffer`**
- Single-flight theo `sessionKey`: lượt đang chạy thì gom các lần gọi tiếp thành **một** lượt chạy lại sau.
- `runApply` không đổi: mỗi bước PUT vẫn GET GR mới, so ảnh chụp, và dùng **mã kế hoạch hiện tại** (`apply.js` giữ nguyên).

**Lọc refresh**
- **Grant:** chỉ refresh khi bản ghi grant của **đúng** `env:grCode` đang xem đổi (thêm / xoá / hết hạn).
- **Phiên:** refresh khi `state`, `nwResult.at`, `applyError`, `scanOk` hoặc `retryNotBefore` của phiên đang xem đổi. Đổi `posTabId` / `lease` / `log` thì bỏ qua.
- Test: không bỏ lỡ `received`, `apply_stopped`, grant vừa cấp.

### S7. Panel / hiệu năng (P2.7)

**Panel:** giữ nguyên cơ chế tránh nút v0.1.6 (quét `button`, `a`, `[role=button]`, `input`; mỗi 1 s; cả khi thu nhỏ) **cho tới khi** có ảnh / DOM thật. Chỉ tối ưu nếu số đo vượt ngân sách, và kèm số đo.

**Không làm gì trên trang bán hàng / trang không liên quan**
- Không panel, không observer, không GET.
- Đổi URL theo sự kiện: hook vá `pushState` / `replaceState` + `popstate` → `postMessage`. Bộ đếm dự phòng 3 s.

**Đo trên Edge với DOM thật làm mẫu**, so **cùng trang không cài extension**:
1. Trang bán hàng giả: 0 GET, 0 observer, 0 panel của extension.
2. Danh sách 20 dòng + bơm 300 thay đổi DOM: 0 GET mới khi chỉ xem; thời gian handler của ta (đo bằng `performance.now()` quanh handler, ghi vào biến chỉ đọc qua CDP).
3. Long task quy cho extension đo bằng **trace CDP** (`Tracing` hoặc `Profiler`, lọc theo script URL `chrome-extension://…`) cùng thời gian handler tự đo đã kiểm chứng.
   - `PerformanceObserver('longtask')` chỉ để tham khảo.
   - **Thiếu attribution không được tính là đạt** (PM rev 1, P2).

Ngân sách: < 2 ms mỗi lượt handler, 0 long task > 50 ms quy cho extension. Vượt thì báo số đo + nguyên nhân + sửa trước G2.

### S8. Nâng cấp / phiên (P2.8)

Hướng dẫn cài trong bàn giao v0.2.0:
1. Trước khi đổi thư mục hoặc nâng cấp: popup không còn phiên `received` / `applying` / `apply_stopped` dở; export `chrome.storage` làm bản lưu.
2. Thư mục cố định chỉ giữ ID khi cập nhật **đúng extension đã cài từ chính đường dẫn đó**; không chuyển phiên từ ID cũ.
3. Sau cập nhật, kiểm `chrome.runtime.id` (trang `chrome://extensions`) và `lastUpgrade` trong storage.
4. Không thay file khi đang có lượt nhận / điền.

O1 **không** coi là đã giải bằng việc giữ đường dẫn. O1 nằm trong spec Đợt 2 riêng.

### Test G1 (bổ sung theo PM)

- **Môi trường / cửa hàng:** STG / PRD / host lạ / cửa hàng khác.
- **Response danh sách:** đến muộn; trang đổi dòng; thiếu trường; vượt giới hạn. Theo rev 2:
  - A gửi → B gửi → B về → A về: giữ B;
  - B lỗi: xoá nút;
  - đổi bộ lọc / trang: chỉ nhận lượt mới nhất cùng `queryKey`.
- **Click bị huỷ khi danh sách đổi mà URL giữ nguyên** (rev 2, R2): đổi bộ lọc / trang / dòng `<tr>` bị tái dùng ở giữa từng GET, và ngay trước `session:start`.
- **Thao tác:** click / phím / double click / hai tab.
- **Dữ liệu đổi:** GR / PO đổi sau khi đã hiện danh sách (`code`, trạng thái, cửa hàng, PO không SO).
- **Không tự tạo phiên khi mở GR / SO; phiên cũ tiếp tục.**
- **Rời trang:** route đổi sau từng `await` (từng bước 1–6 ở S1).
- **Header:** thiếu `x-store-id` cùng token → giữ; khác token → dừng.
- **Grant / QR:** grant đúng / khác GR; cache QR theo `nwResult.at`; tra lại.
- **Nhật ký:** `scanAt` ISO, `at` log luôn ISO.
- **Ghi:** một chặn → không PUT.
- **Đột biến** cho từng rào mới. Chạy một mình, không tính ca hết giờ / neo lệch.

---

## Spec Đợt 1 — rev 2 (PM rev 1: `docs/pm/REVIEW-PLAN-v0.2-REV1-20261026.md`)

### R1. Thứ tự lượt danh sách cấp lúc gửi request

**Trong hook (`pos-hook.js`, MAIN)**
- Khi một request **khớp hợp đồng S5** (GET danh sách đúng môi trường) **bắt đầu gửi** (XHR `send`, hoặc lúc gọi `fetch`):
  - tăng `reqSeq` toàn cục của trang;
  - ghi `reqSeq` + `queryKey` vào request đó.
- `queryKey` là URL chuẩn hoá: path + mọi tham số query, đã sắp xếp theo tên. Gồm `query` (cửa hàng, bộ lọc trạng thái, từ khoá…), `limit`, `page`, `order_by`, không bỏ tham số nào. Khoá này không chứa token.
- Ngay lúc gửi, hook phát `{type:"gr-list-request", reqSeq, queryKey, envId}`. Content biết **đang có lượt mới**, nên vô hiệu ngay mọi cú bấm đang chuẩn bị (R2), kể cả trước khi response về.
- Khi response về, hook phát `{type:"gr-list", reqSeq, latestReqSeq, queryKey, …dòng}`.
  - `latestReqSeq` = `reqSeq` lớn nhất đã **gửi**, tính tại thời điểm response này về.
  - Response lỗi / hỏng / vượt giới hạn: `{type:"gr-list", reqSeq, latestReqSeq, queryKey, ok:false}`.

**Trong content (`pos-content.js` / `gr-list.js`)**
- Chỉ nhận response khi `reqSeq === latestReqSeq`, tức đúng request mới nhất đã gửi, **và** `reqSeq > shownSeq`. Khi đó cập nhật `shownSeq = reqSeq`, `shownQueryKey = queryKey`.
- Ca A gửi → B gửi → B về → A về: lúc A về, `latestReqSeq` = B, nên A bị bỏ. Bảng giữ B.
- Ca B lỗi (`ok:false` của request mới nhất): **xoá toàn bộ nút**, `shownSeq = reqSeq`. Không giữ dữ liệu A cũ.
- `queryKey` kèm theo bảng để R2 so.

### R2. Cú bấm gắn với dòng + lượt danh sách đang hiện, kiểm tới sát `session:start`

**Lúc bấm**, tạo `clickToken = { grId, code, rowEl (tham chiếu tới thẻ <tr>), reqSeq: shownSeq, queryKey: shownQueryKey, route: location.href, nonce }`. Token chỉ hợp lệ khi `grId` + `code` có trong bảng của `shownSeq`.

**`stillValid(token)`** đúng khi **mọi** điều sau còn đúng:
1. `token.nonce` vẫn là cú bấm đang hoạt động (không bị cú bấm khác / huỷ thay thế).
2. Không có `gr-list-request` nào mới hơn `token.reqSeq` (`latestReqSeq === token.reqSeq`).
3. `shownSeq === token.reqSeq` và `shownQueryKey === token.queryKey`, tức bộ lọc / trang chưa đổi.
4. `rowEl.isConnected`; ô mã của `rowEl` vẫn có chữ đúng `token.code`; nút `.cgn-rfid-btn` trong `rowEl` vẫn mang `data-cgn-gr === token.grId`. Phát hiện `<tr>` bị tái dùng cho dòng khác.
5. Bảng của `shownSeq` vẫn ánh xạ `token.code → token.grId`.
6. `location.href === token.route`, môi trường và cửa hàng đã xác nhận (S3) không đổi.

**Kiểm ở đâu**
- Sau **mỗi** `await` trong `startFromGr`: GET GR, GET PO, tìm GR theo SO.
- **Ngay trước** `session:start`.
- Sai một điều kiện thì `AbortController.abort()` các GET còn chạy, dừng, báo "Danh sách đã đổi — bấm lại". Không tạo phiên.

**Sự kiện huỷ chủ động** (không chờ tới `await` kế): `gr-list-request` mới, MutationObserver thấy `rowEl` bị gỡ / đổi chữ mã, đổi URL theo sự kiện.

Trang phiếu GR (không có danh sách) dùng token rút gọn: `{grId, route, nonce}` + điều kiện 1 và 6.

**Test G1 thêm**
- Đổi bộ lọc / trang / tái dùng `<tr>` ở giữa từng GET khi URL giữ nguyên → không `session:start`, có thông báo.
- `gr-list-request` mới đến giữa lúc GET PO → huỷ ngay.
- Bấm lại sau khi danh sách ổn định → chạy bình thường.

Chưa code. Chờ PM chốt G0 (ảnh UI v0.1.6 thật + response danh sách + outerHTML đã làm sạch), rồi đối chiếu selector / hợp đồng R1–R2 với dữ liệu thật trước khi viết lối vào danh sách.
