# Bàn giao dev-team — circa-gr-nextwaves (cập nhật 27/10/2026)

Đọc theo thứ tự: `agent.md` (vai trò, luật, môi trường) → `state.md` (§0 tóm tắt, §8 nhật ký, §9 mục hiện hành) → **file này** → báo cáo PM mới nhất trong `docs/pm/`.
File này giữ đủ ngữ cảnh để session dev mới làm tiếp không cần lịch sử chat.

## 1. Dự án và vai trò

- **Một tính năng:**
  1. Dược sĩ mở GR trên POS Circa (hoặc trang "Nhập SO thuocsi" `/chi-tiet-so/<SO>`).
  2. Extension đi GR → PO POS → `thuocsi_delivery_code` → SO gốc, rồi mở màn quét Nextwaves `/vi/purchases/receive?po=<SO>`.
  3. Dược sĩ đặt hàng lên reader và bấm "Xác nhận nhận hàng" (web Nextwaves gọi `POST /inter-tenant-shipments/<id>/receive-scan`).
  4. Extension đọc kết quả nhận, quay về POS và **điền UID vào GR** bằng W1 (`PUT …/item/<i>/detail/<d>`). Dược sĩ tự bấm HOÀN THÀNH.
- **Vai trò:**
  - Operator: người dùng, cầu nối.
  - **Dev-team:** Claude Code (session này), build, test, đóng gói.
  - PM: Codex; spec / audit, không sửa mã. Làm việc trên cùng thư mục local.
- **v0.2 (đang audit):** chỉ tạo phiên khi dược sĩ **bấm** nút "Nhận hàng bằng RFID" (trên từng dòng danh sách `/danh-sach-phieu-nhan-hang`, trong khung trang phiếu, hoặc ở `/chi-tiet-so`). Mở phiếu không còn tự chạy. Spec hiệu lực: `docs/dev/BATCH-v0.2.0.md` §1.
- **Repo:** https://github.com/Kai-D13/circa-gr-nextwaves (public). Tài liệu push thẳng `main`.
  - `main` có mã v0.1.5 (merge `aa42dcc`, sau gate T3/W1).
  - v0.1.6 ở nhánh `batch/v0.1.6-ui`; v0.2.0 ở nhánh `batch/v0.2-rfid` (tách từ `b4017d7`). Chưa merge, chờ PM.
- **Quy ước commit:**
  - File PM viết: commit nguyên trạng, tiền tố `PM:`.
  - File dev viết: tiền tố `Dev:` (tài liệu) hoặc mô tả mã.
  - Kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Trước khi sửa `state.md`, chạy `git diff` xem PM vừa thêm gì. PM thường để thay đổi chưa commit: commit giúp PM trước khi chuyển nhánh.
- **Bí mật:**
  - Không ghi token / Authorization / cookie vào file nào.
  - Trước mỗi commit chạy quét bí mật (`agent.md` §7) và quét tên nhân viên (repo public).
  - Operator chỉ gửi "Copy response", không gửi cURL.
- **Ghi thật:**
  - POS: ghi chỉ khi operator cho phép từng lần.
  - Nextwaves: không gọi API ghi, không `/integrations/circa/*`, không bấm nút hộ dược sĩ.

## 2. Định danh thử (staging)

| | |
|---|---|
| POS | `https://pos.stg.circa-v2.buymed.tech` (API cùng origin `/backend/v1/…`), cửa hàng 2222 `64a8663b-0c9e-49c6-9626-0a4c7c4bd53d` |
| Nextwaves | UI `https://circa-stg.nextwaves.app`, API `https://api-circa-stg.nextwaves.app/api/v1`, bên bán `buymed-stag`, kho `82bf85e4-84e2-4158-ae27-1aaa6fe1bc57` |
| GR03878 | `2de6c0ec-2ea8-4038-8616-659fa3f5820a`; PO POS PO00006750 `f7678788-28e2-47bf-b5c6-a8e10a223f7d`; mã giao `SOBD1593858-F` → SO `SOBD1593858` |
| Đơn Nextwaves | PO28237814 `55bd221f-65de-4a4d-8a77-40c568a6f176`; order `f930f66d-679a-4ed8-9c8e-b48aea91a8be`; refId `SOBD1593858-1056745`; phiếu gửi `34e67fb9-ea76-4606-ab65-4c515934c0e1`; 12 UID, 6 lô |
| K1 | 24/10: PO28237814 nhận bị `400 … tagged_unit_unsupported`. **25/10 23:46: Nextwaves đã sửa** — `receive-scan` 200, 12/12, biên nhận PO GRN96438872 `7bec38d2…` (`docs/dev/T3-KET-QUA-PO28237814-20261025.md`) |
| Production | Chỉ đọc (`PRD.writeEnabled=false`). Bảng kho mới có Florita `c476efb2…` → `eb5e2b4f…` |

