# Hướng dẫn — đơn production đầu tiên tại Florita, v0.3.1 (05/11/2026)

**Một bản, cài một lần, rồi xử lý ngay đơn thật** (operator chốt 05/11). Đơn đầu chạy **tự động**, có Net Capture.
Plan: `docs/dev/PLAN-PRD-FLORITA-v0.3.x-20261030.md` (bản sửa 05/11). Báo cáo gói: `docs/dev/BATCH-v0.3.1.md`.

**An toàn:**
- Extension **không ghi gì** vào POS khi chưa có cấp phép cho đúng phiếu: tự động thì cho phép từng phiên trong popup, thủ công thì cấp phép từng lần.
- Production chỉ chạy ở **Florita**. Cửa hàng khác: không có nút, không tạo phiên.
- Ghi thật chỉ khi operator cho phép **bằng chữ** cho đúng phiếu đó, như G3.

## 0. Cài (một lần, trên máy POS Florita)

1. Chép thư mục giao `circa-gr-nextwaves-v0.3.1` (ZIP + `SHA256SUMS.txt` + 3 file `kiem-*.js`) sang máy POS, như cách vẫn cài QR Scan Log.
2. Giải nén ZIP vào **`C:\circa-gr-nextwaves`**. Đây là thư mục cố định: Chrome nạp extension từ đây, không xoá / đổi tên. Bản sau sẽ chép đè đúng thư mục này để giữ phiên.
3. `chrome://extensions` → "Load unpacked" (Tải tiện ích đã giải nén) → chọn `C:\circa-gr-nextwaves`.
   - Kết quả: thẻ **"Circa GR ← Nextwaves" 0.3.1**.
   - "Developer mode" đã bật sẵn vì máy đang chạy QR Scan Log.
4. Bấm biểu tượng extension → **Môi trường: Production** → **Lưu**.
   - Dòng dưới ghi "Production: POS https://pos.v2.circa.vn · Nextwaves https://circa.nextwaves.app · chỉ cửa hàng c476efb2-…".
   - Dòng này **không** có chữ "CHỈ ĐỌC".
5. Tab POS: **F5**. Tab Nextwaves: đăng nhập `circa.nextwaves.app` bằng tài khoản thấy được kho Florita.

## 1. Khi có đơn thật

**a. Bật capture.**
- Bật Net Capture trên tab POS (trang danh sách phiếu nhận hàng), rồi F5.
- Tab Nextwaves do extension mở ở bước b. Khi tab đó mở, bật capture trên tab đó rồi bấm "Đọc lại kết quả nhận" trong khung extension.

**b. Mở đơn.** Trang "Danh sách phiếu nhận hàng" → dòng của phiếu → bấm **"Nhận hàng bằng RFID"**. Extension mở màn quét Nextwaves đúng đơn. Khung extension trên tab Nextwaves phải ghi:
- **"Sẵn sàng nhận hàng"**;
- bảng SL GR = SL Nextwaves từng sản phẩm;
- dòng "Tự động: chưa cho phép".

**c. Kiểm trước (chỉ đọc).**
- `chrome://extensions` → thẻ extension → **Service worker** → Console.
- Mở `kiem-truoc.js`, sửa dòng `const GR = "GR?????"` thành mã phiếu, dán cả đoạn, Enter.
- **Gửi Claude** ba thứ:
  - kết quả in ra;
  - số tem vật lý đang có;
  - câu cho phép, ví dụ: *"Cho phép: một lượt nhận + tự điền + tự HOÀN THÀNH trên GR… / PO… / SO…, N tem, đủ N tem vật lý"*.
- Claude đối chiếu xong mới sang bước d.

