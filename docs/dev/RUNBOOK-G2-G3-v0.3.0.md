# Runbook G2 + G3 — v0.3.0 tự điền + tự HOÀN THÀNH (29/10/2026)

> Sửa 29/10 tối sau G3 lượt 1 (`docs/dev/KET-QUA-G2-G3-v0.3.0.md`). G3 bước 2: chỉ đúng nút tự động trong "Phiên gần đây", không dùng ô cấp phép thủ công. Bước 3: khung Nextwaves phải ghi "ĐÃ CHO PHÉP" trước khi quét. Bước 5: khung thủ công trên POS = dừng. POS gọi phiếu COMPLETED là "Đã nhận".

**Căn cứ:**
- `docs/pm/DECISION-ONE-STG-AUTO-FLOW-20261028.md` §3 (G2, G3);
- `agent.md` §2 (từ 29/10: operator + một phiên Claude giữ quyền ghi).

**Chỉ chạy khi:**
- G1 đạt (`docs/dev/BATCH-v0.3.0.md`);
- operator cho phép **từng bước** trong chat: cài gói (G2), một lượt nhận + tự điền + tự HOÀN THÀNH trên **đúng một** phiếu (G3).

**Gói cuối:** v0.3.0, mã gói `45E07F60` (SHA-256 đầy đủ ở `BATCH-v0.3.0.md`). Thư mục giao: `C:\circa-gr-nextwaves-release\v0.3.0\`. Máy staging đang cài **v0.2.4** trong `C:\circa-gr-nextwaves-v0.2.3`.

**Luật trong lượt** (runbook A1 §đầu):
- không bấm "Xoá" / "Huỷ phiên";
- chỉ bấm nút của đúng phiếu;
- gõ đúng mã;
- sai bất kỳ điều kiện nào → **DỪNG**, chụp màn hình, giữ nguyên tab, báo Claude. Không thử lại.

## G2 — cài gói cuối, kiểm chỉ đọc (không nhận, không ghi)

1. `chrome://extensions`: đúng một thẻ "Circa GR ← Nextwaves" **0.2.4**, "Tải từ" = `C:\circa-gr-nextwaves-v0.2.3`. Khác → DỪNG.
2. Kiểm (không đổi gì) → phải in **"KIỂM ĐẠT"**:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\circa-gr-nextwaves-release\nang-cap-v0.3.0.ps1 -Check
```

3. Nâng → phải in **"ĐÃ NÂNG: … v0.3.0 (45E07F60) từng byte, 19 file"**:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\circa-gr-nextwaves-release\nang-cap-v0.3.0.ps1
```

4. Bấm **Reload (↻)** trên thẻ, rồi F5 mọi tab POS / Nextwaves.
5. Service worker → Console → dán lệnh ở runbook A1 §0c. Kỳ vọng:
   - `v` 0.3.0, cùng `id`, `mode` STG, `grants` 0 (hoặc chỉ cấp phép đã hết hạn — vẫn nằm trong storage, extension bỏ qua);
   - `lastUpgrade` 0.2.4 → 0.3.0, `removedSessions` [].
6. **Phiếu GR03887 (đã hoàn thành):**
   - mở, chờ ≥ 15 giây;
   - F12 → Console → dán `C:\circa-gr-nextwaves-release\kiem-khung-gr.js`;
   - kỳ vọng `"khung": 0` (không còn khung đỏ của A1), `"trangThai": "Đã nhận"`.
7. **Chọn một phiếu chưa nhận** (ứng viên: GR03879 — phải đọc lại):
   - Trên danh sách GR, bấm **"Nhận hàng bằng RFID"** đúng dòng đó. Bước này chỉ đọc POS / Nextwaves và tạo phiên trên máy, không ghi.
   - Tab Nextwaves hiện **"Sẵn sàng nhận hàng"** với:
     - số UID dự kiến;
     - bảng SL GR = SL Nextwaves cho từng sản phẩm;
     - dòng "Tự động: chưa cho phép".
   - Gửi Claude một ảnh khung này kèm số tem vật lý đang có. Claude đối chiếu sản phẩm, lô, đơn vị, số tem.
   - Không đủ điều kiện → DỪNG, không tiêu đơn.
8. **Chưa** cho phép tự động, chưa đặt tem, chưa bấm nhận.

