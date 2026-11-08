# Hướng dẫn — nhận hàng RFID v0.4.1 (08/11/2026)

Thay `RUNBOOK-v0.4.0.md`.
- Kế hoạch: `PLAN-v0.4.1.md`. Báo cáo gói: `BATCH-v0.4.1.md`. Thay đổi bằng lời thường: `THAY-DOI-v0.4.1.md`.

**Khác v0.4.0:**
- **Phiếu phần còn lại** (bán gấp → POS tách phiếu): bấm "Nhận hàng bằng RFID" trên phiếu mới như phiếu thường. Extension tự nhận ra, bỏ qua tem món đã bán gấp. Mục 1f.
- **Đầu đọc bị QR Scan Log giữ:** khung Nextwaves có nút **"Lấy đầu đọc cho Nextwaves"**. Dược sĩ bấm thì extension bấm hộ "Ngắt kết nối" ở tab bán hàng rồi kết nối Nextwaves. Áp dụng cả khi mở "Nhận hàng bằng cách quét" thẳng từ trang PO Nextwaves. Mục 1c.
- Khung Nextwaves **kiểm trước khi nhận**: "điền được N UID" hoặc lý do sẽ không điền được.
- Mở nhầm phiếu gửi của đơn khác (SO tách giao) → khung **đỏ** trước khi xác nhận.
- Đơn Nextwaves nằm kho khác kho của cửa hàng (Florita / Lumina) → khung **đỏ**, không xác nhận, extension không điền.

**An toàn (extension tự giữ):** như v0.4.0 — chỉ điền khi Nextwaves đã nhận và kết quả khớp đúng đơn; không bao giờ bấm "Xác nhận nhận hàng" hay HOÀN THÀNH. Nút "Ngắt kết nối" của QR Scan Log chỉ được bấm hộ **khi dược sĩ bấm nút trên khung**, đúng một tab bán hàng, không lúc QR Scan Log đang gửi tem vào giỏ.

## 0. Cài / nâng (một lần mỗi máy)

**Thứ tự:** máy dev → QA (`QA-v0.4.1-MAY-DEV.md`) đạt → operator cho phép mới cài máy POS.

1. Không cần hoàn tất phiếu đang nhận dở: phiên v0.4.0 dùng tiếp được.
2. Giải nén gói v0.4.1 **chép đè vào đúng thư mục đang nạp** (dòng "Tải từ" trên thẻ extension; máy POS Florita `C:\circa-gr-nextwaves`, máy dev `C:\circa-gr-nextwaves-v0.2.3`). `chrome://extensions` → **Reload (↻)**. Thẻ phải ghi **0.4.1**.
3. Popup giữ nguyên (Production, tenant trống = `circa`).
4. F5 các tab POS và Nextwaves.
5. **Phiếu phần còn lại đã bấm bằng v0.4.0:** khi nâng, extension tự xoá phiên bản trước còn chờ Nextwaves mà đang khoá "SO / PO có nhiều phiếu" → bấm lại "Nhận hàng bằng RFID". Còn thấy khung cũ ("số lượng không khớp"): popup → **Xoá** phiên đó → bấm lại.

## 1. Một lượt nhận

**a. Mở phiếu.** POS → Danh sách phiếu nhận hàng → bấm **"Nhận hàng bằng RFID"** trên dòng phiếu. Extension mở (hoặc dùng lại) **một** tab Nextwaves đúng màn quét của SO.

**b. Tab Nextwaves.** Khung extension (góc dưới) ghi:
- **"Sẵn sàng nhận hàng"**; phiếu, đơn Nextwaves, số UID;
- **Kho Nextwaves: <tên> (<mã>)** — đúng cửa hàng;
- **"Kiểm trước khi nhận: số lượng khớp phiếu — điền được N UID"**. Nếu ghi **"⚠ … sẽ KHÔNG điền được phiếu POS — <lý do>"**: vẫn nhận Nextwaves được, nhưng phiếu POS nhận tay;
- dòng **Đầu đọc** (bước c).

Các trường hợp khác:
- **"Nextwaves chưa có đơn chờ nhận cho SOBD…"** → nhận tay trên POS (có tem mà vẫn báo: kiểm tài khoản Nextwaves rồi "Tìm lại").
- **SO tách giao:** chọn đúng đơn PO-… khung ghi. Khung **đỏ "Đang mở nhầm phiếu gửi IT-…"** → đóng hộp thoại, chọn đúng phiếu gửi khung ghi, rồi mới quét.
- Khung **đỏ "Đơn Nextwaves ở kho KHÁC cửa hàng — không xác nhận nhận hàng"** → **không bấm "Xác nhận nhận hàng"** (nhận vào nhầm kho không sửa lại được); nhận tay trên POS, báo vận hành.
- **"Nextwaves không còn phiếu gửi chờ nhận cho SOBD… (đơn đã nhận một phần)"** → nhận tay trên POS. SO còn lần giao khác chưa lên Nextwaves thì "Tìm lại" sau.

