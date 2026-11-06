# Prompt / spec gửi đội QR Scan Log — "cho mượn đầu đọc" cho extension Nhận hàng RFID (circa-reader/v1)

> Gửi nguyên file này cho phiên / đội đang giữ quyền ghi dự án `circa-qr-scan-log`. Người viết: phiên dev `circa-gr-nextwaves`, 06/11/2026.
> Phía gr-nextwaves sẽ cài đúng hợp đồng này ở bản v0.4.0. QR Scan Log chưa hỗ trợ thì gr-nextwaves tự rơi về cách tay (mục 8).

## 1. Bài toán

- Máy POS dùng **một** đầu đọc RFID (USB serial, CP2102N `usbVendorId 4292` / `usbProductId 60000` trên máy pilot) cho hai việc:
  - **Bán hàng**: QR Scan Log giữ cổng ở tab `/ban-hang/<UUID>`, tự kết nối lại.
  - **Nhận hàng**: extension `circa-gr-nextwaves` mở tab Nextwaves `https://circa.nextwaves.app/vi/purchases/receive?po=SOBD…`. Màn quét Nextwaves tự kết nối đầu đọc bằng cổng đã cấp quyền cho origin Nextwaves.
- Cổng serial chỉ mở được ở **một nơi**. QR Scan Log đang giữ thì màn quét Nextwaves báo "đầu đọc đang được sử dụng". Dược sĩ phải:
  1. sang tab bán hàng bấm **Ngắt**;
  2. quay lại Nextwaves bấm kết nối;
  3. nhận xong, sang tab bán hàng bấm **Kết nối RFID** và chọn cổng trong hộp chọn (`connect()` luôn gọi `requestPort`).
- **Mục tiêu:**
  - Dược sĩ bấm "Nhận hàng bằng RFID" trên POS → đầu đọc tự chuyển sang Nextwaves.
  - Nhận xong → đầu đọc **tự về** QR Scan Log, **không** hộp chọn cổng, **không** bấm gì.

## 2. Hiện trạng đã đọc (QR Scan Log v0.9.5)

**Trọng tài (worker):**
- `rfid-core.js:1169-1300`: `brokerStep(state, ev)`, state `{owner, lastOwnerTabId, pending, off, offSaved}`.
- `background.js:1770-1900`: port `circa-rfid-broker` mỗi tab, chuỗi `brokerEvent` tuần tự, lưu `rfid:broker` ở `chrome.storage.session`, cờ Ngắt `rfidDisconnected` ở `storage.local`.
- Kiểu xin quyền: `auto` / `user` / `resume`.
- `off !== false` chặn mọi cấp quyền; chỉ `user` mới xoá được cờ.

**Tab (`rfid-content.js`):**
- `canAutoClaim` (`:755`): chỉ tự kết nối khi tab đang hiển thị (trừ `plug`), không tab nào giữ, không cờ Ngắt.
- `openPermitted` (`:784`): mở bằng `getPorts`, không hộp chọn.
- `disconnect` (`:828`) = Ngắt toàn bộ tab, đặt cờ bền.
- Web Locks `circa-qr-scan-log:rfid-reader`.

**Content script của QR Scan Log chạy trên mọi trang `https://pos.v2.circa.vn/*`** (cả danh sách phiếu nhận). Vì vậy kênh nói chuyện đặt trong trang POS là đủ, không cần Extension ID.

**Phía Nextwaves** (bundle màn quét):
- Modal nhận hàng mở với `autoConnect: true` → `requestAndConnect({ autoReuseAuthorized: true })`, dùng `navigator.serial.getPorts()`, không hộp chọn.
- Cổng bận thì báo lỗi và không tự thử lại. gr-nextwaves sẽ tự bấm lại nút kết nối khi cổng đã trống.

## 3. Kênh: `window.postMessage` trong tab POS, giao thức `circa-reader/v1`

- Cả hai extension có content script trên `pos.v2.circa.vn`. gr-nextwaves gửi từ tab POS mà dược sĩ đang thao tác (danh sách phiếu nhận hoặc trang phiếu).
- **QR Scan Log nghe ở MỌI tab POS** và chuyển lệnh về worker của mình. Tab đó không cần là tab đang giữ đầu đọc.

