# PM audit v0.2.3 — F3/F4 và gate cài kiểm G3a

Ngày 27/10/2026. Căn cứ: `docs/dev/BATCH-v0.2.3.md`, diff `3218cae..f76cbcc` trên `batch/v0.2-rfid`, source runtime `247386f`, gói `dist/circa-gr-nextwaves-v0.2.3.zip` và bản giải nén `C:\circa-gr-nextwaves-v0.2.3`.

## Kết luận

- **F3/F4 đạt gate source, gói và Edge dựng trang.** Không thấy finding P1/P2 mới trong phần thay đổi. PM cho phép **cài v0.2.3 để kiểm G3a chỉ đọc trên Chrome staging**. Đây chưa phải duyệt merge hay vận hành nhận/điền hàng.
- **G3a trên trang thật chưa đạt toàn bộ.** Ở 1095×756, Edge dựng trang có dòng 71px ngay từ trước bấm vì CSS tối thiểu, nên phép so trước/sau đạt nhưng không thay thế mốc 57px của POS thật. Cần kiểm nút/bảng và thông báo trên Chrome staging sau cài.
- **P2 khung phiếu che `SL nhận`:** PM **chưa duyệt phương án (a) tự thu nhỏ mặc định**, vì có thể giấu cảnh báo hoặc nút dược sĩ cần bấm. Phương án (c) hướng dẫn thu nhỏ thủ công được dùng tạm khi cần thao tác bảng, nhưng không đóng P2. Dev tách đề xuất UI cho trang phiếu thành batch riêng trước gate vận hành W1/production, chứng minh cả nút trên trang lẫn trạng thái/cảnh báo trong khung đều dễ thấy. Với lượt G3a chỉ đọc, không thao tác số lượng.

## PM đã kiểm độc lập

| Mục | Kết quả |
|---|---|
| Diff runtime | Chỉ `src/pos/pos-content.js`, `src/pos/gr-list.js`, `src/manifest.json`; `background.js`, Nextwaves, logic ghi/cấp phép không đổi. `package.json` và manifest đều 0.2.3. `git diff --check` sạch. |
| F3 source | `renderList()` dùng nhãn ngắn theo phiên; `gr-list.js` giữ nút 24px, chặn bề rộng 150px và đồng bộ `kind`/`title`/`aria-label` kể cả `received → applied` cùng nhãn. |
| F4 source | Trên danh sách, busy/success không gọi khung nổi; huỷ/lỗi/không liên kết dùng `L.notice()` với `textContent`, `role`, nút đóng; vùng thuộc luồng trang, dọn khi bấm lại/rời route. Khung trang GR và Nextwaves không đổi. |
| `npm test` | PM chạy từ checkout `f76cbcc`: **135/135**, 0 fail, một lượt. |
| Gói | SHA-256 PM đo: `40236D67A5A4135B3D9B37683167A81667F668A08CBC29DF4F0472076DA5D96C`; **19/19** file trong ZIP khớp source `f76cbcc` và bản giải nén, không file thừa. |
| Edge trên bản giải nén | PM chạy `node scripts/edge-check.js C:\circa-gr-nextwaves-v0.2.3`: **41/41**, 0 fail, một lượt. 1095/1366/1440 trước và sau bấm không dàn lại trên cùng trang; thông báo lỗi không phủ 29 điều khiển; rời/quay lại không giữ thông báo; một phiên/một tab; quét tối đa 1,2 ms tính cả lấy dòng; mọi tác vụ extension đạt ngưỡng <50 ms. |

**Dev tự báo, PM chưa chạy lại:** 135/135 thêm hai lượt, 102/102 đột biến Node, 9/9 đột biến Edge DOM, đối chứng v0.2.2 hỏng 7/41. Bốn ảnh Chrome thật trước đó xác nhận riêng F3/F4 của v0.2.2; chúng không chứng minh v0.2.3 đã sửa trên trang thật.

## Lượt G3a chỉ đọc sau khi cài

1. Trước khi thay bản cài, kiểm không có phiên đang ở khoảng **Nextwaves đã nhận → POS chưa điền xong** và không có lượt ghi đang chạy. Chỉ bật một bản extension; chọn Staging, không cấp phép điền. Nếu bản mới có extension ID khác, phiên cũ không tự chuyển sang; ghi rõ trường hợp này trong kết quả.
2. Trên danh sách POS ở viewport khoảng **1095×756**, kiểm trước/sau một lượt bấm bắt đầu trên GR phù hợp chưa có phiên: dòng vẫn 57px, tiêu đề không xuống dòng, nút đổi đúng `Mở Nextwaves`, POS ở lại danh sách, không có khung nổi che phân trang. Nếu không có GR phù hợp chưa có phiên, kiểm trạng thái hiện có và báo giới hạn; không huỷ phiên hay tạo đơn mới chỉ để lấy ảnh.
3. Trên tab Nextwaves vừa mở, cuộn tới cuối màn quét: kiểm **khung mở rộng và nút “Xác nhận nhận hàng” cùng nhìn thấy, không chồng nhau**. Một ảnh có cả hai hoặc dev/PM quan sát trực tiếp kèm kích thước/trạng thái là đủ; không yêu cầu ảnh khung thu nhỏ. **Không bấm xác nhận.**
4. Ghi số tab Nextwaves do extension mở, popup có đúng một phiên GR đã chọn, version **0.2.3**. Nếu có cảnh báo “Danh sách đã đổi — bấm lại”, kiểm nó nằm trong luồng trang và nút/phân trang vẫn dùng được; không chủ động gây lỗi trên staging để lấy cảnh báo.

Dev ưu tiên tự quan sát chỉ đọc khi truy cập được. Nếu không, operator chỉ cần chuyển các kết quả trên theo cùng một lượt. G3a đạt mới xem quyết định merge; G3b nhận hàng, W1 ghi GR và production vẫn có gate/phép riêng.
