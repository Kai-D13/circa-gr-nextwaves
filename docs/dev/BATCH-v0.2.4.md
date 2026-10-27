# Batch v0.2.4 — P2: khung trang phiếu trong luồng trang (27/10/2026)

**Căn cứ:**
- `docs/pm/REVIEW-A1-RUNBOOK-P2-v0.2.4-20261027.md` §2 (PM chọn phương án A có điều kiện, commit `d8c6569`);
- spec `docs/dev/SPEC-P2-v0.2.4-KHUNG-PHIEU.md`;
- **sửa theo `docs/pm/AUDIT-PRELIM-v0.2.4-P2-20261027.md`** (commit `ee25ce8`, 1 P1 + 2 P2) — xem §1b;
- **sửa theo `docs/pm/AUDIT-REV1-v0.2.4-P2-20261027.md`** (commit `edfbd05`, 1 P1 + 1 P2) — xem §1c.

**Nhánh:** `batch/v0.2-rfid`, runtime **`28d1f9c`**, từ `f76cbcc` (v0.2.3). Bốn commit runtime:
- `81790f7` P2;
- `b227585` bỏ view phiếu cũ về muộn trên trang phiếu khác;
- `a8d49a1` sửa ba finding PM audit sơ bộ;
- `28d1f9c` sửa hai finding PM audit rev 1.

Đầu nhánh **`c08f709`** — chỉ test / script (đóng 2 ca đột biến sống, §2a); `src/` = `28d1f9c`, gói không đổi.

**Gói:** `dist/circa-gr-nextwaves-v0.2.4.zip`, 19 file.
- SHA-256 `0bb73e2d8297840cd1796d5510bb5350302a6212fcf8386b16e9a66188c03d57`, **mã gói `0BB73E2D`**.
- Dựng lại từ checkout sạch `28d1f9c` ra cùng SHA. Giải nén `C:\circa-gr-nextwaves-v0.2.4` khớp từng file với `src/` (`diff -r` rỗng); `lib/env.js` = `main/env.js`.
- **Ba bản cũ đã bị thay** (cùng tên file, chưa ai cài):
  - `95BECDEA` (`a8d49a1`) và `E8531EB4` (`b227585`) bị PM chặn;
  - `6B9E495E` (`81790f7`) là bản dựng trung gian, chưa từng giao.
- DIFF cho PM:
  - `dist/circa-gr-nextwaves-v0.2.4-vs-f76cbcc.diff` / `.stat.txt`: `src/` 4 file +416 / −69; cả nhánh 17 file;
  - **riêng phần sửa theo audit rev 1:** `dist/circa-gr-nextwaves-v0.2.4-vs-a8d49a1.diff` (`src/` 2 file +45 / −15 — `lib/pos-model.js`, `pos/pos-content.js`; cả commit 8 file);
  - phần audit sơ bộ: `dist/circa-gr-nextwaves-v0.2.4-vs-b227585.diff`.

**Chưa cài.** Không thay bản v0.2.3 đang dùng cho lượt A1 (GR03887) giữa lúc nhận và HOÀN THÀNH. Cài v0.2.4 lên Chrome staging chỉ sau khi PM audit nguồn / gói.

## 0. Sự thật mới đo trên trang thật (chỉ đọc, 27/10 tối, GR03887, 1095×756) — sửa spec §1

- **Cả trang (window) cuộn**, không phải khung `div.relative.flex.flex-col.overflow-scroll`:
  - khung đó cao theo nội dung (1108px), `scrollHeight − clientHeight = 0`, gán `scrollTop` không đổi gì;
  - window cuộn được 489px.
- Hệ quả: một khối thử `position: sticky; top: 40px` đặt trước `#all-receipt` **không dính** (top 304 → −96 sau khi cuộn 400px). CSS sticky dính theo tổ tiên `overflow` gần nhất; tổ tiên đó lại không cuộn.
- Spec §1 ghi "khung cuộn của trang (không phải window)" là **sai**, do lần khảo sát trước đọc ở scroll 0.
- Muốn dính phải chuyển sang `fixed` hoặc dịch bằng JS, tức lại thành khối phủ lên dòng sản phẩm. PM không cho dùng `fixed` góc màn hình.
- **v0.2.4 dùng phương án dự phòng PM đã duyệt:** khung trong luồng, **không dính**, ở mọi cỡ màn hình.
  - Khi mở trang ở đầu (POS tự về phiếu sau khi nhận; tải lại sau khi điền), khung nằm ngay dưới thẻ thông tin, trong khung nhìn.
  - Dược sĩ cuộn xuống bảng thì khung cuộn đi theo trang.
