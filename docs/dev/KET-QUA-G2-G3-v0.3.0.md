# Kết quả G2 + G3 — v0.3.0 tự điền + tự HOÀN THÀNH (29–30/10/2026)

> **Kết luận (30/10): G2 ĐẠT, G3 ĐẠT ở lượt 2 trên GR03929.** Cùng G1 (29/10), cả ba gate đạt trên chính gói `45E07F60` → **staging done** cho v0.3.0. Merge `batch/v0.2-rfid` → `main` chờ operator đồng ý.

**Gói:** v0.3.0, mã gói `45E07F60` (`docs/dev/BATCH-v0.3.0.md`). Runbook: `docs/dev/RUNBOOK-G2-G3-v0.3.0.md`.
**Người chạy:** operator trên Chrome staging thật. Claude đánh giá từ số liệu operator gửi (đoạn kiểm chỉ đọc, file xuất storage, Net Capture tab POS); không mở `tokens.json` / `cookies.json` / `storage.json` / header HAR.

## G2 — ĐẠT (29/10, 14:03–14:10)

| Bước | Kết quả |
|---|---|
| Nâng v0.2.4 → v0.3.0 cùng thư mục | `v` 0.3.0, cùng ID `bkpbpknngkmmaclhkpnnlblofcaihadd`, `mode` STG, `autoGrants` 0; `lastUpgrade` 0.2.4 → 0.3.0, `removedSessions` [] |
| `grants` | 1 thay vì 0: cấp phép gõ nhầm "GR3887" của A1 (tạo 28/10 21:29, hết hạn 21:59, chưa dùng). Background / popup bỏ qua cấp phép hết hạn → vô hại |
| GR03887 (COMPLETED) | `kiem-khung-gr.js`: `khung` 0, `allReceipt` false, `trangThai` "Đã nhận" (POS gọi phiếu COMPLETED là "Đã nhận") |
| Phiếu chọn | **GR03886** (cửa hàng 2222): phiên `nw_ready` 14:07:59; SO `SOBD1594096-F`; PO Nextwaves `PO76149046`; phiếu gửi pending; `receiptIdsBefore` []; không khoá |
| Tem dự kiến | 11 EPC không trùng: 1110 (3 + 3 vỉ, hai lô), 2431732 (1 chai), 5451 (4 vỉ); SL GR = SL Nextwaves từng sản phẩm. Operator có đủ 11 tem vật lý |
| Trang GR03886 | `khung` 1, `trongLuong` 1, `noi` 0, `allReceipt` true, "Chờ nhận" |

## G3 lượt 1 — KHÔNG phải lượt tự động (29/10 chiều, nhận lúc 16:53:12)

**Chuyện gì xảy ra.** Operator bấm **"Cho phép điền 1 lần"**. Đó là ô đầu popup, tức cấp phép **thủ công**, tạo lúc 16:51:29. Nút cần bấm là **"Cho phép tự điền và HOÀN THÀNH 1 lần"**: nút phụ nằm trong dòng phiên ở mục "Phiên gần đây". Vì vậy quyền tự động chưa bao giờ được tạo:
- nhật ký phiên không có `auto_armed`;
- `autoGrants` trống;
- `autoRun` null.

Đến lúc nhận, `received()` không thấy quyền tự động, nên phiên đi luồng thủ công **đúng thiết kế**.

**Nhật ký phiên GR03886** (đoạn kiểm chỉ đọc trong service worker):

```
14:07:59 start · 14:08:00 nw_matched
16:53:12 receive_scan 200 · scan_ok 200 · nw_received 11
16:53:13 plan · plan
```

**Lượt nhận Nextwaves sạch:** 11/11 unit có EPC, 1 biên nhận, `receiptIdsBefore` 0. Nếu đã có quyền tự động thì lượt này đủ mọi điều kiện của `received()`:
- tập EPC khớp;
- đúng một biên nhận mới;
- quyền tạo trước `scanOkAt`.

**Net Capture tab POS** (16:50:55 → 17:07:26, không có tab Nextwaves):

