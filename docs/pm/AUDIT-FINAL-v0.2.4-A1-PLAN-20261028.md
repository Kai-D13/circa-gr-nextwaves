# PM audit cuối — v0.2.4 / gói 0BB73E2D và thứ tự A1

Ngày 28/10/2026. Project `circa-gr-nextwaves`. Bản audit này thay kết luận **chưa duyệt cài** của `AUDIT-REV1-v0.2.4-P2-20261027.md` đối với đúng runtime `28d1f9c` / gói dưới đây. Không cấp phép thay operator cho bất kỳ lệnh ghi staging hay production nào.

## 1. Kết luận

**ĐẠT gate source/gói để cài thử có giám sát trên staging.** Hai finding rev 1 đã được sửa và có đối chứng lỗi trên mã cũ. **Chưa đạt “staging done”, chưa merge nhánh `batch/v0.2-rfid`, chưa GO production.** Chọn thực hiện A1 **thẳng trên v0.2.4** để một lượt GR03887 kiểm cả luồng nhận/điền/hoàn tất và khung trang phiếu thật. Điều kiện trước lượt ở §3 phải hoàn tất; nếu không thì giữ A1 chưa chạy, không tự quay sang phương án v0.2.3 mà thiếu quyết định mới.

Gói: `C:\Users\Administrator\AppData\Local\Temp\claude\c--QR-code\bf911b64-411e-4b58-853e-f4468dd36a18\scratchpad\wt-v02\dist\circa-gr-nextwaves-v0.2.4.zip`, SHA-256 `0BB73E2D8297840CD1796D5510BB5350302A6212FCF8386B16E9A66188C03D57`. Runtime commit `28d1f9c`; đầu nhánh `c08f709` chỉ bổ sung test/script. Bản giải nén `C:\circa-gr-nextwaves-v0.2.4`.

## 2. Bằng chứng và giới hạn audit

| Nguồn | Kết quả |
|---|---|
| PM tự kiểm | SHA-256 gói đúng; 19/19 entry ZIP khớp `src/` của `c08f709` từng byte; 19/19 file bản giải nén khớp source; `git diff --check f76cbcc c08f709` sạch. PM chạy lại `npm test` **160/160**, trong đó 61/61 test tập trung panel/route/guard đã chạy riêng. |
| Dev log cuối | Node 160/160 × 3. Edge trên gói giải nén: trang phiếu 94/94 × 2, kiểm tổng 42/42 × 2. Edge mutation 25/25 bị bắt. Node mutation 128/130 trên `28d1f9c`, sau đó hai ca còn lại bị bắt 2/2 bằng test thêm ở `c08f709`; runtime/ZIP không đổi. Đây là **kết quả gộp 128+2**, không phải một lượt chạy lại toàn bộ 130 trên đầu nhánh. |
| Đối chứng | Gói v0.2.3 đạt 40/91 trong cùng bài kiểm trang phiếu, tức **51 mục hỏng**; có ca khung nổi che ô lô, `−`, ô số, `+` tại 1095px. Các PUT khi test Edge ghi vào server giả, không ghi POS thật. |
| Hiệu năng | Hai lượt Edge trên gói đo tác vụ extension dài nhất lần lượt **9,75 ms** và **5,19 ms**; cả hai dưới 50 ms. Không gọi 5,2 ms là mức tối đa của mọi lượt. Chưa đo Chrome staging thật. |

Về logic: `grPageAnchor` dùng mã GR chính xác ở thẻ thông tin ngay trước `#all-receipt`, và breadcrumb khác mã thì chặn. `anchoredFor` đọc lại DOM đồng bộ trước khi giành quyền ghi. Đổi route gỡ khung cũ; view GR A không hiện trên SO/GR B. Thiếu anchor thì không có nút Điền và không phát PUT. Điều này đóng hai finding rev 1 ở mức mã/test; phần DOM thực tế còn phải qua A1.

## 3. Điều kiện bắt buộc trước A1 trên v0.2.4

