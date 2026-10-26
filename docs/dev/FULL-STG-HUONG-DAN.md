# Hướng dẫn operator — chạy trọn luồng trên một SO staging mới (v0.1.5)

Mục đích: có đủ bằng chứng thật cho cả bốn chặng trên **một** cặp SO / GR / PO Nextwaves mới:
- **T1:** khớp đơn;
- **T3:** nhận hàng 2xx;
- **W1:** extension điền GR, gồm request / response PUT;
- **HOÀN THÀNH:** POS chấp nhận phiếu do extension điền.

Lượt 25/10 23:46 trên PO28237814 đã có T3 thật (Net Capture tab Nextwaves). Nhưng **không ghi được phía POS**: Net Capture chỉ ghi một tab và đã dừng trước khi điền.

Làm **từng PO một**. Giữ PO thứ hai để chạy lại sau khi dev / PM xem kết quả PO thứ nhất.
Thứ tự gate PM (T3 được duyệt rồi mới W1) được operator gộp vào một lượt trên staging. Dev ghi rõ điều này trong báo cáo.

> **Làm ngay, trước 23:00 ngày 26/10 (kể cả khi chưa chạy lượt mới):** bước 12, export `chrome.storage` → `extension-storage.json`.
> - Extension tự xoá phiên quá 24 giờ không cập nhật, kèm nhật ký của phiên.
> - Phiên GR03878 (điền khoảng 23:49 ngày 25/10) là bằng chứng duy nhất còn lại của lượt điền đó, vì không có traffic POS.
> - Thao tác này chỉ đọc. Không bấm gì trong popup.

## 0. Điều kiện

- SO mới giao **cửa hàng 2222** (POS staging) và có đơn Nextwaves `circa-stg` cùng SO, kho **CIRCA FLORITA**. Nếu khác, extension sẽ chặn và báo lý do. Khi đó dừng và gửi ảnh.
- Có reader và đủ tem của SO mới. Tem khác để xa reader.
- Extension v0.1.5, Staging, popup **không có cấp phép** nào đang hiệu lực.
- Không bấm "Huỷ phiên" / "Xoá" phiên GR03878. Nhật ký của phiên đó còn cần.

## 1. Ghi lại (quan trọng nhất)

- **Tab POS: bật Net Capture từ đầu đến cuối lượt.** Đây là nơi có các request ghi (PUT) của extension và request HOÀN THÀNH.
- **Tab Nextwaves** (extension tự mở): nếu Net Capture ghi được thêm tab thứ hai thì bật luôn.
  - Nếu không: F12 → Network → tick **Preserve log**, F5.
  - Cuối lượt: chuột phải → Copy → mục **"… as HAR (sanitized)"** (không chọn "with sensitive data") → lưu `nw.har`.
- Ảnh đặt tên theo số bước bên dưới (`1-…jpg`, `2-…jpg`…) để khỏi nhầm.
- File Net Capture có token: **chỉ gửi cho dev trên máy này**, không đưa lên chat / repo.

## 2. Các bước

| # | Tab | Làm | Kỳ vọng / chụp |
|---|---|---|---|
| 0 | POS | Bật Net Capture ở tab POS. Mở GR03878 một lần, đợi tải xong (để ghi trạng thái sau điền của GR03878) | Khung GR03878 hiện "đã điền"; không ghi gì thêm |
| 1 | POS | Mở GR mới (danh sách phiếu nhận hoặc "Nhập SO thuocsi") | `1-pos-cho.jpg`: "Chờ nhận hàng trên Nextwaves"; tab Nextwaves tự mở |
| 2 | NW | Bật ghi cho tab này (mục 1). Đợi khung | `2-nw-san-sang.jpg`: "Sẵn sàng nhận hàng"; dòng "Tìm theo …: total 1, đã đọc 1; … 1; refId đúng SO 1"; bảng SL gốc hai cột bằng nhau. Khác thì **dừng** |
| 3 | NW | Kết nối reader, quét đúng tem của SO | `3-nw-quet-du.jpg`: "Đã nhận N / N", từng dòng đầy, không tem lạ |
| 4 | NW | Bấm **"Xác nhận nhận hàng" một lần** | `4-nw-da-nhan.jpg`: khung extension sau khi bấm. Nếu báo "CHƯA nhận (HTTP …)" thì **dừng**, không bấm lại |
| 5 | POS | Extension đưa về POS | `5-pos-ke-hoach.jpg`: "Chỉ xem kế hoạch — chưa có cấp phép điền", kế hoạch #…, bảng lô / đơn vị / "Đã nhận → sau" / UID. Nếu báo "kế hoạch bị chặn" thì **dừng** |
| 6 | Popup | **Gõ tay** mã GR (số 0, không phải chữ O; không dán) → "Cho phép điền 1 lần" | `6-popup.jpg`: "Đã cho phép điền 1 lần: GR… (Staging)" |
| 7 | POS | Khung hiện "Đã có cấp phép điền …". Bấm **"Điền vào phiếu … kế hoạch #…" một lần**, đợi xong | `7-pos-da-dien.jpg`: "đã điền N UID từ Nextwaves". Nếu báo "Điền phiếu bị dừng" thì **dừng**, chụp |
| 8 | POS | Kéo xem từng dòng phiếu (lô, SL nhận) | `8-pos-phieu.jpg` (có thể nhiều ảnh) |
| 9 | POS | Bấm **HOÀN THÀNH** trên POS (thao tác của dược sĩ) | `9-pos-hoan-thanh.jpg`: kết quả POS báo, trạng thái phiếu |
| 10 | POS | F5 trang GR (để ghi GET GR sau hoàn thành) | Trạng thái "Đã nhận" / hoàn thành |
| 11 | — | Dừng Net Capture (và lưu `nw.har` nếu dùng DevTools) | File zip / har |
| 12 | Service worker | `chrome://extensions` → "GR ← Nextwaves" → link **service worker** → Console. Gõ `allow pasting` nếu được hỏi. Dán `copy(JSON.stringify(await chrome.storage.local.get(null), null, 2))` → Enter → Notepad → Ctrl+V → lưu `extension-storage.json` | Nhật ký mọi phiên (không có token) |
| 13 | NW | (tuỳ chọn) F5 trang chi tiết PO Nextwaves | `13-nw-po-sau.jpg`: N/N đã nhận, có phiếu nhận GRN… |

Ở mỗi bước "dừng": vẫn làm bước 11–12 rồi gửi.

## 3. Gửi lại

- Mã SO, mã GR, số PO Nextwaves; giờ bấm bước 4, 7, 9.
- Net Capture tab POS (zip), Net Capture tab Nextwaves (zip) hoặc `nw.har` (sanitized).
- `extension-storage.json`.
- Ảnh `1-…` đến `9-…` (và `13-…` nếu có).

Dev sẽ:
- tách body request / response (không đọc / chép token);
- đối chiếu PUT với kế hoạch, và GET GR trước / sau điền / sau hoàn thành;
- lưu mẫu thật vào `samples/`, thay phần dữ liệu dựng lại trong test bằng dữ liệu thật;
- viết báo cáo T1 / T3 / W1 / HOÀN THÀNH cho PM.
