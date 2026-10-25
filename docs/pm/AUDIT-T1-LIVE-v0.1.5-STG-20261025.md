# PM audit T1 trên phiên staging thật — v0.1.5

Ngày 25/10/2026. Phạm vi: GR03878 của cửa hàng 2222, SO 1593858, PO Nextwaves PO28237814; bản extension v0.1.5 (`456205a`, gói `CDD02C3D`); báo cáo dev `docs/dev/T1-KET-QUA-v0.1.5-20261025.md`, dữ liệu/test tại `0b9aeb3`. **Kết luận: T1 chỉ đọc đạt gate trên phiên đăng nhập thật. Không có finding yêu cầu sửa runtime từ T1. Chưa đạt gate T3, W1 hoặc merge mã ghi.**

## Bằng chứng đã kiểm

| Mức | Kết quả |
|---|---|
| Phiên thật do operator vận hành | Popup `popup_extension_GR.jpg`: v0.1.5, Staging, `STG · GR03878`, “Đã khớp đơn Nextwaves”, `SOBD1593858-F → PO28237814`, không có dòng “Khoá điền”. Ảnh khung POS `UI_extensin_2.jpg`: “Đã khớp đơn Nextwaves — chờ nhận hàng”; ảnh khung Nextwaves `UI_extension_1.jpg` và `UI_extension_3.jpg`: “Sẵn sàng nhận hàng”, 12 UID dự kiến, tìm theo SO cho `total 1 / đã đọc 1 / ứng viên cùng kho 1 / refId đúng SO 1`, lượng gốc 1110 12/12, 5451 40/40, 2431732 2/2. Trang nhận Nextwaves vẫn hiện 0/12 đã nhận. Operator báo không cấp phép điền và không bấm xác nhận nhận hàng. |
| Hai Copy response thật | POS `T1-pos-gr-search.json`: `total=1,page=1,limit=1000`, một GR03878 `WAITING_TO_RECEIVE`, đúng cửa hàng 2222 và PO00006750. Nextwaves `T1-nw-receiving-search.json`: `total=1`, PO28237814 `CONFIRMED`, đơn `shipped`, đối tác `buymed-stag`, đúng kho staging. Cả hai qua parser v0.1.5; kiểm danh sách GR đầy đủ và chọn đúng ứng viên. |
| Source/test PM chạy | Hai fixture tại commit `0b9aeb3` giống từng giá trị JSON với hai Copy response operator gửi; kiểm chuỗi credential thông dụng trên fixture không thấy. Commit này chỉ thêm fixture/test và README, không đổi `src/`. Chạy `npm test` trên worktree `0b9aeb3`: **87 pass, 0 fail, 0 skip**, gồm hai ca T1 thật. `git diff --check 456205a 0b9aeb3` sạch. |
| Giới hạn của test | Test Nextwaves T1 dùng response tìm kiếm của lượt này, còn `GET` đơn và `/receiving` dùng mẫu thật đã lưu từ trước; T1 không có Copy response của hai `GET` đó. Dòng khung trên phiên thật và popup xác nhận extension đã đi qua nhánh khớp đơn. Popup không hiện khoá; parser trên hai response không tạo khoá. Đây chưa phải bằng chứng về dữ liệu *sau khi nhận*. |

T1 đã chứng minh chuỗi **GR03878 → PO POS PO00006750 → mã giao SOBD1593858-F → tìm đúng PO Nextwaves PO28237814**, tự mở tab và giữ phiên sau tải lại Nextwaves. Bước popup 3.8 từng thiếu trong báo cáo dev nay đã có ảnh, nên đóng gate T1. Không cần chạy lại T1 chỉ để chụp thêm.

## Quyết định cho lượt vận hành tiếp theo

Operator chọn **giữ SO staging hiện tại** để kiểm luồng. Với PO28237814, màn Nextwaves vẫn là **0/12** và lần nhận trước đã trả `400 tagged_unit_unsupported` cho dòng 1110 gắn thẻ theo vỉ. Vì thế có thể dùng đơn hiện tại cho **một phép thử nhánh lỗi K1** khi operator cho phép lượt ghi Nextwaves cụ thể: ghi trạng thái shipment/`/receiving` trước lượt bấm, Copy response `receive-scan`, rồi kiểm lại shipment/`/receiving`, khung hai tab và GR. Extension phải **không chuyển sang điền POS** khi nhận thất bại. Màn Nextwaves nói phiếu gửi được chấp nhận trước khi nhận hàng, nên phải kiểm trạng thái sau 400; không giả định request thất bại là không đổi dữ liệu, không tự thử lại. Kết quả 400 không thay cho gate T3 thành công.

Để kiểm trọn luồng sau nhận, ưu tiên sửa K1 trên chính PO/SO này. Nếu Nextwaves/Buymed không thể sửa đơn hiện tại, tạo một SO staging khác giao cửa hàng 2222, có GR và PO Nextwaves cùng SO, hàng gắn thẻ theo đơn vị được Nextwaves hỗ trợ; chạy lại T1 cho cặp mới trước T3. Không chọn PO chỉ bằng dấu vân tay sản phẩm.

**Gate T3:** sau một lượt “Xác nhận nhận hàng” thành công do operator thực hiện/cấp phép riêng, lấy Copy response đã bỏ credential của `receive-scan` **2xx**, `GET purchase-orders/<id>`, `GET inter-tenant-shipments/<id>`, và `GET …/receiving` sau nhận. Đối chiếu UID/EPC đã nhận, sản phẩm, lô, lượng, biên nhận mới và trạng thái của đúng PO/GR; nếu response khác mô hình hiện tại, ghi mẫu thật rồi dev sửa parser/test theo dữ liệu, PM audit lại. Chưa cấp phép điền GR trong popup ở T3.

**Gate W1 và merge:** chỉ sau T3 được PM chấp nhận, operator chọn một GR staging và cấp phép một lần cho kế hoạch điền cụ thể; kiểm request/response PUT detail và GET GR trước/sau. Dược sĩ vẫn là người bấm HOÀN THÀNH. Chưa merge mã ghi vào `main` trước gate này.

PM không gọi API ghi và không sửa `src/`, `tests/`, `scripts/` hoặc `samples/` trong audit này.
