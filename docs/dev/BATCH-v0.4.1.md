# v0.4.1 — phiếu phần còn lại, lấy đầu đọc từ QR Scan Log, finding audit v0.4.0 (08/11/2026)

**Căn cứ:**
- plan đã duyệt `docs/dev/PLAN-v0.4.1.md` (operator 08/11, `state.md` lần 73);
- case `docs/dev/CASE-PHIEU-PHAN-CON-LAI-20261107.md` (§8 staging S1–S10, §10 Nextwaves N3–N7, §11 phản hồi operator, P4 đã sửa);
- audit `docs/dev/AUDIT-v0.4.0-20261107.md` (F1–F3 P2, P3 4, 6–12);
- yêu cầu gửi đội QR Scan Log `docs/dev/REQUEST-QSL-v0.4.1-DAU-DOC.md` (hợp đồng tạm mà v0.4.1 dựa vào).

Hướng dẫn vận hành: `docs/dev/RUNBOOK-v0.4.1.md` (thay `RUNBOOK-v0.4.0.md`). QA máy dev: `docs/dev/QA-v0.4.1-MAY-DEV.md`.

**Chưa cài máy nào, chưa ghi thật bằng v0.4.1.** Cài máy dev → QA → cài máy POS, mỗi bước chỉ khi operator cho phép bằng chữ.

## 1. Gói

