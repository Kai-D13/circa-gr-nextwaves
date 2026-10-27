# PM chốt G3a v0.2.3 — UI chỉ đọc trên staging

Ngày 27/10/2026. Căn cứ `docs/dev/G3a-KET-QUA-v0.2.3-20261027.md` tại `c5b96c7`, PM audit source/gói/Edge `docs/pm/AUDIT-v0.2.3-F3-F4-G3a-20261027.md`, và bốn ảnh v0.2.2 đã xem trước đó. Ảnh v0.2.3 số 2–5 được dev xem trực tiếp trong cuộc trò chuyện operator; PM **chưa xem file gốc** của các ảnh này. Không đưa ảnh có tên nhân viên vào repo.

## Quyết định

**G3a đạt cho v0.2.3 trên Chrome staging, phạm vi UI chỉ đọc.** Không yêu cầu operator chụp thêm ảnh Nextwaves hoặc làm thêm lượt thử G3a. Lượt chạy nhầm bản v0.2.2 trong báo cáo dev bị loại khỏi bằng chứng v0.2.3.

| Mục | Bằng chứng được chấp nhận | Giới hạn |
|---|---|---|
| F3 danh sách POS | Dev xem ảnh trước và sau bấm GR03887: nút sau bấm `Mở Nextwaves`, dòng đều, tiêu đề một dòng ở vùng trang khoảng 1230px. PM đã kiểm source và Edge bản giải nén ở 1095/1366/1440: nhãn sau bấm không làm bảng dàn lại. | Không có phép đo 57px sau bấm ở đúng 1095px trên Chrome thật; ảnh sau bấm khoảng 1230px. Chấp nhận vì nút mới ngắn hơn nút bắt đầu và Edge so cùng trang ở 1095px đạt. |
| F4 danh sách POS | Dev xem ảnh sau bấm: không còn khung nổi; phân trang và chọn số dòng không bị che. PM kiểm source `L.notice()` trong luồng trang và Edge lỗi giả: 0/29 điều khiển bị phủ. | Thông báo lỗi/huỷ chưa xuất hiện tự nhiên trên Chrome thật ở lượt này; không tạo lỗi để lấy ảnh. |
| Nextwaves | Dev xem ảnh khung mở rộng ở bên phải, **ngoài modal** trên màn operator; ảnh sau cuộn cho thấy nút `Xác nhận nhận hàng` hiện đầy đủ. PM kiểm Edge cấu trúc modal với khung sau cuộn ở 1366×768/1440×900. | Hai ảnh thật không đặt khung và nút trong cùng một khung hình; Edge dùng trang dựng và khung chờ dữ liệu thấp hơn khung thật. Với bố cục màn operator đã thấy, khung nằm ngoài modal nên không chồng nút trong modal. Chấp nhận tổ hợp bằng chứng này, không yêu cầu ảnh ghép. |
| Phiên và bản cài | Dev xem popup `v0.2.3`, Staging, ô cấp phép trống, một phiên GR03887 `nw_ready` đúng SO/PO; Edge kiểm một phiên/một tab cả sau tải lại. | Popup một phiên không tự chứng minh số tab Nextwaves thật; số tab thật chưa được đếm độc lập. Không giữ mục này làm yêu cầu bổ sung G3a. |

## Giới hạn quyết định và việc tiếp theo

- G3a chỉ chứng minh đường mở phiên/khớp đơn và bố cục UI trước khi nhận. **Chưa duyệt merge batch v0.2, lượt `receive-scan`, cấp phép điền, PUT GR hoặc HOÀN THÀNH** từ kết luận này. G3b/W1 vẫn theo gate và phép operator riêng đúng GR/PO.
- P2 khung phiếu che cột `SL nhận` ở 1095px vẫn mở theo audit v0.2.3; dev chuẩn bị batch UI riêng trước gate vận hành W1/production. Không tự thu nhỏ mặc định ở trạng thái cần dược sĩ hành động.
- Dev commit nguyên trạng quyết định PM và `state.md` trong commit `PM:` riêng; khi có kế hoạch G3b/W1, nêu rõ GR/PO, hành động có tác động và bằng chứng cần thu trước khi xin operator cho phép. Không cần thêm hành động của operator ở lượt G3a này.