- Breadcrumb là `position: fixed` (top 50, cao 40); thanh HỦY / HOÀN THÀNH `fixed` góc dưới phải. Khung trong luồng không chồng hai thanh này khi đứng yên. Khi cuộn, nội dung trang và khung đều đi dưới chúng như mọi phần tử khác.

## 1. Thay đổi runtime (`src/`: 4 file, +416 / −69 — `ui/panel.js`, `pos/pos-content.js`, `lib/pos-model.js`, `manifest.json`)

*(Mô tả dưới đây là v0.2.4 lần giao đầu. Phần sửa theo hai lượt audit ở §1b, §1c; chỗ khác nhau: chỗ gắn / kiểm mã phiếu nay ở `lib/pos-model.js` `grPageAnchor`; đổi route gỡ khung kể cả khi đang ghi.)*

### `ui/panel.js` — thêm `createInlinePanel(brand, { find, onMissing, onFound })`; khung nổi cũ giữ nguyên

- **Vị trí:** host Shadow DOM (đóng) chèn **ngay trước** phần tử `find(code)` trả về, cùng cha (`insertBefore`). `position: static`, chiếm chỗ thật. **Không bao giờ chèn vào `body`.**
- **Bố cục:**
  - tiêu đề + nút thu nhỏ;
  - thân (dòng chữ + bảng kế hoạch) cuộn riêng, tối đa `min(40vh, 320px)`;
  - **chân khung chứa nút**, luôn thấy (nút "Điền" không bị đẩy vào vùng cuộn).
- **Vẽ lại:** MutationObserver (`childList` + `characterData`, toàn trang).
  - Khung đã đúng chỗ (còn trong trang, anchor còn, ngay trước anchor) → không làm gì. Vì vậy không có vòng.
  - Bị gỡ / anchor mới → gắn lại một host duy nhất, giữ trạng thái thu nhỏ.
  - Quá 20 lần gắn trong 2 s (trang tranh giành) → bỏ, `onMissing("unstable")`.
- **Chưa có anchor:** chờ tối đa 10 s (observer + kiểm mỗi 250 ms) → `onMissing("missing")`. Anchor xuất hiện sau đó → gắn + `onFound()`.
- **Thu nhỏ:** không tự thu nhỏ. Đã thu nhỏ tay mà view mới cần chú ý và khác view lúc thu nhỏ → **tự mở lại**.
  - Cần chú ý = cảnh báo / lỗi / có nút hành động chính.
  - Nút là `<button type="button">`, có `focus-visible`. Nút thu nhỏ có `aria-label`, `aria-expanded`.
- `renderView()` tách ra dùng chung; khung nổi (danh sách không dùng, `/chi-tiet-so`, Nextwaves) vẽ y như v0.2.3.

### `pos/pos-content.js`

- **Một chỗ vẽ `panel`:**
  - trang phiếu (`/danh-sach-phieu-nhan-hang/<grId>`) → khung trong luồng;
  - trang khác (`/chi-tiet-so/<SO>`) → khung nổi cũ.
- **Chỗ gắn `grAnchor(code)`:**
  - `document.getElementById("all-receipt")`. Không dùng `querySelector("table")`: bảng đầu tiên là bảng thông tin phiếu;
  - view của một phiếu mang `grCode` (`showGr`). Khối đứng trước anchor (breadcrumb / thẻ thông tin) phải chứa đúng mã đó; chữ của chính khung không tính;
  - view chưa biết phiếu (đang chờ POS tải, lỗi đọc phiếu) gắn không cần mã. Các view này không có nút ghi.
- **W1 fail closed:**
  - `runApply` chỉ chạy khi URL là trang của đúng phiếu **và** khung đang gắn đúng chỗ cho đúng mã phiếu (`anchoredFor`);
  - sai → báo "Không điền được — khung chưa gắn đúng trang phiếu", **không giành quyền, không tiêu cấp phép, 0 PUT**.
