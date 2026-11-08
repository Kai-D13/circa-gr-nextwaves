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

## 9. Phản hồi của đội QR Scan Log (08/11 tối) và trả lời của gr-nextwaves

**QR Scan Log nhận A, B (cách 1), C + v1.1, làm trong v0.9.7** (gói chung batch 08/11, chưa cài). **Không làm §8:** content script của QR Scan Log có phần trừ tồn gọi API POS production.
- `data-connection` thêm giá trị `lent` (đang cho mượn). Có test khoá các tên ở §3. Số dòng mã sẽ đổi.
- `pong` trả ngay tại tab (≤ 300 ms). `holder: "unknown"` khi tab chưa nối được worker.
- `lend` / `return` đi qua worker. Khi cho mượn, chờ `released` tối đa 5 s.
- Lấy lại bằng `getPorts`, kể cả tab ẩn, không hộp chọn, thử 3 lần × 1 s.
- "Lấy lại đầu đọc" kết thúc mượn ngay. Nextwaves còn giữ cổng thì QR Scan Log báo cổng bận.

**Đối chiếu với mã gr v0.4.1 (chỉ đọc, 08/11): khớp, gr không phải sửa.**
- `lent` không thuộc {`connected`, `waiting_clear`, `paused`} → gr không bấm Ngắt (`pos-model.js` `QSL_HOLDING`).
- gr không đọc `holder`. gr chỉ cần `pong` đúng `reqId` trong 300 ms (`pos-content.js` `readerPingMs`).
- gr chờ `lend:result` / `return:result` 5,5 s. Không có trả lời thì thử lại mỗi 15 s, tối đa 8 lần (`nw-content.js` `lendTick`).
- **Đường có phiếu** (từ v0.4.0): có `pong` thì mượn / trả, không bấm hộ Ngắt. gr trả đầu đọc khi:
  - nhận xong / huỷ phiên: đóng tab Nextwaves của phiên → chờ 500 ms → `return` (`background.js` `laterCloseNwAndReturn`);
  - phiên không có đơn Nextwaves: trả ngay, vì màn quét không mở modal;
  - dược sĩ đóng tab Nextwaves: trả ngay.
- **Modal mở thẳng từ trang PO:** v0.4.1 vẫn bấm hộ Ngắt. Mượn / trả không phiếu làm ở gr v0.4.2.

**Câu hỏi của QR Scan Log: đóng modal có đóng cổng không? — CÓ.**

Nguồn: JS công khai của Nextwaves production, tải 08/11 (chỉ GET).
- Trang PO và trang `/purchases/receive` dùng chung một modal (`receive-scan-modal-CgrOHyHm.js`).
  - Trang receive: `autoConnect: true`; `onClose` chỉ đặt `open = false`, không rời trang.
  - Modal đóng → trả `null` → phần quét (`receipt-rfid-scanner-59NXu4A-.js`) bị gỡ khỏi trang.
- Mỗi lần mở, phần quét tạo một đối tượng đầu đọc riêng (`useState(() => new ReaderService)`). Trang không giữ đầu đọc chung.
- Lúc gỡ, phần quét gọi `disconnect()` (`reader-service-CrzyBqez.js`):
  1. dừng quét: gửi STOP, chờ 500 ms;
  2. huỷ reader, đóng writer;
  3. `port.close()`.
- ⇒ Cổng trống khoảng 0,5–1 s sau khi modal đóng. Đóng tab thì Chrome đóng cổng.
- **Ngoại lệ:** `disconnect()` lỗi giữa chừng (rút đầu đọc, lỗi I/O) → cổng có thể còn mở tới khi tải lại hoặc đóng tab. Khi đó 3 lần thử của QR Scan Log hỏng; báo như tự kết nối thất bại là đúng.

**gr v0.4.2 (mượn không phiếu):** gửi `return` khi modal đã biến khỏi trang ≥ 1,5 s, hoặc khi tab Nextwaves đóng.

**Cần QR Scan Log xác nhận một điểm:** `pong.lent` có đủ `{ leaseId, label, until }` như §3.2 của spec, kể cả khi `pong` lấy từ trạng thái của tab. (§4.1 chỉ ghi `{ label, until }` cho góc nhìn tab.) gr v0.4.2 dùng `leaseId` này để không tự gia hạn lượt mượn sau khi dược sĩ đã bấm "Lấy lại đầu đọc".

**Trước khi cài v0.9.7 lên máy POS: chạy thử chung trên máy dev** (gr v0.4.1 đã cài ở đó).
- gr v0.4.0 / v0.4.1 thấy `pong` là tự chuyển đường có phiếu sang mượn / trả. Vì vậy cài v0.9.7 cũng làm đổi hành vi phía gr.
- E2E đủ cần một đơn Nextwaves đang chờ nhận.
- QR Scan Log có thể tự thử mượn / trả trên máy thật, không cần gr:
  1. dán đoạn mã dưới vào Console của một trang `https://pos.v2.circa.vn/…` (chỉ gửi message, không ghi gì);
  2. gọi lần lượt `await qslTest.ping()`, `await qslTest.lend()`, `await qslTest.ret()`;
  3. mỗi kết quả kèm `ms` = thời gian chờ trả lời.

```js
var qslTest = (() => {
  const ns = "circa-reader/v1";
  const leaseId = "thu" + Date.now().toString(36);
  const ask = (type, extra) =>
    new Promise((resolve) => {
      const reqId = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const t0 = performance.now();
      const on = (e) => {
        const m = e.data;
        if (e.source === window && m && m.ns === ns && m.from === "qsl" && m.reqId === reqId) done(m);
      };
      const done = (m) => {
        removeEventListener("message", on);
        clearTimeout(timer);
        resolve(m ? Object.assign({ ms: Math.round(performance.now() - t0) }, m) : null);
      };
      const timer = setTimeout(() => done(null), 6000);
      addEventListener("message", on);
      postMessage(Object.assign({ ns, from: "gr-nextwaves", type, reqId }, extra), location.origin);
    });
  return { leaseId, ping: () => ask("ping"), lend: () => ask("lend", { leaseId, ttlMs: 120000, label: "THU" }), ret: () => ask("return", { leaseId }) };
})();
```

**Câu hỏi QR Scan Log gửi Nextwaves (trừ tồn ở cửa hàng thứ hai):** không thuộc gr, vì gr không gọi `/integrations/circa/*`. Nếu cần gửi kèm: bảng cửa hàng ↔ kho gr dùng từ v0.4.1 (`src/lib/env.js`):

| Cửa hàng | POS | Kho Nextwaves |
|---|---|---|
| Florita | `c476efb2-415c-429a-978e-d389b4b06607` | `eb5e2b4f-6f92-413b-90ef-6be1730b94c0` |
| Lumina | `31493e74-3404-4c0e-a906-93691a6ee319` | `3f7bd541-7370-4ce0-9048-231cf061e91a` |