| Giờ | Việc |
|---|---|
| 16:50:55 | F5 trang GR03886: `WAITING_TO_RECEIVE`, 3 dòng, đã nhận 0 |
| 16:51:29 | Khung đọc lại phiếu khi cấp phép thủ công được tạo (1 GET) |
| 16:53:12–13 | Sau "Xác nhận nhận hàng": GET phiếu, 11 GET `thuocsi-warehouse/qrcode` (đều OK), GET phiếu → kế hoạch `#2E4B7008`, 11 UID / 4 lô |
| → 17:07:26 | **0 PUT**, phiếu vẫn `WAITING_TO_RECEIVE`. Không có lượt tự động nào được thử |

11 mã QR tra đúng kế hoạch:
- 1110: lô 261009DHAUS 3 vỉ, lô 20261026FHDOIFNDSL 3 vỉ;
- 2431732: lô A98 1 chai;
- 5451: lô 20261026FIDBU 4 vỉ.

Lô nào cũng thành 1 / 1 trên phiếu (vỉ → hộp all-or-nothing).

Mấy lỗi 400 / 404 trong capture là trang POS tự gọi, không phải extension: `tsapi/core/account/v1/me`, `tsapi/integration/chat/*`, `promotion/pos-announcement`.

**Đóng phiếu.** Không chạy lại tự động được trên phiếu này, vì Nextwaves đã có biên nhận và `auto:arm` chặn khi `scanOk` / `receiptIdsBefore`. Operator hoàn tất theo luồng thủ công (đã đạt ở A1): bấm "Điền vào phiếu GR03886 · kế hoạch #2E4B7008 (11 UID)", rồi dược sĩ bấm HOÀN THÀNH. Kiểm sau:

```
{"maGR":["GR03886"],"trangThai":"Đã nhận","allReceipt":false,"khung":0,"trongLuong":0,"noi":0}
```

POS khớp Nextwaves (11 tem). Lượt điền thủ công không có capture (luồng đã đạt ở A1).

**Kết luận G3:**
- **Chưa đạt.** Lượt tự động chưa được thử. Không thấy lỗi ở điểm kích hoạt hay luồng tự động.
- Thử lại cần **GR / PO / SO mới cùng bộ tem mới**. Đề nghị thử **trên chính gói v0.3.0**: đổi gói thì phải làm lại G1 / G2. Runbook G3 đã sửa (bước 2–3).

## G3 lượt 2 — GR03929 (30/10). Operator báo đây là PO staging cuối cùng

**Bước A, kiểm trước (chỉ đọc), ĐẠT.** Phiên tạo 12:29:56 bằng "Nhận hàng bằng RFID":
- v0.3.0 STG, cửa hàng 2222, `nw_ready`;
- SO `SOBD1594182-F`, PO Nextwaves `PO19854897` (tìm 1 / 1, refId đúng SO);
- PO chưa có biên nhận, chưa quét, không khoá;
- 1 phiếu gửi pending (`needsAccept` true, giống GR03880 / GR03887 / GR03886);
- dòng: 5451 vỉ 4 / 4 tem, 5451 vỉ 4 / 4 tem, 2431732 chai 2 / 2 tem → 10 EPC không trùng, đủ UID;
- SL GR = SL Nextwaves (5451: 40 = 40; 2431732: 2 = 2);
- 0 quyền tự động, 0 cấp phép còn hạn;
- trang GR03929: Chờ nhận, `khung` 1 trong luồng, `allReceipt` true.

Thêm cho lượt cuối: một đoạn kiểm chỉ đọc chạy trong service worker, ngay trước khi quét. Đoạn này đối chiếu quyền tự động với phiên theo đúng các trường của `autoGrantFits`, cùng hạn quyền ≥ 10 phút và tập EPC. Kết quả in "SẴN SÀNG QUÉT" hoặc "DỪNG: lý do". Đã chạy thử trên dữ liệu giả, bắt đúng 5 ca: chưa có quyền, phiên tạo lại, sắp hết hạn, tem lệch, đã quét.

**Operator cho phép (nguyên văn, 30/10):** "Cho phép G3: một lượt nhận + tự điền + tự HOÀN THÀNH trên GR03929 (PO00006813) / PO19854897 / SOBD1594182-F, 10 tem, đủ 10 tem vật lý."

**Bước B — ĐẠT.** Toàn bộ lượt tự động chạy hết khoảng 5 giây, từ lúc dược sĩ xác nhận nhận hàng (13:04:09) đến GET thấy COMPLETED (13:04:14).

