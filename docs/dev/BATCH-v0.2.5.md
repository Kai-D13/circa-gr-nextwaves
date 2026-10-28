# v0.2.5 — ứng viên nội bộ G0 (28/10/2026)

**Căn cứ:**
- `docs/pm/AUDIT-A1-GR03887-STG-v0.2.4-20261028.md` §2 (P2, P3);
- `docs/pm/DECISION-ONE-STG-AUTO-FLOW-20261028.md` §3 G0.

**Phạm vi G0:** v0.2.5 là bản nội bộ.
- **Không** yêu cầu operator cài, **không** dùng đơn staging, chưa merge.
- P2 / P3 giữ nguyên khi vào gói cuối (v0.3.0).
- Kiểm chỉ đọc GR03887 COMPLETED trên Chrome thật dời sang G2 với gói cuối.

## 1. Gói

| Mục | Giá trị |
|---|---|
| Nhánh | `batch/v0.2-rfid` **`02f2575`** (trên `13170bc` = runtime v0.2.4 `28d1f9c` + mẫu A1) |
| ZIP | `dist/circa-gr-nextwaves-v0.2.5.zip` trong worktree dev, 19 file |
| SHA-256 | `792817B909171EE7A6DC4EA2B86D5BBFEAC396F81633593226177AA72FD63A64` |
| Source = ZIP | giải nén `C:\circa-gr-nextwaves-v0.2.5`, `diff -r` với `src/` không khác |
| DIFF | `dist/circa-gr-nextwaves-v0.2.5-vs-13170bc.diff` (`7AF82F92…`), `.stat.txt` (`3F85DC26…`) — src + tests + scripts |
| Runtime đổi | 3 file, +50 / −5: `pos/pos-content.js`, `popup/popup.js`, `manifest.json` (0.2.5). **`background.js` không đổi** (phiên giữ khi nâng) |

## 2. Thay đổi

**P2 — khung sau khi phiếu kết thúc** (`pos/pos-content.js`):
1. Hook báo `status/COMPLETED` **2xx** của **đúng phiếu đang xem** → gỡ khung ngay (dừng observer / timer chờ chỗ gắn, bỏ lỗi giao diện cũ) → GET lại phiếu.
   - `statusEpoch` bỏ mọi view của lượt đánh giá bắt đầu trước sự kiện (GET cũ về muộn, phiếu còn "đang nhận").
   - HTTP lỗi hoặc phiếu khác: không làm gì.
2. GET cho thấy phiếu **không còn nhận được**:
   - **trên trang phiếu:** không vẽ, không chờ chỗ gắn, không `ui_anchor_missing` — kể cả phiên `done`;
   - `/chi-tiet-so` giữ khung nổi như cũ;
   - lượt cũ về muộn sau khi đổi route không gỡ khung của trang mới.
3. **Phiên `done` mà GET vẫn chờ nhận / đang nhận:** cảnh báo "POS chưa ở trạng thái hoàn thành", chỉ có "Đọc lại" + "Huỷ phiên". Không nút Điền, không tạo phiên mới.
4. **Phiếu đang nhận mà mất chỗ gắn:** vẫn báo lỗi + khoá W1 như v0.2.4. Guard đúng trang / đúng phiếu không đổi.

**P3 — cấp phép gõ nhầm** (`popup/popup.js`). Trước khi gửi `grant:create`, đọc `session:list`:
- mã (bỏ khoảng trắng, chữ hoa — như background) phải khớp **chính xác** một phiên **đang hoạt động**, **schema hiện hành**, **cùng môi trường**;
- không khớp: báo "Mã phiếu không khớp phiên đang có", nêu mã phiên đang mở, báo ký tự lạ nếu có. Giữ nguyên ô nhập, 0 cấp phép;
- đọc phiên lỗi: không cấp;
- background (khoá cấp phép) không đổi.

## 3. Kiểm

