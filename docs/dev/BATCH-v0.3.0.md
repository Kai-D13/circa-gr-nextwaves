# v0.3.0 — tự điền + tự HOÀN THÀNH một lần: báo cáo G1 (29/10/2026)

**Căn cứ:**
- spec `docs/pm/DECISION-ONE-STG-AUTO-FLOW-20261028.md` §2–§3 (G1);
- finding P2.5 `docs/pm/AUDIT-G0-v0.2.5-G1-PRELIM-20261029.md`;
- đề xuất `docs/dev/DE-XUAT-v0.3.0-TU-DONG-20261028.md`;
- audit độc lập `docs/dev/AUDIT-v0.3.0.md`.

Từ 29/10 Claude kiêm PM / QC / audit (`agent.md` §2). Báo cáo này là gate G1 do Claude tự kiểm, kèm một audit độc lập bằng sub-agent.

**G1 = không ghi thật:** fixture A1, server giả, Node, Edge trên gói giải nén. Chưa cài cho operator, chưa dùng đơn staging. Lượt thật: runbook `docs/dev/RUNBOOK-G2-G3-v0.3.0.md`.

## 1. Gói

| Mục | Giá trị |
|---|---|
| Nhánh / SHA | `batch/v0.2-rfid` **`0ebfa81`** (src = `4b79c58`; gói đóng từ `b37c509`, sau đó chỉ thêm test) |
| ZIP | `circa-gr-nextwaves-v0.3.0.zip`, 19 file |
| SHA-256 | `45E07F60D9E86896CBC0BD0313C4E06625FDFFC200B63C1DED98582C9C6688FC` |
| Source = ZIP | giải nén `C:\circa-gr-nextwaves-v0.3.0-45E07F60`, `diff -r` với `src/` không khác |
| DIFF so v0.2.5 (`02f2575`) | `circa-gr-nextwaves-v0.3.0-vs-02f2575.diff` (`3DC54F49…`), `.stat.txt` (`AE001337…`), tới `0ebfa81`, phạm vi `package.json scripts src tests`: src 10 file, +734 / −26; tổng 17 file +2475 / −31 |
| Script nâng | `scripts/nang-cap-v0.3.0.ps1`: v0.2.4 `0BB73E2D` (bản đang cài máy staging) → v0.3.0, cùng thư mục `C:\circa-gr-nextwaves-v0.2.3`, giữ Extension ID / phiên (`SESSION_SCHEMA` không đổi). `-Check` (chỉ đọc) trên thư mục đang tải thật 29/10: **KIỂM ĐẠT**, đúng v0.2.4 `0BB73E2D` từng byte, 19 file |
| Thư mục giao | `C:\circa-gr-nextwaves-release\`: `v0.3.0\` (ZIP + DIFF + stat), `nang-cap-v0.3.0.ps1`, `kiem-khung-gr.js`; `SHA256SUMS.txt` thêm 5 dòng, `sha256sum -c` đạt mọi dòng. **Chưa cài** |

## 2. Hành vi (tóm; chi tiết ở đề xuất + audit)

**1. Quyền tự động một lần** (`autoGrants`, tách khỏi cấp phép thủ công):
- **Ai / khi nào tạo:** chỉ popup thật, chỉ STG, phiên `nw_ready`, **chưa** có lượt nhận 2xx, PO **chưa** có biên nhận.
- **Popup:** khung xác nhận ghi rõ môi trường / cửa hàng / GR / SO / PO / số tem / "POS sẽ TỰ HOÀN THÀNH".
- **Gắn với:** giờ tạo phiên, GR, cửa hàng, SO, PO, kho, tập EPC. Hết hạn sau 30 phút.

**2. Điểm kích hoạt duy nhất:** `received()`, khi phiên chuyển `nw_ready` → `received` của chính lượt 2xx. Phải đủ cả:
- quyền khớp, có trước lượt nhận;
- tập EPC = quyền;
- PO có đúng 1 biên nhận.

Khi đạt, lượt chạy được giao cho **một** tab POS.

**3. Tự điền:**
- `autoPlanCheck`: phiếu sạch + nhận đủ, 0 chặn / 0 cảnh báo;
- đọc lại PO / SO / cửa hàng;
- khung gắn đúng trang;
- claim tự động **tiêu quyền một lần**, `runPlan` như W1.

**4. Tự HOÀN THÀNH:**
1. Không tải lại trang.
2. `verifyFinal`: GET toàn phiếu khớp hoàn toàn.
3. `claimComplete`: đặt `auto_completing` **trước** khi gửi.
4. `PUT …/status/COMPLETED` **một lần**, không body.
5. GET lại: thấy COMPLETED → `done`; còn lại → `auto_complete_unknown`, không gửi lại.

**5. Không bao giờ tự chạy lại:**
- **Bỏ qua:** `auto:skip` + thu hồi quyền khi kế hoạch / phiếu / trang / quyền / tab không đạt.
- **Không tiếp tục sau sự cố:** tải lại / tab chết sau claim → không tiếp; hook / huỷ không đóng phiên đang gửi.
- **Giao diện:** khung POS, popup, Nextwaves báo đúng trạng thái. Đang gửi → "KHÔNG bấm HOÀN THÀNH". Đã dừng → "Tự động đã dừng — xử lý theo luồng thủ công".

**Chế độ thủ công không đổi** khi không bật tự động. Gồm luôn P2 / P3 của v0.2.5.

## 3. Kiểm

| Hạng mục | Kết quả |
|---|---|
| `npm test` | **222 / 222**. `tests/auto.test.js` 38 test G1 trên dữ liệu A1 thật; `tests/popup.test.js` 9 |
| Chuỗi dương A1 (Node) | arm → nhận 2xx → 15 tra QR → kế hoạch **#EF0E020C** → 5 PUT **trùng body lượt A1 thật** → GET toàn phiếu → **1** PUT `status/COMPLETED` không body → GET COMPLETED → `done`, quyền tiêu, tải lại trang COMPLETED không khung |
| Ca âm G1 (spec §3) | Mỗi ca 0 PUT `status`, trừ ca đã gửi thì không gửi lần 2. Danh sách: không arm / hết hạn / phiên tạo lại / sai xác nhận / PRD / từ trang web; EPC thiếu / lạ / 0 / 2 biên nhận; quyền sau lượt nhận; PO có biên nhận cũ; QR lỗi / sai lô / sai sản phẩm; đơn vị lạ; nhận thiếu (`plan_warning`); phiếu đã đủ UID; khung chưa gắn; đổi cửa hàng; đổi route khi đọc lại; GET sau W1 lệch UID / mã lạ / lượng / lô; PUT thứ 3 lỗi / hết giờ; hai tab; tab chết sau claim; tab được giao đóng; quyền hết hạn sau kích hoạt; `status` 500 / hết giờ / 2xx không COMPLETED; 500 nhưng đã COMPLETED; hook sớm; trang tự HOÀN THÀNH khi đọc lại; `claimComplete` sai tab / kế hoạch / lần hai; huỷ khi đang gửi |
| Audit độc lập | 0 P1, 5 P2, 3 P3 — đã sửa và có test (`AUDIT-v0.3.0.md`). Test mới trên src trước sửa: **8 trượt** |
| Đột biến `scripts/mutate-v0.3.0.py` | Lượt đủ 205 ca trên `b37c509`: **202 / 205**. 3 ca sống đều là lớp chặn thứ hai trong background (lớp khác vẫn giữ 0 PUT / 0 COMPLETED): kiểm quyền ở điểm kích hoạt, `auto:status` giữ quyết định bỏ qua, background từ chối `done` từ tab khác khi đang tự HOÀN THÀNH. Đã thêm test (`0ebfa81`, chỉ test): chạy lại 3 ca trên test mới **3 / 3 bị bắt** → **205 / 205** |
| Edge `edge-gr-page.js` trên gói `45E07F60` | **108 / 108 × 3 lượt**. Mục 8 (mới): popup trang extension (DOM thật) mở khung xác nhận; popup mở trong tab bị chặn cấp quyền (hàng rào "chỉ popup"); tab được giao tự điền 5 PUT (#E33C777A, 11 UID) → ≥ 2 GET đọc lại → 1 PUT COMPLETED → `done` → tải lại trang COMPLETED không khung |
| Đối chứng gói v0.2.5 | 104 / 108 — hỏng đúng 4 mục tự động |
| Edge `edge-check.js` | **42 / 42** |
| Hiệu năng (trace có tên, 3 lượt) | Tác vụ extension dài nhất: trang phiếu 3,04–8,35 ms; nhánh thiếu chỗ gắn 9,58–11,40 ms (`ui/panel.js:336`); mục 7 / 8 ≤ 3,80 ms. Luồng chính trang: 0 tác vụ ≥ 50 ms có và không extension (baseline dài nhất 37,27 ms) |
| Script nâng | Diễn tập thư mục tạm: `-Check` v0.2.4 ĐẠT; thư mục v0.2.5 DỪNG nêu 3 file; nâng khớp từng byte + sao lưu; chạy lại không chép |

**Giới hạn:**
- Phía Nextwaves của chuỗi A1 dùng message dựng từ nhật ký phiên thật (A1 không capture tab Nextwaves). Parser Nextwaves có test T3 thật.
- Trang COMPLETED trong Edge = DOM trang chờ nhận bỏ `#all-receipt`.
- Edge không diễn tập Reload nâng cấp có phiên thật (v0.2.4 → v0.3.0). `SESSION_SCHEMA` không đổi; `onInstalled` / dọn quyền bản cũ có test Node.

## 4. Bước tiếp

- **G2 (operator, cần cho phép):** cài gói `45E07F60` cùng thư mục, kiểm chỉ đọc GR03887 COMPLETED không khung, chọn một phiếu chưa nhận, đối chiếu tem — runbook §G2.
- **G3 (operator cho phép bằng chữ, đúng mã phiếu):** một lượt nhận + tự điền + tự HOÀN THÀNH — runbook §G3.
- Staging done + merge chỉ khi G1–G3 đạt trên chính gói này.
- Production vẫn chỉ đọc. Còn cổng O1, QR lô, reader Florita, T1-PRD, W1-PRD.
