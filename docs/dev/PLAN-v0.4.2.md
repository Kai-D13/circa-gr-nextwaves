# Plan v0.4.2 — circa-gr-nextwaves: nhận đúng đơn theo mã giao · khung Nextwaves gọn · đầu đọc tự lấy

**Trạng thái:** operator duyệt 10/11/2026 (lần 80). Phiên ghi: Claude `bf911b64`. Nhánh mã: `batch/v0.4.2` (từ `batch/v0.4.1` `bcb169d`).


## Tóm tắt (lời thường)

- **Luồng của dược sĩ:**
  1. Bấm "Nhận hàng bằng RFID" trên đúng GR, ở dòng danh sách hoặc trang phiếu.
  2. Nextwaves mở thẳng màn quét của đúng đơn theo **mã giao** (`SOBD…-F` / `-P1` / `-P2`), kể cả SO tách giao, không phải chọn đơn.
  3. Đầu đọc tự kết nối. Dược sĩ đặt hàng lên đầu đọc rồi bấm "Xác nhận nhận hàng".
  4. Extension về POS và tự điền. Dược sĩ kiểm rồi bấm HOÀN THÀNH.
- **Phiếu đã có mã nhập tay** (như GR85090): các mã đó để nguyên, extension tự điền các mã còn lại.
- **Khung extension trên Nextwaves** bình thường chỉ còn hai dòng: `Phiếu GR… · <cửa hàng> ↔ Nextwaves <mã giao>` và `Kho Nextwaves: …`. Chỉ thêm dòng khi có việc dược sĩ cần biết: GR nào / mã nào đã nhận trước, kho sai, mở nhầm phiếu gửi.
- **Đầu đọc:** đúng lúc Nextwaves mở đầu đọc, extension lấy đầu đọc từ QR Scan Log trước, kể cả khi đang mở nhiều tab bán hàng. Nextwaves không còn báo "đầu đọc đang được sử dụng". Nhận xong hoặc đóng màn quét thì extension trả đầu đọc, tab bán hàng tự kết nối lại.

## Context

**Operator 10/11 (ảnh GR85090):**
- Duyệt hướng mã giao (`CASE-MA-GIAO-NEXTWAVES-20261110.md` §4–§5). Ưu tiên map đúng GR ↔ PO / SO ↔ đơn Nextwaves.
- Sửa khung Nextwaves:
  - dòng đầu ghi mã giao;
  - viết lại dòng "Kiểm trước khi nhận" cho dễ hiểu (dược sĩ chỉ cần biết GR nào, mã nào đã nhận trước);
  - bỏ dòng "Đầu đọc: chưa kết nối…", dòng "Đặt hàng lên đầu đọc…" và dòng "Tìm theo…".
- Đầu đọc là việc **rất quan trọng**: dược sĩ mở nhiều tab bán hàng có QR Scan Log. Mở phiên nhận Nextwaves thì phải chiếm được đầu đọc 100%, không báo lỗi.
- 3 đơn Nextwaves ở Lumina: operator tự nhận bù. Không đổi mã.

**Sự thật đã kiểm (đọc mã 10/11, chỉ đọc):**
- **Nextwaves** (bundle 08/11, kiểm lại ở bước 1):
  - Modal quét tự kết nối ngay khi mở (`autoConnect` ở cả trang PO lẫn `/receive`), dùng cổng đã cấp quyền, không hiện hộp chọn.
  - Nếu lần mở cổng đó hỏng (QR Scan Log đang giữ), modal hiện **dải đỏ "đầu đọc đang được sử dụng". Dải này ở lại tới khi dược sĩ bấm ×**, kể cả khi lần sau đã kết nối được.
  - ⇒ Lần mở cổng đầu tiên của Nextwaves phải thành công.
