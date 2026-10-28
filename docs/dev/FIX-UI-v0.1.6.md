# v0.1.6 — khung extension không che nút thao tác của trang (26/10/2026)

**Nhánh:** `batch/v0.1.6-ui`, tách từ `main` `aa42dcc`, tức sau khi merge `batch/v0.1-staging` theo PM audit `docs/pm/AUDIT-T3-W1-FULL-STG-20261026.md`.
**Commit mã:** `b4017d7`. **Gói: v0.1.6 `34B4AE1A`** (sha256 `34b4ae1a1cd38f2c713eeed28aaf874e571a7b9ad6323a7a745e6fea42bf077c`, 18 file), giải nén `C:\circa-gr-nextwaves-v0.1.6`.

## 1. Vấn đề (operator 26/10)

Trên POS `…/danh-sach-phieu-nhan-hang/d0e9cfe4…` (GR03880), khung extension che nút **HOÀN THÀNH**.

**Nguyên nhân:** khung `position: fixed; right: 16px; bottom: 16px`, rộng 460px. Khi thu nhỏ, khung chỉ ẩn phần thân nhưng **vẫn rộng 460px**. Vùng đó trùng vị trí nút thao tác góc dưới phải của POS.

Màn quét Nextwaves cũng có rủi ro tương tự: nút "Xác nhận nhận hàng" ở đáy modal sẽ bị che khi cửa sổ hẹp.

## 2. Sửa (chỉ giao diện; không đổi phiên / kế hoạch / ghi)

| File | Thay đổi |
|---|---|
| `src/ui/panel.js` | `createPanel(brand, { avoidButtons: RegExp })` (chi tiết bên dưới). Hàm thuần `liftFor(box, avoid, vh)` export cho test. Thu nhỏ: dải tiêu đề ≤ 320px, chữ dài cắt "…" (rê chuột xem đủ) |
| `src/pos/pos-content.js` | Tránh `/^(hoàn thành\|hủy\|huỷ\|hủy phiếu\|huỷ phiếu)$/iu` |
| `src/nw/nw-content.js` | Tránh `/^xác nhận nhận hàng$/iu` |
| `src/manifest.json` | 0.1.6 |

Cơ chế `avoidButtons` trong `panel.js`:
- Tìm nút / link của trang có chữ khớp mẫu. Chữ được chuẩn hoá NFC, gộp khoảng trắng, không phân biệt hoa thường.
- Nếu nút nằm dưới khung, khung nâng lên trên nút, hở 12px. Chiều cao tối đa của khung giảm theo để không vượt mép trên.
- Kiểm lại sau mỗi lần vẽ, khi đổi cỡ cửa sổ, và mỗi 1 giây khi khung đang hiện.
- Không có nút nào bị chồng thì khung về vị trí cũ (16px).

## 3. Kiểm

| Mức | Kết quả |
|---|---|
| `npm test` | **106/106**, 10 lần liên tiếp sạch (100 cũ + `tests/panel.test.js` 6: `liftFor` 5 ca + regex hai content script) |
| Edge thật (`node scripts/edge-check.js src`) | **12/12**. Trang POS giả có nút HOÀN THÀNH cố định góc dưới phải (right 24, bottom 12, 180×44), cửa sổ cao 485px: khung mở rộng nâng lên (mép dưới 417 < đỉnh nút 429); thu nhỏ còn 322px, vẫn không chồng; bỏ nút → khung về mép dưới 16px. 9 mục cũ (nạp script, đọc GR / PO / tìm theo SO, phiên, mở tab Nextwaves, không token) vẫn đạt |
| Đối chứng v0.1.5 trên cùng phép kiểm | **Hỏng 2/12**, đúng lỗi operator báo: khung mép dưới 469 > đỉnh nút 429; thu nhỏ vẫn 462px |
| Đột biến (`python -I scripts/mutate-v0.1.6.py`) | **65/65 bị bắt**: 60 ca cũ + 5 ca khung (bỏ nâng khung; nâng khi nút lệch ngang; đẩy khung ra khỏi mép trên; POS không tránh HOÀN THÀNH; Nextwaves không tránh nút nhận). Chạy một mình, 0 ca hết giờ, 0 neo lệch. Phần đo DOM (`place` / `avoidRects`) không có trong Node, được kiểm bằng Edge |
| Gói | `python -I scripts/pack.py` từ commit sạch `b4017d7` → `34B4AE1A`. Bản giải nén khớp `src/` từng file. `edge-check` trên bản giải nén: **12/12** |

