# Luồng nghiệp vụ — nhận hàng bằng RFID (circa-gr-nextwaves)

Hiện hành trên máy POS: **v0.4.0** (Florita, 07/11/2026). **v0.4.1** (08/11) đã đóng gói, PM chốt cài được lên máy POS (09/11). **v0.4.2** (plan `docs/dev/PLAN-v0.4.2.md`, operator duyệt 10/11, đang làm): mở thẳng đúng đơn theo mã giao, khung Nextwaves gọn, đầu đọc tự lấy, phiếu có mã nhập tay — thay đổi so với luồng v0.4.1 ghi ở §3.1. Tài liệu này là nguồn chuẩn của luồng nghiệp vụ (đã ghi luồng v0.4.1). Đổi luồng thì sửa file này cùng lượt với `agent.md` §3 / `state.md`.

- Chi tiết mã: `docs/dev/BATCH-v0.4.1.md` (trước: `BATCH-v0.4.0.md`, `DESIGN-v0.4.0.md` trên nhánh).
- Hướng dẫn vận hành: `docs/dev/RUNBOOK-v0.4.1.md` (thay `RUNBOOK-v0.4.0.md`).

## 1. Bối cảnh

| Bên | Vai trò trong luồng |
|---|---|
| **Buymed / thuocsi** | Giao hàng cho cửa hàng theo SO (`SOBD…`, có thể tách giao `-F` / `-P1` / `-P2`). Đẩy SO sang Nextwaves |
| **Nextwaves** | Tạo đơn mua (PO-…) theo SO, trong kho Nextwaves của cửa hàng. Dược sĩ đặt hàng lên đầu đọc RFID, Nextwaves đối chiếu EPC với đơn, dược sĩ "Xác nhận nhận hàng" |
| **Circa POS** | Phiếu nhận hàng (GR) của cùng lô hàng. Trước đây dược sĩ quét từng mã QR; giờ extension điền thay |
| **QR Scan Log** | Extension bán hàng, giữ đầu đọc RFID ở tab bán hàng |
| **circa-gr-nextwaves** | Extension này: nối GR ↔ đơn Nextwaves, điền mã vào GR |

## 2. Phạm vi

- **Cửa hàng production (07/11):** chỉ hai cửa hàng, cả hai ở tenant Nextwaves `circa`.

  | Cửa hàng POS | Mã POS | Kho Nextwaves (mã) |
  |---|---|---|
  | CIRCA FLORITA `c476efb2-415c-429a-978e-d389b4b06607` | — | Florita `eb5e2b4f-6f92-413b-90ef-6be1730b94c0` (410478) |
  | CIRCA LUMINA `31493e74-3404-4c0e-a906-93691a6ee319` | POS0012 | Lumina `3f7bd541…` (406918) |

  Mã không cần khai trong extension: kho lấy từ đơn Nextwaves khớp SO. Thêm cửa hàng mới không cần sửa mã, chỉ cần tenant đúng (popup).
- **Staging:** cửa hàng 2222 ↔ `circa-stg`. Từ 30/10 hết phiếu POS staging có SO mà đơn Nextwaves còn chờ nhận. Nextwaves staging vẫn còn đơn buymed-stag chờ nhận (ví dụ SOBD1594228, SOBD1594067; 07/11), nhưng POS chưa có phiếu cho các SO đó.

## 3. Luồng chuẩn (v0.4.1)

Đây là **luồng chính** của extension (operator định nghĩa lại 08/11). Bán gấp (§4) là ngoại lệ hiếm.

