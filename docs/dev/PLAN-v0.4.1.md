> **Operator duyệt 08/11/2026** (plan mode, phiên bf911b64). Bản gốc: kế hoạch đã duyệt trong phiên. Quyết định đi kèm: "Giữ đơn mở" khi thiếu đúng món bán gấp; đầu đọc = bấm hộ Ngắt + hợp đồng `circa-reader/v1` sau (yêu cầu gửi đội QR Scan Log: `docs/dev/REQUEST-QSL-v0.4.1-DAU-DOC.md`).

# Plan v0.4.1 — circa-gr-nextwaves: phiếu phần còn lại + đầu đọc bị QR Scan Log giữ + finding audit v0.4.0

## Context

**Vấn đề 1 — bán gấp → POS tách phiếu.** 07/11 tại Florita, dược sĩ nhận 1 món để bán gấp rồi bấm HOÀN THÀNH. POS tự sinh phiếu phần còn lại cùng PO (GR84673 → GR84803). v0.4.0 dừng an toàn ở 4 chỗ:
- khoá `so_many_gr`;
- vân tay phiếu so với cả đơn → `no_match`;
- màn quét đòi đủ mọi tem;
- `product_not_on_gr`.

Kết quả: phần còn lại phải nhận tay.

**Sự thật đã kiểm** (case doc §8–§11, mẫu đã kiểm SHA-256, main `79a9510` + `757a1aa`, rà mã 08/11):
- **POS:** phiếu mới chỉ có các dòng chưa đủ, SL = SL dòng PO − đã nhận, cùng lô, không mang mã. `item.ref_id` (= id dòng PO) và `detail.ref_id` (= id dòng lô PO) giữ nguyên. PO `items[].received_quantity` tính theo đơn vị dòng, cộng qua mọi phiếu. POS không hỏi xác nhận.
- **Nextwaves:** không sinh phiếu gửi mới; mỗi phiếu gửi chỉ nhận được một lần. Sau khi nhận thiếu: `shipments: []`, PO `PARTIALLY_RECEIVED`, tìm theo SO ra `openShipmentCount 0`.
- **Sửa lại P4 (doc cũ ghi ngược):**
  - Mã **thứ hai** trên chi tiết phiếu (`1793929018293B31` Arrahan, `1793929119118C11` Alpha choay) **chính là UID Nextwaves** (tem con). POS gắn mã này lúc HOÀN THÀNH cho mỗi đơn vị đã quét: GR84803 có 20/20 đơn vị như vậy.
  - Mã **đầu** (`1783950641470B34`, `1789404808860C1270`) là mã QR thuocsi (mã gốc) mà dược sĩ quét. Mã này không có trong Nextwaves.
  - ⇒ Nhờ POS gắn UID Nextwaves cho đơn vị đã quét, extension biết **món nào đã bán gấp**.
  - Nhập số tay thì không có mã nào (staging S6).

**Vấn đề 2 — đầu đọc bị QR Scan Log giữ.** QR Scan Log 0.9.6 giữ cổng Web Serial ở tab `/ban-hang` và chưa có `circa-reader/v1`. v0.4.0 chỉ nhận ra màn quét qua URL `/purchases/receive?po=` khi có phiên. Modal "Nhận hàng bằng cách quét" mở thẳng từ trang PO Nextwaves thì không có khung, không tự kết nối.

Nút "Ngắt kết nối" của QR Scan Log:
- nằm trong host `#circa-rfid-demo-root` (shadow root `open`), là `button[data-action="disconnect"]`, không kiểm `isTrusted`;
- **huỷ lượt đang gửi tem vào giỏ** (`cancelScan`), áp cho mọi tab POS, giữ qua F5;
- nhả Web Lock `circa-qr-scan-log:rfid-reader` sau khi đóng cổng;
- sau khi Ngắt, "Kết nối RFID" luôn gọi `requestPort` (hộp chọn cổng).

