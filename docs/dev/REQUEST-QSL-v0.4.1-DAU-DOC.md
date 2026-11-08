# Yêu cầu gửi đội QR Scan Log — đầu đọc dùng chung với "Nhận hàng RFID" (circa-gr-nextwaves v0.4.1)

> Người viết: phiên dev `circa-gr-nextwaves`, 08/11/2026. Operator chuyển nguyên file này (kèm `SPEC-QSL-MUON-DAU-DOC-v1.md`) cho phiên / đội đang giữ quyền ghi `circa-qr-scan-log`.
> Đọc theo mã QR Scan Log **0.9.6** (chỉ đọc, không sửa). Số dòng là của bản đó.

## 1. Bối cảnh và việc gr-nextwaves sẽ làm

- Mỗi quầy có **một** đầu đọc RFID (USB serial). QR Scan Log giữ cổng ở tab `/ban-hang/<UUID>`, tự kết nối lại bằng `getPorts`.
- Màn quét Nextwaves cũng cần cổng đó. Có hai chỗ: trang `…/purchases/receive?po=SOBD…` (extension mở) và **modal "Nhận hàng bằng cách quét" mở thẳng từ trang PO Nextwaves**. Modal tự kết nối bằng `getPorts`; cổng bận thì báo lỗi, không tự thử lại.
- Hiện dược sĩ phải tự làm ba bước:
  1. sang tab bán hàng bấm **Ngắt kết nối**;
  2. quay lại Nextwaves kết nối;
  3. nhận xong, sang tab bán hàng bấm **Kết nối RFID** rồi chọn cổng trong hộp chọn.
- **Operator chốt 08/11:**
  - gr-nextwaves v0.4.1 có nút **"Lấy đầu đọc cho Nextwaves"**. Khi dược sĩ bấm nút đó, extension **bấm hộ nút "Ngắt kết nối" của QR Scan Log**, chờ cổng trống, rồi bấm kết nối của Nextwaves.
  - Đây là cách **tạm**, QR Scan Log không phải đổi gì.
  - Cách đúng là hợp đồng `circa-reader/v1` (mục 5): mượn / trả tự động, trả **không** hộp chọn cổng.

## 2. gr-nextwaves v0.4.1 chạm vào QR Scan Log thế nào

Content script của gr-nextwaves chạy ở isolated world trên `https://pos.v2.circa.vn/*`.

**Đọc** (khi màn quét Nextwaves chưa kết nối được), ở từng tab POS:
- `document.getElementById("circa-rfid-demo-root")` — host đang hiển thị (`style.display !== "none"`, tức đang ở `/ban-hang/<UUID>`);
- `host.shadowRoot` (kiểu `open`) → `#circa-rfid-demo-panel`, đọc `data-connection` và `data-state`;
- `button[data-action="disconnect"]` không `disabled`.

**Bấm** đúng **một** lần `button[data-action="disconnect"]` (`element.click()`), **chỉ** khi đủ cả bốn điều kiện:
- dược sĩ vừa bấm nút "Lấy đầu đọc cho Nextwaves";
- đúng **một** tab có host hiển thị với `data-connection` ∈ {`connected`, `waiting_clear`, `paused`};
- `data-state` khác `processing` (không bấm khi QR Scan Log đang gửi tem vào giỏ);
- nút không `disabled`.

Thiếu điều kiện nào thì gr-nextwaves **không bấm**, chỉ hiện nút "Mở tab bán hàng" để dược sĩ tự Ngắt.

**Chờ cổng trống:** sau cú bấm, chờ Web Lock `circa-qr-scan-log:rfid-reader` biến mất (`navigator.locks.query()`), tối đa 5 s.

**Không làm gì khác:** không bấm nút nào khác, không đọc / ghi storage của QR Scan Log, không gửi message nào ngoài `circa-reader/v1`, không bao giờ tự Ngắt khi dược sĩ chưa bấm.

## 3. Yêu cầu A — giữ ổn định (cho tới khi có `circa-reader/v1`)

Các điểm sau là "hợp đồng tạm". **Đổi thì báo trước** qua operator. Không báo thì gr-nextwaves tự lùi về nút "Mở tab bán hàng" (vẫn an toàn) nhưng mất cách bấm một lần.

| Điểm | Giá trị 0.9.6 | Chỗ trong mã |
|---|---|---|
| Host | `div#circa-rfid-demo-root` gắn vào `document.body`, ẩn bằng `style.display = "none"` ngoài route bán hàng | `rfid-content.js:2466`, `:3047` |
| Shadow root | `attachShadow({ mode: "open" })` | `:2669` |
| Panel | `#circa-rfid-demo-panel`, thuộc tính `data-state` (`processing`…), `data-connection` (`connected` / `waiting_clear` / `paused` / `disconnected` / `handover`…) | `:2467`, `:3062-3063` |
| Nút Ngắt | `button[data-action="disconnect"]`, nhãn "Ngắt kết nối", bật khi `connected` / `waiting_clear` / `paused` | `rfid-core.js:1171`, `:1192` |
| Bấm | listener `click` trên shadow root → `HANDLERS["disconnect"]`, không kiểm `isTrusted` | `rfid-content.js:2610-2619`, `:2678` |
| Web Lock | `circa-qr-scan-log:rfid-reader`, nhả sau khi đóng cổng | `:718`, `:871` |
| Hành vi Ngắt | đóng cổng, nhả lock, đặt cờ Ngắt bền cho mọi tab POS | `:860-874` |

