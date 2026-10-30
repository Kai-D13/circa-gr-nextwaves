# state.md — circa-gr-nextwaves

Cập nhật: **30/10/2026 (lần 58, G3 v0.3.0 ĐẠT trên GR03929 → staging done v0.3.0)**. Giai đoạn: **Chỉ còn operator + một phiên Claude Code (kiêm PM / engineer / QC / audit), quy tắc một người ghi (`agent.md` §2.1). v0.3.0 tự điền + tự HOÀN THÀNH một lần, gói `45E07F60`: G1 đạt 29/10 (`docs/dev/BATCH-v0.3.0.md`), G2 đạt 29/10 (đã cài staging), **G3 đạt 30/10** ở lượt 2 trên GR03929 / PO19854897 / SOBD1594182-F, 10 tem: 1 lượt nhận, 4 PUT detail, đọc lại khớp, đúng 1 PUT `status/COMPLETED`, `completeResult.source` auto, quyền đã tiêu (`docs/dev/KET-QUA-G2-G3-v0.3.0.md`). **Staging done v0.3.0**; operator đồng ý, đã merge `batch/v0.2-rfid` → `main` (`7bff255`). Hết PO staging. Bước tiếp: bản production (plan PRD). Production chỉ đọc tới gate PRD.** Luật làm việc và môi trường: `agent.md`.

## 0. Tóm tắt 30 giây

**Phiên giữ quyền ghi (`agent.md` §2.1):** Claude Code — phiên **"QR code scan log project (fork)"** (session `bf911b64…`). Operator chỉ định lại 29/10 tối trong chính phiên này (chọn "Phiên này giữ quyền ghi"), sau G2 / G3 lượt 1. Lịch sử: phiên này giữ quyền từ đêm 28/10 đến khi G1 v0.3.0 đạt; lần 56 (10:26) chuyển sang `qr-code-6a` (session `77fef381…`, không ghi gì thêm sau `34092a8`); lần 57 về lại đây. `qr-code-6a` và mọi phiên khác (gốc, `qr-code-b2`, fork mới, Codex) **chỉ đọc**. Worktree mã: `C:\QR_code\circa-gr-nextwaves-dev` (chuyển từ thư mục tạm của phiên sau khi đột biến v0.3.0 chạy xong).

- Đã hiểu luồng nhận hàng trên POS hiện tại (capture production 19/10, §1).
- Đã kiểm chuỗi khoá ba bên trên SO 38468903 (§2). Mã SO là khoá chung **ở production**. GR không có SO, nhưng PO của GR có SO.
- 24/10: người dùng chốt **build trên staging trước**.
  - Môi trường staging đã đủ ba bên: POS staging (cửa hàng 2222), Nextwaves `circa-stg`, Buymed `buymed-stag`.
  - Cặp thử: GR03877 ↔ PO Nextwaves PO28237814 (§2.1).
- **Phát hiện chính (lần 2):**
  - PO staging của GR03877 là `IMPORT_STOCK` tạo tay, **không có SO**, nên chuỗi SO không dùng được trên staging.
  - Cặp (`product_id`, số lượng đơn vị gốc) khớp **8/8 dòng** ở cả hai môi trường. Đây là "dấu vân tay" để tìm hoặc kiểm PO Nextwaves khi thiếu SO (§3).
- **Phát hiện chính (lần 3, §2.2):**
  - Staging đã có GR03878 sinh từ SO 1593858 (PO00006750). SO trùng `refId` của PO28237814, nên **chuỗi SO chạy được trên staging**.
  - Dấu vân tay khớp cả GR03877 lẫn GR03878 (R9 đã xảy ra). Vì vậy dấu vân tay chỉ để kiểm, không dùng làm cách tìm.
  - GR03878 có 2/3 dòng mà **số UID ≠ số lượng dòng** (6 UID cho 2 hộp; 4 UID cho 2 hộp), R11.
  - Phản hồi dev cho PM: `docs/dev/DEV-REVIEW-SPEC-STG-v0.1.md`.
- **Lần 4 (operator giải thích luồng thật, §2.3):**
  - PO Nextwaves do Nextwaves tự sinh khi nhận SO, **không bao giờ** trùng PO POS. PO / GR POS chỉ sinh khi Buymed giao thành công ⇒ khoá nối là **SO**.
  - API `/receiving` cho dòng giao kèm productId / sku / unit / UID ⇒ R10 đã giải.
  - Dev viết logic chi tiết đề xuất: `docs/dev/LOGIC-v0.1.md`.
- **Lần 5 (capture 24/10 chiều, §2.4) — đổi hướng lớn:**
  - **Nextwaves đã có tích hợp Circa**: liên kết PO Nextwaves ↔ GR Circa, đẩy hàng + UID và hoàn tất GR trên Circa.
    Đề xuất extension **không ghi POS**; chỉ tìm đúng PO, chuyển màn, đảm bảo liên kết và kiểm kết quả.
  - Không có nút: mở GR là tự chạy. Hai đường vào: trang GR và `/chi-tiet-so/<SO>`.
  - Logic mới: `docs/dev/LOGIC-v0.2.md` (thay v0.1).
- **Lần 6 (operator 24/10 tối, capture luồng đầy đủ) — `docs/dev/LOGIC-v0.3.md` thay v0.2:**
  - **Không dùng tích hợp Circa của Nextwaves.** Extension tự ghi GR trên POS.
  - "Xác nhận nhận hàng" = `POST /inter-tenant-shipments/<id>/receive-scan {onMissing, epcs}`.
  - PO28237814 bị Nextwaves từ chối `tagged_unit_unsupported` (dòng 1110 theo vỉ; đơn vị gốc Nextwaves là hộp) ⇒ **chưa nhận được (K1)**.
  - Web Nextwaves đọc reader bằng Web Serial. Danh sách PO Nextwaves không có SO.
- **Lần 7 (24/10 khuya, `LOGIC-v0.3.md` §9):**
  - Operator chốt: **Q1** dùng API thường của Nextwaves (không dùng `/integrations/circa/*`); **Q3 = W1** (extension `PUT …/detail`); chưa gỡ K1.
  - Tra QR POS staging được UID Circa (lô + hạn, dùng cho Soffell); `circaReceiptCode` / `circaUnitName` rỗng.
  - Mẫu nhận thành công của Nextwaves đi đường hub-order (không dùng); phần dùng được là `GET /purchase-orders/<id>` sau khi nhận.
- **Lần 9 (24/10 khuya, operator chốt a–d, dev build):**
  - Dược sĩ bấm HOÀN THÀNH. Khi Nextwaves nhận xong, extension đưa về POS và **điền sẵn mọi UID đã map** (W1) để dược sĩ không quét tay.
  - Bắt theo `thuocsi_delivery_code`: 1 mã giao ↔ 1 PO POS ↔ 1 GR. Không cần chế độ nhập hàng POS. Đích chuyển màn: `/vi/purchases/receive?po=<SO>`.
  - Dev build xong v0.1 (`docs/dev/BATCH-v0.1-STG.md`):
    - 48 test, gồm chạy trọn luồng trên trình duyệt giả; đột biến 8/8 bị bắt.
    - Service worker và hook nạp được trên Edge thật.
  - Chưa thử với dữ liệu thật phần sau khi nhận (K1), và chưa kiểm hợp đồng ghi W1 (P1).
- **Lần 10 (24/10, PM audit):** PM chạy lại 48/48 test local; ZIP và bản giải nén khớp 16/16 file của `a08d541`. Audit `docs/pm/AUDIT-BATCH-v0.1-STG-20261024.md` kết luận **chưa qua gate merge/ghi**: tìm PO trên tập ứng viên có thể chưa đầy đủ, UID có sẵn sai lô vẫn bị coi đã điền, chế độ `auto` không có phép từng lượt, kiểm cửa hàng trực tiếp GR chưa bắt buộc đủ trường, và lease một tab có thể hết hạn khi PUT còn chạy. K1 và W1 thật vẫn thiếu bằng chứng.
- **Lần 11 (24/10 khuya, dev sửa):** v0.1.1 `d124453`, gói `D8CD9AFD` (`C:\circa-gr-nextwaves-v0.1.1`). Báo cáo `docs/dev/FIX-AUDIT-BATCH-v0.1-STG.md`.
  - **Bỏ chế độ ghi lâu dài.** Ghi W1 chỉ khi operator **cấp phép một lần cho một mã GR** trong popup (30 phút) và bấm nút mang mã kế hoạch. Production chỉ đọc.
  - Đã sửa P1.1–P1.5 và P2.1–P2.3; khoá ghi P3 (SO nhiều GR / Nextwaves nhiều đơn cùng SO).
  - 73 test, đột biến 32/32 (dev tự báo; `scripts/mutate-v0.1.1.py` để PM chạy lại).
  - Vẫn chưa có bằng chứng staging thật: K1, W1, hợp đồng "đã nhận" theo đường inter-tenant.
- **Lần 12 (24/10, PM audit lại):** PM chạy `npm test` tại `d124453`: 73/73; đối chiếu ZIP và bản cài 17/17 file. Báo cáo `docs/pm/AUDIT-v0.1.1-STG-20261024.md`: P1.1–P1.5/P2.1–P2.3 có sửa local, nhưng **chưa qua gate merge/ghi**. Phát hiện P1.6: tìm GR theo SO bỏ qua `data.total/page/limit`, có thể mở khoá ghi trên danh sách thiếu. P1.7: `nwWriteLocks` có thể bị xoá qua `session:update`. Cả hai đã tái hiện trên browser-sim. K1/W1 vẫn thiếu bằng chứng live.
- **Lần 13 (24/10 khuya, dev sửa):** v0.1.2, gói `525BCE84` (`C:\circa-gr-nextwaves-v0.1.2`). Báo cáo `docs/dev/FIX-AUDIT-v0.1.1-STG.md`.
  - P1.6: tìm GR theo SO phải đủ `total / page / limit` và đủ trường từng dòng (không lọc rồi đếm). Thiếu → khoá ghi (đường GR) hoặc dừng (đường `/chi-tiet-so`).
  - P1.7: `session:update` chỉ đổi `state`. Khớp đơn Nextwaves qua `session:nwMatched` một lần, từ trang Nextwaves. Message ghi kiểm nguồn gửi.
  - 78 test; đột biến 47/47 trên `5d117d2` (lần đầu 46/47, đã thêm test). Nextwaves và POS đều **fail closed ở một trang** (chưa phân trang).
- **Lần 14 (24/10, PM audit v0.1.2):** `docs/pm/AUDIT-v0.1.2-STG-20261024.md`. PM chạy lại 78/78 test, kiểm ZIP và bản cài 17/17 file khớp source; P1.6/P1.7 đóng ở mức source/test local. Dev tự báo 47/47 đột biến, PM chưa chạy lại. T1 chỉ đọc bằng v0.1.2 có thể chạy; chưa qua gate merge/ghi vì K1, response thật sau nhận và W1 còn thiếu. P2.4: trước khi nâng cấp giữ cùng extension ID, cần xử lý phiên active từ bản cũ thiếu khoá.
- **Lần 15 (25/10, dev xử lý P2.4):** v0.1.4, gói `10A29BC4` (`C:\circa-gr-nextwaves-v0.1.4`). Báo cáo `docs/dev/FIX-AUDIT-v0.1.2-STG.md`.
  - **P2.4:** phiên / cấp phép mang `schema`. Thứ của bản cũ:
    - không được ghi (`session_outdated`), không tìm lại được, không nhận khớp đơn / lượt nhận;
    - mở lại phiếu → phiên mới thay thế, kiểm lại khoá;
    - `onInstalled` (update) xoá phiên + cấp phép cũ, ghi `lastUpgrade`.
    - Edge thật: nâng cấp 0.1.2 → 0.1.4 **cùng extension ID** → phiên / cấp phép cũ bị xoá.
  - **Thêm:** chống vòng lặp tạo phiên trên POS (không gọi API lặp nếu background không trả lại phiên vừa tạo).
  - Bộ test: sửa 3 lỗi của trình duyệt giả có thể làm treo file test. 82 test; đột biến 58/58 trên `49bf0a4`, không ca nào do hết giờ.
  - v0.1.3 `DF493307` chỉ dựng nội bộ, không giao.
- **Lần 16 (25/10, PM audit v0.1.4):** `docs/pm/AUDIT-v0.1.4-STG-20261025.md`. PM chạy lại 82/82 và 5 lần liên tiếp đều đạt; kiểm ZIP và bản cài 17/17 file khớp source. P2.4 và chốt chống vòng lặp đạt gate source/test local. Dev tự báo 58/58 đột biến và Edge nâng cấp giữ ID; PM chưa chạy lại đột biến/Edge. T1 chỉ đọc được phép; K1, response thật sau nhận và W1 vẫn chặn gate merge/ghi.
- **Lần 17 (25/10, T1 lần 1 + dev sửa):**
  - **T1 lần 1:** operator chạy với v0.1.4. Khung POS báo "Lỗi extension — Cannot read properties of undefined (reading 'envFromConfig')", không mở Nextwaves.
  - **Nguyên nhân** (tái hiện trên Edge thật): `lib/env.js` khai ở cả mục MAIN và ISOLATED của `content_scripts`; trình duyệt chỉ nạp một lần vào MAIN, nên ISOLATED thiếu `env`. Có từ v0.1.0.
  - **Sửa v0.1.5** (`456205a`, gói `CDD02C3D`, `C:\circa-gr-nextwaves-v0.1.5`): `src/main/env.js` là bản sao y hệt cho MAIN; thêm test manifest; trình duyệt giả nạp như Chrome; thêm `scripts/edge-check.js` kiểm trên trình duyệt thật (v0.1.5 9/9, v0.1.4 6/9).
  - Báo cáo `docs/dev/FIX-T1-v0.1.5.md`. **T1 chạy lại với v0.1.5** theo `docs/dev/T1-STG-HUONG-DAN.md`.
- **Lần 18 (25/10, PM audit sửa T1):** `docs/pm/AUDIT-T1-FIX-v0.1.5-STG-20261025.md`. PM chạy 85/85 test, kiểm gói và bản cài 18/18 file; tự chạy Edge v0.1.5 đạt 9/9, v0.1.4 hỏng 6/9 và tái hiện đúng `envFromConfig`. Dev tự báo 60/60 đột biến, PM chưa chạy lại. **Chỉ v0.1.5 được dùng cho T1 chạy lại**; chờ ảnh/response trên phiên đăng nhập thật. K1/W1 và gate merge/ghi không đổi.
- **Lần 19 (25/10, T1 lần 2 với v0.1.5):** báo cáo `docs/dev/T1-KET-QUA-v0.1.5-20261025.md`.
  - Operator chạy trên phiên Chrome đăng nhập thật, không cấp phép, không bấm nhận. Kết quả: hết lỗi nạp script; tab Nextwaves tự mở; khung Nextwaves "Sẵn sàng nhận hàng"; dòng "Tìm theo SOBD1593858: total 1, đã đọc 1; ứng viên Buymed cùng kho 1; refId đúng SO 1"; SL gốc 3 sản phẩm khớp; khung POS "Đã khớp đơn Nextwaves — chờ nhận hàng".
  - Response thật: tìm GR theo SO có total 1 / page 1 / limit 1000, chỉ GR03878, trùng mẫu 24/10; tìm đơn Nextwaves có total 1, PO28237814. Dev chạy lại qua parser: không khoá ghi, chọn đúng đơn.
  - Lưu vào `samples/*-T1-20261025.json` + `tests/t1-real.test.js` (nhánh `0b9aeb3`, không đổi `src/`, 87/87).
  - Còn thiếu ảnh popup bước 3.8 (dòng phiên + "Khoá điền").