**Kèm:** finding audit v0.4.0 1–3 (P2) + P3 4, 6–12, đã hẹn sửa ở v0.4.1. Một gói, cài máy POS một lần.

## Quyết định đã chốt (operator 07–08/11)

- **Hướng 1:** POS tách phiếu. Nextwaves nhận **một lần** cho phần còn lại (ví dụ 21/22). Extension điền phiếu mới.
- **Thiếu đúng món bán gấp → "Giữ đơn mở".** Extension hướng dẫn, và cảnh báo nếu dược sĩ chọn "Đóng đơn dù còn thiếu".
- **Bán gấp:** bắt buộc quét QR (operator lo vận hành). Không nhận Nextwaves riêng món bán gấp. I2 để sau. I6 chấp nhận.
- **Đầu đọc:** v0.4.1 bấm hộ "Ngắt kết nối" của QR Scan Log khi dược sĩ bấm nút. Hợp đồng `circa-reader/v1` để sau, có spec gửi đội QR Scan Log. Không sửa `C:\QR_code\circa-qr-scan-log`.

## Bước 0 — sửa doc + spec cho đội QR Scan Log (trên main, ngay sau khi duyệt)

- **Sửa P4** ở case doc (§2 P4, §10 N7, §11), `state.md` lần 72 và memory: UID Nextwaves là mã POS gắn lúc HOÀN THÀNH.
- **`docs/dev/REQUEST-QSL-v0.4.1-DAU-DOC.md`** (operator chuyển cho đội QR Scan Log):
  1. **Ràng buộc tạm** cho tới khi có hợp đồng. Giữ ổn định, đổi thì báo trước:
     - host `circa-rfid-demo-root`, shadow `open`;
     - `button[data-action="disconnect"]`;
     - panel `data-state` / `data-connection`;
     - tên Web Lock `circa-qr-scan-log:rfid-reader`.
  2. **Sửa nhỏ, nên làm sớm:** Ngắt **không huỷ giữa chừng** lượt đang gửi tem. Hoặc làm nốt như `releaseForOtherTab` (`rfid-content.js:1183`), hoặc tắt nút khi `busy`. Hiện Ngắt khi đang gửi để lại mã gõ dở trong ô tìm POS (`:867`, `:2348`; `canDisconnect` bỏ qua `busy`, `rfid-core.js:1171`).
  3. **Chính:** làm `circa-reader/v1` theo `docs/dev/SPEC-QSL-MUON-DAU-DOC-v1.md`, bổ sung v1.1:
     - `lend` có thể đến khi dược sĩ mở màn quét Nextwaves thẳng, không có phiếu (label "Nhận hàng Nextwaves");
     - trả bằng `getPorts`, không `requestPort`;
     - "Lấy lại đầu đọc".
  4. Kiểm thử bắt buộc (spec §7) + máy thật.
  5. Gửi lại: số bản, mã gói, mẫu `pong` / `lend:result` / `return:result`.
  6. Tuỳ chọn: chạy content script trên POS staging để thử E2E.

## Bước 1 — chụp dữ liệu còn thiếu (chỉ đọc)

- DOM modal "Nhận hàng bằng cách quét" ở 3 trạng thái: chưa kết nối / đã kết nối / có thiếu (radio). Chụp trên staging, **không xác nhận**.
- `GET purchase-orders/<id>` + `GET inter-tenant-shipments/<id>` của PO69611541 sau khi nhận thiếu (`collect()` đọc hai API này).
- PO01974970 production: GET PO, có `goods_receipts`.

Lưu mẫu vào `samples/` (bỏ tên người), gộp `samples/README.md` của main với nhánh (hai thư mục đang lệch).

## A. Phiếu phần còn lại (H2)

**Dữ liệu (`src/lib/pos-model.js`):**
- `normalizeGr` thêm `item.refId`, `item.received`, `detail.refId`, `detail.internalCodes`. `qrCodes` giữ nguyên = `thuocsi_qr_codes`, nên `snapshotOf` / mã kế hoạch không đổi.
- `normalizePo` thêm `items[]` (id, productId, quantity, baseQuantity, unit, received) và `grs[{id, code, status}]`.