1. Dev sửa **chính runbook** `docs/dev/RUNBOOK-A1-GR03887-20261027.md`: version/gói/hash thành v0.2.4/0BB73E2D; chép gói từ thư mục scratchpad tạm sang chỗ giao operator ổn định và kiểm lại SHA-256. Thêm cài **trước chặng nhận** và giữ cùng extension ID/profile. Không dùng thư mục giải nén phiên bản mới làm extension thứ hai: đổi đường dẫn Load unpacked có thể đổi ID và làm mất phiên `nw_ready` đang có. Nâng trong **cùng thư mục đang được extension tải từ**, giữ bản sao thư mục cũ để đối chiếu. Reload rồi F5 các tab cần thiết; kiểm lại version, ID, STG cửa hàng 2222, phiên GR03887 `nw_ready`, quyền điền trống, đúng GR/PO/SO/kho/trạng thái. Mất phiên hoặc ID đổi thì **dừng trước khi nhận**.
2. Trên **trang GR thật** ở cỡ gần 1095px, kiểm chỉ đọc: đúng một khung ngay trước vùng sản phẩm của GR03887; cột lô, `−`, ô SL nhận, `+`, HỦY, HOÀN THÀNH và nút trong khung đều thấy và nhận tương tác kiểm tra an toàn. Không bấm nút làm đổi phiếu khi kiểm UI. Nếu anchor thiếu, khung sai phiếu, che điều khiển hoặc nút Điền xuất hiện ở khung nổi lỗi → dừng A1, báo PM/dev.
3. Operator xác nhận có **đúng 15 tem vật lý** theo năm dòng của runbook và **cho phép riêng một lượt** GR03887 / PO13806459 / SOBD1594095-F. PM không suy phép này từ việc duyệt ZIP. Dev/operator đọc lại trạng thái và EPC ngay trước lượt; sai dữ liệu thì dừng.
4. Bật và kiểm capture trên **cả tab POS và Nextwaves trước khi nhận** bằng một GET mới cùng giờ; giữ POS capture tới GET sau HOÀN THÀNH. File gốc có credential ở lại máy, chỉ chuyển dữ liệu đã làm sạch. Không cài, reload hay đổi extension trong ba chặng A1.

## 4. A1: ba chặng và điểm dừng

- **Nhận:** reader thấy đủ 15/15 đúng theo năm dòng, ngoài phiếu 0; dược sĩ xác nhận nhận **một lần**. Kiểm 2xx, biên nhận mới và GET PO/phiếu gửi sau nhận. Thiếu, 400, kết quả không rõ hay sai UID → dừng, không thử lại.
- **Điền:** POS tự về đúng GR03887. Kế hoạch phải có **5 bước**, 15 UID đúng lô/đơn vị/số lượng, không blocked. Chỉ lúc đó operator cấp phép một lần trong popup và bấm Điền một lần. PUT từng bước, GET phiếu sau ghi phải khớp; ghi một phần hoặc mất phiên → dừng. Đường nhập tay do operator quyết sau khi xác minh đơn vị/lô/số lượng, không làm A1 đạt.
- **Hoàn tất:** dược sĩ kiểm GR đã điền đúng rồi tự bấm HOÀN THÀNH. Kiểm response và GET `COMPLETED`. Mã QR POS tự thêm sau bước này chỉ ghi nhận để nghiên cứu, không coi là UID Nextwaves.

A1 đạt khi đủ cả ba chặng và bằng chứng: request/status nhận, GET sau nhận, kế hoạch, từng PUT/GET GR, ảnh UI thật 1095px, trạng thái cuối, log phiên xuất trước TTL. Thiếu body `receive-scan` thì báo đúng giới hạn; không tuyên bố đã thấy body. Nếu dừng bất kỳ chặng nào, giữ hiện trạng, không tự chạy lại hoặc tự sửa số liệu.

## 5. Việc sau A1 và đường tới production

| Thứ tự | Dev / PM / operator | Gate |
|---|---|---|
| Song song, **chỉ đọc** | Dev bắt đầu Đợt 2: O1 tìm lại PO/phiếu gửi/biên nhận sau khi đã nhận và mất phiên; dùng khoá bất biến, phân biệt nhiều PO/GR, không suy từ một GET `/receiving` trả `total 0`. Tra đối chứng một QR POS thêm sau HOÀN THÀNH với UID Nextwaves, ghi rõ sản phẩm/lô/đơn vị và ảnh hưởng tồn. Khảo sát xung đột reader với extension bán hàng ở Florita. | Spec + mẫu đã làm sạch + test fail closed; không gọi API ghi Nextwaves/POS. |
| Sau A1 | Dev báo cáo bằng chứng từng chặng và kết quả UI. PM audit A1 và P2 trên trang thật. | Đủ mới chốt **staging done** và cho merge `batch/v0.2-rfid` → `main`; ngày 30/10 là mục tiêu có điều kiện. |
| Trước production | Chốt O1: khôi phục được chứng minh hoặc fail closed + quy trình nhập tay được stakeholder chấp nhận. Operator chốt ý nghĩa QR sau HOÀN THÀNH; dev trình spec riêng, gói/test riêng; T1-PRD chỉ đọc trước. | Production tiếp tục **chỉ đọc** cho tới PM audit và operator cho phép W1-PRD từng GR cụ thể. Không tự bật ghi theo ngày lịch. |

## 6. Điểm cần sửa trong hồ sơ, không đổi runtime

- `state.md` đang mở bằng trạng thái rev 1 (`95BECDEA`) dù main đã có báo cáo cuối; cập nhật con trỏ hiện hành sang `c08f709`/gói `0BB73E2D` và dẫn tới audit này.
- Báo cáo dev nên ghi rõ số tác vụ dài nhất của **hai lượt** là 9,75 / 5,19 ms; mutation Node 130/130 là 128+2 trên cùng runtime với test mới. Không cần đóng ZIP lại chỉ vì chỉnh tài liệu.
