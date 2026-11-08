# agent.md — circa-gr-nextwaves

Đọc file này trước khi làm bất cứ việc gì trong project, rồi đọc `state.md` (trạng thái hiện tại, sự thật đã kiểm, câu hỏi mở).
Session mới phải biết mình đóng vai nào (§2) và **mặc định chỉ đọc** cho tới khi operator chỉ định là phiên giữ quyền ghi (§2.1). Claude Code đọc `CLAUDE.md`; Codex đọc `AGENTS.md` (Codex không còn vai trò, không sửa file).

## 1. Project là gì

Extension Chrome nối **ba bên** trong luồng nhập hàng của cửa hàng Circa:

1. **Buymed / thuocsi** tạo đơn giao hàng (SO, ví dụ `SOBD38468903`). Khi SO xong, Buymed đẩy toàn bộ thông tin SO sang Nextwaves.
2. **Nextwaves** tạo PO cho SO đó. Người dùng đặt sản phẩm lên bàn reader RFID để QC lần cuối: EPC / UID đọc được phải khớp SO thì PO hoàn tất.
3. **Circa POS** có phiếu nhận hàng (GR) cho cùng lô hàng. Hiện tại dược sĩ quét từng mã QR để tăng số lượng nhận.

Mục tiêu (stakeholder): trên màn GR của POS, người dùng bấm bắt đầu, extension mở đúng PO bên Nextwaves, người dùng nhận hàng bằng reader. Xong PO, Nextwaves trả về danh sách UID (chính là mã QR). Extension quay lại POS và hoàn tất GR như thể đã quét từng mã QR.

Bài toán khó nhất: từ một GR trên POS, xác định đúng PO trên Nextwaves. Xem `state.md` §3.

## 2. Vai trò (operator đổi 29/10/2026 — thay bảng 24/10)

Project chỉ còn **hai người**:

| Vai trò | Ai | Trách nhiệm |
|---|---|---|
| **Operator** | Người dùng | Vận hành trên máy thật (cài / nâng gói, chạy lượt thử, lấy dữ liệu). Quyết định nghiệp vụ, chấp nhận rủi ro. **Cho phép từng lần** mọi lượt ghi thật (staging / production) và mọi lần cài / nâng gói. Chỉ định phiên Claude Code giữ quyền ghi (§2.1) |
| **Claude Code** — đúng **một** phiên giữ quyền ghi | Kiêm PM, senior software engineer, QC / tester, audit / review | Lập plan / spec, implement, test, đột biến, kiểm trên Edge, đóng gói, tự audit, viết báo cáo, cập nhật `state.md` / `agent.md` |

- **PM Codex không còn vai trò từ 29/10.** `docs/pm/*` là lịch sử: quyết định cũ vẫn hiệu lực trừ khi bị thay. Quyết định / plan / audit mới viết ở `docs/dev/` (`PLAN-*`, `AUDIT-*`, `BATCH-*`) và tóm trong `state.md`.
- Tài liệu cũ nói "PM duyệt / PM audit" thì từ 29/10 hiểu là: Claude tự audit theo §2.2, việc chạm ghi thật hoặc đổi luật nghiệp vụ thì **operator duyệt**.

### 2.1 Một người ghi (sau sự cố 29/10: hai phiên cùng sửa một worktree)

- Chỉ **một phiên Claude Code** được sửa file, chạy git ghi (commit / push / merge / worktree), đóng gói trong repo này và worktree mã. Đó là phiên operator chỉ định **trong chính cuộc trò chuyện của phiên đó**. Tên phiên ghi ở `state.md` §0.
- **Phiên mới, phiên resume, phiên fork: mặc định CHỈ ĐỌC.** Fork / resume không thừa hưởng quyền ghi. Muốn ghi phải hỏi operator và được trả lời trong chính phiên đó.
- **Codex, công cụ khác:** không sửa file nào của project (xem `AGENTS.md`).
- **Sub-agent** do phiên ghi điều phối: chỉ đọc / review. Hoặc ghi vào bản sao riêng, rồi phiên ghi rà và nhận.
- **Không để mã sửa dở chưa commit.** Mỗi bước xong là commit lên nhánh `batch/*`. Trước khi sửa: `git status` phải sạch hoặc chỉ có thay đổi của chính mình. Thấy thay đổi lạ thì **dừng, chụp lại diff, báo operator**, không sửa đè.
- **Worktree mã ở đường dẫn cố định** `C:\QR_code\circa-gr-nextwaves-dev`, không đặt trong thư mục tạm của một phiên.