- **gr v0.4.1:**
  - Mượn đầu đọc ở tab POS lúc dược sĩ bấm. QR Scan Log không trả lời trong 300 ms thì cả phiên coi như không có hợp đồng.
  - Nextwaves mở song song, nên lần tự kết nối đầu có thể chạy trước khi QR Scan Log nhả.
  - Mượn hỏng thì thử lại mỗi 15 s, tối đa 8 lần. Tự bấm "Kết nối đầu đọc" lúc 1,5 / 11,5 / 21,5 s.
  - Có 9 đường kết thúc mà Nextwaves không có đầu đọc, ví dụ: modal mở thẳng từ trang PO (phải bấm "Lấy đầu đọc"), "Hủy" rồi mở lại, "Lấy lại đầu đọc" bên QR Scan Log rồi "Mượn lại" (`busy`), tab ẩn.
- **QR Scan Log v0.9.7** (đang chạy POS-01, POS-02, máy Lumina; v0.9.8 giống hệt phần này):
  - Lệnh đi qua `postMessage` ở một tab POS bất kỳ.
  - Tab giữ cổng nhả trong ≤ 4 s. Nếu đang gửi tem vào giỏ thì tới ~13–16 s: trả `busy`, gr phải gửi lại.
  - Sau một lượt trả, tab cũ tự kết nối lại 3 × 1 s.
  - **Hai lỗi báo "đã nhả" mà vẫn giữ cổng:**
    1. `lend` tới đúng lúc một tab đang mở đầu đọc (0–4 s sau lượt trả, cắm lại USB, tab bán hàng vừa hiện) → trả `released` ngay, tab mở xong vẫn giữ cổng.
    2. Tab bán hàng ẩn lâu, nhịp tim bị Chrome giãn → mất quyền chủ nhưng vẫn giữ cổng → `lend` trả `free`.
  - Cả hai trường hợp, hợp đồng không gỡ được, chỉ còn Ngắt. Ngắt xong thì tab bán hàng phải bấm "Kết nối RFID" (chọn cổng).

## Quyết định

**Operator (10/11):** bốn ý ở Context, cộng mục D: phiếu đã có mã nhập tay thì để các mã đó ra ngoài và tự điền phần còn lại.

**PM chốt theo hướng operator:**
- Mã giao chỉ dùng để nhận đúng đơn, không dùng để loại đơn (case §5). Không có đơn trùng mã thì làm y như v0.4.1.
- Dòng đầu ghi **mã giao của PO POS**. Đơn Nextwaves cũ chưa có mã vẫn ghi mã này, vì đó là mã in trên phiếu giao Buymed.
- Bỏ thêm hai thứ chỉ để chẩn đoán:
  - dòng "Kiểm trước khi nhận: số lượng khớp…" (khớp thì không nói gì);
  - bảng so số lượng. Khi đã chọn được đơn thì bảng luôn bằng nhau; bảng vẫn còn ở khung lỗi lệch số lượng.
- **Đầu đọc đi theo đúng lúc Nextwaves mở / đóng cổng**, có phiên hay không. QR Scan Log không nhả đúng hợp đồng → **extension tự bấm Ngắt ở tab đang giữ**, không chờ dược sĩ bấm.
- Bỏ nút "Lấy đầu đọc cho Nextwaves", nút "Mượn lại đầu đọc" và mọi dòng "Đầu đọc: …".
- Một bản v0.4.2, cài một lần, thay v0.4.1 trên máy POS.

## A. Nhận đúng đơn theo mã giao (case §4–§5)

- **`src/lib/nw-model.js` `normalizeOrderOfPo`:** thêm `deliveryCode` = `deliveryOrderCode`, cắt khoảng trắng, chữ hoa. `null` hoặc thiếu → `""`.
- **`src/lib/resolve.js`:** `ctx.deliveryCode`. Sau `verifyOrder`:
  - **Đúng 1 đơn trùng mã** → chỉ xét đơn đó. Đơn khác cùng SO là lần giao khác: không xét, không khoá `nw_many_orders`.
    - Đơn đã nhận một phần → `nw_partial_received`.
    - Kho phải có.
    - Vân tay phải đạt. Lệch → lý do mới `code_qty_mismatch`: "Đúng đơn Nextwaves theo mã giao nhưng số lượng lệch phiếu" (dừng, nhận tay).
  - **Từ 2 đơn trùng mã** → `code_duplicate` (dừng).
  - **0 đơn trùng** → đường v0.4.1 nguyên vẹn.
  - Kết quả mang `byCode` (ghi nhật ký, `kiem-sau.js`).
