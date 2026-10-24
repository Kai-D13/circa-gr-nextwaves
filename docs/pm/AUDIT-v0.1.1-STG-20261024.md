# PM audit lại v0.1.1 staging

Ngày 24/10/2026. Phạm vi: mã tại `d124453` trên nhánh `batch/v0.1-staging`, script đột biến ở `8e443fa`, báo cáo dev `docs/dev/FIX-AUDIT-BATCH-v0.1-STG.md`, gói `D8CD9AFD`. **Kết luận: P1.1–P1.5 và P2.1–P2.3 đã có sửa ở source + test local; chưa qua gate merge/ghi vì P1.6, P1.7 dưới đây và thiếu bằng chứng staging thật.** T1 chỉ đọc có thể chạy với v0.1.1, không cấp phép điền.

## Bằng chứng PM tự kiểm

| Mức | Kết quả |
|---|---|
| Source và test local | PM đọc diff `a08d541..d124453`, chạy `npm test` tại `d124453`: **73 pass, 0 fail, 0 skip**. Các hàng rào cũ có test nhắm đúng ca, và đường `auto` đã bỏ. |
| Gói | ZIP v0.1.1 SHA-256 `d8cd9afd88e4639c1e65d09d3aa55da40a78c7e1477c019ace163c85403a1758`; 17/17 entry ZIP và 17/17 file tại `C:\circa-gr-nextwaves-v0.1.1` khớp hash từng file với `src/` ở `d124453`. Quét mẫu bí mật trên commit: 0 kết quả. |
| Dev tự báo | 10 lần chạy 73/73, 32/32 đột biến bị bắt trên đúng commit, Edge headless nạp được extension. PM đã đọc script đột biến, chưa chạy lại 32 ca. |
| Môi trường thật | Chưa có kết quả T1 với phiên đăng nhập. K1 vẫn làm PO28237814 nhận thất bại; chưa có response 2xx inter-tenant sau nhận hoặc phép thử PUT W1 trên POS staging. |

## P1.6 — Kiểm một GR theo SO trên tập kết quả POS chưa đầy đủ

`samples/pos-stg-gr-search-so-1593858.json` có `data.total`, `page`, `limit`. `src/pos/pos-content.js:198-205` chỉ lấy `goods_receipts[]`, lọc bỏ dòng thiếu/sai `posId` và không so `total` với số dòng đã đọc. `src/pos/pos-content.js:267-275` mở khoá ghi khi phần danh sách còn lại có đúng một GR. Như vậy response có `total=2`, `goods_receipts` chỉ trả một GR03878 vẫn cho `writeLocks=[]` — sai bất biến P3 “SO có đúng một GR”. PM tái hiện bằng browser-sim tại `d124453`: `{"reportedTotal":2,"returnedRows":1,"writeLocks":[]}`. Dòng thứ hai thiếu `pos_info.id` cũng bị lọc âm thầm và gây cùng rủi ro.

**Yêu cầu dev:** chuẩn hoá và kiểm `total/page/limit` cùng `goods_receipts[]` trước khi kết luận duy nhất; phân trang đầy đủ hoặc fail closed nếu chưa đủ, trường bắt buộc thiếu phải thành `so_gr_unknown`, không lọc rồi đếm. Cả đường GR trực tiếp và `/chi-tiet-so` dùng chung phép kiểm. **Gate:** test `total=2/items=1`, page/limit sai, một dòng thiếu `pos_info.id`, hai GR trên hai trang, hai GR đủ; tất cả ca chưa đủ/không rõ phải có khoá ghi và 0 PUT. Đối chiếu Copy response tìm SO mục tiêu trên staging.

## P1.7 — Khoá nhiều đơn Nextwaves chưa bất biến trong background

`src/background.js:25-29` bảo vệ `writeLocks` nhưng **không** bảo vệ `nwWriteLocks`; `contentUpdate` tại dòng 112–124 cho message `session:update` ghi đè trường đó. `writeBlockers` tại dòng 195–202 dựa vào chính `nwWriteLocks`. PM tái hiện bằng browser-sim: sau khi đặt `nwWriteLocks=["nw_many_orders"]`, một `session:update` từ tab POS với `{nwWriteLocks:[]}` làm danh sách blocker mất `nw_many_orders`. Dev có test không xoá được khoá POS, nhưng chưa kiểm khoá Nextwaves.

