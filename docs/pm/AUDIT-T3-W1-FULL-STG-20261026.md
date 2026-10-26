# PM audit T3, W1 và HOÀN THÀNH trên staging — v0.1.5

Ngày 26/10/2026. Phạm vi: `docs/dev/T3-KET-QUA-PO28237814-20261025.md` (`afd98d5`) và `docs/dev/FULL-KET-QUA-GR03880-20261026.md` (`25082b2`, `7eadfe3`, `fa66de6`) trên `batch/v0.1-staging`; runtime v0.1.5 tại `456205a`, gói `CDD02C3D`. **Quyết định: T3 và W1 đạt gate staging; chấp nhận merge nhánh mã staging vào `main`. Production tiếp tục chỉ đọc. Chưa duyệt ghi production.**

## Bằng chứng PM tự kiểm

| Phạm vi | Kết quả và giới hạn |
|---|---|
| Source/test | `git diff 456205a fa66de6 -- src` rỗng: không đổi runtime sau gói v0.1.5. PM chạy `npm test` tại `fa66de6`: **100 pass, 0 fail, 0 skip**. Test P1.3 từng chạy đua được PM chạy riêng **20/20** lượt đạt trên `7eadfe3`; commit sau chỉ thêm fixture/test, không đổi test này. `git diff --check 456205a fa66de6` sạch. Quét mẫu theo quy tắc bí mật trong `agent.md` không thấy chuỗi credential; `authorization` trong mẫu storage là metadata cấp phép GR/plan, `applyToken` và `lease` đều null. |
| T3 — PO28237814 / GR03878, 25/10 | PM so request và response `receive-scan` trong Net Capture gốc số 000258 với fixture: **trùng dữ liệu JSON**. HTTP 200, 12/12 EPC, không thiếu/lạ; PO sau nhận có 12 `receivedUnits`, một biên nhận mới cùng kho; phiếu gửi sau nhận ghi đủ EPC và chuyển `received`. Parser `buildReceivedUnits` trả 0 vấn đề. K1 đã hết trên **PO này**. Tìm theo SO sau nhận trả `total 0`; `/receiving` chuyển phiếu gửi sang `receipts`. |
| T3 — PO76458756 / GR03880, 26/10 | Mẫu HAR đã lọc lưu request `receive-scan` HTTP 200, `keep_open`, 11 EPC gửi trùng 11 EPC dự kiến và 11 EPC trong kết quả extension; sau đó có GET PO và phiếu gửi HTTP 200. Storage ghi `receive_scan` 200 → `nw_received` 11 UID. **Không có body response Nextwaves của lượt này**; PM không có file HAR gốc để đối chiếu trực tiếp với fixture. |
| W1 — GR03880, 26/10 | PM so **5 body PUT gốc** trong Net Capture POS với fixture: cả 5 trùng dữ liệu JSON. Chuỗi gốc đúng 5 lần `GET → PUT 200 → GET`; sau từng PUT, đúng lô có lượng đích và đúng UID mới. GR trước là `WAITING_TO_RECEIVE`, 0/5 chi tiết; sau điền là `RECEIVING`, 5/5 chi tiết đầy, 11 UID đúng lô. Kế hoạch tính lại từ GR trước, 11 tra QR thật và `nwResult.units` trong nhật ký cho mã **#E33C777A**, khớp 5 PUT. Storage ghi cấp phép GR03880 đã dùng, 5 `apply_done`, `applied`, cấp phép còn lại rỗng. |
| HOÀN THÀNH — GR03880 | Net Capture POS có `PUT …/status/COMPLETED` HTTP 200 do giao diện POS gửi. GET sau đó trả `COMPLETED`, số lượng nhận giữ nguyên. Dược sĩ/operator thực hiện bước này, đúng quyết định nghiệp vụ. |
| Nguồn fixture | PM đối chiếu GET gốc của GR03880 với fixture trước điền, sau điền và sau hoàn thành (bỏ qua trường tên nhân viên đã được thay): đều có bản tương ứng trong capture. Mẫu T3 PO28237814 và W1 GR03880 là dữ liệu traffic thật. |