**Giới hạn (cần kiểm trên POS thật):**
- Chưa có DOM thật của nút trên POS staging. Cơ chế dựa vào **chữ trên nút** là "HOÀN THÀNH" / "Hủy".
- Nếu POS dùng nút chỉ có icon, hoặc chữ khác, khung sẽ không tự tránh. Khi đó vẫn còn cách thu nhỏ khung (≤ 320px).
- Kiểm ở lượt staging tiếp theo: mở một GR đang "Chờ nhận", kéo xuống chỗ nút HOÀN THÀNH, chụp màn.

## 4. Merge `batch/v0.1-staging` → `main` (theo PM)

- PM cho merge tại `fa66de6`. Trước khi merge, dev đã kiểm:
  - đầu nhánh = `fa66de6`;
  - không có file trùng giữa hai bên kể từ merge-base `bee0713`;
  - quét bí mật / tên nhân viên trên nhánh sạch;
  - `git diff --check` sạch.
- Merge `--no-ff` → **`aa42dcc`**, đã push. Trên `main`: `npm test` 100/100 (3 lần); `PRD.writeEnabled=false`; `src/lib/env.js` = `src/main/env.js`.
- **Dựng gói từ `main` ra đúng `CDD02C3D`** (sha256 `cdd02c3d…`, 18 file), tức `main` chứa đúng runtime v0.1.5 đã phát hành.

## 5. Câu hỏi operator: Nextwaves nhận theo **vỉ**, dòng GR POS theo **hộp** (1 hộp = 10 vỉ)

**Cách extension tính (v0.1.5 / v0.1.6 như nhau, `src/lib/plan.js`):**
- Hệ số **lấy từ chính phiếu GR trên POS**: `items[].retail_units[].convert_rate`, quy về đơn vị gốc, ví dụ viên. Extension không có bảng quy đổi riêng.
- Mỗi UID = 1 đơn vị theo dòng giao Nextwaves (ở đây: 1 vỉ). Đơn vị Nextwaves phải trùng tên một `retail_unit` của sản phẩm trên POS (không phân biệt hoa thường); không trùng thì chặn `unit_unknown`.
- Gom UID **theo lô** (lô lấy từ tra QR trên POS). Với mỗi lô: lượng nhận thêm = tổng đơn vị gốc của các UID ÷ hệ số đơn vị dòng.
  - **Phải ra số nguyên**, nếu không thì chặn `fraction` ("Số lượng quy đổi ra số lẻ theo đơn vị dòng").
  - **Không vượt SL của lô**, nếu vượt thì chặn `over`.
- **Có một chặn bất kỳ thì không ghi gì cả phiếu.** Khung hiện danh sách lý do, dược sĩ xử lý tay.
- Thiếu so với SL đặt (ví dụ mới nhận 1/2 hộp) không chặn. Khung báo "phần còn lại dược sĩ xử lý tay".

**Thực tế đã chạy:** GR03880 có 1110: vỉ = 2 viên, hộp = 6 viên, nên **3 vỉ = 1 hộp**; 5451: túi = 10, hộp = 20, nên **2 túi = 1 hộp**. Lượt 26/10 điền đúng.

**Mô phỏng 1 hộp = 10 vỉ** bằng `buildPlan` thật trên GR03880 (chỉ đổi hệ số 1110: vỉ = 10, hộp = 100; mỗi lô SL 1 hộp):

| Nextwaves nhận | Kết quả |
|---|---|
| 10 vỉ, lô A | Ghi lô A: 0 → 1 hộp (10 UID) |
| 10 vỉ lô A + 10 vỉ lô B | Ghi 2 lô, mỗi lô 1 hộp |
| 15 vỉ, lô A | **Chặn `fraction`** (1,5 hộp), không ghi gì |
| 5 vỉ lô A + 5 vỉ lô B (tổng 1 hộp) | **Chặn `fraction` ở cả hai lô**, vì tính theo từng lô |
| 20 vỉ, lô A (SL lô 1) | **Chặn `over`** (2 > 1) |
| 10 vỉ lô A + 7 vỉ lô B | **Chặn `fraction`** ở lô B, nên **lô A cũng không ghi** |

