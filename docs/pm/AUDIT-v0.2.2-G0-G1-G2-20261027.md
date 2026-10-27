# PM audit v0.2.2 — G0/G1/G2 và phép kiểm staging tiếp theo

Ngày 27/10/2026. Nhánh `batch/v0.2-rfid` tại `3218cae` (runtime cuối `a1975f1`), gói v0.2.2 mã `AB96179D`. Căn cứ: `docs/dev/BATCH-v0.2.2-G0.md`, bốn mẫu G0, diff `cbac491..3218cae`, kiểm độc lập của PM. Báo cáo này thay kết luận **tạm** trong `docs/pm/REVIEW-G0-v0.2.2-PRELIM-20261027.md` ở những mục đã có kết quả cuối.

## Quyết định

- **G0.1 response và G0.2 DOM: đạt để tích hợp.** Dev quan sát trang staging thật, lưu mẫu đã làm sạch; PM kiểm mẫu và hợp đồng parser/selector. Bằng chứng là mẫu rút gọn từ response, không phải body thô 76 KB; kết luận live ở đây dựa trên quan sát của dev, PM chưa trực tiếp xem Network.
- **G1 source/test: đạt. G2 gói/Edge: đạt.** Không thấy P1/P2 runtime mới trong diff v0.2.2. F1 (dòng cao thêm) và F2 (khung che nút sau cuộn) bị phép đối chứng trên gói v0.2.1 bắt đúng.
- **Cho phép cài gói `AB96179D` trên Chrome staging để kiểm UI và phần G3a chỉ đọc.** G0.3 UI trên Chrome với extension cài thật **chưa nghiệm thu**, nên chưa Go merge hoặc dùng v0.2.2 để nhận/ghi hàng. Cài chẩn đoán chỉ đọc là bước thu bằng chứng G0.3/G3a, không phải phát hành vận hành.

## PM kiểm độc lập

| Mức | Kết quả |
|---|---|
| Diff/source | `cbac491..3218cae` sạch (`git diff --check`). Runtime v0.2.2 chỉ đổi chiều cao nút `gr-list.js`, nghe cuộn `panel.js` và version; commit `3218cae` sau runtime chỉ đổi Edge script và README mẫu. Không đổi áp GR, khớp đơn hay các API ghi. |
| Test | PM chạy `npm test` trên checkout độc lập tại `3218cae`: **133/133**, 0 fail. |
| Gói | PM dựng lại ZIP từ `3218cae`: SHA-256 `ab96179d6900a5de7beeef9cda627bc2f619f93cb5a80151e7d1bd8cf8f274c4`. Source, ZIP phát hành và thư mục giải nén 19/19 file cùng tên/nội dung. Quét pattern bí mật rỗng. |
| Edge gói v0.2.2 | PM chạy trên bản giải nén: **25/25**. Bảng 20 dòng có 7 nút đúng, chiều cao dòng có/không nút đều 57px; khung tránh nút Nextwaves sau cuộn ở 1366×768 và 1440×900. Lượt quét tính cả lấy dòng tối đa 1,0 ms; tác vụ extension dài nhất 4,08 ms trên danh sách, 6,98 ms trên trang bán hàng, đều <50 ms. |
| Đối chứng v0.2.1 | PM chạy cùng script trên gói cũ: **hỏng đúng 3/25** — hai phép tránh nút Nextwaves ngay sau cuộn và chiều cao dòng 61px so với 57px. |
| Dev báo, PM chưa chạy lại | Đột biến Node **96/96**, 0 neo lệch/timeout; đột biến DOM Edge **6/6**; Edge gói 25/25 nhiều lượt, máy bận gây callback danh sách 2–3,6 ms nhưng không có task ≥50 ms. |

## Giới hạn bằng chứng