## 4. Yêu cầu B — sửa nhỏ, nên làm sớm: Ngắt không cắt ngang lượt đang gửi tem

**Hiện trạng (0.9.6):**
- `disconnect()` gọi `cancelScan("đã bấm Ngắt trong lúc gửi")` (`rfid-content.js:867`), nên lượt đang phát phím bị dừng trước Enter. Ô tìm POS có thể còn mã gõ dở (`:2348`).
- `canDisconnect` không xét `busy` (`rfid-core.js:1171`), nên nút vẫn bật khi đang gửi.
- `releaseForOtherTab` (`:1183`) đã làm đúng thứ tự: lượt chưa phát phím thì huỷ an toàn, lượt đã phát phím chạy nốt rồi mới đóng cổng.

**Yêu cầu** (chọn một):
1. **(nên chọn)** Ngắt dùng cùng thứ tự với `releaseForOtherTab`: làm nốt lượt đã phát phím, rồi mới đóng cổng và nhả lock.
2. Tắt nút Ngắt khi `busy` (`canDisconnect && !busy`).

gr-nextwaves đã tránh bấm khi `data-state = processing`, nhưng dược sĩ tự bấm Ngắt vẫn gặp lỗi này.

## 5. Yêu cầu C — chính: hợp đồng `circa-reader/v1`

Làm đúng `SPEC-QSL-MUON-DAU-DOC-v1.md`:
- kênh `window.postMessage` trong tab POS, `ns: "circa-reader/v1"`, `ping` / `lend` / `return`, kiểm nguồn / schema / tần suất;
- trọng tài có trạng thái `lent`;
- khi đang cho mượn thì không tự kết nối;
- trả bằng `getPorts`, **không** `requestPort`, kể cả tab ẩn;
- hết hạn `ttlMs`;
- nút "Lấy lại đầu đọc".

**Bổ sung v1.1 (08/11):**
- **Mượn khi không có phiếu POS.** Dược sĩ mở modal nhận hàng thẳng trên trang PO Nextwaves. gr-nextwaves gửi `lend` qua một tab POS bất kỳ, `label: "Nhận hàng Nextwaves"`, `ttlMs` 900000. Gửi `return` khi modal đóng hoặc tab Nextwaves đóng. Với QR Scan Log, xử lý giống hệt `lend` có phiếu.
- **Ưu tiên:** QR Scan Log trả `pong` đúng hợp đồng thì gr-nextwaves **thôi bấm hộ Ngắt** và dùng mượn / trả. Đường có phiếu đã có mã từ v0.4.0; đường không phiếu được thêm ở bản gr-nextwaves kế tiếp, sau khi có bản QR Scan Log để thử cùng.
- **Không đổi:** trừ tồn, `completed_items` / `stock_out`, QR, luật cấp quyền giữa các tab bán hàng, cờ Ngắt và hành vi nút Ngắt / Kết nối RFID hiện có (trừ sửa ở mục 4).

## 6. Kiểm thử QR Scan Log cần có

- Toàn bộ mục 7 của spec v1: unit `brokerStep`, tab với serial giả, kênh message, máy thật.
- Thêm:
  - `lend` / `return` với `label: "Nhận hàng Nextwaves"` (không phiếu);
  - Ngắt khi đang gửi tem: không còn mã gõ dở (mục 4);
  - các điểm ở mục 3 không đổi (một test nhỏ kiểm id / thuộc tính / tên lock).
- **Máy thật** (máy dev, cả hai extension):
  1. tab bán hàng đang giữ đầu đọc;
  2. mở modal nhận hàng từ trang PO Nextwaves;
  3. gr-nextwaves mượn → Nextwaves tự kết nối;
  4. đóng modal → tab bán hàng tự kết nối lại, **không hộp chọn**;
  5. lặp lại khi tab bán hàng đang ẩn.

## 7. Gửi lại cho gr-nextwaves khi xong

- Số phiên bản QR Scan Log và mã gói.
- Mẫu thật `pong`, `lend:result`, `return:result`.
- Mọi chỗ lệch so với spec v1 / v1.1: tên trường, mã lỗi, thời hạn.
- Nếu đổi điểm nào ở mục 3: giá trị mới.

## 8. Tuỳ chọn

QR Scan Log hiện chỉ chạy trên `pos.v2.circa.vn` và `pos.dev.circa-v2.buymed.tech`, không chạy trên POS staging (`pos.stg.circa-v2.buymed.tech`). Muốn thử E2E đầu đọc trên staging thì cần thêm host đó. Chỉ làm nếu đội QR Scan Log thấy không ảnh hưởng luồng bán hàng.