**Cần PM / stakeholder quyết** (ca vận hành thực tế có hộp lẻ vỉ):
1. Giữ "tất cả hoặc không" (hiện tại, an toàn nhất). Hộp lẻ thì cả phiếu xử lý tay.
2. Cho ghi **từng lô đủ hộp**, để lô lẻ cho dược sĩ. Việc này đổi luật P1.2 / "một chặn → không ghi gì", cần spec mới.
3. Đổi đơn vị dòng PO / GR trên POS sang vỉ cho sản phẩm bán lẻ theo vỉ (phía Buymed / POS), khi đó 1 UID = 1 đơn vị dòng.

Không có cách "làm tròn" an toàn: luật hiện tại buộc `received_quantity` = lượng quy đổi từ đúng các UID trên lô, nên không thể gắn 15 UID với SL 1.

**PM đã chốt (`docs/pm/REVIEW-UI-v0.1.6-PRELIM-20261026.md` §3): phương án 1.**
- Giữ "một chặn thì không PUT cả phiếu". Không làm tròn, không ghép UID khác lô, không điền một phần trong batch UI.
- Lô lẻ: extension báo rõ và không ghi GR. Operator / Buymed / POS sửa đơn vị dòng chứng từ (hoặc chứng từ / lô phù hợp) trước khi HOÀN THÀNH.
- Ghi từng lô đủ hộp là thay đổi hợp đồng W1 / P1.2, cần spec và gate riêng.

v0.1.6 không đổi `plan.js`, nên hành vi đúng như bảng trên.

## 6. Việc tiếp theo

1. **PM:** audit gói v0.1.6 `34B4AE1A` + nhánh `batch/v0.1.6-ui` (`b4017d7`), chạy lại gate source / gói.
2. **Operator, chỉ khi PM cho qua gate source / gói:** lượt **xem UI chỉ đọc** trên staging thật (gate P2 của PM).
   **Không nhận hàng, không cấp phép, không điền, không bấm HOÀN THÀNH.**
   1. Cài bản mới:
      - gỡ v0.1.5, rồi Load unpacked `C:\circa-gr-nextwaves-v0.1.6`;
      - mở popup, chọn **Staging**, Lưu. Nạp từ thư mục mới là một extension mới (ID khác), cấu hình trống; phiên của v0.1.5 không chuyển sang.
   2. Giữ cửa sổ Chrome đúng kích thước thường dùng. Mở trên POS một GR **còn nút HOÀN THÀNH** (trạng thái Chờ nhận / Đang nhận).
      - Extension sẽ tự đọc phiếu và có thể mở tab Nextwaves. Đó chỉ là đọc.
      - Kéo xuống chỗ có nút HOÀN THÀNH / Hủy.
   3. Chụp các ảnh sau:
      - `ui-1-pos-mo-rong.jpg`: khung đang mở rộng, thấy rõ nút HOÀN THÀNH;
      - `ui-2-pos-thu-nho.jpg`: sau khi bấm "–" trên khung;
      - `ui-3-pos-doi-co.jpg`: sau khi thu nhỏ / phóng to cửa sổ Chrome một lần, hoặc cuộn trang lên rồi xuống.
      - Đợi khoảng 1 giây sau mỗi thao tác (khung kiểm lại mỗi giây).
      - Ở cả ba ảnh, nút HOÀN THÀNH phải **nhìn thấy trọn**, không có phần nào nằm dưới khung. **Không bấm.**
   4. Sang tab Nextwaves (màn quét `…/vi/purchases/receive?po=…` nếu extension đã mở; nếu không, mở màn quét của PO còn lại). Kéo tới nút "Xác nhận nhận hàng" rồi chụp:
      - `ui-4-nw-mo-rong.jpg`;
      - `ui-5-nw-thu-nho.jpg`.
      - **Không bấm.**
   5. Nếu nút vẫn bị che, chụp thêm DevTools → Elements, chuột phải vào nút → Inspect. Từ ảnh đó dev sửa đúng selector theo DOM thật (version mới, ZIP / SHA-256 mới, PM audit lại).
