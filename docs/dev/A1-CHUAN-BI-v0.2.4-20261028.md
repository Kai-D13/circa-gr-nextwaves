# Chuẩn bị A1 trên v0.2.4 — gói giao, diễn tập nâng cùng Extension ID, kiểm khung (28/10/2026)

**Căn cứ:** `docs/pm/AUDIT-POST-REVERT-v0.2.4-20261028.md` bước 1 (dev chuẩn bị, chưa đổi extension thật).

**Runtime không đổi:** gói `0BB73E2D` (`28d1f9c`). Nhánh `batch/v0.2-rfid` thêm `b90f6be` (đã push), chỉ script kiểm / công cụ giao, `src/` không đổi.

**Runbook đã sửa:** `docs/dev/RUNBOOK-A1-GR03887-20261027.md`, thêm §0 (nâng, kiểm sau nâng, khung trang thật) trước chặng nhận.

## 1. Gói giao ổn định

Thư mục `C:\circa-gr-nextwaves-release\` (ngoài thư mục tạm). SHA-256 ghi trong `SHA256SUMS.txt` cùng thư mục.

| File | SHA-256 | Ghi chú |
|---|---|---|
| `v0.2.4\circa-gr-nextwaves-v0.2.4.zip` | `0BB73E2D8297840CD1796D5510BB5350302A6212FCF8386B16E9A66188C03D57` | chép từ `dist/` của worktree, kiểm lại hash: khớp |
| `v0.2.3\circa-gr-nextwaves-v0.2.3.zip` | `40236D67A5A4135B3D9B37683167A81667F668A08CBC29DF4F0472076DA5D96C` | để script đối chiếu bản đang tải |
| `nang-cap-v0.2.4.ps1` | `7792BFE120E04E247651A9ED71BB779206022DFCBF092ED6C97C44B54E37761C` | = `scripts/nang-cap-v0.2.4.ps1` @ `b90f6be`. Bản giao UTF-8 có BOM + CRLF (PowerShell 5.1 cần BOM để đọc đúng chữ Việt); git lưu LF. Bỏ CR thì trùng từng byte |
| `preflight-gr-page.js` | `34728A65B26787BB2707ECA24A9D75EF72EF0BAB27576B18802EF608FD4BF6B4` | = `scripts/preflight-gr-page.js` @ `b90f6be`, trùng từng byte |
| `v0.2.4\*.diff`, `*.stat.txt` | trong `SHA256SUMS.txt` | DIFF so v0.2.3 / phần sửa từng audit |

**Thư mục đang tải trên máy.** `nang-cap-v0.2.4.ps1 -Check` (chỉ đọc) trên `C:\circa-gr-nextwaves-v0.2.3`: khớp từng byte gói v0.2.3 `40236D67`, 19 file.

Chưa xác nhận Chrome của operator đang tải đúng thư mục này. Bằng chứng hiện có là hướng dẫn G3a và kết quả G3a 27/10. Operator đọc dòng "Tải từ" ở runbook §0b bước 1.

## 2. Script nâng `nang-cap-v0.2.4.ps1`

Script không đụng Chrome, không gọi mạng. Các bước:
1. Kiểm SHA-256 hai gói.
2. Kiểm thư mục đích **khớp từng byte** v0.2.3 (19 file, không thừa / thiếu). Khác → dừng, không đổi gì.
3. Sao lưu thư mục đích sang `backup\v0.2.3-dang-tai-<giờ>`, đối chiếu bản sao.
4. Chép đè 19 file v0.2.4 (cùng danh sách file với v0.2.3).
5. Đối chiếu đích khớp từng byte v0.2.4.

Lỗi giữa bước 4–5 → chép trả v0.2.3 từ bản sao lưu, chỉ những file đã đổi. `-Check` chỉ chạy bước 1–2. Chạy lại trên thư mục đã là v0.2.4 → báo và không chép.

**Lỗi tìm ra khi diễn tập, đã sửa trước khi giao:**
- Bản nháp đầu không tạo thư mục con (`lib\`, `pos\`…) trong bản sao lưu nên dừng ở bước 3 với lỗi thô của PowerShell. Thư mục đích không bị đổi.
- Nay script tạo thư mục con, bắt mọi lỗi thành dòng "DỪNG: …", và tự chép trả khi lỗi giữa lúc chép (ca A5).

## 3. Diễn tập trên hồ sơ thử — `scripts/edge-upgrade-v024.js`

Edge thật, hồ sơ tạm, thư mục tạm, chạy **chính** script giao operator. Phiên `nw_ready` schema 1 cùng hình phiên GR03887 (mã giả), cấu hình STG, thêm một phiên không schema.

Chạy 4 lượt:
- lượt 1 lộ lỗi bản nháp script (§2, đã sửa);
- lượt 2–4: **17/17 đạt**;
- lượt 4 chạy với bộ dọn tiến trình mới (§5): 0 Edge sót sau lượt.

| Ca | Kết quả |
|---|---|
| A1 `-Check` trên thư mục v0.2.3 | thoát 0, không đổi file, không sao lưu |
| A2 lệch một file / A3 thừa một file | thoát 1, nêu đúng file (`khác popup/popup.js`, `thừa ghi-chu.txt`), không chép, không sao lưu |
| A4 gói v0.2.4 sai SHA-256 | thoát 1, thư mục giữ v0.2.3 |
| A5 `ui/panel.js` đích bị khoá ghi giữa lúc chép | thoát 1, chép trả v0.2.3, thư mục như trước, một bản sao lưu |
| B1–B4 | nạp v0.2.3; script nâng: thư mục = v0.2.4 từng byte, bản sao lưu = v0.2.3; trước Reload extension vẫn chạy 0.2.3 |
| B5 Reload | v0.2.4, **cùng extension ID** |
| B6 | `lastUpgrade` reason `update`, 0.2.3 → 0.2.4, `removedSessions` chỉ phiên không schema, `removedGrants` 0 — chứng minh `onInstalled` đã chạy thật |
| B7–B8 | phiên GR03887 `nw_ready` **nguyên từng trường** (kể cả `updatedAt`), không còn phiên khác; cấu hình STG giữ, 0 cấp phép |
| B9–B10 | background v0.2.4 trả phiên qua `session:get`; popup "GR ← Nextwaves v0.2.4" hiện phiên "Đã khớp đơn Nextwaves" → PO13806459, cấp phép trống |
| B11–B12 | chạy lại script: "đã là v0.2.4", không chép / không sao lưu thêm; phiên vẫn nguyên |

**Giới hạn:**
- Hồ sơ thử, phiên mã giả, không mở trang POS / Nextwaves thật.
- Reload bằng `chrome.runtime.reload()`. Nút Reload trên thẻ cùng nạp lại thư mục và cùng phát `onInstalled` "update", nhưng chưa bấm nút thật trên Chrome của operator.

## 4. Đoạn kiểm khung trên trang thật — `scripts/preflight-gr-page.js`

Operator dán vào Console tab POS ở runbook §0d.
- Chỉ cuộn và hỏi `elementFromPoint` điểm giữa mọi nút / ô của `#all-receipt` + HỦY / HOÀN THÀNH.
- Trả một dòng JSON: số khung, trong luồng, ngay trước bảng, `position`, mã phiếu trên thẻ thông tin, phần tử bị che.