**`remainderOf(gr, po, completedGrs)` — hàm thuần.**

Dữ liệu vào: danh sách phiếu lấy từ PO `goods_receipts`; từng phiếu COMPLETED được **GET theo id**. Không dựa vào dòng tìm theo SO, vì dòng PRD chưa chắc có items. Phiếu đang mở không có thêm request.

`ok` chỉ khi đủ tất cả các điều kiện sau:
- PO có ≥ 2 phiếu chưa huỷ, mọi phiếu khác COMPLETED.
- Phiếu đang mở **chưa nhận gì** (received 0 và không có mã). Nếu đã nhận tay một phần → không ok, báo "nhận tay tiếp".
- Mỗi dòng phiếu mở ánh xạ được về dòng PO qua `refId`.
- Theo đơn vị gốc: SL dòng phiếu mở = `baseQuantity` dòng PO − Σ(`received` × `unitRate` của **dòng phiếu đã xong đó**). Dòng PO không có trên phiếu mở thì phải đã nhận đủ.
- Đối chiếu chéo với PO `received_quantity` × base / quantity.
- Không thiếu `unitRate`, không lệch tỉ lệ giữa các phiếu.

Kết quả trả về:
- `excludeUids` = mọi mã (thuocsi + internal) trên các phiếu đã xong. Chỉ phần giao với UID Nextwaves có tác dụng.
- `source` = vân tay cấp PO, tỉ lệ đơn vị gộp từ mọi phiếu. Sản phẩm chỉ có ở phiếu đã xong (ví dụ Arrahan "hộp" ↔ "tuýp") vẫn quy đổi được.
- Chuỗi tách tự đúng.

**Khoá và phiên:**
- `soWriteLock(check, grId, rem)`: `rem.ok` thì không khoá. `check.ok` vẫn là điều kiện trước.
- `startFromGr` (`pos-content.js:386-452`):
  - đặt `fingerprint = rem.ok ? rem.source : grFingerprintSource(gr)`;
  - payload thêm `remainder {completed[codes], excludeUids, lines}`;
  - thêm `remainder` vào danh sách trường `startSession` (`background.js:316-342`) và vào phần gộp khi thử lại (`:311`);
  - với `rem.ok`, **thay** khoá cũ thay vì chỉ cộng thêm, để phiên v0.4.0 cũ trên phiếu đó không kẹt `so_many_gr`.

**Phía Nextwaves:**
- **`nw_partial_received`** (`resolve.js`) khi đơn ứng viên có `openShipmentCount` **có mặt** và = 0 cùng `PARTIALLY_RECEIVED`. Không mặc định 0, sửa `nw-model.js:29`. Phiên sang `no_nw_order` với lý do "Nextwaves đã nhận một phần đơn này — phiếu gửi đã dùng, nhận tay phần còn lại". Có ứng viên khác thì xét như v0.4.0. Hiện trường hợp này rơi vào `no_match` sai lý do.
- **Quy tắc đủ** (`nw-content.js:598-605` **và** điều kiện thoát vòng thử `:575`): phiên có `remainder`, không lỗi / tem lạ, và mọi tem thiếu có UID ∈ `excludeUids` (`expected` có `{epc, uid}`) → coi là đủ, gửi `session:received`.
  - Đối chiếu thêm `missingUnitUids` trong response `receive-scan` (hook đã có `p.response`).
  - Ghi `onMissing` vào nhật ký.
  - `ctxFromSession` chép `remainder`.
  - Tem thiếu khác (kể cả khi POS gắn UID khác đơn vị thực đã bán) → **dừng an toàn** như v0.4.0.