### 2.2 Nhịp làm việc mỗi batch (sửa 08/11 cho khớp cách làm thật)

Một tính năng / case đi qua các bước dưới đây. Mỗi bước để lại file trong repo, để operator, phiên Claude sau hay đội khác đọc lại được. Ví dụ đủ vết: v0.4.1 — `CASE-PHIEU-PHAN-CON-LAI-20261107.md` → `PLAN-v0.4.1.md` → nhánh `batch/v0.4.1` → `BATCH-v0.4.1.md` → `RUNBOOK-v0.4.1.md` / `THAY-DOI-v0.4.1.md` / `QA-v0.4.1-MAY-DEV.md` → `state.md` lần 70–75.

0. **Bàn, định nghĩa, phát hiện** (case mới, sự cố): `docs/dev/CASE-<tên>-<ngày>.md`.
   - Nội dung: chuyện đã xảy ra, dữ liệu thật chỉ đọc (mẫu `samples/`), tái hiện staging khi operator cho phép, danh sách vấn đề, câu hỏi cho operator.
   - Phản hồi của operator ghi lại trong chính file đó.
   - Quyết định chốt → `agent.md` §3. Luồng nghiệp vụ đổi → `docs/BUSINESS-FLOW.md`.
1. **Plan:** `docs/dev/PLAN-<batch>.md` — phạm vi, hợp đồng, gate.
   - Batch chạm ghi thật (POS / Nextwaves) hoặc đổi luật nghiệp vụ: operator đọc plan và đồng ý trước khi code.
   - Việc cần đội khác làm: `docs/dev/REQUEST-*` / `SPEC-*`, operator chuyển.
2. **Implement** trên nhánh `batch/<tên>` (worktree mã). Test cho lỗi / hàng rào mới viết **trước**, chạy trên mã cũ phải trượt. Mỗi bước xong là commit.
3. **QC:**
   - `npm test`;
   - đột biến cho mọi hàng rào mới;
   - Edge trên gói giải nén + trace hiệu năng;
   - source = ZIP: dựng lại từ `git archive` ra cùng SHA-256.

   Báo **con số thật**, không làm tròn.
4. **Review độc lập:** một sub-agent chỉ đọc, không mang kết luận của phiên chính, đọc diff.
   - Finding và cách xử lý ghi vào `BATCH-<batch>.md` (mục review) hoặc `docs/dev/AUDIT-<batch>.md`.
   - Mỗi finding đã sửa có test.
