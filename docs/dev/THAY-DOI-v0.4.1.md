# v0.4.1 — thay đổi so với v0.4.0 (bản ghi cho operator, 08/11/2026)

Bản đang cài: **v0.4.0** (`79D4269C`). Bản sắp build: **v0.4.1**, một gói. Cài máy dev (QA) trước, rồi máy POS; mỗi bước chỉ khi operator cho phép.

v0.4.1 gồm:
- **2 tính năng mới:**
  - A. phiếu phần còn lại sau khi bán gấp;
  - B. lấy đầu đọc khi QR Scan Log đang giữ.
- **3 cảnh báo mới trước khi bấm "Xác nhận nhận hàng"** (finding audit v0.4.0 F1–F3).
- **Sửa ổn định** (audit P3 + review 08/11). Thao tác không đổi.

Phần lõi an toàn giữ nguyên (mục E).

Báo cáo kỹ thuật: `BATCH-v0.4.1.md`. Hướng dẫn: `RUNBOOK-v0.4.1.md`.

## Tóm tắt — trước / sau

| Tình huống | v0.4.0 (đang cài) | v0.4.1 (sắp build) |
|---|---|---|
| Bán gấp vài món → HOÀN THÀNH sớm → POS tách phiếu phần còn lại | Extension dừng ("SO có nhiều phiếu…" / "số lượng không khớp") → nhận tay | Bấm "Nhận hàng bằng RFID" trên phiếu mới như thường. Extension tự bỏ tem món đã bán, điền phiếu mới |
| QR Scan Log ở tab bán hàng đang giữ đầu đọc | Dược sĩ tự sang tab bán hàng bấm "Ngắt kết nối", rồi quay lại | Nút **"Lấy đầu đọc cho Nextwaves"** trên khung Nextwaves: extension bấm hộ |
| Mở "Nhận hàng bằng cách quét" thẳng từ trang PO Nextwaves | Không có khung, không tự kết nối | Có khung đầu đọc, tự kết nối, có nút lấy đầu đọc |
| Phiếu POS sẽ không điền được | Chỉ biết **sau** khi đã xác nhận nhận hàng | Báo **trước**: "điền được N UID" hoặc lý do |
| SO tách giao, mở nhầm phiếu gửi của đơn kia | Không báo | Khung **đỏ** trước khi xác nhận |
| Đơn Nextwaves nằm ở kho của cửa hàng khác | Không kiểm | Khung **đỏ**, extension không điền |
| Nextwaves đã nhận một phần đơn này từ trước | Báo nhầm "số lượng không khớp" | "Nextwaves không còn phiếu gửi chờ nhận … — nhận tay" |
| Điền xong mà khớp cuối có lệch, rồi F5 | Khung chuyển xanh (mất cảnh báo) | Vẫn vàng "Lệch: …" tới khi HOÀN THÀNH |

## A. Phiếu phần còn lại (tính năng mới)

**Đã xảy ra gì (07/11, Florita):**
- Với phiếu GR84673, dược sĩ nhận trước 1 món để bán gấp rồi bấm HOÀN THÀNH.
- POS tự sinh phiếu GR84803, cùng PO, cho phần chưa nhận.
- Nextwaves vẫn chỉ có một phiếu gửi cho cả đơn, và mỗi phiếu gửi chỉ nhận được một lần.
- v0.4.0 dừng an toàn, nên phần còn lại phải nhận tay.

**v0.4.1 làm gì:**

1. **Nhận ra phiếu phần còn lại.**
   - Dược sĩ bấm "Nhận hàng bằng RFID" trên phiếu mới. Extension đọc PO và từng phiếu đã HOÀN THÀNH của PO đó.
   - Extension cộng từng dòng: SL phiếu mới + SL đã nhận ở các phiếu trước phải bằng SL dòng PO. Phải khớp hết mới làm tiếp.
   - Không chứng minh được thì extension không điền (như v0.4.0). Khung POS ghi lý do, ví dụ "phiếu này đã được nhận tay một phần", "PO còn phiếu khác chưa HOÀN THÀNH".