- **Sửa chữ sai sau khi nhận thiếu** (`:600-604`): không còn "quét tiếp…", vì phiếu gửi chỉ nhận một lần.
- **Khung modal khi có `remainder`:** "Phiếu phần còn lại của PO… — món đã bán gấp ở GR… không cần quét; thiếu K món đó → chọn **Giữ đơn mở** rồi Xác nhận". Radio `close_short` đang chọn → dòng đỏ.

**Kế hoạch điền và lời báo ở POS** (tab Nextwaves đóng ngay khi nhận xong, `background.js:492`):
- Helper `unitsForPlan(s)` = `nwResult.units` bỏ UID ∈ `excludeUids`. Dùng ở `planAndOffer` (:971), `verifyFinal` (:1148), `renderApplied` (:886).
- **I6:** biên nhận có tem ∈ `excludeUids` → cảnh báo vàng **trên khung POS**, lưu trong phiên: "Nextwaves đã nhận cả tem món đã bán gấp … — tồn Nextwaves dư, báo vận hành". Vẫn điền.
- **I7:** kế hoạch có `item_not_full` → thêm câu "bấm HOÀN THÀNH bây giờ thì POS tách phần thiếu sang phiếu mới".
- Món nhập số tay (V5): `over` / `received_mismatch` sẵn có chặn cả gói (đúng I4).

**Không làm:** dùng lại kết quả phiên phiếu gốc khi Nextwaves đã nhận trước (V2) → nhận tay, khung báo rõ. Lời báo I2.

## B. Đầu đọc bị QR Scan Log giữ

**Nhận ra modal** (`nw-content.js`):
- dấu hiệu cấu trúc lấy từ DOM chụp ở bước 1 (tiêu đề hộp thoại + "Quét tem của phiếu gửi IT-…"), **không** dựa vào chữ nút (nút đổi thành "Bắt đầu quét" / "Dừng") hay radio (chỉ có khi thiếu);
- áp trên mọi trang Nextwaves của tenant;
- `evaluate()` không còn ẩn khung ngoài `/receive` khi có modal;
- `readerTick` chỉ chạy khi có màn quét / modal (finding 10), `lendTick` vẫn chạy cho phiên, đặt lại `rd` khi modal đóng;
- tự bấm "Kết nối đầu đọc" ≤ 3 lần áp cả cho modal **không có phiên**.

**Khi vẫn chưa kết nối:** background hỏi `cgn:qsl-status` các tab `pos.v2.circa.vn`. `pos-content` chạy ở mọi trang POS. Hàm thuần `qslView(host)` đặt trong `lib` để test được. Có đúng **một** tab có host đang hiển thị, `data-connection` ∈ {connected, waiting_clear, paused} → khung báo "Tab bán hàng (QR Scan Log) đang giữ đầu đọc" + nút **"Lấy đầu đọc cho Nextwaves"**.

**Bấm nút (chỉ khi dược sĩ bấm):**
1. `reader:takeFromQsl` → `cgn:qsl-release` tới **đúng tab đó**.
   - Panel `data-state` = `processing` (đang gửi tem vào giỏ) → **không bấm**, báo "đợi tab bán hàng gửi xong rồi bấm lại".
   - Ngược lại → bấm `button[data-action="disconnect"]:not([disabled])` một lần.
2. `pos-content` chờ `navigator.locks.query()` hết lock `circa-qr-scan-log:rfid-reader` (≤ 5 s) rồi mới trả lời.
3. Tab Nextwaves bấm "Kết nối đầu đọc" **ngay**, không chờ `readerGapMs` 10 s, trong ~5 s kể từ cú bấm của dược sĩ để còn hiệu lực thao tác người dùng. Thử lại tối đa 3 lần, cách 1,5 s.
4. **0 hoặc ≥ 2 tab** khớp, không thấy host / nút, hoặc chờ lock quá hạn → nút **"Mở tab bán hàng"** (focus tab) + "bấm Ngắt kết nối"; quay lại thì tự kết nối.
5. Sau lượt (modal đóng / đã nhận): nhắc "sang tab bán hàng bấm **Kết nối RFID** (chọn cổng)". Có phiên thì nhắc trên khung POS (lưu trong phiên); không phiên thì trên khung Nextwaves.
6. QR Scan Log trả `pong` (bản tương lai) → dùng đường mượn / trả sẵn có của phiên, không bấm hộ. Mượn **không phiên** để bản sau, khi QR Scan Log có hợp đồng.

