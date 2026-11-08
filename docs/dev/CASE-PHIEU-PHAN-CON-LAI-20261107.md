# Case "phiếu phần còn lại": POS tự tách phiếu khi HOÀN THÀNH một phần (07/11/2026)

**Trạng thái:** định nghĩa + phát hiện vấn đề. **Chưa sửa mã** (operator 07/11: batch này chỉ bàn, định nghĩa, tìm vấn đề). **Đã tái hiện trên staging 07/11 17:52–17:53** (operator cho phép): GR03877 → GR03954, kết quả ở §8. P5 / V3 / I5 đã có câu trả lời.

**Nguồn:**
- operator 07/11: hai Copy response GR84673 và GR84803 (mẫu đã bỏ tên người: `samples/gr-prod-GR84673-tach-20261107.json`, `samples/gr-prod-GR84803-phan-con-lai-20261107.json`);
- trang phiếu mua hàng PO01974970 trên POS, đọc qua Chrome máy dev;
- trang Nextwaves PO-2026-000001, đọc qua Chrome máy dev;
- mã v0.4.0 (nhánh `batch/v0.4-moi-pos` `ec4293c`, `src/` = `8a28fc4`, gói 79D4269C đang chạy trên máy POS Florita);
- mẫu staging T3 25/10 (`samples/nw-stg-receiving-search-q-SOBD1593858-T3-sau-20261025.json`);
- tái hiện staging 07/11 (§8): `samples/gr-stg-GR03877-tach-20261107.json`, `samples/gr-stg-GR03954-phan-con-lai-moi-sinh-20261107.json`, `samples/po-stg-PO00006745-sau-tach-20261107.json`, `samples/activity-stg-GR03877-GR03954-PO00006745-20261107.json`.

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
- **P5.** Dòng Femalto trên GR84803 có chi tiết `quantity` 0, `received_quantity` 1, không mã. Trang PO hiện hai dòng lô "010826" (1 và 0). **Đã rõ (§8, S4 + S10): không phải POS sinh lúc tách.** Phiếu phần còn lại lúc vừa sinh luôn có SL lô = phần còn lại và dùng lại đúng dòng lô của PO (`ref_id` chi tiết). Trên GR84803, 16/17 dòng dùng lại `ref_id` lô của GR84673; riêng Femalto mang một dòng lô PO **mới** (`358e29ce…` ≠ `f52af836…`, cùng `lot_id`). Nghĩa là lô đó được thêm lại bằng tay sau khi tách. Trang POS production không có nhật ký hoạt động, nên không biết chính xác thao tác.

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
| V3 | Nhận một **phần** của một dòng (dòng SL 3, nhận 1) | **Đã thấy (§8 S3):** phiếu cũ giữ SL 4 / nhận 1; phiếu mới có dòng SL 3, cùng lô, cùng `ref_id` dòng + lô PO |
| V4 | Tách nhiều lần (GR → GR′ → GR″) | Mọi phiếu đã xong của PO đều phải tính |
| V5 | Món bán gấp nhận bằng cách **nhập số tay** (không quét QR) | Không biết tem nào đã ra khỏi kho |
| V6 | Extension điền thiếu (dòng Nextwaves không gắn tem), dược sĩ HOÀN THÀNH luôn | Extension tự tạo ra V1 / V3 |

## 5. Vấn đề