| # | Ai | Bước | Extension làm |
|---|---|---|---|
| 1 | Dược sĩ | Có hai cách, đều cần một cú bấm của dược sĩ (extension không tự mở Nextwaves khi chỉ nhập SO): <br>• POS → Danh sách phiếu nhận hàng → tìm phiếu (ô SO có sẵn của POS) → bấm **"Nhận hàng bằng RFID"** trên dòng phiếu; <br>• "Nhập SO thuocsi" → trang SO → bấm **"Nhận hàng bằng RFID"** trên khung extension | Kiểm phiếu thuộc cửa hàng đang đăng nhập, PO, SO, khoá (SO / PO nhiều phiếu); tạo phiên; mở **một** tab Nextwaves `…/purchases/receive?po=<SO>` |
| 2 | Extension | Tìm đơn Nextwaves | Tìm theo SO **một lần**: đúng SO + bên bán Buymed + số lượng từng sản phẩm khớp phiếu (phiếu phần còn lại: khớp theo **cả PO**); mọi đơn ứng viên cùng một kho; kho phải đúng cửa hàng đã biết (Florita / Lumina — lệch thì đỏ, không điền). Khung: "Sẵn sàng nhận hàng", phiếu, đơn, số UID, **kho Nextwaves**, **"Kiểm trước khi nhận: điền được N UID"** (hoặc lý do sẽ không điền được). Không có đơn → mục 4 |
| 3 | Extension / dược sĩ | Kết nối đầu đọc | Extension bấm "Kết nối đầu đọc" của Nextwaves (tối đa 3 lần mỗi lượt). Đầu đọc đang bị QR Scan Log giữ (tab bán hàng, kể cả tab POS đã chuyển trang khác) → khung có nút **"Lấy đầu đọc cho Nextwaves"**: dược sĩ bấm thì extension bấm hộ "Ngắt kết nối" của QR Scan Log ở đúng tab đó (không khi QR Scan Log đang gửi tem vào giỏ), chờ nhả cổng, kết nối Nextwaves. Không xác định được tab → "Mở tab bán hàng" (Ngắt tay). Dùng được cả khi mở modal nhận hàng thẳng từ trang PO Nextwaves. **Không bao giờ** bấm "Xác nhận nhận hàng" |
| 4 | Dược sĩ | Đặt hàng lên đầu đọc tới khi **còn lại 0, ngoài phiếu 0** → bấm **"Xác nhận nhận hàng"** một lần | Đọc kết quả nhận (2xx), đối chiếu biên nhận với đơn đã khớp |
| 5 | Extension | Về POS | Đóng tab Nextwaves; đưa tab POS về đúng phiếu (tab POS đang làm việc khác thì mở tab mới) |
| 6 | Extension | **Tự điền cả phiếu** (một lần) | Lập kế hoạch (UID → lô); không có điểm chặn → điền từng lô (`PUT …/detail`), đọc lại sau mỗi lô; khung "Đang điền i/n — CHƯA bấm HOÀN THÀNH". Xong: khớp cuối cả phiếu → tải lại → "đã điền N mã vào M lô — kiểm danh sách rồi bấm HOÀN THÀNH" |
| 7 | Dược sĩ | Kiểm số lượng từng lô → bấm **HOÀN THÀNH** của POS | Không gửi HOÀN THÀNH. Thấy phiếu COMPLETED → phiên xong |
| 8 | Dược sĩ | Tab bán hàng: bấm **Kết nối RFID** của QR Scan Log để bán tiếp (QR Scan Log hỏi chọn cổng) | Đã lấy đầu đọc ở bước 3 → khung POS / Nextwaves nhắc bước này |

**Nguyên tắc không đổi:**
- Extension chỉ ghi GR **sau khi Nextwaves đã nhận** và kết quả khớp đúng đơn. Mọi điều kiện không khớp → dừng, không ghi.
- Kết quả ghi chưa rõ (mất mạng, POS 5xx) → dừng, chờ ~1 phút, dược sĩ bấm "Đọc lại và điền tiếp" (chỉ điền phần còn thiếu).
- Extension không gọi API ghi của Nextwaves, không dùng `/integrations/circa/*`.
- POS máy chủ tự thêm / nhân đôi mã QR khi phiếu COMPLETED (D1, chấp nhận).

### 3.1 v0.4.2 — khác §3 ở đâu (duyệt 10/11, đang làm)

| # | v0.4.2 |
|---|---|
| 1 | Extension mở `…/purchases/receive?po=<mã giao>` (`SOBD…-F` / `-P1` / `-P2`) thay vì `?po=<SO>`. Nextwaves mở thẳng màn quét của đúng đơn, kể cả SO tách giao. Đơn Nextwaves cũ chưa có mã → extension tự chuyển `?po=<id đơn>` một lần |
| 2 | Có đúng 1 đơn trùng mã giao → chọn đơn đó, vẫn kiểm Buymed / kho / số lượng. Không có đơn trùng → như §3. Khung Nextwaves bình thường chỉ còn `Phiếu GR… · <cửa hàng> ↔ Nextwaves <mã giao>` và `Kho Nextwaves: …`. Chỉ thêm dòng khi có việc: GR nào / mã nào đã nhận trước, kho sai, mở nhầm phiếu gửi |
| 3 | **Không còn nút, không còn dòng "Đầu đọc: …".** Nextwaves mở cổng → extension lấy đầu đọc từ QR Scan Log trước (theo hợp đồng). QR Scan Log không nhả đúng → extension tự bấm Ngắt ở tab đang giữ. Nextwaves đóng cổng / nhận xong → trả, tab bán hàng tự kết nối lại |
| 6 | Phiếu có mã đã nhập tay → các mã đó để ra ngoài, extension điền phần còn lại (§4) |
| 8 | Chỉ còn khi extension đã phải tự bấm Ngắt: khung nhắc "Kết nối RFID" ở tab bán hàng |

