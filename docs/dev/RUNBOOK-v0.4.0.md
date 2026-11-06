# Hướng dẫn — nhận hàng RFID v0.4.0 (mọi cửa hàng, 07/11/2026)

Thay `RUNBOOK-PRD-FLORITA-v0.3.1.md`.
- Kế hoạch: `PLAN-v0.4.0-MOI-POS-E2E.md`.
- Báo cáo gói: `BATCH-v0.4.0.md`.

**Khác v0.3.1:**
- Chạy ở **mọi cửa hàng** POS.
- **Không còn cấp phép** trong popup. Sau khi dược sĩ bấm "Xác nhận nhận hàng" trên Nextwaves, extension **tự điền cả phiếu POS**.
- Extension **không bao giờ** bấm HOÀN THÀNH: dược sĩ kiểm danh sách rồi tự bấm.
- Đầu đọc tự chuyển sang tab Nextwaves, nhận xong tự trả cho tab bán hàng. Cần QR Scan Log có giao thức `circa-reader/v1`; chưa có thì làm tay, xem mục 0.5.
- Nextwaves chưa có đơn của SO: khung báo rõ "nhận tay". Hết lỗi treo "Đang tìm…" (GR84570).

**An toàn (extension tự giữ):**
- Chỉ điền khi Nextwaves đã nhận (lượt "Xác nhận nhận hàng" thành công) và kết quả nhận khớp đúng đơn: đúng SO, bên bán Buymed, số lượng từng sản phẩm, đúng kho.
- Mọi điều kiện không khớp → dừng, không ghi.
- Đọc lại phiếu sau mỗi lô.
- Chưa rõ kết quả (mất mạng, POS lỗi 5xx) → dừng, chờ 1 phút rồi mới cho điền tiếp.

## 0. Cài / nâng (một lần mỗi máy POS)

1. Hoàn tất mọi phiếu đang nhận dở bằng v0.3.1. Khi nâng, extension xoá phiên của bản cũ.
2. **Máy đã có v0.3.1** (Florita, `C:\circa-gr-nextwaves`):
   - Giải nén gói v0.4.0 **chép đè vào đúng thư mục đó**, giữ Extension ID.
   - `chrome://extensions` → **Reload (↻)** thẻ "Circa GR ← Nextwaves". Thẻ phải ghi **0.4.0**.
3. **Máy mới:**
   - Giải nén vào `C:\circa-gr-nextwaves`.
   - `chrome://extensions` → "Load unpacked" → chọn thư mục đó.
4. **Popup:**
   - **Môi trường: Production**.
   - **Tenant Nextwaves của máy**: để trống nếu máy dùng `circa.nextwaves.app` (Florita, Lumina). Máy đăng nhập Nextwaves ở địa chỉ khác (ví dụ `circa-medly.nextwaves.app`) thì điền `circa-medly`.
   - Bấm **Lưu**.
   - Dòng dưới phải ghi "Production: POS https://pos.v2.circa.vn · Nextwaves https://<tenant>.nextwaves.app · mọi cửa hàng".
5. **Đầu đọc:**
   - QR Scan Log của máy đã có bản hỗ trợ `circa-reader/v1` → không làm gì.
   - Chưa có → mỗi lượt nhận làm tay (mục 1, bước c).
6. F5 các tab POS. Đăng nhập Nextwaves bằng tài khoản **thấy được kho của cửa hàng**.

## 1. Một lượt nhận

**a. Mở phiếu.**
- POS → **Danh sách phiếu nhận hàng**. Tìm phiếu bằng ô tìm SO có sẵn của POS nếu cần.
- Trên dòng phiếu bấm **"Nhận hàng bằng RFID"**.
- Extension kiểm phiếu, PO, SO; mượn đầu đọc; mở (hoặc dùng lại) **một** tab Nextwaves đúng màn quét của SO.

**b. Tab Nextwaves.** Khung extension (góc dưới) ghi:
- **"Sẵn sàng nhận hàng"**;
- phiếu, đơn Nextwaves, số UID dự kiến;
- **Kho Nextwaves: <tên kho> (<mã>)**, phải đúng cửa hàng đang nhận;
- dòng **Đầu đọc** (bước c).

Các trường hợp khác:
- **"Nextwaves chưa có đơn chờ nhận cho SOBD…"** → hàng không gắn tem RFID, hoặc tài khoản Nextwaves không thấy kho của cửa hàng. **Nhận tay trên POS.** Có tem mà vẫn báo vậy: kiểm tài khoản rồi bấm **Tìm lại**.
- **SO tách giao:**
  - Màn quét Nextwaves bắt chọn đơn. Khung ghi "Nextwaves có N đơn cùng SO (tách giao): trên màn quét chọn ĐÚNG đơn PO-…" → chọn đúng đơn đó.
  - Nhận nhầm đơn của phiếu khác: extension tự giao kết quả cho đúng phiếu nếu phiếu đó đang mở. Không có phiếu nào thì báo đỏ → nhận tay.
