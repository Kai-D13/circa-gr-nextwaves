# v0.4.0 — mọi cửa hàng POS, tự điền sau khi Nextwaves nhận, mượn đầu đọc (07/11/2026)

**Căn cứ:**
- yêu cầu operator 06/11 (`state.md` lần 63–64): mọi POS; luồng liền mạch "Nhận hàng bằng RFID → Nextwaves tự kết nối đầu đọc → dược sĩ quét + xác nhận → về POS tự điền cả phiếu → dược sĩ kiểm và bấm HOÀN THÀNH"; sửa lỗi treo GR84570; review kỹ trước khi làm bản 4;
- plan `docs/dev/PLAN-v0.4.0-MOI-POS-E2E.md` (sửa lần 2: nhận dạng đơn theo SO, không theo `thuocsi_id`; không thêm ô SO);
- hợp đồng đầu đọc với QR Scan Log: `docs/dev/SPEC-QSL-MUON-DAU-DOC-v1.md` (`circa-reader/v1`);
- thiết kế mã: `docs/dev/DESIGN-v0.4.0.md` (trên nhánh).

Hướng dẫn cài / vận hành: `docs/dev/RUNBOOK-v0.4.0.md` (thay `RUNBOOK-PRD-FLORITA-v0.3.1.md`).

**Chưa cài máy POS nào, chưa ghi thật bằng v0.4.0.** Cài / nâng và lượt đầu chỉ khi operator cho phép bằng chữ.