- **`src/background.js`:**
  - `startSession` kiểm `deliveryCode`: chuỗi ≤ 40, dạng `SOBD<số>-F|-P<số>`. Sai → `null`, đi theo SO.
  - `openNwFor` mở `?po=<mã giao>`; thiếu mã thì mở theo SO.
  - Tab của phiên đã ở đúng `po` (mã giao / SO / id đơn) thì không điều hướng lại.
  - `matchesNwPo` / `findByNw`: trùng đúng mã giao được ưu tiên, nên phiên P1 và P2 mở cùng lúc không còn nhập nhằng.
- **`src/nw/nw-content.js`:**
  - `ctxFromSession` thêm `deliveryCode`; `resolveOrder` truyền mã giao cho resolve.
  - Sau khi khớp: trang mở bằng mã giao mà Nextwaves không tự mở đúng đơn (đơn cũ mã `null` → "không tìm thấy"; hoặc tìm theo mã ra ≠ 1 đơn) → `location.replace(?po=<id đơn>)` **một lần**.
  - `compactSig` xét thêm mã giao.
- **Không thêm API:** `purchase-orders/<poId>` vốn đã được gọi cho từng ứng viên.

## B. Khung Nextwaves (theo ảnh GR85090)

| Chỗ | v0.4.1 | v0.4.2 |
|---|---|---|
| Dòng đầu | `Phiếu GR85090 · CIRCA LUMINA ↔ Nextwaves PO-2026-000018 (SOBD38580216) — 67 UID dự kiến.` | `Phiếu GR85090 · CIRCA LUMINA ↔ Nextwaves SOBD38580216-P1` |
| Kho | `Kho Nextwaves: Lumina` | giữ |
| Kiểm trước | `⚠ Kiểm trước khi nhận: extension sẽ KHÔNG điền được phiếu POS — SP 1125: phiếu đã có lượng nhận tay (không mã); …` | `GR85090 đã nhận tay trước: <tên các mã>` (ghi **tên sản phẩm**; extension điền các mã còn lại — mục D) |
| Đầu đọc | `Đầu đọc: chưa kết nối — extension đang tự kết nối…` | bỏ |
| Hướng dẫn | `Đặt hàng lên đầu đọc rồi bấm “Xác nhận nhận hàng”…` | bỏ |
| Tìm kiếm | `Tìm theo SOBD38580216: total 1, đã đọc 1; …` | bỏ |
| Khớp | `Kiểm trước khi nhận: số lượng khớp phiếu — điền được N UID…` | bỏ |
| Bảng | Sản phẩm POS / SL GR / SL Nextwaves | bỏ ở khung sẵn sàng |
| Tách giao | `Nextwaves có N đơn cùng SO (tách giao): chọn ĐÚNG đơn …` | bỏ (đã mở thẳng đúng đơn) |

- **Phiếu phần còn lại:**
  - `Đã nhận trước ở GR84673: <tên các mã>`.
  - Giữ `Thiếu N tem món đã bán gấp → để “Giữ đơn mở” rồi Xác nhận`.
  - Giữ dòng đỏ khi chọn "Đóng đơn dù còn thiếu" (quyết định 08/11).
