# PM review sơ bộ v0.1.6 UI và quyết định quy đổi đơn vị

Ngày 26/10/2026. Phạm vi: bàn giao đang chạy dở `docs/dev/FIX-UI-v0.1.6.md`, nhánh `batch/v0.1.6-ui` tại `b4017d7`, so với `main` `aa42dcc`. **Chưa chốt gate phát hành v0.1.6:** bộ đột biến 65 ca đang chạy, gói/ZIP/SHA-256 chưa bàn giao, và chưa thử bố cục trên POS staging thật. PM không sửa runtime.

## 1. Tiến độ đã đối chiếu

- `main` đã có merge `aa42dcc`, parent thứ hai là `fa66de6` đúng nhánh v0.1 staging PM cho qua. `src/` ở `main` trùng runtime v0.1.5 tại `456205a`; dev báo 100/100 test ba lượt và gói dựng lại cùng SHA-256 `CDD02C3D`. PM chưa chạy lại test/đóng gói trong lượt review này vì bộ đột biến v0.1.6 đang chạy trên máy.
- Diff `b4017d7` đổi `manifest` lên 0.1.6; `panel.js` tìm nút trang bằng chữ, đo hình chữ nhật và nâng khung; POS/Nextwaves khai tên nút cần tránh. Có 6 test mới và mở rộng Edge check. Không có thay đổi luồng nhận, lập kế hoạch hoặc W1 trong diff runtime.
- Dev tự báo Edge giả lập POS: v0.1.6 12/12, v0.1.5 đối chứng hỏng 2/12; `npm test` 106/106, 10 lượt. Đây là **báo cáo dev**, PM chưa chạy lại trong lúc đột biến. Cần kiểm kết quả đột biến và gói riêng.

## 2. Finding/gate giao diện

**P2 — chưa chứng minh đúng DOM và vị trí nút thật.** Thuật toán chỉ thấy `button`, link, input hoặc phần tử `role=button` có `textContent`/`value` khớp chính xác “HOÀN THÀNH”, “Hủy” hoặc “Xác nhận nhận hàng”. Edge check hiện dùng nút POS giả cố định tại góc dưới phải; test Nextwaves mới chỉ kiểm mẫu chữ trong source, chưa đo chồng lấp ở trang Nextwaves. Đây chưa phải lỗi đã xác nhận trên trang thật, nhưng chính yêu cầu sửa là tránh nút thật. Gate sau khi nhận gói v0.1.6: operator cài một bản trên staging, mở GR đang chờ nhận và màn quét Nextwaves **chỉ để xem**, chụp ở chiều rộng/cao cửa sổ đang dùng khi khung mở rộng và thu nhỏ; xác nhận nút trang vẫn nhìn thấy và bấm được, rồi đổi kích thước/trượt trang một lần. Nếu chữ/DOM khác dự đoán thì dev sửa đúng selector theo bằng chứng, ra version/ZIP/SHA-256 mới và PM audit lại. Không dùng lượt này để nhận hàng hoặc điền POS.

**Giới hạn hình học:** `liftFor` chặn khung vượt mép trên bằng cách giới hạn vị trí nâng. Ở cửa sổ quá thấp hoặc nút nằm sát mép trên, không thể vừa giữ khung trong màn hình vừa đảm bảo không chồng nút. Không coi phép thử synthetic 485px là bảo đảm mọi kích thước. Gate trên phải dùng kích thước màn hình operator thực tế; nếu vẫn chồng, khung cần có cách nhường chỗ khác (ví dụ chuyển vị trí/ẩn) thay vì chỉ nâng.

## 3. Quyết định PM cho vỉ → hộp

**Giữ luật “một chặn thì không PUT cả phiếu” trong v0.1.6.** Không duyệt làm tròn, ghép UID khác lô thành một hộp, hay điền lô đủ hộp rồi bỏ lô lẻ trong batch sửa UI. `plan.js` đọc hệ số `retail_units[].convert_rate` của GR: với 1 hộp = 10 vỉ, từng lô phải có số UID quy ra số hộp nguyên và không vượt lượng của chi tiết. Ví dụ 10 vỉ cùng lô → 1 hộp; 15 vỉ một lô hoặc 5+5 vỉ ở hai lô → chặn toàn bộ kế hoạch.

Nếu xuất hiện lô lẻ thực tế, extension phải báo rõ và **không ghi GR**. “Quét/nhập tay” chỉ là đường xử lý khi POS và quy trình nghiệp vụ cho phép lượng theo đúng đơn vị/lô; không mặc định rằng POS có thể ghi 0,5 hộp. Operator/Buymed/POS cần xác nhận hoặc sửa đơn vị dòng chứng từ sang vỉ (hay tạo chứng từ/lô phù hợp) trước khi HOÀN THÀNH. Hướng ghi từng lô đủ hộp là thay đổi hợp đồng W1/P1.2, cần spec và gate mới; không lồng vào v0.1.6.

## 4. Để chốt v0.1.6

1. Dev hoàn tất 65 ca đột biến với danh sách kết quả thật; mọi `ANCHOR?`, `SURVIVED` hoặc ca chỉ hỏng do timeout phải được điều tra, không tính đạt tự động.
2. Dev đóng gói version 0.1.6, báo ZIP/SHA-256 và đối chiếu byte với `src/` cùng bản giải nén; gửi diff cuối và test/Edge nguyên văn.
3. PM audit gói và chạy lại gate phù hợp sau khi đột biến dừng. Khi gate source/gói đạt mới giao operator thử **UI chỉ đọc** trên staging thật như §2; gate cuối của sửa lỗi là không che nút thật.

Production tiếp tục chỉ đọc; `main` vẫn ở v0.1.5 cho tới khi batch UI được audit và merge riêng.
