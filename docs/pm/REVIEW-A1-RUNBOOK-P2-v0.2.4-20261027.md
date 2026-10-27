# PM review runbook A1 và spec P2 v0.2.4

Ngày 27/10/2026. Căn cứ `docs/dev/RUNBOOK-A1-GR03887-20261027.md` tại `f03f023`, `docs/dev/SPEC-P2-v0.2.4-KHUNG-PHIEU.md` tại `7e6de39`, và `docs/pm/REVIEW-PLAN-STG-DONE-PRD-20261027.md`. PM không gọi API ghi và không thao tác trên phiên staging của operator.

## Quyết định ngắn

- **A1:** runbook **đạt hướng và đủ cụ thể để trình operator sau hai sửa nhỏ ở §1**; dev sửa đúng hai điểm này rồi không cần vòng PM review mới nếu không đổi điều kiện/chặng. **Chưa có phép operator cho `receive-scan`, grant/PUT hay HOÀN THÀNH.** Chỉ operator có thể cho phép một lượt đúng GR03887/PO13806459/SOBD1594095-F sau khi xem bản sửa và xác nhận đủ tem vật lý.
- **P2:** PM chọn **phương án A có điều kiện**: khung nằm trong luồng trang ngay trước `#all-receipt`, có thể sticky trong khung cuộn của trang phiếu **chỉ khi** không che điều khiển ở mọi trạng thái/kích thước gate. Khi thiếu không gian hoặc breadcrumb/action bar chồng, khung chuyển sang **in-flow không sticky**. Dev được code v0.2.4 trên nhánh batch theo §2; không cài/đổi bản v0.2.3 đang dùng giữa lượt A1.
- **Không duyệt phương án B như đang viết** vì nhãn nổi cạnh HỦY/HOÀN THÀNH lại tạo một vùng có thể che thao tác. **Không duyệt fallback khung nổi cũ có nút “Điền”** khi thiếu anchor: đó chính là tình huống P2 chưa kiểm soát.

## 1. A1 — hai chỉnh sửa bắt buộc trước khi operator đọc và cho phép

1. **Preflight capture:** runbook phải yêu cầu dev/operator xác nhận Net Capture hoặc cách ghi tương đương **đang thu trên cả tab POS và Nextwaves trước khi bấm nhận**; ghi rõ dấu hiệu kiểm được (một GET gần nhất và giờ). Nếu Nextwaves không lưu response body, dùng request/status + GET PO/phiếu gửi/biên nhận sau nhận và nhật ký phiên, báo giới hạn nguồn; không khẳng định có body khi chưa có. File gốc có credential chỉ ở máy, không đưa vào chat/repo. Giữ capture POS tới GET sau HOÀN THÀNH.
2. **Đường xử lý tay khi mất phiên:** thay câu “dược sĩ nhập tay … quét mã QR từng hộp” bằng “operator quyết sau khi dược sĩ/POS xác nhận quy trình nhập tay đúng **đơn vị, lô và số lượng** của 5 chi tiết”. **15 EPC không phải 15 đơn vị cơ bản hay 15 hộp**: đây là 1 chai + 6 vỉ + 8 vỉ, quy ra 5 chi tiết POS. Không dùng số tem để suy ra số lần quét tay. Không coi nhập tay là tiếp tục tự động của A1 hoặc làm gate A1 đạt.

PM kiểm độc lập phần bảng runbook: 15 hậu tố EPC đều khác nhau, tổng theo dòng **1+3+3+4+4 = 15**. POS/Nextwaves status và tỉ lệ quy đổi là **dev quan sát trên trang thật**, PM chưa có bản response GR03887/PO13806459 đã làm sạch để tự đối chiếu. Điều đó không chặn trình operator vì runbook bắt đọc lại ngay trước lượt và màn quét phải đủ đúng từng dòng; nếu bất kỳ mã/đơn vị/kho/trạng thái khác, **dừng**. Trước grant, kế hoạch 5 bước là **kỳ vọng**, không là lệnh ghi: operator kiểm mã kế hoạch, 5 lô, đơn vị, số lượng và UID thực tế rồi mới cấp phép. Sau mỗi chặng sai khác hoặc PUT một phần, không tự thử lại.