| # | Mức | Vấn đề |
|---|---|---|
| I1 | P2 | Phiếu phần còn lại luôn nhận tay (C1–C4). Tần suất: mỗi lần bán gấp lúc hàng vừa về |
| I2 | P3 | Lời báo sai lý do (§3). **Operator 08/11: để sau** (dược sĩ nhìn số lượng POS / Nextwaves / hàng thật, ít đọc lời báo) |
| I3 | P2 | Nextwaves đã nhận trước khi mở phiếu phần còn lại → không tìm lại được đơn theo SO (N2). Chỉ cứu được nếu cùng máy còn phiên phiếu gốc có kết quả nhận (V2) |
| I4 | P3 | Món bán gấp nhập số tay (V5): với lô đó, số tem Nextwaves nhiều hơn phần còn lại, không biết tem nào đã bán → phải chặn sản phẩm đó. **Operator 08/11: xử lý bằng vận hành** — món bán gấp bắt buộc quét QR rồi mới HOÀN THÀNH; extension giữ dừng an toàn, không làm thêm |
| I5 | P3 | P5 (chi tiết SL 0): **không do tách phiếu** (§8). Bất kỳ phiếu nào bị thêm lại lô bằng tay đều có dòng lô SL 0. Tem của lô đó → kế hoạch chặn `over` (`plan.js:187`), dừng an toàn. Không riêng phiếu phần còn lại; xử lý chung ở v0.4.1 hoặc giữ chặn |
| I6 | ngoài phạm vi | Bán gấp **trước** khi Nextwaves nhận tem đó → lệnh trừ tồn của QR Scan Log cho tem đó gặp tem chưa vào kho Nextwaves. **Operator 08/11: chấp nhận** — món chưa nhập kho Nextwaves thì tồn Nextwaves vẫn khớp POS, không cần trừ. Điều kiện còn lại (§11): tem món đã bán **không** được đọc lúc nhận Nextwaves (07/11 Nextwaves nhận 22/22, có cả tem Arrahan) |
| I7 | P3 | POS **không hỏi xác nhận** khi HOÀN THÀNH phiếu chưa nhận đủ (§8 S1): một lần bấm là tách phiếu. Sau khi extension điền thiếu (dòng Nextwaves không gắn tem, V6), lời báo của extension là chỗ duy nhất nhắc dược sĩ. Lời báo v0.4.1 phải nói rõ: "còn K sản phẩm chưa đủ — bấm HOÀN THÀNH bây giờ thì POS tách phần thiếu sang phiếu mới" |

## 6. Hướng xử lý (đề xuất, chưa code)

H2, hỗ trợ phiếu phần còn lại:

| # | Thiết kế |
|---|---|
| D1 | **Nhận diện** phiếu phần còn lại khi đủ cả bốn điều kiện: PO có ≥ 2 phiếu; mọi phiếu khác COMPLETED; phiếu đang mở là phiếu chờ nhận duy nhất; **cộng sổ theo dòng PO** (`item.ref_id`, đơn vị gốc) khớp: Σ đã nhận ở phiếu đã xong + SL phiếu đang mở = SL dòng PO. Thiếu điều kiện nào → giữ khoá như v0.4.0. Staging xác nhận (§8 S3–S4, S7): `item.ref_id` = id dòng PO, không đổi qua các phiếu; PO `items[].received_quantity` đã cộng sẵn qua mọi phiếu. Cộng sổ theo **dòng** (không theo lô), vì dòng lô có thể bị thêm lại bằng tay (P5) |
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

## 7. Tái hiện trên staging (operator cho phép 07/11) — ĐÃ LÀM, kết quả §8

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

## 8. Kết quả tái hiện staging (07/11, 17:52–17:53 giờ VN)

**Phiếu dùng:** GR03877 / PO00006745, cửa hàng 2222. PO nhập tay (`source_type` IMPORT_STOCK), **không SO**, nên extension không dùng được phiếu này cho E2E. Ba dòng, mỗi dòng một lô.
- GR03879 có SO (1593859-F) nên để nguyên. Đơn Nextwaves của SO này đã nhận (§9).
- Claude thao tác trên POS staging qua Chrome máy dev, bằng tài khoản operator đăng nhập.
- Không đụng Nextwaves, không quét QR. Nhận bằng nút +, giống dược sĩ nhập số.

| Dòng | SL | Nhận | Vai trò |
|---|---|---|---|
| 2431732 Soffell (chai) | 2 | 2 | A, nhận đủ |
| 5451 Vinmotop (túi) | 4 | 1 | B, nhận một phần |
| 1110 Pymefucan (vỉ) | 6 | 0 | C, không nhận |

Bấm **HOÀN THÀNH** → GR03877 COMPLETED (PUT03495), POS sinh **GR03954** (`ac0c25c0-926a-473e-9aba-0c4a50deb773`). GR03954 **để nguyên, chưa ai chạm** (giữ làm mẫu sống).

