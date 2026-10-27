# Hướng dẫn operator — kiểm G0.3 UI + G3a chỉ đọc với v0.2.2 trên Chrome staging (27/10/2026)

**Căn cứ:** `docs/pm/AUDIT-v0.2.2-G0-G1-G2-20261027.md` mục "G3a". **Gói:** `C:\circa-gr-nextwaves-v0.2.2` (v0.2.2, mã gói `AB96179D`).

**Thời gian:** khoảng 20 phút.

> **KHÔNG** bấm "Xác nhận nhận hàng" (Nextwaves), **KHÔNG** cấp phép điền, **KHÔNG** bấm HOÀN THÀNH / HỦY phiếu (POS).
> Lượt này chỉ xem giao diện và tạo **một** phiên trong extension. Extension chỉ đọc (GET), không ghi gì lên POS / Nextwaves.

Chụp ảnh nào thì đặt tên đúng như dưới, lưu vào một thư mục, ví dụ `Downloads\G3a-20261027\`. Chụp **cả cửa sổ** để thấy kích thước.

## A. Trước khi cài

1. Mở popup của extension circa-gr-nextwaves **đang cài**: biểu tượng ở thanh công cụ Chrome.
   - Nếu danh sách phiên có phiên ở trạng thái **chờ Nextwaves / Nextwaves đã sẵn sàng / đã nhận / đang điền / dừng điền** (mã `waiting_nw`, `nw_ready`, `received`, `applying`, `apply_stopped`), **dừng lại**. Chụp `G3a-0-popup-cu.png` và gửi dev / PM, chưa cài.
   - Không có phiên dở thì đi tiếp.
2. Mở `chrome://extensions` → bật **Developer mode** (góc phải trên).
3. **Gỡ** (Remove) mọi bản circa-gr-nextwaves cũ (v0.1.x / v0.2.x). Không để hai bản cùng bật.
4. Bấm **Load unpacked** → chọn thư mục `C:\circa-gr-nextwaves-v0.2.2`.
   - Thẻ extension phải hiện **0.2.2**. Chụp `G3a-1-extensions.png`.
5. Mở popup → chọn **Staging**. Ô cấp phép điền **để trống**.
6. Tải lại (F5) mọi tab POS staging và Nextwaves staging đang mở. Hai trang đều phải đang đăng nhập.

## B. Danh sách phiếu nhận (POS staging, cửa hàng 2222)

7. Mở `https://pos.stg.circa-v2.buymed.tech/danh-sach-phieu-nhan-hang` (tab "Tất cả").
8. Kiểm:
   - Nút **"Nhận hàng bằng RFID"** chỉ ở dòng **Chờ nhận / Đang nhận**. Trang 1 hôm nay kỳ vọng 7 dòng: GR03887, 03886, 03883, 03879, 03878, 03877, 03842.
   - Nút nằm ở cột **Hành động**, cạnh 2 icon.
   - Dòng có nút **không cao hơn** dòng không có nút.

   Chụp `G3a-2-danh-sach.png`, thấy rõ vài dòng có và không có nút.
9. Ghi URL hiện tại của tab POS (thanh địa chỉ).
10. Bấm nút "Nhận hàng bằng RFID" **của dòng GR03879** (chỉ dòng này, bấm một lần). Kiểm:
    - tab POS **ở lại danh sách**, không mở phiếu;
    - mở **đúng một** tab Nextwaves (màn quét);
    - nút dòng GR03879 đổi thành **"Đang nhận trên Nextwaves"**.

    Chụp `G3a-3-sau-khi-bam.png` (tab POS) và ghi số tab Nextwaves mới mở.

## C. Màn quét Nextwaves (tab vừa mở)

11. Chờ khung extension góc dưới phải hiện trạng thái (đã khớp đơn / chờ đặt hàng lên đầu đọc).
    - **Không** kết nối đầu đọc, **không** bấm "Xác nhận nhận hàng".
12. **Cuộn thân màn quét xuống cuối** để thấy nút "Xác nhận nhận hàng".
    - Kiểm khung extension **không che** nút đó, cả **ngay sau khi cuộn**.
    - Chụp `G3a-4-nw-mo-rong.png`.
13. Bấm nút **thu nhỏ** (–) trên khung extension, cuộn lên rồi cuộn xuống cuối lần nữa.
    - Kiểm vẫn không che. Chụp `G3a-5-nw-thu-nho.png`.
    - Bấm lại để mở khung (không bắt buộc).

## D. Trang phiếu POS có HỦY / HOÀN THÀNH

14. Mở phiếu **GR03878** (đang nhận): `https://pos.stg.circa-v2.buymed.tech/danh-sach-phieu-nhan-hang/2de6c0ec-2ea8-4038-8616-659fa3f5820a`.
15. Kiểm khung extension (góc dưới phải) **không che** HỦY / HOÀN THÀNH.
    - Chụp `G3a-6-pos-phieu-mo-rong.png`.
    - Thu nhỏ khung → chụp `G3a-7-pos-phieu-thu-nho.png`.
    - **Không bấm** HỦY / HOÀN THÀNH.

## E. Ghi lại và gửi

16. Mở popup extension: phải có **một** phiên mới cho GR03879. Chụp `G3a-8-popup.png`.
17. Gửi dev / PM:
    - các ảnh `G3a-*.png`;
    - kích thước màn hình (Windows → Settings → Display, hoặc "1366×768 / 1920×1080");
    - URL tab POS trước / sau bước 10;
    - số tab Nextwaves mở;
    - mọi điều bất thường: khung che nút, nút sai dòng, trang chậm / giật, thông báo lỗi.

**Sau lượt này:**
- Để nguyên phiên GR03879. Lượt nhận thật (G3b) chỉ làm khi operator cho phép riêng đúng PO / GR.
- Muốn huỷ phiên: mở phiếu GR03879 trên POS, bấm **"Huỷ phiên"** trong khung extension. Nút này chỉ huỷ phiên trong extension, không đụng POS / Nextwaves.
- Nếu Claude in Chrome kết nối được (side panel Claude, đăng nhập cùng tài khoản), dev có thể tự quan sát và chụp phần B–D thay operator.