**Kiểm tra bắt buộc với mọi message nhận được** (sai bất kỳ mục nào → bỏ qua im lặng):

| Mục | Điều kiện |
|---|---|
| Nguồn | `event.source === window` và `event.origin === location.origin` |
| `ns` / `from` | `ns === "circa-reader/v1"` và `from === "gr-nextwaves"` |
| `reqId`, `leaseId` | `/^[A-Za-z0-9_-]{1,64}$/` |
| `ttlMs` | số nguyên trong `[60000, 1800000]` |
| `label` | chuỗi ≤ 40 ký tự, chỉ hiển thị bằng `textContent` (ví dụ `"GR84674"`) |
| Tần suất | Mỗi tab tối đa 10 lệnh / 10 giây |

### 3.1 gr-nextwaves → QR Scan Log

```js
{ ns: "circa-reader/v1", from: "gr-nextwaves", type: "ping",   reqId }
{ ns: "circa-reader/v1", from: "gr-nextwaves", type: "lend",   reqId, leaseId, ttlMs, label }
{ ns: "circa-reader/v1", from: "gr-nextwaves", type: "return", reqId, leaseId }
```

- **`ping`**: hỏi có hỗ trợ không và trạng thái hiện tại.
- **`lend`**: xin mượn đầu đọc cho một lượt nhận.
  - `leaseId` do gr-nextwaves sinh ngẫu nhiên mỗi lượt.
  - **Gửi lại `lend` cùng `leaseId` = gia hạn** (idempotent): gr-nextwaves gia hạn mỗi 10 phút khi lượt còn chạy, `ttlMs` mặc định 900000 (15 phút).
- **`return`**: trả đầu đọc. gr-nextwaves chỉ gửi **sau khi tab Nextwaves của lượt đã đóng**, tức cổng đã thật sự trống.

### 3.2 QR Scan Log → gr-nextwaves (post vào `window` của chính tab nhận lệnh)

```js
{ ns, from: "qsl", type: "pong", reqId, protocol: 1, version: "0.9.x",
  holder: "none" | "tab" | "off" | "unknown",
  lent: null | { leaseId, label, until } }

{ ns, from: "qsl", type: "lend:result", reqId, leaseId, ok: true,
  state: "released" | "free" | "off", until }

{ ns, from: "qsl", type: "lend:result", reqId, leaseId, ok: false,
  reason: "busy" | "off_unknown" | "no_broker" | "bad_request" }

{ ns, from: "qsl", type: "return:result", reqId, leaseId, ok: true,
  state: "reclaiming" | "free" | "off" }

{ ns, from: "qsl", type: "return:result", reqId, leaseId, ok: false,
  reason: "unknown_lease" | "no_broker" }
```

**Ý nghĩa `state` của `lend:result`:**
- `"released"`: tab bán hàng đang giữ cổng và **đã đóng cổng xong** (`port.close()` đã resolve).
- `"free"`: không tab nào giữ.
- `"off"`: người dùng đã Ngắt toàn bộ tab từ trước. Cổng trống, QR Scan Log không giữ mượn.

**Thời hạn trả lời:**
- `pong` ≤ 300 ms. gr-nextwaves không nhận được thì coi là bản QR Scan Log chưa hỗ trợ.
- `lend:result` ≤ 5 s.

## 4. Hành vi QR Scan Log cần làm

### 4.1 Trọng tài: thêm trạng thái `lent`

- **State:** thêm `lent: null | { leaseId, label, until }`. Lưu cùng `rfid:broker` ở `storage.session` để worker khởi động lại vẫn biết. **KHÔNG** đụng cờ `rfidDisconnected`.
- **Sự kiện `lend` `{leaseId, label, ttlMs, now}`:**