`edge-gr-page.js` thêm mục 95 chạy đúng đoạn này trên trang thật dựng lại ở 1095×756 trạng thái `nw_ready`.

| Gói | `KET_QUA` | Chi tiết |
|---|---|---|
| v0.2.4 `0BB73E2D` (5 lượt) | **ĐẠT** | `vw` 1095, `khung` 1, `trongLuong` 1, `ngayTruocBangSanPham` true, `position` static, mã ["GR03880"], 52 điều khiển, HỦY + HOÀN THÀNH, `biChe` [] |
| v0.2.3 `40236D67` (đối chứng) | **XEM LẠI** | `trongLuong` 0, `ngayTruocBangSanPham` false — khung nổi của bản cũ bị nhận ra |

Trên trang thật dựng lại, mã phiếu là GR03880. Bộ kiểm thay `WANT` trong đoạn kiểm thành GR03880; bản giao operator giữ GR03887.

## 5. Phát hiện phụ: bộ kiểm Edge nối nhầm trình duyệt còn sót

- Lượt 10:53 28/10: đối chứng v0.2.3 báo **95/95 đạt** với service worker **version 0.2.4**. Bộ kiểm đã nối qua cổng 9341 vào Edge còn sống của lượt v0.2.4 ngay trước. Sau `proc.kill()` vẫn còn hai Edge hồ sơ `cgn-edge-gr-*`.
- Edge trên máy tự cập nhật lên 156.0.4314.50 lúc 06:55 28/10. Sau các lượt 27/10 dev đã kiểm và không thấy Edge sót, nên chưa rõ nguyên nhân là bản Edge mới hay cách tắt.
- Lượt đó bị loại.
- **Sửa (chỉ script kiểm):** `scripts/edge-proc.js`
  - tắt mọi tiến trình Edge / Chrome có hồ sơ tạm của lượt;
  - từ chối chạy khi cổng CDP còn trình duyệt khác.

  Áp cho `edge-gr-page.js`, `edge-check.js`, `edge-upgrade-v024.js`. Mỗi lượt dưới đây ghi số Edge còn sót sau khi xong.