- **Thiếu chỗ gắn** (`missing` / `unstable`) → khung **nổi** báo "Giao diện phiếu nhận đã đổi — extension không điền phiếu này":
  - chỉ một nút "Kiểm tra lại";
  - ghi `ui_anchor_missing` vào nhật ký phiên;
  - view mới không xoá lỗi này. Có lại chỗ gắn → gỡ khung nổi, vẽ lại trong luồng.
  - Không có đường fallback nào hiện nút "Điền" ở khung nổi.
- **`/chi-tiet-so` có cấp phép:** thay nút "Điền" bằng "Mở phiếu GR…" (chuyển trang). Nút ghi chỉ nằm trong khung trong luồng của trang phiếu. *(Dev thêm cho đúng ý PM "không nút Điền trên khung nổi"; trước đây trang này hiện nút Điền ở khung nổi.)*
- **Đổi route SPA** → gỡ khung của trang cũ ngay, trừ khi đang ghi. Trước đây view phiếu cũ nằm lại tới khi đánh giá xong trang mới.
- **Trên trang phiếu, view của phiếu khác bị bỏ** (`showGr`). Trường hợp: lượt đánh giá cũ (vd. do cấp phép kích hoạt, đang tra QR) về muộn sau khi đã đổi route.
  - Kiểm mã phiếu khi gắn khung đã chặn gắn sai chỗ.
  - Nhưng view đó nằm chờ 10 s rồi báo lỗi giao diện sai, nếu GET phiếu mới chậm.
- **Không đổi:**
  - phiên, khoá, cấp phép, plan hash, `apply.js`, background;
  - Nextwaves;
  - danh sách (`gr-list.js`);
  - nội dung / nút của từng trạng thái.

## 1b. Sửa theo PM audit sơ bộ (`a8d49a1`; test tái hiện viết và chạy hỏng trên mã cũ TRƯỚC khi sửa)

| Finding | Tái hiện trên mã cũ `b227585` | Sửa | Sau khi sửa |
|---|---|---|---|
| **P1** — `anchoredFor()` / observer không đọc lại mã phiếu khi `#all-receipt` giữ nguyên | **Edge, gói `E8531EB4`:** chỉ đổi chữ GR03880 → GR09999 trên breadcrumb + thẻ thông tin rồi bấm Điền trong **cùng tác vụ** (CDP `callFunctionOn` trên nút: đổi chữ rồi `this.click()`, trước observer) → **5 PUT ghi vào GR03880, cấp phép tiêu, phiên `applied`**. Node (`panel.js` thật trên DOM giả): `anchoredFor` vẫn `true` sau khi đổi mã | `panel.js`: `valid() = placed() && find(code) === anchor`, đọc DOM **ngay lúc gọi**. Dùng ở `anchoredFor` (guard trước `session:claimApply`), ở `check()` (observer) và lúc hết 10 s. Sai → observer gỡ khung, chờ mã đúng (quá 10 s → khung nổi báo lỗi) | Edge: **0 PUT, cấp phép còn, phiên `received`**; observer gỡ khung; mã trở lại → gắn lại. Node: `anchoredFor` `false` trước observer, khung gỡ sau observer |
| **P2** — kết quả lượt đánh giá GR cũ về muộn vẽ khung nổi trên danh sách / trang khác | Node: giữ tra QR của GR03878 (đã có cấp phép), SPA sang danh sách / bán hàng, thả → **1 khung nổi** trên trang mới (cả hai trang) | `pos-content.js`, router `panel.show`. URL lúc bắt đầu `evaluate()` khác URL hiện tại → bỏ (kết quả lượt cũ). Danh sách / trang không liên quan → **không bao giờ vẽ khung** (F4) | 0 khung, 0 nút Điền, 0 PUT, cấp phép còn. Thêm hai ca để mỗi lớp có test riêng: lỗi phiếu cũ về muộn trên trang phiếu khác; đang điền (PUT treo) mà sang danh sách → tiến trình không vẽ khung nổi, vẫn điền đủ |
| **P2** — đang thu nhỏ, cảnh báo đổi nội dung giữ tiêu đề + nút → không mở lại | Edge gói `E8531EB4`: lần trước dừng `put_failed` → thu nhỏ → đổi lý do `gr_changed` → **34px → 34px**. Node: không mở lại | `viewSig` gồm tone, tiêu đề, **dòng chữ, bảng**, nhãn nút. Vẽ lại cùng nội dung → cùng nhận dạng → giữ thu nhỏ (không mở lại vô hạn). View không cần thao tác (đang điền i/n) đổi nội dung → vẫn giữ thu nhỏ | Edge 34px → 301px. Node: dòng chữ / bảng đổi → mở lại; cùng nội dung → giữ |