5. **Đóng gói + tài liệu giao:**
   - `BATCH-<batch>.md`: thay đổi kỹ thuật, kết quả gate.
   - `RUNBOOK-<batch>.md`: hướng dẫn vận hành.
   - `THAY-DOI-<batch>.md`: thay đổi bằng lời thường cho operator — trước / sau, dược sĩ thấy / làm gì (operator 08/11).
   - `QA-<batch>-MAY-DEV.md`: danh sách kiểm trên máy dev.
   - Thư mục giao `C:\circa-gr-nextwaves-release\v<ver>\`: ZIP + `kiem-*.js` + tài liệu + `SHA256SUMS.txt`.
6. **Máy dev → máy POS** (operator cho phép từng lần):
   - cài máy dev → QA / QC theo `QA-…-MAY-DEV.md`;
   - đạt mới cài máy POS;
   - lượt đầu mỗi máy chạy `kiem-truoc.js` / `kiem-sau.js`.
7. **Ghi thật** chỉ khi operator cho phép bằng chữ, đúng mã phiếu, đúng một lượt.
8. **Đóng batch:** lượt thật đạt → merge nhánh vào `main` (`docs/BUSINESS-FLOW.md` §6).

Mỗi bước xong: cập nhật `state.md` (mục mới nhất ở §9) trong cùng lượt làm việc.

Báo cáo tách ba mức bằng chứng: **đã kiểm từ source / gói**, **đã thấy trên môi trường thật** (staging / production), **còn thiếu** (cần operator / Nextwaves). Không gọi thiếu bằng chứng là lỗi đã xác nhận.

## 3. Quyết định đã chốt

| Ngày | Quyết định |
|---|---|
| 24/10 | Build và kiểm trên **STAGING trước**, production sau |
| 24/10 | Codebase = `C:\QR_code\circa-gr-nextwaves`, **extension riêng**, không gộp vào `circa-qr-scan-log` |
| 24/10 | Repo làm việc: `https://github.com/Kai-D13/circa-gr-nextwaves` (nhánh mặc định `main`) |
| 24/10 | **Một gói duy nhất.** Môi trường chọn trong cấu hình extension: chế độ STG / PRD hoặc nhập URL. Extension tự nhận môi trường theo trang đang mở và chỉ chạy khi khớp chế độ đã chọn |
| 24/10 | Phạm vi cửa hàng: production theo tài khoản đăng nhập; staging chỉ cửa hàng 2222 (§5) |
| 24/10 | Repo GitHub để **public**. Mẫu trong `samples/` phải bỏ token / cookie và thay tên nhân viên bằng `<nhân viên>` trước khi commit |
| 24/10 | PM (Codex) đọc và làm việc **trực tiếp trên máy local**, cùng thư mục `C:\QR_code\circa-gr-nextwaves` với dev |
| 24/10 | Máy thử staging = **laptop này** (cùng máy dev / PM) |
| 24/10 | Dùng **API thường** của Nextwaves (GET); **không** dùng `/integrations/circa/*` (Nextwaves làm extension riêng). Không gọi API ghi của Nextwaves, không bấm nút hộ dược sĩ |
| 24/10 | Ghi GR bằng **W1** (`PUT …/detail`) do extension làm; khoá nối = `thuocsi_delivery_code` (1 mã giao ↔ 1 PO POS ↔ 1 GR) |
| 24/10 | Không có nút: mở GR (hoặc `/chi-tiet-so/<SO>`) là extension tự chuyển sang `/vi/purchases/receive?po=<SO>`; không cần chế độ nhập hàng trên POS |
| 24/10 | **Dược sĩ bấm HOÀN THÀNH** trên POS; extension chỉ điền sẵn UID đã map (chế độ thủ công — vẫn giữ khi không bật tự động, xem dòng 28/10) |
| 28/10 | **Chế độ tự động (mặc định TẮT):** operator cấp **một quyền riêng cho đúng một phiên** (GR/PO/SO/cửa hàng/EPC dự kiến, 30 phút) trong popup, sau khi khớp PO Nextwaves và trước khi dược sĩ xác nhận nhận hàng. Khi đó extension tự điền (đủ UID, kế hoạch 0 chặn / 0 cảnh báo) rồi đọc lại toàn phiếu, khớp hoàn toàn mới gửi `PUT …/status/COMPLETED` **một lần**; lỗi / chưa rõ thì dừng, không tự thử lại. Thay dòng 24/10 **chỉ trong chế độ này**. Production vẫn chỉ đọc tới gate PRD. Nguồn: `docs/pm/DECISION-ONE-STG-AUTO-FLOW-20261028.md` |
| 28/10 | Kiểm từng phiên bản bằng fixture A1 / server giả / Node / Edge / trang GR đã COMPLETED chỉ đọc; **một** lượt E2E staging thật chỉ trên gói cuối (G3), operator cấp phép theo mã phiếu cụ thể |
| 30/10 | **Staging done v0.3.0** (G1–G3 đạt trên gói `45E07F60`), merge `main` `7bff255`. Hết PO staging |
| 05/11 | **Production:** một bản v0.3.1 cài một lần trên máy POS Florita rồi xử lý ngay đơn thật, đơn đầu chạy **tự động** có Net Capture. <br>• PRD được ghi, chỉ ở cửa hàng đã khai kho Nextwaves (Florita `c476efb2…` → kho `eb5e2b4f…`). <br>• Ghi vẫn chỉ khi operator cấp phép / cho phép tự động đúng phiếu. <br>• D1: lặp mã QR sau HOÀN THÀNH do máy chủ POS, chấp nhận. <br>• D2: mất phiên sau khi Nextwaves đã nhận → fail closed, làm tay. <br>• Mở thêm cửa hàng = thêm cặp cửa hàng → kho. <br>Thay dòng 24/10 "production theo tài khoản, không giới hạn cửa hàng" và phần "Production vẫn chỉ đọc" của dòng 28/10. Nguồn: `docs/dev/PLAN-PRD-FLORITA-v0.3.x-20261030.md` (sửa 05/11) |
| 06/11 | **v0.4.0 — mọi cửa hàng + tự điền.** <br>• Bỏ bảng cửa hàng → kho; kho = kho của đơn Nextwaves khớp SO + bên bán Buymed + vân tay số lượng. Không ghép theo `thuocsi_id` của POS (Lumina POS 392301 ≠ kho Nextwaves 406918). <br>• Bỏ cấp phép điền và tự HOÀN THÀNH: Nextwaves nhận xong → extension **tự điền một lần**; **dược sĩ bấm HOÀN THÀNH**. <br>• Tenant Nextwaves chọn theo máy (popup). <br>• Được tự bấm **"Kết nối đầu đọc"** của Nextwaves (ngoại lệ duy nhất của "không bấm nút hộ dược sĩ"); không bao giờ bấm "Xác nhận nhận hàng". <br>Thay dòng 28/10 (chế độ tự động) và phần cửa hàng / cấp phép của dòng 05/11. Nguồn: `docs/dev/PLAN-v0.4.0-MOI-POS-E2E.md` |
| 07/11 | **Production chỉ có hai cửa hàng: CIRCA FLORITA và CIRCA LUMINA**, cả hai tenant Nextwaves `circa` (`docs/BUSINESS-FLOW.md` §2) |
| 07/11 | **Mượn / trả đầu đọc với QR Scan Log (`circa-reader/v1`) hoãn**, làm sau. Hiện hành: dược sĩ Ngắt RFID ở tab bán hàng trước khi nhận, Kết nối lại sau. Mã phía extension giữ nguyên (không có QR Scan Log trả lời thì bỏ qua) |
| 07/11 | **Quy trình phát hành:** cài máy dev → QA / QC trên máy dev đạt → mới cài máy POS vận hành (`docs/BUSINESS-FLOW.md` §6) |
| 07/11 | **Bán gấp → POS tách phiếu là thao tác thật** (dược sĩ nhận vài món, HOÀN THÀNH để bán ngay, quay lại nhận phần còn lại trên phiếu POS tự sinh). Extension phải **hỗ trợ** phiếu phần còn lại (H2), không chỉ cảnh báo. Operator cho phép tái hiện trên staging. `docs/dev/CASE-PHIEU-PHAN-CON-LAI-20261107.md` |
| 08/11 | **Bán gấp — luật vận hành (operator):** món bán gấp **bắt buộc quét QR** trên phiếu POS rồi mới HOÀN THÀNH (operator tự đảm bảo với dược sĩ; I4 không cần extension xử lý thêm, giữ dừng an toàn). Lời báo sai lý do (I2) để sau. Trừ tồn QR Scan Log cho món bán gấp (I6): operator chấp nhận — món chưa vào kho Nextwaves thì không cần trừ |
| 08/11 | **Hướng phiếu phần còn lại = hướng 1 của operator:** POS tách phiếu; phiếu mới nối PO POS → SO → đơn Nextwaves; nhận Nextwaves **một lần** cho phần còn lại (vd 21/22) rồi điền phiếu mới. Thử staging 08/11: Nextwaves **không** sinh phiếu gửi mới cho phần thiếu (`docs/dev/CASE-PHIEU-PHAN-CON-LAI-20261107.md` §10) |
| 08/11 | **Đầu đọc bị QR Scan Log giữ: làm trong batch này** (trước đó hoãn 07/11). Mở màn quét Nextwaves (kể cả modal mở thẳng từ trang PO) khi tab POS đang giữ đầu đọc → có nút để dược sĩ biết và bấm lấy đầu đọc cho Nextwaves. Phương án chốt trong plan v0.4.1 |
| 08/11 | **Luồng chính (operator định nghĩa lại trước khi cài v0.4.1):** <br>• Dược sĩ nhập SO / bấm **"Nhận hàng bằng RFID"** trên POS → extension mở phiên nhận hàng Nextwaves → kết nối đầu đọc → dược sĩ đặt hàng lên đầu đọc, bấm "Xác nhận nhận hàng" → extension về đúng phiếu GR, điền các dòng → dược sĩ kiểm bằng mắt rồi bấm HOÀN THÀNH. <br>• Phiên chỉ mở khi dược sĩ bấm (từ v0.2): "Nhập SO thuocsi" → trang SO có khung extension với nút đó. Thay dòng 24/10 "Không có nút". <br>• **Bán gấp là ngoại lệ hiếm:** lấy món → mở GR gốc → quét QR món đó → HOÀN THÀNH. Phiếu phần còn lại đi luồng chính, thêm một bước: Nextwaves báo thiếu đúng món đã bán → "Giữ đơn mở". <br>• **Sắp có:** Nextwaves thêm `thuocsi_delivery_code` vào response đơn / phiếu nhận → bản sau mở đúng đơn PO Nextwaves theo mã giao của PO POS; thiếu trường thì tìm theo SO + số lượng như hiện nay |