**d. Cho phép tự động.**
- Mở popup. Mục **"Phiên gần đây"** (đầu popup) → dòng `PRD · GR…` "Đã khớp đơn Nextwaves" → **"Cho phép tự điền và HOÀN THÀNH 1 lần"**.
- Đọc khung xác nhận: Production · Florita · đúng GR / SO / PO Nextwaves / số tem. Đúng thì bấm **"Xác nhận cho phép"**.
- **Không** dùng ô "Cấp phép điền THỦ CÔNG" ở dưới. Nếu lỡ bấm, popup chỉ cảnh báo, chưa cấp gì.

**e. Chốt chặn.**
- Console Service worker → `kiem-quet.js` (sửa mã phiếu) → phải in **`SẴN SÀNG QUÉT: GR… · PO… · N tem · quyền còn NN phút`**.
- Khung extension trên tab Nextwaves phải ghi **"Tự động: ĐÃ CHO PHÉP 1 lần (hết hạn …)"**. Chưa đổi thì F5 tab Nextwaves.
- In `DỪNG: …` → **không quét**, gửi Claude dòng đó.
- Nếu phiên đã bị Xoá / mở lại sau khi cho phép thì quyền cũ mất: làm lại d rồi e.

**f. Nhả đầu đọc cho Nextwaves.** Trên tab bán hàng, khung RFID của QR Scan Log → bấm **"Ngắt"**. Lệnh này ngắt đầu đọc ở mọi tab bán hàng.
- Màn quét Nextwaves báo "đầu đọc đang được sử dụng": kiểm lại đã Ngắt chưa, hoặc đóng tab bán hàng.
- Lần đầu dùng đầu đọc trên `circa.nextwaves.app` ở máy này, Chrome hỏi chọn cổng: chọn đầu đọc RFID.

**g. Nhận hàng (dược sĩ).**
- Đặt đủ tem.
- Chỉ khi màn quét báo **còn lại 0, ngoài phiếu 0**, mọi dòng đủ, mới bấm **"Xác nhận nhận hàng" đúng một lần**.
- Không chọn "Đóng đơn dù còn thiếu".

**h. Không chạm POS.** Không bấm Điền / HOÀN THÀNH / Xoá / Huỷ phiên, không F5. Tab POS tự về phiếu và hiện lần lượt:
1. "Đang TỰ điền i/n";
2. "Đang đọc lại … trước khi tự HOÀN THÀNH";
3. "Đang tự HOÀN THÀNH";
4. "đã tự HOÀN THÀNH — đang tải lại phiếu".

Cuối cùng phiếu ở trạng thái **"Đã nhận"** (POS gọi phiếu hoàn thành là "Đã nhận").

**i. Sau lượt.**
- Dừng capture cả hai tab.
- Console Service worker → `kiem-sau.js` (sửa mã phiếu).
- **Gửi Claude:** kết quả in ra + 2 file capture.

**j. Trả đầu đọc cho bán hàng.** Đóng tab Nextwaves → tab bán hàng → khung RFID của QR Scan Log → **"Kết nối RFID"**.

## 2. Dừng ngay nếu thấy

Trên POS:
- "Tự động KHÔNG chạy: …" (v0.3.1 ghi rõ lý do);
- "Tự động: chưa cho phép ở lượt nhận này";
- "đọc lại chưa khớp hoàn toàn";
- "chưa rõ POS đã HOÀN THÀNH chưa";
- "Không điền được".

Khi đó:
- Không bấm gì thêm, giữ tab, chụp màn hình.
- Chạy `kiem-sau.js` và gửi Claude kèm capture.
- **Không cho phép tự động lại trên cùng đơn.**
- Phiếu hoàn tất theo đường thủ công khi operator cho phép riêng: cấp phép thủ công → "Điền" → dược sĩ HOÀN THÀNH. Hoặc dược sĩ nhận tay trên POS như hiện nay.

## 3. Tắt extension nếu cần

Popup → Môi trường **"— Chưa chọn —"** → Lưu: extension không chạy trên trang nào. Hoặc tắt thẻ ở `chrome://extensions`. QR Scan Log không bị ảnh hưởng.
