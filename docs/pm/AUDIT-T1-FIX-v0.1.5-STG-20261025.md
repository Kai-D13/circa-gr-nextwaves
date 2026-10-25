# PM audit sửa lỗi T1 — v0.1.5 staging

Ngày 25/10/2026. Phạm vi: lỗi operator thấy khi mở GR03878 bằng v0.1.4 (`Cannot read properties of undefined (reading 'envFromConfig')`); nhánh `batch/v0.1-staging` tại `456205a`, so với `49bf0a4`; bàn giao `docs/dev/FIX-T1-v0.1.5.md`. **Kết luận: sửa lỗi nạp script đạt gate source/test và kiểm trên Edge không đăng nhập. Operator có thể chạy lại T1 chỉ đọc bằng v0.1.5. Thu hồi hướng dẫn dùng v0.1.2/v0.1.4 cho T1. Chưa qua gate merge hoặc ghi POS thật.**

## Bằng chứng PM tự kiểm

| Mức | Kết quả |
|---|---|
| Source/test | Manifest chuyển hook MAIN sang `main/env.js`, logic ISOLATED giữ `lib/env.js`; hai file giống từng byte. Test mới chặn file trùng giữa hai mục khớp cùng trang và kiểm thứ tự nạp. Trình duyệt giả mô phỏng việc bỏ file trùng. `npm test` tại `456205a`: **85 pass, 0 fail, 0 skip**. `git diff --check 49bf0a4 456205a` không báo lỗi. |
| Gói | ZIP `dist/circa-gr-nextwaves-v0.1.5.zip` SHA-256 `cdd02c3d1461b946d2946957b7d3fc03e9ccf2f385c83b85c027ad4a44b40e3b` (`CDD02C3D`). **18/18** entry ZIP khớp hash source tại `456205a` và **18/18** file trong `C:\circa-gr-nextwaves-v0.1.5`. |
| Edge PM chạy | `node scripts/edge-check.js C:\circa-gr-nextwaves-v0.1.5`: **9/9 đạt**. Negative control v0.1.4: **6/9 hỏng**, tái hiện đúng lỗi `envFromConfig`; cả POS và Nextwaves ISOLATED thiếu `env`. Kịch bản POS dùng trang và response mẫu được CDP trả thay server; Nextwaves chưa đăng nhập chuyển sang trang login. Không có thao tác ghi. |
| Dev tự báo | 5 lần 85/85; **60/60 đột biến** bị bắt tại `456205a`, không ca nào do hết giờ (PM đọc danh sách kết quả, chưa chạy lại bộ đột biến); Edge nâng cấp giữ cùng ID từ v0.1.2 dọn phiên/cấp phép cũ. |
| Phiên staging đăng nhập thật | T1 lần đầu của operator xác nhận lỗi trên v0.1.4. **Chưa** có T1 chạy lại bằng v0.1.5 với tài khoản POS/Nextwaves, ảnh khung hoặc Copy response thật của lượt này. |

## Đánh giá sửa và nguyên nhân

Trên Edge kiểm thử, v0.1.4 khai cùng đường dẫn `lib/env.js` ở hai mục `content_scripts` khớp một trang; mục MAIN có `env`, mục ISOLATED không có. Do đó POS không đọc GR/PO, không tạo phiên và không mở tab Nextwaves. PM tái hiện đúng thông báo lỗi operator. Bản v0.1.5 dùng hai đường dẫn file khác nhau cho hai world; mỗi world đều có `env`. Cách sửa chỉ đổi cấu hình nạp script và bản sao thư viện, không đổi logic xử lý đơn, khoá ghi hoặc cấp phép. Test byte equality giúp phát hiện khi hai bản sao lệch về sau.

`scripts/edge-check.js` là gate hữu ích cho mỗi gói tiếp theo: kiểm cả MAIN và ISOLATED trên Edge, rồi đi đường GR → phiên → tab Nextwaves với dữ liệu mẫu. Nó **chưa** chứng minh hành vi trên phiên đăng nhập thật, hợp đồng API sau khi nhận hoặc W1. Các giả định trong browser-sim về cách nạp file đã được kiểm bằng negative control Edge ở hai phiên bản, không cần coi đó là quy tắc chung cho mọi phiên bản Chrome.

## Quyết định và gate tiếp theo

1. **T1 chạy lại ngay bằng v0.1.5, chỉ đọc.** Gỡ mọi bản extension cũ, Load unpacked `C:\circa-gr-nextwaves-v0.1.5`, chọn lại Staging, không cấp phép điền; tải lại các tab đã mở. Làm theo `docs/dev/T1-STG-HUONG-DAN.md`. Không bấm “Xác nhận nhận hàng” hay “HOÀN THÀNH”.
2. **Operator gửi:** ảnh khung POS, khung Nextwaves, popup; Copy response tìm GR theo SO `1593858` (giữ `total/page/limit`) và tìm đơn Nextwaves `q=SOBD1593858` (giữ `items/total`), không gửi credential. Nếu khung khác kỳ vọng, vẫn gửi ảnh và response để PM/dev đối chiếu thay vì sửa parser theo suy đoán.
3. **Dev:** duy trì test manifest và `edge-check.js` như gate mỗi bản runtime; báo kết quả trình duyệt thật cùng số test/mutation. Không cần sửa runtime thêm từ audit này.
4. **K1/T3/W1:** giữ gate cũ: cần lượt nhận inter-tenant thành công thật, response sau nhận, rồi phép thử W1 trên một GR staging được operator cho phép riêng. Chưa merge mã ghi vào `main`.

PM không sửa `src/`, `tests/`, `scripts/` hoặc gọi API ghi.
