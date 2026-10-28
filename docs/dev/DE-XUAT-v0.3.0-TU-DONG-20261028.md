# Đề xuất kỹ thuật v0.3.0 — tự điền + tự HOÀN THÀNH một lần (28/10/2026)

Theo `docs/pm/DECISION-ONE-STG-AUTO-FLOW-20261028.md` §2–§3. Nền: v0.2.5 (P2 / P3 của PM AUDIT-A1, gói nội bộ `792817B9`), giữ nguyên P2 / P3. Chế độ thủ công (cấp phép điền → bấm Điền → dược sĩ HOÀN THÀNH) **không đổi** khi không bật tự động.

**Hợp đồng ghi mới duy nhất:** `PUT …/v1/order/goods-receipt/<grId>/status/COMPLETED`, không body. Đây đúng là request trang POS gửi ở A1 (200, response rỗng, GET sau trả `COMPLETED`; mẫu `samples/pos-stg-gr-status-COMPLETED-GR03887-20261028.json`, `…-GR03880-20261026.json`). Không khác A1 nên không cần chờ PM trước khi code (spec §4). Body W1 `PUT …/detail`, quy đổi và kế hoạch giữ nguyên.

## 1. Quyền tự động một lần (§2.1)

**Lưu ở đâu.** Khoá storage mới `autoGrants`, tách khỏi `grants` của chế độ thủ công. Khoá = khoá phiên `<ENV>:<grId>`. Bản ghi gồm:
- `schema`, `key`, `sessionCreatedAt`;
- `envId`, `posId` + `posName`, `grId` + `grCode`, `soBase` + `deliveryCode`, `nwPoId` + `nwPoNumber`, `warehouseId`;
- `epcs`: tập EPC dự kiến, sắp xếp, chữ hoa — lấy từ `session.expected` mà tab Nextwaves đã khớp;
- `createdAt`, `expiresAt` (30 phút).

Không token / cookie.

**Tạo quyền.** Message `auto:arm {key, confirm}`, **chỉ từ popup** (sender không có tab). Background tự lấy mọi trường từ phiên, không nhận từ trang. Chỉ cấp khi đủ cả các điều kiện:
- phiên `schema` hiện hành, trạng thái `nw_ready`;
- môi trường ghi được (chỉ STG), cửa hàng trong allowlist (2222);
- `writeBlockers` rỗng, có `warehouseId` / `nwPoId`, EPC dự kiến không rỗng và không trùng;
- `confirm` popup gửi kèm (`grCode`, `nwPoNumber`, số tem) **trùng** phiên lúc cấp. Popup cũ / phiên đã đổi thì từ chối.

Mỗi phiên tối đa một quyền. Có `auto:revoke`. Nhật ký phiên ghi `auto_armed` (mã, số tem, giờ hết hạn).

**Quyền còn hiệu lực** khi tất cả các điều sau đúng:
- chưa hết hạn, schema hiện hành;
- cùng `key` + `sessionCreatedAt` (phiên bị xoá và tạo lại thì không thừa hưởng);
- cùng GR / cửa hàng / SO / PO Nextwaves / kho.

**Popup.** Phiên `nw_ready` của môi trường ghi được có nút **"Cho phép tự điền và HOÀN THÀNH 1 lần"**. Bấm thì mở khung xác nhận, ghi rõ:
- môi trường, cửa hàng, GR, SO, PO Nextwaves, số tem dự kiến;
- câu: "Sau khi dược sĩ xác nhận nhận hàng trên Nextwaves, extension tự điền và **POS sẽ tự HOÀN THÀNH** sau khi đọc lại đúng toàn bộ phiếu. Hết hạn sau 30 phút."

Phải bấm "Xác nhận cho phép" mới gửi. Quyền đang có hiện giờ hết hạn và nút "Thu hồi". Không dùng lại ô "Cho phép điền 1 lần".

**Khung Nextwaves "Sẵn sàng nhận hàng"** thêm một dòng trạng thái tự động: đã cho phép (hết hạn HH:MM) / chưa cho phép (điền thủ công). Chỉ để dược sĩ / operator thấy trước khi bấm nhận.

## 2. Kích hoạt sau khi Nextwaves nhận (§2.2)

**Background `received()`** — điểm kích hoạt **duy nhất**, đúng một lần khi phiên chuyển `nw_ready` → `received`. Đầu vào đã có điều kiện: lượt `receive-scan` 2xx của phiên, đọc lại đủ, không thiếu / thừa / lạ, có biên nhận mới. Thêm các điều kiện:
- quyền còn hiệu lực;
- tập EPC nhận được **bằng đúng** `autoGrant.epcs`;
- số biên nhận mới (`receiptIds` trừ `receiptIdsBefore`) **= 1**.

Đủ thì ghi `session.autoRun = {at, tabId}` (`tabId` = tab POS mà background đưa dược sĩ về) và log `auto_ready`. Thiếu thì log `auto_skipped {reason}` và đi đường thủ công. Phiên cũ, F5, `nw_ready` hay kết quả tìm đơn không bao giờ đặt `autoRun`.

