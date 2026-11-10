# Yêu cầu gửi QR Scan Log — nhả đầu đọc cho chắc (gr-nextwaves v0.4.2, 10/11/2026)

- **Gửi:** đội QR Scan Log, qua operator.
- **Từ:** gr-nextwaves (Claude, phiên ghi `bf911b64`).
- **Phạm vi:** chỉ phần `circa-reader/v1` trong `rfid-content.js` / `rfid-core.js`. Phần này của v0.9.7 và v0.9.8 giống hệt nhau.
- **gr không chờ:** gr v0.4.2 có đường lùi, nhưng đường lùi là tự bấm Ngắt. Ngắt xong thì tab bán hàng phải bấm "Kết nối RFID" và chọn cổng.

## 1. Vì sao

- Operator 10/11 yêu cầu: mở phiên nhận Nextwaves thì phải lấy được đầu đọc **100%, không báo lỗi**, kể cả khi đang mở nhiều tab bán hàng.
- Màn quét Nextwaves tự kết nối ngay khi modal mở. Nếu lần đầu hỏng, Nextwaves để dải đỏ "đầu đọc đang được sử dụng" tới khi dược sĩ bấm ×.
- gr v0.4.2 vì vậy giữ lệnh mở cổng của Nextwaves lại tới khi QR Scan Log nhả xong.
- gr đọc mã QR Scan Log (HEAD `623a2ff`, chỉ đọc) và thấy **hai đường QR Scan Log trả "đã nhả / trống" trong khi một tab vẫn giữ cổng**. Đây là hai chỗ hợp đồng không gỡ được.

## 2. Lỗi 1 — `lend` tới đúng lúc một tab đang mở đầu đọc

- **Mã:**
  - `rfid-content.js:1529-1532` (`releaseForOtherTab`): `if (!reader) { brokerSend({ t: "released" }); return; }`.
  - `reader` chỉ được gán ở `:881`, sau khi lấy Web Lock, `port.open` và chuỗi kết nối. Chuỗi kết nối mất tới ~3 s (`rfid-protocol.js:549`).
- **Hệ quả:**
  - `lend` tới trong khoảng đó → QSL trả `released` ngay;
  - tab mở xong thì vẫn giữ cổng;
  - broker có `owner = null`, nên `lend` sau chỉ nhận `free`;
  - không đoạn mã nào đóng cổng của tab đó.
- **Khi nào xảy ra:**
  - 0–4 s sau một lượt trả (tab cũ tự lấy lại 3 × 1 s);
  - cắm lại USB;
  - tab bán hàng vừa hiện lên hoặc vừa vào `/ban-hang`.
- **Đề nghị:** tab đang mở dở thì chờ mở xong rồi đóng (hoặc huỷ lượt mở), sau đó mới gửi `released`. Không bao giờ gửi `released` khi tab còn giữ, hoặc sắp giữ, cổng.

## 3. Lỗi 2 — tab mất quyền chủ nhưng vẫn giữ cổng

- **Mã:**
  - quyền chủ kéo dài 15 s, giữ bằng nhịp 5 s (`rfid-core.js:1424-1425`, `rfid-content.js:3543`);
  - mất nhịp → broker xoá chủ (`rfid-core.js:1622`);
  - nhịp tới sau đó của tab bị bỏ qua (`:1804`), nhưng tab vẫn giữ cổng.
- **Khi nào mất nhịp:** Chrome giãn bộ đếm giờ của tab ẩn lâu. Cần kiểm trên máy POS.
- **Hệ quả:** `lend` nhận `ok free` (`:1776-1778`), không tab nào được nhờ nhả.
- **Đề nghị, chọn một:**
  - tab đang mở cổng mà thấy broker không còn nhận nó là chủ (hoặc thấy `lent`) → tự đóng cổng như khi nhận `release`, làm nốt món đang gõ;
  - nhịp tới muộn mà chưa có tab khác làm chủ → broker nhận lại tab đó làm chủ.

## 4. Không đổi

- Hợp đồng, tên, thuộc tính, Web Lock, M8, hạn 4 s / 4,5 s.
- gr v0.4.2 vẫn gửi `lend` / `return` như v0.4.1. Phần khác:
  - `busy` → gửi lại mỗi 1,5 s, tối đa 25 s. Vẫn trong giới hạn 10 lệnh / 10 s.
  - Mỗi lần Nextwaves mở cổng dùng `leaseId` mới; gia hạn dùng `leaseId` cũ.
  - Trả khi Nextwaves đóng cổng ≥ 1,5 s, hoặc tab Nextwaves đóng.
  - Sau mỗi lượt trả, chờ ≥ 5 s mới mượn lại.
  - Sau `ok`, gr đọc Web Lock `circa-qr-scan-log:rfid-reader`. Sau 4 s mà lock còn bị giữ → gr bấm Ngắt ở tab đang giữ, khi tab đó không đang gửi tem.

## 5. Kiểm đề nghị

- `lend` trong lúc tab đang mở (giả lập `port.open` chậm 2 s) → `released` chỉ tới sau khi cổng đã đóng; Web Lock trống.
- Tab ẩn lỡ nhịp > 15 s → tab tự đóng cổng; `lend` sau → cổng trống thật.
- Trả rồi mượn lại sau 0,5 / 1 / 2 / 3 s → lần nào cổng cũng trống thật.

## 6. Gửi lại

- Số bản, mã gói, và một dòng: đã sửa lỗi 1 / lỗi 2.
- QR Scan Log sửa xong thì gr không phải đổi mã.
