# Batch v0.1-staging — báo cáo dev gửi PM audit (24/10/2026)

> **Đã thay bằng v0.1.1** (`d124453`, gói `D8CD9AFD`) sau PM audit — xem `docs/dev/FIX-AUDIT-BATCH-v0.1-STG.md`. Không cài bản `FF5CD95B` nữa; phần "chế độ điền phiếu" (writeMode) dưới đây đã bỏ, thay bằng cấp phép từng lần.

Người viết: dev-team. Mã nằm trên nhánh **`batch/v0.1-staging`** (commit `a08d541`), **chưa merge `main`**, chờ PM audit.
Batch này làm theo chỉ đạo trực tiếp của operator ngày 24/10 ("Build và test chính xác", thử trên PO00006750 / GR03878).
Nó đi trước spec v0.2 của PM. Logic theo `docs/dev/LOGIC-v0.3.md` §9 và các quyết định a–d của operator (`state.md` §8, lần 9).

## 1. Gói

| | |
|---|---|
| Phiên bản | `0.1.0` (manifest) |
| Gói | `dist/circa-gr-nextwaves-v0.1.0.zip`, 16 file (dựng bằng `python -I scripts/pack.py` từ nhánh, tái lập được) |
| SHA-256 | `ff5cd95be48e859a894e9b5f3b2864f80ea4b636ddd19d34e22944f6ad5b0948` — **mã gói `FF5CD95B`** |
| Bản giải nén để cài | `C:\circa-gr-nextwaves-v0.1.0` (đã đối chiếu từng file với `src/` của `a08d541`) |
| Bản nội bộ bị thay | `6996383D` (`abf097a`, chưa giao ai). Khác duy nhất: chưa chuyển header `grpc-timeout` |

## 2. Luồng đã làm

```
POS  (1) /danh-sach-phieu-nhan-hang/<grId>   hoặc   (2) /chi-tiet-so/<SO> (tìm GR theo SO + cửa hàng đang đăng nhập)
      │ GET GR → kiểm cửa hàng (x-store-id = pos_info.id; STG chỉ 2222) → GET PO POS
      │ thuocsi_delivery_code (đúng 1 mã) → SO gốc (SOBD1593858-F → SOBD1593858), đối chiếu sale_order_number
      ▼ tự mở tab Nextwaves  /vi/purchases/receive?po=<SO gốc>   (không có nút; phiên lưu trong chrome.storage.local)
NW   GET inter-tenant-orders/receiving?q=<SO> → mỗi ứng viên Buymed + đúng kho:
      │   GET …/purchase-orders/<poId> (refId cùng SO, Buymed, kho, chưa huỷ) → GET …/<poId>/receiving → dấu vân tay với GR
      │   đúng 1 đơn đạt → "Sẵn sàng nhận hàng" (0 hoặc > 1 → báo lỗi, không đi tiếp)
      │ dược sĩ đặt hàng lên reader, bấm "Xác nhận nhận hàng" (web Nextwaves tự gọi POST …/receive-scan)
      │   4xx → hiện lý do Nextwaves (vd. tagged_unit_unsupported), ở lại
      │   2xx → GET /purchase-orders/<id> (receivedUnits) + GET /inter-tenant-shipments/<id> (lô, epcs), thử lại tối đa 6 lần
      │   nhận đủ, không EPC lạ, không xung đột → đưa dược sĩ về tab POS; nhận thiếu → ở lại, báo X/Y
      ▼
POS  tra QR từng UID (thuocsi-warehouse/qrcode) → kế hoạch W1 (chặn cả gói nếu có 1 điểm chặn) → bảng kế hoạch
      │ writeMode: off (mặc định) = chỉ xem │ confirm = bấm "Điền vào phiếu (N UID)" │ auto = tự điền
      │ W1: mỗi lô 1 PUT …/item/<i>/detail/<d> {received_quantity (tuyệt đối), lot_id, thuocsi_qr_codes}, đọc lại GR trước / sau
      ▼ tải lại trang → "đã điền N UID" → dược sĩ bấm HOÀN THÀNH (extension nghe PUT …/status/COMPLETED để đóng phiên)
```

Trạng thái phiên: `waiting_nw → nw_ready → received → applying → applied → done` (`apply_stopped` khi dừng giữa chừng; bấm "Thử lại" sẽ đọc lại phiếu rồi mới ghi tiếp).

## 3. Mã

