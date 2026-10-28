# Chẩn đoán lượt Edge 75,18 ms — v0.2.4 (28/10/2026)

Trả lời PM `docs/pm/AUDIT-A1-PREP-v0.2.4-20261028.md` (P2 hiệu năng). Runtime / gói **không đổi** (`28d1f9c` / `0BB73E2D`). Chỉ đổi bộ kiểm `scripts/edge-gr-page.js` trên nhánh `batch/v0.2-rfid` (commit ở cuối file).

## 1. Đo thế nào

- **Bộ kiểm có gắn tên.** Mỗi mục kiểm đặt một mốc `console.timeStamp` vào trace. Mỗi tác vụ extension được in:
  - pha: **nạp script** (`EvaluateScript`) hay **gọi hàm** (`FunctionCall`);
  - `file:dòng:cột` + tên hàm (hoặc "ẩn danh");
  - bước = mục kiểm ngay sau tác vụ;
  - thời gian thực và **CPU luồng** (`tdur`) — phân biệt việc tốn CPU với luồng bị máy chen;
  - phần con lớn nhất: Layout, UpdateLayoutTree, v8.compile, GC…
- **Baseline không extension.** `node scripts/edge-gr-page.js --baseline`:
  - cùng trang phiếu DOM + CSS thật, cùng 3 khung nhìn + đoạn hit-test điều khiển của trang;
  - không nạp extension;
  - so tác vụ luồng chính của trang trong cửa sổ "mở trang → hết nw_ready" với lượt có extension (mốc `cgn#so-sanh`).
- **Môi trường.** Edge 156.0.4314.50 headless, hồ sơ tạm mới mỗi lượt. Sau mỗi lượt kiểm 0 Edge sót.
- **Số lượt.** Có extension: gói v0.2.4 giải nén `C:\circa-gr-nextwaves-v0.2.4`, 3 lượt, đều 95/95. Baseline: 6 lượt, 3 lượt sau thêm phép đo đọc bố cục.

## 2. Kết quả

### 2.1 Tác vụ extension (3 lượt có tên)

| Lượt | Dài nhất | Hàm ẩn danh `ui/panel.js` dài nhất | Nạp `pos/pos-content.js` |
|---|---|---|---|
| 1 | 10,47 ms (CPU 9,52) | `ui/panel.js:336:30` 10,47 ms — Layout 4,4 · UpdateLayoutTree 1,0 | 5,48 ms |
| 2 | 4,31 ms (nạp `pos-content.js`) | `ui/panel.js:336:30` 3,70 ms — Layout 1,0 | 4,31 ms |
| 3 | 8,27 ms (CPU 7,55) | `ui/panel.js:336:30` 8,27 ms — Layout 2,4 · UpdateLayoutTree 1,3 | 6,64 ms |

- `ui/panel.js:336:30` là callback `setTimeout` chờ 10 giây của khung trong luồng: hết 10 giây vẫn không thấy bảng của đúng phiếu → `fail("missing")` → hiện khung nổi báo lỗi "Giao diện phiếu nhận đã đổi" → đo vị trí nút cần tránh (`getBoundingClientRect`, ép layout).
  - Chỉ chạy ở **nhánh lỗi** (mục 79 của bộ kiểm). Luồng A1 bình thường không đi qua.
- Hàm ẩn danh khác của `ui/panel.js`:
  - `:301:44` (nút thu nhỏ) ≤ 1,34 ms;
  - `:197:29` (kiểm vị trí khung nổi mỗi giây) ≤ 2,19 ms.
- `check` (MutationObserver): 88 lần, mỗi lần ≤ 1,59 ms.
- **Nạp script** `ui/panel.js`: 0,20–0,45 ms.
- Các lượt 27–28/10 cũng có một tác vụ `ui/panel.js` không tên, 7,05–10,53 ms. Đây là cùng dải với callback trên. Log cũ không in dòng / cột nên không gán được chắc.
- CPU ≈ thời gian thực ở mọi tác vụ trên: không có dấu hiệu luồng bị máy chen.

### 2.2 Luồng chính của trang — có và không có extension

| | Tác vụ ≥ 50 ms | Tác vụ dài nhất | Thành phần chính |
|---|---|---|---|
| Không extension (6 lượt) | 1 / lượt | 60,42 – 78,46 ms | Layout 51,2 – 68,9 ms (layout đầu tiên của trang) |
| Có extension (3 lượt) | 1 / lượt | 64,01 – 70,59 ms | Layout 51,4 – 55,8 ms; **không chứa mã extension** |