**POS (`planAndOffer`)** — chỉ chạy tự động khi `auto:status` trả đủ điều kiện:
- `autoRun` có, đúng tab;
- quyền còn hiệu lực;
- trạng thái `received`, chưa có `authorization`.

Sau đó kiểm tiếp:
1. GET lại GR và PO: `resolveDelivery` ra đúng `deliveryCode` / SO / cửa hàng; GR còn nhận được.
2. Tra QR 15 UID, lập kế hoạch như W1.
3. Kế hoạch phải đạt **tất cả**:
   - `ok`, 0 chặn, 0 cảnh báo;
   - `alreadyOnGr = 0`;
   - mọi chi tiết của GR có bước, `before = 0`, `target = quantity`;
   - tập UID kế hoạch = tập UID của `nwResult`.
4. Trang / khung đúng phiếu (`onGrPageOf` + `anchoredFor`).

Lệch bất kỳ điểm nào: log `auto_skipped`, không PUT, khung hiện kế hoạch thủ công kèm lý do. Quyền chưa tiêu, tự hết hạn.

**Claim** — `claimApply` thêm biến thể `auto: true`:
- yêu cầu: đúng `tabId` của `autoRun`; quyền còn hiệu lực; trạng thái `received` (không nhận `apply_stopped`: không bao giờ tự chạy lại); `uids` gửi kèm bằng đúng tập UID `nwResult`;
- khi đạt: **tiêu quyền tự động** (xoá), cấp lease như cũ, `authorization = {auto: true, grCode, planHash, grantedAt, usedAt}`, `autoToken = token`, log `auto_claimed`.

Claim chạy trong hàng đợi `serial` sẵn có: hai tab / bấm hai lần thì chỉ một chủ lease.

**Ghi** — `runPlan` và GET kiểm sau từng PUT **không đổi**. Lỗi / một phần / không rõ → `apply_stopped`. Không bao giờ tự chạy lại: quyền đã tiêu, claim tự động không nhận `apply_stopped`.

## 3. Chốt phiếu và HOÀN THÀNH (§2.3)

1. **Không tải lại trang sau `finishApply`** ở chế độ tự động.
2. **GET GR mới → `verifyFinal(plan, gr, units)`** (hàm thuần mới trong `lib/plan.js`). Phải đúng tất cả:
   - cùng `id` / `poId`, `status` = `RECEIVING`;
   - cùng tập chi tiết; mỗi bước đúng `lotId`, `lotDate` (lô + hạn), sản phẩm, đơn vị dòng;
   - `received = target`; tập mã = đúng UID của bước; `qrCodeCount` = số UID (không trùng);
   - chi tiết ngoài kế hoạch giữ nguyên ảnh chụp;
   - tổng mã trên phiếu = số UID Nextwaves; không mã lạ.

   Lệch: log `auto_verify_failed {detailId, why}`, phiên giữ `applied`, khung báo "đã điền nhưng đọc lại không khớp — không tự HOÀN THÀNH", **0 PUT status**.
3. **`session:claimComplete {key, token, planHash}`**, chỉ từ tab POS. Yêu cầu: trạng thái `applied`, `authorization.auto` + cùng `planHash`, `autoToken` = token, chưa có `completeClaim`. Khi đạt: chuyển `auto_completing`, đặt `completeClaim {at, planHash}`, log `auto_complete_claimed`. Dấu "đã gửi hoặc chưa rõ" đặt **trước** PUT.
4. **Ngay trước PUT:** kiểm lại trang (`onGrPageOf` + `anchoredFor`) và `session:get` (phiên `auto_completing`, cùng `autoToken`). Sai thì báo "chưa rõ", không PUT.
5. **`PUT …/status/COMPLETED` một lần**, không body, header của chính trang POS như W1. Gọi từ content script (ISOLATED world), nên hook MAIN world không thấy lời gọi này và không thể đánh dấu `done` sớm.
6. **GET GR:**
   - `COMPLETED` đúng phiếu → `session:autoCompleteResult done` → log `auto_completed {httpStatus}`. Rồi tải lại trang; trang COMPLETED không còn khung (P2 của v0.2.5).
   - Còn lại (HTTP lỗi, hết giờ, 2xx nhưng GET chưa thấy `COMPLETED`, GET lỗi) → `auto_complete_unknown {httpStatus, grStatus}`, dừng, **không gửi lại**.
   - PUT lỗi nhưng GET đã `COMPLETED` → `done` kèm `source: "khong_chac"`, không PUT thêm.
7. **Bảo vệ trạng thái:**
   - `contentUpdate` (session:update / hook) **không** được chuyển `auto_completing` → `done`, trừ khi `completeClaim` đã quá 2 phút (chủ tab chết giữa chừng) và GET thấy `COMPLETED`.
   - `auto_complete_unknown` → `done` chỉ khi GET thấy `COMPLETED`.
   - `session:cancel` từ chối khi `auto_completing` còn trong 2 phút.