| # | Sự thật |
|---|---|
| S1 | **Không có hộp xác nhận.** Bấm HOÀN THÀNH một lần là phiếu chưa đủ thành COMPLETED, rồi trang **tự tải lại** (`navigation.type = reload`). Nhật ký ghi "Nhận 3/12 sản phẩm" |
| S2 | Phiếu mới sinh **trong cùng request** HOÀN THÀNH (RPC `UpdateStatusGetGoodsReceipt`). `created_at` GR03954 = 10:53:04.059Z, trước `updated_at` GR03877 = 10:53:04.363Z (giống production P2). `created_by` = người bấm. Nhật ký GR03954: `GOODS_RECEIPT_CREATED` "Từ phiếu mua hàng PO00006745", **không nhắc GR03877** (P3) |
| S3 | Phiếu mới chỉ có dòng **chưa nhận đủ**, SL = SL dòng PO − đã nhận: 5451 **3** túi (`base_quantity` 30), 1110 6 vỉ (12). Dòng nhận đủ (2431732) không có. Trạng thái WAITING_TO_RECEIVE, chưa có PUT |
| S4 | Mỗi dòng của phiếu mới có **một lô = đúng lô cũ** (`lot_id`, `lot_date`, `expired_date`), `quantity` = phần còn lại (3, 6), `received_quantity` 0, **không mã**. Id dòng / id lô mới, nhưng `item.ref_id` (dòng PO) và **`ref_id` lô (dòng lô PO) giữ nguyên**. Phiếu vừa sinh **không có lô SL 0** |
| S5 | Phiếu cũ giữ đủ 3 dòng: 2431732 2/2, 5451 SL 4 nhận 1, 1110 SL 6 nhận 0 (P1) |
| S6 | Nhận bằng nhập số → lúc COMPLETED POS **không thêm mã nào** (`thuocsi_qr_codes` / `internal_qr_codes` rỗng mọi lô). Mã POS tự thêm (P4, A1 28/10) chỉ thấy ở lô đã có mã quét |
| S7 | PO: WAIT_FOR_PROCESS → PROCESSING ngay ở lần nhận đầu tiên (không đợi HOÀN THÀNH). `items[].received_quantity` **cộng qua mọi phiếu** (2/2, 1/4, 0/6). `goods_receipts` = GR03877 COMPLETED + GR03954 WAITING_TO_RECEIVE. PO giữ PROCESSING. `list_child_po` / `origin_po_id` rỗng. Mỗi dòng PO một lô; `details[].id` của PO = `ref_id` lô trên phiếu |
| S8 | Mỗi lần bấm +/− = một `PUT …/item/<itemId>/detail/<detailId>` gửi ngay, body `{"detail":{"received_quantity":N,"lot_id":…}}` (cùng API extension ghi). Lần đầu chuyển phiếu sang RECEIVING (`GOODS_RECEIPT_RECEIVING_STARTED`) |
| S9 | **Ca cũ trên staging:** PO00006550 (ADMIN, 08/09/2026): GR03765 COMPLETED khi nhận 4/1100 → GR03766 SL 1096 sinh cùng giây. Hành vi tách đã có từ trước, không phải bản POS mới |
| S10 | Đối chiếu ngược production: GR84803 dùng lại `ref_id` lô của GR84673 ở 16/17 dòng (đúng S4). Riêng Femalto mang dòng lô PO mới SL 0 → **thêm lại lô bằng tay sau khi tách** (P5) |

**Hệ quả cho thiết kế (chưa code):**
- D1 / D2: nhận diện theo `item.ref_id` + `received_quantity` trên PO là đủ dữ liệu, không cần nhật ký hoạt động (production không có).
- D4 / D5: mã của phần đã nhận nằm trên phiếu **cũ** (phiếu mới không mang mã sang), nên phải đọc mọi phiếu COMPLETED của PO. Món bán gấp nhập số tay thì không có mã nào (S6) → đúng I4: không biết tem nào đã ra.
- I5: không riêng phiếu phần còn lại, hạ P3.
- I7: lời báo sau khi điền thiếu (mới).

## 9. E2E v0.4.1 trên staging — cần gì (chưa làm)