- **Lý do khác không điền được** (lẻ / vượt / sản phẩm không có trên phiếu / đơn vị lạ): một câu thường, có tên sản phẩm: `⚠ Extension sẽ không tự điền được phiếu POS: <tên>: … — nhận Nextwaves xong, điền tay trên POS.`
- **Giữ nguyên:** kho khác (đỏ), nhầm phiếu gửi (đỏ), cửa hàng chưa có trong bảng kho, khoá `nw_many_orders`, ghi chú kết quả nhận.
- **Tên sản phẩm:**
  - tab POS gửi thêm `grSummary[].name` / `unit`, và `remainder.done[{code, items[{name, qty, unit}]}]` (dòng có lượng ở các phiếu đã xong);
  - `grSummaryFrom` / `remainderFrom` lọc độ dài: tên ≤ 60, ≤ 20 phiếu × 30 dòng.
- **POS:** dòng `Nextwaves: PO-… (…)` → `Nextwaves: <mã giao>` cho khớp.
- Sau "Xác nhận nhận hàng" → về POS → điền như v0.4.1.

## C. Đầu đọc: Nextwaves mở cổng là có đầu đọc

**Nguyên tắc:** lấy / trả theo đúng lúc Nextwaves mở / đóng cổng serial, không đoán qua chữ trên nút. Mọi lượt mượn / trả đi qua **một chỗ ở background**.

1. **`src/nw/nw-serial.js` (mới)** — MAIN world, `document_start`, chỉ trên Nextwaves. Chỉ khai ở mục MAIN của manifest: bài học Chrome nạp một lần mỗi trang.
   - **Bọc `SerialPort.prototype.open`:**
     - Trước khi mở: báo content "cần đầu đọc", chờ "đã trống", tối đa 25 s.
     - Mở hỏng vì cổng bận (cùng mẫu lỗi Nextwaves tự nhận: `NetworkError`, "Failed to open serial port", "already open", …) → nhờ lấy lại rồi thử lại, tổng tối đa 30 s.
     - Nextwaves chỉ thấy "đang kết nối" lâu hơn, không thấy lỗi.
     - Content không chào trong 1,5 s (extension tắt, tenant khác) → mở ngay như không có extension.
   - **Bọc `close`:** đóng xong thì báo "đã đóng".
   - Báo số cổng đã cấp quyền (`getPorts`).
2. **`nw-content.js`:**
   - Chuyển "cần / đã mở / đã đóng / số cổng" lên background. Gia hạn mỗi 10 phút khi cổng còn mở.
   - Modal mở (dấu hiệu DOM v0.4.1) cũng xin đầu đọc, phòng khi Nextwaves đổi cách mở cổng.
   - Bỏ `readerLine`, `readerButtons`, `takeFromQsl`, `lendTick`, `lendAgain`, `RH_REASON`, phần đầu đọc của `renderHelper`.
   - Giữ tự bấm "Kết nối đầu đọc" làm lưới an toàn, tối đa 2 lần, chỉ khi cả ba đúng: modal mở > 3 s, Nextwaves chưa thử mở cổng, máy có cổng đã cấp quyền.