| File | Vai trò |
|---|---|
| `src/manifest.json` | MV3, quyền `storage` + 7 host của 2 môi trường; content script MAIN (hook) và ISOLATED (logic) cho POS và Nextwaves |
| `src/lib/env.js` | STG / PRD / theo URL, nhận dạng trang + API, phạm vi cửa hàng, dựng URL API |
| `src/lib/keys.js`, `pos-model.js`, `nw-model.js`, `match.js`, `plan.js`, `apply.js` | Logic thuần (đã có từ trước, thêm `normalizeQrLookup`) |
| `src/pos/pos-hook.js`, `src/nw/nw-hook.js` | MAIN world, **chỉ quan sát**: header app tự gửi, PUT status GR, POST receive-scan |
| `src/pos/pos-content.js` | Đường (1) / (2), mở phiên, kế hoạch, W1 theo writeMode, nghe HOÀN THÀNH |
| `src/nw/nw-content.js` | Tìm + kiểm đơn, chờ xác nhận, đọc kết quả nhận, đưa về POS |
| `src/background.js` | Phiên, hàng đợi nối tiếp, giành quyền ghi cho đúng 1 tab, mở / chuyển tab |
| `src/popup/*` | Chọn môi trường (STG / PRD / URL), chế độ điền, danh sách phiên |
| `src/ui/panel.js` | Khung trạng thái Shadow DOM góc dưới phải (chỉ `textContent`) |

## 4. Bất biến và chỗ giữ

| Bất biến | Giữ ở |
|---|---|
| Không lưu token: header chỉ ở bộ nhớ tab, không vào storage | hook → content; test kiểm storage không chứa `Bearer` |
| Chỉ gọi host của môi trường đã chọn; host lạ không chạy | `env.classifyPosPage / classifyNwPage`; test STG trên trang PRD, PRD trên trang STG, chưa chọn |
| STG chỉ cửa hàng 2222; GR phải cùng cửa hàng đăng nhập | `storeAllowed`, so `x-store-id` |
| Nextwaves: chỉ GET; không `/integrations/circa/*`; không bấm nút hộ | nw-content; server giả của test ném lỗi nếu bị gọi |
| Không ghi POS khi Nextwaves chưa 2xx **và** chưa đọc lại đủ kết quả | nw-content (`missing` / `unexpected` / `problems` → ở lại) |
| Mặc định không ghi (writeMode `off`) | background `DEFAULT_CONFIG` |
| Không ghi trùng: đọc lại GR trước mỗi PUT; 1 tab ghi | `apply.js`; `session:claimApply` |
| Không tạo lô / chi tiết; không lẻ; không vượt | `plan.js` |

## 5. Bằng chứng test

- `npm test`: **48/48**, chạy 8 lần liên tiếp đều xanh.
  - Lib (30), hook MAIN world trong `node:vm` với XHR / fetch giả (5).
  - **Chạy trọn luồng (13)** trên trình duyệt giả `tests/browser-sim.js`: nạp đúng `background.js` và đúng danh sách script ISOLATED trong `manifest.json`; server giả trả mẫu GR03878 / PO00006750 / PO28237814. Các ca:
    - tự điền trọn luồng tới HOÀN THÀNH;
    - writeMode off rồi chuyển sang confirm;
    - Nextwaves 400 `tagged_unit_unsupported`;
    - nhận thiếu 11/12;
    - PUT lỗi rồi Thử lại;
    - đường `/chi-tiet-so`;
    - sai cửa hàng;
    - sai môi trường (2 chiều);
    - huỷ phiên;
    - 2 tab POS cùng GR;
    - lượt nhận của phiếu gửi khác;
    - giành quyền ghi.
- **Đột biến 8/8 bị bắt**:
  - bỏ chặn nhận thiếu;
  - writeMode off vẫn ghi;
  - bỏ kiểm cửa hàng;
  - nhận lượt của phiếu gửi khác;
  - 400 vẫn đọc kết quả;
  - giành quyền ghi không kiểm;
  - confirm tự ghi;
  - STG mọi cửa hàng.
- **Trình duyệt thật** (Edge 156 headless, hồ sơ tạm, đã tắt sạch). Chrome 156 bản thường không cho `--load-extension`.
  - Service worker khởi động, đọc manifest `0.1.0`, `chrome.storage` chạy.
  - Trên `circa-stg.nextwaves.app`, hook MAIN world và `env.js` được nạp.
  - POS staging chưa đăng nhập chuyển sang `sso.stg.buymed.tech`, nên không nạp script. Đúng như thiết kế.
