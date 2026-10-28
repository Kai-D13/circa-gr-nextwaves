# A1 §0 — kết quả nâng v0.2.4 + kiểm staging chỉ đọc (28/10/2026)

Theo runbook `docs/dev/RUNBOOK-A1-GR03887-20261027.md` §0b–§0d và PM `docs/pm/AUDIT-A1-PREP-v0.2.4-20261028.md`.
- Operator làm trên Chrome staging thật; dev đối chiếu qua chat.
- Ảnh không vào repo (có tên nhân viên trên thanh POS).
- **Không** nhận, cấp phép, PUT hay HOÀN THÀNH.

**Quyết định stakeholder (28/10 ~13:55): §0 ĐẠT.** Bỏ qua chạy lại đoạn kiểm ở 1050–1150px và ảnh trang ở ~1095px.

## 1. Kết quả từng bước

| Bước | Kết quả | Nguồn |
|---|---|---|
| 0. Giữ phiên (v0.2.3) | Popup: STG · GR03887 "Đã khớp đơn Nextwaves", SOBD1594095-F → PO13806459 · **13:39:57 28/10**. Phiên còn hạn tới ~13:39 29/10 | Chữ popup operator chép |
| 1. Trước nâng | Thẻ "Circa GR ← Nextwaves" **0.2.3**, ID `bkpbpknngkmmaclhkpnnlblofcaihadd`; có nút "Errors" (§2.2) | Ảnh thẻ |
| 2. `-Check` | 2 gói đúng SHA (0BB73E2D / 40236D67); `C:\circa-gr-nextwaves-v0.2.3` đúng v0.2.3 từng byte, 19 file; "KIỂM ĐẠT" | Chữ PowerShell |
| 3. Nâng | Sao lưu `C:\circa-gr-nextwaves-release\backup\v0.2.3-dang-tai-20261028-134217`; "ĐÃ NÂNG … v0.2.4 (0BB73E2D) từng byte, 19 file" | Chữ PowerShell |
| 4–5. Reload + F5 | Operator làm theo runbook | — |
| 6. Service worker | `v` 0.2.4 · **cùng ID** · `mode` STG · `grants` 0 · `lastUpgrade` 0.2.3 → 0.2.4 lúc 06:42:42Z (13:42:42 giờ VN), `removedSessions` [] · GR03887 `nw_ready` schema 1, SOBD1594095-F, PO13806459, `locks` [], cập nhật 13:39:57 28/10 · **thêm phiên GR03878** (§2.1) | Dòng Console |
| Nextwaves (trước nâng) | Màn quét phiếu gửi IT-BUYMED-STAG-20261026085109-4520, CIRCA FLORITA, **15 còn lại, đã nhận 0 / 15**. Khung extension "Sẵn sàng nhận hàng": tìm theo SOBD1594095 total 1, refId đúng SO 1; SL gốc GR = Nextwaves (1110: 12 / 12, 5451: 40 / 40, 2431732: 1 / 1) | Ảnh |
| 7. Khung trang GR03887 — nhìn (~1913px) | **Đúng một khung** "Đã khớp đơn Nextwaves — chờ nhận hàng". Khung nằm giữa thẻ "Chi tiết phiếu nhận hàng GR03887 (PO00006767)" và "Danh sách sản phẩm nhập kho". Nút "Mở tab Nextwaves" / "Huỷ phiên"; không khung nổi. −/+/ô SL/lot-date/HỦY/HOÀN THÀNH thấy rõ. Phiếu Chờ nhận, SL nhận 0, Phiếu PUT trống | Ảnh |
| 7. Đoạn kiểm `preflight-gr-page.js` | Lần 1 chạy nhầm tab danh sách (`khung` 0, `MuiTablePagination`) → bỏ. **Lần 2 đúng tab:** `vw` 1216, `vh` 842, `khung` 1, `trongLuong` 1, `ngayTruocBangSanPham` true, `position` static, `maPhieuTheThongTin` ["GR03887"], `dieuKhienVungSanPham` 52, `nutCuoiTrang` HỦY + HOÀN THÀNH, `biChe` [], **`KET_QUA` ĐẠT** | Dòng Console |

