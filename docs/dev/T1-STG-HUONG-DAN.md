# T1 — thử chỉ đọc trên staging (hướng dẫn operator)

Người viết: dev-team, 25/10/2026. Theo `docs/pm/AUDIT-v0.1.4-STG-20261025.md` §Gate 1.
**Cập nhật 25/10: dùng v0.1.5.** v0.1.2 và v0.1.4 bị lỗi "Lỗi extension — Cannot read properties of undefined (reading 'envFromConfig')" (lần T1 đầu); xem `docs/dev/FIX-T1-v0.1.5.md`.
Mục đích: chạy extension trên **phiên đăng nhập thật** của staging, **không ghi gì**, để PM đối chiếu hành vi của extension với response thật.

## 0. Không làm trong T1

- **Không** bấm "Cho phép điền 1 lần" trong popup.
- **Không** bấm "Xác nhận nhận hàng" trên Nextwaves. PO28237814 còn lỗi K1, và đó là thao tác ghi bên Nextwaves.
- **Không** bấm HOÀN THÀNH, không quét QR / RFID vào phiếu GR03878.
- **Không** gửi cURL hay header (`authorization`, cookie). Chỉ dùng **Copy response**.
- **Không** cài `C:\circa-gr-nextwaves-v0.1.3`: đó là bản dựng nội bộ, không phát hành. Cũng không dùng v0.1.2 / v0.1.4 cho T1 (lỗi ở trên).

## 1. Cài bản extension

Dùng **v0.1.5**: chỉ sửa cách nạp script so với v0.1.4, logic đọc / ghi không đổi.

1. Chrome → `chrome://extensions` → bật **Developer mode**.
2. **Gỡ** (Remove) mọi bản "Circa GR ← Nextwaves" cũ (v0.1.0 … v0.1.4). Chỉ được để **một** bản.
3. **Load unpacked** → chọn thư mục `C:\circa-gr-nextwaves-v0.1.5`.
4. Bấm icon extension, kiểm dòng tiêu đề có **v0.1.5**.
   Bản nạp từ thư mục mới là extension mới, nên cấu hình trống: **phải chọn lại môi trường** ở bước 5.
5. Popup → **Môi trường = Staging** → **Lưu**.
   - Dòng mô tả phải là: "Staging: POS https://pos.stg.circa-v2.buymed.tech · Nextwaves https://circa-stg.nextwaves.app · chỉ cửa hàng 64a8663b-…".
   - Mục "Cho phép điền phiếu (từng lần)" hiện ra; **để trống, không bấm**.

## 2. Đăng nhập (cùng hồ sơ Chrome đó)

- POS staging `https://pos.stg.circa-v2.buymed.tech`, **cửa hàng 2222**.
- Nextwaves staging `https://circa-stg.nextwaves.app`.

## 3. Chạy T1 trên GR03878

0. Sau khi cài / đổi bản extension, **tải lại (F5) hoặc mở mới** các tab POS / Nextwaves đang mở. Script của extension chỉ được nạp khi trang tải.
1. Ở tab POS, mở DevTools (**F12**) → tab **Network** → ô lọc gõ `goods-receipt/search`.
2. Ngay trong tab đó, mở `https://pos.stg.circa-v2.buymed.tech/danh-sach-phieu-nhan-hang/2de6c0ec-2ea8-4038-8616-659fa3f5820a` (GR03878).
3. Kỳ vọng:
   - Khung extension (góc dưới phải) hiện "Đang chờ POS tải dữ liệu…", rồi "Chờ nhận hàng trên Nextwaves".
   - Extension tự mở tab mới `https://circa-stg.nextwaves.app/vi/purchases/receive?po=SOBD1593858`.
