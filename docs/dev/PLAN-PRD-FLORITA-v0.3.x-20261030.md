# Kế hoạch production Florita — từ staging done v0.3.0 tới pilot (30/10/2026)

**Căn cứ:**
- staging done v0.3.0: G1–G3 đạt trên gói `45E07F60`, `main` `7bff255` (`docs/dev/KET-QUA-G2-G3-v0.3.0.md`);
- plan cũ + PM review 27/10 (`docs/dev/PLAN-STG-DONE-PRD-20261027.md`, `docs/pm/REVIEW-PLAN-STG-DONE-PRD-20261027.md`) — các yêu cầu P1 của PM cho production vẫn giữ;
- khảo sát Đợt 2 (`docs/dev/DOT2-KHAO-SAT-20261028.md`).

**Không có ngày cố định.** Mỗi bước chỉ bắt đầu khi bước trước đạt. Ghi production chỉ khi operator cho phép bằng chữ, từng GR.

## 0. Hiện trạng

| Hạng mục | Trạng thái |
|---|---|
| Luồng staging (nút → Nextwaves → nhận → điền → HOÀN THÀNH, thủ công và tự động) | **Đạt** (A1 28/10, G3 30/10) |
| PO staging còn lại | **Hết** (operator 30/10). Không còn E2E staging; thay đổi sau chỉ kiểm offline + chỉ đọc trên trang thật |
| Cấu hình PRD trong mã (`src/lib/env.js`) | `writeEnabled: false`; `storeAllowlist: null` (mọi cửa hàng); `warehouseByStore` chỉ có Florita `c476efb2… → eb5e2b4f…` |
| Extension đã từng chạy trên production? | **Chưa.** Đường dẫn API PRD trong mã khớp capture production 19/10 (`api.v2.circa.vn/v1/order/goods-receipt/…`, `pos.v2.circa.vn/thuocsi-warehouse/qrcode`), nhưng chưa có lượt nào gọi thật |
| Finding mở từ G3 | G3-1 P2, G3-2 P2, G3-3 P3, G3-4 P3, G3-5 P3 |

**Sự thật mới (G3 lượt 2, 30/10) về mã QR sau HOÀN THÀNH:**
- Ngay trong response của `PUT status/COMPLETED` (lệnh không có body, giống nút HOÀN THÀNH của trang), mỗi detail đã có **mỗi UID 2 lần** + **1 mã mới**. Ví dụ 5451: 4 UID → 9 mã (5 mã khác nhau).
- GR03880 (26/10) và GR03887 (28/10), dược sĩ bấm HOÀN THÀNH trên trang, chỉ có +1 mã, **không lặp**.
- Production 19/10 (quét QR tay, không extension) cũng lặp mỗi mã 2 lần.
- Sau COMPLETED, GR03929 có phiếu PUT, còn GR03880 / GR03887 thì không.

⇒ Lặp mã là **phía máy chủ POS** lúc hoàn tất. Nhiều khả năng đi cùng việc tự tạo phiếu PUT (Florita bật `is_auto_put`), có thể staging vừa đổi cấu hình. Extension không gây ra, cũng không đọc lại danh sách mã sau COMPLETED.

## 1. Nguyên tắc

1. **Lõi ghi giữ nguyên từng byte** so với gói `45E07F60` (`src/` = `4b79c58`). Lõi gồm:
   - `src/background.js`;
   - `src/lib/plan.js`, `apply.js`, `nw-model.js`, `pos-model.js`, `match.js`, `resolve.js`, `keys.js`;
   - `src/nw/*`, `src/main/*` (trừ bản sao `env.js`).

   Gate đầu tiên của mọi bản: `git diff 4b79c58 -- <lõi>` phải trống. Lõi cần sửa ⇒ dừng, báo operator. Không có PO staging để kiểm lại lõi.
2. Chỉ đổi: cấu hình PRD (`env.js` + bản sao `main/env.js`), phần **hiển thị** của popup / khung POS, script kiểm, tài liệu.
3. Mỗi bản: version mới + ZIP + SHA-256. Kiểm offline đủ: test, đột biến phần đổi, Edge trên bản giải nén, audit độc lập bằng sub-agent.
4. Production: bật ghi bằng **một bản riêng chỉ đổi một dòng** (`writeEnabled`), sau khi lượt chỉ đọc đạt.

## 2. Hai bản phát hành

### v0.3.1 — production CHỈ ĐỌC + sửa finding G3

