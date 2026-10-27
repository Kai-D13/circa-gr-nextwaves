# Batch v0.2.3 — sửa F3 / F4 theo PM review G3a (27/10/2026)

**Căn cứ:** `docs/pm/REVIEW-G3a-F3-F4-v0.2.3-20261027.md` (commit `a6d7833`).

**Nhánh:** `batch/v0.2-rfid`, runtime `247386f`, đầu nhánh `f76cbcc` (chỉ test), từ `3218cae`.

**Gói:** `dist/circa-gr-nextwaves-v0.2.3.zip`, 19 file.
- SHA-256 `40236d67a5a4135b3d9b37683167a81667f668a08cbc29df4f0472076da5d96c`, **mã gói `40236D67`**.
- Dựng lại từ checkout sạch `247386f` ra cùng SHA.
- Giải nén `C:\circa-gr-nextwaves-v0.2.3` khớp từng file với `src/` (`diff -r` rỗng); `lib/env.js` = `main/env.js`.

**Chưa cài.** PM audit nguồn / gói rồi mới cài lên Chrome staging để kiểm G3a lại. Không nhận / ghi.

## 1. Thay đổi runtime (`src/`: 3 file, +149 / −38)

### F3 — nhãn ngắn, tên đầy đủ theo trạng thái phiên

| Trạng thái | `kind` (không đổi) | Nhãn nhìn thấy | `title` = `aria-label` |
|---|---|---|---|
| chưa có phiên | `start` | Nhận hàng bằng RFID | `GR… · chưa có phiên · Nhận hàng bằng RFID: đọc lại phiếu, PO, SO rồi mở màn quét Nextwaves` |
| đang kiểm | `busy` (vô hiệu) | Đang kiểm… | `GR… · đang kiểm phiếu, PO và SO trước khi mở Nextwaves` |
| `waiting_nw`, `nw_ready` | `open_nw` | Mở Nextwaves | `GR… · phiên <chữ> (<mã trạng thái>) · Mở lại tab Nextwaves của phiên này` |
| `received`, `applying`, `applied`, `apply_stopped` | `open_gr` | Mở phiếu | `GR… · phiên <chữ> (<mã trạng thái>) · Mở phiếu để lập kế hoạch / điền / HOÀN THÀNH` |

- Trạng thái lấy từ **phiên extension**, không lấy trạng thái POS. Hành động và hàng rào tạo phiên không đổi.
- **`gr-list.js`:**
  - nút `inline-block`, cao 24px, `max-width` 150px, một dòng, cắt `…`. Trên trang dựng, nút bắt đầu rộng 142px; mọi nhãn khác ngắn hơn;
  - `syncRow()` so thêm `title` và `aria-label`: cùng nhãn "Mở phiếu" mà phiên đổi `received → applied` vẫn cập nhật;
  - `data-cgn-kind` luôn theo hành động hiện tại.

### F4 — thông báo trên danh sách trong luồng trang, không khung nổi

- **Trên `/danh-sach-phieu-nhan-hang`, `pos-content.js` không gọi `panel.show()`:**
  - đang kiểm → nút "Đang kiểm…" (vô hiệu);
  - thành công → nút "Mở Nextwaves" + tab Nextwaves mở; **không thông báo**.
- **Huỷ / lỗi / phiếu không liên kết / lỗi extension** (`onListSelect`, nhánh lỗi `onSelect`, lỗi `refresh`) → `L.notice()` của `gr-list.js`:
  - khối thông báo **trong luồng trang, ngay trước bảng** (hoặc trước khung `MuiTableContainer` nếu có); không có bảng thì lên đầu trang;
  - dựng bằng `textContent`; `role="alert"` (lỗi / huỷ) hoặc `"status"`; có nút **Đóng**;
  - đặt lại nếu app vẽ lại bảng; MutationObserver bỏ qua thay đổi của chính khối này.
- **Dọn thông báo:** khi bấm lượt mới, khi rời danh sách (`leaveList` → `deactivate`), khi bấm Đóng. `clearListButtons` / `evaluateGrList` chỉ gọi `L.notice()`.
- Trang phiếu GR và Nextwaves giữ khung như cũ (`panel.js` không đổi). Không đổi logic phiên, cấp phép, ghi POS.

## 2. Kiểm

| Mức | Kết quả |
|---|---|
| `npm test` | **135/135** × 3. `v02.test.js` 22 ca: +1 mọi trạng thái nút trên cùng bảng (nhãn, `kind`, tên đầy đủ, `received → applied`); +1 dọn thông báo khi rời / quay lại. Các ca cũ đọc vùng thông báo thay khung và kiểm không có khung nổi |
| Đột biến Node `python -I scripts/mutate-v0.2.3.py` (102 ca = 96 + 6 F3 / F4) | **102/102**, 0 ANCHOR, 0 hết giờ (xem dưới) |
| Đột biến DOM trên Edge `node scripts/mutate-edge-v0.2.3.js` (9 ca = 6 + 3 F3 / F4) | **9/9**: đồng bộ nút bỏ qua title / aria-label; thông báo lên đầu trang thay vì trên bảng; rời danh sách không gỡ thông báo; cùng 6 ca cũ |
| Edge `node scripts/edge-check.js` | **41 mục.** `src/`: 41/41. **Gói giải nén: 41/41 × 2.** Đối chứng gói v0.2.2: **hỏng 7/41**, đúng F3 / F4 (§3) |

