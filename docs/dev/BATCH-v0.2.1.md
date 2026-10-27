# Batch v0.2.1 — sửa theo PM audit v0.2.0 (P2.1 replay danh sách, P2.2 ngưỡng hiệu năng lúc tải trang) (27/10/2026)

**Căn cứ:** `docs/pm/AUDIT-v0.2.0-SOURCE-PACK-20261027.md` (commit `a6a372a`). Spec hiệu lực không đổi: `docs/dev/BATCH-v0.2.0.md` §1.

**Nhánh:** `batch/v0.2-rfid`, commit `cbac491` (từ `682c509`, đã push).

**Gói:** `dist/circa-gr-nextwaves-v0.2.1.zip`, 19 file.
- SHA-256 `e34ff7c53d117f70b0ea4cc68e46a19ab8764a71ef1c3bce7d0c06d23b1190c1`, **mã gói `E34FF7C5`**.
- Dựng lại từ checkout sạch `cbac491` ra cùng SHA.
- Giải nén `C:\circa-gr-nextwaves-v0.2.1` khớp từng file với `src/` (`diff -r` rỗng); `lib/env.js` = `main/env.js`.

**Chưa cài, chưa nhận / ghi staging.** G0 trang thật: §4.

## 1. P2.1 — chào lại chỉ gửi lượt danh sách mới nhất

**Lỗi (PM xác định đúng):**
- `finishList` ghi `lastList = msg` vô điều kiện. A gửi → B gửi → B về → A về thì `lastList` = A (mang `latestReqSeq` = B).
- Content nạp muộn chỉ nhận A, bỏ A (đúng R1) và không bao giờ thấy B. Kết quả: không có nút tới khi POS tải lại danh sách.
- `beginList` cũng không xoá kết quả cũ: lượt mới đang chờ mà content nạp muộn vẫn được gửi kết quả cũ.

**Sửa (`src/pos/pos-hook.js`, +8 / −3):**
- `lastList = {req, res}` luôn là lượt **mới nhất đã gửi**.
  - `beginList`: `lastList = {req, res: null}` (đang chờ).
  - `finishList`: chỉ ghi `res` khi `reqSeq` đúng lượt đó. Response lượt cũ về muộn vẫn phát cho content đang nghe (content tự bỏ theo R1) nhưng không vào `lastList`.
  - Content chào → hook gửi lại `gr-list-request` của lượt mới nhất, rồi `gr-list` của lượt đó nếu đã về.
- Content không đổi: hàng rào đọc lại GR / PO / SO khi bấm giữ nguyên.

```diff
-      if (lastList) post("gr-list", lastList);
+      if (lastList) {
+        post("gr-list-request", lastList.req);
+        if (lastList.res) post("gr-list", lastList.res);
+      }
…
-    post("gr-list-request", { envId: call.envId, reqSeq: listSeq, queryKey: call.queryKey });
+    lastList = { req: { envId: call.envId, reqSeq: listSeq, queryKey: call.queryKey }, res: null };
+    post("gr-list-request", lastList.req);
…
-    lastList = msg;
+    if (lastList && lastList.req.reqSeq === reqSeq) lastList.res = msg;
```

**Test mới:**

| Test | Kiểm |
|---|---|
| `hooks`: "chào lại chỉ gửi lượt mới nhất" | A/B về ngược → gửi lại `[request B, kết quả B]`. C gửi sau → `[request C]` (đang chờ, không còn B). C lỗi → `[request C, ok:false]` |
| `v02`: "P2.1 hook thật → content nạp muộn" | Hook **thật** (`helpers.loadHook`) nối với content **thật** trên trình duyệt giả. A/B ngược → nút theo B, 0 request API. B đang chờ khi content nạp → không hiện dữ liệu A; B về → hiện B |

- Cả hai test **hỏng trên hook cũ `682c509`** (đã chạy đối chứng) và đạt trên `cbac491`.
- `loadHook` / `FakeXHR` chuyển từ `hooks.test.js` sang `tests/helpers.js` để `v02` dùng hook thật.

## 2. P2.2 — mỗi lượt quét < 2 ms, kể cả lúc tải trang

