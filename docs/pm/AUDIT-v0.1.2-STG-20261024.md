# PM audit v0.1.2 staging

Ngày 24/10/2026. Phạm vi: nhánh `batch/v0.1-staging` tại `5d117d2` (mã runtime ở `6eeb3c0`), so với `d124453`; bàn giao `docs/dev/FIX-AUDIT-v0.1.1-STG.md`; gói `525BCE84`. **Kết luận: P1.6 và P1.7 đã đạt gate source/test local. T1 chỉ đọc có thể chạy bằng v0.1.2. Chưa qua gate merge hoặc ghi POS thật vì thiếu bằng chứng staging sau nhận và W1; K1 chưa gỡ.**

## Bằng chứng

| Mức | Kết quả |
|---|---|
| PM kiểm source/test | Đọc diff `d124453..5d117d2` ở `pos-model`, `pos-content`, `background`, `nw-content` và test tương ứng. `npm test` tại `5d117d2`: **78 pass, 0 fail, 0 skip**. Commit `5d117d2` chỉ đổi `tests/runtime.test.js`, không đổi `src/`. |
| PM kiểm gói | ZIP `dist/circa-gr-nextwaves-v0.1.2.zip` SHA-256 `525bce842bebaff045e5efe3341bd4c8bf6bd2451ef6d6356f59af692ff805d1`. **17/17** entry khớp hash với `src/` tại `5d117d2` và **17/17** file trong `C:\circa-gr-nextwaves-v0.1.2`. |
| Dev tự báo | 10 lần liên tiếp 78/78; 47/47 đột biến bị bắt tại `5d117d2`; Edge headless nạp extension được nhưng chưa đăng nhập staging. PM chưa chạy lại 47 ca đột biến và chưa kiểm giao diện Edge bằng phiên thật. |
| Môi trường thật | Chưa có T1 với phiên đăng nhập, response tìm GR/đơn theo SO thật của phiên này, lượt `receive-scan` 2xx theo inter-tenant, hoặc PUT W1 trên POS staging. PO28237814 còn lỗi K1 `tagged_unit_unsupported`. |

## Kết quả P1.6 — tìm GR theo SO

`checkSoGrs` yêu cầu `goods_receipts[]`, `total/page/limit` dạng số, `page=1`, số dòng không vượt `limit`, `total` bằng số dòng đã đọc; từng GR phải có `id/status/pos_info.id` đúng cửa hàng. Kết quả thiếu hoặc chưa đọc hết làm `so_gr_unknown` khi mở thẳng GR, hoặc dừng tại `/chi-tiet-so`. Hai GR hợp lệ làm `so_many_gr`; không mở khoá ghi. Hai đường cùng gọi `searchGrsOfSo` và `soWriteLock` dùng kết quả kiểm đó. Test model và browser-sim bao gồm `total=2/items=1`, trang sai, thiếu `limit`, dòng thiếu cửa hàng, hai GR; ca chặn có **0 PUT**. **P1.6 đóng ở mức source/test local.** Đây là cơ chế dừng an toàn ở trang đầu, chưa hỗ trợ phân trang.

## Kết quả P1.7 — khoá ghi phía Nextwaves

`session:update` chỉ ghi `state` thuộc danh sách cho phép; các trường còn lại bị bỏ qua. `session:nwMatched` chỉ chạy một lần khi `waiting_nw`, từ origin Nextwaves đúng môi trường, kiểm SO/phiếu gửi và chỉ nhận khoá `nw_many_orders`. `claimApply` kiểm `writeBlockers` gồm cả hai nhóm khoá; các message tạo phiên/claim/lease/finish và báo scan/received có kiểm origin theo phía POS hoặc Nextwaves. Browser-sim thử xoá khoá từ hai tab, đổi PO, khớp lần hai và claim; khoá vẫn còn, claim bị chặn, **0 PUT**. Luồng hợp lệ vẫn đạt test E2E. **P1.7 đóng ở mức source/test local.** Kiểm origin và hành vi trên Chrome với phiên đăng nhập còn thuộc T1.

## P2.4 — phiên đang hoạt động khi nâng cấp cùng extension ID

`startSession` trả lại phiên `ACTIVE` đã lưu mà không kiểm lại danh sách GR theo SO hoặc phiên bản schema. Nếu nâng cấp **cùng extension ID** từ bản cũ có phiên chưa mang khoá P1.6, phiên đó vẫn có thể đi tiếp bằng khoá cũ. Gói unpacked v0.1.2 ở thư mục mới không chứng minh đường nâng cấp giữ storage; đây là rủi ro triển khai, chưa phải lỗi đã thấy trên staging. **Yêu cầu dev trước phát hành nâng cấp giữ ID:** đánh dấu schema phiên và huỷ/khóa mọi phiên active tạo bởi bản trước, hoặc kiểm lại các bất biến trước `claimApply`; thêm test phiên cũ thiếu khoá. **T1:** tắt/gỡ bản cũ trước khi nạp bản v0.1.2.

## Gate tiếp theo

1. **Operator T1 chỉ đọc:** tắt/gỡ bản cũ, nạp `C:\circa-gr-nextwaves-v0.1.2`, chọn Staging, không cấp phép điền; mở GR03878. Gửi ảnh khung ở POS và Nextwaves, Copy response `inter-tenant-orders/receiving?...q=SOBD1593858` và `goods-receipt/search?query=so_thuocsi=1593858...` (giữ `total/page/limit`, bỏ credential). PM đối chiếu schema/cửa hàng, trạng thái và khoá của extension với response thật.
2. **K1 và T3:** operator/Nextwaves/Buymed cung cấp phương án để nhận thành công một SO staging theo đường inter-tenant. Sau lượt người dùng xác nhận nhận hàng thật, lấy response 2xx `receive-scan`, GET PO, shipment và `/receiving` sau nhận; bỏ credential. Dev cập nhật fixture/hợp đồng nếu response khác giả định, PM audit lại.
3. **W1:** sau gate T3, operator chọn một GR staging và cho phép riêng lượt ghi; kiểm request/response PUT detail cùng GET GR trước/sau. Không cấp phép điền, không ghi POS và không merge mã ghi vào `main` trước các gate này.

PM không sửa `src/`, `tests/`, `scripts/` hoặc gọi API ghi.