Hệ quả của "một gói":
- `manifest.json` phải khai quyền cho host của **cả hai** môi trường.
- Hàng rào chống chạy nhầm môi trường nằm ở mã chứ không ở manifest. Bắt buộc có test:
  - Chế độ STG không gọi host production.
  - Chế độ PRD không gọi host staging.
  - Host lạ thì không làm gì.

## 4. Luật làm việc

- Project này **độc lập** với `C:\QR_code\circa-qr-scan-log`, nơi session khác đang build. Không sửa file nào ở đó.
  - Được đọc để học cách làm: hook XHR / fetch, phát phím vào POS, đóng gói, gate.
  - Không chép chung file. Không trộn mã hay gói.
- Trả lời operator bằng **tiếng Việt**, ngôn ngữ nghiệp vụ, ngắn gọn.
- **Bí mật:**
  - Không ghi token POS, JWT Nextwaves, cookie hay khoá API vào bất kỳ file nào: repo, mẫu, script, tài liệu, commit.
  - Token chỉ đi qua biến môi trường hoặc ô cấu hình trong extension.
  - Dữ liệu operator gửi: dùng "Copy response", không cần cURL. Nếu lỡ có token, không chép lại.
  - Không đưa file xuất Net Capture (có cookie / token thật) vào repo.
  - Trước mỗi commit, quét bí mật (§7).