## 1c. Sửa theo PM audit rev 1 (`28d1f9c`; test tái hiện chạy hỏng trên mã cũ TRƯỚC khi sửa)

**Lưu ý chung:** "5 PUT" ở các ô dưới là PUT vào **server giả** (CDP Fetch) trong Edge headless, **không phải ghi vào POS thật**.

**P1 — mã phiếu không đồng nhất giữa thẻ thông tin và breadcrumb.**
- **Tái hiện trên `a8d49a1` / gói `95BECDEA`** (Edge, DOM thật): chỉ đổi mã trên **thẻ thông tin** GR03880 → GR09999, breadcrumb giữ GR03880, giữ `#all-receipt` và URL. Bấm Điền **cùng tác vụ** → **5 PUT vào server giả, cấp phép tiêu, phiên `applied`**.
- **Sửa (`lib/pos-model.js` `grPageAnchor(doc, code)`, `pos-content.js` dùng hàm này):**
  - **mã chuẩn = thẻ thông tin phiếu**, tức khối đứng ngay trước `#all-receipt` (bỏ qua khung extension);
  - thẻ thông tin phải có **đúng một** mã `GR\d+` và mã đó **bằng chính xác** mã của view (không so chuỗi con);
  - khối đứng trước nữa (breadcrumb) mang **mã GR khác** → `null` (chưa rõ trang hiện phiếu nào → fail closed). Breadcrumb không mang mã thì chỉ thẻ thông tin quyết; breadcrumb không bao giờ tự mở khoá;
  - URL (`grId`) vẫn kiểm riêng trong `onGrPageOf`. Dùng ở mọi chỗ cũ: `anchoredFor` (guard trước `session:claimApply`), observer, hết 10 s.
- **Sau khi sửa:**
  - Edge: cả hai chiều (thẻ thông tin GR09999 + breadcrumb GR03880; breadcrumb GR09999 + thẻ thông tin GR03880) bấm Điền cùng tác vụ → **0 claim (phiên vẫn `received`), 0 PUT, cấp phép còn**. Khung đổi sang "Không điền được"; "Kiểm tra lại" khi mã đã đồng nhất → nút Điền trở lại.
  - Node: `grPageAnchor` chạy thật trên `tests/fake-dom.js` — hai khối bất đồng (cả hai chiều), khớp chính xác (`GR0388`, `R03887`), thẻ thông tin hai mã, breadcrumb không mã, khung đứng giữa có chữ mã cũ, thiếu thẻ thông tin.

**P2 — đang điền GR A mà chuyển SPA sang `/chi-tiet-so` SO B.**
- **Tái hiện trên `a8d49a1`** (Node, PUT đầu treo): trên trang SO B vẽ **"Đang điền 2/6 … 6/6", "Đã điền 12 UID"** của GR03878.
- **Sửa (`pos-content.js`):**
  - đổi route **luôn** gỡ khung, kể cả khi đang ghi. Tiến trình ghi chạy tới hết theo hợp đồng cũ (lease, `finishApply`, tải lại trang);
  - trên `/chi-tiet-so`, view của một phiếu chỉ vẽ khi phiếu đó nằm trong danh sách phiếu của SO, đọc ở lượt `evaluateSo` của **chính URL hiện tại** (`soPage`). Đang ghi thì `evaluateSo` không chạy, nên tiến trình của A không bao giờ hiện trên SO B.
- **Sau khi sửa:**
  - 0 view của GR03878 trên SO B; 6 PUT, phiên `applied`, lease trả; trang SO B tự tải lại hiện "SO SOBD1599999: không có phiếu nhận đang chờ nhận";
  - **thêm:** đã xem SO A (chứa GR03878) → về phiếu → điền → sang SO B: không dùng danh sách phiếu cũ của SO A;
  - **thêm:** lượt `evaluateSo` của SO A về muộn sau khi đổi SO A → B: không vẽ (đạt cả trên `a8d49a1` nhờ kiểm `evalHref`; giữ làm hồi quy).