| Hạng mục | Kết quả |
|---|---|
| Test viết trước, chạy trên **src v0.2.4** | P2: **4 / 7 trượt** (khung đỏ sau COMPLETED, F5 phiếu COMPLETED, phiên done + phiếu chờ nhận, lượt đánh giá cũ); 3 ca giữ hành vi cũ đạt. P3: **3 / 5 trượt** (GR3887, phiên PRD / done / không schema, lỗi đọc phiên) |
| `npm test` v0.2.5 | **180 / 180** |
| Đột biến `scripts/mutate-v0.2.5.py` | **146 / 146** (130 ca v0.2.4 + 16 ca mới). Lượt đầu 145 / 146: sống ca "HOÀN THÀNH của phiếu khác gỡ khung" vì test chỉ kiểm trạng thái cuối → sửa test (giữ GET để thấy lần gỡ thoáng qua), chạy lại 16 / 16 |
| Edge `edge-gr-page.js` trên gói giải nén | **103 / 103 × 3 lượt** |
| Đối chứng gói v0.2.4 | 100 / 103 — hỏng đúng 3 mục của §7 |
| Edge `edge-check.js` (danh sách, trang phiếu, Nextwaves) | **42 / 42** |
| Script nâng `nang-cap-v0.2.5.ps1`, diễn tập thư mục tạm | `-Check` trên thư mục v0.2.4 thật (gói `0BB73E2D`) KIỂM ĐẠT; thư mục v0.2.3 → DỪNG, nêu 4 file khác; nâng → khớp v0.2.5 từng byte, có sao lưu; chạy lại → "đã là v0.2.5", không chép |

**Thay đổi bộ test** (cùng commit):
- `tests/browser-sim.js`: khung trong luồng giả mô phỏng thời gian chờ chỗ gắn (`tuning.uiWaitMs`, panel thật 10 s). `hide` huỷ hẹn `onMissing` như panel thật — bản cũ báo thiếu ngay cả khi khung đã gỡ.
- Hai test cũ chờ khung "GR03878: đã HOÀN THÀNH" trên trang phiếu, nay chờ khung ẩn (đúng spec P2).

**Edge §7 (mới):**
- trang "đã điền" (GR03880 sau W1 thật) **tự gửi `PUT status/COMPLETED` qua hook thật** (server giả 200) → bỏ `#all-receipt` → quá 10 s: không khung nào, phiên `done`, không `ui_anchor_missing`, 0 PUT điền mới;
- mở lại phiếu COMPLETED thật (GR03880, không `#all-receipt`, phiên `done`): không khung, không lỗi, không ghi;
- đoạn kiểm chỉ đọc `scripts/kiem-khung-gr.js` (dành cho G2) chạy trên trang đang nhận (khung 1, trong luồng 1, nổi 0) và trang COMPLETED (khung 0).

**Giới hạn:** trang COMPLETED trong Edge = DOM thật của trang phiếu *Chờ nhận* bỏ `#all-receipt`. Đoạn kiểm của operator 28/10 xác nhận trang COMPLETED thật không có `#all-receipt`. Chưa có outerHTML trang COMPLETED.

## 4. Hiệu năng gói cuối (trace có tên, Edge 156 headless)

| | Lượt 1 | Lượt 2 | Lượt 3 |
|---|---|---|---|
| Tác vụ extension dài nhất — trang phiếu, cả lượt (nạp script, vẽ lại, 3 khung nhìn, điền) | 12,51 ms | 6,38 ms | 7,85 ms |
| Nhánh thiếu chỗ gắn (trang mới, chờ 10 s → khung nổi), dài nhất `ui/panel.js:336:30` | 12,33 ms | 21,71 ms | 13,59 ms |
| §7 HOÀN THÀNH → bỏ `#all-receipt` | 5,97 ms | 4,34 ms | 7,05 ms |
| §7 mở lại phiếu COMPLETED | 5,04 ms | 5,91 ms | 4,40 ms |
| Luồng chính trang có extension: tác vụ ≥ 50 ms | 1 (80,14; Layout 65,5) | 1 (70,75; Layout 58,5) | 1 (71,94; Layout 57,9) |

- **Baseline không extension, 2 lượt:** 1 tác vụ ≥ 50 ms mỗi lượt (67,20 / 66,28 ms; Layout 56,7 / 58,5 ms).
- Tác vụ ≥ 50 ms ở lượt có extension **không mang mã extension** (trace không gắn cờ "có extension"). Đó là layout đầu tiên của trang, như baseline.
- Tác vụ dài nhất có mã extension trên luồng chính là lượt parse trang có chèn content script: 12,46–17,86 ms.
- **Không lượt nào có tác vụ extension ≥ 50 ms.** Finding 75,18 ms cũ (`PERF-75MS-v0.2.4`) vẫn không tái hiện; không xoá finding.

## 5. Bước tiếp (theo PM)

- PM audit G0 (source / gói / test / trace). Operator chưa cần làm gì.
- Dev làm batch tự động theo `docs/dev/DE-XUAT-v0.3.0-TU-DONG-20261028.md`, trên nền `02f2575`.
- Kiểm Chrome thật GR03887 COMPLETED ở G2 bằng gói cuối.
