# G3a lần 2 — kiểm chỉ đọc v0.2.3 trên Chrome staging (27/10/2026)

**Căn cứ:** `docs/pm/AUDIT-v0.2.3-F3-F4-G3a-20261027.md` mục "Lượt G3a chỉ đọc sau khi cài".

**Gói:** `C:\circa-gr-nextwaves-v0.2.3` (0.2.3, mã `40236D67`).

> **KHÔNG** bấm "Xác nhận nhận hàng", **KHÔNG** cấp phép điền, **KHÔNG** bấm HOÀN THÀNH / HỦY, **KHÔNG** sửa số lượng.

Kích thước: kiểm ở cửa sổ như lần trước, vùng trang khoảng **1095×756** (cửa sổ 1280×752, side panel Claude mở).

## 0. Cài đặt (operator đã làm 27/10)

- Đã gỡ 0.2.2 và nạp 0.2.3. Bản mới là extension mới (ID khác), nên phiên GR03879 của 0.2.2 **không** chuyển sang. Phiên đó chưa nhận, không mất gì.
- Chỉ bật một bản extension; popup chọn Staging; ô cấp phép điền trống.
- Ghi lại: `chrome://extensions` hiện 0.2.3.

## 1. Danh sách POS (`/danh-sach-phieu-nhan-hang`, tab "Tất cả")

1. **Trước khi bấm:**
   - nút "Nhận hàng bằng RFID" ở 7 dòng chờ / đang nhận, cột Hành động;
   - đo chiều cao dòng (kỳ vọng **57px**), tiêu đề cột một dòng.
2. Bấm **một lần** nút của một GR **chưa có phiên** (gợi ý **GR03879**: phiên 0.2.2 không sang bản mới).
3. **Sau khi bấm:**
   - nút đổi "Đang kiểm…" rồi **"Mở Nextwaves"**;
   - tab POS ở lại danh sách;
   - dòng vẫn **57px**, tiêu đề **không xuống dòng**;
   - **không có khung nổi** che phân trang / cột Hành động;
   - di chuột vào nút: tooltip có "GR03879 · phiên … (waiting_nw) · Mở lại tab Nextwaves…".
4. Nếu hiện thông báo (vd. "Danh sách đã đổi — bấm lại"):
   - nó phải nằm **ngay trên bảng**, trong trang, không che nút / phân trang;
   - bấm "Đóng" thì mất.

   Không chủ động gây lỗi để lấy thông báo.

## 2. Màn quét Nextwaves (tab extension vừa mở)

5. Cuộn thân màn quét xuống cuối, giữ khung extension **mở rộng**:
   - khung và nút **"Xác nhận nhận hàng"** cùng nhìn thấy, **không chồng nhau**;
   - một ảnh có cả hai là đủ;
   - **không bấm** xác nhận.

## 3. Ghi lại

6. Số tab Nextwaves extension mở (kỳ vọng **1**).
7. Popup extension: đúng **một** phiên của GR đã bấm.
8. Ảnh (che tên nhân viên nếu đưa ra ngoài):
   - danh sách trước / sau bấm;
   - Nextwaves sau cuộn;
   - popup;
   - `chrome://extensions`.

   Ghi kích thước vùng trang.