| # | Việc | File |
|---|---|---|
| R1 | PRD `storeAllowlist: ["c476efb2-415c-429a-978e-d389b4b06607"]` (chỉ Florita). `writeEnabled` vẫn `false`. Lý do: kho Nextwaves chỉ ánh xạ cho Florita. Mở thêm cửa hàng = thêm cặp cửa hàng → kho + quyết định riêng | `src/lib/env.js`, `src/main/env.js` |
| R2 (G3-1) | Popup: dòng phiên đủ điều kiện tự động được đưa lên đầu, nêu rõ nút "Cho phép tự điền và HOÀN THÀNH 1 lần". Khi gõ mã vào ô cấp phép thủ công cho GR đang có phiên tự động được: hỏi lại "Phiếu này có thể chạy tự động — vẫn cấp phép THỦ CÔNG?" và cần bấm lần hai | `src/popup/*` |
| R3 (G3-2, G3-3) | Khung POS luồng thủ công thêm một dòng: <br>• có `auto_skipped` sau `nw_received` cuối → "Tự động KHÔNG chạy: <lý do>"; <br>• không có quyền → "Tự động: chưa cho phép ở lượt nhận này". <br>Chỉ hiển thị, không đổi điều kiện chạy | `src/pos/pos-content.js` (hàm vẽ) |
| R4 (G3-4, G3-5) | `scripts/`: <br>• `kiem-truoc.js` / `kiem-quet.js` / `kiem-sau.js`, dòng đầu `const GR = "GR…"`; <br>• `kiem-khung-gr.js` ghi chú phiếu COMPLETED hiện "Đã nhận". <br>Runbook PRD: tạo lại phiên ⇒ quyền mất ⇒ cho phép lại + chạy lại chốt chặn | `scripts/`, `docs/dev/RUNBOOK-PRD-*` |

**Gate v0.3.1 (offline, Claude tự chạy):**
- Gate lõi (§1.1) trống.
- `npm test` (222 hiện có) đạt, cộng test mới:
  - PRD + cửa hàng khác Florita → không tạo phiên, không gọi API;
  - PRD + Florita → tạo phiên, chỉ GET;
  - PRD: `grant:create` / `auto:arm` / apply bị từ chối ("chỉ đọc");
  - popup hỏi lại ở ô thủ công, vẫn cấp được sau khi bấm lần hai;
  - mỗi lý do bỏ qua quyền ra đúng dòng chữ.
- Đột biến phần đổi; Edge trên bản giải nén: popup + khung POS mọi trạng thái ở 1095 / 1366; đo tác vụ < 50 ms.
- Audit độc lập bằng sub-agent: 0 P1 / P2 mở.
- Gói + SHA; thư mục giao + hướng dẫn cài mới trên máy Florita.

### v0.3.2 — bật ghi PRD (chỉ sau khi T1-PRD đạt và có §4 quyết định)

- Diff duy nhất so với v0.3.1: PRD `writeEnabled: true` (hai file `env.js`) + version. Allowlist vẫn chỉ Florita.
- Gate:
  - diff đúng 2 dòng + version;
  - test ghi PRD bị chặn ngoài Florita;
  - nâng cùng thư mục / Extension ID (script nâng + `-Check`, như v0.2.4 → v0.3.0).

## 3. Các lượt trên production

| Bước | Ở đâu | Việc | Đạt khi |
|---|---|---|---|
| **B0** | operator | Gửi **một lần**: <br>• máy Florita: Chrome + hồ sơ dùng POS, có cài `circa-qr-scan-log` / extension đọc reader nào khác; <br>• tài khoản Nextwaves `circa` trên máy đó; <br>• có GR sắp giao kèm tem RFID không; <br>• ai trực lúc pilot | Đủ thông tin |
| **T1-PRD** | máy Florita (hoặc laptop này nếu đăng nhập được POS / Nextwaves production của Florita), v0.3.1 | Chọn chế độ PRD. Trên danh sách GR, bấm "Nhận hàng bằng RFID" đúng một GR **đang chờ nhận có SO**. Kỳ vọng: <br>• Nextwaves production mở đúng PO; <br>• khung "Sẵn sàng nhận hàng"; <br>• SL GR = SL Nextwaves; <br>• popup ghi "CHỈ ĐỌC". <br>**Không nhận.** Chạy `kiem-truoc.js`. Net Capture tab POS (chỉ GET) | Phiên `nw_ready` đúng cửa hàng / kho / PO / SO, 0 lệnh ghi |
| **Reader** | máy Florita, cùng lúc T1-PRD | 4 bước chỉ đọc (`DOT2-KHAO-SAT` §3): <br>1. mở tab bán hàng (reader nối); <br>2. mở màn quét Nextwaves → ghi thông báo; <br>3. "Ngắt toàn bộ tab" → Nextwaves nối được không; <br>4. đóng màn quét → bán hàng tự nối lại không | Biết cách chuyển reader qua lại; đưa vào runbook |
| **W1-PRD** (lượt 1) | Florita, v0.3.2 | Một GR thật, operator cho phép bằng chữ đúng GR / PO / SO / số tem. **Luồng thủ công** (đề xuất, xem §4 D3): <br>• nhận trên Nextwaves; <br>• khung POS ra kế hoạch → operator cấp phép → bấm "Điền"; <br>• dược sĩ xem phiếu rồi tự bấm HOÀN THÀNH. <br>`kiem-sau.js` + Net Capture hai tab | Như A1: 1 biên nhận, PUT = số lô, GET khớp, COMPLETED |
| **G3-PRD** (lượt 2) | Florita, v0.3.2 | Một GR thật khác, cho phép bằng chữ. **Luồng tự động** theo runbook G3: <br>• `kiem-truoc` → cho phép tự động → `kiem-quet` "SẴN SÀNG QUÉT" → nhận; <br>• không chạm POS; <br>• `kiem-sau` | Như G3 30/10 |
| **Go** | operator | Sau G3-PRD đạt + **3 GR tự động liên tiếp** không cần can thiệp → dùng thường xuyên tại Florita | Operator chốt |

