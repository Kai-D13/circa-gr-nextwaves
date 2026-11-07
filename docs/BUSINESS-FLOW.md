# Luồng nghiệp vụ — nhận hàng bằng RFID (circa-gr-nextwaves)

Hiện hành: **v0.4.0** (07/11/2026). Tài liệu này là nguồn chuẩn của luồng nghiệp vụ. Đổi luồng thì sửa file này cùng lượt với `agent.md` §3 / `state.md`.

- Chi tiết mã: `docs/dev/DESIGN-v0.4.0.md` (nhánh), `docs/dev/BATCH-v0.4.0.md`.
- Hướng dẫn vận hành: `docs/dev/RUNBOOK-v0.4.0.md`.

## 1. Bối cảnh

| Bên | Vai trò trong luồng |
|---|---|
| **Buymed / thuocsi** | Giao hàng cho cửa hàng theo SO (`SOBD…`, có thể tách giao `-F` / `-P1` / `-P2`). Đẩy SO sang Nextwaves |
| **Nextwaves** | Tạo đơn mua (PO-…) theo SO, trong kho Nextwaves của cửa hàng. Dược sĩ đặt hàng lên đầu đọc RFID, Nextwaves đối chiếu EPC với đơn, dược sĩ "Xác nhận nhận hàng" |
| **Circa POS** | Phiếu nhận hàng (GR) của cùng lô hàng. Trước đây dược sĩ quét từng mã QR; giờ extension điền thay |
| **QR Scan Log** | Extension bán hàng, giữ đầu đọc RFID ở tab bán hàng |
| **circa-gr-nextwaves** | Extension này: nối GR ↔ đơn Nextwaves, điền mã vào GR |

## 2. Phạm vi

- **Cửa hàng production (07/11):** chỉ hai cửa hàng, cả hai ở tenant Nextwaves `circa`.

  | Cửa hàng POS | Mã POS | Kho Nextwaves (mã) |
  |---|---|---|
  | CIRCA FLORITA `c476efb2-415c-429a-978e-d389b4b06607` | — | Florita `eb5e2b4f-6f92-413b-90ef-6be1730b94c0` (410478) |
  | CIRCA LUMINA `31493e74-3404-4c0e-a906-93691a6ee319` | POS0012 | Lumina `3f7bd541…` (406918) |

  Mã không cần khai trong extension: kho lấy từ đơn Nextwaves khớp SO. Thêm cửa hàng mới không cần sửa mã, chỉ cần tenant đúng (popup).
- **Staging:** cửa hàng 2222 ↔ `circa-stg`. Hết PO staging từ 30/10.

## 3. Luồng chuẩn (v0.4.0)

| # | Ai | Bước | Extension làm |
|---|---|---|---|
| 1 | Dược sĩ | POS → Danh sách phiếu nhận hàng → tìm phiếu (ô SO có sẵn của POS) → bấm **"Nhận hàng bằng RFID"** trên dòng phiếu | Kiểm phiếu thuộc cửa hàng đang đăng nhập, PO, SO, khoá (SO / PO nhiều phiếu); tạo phiên; mở **một** tab Nextwaves `…/purchases/receive?po=<SO>` |
| 2 | Extension | Tìm đơn Nextwaves | Tìm theo SO **một lần**: đúng SO + bên bán Buymed + số lượng từng sản phẩm khớp phiếu; mọi đơn ứng viên cùng một kho. Khung: "Sẵn sàng nhận hàng", phiếu, đơn, số UID, **kho Nextwaves**. Không có đơn → mục 4 |
| 3 | Extension / dược sĩ | Kết nối đầu đọc | Extension bấm "Kết nối đầu đọc" của Nextwaves (tối đa 3 lần mỗi lượt). Đầu đọc đang bị tab bán hàng giữ → khung hướng dẫn: **sang tab bán hàng bấm Ngắt RFID rồi quay lại**; quay lại tab Nextwaves thì extension tự kết nối lại. **Không bao giờ** bấm "Xác nhận nhận hàng" |
| 4 | Dược sĩ | Đặt hàng lên đầu đọc tới khi **còn lại 0, ngoài phiếu 0** → bấm **"Xác nhận nhận hàng"** một lần | Đọc kết quả nhận (2xx), đối chiếu biên nhận với đơn đã khớp |
| 5 | Extension | Về POS | Đóng tab Nextwaves; đưa tab POS về đúng phiếu (tab POS đang làm việc khác thì mở tab mới) |
| 6 | Extension | **Tự điền cả phiếu** (một lần) | Lập kế hoạch (UID → lô); không có điểm chặn → điền từng lô (`PUT …/detail`), đọc lại sau mỗi lô; khung "Đang điền i/n — CHƯA bấm HOÀN THÀNH". Xong: khớp cuối cả phiếu → tải lại → "đã điền N mã vào M lô — kiểm danh sách rồi bấm HOÀN THÀNH" |
| 7 | Dược sĩ | Kiểm số lượng từng lô → bấm **HOÀN THÀNH** của POS | Không gửi HOÀN THÀNH. Thấy phiếu COMPLETED → phiên xong |
| 8 | Dược sĩ | Tab bán hàng: bấm **Kết nối RFID** của QR Scan Log để bán tiếp | — |