## 4. Ngoại lệ

| Tình huống | Khung báo | Dược sĩ làm |
|---|---|---|
| Nextwaves chưa có đơn chờ nhận cho SO (hàng không gắn tem, hoặc tài khoản Nextwaves không thấy kho) | "Nextwaves chưa có đơn chờ nhận cho SOBD… → nhận tay trên POS" + lý do loại từng đơn; danh sách POS ghi "Không có đơn NW" | Nhận tay (quét QR như cũ). Có tem mà vẫn báo: kiểm tài khoản → "Tìm lại" |
| SO tách giao: nhiều đơn cùng SO | "trên màn quét chọn ĐÚNG đơn PO-…". **v0.4.2:** mở thẳng đúng đơn theo mã giao, không phải chọn | Chọn đúng đơn. Nhận nhầm đơn của phiếu khác đang mở → extension giao kết quả cho đúng phiếu đó |
| **Phiếu có mã đã nhập tay** (vd. GR85090 "Đang nhận" — lỗi vận hành, operator 10/11 đảm bảo không lặp lại) | v0.4.1: "sẽ KHÔNG điền được phiếu POS" — không điền gì. **v0.4.2:** "GR… đã nhận tay trước: <tên các mã>" | v0.4.1: điền tay cả phiếu. **v0.4.2:** nhận Nextwaves như thường; món đã bán không còn để quét → "Giữ đơn mở". Extension để các mã đã nhập tay ra ngoài, điền phần còn lại |
| Hai đơn cùng khớp / đơn khác kho / phiếu bị khoá | "Chỉ xem kế hoạch — chưa được điền phiếu" hoặc lý do khoá | Nhận tay, báo Claude |
| Nextwaves đã nhận nhưng phiên mất | "Nextwaves ĐÃ nhận — POS CHƯA điền" (đỏ) | Nhận tay phiếu đó |
| Có sản phẩm Nextwaves không gắn tem (thiếu lượng) | Vàng: "còn K sản phẩm CHƯA nhận đủ" + tên + "bấm HOÀN THÀNH bây giờ thì POS tách phần chưa đủ sang một phiếu mới" | Nhận tay phần thiếu rồi HOÀN THÀNH (hoặc chấp nhận POS tách phiếu) |
| Đơn Nextwaves đã khớp nằm kho khác kho của cửa hàng (Florita / Lumina) | **Đỏ**: "Đơn Nextwaves ở kho KHÁC cửa hàng — không xác nhận nhận hàng" | Không xác nhận trên Nextwaves; nhận tay, báo vận hành |
| Nextwaves không còn phiếu gửi chờ nhận (đơn đã nhận một phần trước đó) | "Nextwaves không còn phiếu gửi chờ nhận cho SO… (đơn đã nhận một phần)" | Nhận tay; SO còn lần giao khác chưa lên Nextwaves thì "Tìm lại" sau |
| Modal đang mở nhầm phiếu gửi của đơn khác (SO tách giao) | **Đỏ**: "Đang mở nhầm phiếu gửi IT-…" | Đóng hộp thoại, chọn đúng phiếu gửi khung ghi |
| Chưa thấy token Nextwaves | "Chưa thấy Nextwaves tải dữ liệu — F5" | F5, kiểm đăng nhập đúng địa chỉ |
| **Bán gấp** (07/11; hiếm — operator 08/11): lấy món cần bán → mở GR gốc → **quét QR** món đó → bấm HOÀN THÀNH → POS tự sinh **phiếu phần còn lại** cùng PO, đi luồng chính (§3). POS **không hỏi xác nhận**; phiếu mới chỉ có phần chưa nhận, cùng lô (staging 07/11) | **v0.4.1:** bấm "Nhận hàng bằng RFID" trên phiếu mới → extension cộng sổ theo dòng PO, nhận ra phiếu phần còn lại; khung Nextwaves "Phiếu phần còn lại — đã nhận trước ở GR…", "N UID cần quét (đơn M, trừ K món đã bán gấp)", "để **Giữ đơn mở**". Chọn "Đóng đơn dù còn thiếu" → đỏ. Nextwaves thiếu **đúng** món đã bán → coi là đủ, POS tự điền phần còn lại (không điền tem đã bán). Không chứng minh được → dừng an toàn như v0.4.0 | Món bán gấp: **bắt buộc quét QR** trên phiếu POS rồi mới HOÀN THÀNH (operator 08/11) — nhập số tay thì kiểm trước báo "sẽ KHÔNG điền được" → nhận tay. **Không mở Nextwaves nhận riêng món bán gấp** (mỗi phiếu gửi chỉ nhận một lần). Nextwaves vẫn đọc cả tem món đã bán (hàng còn trên đầu đọc) → khung POS báo tồn Nextwaves dư → báo vận hành. `docs/dev/CASE-PHIEU-PHAN-CON-LAI-20261107.md` |

