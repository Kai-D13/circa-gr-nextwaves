# Kế hoạch v0.2 — nút "Nhận hàng bằng RFID" trên POS, sửa lỗi tồn, sẵn sàng production (Florita)

**Trạng thái:** đề xuất của dev-team ngày 26/10/2026. Operator đã đồng ý hướng; **chờ PM (Codex) duyệt spec** trước khi code Đợt 1.
Căn cứ: yêu cầu operator 26/10, mã tham khảo extension Nextwaves `circa-rfid` (chỉ đọc, không chạy), audit mã hiện tại, response danh sách GR thật trong Net Capture 26/10 12:08.

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