| Tình huống | Xử lý |
|---|---|
| `off === null` | Trả `ok:false reason:"off_unknown"` |
| `off === true` | Trả `ok:true state:"off"`, không đặt `lent` |
| `lent` đang có, khác `leaseId`, còn hạn | **Lượt mới thay lượt cũ:** ghi đè `lent` (chỉ một lượt nhận tại một thời điểm) |
| Đặt `lent = { leaseId, label, until: now + ttlMs }` | Ngoài các trường hợp trên |
| Có `owner` | Gửi tab chủ yêu cầu nhả (`{t:"release", reason:"lend"}` hoặc message tương đương sẵn có). Chờ sự kiện `released` của tab đó (≤ 5 s) rồi mới trả `ok:true state:"released"`. Quá 5 s: trả `ok:false reason:"busy"`, **vẫn giữ `lent`** để tab không tự xin lại; gr-nextwaves sẽ gửi lại `lend` cùng `leaseId` |
| Không có `owner` | Trả `ok:true state:"free"` |

- **Sự kiện `claim` khi `lent` còn hạn:**
  - `auto` → `denied reason:"lent"`.
  - `resume` → `denied reason:"lent"`; tab đó phải đóng cổng.
  - `user` (người dùng bấm Kết nối RFID / Dùng RFID / "Lấy lại đầu đọc") → **kết thúc mượn sớm** (`lent = null`) rồi xét claim như thường. Người dùng luôn thắng.
- **Sự kiện `return` `{leaseId}`:**
  - `leaseId` khớp: `lent = null`, broadcast, đánh dấu `reclaimTabId = lastOwnerTabId`. Trả `ok:true state:"reclaiming"`; trả `"free"` nếu không có chủ cũ, `"off"` nếu đang Ngắt.
  - `leaseId` không khớp: trả `ok:false reason:"unknown_lease"`, không đổi gì. Cách này chặn lệnh trả muộn của một lượt cũ huỷ nhầm lượt mới.
- **Hết hạn:** xét ở mọi sự kiện / nhịp như lease hiện có. `now > lent.until` → coi như `return` đúng `leaseId`.
- **Góc nhìn tab** `brokerViewFor`: thêm `lent: null | { label, until }` và `reclaim: boolean` (đúng tab này được ưu tiên lấy lại).

### 4.2 Tab (`rfid-content.js`)

- **Nhận `release` vì `lend`:**
  - Đang gửi phím / đang đọc → **làm xong món đang gửi** (giống luồng Ngắt chờ `channel.exclusive`), rồi đóng cổng, nhả Web Lock, gửi `released`.
  - **Không** đặt cờ Ngắt. **Không** hiện lỗi đỏ.
- **Khi `lent` có:**
  - Không tự kết nối: `canAutoClaim` trả false.
  - Khung RFID ghi: *"Đầu đọc đang cho Nhận hàng RFID mượn (GR84674) — tự lấy lại khi xong, chậm nhất HH:MM"*, kèm nút **"Lấy lại đầu đọc"** (claim `user`).
- **Khi `lent` hết và `reclaim === true`:**
  - Tự kết nối lại bằng `getPorts` (`openPermitted`), **kể cả khi tab đang ẩn**: thêm lý do `why === "return"`, giống ngoại lệ `"plug"`.
  - **Không bao giờ** gọi `requestPort` ở đường này.
  - Mở không được (cổng còn bận): thử lại tối đa 3 lần, cách nhau 1 s, rồi báo như tự kết nối thất bại hiện nay.
- **Nghe `circa-reader/v1`:** chuyển `ping` / `lend` / `return` về worker (port broker sẵn có hoặc `runtime.sendMessage`), rồi post kết quả vào `window` của **chính tab đã nhận lệnh**.

### 4.3 Không đổi

Trừ tồn, `completed_items` / `stock_out`, QR, luật cấp quyền giữa các tab bán hàng, cờ Ngắt và hành vi nút Ngắt / Kết nối RFID hiện có.

## 5. Trình tự một lượt (để hiểu bối cảnh)

1. Dược sĩ bấm **"Nhận hàng bằng RFID"** trên danh sách phiếu nhận POS.
2. gr-nextwaves gửi `ping`. Có `pong` thì gửi `lend {leaseId, ttlMs:900000, label:"GR84674"}`.
3. QR Scan Log nhả cổng ở tab bán hàng, rồi trả `lend:result ok state:"released"`.
4. gr-nextwaves mở (hoặc tái dùng) **một** tab Nextwaves `…/receive?po=SOBD…`. Màn quét tự kết nối đầu đọc. Chưa được thì gr-nextwaves bấm nút kết nối của Nextwaves, đường dùng lại cổng đã cấp quyền.
5. Dược sĩ đặt hàng lên đầu đọc, bấm **"Xác nhận nhận hàng"** trên Nextwaves.
6. gr-nextwaves về trang phiếu POS, **tự điền mã cả phiếu**.
7. gr-nextwaves **đóng tab Nextwaves** (cổng trống), chờ 500 ms, gửi `return {leaseId}`.
8. QR Scan Log tự kết nối lại ở tab bán hàng cũ (`getPorts`, không hộp chọn). Dược sĩ kiểm phiếu rồi bấm **HOÀN THÀNH**.

