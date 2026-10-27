# G0 trang staging thật (chỉ đọc) + v0.2.2 — 27/10/2026

**Căn cứ:** `docs/pm/AUDIT-v0.2.1-SOURCE-PACK-20261027.md` (G0 mục 1–4).
- Operator cho dev lấy bằng chứng **chỉ đọc**. Claude in Chrome không kết nối được, nên dev dùng **trình duyệt trong app** (pane Browser của Claude desktop).
- Operator **tự đăng nhập** POS staging (cửa hàng 2222) và Nextwaves staging. Dev không nhập mật khẩu, không đọc token / cookie / header.
- Không bấm nhận hàng, cấp phép điền, PUT hay HOÀN THÀNH.

**Nhánh:** `batch/v0.2-rfid`, commit `a1975f1` (từ `cbac491`).

**Gói:** `dist/circa-gr-nextwaves-v0.2.2.zip`, 19 file.
- SHA-256 `ab96179d6900a5de7beeef9cda627bc2f619f93cb5a80151e7d1bd8cf8f274c4`, **mã gói `AB96179D`**.
- Dựng lại từ checkout sạch `a1975f1` ra cùng SHA.
- Giải nén `C:\circa-gr-nextwaves-v0.2.2` khớp từng file với `src/`; `lib/env.js` = `main/env.js`.

**Chưa cài, chưa nhận / ghi staging.**

## 1. G0 — kết quả từng mục

### G0.1 Response danh sách thật — **khớp parser**

- GET `…/goods-receipt/search?query=pos_id=64a8663b…,,with_items=true,with_details=true,is_count_all_status=true&limit=20&page=1&order_by=created_at=desc`. Trang tự gọi khi mở danh sách và khi đổi tab lọc.
- **Kích thước:** 20 dòng = **76.205 byte**. Tab "Chờ nhận" (8 dòng, query thêm `status=WAITING_TO_RECEIVE`) = 26.810 byte.
- **Dạng:** `{success, data:{goods_receipts[], total:32, page:1, limit:20, status_count}}`.
  - Mỗi dòng có `id, code, status, purchase_order_id, purchase_order_code, pos_info{id,name,…}, items[]…`. Đủ mọi trường hook dùng.
  - `pos_info.id` mọi dòng = cửa hàng 2222.
  - Trang 1: 5 `WAITING_TO_RECEIVE`, 2 `RECEIVING`, 13 `COMPLETED` → 7 nút.
- **Không có tên nhân viên:** `created_by_name` / `updated_by_name` rỗng, `completed_by` là UUID.
- Mẫu lưu `samples/pos-stg-gr-list-page1-20261027.json`: rút gọn đủ trường parser cho 20 dòng, kèm một dòng nguyên vẹn. Body đầy đủ không lưu (76 KB).
- **Đổi tab lọc:** URL thành `?status=WAITING_TO_RECEIVE&page=0` / `?status=all&page=0`. Pathname không đổi nên vẫn là trang `gr_list`. Request vẫn khớp `posGrListCall` (`pos_id=`, không `so_thuocsi=`).
- **Chi phí phân tích của hook trên body thật** (đo trong trang, cùng engine, `JSON.parse` + rút 5 trường, 20 lần): trung vị 0,1 ms, tối đa 0,8 ms (lần đầu).

### G0.2 DOM thật — **khớp giả định của `gr-list.js`**

- Bảng MUI, `<tr>` mỗi phiếu (20 dòng + 1 dòng tiêu đề), 7 cột: Mã phiếu kiểm | Phiếu nhập hàng | Mã phiếu PUT | Trạng thái | Thời gian tạo | Thời gian hoàn thành | Hành động.
- Mã GR là **chữ của ô đầu** (ô lá `TD`). **Ô cuối có `div.flex`** (MuiBox) chứa 2 icon (mở phiếu, tải xuống).
- Dòng mở phiếu bằng bộ nghe React (`cursor-pointer`, không có thuộc tính `onclick`).
- Mẫu: `samples/pos-stg-gr-list-row-GR03887-20261027.html` (không dữ liệu cá nhân).
- **Chạy thử `gr-list.js` của gói `E34FF7C5` (nguyên văn) trên trang thật trong pane.** Chỉ đổi DOM cục bộ, không ghi server; sau đó gỡ.
  - **Đặt nút:** 7/7 nút đúng dòng chờ / đang nhận (GR03887, 3886, 3883, 3879, 3878, 3877, 3842), tất cả trong `div.flex` ô cuối, cạnh icon. Không chồng icon, bảng không tràn ngang.
  - **Bấm (click thật):** bấm nút của ta → bộ điều khiển nhận đúng dòng / `grId` / mã, URL **không đổi** (dòng không mở phiếu).
    - Đối chứng: bấm vào dòng → mở phiếu GR03885. Vậy chặn ở pha capture tại `document` là thứ giữ dòng không mở.
  - **Lệch bố cục — `F1`:** nút cao 28px làm dòng 57 → 61px. Thử 24px: dòng giữ 57px.