- Mẫu POS và Nextwaves lấy trong browser pane đã đăng nhập và là bằng chứng trang thật, nhưng **không chạy extension đã cài**. `gr-list.js` được chèn tạm trên POS thật: dev báo 7/7 nút đúng, click nút không mở dòng; PM không trực tiếp quan sát phiên này.
- Edge dựng lại cấu trúc/kích thước từ outerHTML thật nhưng dùng CSS tối thiểu. Khung Nextwaves trong phép kiểm đang ở trạng thái chờ dữ liệu, cao khoảng 63px; khung sau khi khớp đơn có thể cao hơn. Vì vậy phép dựng lại không thay thế kiểm trực tiếp sau cuộn trên Chrome thật.
- Mẫu footer Nextwaves lấy từ một đơn đã xác nhận khác, đủ để phát hiện rủi ro cuộn/che nút, nhưng cần kiểm trên màn quét của lượt G3 đang thử.
- Một cảnh báo clipboard trong browser pane chưa tái hiện và chưa quy được cho extension; `gr-list.js` không gọi API clipboard. Ghi nhận nếu hiện lại, chưa coi là finding runtime.

## Ngân sách hiệu năng đã chốt

1. **Mỗi lượt quét danh sách <2 ms**, gồm lấy `tr` và lát xử lý. Edge đo riêng trong world extension rồi cộng hai giá trị tối đa; trong lượt PM là 0,8+0,2 = 1,0 ms. Số đo trên POS thật với script chèn tạm do dev báo 1,4 ms.
2. **Không tác vụ quy cho extension ≥50 ms**, kể cả nạp script một lần khi mở trang. Không áp <2 ms cho mọi callback. Callback xử lý response danh sách 2–3,6 ms lúc máy bận không vi phạm gate này. Chưa cần v0.2.3 chỉ để tách callback.
3. `docs/dev/BATCH-v0.2.2-G0.md` §3b đã phản ánh quyết định này, nhưng §4.2 còn hỏi lại ngưỡng <2 ms cho callback. **Dev sửa tài liệu §4.2 cho nhất quán; không cần đổi runtime/gói vì lỗi mô tả.**

## G3a staging chỉ đọc — cho phép thực hiện

1. Trước khi thay bản, kiểm popup không có phiên đang nhận/điền dở (`waiting_nw`, `nw_ready`, `received`, `applying`, `apply_stopped`); nếu có, giữ phiên và báo PM/dev trước khi cài. Không bật đồng thời hai bản extension trên cùng trang.
2. Cài bản giải nén `C:\circa-gr-nextwaves-v0.2.2` trên Chrome staging, chọn **Staging**, để ô cấp phép điền trống/tắt; tải lại tab POS và Nextwaves.
3. Trên danh sách cửa hàng 2222: kiểm nút chỉ ở GR chờ/đang nhận, đúng ô, dòng không cao thêm; bấm thử **một GR phù hợp** để tạo một phiên/mở một tab Nextwaves, POS ở lại danh sách. Bấm bắt đầu chỉ tạo trạng thái trong extension và GET; không nhận hàng trên Nextwaves.
4. Mở GR03878 hoặc phiếu phù hợp đang có HỦY/HOÀN THÀNH: khung không che hai nút. Trên màn quét Nextwaves, cuộn thân modal xuống cuối: khung không che **Xác nhận nhận hàng** ngay sau cuộn, cả khi khung mở và thu nhỏ. Lưu ảnh hoặc quan sát trực tiếp có kích thước/trạng thái; ba màn này đủ, không buộc đúng năm ảnh cũ.
5. Không bấm **Xác nhận nhận hàng**, không cấp phép điền, không PUT, không bấm **HOÀN THÀNH** trong lượt G3a. Ghi lại mã gói, version, GR/SO/PO được chọn, ảnh/quan sát, số phiên/tab, URL POS trước/sau. Gửi PM để quyết G0.3/G3a. Phần G3b sau nhận hàng (quay về đúng GR) cần operator cho phép lượt nhận đúng PO và bằng chứng lượt thật; W1/HOÀN THÀNH là gate riêng với phép riêng trước quyết merge/vận hành. Production thuộc Đợt 2.