## 2. Kiểm (mã cuối `28d1f9c`, gói `0BB73E2D`)

| Mức | Kết quả |
|---|---|
| `npm test` | **159/159 × 3** trên `28d1f9c` (154/154 × 3 trên `a8d49a1`; 145/145 × 6 trên `b227585`). +24 test so với v0.2.3 (xem dưới) |
| Đột biến Node `python -I scripts/mutate-v0.2.4.py` (130 = 102 cũ + 12 P2 + 8 audit sơ bộ + 8 audit rev 1) | **128/130** trên `28d1f9c` (0 ANCHOR, 0 hết giờ). **2 ca sống đều là lỗ test, không phải lỗi mã** — xử lý ở commit chỉ-test (§2a); **chạy lại 2 ca: ĐANG CHỜ** (sau khi bộ Edge xong, để không làm nhiễu thời gian đo) |
| Đột biến DOM trên Edge `node scripts/mutate-edge-v0.2.4.js` (25 = 9 cũ trên `edge-check.js` + 12 P2 + 2 audit sơ bộ + 2 audit rev 1 trên `edge-gr-page.js`) | **ĐANG CHẠY** lúc viết (28/10 01:15): 15/15 ca đầu bị bắt (9 ca cũ + 6 ca P2, trong đó ca "bỏ giới hạn gắn lại" bị bắt vì trang treo → watchdog 360 s), còn 10 ca. Dev bổ sung số cuối vào đây |
| Edge `node scripts/edge-gr-page.js` (**mới**, 94 mục) | `src/` 94/94. **Gói giải nén `0BB73E2D`:** **94/94**; lượt 2 ĐANG CHỜ (cuối chuỗi chạy nền). Gói bị chặn `95BECDEA`: **hỏng 7/91** (P1 rev 1: 5 PUT server giả, các mục sau đó hỏng theo). Gói bị chặn `E8531EB4`: hỏng 7/90 (audit sơ bộ). Đối chứng gói v0.2.3 trên bản 94 mục: ĐANG CHỜ (bản 83 mục trước đó: v0.2.3 hỏng 42/83 — khung nổi phủ −/ô số/+/icon dòng sản phẩm ở cả 3 cỡ khi mở rộng) |
| Edge `node scripts/edge-check.js` (42 mục) | `src/` 42/42; **gói giải nén `0BB73E2D`:** **42/42**; lượt 2 ĐANG CHỜ |

**Race lộ ra khi chạy lặp:**
- Trên `81790f7`, test "đổi route sang phiếu khác (GET phiếu mới còn chờ)" hỏng 2/9 lượt.
- Nguyên nhân: lượt đánh giá cũ do cấp phép kích hoạt vẽ view GR03878 sau khi route đã sang phiếu khác.
- Sửa `b227585` (§1, `showGr`). Thêm test giữ lượt tra QR để race chắc chắn xảy ra: bỏ dòng sửa thì test hỏng 3/3 lượt.

**`npm test` — 24 ca mới:**
- **`runtime.test.js` (14):**
  - mọi trạng thái trang phiếu (nút bắt đầu → đang kiểm → đã khớp → tra UID → chỉ xem → có cấp phép → đang điền → đã điền → HOÀN THÀNH) vẽ vào khung **trong luồng** mang mã GR03878; 0 view ở khung nổi; 6 PUT;
  - thiếu chỗ gắn: khung nổi chỉ "Kiểm tra lại"; có cấp phép vẫn không nút Điền, 0 PUT, cấp phép còn, nhật ký phiên có `ui_anchor_missing`; chỗ gắn có lại → trong luồng, điền đủ;
  - bấm Điền khi khung vừa mất chỗ gắn / khi URL đã sang trang khác → không giành quyền, không tiêu cấp phép, 0 PUT;
  - đổi route phiếu → danh sách → quay lại: gỡ ngay, rồi có lại nút Điền;
  - `/chi-tiet-so` có cấp phép → chỉ "Mở phiếu GR03878", bấm → trang phiếu có nút Điền;
  - đổi route khi GET phiếu mới còn chờ → không còn khung / nút phiếu cũ;
  - lượt cũ về muộn (tra QR giữ lại) → không vẽ view GR03878 lên trang phiếu khác;
  - *(PM audit)* lượt cũ về muộn sau khi sang **danh sách** / **bán hàng** → 0 khung (2 ca);
  - *(PM audit)* lỗi của phiếu cũ về muộn trên trang phiếu khác → không hiện;
  - *(PM audit)* đang điền (PUT treo) mà sang danh sách → không khung nổi, vẫn đủ 6 PUT;
  - *(PM rev 1)* đang điền (PUT treo) mà sang `/chi-tiet-so` SO khác → gỡ khung ngay, 0 view GR03878 trên SO B, 6 PUT, `applied`, lease trả;
  - *(PM rev 1)* đã xem SO A → điền → sang SO B: không dùng danh sách phiếu cũ của SO A;
  - *(PM rev 1)* lượt `evaluateSo` SO A về muộn sau khi đổi sang SO B → không vẽ.