- **Clipboard:** app desktop báo trang ghi clipboard một lần trong lúc dev bấm.
  - Dev cài bộ ghi nhận (`clipboard.writeText` / `write` / `execCommand('copy')` / sự kiện `copy`, không đọc clipboard) rồi bấm lại 2 lần (chờ 2,5 s): trang **không** gọi API clipboard nào.
  - Chưa xác định nguồn của lần báo đó. Operator đã được nhắc kiểm clipboard trước khi dán.

### G0.3 Vùng thao tác và khung

- **POS — trang phiếu GR03878 (Đang nhận):**
  - Thanh cố định góc dưới phải `div.fixed.bottom-0.right-0.z-50`, gồm ô nhập ẩn của máy quét (phủ cả thanh) + HỦY + HOÀN THÀNH.
  - Ở 1440×900: thanh 246×75; HỦY 69×43 tại (1210, 841); HOÀN THÀNH 126×43 tại (1298, 841), cách mép 16px.
  - Mẫu: `samples/pos-stg-gr-action-bar-GR03878-20261027.html`.
- **Nextwaves — màn quét:**
  - Đọc trên đơn "Đã xác nhận" PO76149046. Bố cục như mọi đơn; trang POS không hiện SO của GR03879 nên không mở đúng màn của GR03879.
  - Là **modal**: thân cuộn 787 / 896px; **chân modal (Hủy + "Xác nhận nhận hàng") nằm cuối thân cuộn**, không cố định.
  - 1440×900 chưa cuộn: "Xác nhận nhận hàng" ở y = 930, ngoài khung nhìn. Cuộn xuống cuối: tại (1040, 838), trong góc dưới phải, chỗ khung extension đứng.
  - Mẫu: `samples/nw-stg-receive-modal-footer-20261027.html`.
- **Khung v0.1.6 / v0.2 trên trang thật: chưa chụp được.**
  - Pane của app không nạp được extension. Claude in Chrome (nơi operator định cài v0.1.6) không kết nối.
  - **Thay bằng Edge thật** trên trang dựng theo **cấu trúc / kích thước thật** ở trên (§3), ở 1366×768 và 1440×900.
  - Phát hiện **`F2`:** khung chỉ đặt lại khi đổi cỡ cửa sổ và mỗi 1 s, **không theo cuộn**. Sau khi dược sĩ cuộn thân modal Nextwaves, khung **che "Xác nhận nhận hàng" tới 1 s** (đo được ở cả hai cỡ trên v0.2.1). Sau 1 s thì tránh đúng.

### G0.4 Hiệu năng toàn bộ tác vụ

**Trên trang thật** (gr-list nguyên văn, chạy trong trang):

| Đo | Kết quả |
|---|---|
| Phần đồng bộ của `show()`: `querySelectorAll('tr')` + `Array.from` + lát đầu | **1,4 ms** |
| Lát quét tối đa | 1,1 ms |
| Làm ấm tối đa | 1,3 ms |
| Riêng `querySelectorAll('tr')` + `Array.from` (50 lần) | trung vị < 0,1 ms, tối đa 0,2 ms |

**Toàn bộ tác vụ extension bằng trace CDP** (§3; mỗi lời gọi cấp cao nhất vào script extension, gồm việc ngoài lát quét), trên trang dựng từ DOM thật + body cỡ thật 76 KB. Số đo **phụ thuộc mạnh vào tải máy**. Cùng buổi, máy lúc yên và lúc bận (máy dev đang chạy VS Code, Zalo, UltraViewer…) chênh khoảng 5 lần; thước đo chung là tổng thời gian nạp script.

| Đo (trang danh sách) | Máy yên (1 lần, v0.2.1) | Máy bận (v0.2.2 × 6 lần) | Máy bận, đối chứng v0.2.1 × 2 lần cùng lúc |
|---|---|---|---|
| Tổng nạp script lúc mở trang | 4,7 ms | 22–30 ms | 29–30 ms |
| Xử lý tin danh sách của `pos-content.js` (dựng model + vẽ + lát quét đầu, một lần mỗi lượt danh sách) | 1,46 ms | 2,9–3,6 ms | 3,8–4,2 ms |
| `pos-hook.js` nhận response danh sách (parse 76 KB + rút 5 trường) | 0,87 ms | 1,9–2,9 ms | 2,5–2,8 ms |
| Lời gọi `gr-list.js` (làm ấm, lát quét, observer) | ≤ 0,51 ms | ≤ 1,3 ms; một lần 6,7 ms (`runSlice`, không có GC / layout > 0,2 ms bên trong; không lặp lại) | ≤ 1,5 ms |
| Lượt quét trong bão 300 thay đổi DOM | ≤ 0,8 ms | ≤ 0,2 ms | — |