**Phần chưa làm theo runbook (stakeholder đã chấp nhận):**
- đoạn kiểm chạy ở `vw` 1216, không phải 1050–1150;
- không có ảnh trang ~1095px.

Bằng chứng gần nhất cho 1095px là Edge trên DOM + CSS thật của trang phiếu: 1095×756 ĐẠT ở 8 lượt gần nhất (`docs/dev/A1-CHUAN-BI-v0.2.4-20261028.md` §6, `docs/dev/PERF-75MS-v0.2.4-20261028.md`). Khung nằm trong luồng, `position: static`, nên khung nhìn hẹp hơn chỉ dời bảng xuống, không che.

## 2. Điểm khác runbook

### 2.1 Phiên thứ hai GR03878 `waiting_nw` (cập nhật 23:49:46 27/10)

- **Sự thật:** runbook §0c ghi "đúng một phiên GR03887", nhưng kho có thêm phiên STG GR03878 (SOBD1593858-F, `waiting_nw`, không khoá).
  - Phiên tạo sau lần dev đọc 27/10 ~21:00; ai / thao tác nào tạo thì chưa rõ.
  - PO28237814 của SO này đã nhận ở T3 (25/10), nên phiên chỉ chờ, không có đơn để khớp.
- **Ảnh hưởng tới A1 (đọc mã v0.2.4):**
  - Tab Nextwaves tìm phiên theo `findByNw`: cùng môi trường, phiên đang mở, **cùng gốc SO** hoặc cùng PO.
  - SOBD1593858 ≠ SOBD1594095, phiên GR03878 không có PO. Vì vậy tab PO13806459 chỉ khớp phiên GR03887.
  - Cấp phép theo mã phiếu (`STG:GR03887`).
  - Không thấy đường nào để phiên GR03878 chạm vào GR03887.
- **Hết hạn:** bị xoá ở lần ghi phiên đầu tiên sau **23:49:46 28/10** (TTL 24 giờ).
- **Đề xuất:** để yên, không bấm "Xoá" (runbook cấm), ghi vào báo cáo A1.

### 2.2 Trang "Errors" của extension (operator chụp 28/10)

1. **Cảnh báo** (biểu tượng tam giác) "Use of history.pushState in a trivial session history context, which maintains only one session history entry, is treated as history.replaceState."
   - Context `https://www.google.com/search?q=poss…&sourceid=chrome…`.
   - Stack `pos/pos-hook.js:113 (window.history.<computed>)` = dòng `orig.apply(this, arguments)` trong hàm bọc `pushState` / `replaceState` để báo đổi route.
   - **Sự thật:** lời gọi là `pushState` của chính trang POS; hàm bọc chỉ chuyển tiếp. `pos-hook.js` giống hệt nhau ở v0.2.3 và v0.2.4.
   - **Suy luận:**
     - "Trivial session history context" là trang được Chrome dựng trước (prerender), ở đây từ ô địa chỉ / tìm kiếm khi gõ "poss".
     - Trang POS dựng trước vẫn chạy content script. Chrome gán context cho URL của tab (Google).
     - Đây là cảnh báo, không đổi hành vi. Extension không ghi gì từ trang này: lối vào chỉ chạy khi bấm nút, cấp phép theo mã phiếu.
2. **Lỗi** "Uncaught (in promise) Error: Extension context invalidated."
   - **Suy luận:** đây là content script của bản cũ trong tab mở từ trước khi Reload, gọi `chrome.runtime` sau khi extension đã nạp lại. Runbook bắt F5 mọi tab vì chính lý do này.
   - Không ảnh hưởng tab đã F5. Ảnh chỉ thấy tiêu đề, không thấy stack. Có thể là lỗi cũ từ các lần Reload trước.
   - **Đề xuất sau A1:** bắt lỗi này trong content script để không đỏ nút "Errors" (gói mới, PM quyết).

## 3. Trạng thái để vào A1

- **Extension:**
  - v0.2.4 trong `C:\circa-gr-nextwaves-v0.2.3`, cùng Extension ID;
  - phiên GR03887 `nw_ready` còn hạn tới ~13:39 29/10. Bấm "Mở tab Nextwaves" để làm mới;
  - 0 cấp phép.