| Mục | Giá trị |
|---|---|
| Nhánh | `batch/v0.4.1`, tách từ `batch/v0.4-moi-pos` `ec4293c` (= v0.4.0 `79D4269C`). src đổi lần cuối ở `41718e6` |
| ZIP | `circa-gr-nextwaves-v0.4.1.zip`, 19 file |
| SHA-256 | `bf5a9ad9fd08848b16893d060b6842d265cc9421f772735e4ff539c1eefb1cae` (mã gói **BF5A9AD9**). Đóng lại từ `git archive` ra cùng mã; giải nén `diff -r` với `src/` không khác |
| Thư mục giao | `C:\circa-gr-nextwaves-release\v0.4.1\`: ZIP + `kiem-truoc.js` / `kiem-sau.js` / `kiem-khung-gr.js` + `HUONG-DAN-v0.4.1.md` (= runbook) + `THAY-DOI-v0.4.1.md` (thay đổi bằng lời thường cho operator) + `QA-v0.4.1-MAY-DEV.md` + `SHA256SUMS.txt` |
| Cài | Chép đè đúng thư mục đang nạp (máy POS Florita `C:\circa-gr-nextwaves`, máy dev `C:\circa-gr-nextwaves-v0.2.3`), Reload, giữ Extension ID. Không đổi popup |
| Nâng từ v0.4.0 | `SESSION_SCHEMA` vẫn 2: phiên v0.4.0 dùng tiếp. Phiếu phần còn lại đã bấm bằng v0.4.0 (khoá `so_many_gr` / "số lượng không khớp"): popup → Xoá phiên → bấm lại "Nhận hàng bằng RFID" |

## 2. Thay đổi so với v0.4.0

### 2.1 Phiếu phần còn lại (bán gấp → POS tách phiếu)

Dược sĩ nhận vài món để bán gấp rồi bấm HOÀN THÀNH → POS sinh phiếu mới cùng PO cho phần chưa nhận (`state.md` lần 70–72). v0.4.0 dừng an toàn ở 4 chỗ; v0.4.1 làm tiếp khi **chứng minh được** đây là phiếu phần còn lại.

- **Nhận ra (`lib/pos-model.js` `remainderOf`)** — cộng sổ theo **dòng PO**, đơn vị gốc. Đạt khi đủ mọi điều kiện:
  - PO có ≥ 2 phiếu chưa huỷ, mọi phiếu khác đã COMPLETED; từng phiếu đã xong được **GET theo id** (không dựa vào dòng tìm theo SO);
  - phiếu đang mở còn nguyên như lúc POS sinh: chưa nhận, không mã;
  - mỗi dòng phiếu mở ánh xạ được về dòng PO (`ref_id`); SL dòng mở + đã nhận ở các phiếu đã xong = SL dòng PO; dòng PO không có trên phiếu mở thì đã nhận đủ;
  - đối chiếu chéo với `received_quantity` của PO; không thiếu `unitRate`, không lệch tỉ lệ đơn vị giữa các phiếu.
  - Thiếu / lệch bất kỳ điều kiện nào → như v0.4.0 (khoá `so_many_gr`), khung POS nêu lý do ngắn.
- **Đạt thì:**
  - không khoá `so_many_gr` (chỉ khi các phiếu cùng PO trong kết quả tìm theo SO đúng là các phiếu đã cộng sổ);
  - vân tay **cấp PO** để khớp đơn Nextwaves (cả đơn ứng với cả PO);
  - `excludeUids` = mọi mã trên các phiếu đã xong. POS gắn **UID Nextwaves (tem con)** vào đơn vị đã quét lúc HOÀN THÀNH (P4 đã sửa) → phần giao với UID của đơn Nextwaves = các tem món đã bán gấp.
- **Tab Nextwaves:**
  - "Phiếu phần còn lại — đã nhận trước ở GR…", "N UID cần quét (đơn M, trừ K món đã bán gấp)", "Màn quét sẽ báo thiếu K tem món đã bán gấp: để **Giữ đơn mở** rồi bấm Xác nhận nhận hàng";
  - đang chọn "Đóng đơn dù còn thiếu" → khung **đỏ** cảnh báo trước khi xác nhận (operator 08/11; đỏ theo review P3-14);
  - **quy tắc đủ:** thiếu **đúng** các tem món đã bán (cả danh sách thiếu Nextwaves tự báo trong response `receive-scan`) → coi là đủ, về POS. Thiếu tem khác → dừng như v0.4.0;
  - Nextwaves đã nhận một phần đơn trước đó (phiếu gửi đã dùng: `PARTIALLY_RECEIVED`, `openShipmentCount` 0) → `nw_partial_received`: "nhận tay phần còn lại" (trước báo nhầm "số lượng không khớp"). `openShipmentCount` vắng không coi là 0.
- **Tab POS:** điền bỏ tem món đã bán (`unitsForPlan` ở kế hoạch, khớp cuối, khung "đã điền"). Nextwaves vẫn nhận cả tem món đã bán (hàng còn trên đầu đọc) → vẫn điền, khung vàng "tồn Nextwaves dư K, báo vận hành" (I6). Lượt nhận chọn "Đóng đơn" → khung POS nhắc báo vận hành. Phiếu điền xong còn thiếu → câu "Bấm HOÀN THÀNH bây giờ thì POS tách phần chưa đủ sang một phiếu mới" (I7).
- **Vận hành bắt buộc (operator 08/11, I4):** món bán gấp phải **quét QR** trên phiếu POS trước HOÀN THÀNH. Nhập số tay → không có UID → extension không biết tem nào đã bán: kiểm trước (2.3) báo "sẽ KHÔNG điền được" → nhận tay.

### 2.2 Đầu đọc bị QR Scan Log giữ (operator 08/11: "Bấm hộ Ngắt + hợp đồng sau")

- **Nhận ra modal "Nhận hàng bằng cách quét"** bằng dấu hiệu cấu trúc (`#scan-receive-qr` trong `[role=dialog]` + "Quét tem của phiếu gửi IT-…"), trên mọi trang Nextwaves của tenant đang chọn, **kể cả mở thẳng từ trang PO, không có phiên**. Tự bấm "Kết nối đầu đọc" tối đa 3 lần như v0.4.0, nay cả khi không phiên.
- Lần tự bấm đầu không kết nối được → hỏi các tab POS (chỉ đọc khung QR Scan Log, song song, tối đa mỗi 5 s). **Đúng một** tab đang giữ (khung đang hiện; hoặc khung ẩn vì tab đã rời trang Bán hàng mà Web Lock vẫn bị giữ), không đang gửi tem vào giỏ, nút Ngắt bấm được → khung "… (QR Scan Log) đang giữ" + nút **"Lấy đầu đọc cho Nextwaves"** (sau ~2 s, không đợi hết 3 lần tự bấm).
- **Chỉ khi dược sĩ bấm:** background đọc lại trạng thái → nhờ đúng tab đó bấm "Ngắt kết nối" của QR Scan Log (tab POS tự kiểm lần cuối: còn giữ, không đang gửi tem; khung ẩn thì lock phải còn giữ) → chờ Web Lock `circa-qr-scan-log:rfid-reader` nhả (≤ 5 s) → tab Nextwaves bấm "Kết nối đầu đọc" ngay. Đã bấm mà lock chưa nhả kịp → vẫn tính là đã lấy, thử kết nối thêm vài lần.
- Không bấm khi: QR Scan Log đang gửi tem vào giỏ (Ngắt của bản 0.9.6 huỷ lượt đang gửi), 0 hoặc ≥ 2 tab giữ, nút Ngắt đang tắt / không thấy → nút **"Mở tab bán hàng"** + hướng dẫn Ngắt tay (không có tab nào → khung nói rõ).
- Sau lượt (đóng modal / nhận xong): nhắc "sang tab bán hàng bấm **Kết nối RFID** (chọn cổng)" — trên khung Nextwaves (không phiên) hoặc khung POS (có phiên).
- Hợp đồng `circa-reader/v1` (mượn / trả không bấm hộ) để sau: `REQUEST-QSL-v0.4.1-DAU-DOC.md` đã gửi operator chuyển đội QR Scan Log. QR Scan Log trả `pong` (bản tương lai) → dùng đường mượn / trả sẵn có, không bấm hộ.