## 5. Chưa làm / làm sau (ghi nhận 07/11)

| Hạng mục | Trạng thái | Khi nào |
|---|---|---|
| **Đầu đọc bị QR Scan Log giữ** | **v0.4.1:** nút "Lấy đầu đọc cho Nextwaves" (bấm hộ Ngắt, operator 08/11). Hợp đồng `circa-reader/v1` (mượn / trả không bấm hộ, `docs/dev/SPEC-QSL-MUON-DAU-DOC-v1.md` + `REQUEST-QSL-v0.4.1-DAU-DOC.md`): **QR Scan Log v0.9.7 đã đóng gói 09/11 (`5BD2C721…`, có M8), gr kiểm khớp**: cài POS thì luồng có phiếu tự mượn / trả (Nextwaves tự kết nối; nhận xong tab bán hàng tự kết nối lại, không chọn cổng). Đóng modal Nextwaves là đóng cổng (bundle production 08/11). gr v0.4.2: mượn / trả khi mở modal thẳng từ trang PO; trong phiên đóng modal thì trả; "Mượn lại đầu đọc" dùng lượt mới (`REQUEST-QSL` §9.3). **Operator 10/11: đầu đọc 100%, không báo lỗi** → v0.4.2 lấy / trả theo đúng lúc Nextwaves mở / đóng cổng, tự bấm Ngắt khi QR Scan Log không nhả đúng. Hai lỗi phía QR Scan Log: `REQUEST-QSL-v0.4.2-NHA-DAU-DOC.md` | **v0.4.2** (`PLAN-v0.4.2.md` mục C) |
| **Mã giao trên Nextwaves** (POS `thuocsi_delivery_code` = Nextwaves **`deliveryOrderCode`**, dạng `SOBD…-F` / `-P1` / `-P2`) | **Nextwaves đã có (10/11)**, trên `GET …/inter-tenant-orders/purchase-orders/<poId>` (API extension đã gọi cho từng ứng viên). Giá trị trùng mã giao của PO POS (PO-2026-000021 = `SOBD38573495-P1`). Đơn tạo trước 10/11 có giá trị `null`. Tìm `receiving?q=<mã giao>` ra đúng đơn. v0.4.1 không bị ảnh hưởng. Case: `docs/dev/CASE-MA-GIAO-NEXTWAVES-20261110.md` | Bản sau v0.4.1 (gộp v0.4.2): mở `…/receive?po=<mã giao>` → Nextwaves mở thẳng đúng đơn, SO tách giao không phải chọn. Đơn trùng mã giao → chọn, vẫn kiểm vân tay. Không đơn nào trùng → như hiện nay. **Operator duyệt 10/11 → v0.4.2** (`PLAN-v0.4.2.md` mục A) |
| Tự HOÀN THÀNH | Bỏ từ v0.4.0 (dược sĩ bấm) | Không có kế hoạch |
| **Phiếu phần còn lại** (bán gấp → POS tách phiếu) | **v0.4.1** (gói chờ QA). Còn để sau: I2 — món bán gấp nhập số tay (không quét QR) | Sau lượt thật đầu tiên |

## 6. Quy trình phát hành

1. Plan (`docs/dev/PLAN-*.md`) → operator duyệt khi đổi luật nghiệp vụ / ghi thật.
2. Code trên nhánh `batch/*` → test, đột biến, Edge thật, review độc lập → đóng gói (ZIP + SHA-256) → báo cáo `docs/dev/BATCH-*.md`.
3. **Cài máy dev** (operator cho phép; chép đè thư mục Chrome đang tải, operator Reload) → **QA / QC trên máy dev** theo `docs/dev/QA-<bản>-MAY-DEV.md`.
4. **QA / QC đạt** → operator cho phép cài **máy POS vận hành** → lượt đầu mỗi máy có `kiem-sau.js` → Claude đối chiếu.
5. Đạt → merge nhánh vào `main`.

Sửa trước khi cài máy POS: giữ nguyên số bản, đổi mã gói. Mỗi lần cài máy POS = một số bản.