- **Lần 20 (25/10, PM audit T1 live):** `docs/pm/AUDIT-T1-LIVE-v0.1.5-STG-20261025.md`. Operator đã gửi ảnh popup: `STG · GR03878`, đã khớp PO28237814, không có dòng "Khoá điền". PM đối chiếu hai fixture với hai Copy response thật: JSON trùng hoàn toàn; chạy 87/87 test trên `0b9aeb3`, không đổi runtime. **Đóng gate T1 chỉ đọc.** Operator chọn giữ SO staging hiện tại để thử luồng; đơn hiện tại có thể dùng để kiểm nhánh lỗi K1 với phép riêng, nhưng `400 tagged_unit_unsupported` không đạt T3. T3 thành công vẫn cần sửa K1 hoặc SO staging khác; W1/merge còn chặn.
- **Lần 21 (25/10 23:46, operator bấm nhận trên PO28237814 — dev ghi):**
  - **`receive-scan` trả 200:** 12/12, `orderStatus received`, không tem lạ. **K1 đã được Nextwaves sửa** (dòng 1110 theo vỉ nhận được).
  - Biên nhận PO GRN96438872 `7bec38d2…` (khác id receipt inter-tenant `ea603c18…`).
  - Phiếu gửi có timeline `accepted` 16:46:06.155 → `received` 16:46:06.224, tức chấp nhận và nhận nằm trong cùng lượt `receive-scan`.
  - Dev chạy lại dữ liệu thật (Net Capture tab Nextwaves) qua `buildReceivedUnits`: không có problem, 0 thiếu, 0 lạ, 1 biên nhận mới, đúng kho. **Hợp đồng "đã nhận" P2.1 khớp response thật.**
  - Extension tự về POS (kế hoạch #60070071, 12 UID / 6 lô). **Operator tự cấp phép và bấm điền (W1) trước gate PM**; khung báo "đã điền 12 UID".
  - **Không có traffic PUT phía POS** (Net Capture chỉ ghi tab Nextwaves, dừng 23:46:44), nên W1 trên GR03878 chưa đủ bằng chứng.
  - Operator chọn chạy trọn luồng trên SO staging khác (còn 2 PO) theo `docs/dev/FULL-STG-HUONG-DAN.md`.
  - Mẫu T3 thật chưa lưu vào `samples/`; dev sẽ gộp cùng lượt mới.
- **Lần 22 (26/10, dev lưu mẫu T3, chưa có lượt mới):** báo cáo `docs/dev/T3-KET-QUA-PO28237814-20261025.md`, chờ PM audit.
  - Nhánh `afd98d5`, không đổi `src/`:
    - 7 mẫu Nextwaves thật (PO / `/receiving` trước – sau, `receive-scan` 200, phiếu gửi sau, tìm theo SO sau);
    - `tests/helpers.js` dùng mẫu thật thay phần dựng lại;
    - +6 test → 93/93; đột biến 60/60 bị bắt (`mutate-v0.1.5.py` chạy một mình, không ca nào do hết giờ).
  - Bản dựng lại cũ trùng hoàn toàn dữ liệu thật qua parser. **Mã kế hoạch tính lại = #60070071 = khung POS thật**, tức cách phân bổ 12 UID / 6 lô khớp, gồm cả UID Soffell giả định.
  - Trong lượt đó extension chỉ gọi 3 GET Nextwaves. `integrations/circa/hub-orders` (404) là của web Nextwaves.
  - **Sự thật mới:** sau khi nhận, tìm theo SO trả `total 0` và `/receiving` có `shipments []`.
    - Phiên mất giữa "Nextwaves đã nhận" và "POS đã điền" → mở lại GR báo "Không có đơn Nextwaves khớp", không điền được (O1, fail closed).
    - Phiên mất ở đây là: huỷ / xoá phiên, nâng cấp extension, hoặc quá 24 giờ không cập nhật.
  - **Gấp:** nhật ký nằm trong phiên, và phiên quá 24 giờ không cập nhật bị xoá. Phiên GR03878 (điền khoảng 23:49 ngày 25/10) mất từ khoảng 23:49 ngày 26/10.
    - Operator cần làm bước 12 (export storage) trước 23:00 ngày 26/10. Đã ghi đầu `FULL-STG-HUONG-DAN.md`.
- **Lần 23 (26/10 12:08–12:33, chạy trọn luồng lần 1 — GR03880 / PO00006754 / SO 1593849 ↔ PO76458756):** báo cáo `docs/dev/FULL-KET-QUA-GR03880-20261026.md`.
  - Operator gộp T1 → T3 → W1 → HOÀN THÀNH trong một lượt staging.
  - Bằng chứng: Net Capture tab POS (điền + HOÀN THÀNH), export chrome.storage, Net Capture tab Nextwaves (chỉ có tìm theo SO sau nhận).
  - **T1 đạt.** **T3 đạt:** `receive_scan` 200; HAR tab màn quét (request, không body) cho thấy 11 EPC gửi = dự kiến = đã nhận.
  - **Kế hoạch #E33C777A:** dev tính lại từ dữ liệu thật ra đúng mã đó.
  - **W1 đạt:** 5 PUT 200 khớp từng bước (thứ tự + body). GR → RECEIVING.
  - **HOÀN THÀNH đạt:** `status/COMPLETED` 200 → COMPLETED.
  - **Sự thật mới:** sau HOÀN THÀNH, POS thêm mỗi chi tiết đúng `received_quantity` mã QR mới, không phải UID Nextwaves.
    - Extension chặn kế hoạch trên phiếu đó (`gr_has_foreign_codes`).
    - Không dùng mã QR của GR đã COMPLETED để đối chiếu UID.
  - **GR03878 (25/10):** nhật ký storage có 6 `apply_done` (#60070071) → `applied`.
  - Nhánh `25082b2`: 10 mẫu thật + `tests/full-real.test.js` (6). `7eadfe3` sửa test P1.3 chạy đua (3/15 → 0/25). `fa66de6`: request receive-scan từ HAR + 1 test. Không đổi `src/`; 100/100.
  - P3: tra QR lặp 3 vòng / lượt; `at` của `scan_ok` dạng số.
- **Lần 24 (26/10, PM audit T3/W1):** `docs/pm/AUDIT-T3-W1-FULL-STG-20261026.md`. PM kiểm Net Capture gốc: `receive-scan` PO28237814 trùng fixture, 12/12 và biên nhận mới; 5 PUT GR03880 trùng request gốc, mỗi GET sau ghi đúng UID/lô, GR chuyển RECEIVING; POS `COMPLETED` 200 và GET sau là COMPLETED. HAR đã lọc của PO76458756 có request/status 200, thiếu body response. Chạy 100/100 test trên `fa66de6`, test P1.3 riêng 20/20 trên `7eadfe3`; `src/` không đổi. **T3 và W1 đạt gate staging, cho merge nhánh; production chỉ đọc.** GR03878 thiếu traffic POS riêng. O1 chấp nhận fail-closed ở staging, phải giải trước production hoặc stakeholder chấp nhận nhập tay. Sau HOÀN THÀNH có 5 mã QR mới khác UID Nextwaves, nguồn/ảnh hưởng kinh doanh chưa xác định; cần tra QR và chốt trước production. P3 đọc QR lặp/giờ log để sau.
- **Lần 25 (26/10, merge + PM review UI sơ bộ):** Dev đã merge `fa66de6` vào `main` tại `aa42dcc`; PM kiểm parent merge và `src/` trên `main` trùng v0.1.5. Dev làm bản sửa khung v0.1.6 trên `batch/v0.1.6-ui` (`b4017d7`), báo 106/106 test 10 lượt, Edge POS giả 12/12 (v0.1.5 hỏng 2/12); 65 ca đột biến và gói còn đang chạy. PM review source trong `docs/pm/REVIEW-UI-v0.1.6-PRELIM-20261026.md`: chưa cho phát hành/cài, cần gói và kiểm nút trên POS/Nextwaves staging thật. Quy đổi vỉ → hộp: giữ chặn toàn GR nếu một lô lẻ, không làm tròn hoặc điền một phần trong batch UI; không mặc định nhập tay được 0,5 hộp.
- **Lần 26 (26/10, dev hoàn tất gate source / gói v0.1.6):** báo cáo `docs/dev/FIX-UI-v0.1.6.md`.
  - Đột biến `mutate-v0.1.6.py` **65/65 bị bắt** (60 cũ + 5 ca khung), chạy một mình, 0 ca hết giờ, 0 neo lệch.
  - **Gói v0.1.6 `34B4AE1A`** (sha256 `34b4ae1a…`, 18 file) từ commit sạch `b4017d7`; giải nén `C:\circa-gr-nextwaves-v0.1.6` khớp `src/` từng file; `edge-check` trên bản giải nén 12/12. Nhánh đã push.
  - Chưa cài cho operator: chờ PM audit gói, sau đó lượt xem UI chỉ đọc theo `FIX-UI-v0.1.6.md` §6.

- **Lần 27 (26/10, PM audit độc lập UI v0.1.6):** `docs/pm/AUDIT-UI-v0.1.6-SOURCE-PACK-20261026.md`. PM chạy 106/106 test, tự dựng ZIP từ `b4017d7` ra đúng SHA-256 `34b4ae1a1cd38f2c713eeed28aaf874e571a7b9ad6323a7a745e6fea42bf077c`, 18/18 file source = ZIP = bản giải nén. Edge trên bản giải nén 12/12 đạt; đối chứng v0.1.5 hỏng đúng 2/12 ca chồng nút; 5/5 đột biến mới bị bắt, không timeout. Số 65/65 toàn bộ là kết quả dev báo, PM chưa chạy lại 60 ca cũ. **Cho operator cài v0.1.6 để kiểm UI chỉ đọc trên staging thật; chưa cho dùng để nhận/điền, chưa merge UI.** Cần ảnh nút thao tác thực trên POS/Nextwaves trước gate tiếp theo.
- **Lần 28 (26/10, operator yêu cầu mới → dev đề xuất kế hoạch v0.2):** `docs/dev/PLAN-v0.2-RFID-BUTTON-PROD.md`, **chờ PM duyệt spec**.
  - Yêu cầu operator:
    - nút "Nhận hàng bằng RFID" trên **danh sách** phiếu nhận POS (như "View on Nextwaves" của extension Nextwaves `circa-rfid`, dev chỉ đọc mã tham khảo);
    - audit đủ cho E2E / production;
    - sửa lỗi tồn;
    - không làm chậm POS.
  - Operator chốt:
    - bấm trên danh sách thì bắt đầu ngay, tab POS ở lại danh sách; nhận xong tự về trang phiếu;
    - **bỏ tự chạy khi mở phiếu, chỉ chạy khi bấm nút** (đảo quyết định 24/10);
    - production đợt đầu **chỉ Florita**.
  - Đợt 0 (không code):
    - operator xem UI v0.1.6 chỉ đọc;
    - operator gửi outerHTML dòng danh sách / vùng nút HOÀN THÀNH, capture đơn Nextwaves đã nhận (O1), tra QR `1791530171312AA1`, thông tin máy Florita.
  - Đợt 1 (v0.2.0, staging):
    - lối vào mới (danh sách + trang phiếu, click mới chạy);
    - cache tra QR + lọc refresh;
    - `scanAt` ISO;
    - giữ `x-store-id`;
    - Abort khi rời trang;
    - đổi URL theo sự kiện;
    - panel nhẹ hơn;
    - ngân sách hiệu năng đo trên Edge.
  - Đợt 2:
    - O1 (giữ phiên `received` / `applying`, khôi phục theo capture);
    - PRD Florita (allowlist, `writeEnabled` false) → T1-PRD chỉ đọc → gate W1-PRD.

- **Lần 29 (26/10, PM duyệt hướng v0.2 và gate):** `docs/pm/REVIEW-PLAN-v0.2-RFID-BUTTON-PROD-20261026.md`. PM kiểm source v0.1.5/v0.1.6 và commit `650c24a`: chưa có runtime/test/ZIP v0.2. Duyệt hướng bấm nút trên danh sách mới tạo phiên, POS ở danh sách đến khi Nextwaves nhận xong rồi về GR; phiên đã tồn tại vẫn tự tiếp tục. Đợt 0 chỉ đọc được làm; Đợt 1 theo spec PM sau ảnh UI v0.1.6 thật và response/outerHTML danh sách đã làm sạch. P1: `gr_list` phải có nhánh riêng, dữ liệu dòng chỉ gợi ý UI và GET GR/PO phải xác minh lại, không ghép header cửa hàng qua phiên khác, huỷ lượt chuẩn bị khi đổi trang, giới hạn `returnUrl`. P2: cache/refresh, hiệu năng, panel tránh nút, nâng cấp giữ ID có gate riêng. O1/production Florita cần spec/gate riêng; chưa duyệt ghi production hoặc E2E ghi staging mới.
- **Lần 30 (26/10, dev cập nhật kế hoạch theo review PM):** `docs/dev/PLAN-v0.2-RFID-BUTTON-PROD.md` thêm **"Spec Đợt 1 — rev 1"** (S1–S8).
  - S1: dòng danh sách chỉ là gợi ý; khi bấm đọc lại GR / PO và kiểm đủ trước `session:start`.
  - S2: nhánh `gr_list` riêng, một bộ điều khiển; không tự tạo phiên; phiên cũ tiếp tục; không tạo trùng.
  - S3: header cửa hàng đã xác nhận / chưa xác nhận.
  - S4: Abort + kiểm sau mỗi `await`; background tự dựng `returnUrl`.
  - S5: hợp đồng response danh sách + nút.
  - S6: cache QR theo `nwResult.at` + lọc refresh.
  - S7: giữ panel v0.1.6 tới khi có DOM thật; đo hiệu năng so baseline.
  - S8: hướng dẫn nâng cấp.
  - Kèm danh sách test G1. **Chưa code, chờ G0.**

- **Lần 31 (26/10, PM kiểm plan rev 1):** `docs/pm/REVIEW-PLAN-v0.2-REV1-20261026.md`. Dev đã commit nguyên trạng tài liệu PM ở `f12934a`; `1b03c5c` chỉ sửa plan/state, chưa có runtime/test/ZIP v0.2. Rev 1 xử lý phần lớn finding P1/P2, được chấp nhận làm nền. Cần chỉnh lý P1: cấp `seq` khi request danh sách bắt đầu và đối chiếu query/filter/page để response cũ không đè mới; vô hiệu cú bấm nếu dòng hoặc bộ lọc đổi giữa các GET dù URL không đổi. G0 vẫn chờ ảnh UI v0.1.6 thật, response danh sách và outerHTML đã làm sạch; chưa cho code Đợt 1.
- **Lần 32 (26/10, dev bổ sung Spec rev 2 theo PM):** `docs/dev/PLAN-v0.2-RFID-BUTTON-PROD.md`.
  - R1: `reqSeq` cấp lúc **gửi** request danh sách + `queryKey`; chỉ nhận response của request mới nhất; request mới nhất lỗi thì xoá nút.
  - R2: `clickToken` gắn dòng `<tr>` + lượt danh sách + `queryKey` + route. `stillValid` kiểm sau mỗi `await` và ngay trước `session:start`; huỷ chủ động khi có request danh sách mới hoặc dòng đổi.
  - Ghi chú P2: long task đo bằng trace CDP, thiếu attribution không tính đạt. Đợt 1 bản đầu đánh dấu đã thay; sẽ hợp nhất spec khi giao code.
  - **Chưa code, chờ G0.**

- **Lần 33 (26/10, PM sửa điều kiện khởi công):** `docs/pm/CORRECTION-G0-v0.2-20261026.md` thay quy tắc “không code đến G0” ở các review trước. Dev được code/test v0.2 ngay trên nhánh riêng từ `b4017d7`. UI/response/DOM thật dùng để chốt selector/hợp đồng, Edge và gate merge/cài, không phải đầu vào bắt buộc cho mọi code. Dev/PM tự lấy bằng chứng chỉ đọc trên máy staging nếu có phiên đăng nhập; operator chỉ hỗ trợ nếu cần. Lượt nhận/ghi staging vẫn cần operator cho phép riêng, production chỉ đọc.

- **Lần 34 (27/10, dev giao v0.2.0):** `docs/dev/BATCH-v0.2.0.md` (spec hiệu lực rev 1 + rev 2, diff, test, đột biến, Edge, hiệu năng, G0 còn thiếu, cài đặt).
  - Nhánh `batch/v0.2-rfid` từ `b4017d7`: `24d0070`, `d7d2cbd`, `b0129a4`, `ef67a7b` (runtime cuối), `682c509` (chỉ test). Gói `096D97D9`, giải nén `C:\circa-gr-nextwaves-v0.2.0`. **Chưa cài.**
  - `npm test` 131/131. Đột biến 93/93 (lượt 2 sót 1 ca; sửa test `682c509`, chạy lại ca 76–93: 18/18). Edge thật trên bản giải nén 16/16 (v0.1.6 đối chứng hỏng 6/16).
  - Đột biến lần 1 sót 6 ca. Nguyên nhân chính: GET hết giờ bị coi là "huỷ", báo nhầm "Danh sách đã đổi" và che test R2 → đã sửa mã + test.
  - Hiệu năng (Edge, trang giả):
    - danh sách 20 dòng: mỗi lượt quét ≤ 1,8 ms;
    - bão 300 thay đổi DOM: 2 lượt, tổng 1,2 ms; CPU extension 5,0 ms / trang 22,3 ms;
    - trang bán hàng: 0,0 ms, 0 request.
    Chưa có baseline trên POS thật.
  - G0 còn thiếu: ảnh UI v0.1.6, Copy response danh sách GR, outerHTML dòng danh sách / vùng nút HOÀN THÀNH. Selector `gr-list.js` dựa trên giả định theo extension Nextwaves.

- **Lần 36 (27/10, dev giao v0.2.1 theo PM audit v0.2.0 — mục 35):** `docs/dev/BATCH-v0.2.1.md`.
  - Nhánh `batch/v0.2-rfid` `cbac491` (đã push). Gói `E34FF7C5`, giải nén `C:\circa-gr-nextwaves-v0.2.1`, tái lập cùng SHA từ checkout sạch. **Chưa cài.**
  - P2.1: hook chỉ gửi lại lượt danh sách **mới nhất đã gửi** (kết quả, hoặc đang chờ); response lượt cũ về muộn không ghi vào. Test hook + hook thật → content nạp muộn; cả hai hỏng trên hook cũ.
  - P2.2: ngưỡng < 2 ms áp cho cả lượt lúc tải trang (mục Edge riêng, 17 mục). `gr-list.js`: một bộ nghe capture ở document, nút clone từ mẫu, chia lát ~1 ms, làm ấm phần chỉ tốn lần đầu trong hai task riêng.
    - Lượt tải trang tối đa 1,0–1,3 ms (v0.2.0 cùng buổi: 3,7–7,0 ms, hỏng mục mới).
    - Danh sách 200 dòng: tối đa ≤ 1,4 ms mỗi lát (v0.2.0: 2–9,5 ms một lượt).
  - `npm test` 133/133 × 3; đột biến 96/96; đột biến DOM trên Edge 3/3; Edge 17/17 (src × 5, gói × 2).
  - G0: operator cho phép dev dùng Claude in Chrome **chỉ đọc** trên Chrome đã đăng nhập staging, và sẽ cài v0.1.6 để kiểm khung. Lúc giao, Claude in Chrome chưa kết nối.

- **Lần 38 (27/10, dev giao G0 trang thật + v0.2.2 theo PM audit v0.2.1 — mục 37):** `docs/dev/BATCH-v0.2.2-G0.md`.
  - **Cách lấy:** Claude in Chrome không kết nối → operator chọn trình duyệt trong app, **tự đăng nhập** POS / Nextwaves staging. Dev chỉ đọc (không token / cookie / header; không nhận / điền / HOÀN THÀNH).
  - **G0.1 response danh sách thật khớp parser:** 76 KB / 20 dòng, `data.goods_receipts[{id, code, status, purchase_order_id, pos_info.id}]`, `total/page/limit`; không tên nhân viên. Phân tích của hook trên body thật ≤ 0,8 ms.
  - **G0.2 DOM thật khớp `gr-list.js`:** bảng MUI, mã ở ô đầu, ô cuối `div.flex`.
    - Chạy `gr-list.js` nguyên văn trong trang (cục bộ): 7/7 nút đúng dòng; click thật vào nút không mở dòng (đối chứng bấm dòng thì mở).
    - Tìm ra **F1**: nút 28px làm dòng 57 → 61px.
  - **G0.3:** thanh HỦY / HOÀN THÀNH cố định góc dưới phải (vị trí thật đã ghi). Màn quét Nextwaves là modal, "Xác nhận nhận hàng" ở cuối thân cuộn.
    - Tìm ra **F2**: khung không đặt lại khi cuộn → che nút tới 1 s sau khi cuộn.
    - Ảnh khung với extension cài thật **chưa có**: pane không nạp được extension, Chrome không kết nối.
  - **G0.4 hiệu năng toàn bộ tác vụ (trace CDP, trang dựng từ DOM thật):**
    - Trạng thái thường mỗi lời gọi < 2 ms (cả lúc máy bận).
    - Hai lời gọi một lần mỗi lượt tải danh sách (hook parse 76 KB; content xử lý tin danh sách): ≤ 1,5 ms lúc máy yên, 1,9–3,6 ms lúc máy bận. v0.2.1 cùng lúc cao tương đương.
    - Nạp script một lần mỗi trang 5–30 ms tuỳ tải; không tác vụ nào ≥ 50 ms.
    - Trên trang thật: `show()` cả `querySelectorAll('tr')` 1,4 ms, riêng bước lấy dòng ≤ 0,2 ms.
    - Dev đề nghị PM chốt định nghĩa ngân sách; nếu cần < 2 ms cho cả hai lời gọi một lần → v0.2.3 tách task.
  - **v0.2.2** (`a1975f1`, gói `AB96179D`): F1 nút 24px; F2 khung đặt lại khi cuộn (capture ở document, rAF).
    - Edge 25 mục dựng theo DOM thật: v0.2.2 25/25; v0.2.1 hỏng 3/25 đúng F1 / F2.
    - Đột biến DOM 6/6; `npm test` 133/133; đột biến Node 96/96; Edge trên gói giải nén 25/25 × 7. **Chưa cài.**

- **Lần 41 (27/10, dev giao v0.2.3 theo PM review G3a — mục 40):** `docs/dev/BATCH-v0.2.3.md`.
  - **F3:** nhãn "Nhận hàng bằng RFID" / "Đang kiểm…" / "Mở Nextwaves" / "Mở phiếu"; `title` = `aria-label` = mã GR + trạng thái phiên (chữ + mã) + hành động. Nút ≤ 150px, ellipsis, cao 24px; `syncRow` so cả `title` / `aria-label`.
  - **F4:** danh sách không dùng khung nổi; huỷ / lỗi / không liên kết báo trong khối thông báo **trong luồng trang ngay trên bảng** (Đóng; gỡ khi rời trang / bấm lại).
  - **Kiểm:**
    - `npm test` 135/135 × 3; đột biến Node 102/102 (2 ca sót lượt đầu do thiếu test → sửa test `f76cbcc`, chạy lại 6/6); DOM 9/9.
    - Edge 41 mục (1095×756 / 1366×768 / 1440×900, trước / sau bấm / received / applied, thông báo lỗi không phủ 29 điều khiển, rời / quay lại, đổi trang, tải lại): gói 41/41 × 2; v0.2.2 hỏng 7/41 đúng F3 / F4.
  - **Hiệu năng:** lượt quét gồm lấy dòng 1,0–1,2 ms; tác vụ dài nhất 6,7–7,0 ms. **Chưa cài.**
  - Ghi phương án P2 (khung trang phiếu che "SL nhận" ở 1095px): dev khuyên mặc định thu nhỏ khi không cần thao tác + hướng dẫn thu nhỏ; chờ PM chọn.

## 1. Luồng nhận hàng hiện tại trên POS (capture Net Capture, POS-02 Florita, 19/10/2026, production)

Nguồn: `Downloads\net-capture-2026-10-19T04-47-41.zip` (chứa token thật, KHÔNG đưa vào project). 2 GR nhận trọn, 31 lượt quét, 31/31 khớp.

1. Mở `/danh-sach-phieu-nhan-hang/<grId>` → `GET /v1/order/goods-receipt/<grId>`.
   - `items[]` có quantity theo đơn vị dòng, base_quantity, unit_id, retail_units, lots[] ứng viên.
   - `items[].details[]` có lot_id, lot_date `LOT-ddmmyy`, quantity, received_quantity, thuocsi_qr_codes. Detail đã tạo sẵn theo lô từ PO.
2. Chọn **Chế độ nhập hàng**: Điền thủ công (mặc định) / Scan QR tăng SL nhận / Scan QR + in tem thường / Scan QR + in tem RFID.
   Đây là state trên trang, mất khi tải lại.
3. Mỗi lượt quét:
   - Chuỗi quét phải chứa `/qr/`, lấy phần mã phía sau.
   - `GET pos.v2.circa.vn/thuocsi-warehouse/qrcode?code=<mã>` → productId, circaSku, lot, expiredDate (DD-MM-YYYY), circaReceiptCode (= mã PO POS), circaUnitName.
   - Khớp dòng theo productId. Nhiều dòng cùng sản phẩm: ưu tiên dòng có unit `buymed_base_unit`, rồi convert_rate lớn nhất; dòng đầy thì chuyển dòng còn thiếu cùng unit.
   - Khớp detail theo lô + hạn → `PUT /v1/order/goods-receipt/<gr>/item/<item>/detail/<detail>`, body
     `{detail:{received_quantity: <CỘNG DỒN>, lot_id, thuocsi_qr_codes:[<mã vừa quét>]}}`. Server nối mã vào danh sách.
   - Không có detail khớp → `POST …/item/<item>/detail` (lô có sẵn) hoặc tạo lô trước.
   - Đủ số lượng → "Số lượng đã nhận vượt quá số lượng cần nhận!".
   - Client **không** kiểm mã đã quét trong phiếu.
4. **HOÀN THÀNH** → `PUT …/status/COMPLETED` (không body). **HỦY** → `status/CANCELED`.
   - Trạng thái đi từ WAITING_TO_RECEIVE qua RECEIVING tới COMPLETED.
   - Florita bật `is_auto_put` → có phiếu PUT sau khi hoàn thành.
5. Bất thường: sau COMPLETED, `thuocsi_qr_codes` của mỗi detail **nhân đôi** (mỗi mã 2 lần, thứ tự đổi). Bên đọc danh sách phải loại trùng.
6. Thời gian: tra QR khoảng 86 ms, PUT khoảng 183 ms, quét → xong khoảng 0,28 s (trung vị).

## 2. Chuỗi khoá ba bên (đã kiểm trên SO 38468903, dữ liệu production)

```
POS  GR 2eea8d52 (GR82004)
      └─ purchase_order_id ─► PO POS 5b4a9f0a (PO01970951)        samples/po-prod-PO01970951-SOBD38468903.json
                               ├─ goods_receipts: [GR82004]        ← khớp hai chiều
                               ├─ sale_order_number: "38468903"
                               ├─ thuocsi_delivery_code: ["SOBD38468903-F"]
                               └─ origin_po PO01970737; list_po_code_with_same_thuocsi_id [PO01970737, PO01970951]
                                     ║ khoá chung: cụm số đầu tiên "38468903"
NW   inter-tenant order f8171434 (direction outbound, counterparty buymed)
      ├─ refId: "SOBD38468903-15942586"
      └─ purchaseOrderId ─► PO Nextwaves d3e7e409 (PO62830114, status RECEIVED)
                               ├─ externalNumber: null, supplierReference: "PUSH-…"   ← PO KHÔNG chứa SO
                               └─ items[].receivedUnits[] {epc, unitUid, receiptNumber}  (16 UID)
```

- Khớp sản phẩm: `product_id` POS = `product.externalProductId` Nextwaves (5/5).
- UID có cùng định dạng mã QR thuocsi: 13 chữ số ms + mã máy + số thứ tự, ví dụ `1791877162941B81`.
- Chuẩn hoá SO: POS tự lấy cụm số đầu tiên (`\d+`) khi tìm phiếu theo SO. Nextwaves `refId` → cụm số đầu cũng là 38468903.
- Thứ tự tạo không cố định: Nextwaves nhận ngày 13/10, PO01970951 trên POS tạo ngày 14/10.

### 2.1 Cặp thử staging (người dùng cung cấp 24/10)

```
POS stg  GR03877 cea7a4d0 (cửa hàng 2222, WAITING_TO_RECEIVE)     samples/gr-stg-GR03877-20261023.json
          └─ PO00006745 b191075a: status WAIT_FOR_PROCESS, source_type IMPORT_STOCK, created_by_action IMPORT_STOCK,
             sale_order_number "", thuocsi_delivery_code [], origin_po null, goods_receipts [GR03877]
             → TẠO TAY bởi "<nhân viên>", KHÔNG gắn SO
NW stg   inter-tenant f930f66d (outbound, counterparty buymed-stag, status shipped)   samples/nw-stg-intertenant-PO28237814-SOBD1593858.json
          ├─ refId "SOBD1593858-1056745"
          └─ PO28237814 55bd221f: purchaseOrderStatus CONFIRMED, chưa nhận; kho "CIRCA FLORITA" 82bf85e4
             shipment IT-BUYMED-STAG-20261019092009-7938 (pending); units = 12 UID/EPC dự kiến (đã có TRƯỚC khi nhận)
```

| SP | POS GR03877 | Nextwaves PO28237814 | UID dự kiến |
|---|---|---|---|
| 1110 Pymefucan | 6 vỉ (base 12) | 6 vỉ, local 12 "hộp", trackBatch | 6 (2 dòng giao × 3) |
| 2431732 Soffell | 2 chai (base 2) | 2 chai, local 2 chai | 2 |
| 5451 Vinmotop | 4 túi (base 40) | 4 túi, local 40 "hộp", trackBatch | 4 (2 dòng giao × 2) |

- Dòng hàng hai bên trùng khớp (sản phẩm, số lượng, đơn vị dòng), nhưng **không có khoá SO nào nối chúng**.
- Tem QR staging là tem riêng đã map EPC (có tem vật lý). Mã production không tra được trên staging.
- Nextwaves `localUnit` ghi "hộp" nhưng con số là đơn vị gốc POS (viên): 6 vỉ × 2 = 12, 4 túi × 10 = 40. **Không dùng nhãn `localUnit`**, chỉ dùng con số.
- `units[].lineId` là mã **dòng giao hàng** (5 dòng), khác mã dòng đơn `lines[].lineId` (3 dòng).
  Unit chỉ có `productTitle`, **không có productId**. Muốn gán UID → sản phẩm trước khi nhận phải có API khác (§6 D3).

### 2.2 Cặp thử staging có SO (operator gửi 24/10 chiều) — đề xuất làm cặp chính

```
POS stg  GR03878 2de6c0ec (2222, WAITING_TO_RECEIVE, created_by "Hệ thống")      samples/gr-stg-GR03878-20261024.json
          └─ PO00006750 f7678788: source_type SO_THUOCSI, sale_order_number "1593858",          samples/po-stg-PO00006750-SOBD1593858.json
             thuocsi_delivery_code ["SOBD1593858-F"], list_po_code_with_same_thuocsi_id [PO00006749, PO00006750],
             origin_po_id 9b1ff47a…, goods_receipts [GR03878]
NW stg   PO28237814 (refId SOBD1593858-1056745) — như §2.1                                    samples/nw-stg-po-PO28237814-detail.json
```

| SP | GR03878 | Lô POS (mỗi lô 1 đơn vị dòng) | Nextwaves | UID | 1 UID = |
|---|---|---|---|---|---|
| 1110 | 2 hộp (1 hộp = 6 viên), base 12 | A1-121229, 261009DHAUS-121228 | 6 vỉ, local 12 | 6 (2 dòng giao × 3) | 1 vỉ = 1/3 hộp |
| 5451 | 2 hộp (1 hộp = 20 viên), base 40 | 261009KSDHAU-121228, A1-121228 | 4 túi, local 40 | 4 (2 × 2) | 1 túi = 1/2 hộp |
| 2431732 | 2 chai, base 2 | 261016KHASUFDB-060627, A98-060627 | 2 chai | 2 (1 dòng giao) | 1 chai |

- Cùng SO, POS lại sinh 2 PO (PO00006749 là PO gốc; chỉ PO00006750 có GR), giống production (R2).
- Dấu vân tay `(product_id, base_quantity)` của GR03878 **trùng hệt** GR03877 (R9).
- Giả thuyết: mỗi dòng giao Nextwaves là một lô (3 vỉ = 1 hộp / lô; 2 túi = 1 hộp / lô). Chưa xác nhận (D3 / D4).
  Soffell: 2 lô POS nhưng 1 dòng giao → lô từng UID chỉ lấy được từ tra QR.
- PO Nextwaves chi tiết (`GET /purchase-orders/<id>`):
  - `items[].externalLineKey` = `lines[].lineId` của inter-tenant (3/3).
  - `quantity` tính theo đơn vị gốc (12 / 40 / 2); `receivedUnits` rỗng trước khi nhận.
  - `externalProductId` **null 2/3** → chỉ dùng `productSku` "CIRCA-<id>".
  - Kho "CIRCA FLORITA" code WH-30145 (`buymedCustomerId` 30145).
- Seller POS staging của PO này: `CC4DM8DN9F1` (khác `CXH7DN9F1YA` của PO00006745).

### 2.3 Luồng thật (operator 24/10) và API `/receiving`

1. thuocsi / Buymed tạo SO (hàng, product_id, UID, EPC; **chưa có PO POS**).
2. Buymed đẩy SO sang Nextwaves → inter-tenant order (`refId` SOBD<số>-<hậu tố>) + **PO Nextwaves tự sinh** (không trùng PO POS).
3. Buymed giao thành công → POS sinh PO (SO_THUOCSI, `sale_order_number`) + GR (Hệ thống).
4. Dược sĩ mở GR → extension mở đúng PO Nextwaves → dược sĩ nhận bằng reader, bấm **"Xác nhận nhận hàng"** →
   extension đưa kết quả về POS để hoàn tất GR / PO trên POS.

`GET /api/v1/inter-tenant-orders/purchase-orders/<poId>/receiving` (mẫu `samples/nw-stg-receiving-PO76458756.json`, PO76458756, CONFIRMED, chưa nhận):
- `{order (không có refId), purchaseOrderStatus, warehouse, shipments[], receipts[]}`.
- `shipments[]`: `{id, shipmentNumber, status pending, needsAccept true, lines[]}`.
- `lines[]`: `{lineId, productId, product{id, title, sku, barcode}, name, quantity, unit, tagged, units[{epc, unitUid}], qrUnitUids[]}`.
- `quantity` = số UID ở 5/5 dòng. Mỗi UID = 1 `unit` của dòng giao.
- ⇒ Gán UID → sản phẩm + đơn vị **trước khi nhận** bằng `productId` / `sku`, không cần dựa vào tên (R10 đã giải).
- Dòng giao **không có trường lô**. Lô của UID vẫn phải lấy qua tra QR trên POS (D4).
- PO76458756 (1110: 6 vỉ, 5451: 4 túi, Soffell **1** chai) **không khớp** GR03878 (Soffell 2 chai).
  PO của GR03878 là PO28237814 (SO 1593858). Dấu vân tay đã phân biệt đúng.

### 2.4 Capture 24/10 chiều: hai đường vào POS, tích hợp Circa của Nextwaves, lô theo dòng giao

Chi tiết: `docs/dev/LOGIC-v0.2.md`. Tóm tắt **[đã kiểm từ capture / JS]**:
- **Đường vào (2)** "Nhập SO thuocsi":
  - Danh sách GR → nhập SO → `GET goods-receipt/search?query=so_thuocsi=1593858,…` → `/chi-tiet-so/1593858` (màn nhập hàng cấp SO).
  - Mẫu `samples/pos-stg-gr-search-so-1593858.json` trả đúng GR03878.
- **Ô quét POS staging** (cả trang GR và `/chi-tiet-so`), giống production:
  - bắt buộc chuỗi có `/qr/`; +1 đơn vị dòng mỗi lượt; không quy đổi.
  - Tem Circa staging có dạng `https://qr.v2.circa.vn/item/<UID>` (không có `/qr/`), nên POS sẽ báo sai định dạng.
- **Tích hợp Circa trong Nextwaves** (module `circa`, `circa-receipt-link`):
  - Các API: `/integrations/circa/connection`, `pull-purchase-orders`, `goods-receipts`, `purchase-orders/<id>/link` (GET / PUT `{goodsReceiptId}` / DELETE), `scan/qr`.
  - Chữ hiển thị: liên kết xong thì "Hàng nhận và UID sẽ được ghi vào phiếu này, và phiếu được hoàn tất trên Circa khi đơn nhận đủ".
  - PO28237814: `eligible: true, linked: false`.
- **Lô:** `GET /inter-tenant-shipments/<id>` có `batch {batchNumber, expiryDate}` từng dòng giao → `<batch>-<DDMMYY>` khớp 4/4 lô GR03878.
  Soffell không có lô bên Nextwaves (POS có 2 lô).
- PO76458756 thuộc SO 1593849 (operator). Danh sách tem quét có 2 UID ngoài PO28237814. Chuỗi máy quét bị rơi ký tự.

## 3. Bài toán GR → PO Nextwaves

**Phía POS (giải được):** grId trên URL → GR.purchase_order_id → `GET /v1/pos/<posId>/po/<poId>` → sale_order_number + thuocsi_delivery_code.
Kiểm thêm: grId phải nằm trong `po.goods_receipts`. Trang GR không tự gọi API PO, nên extension phải tự gọi.

**Phía Nextwaves (chưa chốt):**

| Hướng | Cách | Trạng thái |
|---|---|---|
| A | `GET /api/v1/inter-tenant-orders?direction=outbound&q=<SO>` → khớp `refId` → `purchaseOrderId` | API có trong bundle web; **chưa kiểm `q` có tìm theo refId** |
| B | `GET /api/v1/purchase-orders/open?warehouseId=<kho>` → từng PO gọi `inter-tenant-orders/purchase-orders/<id>` lấy refId | Không cần Nextwaves sửa; gọi N+1 |
| C | Nextwaves ghi SO vào `externalNumber` lúc Buymed push + cho tìm kiếm | Cần sửa backend Nextwaves; bền nhất |
| D | Đi ngược: nhận ở Nextwaves trước → refId → POS `goods-receipt/search?query=so_thuocsi=<số>` → GR | POS có sẵn API; đảo luồng stakeholder muốn |

| E | **Dấu vân tay dòng hàng:** với mỗi PO Nextwaves đang mở của kho, so tập {(`product.sku` = `CIRCA-<product_id POS>`, `localQuantity`)} với tập {(`product_id`, `base_quantity`)} của GR | Khớp 8/8 dòng ở cả hai môi trường (production SO 38468903, staging GR03877). Dùng được khi thiếu SO |

**Dấu vân tay (kiểm 24/10):**
- So `localQuantity` của Nextwaves với `base_quantity` của POS: production 5/5, staging 3/3.
- So số UID với số lượng dòng POS: 7/8. Ngoại lệ 2399 (R1).
- Hai đơn trùng hệt hàng và số lượng thì dấu vân tay không phân biệt được. Khi đó phải để người dùng chọn.

**Đề xuất tạm (chưa duyệt):**
1. Có SO (production): dùng A hoặc B tìm theo SO, rồi **kiểm lại bằng dấu vân tay E**.
2. Không có SO (staging GR03877, PO tạo tay): tìm trong các PO đang mở cùng kho bằng E.
   - Đúng một PO khớp → đề xuất PO đó, người dùng xác nhận.
   - Không khớp hoặc nhiều PO khớp → hiện danh sách để người dùng chọn.
3. Về lâu dài vẫn xin C.

**Quay lại POS (đề xuất tạm, chưa duyệt):**
- Gõ lại từng UID vào ô quét của POS (chế độ "Scan QR tăng SL nhận", dạng `thuocsi.vn/qr/<uid>`) để POS tự khớp dòng / lô.
- Trước đó tra từng UID: `circaReceiptCode` phải bằng `purchase_order_code` của GR.
- Nút HOÀN THÀNH do dược sĩ bấm.

## 4. API đã biết

**POS** (đường dẫn tương đối với API base của từng môi trường, xem `agent.md` §3):

| API | Ghi chú |
|---|---|
| `GET /v1/order/goods-receipt/<id>` | GR chi tiết (mẫu trong `samples/`) |
| `GET /v1/order/goods-receipt/search?query=pos_id=…,with_items=true,with_details=true,is_count_all_status=true&limit&page&order_by` | Danh sách GR |
| `GET /v1/order/goods-receipt/search?query=so_thuocsi=<số SO>,pos_id=…,with_items=true,with_seller_code=true,with_details=true&limit=1000&is_with_retail_unit=true&is_with_lot=true` | POS dùng cho ô "mã SO" + trang `/chi-tiet-so/<số>` |
| `PUT /v1/order/goods-receipt/<gr>/item/<item>/detail/<detail>` · `POST …/detail` · `DELETE …/detail/<id>` · `PUT …/item/<item>` `{qr_unit_id}` | Ghi — chưa được phép gọi |
| `PUT /v1/order/goods-receipt/<gr>/status/COMPLETED` · `/status/CANCELED` | Ghi — chưa được phép gọi |
| `GET /v1/pos/<posId>/po/<poId>?order_by_detail=desc` | PO, có `sale_order_number`, `thuocsi_delivery_code`, `goods_receipts` |
| `GET <trang POS>/thuocsi-warehouse/qrcode?code=<mã>` | Tra mã QR (production đi qua origin trang POS, không header Authorization). Staging: chưa biết |

**Nextwaves** (production `https://api-circa.nextwaves.app/api/v1`, staging `https://api-circa-stg.nextwaves.app/api/v1`).
Cần JWT người dùng sống 1 giờ; chưa biết khoá API có quyền không. Bundle web staging (`index-D_eyV8vC`) khác production (`index-BW5N3Ayt`).

| API | Ghi chú |
|---|---|
| `GET /purchase-orders/<id>` | PO + items[].receivedUnits + receipts |
| `GET /purchase-orders?page&pageSize&search&status&supplierId&warehouseId` | `search` khớp trường nào: chưa biết |
| `GET /purchase-orders/open?warehouseId=` | PO đang mở của kho |
| `GET /inter-tenant-orders?direction&status&linkId&q(≤100)&page&pageSize` | Có `refId` trong kết quả? chưa kiểm |
| `GET /inter-tenant-orders/purchase-orders/<poId>` · `/receiving` | Trạng thái + refId + units |
| `POST /inter-tenant-shipments/<id>/receive-scan` | Ghi — chưa được phép gọi |
| UI: `/vi/purchases/<id>`, `/vi/stock/inter-tenant/orders/<id>` | Đường dẫn mở cho người dùng |

## 5. Khảo sát STAGING so với PRODUCTION (24/10/2026)

Nguồn: `samples/gr-prod-GR83174-20261024.json` (PO01972730, 10 dòng / 11 đơn vị) và `samples/gr-stg-GR03877-20261023.json`
(PO00006745, 3 dòng / 12 đơn vị), cả hai đang WAITING_TO_RECEIVE. Cùng hai cURL người dùng gửi.

### 5.1 Giống nhau
- **Schema GR giống hệt:** mọi đường dẫn khoá ở mọi cấp (data, items[], details[], lots[], retail_units[], sale_product) trùng nhau, không có trường đổi kiểu.
- GR không có trường SO ở cả hai môi trường. `note` rỗng.
- Cùng `client_id` = 1, cùng header `x-client-id: 1` + `x-store-id`, cùng `grpc-timeout: 30S`, cùng OAuth `clientID` SSO.
- `sale_product.manage_lot_date_vat` = 0 ở mọi dòng cả hai bên.

### 5.2 Khác về hạ tầng

| | PRODUCTION | STAGING | Hệ quả |
|---|---|---|---|
| API base | `https://api.v2.circa.vn/v1` | `https://pos.stg.circa-v2.buymed.tech/backend/v1` | Nhận diện / gọi API theo cấu hình môi trường. `host_permissions` khác nhau |
| Gọi API | khác origin (`sec-fetch-site: same-site`) | cùng origin (`same-origin`) | Hook fetch / XHR trong trang chạy được cả hai; khác CORS nếu extension tự gọi |
| Xác thực | Bearer | Bearer + cookie `session_token` / `session_expires_at` | Lấy token từ trang theo từng môi trường |
| SSO | `sso.thuocsi.vn` | `sso.stg.buymed.tech` | Tài khoản staging tách riêng |
| Cửa hàng | Florita `c476efb2…` | "2222" `64a8663b…` | Bảng ánh xạ cửa hàng → kho Nextwaves riêng cho từng môi trường |

### 5.3 Khác về dữ liệu
- **Người tạo GR:** production do "Hệ thống" tạo (`created_by` = `00000000-…-0001`, sinh từ SO). Staging GR03877 do người dùng "<nhân viên>" tạo tay.
  → **Đã xác nhận 24/10:** PO00006745 có `source_type` IMPORT_STOCK, `sale_order_number` rỗng, `thuocsi_delivery_code` rỗng, tức **không gắn SO** (§2.1).
  Production PO01970951: `source_type` SO_THUOCSI, `created_by_action` SO_THUOCSI.
- **Seller / SKU:** production `seller_code` CIRCA, SKU `CIRCA.*`. Staging `CXH7DN9F1YA`, SKU `CXH7DN9F1YA.*`.
- **Độ dài mã:** production PO01972730 / GR83174. Staging PO00006745 / GR03877.
- **Đơn vị:**
  - Production: 10/10 dòng có đơn vị dòng = đơn vị RFID = `buymed_base_unit`, tức 1 QR = 1 đơn vị dòng.
  - Staging là dữ liệu thử, **không giữ bất biến đó**:
    - 1110 Pymefucan: dòng `vỉ`, RFID `vỉ`, nhưng `buymed_base_unit` = `viên`. "h/20v" mà `hộp` = 6 viên.
    - 5451: dòng `túi`, RFID `hộp`, **không có** `buymed_base_unit`.
  - Hệ quả: staging hợp để thử các ca lệch đơn vị, nhưng không đại diện cho dữ liệu production.
- **Đơn vị in tem `qr_unit_name`:** production có ở 9/10 dòng (55224 in `tuýp`, RFID `hộp`). Staging rỗng 3/3.
- **`retail_units[].buymed_sync_data`:** production null 21/21. Staging có object ở 2/12 (`unit_sync_type`, `last_sync_at`, `ref_unit_id`, `unit_name`). Parser phải chịu được cả null lẫn object.

### 5.4 Chưa so được (cần người dùng hoặc phiên đăng nhập)
- Frontend POS (build, trang GR, chế độ nhập hàng, ô tìm SO): cả hai trang chuyển sang SSO khi chưa đăng nhập.
- Tra QR trên staging: đường dẫn và dữ liệu trả về cho tem staging (§6 D4). Đã biết: mã production không tra được trên staging.
- Tìm GR theo SO trên staging (§6 D5).

## 6. Câu hỏi mở và việc cần xác minh

**Đã trả lời (người dùng, 24/10):**
- S1. Nextwaves staging = tenant `circa-stg` (`https://circa-stg.nextwaves.app`), đi cặp với POS staging và Buymed staging (`buymed-stag`).
- S2. Đã gửi PO staging PO00006745: IMPORT_STOCK, **không gắn SO** (§2.1).
- S3. Mã QR / UID production không tra được trên staging. Đã có tem QR staging map EPC đầy đủ, có tem vật lý.
- S4. Dùng cửa hàng 2222. Production theo tài khoản đăng nhập (`agent.md` §3).

**Dữ liệu cần lấy trên STAGING (chỉ đọc, lấy qua giao diện: DevTools → Network → chuột phải request → Copy → Copy response; không cần cURL / token):**
- D1. Nextwaves stg, trang `/vi/stock/inter-tenant/orders`: gõ `SOBD1593858` vào ô tìm, rồi gõ `1593858`.
  Lấy response `inter-tenant-orders?…q=…` → biết hướng A có tìm được theo refId không.
- D2. Nextwaves stg, trang `/vi/purchases`: response danh sách không lọc, và response khi tìm `SOBD1593858` / `PO28237814`.
- D3. Nextwaves stg, mở `/vi/purchases/55bd221f-65de-4a4d-8a77-40c568a6f176` (**không bấm nhận hàng**).
  Lấy response mọi API trang gọi (`purchase-orders/<id>`, `…/receiving`, shipment…) → để gán UID → sản phẩm / lô trước khi nhận.
- D4. POS stg, trang Tra cứu QR (`/tra-cuu-qr`): tra `1792145819958AA1` (1110) và `1792379177779AA1` (5451), lấy response.
  Thêm: quét một tem staging vào Notepad để thấy đúng chuỗi máy quét gõ ra (có chứa `/qr/` không).
  **Không quét ở màn phiếu nhận hàng** (sẽ ghi vào GR).
- D5. POS stg, danh sách phiếu nhận hàng → ô nhập mã SO → `1593858`. Lấy response `goods-receipt/search?query=so_thuocsi=…`.

**Production (để sau, chỉ đọc):** T1 `inter-tenant-orders?q=SOBD38468903`; T2 `purchase-orders/open?warehouseId=eb5e2b4f…`;
T3 tra `1791877162941B81` / `1791877427805C13`; T4 `goods-receipt/search?query=so_thuocsi=38468903,…`.

**Nghiệp vụ (stakeholder):**
- Q1. Hậu tố "-F" (POS) và "-15942586" (Nextwaves) nghĩa là gì? Một SO có tách thành nhiều lần giao / nhiều GR không?
- Q2. Hàng bán theo lốc gắn tem theo lốc hay theo chai (xem R1)?
- Q3. Ai bấm HOÀN THÀNH trên POS?
- Q4. Nhận thiếu / thừa ở Nextwaves (`onMissing: keep_open`) thì GR xử lý thế nào?
- Q5. Extension xác thực Nextwaves bằng gì: phiên đăng nhập web Nextwaves trên cùng Chrome (giống POS), hay khoá API có quyền purchase / inter-tenant?
- Q6. Staging không có GR sinh từ SO. Chấp nhận thử luồng tìm PO bằng dấu vân tay E trên staging, còn chuỗi SO chỉ kiểm được ở production? Hay Buymed-stag tạo được PO POS staging từ SO?
- Q7. SP trackBatch (1110, 5451) bị tách 2 dòng giao. Hai dòng là hai lô khác nhau? GR POS chỉ có một lô / dòng. Nếu tem mang lô khác, POS sẽ tạo thêm lô / detail.

## 7. Rủi ro đã thấy
- R1. **Lệch đơn vị gắn tem:** SP 2399 natri clorid, POS dòng 1 lốc (đơn vị RFID = lốc), Nextwaves 10 UID (mỗi chai một UID). Gõ lại 10 UID vào POS sẽ báo vượt số lượng từ mã thứ 2.
- R2. Một SO → 2 PO trên POS (PO01970737 origin + PO01970951). Có thể phải khớp theo lần giao, không theo SO.
- R3. Đơn vị không đồng nhất giữa hai bên:
  - `quantity` của PO Nextwaves (`purchase-orders/<id>`) tính theo đơn vị gốc (100 viên). POS tính theo đơn vị dòng (1 hộp).
  - Bên inter-tenant: `lines[].quantity` + `unit` trùng đơn vị dòng POS; `localQuantity` trùng `base_quantity` POS; nhãn `localUnit` không đáng tin (staging).
- R4. JWT Nextwaves sống 1 giờ.
- R5. QR nhân đôi sau COMPLETED (§1).
- R6. Dữ liệu staging không giữ bất biến đơn vị của production (§5.3). Test xanh trên staging chưa đủ chứng minh production.
- R7. ~~Staging không thử được chuỗi SO~~ — **đã hết** (24/10 chiều): GR03878 / PO00006750 có SO 1593858 (§2.2). GR03877 vẫn là ca không SO.
- R8. Unit Nextwaves trước khi nhận chỉ có `productTitle` + `lineId` dòng giao, không có productId. Gán theo tên là rủi ro, cần API khác (D3).
- R9. Dấu vân tay E không phân biệt được hai đơn trùng hệt hàng và số lượng → phải để người dùng chọn.
- R10. Kiểm trực tiếp mẫu inter-tenant staging 24/10: `units[].lineId` của 5 nhóm UID không trùng bất kỳ `lines[].lineId` nào trong 3 dòng PO; `units[]` không có product ID/SKU/lô. Không được ghép UID với dòng PO bằng hai `lineId` này hoặc tên hàng. Cần D3 chỉ ra quan hệ shipment line → sản phẩm/lô trước khi áp UID tự động.
  → **Phần sản phẩm đã giải (24/10):** `/receiving` trả `shipments[].lines[]` có productId / sku / unit / units (§2.3). Phần **lô** vẫn mở (D4).
- R11. **1 UID ≠ 1 đơn vị dòng GR** (GR03878: 1110 và 5451, §2.2).
  - Mã quét GR của POS production cộng +1 đơn vị dòng mỗi lần quét, không quy đổi theo đơn vị của QR.
  - Nếu staging cũng vậy, gõ lại UID vào ô quét sẽ chặn hoặc lệch lô.
  - Cần PM chọn cách ghi (`docs/dev/DEV-REVIEW-SPEC-STG-v0.1.md` §2). Cờ `is_rfid_unit` của POS cũng không khớp đơn vị tem (5451).
- R12. Reader RFID dùng chung. Trên máy POS production, `circa-qr-scan-log` giữ cổng serial của reader ở tab POS. Nếu web Nextwaves cũng đọc reader qua Web Serial thì hai bên có thể giành cổng. Chưa biết Nextwaves đọc reader bằng gì.

## 8. Nhật ký quyết định
- 20/10/2026: phân tích capture luồng nhận hàng; brainstorm chuỗi khoá ba bên.
- 24/10/2026: người dùng chốt build staging trước, production sau. Tạo project `C:\QR_code\circa-gr-nextwaves` (agent.md, state.md, samples/).
- 24/10/2026 (lần 2):
  - Người dùng trả lời S1–S4: staging = POS stg cửa hàng 2222 + Nextwaves `circa-stg` + `buymed-stag`; tem staging riêng.
  - Phạm vi: production theo tài khoản đăng nhập, staging chỉ cửa hàng 2222.
  - Cặp thử GR03877 ↔ PO28237814 (§2.1). Đề xuất thêm hướng E (dấu vân tay), chưa duyệt.

- 24/10/2026 (lần 3, operator chốt):
  - Codebase `C:\QR_code\circa-gr-nextwaves`, extension riêng.
  - Repo `https://github.com/Kai-D13/circa-gr-nextwaves`.
  - Một gói, chọn môi trường STG / PRD hoặc nhập URL.
  - Vai trò: operator / dev-team Claude Code / PM Codex (`agent.md` §2–3).
  - Repo GitHub đang **public** (kiểm API 24/10) → chưa push, chờ operator.

- 24/10/2026 (lần 4, operator chốt):
  - Repo **public**. Dev thay tên nhân viên trong `samples/` bằng `<nhân viên>`, viết lại lịch sử cục bộ trước lần push đầu.
  - Operator đăng nhập GitHub cho lần push đầu.
  - PM đọc và làm việc trực tiếp trên `C:\QR_code\circa-gr-nextwaves` (máy local).
  - Máy thử staging = laptop này.
  - Operator gửi cặp GR03878 / PO00006750 (có SO) + PO Nextwaves chi tiết. Dev gửi phản hồi spec `docs/dev/DEV-REVIEW-SPEC-STG-v0.1.md`.

- 24/10/2026 (lần 5):
  - Operator giải thích luồng thật: PO Nextwaves ≠ PO POS; POS chỉ sinh PO / GR khi giao thành công; khoá là SO (§2.3).
  - Extension làm **một** tính năng (`docs/dev/LOGIC-v0.1.md` §0).
  - Gửi mẫu `/receiving` (PO76458756). Dev viết logic chi tiết đề xuất `docs/dev/LOGIC-v0.1.md` để PM audit.

- 24/10/2026 (lần 6, operator):
  - Không có nút "Nhận bằng RFID": mở GR là extension tự chạy.
  - Chế độ nhập hàng POS phải là "Scan QR tăng SL nhận" (ý nghĩa chờ làm rõ).
  - Hai đường vào (GR, "Nhập SO thuocsi").
  - PO28237814 giữ để thử.
  - Dev phát hiện tích hợp Circa có sẵn của Nextwaves, viết `docs/dev/LOGIC-v0.2.md`.

- 24/10/2026 (lần 7, operator):
  - Không dùng API tích hợp Circa của Nextwaves (Nextwaves làm extension riêng); kênh Circa POS trên Nextwaves staging "Cần xử lý", chưa đồng bộ.
  - Gửi capture luồng đầy đủ (POS nhập SO → `/chi-tiet-so`; Nextwaves PO28237814 có 3 lần xác nhận bị 400).
  - Dev viết `docs/dev/LOGIC-v0.3.md`.

- 24/10/2026 (lần 8, operator):
  - Q1: dùng API thường của Nextwaves, không dùng tích hợp Circa của Nextwaves.
  - Q3: W1. K1 chưa gỡ.
  - Gửi kết quả tra QR (D4) và mẫu nhận thành công (PO88508353, hub-order).

- 24/10/2026 (lần 9, operator):
  - a) **Dược sĩ bấm HOÀN THÀNH** (Q4 chốt). "Xác nhận nhận hàng" trên Nextwaves là xong PO bên Nextwaves; extension chuyển về POS và màn POS phải có đủ UID đã map.
  - b) Bắt theo `thuocsi_delivery_code`: mỗi mã giao ↔ 1 PO POS ↔ 1 GR.
  - c) Không cần chế độ nhập hàng trên POS; dược sĩ chỉ đặt hàng ở màn nhận của Nextwaves.
  - d) Chuyển thẳng màn quét `/vi/purchases/receive?po=<id>` (`id` = SO, số PO hoặc id PO).
  - Thử trên PO00006750 / GR03878 nếu được; "Build và test chính xác".
  - Dev build batch v0.1-staging (nhánh `batch/v0.1-staging`, commit `a08d541`, gói `FF5CD95B`, giải nén `C:\circa-gr-nextwaves-v0.1.0`). Báo cáo: `docs/dev/BATCH-v0.1-STG.md`.

