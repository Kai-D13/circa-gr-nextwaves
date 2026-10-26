# PM đính chính gate G0 cho v0.2

Ngày 26/10/2026. Quyết định này **thay** các câu “chưa cho code Đợt 1 cho tới khi G0 đạt” trong review PM trước và phần trạng thái hiện hành của `state.md`. PM đã chặn toàn bộ việc viết code quá rộng. Không có yêu cầu nghiệp vụ nào buộc phải có ảnh UI trước khi viết logic và test v0.2.0.

## Quyết định mới

- **Dev được bắt đầu code Đợt 1 v0.2.0 ngay** trên nhánh riêng `batch/v0.2-rfid`, dựa trên commit UI v0.1.6 `b4017d7` đã qua gate source/gói. Không merge nhánh v0.1.6 hoặc v0.2 vào `main` chỉ vì bắt đầu code. Dev triển khai controller chỉ chạy khi bấm, kiểm GR/PO/SO/cửa hàng, thứ tự response, hủy click khi danh sách đổi, cache QR, header, Abort, test và đo hiệu năng theo Spec rev 1 + rev 2. Có thể dùng DOM/response mô phỏng và mã tham khảo để phát triển trước.
- **Bằng chứng G0 dùng để chốt tích hợp và nghiệm thu**, không phải điều kiện khởi công: response danh sách GR và outerHTML dòng thật để xác nhận parser/selector; giao diện v0.1.6 trên POS/Nextwaves thật để xác nhận khung không che nút. Nếu dữ liệu thật khác giả định, dev điều chỉnh selector/hợp đồng theo bằng chứng rồi PM audit. Chưa dùng bản v0.2 để vận hành hoặc chạy E2E ghi trên staging trước gate nguồn/gói/Edge và kiểm trang thật.
- **Ai lấy bằng chứng:** dev-team hoặc PM lấy trực tiếp trên máy staging đã đăng nhập, bằng thao tác chỉ đọc. Dev-team chịu trách nhiệm chuẩn bị mẫu response/DOM đã bỏ tên người và bí mật cho repo; PM kiểm. Operator không phải tự chụp đủ năm ảnh hay trích HTML để dev được bắt đầu code. Nếu máy/phiên đăng nhập không sẵn cho dev/PM, operator hỗ trợ mở phiên hoặc gửi những file còn thiếu. Năm ảnh (3 POS, 2 Nextwaves) là bộ bằng chứng đề xuất để kiểm cả trạng thái khung mở/thu nhỏ; PM có thể kiểm trực tiếp trên UI và lưu ảnh tương đương.
- **Ranh giới vẫn giữ:** mọi thao tác nhận hàng Nextwaves, PUT GR và bấm HOÀN THÀNH trên staging cần operator cho phép riêng từng lượt. Production chỉ đọc; O1, mã QR POS sinh sau HOÀN THÀNH và xung đột reader là gate production riêng.

## Thứ tự thực hiện

1. Dev mở nhánh v0.2, code và test phần độc lập DOM thật. Song song, dev/PM thu bằng chứng UI/response/DOM staging theo cách chỉ đọc.
2. Khi có bằng chứng, chốt selector/hợp đồng; chạy test trên DOM thật làm mẫu, Edge trên bản giải nén và đo hiệu năng. PM audit G1/G2, quyết merge v0.1.6 và sau đó v0.2 theo đúng thứ tự.
3. Chỉ sau audit nguồn/gói và UI thật mới cho operator cài v0.2 để kiểm staging. Các bước nhận/ghi/HOÀN THÀNH có gate và phép riêng.

Đính chính này không thay quyết định nghiệp vụ “chỉ tạo phiên khi bấm”, không nới điều kiện ghi và không tự cho qua gate UI v0.1.6.
