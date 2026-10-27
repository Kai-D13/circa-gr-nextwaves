# PM audit v0.2.0 — source, gói và điều kiện Go

Ngày 27/10/2026. Nhánh `batch/v0.2-rfid` tại `682c509`; runtime cuối `ef67a7b`. Gói `096D97D9` (`circa-gr-nextwaves-v0.2.0.zip`). Audit này chưa phải nghiệm thu trên POS/Nextwaves thật.

## Kết luận

- **Đã cho dev triển khai và dev đã hoàn tất code/đóng gói.** G0 chưa có không chặn khởi công; đính chính PM ngày 26/10 vẫn hiệu lực.
- **Chưa Go merge/cài để vận hành v0.2.0.** Cần xử lý P2.1–P2.2 và kiểm hợp đồng danh sách, DOM, khung trên trang thật. Có thể tiếp tục thu bằng chứng chỉ đọc bằng v0.1.6 đã được phép dùng trên staging.
- **Chưa Go lượt nhận hàng/ghi POS.** Mỗi lượt staging có tác động cần operator cho phép riêng; production vẫn chỉ đọc và có gate khác.

## Bằng chứng đã kiểm độc lập

| Mức | Kết quả |
|---|---|
| Source | Diff `b4017d7..682c509` sạch (`git diff --check`); `src/ui/panel.js`, `src/nw/*`, `src/lib/plan.js`, `src/lib/apply.js` không đổi. |
| Test | PM chạy `npm test`: **131/131 đạt**. |
| Gói | PM dựng lại ZIP từ `682c509`: SHA-256 `096d97d993f341bf3ec107c517c40ede5abf9a96ab247f504d8ec2b97f3b221e`. Source, ZIP và bản giải nén: 19/19 file cùng tên và nội dung. |
| Edge trên trang giả | PM chạy hai lần trên bản giải nén: **16/16 phép kiểm đạt** mỗi lần. Danh sách 20 dòng có 13 nút đúng; chỉ xem danh sách không phát sinh API từ extension; bấm tạo một phiên/một tab; trang bán hàng không có nút/khung/request. |
| Dev tự báo, PM chưa chạy lại | Đột biến 93/93 theo báo cáo dev (92/93 lượt đầy đủ, sửa test rồi 18/18 lượt ca 76–93). |
| Trang staging thật | Chưa có response/DOM/ảnh v0.1.6 mới trong bằng chứng giao PM. Các ảnh Downloads đang có là lượt cũ. |

## Finding cho dev

### P2.1 — Replay danh sách có thể mất response mới

`src/pos/pos-hook.js` lưu `lastList = msg` vô điều kiện trong `finishList`. Nếu request A gửi trước, B gửi sau, B về trước rồi A về sau, hook phát A với `latestReqSeq = B` và ghi A làm `lastList`. Content đang nghe sẽ bỏ A đúng, nhưng content nạp muộn nhận replay **chỉ A**, bỏ A và không bao giờ thấy B: nút RFID không hiện đến khi POS tải danh sách lần nữa. `beginList` cũng không xoá replay cũ khi vừa gửi lượt mới.

**Yêu cầu:** Chỉ replay kết quả của request mới nhất; khi gửi request mới, replay phải biểu diễn trạng thái đang chờ hoặc không có kết quả, không giữ dữ liệu cũ như dữ liệu hiện hành. Thêm test thứ tự A/B và content nạp muộn sau khi A về sau B; thêm ca content nạp muộn khi B đang chờ. Giữ nguyên hàng rào click đọc lại GR/PO/SO. Runtime thay đổi phải tăng version, ZIP và SHA mới theo `agent.md`.

### P2.2 — Test hiệu năng chưa áp đúng ngưỡng cho lúc tải trang

