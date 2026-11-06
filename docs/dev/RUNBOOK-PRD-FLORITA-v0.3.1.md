# Hướng dẫn — nhận hàng RFID production tại Florita, v0.3.1 (sửa 06/11/2026)

**Một bản, cài một lần trên máy POS Florita, rồi chạy luồng thật.** Dược sĩ thao tác thật, operator bật Net Capture.
- Operator 06/11: chạy hết một luồng E2E thật, **không chờ Claude ở từng chốt**. Tự đối chiếu theo kỳ vọng ghi ở mỗi bước; sai thì dừng, gửi kết quả + capture, sửa tiếp.
- Báo cáo gói: `docs/dev/BATCH-v0.3.1.md`.

**An toàn (extension tự giữ, không cần nhớ):**
- Không ghi gì vào POS khi chưa có quyền cho đúng phiếu:
  - tự động: cho phép từng phiên trong popup, hết hạn sau 30 phút;
  - thủ công: cấp phép từng lần.
- Chỉ chạy ở **Florita**. Cửa hàng khác không có nút, không tạo phiên.
- Mọi điều kiện không khớp (đơn Nextwaves, số tem, biên nhận, khung trang phiếu, đọc lại phiếu) → dừng, không ghi sai.

## 0. Cài (một lần, trên máy POS Florita)

1. Chép thư mục giao `C:\circa-gr-nextwaves-release\v0.3.1` sang máy POS. Thư mục gồm:
   - `circa-gr-nextwaves-v0.3.1.zip`: gói cài, **mã gói AEE4447F**. Các gói trong `khong-dung` KHÔNG cài;
   - `kiem-truoc.js`, `kiem-quet.js`, `kiem-sau.js`, `kiem-khung-gr.js`;
   - hướng dẫn này;
   - `SHA256SUMS.txt`.
2. Giải nén ZIP vào **`C:\circa-gr-nextwaves`**. Chrome nạp extension từ thư mục này, không xoá / đổi tên. Bản sau chép đè đúng thư mục này để giữ phiên.
3. `chrome://extensions` → "Load unpacked" (Tải tiện ích đã giải nén) → chọn `C:\circa-gr-nextwaves`.
   - Kết quả: thẻ **"Circa GR ← Nextwaves" 0.3.1**.
   - "Developer mode" đã bật sẵn vì máy đang chạy QR Scan Log.
4. Bấm biểu tượng extension → **Môi trường: Production** → **Lưu**.
   - Dòng dưới ghi "Production: POS https://pos.v2.circa.vn · Nextwaves https://circa.nextwaves.app · chỉ cửa hàng c476efb2-…".
   - Dòng này **không** có chữ "CHỈ ĐỌC".
5. Tab POS: **F5**. Tab Nextwaves: đăng nhập `circa.nextwaves.app` bằng tài khoản thấy được kho Florita.

## 1. Một lượt nhận (dược sĩ thao tác thật)

**a. Bật capture.**
- Bật Net Capture trên tab POS (trang "Danh sách phiếu nhận hàng"), rồi F5.

**b. Mở đơn.** Dòng của phiếu → bấm **"Nhận hàng bằng RFID"**. Extension mở một tab Nextwaves riêng cho phiếu đó, đúng màn quét.
- Bật Net Capture trên tab Nextwaves vừa mở → bấm **"Đọc lại kết quả nhận"** trong khung extension (chỉ đọc).
- Khung extension trên tab Nextwaves phải ghi:
  - **"Sẵn sàng nhận hàng"**;
  - bảng SL GR = SL Nextwaves từng sản phẩm;
  - dòng "Tự động: chưa cho phép".
- Phiếu **không có đơn Nextwaves** (hàng không kèm tem RFID): khung báo "Không có đơn Nextwaves khớp" → nhận tay như hiện nay.