- **`panel.test.js` (3):**
  - `needsAttention`;
  - `viewSig` (gồm dòng chữ / bảng);
  - nguồn: chỗ gắn `getElementById("all-receipt")`, không `querySelector("table")`, khung trong luồng không chạm `document.body`.
- **`panel-inline.test.js` (7, mới).** Chạy **thật** `createInlinePanel` của `panel.js` trên `tests/fake-dom.js` (cây phần tử, nút chữ, shadow root, MutationObserver chỉ chạy khi test gọi `flush()`):
  - P1 đổi mã giữ anchor: `anchoredFor` sai ngay, trước observer;
  - P2 thu nhỏ;
  - gắn lại / không vòng;
  - tranh giành → `unstable`;
  - thiếu anchor → `missing` → `onFound`;
  - *(PM rev 1)* `grPageAnchor`: mã chuẩn trên thẻ thông tin, khớp chính xác, breadcrumb bất đồng cả hai chiều, khung đứng giữa;
  - *(PM rev 1)* chỉ thẻ thông tin đổi mã (breadcrumb mã cũ) → `anchoredFor` sai ngay, observer gỡ khung.
- Trình duyệt giả có khung trong luồng giả: `t.setAnchor(bool)` mô phỏng có / mất chỗ gắn (`onMissing` / `onFound`); `floatViews` / `inlineViews` tách hai loại khung.

**`edge-gr-page.js`** (Edge headless + gói giải nén; trang phiếu = DOM + CSS thật GR03887 đổi mã sang GR03880; dữ liệu thật lượt GR03880 26/10; server giả CDP Fetch):
- **7 trạng thái × 3 cỡ (1095×756, 1366×768, 1440×900) × 3 phép kiểm.** Trạng thái: `nw_ready`, chỉ xem, có cấp phép, lần trước dừng + có cấp phép, đang điền ở tab khác, lỗi đọc phiếu, đã điền. Phép kiểm:
  1. Một khung, ngay trước `#all-receipt`, `position: static`, dưới thẻ thông tin.
  2. **52 điều khiển vùng sản phẩm** (ô tìm, "In tem", ảnh, ô lô + nút mở, −, ô số, +, 2 icon, "+ Thêm lot-date") + HỦY + HOÀN THÀNH: cuộn tới giữa khung nhìn, `elementFromPoint` trúng chính nó.
  3. Mọi nút trong khung: chuột thật (CDP `Input`) tới điểm giữa, nút nhận `:hover`.
- Kế hoạch đúng **#E33C777A, 11 UID / 5 lô** như lượt thật.
- **Thu nhỏ tay:** còn 34px trong luồng.
  - Có cấp phép → tự mở lại (301px).
  - *(PM audit)* Thu nhỏ khi đang báo lần trước dừng, rồi đổi lý do dừng (cùng tiêu đề + nút) → tự mở lại (34 → 301px).
- **Vẽ lại:**
  - lọc;
  - thay thẻ sản phẩm (khung bị gỡ theo);
  - thay cả cột → luôn 1 khung đúng chỗ; nghỉ 2 s gắn lại **0 lần** (hai lượt).
- **Route SPA:**
  - sang phiếu khác → không còn nút Điền / mã GR03880;
  - quay lại → nút Điền.
- ***(PM rev 1 P1)* Mã không đồng nhất, cả hai chiều** (chỉ thẻ thông tin GR09999 / chỉ breadcrumb GR09999), đổi → bấm Điền → trả mã trong **cùng tác vụ**:
  - 0 claim (phiên vẫn `received`), 0 PUT, cấp phép còn;
  - "Kiểm tra lại" → nút Điền trở lại.
