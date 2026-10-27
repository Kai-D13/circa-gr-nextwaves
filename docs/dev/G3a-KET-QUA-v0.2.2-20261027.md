# G3a / G0.3 — kết quả lần 1 với v0.2.2 trên Chrome staging (27/10/2026, chưa đủ)

**Căn cứ:** `docs/pm/AUDIT-v0.2.2-G0-G1-G2-20261027.md` mục G3a; hướng dẫn `docs/dev/G3a-v0.2.2-HUONG-DAN.md`.
- Operator cài v0.2.2 trên Chrome staging. Lượt kiểm chạy bằng Claude trong side panel Chrome của operator (không nối với session dev); operator chuyển kết quả và ảnh cho dev.
- Dev đã xem trực tiếp 4 ảnh.

**Ảnh:** `Downloads\G3a-2-danh-sach.png`, `G3a-3-sau-khi-bam.png`, `G3a-6-pos-phieu-mo-rong.png`, `G3a-7-pos-phieu-thu-nho.png`.
- Ảnh **không** đưa vào repo: có tên nhân viên ở tooltip ảnh đại diện và ô "Nhân viên kiểm". Muốn lưu thì phải che trước.
- **Khung nhìn:** vùng trang 1095×756 (side panel Claude chiếm bớt ngang); cửa sổ 1280×752; màn hình 1280×800, tỉ lệ 1,125.

## 1. Đã kiểm

| Mục PM | Kết quả | Bằng chứng |
|---|---|---|
| Danh sách: nút chỉ ở GR chờ / đang nhận, đúng ô | **Đạt** — 7 dòng (GR03887, 03886, 03883, 03879, 03878, 03877, 03842), nút ở cột Hành động cạnh 2 icon | G3a-2 |
| Danh sách: dòng không cao thêm (trước khi bấm) | **Đạt** — mọi dòng 57px | G3a-2 |
| Bấm "Nhận hàng bằng RFID" GR03879 một lần | POS **ở lại danh sách** (URL trước = sau = `/danh-sach-phieu-nhan-hang`); nút đổi "Đang nhận trên Nextwaves" | G3a-3 |
| POS GR03878: khung không che HỦY / HOÀN THÀNH | **Đạt** — mở rộng và thu nhỏ, khung cách hai nút ~10px. Không bấm HỦY / HOÀN THÀNH / nút trong khung | G3a-6, G3a-7 |

## 2. Phát hiện

### F3 — Bảng danh sách dàn lại sau khi bấm (dòng 57 → 73px). **Không đạt** "dòng không cao thêm"

- Sau khi bấm, nhãn đổi "Nhận hàng bằng RFID" → **"Đang nhận trên Nextwaves"**, dài hơn. Ở trang rộng 1095px, cột Hành động nở ra nên **cả bảng dàn lại**:
  - tiêu đề "Mã phiếu kiểm", "Thời gian tạo"… xuống dòng;
  - mọi dòng 57 → 73px.
- Trước khi bấm (nhãn ngắn) bảng giữ nguyên 57px.
- Nhãn "Đã nhận — mở phiếu" / "Đã điền — mở phiếu" cũng dài hơn nhãn bắt đầu: cùng rủi ro.
- Edge 25 mục không bắt được vì:
  - chỉ đo chiều cao ở trạng thái trước khi bấm;
  - chỉ ở 1440×900, chưa có bề rộng hẹp như máy có side panel.

### F4 — Khung thông báo trên danh sách che phân trang và cột Hành động

- Sau khi bấm, khung "GR03879: đã mở màn quét Nextwaves" (có nút "Đóng") đứng góc dưới phải.
- Nó che **mũi tên phân trang** và cột Hành động / mã của mấy dòng cuối đang thấy (G3a-3).
- Khung chỉ tránh HỦY / HOÀN THÀNH (trang phiếu). Trên danh sách không có nút nào được tránh.

### Quan sát (không phải tiêu chí PM)

- Trên trang phiếu ở bề rộng 1095px, khung mở rộng (~460px) che cột "SL nhận" (+ / −, xoá) của dòng sản phẩm đầu (G3a-6). Thu nhỏ thì chỉ còn dải tiêu đề (G3a-7).
- **Lần bấm GR03879 đầu tiên:** operator báo đã làm bước 3. Nhưng khi Claude kiểm, nút vẫn là "Nhận hàng bằng RFID" và phiếu GR03879 chưa có phiên, nên Claude bấm một lần nữa và tạo phiên.
  - Cần operator xác nhận lần đầu có bấm không, và thấy thông báo gì.
  - Nếu đã bấm mà không có phiên: có thể là huỷ R2 ("Danh sách đã đổi — bấm lại", ví dụ bấm ngay lúc tab vừa tải lại) hoặc lỗi riêng.

## 3. Đề xuất sửa — cần PM duyệt vì đổi chữ nhãn / bố cục so với spec v0.2 (v0.2.3)

- **F3:**
  - mọi nhãn trên danh sách không dài hơn nhãn bắt đầu: đang nhận → **"Mở Nextwaves"**, đã nhận / đã điền → **"Mở phiếu"**, đang kiểm → **"Đang kiểm…"**;
  - nghĩa đầy đủ ("Đang nhận trên Nextwaves — mở lại tab", "Đã nhận / Đã điền — mở phiếu") ở tooltip và khung thông báo; cột Trạng thái của POS vẫn hiện trạng thái phiếu;
  - chặn cứng `max-width` = bề rộng nút bắt đầu, chữ thừa thành "…".
- **F4** (chọn một hoặc cả hai):
  - (a) khung trên **danh sách** neo **góc dưới trái**, xa cột Hành động và phân trang;
  - (b) thông báo thành công / thông tin tự thu nhỏ sau ~5 s; cảnh báo / lỗi giữ tới khi bấm "Đóng".

  Dev đề xuất làm cả (a) và (b).
- **Edge-check thêm:**
  - khung nhìn **1095×756** (máy operator có side panel) bên cạnh 1366×768 / 1440×900;
  - chiều cao dòng đo **cả sau khi bấm** (nhãn trạng thái mới);
  - khung thông báo trên danh sách không chồng nút của extension, icon thao tác của dòng và phân trang.

## 4. Còn thiếu để PM quyết G0.3 / G3a

1. **G3a-4, G3a-5:** màn quét Nextwaves (tab extension vừa mở cho GR03879), cuộn thân màn quét xuống cuối, khung mở rộng và thu nhỏ: khung không che "Xác nhận nhận hàng".
2. **Số tab Nextwaves** extension đã mở (kỳ vọng 1).
3. **G3a-8:** popup extension có đúng một phiên GR03879.
4. **G3a-1:** `chrome://extensions` hiện **0.2.2**. Trước khi cài có phiên dở nào không (G3a-0)?
5. Trả lời câu hỏi lần bấm đầu (§2).
