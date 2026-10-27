# PM review G0 và v0.2.2 — kết luận tạm trước kết quả đột biến

Ngày 27/10/2026. Nhánh `batch/v0.2-rfid` tại `a1975f1`, gói `AB96179D`. Dev còn chạy bộ đột biến 96 ca; báo cáo `docs/dev/BATCH-v0.2.2-G0.md` tại thời điểm review còn ô kết quả chưa điền. PM chưa chạy test đồng thời với bộ đột biến của dev.

## Bằng chứng PM đã kiểm

- Source: diff `cbac491..a1975f1` sạch. Runtime đổi đúng ba file: nút danh sách cao 24px, khung nghe cuộn ở pha capture và version 0.2.2. Không đổi đường ghi POS, logic khớp đơn, hook danh sách.
- ZIP: PM dựng lại từ checkout riêng ở `a1975f1`; SHA-256 khớp `ab96179d6900a5de7beeef9cda627bc2f619f93cb5a80151e7d1bd8cf8f274c4`. Source, ZIP phát hành và bản giải nén 19/19 file cùng tên/nội dung. Quét pattern bí mật theo `agent.md` rỗng.
- G0.1: mẫu danh sách rút gọn `samples/pos-stg-gr-list-page1-20261027.json` có 20 dòng, total 32, page 1, limit 20; đủ `id/code/status/purchase_order_id/pos_info.id` cho mọi dòng, không có Authorization/cookie/token. Mẫu có thêm một dòng đầy đủ để tham chiếu, không phải nguyên body 76 KB. PM chấp nhận làm bằng chứng hợp đồng parser **dựa trên quan sát trang thật do dev báo**; PM chưa trực tiếp xem Network.
- G0.2: outerHTML thật của dòng GR03887 cho thấy `<tr>`, mã ở `<td>` đầu, ô cuối có `div.flex`, đúng selector của `gr-list.js`. Mẫu vùng HỦY/HOÀN THÀNH và chân modal Nextwaves cho thấy đúng vị trí cần tránh. Dev báo đã chèn tạm `gr-list.js` trên POS thật: 7/7 nút đúng và click không mở dòng; PM chưa trực tiếp xem phiên đó.
- G0.4: dev đo `show()` gồm lấy dòng + lát đầu 1,4 ms trên bảng thật 20 dòng. Trace trên trang dựng từ DOM/body thật đo callback dài nhất 1,46 ms, nạp script tổng 4,7–8 ms; đây là số **dev báo**, chưa phải đo của PM trên extension cài trên trang thật.

## Quyết định gate

1. **G0.1 response và G0.2 DOM: chấp nhận cho bước tích hợp.** Mẫu đã làm sạch đủ để khóa parser/selector; nếu phản hồi tiếp theo khác dạng, dev ghi mẫu mới và báo PM trước khi nới parser.
2. **G0.3 UI: chưa nghiệm thu cuối.** Edge dựng lại từ outerHTML/kích thước thật là phép thử tốt để tìm F1/F2 và kiểm hồi quy, nhưng CSS và hành vi trên Chrome đang đăng nhập không hoàn toàn được tái hiện. Không buộc operator tự chụp đúng năm ảnh v0.1.6. Cần ít nhất bằng chứng trực tiếp trên Chrome với extension v0.2.2: POS GR03878 khung không che HỦY/HOÀN THÀNH; Nextwaves màn quét sau cuộn khung không che Xác nhận nhận hàng; danh sách có nút đúng vị trí, không làm dòng cao thêm. Ảnh hoặc PM/dev quan sát trực tiếp và ghi nhận kích thước/trạng thái đều được.
3. **Cho phép bước cài v0.2.2 chỉ để kiểm UI staging, sau gate source/gói/Edge cuối.** Đây là lượt chẩn đoán chỉ đọc: chọn Staging, không cấp phép điền, không bấm Xác nhận nhận hàng/HOÀN THÀNH, không PUT POS. Nếu cần hiện khung Nextwaves, bấm nút bắt đầu RFID chỉ tạo phiên trong extension và GET; trước khi thay bản phải kiểm không có phiên `received`/`applying`/`apply_stopped` dở. Cài để kiểm UI không đồng nghĩa Go vận hành hay merge.
4. **Ngân sách hiệu năng giữ theo spec PM:** mỗi lượt quét danh sách <2 ms, tính cả bước lấy dòng; không tác vụ nào quy cho extension ≥50 ms, kể cả nạp script một lần. Không đặt ngưỡng <2 ms cho *mọi* callback: dev từng đo callback đầu 2,76 ms, nhưng đó không phải lượt quét danh sách và vẫn thấp hơn 50 ms. Báo riêng CPU/độ trễ trên danh sách và trang bán hàng. Số đo 1,4 ms trên bảng thật và trace trang dựng hỗ trợ gate thử, chưa thay phép đo khi extension cài trên Chrome thật.

## F1/F2 và việc còn lại

- **F1:** nút 28px làm dòng thật cao 57→61px; v0.2.2 đổi 24px. Dev báo phép dựng lại Edge phát hiện bản cũ hỏng và bản mới đạt; cần nhìn trên Chrome thật sau cài.
- **F2:** khi cuộn modal Nextwaves, bản cũ có thể che Xác nhận nhận hàng tới lượt kiểm 1 s. v0.2.2 nghe cuộn và đặt lại ở khung hình kế tiếp. Dev báo Edge dựng lại ở 1366×768 và 1440×900 đạt; cần nhìn trên Chrome thật sau cuộn.
- Báo cáo một lần cảnh báo clipboard trong trình duyệt app chưa tái hiện, mã `gr-list.js` không gọi API clipboard. Ghi nhận để theo dõi, chưa có bằng chứng quy lỗi cho extension.
- Trước quyết định cuối: dev hoàn tất 96 ca đột biến và Edge 25 mục trên bản giải nén, cập nhật báo cáo; PM chạy lại test/Edge khi không còn bộ đột biến đang chạy. Dev/PM thu bằng chứng UI thật như mục 2. Lượt nhận/ghi staging vẫn cần operator cho phép riêng đúng GR/PO; production thuộc Đợt 2.