- ***(PM audit P1)* Chỉ đổi chữ mã phiếu** trên **cả** breadcrumb và thẻ thông tin (giữ `#all-receipt`, không đổi route) **và bấm Điền cùng tác vụ, trước observer:**
  - 0 PUT, cấp phép còn, phiên `received`;
  - observer gỡ khung (0 khung);
  - quá 10 s → khung nổi báo lỗi;
  - mã trở lại bằng sửa nút chữ → khung trong luồng, lỗi gỡ.
- **Trang tranh giành** (observer của trang gỡ khung ngay khi gắn) → bỏ sau 20 lần, khung nổi "liên tục vẽ lại", không nút Điền, trang không treo. Hết tranh giành → "Kiểm tra lại" → trong luồng.
- **W1 bằng bàn phím** (CDP `DOM.focus` + Enter trên nút Điền) → 5 PUT đúng thứ tự / lượng / mã như lượt thật, tải lại → "đã điền 11 UID"; cấp phép đã tiêu.
- **Trace CDP từ lúc mở trang** (nạp script, mọi trạng thái, vẽ lại, tranh giành, điền): 169 tác vụ extension, dài nhất 5,2 ms (gói `95BECDEA`) / 10–15 ms (`src/`, máy bận); **không tác vụ ≥ 50 ms**.
- **Trang không có `#all-receipt`** → sau 10 s khung nổi báo lỗi, chỉ "Kiểm tra lại", 0 PUT, cấp phép còn.

**`edge-check.js` đổi:**
- mục 3 dùng trang phiếu DOM thật (khung trong luồng);
- mục 4 thành "trang không có `#all-receipt` → khung nổi báo lỗi, không nút Nhận hàng / Điền / Mở Nextwaves; khung nổi không chồng HỦY / HOÀN THÀNH ở 3 cỡ";
- ca "received → applied" chờ tới 5 s thay vì 1,2 s cố định (một lượt hỏng do máy bận; không liên quan P2).

### 2a. Hai ca đột biến Node sống trên `28d1f9c` — lỗ test, xử lý chỉ ở test / script (không đổi `src/`, không đổi gói)

| Ca | Vì sao sống | Xử lý |
|---|---|---|
| "P2 lượt đánh giá cũ về muộn vẽ view phiếu cũ lên trang phiếu khác" (gỡ dòng kiểm GR khác trong `showGr`) | Lớp `evalHref` (audit sơ bộ) đã chặn trước kịch bản test cũ (lượt đánh giá cũ về muộn). Dòng kiểm GR vẫn là lớp **duy nhất** chặn tiến trình ghi của GR A khi đã sang trang phiếu GR khác: lúc đó `evalHref` = trang mới | Thêm test `runtime.test.js`: đang điền GR03878 (PUT treo) → SPA sang trang phiếu khác → thả → 0 view của GR03878 trên trang đó, đủ 6 PUT. **Đạt** trên `28d1f9c` |
| "F4 thành công vẫn hiện khung nổi trên danh sách" (ca cũ v0.2.3) | Router v0.2.4 không bao giờ vẽ khung trên danh sách; đột biến ở tầng trên thành **tương đương** (không còn khác biệt quan sát được). Hàng rào router có ca riêng "PM P2 vẽ khung nổi trên danh sách (F4)" — đã bị bắt | Đổi thành **đột biến kép**: gỡ cả chặn danh sách của router → test F4 phải hỏng. `mutate-v0.2.4.py` hỗ trợ ca kép (phần tử thứ 5 = các cặp neo / thay thêm) |

## 3. Rủi ro còn mở

- Mẫu DOM + CSS là **một lần chụp** trang GR03887 (Chờ nhận). Trạng thái Đang nhận / đã điền có thể khác chút; thanh thao tác thật đã kiểm riêng từ v0.1.6.
- Khung không dính: dược sĩ cuộn xuống bảng thì không thấy khung. Ở các thời điểm cần thao tác (về phiếu sau khi nhận, sau khi điền), trang mở ở đầu nên khung nằm trong khung nhìn.
- 10 s chờ chỗ gắn: trang tải chậm hơn thì báo lỗi giao diện trước, rồi tự gỡ khi bảng hiện (đã kiểm).
- Quan sát trang thật ở ~1095px sau khi cài (PM yêu cầu) chưa làm.