- **Ghi dữ liệu thật phải được operator cho phép từng lần.** Khảo sát chỉ dùng GET:
  - POS: không PUT / POST detail, không đổi trạng thái GR.
  - Nextwaves: không receive / accept / push.
- Response thật khác giả định: **ghi lại response, không nới parser cho test xanh**. Mẫu dựng lại phải ghi rõ là dựng lại.
- Mỗi thay đổi runtime phát hành ra máy = **version mới + ZIP mới + SHA-256 mới**. Không ghi đè gói / hash đã phát hành.
- Có sự thật mới (API, trường, quyết định): cập nhật `state.md` trong cùng lượt làm việc, ghi ngày.
- Test chạy tuần tự khi RAM đủ. Không tắt process của project khác.

## 5. Môi trường

| | PRODUCTION | STAGING |
|---|---|---|
| Trang POS | `https://pos.v2.circa.vn` | `https://pos.stg.circa-v2.buymed.tech` |
| API POS (v1) | `https://api.v2.circa.vn/v1/...` (khác origin, same-site) | `https://pos.stg.circa-v2.buymed.tech/backend/v1/...` (cùng origin) |
| SSO | `sso.thuocsi.vn` | `sso.stg.buymed.tech` |
| Cửa hàng | theo tài khoản đang đăng nhập. Hiện có hai: CIRCA FLORITA `c476efb2-415c-429a-978e-d389b4b06607`, CIRCA LUMINA `31493e74-3404-4c0e-a906-93691a6ee319` (POS0012) | **chỉ "2222" `64a8663b-0c9e-49c6-9626-0a4c7c4bd53d`** |
| Nextwaves tenant | `circa` — UI `https://circa.nextwaves.app`, API `https://api-circa.nextwaves.app/api/v1` | `circa-stg` — UI `https://circa-stg.nextwaves.app`, API `https://api-circa-stg.nextwaves.app/api/v1` |
| Đối tác Buymed trên Nextwaves | `buymed` | `buymed-stag` |
| Kho Nextwaves của cửa hàng | Florita `eb5e2b4f-6f92-413b-90ef-6be1730b94c0` (410478), Lumina (406918). Từ v0.4.0 lấy từ đơn đã khớp, không khai trong mã | "CIRCA FLORITA" `82bf85e4-84e2-4158-ae27-1aaa6fe1bc57` (ghép với POS 2222) |
| Mã QR / UID | tem thật production | tem riêng của staging (đã map EPC, có tem vật lý). Mã production **không** tra được trên staging |

