# PM review kế hoạch staging done → production Florita

Ngày 27/10/2026. Căn cứ `docs/dev/PLAN-STG-DONE-PRD-20261027.md` tại `2666a7b`, `state.md` lần 43, `docs/pm/AUDIT-T3-W1-FULL-STG-20261026.md` và quyết định G3a v0.2.3. PM **duyệt hướng chia giai đoạn và đóng băng phạm vi**, nhưng **chưa duyệt nguyên trạng mốc A1–B5, chưa cấp phép nhận/ghi mới**. Dev sửa plan theo hợp đồng dưới đây; được chuẩn bị runbook A1, spec P2 và khảo sát Đợt 2 ngay.

## 1. Các finding cần sửa trong plan

| Mức | Finding | Yêu cầu |
|---|---|---|
| P1 | A1 ghi một chuỗi có tác động thật mà chưa có preflight cho **GR03887 / PO13806459 / SOBD1594095-F**, danh sách 15 EPC/UID, trạng thái phiếu/PO/phiếu gửi ngay trước quét và hành vi khi Nextwaves báo còn thiếu. `nw_ready` và dòng “Còn thiếu 15” chỉ chứng minh đã khớp đơn, chưa chứng minh có đủ tem vật lý hoặc kết quả nhận sẽ đầy đủ. | Dev soạn runbook một trang với dữ liệu preflight chỉ đọc, điểm dừng và bằng chứng. Operator xác nhận có đủ **đúng** 15 tem và cho phép một lượt E2E cụ thể **sau khi đọc runbook**. PM không tự cấp phép thay operator. |
| P1 | A1 điền và HOÀN THÀNH liền sau receive, dù có thể phát sinh `tagged_unit_unsupported`, nhận thiếu, plan bị chặn, lệch lô/đơn vị hoặc PUT một phần. O1 hiện fail closed nếu mất phiên sau nhận. | Một phép operator cho cả lượt được chấp nhận nếu nêu rõ **ba chặng có điều kiện**: nhận → kiểm bằng chứng; điền → kiểm GR; dược sĩ HOÀN THÀNH. Bất kỳ điều kiện nào sai thì dừng, giữ phiên/capture, không bấm lại hoặc tự sửa số liệu. Nói rõ đường xử lý tay nếu mất phiên sau nhận trước khi xin phép. |
| P1 | B1/B2 hứa khôi phục O1 từ SO sau nhận mà chưa có hợp đồng tra cứu đã nhận. Sau nhận, `/receiving` theo SO từng trả `total 0`; nâng cấp/đổi extension ID có thể mất phiên. | Đợt 2 bắt đầu bằng discovery **chỉ đọc** trên response PO/phiếu gửi/biên nhận đã nhận, chứng minh cách tìm lại theo khoá bất biến và phân biệt nhiều PO/GR. Nếu không có API đủ tin cậy, đề xuất fail closed + quy trình nhập tay để operator/stakeholder quyết; không viết parser suy đoán. Test gián đoạn sau 2xx, trước W1, sau PUT một phần, khi update/đổi ID. |
| P1 | B4/B5 dùng ngày cố định dù mã QR POS thêm sau HOÀN THÀNH vẫn chưa rõ ý nghĩa nghiệp vụ và SO thật Florita chưa có lịch. | Go production chỉ sau tra QR đối chứng (mã POS mới và UID Nextwaves) + quyết định nghiệp vụ của operator/stakeholder, T1-PRD, W1-PRD có phép riêng, kế hoạch xử lý lỗi/rollback và người trực theo dõi. 4/11 và 6/11 là **mốc mục tiêu có điều kiện**, không là ngày Go đã duyệt. |
| P2 | A2 “khung trong luồng trang trên bảng sản phẩm” có hướng tốt nhưng chưa có anchor DOM/chu kỳ React và cách giữ trạng thái/nút hành động luôn thấy khi cuộn. | PM duyệt **hướng nghiên cứu**, chưa duyệt layout cụ thể. Dev giao spec kỹ thuật/ảnh DOM thật và test theo §3 trước khi code v0.2.4. Không tự đổi `panel.js` cho Nextwaves/danh sách. |
| P2 | A4 merge ngay sau A1 trên v0.2.3 và ảnh P2 trên v0.2.4 có thể bỏ qua hồi quy nút “Điền” sau khi dời panel. | PM audit diff/gói v0.2.4, test đường grant/plan/apply và nút trong khung trên Edge bản giải nén, rồi kiểm UI thật. Nếu P2 chỉ đổi bố cục mà giữ hành vi, một lượt A1 v0.2.3 + hồi quy v0.2.4 có thể đủ để quyết merge; nếu đổi handler/logic hoặc phát hiện sai khác, phải có gate W1 bổ sung, không mặc định merge 30/10. |
| P2 | Rủi ro A1 hỏng được gán “trễ tối đa 1–2 ngày” và tự tạo SO staging mới. | Không có ETA bảo đảm khi cần tem/SO mới hoặc sửa backend. Mọi SO/GR/PO mới và lượt có tác động cần operator quyết riêng; dev chẩn đoán trước khi đề xuất chạy lại. |

