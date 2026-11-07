# Case "phiếu phần còn lại": POS tự tách phiếu khi HOÀN THÀNH một phần (07/11/2026)

**Trạng thái:** định nghĩa + phát hiện vấn đề. **Chưa sửa mã** (operator 07/11: batch này chỉ bàn, định nghĩa, tìm vấn đề). Tái hiện trên staging được operator cho phép, chờ đăng nhập POS staging trên máy dev.

**Nguồn:**
- operator 07/11: hai Copy response GR84673 và GR84803 (mẫu đã bỏ tên người: `samples/gr-prod-GR84673-tach-20261107.json`, `samples/gr-prod-GR84803-phan-con-lai-20261107.json`);
- trang phiếu mua hàng PO01974970 trên POS, đọc qua Chrome máy dev;
- trang Nextwaves PO-2026-000001, đọc qua Chrome máy dev;
- mã v0.4.0 (nhánh `batch/v0.4-moi-pos` `ec4293c`, `src/` = `8a28fc4`, gói 79D4269C đang chạy trên máy POS Florita);
- mẫu staging T3 25/10 (`samples/nw-stg-receiving-search-q-SOBD1593858-T3-sau-20261025.json`).

## 1. Nghiệp vụ (operator 07/11)

Dược sĩ cần bán gấp một món vừa giao cho khách đang chờ, nên làm như sau:
1. Mở phiếu nhận, chỉ nhận món đó (quét QR).
2. Bấm **HOÀN THÀNH** để hàng vào kho bán ngay.
3. POS tự sinh **phiếu mới chứa phần chưa nhận**.
4. Xong việc gấp, dược sĩ quay lại nhận nốt phần còn lại.

Đây là thao tác thật và sẽ lặp lại, nên extension phải **hỗ trợ** phiếu phần còn lại, không chỉ cảnh báo.

## 2. Sự thật đã thấy trên production

Florita, SO 38565378, PO POS PO01974970 ↔ Nextwaves PO-2026-000001 (18 dòng / 22 tem).

| Giờ (VN) | Sự việc |
|---|---|
| 11:27:28 | GR84673 COMPLETED khi mới nhận **1/18 dòng** (Gel Arrahan, 1 UID quét tay). Cùng giây POS tạo **GR84803** |
| 11:41 | Nextwaves PO-2026-000001 nhận **22/22** tem, kể cả tem Arrahan đã nhận ở GR84673 |
| 12:02:16 | GR84803 COMPLETED đủ 17 dòng (21 đơn vị), nhận tay. Không có dấu hiệu extension điền |

Phía POS:
- **P1.** HOÀN THÀNH khi chưa nhận đủ: phiếu cũ thành COMPLETED. Các dòng chưa nhận **vẫn nằm trên phiếu cũ** với `received_quantity` 0.
- **P2.** Phiếu mới được tạo cùng lúc (`created_at` GR84803 = 04:27:28.127Z, `updated_at` GR84673 = 04:27:28.279Z). `created_by` là người bấm HOÀN THÀNH. Phiếu mới:
  - cùng `purchase_order_id`, mã GR mới, `put_code` mới;
  - **chỉ có các dòng chưa nhận đủ** (17/18), `quantity` = phần còn lại;
  - `item.ref_id` giữ nguyên (cùng dòng PO), lô giữ nguyên (`lot_id`, `lot_date`), id chi tiết mới.
- **P3.** Không có trường nào trỏ về phiếu gốc; hai phiếu chỉ nối với nhau qua PO. PO liệt kê cả hai phiếu (`goods_receipts`), vẫn **một** mã giao / SO. Trang PO ghi "Đã nhập kho"; "PO con" để trống.
- **P4.** Sau COMPLETED, mỗi đơn vị có 2 mã: UID đã quét và 1 mã POS tự sinh (dạng `17939…C11`), không phải UID Nextwaves. Hiện tượng này đã biết từ R5 / D1.
- **P5.** Dòng Femalto trên GR84803 có chi tiết `quantity` 0, `received_quantity` 1, không mã. Trang PO hiện hai dòng lô "010826" (1 và 0). **Chưa rõ** POS sinh như vậy hay dược sĩ sửa tay; cần tái hiện (§7).