## 3. Mã (v0.1.5 trên `main`; phần v0.2.0 ghi chú ở cuối bảng)

| File | Vai trò |
|---|---|
| `src/manifest.json` | MV3. MAIN world: `main/env.js` + hook. ISOLATED world: `lib/env.js` + thư viện + content script. **Không khai một file ở hai mục cùng khớp một trang** (trình duyệt chỉ nạp một lần, mục trước thắng; lỗi T1 lần 1) |
| `src/lib/env.js` = `src/main/env.js` | Môi trường, nhận dạng URL, dựng URL API. **Hai file phải giống từng byte** (test bắt). Sửa một thì chép sang file kia |
| `src/lib/keys.js`, `pos-model.js`, `nw-model.js`, `match.js`, `resolve.js`, `plan.js`, `apply.js` | Logic thuần, test được trong Node. `resolve.js`: chọn đơn Nextwaves (P1.1). `pos-model.checkSoGrs / soWriteLock`: tìm GR theo SO (P1.6). `plan.js`: kế hoạch W1, đối chiếu cả UID đã có (P1.2), mã kế hoạch FNV. `apply.js`: so toàn phiếu trước / sau mỗi PUT, `beforePut` kiểm lease (P2.3 / P1.5) |
| `src/pos/pos-hook.js`, `src/nw/nw-hook.js` | MAIN world, chỉ quan sát: header app gửi (auth, x-store-id, grpc-timeout), PUT status GR, POST receive-scan |
| `src/pos/pos-content.js` | Hai đường vào; cửa hàng bắt buộc (P1.4); khoá SO (P1.6 / P3); tra QR mọi UID; nút điền chỉ khi có cấp phép, mang mã kế hoạch; lease; chống vòng lặp tạo phiên (`restartGuardMs`) |
| `src/nw/nw-content.js` | Tìm / khớp đơn qua `resolve.js` → `session:nwMatched` (một lần); chuyển về POS chỉ sau lượt 2xx + biên nhận mới (P2.1) |
| `src/background.js` | Phiên (`SESSION_SCHEMA=1`), cấp phép một lần / một GR / 30 phút (chỉ popup), `claimApply` / `renewLease` / `finishApply`, kiểm nguồn gửi (P1.7), `session:update` chỉ đổi `state`, `onInstalled` dọn phiên cũ (P2.4) |
| `src/popup/*`, `src/ui/panel.js` | Popup: môi trường + cấp phép từng lần + danh sách phiên. Khung Shadow DOM (closed) |
| **v0.2.0** `src/pos/gr-list.js` (mới) | Chỉ DOM: nút `button.cgn-rfid-btn` trên dòng danh sách, MutationObserver (chờ yên 250 ms, tối đa 1 s), `rowValid`, `stats()` |
| **v0.2.0** `pos-hook.js` / `pos-content.js` / `background.js` | Hook bắt response danh sách của trang (R1 `reqSeq` lúc gửi) + route. Content: `startFromGr` một hàm cho mọi lối vào, `clickToken` / `stillValid` (R2), header S3, cache QR S6. Background tự dựng `returnUrl` (S4), `scanAt` |

## 4. Phiên bản và gói (không ghi đè gói đã có)