**File:** `nw/nw-content.js`, `background.js`, `pos/pos-content.js`, `lib/` (hàm `qslView`, kiểm modal), `ui/panel.js`.

## C. Finding audit v0.4.0

- **F1 (P2)** SO tách giao chọn nhầm đơn: đọc số phiếu gửi trong modal. Không thuộc phiên → dòng đỏ trước khi xác nhận.
- **F2 (P2)** — bản rẻ:
  - `session:start` gửi kèm tóm tắt phiếu (dòng / lô / SL / đã nhận);
  - khi `nw_ready`, hàm thuần `precheck()` ở `nw-content` so với `expected`: lẻ, vượt, phiếu đã nhận tay, sản phẩm không có trên phiếu (đã trừ `excludeUids`) → khung Nextwaves báo "điền được N/N" hoặc lý do **trước** khi xác nhận;
  - lỗi tra QR vẫn chỉ biết sau khi nhận.
  - Không làm kế hoạch thử đầy đủ có tra QR: phải thêm đường background → POS, đáng một batch riêng.
- **F3 (P2)** cửa hàng ↔ kho, bảng trong `src/lib/env.js` **và** `src/main/env.js` (phải giống nhau từng byte):
  - PRD: Florita `c476efb2…` ↔ `eb5e2b4f…`; Lumina `31493e74…` ↔ `3f7bd541…`.
  - STG: POS `64a8663b…` ↔ `82bf85e4…`.
  - Cửa hàng đã biết mà kho lệch → khoá (`NW_LOCKS`, `CLAIM_MSG`). Cửa hàng lạ → chỉ cảnh báo.
  - Sửa `env-keys.test.js:76-84` (đang khẳng định không có bảng).
- **P3:**
  - 4: lưu kết quả khớp cuối;
  - 6: đóng `nwTabId` cũ, không gán trùng;
  - 7: không tái dùng tab có lượt nhận;
  - 8: latch luôn có view;
  - 9: giới hạn chiều cao khung thay vì thêm nút đầu đọc vào danh sách né, vì `liftFor` sẽ đẩy khung ra ngoài màn;
  - 10: thuộc B;
  - 11: chữ ký phiên chỉ xét phiên của trang;
  - 12: xoá `autoPlanCheck`.
- **Để sau:** 5 (thu hẹp host, vì sẽ chặn tenant khác) và 13.

## Thứ tự (nhánh `batch/v0.4.1` từ `batch/v0.4-moi-pos` `ec4293c`)

0. Doc + REQUEST-QSL (main).
1. Chụp dữ liệu + gộp samples.
2. P3-11, 12.
3. A.
4. F2 (dùng tóm tắt phiếu của A).
5. B.
6. F1, F3, P3 còn lại.
7. `src/manifest.json` 0.4.1, `package.json` (đang 0.3.1); cập nhật `kiem-sau.js` / `kiem-truoc.js` + `tests/v04.test.js:186`.
8. Gate → review độc lập → đóng gói → QA máy dev → operator cho cài máy POS.

## Kiểm (verification)

**Unit** (`npm test`, hiện 219/219):
- `remainderOf`:
  - GR03954 + GR03877 + PO00006745 (staging) → ok, giao `excludeUids` ∩ UID Nextwaves rỗng (nhập số tay).
  - GR84803 (đặt lại về lúc vừa sinh) + GR84673 + PO01974970 → ok. `excludeUids` ∩ UID Nextwaves PO-2026-000001 = **{`1793929018293B31`}**.
  - Mỗi điều kiện thiếu một → không ok.
  - Phiếu mở đã nhận tay → không ok.
  - Chuỗi 3 phiếu.
  - Hai lô một dòng.
  - Thiếu `unitRate`.