- **Ảnh hưởng tới số cũ:**
  - Các lượt gói bị chặn và đối chứng v0.2.3 hôm 27/10 hỏng đúng mục của chính bản đó, nên đã chạy trên đúng bản.
  - Không chứng minh lại được lượt thứ hai "94/94 × 2" hôm 27/10 có chạy trên Edge riêng hay không. Thay bằng các lượt hôm nay ở §6.
  - Đột biến Edge 25/25 hôm 27/10: sau lượt đã kiểm không còn Edge / node sót. Chưa chạy lại.

## 6. Kiểm lại hôm nay với bộ kiểm đã sửa

Edge 156.0.4314.50, máy dev, cùng buổi 28/10. Kết quả gốc ở scratchpad `final-a1prep2*.txt`.

| Lượt | Kết quả | Tác vụ extension dài nhất | Edge sót sau lượt |
|---|---|---|---|
| `edge-upgrade-v024.js` | **17/17** | — | 0 |
| `edge-gr-page.js` gói v0.2.4 `C:\circa-gr-nextwaves-v0.2.4` × 5 | **95/95 × 5** | 16,62 / 14,32 / 16,46 / 15,14 / 14,36 ms — đều ở `pos/pos-content.js`; 3 lượt sau có log chi tiết: đều là lúc nạp script | 0 |
| `edge-gr-page.js` đối chứng v0.2.3 `C:\circa-gr-nextwaves-v0.2.3` | **hỏng 52/92**: gồm "điều khiển SL nhận bấm được" (khung nổi phủ ô lô, −, +, "+ Thêm lot-date", "In tem…") và đoạn preflight XEM LẠI | 24,02 ms | 0 |
| `edge-check.js` gói v0.2.4 | **42/42** | danh sách 3,36 ms; trang bán hàng 1,06 ms | 0 |
| `npm test` trên đầu nhánh | **160/160** | — | — |

**Một lượt bị loại vượt ngưỡng hiệu năng — không bỏ khỏi báo cáo.**
- Lượt 10:53, trước khi sửa bộ dọn tiến trình, chạy trên Edge của chính lượt đó (không có Edge khác chen): **94/95**.
- Mục hỏng là trace: tác vụ dài nhất **75,18 ms** ở `ui/panel.js`, không tên hàm. Chưa có log chi tiết nên không rõ là lúc nạp script hay một hàm.
- Năm lượt sau ≤ 16,62 ms, hai lượt 27/10 là 9,75 / 5,19 ms.
- Đây là lượt trang phiếu đầu tiên sau khi Edge tự cập nhật; nguyên nhân chưa rõ, chưa tái hiện lại.
- Trên Chrome staging thật chưa đo.

## 7. Việc PM / operator

1. **PM kiểm runbook bản cập nhật** (§0 mới) và kết quả diễn tập ở trên.
2. **Hạn 24 giờ của phiên GR03887:**
   - phiên cập nhật lần cuối 20:24:25 27/10; từ ~20:24 28/10 có thể bị xoá ở lần ghi phiên kế tiếp;
   - runbook đặt §0b–§0d **trước 20:00 28/10**;
   - bấm "Mở tab Nextwaves" (§0d bước 4) ghi lại giờ phiên. Đây là thao tác UI chỉ mở / chuyển tab, không ghi POS / Nextwaves;
   - PM xác nhận dùng nút này để giữ phiên là chấp nhận được. Nếu phiên đã mất thì vẫn dừng như PM quyết, không tạo lại.
3. Operator nâng thật + kiểm sau nâng + khung trang thật theo §0b–§0d, gửi một bộ bằng chứng. Dev chuyển PM xác nhận UI.
   - Runbook chặng 1 thêm một dòng: máy có extension bán hàng (Circa QR Scan Log) thì đóng mọi tab POS production trước khi kết nối reader.
   - Căn cứ là mã `circa-qr-scan-log/rfid-content.js` (chỉ đọc). Extension đó tự mở cổng Web Serial khi tab bán hàng có đơn và đang hiển thị (`canAutoClaim`, `tryAutoConnect`), kể cả khi cắm lại reader. Nó chỉ chạy trên `pos.v2.circa.vn` / `pos.dev…`, không chạy trên POS staging.
   - Đây là suy luận, chưa thử trên máy. Thuộc phần reader của Đợt 2.
4. Sau đó operator xác nhận đúng 15 tem và cho phép riêng một lượt GR03887.
5. **Đợt 2** (O1 / QR / reader, chỉ đọc): **chưa bắt đầu**. Agent khảo sát nền bị dừng giữa chừng, không có kết quả. Dev làm sau khi giao bộ chuẩn bị A1 này.
