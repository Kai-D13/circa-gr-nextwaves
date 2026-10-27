# PM audit sơ bộ v0.2.4 P2 và trạng thái lên production

Ngày 27/10/2026. PM đọc bàn giao dev đang chạy, runbook A1 tại `b4cfc67`, diff `f76cbcc..b227585` trên `batch/v0.2-rfid`, source `src/pos/pos-content.js` và `src/ui/panel.js`, gói `E8531EB4`. **Chưa cho cài v0.2.4, chưa merge.** Tại lúc audit, 114 đột biến Node và 21 đột biến Edge còn chạy; `docs/dev/BATCH-v0.2.4.md` cùng tài liệu dev vẫn là file chưa commit trên `main`.

## Tiến độ đã xác nhận

| Phạm vi | Mức bằng chứng và kết quả |
|---|---|
| A1 v0.2.3 | Dev đã sửa đúng hai điểm PM yêu cầu trong runbook: kiểm capture POS/Nextwaves bằng GET trước nhận, và thay hướng dẫn nhập tay theo đơn vị/lô/số lượng 5 chi tiết. **Runbook đạt gate PM để operator xem và quyết một lượt A1**, sau khi xác nhận đúng 15 tem vật lý; chưa có phép operator, chưa nhận/PUT/HOÀN THÀNH GR03887. |
| P2 source | Khung GR mới nằm trong luồng trang trước `#all-receipt`, không sticky sau khi dev đo được `window` mới cuộn thực tế. Có guard không claim W1 khi panel chưa gắn, fallback chỉ báo lỗi không có nút Điền. Sửa race lượt GR cũ về muộn sau khi sang GR khác. Đây là thay đổi thật trong source `b227585`, chưa đủ kết luận source đạt vì finding bên dưới. |
| Gói | PM đo SHA-256 `E8531EB48BE0AE975081691F768B8EB0707EE0CAD6565B142711612F361A9EA8`; **19/19** file ZIP, source checkout `b227585` và bản giải nén `C:\circa-gr-nextwaves-v0.2.4` khớp, không file thừa. `git diff --check` và quét credential theo mẫu `agent.md` không báo lỗi. |
| Test | Dev báo `npm test` 145/145 × 6, Edge GR 88/88 và Edge tổng 42/42 trên bản giải nén, đối chứng v0.2.3 hỏng che `SL nhận`. PM **chưa chạy lại** test nặng vì tiến trình đột biến dev vẫn đang chạy; 114 Node/21 Edge chưa có kết quả cuối. Không ghi các số đang chạy là gate đạt. |
| Staging thật | Dev đã khảo sát DOM/scroll GR03887 chỉ đọc. **Chưa cài v0.2.4 lên Chrome staging, chưa quan sát khung mới trên trang thật.** |

## Finding cần dev sửa trước gate source/gói

### P1 — `anchoredFor()` không kiểm lại mã phiếu khi node anchor còn nguyên

`src/ui/panel.js`: `check()` trả về ngay khi `placed()` đúng (`host` vẫn liền trước `anchor`), và `anchoredFor(c)` cũng chỉ dựa vào `placed()`/mã `code` đã lưu. `src/pos/pos-content.js`: `grAnchor(code)` có kiểm mã phiếu ở thẻ thông tin, nhưng không được gọi lại ở hai đường này. Nếu React **đổi chữ thẻ thông tin từ GR A sang GR B nhưng giữ nguyên node `#all-receipt`**, observer thấy mutation mà vẫn giữ khung GR A; cú bấm Điền ngay sau đó có thể qua `anchoredFor(A)` nếu URL vẫn là A. Gate fail-closed theo đúng GR hiển thị chưa được chứng minh.