2. **Biết món nào đã bán gấp.**
   - Lúc HOÀN THÀNH phiếu đầu, POS gắn vào mỗi hộp đã quét QR đúng UID Nextwaves (tem con) của hộp đó.
   - Extension lấy các UID này và bỏ khỏi danh sách cần quét. Ví dụ GR84673: tem `1793929018293B31` (Arrahan).
3. **Khung trên tab Nextwaves ghi:**
   - "Phiếu phần còn lại — đã nhận trước ở GR…";
   - "N UID cần quét (đơn M, trừ K món đã bán gấp)";
   - "Màn quét sẽ báo thiếu K tem món đã bán gấp: để “Giữ đơn mở” rồi bấm “Xác nhận nhận hàng”."
   - Nếu đang chọn "Đóng đơn dù còn thiếu", khung chuyển **đỏ**. Lý do: Nextwaves sẽ báo Buymed giao thiếu, mà món đó thực ra đã giao và đã bán.
4. **Sau khi xác nhận:**
   - Nextwaves thiếu **đúng** các tem đã bán gấp → extension coi là đủ, về POS và điền phiếu mới (không điền tem đã bán).
   - Thiếu tem **khác** → dừng, nhận tay (như v0.4.0).
5. **Các trường hợp phụ:**
   - **Hộp đã bán gấp còn nằm trên đầu đọc lúc nhận:** Nextwaves nhận cả tem đó. Extension vẫn điền, khung POS vàng "Nextwaves đã nhận cả K tem món đã bán gấp … tồn Nextwaves dư K, báo vận hành điều chỉnh".
   - **Lượt nhận đã chọn "Đóng đơn dù còn thiếu":** khung POS nhắc báo vận hành.
   - **Điền xong mà phiếu còn sản phẩm chưa đủ:** khung ghi "Bấm HOÀN THÀNH bây giờ thì POS tách phần chưa đủ sang một phiếu mới."
   - **Nextwaves đã nhận đơn này một phần từ trước (phiếu gửi đã dùng):** khung ghi "Nextwaves không còn phiếu gửi chờ nhận cho SO này — nhận tay", kèm nút "Tìm lại trên Nextwaves" (dùng khi SO còn lần giao khác chưa lên Nextwaves).

**Điều kiện vận hành (operator 08/11):** món bán gấp phải **quét QR** trên phiếu POS trước khi HOÀN THÀNH.
- Nếu nhập số tay, POS không gắn UID, nên extension không biết tem nào đã bán.
- Khi đó khung "Kiểm trước khi nhận" báo "sẽ KHÔNG điền được", và phần còn lại phải nhận tay.

**Đã kiểm (chỉ đọc):**
- Chạy trên dữ liệu thật staging và trên production dựng lại đúng lúc vừa tách (GR84673 + GR84803 + PO01974970).
- Kết quả: nhận ra đúng phiếu phần còn lại, tem đã bán đúng là `1793929018293B31`.
- **Chưa có lượt ghi thật nào** cho phiếu phần còn lại. Lượt đầu chạy kèm `kiem-truoc.js` / `kiem-sau.js`.

## B. Lấy đầu đọc khi QR Scan Log đang giữ (tính năng mới)

**Đã xảy ra gì:**
- QR Scan Log 0.9.6 giữ cổng đầu đọc ở tab bán hàng, nên "Kết nối đầu đọc" của Nextwaves không được.
- Với v0.4.0, dược sĩ phải tự chuyển tab, bấm "Ngắt kết nối", rồi quay lại.
- Nếu mở modal quét thẳng từ trang PO Nextwaves, v0.4.0 không làm gì.

**v0.4.1 làm gì:**