**Phân ranh bằng chứng:** T3 có request/response Nextwaves gốc cho PO28237814, nhưng W1 của GR03878 chỉ có nhật ký `6 apply_done`, không có traffic PUT. W1/HOÀN THÀNH có traffic POS gốc cho GR03880, còn lượt nhận PO76458756 có request/status đã lọc và nhật ký, thiếu body response. Vì vậy chấp nhận gate T3 và W1 staging trên tổng hợp hai lượt; không gọi GR03880 là lượt có đầy đủ body traffic ba bên. Test `full-real` kiểm kế hoạch và PUT với dữ liệu thật, nhưng `nwResult.units` của GR03880 lấy từ storage, không phải response Nextwaves độc lập.

## Finding và quyết định vận hành

1. **P2 — O1, mất phiên sau Nextwaves nhận nhưng trước khi POS điền.** API tìm đơn đang chờ nhận trả `total 0` sau khi nhận. Nếu người dùng huỷ/xoá phiên, nâng cấp extension hoặc phiên hết 24 giờ, v0.1.5 không thể tự dựng lại chứng cứ ban đầu và dừng an toàn. Chấp nhận cơ chế này cho staging có người giám sát, với đường xử lý tay trên POS khi mất phiên. **Chặn triển khai ghi production** cho tới khi có thiết kế khôi phục đã kiểm thử hoặc stakeholder chấp nhận rõ ràng quy trình nhập tay. Batch khôi phục phải giữ khoá GR–SO–PO/phiếu gửi và ảnh chụp UID dự kiến qua gián đoạn; khi tiếp tục phải đọc lại POS GR, PO Nextwaves, phiếu gửi và biên nhận, kiểm cùng kho/lần giao, rồi lập kế hoạch mới, không tự gửi PUT lặp. Test gián đoạn ngay sau 2xx, trước W1, sau PUT một phần và khi nâng cấp extension.
2. **P1 nghiệp vụ trước production — mã QR xuất hiện sau HOÀN THÀNH.** GET sau hoàn thành có thêm **5 mã khác UID Nextwaves**, một mã cho mỗi chi tiết có `received_quantity=1`; 11 UID Nextwaves vẫn còn và lượng nhận không đổi. Chứng cứ xác định thời điểm xuất hiện giữa GET trước/sau thao tác HOÀN THÀNH, **chưa xác định nguồn và ý nghĩa nghiệp vụ của mã mới**. Không coi đây là lỗi extension hoặc mã trùng cho tới khi tra cứu QR của một mã mới và một UID Nextwaves, rồi operator/stakeholder xác nhận tác động tới tồn kho/bán hàng. `gr_has_foreign_codes` tiếp tục chặn việc điền lại phiếu chứa mã lạ; không nới parser để test xanh.
3. **P3 — đọc QR lặp và định dạng giờ log.** GR03880 tra 11 UID ba vòng (33 GET) khi phiên/cấp phép đổi; không làm sai kế hoạch hay thêm PUT. Có thể tối ưu bằng cache theo phiên sau khi thiết kế hết hạn và kiểm lại dữ liệu; không đổi runtime trong batch audit này. Trường `scan_ok.at` dạng số thay vì chuỗi ISO chỉ ảnh hưởng nhật ký, xử lý cùng batch sau.

## Gate tiếp theo

- Dev có thể đưa `batch/v0.1-staging` tại `fa66de6` vào `main` theo quy trình git, giữ **v0.1.5 / `CDD02C3D`** vì `src/` không đổi. Trước merge kiểm lại diff, test và quét bí mật; không đưa Net Capture gốc hoặc storage chưa lọc vào repo.
- Chỉ triển khai ghi trên **staging cửa hàng 2222**, mỗi GR được operator cấp phép một lần; production vẫn `writeEnabled: false`. Không suy gate production từ HTTP 200 staging.
- Operator/dev ưu tiên tra cứu chỉ đọc một mã xuất hiện sau HOÀN THÀNH và một UID Nextwaves, ghi rõ sản phẩm/đơn vị/lô và tác động bán hàng; giữ PO staging còn lại để kiểm thêm sau khi chốt mục đích lượt thử.
- Nếu sửa runtime cho O1/P3, phát hành version, ZIP và SHA-256 mới; PM audit lại trước lượt ghi tiếp theo của bản mới.

PM không gọi API ghi và không sửa runtime, tests hoặc samples trong audit này.