4. **Response 1 (tìm GR theo SO):** trong Network của tab POS, chuột phải request `goods-receipt/search?query=so_thuocsi=1593858…` → **Copy → Copy response** → dán vào file `T1-pos-gr-search.json`.
5. Sang tab Nextwaves. Kỳ vọng khung extension: **"Sẵn sàng nhận hàng"**.
   - Dòng 1: "Phiếu GR03878 ↔ Nextwaves PO28237814 (SOBD1593858) — 12 UID dự kiến."
   - Dòng 2: "Tìm theo SOBD1593858: total …, đã đọc …; ứng viên Buymed cùng kho …; refId đúng SO …."
   - Bảng 3 sản phẩm: cột SL GR (gốc) bằng cột SL Nextwaves (gốc).
6. **Response 2 (tìm đơn Nextwaves):** ở tab Nextwaves mở DevTools (F12) → Network → lọc `receiving?` → bấm **F5** tải lại trang.
   Chuột phải request `inter-tenant-orders/receiving?…q=SOBD1593858` → **Copy → Copy response** → dán vào file `T1-nw-receiving-search.json`.
   (Tải lại không làm extension tìm lại: phiên đã khớp được giữ; request này là của chính trang Nextwaves, cùng API.)
7. Quay lại tab POS. Kỳ vọng khung: **"Đã khớp đơn Nextwaves — chờ nhận hàng"**, với hai dòng:
   - "Phiếu GR03878 · PO00006750 · mã giao SOBD1593858-F";
   - "Nextwaves: PO28237814 (SOBD1593858-1056745)".
8. Bấm icon extension (popup). Mục "Phiên gần đây" có dòng `STG · GR03878` với trạng thái "Đã khớp đơn Nextwaves".
   Nếu có dòng "Khoá điền: …" thì ghi lại; đó là khoá ghi extension tự đặt.

## 4. Gửi lại

1. Ảnh khung extension ở **tab POS** (bước 3.7).
2. Ảnh khung extension ở **tab Nextwaves** (bước 3.5).
3. Ảnh **popup** (bước 3.8).
4. File `T1-pos-gr-search.json` (giữ nguyên `total`, `page`, `limit`).
5. File `T1-nw-receiving-search.json` (giữ nguyên `items`, `total`).

**Nếu khung báo khác kỳ vọng thì vẫn chụp và gửi**, kèm cả hai response. Ý nghĩa nhanh:

| Khung báo | Nghĩa |
|---|---|
| "Lỗi extension — Cannot read properties of undefined (reading 'envFromConfig')" | Đang chạy bản cũ (v0.1.4 trở xuống) hoặc tab chưa tải lại sau khi cài v0.1.5 |
| "Staging: extension chỉ chạy cho cửa hàng thử" | Đang đăng nhập cửa hàng khác 2222 |
| "Không xác định được cửa hàng đang đăng nhập" | POS chưa gửi `x-store-id` — tải lại trang POS |
| "… không nối được tới SO thuocsi" | PO / GR / cửa hàng không khớp (dòng dưới nêu lý do) |
| "Không đọc đủ danh sách phiếu nhận của SO …" | Response tìm GR theo SO chưa đủ / thiếu trường (P1.6) |
| "Kết quả tìm đơn chưa đọc đủ …" / "Không có đơn Nextwaves khớp …" / "Có nhiều đơn …" | Tìm đơn Nextwaves theo SO không ra đúng một đơn (P1.1) |
| "Đơn đã có hàng nhận trước khi mở phiên" | Nextwaves đã có UID nhận trước (chỉ hiển thị, không chuyển) |

## 5. Sau T1 (không thuộc T1)

- **K1 / T3:** cần Nextwaves / Buymed gỡ `tagged_unit_unsupported` cho PO28237814 (dòng 1110 theo vỉ, đơn vị gốc Nextwaves là hộp), **hoặc** một SO staging mới có dòng gắn thẻ theo đơn vị gốc, giao tới cửa hàng 2222 để POS sinh GR.
  Khi có, operator cho phép riêng một lượt bấm "Xác nhận nhận hàng" và lấy các response (bỏ credential):
  - 2xx `receive-scan`;
  - `purchase-orders/<id>`;
  - `inter-tenant-shipments/<id>`;
  - `/receiving` **sau** nhận.
- **W1:** chỉ sau khi PM audit T3. Operator chỉ định một GR staging rồi cấp phép một lần trong popup.