**Nguyên tắc không đổi:**
- Extension chỉ ghi GR **sau khi Nextwaves đã nhận** và kết quả khớp đúng đơn. Mọi điều kiện không khớp → dừng, không ghi.
- Kết quả ghi chưa rõ (mất mạng, POS 5xx) → dừng, chờ ~1 phút, dược sĩ bấm "Đọc lại và điền tiếp" (chỉ điền phần còn thiếu).
- Extension không gọi API ghi của Nextwaves, không dùng `/integrations/circa/*`.
- POS máy chủ tự thêm / nhân đôi mã QR khi phiếu COMPLETED (D1, chấp nhận).

## 4. Ngoại lệ

| Tình huống | Khung báo | Dược sĩ làm |
|---|---|---|
| Nextwaves chưa có đơn chờ nhận cho SO (hàng không gắn tem, hoặc tài khoản Nextwaves không thấy kho) | "Nextwaves chưa có đơn chờ nhận cho SOBD… → nhận tay trên POS" + lý do loại từng đơn; danh sách POS ghi "Không có đơn NW" | Nhận tay (quét QR như cũ). Có tem mà vẫn báo: kiểm tài khoản → "Tìm lại" |
| SO tách giao: nhiều đơn cùng SO | "trên màn quét chọn ĐÚNG đơn PO-…" | Chọn đúng đơn. Nhận nhầm đơn của phiếu khác đang mở → extension giao kết quả cho đúng phiếu đó |
| Hai đơn cùng khớp / đơn khác kho / phiếu bị khoá | "Chỉ xem kế hoạch — chưa được điền phiếu" hoặc lý do khoá | Nhận tay, báo Claude |
| Nextwaves đã nhận nhưng phiên mất | "Nextwaves ĐÃ nhận — POS CHƯA điền" (đỏ) | Nhận tay phiếu đó |
| Có sản phẩm Nextwaves không gắn tem (thiếu lượng) | Vàng: "còn K sản phẩm CHƯA nhận đủ" + tên | Nhận tay phần thiếu rồi HOÀN THÀNH |
| Chưa thấy token Nextwaves | "Chưa thấy Nextwaves tải dữ liệu — F5" | F5, kiểm đăng nhập đúng địa chỉ |
| **Bán gấp** (07/11): nhận một vài món, bấm HOÀN THÀNH → POS tự sinh **phiếu phần còn lại** cùng PO | v0.4.0 chưa hỗ trợ: phiếu phần còn lại báo "số lượng không khớp" / "chưa có đơn chờ nhận" (dừng an toàn) | Món bán gấp: **quét QR** (không nhập số tay). Phần còn lại: hiện nhận tay; sau H2 bấm "Nhận hàng bằng RFID" trên phiếu mới. `docs/dev/CASE-PHIEU-PHAN-CON-LAI-20261107.md` |

## 5. Chưa làm / làm sau (ghi nhận 07/11)

| Hạng mục | Trạng thái | Khi nào |
|---|---|---|
| **Mượn / trả đầu đọc tự động với QR Scan Log** (`circa-reader/v1`, spec `docs/dev/SPEC-QSL-MUON-DAU-DOC-v1.md`) | **Hoãn** (operator 07/11). Phía extension này đã có mã (hỏi QR Scan Log; không trả lời trong 300 ms → bỏ qua, không ảnh hưởng luồng). Hiện hành: bước 3 + 8 làm tay | Khi đội QR Scan Log làm xong hợp đồng → kiểm lại với bản của họ |
| Trường mã giao `-F` / `-P1` / `-P2` trên đơn Nextwaves | Chờ Nextwaves | Bản sau: tra đơn theo mã giao thay vì vân tay số lượng |
| Tự HOÀN THÀNH | Bỏ từ v0.4.0 (dược sĩ bấm) | Không có kế hoạch |
| **Phiếu phần còn lại** (bán gấp → POS tách phiếu, operator 07/11: thao tác thật, lặp lại) | Đã định nghĩa (H2, D1–D8), chưa code; chờ tái hiện staging lấy phiếu lúc vừa sinh | v0.4.1 (cùng các finding audit) |

## 6. Quy trình phát hành

1. Plan (`docs/dev/PLAN-*.md`) → operator duyệt khi đổi luật nghiệp vụ / ghi thật.
2. Code trên nhánh `batch/*` → test, đột biến, Edge thật, review độc lập → đóng gói (ZIP + SHA-256) → báo cáo `docs/dev/BATCH-*.md`.
3. **Cài máy dev** (operator cho phép; chép đè thư mục Chrome đang tải, operator Reload) → **QA / QC trên máy dev** theo `docs/dev/QA-<bản>-MAY-DEV.md`.
4. **QA / QC đạt** → operator cho phép cài **máy POS vận hành** → lượt đầu mỗi máy có `kiem-sau.js` → Claude đối chiếu.
5. Đạt → merge nhánh vào `main`.

Sửa trước khi cài máy POS: giữ nguyên số bản, đổi mã gói. Mỗi lần cài máy POS = một số bản.