**Yêu cầu dev:** content script thường không được xoá hoặc hạ khoá Nextwaves qua `session:update`. Cho phép bước khớp đơn đặt khoá qua một message riêng có kiểm sender/tab, môi trường, trạng thái và chỉ được thiết lập một lần cho phiên; hoặc cơ chế tương đương giữ bất biến. **Gate:** test tab POS/Nextwaves cố xoá `nw_many_orders`, đổi dữ liệu nhận dạng PO và claim ghi; background vẫn từ chối, 0 PUT. Test luồng khớp đơn hợp lệ vẫn tạo được phiên và khoá đúng.

## Đánh giá sửa cũ và quyết định PM

- **P1.1:** source đã bỏ `.slice(0,10)` và chặn khi `total != items.length`, candidate lỗi hoặc thiếu schema. Đây là cách **fail closed ở một trang**, chưa phân trang khi `total > pageSize`; đủ cho an toàn trước ghi, nhưng báo cáo/UI không nên gọi là “đã đọc toàn bộ” trong trường hợp đó.
- **P1.2/P2.2/P2.3:** mã đã bắt UID có sẵn sai lô, QR thiếu trường và thay đổi detail khác; test tương ứng đạt. Hợp đồng dữ liệu thật vẫn chờ T3.
- **P1.3:** chấp nhận thiết kế **cấp phép một lần cho một GR, hạn 30 phút**, chỉ popup tạo, rồi người dùng bấm nút mang mã kế hoạch. Quyền này chỉ được operator cấp cho từng lần ghi thật. PRD chỉ đọc là đúng gate hiện tại.
- **P1.4:** cả hai đường POS đã bắt buộc `x-store-id`, GR và PO cùng cửa hàng; test đạt.
- **P1.5:** lease 90 giây, gia hạn 15 giây, timeout HTTP 30 giây và cooldown 60 giây là hàng rào hợp lý cho staging. Không thể suy ra “mỗi UID ghi đúng một lần” trên server thật chỉ từ trình duyệt giả; phép thử W1 có operator cho phép vẫn bắt buộc.
- **P2.1:** 2xx đúng shipment, receipt mới, EPC trong receipt và `receivedEpcs` là hợp đồng đề xuất có chặn an toàn. Chỉ chốt sau response thật theo đường inter-tenant; mẫu PO88508353 thuộc đường hub-order khác.
- **P2 nhận thiếu/P3 nhiều chứng từ:** giữ chặn ghi như hiện tại cho tới quyết định nghiệp vụ hoặc khoá giao hàng mạnh hơn.

## Gate tiếp theo

1. Dev sửa P1.6/P1.7, gửi DIFF và kết quả test nguyên văn. Nếu runtime thay đổi, phát hành version, ZIP, SHA-256 mới; không thay gói `D8CD9AFD`.
2. Operator có thể thử **T1 chỉ đọc** trên v0.1.1: Staging, không cấp phép điền, mở GR03878; gửi ảnh khung POS và Nextwaves, cùng Copy response `inter-tenant-orders/receiving?q=SOBD1593858` và `goods-receipt/search?query=so_thuocsi=1593858…` (giữ `total/page/limit`, không gửi token).
3. K1 cần phương án từ operator/Nextwaves/Buymed hoặc một SO thử khác nhận thành công qua inter-tenant. Sau lượt nhận thật được operator thực hiện: gửi response 2xx `receive-scan`, GET PO, GET shipment, GET `/receiving` sau nhận, đã bỏ credential. Chưa có dữ liệu này thì P2.1 và kế hoạch UID không qua gate live.
4. Chỉ sau audit lại và có dữ liệu nhận thật mới lập phép thử W1 trên **một GR staging được operator cho phép riêng**, kiểm request/response PUT và GET GR trước/sau. Không merge mã ghi vào `main` trước gate đó.

PM không sửa `src/`, `tests/`, `scripts/` hay chạy API ghi.