3. **`background.js` — bộ lo đầu đọc:** chạy ngoài hàng đợi phiên, lưu `chrome.storage.session`. Dùng lại `readerRelay` / `posTabsFor`, `qslStatusAll` / `qslHolders`, `readerTakeFromQsl`, `laterReturnReader`, `onTabRemoved`.
   - **Lấy.** Kích khi Nextwaves cần, và sớm ngay lúc dược sĩ bấm "Nhận hàng bằng RFID" (thay `readerLend` ở tab POS, POS mở Nextwaves không phải chờ). Cùng lúc chỉ một lượt:
     1. Vừa trả < 5 s → chờ cho đủ 5 s, để QR Scan Log kết nối lại xong (tránh lỗi 1).
     2. Lượt mượn của phiên / tab này vẫn còn tốt (vd. lượt mượn sớm lúc bấm) → "đã trống" ngay. Không thì gửi `lend` qua **một** tab POS, `leaseId` mới; gia hạn dùng `leaseId` cũ.
        - Tab POS im / `no_broker` → thử tab POS khác.
        - `busy` → gửi lại mỗi 1,5 s, tối đa 25 s (trong giới hạn 10 lệnh / 10 s).
     3. `ok` → đọc Web Lock `circa-qr-scan-log:rfid-reader` từ tab POS.
        - Lock trống → "đã trống".
        - Còn giữ sau 4 s (lỗi 1 / lỗi 2) → bước 4.
     4. **Tự bấm Ngắt** ở tab đang giữ, theo cách v0.4.1 nhưng không chờ dược sĩ:
        - chờ tab đó gửi tem xong / kết nối xong rồi mới bấm;
        - chờ lock trống tối đa 5 s → "đã trống";
        - ghi lại "tab bán hàng cần Kết nối RFID lại".
     5. Không có QR Scan Log (không `pong`, không lock) → "đã trống" ngay.
   - **Trả** (thử lại 5 × 2 s như v0.4.1) khi:
     - Nextwaves đóng cổng và không mở lại trong 1,5 s;
     - tab Nextwaves đóng hoặc rời Nextwaves;
     - phiên huỷ / xong / không có đơn.
   - **"Lấy lại đầu đọc" ở tab bán hàng:**
     - gia hạn bằng `leaseId` cũ bị từ chối → thôi gia hạn;
     - lần Nextwaves cần sau dùng `leaseId` mới → màn quét Nextwaves thắng (operator 10/11).
4. **Khung chỉ nói về đầu đọc ở 4 trường hợp**, đều là việc dược sĩ phải tự làm:

   | Trường hợp | Câu trên khung | Ở đâu |
   |---|---|---|
   | Máy chưa cấp quyền cổng cho Nextwaves (lần đầu trên máy) | "Lần đầu dùng đầu đọc trên máy này: bấm “Kết nối đầu đọc”, chọn cổng đầu đọc." | Nextwaves |
   | Quá 30 s vẫn không mở được (cáp / USB) | "Không mở được đầu đọc — rút cáp USB cắm lại rồi bấm “Kết nối đầu đọc”." | Nextwaves |
   | Màn quét ở tab Nextwaves khác đang giữ đầu đọc | "Đầu đọc đang ở màn quét tab khác (GR…) — đóng màn quét đó." + nút "Mở tab đó" | Nextwaves |
   | Đã phải đi bước 3.4 | "Nhận xong — sang tab bán hàng bấm “Kết nối RFID” (chọn cổng) để bán tiếp." | POS; Nextwaves nếu không có phiên |
5. **`pos-content.js`:**
   - Bỏ mượn ở tab lúc bấm: `readerLend`, `readerGiveBack`, `reuseLease`.
   - Giữ chỗ chuyển tin `circa-reader/v1` (`cgn:reader`). Ping tối đa 1 s thay 300 ms. Thêm đọc Web Lock trong cùng lượt.
   - Giữ `cgn:qsl-status` / `cgn:qsl-release`.
6. **`docs/dev/REQUEST-QSL-v0.4.2-NHA-DAU-DOC.md`** — operator chuyển cho đội QR Scan Log; gr không chờ. Sửa hai chỗ "báo đã nhả mà vẫn giữ":
   - đang mở đầu đọc → mở xong rồi đóng, sau đó mới báo `released`;
   - tab không còn là chủ, hoặc thấy `lent`, mà còn mở cổng → tự đóng.

   Sửa xong thì bước 3.4 gần như không xảy ra, và tab bán hàng luôn tự kết nối lại sau khi trả.

**Còn ngoài tay extension (nói rõ với operator):**
- lần đầu cấp quyền cổng trên một máy (một lần);
- đầu đọc / cáp hỏng;
- hai màn quét Nextwaves cùng mở.

## D. Phiếu đã có mã nhập tay (GR85090) — operator chọn 10/11: tự điền phần còn lại

**Operator:**
- "Chỉ điền những mã chưa nhập … sau xác nhận nhận hàng quay lại POS và nhập full GR còn lại như luồng bình thường. Chỉ khác là … đã nhập tay và done thì cho ra ngoài."
- Ca "Đang nhận" là lỗi vận hành; operator sẽ đảm bảo không lặp lại. ⇒ D là lưới an toàn, làm gọn.

