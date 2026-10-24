# agent.md — circa-gr-nextwaves

Đọc file này trước khi làm bất cứ việc gì trong project, rồi đọc `state.md` (trạng thái hiện tại, sự thật đã kiểm, câu hỏi mở).
Session mới phải biết mình đóng vai nào (§2). Codex đọc `AGENTS.md`, Claude Code đọc `CLAUDE.md`; cả hai chỉ trỏ về file này.

## 1. Project là gì

Extension Chrome nối **ba bên** trong luồng nhập hàng của cửa hàng Circa:

1. **Buymed / thuocsi** tạo đơn giao hàng (SO, ví dụ `SOBD38468903`). Khi SO xong, Buymed đẩy toàn bộ thông tin SO sang Nextwaves.
2. **Nextwaves** tạo PO cho SO đó. Người dùng đặt sản phẩm lên bàn reader RFID để QC lần cuối: EPC / UID đọc được phải khớp SO thì PO hoàn tất.
3. **Circa POS** có phiếu nhận hàng (GR) cho cùng lô hàng. Hiện tại dược sĩ quét từng mã QR để tăng số lượng nhận.

Mục tiêu (stakeholder): trên màn GR của POS, người dùng bấm bắt đầu, extension mở đúng PO bên Nextwaves, người dùng nhận hàng bằng reader. Xong PO, Nextwaves trả về danh sách UID (chính là mã QR). Extension quay lại POS và hoàn tất GR như thể đã quét từng mã QR.

Bài toán khó nhất: từ một GR trên POS, xác định đúng PO trên Nextwaves. Xem `state.md` §3.

## 2. Vai trò (operator chốt 24/10/2026)

| Vai trò | Ai | Trách nhiệm |
|---|---|---|
| **Operator** | Người dùng | Vận hành trực tiếp, thử trên máy thật, cầu nối giữa dev-team và PM. Chuyển yêu cầu, spec, finding, dữ liệu (response / ảnh). Quyết định nghiệp vụ và chấp nhận rủi ro đi qua operator |
| **Dev-team** | Claude Code (session dev + các sub-agent Claude Code do dev điều phối) | Khảo sát kỹ thuật, implement đúng spec PM đã duyệt, viết test, đóng gói. Báo gate bằng **con số thật** của test runner, kèm DIFF và rủi ro còn mở |
| **PM** | Agent Codex | Lập plan, spec, plan implementation chi tiết; audit / review; điều phối. **PM không sửa code**, kết luận dạng P1/P2 + yêu cầu + gate |

Nhịp làm việc (theo cách đã chạy ở `circa-qr-scan-log`):

1. PM ra spec / plan cho một batch.
2. Dev implement, sau đó gửi: nhánh / PR (hoặc DIFF), danh sách file, hợp đồng thay đổi, kết quả test **nguyên văn**, rủi ro còn mở.
3. PM audit và trả finding.
4. **Chỉ sang batch kế tiếp khi PM cho qua.**
5. Việc ngoài spec: dev báo một dòng và hỏi trước, không tự mở rộng.

Báo cáo phải tách bốn mức bằng chứng: **đã kiểm từ source / gói**, **dev tự báo**, **đã thấy trên môi trường thật** (staging / production), **còn thiếu (cần operator / Nextwaves)**. Không gọi thiếu bằng chứng là lỗi đã xác nhận.

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
| 24/10 | **Dược sĩ bấm HOÀN THÀNH** trên POS; extension chỉ điền sẵn UID đã map |

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
| Cửa hàng | theo tài khoản đang đăng nhập (ví dụ CIRCA FLORITA `c476efb2-415c-429a-978e-d389b4b06607`) | **chỉ "2222" `64a8663b-0c9e-49c6-9626-0a4c7c4bd53d`** |
| Nextwaves tenant | `circa` — UI `https://circa.nextwaves.app`, API `https://api-circa.nextwaves.app/api/v1` | `circa-stg` — UI `https://circa-stg.nextwaves.app`, API `https://api-circa-stg.nextwaves.app/api/v1` |
| Đối tác Buymed trên Nextwaves | `buymed` | `buymed-stag` |
| Kho Nextwaves của cửa hàng | Florita `eb5e2b4f-6f92-413b-90ef-6be1730b94c0` | "CIRCA FLORITA" `82bf85e4-84e2-4158-ae27-1aaa6fe1bc57` (ghép với POS 2222) |
| Mã QR / UID | tem thật production | tem riêng của staging (đã map EPC, có tem vật lý). Mã production **không** tra được trên staging |

- Header POS gửi (từ 24/10): `authorization: Bearer <token>`, `x-client-id: 1`, `x-store-id: <pos_id>`, `grpc-timeout: 30S`.
  Staging còn có cookie `session_token` (cùng giá trị token) + `session_expires_at`.
- **Phạm vi cửa hàng:**
  - Production: extension làm việc theo phiên đăng nhập sẵn có. Tài khoản thuộc cửa hàng A thì chỉ thấy và thao tác dữ liệu cửa hàng A. **Không viết cứng cửa hàng nào**; lấy cửa hàng từ phiên (`x-store-id` / `pos_id`).
  - Staging: chỉ bật cho POS **2222**. Phiên staging thuộc cửa hàng khác thì extension không làm gì.
- Web Nextwaves của mỗi tenant có `https://<tenant>.nextwaves.app/config.js` khai `window.__NWC_CONFIG__.NEXT_PUBLIC_API_URL`.
  Phiên Nextwaves dùng access token Bearer (JWT sống 1 giờ) + refresh token (`POST /auth/refresh`).
