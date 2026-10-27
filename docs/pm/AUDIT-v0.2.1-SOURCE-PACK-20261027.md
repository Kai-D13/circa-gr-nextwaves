# PM audit v0.2.1 — sửa P2.1/P2.2, gate source/gói

Ngày 27/10/2026. Nhánh `batch/v0.2-rfid` tại `cbac491`, gói `E34FF7C5`. Căn cứ: `docs/dev/BATCH-v0.2.1.md` và diff `682c509..cbac491`. PM chỉ audit; không sửa runtime.

## Quyết định

- **P2.1 đóng ở mức source/test.** Hook chỉ replay request mới nhất đã gửi, cùng response của chính request đó nếu đã về. Response cũ về muộn không ghi đè replay. Test mới nối hook thật với content thật và đối chứng mã cũ thất bại.
- **P2.2 đóng ở mức Edge trang giả.** Phép kiểm mới dùng ngưỡng <2 ms cho cả lượt tải danh sách; cách chia lát và chặn click chạy đúng trên Edge giả lập POS. Hiệu năng và tương thích DOM **trên POS thật chưa được xác nhận**.
- **Gate G1 source/gói và G2 Edge trang giả: đạt. G0 tích hợp trang thật: chờ bằng chứng.** Chưa Go merge/cài v0.2.1 để vận hành; chưa Go nhận/ghi staging. Dev có thể tiếp tục thu G0 chỉ đọc theo phép operator đã cấp.

## PM kiểm độc lập

| Kiểm | Kết quả |
|---|---|
| Diff | `682c509..cbac491`: 11 file, +671/−141; runtime chỉ `pos-hook.js`, `gr-list.js`, `manifest.json` (version 0.2.1). `git diff --check` sạch. `pos-content.js`, background, khung, Nextwaves, plan/apply không đổi. |
| Test | Checkout tách riêng tại `cbac491`: `npm test` **133/133 đạt**, 0 fail. |
| ZIP | Dựng lại gói tại `cbac491`: SHA-256 `e34ff7c53d117f70b0ea4cc68e46a19ab8764a71ef1c3bce7d0c06d23b1190c1`. Source, ZIP phát hành và thư mục giải nén: 19/19 file cùng tên và nội dung. |
| Edge trên gói giải nén | Hai lần **17/17 đạt**. Lượt tải danh sách tối đa 1,2/1,0 ms; bão 300 đổi DOM tối đa 0,4/0,3 ms; trang bán hàng 0 request/CPU extension ≈0 trong phép đo. Nút 13/20 đúng trên trang giả; bấm tạo một phiên/một tab. |
| Edge bảng giả 200 dòng | PM chạy benchmark ba lần: 130 nút đều được tạo; lượt/lát tạo nút tối đa 1,0 ms, 2–4 lát. |
| Bí mật | Quét pattern theo `agent.md` trên `cbac491`: rỗng. |
| Dev báo, PM chưa chạy lại | Đột biến 96/96; đột biến nút Edge 3/3; Edge 17/17 thêm các lượt của dev. |

## Giới hạn và G0 cần chốt

1. **Response danh sách thật:** `Copy response` của `goods-receipt/search` với `query=pos_id=...`, chỉ body đã làm sạch. So `goods_receipts`, `id`, `code`, `status`, `purchase_order_id`, `pos_info.id`, phân trang với parser.
2. **DOM thật:** outerHTML đã làm sạch của một dòng `<tr>` GR đang chờ nhận và vùng nút HOÀN THÀNH/Hủy. So cách đọc mã, ô đặt nút, sự kiện click/keyboard và khung tránh nút. Nếu POS không dùng cấu trúc giả định, dev sửa và phát hành gói/version/hash mới.
3. **UI thật:** kiểm khung v0.1.6 trên POS GR03878 và Nextwaves GR03879 ở trạng thái mở/thu nhỏ, sau cuộn/đổi kích thước; lưu ảnh hoặc bằng chứng tương đương. `panel.js` và mã Nextwaves không đổi trong v0.2.1, nên không cần buộc operator tự cung cấp đúng năm ảnh.
4. **Hiệu năng thật:** đo trên DOM danh sách staging, có và không có extension. Phép đo `grList.stats()` hiện tính thời gian xử lý từng lát nhưng không gồm bước `querySelectorAll('tr')`/`Array.from(...)` trước lát; phép nghiệm thu trang thật cần tính toàn bộ tác vụ hoặc dùng trace CDP để tránh kết luận quá mức từ con số mỗi lát. Kiểm đủ nút trên trang/phân trang và không mở dòng khi bấm nút extension.

Operator đã cho dev dùng Claude in Chrome **chỉ đọc** để lấy G0 và dự định cài v0.1.6 để kiểm khung. Bàn giao cho biết Chrome chưa kết nối với Claude; đây là trở ngại truy cập bằng chứng, không phải lỗi extension đã xác nhận. Không yêu cầu operator chạy thao tác nhận Nextwaves, điền GR hay bấm HOÀN THÀNH để thu G0.

## Bước tiếp theo

Dev lấy G0 khi Chrome kết nối, lưu mẫu đã làm sạch và báo sai khác so với giả định. PM kiểm G0 và số đo trang thật, rồi quyết merge/cài v0.2.1 cho lượt kiểm staging. Mọi lượt nhận hàng/PUT/HOÀN THÀNH staging vẫn cần operator cho phép riêng đúng phiếu; production có gate Đợt 2 riêng.