**Hiện nay:** v0.4.1 gặp phiếu này thì **không điền gì**, vì `plan.js` `received_mismatch` dừng cả phiếu. Dược sĩ phải điền tay cả 26 dòng.

**v0.4.2:**
- **Sản phẩm đã có lượng nhập tay (không mã) → để ra ngoài:**
  - không ghi, không gắn tem;
  - không kiểm khớp lượng trên các lô của nó;
  - kiểm cuối chỉ đòi các lô đó giữ nguyên.
- **Các sản phẩm khác:** điền đủ như luồng thường.
- **Nhập tay chưa đủ** (PM chốt): cũng để ra ngoài. Cảnh báo "chưa nhận đủ" sẵn có báo dược sĩ nhập nốt. Không trộn lượng tay với tem trên cùng một lô (luật v0.3).
- **Sản phẩm vừa có lượng tay vừa có mã:** vẫn chặn như v0.4.1. Rất hiếm.
- **Nextwaves:**
  - thiếu tem của đúng các sản phẩm để ra ngoài (đã bán) thì coi như món bán gấp → hướng dẫn "Giữ đơn mở";
  - thiếu tem sản phẩm khác → dừng an toàn như v0.4.1.
- **Chữ trên khung:**
  - Nextwaves: `GR85090 đã nhận tay trước: <tên các mã>`. Chỉ khi màn quét báo thiếu tem các mã đó mới thêm: `Thiếu tem các mã này → để “Giữ đơn mở” rồi Xác nhận`;
  - POS sau khi điền: `Không điền (đã nhận tay trước): <tên các mã>`.
- **Chạm:**
  - `plan.js`: tập sản phẩm để ra ngoài, giống `excludeUids` của phiếu phần còn lại;
  - `apply.js`: kiểm cuối;
  - `match.precheck`: `gr_received_by_hand` thành dòng báo, không còn là chặn;
  - `nw-content`: quy tắc đủ, `realMissing`;
  - `background.js` `unitsForPlan`.

## Không đổi

- Kế hoạch điền và kiểm cuối (trừ mục D), phiếu phần còn lại, khoá ghi.
- Quyền của extension: không thêm host / permission.
- Không gọi API ghi.
- Không bấm "Xác nhận nhận hàng" / HOÀN THÀNH.
- Không sửa `C:\QR_code\circa-qr-scan-log`.

## Thứ tự (nhánh `batch/v0.4.2` từ `batch/v0.4.1` `bcb169d`)

0. **Main:**
   - `docs/dev/PLAN-v0.4.2.md` (bản này);
   - case doc ghi phản hồi operator 10/11;
   - `agent.md` §3, `BUSINESS-FLOW.md` §3–§5, `state.md` lần 80;
   - `REQUEST-QSL-v0.4.2-NHA-DAU-DOC.md`.
1. **Chỉ đọc (GET):**
   - mẫu `inter-tenant-orders/purchase-orders/<id>` của PO-2026-000021 (có mã) và một đơn mã `null`, bỏ tên người → `samples/`;
   - tải lại bundle Nextwaves hiện hành (JS công khai), kiểm lại `open` / `close`, `autoConnect`, dải lỗi. Nếu Nextwaves đã đổi cách mở cổng → sửa C.1 trước khi code tiếp;
   - GR85090 (dòng nhập tay) làm mẫu khung.
2. A.
3. B.
4. C.
5. D.
6. Số bản 0.4.2 (`manifest.json`, `package.json`). `kiem-truoc.js` / `kiem-sau.js` in `deliveryCode`, `byCode`, lượt mượn / trả. Popup đổi nhãn trạng thái đầu đọc.
7. Gate → review độc lập → gói + `BATCH` / `RUNBOOK` / `THAY-DOI` / `QA-v0.4.2-MAY-DEV` → QA máy dev → cài máy POS.