> **07/11 rạng sáng — mã gói 79D4269C thay BA779823** (BA779823 chưa cài đâu; theo luật "sửa trước khi cài máy POS giữ số" → vẫn 0.4.0).
> - Operator: cài máy dev → QA / QC (`docs/dev/QA-v0.4.0-MAY-DEV.md`) → mới cài máy POS; chỉ hai cửa hàng Florita + Lumina (tenant `circa`); **hoãn mượn đầu đọc với QR Scan Log**.
> - Rà luồng không có QR Scan Log: hết 3 lần bấm "Kết nối đầu đọc", khung bảo "Ngắt RFID ở tab bán hàng, extension tự kết nối lại" nhưng extension không bấm thêm → dược sĩ chờ mãi. **Sửa** (`src/nw/nw-content.js` `readerTick`, nhánh `8a28fc4`): dược sĩ rời tab Nextwaves rồi quay lại → một lượt bấm mới (vẫn tối đa 3, không bấm khi tab ẩn); chữ "sang tab bán hàng bấm Ngắt RFID rồi quay lại tab này, extension tự kết nối lại". Chỉ file này đổi so với BA779823.
> - Đột biến lượt đủ trên BA779823 thấy ca cũ **"S6 cache cả kết quả tra QR lỗi" sống** (test cũ bắt nó qua "đổi cấp phép → lập lại kế hoạch", v0.4.0 đã bỏ cấp phép) → test mới: tra lỗi → rời phiếu rồi quay lại (SPA) → chỉ tra lại UID lỗi → tự điền.
> - Máy dev: `C:\circa-gr-nextwaves-v0.2.3` = 79D4269C (sao lưu v0.3.1 ở `C:\circa-gr-nextwaves-release\backup\v0.2.3-truoc-v0.4.0-20261107\`).

## 1. Gói

| Mục | Giá trị |
|---|---|
| Nhánh | `batch/v0.4-moi-pos`, tách từ `2d35a8c` (= v0.3.1 `AEE4447F`). src đổi lần cuối ở `8a28fc4` |
| ZIP | `circa-gr-nextwaves-v0.4.0.zip`, 19 file |
| SHA-256 | `79D4269CF189251A745515DAAE8166AFE1C41589D37047665C35F78A98328C88` (mã gói **79D4269C**). Đóng lại từ `git archive HEAD` ra cùng mã; giải nén `diff -r` với `src/` không khác. Gói trước `BA779823…` (src `bd37f35`) không dùng |
| Thư mục giao | `C:\circa-gr-nextwaves-release\v0.4.0\`: ZIP + `kiem-truoc.js` / `kiem-sau.js` / `kiem-khung-gr.js` + `HUONG-DAN-v0.4.0.md` (= runbook) + `QA-v0.4.0-MAY-DEV.md` + `SHA256SUMS.txt`; `khong-dung\` giữ BA779823 |
| Cài | Máy đã có v0.3.1 (Florita): chép đè đúng thư mục đang nạp (`C:\circa-gr-nextwaves`), Reload, giữ Extension ID. Máy mới: Load unpacked. Popup: Production + tenant Nextwaves của máy (trống = `circa`) |
| Nâng từ v0.3.1 | Phiên schema 1 bị xoá khi nâng (cùng khoá cấp phép cũ). Hoàn tất phiếu đang nhận dở trước khi nâng |

## 2. Thay đổi so với v0.3.1

### 2.1 Mọi cửa hàng, nhiều tenant Nextwaves

- **Bỏ bảng cửa hàng** (`storeAllowlist` / `warehouseByStore`). Cửa hàng nào đăng nhập POS cũng có nút "Nhận hàng bằng RFID".
- **Kho = kho của đơn Nextwaves đã khớp.** Đơn được nhận dạng bằng SO (refId) + bên bán Buymed + vân tay số lượng từng sản phẩm của phiếu. Mọi đơn ứng viên của SO phải cùng một kho, khác → `warehouse_inconsistent`, dừng.
  - Không dùng `thuocsi_id` của POS: Lumina POS ghi 392301, kho Nextwaves thật là **406918** (operator sửa 06/11, kiểm bằng API public Nextwaves).
  - Khung Nextwaves hiện "Kho Nextwaves: <tên> (<mã>)" để dược sĩ nhìn.
- **Tenant Nextwaves theo máy:** ô "Tenant Nextwaves" trong popup (Production; trống = `circa`). Staging cố định `circa-stg`.
  - Production không nhận tenant `circa-stg` hay tên `api-…` (dựng sai origin).
  - Manifest match `https://*.nextwaves.app/*`. Hook nhận mọi `api-<tenant>.nextwaves.app`, content chỉ dùng token của đúng tenant đang chọn.
  - Phiên ghi `nwTenant`; tab Nextwaves của tenant khác không gắn được phiên.

### 2.2 Luồng E2E mới

`waiting_nw` → (`no_nw_order` ⇄ `waiting_nw` qua "Tìm lại") → `nw_ready` → `received` → `applying` ⇄ `apply_stopped` → `applied` → `done` (`SESSION_SCHEMA` 2).

- **Bỏ:** cấp phép điền (popup), chế độ tự động, tự HOÀN THÀNH, trạng thái `auto_*`, `claimComplete`. Extension **không bao giờ** gửi `status/COMPLETED`; dược sĩ bấm HOÀN THÀNH.
- **Tự điền một lần:** Nextwaves nhận xong (receive-scan 2xx + biên nhận khớp đơn) → background đóng tab Nextwaves, đưa tab POS về đúng phiếu → tab POS lập kế hoạch → không khoá → tự điền.
  - Chỉ ở trạng thái `received`, chỉ trên trang phiếu có khung gắn đúng chỗ, mỗi lượt nhận mỗi tab một lần.
  - Background chặn lần hai: `how:"auto"` chỉ từ `received` (`auto_once`).
  - Tab POS gốc chỉ được dùng lại khi đang ở danh sách phiếu hoặc đúng phiếu; tab đang ở việc khác → mở tab mới (A3).
- **Đang điền:** khung ghi "Đang điền i/n — CHƯA bấm HOÀN THÀNH". Đọc lại phiếu sau mỗi lô.
- **Xong:** khớp cuối cả phiếu (`verifyFinal`) → tải lại → "GR…: đã điền N mã vào M lô — kiểm danh sách rồi bấm HOÀN THÀNH".
  - Phiếu có sản phẩm Nextwaves không gắn tem (thiếu lượng) → khung **vàng** "còn K sản phẩm CHƯA nhận đủ" + tên sản phẩm (review P2-2).
  - Có mã lạ trên lô → vàng "đã điền nhưng đọc lại chưa khớp hoàn toàn".
- **Dừng giữa chừng:** PUT 5xx / mất mạng = **chưa rõ** (`put_uncertain`, máy chủ có thể đã lưu) → hạ nhiệt 60 s → nút "Đọc lại và điền tiếp" (cần cú bấm; review P3-4 / P3-10). Phiên kẹt `applying` hết lease vẫn đóng được về `applied` / `done` (A8).

### 2.3 Lỗi treo GR84570 (SOBD38560757-F)

**Nguyên nhân (v0.3.1):** Nextwaves không có đơn chờ nhận cho SO. Khung Nextwaves đánh giá lại ở **mọi** thay đổi storage (kể cả nhật ký của chính nó) → tìm lại → ghi nhật ký → tìm lại… Khung kẹt "Đang tìm…", không bao giờ báo.

**Sửa:**
- Tìm đơn **một lần** cho mỗi chữ ký phiên (key, state, createdAt, nwPoId); lỗi giữ khung (latch). Chỉ đánh giá lại khi chữ ký đổi, đổi URL, bấm "Tìm lại", hoặc có token mới sau lỗi 401. Nhật ký trùng lý do không ghi lặp.
- Không có đơn → phiên `no_nw_order`, khung "Nextwaves chưa có đơn chờ nhận cho SO… → nhận tay trên POS", nêu lý do loại từng đơn (review P3-11), nút "Tìm lại" / "Về POS"; trả đầu đọc. Danh sách phiếu POS ghi "Không có đơn NW", bấm = tìm lại.
- Chờ token Nextwaves quá 20 s → "Chưa thấy Nextwaves tải dữ liệu — F5" (A4).

### 2.4 Đầu đọc: mượn / trả với QR Scan Log, tự kết nối trên Nextwaves

- **Giao thức `circa-reader/v1`** (`window.postMessage` trong tab POS; ping / lend / return có `leaseId`, TTL 15 phút). Bên QR Scan Log do đội đó làm theo spec; chưa có → extension báo "đầu đọc bận ở tab khác", dược sĩ bấm Ngắt như hiện nay.
- **Mượn** trước khi mở Nextwaves (tab POS bấm nút). Tạo phiên lỗi / cú bấm bị huỷ → trả ngay lượt vừa mượn (P3-1).
- Tab Nextwaves **gia hạn** cùng `leaseId` mỗi 10 phút; QR Scan Log bận → thử lại tối đa 8 lần (P3-2).
- **Trả** sau khi tab Nextwaves đã đóng: lúc nhận xong, huỷ phiên, phiếu xong, không có đơn, tab Nextwaves bị đóng. Thử lại có giãn cách khi tab POS còn đang tải (P2-1). Trả xong mà "Tìm lại" → lượt mượn **mới** (P2-3, P3-3). Trạng thái đầu đọc chỉ ghi khi phiên còn đúng lượt mượn đó (compare-and-set).
- **Tự bấm "Kết nối đầu đọc"** của màn quét Nextwaves (operator cho phép riêng nút này): bám đúng phần tử nút đầu đọc, tối đa 3 lần cho một lượt mất kết nối, chữ tạm "Đang kết nối…" không mở thêm lượt (P3-8). Không bao giờ bấm "Xác nhận nhận hàng". Hết 3 lần → nút "Mượn lại đầu đọc".

### 2.5 Khác

- **A7 SO tách giao, nhận nhầm đơn:** receive-scan 2xx của đơn thuộc phiên khác đang mở (cùng env + tenant, đúng shipment) → giao kết quả cho đúng phiên đó. Không có phiên → báo đỏ "Nextwaves ĐÃ nhận — POS CHƯA điền".
- **A2:** phiên bị xoá / hết hạn trong lúc Nextwaves nhận → báo đỏ, không im lặng.
- **Một tab Nextwaves:** mở phiếu mới thì dùng lại tab nhận hàng của extension còn mở (C1). Hai tab cùng phiên: tab về sau không báo đỏ khi tab kia đã nhận xong (P3-9).
- **"Tìm lại" từ phiếu không có đơn:** khoá ghi gộp (chỉ thêm, không bớt), vân tay / tab mới thắng (P3-5).
- `reopenNw` chỉ ở bước Nextwaves; phiếu xong trên POS khi phiên còn ở bước Nextwaves → đóng tab Nextwaves rồi trả đầu đọc (P3-6).
- Popup viết lại: Môi trường, Tenant Nextwaves, Phiên gần đây (kho, tenant, đầu đọc, Xoá). Bỏ cấp phép / tự động.
- Đoạn kiểm `kiem-truoc.js` / `kiem-sau.js` theo trường mới (`tenant`, `kho`, `dauDoc`, `dien`, `nhanAt`); bỏ `kiem-quet.js`.

## 3. Kiểm (Claude tự gate, không ghi thật)

| Gate | Kết quả |
|---|---|
| `node --test --test-timeout=60000 tests/*.test.js` | **217/217** trên `8a28fc4` (BA779823: 216/216). `tests/auto.test.js` (chế độ tự động v0.3.x) thay bằng `tests/v04.test.js` 27 test; `runtime.test.js` chuyển sang luồng tự điền |
| Test mới (chọn lọc) | <ul><li>A1 trên dữ liệu thật GR03887: mượn đầu đọc → nhận → tự điền 5 PUT → không COMPLETED → trả đầu đọc; `kiem-truoc` / `kiem-sau` chạy trên dữ liệu đó</li><li>GR84570: không có đơn → đúng **1** lần tìm, `no_nw_order`, trả đầu đọc; lỗi 500 / 401 giữ khung, token mới sau 401 tìm lại</li><li>PUT 503 giữa chừng → chưa rõ, nút điền tiếp; tab chết; kế hoạch chặn; phiếu đã đủ</li><li>A2 / A3 / A4 / A7 / A8, B6 tenant, C1 một tab, C2 tối đa 3 lần bấm, QR Scan Log không hỗ trợ / bận / chậm trả lời</li><li>khung Nextwaves không bị đánh thức khi chỉ nhật ký đổi (lớp 2 của A1)</li><li>resolve: không có đơn / khác kho; env tenant; popup tenant</li><li>mỗi finding review P2 / P3 có test</li></ul> |
| Đột biến `python -I scripts/mutate-v0.4.0.py` | **198 ca** = 145 ca v0.3.x còn neo + 53 ca v0.4.0. **Ca 0–87 trên `bd37f35`: 87/88** (sống: "S6 cache cả kết quả tra QR lỗi" → test mới). Lúc ~00:35 lỡ chạy `node --test` song song khoảng ca 6–8; ba ca đó bị bắt bởi đúng test của chúng (không phải hết giờ). **Chạy lại trên `8a28fc4`:** 7 ca liên quan (S6 + 3 ca 07/11 + C2 ×2 + P3-8) **7/7**; ca 88–197 **(đang chạy — điền khi xong)**. Lượt ca mới trước review: 29/32. Ba ca sống → thêm test lớp 2 A1 (khung không bị đánh thức khi chỉ nhật ký đổi) và test bấm lại phiếu không có đơn; ca "coi trang UI Nextwaves là API" là đột biến tương đương → bỏ phép kiểm thừa trong `nwApiEnvOf` |
| Edge thật `node scripts/edge-v040.js <bản giải nén>` | BA779823: **43/43** trên Edg/156.0.4314.58: khung đúng chỗ ở 3 cỡ; tự điền 5 PUT đúng kế hoạch #E33C777A, không COMPLETED; "Đọc lại và điền tiếp" bằng bàn phím; trang thiếu `#all-receipt` → không tự điền, 0 PUT; HOÀN THÀNH do trang gửi → phiên done. Tác vụ extension dài nhất **15,20 ms** |
| Review độc lập v0.4.0 (sub-agent, chỉ đọc) | **0 P1, 3 P2, 11 P3 — đã sửa hết, mỗi điểm một test** (mục 2: P2-1 trả đầu đọc thử lại, P2-2 sản phẩm chưa nhận đủ, P2-3 thứ tự đóng tab / trả + lượt mượn mới; P3-1..P3-11) |
| Quét bí mật + tên nhân viên | 0 kết quả mỗi commit |

## 4. Đã kiểm trên dữ liệu thật (chỉ đọc)

- **API public Nextwaves** (`https://api-circa.nextwaves.app/api/v1/public`, chỉ GET): tenant `circa` có 2 kho cửa hàng, Florita và Lumina (406918). Lumina PO-2026-000006 vẫn "shipped" trên Nextwaves trong khi phiếu POS GR84715 đã COMPLETED (nhận tay).
- Màn nhận hàng Nextwaves production có `autoConnect` và `requestAndConnect({autoReuseAuthorized})`: cổng đã cấp quyền được dùng lại không cần chọn.
- GR84674 (lượt production đầu, v0.3.1): POS máy chủ nhân đôi mã khi COMPLETED. Hành vi đã biết (D1), extension không đụng.

## 5. Rủi ro còn lại

1. **Chưa chạy ở cửa hàng ngoài Florita.** Logic nhận dạng không phụ thuộc cửa hàng; cần một phiếu thật có đơn Nextwaves chờ nhận (ví dụ Lumina) để chạy lượt đầu.
2. **Mượn đầu đọc phụ thuộc QR Scan Log.** Chưa có bản hỗ trợ `circa-reader/v1` → làm tay như v0.3.1 (runbook mục 1c).
3. **Tenant khác `circa`:** chưa biết cửa hàng nào dùng tenant nào. Sai tenant → khung "Chưa thấy Nextwaves tải dữ liệu", không ghi.
4. **Trường mã giao `-F` / `-P1` / `-P2` của Nextwaves** chưa có → SO tách giao vẫn nhờ vân tay số lượng; hai đơn cùng khớp → khoá `ambiguous`, nhận tay.

## 6. Sau lượt đầu

- Mỗi máy, lượt đầu: `kiem-sau.js` (+ capture nếu có) → Claude đối chiếu.
- Đạt → đề nghị merge `batch/v0.4-moi-pos` → `main` (khi operator đồng ý).
