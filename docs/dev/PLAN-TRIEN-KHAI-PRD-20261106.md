# Triển khai production Florita — hai đơn thật đầu tiên (06/11/2026)

Gói **v0.3.1 3E44C1DC** (`docs/dev/BATCH-v0.3.1.md`). Hướng dẫn từng bước: `docs/dev/RUNBOOK-PRD-FLORITA-v0.3.1.md`.
Ghi production chỉ khi operator cho phép bằng chữ, **đúng một phiếu mỗi lần**.

## 0. Dữ liệu operator báo (06/11)

| | Nextwaves (PO) | POS Circa (GR) |
|---|---|---|
| Cặp 1 | `087bedc0-bdfa-48ff-a06c-60496a168900` | `db0af356-990d-4735-b708-3fb69eac8964` |
| Cặp 2 | `be7e2d4b-1864-437b-8b4e-1baeb4bf2803` | `a4943005-bb77-4ee7-a165-e8ebc3e1a1d1` |

Ghép cặp ở trên theo thứ tự operator gửi, chưa kiểm. Extension tự tìm PO Nextwaves theo SO của GR. `kiem-truoc.js` in ra số PO thật để đối chiếu.

## 1. Điều kiện trước đơn đầu

| # | Điều kiện | Vì sao | Ai |
|---|---|---|---|
| C1 | v0.3.1 đã cài trên máy POS Florita, popup chọn **Production** (hướng dẫn §0) | Chưa cài thì không có gì để chạy | operator |
| C2 | Hai PO **không** liên kết phiếu Circa bằng tích hợp riêng của Nextwaves | Nextwaves có tích hợp Circa (liên kết PO ↔ GR). Đã liên kết thì khi nhận đủ, Nextwaves **tự ghi UID và tự hoàn tất phiếu**. Extension cũng ghi → **ghi trùng**. Extension không đọc được trạng thái này: luật dự án cấm gọi `/integrations/circa/*`. Staging luôn `linked: false`, production chưa biết | operator xem trên trang PO Nextwaves |
| C3 | Đủ tem vật lý của PO tại Florita | Chỉ bấm "Xác nhận nhận hàng" khi màn quét báo còn lại 0 | operator / dược sĩ |

C2 mà đã liên kết → **không dùng extension cho PO đó**. Hai cách xử lý:
- bỏ liên kết trong Nextwaves rồi dùng extension;
- để Nextwaves tự xử lý PO đó.

## 2. Thứ tự

1. **Đơn 1, cặp nào sẵn hàng trước.** Chạy tự động theo hướng dẫn §1 a → j.
   - Gửi Claude ba thứ: kết quả `kiem-truoc.js`, số tem, câu cho phép.
   - Claude đối chiếu:
     - đúng Florita, đúng SO / PO, `kho` có;
     - mọi dòng "có tem";
     - SL GR = SL Nextwaves từng sản phẩm;
     - số tem = tem vật lý;
     - đơn vị dòng có quy đổi lẻ không (vỉ → hộp phải đủ cả hộp, R1 / R11).
   - Đạt thì operator cho phép tự động, chạy chốt chặn, rồi nhận.
2. **Đánh giá đơn 1.** Gửi kết quả `kiem-sau.js` + 2 capture. Claude chốt như G3:
   - 1 lượt nhận, 1 biên nhận mới;
   - số PUT = số lô, đọc lại khớp;
   - đúng 1 HOÀN THÀNH;
   - không ghi phiếu khác.
3. **Đơn 2:** chỉ sau khi đơn 1 đạt, cùng cách làm.
4. **Sau hai đơn đạt:**
   - merge `batch/v0.3.1-prd` → `main` (khi operator đồng ý);
   - dùng thường xuyên tại Florita;
   - Go chính thức theo plan: thêm 1 đơn tự động đạt nữa, tổng 3 đơn liên tiếp.

**Một bản cho cả hai đơn.** Không đổi gói giữa hai đơn, trừ khi đơn 1 lộ lỗi phải sửa. Khi đó ra bản mới, cài một lần, chạy lại từ đơn kế tiếp.

## 3. Đơn dừng giữa chừng

Theo hướng dẫn §2:
- Không cho phép tự động lại trên cùng đơn.
- Phiếu chưa bị ghi → dược sĩ nhận tay như hiện nay.
- Phiếu đã điền một phần → dược sĩ xem phiếu, quét tay phần thiếu rồi HOÀN THÀNH.
- "Chưa rõ đã HOÀN THÀNH chưa" → mở phiếu: "Đã nhận" là xong; còn "Đang nhận" và đủ lô thì bấm HOÀN THÀNH một lần.
- Gửi `kiem-sau.js` + capture để Claude tìm nguyên nhân.

## 4. Tuỳ chọn: chạy thử kế hoạch trước, chỉ đọc

Áp dụng nếu Chrome trên laptop này đã đăng nhập POS production (tài khoản Florita) và Nextwaves production. Claude tự đọc (GET) hai cặp:
- phiếu GR;
- PO / phiếu gửi Nextwaves cùng UID dự kiến;
- tra QR từng UID.

Sau đó Claude dựng kế hoạch bằng chính mã của extension, ngoài trình duyệt. Mục đích: biết trước đơn nào sẽ **chạy được tự động**, và đơn nào sẽ bị chặn (quy đổi lẻ, lô lệch, thiếu tem) trước khi dược sĩ đụng vào. Không ghi gì, không bấm nút nào.

Không đăng nhập được thì bỏ mục này. Bước `kiem-truoc.js` trên máy POS vẫn chặn được phần lớn các trường hợp, chỉ không biết trước lô của từng UID.