- 24/10/2026 (lần 10–11):
  - PM audit `a08d541`: chưa cho merge / ghi; 5 finding P1, 3 finding P2; chốt P2 nhận thiếu, P3 nhiều GR, P4, P6, P7.
  - Dev sửa → v0.1.1 `d124453` (gói `D8CD9AFD`). Quyết định thiết kế để PM duyệt:
    - cấp phép ghi một lần / một GR / 30 phút, chỉ từ popup;
    - lease 90 s > hết giờ PUT 30 s (= `grpc-timeout` của app POS);
    - hạ nhiệt 60 s sau kết quả ghi không rõ;
    - bằng chứng "đã nhận" = lượt 2xx của phiên + biên nhận mới (cấu trúc `receipts` theo mẫu thật PO88508353) + `receivedEpcs` phiếu gửi.

- 24/10/2026 (lần 12–13):
  - PM audit lại `d124453`: chấp nhận thiết kế cấp phép một lần / một GR / 30 phút và các mốc lease / timeout / cooldown cho staging. Thêm finding P1.6, P1.7.
  - Dev sửa → v0.1.2 (`6eeb3c0`, đầu nhánh `5d117d2`, gói `525BCE84`).

- 24–25/10/2026 (lần 14–15):
  - PM audit v0.1.2: P1.6 / P1.7 đạt gate source/test local; T1 chỉ đọc với v0.1.2; thêm P2.4.
  - Dev xử lý P2.4 → v0.1.4 (`91e3bd1`, đầu nhánh `49bf0a4`, gói `10A29BC4`), kèm chốt chặn vòng lặp tạo phiên.

