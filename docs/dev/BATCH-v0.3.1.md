# v0.3.1 — production Florita: một bản, cài một lần (05/11/2026)

**Căn cứ:**
- quyết định operator 05/11 (`agent.md` §3);
- plan `docs/dev/PLAN-PRD-FLORITA-v0.3.x-20261030.md` (sửa 05/11);
- finding G3-1..G3-5 trong `docs/dev/KET-QUA-G2-G3-v0.3.0.md`.

Hướng dẫn đơn thật: `docs/dev/RUNBOOK-PRD-FLORITA-v0.3.1.md`.

**Chưa cài, chưa ghi production.** Cài và lượt ghi đầu tiên chỉ khi operator cho phép bằng chữ, đúng phiếu.

## 1. Gói

| Mục | Giá trị |
|---|---|
| Nhánh | `batch/v0.3.1-prd` `7719715` (src đổi lần cuối ở `20b3a14`), tách từ `main` `20e925d` |
| ZIP | `circa-gr-nextwaves-v0.3.1.zip`, 19 file |
| SHA-256 | `3E44C1DCF1A106C763969ABB76EC83A7079FB17C0138903FE2E398F5132A0201` (mã gói **3E44C1DC**) |
| Source = ZIP | giải nén `C:\circa-gr-nextwaves-v0.3.1-3E44C1DC`, `diff -r` với `src/` không khác. Đóng lại từ `git archive HEAD` ra cùng mã gói |
| Thư mục giao | `C:\circa-gr-nextwaves-release\v0.3.1\`: ZIP + `kiem-truoc.js` / `kiem-quet.js` / `kiem-sau.js` / `kiem-khung-gr.js` + `HUONG-DAN-v0.3.1.md` + `SHA256SUMS.txt` (`sha256sum -c` đạt) |
| Cài | Mới trên máy POS Florita: giải nén vào `C:\circa-gr-nextwaves`, Load unpacked, chọn Production. Máy chưa có bản nào của extension này nên không có phiên cũ |

## 2. Thay đổi so với v0.3.0 (`4b79c58`, gói `45E07F60` đã đạt G3)

**Lõi ghi giữ nguyên từng byte.** `git diff 4b79c58` trống cho:
- `background.js`;
- `lib/plan|apply|nw-model|pos-model|match|resolve|keys`;
- `nw/*`, `pos/pos-hook.js`, `pos/gr-list.js`, `ui/*`.

Chỉ đổi 6 file:

| File | Đổi |
|---|---|
| `lib/env.js` + bản sao `main/env.js` | PRD `writeEnabled: true`, `storeAllowlist` chỉ Florita `c476efb2…` (= cửa hàng duy nhất có kho Nextwaves trong bảng). Cửa hàng khác: không nút, không phiên |
| `manifest.json` | 0.3.1 |
| `popup/popup.html` | "Phiên gần đây" (nút tự động) lên trên ô "Cấp phép điền THỦ CÔNG"; nhãn "Production" bỏ "(chỉ đọc)" |
| `popup/popup.js` | **G3-1:** phiếu còn tự động được (`waiting_nw` / `nw_ready`, chưa xác nhận nhận hàng, PO chưa có biên nhận) → bấm cấp phép thủ công lần đầu chỉ cảnh báo, lần hai cùng môi trường + mã mới cấp. Chặn bấm đúp (audit P2-1) |
| `pos/pos-content.js` | **G3-2 / G3-3**, chỉ hiển thị: phiên `received` không có lượt tự động → dòng "Tự động KHÔNG chạy: <lý do lúc nhận>" hoặc "Tự động: chưa cho phép ở lượt nhận này". Thêm chữ cho các lý do còn in mã thô (`epc_set`, `receipts`, `armed_after_scan`, `grant_expired`, `tab_closed`, `no_plan`, `no_session`, `ui_not_anchored_complete`) |

**Script (G3-4 / G3-5):**
- `scripts/kiem-truoc.js`, `kiem-quet.js` (chốt chặn), `kiem-sau.js`: chỉ đọc, sửa một dòng `const GR`.
  - Chọn phiên theo môi trường đang chọn trong popup; báo khi có phiên trùng mã.
  - Chốt chặn đối chiếu đúng các trường `autoGrantFits`, hạn quyền ≥ 10 phút và tập tem.
  - `kiem-sau` đếm lượt điền và giữ đủ mốc nhật ký.
- `kiem-khung-gr.js`: ghi chú phiếu COMPLETED hiện "Đã nhận".

## 3. Kiểm (Claude tự gate, không ghi thật)

| Gate | Kết quả |
|---|---|
| `node --test` | **231/231** (v0.3.0: 222). Đổi 4 test mã hoá luật cũ (PRD chỉ đọc, cấp phép thủ công `nw_ready` một lần bấm), thêm 9 test. 7 test mới trượt trên src v0.3.0 |
| Test mới | <ul><li>PRD chỉ Florita: cửa hàng khác không tạo được phiên; Florita không còn `env_read_only` nhưng vẫn cần cấp phép, cấp phép STG không dùng được cho PRD</li><li>mọi cửa hàng được phép đều có kho</li><li>popup hỏi lại / bấm đúp / `waiting_nw` / Production</li><li>khung POS 4 lý do + có cấp phép vẫn còn dòng</li><li>hook production: API khác origin `api.v2.circa.vn` → header PRD + `gr-status`</li><li>**công tắc tắt ghi**: vá `env.js` của background PRD `writeEnabled:false` → không cấp phép / không cho phép tự động / `env_read_only`</li><li>3 đoạn kiểm chạy trên dữ liệu background thật của lượt tự động A1 giả lập, gồm phiên tạo lại → DỪNG, trùng mã → DỪNG, popup khác môi trường</li></ul> |
| Đột biến `scripts/mutate-v0.3.1.py` | **Lượt đủ** 215 ca (205 ca v0.3.0 + 10 ca v0.3.1), trên `6eb2ac9`: **213/215**. Hai ca sống: <ol><li>"PRD cấp được quyền tự động": hàng rào chỉ đọc không còn cấu hình thật chạm tới</li><li>"lần hỏi cũ dùng lại"</li></ol>→ thêm test công tắc tắt ghi + bước bấm lại cùng mã. **Chạy lại** 13 ca v0.3.1 + ca từng sống trên mã sau audit: 13/13 |
| Edge thật `scripts/edge-gr-page.js` trên bản giải nén 3E44C1DC | **108/108** (khung trang phiếu mọi trạng thái × 3 cỡ, W1 bàn phím, trang COMPLETED, chuỗi tự động qua popup thật). Tác vụ extension dài nhất **15,12 ms** (< 50 ms). Không sót tiến trình Edge thử |
| Audit độc lập (sub-agent, chỉ đọc) | **0 P1, 2 P2, một số P3.** <ul><li>P2-1 bấm đúp lọt bước hỏi lại → **đã sửa** + test</li><li>P2-2 tài liệu còn ghi "v0.3.1 chỉ đọc" → **đã sửa** (plan, `agent.md`, `state.md`)</li><li>P3 đã sửa: test PRD khác origin, công tắc tắt ghi, mã lý do thô, hỏi lại theo môi trường, `waiting_nw`, đoạn kiểm theo môi trường / trùng mã / nhật ký</li></ul> |
| Quét bí mật + tên nhân viên | 0 kết quả, mỗi commit |

**P3 chấp nhận, không sửa:**
- `autoPossible` không xét khoá điền / tem trùng. Cảnh báo có thể nói "CÓ THỂ chạy tự động" khi `auto:arm` sẽ từ chối; đường thủ công vẫn mở sau lần bấm hai.
- `claimApply` / `claimComplete` không kiểm lại cửa hàng. An toàn vì phiên chỉ tạo qua `startSession` có kiểm cửa hàng, và máy Florita cài mới nên không có phiên PRD cũ. Sửa nằm trong lõi, giữ nguyên.
- Dòng "phiếu đi đường thủ công" vẫn hiện khi phiên có khoá điền; khung đã có dòng lý do khoá riêng.

## 4. Rủi ro còn lại cho đơn thật (chưa kiểm được trên máy thật)

1. **Extension chưa từng gọi production.**
   - Đường dẫn API trong mã khớp capture production 19/10; header Bearer, không cần cookie.
   - Sai ở đâu thì dừng trước khi ghi: không khớp đơn / kế hoạch chặn / "Tự động KHÔNG chạy".
2. **Chạy chung QR Scan Log.** Mới kiểm bằng đọc mã bản 0.9.3: bọc `fetch` / XHR kiểu đi qua.
3. **Nhả / trả đầu đọc giữa bán hàng và Nextwaves.** Suy từ mã hai bên; hướng dẫn có bước xử lý khi Nextwaves báo đầu đọc bận.
4. **Lặp mã QR sau HOÀN THÀNH** là hành vi máy chủ POS, đã chấp nhận (D1).

## 5. Sau lượt đơn thật

- Claude đối chiếu kết quả `kiem-sau.js` + 2 capture như G3.
- Đạt thì merge `batch/v0.3.1-prd` → `main` (khi operator đồng ý), rồi chạy tiếp các đơn tự động.
- Không đạt thì dừng; phiếu hoàn tất tay; sửa ở bản sau.