Phía Nextwaves:
- **N1.** Đơn Nextwaves không biết POS tách phiếu: một đơn ↔ một PO POS, nhận một lần 22/22.
- **N2.** Đơn đã nhận **không tìm lại được theo SO**: `inter-tenant-orders/receiving?q=<SO>` trả `total 0` sau khi nhận (staging T3 25/10). Đây là cùng lý do với finding 1 trong `AUDIT-v0.4.0-20261107.md`.

## 3. Extension v0.4.0 xử lý thế nào (đã kiểm từ mã)

**Phiếu gốc.** Hook thấy `PUT …/status/COMPLETED` (`pos-content.js:1199`). Phiên chuyển `done`, tab Nextwaves của phiên bị đóng và đầu đọc được trả (`background.js:135`). Lượt nhận Nextwaves sau đó không thuộc phiên nào, nên không phiếu nào được điền.

**Phiếu phần còn lại** bị chặn ở bốn chỗ độc lập, chỗ nào cũng đủ để dừng:

| # | Chỗ chặn | Mã | Kết quả trên GR84803 |
|---|---|---|---|
| C1 | Khoá ghi POS: mỗi PO chỉ được có **một** phiếu chưa huỷ, tính cả phiếu đã COMPLETED | `pos-model.js:107` `soWriteLock` → `so_many_gr` | Luôn khoá điền |
| C2 | Khớp đơn: vân tay số lượng của **phiếu đang mở** so với **cả đơn** Nextwaves | `resolve.js:114` | 17 dòng vs 18 dòng: lệch SP 77749 (GR 0 ≠ NW 1) → `no_match` "số lượng không khớp". Nếu Nextwaves đã nhận rồi → `resolve.js:91` `no_order` "chưa có đơn chờ nhận" (N2) |
| C3 | Màn quét chỉ đưa về POS khi nhận đủ **mọi tem của đơn** | `nw-content.js:598–605` | Món đã bán gấp không còn để quét → kẹt "mới nhận 21/22" |
| C4 | Kế hoạch: UID có sản phẩm không nằm trên phiếu → chặn cả gói | `plan.js:100` `product_not_on_gr` | UID Arrahan không thuộc GR84803 → không điền gì |

Đánh giá:
- **Dừng an toàn:** không ghi sai POS, không lặp, không treo.
- **Chi phí:** dược sĩ nhận tay toàn bộ phần còn lại (21 đơn vị trong case này).
- **Lời báo sai lý do:** khung chỉ nói "lệch số lượng" hoặc "chưa có đơn", không nói đây là phiếu phần còn lại.

Không kẹt: quét tay vài món trên phiếu mà **không** bấm HOÀN THÀNH, rồi nhận Nextwaves. Extension vẫn điền tiếp được, vì mã có sẵn trên phiếu được tính là đã nằm đúng chỗ.

## 4. Biến thể

| # | Biến thể | Ghi chú |
|---|---|---|
| V1 | Bán gấp **trước** khi nhận Nextwaves (case 07/11) | Thường gặp nhất |
| V2 | Nextwaves đã nhận + extension đã điền / đang điền, dược sĩ bớt dòng rồi HOÀN THÀNH | Kết quả nhận nằm trong phiên phiếu gốc, nhưng phiên đó đã `done` |
| V3 | Nhận một **phần** của một dòng (dòng SL 3, nhận 1) | Phiếu phần còn lại có dòng SL 2? Chưa thấy — tái hiện §7 |
| V4 | Tách nhiều lần (GR → GR′ → GR″) | Mọi phiếu đã xong của PO đều phải tính |
| V5 | Món bán gấp nhận bằng cách **nhập số tay** (không quét QR) | Không biết tem nào đã ra khỏi kho |
| V6 | Extension điền thiếu (dòng Nextwaves không gắn tem), dược sĩ HOÀN THÀNH luôn | Extension tự tạo ra V1 / V3 |

## 5. Vấn đề

| # | Mức | Vấn đề |
|---|---|---|
| I1 | P2 | Phiếu phần còn lại luôn nhận tay (C1–C4). Tần suất: mỗi lần bán gấp lúc hàng vừa về |
| I2 | P3 | Lời báo sai lý do (§3) |
| I3 | P2 | Nextwaves đã nhận trước khi mở phiếu phần còn lại → không tìm lại được đơn theo SO (N2). Chỉ cứu được nếu cùng máy còn phiên phiếu gốc có kết quả nhận (V2) |
| I4 | P3 | Món bán gấp nhập số tay (V5): với lô đó, số tem Nextwaves nhiều hơn phần còn lại, không biết tem nào đã bán → phải chặn sản phẩm đó |
| I5 | ? | P5 (chi tiết SL 0): nếu POS sinh như vậy, kế hoạch hiện hành chặn `over` (`plan.js:187`) → cần dữ liệu |
| I6 | ngoài phạm vi, cần kiểm | Bán gấp **trước** khi Nextwaves nhận tem đó → lệnh trừ tồn của QR Scan Log cho tem đó gặp tem chưa vào kho Nextwaves; sau đó Nextwaves nhận lại chính tem đã bán. Cần kiểm với dự án QR Scan Log |