**SO tách giao** (một SO giao nhiều lần: POS có PO `-P1`, `-P2`; Nextwaves có nhiều đơn cùng SO, ví dụ SOBD38565378 có PO-2026-000001 và PO-2026-000003):
- Màn quét Nextwaves hiện *"Có nhiều đơn chờ nhận hàng khớp với SOBD… Hãy chọn một đơn"*. Khung extension ghi *"Nextwaves có N đơn cùng SO (tách giao): trên màn quét chọn ĐÚNG đơn PO-…"* → **chọn đúng PO đó**. Nhận nhầm đơn khác: extension bỏ qua, không điền phiếu POS.
- Mỗi phiếu mở bằng nút **"Nhận hàng bằng RFID" của chính phiếu đó** trên POS. Tab Nextwaves do nút mở luôn gắn đúng phiếu đó (sửa 06/11). Tab Nextwaves tự mở tay: chỉ gắn được khi đang có đúng một phiếu của SO.
- Phiếu `-P2` của PO khác **không còn khoá** phiếu `-P1` (sửa 06/11). Hai phiếu cùng một PO thì vẫn khoá → nhận tay.
- Phần giao không đủ tem RFID cho mọi dòng phiếu (ví dụ `-P2` có 8 dòng trên POS, chỉ 3 dòng có tem): khung báo không khớp → nhận tay.

**c. Kiểm trước (chỉ đọc).**
- `chrome://extensions` → thẻ extension → **Service worker** → Console → dán cả `kiem-truoc.js` → Enter. **Không cần sửa mã phiếu** khi chỉ đang làm một phiếu: đoạn kiểm tự lấy phiên mới nhất và in mã phiếu đã lấy (`gr`).
- Kỳ vọng — đúng hết mới sang d:
  - `gr` = mã phiếu đang làm; `mode` và `env` = `"PRD"`; `phienTrungMa` 0;
  - `state` `"nw_ready"`; `scanOk` false; `bienNhanTruoc` 0; `khoa` `[]`; `kho` true;
  - `so` = mã giao của phiếu; `nwPo` = đơn Nextwaves khung ghi;
  - mọi dòng `"có tem"`; `tem` = `temKhongTrung` = **số tem vật lý**; `thieuUid` 0;
  - `grNw`: mỗi sản phẩm hai số bằng nhau.
- Ví dụ GR84674: `so` SOBD38567266-P1, `nwPo` PO-2026-000002, 14 dòng, `tem` 39.
- Sai một mục → không sang d. Gửi Claude kết quả in ra; phiếu nhận tay.

**d. Cho phép.** Chọn MỘT trong hai:
- **Tự động (luồng đầy đủ — extension tự điền VÀ tự HOÀN THÀNH phiếu POS):**
  - Popup → mục **"Phiên gần đây"** (đầu popup) → dòng `PRD · GR…` "Đã khớp đơn Nextwaves" → **"Cho phép tự điền và HOÀN THÀNH 1 lần"**.
  - Đọc khung xác nhận: Production · Florita · đúng GR / SO / PO Nextwaves / số tem. Đúng thì bấm **"Xác nhận cho phép"**.
  - Quyền hết hạn sau **30 phút**: phải bấm "Xác nhận nhận hàng" trên Nextwaves trong 30 phút đó.
- **Thủ công (extension chỉ điền, dược sĩ tự HOÀN THÀNH):** không cho phép tự động, bỏ qua e. Làm f → g, rồi ở bước h dùng ô **"Cấp phép điền THỦ CÔNG"**.

**e. Chốt chặn (chỉ khi chọn tự động).**
- Console Service worker → dán `kiem-quet.js` → phải in **`SẴN SÀNG QUÉT: GR… · PO… · N tem · quyền còn NN phút`**.
- Khung trên tab Nextwaves tự đổi thành **"Tự động: ĐÃ CHO PHÉP 1 lần (hết hạn …)"** (không cần F5; F5 khi đã quét tem thì phải quét lại).
- In `DỪNG: …` → không bấm xác nhận; làm theo lý do in ra (ví dụ cho phép lại), hoặc chuyển sang thủ công.

