# Thiết kế mã v0.4.0 (nhánh `batch/v0.4-moi-pos`, từ `2d35a8c`)

Plan: `docs/dev/PLAN-v0.4.0-MOI-POS-E2E.md` (main). Hợp đồng đầu đọc: `docs/dev/SPEC-QSL-MUON-DAU-DOC-v1.md` (main).

## env.js (+ bản sao main/env.js)
- PRD bỏ `storeAllowlist` / `warehouseByStore`; bỏ `storeAllowed` / `warehouseForStore`.
- Tenant Nextwaves:
  - config `{mode, url, nwTenant}`;
  - `withTenant(env, tenant)` dựng `nwUiOrigin` `https://<t>.nextwaves.app` và `nwApiBase` `https://api-<t>.nextwaves.app/api`;
  - STG cố định `circa-stg`;
  - `envFromConfig` áp tenant; `envFor(envId, tenant)` cho background;
  - `normTenant` chỉ nhận `[a-z0-9-]`, 2..40 ký tự.
- `envFromAnyUrl` / hook: API Nextwaves PRD nhận mọi `api-<t>.nextwaves.app` (hook báo kèm tenant). Content chỉ dùng auth của đúng tenant đang chọn.

## manifest
- Version 0.4.0. Nextwaves: `https://*.nextwaves.app/*` (host + 2 mục content script).
- Không thêm `key` (giữ Extension ID theo thư mục).

## resolve.js / nw-model.js
- Bỏ lọc kho theo bảng.
- Đơn đã qua kiểm refId / bên bán / huỷ: mọi đơn phải cùng một `warehouseId` không rỗng, khác nhau → `warehouse_inconsistent`.
- Kho của phiên = kho đơn đã chọn: `match.warehouseId`, kèm tên / mã để hiển thị.
- Ca `no_order`: tìm đọc đủ, `verified === 0`.

## background.js — trạng thái phiên (SESSION_SCHEMA 2)
`waiting_nw` → (`no_nw_order` ⇄ `waiting_nw` khi "Tìm lại") → `nw_ready` → `received` → `applying` ⇄ `apply_stopped` → `applied` → `done`.
- **Bỏ:**
  - `grants`, `autoGrants`;
  - `auto:*`, `grant:*`;
  - `claimComplete`, `autoCompleteResult`;
  - các trạng thái `auto_completing` / `auto_complete_unknown`.
- **claimApply:** không cần cấp phép.
  - Trạng thái: `received` | `apply_stopped` | `applying` hết lease.
  - Kiểm: cooldown, `planHash`, `grCode`, `writeBlockers` (`session_outdated`, `env_read_only`, khoá POS / Nextwaves).
- **contentUpdate:** `applying` hết lease → `applied` / `done` được (A8). Bỏ phần `auto_completing`.
- **session:noOrder:** từ tab Nextwaves, phiên `waiting_nw` → `no_nw_order`, trả đầu đọc. **session:retryNw:** → `waiting_nw`.
- **session:routeScan (A7):** 2xx receive-scan có `shipmentId` → đúng MỘT phiên `nw_ready` cùng env / tenant có `shipmentIds` chứa nó → đặt `scanOk`, trả phiên. Không có / nhiều → null.
- **received:**
  - Phiên mất → ném lỗi (A2).
  - Về POS (A3): tab gốc chỉ khi đang ở danh sách phiếu hoặc đúng trang phiếu; ngược lại mở tab mới.
  - Đóng tab Nextwaves của phiên (đúng trang nhận) → trả đầu đọc.
- **startSession:**
  - Bỏ `storeAllowed`, `warehouseId` từ trang.
  - Mượn đầu đọc qua chính tab POS gửi (relay), tối đa 6 s.
  - Tái dùng tab Nextwaves nhận hàng của extension còn mở (C1), không thì mở tab mới.
- **findByNw:** lọc thêm `nwTenant`.
- **reopenNw (A5):** tab cũ không còn đúng trang nhận → mở mới; mượn lại đầu đọc.
- **Đầu đọc:**
  - `readerCmd(s, cmd)` → `chrome.tabs.sendMessage(posTab, {type:"cgn:reader", cmd, leaseId, ttlMs, label})`. Tab POS post `circa-reader/v1` và chờ `qsl`.
  - Phiên giữ `reader: {leaseId, supported, state, at}`.
  - Trả khi: `received` (sau khi đóng tab Nextwaves), `no_nw_order`, huỷ / xoá phiên, tab Nextwaves của phiên bị đóng.
- `tabs.onRemoved`: tab Nextwaves của phiên mở → trả đầu đọc, `nwTabId` = null.

## nw-content.js
- **A1:** chỉ đánh giá lại khi chữ ký phiên của trang đổi (key, state, nwPoId, createdAt), khi đổi URL, khi bấm "Tìm lại", hoặc khi có auth mới sau lỗi 401. Lỗi giữ khung (latch). Không ghi trùng lý do.
- **Không có đơn:** `session:noOrder`, khung "nhận tay trên POS", nút Tìm lại / Về POS.
- **A4:** chờ auth > 20 s → "Bấm F5".
- **A7:** receive-scan 2xx không thuộc ctx → `session:routeScan` → phiên kia thì chuyển ctx sang phiên đó rồi đọc kết quả; không có → báo đỏ "nhận tay".
- **A2:** `session:received` lỗi "không có phiên" → báo đỏ.
- **C2 đầu đọc:** theo dõi nút đầu đọc của màn quét; cổng trống mà chưa kết nối → bấm nút kết nối, tối đa 3 lần / 30 s. Chữ "Đầu đọc: …".
- Bỏ dòng tự động / quyền.

## pos-content.js
- Bỏ: chặn theo cửa hàng, cấp phép, tự HOÀN THÀNH (`autoTry`, `autoComplete`, …).
- **received** (tab đang ở đúng trang phiếu, khung gắn) → lập kế hoạch → `plan.ok` + không khoá → **tự điền** (`runApply`). Không gắn được khung trong 8 s → nút "Điền vào phiếu".
- **apply_stopped** / `applying` hết lease → nút "Đọc lại và điền tiếp".
- **A9:** PUT 5xx / 0 → chưa rõ (cooldown). **A10:** sửa chữ.
- Khung khi điền: "Đang điền i/n — chưa bấm HOÀN THÀNH". Xong: tải lại → "Đã điền N mã vào M lô — kiểm danh sách rồi bấm HOÀN THÀNH".
- `no_nw_order` trên danh sách: nhãn "Không có đơn NW", bấm = Tìm lại (mở Nextwaves).
- Relay đầu đọc: `chrome.runtime.onMessage` `cgn:reader` → `window.postMessage(circa-reader/v1)` → chờ trả lời `from:"qsl"` đúng `reqId` (ping 300 ms, lend / return 5 s).

## popup
Môi trường + ô Tenant Nextwaves + Phiên gần đây (Xoá / Mở). Bỏ cấp phép / tự động.

## Đoạn kiểm
`kiem-truoc.js` / `kiem-sau.js` theo trường mới; bỏ `kiem-quet.js`.