- Còn môi trường dev `pos.dev.circa-v2.buymed.tech`, dạng `/backend/...` giống staging. Chưa dùng.
- Bài học từ circa-qr-scan-log: mã nhận diện API viết cứng host `api.v2.circa.vn` sẽ **không** bắt được staging / dev (đường dẫn `/backend/v1/...`).
  Project này phải nhận diện API theo cấu hình môi trường: host + tiền tố đường dẫn.

## 6. Bản đồ thư mục

Hiện có (24/10):

| Đường dẫn | Nội dung |
|---|---|
| `agent.md` | File này: vai trò, quyết định, luật, môi trường |
| `state.md` | Trạng thái, sự thật đã kiểm, khác biệt stg / prd, câu hỏi mở, việc tiếp theo |
| `AGENTS.md`, `CLAUDE.md` | Trỏ về `agent.md` + `state.md` (Codex / Claude Code tự đọc) |
| `docs/PROMPT-PM-CODEX.md` | Prompt mở session PM (Codex) |
| `docs/SPEC-STG-v0.1.md` | Spec staging v0.1 của PM (đề xuất) |
| `docs/dev/` | Báo cáo / phản hồi của dev gửi PM: `DEV-REVIEW-SPEC-STG-v0.1.md`, `LOGIC-v0.3.md` (logic hiện hành), `BATCH-v0.1-STG.md` (batch đầu, chờ audit) |
| `samples/README.md` | Danh sách mẫu: môi trường, API nguồn, ghi chú |
| `samples/gr-stg-GR03878-20261024.json`, `samples/po-stg-PO00006750-SOBD1593858.json` | Cặp staging **có SO** 1593858 (đề xuất làm cặp thử chính) |
| `samples/nw-stg-po-PO28237814-detail.json` | PO Nextwaves staging dạng chi tiết (`GET /purchase-orders/<id>`), chưa nhận |
| `samples/gr-prod-GR83174-20261024.json` | GR production (WAITING_TO_RECEIVE, 10 dòng), không token |
| `samples/gr-stg-GR03877-20261023.json` | GR staging (WAITING_TO_RECEIVE, 3 dòng), không token |
| `samples/po-prod-PO01970951-SOBD38468903.json` | PO production của SO 38468903 (có `thuocsi_delivery_code`, `goods_receipts`) |
| `samples/nw-stg-intertenant-PO28237814-SOBD1593858.json` | Inter-tenant order Nextwaves staging, ghép với GR03877 (12 UID dự kiến, chưa nhận), không token |

Mã (từ 24/10, **trên nhánh `batch/*`**, chưa có ở `main` cho tới khi PM duyệt; batch đầu `batch/v0.1-staging`, báo cáo `docs/dev/BATCH-v0.1-STG.md`):

```
src/                 thư mục extension (Load unpacked / nội dung ZIP)
  manifest.json      MV3; content MAIN (hook) + ISOLATED (logic) cho POS và Nextwaves
  background.js      phiên (chrome.storage.local), giành quyền ghi 1 tab, mở / chuyển tab
  lib/               logic thuần, chạy được cả Node test: env, keys, pos-model, nw-model, match, plan, apply
  pos/               pos-hook.js (MAIN, chỉ quan sát), pos-content.js (luồng POS + W1)
  nw/                nw-hook.js (MAIN, chỉ quan sát), nw-content.js (tìm / kiểm đơn, đọc kết quả nhận)
  popup/, ui/        cấu hình môi trường + cấp phép điền từng lần; khung trạng thái Shadow DOM
tests/               node --test: lib, resolve, hook (node:vm), chạy trọn luồng trên trình duyệt giả (browser-sim.js)
scripts/pack.py      src/ → dist/circa-gr-nextwaves-v<ver>.zip + SHA-256 (8 ký tự đầu = mã gói)
scripts/mutate-*.py  đột biến có chủ đích cho các hàng rào (chạy trên bản sao tạm, không sửa src/)
dist/                gói phát hành (không đưa vào git); bản giải nén để cài: C:\circa-gr-nextwaves-v<ver>
```

Lệnh: `npm test` (= `node --test "tests/*.test.js"`); đóng gói `python -I scripts/pack.py` (chạy ở nhánh batch).

Công cụ ngoài repo: `C:\QR_code\requests\net-capture\` (extension Net Capture ghi thao tác trên máy POS).

## 7. Git

- Repo: `https://github.com/Kai-D13/circa-gr-nextwaves` (**public**).
- **PM và dev làm chung một thư mục local**, nên phải tránh sửa đè nhau:
  - **PM** viết `docs/SPEC-*.md`, `docs/pm/*`, và có thể thêm dòng vào `state.md`.
  - **Dev** viết mã, `tests/`, `scripts/`, `samples/`, `docs/dev/*`, và cập nhật `state.md` / `agent.md`.
  - Không sửa file của bên kia. Thấy sai thì phản hồi bằng file của mình.
  - Trước khi sửa `state.md`, chạy `git diff` để thấy phần bên kia vừa thêm.
  - Dev commit file của PM **nguyên trạng**, trong commit riêng có tiền tố `PM:`.
- Tài liệu (`state.md`, `agent.md`, `docs/`, `samples/`) push thẳng `main`. **Mã** đi theo nhánh `batch/<tên>`, PM audit xong mới merge.
- Đề xuất quy trình nhánh (chờ PM / operator chốt):
  - Mỗi batch một nhánh `batch/<tên>` và một PR để PM audit.
  - Operator merge vào `main` khi PM cho qua.
  - Không push thẳng `main` sau commit khởi tạo.
- Quét bí mật trước commit. Kết quả phải rỗng:
  `git grep -nIE "Bearer [A-Za-z0-9._=-]{20,}|eyJ[A-Za-z0-9_-]{20,}|session_token=[A-Za-z0-9]|nwc_(pk|sk)_"`
- Commit message kết thúc bằng dòng `Co-Authored-By` của Claude.
