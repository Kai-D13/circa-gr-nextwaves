# G3a lần 2 — v0.2.3 trên Chrome staging (27/10/2026, chưa đủ)

**Căn cứ:** `docs/pm/AUDIT-v0.2.3-F3-F4-G3a-20261027.md`; checklist `docs/dev/G3a-v0.2.3-HUONG-DAN.md`.

## Lượt chạy nhầm bản cũ (loại)

- Lượt đầu (Claude ở side panel của operator) thấy hành vi y hệt 0.2.2: nhãn "Đang nhận trên Nextwaves", dòng 73px, khung che phân trang, tooltip cũ.
- Thư mục `C:\circa-gr-nextwaves-v0.2.3` đúng là 0.2.3 (có "Mở Nextwaves", không còn nhãn cũ). Nhãn / tooltip lượt đó chỉ có trong mã 0.2.0–0.2.2.
- **Kết luận:** hồ sơ Chrome đăng nhập POS lúc đó vẫn chạy bản cũ. **Không dùng lượt này làm bằng chứng v0.2.3.**
- Claude in Chrome của dev nối với một hồ sơ Chrome khác: chưa đăng nhập, cửa sổ thu nhỏ. Dev không tự quan sát được.
- Checklist đã thêm bước kiểm bản bằng tooltip trước khi bấm.

## Operator gửi 2 ảnh sau khi cài 0.2.3 (operator đánh giá "Đạt" cả hai)

Ảnh có tên nhân viên ở tooltip ảnh đại diện, **không đưa vào repo**. Ảnh nằm trong cuộc trò chuyện dev.

| Ảnh | Thấy | Đánh giá dev cho G3a |
|---|---|---|
| 1 — danh sách POS, vùng trang ~1917px | Nút "Nhận hàng bằng RFID" ở đúng 7 dòng chờ / đang nhận (GR03887, 03886, 03883, 03879, 03878, 03877, 03842), cột Hành động cạnh 2 icon, dòng đều, phân trang không bị che. **Mọi nút còn trạng thái trước khi bấm** | **Đạt phần trước khi bấm, ở màn rộng.** Ảnh này giống hệt 0.2.2, nên **chưa chứng minh bản 0.2.3** và chưa kiểm F3 / F4 (sau khi bấm, ở ~1095px) |
| 2 — màn quét Nextwaves sau khi bấm "Nhận hàng bằng RFID" của **GR03887** | Modal "Nhận hàng bằng cách quét" (đơn PO13806459, SOBD1594095, 15 tem, kho CIRCA FLORITA). Khung extension mở rộng góc dưới phải: "Sẵn sàng nhận hàng"; bảng SL GR = SL Nextwaves (1110: 12 / 12; 5451: 40 / 40; 2431732: 1 / 1); nút "Đọc lại kết quả nhận", "Về POS". Khung nằm **ngoài** modal (bên phải) | **Đạt:** mở đúng màn quét, khớp đơn đúng. **Chưa đạt mục PM:** modal **chưa cuộn tới cuối**, nút "Xác nhận nhận hàng" chưa hiện trong ảnh. Ở bề rộng này khung không thể chồng modal; cần kiểm ở ~1095px |

**Ghi chú:**
- Đơn này có thêm phần "Còn thiếu 15. Xử lý đơn mua hàng thế nào?" (lựa chọn giữ đơn mở…) phía trên chân modal. Chân modal (Hủy / Xác nhận nhận hàng) nằm thấp hơn trường hợp mẫu G0.
- Đã bấm GR03887 (không phải GR03879 như checklist gợi ý). Theo PM, chọn GR nào phù hợp chưa có phiên đều được.

## Còn thiếu để PM quyết G3a

1. **Danh sách sau khi bấm** (dòng GR03887), vùng trang ~1095px (side panel Claude mở):
   - nút **"Mở Nextwaves"**;
   - dòng vẫn 57px, tiêu đề không xuống dòng;
   - không khung nổi che phân trang;
   - tooltip có "GR03887 · phiên … (waiting_nw hoặc nw_ready)".

   Đây cũng là bằng chứng đang chạy 0.2.3.
2. **Nextwaves cuộn thân modal tới cuối**: khung mở rộng và nút "Xác nhận nhận hàng" cùng hiện, không chồng nhau, ở ~1095px. **Không bấm.**
3. Số tab Nextwaves extension đã mở (kỳ vọng 1); popup có đúng một phiên GR03887; `chrome://extensions` hiện 0.2.3.