Đọc Nextwaves staging 07/11 (chỉ đọc):
- Đơn buymed-stag **chưa nhận** ở kho FLORITA (kho của cửa hàng 2222): **PO-2026-000001** ↔ SOBD1594228-1056895 (1110 ×6, 2431732 ×2; 31/10), **PO69611541** ↔ SOBD1594067-1056814 (1110 ×12, 5451 ×40, 2431732 ×2; 26/10), cùng 3 đơn ngày 12/10.
- POS staging cửa hàng 2222 **chưa có phiếu** cho các SO đó.
- Đơn của GR03879 (SO 1593859, PO60017570) không còn trong "Đã xác nhận", tức không còn chờ nhận → không dùng được (N2).

Muốn chạy E2E H2 thật:
1. Tạo phiếu POS cho một SO ở trên (nút "Nhập SO thuocsi" trên danh sách phiếu nhận; là lượt ghi staging, cần operator cho phép).
2. Có tem vật lý đúng đơn Nextwaves đó.
3. Trên phiếu: nhận 1 món bằng **quét QR** (bán gấp) → HOÀN THÀNH → bấm "Nhận hàng bằng RFID" trên phiếu phần còn lại với bản v0.4.1.

Việc này để sau, khi v0.4.1 đã code.

## 10. Thử nhận thiếu trên Nextwaves staging (08/11, 11:20 giờ VN)

**Operator yêu cầu 08/11:** nhận Nextwaves chỉ 1 EPC → xác nhận nhận hàng, xem Nextwaves có sinh phiếu mới chứa phần chưa nhận không.

**Đã làm:**
- PO69611541 ↔ SOBD1594067-1056814, kho CIRCA FLORITA (staging), phiếu gửi IT-BUYMED-STAG-20261026031756-6410, 5 dòng / 12 tem.
- Trên modal "Nhận hàng bằng cách quét": nhập tay 1 EPC Soffell, chọn **"Giữ đơn mở"** (`keep_open`), bấm "Xác nhận nhận hàng".
- Không kết nối đầu đọc, không đụng POS.

| # | Sự thật |
|---|---|
| N3 | **Nextwaves KHÔNG sinh phiếu gửi mới cho phần thiếu.** Một phiếu gửi chỉ nhận được **một lần**. `POST …/inter-tenant-shipments/<id>/receive-scan {onMissing:"keep_open", epcs:[1]}` → 200, `orderStatus: "open"`, nhận 1 / thiếu 11 (từng dòng có `missingEpcs` / `missingUnitUids`). Sau đó `receiving` có `shipments: []`, PO `PARTIALLY_RECEIVED`. Màn quét báo "Đơn này chưa có phiếu gửi nào cần nhận". Trang PO ghi "Chờ phần còn lại · Đã giữ đơn mở", "Sẽ còn phiếu gửi tiếp theo"; 11 tem thiếu hiện là **"Thất lạc"**. Nút "Nhận hàng bằng cách quét" của phiếu gửi biến mất |
| N4 | Phần thiếu chỉ nhận được nếu **bên bán (Buymed) đẩy phiếu gửi mới**. Trang PO ghi: trước khi nhận phiếu cuối "không thể nhận, đóng hoặc hủy đơn thủ công" |
| N5 | Tìm theo SO (`inter-tenant-orders/receiving?q=SOBD1594067`, đúng API extension dùng) **vẫn trả đơn**: `purchaseOrderStatus PARTIALLY_RECEIVED`, `openShipmentCount 0`. So với nhận đủ: `total 0` (T3 25/10) |
| N6 | Hai lựa chọn khi thiếu: `keep_open` ("Giữ đơn mở": phần thiếu chờ phiếu gửi sau, không báo ai) / `close_short` ("Đóng đơn dù còn thiếu": đóng đơn, **nhà cung cấp được báo phần thiếu**) — chữ của Nextwaves; `close_short` chưa thử |
| N7 | `unitUid` Nextwaves cùng dạng mã QR Circa: 13 chữ số + chữ + số (vd `1792984580371AA1`). Mã POS tự sinh (`1793929119118C11`) cũng dạng đó → **không phân biệt được bằng dạng mã** (§11, P4) |