**Lượt bị huỷ** (không có đơn Nextwaves, dược sĩ đóng tab Nextwaves, huỷ phiên): gr-nextwaves gửi `return` ngay khi tab Nextwaves đã đóng. gr-nextwaves treo / mất → hết hạn `ttlMs` thì QR Scan Log tự lấy lại.

## 6. An toàn

- Script lạ trên origin POS giả được message. Hậu quả tối đa:
  - đầu đọc bị nhả tới hết hạn (≤ 30 phút), hoặc người dùng bấm "Lấy lại đầu đọc";
  - một lệnh `return` giả với `leaseId` đúng chỉ làm QR Scan Log lấy lại sớm.
- Không có đường nào làm QR Scan Log ghi sai dữ liệu bán hàng / trừ tồn. Chấp nhận được; ghi rõ trong tài liệu.
- Không nhận lệnh từ khung (iframe) hay origin khác. Không đưa `label` vào `innerHTML`.
- Nhật ký (nếu có): `lend` / `return` / `expire` với `leaseId`, `label`, giờ. Không ghi gì khác.

## 7. Kiểm thử QR Scan Log cần có

**Unit `brokerStep`:**
- `lend` khi có chủ → yêu cầu nhả, chờ `released` → `ok released`.
- `lend` khi trống → `free`; khi `off` → `ok off`, không đặt `lent`; khi `off_unknown` → lỗi.
- `claim auto` / `resume` khi `lent` → `denied lent`; `claim user` → hết `lent` rồi cấp như thường.
- `return` đúng `leaseId` → `reclaim` cho `lastOwnerTabId`; sai `leaseId` → `unknown_lease`, không đổi.
- Gia hạn cùng `leaseId`; `lend` mới khác `leaseId` ghi đè.
- Hết hạn → như `return`.
- Worker khởi động lại giữa lúc mượn → `lent` còn (storage.session).

**Tab (serial giả):**
- Nhả sau khi gửi xong món đang gửi.
- Không tự kết nối khi `lent`.
- Lấy lại khi tab **ẩn** bằng `getPorts`, `requestPort` **không** bị gọi.
- Cổng còn bận → thử 3 lần.

**Kênh:**
- Message sai `ns` / `from` / origin / source / schema / ttl bị bỏ qua.
- Trả lời đúng `reqId`, đúng tab.
- `pong` ≤ 300 ms.

**Máy thật** (máy dev, cả hai extension):
- Tab bán hàng đang giữ đầu đọc → bấm "Nhận hàng bằng RFID" → Nextwaves tự kết nối → quét → xác nhận → POS điền → tab Nextwaves đóng → tab bán hàng tự kết nối lại, **không hộp chọn**.
- Lặp lại khi tab bán hàng đang ẩn.

## 8. Khi QR Scan Log chưa hỗ trợ (không có `pong`)

gr-nextwaves v0.4.0 vẫn chạy:
- Khung trên tab Nextwaves ghi "Đầu đọc đang bận ở tab bán hàng: bấm Ngắt RFID ở tab đó". Cổng trống thì gr-nextwaves tự bấm kết nối của Nextwaves.
- Sau lượt, dược sĩ bấm "Kết nối RFID" ở tab bán hàng như hiện nay.

## 9. Gửi lại cho phía gr-nextwaves khi xong

- Số phiên bản QR Scan Log có `circa-reader/v1` và mã gói.
- Một mẫu `pong` / `lend:result` / `return:result` thật.
- Mọi chỗ lệch so với hợp đồng này: tên trường, mã lỗi, thời hạn.

Phía gr-nextwaves không giả định gì ngoài mục 3.
