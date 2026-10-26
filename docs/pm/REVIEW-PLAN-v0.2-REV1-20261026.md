# PM kiểm Spec Đợt 1 rev 1 — v0.2

Ngày 26/10/2026. Phạm vi: commit dev `1b03c5c` sau review PM `f12934a`. **Trạng thái: chấp nhận rev 1 làm nền cho Đợt 1, G0 chưa đạt, chưa cho code.** Commit chỉ đổi plan và `state.md`; chưa có DIFF runtime, test hoặc gói v0.2.0.

## Đã đóng ở mức thiết kế

- S1/S2: dữ liệu danh sách chỉ gợi ý UI; click đọc lại GR/PO/cửa hàng/SO/kho trước phiên; `gr_list` có nhánh riêng, controller duy nhất; mở GR/SO không tạo phiên nhưng phiên sẵn có tiếp tục. Hai tab/double click có test.
- S3/S4: header thiếu cửa hàng chỉ được giữ trong cùng ngữ cảnh token/client; đổi token thì dừng. Lượt chuẩn bị có Abort và kiểm sau mỗi `await`; background tự dựng `returnUrl` của GR.
- S5–S8: hook chỉ gửi trường cần dùng, giới hạn body; cache QR có TTL/huỷ lỗi; giữ panel v0.1.6 đến khi có ảnh thật; đo hiệu năng so baseline; thư mục cố định không được coi là giải O1. Danh sách test G1 đã bổ sung.

## Hai chỉnh lý P1 còn cần trước khi viết lối vào danh sách

1. **`seq` phải cấp lúc request bắt đầu, không phải lúc response về.** S1 hiện ghi “mỗi response là một lượt seq tăng dần”; nếu hai request A rồi B chạy song song nhưng B về trước, A về sau, gán seq khi response sẽ khiến A cũ thay bảng B mới. Hook cần `requestSeq`/query key của URL tại thời điểm gửi, chỉ chấp nhận response thuộc lượt request mới nhất phù hợp route, filter, page và môi trường; response lỗi của lượt mới nhất cũng phải xoá nút cũ. Gói message S5 cần đủ query key (không chỉ `page/limit/total`) để kiểm điều này. Test thứ tự A gửi → B gửi → B về → A về, B lỗi, và đổi filter/phân trang.
2. **Click phải gắn với dòng và bộ lọc đang hiển thị tới sát `session:start`.** S4 chỉ kiểm route; POS có thể đổi filter/page hoặc tái dùng thẻ `<tr>` mà URL không đổi. Sau mỗi `await` và trước tạo phiên, kiểm `clickToken` còn gắn đúng `id+code`, dòng còn trong DOM, mapping của response mới nhất vẫn là dòng đã bấm và query/page chưa đổi. Nếu không chứng minh được, dừng với “Danh sách đã đổi — bấm lại”. Test đổi filter/page/dòng giữa các GET khi URL giữ nguyên.

## Ghi chú P2 cho gate G1/G2

- `PerformanceObserver('longtask')` có thể không quy thuộc được task của content script. Nếu attribution thiếu, dùng trace CDP hoặc đo handler có kiểm chứng; không lấy “không có attribution” làm bằng chứng đạt ngân sách.
- Phần Đợt 1 cũ còn mô tả cache/header/panel trái rev 1. Câu mở đầu nói rev 1 ưu tiên là đủ cho review này; khi giao code, dev nên hợp nhất thành một spec hiệu lực để tránh implement nhầm.

**G0 vẫn gồm:** ảnh UI v0.1.6 thật (3 POS, 2 Nextwaves), `Copy response` danh sách GR và outerHTML dòng/vùng nút đã làm sạch. PM kiểm kết quả G0 và selector/hợp đồng trước khi dev code Đợt 1. Các dữ liệu O1/QR/Florita thuộc Đợt 2. Chưa có quyền nhận hàng hay ghi GR mới từ review tài liệu này.
