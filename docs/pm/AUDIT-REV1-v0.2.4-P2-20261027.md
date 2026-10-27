# PM audit rev 1 — v0.2.4 P2 `a8d49a1` / gói `95BECDEA`

Ngày 27/10/2026. PM kiểm diff `b227585..a8d49a1`, source `src/ui/panel.js` và `src/pos/pos-content.js`, test tái hiện, mẫu DOM trang GR đã làm sạch, ZIP và bản giải nén. **Chưa duyệt cài/merge v0.2.4.** Đây là review trên mã hiện có; bộ đột biến đầy đủ còn chạy, và v0.2.4 chưa hiện trên Chrome staging thật.

## Phần đã xác nhận

- SHA-256 gói: `95BECDEAF4F32A170B2A4A1ECF41C76CCEA99A1180D25DF360023E9243304CC9`. PM đối chiếu **19/19** entry ZIP với source `a8d49a1` và `C:\circa-gr-nextwaves-v0.2.4`: không khác byte. `git diff --check b227585 a8d49a1` sạch.
- `anchoredFor()` nay gọi lại `find(code)` đồng bộ; observer cũng dùng điều kiện mới. Test Edge của dev đổi **cả breadcrumb và thẻ thông tin** trong cùng tác vụ trước khi bấm, gói cũ ghi 5 PUT trong trình duyệt giả, gói mới 0 PUT. Đây là đối chứng mô phỏng bằng server giả, **không phải 5 PUT trên POS thật**.
- `viewSig()` nay gồm `lines` và bảng; trường hợp cảnh báo đổi nội dung khi thu nhỏ có test Node/Edge. Finding P2 cảnh báo được đóng ở mức source/test dev giao, chờ bộ kiểm cuối.
- Router đã chặn khung trên `gr_list` và trang không nhận diện. Test dev phủ kết quả cũ sau khi rời sang danh sách/bán hàng, và đổi sang GR khác.
- Dev báo Node **154/154 × 3**, Edge trang GR **90/90**, Edge tổng **42/42** trên bản giải nén, 8/8 đột biến mới. PM chưa chạy test nặng song song với 122 ca Node + 23 ca Edge đang chạy; chưa tính các bộ này là gate đạt.

## Hai ca còn hở trước gate nguồn/gói

### P1 — thẻ thông tin đã là GR khác, breadcrumb vẫn là GR cũ

`grAnchor(code)` trong `src/pos/pos-content.js` duyệt **mọi sibling đứng trước** `#all-receipt` và trả anchor nếu **bất kỳ** sibling có `textContent.includes(code)`. Mẫu DOM trang thật đã làm sạch có **hai sibling đều chứa mã GR**: thẻ thông tin ngay trước bảng và breadcrumb phía trước. `valid()` trong `panel.js` gọi lại `grAnchor(code)`, nhưng vẫn nhận anchor nếu thẻ thông tin đã đổi sang GR B mà breadcrumb còn GR A. Nếu URL vẫn là A, `onGrPageOf(A)` cũng đúng; guard trước `session:claimApply` có thể thông qua. Test hiện tại đổi đồng thời cả hai chỗ nên không bắt tình huống cập nhật không đồng bộ này.

**Yêu cầu dev:** test Edge cùng tác vụ chỉ đổi mã trên **thẻ thông tin phiếu** A → B, giữ breadcrumb A, giữ `#all-receipt` và URL A, rồi bấm Điền trước observer; kỳ vọng **0 claim, 0 PUT, cấp phép còn nguyên**. Test đối xứng breadcrumb B nhưng thẻ thông tin A để xác định nguồn mã chuẩn. Chọn một trường mã phiếu chuẩn ở thẻ thông tin và yêu cầu nó **khớp chính xác** mã trong view và URL; breadcrumb có thể là tín hiệu phụ nhưng không được tự mình mở khoá W1. Khi không rõ DOM nào là phiếu đang hiển thị thì fail closed. Thêm test Node cho `grAnchor` với hai sibling bất đồng. Không nới parser theo dữ liệu dựng để lấy test xanh.

### P2 — đang điền, rời GR A sang trang SO B khác

`onRoute()` giữ panel khi `applying === true` rồi gọi `refresh()`. `evaluate()` gán `evalHref = location.href` của trang SO B trước khi thoát vì `applying`. Khi callback W1 cũ gọi `showGr(A)`, `showGr` chỉ chặn **GR khác**; trang SO B đi vào `panel.show`, qua điều kiện `evalHref` và được vẽ thành **khung nổi của A trên SO B**. Test dev đã phủ chuyển sang danh sách (router chặn) nhưng chưa phủ SO khác (router cho mọi trang `kind === "so"`). Việc ghi vẫn nhắm GR A, nhưng thông báo trên SO B là sai ngữ cảnh và có thể khiến operator hiểu nhầm.

**Yêu cầu dev:** giữ một PUT của A đang chờ, chuyển SPA sang `/chi-tiet-so/<SO khác>` và để `onRoute`/`refresh` chạy, sau đó thả PUT/progress/final: **0 khung hoặc nút của A trên SO B**, 0 ghi thêm do UI của B, quyền/lease và tiến trình của A được xử lý đúng hợp đồng hiện hành. Nếu cho hiện view trên `/chi-tiet-so`, phải xác minh SO hiện tại đúng `soBase` của phiên tạo view; không cho mọi SO đi qua. Kiểm thêm kết quả `evaluateSo` cũ về sau một lần đổi SO A → B.

## Gate tiếp theo

Dev sửa hai ca trên, giao diff/test tái hiện trên bản cũ và đạt trên bản mới, ZIP/SHA mới, kết quả 122 Node/23 Edge (hoặc bộ cập nhật tương ứng) trên **source cuối**. Gói `95BECDEA` chưa giao cài; kết quả đột biến đang chạy trên `a8d49a1` chỉ có giá trị cho commit đó. Sau audit source/gói/Edge, PM mới quyết lượt kiểm UI v0.2.4 trên staging thật. A1 trên v0.2.3 vẫn là việc riêng, cần operator xác nhận đúng 15 tem vật lý và cho phép đúng một lượt GR03887; không đổi extension giữa nhận và hoàn tất. Production Florita vẫn theo gate O1/QR/reader/T1-PRD/W1-PRD đã ghi ở `state.md`.