- Vân tay cấp PO:
  - PO00006745 khớp đơn Nextwaves PO69611541 trước khi nhận (1110 ×12 / 5451 ×40 / 2431732 ×2 gốc).
  - GR03954 một mình → `no_match`.
  - Arrahan quy đổi qua tỉ lệ phiếu đã xong.
- `nw_partial_received` từ mẫu tìm theo SO sau khi nhận thiếu; `openShipmentCount` vắng → không coi là 0.
- Quy tắc đủ:
  - tem thiếu ⊆ / ⊄ `excludeUids`;
  - vòng thử thoát sớm;
  - `missingUnitUids` khớp;
  - `onMissing` vào nhật ký.
- `unitsForPlan` qua plan / verify / renderApplied.
- I6 và I7 trên khung POS.
- B (`qslView` thuần + browser-sim):
  - modal không phiên → tự bấm;
  - một / không / hai tab giữ;
  - `processing` → không bấm;
  - chờ lock;
  - lùi về "Mở tab bán hàng";
  - không bao giờ Ngắt khi dược sĩ chưa bấm.
- F1–F3, P3.

**Đột biến:** `scripts/mutate-v0.4.1.py` (kế thừa v0.4.0 195 ca) + ca cho:
- từng điều kiện `remainderOf`;
- quy tắc đủ;
- lọc `excludeUids`;
- `nw_partial_received`;
- điều kiện bấm Ngắt;
- `precheck`;
- F1–F3.

Chạy **một mình**, không song song `node --test`.

**Edge thật** (`scripts/edge-v041.js` mở rộng 43 ca):
- trang Nextwaves giả có modal (DOM chụp ở bước 1) + trang `/ban-hang` giả có **extension QR Scan Log giả** (host / shadow / nút / lock) → nút → Ngắt → nhả lock → kết nối;
- luồng điền phiếu phần còn lại trên trang POS giả;
- không có tác vụ ≥ 50 ms.

**Máy dev** (mỗi lượt ghi cần operator cho phép):
- **Đầu đọc:**
  - QR Scan Log 0.9.6 giữ đầu đọc ở `/ban-hang` production;
  - mở modal nhận của một PO Nextwaves production đang chờ, **không xác nhận**;
  - bấm nút → Ngắt → Nextwaves kết nối → đóng modal → Kết nối RFID lại.
  - (QR Scan Log không chạy trên POS staging.)
- **E2E phiếu phần còn lại trên staging**, cần:
  - phiếu POS cho SOBD1594228 ("Nhập SO thuocsi");
  - POS staging tra được `unitUid` của tem (tem staging `53494D…` là tem giả, chưa chắc tra được);
  - quét **chính UID tem** (không phải QR hộp) cho món bán gấp + HOÀN THÀNH → "Nhận hàng bằng RFID" trên phiếu mới → nhập tem còn lại + Giữ đơn mở → điền → kiểm.

  Không đủ điều kiện thì lượt thật đầu tiên ở production có `kiem-sau.js`.

**Đóng gói và tài liệu:**
- `python -I scripts/pack.py` → ZIP + SHA-256;
- dựng lại từ `git archive` ra cùng mã; `diff -r` với `src/`;
- quét token + tên người;
- `docs/dev/BATCH-v0.4.1.md`, `RUNBOOK` / `QA-v0.4.1-MAY-DEV.md` (gồm: huỷ phiên v0.4.0 cũ trên phiếu phần còn lại), `BUSINESS-FLOW.md`, `state.md`, `HANDOFF-DEV.md`.

## Cần operator (khi tới bước)

- Chuyển `REQUEST-QSL-v0.4.1-DAU-DOC.md` cho đội QR Scan Log.
- Cho phép từng lượt ghi staging cho E2E; có tem thật nếu POS staging không tra được tem giả.
- Cho phép cài máy dev → QA → cài máy POS (Florita, Lumina).