**c. Đầu đọc.**
- **"đã kết nối"** / **"đang quét"** → sang bước d.
- **"chưa kết nối — extension đang tự kết nối…"** → chờ vài giây (extension bấm "Kết nối đầu đọc" tối đa 3 lần).
- **"tab bán hàng (QR Scan Log) đang giữ — bấm “Lấy đầu đọc cho Nextwaves”"** (hiện sau vài giây) → bấm nút đó trên khung. Extension bấm "Ngắt kết nối" ở tab bán hàng, chờ nhả cổng, rồi kết nối Nextwaves. Lần đầu Chrome có thể hỏi chọn cổng: chọn đầu đọc.
- **"một tab POS (QR Scan Log, đang ở trang khác trang Bán hàng) đang giữ"** → tab POS vừa bán hàng đã chuyển sang trang khác (vd. danh sách phiếu nhận) nhưng QR Scan Log vẫn giữ cổng: bấm "Lấy đầu đọc cho Nextwaves" như trên.
- **"… đang gửi tem vào giỏ — đợi xong rồi bấm …"** → chờ tab bán hàng gửi xong rồi bấm lại.
- **"nhiều tab bán hàng đang mở"** / không thấy tab nào / không nhả cổng → bấm **"Mở tab bán hàng"**, bấm Ngắt kết nối ở đó, quay lại tab Nextwaves (extension tự kết nối lại).
- Cách này dùng được cả khi mở "Nhận hàng bằng cách quét" thẳng từ trang PO Nextwaves (không qua POS).

**d. Nhận (dược sĩ).** Đặt hàng lên đầu đọc tới **còn lại 0, ngoài phiếu 0** → bấm **"Xác nhận nhận hàng" đúng một lần**. Không chọn "Đóng đơn dù còn thiếu" (riêng phiếu phần còn lại: mục 1f).

**e. Tự về POS và tự điền.** Tab Nextwaves tự đóng, tab POS về đúng phiếu, khung "Đang điền i/n — CHƯA bấm HOÀN THÀNH" → xong: **"GR…: đã điền N mã vào M lô — kiểm danh sách rồi bấm HOÀN THÀNH"**. Đã lấy đầu đọc từ tab bán hàng → khung nhắc **sang tab bán hàng bấm "Kết nối RFID"** (QR Scan Log hỏi chọn cổng) để bán tiếp.

**f. Phiếu phần còn lại** (đã bán gấp vài món, bấm HOÀN THÀNH sớm, POS tách phiếu mới):
1. **Trước khi HOÀN THÀNH phiếu đầu:** món bán gấp phải được **quét QR** trên phiếu (không nhập số tay). Không quét → extension không biết tem nào đã bán → phần còn lại nhận tay.
2. Trên **phiếu mới** bấm "Nhận hàng bằng RFID". Khung Nextwaves ghi "Phiếu phần còn lại — đã nhận trước ở GR…", "N UID cần quét (đơn M, trừ K món đã bán gấp)".
3. Quét hết hàng còn lại. Màn quét báo **thiếu K** (đúng món đã bán gấp) → để **"Giữ đơn mở"** → bấm "Xác nhận nhận hàng". Chọn "Đóng đơn dù còn thiếu" → khung **đỏ** cảnh báo (Nextwaves sẽ báo Buymed giao thiếu — sai).
4. Extension coi là đủ, về POS, điền phần còn lại (không điền tem đã bán).
5. Khung POS vàng **"Nextwaves đã nhận cả K tem món đã bán gấp … tồn Nextwaves dư"** → hàng đã bán còn nằm trên đầu đọc lúc nhận: báo vận hành điều chỉnh tồn Nextwaves.
6. Thiếu tem **khác** món đã bán → extension không điền ("còn thiếu …"): nhận tay.

**g. HOÀN THÀNH (dược sĩ).** Kiểm số lượng từng lô → bấm **HOÀN THÀNH** của POS. Khung ghi "bấm HOÀN THÀNH bây giờ thì POS tách phần chưa đủ sang một phiếu mới" → còn sản phẩm chưa đủ: nhận tay phần đó trước, hoặc chấp nhận POS tách phiếu.

**h. Lượt đầu ở mỗi máy:** dán `kiem-sau.js` vào Console của Service worker → gửi kết quả cho Claude. Kỳ vọng: `state` "applied" / "done"; `dien.how` "auto"; `khopCuoi` "ok"; phiếu phần còn lại: `phanConLai.phieuXong` có, `khiThieu` "keep_open", `banGapVanNhan` 0.

## 2. Khi khung báo dừng

| Khung ghi | Làm gì |
|---|---|
| "Kết quả nhận chưa đủ bằng chứng / không khớp dữ liệu đơn" (Nextwaves) | Không bấm gì thêm, chụp màn hình. Nhận tay, báo Claude |
| "Nextwaves đã nhận X/Y UID — còn thiếu Z" | Phiếu gửi chỉ nhận một lần — phần thiếu không quét bổ sung được. Nhận tay trên POS |
| "Nextwaves ĐÃ nhận — POS CHƯA điền" | Phiên mất. Nhận tay phiếu đó |
| "Không điền được — N điểm chặn" (POS) | "Kiểm tra lại"; vẫn chặn → nhận tay, báo Claude |
| "Điền phiếu bị dừng" + "Đọc lại và điền tiếp" | Chờ ~1 phút rồi bấm |
| "đã điền nhưng đọc lại chưa khớp hoàn toàn — Lệch: …" (giữ cả sau F5) | Kiểm từng lô; đúng thì HOÀN THÀNH, sai thì báo Claude |
| "Chỉ xem kế hoạch — chưa được điền phiếu" | Phiếu bị khoá → nhận tay |

## 3. Tắt / quay lại bản cũ

- **Tắt:** popup → Môi trường "— Chưa chọn —" → Lưu, hoặc tắt thẻ ở `chrome://extensions`.
- **Quay lại v0.4.0:** popup → **Xoá** các phiên đang mở (nhất là phiếu phần còn lại) → chép gói v0.4.0 (`C:\circa-gr-nextwaves-release\v0.4.0\`) đè vào thư mục, Reload.