**Bằng chứng mỗi lượt**, gom một lần:
- `kiem-*` dán từ service worker;
- Net Capture: tab POS bắt buộc, tab Nextwaves nếu tiện;
- file xuất storage trước khi hết hạn 24 giờ.

Không xin ảnh Nextwaves trừ khi có rủi ro cụ thể.

## 4. Quyết định operator cần trước v0.3.2 (không cần cho v0.3.1)

| # | Quyết định | Đề xuất của Claude |
|---|---|---|
| D1 | **Mã QR sau HOÀN THÀNH** (lặp 2 lần + 1 mã mới mỗi lô, do máy chủ POS) | Chấp nhận như hành vi POS hiện tại: production đã lặp khi quét tay 19/10. Extension không sửa danh sách mã sau COMPLETED. Nếu bán hàng bị trừ trùng thì đó là việc của POS / Circa, báo riêng |
| D2 | **O1 — mất phiên sau khi Nextwaves đã nhận** (đóng tab / xoá phiên / đổi máy giữa chừng) | Fail closed + làm tay: extension không điền; dược sĩ hoàn tất GR bằng quét QR trên POS như hiện nay. Lượt tự động chỉ mất ~5 giây nên rủi ro thấp. Không làm khôi phục tự động ở đợt này |
| D3 | **Chế độ lượt ghi production đầu tiên** | Lượt 1 thủ công (người xem phiếu trước HOÀN THÀNH, kiểm đường ghi PRD), lượt 2 tự động. GR production có hằng ngày, nên thêm một lượt không tốn PO hiếm |
| D4 | **Phạm vi cửa hàng** | Chỉ Florita tới khi Go. Cửa hàng khác cần ánh xạ kho Nextwaves + quyết định riêng |
| D5 | **Người trực + ngưỡng dừng** | Mỗi lượt pilot có operator theo dõi. Gặp bất kỳ khung dừng nào (§5) → dừng pilot, hoàn tất GR tay, gửi bằng chứng |

## 5. Dừng, quay lui, xử lý GR dở

| Tình huống | Xử lý |
|---|---|
| Lỗi trước PUT đầu (kế hoạch chặn, tra QR lỗi, phiếu lệch, "Tự động KHÔNG chạy") | GR chưa bị ghi → dược sĩ nhận tay trên POS như hiện nay |
| Dừng giữa chừng (`apply_stopped`, PUT một phần) | Không tự thử lại. Dược sĩ xem phiếu, quét tay phần còn thiếu rồi HOÀN THÀNH |
| `auto_complete_unknown` | Mở phiếu: nếu "Đã nhận" thì xong; nếu còn RECEIVING và đủ lô thì dược sĩ bấm HOÀN THÀNH **một lần** |
| Cần tắt extension ngay | Popup → chế độ STG (PRD ngừng hẳn), hoặc tắt extension ở `chrome://extensions`. Quay về v0.3.1 = chỉ đọc |
| Nhật ký | Phiên tự xoá sau 24 giờ không cập nhật → xuất storage ngay sau mỗi lượt |

## 6. Thứ tự làm

1. **Claude:** build v0.3.1 theo §2 + gate offline → giao gói + runbook T1-PRD. Có thể bắt đầu ngay.
2. **Operator, song song:** gửi B0; trả lời D1–D5.
3. Operator cài v0.3.1 + chạy T1-PRD + 4 bước reader (chỉ đọc) → Claude chốt.
4. Claude build v0.3.2 (một dòng) → operator nâng cùng thư mục.
5. W1-PRD lượt 1 (thủ công) → G3-PRD lượt 2 (tự động) → 3 GR tự động liên tiếp → Go.