### 2.3 Finding audit v0.4.0

| # | Sửa |
|---|---|
| F1 (P2) SO tách giao chọn nhầm đơn | Modal đang mở phiếu gửi không thuộc đơn của phiên → khung **đỏ** "Đang mở nhầm phiếu gửi IT-…" trước khi xác nhận |
| F2 (P2) điểm chặn kế hoạch chỉ biết sau khi nhận | Phiên mang tóm tắt phiếu; khi `nw_ready` khung Nextwaves "Kiểm trước khi nhận: số lượng khớp phiếu — điền được N UID" hoặc lý do (sản phẩm không có trên phiếu, đơn vị lạ, số lẻ, vượt, phiếu đã nhận tay). Lỗi tra QR vẫn chỉ biết sau khi nhận |
| F3 (P2) cửa hàng ↔ kho | Bảng cửa hàng đã biết (`env.js`, lib = main): Florita ↔ `eb5e2b4f…`, Lumina ↔ `3f7bd541…`, STG 2222 ↔ `82bf85e4…`. Kho đơn đã khớp lệch → khoá `warehouse_mismatch` (không điền). Cửa hàng lạ → chỉ nhắc kiểm kho |
| P3-4 | Khớp cuối chạy trước khi kết thúc lượt ghi, lưu vào phiên → F5 vẫn khung vàng "Lệch: …" |
| P3-6 | `routeScan` không để hai phiên chung một tab; nhận xong / huỷ / phiếu xong đóng cả tab cũ của phiên (chỉ khi trang còn đúng đơn và không phiếu nào khác của đơn đó đang ở bước Nextwaves) |
| P3-7 | Không tái dùng tab Nextwaves đang có lượt nhận (2xx chưa đọc xong, modal quét đang mở, tab không trả lời) → mở tab mới |
| P3-8 | Khung "chưa có đơn" luôn giữ được khi lưu phiên lỗi |
| P3-9 | Khung nổi cao tối đa 45vh (trước 70vh) |
| P3-10 | Chỉ quét nút đầu đọc khi có màn quét của phiên hoặc modal |
| P3-11 | Tab Nextwaves chỉ đánh giá lại khi phiên của chính trang đổi |
| P3-12 | Xoá `autoPlanCheck` (mã chết) |
| Để sau | P3-5 (thu hẹp host — sẽ chặn tenant khác), P3-13 (gom hằng số) |

### 2.4 Sửa theo review độc lập (08/11)

Review chỉ đọc (sub-agent): **0 P1, 3 P2, 14 P3**. Mọi đường ghi vẫn dừng an toàn.

