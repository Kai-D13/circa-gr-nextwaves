# Audit độc lập v0.3.0 — tự điền + tự HOÀN THÀNH (29/10/2026)

**Cách làm** (`agent.md` §2.2 bước 4):
- Một sub-agent Claude **chỉ đọc**, không mang kết luận của phiên chính.
- Nó đọc spec `docs/pm/DECISION-ONE-STG-AUTO-FLOW-20261028.md` §2 / §3 và finding P2.5 trong `docs/pm/AUDIT-G0-v0.2.5-G1-PRELIM-20261029.md`, rồi diff `02f2575..3171785` (src), và chạy `tests/auto.test.js` + `tests/popup.test.js` (34/34).
- Phiên chính kiểm lại từng finding trên mã, sửa, viết test trượt trên mã trước sửa, rồi thêm ca đột biến.

**Kết luận audit:** 0 P1, 5 P2, 3 P3.

Audit xác nhận đúng:
- **HOÀN THÀNH chỉ một lần:** `claimComplete` cần `applied` + `authorization.auto` + cùng `planHash` + `autoToken` của tab chủ; `completeClaim` ghi trước PUT và không bao giờ xoá; không có đường gửi lại.
- **Claim tự động:** đúng tab, quyền khớp, đúng tập UID, tiêu quyền trong cùng thao tác tuần tự.
- **Không có đường chạy:** PRD không có đường ghi; hook không đóng phiên đang tự HOÀN THÀNH; tải lại hay tab chết không tự chạy tiếp.

## Finding và xử lý

| # | Mức | Finding (tóm) | Xử lý | Test |
|---|---|---|---|---|
| F1 | P2 | Cấp quyền được sau lượt "Xác nhận nhận hàng" 2xx khi đọc lại kết quả lỗi (phiên còn `nw_ready`) → lần đọc lại sau tự chạy | `auto:arm` từ chối khi đã có `scanOk`. Background ghi `scanOkAt`; điểm kích hoạt yêu cầu quyền có trước lượt nhận (`armed_after_scan`). Popup nêu lý do, không có nút | `audit F1`, popup F1 |
| F2 | P2 | PO có biên nhận cũ + biên nhận mới → tập EPC "đủ" nhờ biên nhận cũ | `auto:arm` từ chối khi `receiptIdsBefore` khác rỗng. Điểm kích hoạt yêu cầu PO có đúng 1 biên nhận (của lượt này) | `audit F2`, popup F2, `G1 nhận` (2 biên nhận mới) |
| F3 | P2 | Huỷ / tạo lại phiên: quyền cũ còn, popup / Nextwaves vẫn báo "ĐÃ CHO PHÉP" (background đã chặn) | Huỷ phiên và tạo phiên mới cùng GR đều thu hồi quyền. Popup / Nextwaves chỉ hiện quyền có `sessionCreatedAt` = giờ tạo phiên | `G1 quyền: xoá rồi tạo lại`, popup F3 |
| F4 | P2 | P2.5 mới sửa một phần: các trường hợp vẫn hiện "đã cho phép" / "đang tự HOÀN THÀNH" dù lượt tự động không thể chạy hoặc đã dừng: tab được giao bị đóng; quyền hết hạn sau kích hoạt; phiếu đã đủ UID; dòng Nextwaves sau `apply_stopped` / lệch / chưa rõ | `tabs.onRemoved` → bỏ qua `tab_closed` + thu hồi. Tab được giao gặp `grant_invalid` thì bỏ qua. `plan.complete` thì bỏ qua `uid_already_on_gr`. Dòng Nextwaves theo trạng thái thật (`autoLineAfter`) | `audit F4` × 3, F4 Nextwaves |
| F5 | P2 | Tab khác / mở lại khuyên "tự bấm HOÀN THÀNH" khi lệnh tự động có thể còn đang gửi; tab chủ hết giờ cũng khuyên bấm ngay; không kiểm trang vừa tự HOÀN THÀNH trước PUT | Trong 2 phút (`autoCompleteGraceMs`): "đang gửi / đang tự HOÀN THÀNH ở tab khác — KHÔNG bấm", chỉ "Đọc lại". Chưa rõ: "chờ 1–2 phút rồi Đọc lại". Trước PUT kiểm `statusEpoch` (trang vừa tự HOÀN THÀNH) và cửa hàng hiện tại | `audit F5` × 2 |
| F6 | P3 | "Thu hồi" báo thành công cả khi không còn quyền (lượt đã bắt đầu) | `auto:revoke` trả có / không; popup báo "Không còn quyền tự động để thu hồi" | `audit F6`, popup F6 |
| F7 | P3 | Thiếu kiểm PO của phiếu, cửa hàng khi đọc lại / trước PUT | `autoTry` so `gr.poId` = `poPosId`; đọc lại so `posId`; trước PUT so cửa hàng hiện tại | — (lớp phụ, xem dưới) |
| F8 | P3 | Câu chữ: tự động thiếu khung báo "cấp phép vẫn giữ"; phiên chết giữa lúc gửi + dược sĩ tự hoàn thành trong 2 phút còn treo `auto_completing` tới lần đọc sau | Sửa câu chữ. Trường hợp treo: chấp nhận — lần mở phiếu sau 2 phút GET thấy COMPLETED thì đóng | — |

**Ca G1 audit thấy chưa có test**, đã thêm:
- QR sai sản phẩm;
- đơn vị Nextwaves lạ;
- nhận thiếu so với phiếu (`plan_warning`) end-to-end;
- đổi cửa hàng;
- đổi route trong lúc đọc lại (`ui_not_anchored_complete`);
- trang tự HOÀN THÀNH trong lúc đọc lại.

## Bằng chứng test sửa có tác dụng

- Test mới chạy trên src **trước sửa** (`3171785`): **8 trượt**, đúng các test F1–F6 (log `scratchpad/v030/audit-tests-on-pre-fix.log` của dev).
- Trên src sau sửa: `npm test` **221 / 221** (sau khi thêm test cho 3 ca đột biến sống: **222 / 222**).
- Đột biến: 12 ca mới cho F1–F6, tổng **205 ca**: 202 / 205, thêm test → **205 / 205** (chi tiết `BATCH-v0.3.0.md`).

**Lớp phòng thủ chồng** (test không tách được nên không có ca đột biến riêng; mỗi lớp đều có lớp khác chặn cùng hậu quả):
- tạo phiên mới thu hồi quyền — sau "huỷ phiên thu hồi";
- kiểm `statusEpoch` trước PUT — sau "khung bị gỡ khi trang tự HOÀN THÀNH";
- PO / cửa hàng (F7) — sau đọc lại PO + liên kết SO + allowlist cửa hàng;
- PO chỉ 1 biên nhận lúc kích hoạt — sau "không cho phép khi PO đã có biên nhận".