## Kiểm

- **Unit** (`npm test`, hiện 264):
  - **resolve:**
    - mẫu thật có mã / mã `null`;
    - P1 / P2 cùng SO;
    - mã khớp mà lệch số lượng;
    - 2 đơn cùng mã;
    - không mã → mọi test v0.4.1 đạt nguyên;
    - chuyển `?po=<id>` đúng một lần.
  - **khung:**
    - đúng bảng B (khớp hết thì chỉ 2 dòng);
    - tên sản phẩm;
    - phiếu phần còn lại.
  - **D (điền với mã nhập tay):**
    - sản phẩm nhập tay đủ / chưa đủ → để ra ngoài, cảnh báo "chưa nhận đủ";
    - vừa tay vừa mã → chặn;
    - các sản phẩm khác điền đủ, kiểm cuối đạt;
    - Nextwaves thiếu tem đúng sản phẩm để ra ngoài → đủ; thiếu tem khác → dừng;
    - dựng lại GR85090 từ mẫu thật.
  - **`nw-serial.js` với `SerialPort` giả:**
    - chờ "đã trống";
    - cổng bận → thử lại;
    - quá hạn → ném đúng lỗi gốc;
    - không có content → mở ngay;
    - `close` báo.
  - **Bộ lo đầu đọc với QR Scan Log giả đủ hành vi v0.9.7:**
    - `released` / `free` / `off`;
    - `busy` rồi mới nhả;
    - `no_broker`, im;
    - M8;
    - giới hạn 10 lệnh / 10 s;
    - lỗi 1 (đang mở dở), lỗi 2 (mất quyền chủ);
    - không có QR Scan Log;
    - nhiều tab POS;
    - vừa trả < 5 s;
    - hai tab Nextwaves.
  - **browser-sim:** QR Scan Log giả gộp hợp đồng + DOM + lock + một cổng dùng chung với Nextwaves giả.
- **Đột biến:** `scripts/mutate-v0.4.2.py`:
  - kế thừa các ca v0.4.1 còn neo; ca neo vào chữ đã bỏ thì neo lại hoặc ghi lý do bỏ;
  - thêm ca cho từng luật A / C / D;
  - chạy một mình.
- **Edge thật** `scripts/edge-v042.js`: trang Nextwaves giả có `SerialPort` giả, dùng chung cổng với trang bán hàng giả có Web Lock thật.
  - Modal mở → kết nối, **không có dải lỗi**.
  - Đóng → trả; mở lại.
  - Nhiều tab bán hàng, tab ẩn.
  - Lỗi 1 / lỗi 2 → tự Ngắt.
  - Không có tác vụ ≥ 50 ms.
- **Máy dev:** Chrome thật, QR Scan Log v0.9.7, đầu đọc thật, Nextwaves production. Chỉ mở màn quét, **không Xác nhận**.
  - 3–5 tab bán hàng đã kết nối RFID, có tab ẩn > 5 phút → bấm "Nhận hàng bằng RFID" → Nextwaves kết nối, không dải đỏ.
  - "Hủy" → tab bán hàng tự kết nối lại; mở lại modal.
  - Hai phiếu liền nhau.
  - Mở modal thẳng từ trang PO.
- **Máy POS:** lượt nhận thật đầu tiên = lượt thử chung, có `kiem-truoc.js` / `kiem-sau.js`.

## Cần operator

- Chuyển `REQUEST-QSL-v0.4.2-NHA-DAU-DOC.md` cho đội QR Scan Log.
- Cho cài máy dev → QA → cài máy POS (Florita, Lumina).
- **Nhận bù 3 đơn Lumina trên Nextwaves:**
  - món đã bán không còn để quét → chọn **"Giữ đơn mở"**. Không chọn "Đóng đơn dù còn thiếu": lựa chọn này báo Buymed giao thiếu.
  - Không cần làm gì trên POS.