*Cho phép tự động và chốt chặn:*
- Lúc 12:56:50 operator bấm đúng nút tự động trong "Phiên gần đây"; khung xác nhận đúng Staging / 2222 / GR03929 / SO / PO / 10 tem.
- Phiên GR03929 sau đó **được tạo lại lúc 13:02:11**. Nhật ký phiên mới bắt đầu bằng `start` và không có `replaced_outdated`. Theo `startSession`, điều này nghĩa là phiên cũ đã bị Xoá / Huỷ rồi mở lại bằng "Nhận hàng bằng RFID".
- Quyền tự động 12:56:50 bị bỏ cùng phiên cũ, **đúng thiết kế**: `session:cancel` / `startSession` gọi `dropAutoGrant` (audit F3).
- Operator cho phép lại lúc **13:02:35** (`auto_armed` 10), hết hạn khoảng 13:32:35.
- Đoạn chốt chặn chạy **sau** lần cho phép lại và in "SẴN SÀNG QUÉT: GR03929 · PO19854897 · 10 tem · quyền còn 29 phút". Đoạn này kiểm khớp `sessionCreatedAt` của phiên mới.
- Trong chat, Claude ghi nhầm hạn quyền là 13:26:50 (hạn của quyền đã bị bỏ). Không ảnh hưởng lượt chạy.

*Nhật ký phiên GR03929* (đoạn kiểm chỉ đọc trong service worker, operator dán sau lượt):

```
13:02:11 start · 13:02:13 nw_matched · 13:02:35 auto_armed 10
13:04:09 receive_scan 200 · scan_ok 200 · nw_received 10 · auto_ready 10
13:04:10 plan · auto_claimed
13:04:11–13 apply_sending / apply_done ×4 · applied
13:04:13 auto_complete_claimed · 13:04:14 auto_complete_sent 200 · auto_completed 200
```

| Trường | Giá trị |
|---|---|
| `state` | `done` |
| `scanOkAt` / `autoRun.at` | 13:04:09 / 13:04:09, `skipped` null |
| `authorization` | `auto` true, kế hoạch `#4DF9D34A`, cấp 13:02:35, dùng 13:04:10 |
| `completeResult` | `source` "auto", 13:04:14 |
| Nextwaves | 10 unit có EPC, **1** biên nhận (trước lượt: 0) |
| Quyền còn lại | `autoGrants` còn hạn 0, `grants` còn hạn 0 → quyền đã tiêu |

*Net Capture tab POS* (13:02:16 → 13:04:28). File `net-capture-2026-10-30T06-04-38.zip`, SHA-256 `00a22832b1ad231bcff91db2f3a30608a4e31f8effe1bc1ee39942293c8ffed4`. Chỉ đọc url / method / status / giờ / body.

| Giờ | Việc |
|---|---|
| 13:02:16–28 | F5 danh sách GR, mở GR03929: `WAITING_TO_RECEIVE`, 4 detail (2 lô mỗi sản phẩm), đã nhận 0 |
| 13:04:09–10 | GET phiếu → 10 GET `thuocsi-warehouse/qrcode` (10/10 OK) → GET PO (kiểm liên kết) → GET phiếu → kế hoạch `#4DF9D34A` |
| 13:04:11–13 | **4 PUT detail, 4 × 200**. Mỗi PUT có GET kiểm lại. 5451 lô 261009KSDHAU: 4 vỉ → 1 hộp, 4 QR; 5451 lô 20261026FIDBU: 4 vỉ → 1 hộp, 4 QR; 2431732 lô 261016KHASUFDB: 1 chai, 1 QR; 2431732 lô 20261026FNDSUKBD: 1 chai, 1 QR |
| 13:04:13 | `verifyFinal`: GET toàn phiếu → `RECEIVING`, đủ 4 / 4 detail đúng kế hoạch |
| 13:04:13 | **Đúng 1 PUT `status/COMPLETED`**, 200, trả `COMPLETED` |
| 13:04:14–17 | GET → `COMPLETED`; trang tự tải lại; POS sinh phiếu PUT |

- Không có lệnh ghi nào khác của extension. 0 ghi vào phiếu khác.
- Các POST 400 là khung chat của trang POS (`tsapi/integration/chat/*`). POST `product/search` là trang tự gọi.
- Sau COMPLETED, số QR trên detail tăng (4 → 9, 1 → 3). POS tự thêm, giống GR03880, không phải extension.