- 25/10/2026 (lần 16–17):
  - PM audit v0.1.4: đạt gate source/test local; T1 được phép.
  - T1 lần 1 lỗi nạp `env.js` (mọi bản trước đều dính) → dev sửa v0.1.5 (`456205a`, gói `CDD02C3D`).
  - Bài học: bộ test giả phải nạp content script như trình duyệt thật; mỗi bản phát hành chạy `scripts/edge-check.js` trên trình duyệt thật.

- 25/10/2026 (lần 18–19):
  - PM audit sửa T1: chỉ v0.1.5 cho T1.
  - T1 lần 2 trên phiên thật đạt theo dev. Hai response tìm kiếm thật khớp mẫu đã dùng để code; giữ làm mẫu + test hồi quy.

- 29/10/2026 (lần 56): operator chuyển quyền ghi sang phiên `qr-code-6a` (session `77fef381…`), trả lời trong chính phiên đó, tiếp nối phiên "QR code scan log project (fork)" `bf911b64…` (transcript 98 MB). Lúc nhận: `main` = `origin/main` `8dda804`, worktree `batch/v0.2-rfid` `0ebfa81` sạch, gói v0.3.0 `45E07F60` chưa cài. Phiên "QR code scan log project (fork)" mở lại (resume) chỉ đọc.