## 2. Gate A1 — một lượt E2E staging có giám sát

**PM cho phép chuẩn bị A1 trên v0.2.3; chưa cho bấm nhận hàng.** P2 che cột `SL nhận` không chặn **một lượt thử E2E có giám sát** vì khung thu nhỏ thủ công được và HỦY/HOÀN THÀNH vẫn thấy. Quyết định này chỉ áp cho lượt thử; P2 vẫn chặn “staging done”/dùng thường xuyên. Không nâng cấp/đổi extension ID giữa receive và hoàn tất POS.

Dev giao runbook một trang trước khi operator cấp phép, gồm:

1. **Định danh và preflight chỉ đọc:** version 0.2.3/gói `40236D67`, Staging cửa hàng 2222, đúng GR03887 ↔ SO `SOBD1594095-F` ↔ PO13806459/phiếu gửi/kho, trạng thái chưa nhận/chưa hoàn tất, một phiên `nw_ready`, không grant. Đọc lại dữ liệu ngay trước lượt; nếu khác, dừng. Ghi rõ số tem/EPC kỳ vọng theo dòng và đối chiếu 15 tem vật lý đúng đơn, không chỉ đếm đủ 15 bất kỳ.
2. **Bằng chứng từ trước lượt:** bật capture POS xuyên suốt, capture Nextwaves có request/status `receive-scan` và GET PO/phiếu gửi/biên nhận sau nhận; giữ file chứa credential **chỉ trên máy**, tách mẫu đã làm sạch trước khi vào repo/chat. Ghi GR trước nhận, sau điền, sau HOÀN THÀNH; lưu log phiên an toàn trước TTL 24 giờ.
3. **Chặng nhận:** chỉ khi giao diện quét đủ đúng 15/15, không tem thiếu/lạ, đúng kho/đơn, operator/dược sĩ bấm “Xác nhận nhận hàng” **một lần**. Nếu UI vẫn báo thiếu, `tagged_unit_unsupported`, HTTP lỗi, hoặc kết quả không đủ UID/biên nhận mới/phiếu gửi đã nhận, dừng; không thử lại tự động. Nhánh lựa chọn “Giữ đơn mở/Đóng đơn dù còn thiếu” phải được runbook giải thích; không chọn đường chấp nhận thiếu để ép gate đạt.
4. **Chặng điền:** POS phải tự về **GR03887**, kết quả Nextwaves đủ đúng EPC/UID, khung có kế hoạch hợp lệ (không blocked), lô/đơn vị/số lượng đúng chứng từ. Chỉ sau khi operator xem mã kế hoạch và số bước ghi, operator cấp phép **một lần** trong popup và tự bấm “Điền”. Nếu phiên mất, plan khác kỳ vọng, tra QR thiếu hoặc có lỗi PUT, dừng; không tự cấp phép lại/PUT lại.
5. **Chặng hoàn tất:** đọc lại GR sau điền: mỗi UID đúng lô, lượng nhận đúng, không có mã lạ và không còn bước PUT; dược sĩ/operator mới bấm **HOÀN THÀNH**. Kiểm response trạng thái và GET GR `COMPLETED`. Mã QR POS tự thêm sau hoàn tất được ghi nhận riêng, không coi là UID Nextwaves và không sửa parser trong A1.

**Gate A1 đạt:** một lượt trên cùng cặp GR/PO có `receive-scan` 2xx + bằng chứng nhận đủ, POS tự về đúng GR, kế hoạch/PUT/GET đối chiếu được từng bước, và POS hoàn tất đúng. Báo cáo tách phần thấy trên traffic, storage, ảnh và phần suy luận. Nếu dừng giữa đường, đó là finding để PM quyết tiếp, không là A1 đạt. Sau khi PM duyệt runbook và operator cho phép đúng lượt, dev/operator mới thực hiện.

## 3. P2 v0.2.4 — hợp đồng UI trước khi code

Dev có thể khảo sát DOM trang phiếu và viết spec ngay. Hướng đặt khung **trong luồng trang phía trên bảng sản phẩm** có thể dùng nếu chứng minh:

- Anchor là vùng của đúng GR, tồn tại qua render/route; không chèn vào `body` như fallback nếu không tìm được anchor. Tạo/gỡ idempotent, không vòng `MutationObserver`, không nhân đôi nút hoặc làm mất click handler khi POS vẽ lại.
- Ở 1095×756, 1366×768 và 1440×900, mọi trạng thái `waiting_nw`, `nw_ready`, `received` (kế hoạch dài), có grant, `applying`, `applied`, warning/error đều đọc được; nút trong khung bấm được, cột `SL nhận` (+/−/xoá), HỦY/HOÀN THÀNH của POS không bị phủ. Nếu nội dung nằm dưới vùng nhìn, phải có cách nhận biết/đi tới hành động cần làm; không tự ẩn cảnh báo hoặc quyền điền.
- Không đổi `session`, plan hash, grant, W1, callback Nextwaves hay panel trang danh sách. Bản phát hành v0.2.4 cần version/ZIP/SHA mới, test Node/Edge trên bản giải nén, đo hiệu năng và ảnh/quan sát Chrome staging sau PM audit source/gói.

PM duyệt spec/anchor rồi dev mới code. Một ảnh trang thật có khung mở và điều khiển `SL nhận`/HOÀN THÀNH cùng thấy ở 1095px là bằng chứng UI mong muốn; dev tự quan sát nếu truy cập được, không mặc định giao operator nhiều ảnh.

## 4. Mốc và chủ sở hữu đã chỉnh

| Mốc | Chủ | Quyết định PM |
|---|---|---|
| 28/10 A0 | Dev soạn runbook/preflight; PM duyệt; operator xác nhận đúng tem và cấp phép một lượt | **Mốc mục tiêu**. Chưa có phép operator nên chưa chạy A1. |
| Sau A0: A1 | Operator/dược sĩ thao tác; dev thu bằng chứng; PM audit | Một lượt staging v0.2.3 có giám sát. Không bảo đảm xong trong ngày nếu dữ liệu/tem không khớp. |
| A2/A3 | Dev spec P2 → PM duyệt → dev code/audit gói → kiểm thật | Có thể làm song song A0 nhưng không sửa/cài extension giữa chặng nhận–điền–hoàn tất của A1. |
| A4 | PM chốt staging done; dev/ operator merge theo quy trình | Chỉ sau A1 + P2 + hồi quy v0.2.4 đạt. 30/10 là mục tiêu, không tự động merge. |
| B0/B1 | Dev thu dữ liệu Florita/O1/QR chỉ đọc và viết spec; operator xác nhận nghiệp vụ | Có thể làm song song staging, **không đợi operator tự thu đủ** mới viết spec. |
| B2/B3 | Dev build v0.3.x chỉ đọc → PM audit → operator T1-PRD có giám sát | Chỉ khi hợp đồng O1/QR/cửa hàng và máy đủ. 4/11 là mục tiêu. |
| B4/B5 | PM gate, operator cho phép W1-PRD từng GR; dược sĩ thao tác; dev theo dõi | 5–6/11 chỉ là cửa sổ mục tiêu sau B3 đạt, phương án rollback/manual và người trực có mặt. Không tự bật ghi hoặc Go vì tới ngày. |

**Monitoring 3 ngày:** dev phải mô tả cách lưu/xuất log trước TTL 24 giờ, người trực, ngưỡng dừng và đường xử lý GR dở. Không hứa “xem nhật ký mỗi ngày” nếu phiên đã bị xoá hoặc không có quyền truy cập máy Florita.

## 5. Phần operator cần cung cấp, theo đúng thời điểm

- **Trước A1:** xác nhận có đúng 15 tem của SO/PO này và chấp thuận một lượt theo runbook đã duyệt. Không xin phép ghi chỉ dựa trên bảng ngày. Nếu thiếu tem, dev đề xuất cặp staging khác sau khi kiểm chỉ đọc; operator quyết.
- **Trước T1-PRD:** thông tin máy/hồ sơ Chrome Florita, extension khác có thể tranh reader, cửa hàng/kho/tenant và SO/GR thật sắp giao khi đã có lịch. Dev chủ động khảo sát những gì đọc được từ source/mẫu; gom một yêu cầu ngắn cho phần operator mới biết.
- **Trước W1-PRD:** quyết định nghiệp vụ về QR POS sau HOÀN THÀNH, lựa chọn O1 (khôi phục đã kiểm hoặc fail closed + nhập tay được chấp nhận), và phép riêng đúng GR/PO thật. Không gọi production ready khi thiếu các quyết định này.