*Đối chiếu kỳ vọng G3 (runbook):*

| Kỳ vọng | Kết quả |
|---|---|
| Đúng 1 `receive-scan` 2xx + 1 biên nhận mới | ĐẠT: 1 `receive_scan 200`, biên nhận 0 → 1 |
| Đủ UID, kế hoạch không chặn | ĐẠT: 10 / 10 EPC có UID, `auto_ready 10`, `autoPlanCheck` qua |
| Số PUT detail = số lô, mỗi PUT có GET kiểm | ĐẠT: 4 lô, 4 PUT 200, 4 GET kiểm |
| GET đọc lại toàn phiếu khớp | ĐẠT: `RECEIVING`, 4 / 4 |
| 1 PUT `status/COMPLETED`, GET cuối COMPLETED | ĐẠT |
| Quyền đã tiêu, đủ mốc `auto_*`, 0 ghi phiếu khác | ĐẠT |

Capture không có tab Nextwaves. Phía Nextwaves được chốt bằng nhật ký phiên (`receive_scan 200`, `scan_ok 200`) và `nwResult` (10 unit, 1 biên nhận), giống cách A1 đã được chấp nhận.

**Kết luận G3: ĐẠT** trên gói `45E07F60`.
- Lượt tự động chạy đúng một lần, từ đầu tới cuối, không người chạm POS.
- G1 + G2 + G3 đạt trên cùng gói → **staging done v0.3.0**.
- Merge `batch/v0.2-rfid` → `main` khi operator đồng ý.
- Production vẫn chỉ đọc tới gate PRD.

## Finding cho bản sau (không chặn kết luận G3)

| # | Mức | Finding | Hướng sửa |
|---|---|---|---|
| G3-1 | P2 | Popup: ô "Cho phép điền phiếu (từng lần)" nằm đầu popup, là nút chính, quen tay từ A1. Nút tự động lại là nút phụ trong dòng phiên. Operator bấm nhầm và mất một lượt E2E thật | Đưa quyền tự động của phiên `nw_ready` đủ điều kiện lên trên. Hoặc khi cấp phép thủ công cho GR có phiên `nw_ready` cho phép tự động: hỏi lại "Phiếu này có thể tự động — bạn muốn thủ công?" |
| G3-2 | P2 | POS không in lý do khi `received()` bỏ qua quyền (`grant_invalid` / `epc_set` / `receipts` / `armed_after_scan` / `grant_expired`). `autoRun` không được đặt nên `planAndOffer` không có dòng "Tự động KHÔNG chạy". Chỉ popup / khung Nextwaves báo "Tự động đã dừng", trong khi runbook bảo operator theo dõi dòng đó trên POS | Khung POS đọc `auto_skipped` cuối trong nhật ký phiên (sau `nw_received`) và in "Tự động KHÔNG chạy: <lý do>" |
| G3-3 | P3 | Khung POS luồng thủ công không nói phiếu không có quyền tự động | Khi phiên `received` không có `autoRun` và không có `auto_skipped`: thêm dòng "Tự động: chưa cho phép ở lượt nhận này" |
| G3-4 | P3 | Runbook / hướng dẫn: kỳ vọng `kiem-khung-gr.js` sau HOÀN THÀNH ghi "Hoàn thành". POS thực tế ghi "Đã nhận". G2 bước 5 kỳ vọng `grants` 0, nhưng cấp phép hết hạn cũ vẫn nằm trong storage | Đã sửa runbook (29/10). `kiem-khung-gr.js`: ghi chú phiếu COMPLETED hiện "Đã nhận" ở bản sau |
| G3-5 | P3 | Lượt 2: phiên bị Xoá / Huỷ rồi mở lại sau khi đã cho phép tự động. Quyền bị bỏ đúng thiết kế, operator cho phép lại, chốt chặn bắt được. Nhưng runbook chỉ cấm Xoá / Huỷ "trong lượt", không nói phải làm gì nếu đã lỡ tạo lại phiên trước khi quét | Runbook PRD: tạo lại phiên ⇒ quyền cũ mất ⇒ cho phép lại + chạy lại chốt chặn. Đưa 3 đoạn kiểm chỉ đọc (trước / chốt chặn / sau) vào `scripts/` cho pilot PRD |