- 29/10/2026 (lần 57): operator chuyển quyền ghi về phiên "QR code scan log project (fork)" `bf911b64…`, trả lời trong chính phiên đó. Lúc nhận: `main` = `origin/main` `34092a8`, worktree `batch/v0.2-rfid` `0ebfa81`, cả hai sạch; `qr-code-6a` không ghi gì sau `34092a8`. Cùng lần: G2 đạt, G3 lượt 1 không phải lượt tự động (§9 mục 57).

- 30/10/2026 (lần 58): **G3 v0.3.0 ĐẠT** ở lượt 2 trên GR03929 (PO00006813) / PO19854897 / SOBD1594182-F, 10 tem, có phép bằng chữ của operator. Lượt tự động 13:04:09 → 13:04:14: 1 `receive_scan 200`, 1 biên nhận, 4 PUT detail 200, `verifyFinal` khớp, 1 PUT `status/COMPLETED` 200, `auto_completed` source auto, quyền đã tiêu. G1–G3 đạt trên cùng gói `45E07F60` → staging done v0.3.0. Đây là PO staging cuối cùng (operator 30/10). Operator đồng ý merge → `7bff255`: mã / test lấy nguyên từ nhánh (`src/` = `4b79c58` = thư mục đang cài, 19 file), 4 file tài liệu gốc giữ bản `main`, `node --test` 222/222 trên cây đã gộp.

## 9. Việc tiếp theo
1. ~~Operator quyết repo public / private~~ — đã chốt public (24/10).
2. Operator mở session PM Codex bằng `docs/PROMPT-PM-CODEX.md`. PM chốt hướng §3 / §6 và ra spec v0.1 staging chia batch.
3. Operator gửi D1–D5 (staging, Copy response) và trả lời Q1–Q7 khi PM cần.
4. Dev chỉ dựng `src/`, `tests/`, `scripts/` khi spec batch đầu được duyệt.
5. PM đã soạn `docs/SPEC-STG-v0.1.md` ngày 24/10/2026: B1 chỉ đọc có thể giao dev; B2–B3 chỉ đọc qua gate; B4 ghi POS có gate và cần operator cho phép từng lần. Các quyết định nghiệp vụ trong spec là **đề xuất**, chưa phải quyết định đã chốt.
6. PM xem `docs/dev/DEV-REVIEW-SPEC-STG-v0.1.md` (F1–F8):
   - Đổi cặp thử chính sang GR03878?
   - Đường SO trên staging.
   - Cách ghi khi 1 UID ≠ 1 đơn vị dòng (R11).
   - Chốt spec v0.2 hoặc giao B1.
7. ~~PM audit `docs/dev/LOGIC-v0.1.md`~~ → thay bằng mục 8.
58. **Hiện hành (G3 đạt → staging done v0.3.0, 30/10):** `docs/dev/KET-QUA-G2-G3-v0.3.0.md` mục "G3 lượt 2".
    - **G3 đạt trên gói `45E07F60`.** GR03929 / PO19854897 / SOBD1594182-F, 10 tem (5451: 4 + 4 vỉ, hai lô; 2431732: 1 + 1 chai, hai lô). Cho phép tự động 13:02:35, nhận 13:04:09, COMPLETED 13:04:14. Không người chạm POS.
    - Bằng chứng: nhật ký phiên + `nwResult` (operator dán từ service worker: 10 unit, 1 biên nhận, `authorization.auto` true, kế hoạch `#4DF9D34A`, `completeResult.source` auto, `autoGrants` / `grants` còn hạn 0); Net Capture tab POS SHA-256 `00a22832…` (10 QR OK, 4 PUT detail 200 + GET kiểm, `verifyFinal` RECEIVING 4 / 4, 1 PUT `status/COMPLETED` 200, GET COMPLETED). Không có capture tab Nextwaves; phía Nextwaves chốt bằng nhật ký phiên như A1.
    - Ghi chú: phiên GR03929 bị Xoá / Huỷ rồi tạo lại lúc 13:02:11 sau lần cho phép đầu (12:56:50). Quyền cũ bị bỏ đúng thiết kế, operator cho phép lại, chốt chặn chạy sau đó và khớp phiên mới. Thành finding G3-5 P3 (runbook PRD).
    - Finding cho bản sau: G3-1 P2 (popup dễ bấm nhầm cấp phép thủ công), G3-2 P2 (POS không in lý do khi `received()` bỏ qua quyền), G3-3 P3, G3-4 P3 (đã sửa runbook), G3-5 P3.
    - **Đã merge** `batch/v0.2-rfid` → `main` `7bff255` (operator đồng ý 30/10; 222/222 test, `src/` trùng gói đã cài). Hết PO staging, nên mọi thay đổi sau phải kiểm offline + pilot PRD có giám sát.
    - **Sự thật mới (QR sau HOÀN THÀNH):** response `PUT status/COMPLETED` của GR03929 đã có mỗi UID 2 lần + 1 mã mới mỗi detail (5451: 4 UID → 9 mã, 5 khác nhau); GET sau có phiếu PUT. GR03880 / GR03887 (dược sĩ bấm trên trang) chỉ +1 mã, không lặp, không phiếu PUT. Production 19/10 (quét tay) cũng lặp. ⇒ lặp do máy chủ POS lúc hoàn tất, nhiều khả năng đi cùng tự tạo phiếu PUT; không phải extension.
    - **Tiếp theo — plan production:** `docs/dev/PLAN-PRD-FLORITA-v0.3.x-20261030.md`. v0.3.1 = PRD chỉ đọc chỉ Florita + sửa G3-1..5 (lõi ghi giữ nguyên từng byte với `4b79c58`) → T1-PRD + 4 bước reader (chỉ đọc) → v0.3.2 chỉ bật `writeEnabled` PRD → W1-PRD lượt 1 thủ công → G3-PRD lượt 2 tự động → 3 GR tự động liên tiếp → Go. Operator cần gửi B0 và trả lời D1–D5 trước v0.3.2. Production chỉ đọc tới gate PRD.
57. (cũ, thay bằng mục 58) **G2 đạt, G3 lượt 1 không tự động, 29/10 tối:** `docs/dev/KET-QUA-G2-G3-v0.3.0.md`.
    - **G2 đạt** (14:03–14:10): v0.3.0 `45E07F60` cài cùng thư mục / ID, `lastUpgrade` 0.2.4 → 0.3.0, `removedSessions` []. GR03887 `khung` 0. Phiếu chọn **GR03886** / SO `SOBD1594096-F` / PO Nextwaves `PO76149046`, 11 tem (1110: 3 + 3 vỉ; 2431732: 1 chai; 5451: 4 vỉ), `khung` 1 trong luồng.
    - **G3 lượt 1:** operator bấm "Cho phép điền 1 lần" (cấp phép thủ công, 16:51:29) thay cho nút tự động trong "Phiên gần đây". Không có `auto_armed`, nên lượt nhận 16:53:12 (sạch: 11/11 EPC, 1 biên nhận mới) đi luồng thủ công đúng thiết kế. Net Capture POS: 0 PUT tới 17:07:26. Operator điền thủ công + dược sĩ HOÀN THÀNH; `kiem-khung` "Đã nhận", `khung` 0 → POS khớp Nextwaves.
    - **G3 chưa đạt.** Lượt tự động chưa được thử; không thấy lỗi ở luồng tự động. Runbook G3 đã sửa: đúng nút, khung Nextwaves "ĐÃ CHO PHÉP" trước khi quét, khung thủ công trên POS = dừng.
    - Finding cho bản sau: G3-1 P2 nút tự động trong popup dễ nhầm; G3-2 P2 POS không in lý do khi `received()` bỏ qua quyền; G3-3 P3; G3-4 P3. Không chặn G3 lượt 2 trên v0.3.0.
    - **30/10 — G3 lượt 2 trên GR03929 (PO POS PO00006813), PO staging cuối cùng:** bước A kiểm trước đạt (SO `SOBD1594182-F`, PO Nextwaves `PO19854897`, 10 tem, chưa biên nhận, không khoá). Operator đã cho phép bằng chữ (nguyên văn trong `docs/dev/KET-QUA-G2-G3-v0.3.0.md`). Bước B đạt — xem mục 58.