- Tác vụ có mã extension dài nhất trên luồng chính là lượt parse trang có chèn content script: 12,04 / 22,11 ms (ParseHTML là chính). Phần của extension trong đó ≤ 6,64 ms.
- **Đọc bố cục một lần khi cả trang chờ layout lại** (baseline, 3 lượt): đổi cỡ chữ gốc (rem) rồi `getBoundingClientRect` ngay:
  - 37,0 / 37,5 / 49,1 ms;
  - đổi lại: 10,1 – 18,7 ms.

  Đổi khung nhìn rồi đọc ngay ≈ 0 ms: trình duyệt đã layout trước khi lệnh đọc chạy.

## 3. Phân loại

1. **Không tái hiện.** Gói v0.2.4 trên hồ sơ sạch có 8 lượt sau lượt hỏng: 5 lượt 28/10 cộng 3 lượt có tên. Dài nhất ≤ 16,62 ms.
2. **Lượt 10:53 không còn trace.** Log khi đó chỉ in `75.18 ms ui/panel.js`: không dòng / cột, không phân biệt nạp hay gọi hàm, không CPU. **Không gán chắc được.** Đây là giới hạn của bộ kiểm cũ; bản mới đã sửa.
3. **Khả năng cao nhất: layout của trang bị ép trong hàm extension.**
   - Callback `ui/panel.js:336` (hoặc một hàm khác của khung có đọc bố cục) đúng lúc cả trang đang chờ layout lại thì trả nguyên chi phí layout của trang.
   - Trên máy này, layout cả trang tốn 37–58 ms (layout đầu 51–69 ms).
   - Lượt 10:53 là lượt trang phiếu đầu tiên sau khi Edge tự cập nhật (bộ nhớ đệm đĩa / font nguội) nên có thể cao hơn.
   - Theo cách đo trace, phần layout này được tính vào tác vụ extension. Không có extension thì trang vẫn phải layout chừng ấy, ở khung hình kế tiếp.
   - Đây là suy luận từ số đo, **chưa dựng lại được đúng lượt đó**.
4. **Ít khả năng: nạp `ui/panel.js`.** Bình thường 0,20–0,45 ms. 75 ms nghĩa là chậm ~170 lần; chỉ hợp lý nếu máy rất bận. CPU của lượt đó không có để kiểm.
5. **Logic của extension không vượt ngưỡng.** Mọi hàm đo được ≤ 10,47 ms; phần không phải Layout ≤ ~6 ms.

## 4. Đề xuất cho PM

- **A1 có giám sát: không đổi runtime / gói.** Luồng A1 bình thường không đi qua nhánh lỗi 10 giây. Các tác vụ của luồng chính ≤ 6,64 ms (nạp `pos-content.js`).
- Bộ kiểm mới giữ lại:
  - in dòng / cột, CPU, phần con, bước cho 5 tác vụ dài nhất;
  - `CGN_TRACE_OUT=<file>` lưu phần trace liên quan;
  - `--baseline`.

  Nếu một lượt sau lại vượt 50 ms thì phân loại được ngay từ log.
- **Tuỳ chọn sau A1 — cần PM quyết, là gói mới.** Trong nhánh khung nổi, dời việc đo vị trí nút sang `requestAnimationFrame` để không ép layout đồng bộ trong hàm extension.
  - Không giảm tổng việc của trang, chỉ đưa layout về khung hình của trình duyệt.
  - Chỉ làm nếu PM muốn tiêu chí "tác vụ extension < 50 ms" không bị chi phí layout của trang làm vượt.
- **Giới hạn của phép đo:**
  - Edge headless;
  - trang dựng lại từ DOM + CSS thật, **không có JS React** của POS;
  - Chrome staging thật chưa đo hiệu năng. PM không yêu cầu operator đo.

## 5. Lệnh

Bộ kiểm: `58906e9` trên `batch/v0.2-rfid`. Log thô ở scratchpad dev; không vào repo.

```bash
node scripts/edge-gr-page.js C:\circa-gr-nextwaves-v0.2.4
node scripts/edge-gr-page.js --baseline
```

Thêm `CGN_TRACE_OUT=<file.json>` trước lệnh để ghi trace rút gọn.