### Phép kiểm

- `scripts/edge-check.js`: ngưỡng chung `PASS_BUDGET_MS = 2` cho **mọi** lượt.
- Lượt lúc tải trang thành mục riêng: "lúc tải danh sách (tạo 13 nút): mỗi lượt quét < 2 ms" (trước đây < 16 ms gộp trong mục bão). Edge giờ có **17 mục**.

### Nguyên nhân

- Đo từng bước trên Edge thật: lượt tạo nút đầu tiên tốn ~1–2 ms gần như **chỉ ở dòng đầu**:
  - đọc mã: 0,3–0,8 ms;
  - tạo nút đầu: 0,3–0,6 ms;
  - các dòng sau ~0,1 ms.
- Đây là chi phí **một lần**: khởi tạo kiểu DOM trong world của extension, biên dịch hàm / regex, phân tích style inline của nút.
- Ngoài ra, mỗi nút gắn 10 bộ nghe. Danh sách dài thì một lượt tăng tuyến tính: 200 dòng là 2–9,5 ms ở bản cũ.

### Sửa (`src/pos/gr-list.js`)

1. **Một bộ nghe capture ở `document`** cho 10 loại sự kiện (gắn khi vào danh sách, gỡ khi rời) thay 10 bộ nghe trên mỗi nút.
   - Sự kiện trên nút của ta dừng ở `document` pha capture, nên không tới dòng POS, kể cả bộ nghe capture của app ở thẻ gốc. Cách này chặt hơn bản cũ.
2. **Nút clone từ một nút mẫu**: style chỉ phân tích một lần.
3. **Đọc mã theo chữ của ô trước.** Ô có mã lẫn chữ khác mới tìm phần tử lá trong ô đó, giữ luật `^GR\d{5,}$`.
4. **Chưa có dòng nào cần nút** (trang vừa tải, response chưa về) thì chỉ gỡ nút sót, không quét bảng.
5. **Chia lát:** mỗi lượt quét dừng sau ~1 ms (cộng dòng đang làm dở); dòng còn lại chạy ở task sau (`setTimeout 0`).
   - Lượt quét mới huỷ phần còn lại của lượt cũ. Dòng đã rời DOM thì bỏ qua.
6. **Làm ấm trước:** phần chỉ tốn lần đầu làm ngay khi vào danh sách, trong **hai task riêng**, trên phần tử tạm không gắn vào trang:
   - tạo nút mẫu;
   - đọc mã một dòng tạm.

   Việc này thường xong trước khi response danh sách về.

### Số đo — Edge thật, extension cài từ thư mục, trang danh sách giả 20 dòng / 13 nút

| Bản | Lượt lúc tải trang (tối đa) | Lượt trong bão 300 thay đổi DOM (tối đa) | Kết quả mục mới |
|---|---|---|---|
| v0.2.0 `096D97D9` — PM | 2,5 ms; ≈ 2,0 ms | 0,2 / 0,6 ms | — |
| v0.2.0 — dev trước đó | 1,6; 1,8 ms | 0,7 ms | — |
| v0.2.0 — dev, cùng buổi đo v0.2.1 (máy bận hơn) | **3,7; 5,2; 7,0 ms** | ≤ 2 ms | **HỎNG 1/17** (3/3 lần) |
| v0.2.1 `src/` | **1,0–1,3 ms** (6–7 lượt, tổng 3,8–5,4 ms) | 0,3–0,5 ms | **17/17** (5/5 lần) |
| v0.2.1 gói giải nén | **1,2; 1,2 ms** | 0,2 ms | **17/17** (2/2 lần) |

- CPU extension trong bão: 0,7–2,9 ms (trang 22–29 ms).
- Trang bán hàng: CPU extension 0,0 ms, 0 request.

### Số đo ngoài extension — `scripts/bench-gr-list.js` (Edge headless, mỗi lần một hồ sơ mới, code lạnh, 8 lần)

| | 20 dòng: lượt tạo nút tối đa | 200 dòng: lượt tạo nút tối đa |
|---|---|---|
| v0.2.0 | 0,4–1,2 ms (một lượt) | **2,0–9,5 ms** (một lượt) |
| v0.2.1 | 0,5–1,6 ms (1–4 lát) | 0,9–1,4 ms (1–4 lát) |