**Yêu cầu:** khi kiểm đặt panel và ngay trong guard trước `session:claimApply`, xác minh `find(code)` vẫn trả về **chính anchor hiện tại** và trang URL/GR id tương ứng; khác thì gỡ/khóa nút Điền, không tiêu grant, 0 PUT. Thêm test chỉ đổi `textContent` mã GR trên thẻ thông tin, **không thay anchor/route**; click ngay trước callback observer cũng phải bị chặn. Edge test hiện thay cả card nên chưa bắt ca này.

### P2 — lượt đánh giá GR cũ có thể vẽ khung nổi sau khi về danh sách/trang khác

`showGr(gr, view)` chỉ bỏ view khi trang hiện tại là `kind === "gr"` với id khác. Nếu lượt tra QR/kế hoạch của GR A về muộn **sau khi route sang danh sách hoặc trang không liên quan**, hàm vẫn gọi `panel.show()`, và `panel.show()` chuyển sang `floatPanel.show(view)` cho mọi trang không phải GR. Điều này có thể làm khung GR cũ xuất hiện trên danh sách, vi phạm F4 và hiển thị thông tin sai trang; route handler gỡ khung trước đó không chặn kết quả async đến sau.

**Yêu cầu:** view GR chỉ được hiển thị trên trang GR đúng id hoặc đường SO hợp lệ đã được xác minh cho phiên đó; không float trên danh sách, trang bán hàng hay host lạ. Thêm test giữ tra QR đang chờ, chuyển sang danh sách/trang khác rồi thả kết quả: 0 khung, 0 nút Điền/ghi, F4 không hồi quy.

### P2 — view cảnh báo thay nội dung khi khung đang thu nhỏ

`viewSig()` chỉ gồm tone, title và nhãn nút, bỏ `lines`/bảng. Nếu một cảnh báo/lỗi giữ nguyên title và nút nhưng nội dung thay đổi, `needsAttention()` đúng mà điều kiện “sig khác” sai, khung vẫn thu nhỏ và giấu chi tiết mới. **Yêu cầu:** định nghĩa phiên bản view bao gồm nội dung quan trọng hoặc cách thông báo lại khi warning/error thay dữ liệu, tránh tự mở lại vô hạn do polling không đổi; test đổi `lines` khi minimized.

Gói `E8531EB4` **không được giao cài**. Dev sửa P1/P2, thêm test tái hiện trước khi sửa và Edge ca tương ứng; dựng lại ZIP/SHA, đánh dấu gói cũ đã thay. Vì v0.2.4 chưa cài/phát hành cho operator, có thể giữ version 0.2.4 nhưng phải dùng hash gói mới và PM audit lại. Báo số đột biến cuối trên code cuối, không dùng số của `b227585` cho mã đã sửa.

## Gate còn lại tới staging done và production

1. **A1 trên v0.2.3:** runbook đã đủ trình operator; chỉ chạy sau khi operator xác nhận đúng 15 tem và cho phép một lượt GR03887/PO13806459/SOBD1594095-F. Đây là chặng có tác động thật, PM không cấp phép thay. Không thay extension giữa receive và hoàn tất. Nếu kết quả nhận/plan/PUT khác kỳ vọng thì dừng theo runbook, không tự retry.
2. **P2 v0.2.4:** sau finding được đóng, PM chạy lại source/test/gói/Edge; rồi mới cho cài để kiểm một trang GR thật ở 1095px. A1 + P2/hồi quy W1 trên gói cuối đạt mới xét `staging done`/merge. Test hiện tại chưa chứng minh v0.2.4 trên trang thật.
3. **Production Florita:** còn discovery O1 từ PO/phiếu gửi/biên nhận đã nhận, ý nghĩa QR POS thêm sau HOÀN THÀNH, thông tin máy/extension reader và SO/GR thật, T1-PRD chỉ đọc, bản ghi PRD có allowlist Florita, quy trình xử lý GR dở/rollback, W1-PRD có phép operator. 4/11 và 6/11 vẫn là **mốc mục tiêu có điều kiện**, chưa là ngày Go.