- **Phần DỰNG LẠI** (chưa có dữ liệu thật vì K1):
  - response 2xx của `receive-scan`;
  - PO Nextwaves sau khi nhận của PO28237814;
  - `/receiving` của PO28237814;
  - 10/12 kết quả tra QR.

  Xem `tests/helpers.js`.

## 6. Cài và thử trên staging (operator, laptop này)

Cài:
1. Chrome → `chrome://extensions` → bật Developer mode → **Load unpacked** → chọn `C:\circa-gr-nextwaves-v0.1.0`.
2. Bấm icon extension:
   - Môi trường = **Staging**;
   - Điền phiếu nhận trên POS = **Tắt — chỉ hiện kế hoạch**;
   - bấm Lưu.
3. Đăng nhập POS staging (cửa hàng 2222) và Nextwaves `circa-stg` trên cùng Chrome.

**T1 — chỉ đọc, làm được ngay:**
1. Mở `https://pos.stg.circa-v2.buymed.tech/danh-sach-phieu-nhan-hang/2de6c0ec-2ea8-4038-8616-659fa3f5820a` (GR03878).
2. Kỳ vọng:
   - Extension tự mở tab `https://circa-stg.nextwaves.app/vi/purchases/receive?po=SOBD1593858`.
   - Tab Nextwaves hiện "Sẵn sàng nhận hàng · Phiếu GR03878 ↔ Nextwaves PO28237814", kèm bảng 3 sản phẩm (SL GR = SL Nextwaves, đơn vị gốc).
   - Tab POS hiện "Đã khớp đơn Nextwaves — chờ nhận hàng".
3. Thử đường (2): danh sách phiếu nhận → "Nhập SO thuocsi" → `1593858`. Kỳ vọng ra cùng phiên, không mở thêm tab.
4. Nếu sai, chụp màn hình khung extension ở cả hai tab.
   - Popup có danh sách phiên.
   - Nhật ký phiên nằm trong storage, không chứa token.

**T2 — K1 (tuỳ chọn):**
- Nếu dược sĩ bấm "Xác nhận nhận hàng" với PO28237814, Nextwaves trả 400 như 3 lần trước.
- Kỳ vọng: tab Nextwaves hiện "Nextwaves CHƯA nhận (HTTP 400): Dòng có thẻ không nhận được theo đơn vị này… [INTER_TENANT_SHIPMENT_LINE_INVALID / tagged_unit_unsupported]".
- Kỳ vọng: không quay về POS, không ghi gì.

**T3 — cần gỡ K1 và operator cho phép ghi:**
1. Nhận thành công trên Nextwaves.
2. Kỳ vọng: tự quay về POS; bảng kế hoạch 6 lô / 12 UID (writeMode Tắt nên chưa ghi).
3. Chỉ khi operator cho phép: đổi sang "Hỏi trước khi điền", bấm "Điền vào phiếu (12 UID)".
4. Kỳ vọng: 6 PUT, mỗi lô lên 1. Trang tải lại, hiện "đã điền 12 UID". Dược sĩ kiểm rồi bấm HOÀN THÀNH.

## 7. Cần PM chốt / chưa biết

| # | Nội dung | Dev làm tạm |
|---|---|---|
| P1 | **Hợp đồng ghi W1 chưa kiểm trên POS thật**: 1 PUT nhiều UID, `received_quantity` tuyệt đối, bước tăng > 1 | Mặc định Tắt. Cần 1 GR staging operator cho phép ghi thử (state §9) |
| P2 | Nhận thiếu (`keep_open`): có cho điền phần đã nhận vào GR không? | Không. Chỉ đưa về POS khi nhận đủ |
| P3 | SO có nhiều GR đang chờ ở `/chi-tiet-so` (Q6) | Hiện danh sách để dược sĩ chọn; mỗi GR một phiên |
| P4 | Tự mở tab Nextwaves khi phiếu **đã có mã quét tay** | Không tự mở; hiện nút "Nhận bằng Nextwaves" + cảnh báo |
| P5 | Trang `?po=<SO>` của Nextwaves tự gọi `hub-orders/<SO>` của chính nó (mã Nextwaves, extension không gọi) | Operator đã chọn đường link này (24/10) |
| P6 | UID mà POS tra QR không ra | Chặn cả gói (`qr_lookup_failed`) |
| P7 | Production chưa thử | Bảng kho PRD mới có Florita; cửa hàng khác bỏ qua kiểm kho. R12 (Web Serial giành cổng với circa-qr-scan-log) chưa xử lý |