**f. Nhả đầu đọc cho Nextwaves.** Tab bán hàng → khung RFID của QR Scan Log → **"Ngắt"** (ngắt ở mọi tab bán hàng).
- Màn quét Nextwaves báo "đầu đọc đang được sử dụng": kiểm lại đã Ngắt chưa, hoặc đóng tab bán hàng.
- Lần đầu dùng đầu đọc trên `circa.nextwaves.app` ở máy này, Chrome hỏi chọn cổng: chọn đầu đọc RFID.

**g. Nhận hàng (dược sĩ).**
- Quét đủ tem. Chỉ khi màn quét báo **còn lại 0, ngoài phiếu 0**, mọi dòng đủ, mới bấm **"Xác nhận nhận hàng" đúng một lần**.
- Không chọn "Đóng đơn dù còn thiếu".
- Khung Nextwaves: "Đã nhận đủ N UID — Đang chuyển về POS…". Báo "Kết quả nhận chưa đủ bằng chứng" → dừng (mục 2).

**h. Tab POS.**
- **Tự động:** không chạm POS (không bấm Điền / HOÀN THÀNH / Xoá / Huỷ phiên, không F5). Tab POS tự về phiếu và hiện lần lượt:
  1. "Đang TỰ điền i/n";
  2. "Đang đọc lại … trước khi tự HOÀN THÀNH";
  3. "Đang tự HOÀN THÀNH";
  4. "đã tự HOÀN THÀNH — đang tải lại phiếu".

  Cuối cùng phiếu ở **"Đã nhận"** (POS gọi phiếu hoàn thành là "Đã nhận").
- **Thủ công:** popup → **"Cấp phép điền THỦ CÔNG"** → mã phiếu → cấp phép → trên phiếu bấm **"Điền vào phiếu GR… · kế hoạch #…"** → chờ "đã điền N UID" → dược sĩ kiểm rồi tự bấm **HOÀN THÀNH** trên POS.

**i. Sau lượt.**
- Dừng capture cả hai tab.
- Console Service worker → dán `kiem-sau.js` (không cần sửa mã khi vừa làm phiếu đó).
- Tự động đạt: `state` `"done"`, `hoanThanh.source` `"auto"`, `quyenDaDung.auto` true, `nwReceipts` 1, `autoGrantsConLai` 0.
- **Gửi Claude:** kết quả in ra + 2 file capture (lượt đầu bắt buộc: dữ liệu Nextwaves production SAU khi nhận chưa có mẫu).

**j. Trả đầu đọc cho bán hàng.** Đóng tab Nextwaves → tab bán hàng → khung RFID của QR Scan Log → **"Kết nối RFID"**.

## 2. Dừng ngay nếu thấy

Trên POS:
- "Tự động KHÔNG chạy: …" (ghi rõ lý do);
- "Tự động: chưa cho phép ở lượt nhận này";
- "đọc lại chưa khớp hoàn toàn";
- "chưa rõ POS đã HOÀN THÀNH chưa";
- "Không điền được".

Trên Nextwaves: "Kết quả nhận chưa đủ bằng chứng / không khớp dữ liệu đơn".

Khi đó:
- Không bấm gì thêm, giữ tab, chụp màn hình.
- Dừng capture, chạy `kiem-sau.js`, gửi Claude kèm capture.
- **Không cho phép tự động lại trên cùng phiếu.**
- Hàng đã nhận trên Nextwaves thì phiếu POS hoàn tất theo đường thủ công (cấp phép thủ công → "Điền" → dược sĩ HOÀN THÀNH), hoặc dược sĩ nhập tay trên POS như hiện nay.

## 3. Tắt extension nếu cần

Popup → Môi trường **"— Chưa chọn —"** → Lưu: extension không chạy trên trang nào. Hoặc tắt thẻ ở `chrome://extensions`. QR Scan Log không bị ảnh hưởng.