## G3 — một E2E staging thật (sau khi operator cho phép bằng chữ)

1. **Bật capture:** Net Capture trên tab POS và tab Nextwaves. Mỗi tab phải thấy một GET mới:
   - POS: F5;
   - Nextwaves: bấm "Đọc lại kết quả nhận".
2. **Cho phép tự động:**
   - Mở popup, **kéo xuống mục "Phiên gần đây"**, tìm dòng `STG · GR…` của đúng phiếu (trạng thái "Đã khớp đơn Nextwaves"). Trong dòng đó bấm nút **"Cho phép tự điền và HOÀN THÀNH 1 lần"**.
   - **KHÔNG** dùng ô "Cho phép điền phiếu (từng lần)" / nút "Cho phép điền 1 lần" ở đầu popup. Đó là cấp phép **thủ công** (bài học G3 lượt 1, `docs/dev/KET-QUA-G2-G3-v0.3.0.md`).
   - Đọc khung xác nhận: môi trường Staging, cửa hàng 2222, đúng GR / SO / PO Nextwaves / số tem.
   - Đúng thì bấm **"Xác nhận cho phép"**.
   - Kỳ vọng: dòng phiên trong popup ghi "Tự động: ĐÃ CHO PHÉP 1 lần · hết hạn HH:MM".
   - Quyền hết hạn sau **30 phút**.
3. **Nhận (dược sĩ, trong 30 phút):**
   - **Trước khi đặt tem:** khung extension trên tab Nextwaves phải ghi **"Tự động: ĐÃ CHO PHÉP 1 lần (hết hạn …)"**. Nếu ghi "Tự động: chưa cho phép" thì **DỪNG**, không quét, quay lại bước 2. Khung chưa cập nhật thì F5 tab Nextwaves.
   - đặt đủ tem;
   - chỉ khi màn quét báo **còn lại 0, ngoài phiếu 0**, mọi dòng đủ → bấm **"Xác nhận nhận hàng" đúng một lần**.
4. **Không chạm POS:** không bấm Điền, không bấm HOÀN THÀNH, không Xoá / Huỷ phiên, không F5. Tab POS tự về phiếu và hiện lần lượt:
   1. "Đang TỰ điền i/n";
   2. "Đang đọc lại … trước khi tự HOÀN THÀNH";
   3. "Đang tự HOÀN THÀNH";
   4. "đã tự HOÀN THÀNH — đang tải lại phiếu".

   Sau đó phiếu ở trạng thái **"Đã nhận"** (POS gọi phiếu COMPLETED là "Đã nhận"), không còn khung extension.
5. **Dừng ngay** nếu thấy một trong các khung:
   - "Tự động KHÔNG chạy";
   - khung luồng thủ công thay vì "Đang TỰ điền": "Chỉ xem kế hoạch — chưa có cấp phép điền" hoặc "Đã có cấp phép điền …". v0.3.0 không in lý do trên POS khi quyền bị bỏ qua lúc nhận (finding G3-2), xem popup / khung Nextwaves "Tự động đã dừng";
   - "đọc lại chưa khớp hoàn toàn";
   - "chưa rõ POS đã HOÀN THÀNH chưa";
   - "Không điền được".

   Khi đó: chụp màn hình, giữ tab, xuất storage, báo Claude. **Không thử lại tự động trên cùng đơn.** Phần còn lại chỉ đi đường thủ công khi operator cho phép riêng.
6. **Sau lượt:**
   - F5 phiếu một lần, dừng capture;
   - xuất storage (`copy(JSON.stringify(await chrome.storage.local.get(null), null, 2))`);
   - chụp 2 ảnh: màn quét trước khi xác nhận, phiếu cuối.

**Kỳ vọng G3:**
- đúng 1 `receive-scan` 2xx và 1 biên nhận mới;
- đủ UID, kế hoạch không chặn;
- số PUT detail = số lô, mỗi PUT có GET kiểm;
- GET đọc lại toàn phiếu khớp;
- **1** PUT `status/COMPLETED`, GET cuối COMPLETED;
- quyền đã tiêu, nhật ký đủ mốc `auto_*`, 0 ghi phiếu khác.

Claude làm sạch mẫu, báo status / giờ / hash và quyết G3. Staging done + merge chỉ khi G1–G3 đạt trên chính gói này.
