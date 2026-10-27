# Spec P2 (v0.2.4) — khung extension trên trang phiếu GR không che cột "SL nhận" (dev đề xuất, 27/10/2026)

**Căn cứ:** `docs/pm/REVIEW-PLAN-STG-DONE-PRD-20261027.md` §3 (PM duyệt hướng nghiên cứu "trong luồng trang", chưa duyệt layout / code).

**Vấn đề:** ở 1095×756 (ảnh G3a-6), khung nổi 460px góc dưới phải che cột "SL nhận" (+ / − / xoá) của dòng sản phẩm. HỦY / HOÀN THÀNH không bị che.

## 1. DOM thật trang phiếu (khảo sát chỉ đọc, GR03887, POS staging, 27/10, 1095×756)

```
div#__next
└─ div.flex.flex-col (MuiBox)
   └─ div.relative.flex.flex-col.overflow-scroll      ← KHUNG CUỘN của trang (không phải window), top 50, cao 1108
      └─ div.px-3.pt-0.space-y-3.pb-20                 ← cột nội dung
         ├─ div.flex.-ml-[12px].z-50.px-4              breadcrumb (top 50, cao 40)
         ├─ div.p-4.!mt-[45px].rounded-[16px]           thẻ thông tin phiếu: "Chi tiết phiếu nhận hàng GR… (PO…)" + bảng thông tin (top 95, cao 197)
         ├─ div#all-receipt.w-full                      thẻ "Danh sách sản phẩm nhập kho" + bảng sản phẩm (top 304, cao 738)
         └─ div.fixed.bottom-0.right-0.z-50             thanh HỦY / HOÀN THÀNH (849, 681, 246×75)
```

- **Anchor đề xuất: `#all-receipt`** (id ổn định, đúng vùng của phiếu). Khối của extension chèn **ngay trước** nó, cùng cha.
- **Không dùng `document.querySelector("table")`:** bảng đầu tiên trên trang là bảng **thông tin phiếu**, không phải bảng sản phẩm.
- **Thử thật (chèn một khối thử rồi gõ lọc trong ô "Tìm kiếm tên sản phẩm", React vẽ lại còn 4 dòng):**
  - khối thử **còn nguyên**, vẫn ngay trước `#all-receipt`;
  - `#all-receipt` vẫn là cùng một node.

  Rời trang thì React gỡ cả cây. Quay lại thì cây mới, extension phải chèn lại (như vùng thông báo danh sách F4: route + MutationObserver, idempotent).
- Dev đã gỡ khối thử, xoá ô lọc và đặt lại khung nhìn; không ghi gì lên server.

## 2. Đề xuất layout (PM chọn)

**A (dev khuyên) — khối trong luồng trang, dính đầu khung cuộn:**
- Trên **trang phiếu** (`/danh-sach-phieu-nhan-hang/<grId>`), khung extension là một khối **trong luồng trang** ngay trước `#all-receipt`, rộng bằng cột nội dung.
- `position: sticky; top: 0` trong khung cuộn của trang, nên luôn nhìn thấy trạng thái / nút khi cuộn bảng.
- Không che vĩnh viễn điều khiển nào: phần bảng chỉ cuộn qua dưới khối, cuộn tiếp là thấy.
- Cao tối đa ~40% khung nhìn; nội dung dài (bảng kế hoạch) cuộn bên trong khối.
- **Không tự thu nhỏ.** Dược sĩ tự thu nhỏ thành một dải tiêu đề, giữ màu trạng thái và tiêu đề, nên cảnh báo / quyền điền vẫn nhận ra.

**B — khối trong luồng trang, không dính:**
- Như A nhưng cuộn đi theo trang.
- Khi khối ra khỏi khung nhìn mà cần thao tác (có kế hoạch / cấp phép / lỗi), hiện một nhãn nhỏ cạnh thanh HỦY / HOÀN THÀNH ("GR ← Nextwaves: cần thao tác ↑"), bấm thì cuộn tới khối.
- Ít chiếm chỗ hơn A, nhưng thêm một phần tử nổi nhỏ.

**Ngoài phạm vi P2, giữ nguyên:**
- danh sách (vùng thông báo F4);
- `/chi-tiet-so/<SO>`;
- Nextwaves (khung nổi + tránh nút);
- `session`, plan hash, grant, W1, callback Nextwaves.

**Anchor không tìm thấy** (POS đổi giao diện): **không** chèn vào `body`. Dùng lại khung nổi hiện tại (đã tránh HỦY / HOÀN THÀNH) và ghi chẩn đoán vào log phiên. PM có thể chọn thay bằng "không hiện khung + báo lỗi giao diện".

## 3. Cách làm (sau khi PM duyệt A hoặc B)

- `panel.js`: thêm cách gắn **"trong luồng"** (host chèn trước anchor, vẫn Shadow DOM, cùng hàm vẽ nội dung / nút).
  - Danh sách và Nextwaves vẫn gọi cách gắn nổi như cũ, không đổi hành vi.
- `pos-content.js`: trang phiếu tạo khung với anchor `#all-receipt`.
  - Route / vẽ lại → gắn lại idempotent (một host duy nhất, giữ trạng thái thu nhỏ).
  - MutationObserver bỏ qua thay đổi của chính host.
- v0.2.4: version / ZIP / SHA mới.

## 4. Gate (trước khi giao PM)

- **Node:** mọi trạng thái của khung trang phiếu vẫn ra đúng nút / hành động; nút "Điền" (grant / plan / apply) hồi quy đầy đủ.
- **Edge (bản giải nén)** trên trang phiếu dựng theo DOM thật (khung cuộn, thẻ thông tin, `#all-receipt` với dòng có + / − / xoá, thanh HỦY / HOÀN THÀNH), ở **1095×756, 1366×768, 1440×900**:
  - các trạng thái `waiting_nw`, `nw_ready`, `received` (kế hoạch dài), có cấp phép, `applying`, `applied`, cảnh báo / lỗi;
  - khung đọc được, nút trong khung bấm được;
  - **mọi + / − / xoá của mọi dòng** bấm được (cuộn tới rồi kiểm điểm giữa);
  - HỦY / HOÀN THÀNH không bị che;
  - vẽ lại (lọc) và rời / quay lại không nhân đôi khung, không vòng observer;
  - ngân sách (< 50 ms mọi tác vụ).
- Đối chứng gói v0.2.3 phải **hỏng** mục "SL nhận bấm được" ở 1095.
- Sau PM audit: một ảnh trang thật ở ~1095px có khung và cột "SL nhận" + HOÀN THÀNH cùng thấy. Dev tự quan sát nếu truy cập được.

**Công sức ước tính:** ~1 ngày code + test sau khi PM duyệt layout.