- **Từ đây tới hết chặng 3:** không cài / Reload / đổi extension.
- **Còn cần trước chặng 1:**
  - PM ghi quyết định gate A1 (stakeholder đã chốt §0 đạt);
  - **operator xác nhận đủ đúng 15 tem** theo bảng §1 và **cho phép riêng một lượt GR03887** (nhận → điền → HOÀN THÀNH);
  - bật capture theo runbook §2.
- **Hiệu năng (P2):** `docs/dev/PERF-75MS-v0.2.4-20261028.md` — không tái hiện, đề xuất không đổi gói cho A1.

## 4. Quyết định operator / stakeholder (28/10 chiều) và rà lại trước A1

**Operator / stakeholder trả lời trong chat:**
1. Có **đúng 15 tem** của đơn này (bảng runbook §1).
2. **Cho phép một lượt A1** trên GR03887 / PO13806459 / SOBD1594095-F: nhận → điền → HOÀN THÀNH. Mục tiêu: một luồng E2E staging chuẩn để làm căn cứ lên production.
3. Đồng ý bật capture hai tab, điểm dừng 1, điểm dừng 2.
4. Ở chặng 2: dev rà kế hoạch tại điểm dừng 1 rồi cho điền đủ cả 5 lô.

**PM chưa ghi quyết định gate A1.** Stakeholder quyết chạy; dev ghi lại ở đây. Không đổi gói, không đổi runbook.

**Dev rà lại đường A1 trên mã v0.2.4 (`28d1f9c`, gói `0BB73E2D`) — không thấy lỗi chặn:**
- Nextwaves: chỉ chuyển sang POS khi lượt "Xác nhận nhận hàng" trả 2xx **và** đọc lại PO / biên nhận đủ EPC, có UID cho từng EPC, có biên nhận mới (`background.js` `received`, `lib/nw-model.js`). Thiếu / thừa / không có biên nhận mới → ở lại Nextwaves, báo lỗi.
- POS: tra QR **từng UID** (GET), kế hoạch đối chiếu sản phẩm, lô, quy đổi đơn vị; có bất kỳ điểm chặn nào → không ghi gì (`lib/plan.js`).
- Ghi chỉ khi có cấp phép 1 lần / 30 phút cho GR03887 **và** bấm nút mang mã kế hoạch trong khung đang gắn đúng trang phiếu. Mỗi PUT có GET kiểm sau; xong thì tải lại trang.
- Extension **không** gọi `status/COMPLETED`; chỉ nghe kết quả để đánh dấu phiên "xong".

**Rủi ro còn lại (đã có luật dừng):**
- POS chỉ tra QR 15 UID **sau** khi Nextwaves đã nhận. UID nào POS không tra được → kế hoạch bị chặn ở điểm dừng 1, hàng bên Nextwaves đã nhận → runbook §4. Lượt GR03880 (26/10, cùng luồng tạo đơn staging) tra được 11/11.
- Extension bán hàng trên cùng máy có thể giữ cổng reader → đóng tab POS production trước khi kết nối (runbook §3 chặng 1).

**Yêu cầu mới của stakeholder — chuyển PM, không làm trong A1:** "Bấm hoàn thành trên Nextwaves thì nên hoàn thành trên POS luôn."
- Hiện quyết định 24/10 (`agent.md`): dược sĩ bấm HOÀN THÀNH trên POS; extension chỉ điền sẵn UID và không gọi `status/COMPLETED`. Điền cần cấp phép + bấm mỗi lượt. A1 chạy theo luật này.
- Yêu cầu mới bỏ hai chỗ người bấm: (a) cấp phép + "Điền"; (b) HOÀN THÀNH trên POS.
- HOÀN THÀNH không hoàn tác được: cộng tồn, và POS tự thêm mã QR mới sau đó (Đợt 2 D4, chưa chốt ảnh hưởng).
- **Đề xuất dev:** PM spec một lô sau A1, chỉ chạy khi A1 đạt.
  - Bước 1: tự điền ngay sau xác nhận Nextwaves khi kế hoạch không có điểm chặn.
  - Bước 2: tự HOÀN THÀNH chỉ khi GET sau điền đúng hoàn toàn kế hoạch (mọi lô đủ, đúng UID); lệch thì dừng và báo.
  - Cả hai có công tắc theo môi trường / cửa hàng; staging trước, production sau gate riêng.