- **Trang bán hàng:** lời gọi ≤ 0,23 ms (máy yên) / ≤ 1,4 ms (máy bận), 0 request, 0 khung.
- **Nạp script** xảy ra một lần mỗi lần mở **mọi** trang POS. Có từ v0.1; `pos-content.js` lớn hơn ở v0.2.
- **Không tác vụ nào ≥ 50 ms** ở mọi lần chạy (dài nhất 15,5 ms: nạp `pos-content.js` của v0.2.1 lúc máy bận).
- **Kết luận đo:**
  - Ở trạng thái thường (bão DOM, lát quét, observer), mỗi lời gọi < 2 ms kể cả lúc máy bận.
  - Hai lời gọi **một lần mỗi lượt tải danh sách** (hook parse response; content xử lý tin danh sách) vượt 2 ms khi máy bận (1,9–3,6 ms), dưới 1,5 ms khi máy yên.
  - Hai lời gọi này không do v0.2.2 thêm: v0.2.1 đo cùng lúc cao tương đương.
  - **Chưa đo trên máy POS Florita** (G3): tốc độ máy quyết định mức này.
- **Hướng giảm nếu PM cần mọi lời gọi < 2 ms kể cả lượt đầu (chưa làm, cần PM chốt):**
  - hook đẩy phần parse sang task riêng (`setTimeout 0`) để không kéo dài task XHR của trang;
  - `grList.show()` vẽ nút ở task riêng thay vì trong lúc xử lý tin.
  - Mỗi lời gọi còn khoảng một nửa; tổng việc không đổi.
- **"Có / không extension":** báo CPU **quy đúng cho script extension** (trace / Profiler lọc `chrome-extension://`), không lấy hiệu hai lần chạy. Chênh lệch giữa hai lần chạy trên máy desktop dao động lớn hơn chính phần extension.
  - Bão 300 thay đổi DOM: extension 0,0–0,2 ms trên tổng trang 1,1–4,2 ms.

## 2. v0.2.2 — sửa từ G0

| | File | Thay đổi |
|---|---|---|
| F1 | `src/pos/gr-list.js` | Nút cao **24px** (bằng icon dòng POS) — dòng không cao thêm |
| F2 | `src/ui/panel.js` | Khung **đặt lại khi cuộn**: nghe `scroll` ở pha capture tại `document` (bắt cả cuộn trong thân modal), passive, tối đa một lần mỗi khung hình (`requestAnimationFrame`). Gỡ cùng lúc với timer 1 s / resize. Không đổi `liftFor` / regex nút cần tránh |
| | `manifest.json`, `package.json` | 0.2.2 |

- `src/` tổng: 3 file, +20 / −3.
- Không đổi `pos-hook.js`, `pos-content.js`, `background.js`, `src/nw/*`, `plan.js`, `apply.js`, `env.js`.

## 3. Kiểm

| Mức | Kết quả |
|---|---|
| `npm test` | **133/133** × 3 |
| Đột biến Node `python -I scripts/mutate-v0.2.2.py` (96 ca như v0.2.1) | **96/96**, 0 ANCHOR, 0 ca hết giờ 240 s, chạy một mình |
| Đột biến DOM trên Edge `node scripts/mutate-edge-v0.2.2.js` | **6/6**: 3 ca chặn sự kiện của v0.2.1 + nút 28px + bỏ nghe cuộn + nghe cuộn ở pha bubble |
| Edge `node scripts/edge-check.js` | **25 mục.** v0.2.2 `src/`: 25/25 × 3. Gói v0.2.2 giải nén: **25/25 × 7** (2 lượt kiểm + 3 lượt ghi trace + 2 lượt so với v0.2.1). Đối chứng gói v0.2.1: **hỏng 3/25**, đúng F1 (dòng 61 vs 57px) và F2 (khung chồng nút ngay sau khi cuộn ở 1366×768 và 1440×900) |
| Quét bí mật / tên nhân viên | sạch |

**`scripts/edge-check.js` mới (chỉ script):**
- Trang phiếu, danh sách và màn quét Nextwaves dựng từ mẫu thật:
  - CSS tối thiểu theo lớp Tailwind / MUI để kích thước khớp số đo thật (dòng 57px, thanh 246×75, nút 69 / 126×43);
  - danh sách 20 dòng thật, body ~76 KB;
  - modal Nextwaves 980px, thân cuộn.
