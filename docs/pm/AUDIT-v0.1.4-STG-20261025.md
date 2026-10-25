# PM audit v0.1.4 staging — P2.4

Ngày 25/10/2026. Phạm vi: `batch/v0.1-staging` tại `49bf0a4`, so với `5d117d2`; runtime cuối ở `91e3bd1`; bàn giao `docs/dev/FIX-AUDIT-v0.1.2-STG.md`. **Kết luận: P2.4 và chốt dừng vòng lặp tạo phiên đạt gate source/test local. T1 chỉ đọc tiếp tục với v0.1.2 hoặc có thể dùng v0.1.4 sau khi tắt bản cũ. Chưa qua gate merge/ghi POS vì thiếu bằng chứng staging sau lượt nhận inter-tenant và W1; K1 còn mở.**

## Bằng chứng đã kiểm

| Mức | Kết quả |
|---|---|
| PM kiểm source/test | Đọc diff `5d117d2..49bf0a4` (8 file, +259/−25); các commit sau `91e3bd1` chỉ đổi test/script, không đổi `src/`. `npm test` tại `49bf0a4`: **82 pass, 0 fail, 0 skip**. Chạy lại 5 lần liên tiếp: **5/5 lần 82/82**. `git diff --check` không báo lỗi. |
| PM kiểm gói | ZIP v0.1.4 SHA-256 `10a29bc4a1f746cd7d048a49601c4cbf9b0abe4ee36a8558dd14f448e531abfa`. **17/17** entry ZIP khớp hash file `src/` tại `49bf0a4` và **17/17** file bản cài `C:\circa-gr-nextwaves-v0.1.4`. PM chưa dựng lại ZIP bằng `scripts/pack.py` vì máy trong phiên này không tìm thấy lệnh `python`/`py`; đối chiếu hash từng file và hash ZIP đã đạt. |
| Dev tự báo | 58/58 đột biến bị bắt trên `49bf0a4`, không ca nào vì quá 240 giây; 34 lượt test dưới tải đều 82/82. PM đọc danh sách 58 kết quả trong báo cáo, chưa tự chạy bộ đột biến (~40 phút). Edge headless nâng cấp 0.1.2 → 0.1.4 **cùng extension ID** và ghi nhận phiên/cấp phép cũ bị xoá; PM chưa tái hiện trên Edge. |
| Môi trường thật | Chưa có T1 trên phiên đăng nhập của operator, lượt nhận `receive-scan` 2xx theo inter-tenant, dữ liệu sau nhận hoặc PUT W1 trên POS staging. Không có phép thử ghi trong lượt audit này. |

## P2.4 — phiên và cấp phép cũ khi nâng cấp

`background.js` gắn `SESSION_SCHEMA=1` vào phiên và cấp phép mới. `writeBlockers` đặt `session_outdated` lên đầu cho phiên thiếu/sai schema, nên `claimApply` từ chối trước khi lấy cấp phép. `getGrants` bỏ cấp phép cũ; `session:get` và `findByNw` không trả phiên cũ. `nwMatched`, `scanOk`, `received` chặn phiên cũ. `startSession` thay phiên cũ bằng phiên mới, buộc đường POS tính lại khoá tìm GR theo SO. `onInstalled` với lý do `update`/`install` dọn phiên và cấp phép cũ, lưu `lastUpgrade`; kiểm schema ở đường ghi vẫn hoạt động nếu sự kiện dọn không chạy.

Test mô phỏng phiên `received` cũ thiếu khoá, xác nhận claim bị chặn, 0 PUT, và mở lại GR tạo phiên mang `so_gr_unknown` khi `total=2/items=1`. Test khác xác nhận Nextwaves không tìm/khớp phiên cũ và `onInstalled` dọn đúng dữ liệu. **P2.4 đóng ở mức source/test local; bằng chứng Edge giữ ID là dev tự báo.**

## Chốt dừng vòng lặp tạo phiên và độ tin cậy test

`pos-content.js` ghi lần `session:start` gần nhất; nếu trong 10 giây vẫn không đọc lại được phiên, hiển thị lỗi và dừng tự tạo lại. Nút “Thử lại” của người dùng mới bỏ chốt. Test bơm lỗi `session:get=null` xác nhận chỉ một lần tìm GR theo SO, một tab Nextwaves và 0 lần lặp tiếp. Bộ browser-sim chặn tác vụ từ trang đã rời đi/trình duyệt giả đã đóng, và `afterEach` đóng các phiên giả sau test bị cắt. Điều này xử lý các lượt đột biến trước mà dev đã loại khỏi bằng chứng vì treo. PM kiểm các test này trong 82/82 và lặp 5 lần; không suy từ browser-sim rằng Chrome thật đã hết mọi tình huống thời điểm.

## Gate và việc tiếp theo

1. **Operator T1 chỉ đọc:** tắt bản extension cũ, chọn Staging, không cấp phép điền; mở GR03878. v0.1.2 đã được PM cho phép trước đó; v0.1.4 đạt gate local cho T1. Gửi ảnh khung POS/Nextwaves, Copy response `inter-tenant-orders/receiving?...q=SOBD1593858` và `goods-receipt/search?query=so_thuocsi=1593858...` (giữ `total/page/limit`, bỏ credential). PM đối chiếu response và hành vi trên phiên đăng nhập.
2. **K1/T3:** cần một lượt nhận thành công theo đường inter-tenant trên staging do operator thực hiện, hoặc phương án Nextwaves/Buymed gỡ `tagged_unit_unsupported`. Sau nhận, lấy response 2xx `receive-scan`, GET PO, shipment và `/receiving` sau nhận (bỏ credential), rồi audit hợp đồng dữ liệu và kế hoạch UID.
3. **W1:** chỉ sau gate T3, operator chỉ định một GR staging và cho phép riêng lượt ghi; kiểm request/response PUT detail cùng GET GR trước/sau. Không merge mã ghi vào `main` trước gate này.

PM không sửa runtime, test hoặc script; không gọi API ghi.