## 2. P2 — hợp đồng kỹ thuật cho phương án A

**Vị trí:** chỉ trên trang chi tiết GR; tìm `#all-receipt` đúng trong root của trang phiếu đang xem, gắn một host Shadow DOM **ngay trước anchor trong cùng parent**. Bảng thông tin phiếu là `<table>` đầu tiên, nên không dùng `document.querySelector('table')`. Tìm đúng ancestor cuộn của trang (`overflow-scroll`); không dùng `window` làm giả định scroll. Qua route/rerender, gỡ host khỏi GR cũ, gắn lại trước anchor mới một lần; không nhân đôi panel/listener hoặc tạo vòng `MutationObserver`. Quan sát marker sống qua lọc sản phẩm là bằng chứng dev báo, cần test lại khi route đổi và POS thay toàn bộ card.

**Sticky có điều kiện:** host tham gia luồng trang và chiếm chiều cao thật trước bảng. Khi sticky, vị trí top phải xét breadcrumb/scroll root; giới hạn chiều cao và cho nội dung dài cuộn trong khung. Với viewport 1095×756, 1366×768, 1440×900, sau khi cuộn tới từng dòng, mọi nút `SL nhận` (+/−/xoá), HỦY, HOÀN THÀNH và nút trong khung phải hiện và nhận click/keyboard. Không suy “không che” chỉ vì host ban đầu ở trong luồng: khối sticky vẫn có thể phủ dòng khi cuộn. Nếu geometry không đạt hoặc vùng nhìn quá hẹp, **tắt sticky cho viewport đó** và để khung cuộn theo trang; không chuyển sang fixed góc màn hình.

**Trạng thái:** giữ toàn bộ status, kế hoạch, cảnh báo, mã kế hoạch và nút `Điền` hiện hành; không tự thu nhỏ mặc định. Nếu người dùng đã thu nhỏ thủ công rồi trạng thái chuyển sang lỗi/cảnh báo hoặc xuất hiện hành động cần làm, phải mở lại hoặc thể hiện tín hiệu đủ rõ và có thể truy cập bằng bàn phím; không để nút cần bấm ẩn mà không biết. Không đổi session, khoá, grant, hash, logic W1, Nextwaves hoặc khung danh sách.

**Thiếu anchor/DOM đổi:** không chèn host vào `body`, không tiếp tục hiển thị nút `Điền` trong khung nổi cũ như thể layout an toàn. Báo lỗi giao diện rõ trên trang phiếu và **fail closed cho W1** đến khi kiểm lại DOM; không phát PUT do đường fallback. Nếu cần sửa guard ở `pos-content.js`, ghi rõ trong DIFF và test đủ đường cấp phép/click.

**Gate dev giao PM:** version/ZIP/SHA mới; Node test các trạng thái `waiting_nw`, `nw_ready`, `received` có kế hoạch dài, grant, applying, applied, warn/err, thu nhỏ rồi chuyển trạng thái; Edge bản giải nén trên DOM trang thật ở 3 kích thước, từng nút product/action và nút `Điền` bấm được, route/filter/rerender không lặp host, không long task ≥50 ms. Đối chứng v0.2.3 hỏng case che `SL nhận` ở 1095. PM audit nguồn/gói trước khi cài staging; sau đó một quan sát trang thật ở 1095 với khung mở và điều khiển sản phẩm/HỦY/HOÀN THÀNH dùng được. Nếu P2 thay event/guard W1, PM quyết gate W1 bổ sung trước merge theo review plan trước.

## Việc tiếp theo

Dev cập nhật runbook đúng §1, triển khai P2 theo §2 trên nhánh batch và giao DIFF/test/gói để PM audit. Operator **chưa cần cấp phép ngay từ báo cáo này**; sau khi nhận runbook đã sửa, operator xác nhận có đúng 15 tem và quyết một lượt E2E staging. Đợt 2 O1/QR tiếp tục discovery chỉ đọc song song.