- Header POS gửi (từ 24/10): `authorization: Bearer <token>`, `x-client-id: 1`, `x-store-id: <pos_id>`, `grpc-timeout: 30S`.
  Staging còn có cookie `session_token` (cùng giá trị token) + `session_expires_at`.
- **Phạm vi cửa hàng:**
  - Production: extension làm việc theo phiên đăng nhập sẵn có. Tài khoản thuộc cửa hàng A thì chỉ thấy và thao tác dữ liệu cửa hàng A. Cửa hàng lấy từ phiên (`x-store-id` / `pos_id`).
    - v0.3.1 (05/11): chỉ chạy ở cửa hàng có trong bảng cửa hàng → kho Nextwaves (chỉ Florita).
    - **Từ v0.4.0:** mọi cửa hàng; kho = kho của đơn Nextwaves khớp SO.
  - Staging: chỉ bật cho POS **2222**. Phiên staging thuộc cửa hàng khác thì extension không làm gì.
- Web Nextwaves của mỗi tenant có `https://<tenant>.nextwaves.app/config.js` khai `window.__NWC_CONFIG__.NEXT_PUBLIC_API_URL`.
  Phiên Nextwaves dùng access token Bearer (JWT sống 1 giờ) + refresh token (`POST /auth/refresh`).
- Còn môi trường dev `pos.dev.circa-v2.buymed.tech`, dạng `/backend/...` giống staging. Chưa dùng.
- Bài học từ circa-qr-scan-log: mã nhận diện API viết cứng host `api.v2.circa.vn` sẽ **không** bắt được staging / dev (đường dẫn `/backend/v1/...`).
  Project này phải nhận diện API theo cấu hình môi trường: host + tiền tố đường dẫn.

## 6. Bản đồ thư mục

Hiện có (08/11). Mỗi loại file ứng với một bước ở §2.2.

| Đường dẫn | Nội dung |
|---|---|
| `CLAUDE.md`, `AGENTS.md` | Lối vào: thứ tự đọc, luật một người ghi (Claude Code / Codex tự đọc) |
| `agent.md` | File này: vai trò, nhịp làm việc (§2.2), quyết định đã chốt (§3), luật, môi trường, bản đồ, git |
| `state.md` | Trạng thái: §0 tóm tắt hiện hành + phiên giữ quyền ghi; sự thật đã kiểm, câu hỏi mở, nhật ký quyết định; **§9 việc tiếp theo — mục số lớn nhất là hiện hành** |
| `docs/BUSINESS-FLOW.md` | **Luồng nghiệp vụ hiện hành** (từ 07/11): bên liên quan, cửa hàng, luồng chính, ngoại lệ, việc làm sau, quy trình phát hành |
| `docs/dev/CASE-*` | Bước 0: định nghĩa / phát hiện một case, kèm phản hồi operator |
| `docs/dev/PLAN-*` | Bước 1: plan đã duyệt |
| `docs/dev/REQUEST-*`, `SPEC-*` | Yêu cầu / spec gửi đội khác (QR Scan Log, Nextwaves) |
| `docs/dev/BATCH-*` | Bước 3–5: thay đổi kỹ thuật, kết quả gate, review |
| `docs/dev/AUDIT-*`, `FIX-*` | Audit độc lập và phần sửa (các batch trước) |
| `docs/dev/RUNBOOK-*`, `*-HUONG-DAN*` | Hướng dẫn vận hành từng bản / từng lượt thử |
| `docs/dev/THAY-DOI-*` | Thay đổi bằng lời thường cho operator (từ v0.4.1) |
| `docs/dev/QA-*-MAY-DEV.md` | Danh sách QA / QC trên máy dev |
| `docs/dev/*KET-QUA*` | Kết quả lượt thử thật (staging / production) |
| `docs/dev/HANDOFF-DEV.md` | Mã, phiên bản / gói, lệnh kiểm thử, bẫy môi trường |
| `docs/dev/LOGIC-*`, `DESIGN-*`, `PERF-*`, `DE-XUAT-*` | Thiết kế / logic / đo hiệu năng (lịch sử, đọc khi cần) |
| `docs/pm/`, `docs/SPEC-STG-v0.1.md`, `docs/PROMPT-PM-CODEX.md` | Tài liệu PM Codex — lịch sử, tới 29/10 |
| `samples/` + `README.md` | Dữ liệu thật đã bỏ token / tên người (ghi API nguồn, SHA-256 khi có) |