## 4. Đề xuất bước tiếp (dev đề xuất — PM quyết)

1. **PM audit gói `0BB73E2D`** (source / gói / Edge), dùng số đột biến cuối khi dev bổ sung vào §2.
2. **Thứ tự A1 và v0.2.4.** PM chọn một trong hai:
   - **(a) Giữ runbook như đã duyệt.**
     - A1 chạy trên v0.2.3 (`40236D67`).
     - Xong HOÀN THÀNH mới cài v0.2.4, rồi quan sát **một** trang phiếu thật ~1095px, chỉ đọc: khung + cột SL nhận + HỦY / HOÀN THÀNH dùng được.
     - W1 trên v0.2.4 đã đạt hồi quy Edge (server giả, dữ liệu thật GR03880). Một lượt W1 **thật** trên v0.2.4 cần SO / GR mới có tem — operator quyết.
   - **(b) Nếu PM đạt v0.2.4 trước khi operator sẵn sàng 15 tem:** chạy A1 thẳng trên v0.2.4.
     - Một lượt thật vừa đóng G3b / W1 vừa kiểm UI P2 trên trang thật.
     - Đổi dòng "Extension" của runbook sang v0.2.4 / `0BB73E2D`; cài **trước** chặng 1, không đổi giữa chặng.
     - Dev khuyên (b): tiết kiệm một lượt nhận thật (tem / SO staging có hạn). Nội dung khung và hành động không đổi giữa v0.2.3 và v0.2.4, chỉ đổi vị trí.
3. **Merge `batch/v0.2-rfid` → `main`:** sau A1 đạt + P2 đạt UI thật (staging done).
4. **Đợt 2 — discovery chỉ đọc:** O1 (tìm lại đơn đã nhận theo PO / phiếu gửi / biên nhận) và tra QR mã POS thêm sau HOÀN THÀNH.
   - **Chưa bắt đầu.** Thời gian 27–28/10 dành cho ba vòng audit P2.
   - Dev đề xuất làm ngay sau khi PM nhận gói này, song song với A1 (không đụng phiên / gói A1).
5. **Mốc:** 30/10 (staging done) còn khả thi nếu PM đạt `0BB73E2D` trong 28/10 và A1 chạy 28–29/10. Không thì dời theo gate, như PM đã ghi.

## 5. Danh mục chuyển PM

Thư mục scratchpad của dev (viết tắt `<SP>` dưới đây): `C:\Users\Administrator\AppData\Local\Temp\claude\c--QR-code\bf911b64-411e-4b58-853e-f4468dd36a18\scratchpad`

| Mục | Ở đâu |
|---|---|
| Báo cáo này | `docs/dev/BATCH-v0.2.4.md` (`main`) |
| Spec P2 (đính chính khung cuộn / sticky) | `docs/dev/SPEC-P2-v0.2.4-KHUNG-PHIEU.md` (`main`) |
| Runbook A1 (đã sửa theo PM, PM đạt gate trình operator) | `docs/dev/RUNBOOK-A1-GR03887-20261027.md` @ `b4cfc67` |
| Mã | nhánh `batch/v0.2-rfid`: runtime `28d1f9c`, đầu `c08f709` (chỉ test). Worktree `<SP>\wt-v02` |
| DIFF | `<SP>\wt-v02\dist\`: `circa-gr-nextwaves-v0.2.4-vs-f76cbcc.diff` + `.stat.txt` (cả v0.2.4); `-vs-a8d49a1.diff` (sửa audit rev 1); `-vs-b227585.diff` (sửa audit sơ bộ) |
| Gói | `<SP>\wt-v02\dist\circa-gr-nextwaves-v0.2.4.zip`, SHA-256 `0bb73e2d8297840cd1796d5510bb5350302a6212fcf8386b16e9a66188c03d57`; giải nén `C:\circa-gr-nextwaves-v0.2.4` |
| Kết quả thô bộ kiểm cuối | `<SP>\final-0BB73E2D\` (`egp-pkg-*.txt`, `ec-pkg-*.txt`, `mut-node.txt`, `mut-edge.txt`, `ctrl-023.txt`) |
| Mẫu DOM trang phiếu | `samples/pos-stg-gr-page-GR03887-20261027.{html,css}` (nhánh batch; đã làm sạch) |