**Đột biến Node:** lượt đủ 102 ca (mã `247386f`) bắt 100. Hai ca sót là thiếu test:
- "thành công vẫn hiện khung nổi": khung hiện rồi bị `refresh()` ẩn ngay, nên test chỉ thấy kết quả cuối;
- "bấm lại không dọn thông báo cũ": thành công cũng dọn, nên chỉ lộ trong lúc "Đang kiểm…".

Sửa test `f76cbcc` (chỉ test, `src/` không đổi):
- kiểm **không lần nào** hiện khung nổi trên danh sách (lịch sử `views`);
- giữ lượt bấm lại ở "Đang kiểm…" rồi kiểm thông báo cũ đã dọn.

Chạy lại 6 ca F3 / F4: 6/6. Hai ca sót cũng thử riêng trên bản sao: đều hỏng test.
| Quét bí mật / tên nhân viên | sạch |

**Diff `3218cae..247386f`:** 9 file, +593 / −59.
- DIFF đầy đủ: `dist/circa-gr-nextwaves-v0.2.3-vs-3218cae.diff` + `.stat.txt` (ngoài git).

## 3. Edge — trang dựng theo DOM thật

Trang danh sách thêm khung `MuiTableContainer-root`, ô chọn số dòng và hai mũi tên phân trang như trang thật.

| Phép kiểm | v0.2.3 | v0.2.2 |
|---|---|---|
| Trước khi bấm, 1095×756 / 1366×768 / 1440×900: dòng có nút = dòng không nút; nút trong ô | đạt | đạt |
| Sau khi bấm ("Mở Nextwaves"), cả 3 cỡ: tiêu đề và dòng **như trước khi bấm**, nút ≤ nút bắt đầu (142px), một nút / dòng | **đạt** | **hỏng** (nút "Đang nhận trên Nextwaves" rộng hơn nút bắt đầu) |
| Phiên `received` ("Mở phiếu"), cả 3 cỡ | **đạt** | — |
| `aria-label` / `title` có mã GR + trạng thái phiên; `received → applied` cùng nhãn nhưng tên đổi | **đạt** | **hỏng** (không có `aria-label`) |
| Không khung nổi trên danh sách sau khi bấm | **đạt** | **hỏng** |
| 1095×756, lỗi (GR03887): thông báo `role=alert` ngay trên bảng, `position: static`; 29 điều khiển (7 nút RFID, 7 nút Nextwaves, mã + icon 4 dòng, chọn số dòng, ‹ ›) điểm giữa vẫn trúng chính nó | **đạt** (0 bị phủ) | **hỏng** (không có thông báo trong luồng) |
| Có thông báo, đứng yên 1,5 s: 0 lượt quét (không vòng observer) | đạt | — |
| Đóng → gỡ thông báo | đạt | — |
| Rời danh sách (SPA) → gỡ nút + thông báo; quay lại → 7 nút, không thông báo cũ | **đạt** | **hỏng** |
| Đổi trang / bộ lọc → 7 nút, mỗi dòng một nút | đạt | đạt |
| Tải lại trang sau khi đã tạo phiên → vẫn 1 phiên, 1 tab Nextwaves | đạt | đạt |
| Ngân sách: lượt quét gồm lấy dòng; mọi tác vụ | `src/` 1,1 ms, gói 1,0–1,2 ms (< 2); dài nhất 4,3 / 6,7–7,0 ms (< 50) | — |

- Trang dựng ở 1095×756 đã xuống dòng tiêu đề **trước** khi bấm (dòng 71px) vì CSS tối thiểu; phép kiểm so trước / sau trên cùng trang.
- Trên POS thật ở cùng bề rộng, dòng 57px trước khi bấm (ảnh G3a-2).
- Mốc 57px sau khi bấm trên trang thật cần quan sát Chrome staging với v0.2.3.

## 4. Còn lại

1. **Sau PM audit v0.2.3**, cài trên Chrome staging và kiểm G3a lại:
   - danh sách trước / sau bấm ở bề rộng 1095px: dòng 57px, tiêu đề không xuống dòng;
   - thông báo huỷ / lỗi nếu xảy ra;
   - màn quét Nextwaves sau khi cuộn với **khung mở rộng** và nút "Xác nhận nhận hàng" cùng hiện;
   - số tab Nextwaves, popup một phiên, version cài.

   Claude in Chrome lúc giao vẫn **không kết nối**. Nếu vẫn vậy, operator làm theo `docs/dev/G3a-v0.2.2-HUONG-DAN.md` (thay thư mục cài bằng `C:\circa-gr-nextwaves-v0.2.3`).
2. **Quan sát P2 (PM giao ghi phương án): khung mở rộng trên trang phiếu ở 1095px che cột "SL nhận" (+ / − / xoá) của dòng đầu.** Phương án đề xuất, chưa làm, chờ PM chọn trước W1 vận hành:
   - (a) khung trang phiếu **mặc định thu nhỏ** khi không cần dược sĩ thao tác (chờ Nextwaves, đã điền); tự mở rộng khi có nút cần bấm (cấp phép / điền / lỗi);
   - (b) khung **né thêm** các nút của dòng sản phẩm đang hiện trong vùng khung. Thông thường đẩy khung lên cao, có thể che dòng khác nên không khuyên;
   - (c) hướng dẫn rõ: bấm "–" để thu nhỏ khi cần sửa số lượng tay.

   Dev khuyên (a) + (c).
3. Lượt nhận / PUT / HOÀN THÀNH staging (G3b, W1) và production: chưa duyệt, có gate riêng.