Ngoài repo:
- `C:\QR_code\circa-gr-nextwaves-dev`: worktree mã.
- `C:\circa-gr-nextwaves-release\v<ver>\`: thư mục giao gói.
- `C:\circa-gr-nextwaves-v0.2.3`: thư mục extension máy dev. Giữ tên để giữ Extension ID.
- `C:\circa-gr-nextwaves` trên máy POS Florita.
- `C:\QR_code\requests\net-capture\`: Net Capture.

Mã (**trên nhánh `batch/*`**; `main` chỉ có tài liệu + mẫu, merge khi batch đóng):

```
src/                 thư mục extension (Load unpacked / nội dung ZIP)
  manifest.json      MV3; content MAIN (hook) + ISOLATED (logic) cho POS và Nextwaves
  background.js      phiên (chrome.storage.local), giành quyền ghi 1 tab, mở / chuyển tab
  lib/               logic thuần, chạy được cả Node test: env, keys, pos-model, nw-model, match, plan, apply
  pos/               pos-hook.js (MAIN, chỉ quan sát), pos-content.js (luồng POS + W1)
  nw/                nw-hook.js (MAIN, chỉ quan sát), nw-content.js (tìm / kiểm đơn, đọc kết quả nhận)
  popup/, ui/        môi trường (STG / PRD / URL) + tenant Nextwaves, xem / mở / xoá phiên; khung trạng thái Shadow DOM
tests/               node --test: lib, resolve, hook (node:vm), chạy trọn luồng trên trình duyệt giả (browser-sim.js)
scripts/pack.py      src/ → dist/circa-gr-nextwaves-v<ver>.zip + SHA-256 (8 ký tự đầu = mã gói)
scripts/mutate-*.py  đột biến có chủ đích cho các hàng rào (chạy trên bản sao tạm, không sửa src/)
scripts/edge-*.js    Edge thật trên gói giải nén (trang giả + trace hiệu năng)
scripts/kiem-*.js    dán vào Console máy POS để kiểm lượt đầu (chỉ đọc)
dist/                gói phát hành (không đưa vào git)
```

Lệnh: `npm test` (= `node --test "tests/*.test.js"`); đóng gói `python -I scripts/pack.py` (chạy ở nhánh batch).

Công cụ ngoài repo: `C:\QR_code\requests\net-capture\` (extension Net Capture ghi thao tác trên máy POS).

## 7. Git

- Repo: `https://github.com/Kai-D13/circa-gr-nextwaves` (**public**).
- **Chỉ phiên giữ quyền ghi (§2.1) commit / push.** Từ 29/10 không còn file của PM để commit hộ. Commit cũ có tiền tố `PM:` là tài liệu PM Codex nguyên văn.
- Tài liệu (`state.md`, `agent.md`, `docs/`, `samples/`) push thẳng `main`.
- **Mã** đi theo nhánh `batch/<tên>`, làm ở worktree `C:\QR_code\circa-gr-nextwaves-dev`. Chỉ merge vào `main` khi batch qua đủ gate (§2.2) và operator đồng ý (với batch đã chạy thật trên staging).
- Quét bí mật trước commit. Kết quả phải rỗng:
  `git grep -nIE "Bearer [A-Za-z0-9._=-]{20,}|eyJ[A-Za-z0-9_-]{20,}|session_token=[A-Za-z0-9]|nwc_(pk|sk)_"`
- Commit message kết thúc bằng dòng `Co-Authored-By` của Claude.