`scripts/edge-check.js` kiểm `stats1.maxMs < 2` cho bão DOM nhưng `stats0.maxMs < 16` cho lượt quét lúc tải trang, dù nhãn phép kiểm và ngân sách PM nói mỗi lượt dưới 2 ms. PM đo lượt tải trang tối đa **2,5 ms** ở lần 1 và xấp xỉ **2,0 ms** ở lần 2 (số in ba chữ số thập phân), trong khi Edge vẫn báo 16/16. Bão DOM lần lượt tối đa 0,2/0,6 ms; CPU extension trong bão 3,8/0,6 ms; không có dấu hiệu task >50 ms trên trang giả.

**Yêu cầu:** Thống nhất ngưỡng thật và phép kiểm; đo lại trên DOM danh sách staging thật (cùng trang với/không extension). Nếu ngân sách 2 ms giữ nguyên, tối ưu lượt tải trang hoặc giải trình số đo và đề xuất PM sửa ngân sách trước Go. Không dùng 16/16 để khẳng định toàn bộ ngưỡng hiệu năng đã đạt.

### G0 — Hợp đồng trang thật chưa được xác nhận

`gr-list.js` giả định mỗi phiếu nằm trong `<tr>`, mã GR nằm ở phần tử lá, nút đặt ở ô cuối hoặc `div.flex`. Response fixture cũng chưa được đối chiếu bằng bản `Copy response` đã lưu. Đây là **thiếu bằng chứng tích hợp**, chưa phải lỗi đã xác nhận. Nếu DOM/response khác, dev sửa và giao gói mới để PM audit.

## Bằng chứng còn cần, mục đích và người lấy

| Bằng chứng chỉ đọc | Dùng để chốt | Người lấy |
|---|---|---|
| UI khung trên POS GR03878 và màn quét Nextwaves GR03879; thấy trạng thái mở/thu nhỏ, nút HOÀN THÀNH/Hủy và nút Xác nhận nhận hàng sau cuộn/đổi kích thước | Khung v0.1.6 không che thao tác, kế thừa sang v0.2 vì `panel.js` và Nextwaves không đổi | Dev/PM kiểm trực tiếp trên máy staging đã đăng nhập, lưu ảnh đại diện. **Năm ảnh là checklist đề xuất, không phải chỉ tiêu cứng**; có thể thay bằng bộ ảnh/ghi nhận trực tiếp tương đương. Operator hỗ trợ mở phiên nếu cần. |
| `Copy response` của GET `goods-receipt/search` khi POS ở danh sách, có `query=pos_id=...` | Xác nhận `goods_receipts`, `id`, `code`, `status`, `purchase_order_id`, `pos_info.id`, phân trang; so parser với dữ liệu thật | Dev/PM lấy read-only từ Network; bỏ tên người, không lấy headers/cURL/cookie/token. |
| `outerHTML` một `<tr>` GR đang chờ nhận và vùng nút HOÀN THÀNH/Hủy | Xác nhận mã GR, vị trí/nút trong bảng, bắt click không mở dòng, khung tránh nút POS | Dev/PM lấy read-only từ Elements, làm sạch dữ liệu cá nhân/bí mật. |

Operator **không cần tự chụp đủ năm ảnh hay trích HTML** để dev được code. Nếu dev/PM không có phiên staging đang đăng nhập, operator chỉ cần hỗ trợ mở phiên hoặc chuyển các mục thiếu. Không bấm nhận Nextwaves, cấp quyền điền, PUT hoặc HOÀN THÀNH để thu G0.

## Gate tiếp theo

1. Dev trả lời P2.1–P2.2 bằng diff/test/số đo, và đưa response/DOM thật để so hợp đồng. Nếu runtime sửa, phát hành version/gói/hash mới.
2. PM kiểm lại source/gói và UI thật; quyết merge/cài bản thích hợp cho kiểm staging. Việc kiểm UI có thể gộp v0.1.6 với bản kế thừa nếu chính phần khung/Nextwaves không đổi.
3. Lượt thử có tác động trên staging cần operator cho phép riêng đúng GR/PO. Đợt 2 production (O1, QR sinh sau HOÀN THÀNH, reader Florita) có spec/gate riêng.