| # | Vấn đề | Sửa (mỗi điểm một test) |
|---|---|---|
| P2-1 | QR Scan Log 0.9.6 vẫn giữ cổng khi tab rời trang Bán hàng bằng điều hướng trong trang (khung ẩn, thuộc tính đứng ở trạng thái cuối — đã đọc mã QR Scan Log, chỉ đọc). Dùng một tab POS cho cả bán lẫn nhận → extension không thấy tab giữ, "Mở tab bán hàng" im lặng | Khung ẩn ở trạng thái giữ **và** Web Lock của QR Scan Log đang bị giữ (đọc ở chính tab đó) → coi là tab giữ (đúng một tab); bấm hộ Ngắt tab đó (tab POS kiểm lại lock lần cuối). "Mở tab bán hàng" không có tab → báo rõ |
| P2-2 | Modal mở khi phiên đang ở khung lỗi tìm đơn / chưa có đơn / chờ dữ liệu → khung đầu đọc thay mất khung lỗi ngay trước khi dược sĩ xác nhận | Khung của phiên giữ nguyên, chỉ thêm dòng + nút đầu đọc |
| P2-3 | Đường "đủ" của quy tắc phiếu phần còn lại chưa kiểm trên dữ liệu thật sau khi nhận thiếu | Chụp chỉ đọc staging PO69611541 sau lượt nhận thiếu: `GET purchase-orders/<id>` + `GET inter-tenant-shipments/<id>` (đúng hai API `collect()` đọc). Phiếu gửi vẫn đọc được; `receivedEpcs` là mảng; 11 tem thất lạc không lọt vào phần đã nhận → `buildReceivedUnits`: 1 nhận, 11 thiếu, 0 lỗi bằng chứng |
| P3-5 | Đã bấm Ngắt mà QR Scan Log chưa kịp nhả lock bị coi là hỏng (không nhắc Kết nối RFID, lần bấm sau báo "không thấy tab giữ") | Coi là đã lấy: thử kết nối nhanh vài lần, ghi `readerTakenAt`, nhắc sau lượt |
| P3-6 | Background bỏ remainder sai dạng trong khi trang đã bỏ khoá so_many_gr | Khoá lại so_many_gr, ghi nhật ký |
| P3-7 | Phiên v0.4.0 kẹt trên phiếu phần còn lại; đọc phiếu đã xong lỗi tạm → tạo phiên khoá "nhận tay" | Nâng bản xoá phiên bản trước còn chờ Nextwaves, chưa khớp đơn, đang khoá so_many_gr; đọc lỗi → báo bấm lại, không tạo phiên |
| P3-8 | Lựa chọn khi thiếu + UID Nextwaves báo thiếu chỉ nằm trong tab (mất khi F5 / lượt giao từ tab khác) | Lưu cùng lượt 2xx trong phiên |
| P3-9 | Chữ `nw_partial_received` khẳng định quá (có thể chỉ là hàng không tem / lần giao khác chưa lên); POS không có "Tìm lại" | Chữ trung tính + "Tìm lại trên Nextwaves" |
| P3-10 | Nút "Lấy đầu đọc" hiện cả khi nút Ngắt của QR Scan Log đang tắt | Không hiện; hướng dẫn Ngắt tay |
| P3-11 | Hỏi trạng thái các tab POS nối tiếp (đẩy cú bấm Kết nối ra ngoài hiệu lực cú bấm của dược sĩ) | Hỏi song song |
| P3-12 | Nút "Lấy đầu đọc" chỉ hiện sau ~30 s (hết 3 lần tự bấm) | Hỏi QR Scan Log ngay sau lần tự bấm đầu không được → nút hiện sau ~2 s |
| P3-13 | Cảnh báo khớp cuối không tự mất | Ghi rõ: giữ tới khi HOÀN THÀNH |
| P3-14 | Kho lệch (không đảo ngược được) và "Đóng đơn dù còn thiếu" chỉ vàng | Đỏ, kho lệch lên dòng đầu |
| P3-15 | Màn quét không phiên ẩn khung đầu đọc khi trang đánh giá lại; lời nhắc Kết nối RFID mất khi trang khác đánh giá lại | Giữ khung đầu đọc / lời nhắc |
| P3-17 | Chú thích đầu `nw-content.js` cũ | Sửa |
| Giữ | P3-4 (khe hở ~150 ms trước khi QR Scan Log báo "đang gửi") — chỉ đội QR Scan Log sửa được (REQUEST §2); P3-16 chữ I6 theo quyết định operator 08/11 | — |

### 2.5 Khác

- `kiem-truoc.js`: thêm `phanConLai` (`phieuXong`, `maDaXong` hoặc "không: <lý do>"), `temBanGap`, `layDauDoc`.
- `kiem-sau.js`: thêm `khopCuoi` ("ok" hoặc tên chỗ lệch), `phanConLai`, `thieu`, `khiThieu` (keep_open / close_short), `banGapVanNhan`, `layDauDoc`.

## 3. Kiểm (Claude tự gate, không ghi thật)

