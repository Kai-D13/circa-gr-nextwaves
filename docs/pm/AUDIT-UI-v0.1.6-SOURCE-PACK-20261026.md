# PM audit source/gói v0.1.6 — khung không che nút thao tác

Ngày 26/10/2026. Phạm vi: `batch/v0.1.6-ui` tại `b4017d7`, so với `main` `aa42dcc`; bàn giao `docs/dev/FIX-UI-v0.1.6.md`; ZIP v0.1.6 mã `34B4AE1A`. **Kết luận: đạt gate source, test, gói và Edge với trang mô phỏng. Operator được cài v0.1.6 để kiểm giao diện *chỉ đọc* trên POS/Nextwaves staging thật. Chưa chốt gate sửa lỗi trên trang thật, chưa merge nhánh UI hoặc cho phép lượt nhận/điền bằng v0.1.6.**

## PM tự kiểm

| Mức | Kết quả |
|---|---|
| Diff/source | `git diff aa42dcc b4017d7 -- src` chỉ đổi `manifest.json` 0.1.6, `ui/panel.js`, và cấu hình tên nút cần tránh trong POS/Nextwaves content script; không đổi `plan.js`, `apply.js`, phiên, quyền ghi hoặc môi trường. `git diff --check` sạch; quét chuỗi bí mật theo quy tắc repo trên phần source/script/test không có khớp. |
| Test Node | PM chạy `npm test` trên checkout tách biệt ở `b4017d7`: **106 pass, 0 fail, 0 skip**. Dev báo đã chạy 10 lượt liên tiếp, PM không chạy lại 10 lượt vì rủi ro cụ thể đã được kiểm bằng Edge và đối chứng. |
| Gói | PM tự chạy `scripts/pack.py` tại `b4017d7`: **SHA-256 `34b4ae1a1cd38f2c713eeed28aaf874e571a7b9ad6323a7a745e6fea42bf077c`**, 18 file. PM so SHA từng file: source = ZIP = `C:\circa-gr-nextwaves-v0.1.6`, **18/18 khớp**, không có file thừa trong bản giải nén. |
| Edge trên bản giải nén | PM chạy `edge-check.js` với `C:\circa-gr-nextwaves-v0.1.6`: **12/12 đạt**. Trên POS mô phỏng cao 485px, khung mở rộng nằm trên nút HOÀN THÀNH (mép dưới 417, nút bắt đầu 429), thu nhỏ rộng 322px vẫn không che, bỏ nút khung về mép dưới 16px. Tải script ở cả hai world, đọc dữ liệu mô phỏng và mở tab đúng; không có thao tác ghi. |
| Đối chứng cũ | Cùng phép kiểm trên bản cài v0.1.5: **2/12 hỏng đúng hai ca chồng nút** (khung mở rộng/thu nhỏ đều che nút). Điều này chứng minh phép đo bắt được lỗi operator thấy trên bố cục mô phỏng. |
| Đột biến | PM chạy riêng **5/5 ca mới của v0.1.6 bị bắt**, không ca nào do timeout. Dev báo toàn bộ **65/65** (60 cũ + 5 mới), 0 timeout/neo lệch; PM chưa chạy lại 60 ca cũ. |

## Giới hạn và gate thật

**P2 còn mở:** `avoidRects()` dựa vào chữ và loại phần tử (`button`, link, `role=button`, input). Edge check đặt nút POS giả; chưa biết DOM, chữ và vị trí thực tế của nút HOÀN THÀNH/Hủy trên POS hoặc Xác nhận nhận hàng trên Nextwaves. Giới hạn màn hình quá thấp cũng có thể khiến khung không thể vừa ở trong viewport vừa tránh mọi nút. Những điều này chưa phải lỗi đã tái hiện trên staging thật.

**Lượt kiểm tiếp theo được phép, chỉ đọc:** trước khi thay bản cũ, đảm bảo không có phiên đang ở giữa “Nextwaves đã nhận → POS chưa điền” vì bản mới có extension ID khác và không mang phiên cũ. Load unpacked `C:\circa-gr-nextwaves-v0.1.6`, chọn lại Staging, mở một GR còn nút HOÀN THÀNH và màn quét Nextwaves; chụp khung mở rộng/thu nhỏ và sau đổi kích thước hoặc cuộn, với nút thao tác hiện rõ. Hướng dẫn ảnh chi tiết ở `docs/dev/FIX-UI-v0.1.6.md` §6. **Không cấp phép, không xác nhận nhận hàng, không điền GR, không bấm HOÀN THÀNH.** Nếu còn chồng, chụp thêm DOM của nút bằng Inspect; dev sửa theo bằng chứng thật rồi tăng version/ZIP/SHA-256 và PM audit lại. Chỉ sau ảnh/kiểm này mới quyết merge `batch/v0.1.6-ui` và dùng v0.1.6 cho vận hành.

**Quy đổi vỉ → hộp:** quyết định tại `docs/pm/REVIEW-UI-v0.1.6-PRELIM-20261026.md` §3 giữ nguyên; batch UI không thay `plan.js`. Lô quy đổi lẻ hoặc vượt lượng chặn cả kế hoạch, không làm tròn/ghi một phần. Không mặc định POS có thể nhập tay 0,5 hộp.

Ghi chú tài liệu dev: dòng đầu báo cáo ghi đường dẫn `C:circa-gr-nextwaves-v0.1.6` thiếu dấu `\`; đường dẫn đúng đã kiểm là `C:\circa-gr-nextwaves-v0.1.6` (mục §6 của báo cáo dùng đúng). Dev nên sửa lỗi đánh máy khi cập nhật báo cáo, không ảnh hưởng gói.

PM không sửa runtime, không gọi API ghi và không cài extension vào hồ sơ vận hành của operator.