1. **Tự kết nối.** Extension nhận ra modal "Nhận hàng bằng cách quét" trên mọi trang Nextwaves, **kể cả khi mở thẳng từ trang PO** (không qua POS). Extension tự bấm "Kết nối đầu đọc" tối đa 3 lần, như v0.4.0, nay áp dụng cả khi không có phiên.
2. **Hiện nút.** Không kết nối được thì extension hỏi các tab POS (chỉ đọc). Nếu có **đúng một** tab bán hàng đang giữ đầu đọc, khoảng 2 giây sau khung ghi "tab bán hàng (QR Scan Log) đang giữ — bấm “Lấy đầu đọc cho Nextwaves”" kèm nút đó.
3. **Dược sĩ bấm nút:**
   - extension bấm hộ "Ngắt kết nối" ở đúng tab đó;
   - chờ cổng nhả, tối đa 5 giây;
   - bấm ngay "Kết nối đầu đọc" của Nextwaves.
   
   Lần đầu Chrome có thể hỏi chọn cổng: chọn đầu đọc.
4. **Không bấm hộ khi:**
   - QR Scan Log đang gửi tem vào giỏ, vì Ngắt lúc đó làm hỏng lượt đang gửi. Khung ghi "đợi xong rồi bấm";
   - có từ 2 tab bán hàng đang giữ trở lên, nút Ngắt của QR Scan Log đang tắt, hoặc không thấy tab nào. Khi đó khung hiện nút **"Mở tab bán hàng"** kèm hướng dẫn Ngắt tay.
5. **Tab bán hàng đã chuyển sang trang POS khác** (ví dụ danh sách phiếu nhận) mà QR Scan Log vẫn giữ cổng: extension vẫn nhận ra, khung ghi "đang ở trang khác trang Bán hàng", và bấm được như trên.
6. **Xong lượt:**
   - Khung nhắc "sang tab bán hàng bấm “Kết nối RFID” (chọn cổng)". Lời nhắc hiện trên khung Nextwaves nếu không có phiên, trên khung POS nếu có phiên.
   - Sau khi bị Ngắt, QR Scan Log luôn hỏi chọn cổng.

**An toàn:** extension không bao giờ tự Ngắt khi dược sĩ chưa bấm nút.

**Hạn chế:**
- Cách này dựa vào giao diện QR Scan Log 0.9.6 (khung, nút Ngắt, khoá cổng).
- Nếu QR Scan Log đổi giao diện, extension không thấy tab giữ và lùi về "Mở tab bán hàng" (làm tay như v0.4.0).
- Bản chính thức, trong đó QR Scan Log tự cho mượn / trả đầu đọc mà không cần bấm hộ, chờ đội QR Scan Log làm theo `REQUEST-QSL-v0.4.1-DAU-DOC.md`.

## C. Báo trước khi bấm "Xác nhận nhận hàng" (audit v0.4.0 F1–F3)

| Kiểm | Khung Nextwaves ghi | Ý nghĩa / làm gì |
|---|---|---|
| **Kiểm trước** (F2) | "Kiểm trước khi nhận: số lượng khớp phiếu — điền được N UID" | Nhận xong extension sẽ điền được. Lô còn được kiểm sau khi nhận |
| | "⚠ Kiểm trước khi nhận: extension sẽ KHÔNG điền được phiếu POS — <lý do>" | Vẫn nhận Nextwaves được, nhưng phiếu POS phải nhận tay. Lý do có thể là: sản phẩm không có dòng trên phiếu; đơn vị Nextwaves không có trên sản phẩm POS; quy đổi ra số lẻ; Nextwaves nhiều hơn phiếu; phiếu đã có lượng nhận tay |
| **Nhầm phiếu gửi** (F1) | Khung đỏ "Đang mở nhầm phiếu gửi IT-…" | SO tách giao thành 2 đơn và modal đang mở phiếu gửi của đơn kia → đóng hộp thoại, chọn đúng phiếu gửi mà khung ghi |
| **Sai kho** (F3) | Khung đỏ "Đơn Nextwaves ở kho KHÁC cửa hàng — không xác nhận nhận hàng" | Extension có bảng cửa hàng ↔ kho Nextwaves cho Florita, Lumina (và cửa hàng thử staging). Kho lệch → không xác nhận, extension không điền. Cửa hàng chưa có trong bảng → chỉ nhắc kiểm kho |