55. (cũ, thay bằng mục 57) **G1 v0.3.0 đạt, 29/10:**
    - Gói `45E07F60…` (src `4b79c58`, đóng từ `b37c509`; đầu nhánh `batch/v0.2-rfid` `0ebfa81` chỉ thêm test). Báo cáo `docs/dev/BATCH-v0.3.0.md`.
    - Kiểm: `npm test` 222/222; đột biến lượt đủ 202/205 → 3 ca sống là lớp chặn thứ hai trong background, thêm test, chạy lại 3/3 → 205/205; Edge trang phiếu 108/108 ×3 (đối chứng v0.2.5 104/108), edge-check 42/42; tác vụ extension dài nhất 11,40 ms, 0 tác vụ ≥ 50 ms; P2.5 đã sửa (bỏ qua → thu hồi quyền, popup / Nextwaves báo "Tự động đã dừng").
    - Audit độc lập bằng sub-agent: 0 P1, 5 P2, 3 P3 — đã sửa, test mới trượt 8 trên src trước sửa (`docs/dev/AUDIT-v0.3.0.md`).
    - Thư mục giao `C:\circa-gr-nextwaves-release\`: `v0.3.0\` + `nang-cap-v0.3.0.ps1` + `kiem-khung-gr.js`, SHA256SUMS đạt. `-Check` (chỉ đọc) trên thư mục đang tải thật: đúng v0.2.4 `0BB73E2D` từng byte → KIỂM ĐẠT.
    - **Chờ operator:** cho phép G2 (cài + kiểm chỉ đọc + chọn phiếu chưa nhận, gửi một ảnh khung Nextwaves + số tem), sau đó G3 (cho phép bằng chữ đúng GR / PO / SO / số tem). Staging done + merge chỉ khi G1–G3 đạt trên chính gói này.
    - Thư mục thử cũ `C:\circa-gr-nextwaves-v0.3.0` (gói trung gian `08B31C6E`) không dùng; operator tự xoá được.
54. (cũ, thay bằng mục 55) **Operator đổi cấu trúc dự án, 29/10:**
    - Chỉ còn operator + một phiên Claude Code giữ quyền ghi (kiêm PM / senior engineer / QC / tester / audit / review). PM Codex thôi vai trò; `docs/pm/*` là lịch sử, quyết định cũ vẫn hiệu lực trừ khi bị thay. Plan / audit mới ở `docs/dev/`. Ghi thật và cài / nâng gói vẫn cần operator cho phép từng lần.
    - Lý do: 29/10 00:05–00:08 phiên `qr-code-b2` (operator gõ "resume") sửa cùng worktree v0.3.0 với phiên dev; PM Codex cũng ghi tài liệu song song. Quy tắc mới: một người ghi, phiên mới / resume / fork mặc định chỉ đọc, commit từng bước, worktree ở đường dẫn cố định (`agent.md` §2.1, `CLAUDE.md`, `AGENTS.md`).
    - Việc kế tiếp: sửa P2.5 (quyền tự động bị bỏ qua → thu hồi + popup / Nextwaves báo "Tự động đã dừng"), commit SHA cố định v0.3.0, đột biến + Edge + trace + gói + script nâng v0.2.4 → v0.3.0, audit độc lập bằng sub-agent, báo cáo G1. Sau đó G2 (operator cài gói cuối, kiểm chỉ đọc) và G3 (một E2E staging thật có phép riêng).
53. (cũ, thay bằng mục 54) **Sau PM audit G0 v0.2.5, 29/10:**
    - G0 nội bộ đạt: `batch/v0.2-rfid` `02f2575`, gói `792817B9…`, PM so source/ZIP 19/19, chạy Node 180/180, `background.js` không đổi. Edge 103/103 ×3, Edge tổng 42/42, đột biến 146/146, trace ≤21,71 ms là số dev báo; PM chưa chạy lại Edge/đột biến. Không cài v0.2.5 cho operator, chưa dùng đơn staging/merge. Xem `docs/pm/AUDIT-G0-v0.2.5-G1-PRELIM-20261029.md`.
    - G1 v0.3.0 chưa đạt gate: dev báo 204/204 test trên mã chưa commit; hai phiên cùng sửa worktree v0.3.0. PM yêu cầu một owner (ưu tiên phiên đã viết luồng chính/test), rà nhận các phần `autoRun.skipped`/`auto:skip`/`grant_expired` rồi chốt SHA trước đột biến/Edge/gói. Finding P2.5: popup không được báo “ĐÃ CHO PHÉP” sau khi auto đã skip; vô hiệu quyền và hiển thị đường thủ công, test F5 không tự chạy lại. Operator chưa cần làm gì.
52. (cũ, thay bằng mục 53) **Sau quyết định operator gộp luồng tự động, 28/10:**
    - Operator yêu cầu tự điền + tự HOÀN THÀNH trong một luồng trước pilot production, **một** E2E staging có tác động thật trên gói cuối; không dùng thêm đơn test cho mỗi bản trung gian. Chưa có phép ghi cho GR mới. PM spec/gate tại `docs/pm/DECISION-ONE-STG-AUTO-FLOW-20261028.md`.
    - v0.2.5 sửa P2/P3 đang chạy test/đột biến/Edge; dev hoàn tất để PM audit nội bộ, chưa yêu cầu operator cài/kiểm riêng và chưa merge. Batch sau có quyền một lần cho đúng GR/PO/SO trước Nextwaves; tự W1 chỉ khi receipt/UID/kế hoạch đầy đủ; GET toàn GR sau W1 phải trùng kế hoạch trước một PUT COMPLETED; GET cuối xác nhận. Lỗi/không rõ dừng, không tự retry. Test âm dùng fixture A1/server giả, chỉ một lượt staging thật trên gói cuối.
    - Manual mode vẫn giữ. Quyết định 24/10 “dược sĩ bấm HOÀN THÀNH” được thay **chỉ trong chế độ tự động được cấp phép riêng**; dev đồng bộ `agent.md` sau khi commit spec PM. Production vẫn chỉ đọc tới gate PRD và phép operator riêng.
51. (cũ, thay bằng mục 52) **Sau PM audit A1 GR03887, 28/10:**
    - Báo cáo dev `main` `675abf8`; 9 mẫu/test thật ở `batch/v0.2-rfid` `13170bc`, `src/` không đổi so với gói v0.2.4 `0BB73E2D`. PM kiểm 8/8 SHA bằng chứng gốc, 167/167 test, capture POS có 15 GET QR 200, 5 PUT 200 với body trùng mẫu 5/5, một PUT COMPLETED 200, GET cuối COMPLETED với `items` trùng mẫu. Storage có 15 đơn vị Nextwaves, một biên nhận, 5 `apply_done`, phiên `done`. Không có capture Nextwaves; A1 đạt chức năng nhưng không khẳng định đã xem body `receive-scan` trực tiếp.
    - **Chưa staging done/merge:** GR03887 sau COMPLETED không còn `#all-receipt`, v0.2.4 chờ anchor rồi hiện khung đỏ `ui_anchor_missing`; ảnh và log thật xác nhận. PM duyệt v0.2.5 sửa P2 này và P3 popup cảnh báo mã cấp phép không khớp phiên; test/gói/kiểm Chrome staging thật chỉ đọc và trace hiệu năng gói cuối trước audit merge. Không chạy lại A1 chỉ để bù capture. Xem `docs/pm/AUDIT-A1-GR03887-STG-v0.2.4-20261028.md`.
    - Sai lệch runbook: operator xoá phiên cũ/tạo lại GR03887, bấm nhầm GR03879 (0 PUT), thiếu capture Nextwaves. Dev cập nhật runbook. Production còn O1, QR lô sau HOÀN THÀNH, reader Florita, quyết định yêu cầu tự điền/tự HOÀN THÀNH, T1-PRD chỉ đọc và W1-PRD có phép riêng.
50. (cũ, thay bằng mục 51) **Sau PM quyết định gate A1, 28/10:**
    - Operator đã nâng v0.2.3 → v0.2.4 cùng thư mục/ID trên Chrome staging thật; phiên GR03887 `nw_ready` và cấu hình STG còn, 0 cấp phép, Nextwaves 0/15. Kiểm khung trên trang GR03887 tại `vw=1216` ĐẠT, không điều khiển bị che; operator bỏ qua kiểm lại 1095px. Edge 1095×756 đạt nhưng không thay thế ảnh Chrome thật. Xem `docs/dev/A1-S0-KET-QUA-v0.2.4-20261028.md`.
    - Dev đã phân loại lượt 75,18 ms: không còn trace gốc; tám lượt sau không tái hiện, ba lượt trace có tên ≤10,47 ms, baseline không extension có layout 60–78 ms. PM cho A1 có giám sát, **chưa đóng P2 cho staging done**. Xem `docs/dev/PERF-75MS-v0.2.4-20261028.md`.
    - Operator báo có đúng 15 tem và cho phép một lượt nhận → điền → HOÀN THÀNH trên GR03887/PO13806459/SOBD1594095-F. PM **mở gate A1** theo `docs/pm/DECISION-A1-GATE-v0.2.4-20261028.md`: kiểm hai capture có GET mới, xác nhận 15/15 tem, nhận một lần; dừng trước cấp phép để đối chiếu kế hoạch 5 lô/15 UID; sau điền đọc lại đủ rồi dược sĩ tự HOÀN THÀNH. Lỗi/không rõ thì dừng, không retry. Chưa có bằng chứng A1 thực hiện.
    - Yêu cầu stakeholder tự điền/tự HOÀN THÀNH sau xác nhận Nextwaves là thay đổi nghiệp vụ mới, chưa vào A1; dev khảo sát/spec riêng sau kết quả A1. Production vẫn cần O1/QR/reader, T1-PRD chỉ đọc và phép W1-PRD riêng.
49. (cũ, thay bằng mục 50) **Sau PM audit chuẩn bị A1 v0.2.4, 28/10:**
    - Dev giao `main` `82b215e`, nhánh `b90f6be`: gói giao ổn định, runbook A1 §0, script nâng và preflight chỉ đọc. PM kiểm SHA gói/script; `nang-cap-v0.2.4.ps1 -Check` trên `C:\circa-gr-nextwaves-v0.2.3` đạt 19/19, chưa đổi file. Raw log dev: diễn tập Edge 17/17 giữ ID/phiên, Edge GR 95/95 × 5, đối chứng v0.2.3 hỏng 52/92, Edge tổng 42/42; lượt đối chứng nối nhầm trình duyệt trước đó đã bị loại.
    - **Cho operator nâng cùng thư mục/Extension ID để kiểm staging chỉ đọc theo runbook §0b–§0d**, sau khi xác nhận đúng đường dẫn đang tải. Trước nâng có thể bấm “Mở tab Nextwaves” trên v0.2.3 để làm mới `updatedAt` của phiên GR03887 (chỉ focus/mở tab + cập nhật phiên, không ghi POS/NW). Mất phiên hoặc sai ID/cửa hàng/PO/SO/UI thì dừng trước receive. Operator gửi một bộ bằng chứng UI; PM chốt sau khi xem. Chưa có phép nhận/PUT/HOÀN THÀNH.
    - **P2 hiệu năng mở:** một lượt Edge sau cập nhật đo `ui/panel.js` 75,18 ms, vượt gate <50 ms; năm lượt sau 14,32–16,62 ms. Dev phân loại pha/hàm bằng trace có tên và baseline; không xoá lượt hỏng. Không chặn kiểm chỉ đọc, nhưng PM chưa chốt A1/staging done. Dev sửa lỗi tài liệu `C:circa-...` và đường `-Target` khác mặc định; bắt đầu discovery O1/QR/reader chỉ đọc. Xem `docs/pm/AUDIT-A1-PREP-v0.2.4-20261028.md`.
48. (cũ, thay bằng mục 49) **Sau PM audit cuối v0.2.4, 28/10:**
    - PM kiểm `28d1f9c`/`c08f709` và gói `0BB73E2D`: hai finding rev 1 được sửa ở source/test; SHA và 19/19 ZIP/source/bản giải nén khớp; PM chạy Node 160/160. Raw log dev: Edge GR 94/94 × 2, Edge tổng 42/42 × 2, Node mutation 128/130 trên runtime + 2/2 sau thêm test, Edge mutation 25/25 (một ca bắt bằng watchdog khi cố ý bỏ giới hạn gắn khung). Chưa kiểm UI v0.2.4 trên Chrome staging thật.
    - Operator xác nhận `805da9a` hoàn tác nhầm. PM **đạt gate source/gói** và chọn A1 trên v0.2.4, sau khi dev sửa runbook/version/hash, giao gói ở chỗ ổn định, rehearsal nâng cùng Extension ID trên profile thử và kiểm phiên `nw_ready`. Sau đó cho nâng thật để kiểm UI GR03887 ~1095px **chỉ đọc**; sai phiên/ID/trang/cửa hàng/UI thì dừng trước receive. Xem `docs/pm/AUDIT-POST-REVERT-v0.2.4-20261028.md`. Operator vẫn phải xác nhận 15 tem và cho phép riêng một lượt trước nhận/PUT/HOÀN THÀNH; không thay extension giữa ba chặng.
    - Sau A1 và UI P2 thật đạt mới xét staging done/merge. Discovery O1/QR/reader Florita chỉ đọc có thể làm song song; production còn spec/gate riêng.
47. (cũ, thay bằng mục 48) **Sau PM audit rev 1 v0.2.4, 27/10:**
    - Dev sửa theo ba finding đầu trên `a8d49a1`, gói `95BECDEA`. PM so SHA-256 và 19/19 file ZIP/source/bản giải nén khớp. Dev báo Node 154/154 × 3, Edge GR 90/90, Edge tổng 42/42, 8/8 đột biến mới; 122 Node + 23 Edge đầy đủ còn chạy. PM chưa chạy test nặng song song, chưa có kiểm UI gói mới trên Chrome staging thật.
    - **Chưa duyệt cài/merge:** `grAnchor(code)` chấp nhận mã GR cũ nếu breadcrumb còn A dù thẻ thông tin sát bảng đã đổi B; cần test chỉ đổi thẻ thông tin và guard chính xác trước claim/PUT. Khi W1 đang điền, chuyển GR A → SO B khác có thể vẽ khung nổi A trên SO B do `evalHref` được gán B và router cho mọi SO; cần test và chặn view sai SO. Xem `docs/pm/AUDIT-REV1-v0.2.4-P2-20261027.md`.
    - A1 trên v0.2.3 không đổi: operator xác nhận 15 tem vật lý và cho phép riêng một lượt GR03887 trước receive/PUT/HOÀN THÀNH; không nâng cấp giữa chặng. Production vẫn theo gate O1/QR/reader/T1-PRD/W1-PRD, ngày chỉ là mục tiêu có điều kiện.
46. (cũ, thay bằng mục 47) **Sau PM audit sơ bộ v0.2.4, 27/10:**
    - Runbook A1 `b4cfc67` đã sửa kiểm capture hai tab bằng GET còn mới và đường nhập tay theo đơn vị/lô/số lượng. PM chấp nhận trình operator xác nhận đúng 15 tem vật lý và cho phép riêng một lượt GR03887/PO13806459/SOBD1594095-F; chưa có phép, chưa nhận/PUT/HOÀN THÀNH. Nếu chạy A1 trên v0.2.3 thì không nâng cấp giữa chặng nhận và hoàn tất.
    - P2 v0.2.4 source `b227585`, gói `E8531EB4`: PM đã so 19/19 ZIP/source/bản giải nén và SHA-256 `E8531EB48BE0AE975081691F768B8EB0707EE0CAD6565B142711612F361A9EA8`. Dev báo Node 145/145 × 6, Edge GR 88/88, Edge tổng 42/42; PM chưa chạy test nặng vì đột biến dev đang chạy. Chưa cài lên Chrome staging thật.
    - **Chưa duyệt cài/merge:** (P1) guard `anchoredFor()` không đọc lại mã GR hiển thị khi React giữ nguyên node `#all-receipt`; (P2) kết quả đánh giá GR cũ về muộn có thể vẽ khung nổi trên danh sách/trang khác; (P2) cảnh báo đổi nội dung khi khung thu nhỏ có thể không tự mở. Dev tái hiện bằng test, sửa, ra gói/hash mới, báo kết quả đột biến trên source cuối. Sau đó PM audit lại và mới xét kiểm UI thật. Xem `docs/pm/AUDIT-PRELIM-v0.2.4-P2-20261027.md`.
    - Staging done cần A1 có phép và đạt, P2 trên gói cuối đạt UI/guard/W1; production còn O1, QR POS sau HOÀN THÀNH, máy/reader Florita, T1-PRD chỉ đọc, allowlist/rollback và W1-PRD có phép riêng. Lịch chỉ theo gate.
45. (cũ, thay bằng mục 46) **Sau PM review runbook A1 và spec P2, 27/10:**
    - PM kiểm runbook `docs/dev/RUNBOOK-A1-GR03887-20261027.md`: 15 hậu tố EPC duy nhất, tổng 1+3+3+4+4=15. Status GR/PO và quy đổi là dev quan sát trên trang thật, PM chưa có response làm sạch để tự đối chiếu. Runbook được chấp nhận để trình operator **sau khi dev thêm kiểm capture đang chạy trên hai tab và sửa đường nhập tay (15 EPC không phải 15 hộp/đơn vị cơ bản)**. Không cần vòng PM review mới nếu chỉ sửa đúng hai điểm. Operator vẫn phải xác nhận đủ tem đúng đơn và cho phép riêng một lượt A1; chưa có phép ghi.
    - P2 v0.2.4: PM chọn phương án A có điều kiện, host Shadow DOM trong luồng trang trước `#all-receipt`; sticky chỉ khi geometry không che `SL nhận`, HỦY/HOÀN THÀNH hay nút trong khung ở 1095/1366/1440, nếu không thì in-flow không sticky. Không dùng nhãn nổi B; thiếu anchor thì báo lỗi và W1 fail closed, không mở nút Điền trên panel nổi cũ. Dev được code trên batch, giao test/gói/DIFF; không thay/cài bản v0.2.3 giữa A1.
    - Đợt 2 O1/QR chỉ đọc tiếp tục song song. Không Go merge/staging done/production từ hai quyết định này. Xem `docs/pm/REVIEW-A1-RUNBOOK-P2-v0.2.4-20261027.md`.
44. (cũ, thay bằng mục 45) **Sau PM review plan staging done → Florita, 27/10:**
    - PM duyệt hướng chia giai đoạn/đóng băng phạm vi của `docs/dev/PLAN-STG-DONE-PRD-20261027.md`, **không duyệt nguyên trạng lịch và không cấp phép A1**. Xem finding P1/P2, hợp đồng A1/P2 và mốc có điều kiện tại `docs/pm/REVIEW-PLAN-STG-DONE-PRD-20261027.md`.
    - A1 v0.2.3 trên GR03887/PO13806459/SOBD1594095-F có thể chuẩn bị ngay; dev giao runbook một trang với preflight đúng 15 tem/EPC, trạng thái GR/PO/phiếu gửi, capture, điểm dừng nhận→điền→HOÀN THÀNH và đường xử lý khi mất phiên. Sau PM duyệt runbook, operator mới xác nhận tem và cho phép đúng một lượt. Không nâng cấp giữa receive và hoàn tất.
    - P2 khung phiếu: PM duyệt khảo sát/spec hướng trong luồng trang, chưa duyệt layout/code cho tới khi có anchor DOM, hành vi qua React render và gate mọi trạng thái/nút. Một E2E staging **có giám sát** trên v0.2.3 được phép xét sau A0 dù P2 chưa sửa; P2 vẫn chặn staging done/dùng thường xuyên. v0.2.4 cần audit nguồn/gói/hồi quy W1 và kiểm UI thật trước merge.
    - O1 khôi phục sau nhận cần hợp đồng dữ liệu thật; QR POS mới sau HOÀN THÀNH cần quyết định nghiệp vụ; máy/SO Florita và xử lý reader/rollback còn thiếu. Các mốc 30/10 staging done, 4/11 build/trial PRD, 6/11 Go là **mục tiêu phụ thuộc gate**, không cam kết ngày. Dev có thể làm discovery/spec chỉ đọc song song, production vẫn chỉ đọc.
43. (cũ, thay bằng mục 44) **Sau PM chốt G3a v0.2.3, 27/10:**
    - PM chấp nhận G3a **đạt cho UI chỉ đọc** theo `docs/pm/DECISION-G3a-v0.2.3-20261027.md`: dev xem ảnh POS sau bấm GR03887 (nút `Mở Nextwaves`, bảng đều, không khung che phân trang) và popup v0.2.3 một phiên `nw_ready`; ảnh Nextwaves thật cho thấy khung ngoài modal và nút xác nhận hiện sau cuộn; PM đã kiểm source/gói/Edge. Lượt chạy nhầm bản cũ loại khỏi bằng chứng.
    - Giới hạn: ảnh POS sau bấm khoảng 1230px, không đúng 1095px; hai ảnh Nextwaves không cùng khung hình; số tab thật chưa đếm riêng. PM chấp nhận tổ hợp bằng chứng, **không yêu cầu ảnh hay lượt G3a bổ sung**. G3a không cho phép nhận/ghi/HOÀN THÀNH.
    - Chưa Go merge/vận hành v0.2.3. G3b nhận hàng và W1 điền POS cần plan/gate và phép operator riêng đúng GR/PO; P2 khung phiếu che `SL nhận` ở 1095px cần batch UI trước gate vận hành W1/production. Dev commit file PM nguyên trạng theo quy trình.
42. (cũ, thay bằng mục 43) **Sau PM audit v0.2.3, 27/10:**
    - PM kiểm diff `3218cae..f76cbcc`, chạy `npm test` **135/135**, Edge trên bản giải nén **41/41**, SHA `40236D67A5A4135B3D9B37683167A81667F668A08CBC29DF4F0472076DA5D96C` và **19/19** file ZIP/source/bản cài khớp. F3/F4 đạt gate source/gói/Edge; đột biến 102/102 + DOM 9/9 và đối chứng v0.2.2 hỏng 7/41 là số dev báo, PM chưa chạy lại. Xem `docs/pm/AUDIT-v0.2.3-F3-F4-G3a-20261027.md`.
    - **Cho cài v0.2.3 để kiểm G3a chỉ đọc** trên Chrome staging: trước/sau bấm ở 1095×756 mốc 57px trên trang thật, không khung nổi che phân trang; Nextwaves khung mở rộng sau cuộn không che Xác nhận nhận hàng (một ảnh hoặc quan sát trực tiếp); số tab, popup một phiên, version 0.2.3. Không cần ảnh khung thu nhỏ, không bấm xác nhận/ghi/HOÀN THÀNH. Kiểm phiên đang nhận/điền dở trước khi thay extension và chỉ bật một bản.
    - P2 khung phiếu che `SL nhận` tại 1095px: chưa sửa trong v0.2.3; tách batch UI riêng trước vận hành W1/production, không tự mặc định thu nhỏ khung ở trạng thái cần hành động. G3a chưa đạt toàn bộ, chưa Go merge; G3b/W1/production có gate và phép riêng.
41. (cũ, thay bằng mục 42) **Sau dev giao v0.2.3, 27/10:**
    - **PM:** audit nguồn / gói v0.2.3 (`f76cbcc`, runtime `247386f`, gói `40236D67`) theo `docs/dev/BATCH-v0.2.3.md`. Quyết phương án P2 khung trang phiếu (§4.2 báo cáo).
    - **Sau PM cho cài:** kiểm G3a lại trên Chrome staging với `C:\circa-gr-nextwaves-v0.2.3`:
      - danh sách trước / sau bấm ở 1095px (dòng 57px, tiêu đề không xuống dòng);
      - Nextwaves sau cuộn với khung mở rộng;
      - số tab, popup, version.

      Dev tự quan sát nếu Claude in Chrome kết nối; không thì operator theo hướng dẫn G3a. Không nhận / điền / HOÀN THÀNH.
    - Chưa Go merge / vận hành. G3b / W1 / production có gate và phép riêng.
40. (cũ, thay bằng mục 41) **Sau PM review bốn ảnh G3a v0.2.2, 27/10:**
    - PM xem trực tiếp ảnh danh sách trước/sau bấm GR03879 và phiếu GR03878 mở/thu khung. Phần đã thấy: nút đúng 7 dòng chờ nhận/đang nhận, dòng trước bấm 57px, POS vẫn ở danh sách sau bấm; khung phiếu không che HỦY/HOÀN THÀNH. Chưa kết luận G3a đạt toàn bộ.
    - F3: nhãn trạng thái dài làm bảng dàn lại, dòng cao khoảng 73px tại vùng trang 1095×756. F4: khung thông báo che phân trang và cột hành động cuối. Cả hai phải sửa trước merge/vận hành. PM duyệt nhãn ngắn có nghĩa đầy đủ ở `title`/`aria-label`; trên danh sách không giữ khung nổi thành công, lỗi/cảnh báo phải hiện mà không phủ điều khiển. Xem hợp đồng và gate trong `docs/pm/REVIEW-G3a-F3-F4-v0.2.3-20261027.md`.
    - **Dev được làm v0.2.3 ngay** trên nhánh batch, tăng version/ZIP/SHA, giao DIFF/test/Edge ở 1095×756 và ảnh thật sau sửa để PM audit. Không cần chờ đủ ảnh Nextwaves mới viết code. PM chưa duyệt merge hoặc dùng bản này để nhận/ghi.
    - Operator xác nhận lần bấm GR03879 đầu đã thấy “Danh sách đã đổi — bấm lại”; không phải cú bấm không phản hồi. Thông báo phù hợp hàng rào huỷ khi danh sách đổi, chưa chứng minh sự kiện đổi cụ thể. Còn thiếu G3a: kiểm khung Nextwaves **mở rộng sau cuộn** cùng nút Xác nhận nhận hàng trên trang thật (một ảnh hoặc dev/PM quan sát trực tiếp có kích thước/trạng thái), số tab Nextwaves, popup một phiên GR03879, version cài và tình trạng phiên cũ. **Không buộc operator chụp khung Nextwaves thu nhỏ**; Edge đã kiểm trên trang dựng, đây chỉ là bằng chứng phụ. Dev tự quan sát chỉ đọc nếu truy cập được. Khung mở trên GR03878 còn che một phần điều khiển số lượng sản phẩm ở 1095×756; ghi P2 tương tác riêng trước W1. Ảnh chứa tên nhân viên, chưa đưa vào repo.
39. (cũ, thay bằng mục 40) **Sau PM audit G0/G1/G2 v0.2.2, 27/10:**
    - PM audit `batch/v0.2-rfid` tại `3218cae` (runtime `a1975f1`, gói `AB96179D`): G0.1 response và G0.2 DOM chấp nhận cho tích hợp; G1 source/test và G2 gói/Edge đạt. PM độc lập chạy 133/133 test, Edge gói 25/25, gói cũ v0.2.1 hỏng đúng 3/25 F1/F2, dựng lại SHA và so 19/19 file. Xem `docs/pm/AUDIT-v0.2.2-G0-G1-G2-20261027.md`.
    - **Cho phép cài v0.2.2 trên Chrome staging để kiểm G0.3 UI và phần G3a chỉ đọc**, sau khi xác nhận không có phiên nhận/điền dở và không bật hai bản extension cùng lúc. Chọn Staging, không cấp phép điền; kiểm nút danh sách, khung POS và khung Nextwaves sau cuộn. Được bấm bắt đầu RFID để tạo phiên/GET, không bấm Xác nhận nhận hàng/HOÀN THÀNH, không PUT. Ảnh hoặc quan sát trực tiếp ba màn theo báo cáo PM; không bắt đúng năm ảnh cũ.
    - Ngân sách: mỗi lượt quét danh sách <2 ms gồm bước lấy dòng; mọi tác vụ extension <50 ms. Không áp <2 ms cho mọi callback. Dev sửa mâu thuẫn mô tả giữa §3b và §4.2 của `docs/dev/BATCH-v0.2.2-G0.md`, không đổi runtime/gói vì lỗi tài liệu.
    - Chưa Go merge hoặc dùng v0.2.2 để vận hành nhận/ghi. G3b sau nhận hàng/quay về GR còn chờ lượt thật với phép operator riêng đúng GR/PO; production vẫn chỉ đọc và có gate Đợt 2.
38. (cũ, thay bằng mục 39) **Sau dev giao G0 + v0.2.2, 27/10:**
    - **PM:** audit G0 và v0.2.2 (`a1975f1`, gói `AB96179D`) theo `docs/dev/BATCH-v0.2.2-G0.md`. Quyết hai điểm dev đề nghị:
      - Edge trên trang dựng theo cấu trúc / kích thước thật (1366×768, 1440×900) có thay được ảnh khung với extension cài thật không;
      - định nghĩa ngân sách toàn bộ tác vụ: mỗi lời gọi extension < 2 ms ở trạng thái thường; nạp script một lần mỗi trang < 50 ms.
    - **Operator:** nếu PM vẫn cần ảnh thật, cài gói v0.2.2 (hoặc v0.1.6) trên Chrome đã đăng nhập staging khi Claude in Chrome kết nối được, để dev chụp chỉ đọc. Lượt nhận / ghi staging vẫn cần phép riêng đúng GR / PO.
    - Chưa Go merge / cài v0.2.x để vận hành. Production chỉ đọc; Đợt 2 có gate riêng.
37. (cũ, thay bằng mục 38) **Sau PM audit v0.2.1, 27/10:**
    - PM đã kiểm độc lập `cbac491` / gói `E34FF7C5`: 133/133 test; dựng lại SHA và so 19/19 file source/ZIP/bản giải nén; Edge trên gói 17/17 hai lượt (lượt tải tối đa 1,2 và 1,0 ms); benchmark bảng giả 200 dòng tạo đủ 130 nút. P2.1 đóng ở source/test, P2.2 đóng trên Edge trang giả. Xem `docs/pm/AUDIT-v0.2.1-SOURCE-PACK-20261027.md`.
    - **G1 source/gói và G2 Edge trang giả đạt; G0 trang thật còn chờ.** Dev đã được operator cho phép dùng Claude in Chrome chỉ đọc nhưng bàn giao cho biết Chrome chưa kết nối. Dev lấy response/DOM/UI và đo toàn bộ tác vụ trên trang danh sách staging thật, đối chiếu selector/parser; khác giả định thì sửa, phát hành gói mới và PM audit lại.
    - Chưa Go merge/cài v0.2.1 để vận hành, chưa Go nhận/ghi staging. Mỗi lượt có tác động cần operator cho phép riêng. Production chỉ đọc; Đợt 2 có gate riêng.
36. (cũ, thay bằng mục 37) **Sau dev giao v0.2.1, 27/10:**
    - **PM:** audit lại P2.1 / P2.2 trên nhánh `batch/v0.2-rfid` `cbac491` và gói `E34FF7C5` theo `docs/dev/BATCH-v0.2.1.md`.
    - **Dev:** lấy G0 chỉ đọc bằng Claude in Chrome (operator cho phép 27/10):
      - Copy response danh sách GR (chỉ body);
      - outerHTML một dòng chờ nhận và vùng HOÀN THÀNH / Hủy;
      - ảnh khung v0.1.6 trên POS GR03878 và màn quét Nextwaves;
      - đo hiệu năng trên DOM danh sách thật (phát lại trong edge-check, có / không extension).
      Đối chiếu với giả định `gr-list.js` / hook; khác thì sửa, ra gói mới.
    - **Operator:** giữ Chrome đăng nhập POS / Nextwaves staging, kết nối Claude in Chrome, cài v0.1.6 (`C:\circa-gr-nextwaves-v0.1.6`, chọn Staging, không cấp phép điền).
    - Chưa Go merge / cài v0.2 để vận hành, chưa Go nhận / ghi staging. Production chỉ đọc; Đợt 2 có gate riêng.
35. (cũ, thay bằng mục 36) **Sau PM audit v0.2.0, 27/10:**
    - PM đã kiểm độc lập `batch/v0.2-rfid` tại `682c509` và gói `096D97D9`: `npm test` 131/131; dựng lại ZIP cùng SHA, 19/19 file khớp source và bản giải nén; Edge trên trang giả 16/16 hai lượt. Xem `docs/pm/AUDIT-v0.2.0-SOURCE-PACK-20261027.md`.
    - **Dev:** sửa P2.1 replay response danh sách cũ khi content nạp muộn; làm rõ/sửa P2.2 phép kiểm lượt quét lúc tải trang (<2 ms theo ngân sách PM, nhưng test hiện cho <16 ms). Runtime sửa phải tăng version/gói/hash; bàn giao diff, test và số đo.
    - **G0 tích hợp trang thật:** dev/PM lấy chỉ đọc trên phiên staging đã đăng nhập: response danh sách GR, outerHTML một dòng và vùng HOÀN THÀNH/Hủy, kiểm khung POS/Nextwaves và hiệu năng thật. Bộ 5 ảnh v0.1.6 là checklist đề xuất; PM chấp nhận bằng chứng UI tương đương vì phần khung và Nextwaves không đổi trong v0.2. Operator hỗ trợ mở phiên hoặc chuyển mục thiếu nếu dev/PM không truy cập được; không bắt operator tự thu đủ bộ trước khi dev làm việc.
    - Chưa Go merge/cài v0.2 để vận hành, chưa Go nhận/ghi staging. Lượt có tác động cần phép operator riêng. Production vẫn chỉ đọc; Đợt 2 có gate riêng.
34. (cũ, thay bằng mục 35) **Sau dev giao v0.2.0, 27/10:**
    - **PM:** audit nhánh `batch/v0.2-rfid` (đầu `682c509`, runtime `ef67a7b`) và gói `096D97D9` theo `docs/dev/BATCH-v0.2.0.md` (G1 test / đột biến, G2 Edge / hiệu năng). Chốt gate UI v0.1.6 khi có ảnh thật.
    - **Operator (hoặc dev chỉ đọc nếu operator mở phiên / cho phép Claude in Chrome):** G0:
      - 5 ảnh UI v0.1.6 (3 POS trên GR03878, 2 Nextwaves);
      - Copy response danh sách GR `/danh-sach-phieu-nhan-hang`;
      - outerHTML một dòng danh sách + vùng nút HOÀN THÀNH / Hủy (đã làm sạch).
      Chưa nhận / điền / HOÀN THÀNH để lấy G0.
    - **Dev:** đối chiếu G0 với giả định `gr-list.js` (`rowCode` / `slotOf`) và hợp đồng hook. Khác thì sửa, ra gói mới, PM audit lại. Không cài v0.2 trước khi PM cho phép.
    - Staging nhận / PUT / HOÀN THÀNH vẫn cần phép riêng từng lượt; production chỉ đọc; Đợt 2 (O1, mã QR sau HOÀN THÀNH, reader Florita, PRD Florita) spec riêng.
33. (cũ, thay bằng mục 34) **Sau PM đính chính G0, 26/10:**
    - **Dev:** bắt đầu code/test Đợt 1 v0.2 trên nhánh riêng từ `b4017d7`; dùng mẫu giả cho phần chưa có DOM thật. Song song thu response/DOM staging chỉ đọc khi truy cập được; bàn giao G1/G2 theo spec rev 2 và đính chính PM.
    - **PM:** cùng dev kiểm giao diện v0.1.6 và dữ liệu danh sách thật; dùng bằng chứng để chốt selector/hợp đồng và gate merge/cài v0.2. Không yêu cầu operator tự làm đủ năm ảnh trước khi dev code.
    - **Operator:** chỉ cần hỗ trợ mở phiên staging hoặc gửi bằng chứng còn thiếu nếu dev/PM không truy cập được. Mọi thao tác nhận hàng/PUT/HOÀN THÀNH trên staging vẫn cần phép riêng từng lượt; production chỉ đọc.
32. (cũ, thay bằng mục 33) Dev hoàn thiện spec rev 2; quy tắc chờ G0 trước khi code đã được PM sửa ở lần 33.
31. (cũ, thay bằng mục 32) **Sau PM kiểm plan rev 1, 26/10:**
    - **Operator:** gửi G0 chỉ đọc: 3 ảnh POS + 2 ảnh Nextwaves v0.1.6, `Copy response` danh sách GR và outerHTML dòng/vùng nút đã làm sạch. Chưa nhận/điền/HOÀN THÀNH để lấy G0.
    - **Dev:** bổ sung thứ tự request/query và vô hiệu click khi dòng/filter đổi theo `docs/pm/REVIEW-PLAN-v0.2-REV1-20261026.md`; chờ PM chốt G0 trước khi code Đợt 1.
    - **PM:** kiểm ảnh/response/DOM thật, chốt gate UI v0.1.6 và G0; sau đó audit build v0.2.0 theo G1/G2. O1/PRD Florita có spec/gate riêng.
30. (cũ, thay bằng mục 31) Dev thêm Spec Đợt 1 rev 1 theo P1/P2 PM; G0 chưa đạt.
29. (cũ, thay bằng mục 30) **Sau PM review kế hoạch v0.2, 26/10:**
    - **Operator:** gửi ảnh UI v0.1.6 chỉ đọc trên POS/Nextwaves staging; response danh sách GR và outerHTML dòng/vùng nút đã làm sạch. Lượt nhận/ghi staging mới chỉ tiến hành khi operator cho phép riêng đúng GR/PO.
    - **PM:** chốt gate UI v0.1.6 trên trang thật; sau đó audit Đợt 1 v0.2.0 theo `docs/pm/REVIEW-PLAN-v0.2-RFID-BUTTON-PROD-20261026.md` và bằng chứng dev. Chưa duyệt merge v0.1.6 hoặc build/ghi v0.2.0.
    - **Dev:** cập nhật plan theo P1/P2 PM; chỉ code Đợt 1 khi G0 đạt, bàn giao nhánh/DIFF/test/gói/Edge/hiệu năng. Đợt 2 O1/PRD Florita phải có spec riêng.
    - **Production:** chỉ đọc. O1, ý nghĩa mã QR POS sau HOÀN THÀNH và xung đột reader trên máy Florita cần giải hoặc có quyết định vận hành rõ trước gate W1-PRD.
28. (cũ, thay bằng mục 29) Dev đề xuất kế hoạch v0.2; PM đã duyệt hướng và bổ sung gate ở lần 29.
27. (cũ, thay bằng mục 28) **Sau PM audit source/gói UI v0.1.6, 26/10:**
    - **Operator:** sau khi chắc chắn không có phiên dở giữa Nextwaves đã nhận và POS chưa điền, cài bản giải nén `C:\circa-gr-nextwaves-v0.1.6`, chọn Staging và kiểm UI **chỉ đọc** theo `docs/dev/FIX-UI-v0.1.6.md` §6: ba ảnh POS, hai ảnh Nextwaves, thấy rõ nút thao tác và khung ở trạng thái mở/thu nhỏ, sau cuộn hoặc đổi kích thước. Không nhận hàng, cấp phép điền, điền GR hay bấm HOÀN THÀNH trong lượt này.
    - **PM:** đối chiếu ảnh trên trang thật; nếu khung tránh nút, chốt gate UI và quyết merge/dùng bản v0.1.6. Nếu còn chồng, chuyển DOM/ảnh cho dev sửa, tăng version/ZIP/SHA rồi audit lại.
    - **Quy đổi:** v0.1.6 giữ all-or-nothing theo từng lô; lô lẻ không PUT, không làm tròn/điền một phần. Operator/Buymed/POS xác nhận cách sửa đơn vị/chứng từ nếu ca này xảy ra.
    - **Trước production:** O1 và ý nghĩa mã QR POS thêm sau HOÀN THÀNH vẫn mở; tra QR chỉ đọc và quyết nghiệp vụ. PO staging còn lại giữ cho lượt thử đã chốt mục đích.
26. (cũ, thay bằng mục 27) Dev hoàn tất gate source/gói v0.1.6; PM đã audit độc lập và cho lượt kiểm UI chỉ đọc trên staging thật.
25. (cũ, thay bằng mục 26) PM review UI sơ bộ và quyết định quy đổi vỉ → hộp; chờ gate dev source/gói.
24. (cũ, thay bằng mục 25) PM audit T3/W1 đã cho merge mã staging; O1, mã QR sau HOÀN THÀNH và P3 còn mở.
23. (cũ, thay bằng mục 24) PM audit T3/W1, O1, mã QR sau HOÀN THÀNH, P3; giữ PO thứ hai để thử sau.
22. (cũ, thay bằng mục 23) **Hiện hành (26/10, sau lần 22):**
    - **Operator — gấp, trước 23:00 ngày 26/10:** export `chrome.storage` (bước 12 của `docs/dev/FULL-STG-HUONG-DAN.md`) để giữ nhật ký phiên GR03878 trước khi bị xoá.
    - **PM:** audit `docs/dev/T3-KET-QUA-PO28237814-20261025.md` và nhánh `afd98d5` (mẫu T3, test, không đổi runtime); quyết O1 (chỉ hướng dẫn, hay cần khôi phục phiên sau khi đã nhận).
    - **Operator:** chạy trọn luồng trên SO mới theo `FULL-STG-HUONG-DAN.md` (Net Capture tab POS suốt lượt). Dev lấy bằng chứng W1 / HOÀN THÀNH và tra QR thật từ lượt đó.
    - Merge mã ghi chỉ sau gate W1 và PM đồng ý.
21. (cũ, thay bằng mục 22) **Hiện hành (sau PM audit T1 live, 25/10):**
    - **T1 đã đóng:** popup và hai response đã đối chiếu; không cần chạy lại cùng ca để lấy thêm bằng chứng T1.
    - **Operator chọn SO hiện tại:** nếu muốn thử nhánh lỗi K1 trên PO28237814, cho phép riêng một lượt bấm "Xác nhận nhận hàng" ở Nextwaves; ghi trạng thái shipment/`/receiving` trước và sau, response, khung và GR. Nextwaves có thể chấp nhận phiếu gửi trước khi báo lỗi nhận, nên không tự thử lại. Không cấp phép điền POS; phản hồi 400 không đạt gate T3.
    - **K1 → T3 thành công:** ưu tiên Nextwaves/Buymed sửa đơn hiện tại; nếu không được, tạo SO staging khác cùng cửa hàng 2222 rồi chạy T1 cho cặp mới. T3 cần response 2xx `receive-scan`, GET PO, shipment và `/receiving` sau nhận để PM audit.
    - **W1** chỉ sau T3 đạt và operator cho phép từng lượt trên GR cụ thể. Chưa merge mã ghi.
20. (cũ, thay bằng mục 21) Sau T1 lần 2: chụp popup, PM audit T1; K1 → T3 → W1.
19. (cũ, thay bằng mục 20) **Sau PM audit sửa T1 v0.1.5, 25/10:**
    - **Operator — T1 chạy lại với v0.1.5:**
      - gỡ mọi bản cũ, Load unpacked `C:\circa-gr-nextwaves-v0.1.5`, chọn lại Staging, không cấp phép điền;
      - tải lại tab POS, mở GR03878;
      - gửi ảnh khung hai tab + popup + Copy response tìm GR theo SO `1593858` và tìm đơn Nextwaves `SOBD1593858` (giữ `total / page / limit`, bỏ credential).
    - K1 → lượt nhận thật → hợp đồng "đã nhận" → W1 có operator cho phép. Chưa merge mã ghi.
18. (cũ, thay bằng mục 19) PM audit sửa T1 theo `docs/dev/FIX-T1-v0.1.5.md`; kết quả ở `docs/pm/AUDIT-T1-FIX-v0.1.5-STG-20261025.md`.
17. (cũ, thay bằng mục 18) Sau PM audit v0.1.4:
    - **Operator — T1 chỉ đọc với v0.1.2 hoặc v0.1.4:** tắt bản cũ, chọn Staging, không cấp phép điền, mở GR03878; gửi ảnh khung hai tab + Copy response tìm đơn Nextwaves và tìm GR theo SO `1593858` (giữ `total / page / limit`, bỏ credential).
    - K1 → lượt nhận thật → hợp đồng "đã nhận" → W1 có operator cho phép. Chưa merge mã ghi.
16. (cũ, thay bằng mục 17) PM audit P2.4 theo `docs/dev/FIX-AUDIT-v0.1.2-STG.md`; kết quả ở `docs/pm/AUDIT-v0.1.4-STG-20261025.md`.
15. (cũ, thay bằng mục 16) Sau PM audit v0.1.2:
    - **Operator — T1 chỉ đọc** (dev đề xuất cài v0.1.2 `C:\circa-gr-nextwaves-v0.1.2`; PM cho phép cả v0.1.1):
      - Staging, **không cấp phép điền**, mở GR03878;
      - gửi ảnh khung hai tab, Copy response `inter-tenant-orders/receiving?…q=SOBD1593858` và `goods-receipt/search?query=so_thuocsi=1593858…` (giữ `total / page / limit`, bỏ token).
    - K1 → lượt nhận thật (2xx `receive-scan`, GET PO, GET shipment, GET `/receiving` sau nhận). W1 chỉ sau đó và PM audit lại.
    - **Dev:** trước khi nâng cấp giữ cùng extension ID, xử lý phiên active từ bản cũ thiếu khoá (P2.4); kiểm thử phiên cũ. Chưa merge mã ghi.
14. (cũ, thay bằng mục 15) PM audit lại v0.1.2 theo `docs/dev/FIX-AUDIT-v0.1.1-STG.md`; kết quả ở `docs/pm/AUDIT-v0.1.2-STG-20261024.md`.
13. (cũ, thay bằng mục 14) Sau PM audit lại v0.1.1:
    - **Dev:** sửa P1.6/P1.7 theo `docs/pm/AUDIT-v0.1.1-STG-20261024.md`, gửi DIFF và test nguyên văn; runtime đổi thì version/ZIP/SHA-256 mới. PM audit lại trước merge.
    - **Operator — T1 chỉ đọc bằng v0.1.1:**
      - cài `C:\circa-gr-nextwaves-v0.1.1`, Staging, **không cấp phép điền**, mở GR03878;
      - chụp hai khung, Copy response `inter-tenant-orders/receiving?…q=SOBD1593858` và `goods-receipt/search?query=so_thuocsi=1593858…` (giữ `total/page/limit`).
    - Operator / Nextwaves / Buymed gỡ **K1** → lượt nhận thật. Dev cần các response sau để thay phần dựng lại:
      - 2xx `receive-scan`;
      - `purchase-orders/<id>` và `inter-tenant-shipments/<id>` sau khi nhận.
    - W1: chỉ khi gate trên đạt và PM audit lại. Operator chỉ định 1 GR staging rồi cấp phép một lần trong popup.
12. (cũ, thay bằng mục 13) PM audit lại v0.1.1 theo báo cáo dev, T1 chỉ đọc.
11. (cũ, thay bằng mục 12) Sau batch v0.1:
     - PM đã audit nhánh `batch/v0.1-staging` theo `docs/pm/AUDIT-BATCH-v0.1-STG-20261024.md`; **chưa cho merge hoặc ghi POS**. Dev sửa P1.1–P1.5, báo gate để PM audit lại.
    - Operator thử **T1 (chỉ đọc)** trên laptop này: cài `C:\circa-gr-nextwaves-v0.1.0`, Staging, điền phiếu = Tắt, mở GR03878 (§6 file báo cáo).
    - Operator / Nextwaves / Buymed gỡ **K1** (hoặc tạo SO thử có dòng theo đơn vị gốc) → **T3**: lượt nhận thành công thật.
      Dev cần capture lượt đó (response 2xx `receive-scan`, `purchase-orders/<id>` và `inter-tenant-shipments/<id>` sau khi nhận) để thay phần dựng lại trong test.
    - Operator chọn **1 GR staging cho phép ghi thử W1** (P1). Chỉ ghi khi operator cho phép lần đó.
10. (cũ, trước khi code) **Hiện hành cũ:**
    - PM: viết **spec v0.2** từ `docs/dev/LOGIC-v0.3.md` (§0–§9) + quyết định Q1 / Q3, rồi giao **B1 (chỉ đọc)**.
    - Operator chốt:
      - Q4: ai bấm HOÀN THÀNH;
      - Q6: SO nhiều GR;
      - chế độ "Scan QR tăng SL nhận" còn cần không khi đã chọn W1;
      - đích chuyển màn: `/vi/purchases/<id>` hay `/vi/purchases/receive?po=<id>`.
    - Operator lấy (chỉ đọc, không bấm xác nhận):
      - **R1:** mở `https://circa-stg.nextwaves.app/vi/purchases/receive?po=SOBD1593858` → Copy response `inter-tenant-orders/receiving?…q=SOBD1593858`;
      - **R2:** mở `…/vi/purchases/receive?po=PO28237814` → Copy response `…receiving?…q=PO28237814`.
    - Để sau (B3 / B4):
      - một lượt nhận thành công theo đường đơn liên kết (sau khi gỡ K1);
      - một GR staging operator cho phép dev ghi thử W1.
9. (cũ) PM audit `docs/dev/LOGIC-v0.3.md` và chốt Q1–Q6 (§7 của file đó). Q1, Q3 đã chốt 24/10; D4 đã có.
8. (cũ) PM audit `docs/dev/LOGIC-v0.2.md` và chốt Q-L, Q-A, Q-N, Q-M, Q-S, Q-K, Q-U (§6 của file đó).
   Operator lấy dữ liệu §7 của file đó: trạng thái kết nối Circa, bộ chọn GR của PO28237814, phép thử nhận PO28237814 có liên kết GR03878.
   Mục 7 cũ:
   Operator lấy dữ liệu §8 của file đó: D4 cho 12 UID, `/receiving` của PO28237814, lời gọi "Xác nhận nhận hàng", D1.