- Khung POS kiểm ở cỡ mặc định, 1366×768, 1440×900 với HỦY **và** HOÀN THÀNH.
- Nextwaves: cuộn thân modal → kiểm sau 120 ms và sau 1,4 s.
- Kiểm dòng không cao thêm ở 1440×900.
- Trace CDP in toàn bộ tác vụ extension (dòng "ĐO") và kiểm không tác vụ ≥ 50 ms.

**Diff `cbac491..a1975f1`:** 12 file, +470 / −95.
- Gồm 4 mẫu G0, edge-check, `mutate-edge-v0.2.2.js` (đổi tên từ v0.2.1, thêm 3 ca), `mutate-v0.2.2.py`.
- DIFF đầy đủ: `dist/circa-gr-nextwaves-v0.2.2-vs-cbac491.diff` + `.stat.txt` (ngoài git).
- Commit `8cae041` (trace CDP) nằm giữa và đã báo ở lượt trước.

## 3b. Sau review tạm của PM (`docs/pm/REVIEW-G0-v0.2.2-PRELIM-20261027.md`)

- **Ngân sách PM giữ nguyên:**
  - mỗi lượt quét danh sách < 2 ms **tính cả bước lấy dòng**;
  - không tác vụ extension nào ≥ 50 ms, kể cả nạp script.

  Không đặt < 2 ms cho mọi callback. Hai lời gọi một lần mỗi lượt danh sách (§1 G0.4) thuộc mục "≥ 50 ms", nên dev **không làm v0.2.3 tách task**.
- **`scripts/edge-check.js` (chỉ script, commit `3218cae`, gói `AB96179D` không đổi):**
  - đo bước lấy dòng (`querySelectorAll('tr')` + `Array.from`, 50 lần) trong chính world của extension;
  - mục "mỗi lượt quét" giờ kiểm **lát dài nhất + lấy dòng dài nhất < 2 ms**: chặn trên cho một lượt tính cả bước lấy dòng.
- **Gói giải nén × 3:**
  - lúc tải danh sách: 1,0–1,2 + 0,1–0,2 = **1,1–1,3 ms**;
  - bão DOM: lát ≤ 0,2 ms + lấy dòng;
  - tác vụ extension dài nhất **5,4–14,2 ms** (nạp `pos-content.js`), < 50 ms;
  - trang bán hàng: lời gọi ≤ 1,0 ms, CPU ≈ 0, 0 request.
  - 25/25 cả ba lượt.
- **G0.3 bằng chứng UI trên Chrome thật với v0.2.2 cài:** làm sau gate cuối của PM, theo điều kiện PM. Xem §4.1.

## 4. Còn lại / đề nghị PM

1. **Bằng chứng UI trên Chrome thật với v0.2.2 cài (PM review tạm: bắt buộc trước nghiệm thu G0.3).** Làm **sau gate cuối** của PM.
   - **Điều kiện PM:**
     - chọn Staging, không cấp phép điền;
     - không bấm "Xác nhận nhận hàng" / HOÀN THÀNH, không PUT POS;
     - được bấm "Nhận hàng bằng RFID" để hiện khung Nextwaves: chỉ tạo phiên trong extension + GET;
     - trước khi thay bản, kiểm không còn phiên `received` / `applying` / `apply_stopped` dở.
   - **Cần ghi** (ảnh hoặc quan sát trực tiếp kèm kích thước / trạng thái):
     - POS GR03878: khung không che HỦY / HOÀN THÀNH;
     - màn quét Nextwaves: sau khi cuộn, khung không che "Xác nhận nhận hàng";
     - danh sách: nút đúng dòng / đúng ô, dòng không cao thêm.
   - **Cách làm:**
     - Claude in Chrome kết nối được: dev quan sát / chụp chỉ đọc.
     - Không kết nối được: operator chụp theo checklist này. Pane của app không nạp được extension.
2. **Ngân sách theo toàn bộ tác vụ:** đề nghị PM chốt định nghĩa (số đo §1 G0.4).
   - "Mỗi lời gọi extension < 2 ms ở trạng thái thường": đạt, kể cả lúc máy bận.
   - "Lời gọi một lần mỗi lượt tải danh sách" (hook parse 76 KB; content xử lý tin danh sách): 1,5 ms lúc máy yên, tới 3,6 ms lúc máy bận. Nếu PM giữ < 2 ms cho cả hai lời gọi này, dev làm hai việc tách task nêu ở G0.4 (v0.2.3).
   - "Nạp script lúc mở trang": một lần, 5–30 ms tuỳ tải máy, < 50 ms.
   - Mức trên máy POS Florita cần đo ở G3.
3. Lượt nhận / ghi staging bằng v0.2.2 vẫn cần operator cho phép riêng đúng GR / PO. Production chỉ đọc; Đợt 2 có gate riêng.