Chưa báo trước được: lỗi tra mã QR. Lỗi này vẫn chỉ biết sau khi nhận.

## D. Sửa ổn định (thao tác không đổi)

- **Kết quả khớp cuối được lưu.** Điền xong mà đọc lại có lệch thì khung vàng "Lệch: …" giữ tới khi HOÀN THÀNH; F5 không xoá. (v0.4.0: F5 hiện xanh.)
- **Tab Nextwaves.**
  - Hai phiếu không dùng chung một tab.
  - Nhận xong hoặc huỷ thì đóng cả tab cũ của phiếu.
  - Không dùng lại tab đang có lượt nhận dở; mở tab mới.
- **Khung extension** cao tối đa khoảng nửa màn hình (45%, trước là 70%), nên không che nút "Kết nối đầu đọc" của Nextwaves.
- **Khung không bị mất hay bị thay.**
  - Khung "chưa có đơn" luôn hiện, kể cả khi lưu phiên bị lỗi.
  - Modal mở lúc khung đang báo lỗi thì giữ khung lỗi, chỉ thêm dòng và nút đầu đọc.
- **Nhẹ hơn.**
  - Chỉ dò nút đầu đọc khi màn quét / modal đang mở.
  - Tab Nextwaves chỉ vẽ lại khi phiên của chính nó đổi.
  - Bỏ một đoạn mã không dùng.
- **Không mất dữ liệu khi F5.** Lựa chọn khi thiếu (Giữ / Đóng) và danh sách tem Nextwaves báo thiếu được lưu trong phiên.
- **Nâng từ v0.4.0.** Phiên cũ kẹt trên phiếu phần còn lại ("SO có nhiều phiếu…", chưa nhận Nextwaves) tự xoá; dược sĩ bấm lại "Nhận hàng bằng RFID".
- **Lỗi mạng khi đọc phiếu đã xong của PO.** Khung báo "thử bấm lại", không tạo phiên khoá.
- **Script kiểm.** `kiem-truoc.js` / `kiem-sau.js` in thêm: phiếu phần còn lại, tem bán gấp, khớp cuối, lựa chọn khi thiếu, lần lấy đầu đọc.

## E. Giữ nguyên

- Extension **không bao giờ** bấm "Xác nhận nhận hàng" hay HOÀN THÀNH, và không gọi API ghi của Nextwaves.
- Extension chỉ điền khi Nextwaves đã nhận và kết quả khớp đúng đơn.
- Phiếu thường (không tách) đi đúng luồng như v0.4.0.
- Popup và cách cài giữ nguyên: chép đè thư mục, Reload, giữ Extension ID.
- Phiên v0.4.0 đang làm dở dùng tiếp được.

## F. Chưa có trong v0.4.1

- Món bán gấp **nhập số tay** (không quét QR): phần còn lại nhận tay (I2, để sau).
- Nextwaves đã nhận cả đơn ở phiếu gốc trước khi POS tách: phiếu mới nhận tay.
- Mượn / trả đầu đọc theo hợp đồng với QR Scan Log (không bấm hộ): chờ đội QR Scan Log.
- Báo trước lỗi tra mã QR.

## G. Dược sĩ / operator làm khác gì

1. **Bán gấp:** quét QR món bán gấp trên phiếu POS trước khi bấm HOÀN THÀNH.
2. **Phiếu phần còn lại:** bấm "Nhận hàng bằng RFID" trên phiếu mới như thường. Khi màn quét báo thiếu đúng K món đã bán, chọn **"Giữ đơn mở"** rồi bấm "Xác nhận nhận hàng".
3. **Đầu đọc bị QR Scan Log giữ:** bấm "Lấy đầu đọc cho Nextwaves". Xong lượt, sang tab bán hàng bấm "Kết nối RFID" (chọn cổng).
4. **Khung đỏ** trên tab Nextwaves nghĩa là không bấm "Xác nhận nhận hàng".
5. **Operator:** chuyển `REQUEST-QSL-v0.4.1-DAU-DOC.md` cho đội QR Scan Log.