Lượt vào danh sách (làm ấm) tối đa 0,2–1,0 ms.

**Giới hạn của số đo:**
- Đo bằng đồng hồ thật trên máy desktop đang chạy việc khác; độ phân giải `performance.now` 0,1 ms.
- Bench thỉnh thoảng có lượt 1,5–4 ms ngay cả khi code đã ấm. Một lát không thể tự tốn như vậy, nên đó là GC / hệ điều hành chen vào, không phải việc của extension. Edge-check 7/7 lần đều dưới 2 ms.
- **Chưa đo trên DOM danh sách staging thật** (G0, §4). Cách đo:
  - lấy outerHTML trang danh sách thật (chỉ đọc);
  - phát lại trong edge-check bằng CDP Fetch, có và không có extension;
  - cùng bão DOM, so CPU trang.

### Chặn sự kiện — đột biến trên Edge thật

`scripts/mutate-edge-v0.2.1.js`: **3/3 bị bắt** (mục "bấm nút: không mở dòng …" HỎNG) với từng ca:
- bỏ `stopPropagation`;
- gắn bộ nghe ở pha bubble;
- bấm không gọi `activate`.

## 3. Kiểm tổng

| Mức | Kết quả |
|---|---|
| `npm test` | **133/133**, 3 lần liên tiếp (v0.2.0: 131; +1 `hooks`, +1 `v02`) |
| Đột biến `python -I scripts/mutate-v0.2.1.py` | **96/96** = 93 ca v0.2.0 + 3 ca P2.1 (response lượt cũ ghi đè lượt gửi lại; chào lại không báo lượt đang chờ; gửi lượt mới vẫn giữ kết quả cũ). 0 ANCHOR, 0 ca hết giờ 240 s, chạy một mình |
| Đột biến DOM trên Edge `node scripts/mutate-edge-v0.2.1.js` | **3/3** |
| Edge thật `node scripts/edge-check.js` | `src/` 17/17 × 5; gói giải nén 17/17 × 2; gói v0.2.0 hỏng 1/17 × 3 (mục tải trang) |
| Gói | Tái lập cùng SHA từ checkout sạch; 19/19 file khớp |
| Quét bí mật / tên nhân viên | sạch |

**Diff `682c509..cbac491`:** 11 file, +671 / −141. Riêng `src/`: 3 file, +137 / −53 (`pos-hook.js`, `gr-list.js`, `manifest.json` version).
- Phần lớn còn lại là test và script: `bench-gr-list.js`, `mutate-v0.2.1.py`, `mutate-edge-v0.2.1.js`; `helpers.js` nhận `loadHook`.
- DIFF đầy đủ: `dist/circa-gr-nextwaves-v0.2.1-vs-682c509.diff` + `.stat.txt` (ngoài git), hoặc `git diff 682c509 cbac491`.
- Không đổi: `pos-content.js`, `background.js`, `panel.js`, `src/nw/*`, `plan.js`, `apply.js`, `env.js`.

## 4. G0 trang thật

- 27/10 operator **cho phép dev dùng Claude in Chrome chỉ đọc** trên Chrome đang đăng nhập POS / Nextwaves staging.
  - Phạm vi: mở danh sách, GR03878, màn quét Nextwaves; đọc body response danh sách (không header / token / cookie) và outerHTML; chụp ảnh.
  - Không bấm nhận hàng, cấp phép điền hay HOÀN THÀNH.
- Operator sẽ **cài v0.1.6** (`C:\circa-gr-nextwaves-v0.1.6`) trên Chrome đó để kiểm khung theo checklist PM.
  - v0.1.6 vẫn tự tạo phiên và mở tab Nextwaves khi mở phiếu: chỉ GET, không ghi.
- Lúc viết báo cáo, Claude in Chrome **chưa kết nối** (không có trình duyệt nào). Dev lấy G0 ngay khi kết nối và bổ sung báo cáo `docs/dev/G0-STG-…`.