| Bản | Mã gói | Commit runtime | Ghi chú |
|---|---|---|---|
| v0.1.0 | FF5CD95B | a08d541 | PM trả 5 P1 |
| v0.1.1 | D8CD9AFD | d124453 | PM trả P1.6, P1.7 |
| v0.1.2 | 525BCE84 | 6eeb3c0 (đầu `5d117d2`) | PM đạt P1.6 / P1.7; thêm P2.4 |
| v0.1.3 | DF493307 | 761d734 | chỉ dựng nội bộ, không giao |
| v0.1.4 | 10A29BC4 | 91e3bd1 (đầu `49bf0a4`) | PM đạt P2.4; **T1 lần 1 lỗi `envFromConfig`** (mọi bản ≤ 0.1.4 dính) |
| **v0.1.5** | **CDD02C3D** | **456205a** (đầu nhánh `fa66de6`; **đã merge vào `main` `aa42dcc`** 26/10) | Sửa nạp `env.js`; **PM đạt** (`docs/pm/AUDIT-T1-FIX-v0.1.5-STG-20261025.md`); **T1 lần 2 trên phiên thật**: PM đóng gate. `0b9aeb3` mẫu T1, `afd98d5` mẫu T3 + test, `25082b2` mẫu chạy trọn luồng GR03880 + test, `7eadfe3` sửa test chạy đua, `fa66de6` request receive-scan từ HAR (không đổi `src/`) |
| v0.1.6 | 34B4AE1A | b4017d7 (nhánh `batch/v0.1.6-ui`) | Khung không che nút trang (POS HOÀN THÀNH / Hủy, NW Xác nhận nhận hàng) + thu nhỏ gọn; `docs/dev/FIX-UI-v0.1.6.md`; PM đạt gate source / gói (`AUDIT-UI-v0.1.6-SOURCE-PACK`); **chờ ảnh UI chỉ đọc trên trang thật** |
| **v0.2.2** | **AB96179D** | **a1975f1** (nhánh `batch/v0.2-rfid`) | G0 trang thật 27/10 (chỉ đọc, trình duyệt trong app): F1 nút danh sách 24px; F2 khung đặt lại khi cuộn; edge-check dựng theo DOM thật (25 mục); `docs/dev/BATCH-v0.2.2-G0.md`; **chờ PM audit; chưa cài** |
| v0.2.1 | E34FF7C5 | cbac491 (nhánh `batch/v0.2-rfid`) | Sửa PM audit v0.2.0: P2.1 hook chỉ gửi lại lượt danh sách mới nhất; P2.2 mỗi lượt quét nút < 2 ms kể cả lúc tải trang (chia lát, làm ấm, một bộ nghe capture); `docs/dev/BATCH-v0.2.1.md`; **chờ PM audit lại + G0 thật; chưa cài** |
| v0.2.0 | 096D97D9 | ef67a7b (đầu nhánh `682c509`, chỉ thêm test) | Nút danh sách GR + chỉ tạo phiên khi bấm + sửa lỗi tồn + hiệu năng; `docs/dev/BATCH-v0.2.0.md`; **chờ PM audit G1 / G2 + G0 trang thật; chưa cài** |

- Bản giải nén để cài: `C:\circa-gr-nextwaves-v0.1.x` (đối chiếu từng file với `src/` của commit).
- ZIP: `dist/` (không vào git).
- Mỗi thay đổi runtime ⇒ version mới + ZIP mới + SHA-256 mới.

## 5. Báo cáo theo thứ tự

- **PM:**
  - `docs/pm/AUDIT-BATCH-v0.1-STG-20261024.md`
  - `AUDIT-v0.1.1-STG-20261024.md`
  - `AUDIT-v0.1.2-STG-20261024.md`
  - `AUDIT-v0.1.4-STG-20261025.md`
  - `AUDIT-T1-FIX-v0.1.5-STG-20261025.md`