8. **Mở lại phiếu** đang `auto_completing` (quá hạn) / `auto_complete_unknown`: khung cảnh báo "Chưa rõ POS đã HOÀN THÀNH chưa — extension không gửi lại" + nút "Đọc lại" (chỉ GET). Phiếu `applied` (tự động, chưa claimComplete — tab chết giữa bước 2 và 3) đi đường thủ công: dược sĩ tự kiểm rồi bấm HOÀN THÀNH. **Không tự tiếp tục.**

## 4. Trạng thái và nhật ký (§2.4)

- **Trạng thái phiên mới:** `auto_completing` (= `auto_complete_claimed`), `auto_complete_unknown`. Thêm vào `ACTIVE` ở background / pos-content / popup.
- **Mốc nhật ký:** `auto_armed`, `auto_ready`, `auto_skipped`, `auto_claimed`, `apply_*`, `auto_verify_failed`, `auto_complete_claimed`, `auto_completed`, `auto_complete_unknown`. Chỉ mã / ID / hash / số lượng / HTTP status / giờ.
- **Không đổi `SESSION_SCHEMA`** (= 1): trường mới là tuỳ chọn, phiên v0.2.x vẫn là thủ công. `dropOutdated` dọn thêm `autoGrants` khác schema.
- **Production:** `writeEnabled` false → `auto:arm` từ chối (cùng hàng rào với cấp phép thủ công).

## 5. File đổi (ước tính)

| File | Đổi |
|---|---|
| `background.js` | `autoGrants`, `auto:arm` / `auto:revoke` / `auto:status` / `auto:list`; `received()` đặt `autoRun`; claim tự động; `claimComplete`; `autoCompleteResult`; chặn `contentUpdate` / `cancel` khi `auto_completing`; `dropOutdated` |
| `pos/pos-content.js` | nhánh tự động trong `planAndOffer` / `runApply`; `autoComplete`; view mới; `onGrStatus` không chạm phiên `auto_completing` |
| `lib/plan.js` | `verifyFinal` |
| `lib/env.js` + `main/env.js` | `api.grStatus(env, grId, status)` |
| `lib/pos-model.js` | `normalizeGr` thêm `posName` (hiện trong popup) |
| `popup/popup.js` / `.html` | nút + khung xác nhận quyền tự động, thu hồi, nhãn trạng thái mới |
| `nw/nw-content.js` | một dòng trạng thái tự động trong khung "Sẵn sàng nhận hàng" |
| `manifest.json` / `package.json` | 0.3.0 |

## 6. Kiểm G1 (không ghi thật)

**Chuỗi dương trên dữ liệu A1 thật**, trình duyệt giả chạy thật background + content:
- phiên `nw_ready` dựng từ export storage A1 (`expected`, PO, phiếu gửi);
- popup arm;
- tab Nextwaves gửi `scanOk` / `received` đúng như nhật ký A1 (`nwResult` thật) — parser Nextwaves đã có test T3 thật;
- POS GR03887 với GR / 15 tra QR / chuỗi GET-PUT / response `status/COMPLETED` thật; server giả áp body PUT vào GR và sau COMPLETED thêm mã lô như mẫu thật.

Kỳ vọng:
- kế hoạch #EF0E020C;
- 5 PUT trùng body thật;
- 1 PUT `status/COMPLETED`;
- GET cuối `COMPLETED`;
- phiên `done`, quyền đã tiêu, 0 lần gửi trùng.

**Ca âm (spec G1). Mỗi ca 0 PUT status, trừ ca status đã gửi thì không gửi lần 2:**
- không arm / hết hạn / đổi GR-SO-PO-cửa hàng / phiên tạo lại;
- biên nhận thiếu / thừa / không có biên nhận mới / 2 biên nhận mới;
- QR thiếu / sai lô / sai đơn vị; cảnh báo nhận thiếu; GR có lượng nhận sẵn hoặc mã lạ;
- mất chỗ gắn / đổi route trước claim;
- GET sau W1 lệch một UID / lô / số lượng / có mã lạ;
- PUT thứ 3 lỗi / hết giờ;
- hai tab cùng claim; tải lại / tab chết sau claim (không tự chạy tiếp);
- `status` 500 / hết giờ / 2xx nhưng GET chưa `COMPLETED` → `auto_complete_unknown`, F5 / "Đọc lại" không gửi lại;
- hook báo sớm không đánh dấu `done`;
- sau `COMPLETED` không khung đỏ;
- PRD không arm được; popup không có tab không arm được từ trang web.

**Ngoài ra:**
- đột biến cho từng hàng rào mới;
- Edge trên gói giải nén: chuỗi tự động trên trang phiếu DOM thật, hook thật, server giả; trace có tên + baseline;
- gói v0.3.0 ZIP / SHA-256, source = ZIP;
- script nâng cùng thư mục v0.2.4 → v0.3.0 + diễn tập.

**Giới hạn:** phía Nextwaves của chuỗi A1 dùng message dựng từ nhật ký phiên thật, không phải response Nextwaves của PO13806459 (lượt A1 không capture tab Nextwaves).