- **"Chưa thấy Nextwaves tải dữ liệu"** → F5 tab Nextwaves, kiểm đã đăng nhập đúng địa chỉ.

**c. Đầu đọc.**
- **"Đầu đọc: đã kết nối"** / **"đang quét"** → sang bước d.
- **"chưa kết nối — extension đang tự kết nối…"** → chờ vài giây. Extension bấm nút "Kết nối đầu đọc" của Nextwaves, tối đa 3 lần.
- **"đang bận ở tab khác"** (QR Scan Log chưa hỗ trợ mượn) → sang tab bán hàng, khung RFID của QR Scan Log bấm **Ngắt**. Quay lại tab Nextwaves, bấm "Kết nối đầu đọc" nếu vẫn chưa kết nối.
- **"chưa kết nối được — bấm Mượn lại đầu đọc"** → bấm nút đó (QR Scan Log có hỗ trợ).

**d. Nhận (dược sĩ).**
- Đặt hàng lên đầu đọc, quét đủ: màn quét báo **còn lại 0, ngoài phiếu 0**.
- Bấm **"Xác nhận nhận hàng" đúng một lần**. Không chọn "Đóng đơn dù còn thiếu".

**e. Tự về POS và tự điền.** Không cần bấm gì.
1. Tab Nextwaves tự đóng (nhả đầu đọc), tab POS về đúng phiếu.
2. Khung ghi **"Đang điền i/n — CHƯA bấm HOÀN THÀNH"**. Lúc này **chưa bấm HOÀN THÀNH**: bấm khi đang điền dở, POS sẽ đóng phiếu thiếu.
3. Điền xong, trang tải lại, khung ghi **"GR…: đã điền N mã vào M lô — kiểm danh sách rồi bấm HOÀN THÀNH"**.
4. Tab bán hàng tự kết nối lại đầu đọc (nếu QR Scan Log hỗ trợ). Chưa hỗ trợ: dược sĩ bấm **Kết nối RFID** ở tab bán hàng như hiện nay.

**f. HOÀN THÀNH (dược sĩ).** Kiểm số lượng từng lô trên phiếu → bấm **HOÀN THÀNH** của POS.

**g. Lượt đầu ở mỗi máy:**
- Dán `kiem-sau.js` vào Console của Service worker → gửi kết quả cho Claude (kèm capture nếu có).
- Kỳ vọng: `state` `"applied"` hoặc `"done"`; `dien.how` `"auto"`; `dungDien` null; `nwReceipts` 1; `dauDoc` `"returned"` (hoặc `"no_qsl"`).

## 2. Khi khung báo dừng

| Khung ghi | Làm gì |
|---|---|
| "Kết quả nhận chưa đủ bằng chứng / không khớp dữ liệu đơn" (tab Nextwaves) | Không bấm gì thêm, chụp màn hình. Phiếu nhận tay, báo Claude. |
| "Nextwaves ĐÃ nhận — POS CHƯA điền" | Phiên của phiếu đã bị xoá / hết hạn. Nhận tay phiếu đó. |
| "Không điền được — N điểm chặn" (tab POS) | Bấm "Kiểm tra lại" (ví dụ tra QR lỗi tạm). Vẫn chặn → nhận tay phần này, báo Claude. |
| "Điền phiếu bị dừng" + nút **"Đọc lại và điền tiếp"** | Mất mạng / POS lỗi giữa chừng. Chờ thời gian ghi trên khung (khoảng 1 phút), rồi bấm nút: extension đọc lại phiếu, chỉ điền phần còn thiếu. |
| "Giao diện phiếu nhận đã đổi" (khung nổi) | F5 phiếu. Vẫn lỗi → nhận tay, báo Claude. |
| "Chỉ xem kế hoạch — chưa được điền phiếu" | Phiếu bị khoá (SO / PO có nhiều phiếu chưa phân biệt được) → nhận tay. |

## 3. Tắt / quay lại bản cũ

- **Tắt:** popup → Môi trường "— Chưa chọn —" → Lưu (extension không chạy). Hoặc tắt thẻ ở `chrome://extensions`. QR Scan Log không bị ảnh hưởng.
- **Quay lại v0.3.1:** chép gói v0.3.1 (`C:\circa-gr-nextwaves-release\v0.3.1\`) đè vào thư mục, rồi Reload. Phiên của v0.4.0 không dùng được ở bản cũ.
