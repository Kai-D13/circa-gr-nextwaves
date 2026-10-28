# PM audit cuối sau hoàn tác nhầm — v0.2.4 / gói `0BB73E2D`

Ngày 28/10/2026. Phạm vi: `batch/v0.2-rfid` đầu `c08f709`, runtime `28d1f9c`, báo cáo dev `docs/dev/BATCH-v0.2.4.md` tại `main` `363281f`, gói SHA-256 `0BB73E2D8297840CD1796D5510BB5350302A6212FCF8386B16E9A66188C03D57`.

**Quyết định: ĐẠT gate source/gói; cho chuẩn bị nâng lên v0.2.4 và kiểm chỉ đọc trên staging có giám sát. Chọn A1 trên v0.2.4 sau preflight.** Operator đã xác nhận `805da9a` hoàn tác nhầm commit PM `53219c5`; PM audit lại bằng source, gói và log trong báo cáo này. Quyết định này **không cấp phép** receive/PUT/HOÀN THÀNH GR03887; chưa staging done, chưa merge, chưa production.

## Bằng chứng PM kiểm trực tiếp

- Diff `a8d49a1..28d1f9c`: `grPageAnchor` lấy mã chuẩn chính xác trên thẻ thông tin ngay trước `#all-receipt`; breadcrumb mang mã GR khác thì từ chối. `anchoredFor` gọi lại chỗ gắn đồng bộ ngay trước `session:claimApply`. Trang `/chi-tiet-so` chỉ hiện view GR thuộc danh sách GR đã đọc đủ của **chính URL SO đang xem**; đổi route gỡ khung ngay cả khi đang điền. Hai finding rev 1 được đóng ở source/test.
- `c08f709` chỉ thêm test và sửa script đột biến; không đổi `src/`/ZIP. PM kiểm SHA-256 gói và so **19/19** entry ZIP với source và bản giải nén `C:\circa-gr-nextwaves-v0.2.4`: khớp từng byte. `git diff --check f76cbcc c08f709` sạch.
- PM chạy lại bộ Node trên `c08f709`: **160/160 đạt**. Hai kịch bản rev 1 có test cụ thể: thẻ thông tin/breadcrumb bất đồng trước khi bấm Điền; đang PUT GR A rồi chuyển sang SO khác. Test ghi vào server giả, không gọi POS thật.
- Raw log dev: Edge gói giải nén **94/94 × 2** và Edge tổng **42/42 × 2**; đối chứng v0.2.3 hỏng 51/91, gồm điều khiển `SL nhận` bị khung che ở 1095px. Trace dài nhất **9,75 ms lượt 1; 5,19 ms lượt 2**, đều dưới 50 ms. PM chưa chạy Edge lại; chưa kiểm v0.2.4 trên Chrome staging thật.
- Node mutation: **128/130** trên runtime `28d1f9c`, sau khi thêm test ở `c08f709` chạy lại **2/2** ca còn lại đều bị bắt. Đây là 130 ca duy nhất được đóng trên cùng runtime, **không phải một lượt 130/130 chạy lại** trên đầu nhánh. Edge mutation **25/25**, trong đó ca cố ý bỏ giới hạn gắn khung bị bắt bằng watchdog 360 giây do vòng gắn vô hạn; 24 ca còn lại hỏng theo phép kiểm. Test gốc trên gói đạt, và Node test riêng xác nhận `unstable` dừng sau giới hạn. Dev nên ghi rõ hai giới hạn bằng chứng này trong báo cáo.

## Kế hoạch thực hiện

1. **Dev chuẩn bị, chưa đổi extension thật:** sửa runbook A1 thành v0.2.4/gói `0BB73E2D` và ghi rõ cài **trước** chặng nhận; giao ZIP ở chỗ ổn định, không dùng đường scratchpad; rehearsal nâng cùng thư mục/Extension ID trên profile thử với phiên schema 1 `nw_ready` để xác nhận giữ phiên và cấu hình. Source hiện `SESSION_SCHEMA = 1` ở cả v0.2.3/v0.2.4, `onInstalled` chỉ xoá phiên khác schema, nhưng vẫn phải kiểm hành vi trình duyệt. Báo PM kết quả rehearsal và đúng SHA gói giao. Không bật hai bản extension cùng lúc.
2. **Nâng bản thật và preflight chỉ đọc:** sau khi bước 1 đạt, nâng đúng cùng thư mục/Extension ID của bản v0.2.3, Reload extension rồi tải lại tab POS/Nextwaves. Kiểm cùng Extension ID, version/hash đúng, đúng một bản bật, STG cửa hàng 2222; popup một phiên GR03887 `nw_ready`, không cấp phép điền; POS GR03887/PO00006767 và Nextwaves PO13806459/SOBD1594095-F, 0/15, đúng kho. Ở khoảng 1095px, một khung trong luồng trước bảng sản phẩm, mọi điều khiển `SL nhận`, HỦY/HOÀN THÀNH nhìn thấy và thao tác kiểm an toàn được. Sai bất cứ mục nào thì dừng trước khi đặt tem, không tự nhận hoặc tái tạo phiên. Gửi một bộ bằng chứng preflight cho PM xác nhận UI.
3. **A1 có phép operator riêng:** operator xác nhận đúng 15 tem vật lý và cho phép một lượt GR03887/PO13806459/SOBD1594095-F. Capture POS và Nextwaves phải có GET mới trước lượt; quét đúng 15/15 tem, 0 ngoài phiếu, nhận một lần; đối chiếu kế hoạch 5 bước/15 UID trước khi cấp phép điền; sau PUT kiểm 5 lô và UID; dược sĩ tự HOÀN THÀNH. Sai hoặc kết quả không rõ thì dừng, không retry. Không thay extension giữa ba chặng. PM audit bằng chứng từng chặng sau lượt.
4. **Sau A1:** chỉ khi A1 và UI P2 trên trang thật đạt mới xét staging done và merge `batch/v0.2-rfid` vào `main`. Song song, dev làm discovery **chỉ đọc** cho O1 tìm lại đơn đã nhận, QR POS thêm sau HOÀN THÀNH và reader Florita; giao spec/gate riêng trước production. Mốc 30/10, 4/11, 6/11 là mục tiêu có điều kiện.

## Hồ sơ cần đồng bộ

`docs/dev/BATCH-v0.2.4.md` nên sửa dòng hiệu năng thành hai lượt 9,75/5,19 ms và giải thích 128+2 mutation; không cần dựng lại ZIP vì không đổi runtime. Runbook A1 cần cập nhật và PM kiểm lại bản đã cập nhật trước lượt có tác động thật.