| Gate | Kết quả |
|---|---|
| `npm test` | 264/264 |
| Đột biến `python -I scripts/mutate-v0.4.1.py` | **282/282** — lượt đủ 281 ca: 280 bắt, 1 sống (`review P3-15 màn quét không phiên ẩn khung đầu đọc`: test chỉ nhìn khung cuối, mà lượt hỏi QR Scan Log kế tiếp vẽ lại ngay) → trình duyệt giả đếm lần khung bị ẩn, test khẳng định không ẩn; thêm 1 ca + 1 test lời nhắc “Kết nối RFID” trên trang PO khi trang đánh giá lại; chạy lại `CGN_MUT_FILTER=P3-15` 2/2 bắt (`bcb169d`, src không đổi) |
| Edge thật `node scripts/edge-v041.js <bản giải nén>` | 55/55 trên `src/` và 55/55 trên bản giải nén ZIP (Edg/157.0.4341.42); tác vụ extension dài nhất 18.19 ms (src) / 18.59 ms (ZIP, `nw-content.js` readerTick ở mục đầu đọc), ngưỡng 50 ms; không còn tiến trình Edge sót |
| Review độc lập (sub-agent, chỉ đọc) | 0 P1 / 3 P2 / 14 P3 — sửa 3 P2 + 12 P3 (mỗi điểm một test; P3-17 chỉ là chú thích), giữ P3-4 / P3-16 (§2.4) |
| Quét bí mật + tên nhân viên | 0 — token / khoá Nextwaves / tên nhân viên: `git grep --cached` trên nhánh `batch/v0.4.1` và trên các file main của lần này |

## 4. Đã kiểm trên dữ liệu thật (chỉ đọc)

- `remainderOf` trên staging (GR03954 + GR03877 + PO00006745) và production dựng lại lúc vừa tách (GR84803 + GR84673 + PO01974970): đạt; vân tay cấp PO khớp đơn Nextwaves (staging PO69611541 trước khi nhận; production 18 dòng); `excludeUids` ∩ UID đơn PO-2026-000001 = `1793929018293B31` (tem Arrahan đã bán gấp).
- Kiểm trước (F2) bắt đúng ca staging món bán gấp nhập số tay (vượt + sản phẩm không có trên phiếu).
- Nextwaves staging sau lượt nhận thiếu 1/12 (keep_open, 08/11): tìm theo SO vẫn trả đơn, `PARTIALLY_RECEIVED`, `openShipmentCount` 0 → `nw_partial_received`.
- Cùng đơn đó, đúng hai API `collect()` đọc (chụp chỉ đọc 08/11 chiều, mẫu `samples/nw-stg-po-…` + `nw-stg-shipment-PO69611541-sau-nhan-thieu-20261108.json`, SHA-256 kiểm trong trang): phiếu gửi đã dùng vẫn đọc được (`status` "received"), `receivedEpcs` là mảng ở mọi dòng, `receivedUnits` chỉ có tem đã nhận thật — 11 tem "Thất lạc" không lọt vào → `buildReceivedUnits`: 1 nhận, 11 thiếu, 0 lỗi bằng chứng.
- QR Scan Log 0.9.6 (đọc mã, không sửa): rời trang Bán hàng bằng điều hướng trong trang thì khung ẩn nhưng vẫn giữ cổng tới khi tab đóng / tải lại (`rfid-content.js` nhánh `!view.visible`, `pagehide`).

## 5. Rủi ro còn lại

1. **Chưa chạy lượt thật phiếu phần còn lại.** Staging cần phiếu POS cho một SO còn đơn Nextwaves chờ nhận + tem staging tra được UID; không đủ → lượt thật đầu tiên ở production có `kiem-truoc.js` / `kiem-sau.js`.
2. **Bấm hộ Ngắt dựa vào giao diện QR Scan Log 0.9.6** (host / nút / lock — hợp đồng tạm trong REQUEST-QSL). QR Scan Log đổi giao diện → extension không thấy tab giữ → lùi về "Mở tab bán hàng" (làm tay như v0.4.0). Sau khi Ngắt, "Kết nối RFID" của QR Scan Log luôn hỏi chọn cổng.
3. **I2 (để sau):** món bán gấp không quét QR → nhận tay phần còn lại.
4. Lần đầu tab Nextwaves kết nối, Chrome có thể hỏi chọn cổng (cổng chưa cấp quyền cho trang Nextwaves).