## 6. Hướng xử lý (đề xuất, chưa code)

H2, hỗ trợ phiếu phần còn lại:

| # | Thiết kế |
|---|---|
| D1 | **Nhận diện** phiếu phần còn lại khi đủ cả bốn điều kiện: PO có ≥ 2 phiếu; mọi phiếu khác COMPLETED; phiếu đang mở là phiếu chờ nhận duy nhất; **cộng sổ theo dòng PO** (`item.ref_id`, đơn vị gốc) khớp: Σ đã nhận ở phiếu đã xong + SL phiếu đang mở = SL dòng PO. Thiếu điều kiện nào → giữ khoá như v0.4.0 |
| D2 | **Khoá ghi POS:** thay luật "một phiếu chưa huỷ mỗi PO" bằng D1. Vẫn khoá khi hai phiếu cùng PO cùng mở hoặc sổ lệch |
| D3 | **Khớp đơn Nextwaves theo cả PO** (tổng mọi phiếu của PO), không theo phiếu đang mở. SO tách giao vẫn chọn đúng một đơn |
| D4 | **Tập tem phải nhận** = tem của đơn trừ tem có UID đã nằm trên phiếu đã xong của PO (lọc mã POS tự sinh, P4). Màn quét coi là "đủ" khi đủ tập này; tem của món bán gấp có hay không đều được |
| D5 | **Kế hoạch điền** chỉ dùng UID chưa nằm trên phiếu đã xong. Lô có số tem dư so với phần còn lại (V5) → chặn sản phẩm đó, dừng an toàn |
| D6 | **Nextwaves đã nhận trước** (I3): dùng kết quả nhận trong phiên phiếu gốc trên cùng máy nếu có. Không có → nhận tay, tới khi Nextwaves có `thuocsi_delivery_code` hoặc cách tra đơn đã nhận |
| D7 | **Lời báo:** "Phiếu phần còn lại của PO… — đã nhận N/M ở GR…; còn K đơn vị" (sửa I2) |
| D8 | **Chuỗi tách** (V4): D1–D5 áp cho mọi phiếu đã xong của PO |

H3, hướng dẫn dược sĩ:
- Món bán gấp: **quét QR**, không nhập số tay (để D5 biết tem nào đã ra). Bấm HOÀN THÀNH.
- Phần còn lại: bấm "Nhận hàng bằng RFID" trên **phiếu mới**.

Kiểm: fixture từ hai mẫu production + mẫu staging (§7); đột biến cho D1–D5; E2E staging trên phiếu phần còn lại có tem vật lý. Gom vào v0.4.1 cùng các finding audit (một lần cài máy POS).

## 7. Tái hiện trên staging (operator cho phép 07/11)

**Mục đích:** lấy phiếu phần còn lại **lúc vừa sinh, chưa nhận** (POS sinh lô, SL, mã, trạng thái thế nào), trả lời P5 / V3 / I5.

**Cách làm:** phiếu nhận staging cửa hàng 2222, ≥ 3 dòng, có dòng SL ≥ 2:
- dòng A nhận đủ (quét UID);
- dòng B nhận một phần;
- dòng C không nhận;
- bấm HOÀN THÀNH.

**Ghi lại:**
- response `PUT …/status/COMPLETED`;
- GET phiếu mới ngay sau khi sinh;
- GET PO (`goods_receipts`, `items`);
- tìm GR theo SO.

**Cần:**
- Operator đăng nhập POS staging (`sso.stg.buymed.tech`) trên Chrome máy dev. Claude không nhập mật khẩu.
- Một phiếu chờ nhận ở cửa hàng 2222. Từ 30/10 hết PO staging, nên có thể cần SO staging mới (`buymed-stag`, có tem vật lý + đơn `circa-stg`). Nếu phiếu có SO và đơn Nextwaves chưa nhận, **phiếu phần còn lại sinh ra giữ lại làm E2E cho H2** (không nhận tay).