PO69611541 giờ đã nhận một phần, không còn dùng được cho E2E. Đơn staging chờ nhận còn lại cho E2E: PO-2026-000001 ↔ SOBD1594228 (+3 đơn 12/10).

Mẫu (đã kiểm SHA-256 với trang, đã bỏ tên người): `samples/nw-stg-receiving-PO69611541-truoc-nhan-thieu-20261108.json`, `samples/nw-stg-receive-scan-keep-open-1of12-PO69611541-20261108.json`, `samples/nw-stg-receiving-PO69611541-sau-nhan-thieu-20261108.json`, `samples/nw-stg-receiving-search-q-SOBD1594067-sau-nhan-thieu-20261108.json`.

**Hệ quả:**
- Câu hỏi của operator "Nextwaves có sinh phiếu mới cho phần chưa nhận không?" → **Không**. Hướng 1 của operator là hướng duy nhất giữ được Nextwaves đủ hàng: POS tách phiếu, Nextwaves nhận **một lần** cho phần còn lại (vd 21/22) khi dược sĩ nhận phiếu mới.
- **Luật vận hành mới (cần dặn dược sĩ):** món bán gấp chỉ quét QR trên phiếu POS. **Tuyệt đối không mở Nextwaves nhận riêng món đó.** Nhận thiếu một lần là phiếu gửi đóng, các món còn lại không nhận vào Nextwaves được nữa, tồn Nextwaves thiếu cả lô.
- Extension (v0.4.1): lượt nhận Nextwaves cho phiếu phần còn lại được coi là **đủ** khi các tem thiếu đều là tem đã nằm trên phiếu POS đã xong của PO (món bán gấp đã quét QR). Đơn Nextwaves `PARTIALLY_RECEIVED` / `openShipmentCount 0` → báo rõ "Nextwaves đã nhận phiếu gửi này — không nhận tiếp được", nhận tay.

## 11. Phản hồi operator 08/11 và phân tích

| Mục | Phản hồi | Kết luận |
|---|---|---|
| P4 (mã POS tự sinh) | Mẫu GR84803 / Alpha choay: `thuocsi_qr_codes` = `1789404808860C1270` (mã QR thuocsi, duy nhất) + `1793929119118C11` (POS sinh). Hai mã nằm **cùng mảng** | **Không ảnh hưởng extension**, với điều kiện: chỉ so **giao** giữa UID của đơn Nextwaves và mã trên phiếu (không coi "mã lạ" là đơn vị), đếm đã nhận bằng `received_quantity` (không đếm mã). Không tách được bằng dạng mã (N7). Phiếu phần còn lại không mang mã sang (S4), mã POS chỉ thêm lúc COMPLETED → không đụng lượt điền |
| P5 | Dược sĩ không quét QR, nhập tay đủ số lượng | Khớp §8 S10. I5 giữ P3, dừng an toàn |
| I2 | Để sau | — |
| I4 | Operator đảm bảo món bán gấp phải quét QR rồi mới HOÀN THÀNH | Extension không làm thêm |
| I6 | Chấp nhận: món chưa nhập kho Nextwaves thì không cần trừ | Đúng khi tem món đã bán **không** bị đọc lúc nhận Nextwaves. Ca 07/11 Nextwaves nhận 22/22, kể cả tem Arrahan (món còn ở quầy lúc nhận) → Nextwaves có thể dư 1 nếu đơn bán đã trừ trước đó. v0.4.1 biết UID món bán gấp (phiếu đã xong) → **cảnh báo** khi biên nhận Nextwaves có tem đó |
| Hướng 1 | POS tách phiếu → phiếu mới tham chiếu PO POS → SO → Nextwaves; nhận 21/22, "Xác nhận nhận hàng" như thường | **Chốt** (agent.md §3, 08/11). Còn hỏi operator: khi thiếu đúng món bán gấp thì chọn `keep_open` hay `close_short` (N6) |
| Đầu đọc bị QR Scan Log giữ | Làm trong batch này: nút để dược sĩ biết + bấm lấy đầu đọc cho màn quét Nextwaves | Phân tích phương án ở plan v0.4.1 |