- **Dev:**
  - `docs/dev/BATCH-v0.1-STG.md`
  - `FIX-AUDIT-BATCH-v0.1-STG.md`
  - `FIX-AUDIT-v0.1.1-STG.md`
  - `FIX-AUDIT-v0.1.2-STG.md`
  - `FIX-T1-v0.1.5.md`
  - `T1-STG-HUONG-DAN.md` (hướng dẫn operator)
  - `T1-KET-QUA-v0.1.5-20261025.md` (T1 lần 2, PM đóng gate)
  - `K1-LOI-STG-HUONG-DAN.md` (hướng dẫn thử nhánh lỗi K1 — một lượt ghi Nextwaves, operator tự quyết). Thực tế 25/10 23:46: nhận 200 (K1 đã sửa), xem `state.md` lần 21
  - `FULL-STG-HUONG-DAN.md` (chạy trọn luồng T1 → T3 → W1 → HOÀN THÀNH trên SO mới, Net Capture tab POS từ đầu đến cuối)
  - `FULL-KET-QUA-GR03880-20261026.md` (lần 1: W1 5 PUT khớp kế hoạch #E33C777A; POS thêm mã QR khi HOÀN THÀNH)
  - Công cụ đọc Net Capture (không đọc header / token): mẫu script `cap-list.py`, `w1-check.py`, `full-samples.py` nằm ở scratchpad session dev; dựng lại nếu cần. Nguyên tắc: chỉ đọc `meta.json` (url / method / status / startedAt) + body; không mở `tokens.json` / `cookies.json` / `storage.json` / HAR
  - `T3-KET-QUA-PO28237814-20261025.md` (T3 thật: mẫu, P2.1 trên dữ liệu thật, kế hoạch #60070071 khớp khung thật, O1–O3 cho PM)
  - `FIX-UI-v0.1.6.md` (khung tránh nút trang)
  - `PLAN-v0.2-RFID-BUTTON-PROD.md` (kế hoạch v0.2 + Spec Đợt 1 rev 1 / rev 2)
  - `BATCH-v0.2.0.md` (spec hiệu lực, diff, test, đột biến, Edge, hiệu năng, G0 còn thiếu, cài đặt)
- **PM (v0.1.6 / v0.2):** `AUDIT-T3-W1-FULL-STG`, `REVIEW-UI-v0.1.6-PRELIM`, `AUDIT-UI-v0.1.6-SOURCE-PACK`, `REVIEW-PLAN-v0.2-RFID-BUTTON-PROD`, `REVIEW-PLAN-v0.2-REV1`, `CORRECTION-G0-v0.2` (tất cả trong `docs/pm/`, hậu tố ngày 20261026).
- **Logic gốc:** `docs/dev/LOGIC-v0.3.md`.

## 6. Kiểm thử và công cụ (chạy trên nhánh batch)

| Lệnh | Nội dung |
|---|---|
| `npm test` | **100 test trên `main`** (nhánh `batch/v0.1.6-ui`: 106, thêm `panel.test.js` 6) (`node --test --test-timeout=60000`): env-keys 7, hooks 5, manifest 3, models 15, plan-apply 19, resolve 8, runtime 29, t1-real 2 (response T1 thật), t3-real 5 (lượt nhận thật 25/10), full-real 7 (lượt trọn luồng GR03880 26/10: tra QR, 5 PUT, HOÀN THÀNH, storage — toàn bộ phía POS là dữ liệu thật). Chạy ~10 s. Cặp GR03878 còn dựng lại 10/12 kết quả tra QR POS |
| `python -I scripts/mutate-v0.1.5.py [từ_ca]` | 60 đột biến (nhánh v0.1.6: `mutate-v0.1.6.py` 65 ca = 60 + 5 ca khung), chép sang thư mục tạm, ~45 phút. **Chạy một mình**: không chạy stress / test khác đè lên. Ca "bị bắt vì hết giờ 240 s" **không phải bằng chứng**, phải tìm nguyên nhân treo |
| `node scripts/edge-check.js <thư mục cài>` | Edge / Chrome **thật** (hồ sơ tạm, không đăng nhập). Kiểm 2 world trên Nextwaves; đường POS GR03878 với CDP Fetch trả `samples/`; phiên; tab Nextwaves; không token. v0.1.5: 9/9. Nhánh v0.1.6: thêm 3 mục bố cục (trang POS giả có nút HOÀN THÀNH góc dưới phải) → 12 mục; v0.1.6 12/12, v0.1.5 2/12 |
| **Nhánh `batch/v0.2-rfid` (v0.2.2)** | `npm test` **133** (`v02.test.js` 20 ca: danh sách, R1, R2, S3, S4, hết giờ GET, hook thật → content nạp muộn). `python -I scripts/mutate-v0.2.2.py` **96 ca**. `node scripts/edge-check.js` **25 mục**, trang dựng từ mẫu thật G0 27/10 (`samples/*-20261027.*`): danh sách 20 dòng thật (body ~76 KB); thanh HỦY / HOÀN THÀNH thật; màn quét Nextwaves cấu trúc thật (modal, thân cuộn); khung ở 1366×768 / 1440×900; mỗi lượt quét < 2 ms; trace CDP toàn bộ tác vụ (dòng "ĐO", `CGN_TRACE_OUT=<file>`); không tác vụ ≥ 50 ms. `node scripts/mutate-edge-v0.2.2.js`: 6 đột biến DOM (gr-list + panel) trên Edge thật (~10 phút). `node scripts/bench-gr-list.js <gr-list.js> [lần] [dòng]`: đo `gr-list.js` ngoài extension, so bản cũ / mới. `tests/helpers.js` có `loadHook` (hook MAIN world thật trong `node:vm`). Bẫy: R2 phải huỷ **trước** hạn hết giờ GET 2 s của trình duyệt giả, nếu không hết giờ che mất ca thiếu kiểm; số đo ms trên máy đang bận dao động — chạy nhiều lần, ghi cả lần đối chứng bản cũ cùng buổi |
| `node scripts/edge-upgrade-check.js <bản cũ> <bản mới>` | Nâng cấp giữ cùng extension ID (P2.4) trên Edge thật |
| `python -I scripts/pack.py` | `src/` → `dist/*.zip` + SHA-256 (8 ký tự đầu = mã gói); tái lập được từ checkout sạch |

**Trình duyệt giả `tests/browser-sim.js`** chạy `background.js` và content script thật trong `node:vm`. Các luật đã học (đừng phá):
1. Nạp content script như Chrome: theo thứ tự manifest, một file một lần mỗi trang.
2. `fetch` và message tới background trả về ở **macrotask**.
3. Ngữ cảnh đã chết (tải lại / điều hướng) không vẽ khung, `fetch` không trả về.
4. `afterEach(closeAll)`: test bị cắt vì quá giờ vẫn đóng được trình duyệt giả.
5. Sau `close()`: không mở tab, không tạo timer, không chuyển message.
6. `window` trong vm là global proxy, nên `event.source` = `vm.runInContext("globalThis")`.

**Trước mỗi lần giao bản:**
1. `npm test` nhiều lần.
2. Chạy đột biến (một mình).
3. `edge-check.js` cho bản mới, kèm bản cũ làm đối chứng nếu sửa lỗi.
4. `pack.py`, rồi giải nén ra `C:\circa-gr-nextwaves-v<ver>`.
5. Dựng lại từ worktree sạch để kiểm hash.
6. Quét bí mật và tên nhân viên.
7. Viết báo cáo `docs/dev/…` kèm test nguyên văn.
8. Cập nhật `state.md`.

## 7. Bẫy môi trường (máy này)

- **Heredoc bash nuốt `\`:** viết script / regex bằng công cụ Write (thư mục scratchpad) hoặc `chr(92)` trong Python.
- `sed -i` của Git Bash đổi CRLF. Repo dùng LF (`.gitattributes`).
- Python cần `-I` và `sys.stdout.reconfigure(encoding="utf-8")`. Máy PM **không có Python** nhưng có `node`.
- Edge: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`. Chrome 156 bản thường không nhận `--load-extension`; Edge cần `--disable-features=DisableLoadExtensionCommandLineSwitch`.
- Sau khi chạy Edge / đột biến: kiểm tiến trình còn sót (`msedge.exe` theo hồ sơ tạm, `node --test`).

## 8. Trạng thái và việc tiếp theo

0. **Hiện hành (27/10):**
   - v0.2.0 (`096D97D9`) PM audit 27/10 (`docs/pm/AUDIT-v0.2.0-SOURCE-PACK-20261027.md`): P2.1 replay danh sách, P2.2 ngưỡng lúc tải trang. Dev sửa → **v0.2.1** (gói `E34FF7C5`, `cbac491`, giải nén `C:\circa-gr-nextwaves-v0.2.1`), báo cáo `docs/dev/BATCH-v0.2.1.md`. **Chưa cài**, chưa nhận / ghi staging bằng v0.2.
   - PM audit v0.2.1 (`docs/pm/AUDIT-v0.2.1-SOURCE-PACK-20261027.md`): G1 / G2 đạt, G0 còn chờ.
   - **G0 đã lấy 27/10** (`docs/dev/BATCH-v0.2.2-G0.md`). Claude in Chrome không kết nối, nên lấy trong **trình duyệt của app** (pane Browser).
     - Operator **tự đăng nhập** POS / Nextwaves staging. Dev chỉ đọc; có thể chạy `gr-list.js` nguyên văn trong trang để thử đặt nút / click / đo (cục bộ, không ghi server).
     - Pane bị ẩn thì operator không thấy trang đăng nhập: gọi `show_pane` (preview) trước khi nhờ đăng nhập.
     - Khung nhìn giả lập (`resize_window`) bị xoá khi pane đổi rộng: đặt lại ngay trước khi đo.
     - Body response không đưa nguyên ra ngoài: rút gọn / đo trong trang.
   - Từ G0 ra **v0.2.2** (`a1975f1`, gói `AB96179D`): nút danh sách 24px; khung đặt lại khi cuộn. Edge dựng theo DOM thật 25 mục.
   - Còn: ảnh khung với extension cài thật (pane không nạp được extension); chờ PM quyết bằng chứng tương đương.
   - **Đợt 2** (spec riêng): O1, mã QR POS thêm sau HOÀN THÀNH, xung đột reader trên máy Florita, PRD Florita chỉ đọc → W1-PRD.
1. **T1 lần 2 (25/10) đã chạy với v0.1.5, dev đánh giá đạt:** `docs/dev/T1-KET-QUA-v0.1.5-20261025.md`.
   - Response thật lưu ở `samples/*-T1-20261025.json`, test `tests/t1-real.test.js` (nhánh `0b9aeb3`).
   - Ảnh popup bước 3.8 đã gửi bổ sung. **PM đóng gate T1** (`docs/pm/AUDIT-T1-LIVE-v0.1.5-STG-20261025.md`, state lần 20).
   - Operator giữ SO hiện tại. PO28237814 dùng được cho **một phép thử nhánh lỗi K1** (một lượt ghi Nextwaves có phép riêng): extension phải không chuyển sang điền POS; kiểm shipment / `/receiving` trước và sau vì Nextwaves có thể chấp nhận phiếu gửi trước khi báo 400. 400 không đạt T3.
2. **Cách xử lý mỗi lần nhận response thật từ operator:**
   - đối chiếu khung / phiên với response (khoá `so_gr_unknown` / `so_many_gr` / `nw_many_orders`, dòng "Tìm theo … total …");
   - lưu vào `samples/` (bỏ token, thay tên nhân viên bằng `<nhân viên>`, CRLF → LF, ghi `samples/README.md` kèm sha256 bản gốc);
   - nếu response khác giả định: **ghi lại response, không nới parser**; thêm test theo mẫu thật;
   - báo PM.
3. **K1 / T3 (25/10 23:46, PO28237814):** K1 đã được Nextwaves sửa; `receive-scan` 200 12/12.
   - Mẫu thật (Nextwaves trước / sau nhận) và 6 test T3 ở nhánh `afd98d5`; 93/93, đột biến 60/60. Báo cáo: `docs/dev/T3-KET-QUA-PO28237814-20261025.md`, chờ PM audit.
   - P2.1 khớp dữ liệu thật. Mã kế hoạch tính lại #60070071 trùng khung POS thật.
   - Sau khi nhận, tìm theo SO trả total 0. Phiên mất trong khoảng "Nextwaves đã nhận → POS chưa điền" thì không điền tự động được (O1, fail closed).
   - Gấp: phiên GR03878 (cùng nhật ký lượt điền) bị xoá khi quá 24 giờ không cập nhật, từ khoảng 23:49 ngày 26/10. Operator cần export storage trước đó.
4. **W1:** operator đã tự cấp phép và điền GR03878 lúc 23:4x ngày 25/10 (trước gate PM), nhưng không có traffic POS.
   - Bằng chứng W1 lấy từ lượt `FULL-STG-HUONG-DAN.md` trên SO mới: request / response PUT, GET GR trước / sau điền / sau HOÀN THÀNH, tra QR thật.
   - Khi có, thay nốt `qrByUidPO28237814()` dựng lại.
5. **Merge `batch/v0.1-staging` → `main`:** chỉ sau gate W1 và PM đồng ý.
6. **Còn mở về thiết kế:**
   - tìm đơn Nextwaves và tìm GR chỉ fail closed ở một trang (chưa phân trang);
   - nhận thiếu thì không điền phần đã nhận (chờ stakeholder);
   - R12: Web Serial giành cổng với circa-qr-scan-log trên POS production;
   - PRD chưa nghiệm thu.
