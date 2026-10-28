"""Đột biến có chủ đích cho các hàng rào của v0.3.0 = 146 ca của v0.2.5 + 59 ca chế độ tự động (PM DECISION-ONE-STG-AUTO-FLOW-20261028
§2: quyền một lần chỉ từ popup / nw_ready / STG / xác nhận khớp / gắn đúng phiên và hết hạn; điểm kích hoạt duy nhất kiểm tập EPC +
một biên nhận mới; một tab được giao; claim tự động một lần, đủ UID, tiêu quyền; autoPlanCheck / đọc lại PO-SO / khung gắn đúng trang;
verifyFinal toàn phiếu; claimComplete một lần đúng tab; done chỉ khi GET thấy COMPLETED; hook / huỷ không đóng phiên đang gửi; dọn
quyền bản cũ; popup phải qua bước xác nhận).

  python -I scripts/mutate-v0.3.0.py            # mọi ca
  python -I scripts/mutate-v0.3.0.py 146        # chỉ 59 ca v0.3.0

v0.2.5 = 130 ca của v0.2.4 (neo "lượt đánh giá cũ về muộn" đổi theo hàm fresh()) + 16 ca
PM AUDIT-A1-GR03887 (P2: phiếu kết thúc không vẽ / không chờ chỗ gắn, hook HOÀN THÀNH 2xx gỡ khung ngay + bỏ view lượt đánh giá cũ,
HTTP lỗi / phiếu khác không tính, phiên done mà POS còn nhận được chỉ cảnh báo; P3: popup chỉ cấp phép khi mã khớp phiên đang hoạt
động của môi trường, đọc phiên lỗi thì không cấp).

  python -I scripts/mutate-v0.2.5.py            # mọi ca
  python -I scripts/mutate-v0.2.5.py 130        # chỉ 16 ca v0.2.5

Lịch sử — v0.2.4 = 102 ca của v0.2.3 + 12 ca P2 + 8 ca PM audit sơ bộ + 8 ca PM audit rev 1 (PM review 27/10 §2: khung trang phiếu trong
luồng trang, view phiếu mang mã phiếu, W1 fail closed khi khung không gắn đúng trang, thiếu chỗ gắn → lỗi giao diện ở khung nổi
không nút Điền + chẩn đoán nhật ký phiên, /chi-tiet-so chỉ nút mở phiếu, đổi route gỡ khung cũ, bỏ view phiếu cũ về muộn; audit sơ bộ 27/10: kiểm lại mã phiếu ngay lúc hỏi, view lượt cũ về muộn không vẽ trên trang
mới / danh sách, thu nhỏ mở lại khi nội dung cảnh báo đổi; audit rev 1: mã chuẩn trên thẻ thông tin khớp chính xác, breadcrumb
bất đồng → chặn, tiến trình ghi không vẽ trên /chi-tiet-so SO khác — ui/panel.js chạy thật trên tests/fake-dom.js). Phần DOM của khung trong luồng
(gắn / gắn lại / kiểm mã / chống vòng / tự mở lại / thiếu chỗ gắn) kiểm bằng scripts/mutate-edge-v0.2.4.js trên Edge thật.
v0.2.3 = 96 ca của v0.2.2 + 6 ca F3 / F4 (PM review G3a 27/10: nhãn ngắn + tên đầy
đủ theo trạng thái phiên; thông báo danh sách trong luồng trang, không khung nổi). Phần DOM (vị trí thông báo, đồng bộ title /
aria-label trên nút thật) kiểm bằng scripts/mutate-edge-v0.2.3.js trên Edge thật.
v0.2.2 = 96 ca của v0.2.1 (không thêm: thay đổi v0.2.2 — nút 24px, khung đặt lại khi
cuộn — là DOM, kiểm bằng scripts/mutate-edge-v0.2.2.js trên Edge thật).
v0.2.1 = 93 ca của v0.2.0 + ca P2.1 (PM audit v0.2.0: hook chỉ gửi lại lượt danh sách
mới nhất khi content chào). v0.2.0 = ca của v0.1.6 (đổi neo theo mã mới; bỏ ca "chốt chặn tạo phiên lặp" vì v0.2
không còn tự tạo phiên — thay bằng ca "tự tạo phiên khi mở phiếu") + ca v0.2 (lối vào danh sách, thứ tự lượt R1, huỷ cú bấm R2,
header S3, returnUrl S4, hợp đồng hook S5, cache QR / lọc refresh S6, log scan_ok).
Các ca cũ: hàng rào của v0.1.5 (PM audit 24/10: P1.1–P1.7, P2.1–P2.4, P3; manifest không nạp trùng env.js — lỗi T1 25/10)
và v0.1.6 (khung không che nút trang). Phần DOM của nút danh sách (pos/gr-list.js) kiểm trên Edge thật (scripts/edge-check.js).

Mỗi ca gỡ đúng MỘT hàng rào trong src/, chạy `node --test "tests/*.test.js"`; bộ test phải hỏng (KILLED).
Chạy trên BẢN SAO trong thư mục tạm — không sửa src/ của repo. Cần Node (node --test) trên PATH.

  python -I scripts/mutate-v0.2.4.py            # mọi ca
  python -I scripts/mutate-v0.2.4.py 102        # chỉ 28 ca P2 + PM (bắt đầu từ ca thứ 103)

Đột biến trên src/lib/env.js được áp lên cả src/main/env.js (bản sao y hệt) để không bị bắt chỉ vì hai bản lệch nhau.
"""
import os
import shutil
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TIMEOUT_S = 240

muts = [
    # P1.1
    ("src/lib/resolve.js", 'if (page.total !== page.items.length) return fail("search_incomplete");', '', "P1.1 chọn trên trang chưa đủ"),
    ("src/lib/resolve.js", '''      if (!r.ok) return fail("candidate_read_failed", { poNumber: c.poNumber, detail: r.detail });
      const order = N.normalizeOrderOfPo(r.json);''', '''      if (!r.ok) continue;
      const order = N.normalizeOrderOfPo(r.json);''', "P1.1 bỏ qua ứng viên đọc lỗi"),
    ("src/lib/resolve.js", 'if (!c.poId || !c.slug || !c.warehouseId) return fail(', 'if (false) return fail(', "P1.1 bỏ kiểm trường ứng viên"),
    # P1.2
    ("src/lib/plan.js", "if (locs.length === 1 && locs[0] !== detail.id) {", "if (false) {", "P1.2 bỏ kiểm UID sai lô"),
    ("src/lib/plan.js", "else if (d.received !== presentQty) block(", "else if (false) block(", "P1.2 bỏ kiểm lượng nhất quán"),
    ("src/lib/plan.js", 'if (d.received !== 0) block("received_mismatch"', 'if (false) block("received_mismatch"', "P1.2 bỏ kiểm lượng không mã"),
    ("src/lib/plan.js", 'if (locs.length > 1) block("uid_on_many_details"', 'if (false) block("uid_on_many_details"', "P1.2 bỏ kiểm UID nhiều lô"),
    # P1.3
    ("src/background.js", 'if (!grant) return no("no_grant");', 'if (!grant) return { ok: true, leaseMs: T.leaseMs };', "P1.3 giành quyền không cần cấp phép"),
    ("src/background.js", "delete grants[gk];", "", "P1.3 cấp phép dùng nhiều lần"),
    ("src/background.js", 'if (sender && sender.tab) throw new Error("Chỉ cấp phép từ popup extension");', '', "P1.3 content tự cấp phép"),
    ("src/lib/env.js", "      writeEnabled: false,", "      writeEnabled: true,", "P1.3 PRD được ghi"),
    ("src/pos/pos-content.js", "    if (!grant) {", "    if (false) {", "P1.3 hiện nút khi chưa cấp phép"),
    # P1.4
    ("src/pos/pos-content.js", "    if (!storeId) {", "    if (false) {", "P1.4 bỏ bắt buộc x-store-id"),
    ("src/lib/pos-model.js", 'if (!store || !gr.posId || !po.posId) errors.push("store_missing");', 'if (false) errors.push("store_missing");', "P1.4 PO / GR thiếu cửa hàng vẫn qua"),
    ("src/pos/pos-content.js", 'if (!gr.posId) return showError(', 'if (false) return showError(', "P1.4 GR thiếu pos_info vẫn qua"),
    # P1.5
    ("src/background.js", "s.lease.token !== token || ", "", "P1.5 gia hạn lease không kiểm chủ"),
    ("src/lib/apply.js", 'if (!allowed) return stop("lease_lost", step);', '', "P1.5 bỏ kiểm lease trước PUT"),
    ("src/background.js", 'const leaseExpired = s.state === "applying" && !(s.lease && s.lease.expiresAt > now);', 'const leaseExpired = s.state === "applying";', "P1.5 giành khi lease còn hạn"),
    ("src/background.js", 'if (!s || s.state !== "applying" || s.applyToken !== msg.token) return false;', 'if (!s || s.state !== "applying") return false;', "P1.5 không phải chủ vẫn kết thúc"),
    ("src/background.js", "retryNotBefore: msg.uncertain ? Date.now() + T.retryCooldownMs : null", "retryNotBefore: null", "P1.5 bỏ hạ nhiệt sau kết quả không rõ"),
    # P2.1
    ("src/background.js", 'if (cur.state !== "nw_ready" || !cur.scanOk) throw', 'if (cur.state !== "nw_ready") throw', "P2.1 về POS khi chưa có lượt 2xx"),
    ("src/lib/nw-model.js", "if (!ru.receiptId) problems.push(", "if (false) problems.push(", "P2.1 bỏ kiểm biên nhận"),
    ("src/lib/nw-model.js", 'problems.push("no_new_receipt");', ";", "P2.1 bỏ kiểm biên nhận mới"),
    ("src/lib/nw-model.js", "else if (!Array.isArray(line.receivedEpcs) || !line.receivedEpcs.includes(ru.epc)) problems.push(", "else if (false) problems.push(", "P2.1 bỏ kiểm phiếu gửi đã nhận"),
    ("src/nw/nw-content.js", "if (s.scanOk) await collect({});", "await collect({});", "P2.1 tải lại trang tự chuyển"),
    # P2.2
    ("src/lib/pos-model.js", 'return { ok: false, reason: "incomplete" };', ";", "P2.2 QR thiếu trường vẫn dùng"),
    ("src/lib/plan.js", "      if (!qr) {", "      if (!qr && false) {", "P2.2 thiếu kết quả tra QR"),
    # P2.3
    ("src/lib/apply.js", 'if (diff) return stop("gr_changed", step, { observed: diff });', "", "P2.3 bỏ so toàn phiếu"),
    # P3
    ("src/background.js", "for (const l of [].concat(s.writeLocks || [], s.nwWriteLocks || [])) out.push(l);", "", "P3 bỏ khoá ghi"),
    ("src/background.js", 'return updateSession(key, { state }, logEvent);', 'return updateSession(key, patch, logEvent);', "P3 / P1.7 session:update ghi cả trường khác state"),
    ("src/background.js", 'if (!patch || !("state" in patch)) return logEvent ? updateSession(key, null, logEvent) : s;', 'if (!patch || !("state" in patch)) return updateSession(key, patch, logEvent);', "P1.7 session:update không state ghi được khoá"),
    ("src/lib/resolve.js", 'if (verified.length > 1) out.writeLocks.push("nw_many_orders");', "", "P3 bỏ khoá nhiều đơn Nextwaves"),
    ("src/lib/pos-model.js", 'return live.length === 1 ? null : "so_many_gr";', "return null;", "P3 bỏ khoá SO nhiều GR"),
    # P1.6
    ("src/lib/pos-model.js", 'if (page.total !== page.items.length) return Object.assign({ ok: false, reason: "search_incomplete" }, facts);', "", "P1.6 bỏ kiểm total GR theo SO"),
    ("src/lib/pos-model.js", "if (page.page !== 1 || !(page.limit >= 1) || page.items.length > page.limit)", "if (false)", "P1.6 bỏ kiểm page / limit"),
    ("src/lib/pos-model.js", "if (!g.id || !g.status || !g.posId) return", "if (false) return", "P1.6 dòng thiếu trường vẫn đếm"),
    ("src/lib/pos-model.js", "if (!store || g.posId !== store) return", "if (false) return", "P1.6 dòng cửa hàng khác vẫn đếm"),
    ("src/pos/pos-content.js", "writeLocks: lock ? [lock] : [],", "writeLocks: [],", "P1.6 phiên không mang khoá SO"),
    ("src/pos/pos-content.js", '''    if (!found.ok) {
      unwatch();''', '''    if (false) {
      unwatch();''', "P1.6 đường /chi-tiet-so đi tiếp khi chưa đủ"),
    # P1.7
    ("src/background.js", 'if (s.state !== "waiting_nw" || s.nwPoId) throw', "if (false) throw", "P1.7 khớp đơn nhiều lần"),
    ("src/background.js", 'requireOrigin(sender, env && env.nwUiOrigin, "session:nwMatched");', "", "P1.7 khớp đơn từ trang bất kỳ"),
    ("src/background.js", "m.nwWriteLocks.every((l) => NW_LOCKS.has(l));", "true;", "P1.7 nhận khoá lạ"),
    ("src/background.js", "K.sameSo(m.nwRefId, s.soBase) &&", "", "P1.7 nhận refId khác SO"),
    ("src/background.js", 'requirePosTab(s, sender, "session:claimApply");', "", "P1.7 giành quyền từ trang bất kỳ"),
    ("src/background.js", 'requireOrigin(sender, env.posOrigin, "session:start");', "", "P1.7 tạo phiên từ trang bất kỳ"),
    ("src/background.js", 'if (!Array.isArray(s.shipmentIds) || !s.shipmentIds.includes(String(scan.shipmentId || "").toLowerCase())) throw new Error("session:scanOk: phiếu gửi không thuộc đơn đã khớp");', "", "P1.7 scanOk phiếu gửi lạ"),
    ("src/background.js", 'requireOrigin(sender, E.envById(cur.envId).nwUiOrigin, "session:received");', "", "P1.7 received từ trang bất kỳ"),
    # P2.4 (phiên / cấp phép của bản cũ khi nâng cấp giữ cùng extension ID)
    ("src/background.js", 'if (!isCurrent(s)) out.push("session_outdated");', "", "P2.4 phiên bản cũ vẫn được ghi"),
    ("src/background.js", "if (cur && ACTIVE.has(cur.state) && isCurrent(cur)) return cur;", "if (cur && ACTIVE.has(cur.state)) return cur;", "P2.4 mở lại phiếu giữ phiên bản cũ"),
    ("src/background.js", "return isCurrent(s) ? s : null; // phiên bản cũ", "return s || null; // phiên bản cũ", "P2.4 session:get trả phiên bản cũ"),
    ("src/background.js", """      isCurrent(s) &&
      s.envId === envId &&""", """      s.envId === envId &&""", "P2.4 trang Nextwaves tìm thấy phiên bản cũ"),
    # v0.3.0: getAutoGrants có cùng dòng lọc → neo kèm dòng đọc "grants" của getGrants.
    ("src/background.js", 'const all = grants || {};\n  const now = Date.now();\n  for (const k of Object.keys(all)) if (!(all[k].expiresAt > now) || !isCurrent(all[k])) delete all[k];', 'const all = grants || {};\n  const now = Date.now();\n  for (const k of Object.keys(all)) if (!(all[k].expiresAt > now)) delete all[k];', "P2.4 cấp phép kiểu cũ vẫn dùng được"),
    ("src/background.js", """  if (!isCurrent(s)) throw new Error("Phiên của bản cũ — mở lại phiếu trên POS");
  if (s.state !== "waiting_nw" || s.nwPoId)""", """  if (s.state !== "waiting_nw" || s.nwPoId)""", "P2.4 khớp đơn cho phiên bản cũ"),
    ("src/background.js", '        if (!isCurrent(s)) throw new Error("Phiên của bản cũ — mở lại phiếu trên POS");', "", "P2.4 scanOk cho phiên bản cũ"),
    ("src/background.js", '  if (!isCurrent(cur)) throw new Error("Phiên của bản cũ — mở lại phiếu trên POS");', "", "P2.4 received cho phiên bản cũ"),
    ("src/background.js", 'if (details && (details.reason === "update" || details.reason === "install")) serial(() => dropOutdated(details));', "", "P2.4 nâng cấp không dọn phiên cũ"),
    ("src/background.js", "  for (const [k, g] of Object.entries(grants || {})) if (isCurrent(g)) kept[k] = g;", "  for (const [k, g] of Object.entries(grants || {})) kept[k] = g;", "P2.4 nâng cấp giữ cấp phép cũ"),
    # v0.2: chỉ tạo phiên khi bấm (thay ca chống vòng lặp tạo phiên của v0.1.3 — không còn tự tạo phiên)
    ("src/pos/pos-content.js", "      const codes = gr.items.reduce((n, it) => n + it.details.reduce((m, d) => m + d.qrCodes.length, 0), 0);", "      startOnGrPage(env, storeId, gr);\n      const codes = gr.items.reduce((n, it) => n + it.details.reduce((m, d) => m + d.qrCodes.length, 0), 0);", "v0.2 tự tạo phiên khi mở phiếu"),
    # Lỗi T1 25/10: env.js khai ở cả MAIN và ISOLATED → trình duyệt chỉ nạp vào MAIN → ISOLATED thiếu env
    ("src/manifest.json", '"js": ["main/env.js", "pos/pos-hook.js"],', '"js": ["lib/env.js", "pos/pos-hook.js"],', "Manifest: hook POS dùng chung lib/env.js (lỗi T1)"),
    ("src/manifest.json", '"js": ["main/env.js", "nw/nw-hook.js"],', '"js": ["lib/env.js", "nw/nw-hook.js"],', "Manifest: hook Nextwaves dùng chung lib/env.js (lỗi T1)"),
    # v0.1.6 (operator 26/10): khung che nút HOÀN THÀNH. Phần đo DOM (place / avoidRects) kiểm trên Edge thật (scripts/edge-check.js).
    ("src/ui/panel.js", "if (across && down) next = Math.max(next, vh - r.top + GAP);", "if (false) next = Math.max(next, vh - r.top + GAP);", "v0.1.6 khung không nâng khi chồng nút"),
    ("src/ui/panel.js", "const across = r.left < box.right && r.right > box.left;", "const across = true;", "v0.1.6 nâng cả khi nút lệch ngang"),
    ("src/ui/panel.js", "return Math.min(bottom, Math.max(BASE, vh - MIN_TOP - 40));", "return bottom;", "v0.1.6 đẩy khung ra khỏi mép trên"),
    ("src/pos/pos-content.js", "avoidButtons: /^(hoàn thành|hủy|huỷ|hủy phiếu|huỷ phiếu)$/iu", "avoidButtons: /^(hủy|huỷ|hủy phiếu|huỷ phiếu)$/iu", "v0.1.6 POS không tránh nút HOÀN THÀNH"),
    ("src/nw/nw-content.js", "avoidButtons: /^xác nhận nhận hàng$/iu", "avoidButtons: /^$/iu", "v0.1.6 Nextwaves không tránh nút nhận hàng"),
    # v0.2 — lối vào danh sách / nhận dạng trang
    ("src/lib/env.js", '    if (GR_LIST_PAGE_RE.test(u.pathname)) return { kind: "gr_list" };', "", "v0.2 không nhận trang danh sách"),
    ("src/lib/env.js", "    if (!/(^|,)pos_id=/.test(q) || /(^|,)so_thuocsi=/.test(q)) return null;", "    if (!/(^|,)pos_id=/.test(q)) return null;", "v0.2 coi tìm theo SO là danh sách"),
    ("src/pos/pos-content.js", '    if (page.kind === "gr_list") return evaluateGrList(env, storeId);', "", "v0.2 trang danh sách rơi xuống luồng SO"),
    ("src/pos/pos-content.js", "      if (!P.isReceivable({ status: r.status }) || r.posId !== ctx.storeId || notLinkable.has(r.id)) continue;", "      if (notLinkable.has(r.id)) continue;", "v0.2 nút cả dòng không nhận được / cửa hàng khác"),
    ("src/pos/pos-content.js", "      notLinkable.add(grId);", "", "v0.2 không ẩn nút dòng không có SO"),
    # v0.2 — R1 thứ tự lượt danh sách
    ("src/pos/pos-content.js", "    if (p.reqSeq !== list.latestReqSeq || p.reqSeq <= list.shownSeq) return;", "    if (p.reqSeq <= list.shownSeq) return;", "R1 nhận response không phải lượt mới nhất đã gửi"),
    ("src/pos/pos-content.js", "    list.ok = !!p.ok && Array.isArray(p.rows);", "    if (!p.ok) return;", "R1 lượt mới nhất lỗi vẫn giữ nút cũ"),
    ("src/pos/pos-hook.js", "    const base = { envId: call.envId, reqSeq, latestReqSeq: listSeq, queryKey: call.queryKey };", "    const base = { envId: call.envId, reqSeq, latestReqSeq: reqSeq, queryKey: call.queryKey };", "R1 hook: lượt mới nhất tính lúc response về"),
    ("src/pos/pos-hook.js", "    if (!LIST_PAGE_RE.test(location.pathname)) return null;", "", "S5 hook bắt danh sách ngoài trang danh sách"),
    ("src/pos/pos-hook.js", "        if (list && list.length <= LIST_MAX_ROWS) {", "        if (list) {", "S5 hook bỏ giới hạn số dòng"),
    # v0.2 — R2 cú bấm gắn dòng / lượt / route; kiểm sau mỗi await
    ("src/pos/pos-content.js", '    if (tok.kind === "list") {', "    if (false) {", "R2 cú bấm không gắn với dòng / lượt danh sách"),
    ("src/pos/pos-content.js", "      const g = await posGet(env, E.api.grDetail(env, grId), signal);\n      guard();", "      const g = await posGet(env, E.api.grDetail(env, grId), signal);", "R2 bỏ kiểm sau GET GR"),
    ("src/pos/pos-content.js", "      guard(); // sau lần đọc cuối và ngay trước khi tạo phiên (giữa hai chỗ này không có await)", "", "R2 bỏ kiểm ngay trước session:start"),
    ("src/pos/pos-content.js", "    if (click && click.kind === \"list\" && p.reqSeq > click.reqSeq) cancelClick(LIST_CHANGED);", "", "R2 không huỷ ngay khi có request danh sách mới"),
    ("src/pos/pos-content.js", "      onDomChanged: () => {\n        if (click && click.kind === \"list\" && !stillValid(click)) cancelClick(LIST_CHANGED);", "      onDomChanged: () => {", "R2 không huỷ ngay khi DOM dòng đổi"),
    ("src/pos/pos-content.js", '    cancelClick("Đã rời trang — huỷ lượt chuẩn bị");', "", "R2 không huỷ ngay khi đổi route"),
    ("src/pos/pos-content.js", '      if (err && err.name === "AbortError") return fail(', '      if (err && err.name === "AbortError") return { status: "cancelled", message: LIST_CHANGED }; (', "R2 GET hết giờ báo nhầm là danh sách đổi"),
    ("src/pos/pos-content.js", "      if (code && gr.code !== code) return { status: \"cancelled\", message: LIST_CHANGED };", "", "S1 GR đọc lại khác mã dòng vẫn tạo phiên"),
    ("src/pos/pos-content.js", "      if (!P.isReceivable(gr)) return fail(", "      if (false) return fail(", "S1 GR đã HOÀN THÀNH vẫn tạo phiên"),
    # v0.2 — S3 header cửa hàng
    ("src/pos/pos-content.js", '    else if (cur && cur.confirmed && cur.headers.authorization === headers.authorization && (cur.headers["x-client-id"] || "") === (headers["x-client-id"] || "")) return false;', "    else if (cur && cur.confirmed) return false;", "S3 giữ cửa hàng cũ khi token đổi"),
    ("src/pos/pos-content.js", '    if (before && after !== before) cancelClick("Phiên đăng nhập / cửa hàng POS vừa đổi — bấm lại");', "", "S3 không huỷ cú bấm khi đăng nhập đổi"),
    # v0.2 — S4 background tự dựng returnUrl
    ("src/background.js", '  if (msg.returnUrl !== undefined && msg.returnUrl !== returnUrl) throw new Error("bad_return_url");', "", "S4 nhận returnUrl lạ"),
    ("src/background.js", '  if (!E.isUuid(msg.grId)) throw new Error("grId");', "", "S4 nhận grId không phải UUID"),
    # v0.2 — S6 cache tra QR + lọc refresh; log scan_ok
    ("src/pos/pos-content.js", "      if (c && now - c.at < T.qrTtlMs) out[uid] = c.r;", "      if (false) out[uid] = c.r;", "S6 bỏ cache tra QR"),
    ("src/pos/pos-content.js", "        if (out[uid] && out[uid].ok) qrCache.set(", "        if (out[uid]) qrCache.set(", "S6 cache cả kết quả tra QR lỗi"),
    ("src/pos/pos-content.js", "      if (JSON.stringify(o) !== JSON.stringify(n)) refresh();", "      refresh();", "S6 cấp phép phiếu khác cũng đánh giá lại"),
    ("src/pos/pos-content.js", "        if (!s || sessionSig(s) !== watched.sig) refresh();", "        refresh();", "S6 mọi thay đổi phiên đều đánh giá lại"),
    ("src/background.js", "        return updateSession(msg.key, { scanOk: scan }, { type: \"scan_ok\", shipmentId: scan.shipmentId, httpStatus: scan.httpStatus, sentEpcs: scan.sentEpcs === undefined ? null : scan.sentEpcs, scanAt });", "        return updateSession(msg.key, { scanOk: scan }, Object.assign({ type: \"scan_ok\" }, scan));", "P3 log scan_ok: at số đè giờ ISO"),
    # v0.2.1 — PM audit v0.2.0 P2.1: content nạp muộn chỉ nhận lượt danh sách mới nhất đã gửi (kết quả, hoặc đang chờ)
    ("src/pos/pos-hook.js", "    if (lastList && lastList.req.reqSeq === reqSeq) lastList.res = msg;", "    if (lastList) lastList.res = msg;", "P2.1 response lượt cũ về muộn ghi đè lượt gửi lại"),
    ("src/pos/pos-hook.js", '        post("gr-list-request", lastList.req);\n', "", "P2.1 chào lại không báo lượt mới nhất đang chờ"),
    ("src/pos/pos-hook.js", "    lastList = { req: { envId: call.envId, reqSeq: listSeq, queryKey: call.queryKey }, res: null };", "    lastList = { req: { envId: call.envId, reqSeq: listSeq, queryKey: call.queryKey }, res: lastList ? lastList.res : null };", "P2.1 gửi lượt mới vẫn giữ kết quả cũ để gửi lại"),
    # v0.2.3 — PM F3 (nhãn ngắn, tên đầy đủ theo trạng thái phiên) / F4 (thông báo danh sách trong luồng trang, không khung nổi)
    ("src/pos/pos-content.js", 'return { kind: "open_nw", label: "Mở Nextwaves",', 'return { kind: "open_nw", label: "Đang nhận trên Nextwaves",', "F3 nhãn đang nhận dài (bảng dàn lại)"),
    ("src/pos/pos-content.js", "const sessionText = (s) => `phiên ${SESSION_STATE_VI[s.state] || s.state} (${s.state})`;", "const sessionText = (s) => \"phiên đang có\";", "F3 tên đầy đủ không có trạng thái phiên"),
    ("src/pos/pos-content.js", "      listNote = null; // thành công: nút thành \"Mở Nextwaves\", tab Nextwaves đã mở\n      showListNote();", "      listNote = null;\n      panel.show({ tone: \"ok\", title: `${code}: đã mở màn quét Nextwaves`, lines: [] });", "F4 thành công vẫn hiện khung nổi trên danh sách (kép: gỡ cả chặn khung trên danh sách của router v0.2.4)", [('      if (!page || page.kind === "gr_list") return;', "      if (!page) return;")]),
    ("src/pos/pos-content.js", "    if (L) L.notice(onList ? listNote : null);\n    panel.hide();", "    if (onList && listNote) panel.show(listNote);\n    else panel.hide();", "F4 thông báo danh sách bằng khung nổi"),
    ("src/pos/pos-content.js", "    listCtx = null;\n    listNote = null;\n    if (listSessionsTimer)", "    listCtx = null;\n    if (listSessionsTimer)", "F4 rời danh sách không dọn thông báo (quay lại hiện thông báo cũ)"),
    ("src/pos/pos-content.js", "    listNote = null; // đang kiểm: nút của dòng thành \"Đang kiểm…\" (vô hiệu), không có khung / thông báo\n    showListNote();\n", "", "F4 bấm lại không dọn thông báo cũ"),
    # v0.2.4 — PM P2 (docs/pm/REVIEW-A1-RUNBOOK-P2-v0.2.4-20261027.md §2)
    ("src/pos/pos-content.js", '      if (page.kind !== "gr") {\n        grPanel.hide();', '      if (true) {\n        grPanel.hide();', "P2 trang phiếu dùng khung nổi (như v0.2.3)"),
    # v0.3.0: autoComplete có cùng điều kiện → neo kèm dòng autoSkip ngay sau (chỉ có trong runApply).
    ("src/pos/pos-content.js", '    if (!onGrPageOf(gr) || !grPanel.anchoredFor(gr.code)) {\n      if (auto) await autoSkip(s, "ui_not_anchored");', '    if (false) {\n      if (auto) await autoSkip(s, "ui_not_anchored");', "P2 bỏ chặn W1 khi khung không gắn đúng trang"),
    ("src/pos/pos-content.js", '    if (!onGrPageOf(gr) || !grPanel.anchoredFor(gr.code)) {\n      if (auto) await autoSkip(s, "ui_not_anchored");', '    if (!onGrPageOf(gr)) {\n      if (auto) await autoSkip(s, "ui_not_anchored");', "P2 chặn W1 chỉ theo URL (bỏ kiểm khung đang gắn)"),
    ("src/pos/pos-content.js", '    if (!onGrPageOf(gr) || !grPanel.anchoredFor(gr.code)) {\n      if (auto) await autoSkip(s, "ui_not_anchored");', '    if (!grPanel.anchoredFor(gr.code)) {\n      if (auto) await autoSkip(s, "ui_not_anchored");', "P2 chặn W1 chỉ theo khung (bỏ kiểm URL)"),
    ("src/pos/pos-content.js", "    if (!onGrPageOf(gr)) {\n      // v0.2.4 (PM P2): nút điền chỉ nằm", "    if (false) {\n      // v0.2.4 (PM P2): nút điền chỉ nằm", "P2 trang /chi-tiet-so vẫn có nút Điền (khung nổi)"),
    ("src/pos/pos-content.js", "    uiMissing = reason;\n    if (watched.key) logTo(", "    return;\n    if (watched.key) logTo(", "P2 thiếu chỗ gắn không báo lỗi giao diện"),
    ("src/pos/pos-content.js", '    if (watched.key) logTo(watched.key, { type: "ui_anchor_missing", reason });\n', "", "P2 không ghi chẩn đoán thiếu chỗ gắn vào nhật ký phiên"),
    ("src/pos/pos-content.js", "      if (!uiMissing) floatPanel.hide();", "      floatPanel.hide();", "P2 view mới xoá lỗi giao diện khi chỗ gắn vẫn thiếu"),
    ("src/pos/pos-content.js", "    return panel.show(Object.assign({}, view, { grCode: gr.code }));", "    return panel.show(view);", "P2 view của phiếu không mang mã phiếu"),
    ("src/pos/pos-content.js", "      grPanel.show(view, view.grCode || null);", "      grPanel.show(view, null);", "P2 khung trang phiếu không kiểm mã phiếu"),
    ("src/pos/pos-content.js", "(showGr).\n    panel.hide();\n", "(showGr).\n", "P2 đổi route không gỡ khung phiếu cũ"),
    ("src/pos/pos-content.js", '    if (page.kind === "gr" && page.grId !== id) return;\n', "", "P2 lượt đánh giá cũ về muộn vẽ view phiếu cũ lên trang phiếu khác"),
    # v0.2.4 — PM audit sơ bộ (docs/pm/AUDIT-PRELIM-v0.2.4-P2-20261027.md); ui/panel.js chạy thật trên tests/fake-dom.js
    ("src/ui/panel.js", "    const valid = () => placed() && o.find(code) === anchor;", "    const valid = () => placed();", "PM P1 khung đúng chỗ không kiểm lại mã phiếu trên trang"),
    ("src/ui/panel.js", "    const anchoredFor = (c) => !failed && !!view && !!c && code === c && valid();", "    const anchoredFor = (c) => !failed && !!view && !!c && code === c && placed();", "PM P1 anchoredFor không đọc lại mã phiếu lúc gọi"),
    ("src/ui/panel.js", "      if (valid()) return stopWait();", "      if (placed()) return stopWait();", "PM P1 observer không gỡ khung khi trang đổi mã phiếu"),
    ("src/ui/panel.js", '    JSON.stringify([v.tone || "info", v.title || "", v.lines || [], ', '    JSON.stringify([v.tone || "info", v.title || "", ', "PM P2 thu nhỏ: cảnh báo đổi dòng chữ không mở lại"),
    ("src/ui/panel.js", "v.table ? [v.table.head || [], v.table.rows || []] : null, ", "", "PM P2 thu nhỏ: bảng đổi không mở lại"),
    ("src/pos/pos-content.js", "const fresh = () => (evalHref === null || location.href === evalHref) && evalEpoch === statusEpoch;", "const fresh = () => evalEpoch === statusEpoch;", "PM P2 kết quả lượt đánh giá cũ về muộn vẽ trên trang mới"),
    ("src/pos/pos-content.js", '      if (!page || page.kind === "gr_list") return;', "      if (!page) return;", "PM P2 vẽ khung nổi trên danh sách (F4)"),
    ("src/pos/pos-content.js", "    evalHref = location.href;\n", "", "PM P2 không ghi URL của lượt đánh giá"),
    # v0.2.4 — PM audit rev 1 (docs/pm/AUDIT-REV1-v0.2.4-P2-20261027.md)
    ("src/lib/pos-model.js", "    if (main.length !== 1 || main[0] !== code) return null;\n", "", "PM rev1 P1 bỏ mã chuẩn trên thẻ thông tin (breadcrumb tự mở khoá)"),
    ("src/lib/pos-model.js", "    if (main.length !== 1 || main[0] !== code) return null;", "    if (main[0] !== code) return null;", "PM rev1 P1 thẻ thông tin nhiều mã GR vẫn nhận"),
    ("src/lib/pos-model.js", "    if (main.length !== 1 || main[0] !== code) return null;", "    if (main.length !== 1 || !main[0].includes(code)) return null;", "PM rev1 P1 mã khớp chuỗi con, không chính xác"),
    ("src/lib/pos-model.js", "      if (grCodesIn(n).some((c) => c !== code)) return null;\n", "", "PM rev1 P1 breadcrumb mang mã khác vẫn nhận"),
    ("src/lib/pos-model.js", "    while (info && info.hasAttribute(\"data-cgn-panel\")) info = info.previousElementSibling;\n", "", "PM rev1 P1 lấy khung extension làm thẻ thông tin"),
    ("src/pos/pos-content.js", "(showGr).\n    panel.hide();\n", "(showGr).\n    if (!applying) panel.hide();\n", "PM rev1 P2 đang ghi đổi route không gỡ khung"),
    ("src/pos/pos-content.js", '    if (page.kind === "so" && !(soPage && soPage.href === location.href && soPage.grIds.has(id))) return;\n', "", "PM rev1 P2 tiến trình phiếu A vẽ trên /chi-tiet-so SO khác"),
    ("src/pos/pos-content.js", "soPage && soPage.href === location.href && soPage.grIds.has(id)", "soPage && soPage.grIds.has(id)", "PM rev1 P2 dùng danh sách phiếu của SO đã xem trước đó"),
    # v0.2.5 — PM AUDIT-A1-GR03887 P2 (docs/pm/AUDIT-A1-GR03887-STG-v0.2.4-20261028.md §2)
    ("src/pos/pos-content.js", "      if (s && !onGrPageOf(gr)) return renderSession(env, gr, s);", "      if (s) return renderSession(env, gr, s);", "v0.2.5 P2 phiếu kết thúc vẫn vẽ khung phiên trên trang phiếu (khung đỏ A1)"),
    ("src/pos/pos-content.js", "      unwatch();\n      if (fresh()) panel.hide(); // lượt cũ", "      unwatch();\n      return; // lượt cũ", "v0.2.5 P2 phiếu kết thúc không gỡ khung đang có"),
    ("src/pos/pos-content.js", "      statusEpoch += 1;\n      panel.hide();\n", "      statusEpoch += 1;\n", "v0.2.5 P2 hook HOÀN THÀNH không gỡ khung ngay (chờ GET)"),
    ("src/pos/pos-content.js", "      statusEpoch += 1;\n      panel.hide();\n", "      panel.hide();\n", "v0.2.5 P2 lượt đánh giá cũ vẫn vẽ sau HOÀN THÀNH"),
    ("src/pos/pos-content.js", "const fresh = () => (evalHref === null || location.href === evalHref) && evalEpoch === statusEpoch;", "const fresh = () => evalHref === null || location.href === evalHref;", "v0.2.5 P2 vẽ không kiểm lượt HOÀN THÀNH"),
    ("src/pos/pos-content.js", "    evalEpoch = statusEpoch;\n", "", "v0.2.5 P2 lượt đánh giá mới không nhận mốc HOÀN THÀNH"),
    ("src/pos/pos-content.js", "page.grId === lower(p.grId)) {\n      statusEpoch", "true) {\n      statusEpoch", "v0.2.5 P2 HOÀN THÀNH của phiếu khác gỡ khung phiếu đang xem"),
    ("src/pos/pos-content.js", 'if (p.status !== "COMPLETED" || !(p.httpStatus >= 200 && p.httpStatus < 300)) return;', 'if (p.status !== "COMPLETED") return;', "v0.2.5 P2 HOÀN THÀNH HTTP lỗi vẫn coi là xong"),
    ("src/pos/pos-content.js", '    if (s.state === "done") {\n      // v0.2.5', '    if (false) {\n      // v0.2.5', "v0.2.5 P2 phiên done mà POS còn nhận được vẫn báo đã HOÀN THÀNH"),
    ("src/pos/pos-content.js", "    if (!s) {\n      unwatch();", '    if (!s || s.state === "done") {\n      unwatch();', "v0.2.5 P2 phiên done mà POS còn nhận được mở lại nút Nhận hàng"),
    # v0.2.5 — PM AUDIT-A1-GR03887 P3
    ("src/popup/popup.js", '      if (!open.some((s) => String(s.grCode || "").toUpperCase() === code)) {', "      if (false) {", "v0.2.5 P3 cấp phép mã không khớp phiên"),
    ("src/popup/popup.js", "s.envId === env.id && ", "", "v0.2.5 P3 phiên môi trường khác vẫn tính"),
    ("src/popup/popup.js", " && ACTIVE.has(s.state));", ");", "v0.2.5 P3 phiên done vẫn tính"),
    ("src/popup/popup.js", "(s) => s && s.schema && s.envId", "(s) => s && s.envId", "v0.2.5 P3 phiên bản cũ (không schema) vẫn tính"),
    ("src/popup/popup.js", '        list = await bg("session:list");', '        list = await bg("session:list").catch(() => [{ schema: 1, envId: env.id, state: "received", grCode: code }]);', "v0.2.5 P3 đọc phiên lỗi vẫn cấp phép"),
    ("src/popup/popup.js", 'const code = String($("grCode").value || "").trim().toUpperCase();', 'const code = String($("grCode").value || "");', "v0.2.5 P3 so mã khác chuẩn hoá của background"),
    # v0.3.0 — PM DECISION-ONE-STG-AUTO-FLOW-20261028 §2 (tự điền + tự HOÀN THÀNH một lần)
    ("src/background.js", '  if (sender && sender.tab) throw new Error("Chỉ cho phép tự động từ popup extension");\n', "", "v0.3.0 trang web tự cấp quyền tự động"),
    ("src/background.js", "  if (!env || !env.writeEnabled) throw new Error(`${env ? env.label : s.envId}: chỉ đọc, không cho phép tự động`);\n", "", "v0.3.0 PRD cấp được quyền tự động"),
    ("src/background.js", '  if (s.state !== "nw_ready") throw new Error("Chỉ cho phép khi phiên đã khớp đơn Nextwaves và CHƯA xác nhận nhận hàng");\n', "", "v0.3.0 cấp quyền tự động sau khi đã nhận"),
    ("src/background.js", "  if (c.grCode !== s.grCode || c.nwPoNumber !== s.nwPoNumber || c.epcCount !== epcs.length) throw", "  if (false) throw", "v0.3.0 bỏ đối chiếu xác nhận của popup"),
    ("src/background.js", "    g.sessionCreatedAt === s.createdAt &&\n", "", "v0.3.0 phiên tạo lại thừa hưởng quyền tự động"),
    ("src/background.js", "  for (const k of Object.keys(all)) if (!(all[k].expiresAt > now) || !isCurrent(all[k])) delete all[k];\n  return all;\n}\n\nconst epcSetOf", "  for (const k of Object.keys(all)) if (!isCurrent(all[k])) delete all[k];\n  return all;\n}\n\nconst epcSetOf", "v0.3.0 quyền tự động không hết hạn",
     [("    g.expiresAt > Date.now() &&\n", "")]),
    ("src/background.js", '    else if (got.length !== units.length || got.length !== g.epcs.length || got.some((e, i) => e !== g.epcs[i])) reason = "epc_set";\n', "", "v0.3.0 bỏ đối chiếu tập EPC nhận với quyền"),
    ("src/background.js", '    else if (fresh.length !== 1) reason = "receipts";', '    else if (fresh.length < 1) reason = "receipts";', "v0.3.0 hai biên nhận mới vẫn tự chạy"),
    ("src/background.js", '    if (!autoGrantFits(g, s)) reason = "grant_invalid";\n    else if (got', '    if (false) reason = "grant_invalid";\n    else if (got', "v0.3.0 điểm kích hoạt không kiểm quyền còn hiệu lực"),
    ("src/background.js", '  if (!sender || !sender.tab || sender.tab.id !== s.autoRun.tabId) return { eligible: false, reason: "other_tab" };\n', "", "v0.3.0 tab không được giao cũng tự chạy"),
    ("src/background.js", '    if (!s.autoRun || s.autoRun.skipped || !sender || !sender.tab || sender.tab.id !== s.autoRun.tabId) return no("auto_tab");', '    if (!s.autoRun || s.autoRun.skipped) return no("auto_tab");', "v0.3.0 claim tự động từ tab không được giao"),
    ("src/background.js", '    if (s.state !== "received" || s.authorization) return no("auto_state");', '    if (false) return no("auto_state");', "v0.3.0 claim tự động lần hai / sau khi dừng"),
    ("src/background.js", '    if (!want.length || got.length !== rawUids.length || want.length !== got.length || want.some((u, i) => u !== got[i])) return no("auto_uids");\n', "", "v0.3.0 claim tự động với tập UID thiếu / trùng"),
    ("src/background.js", "    delete ag[s.key];\n    await chrome.storage.local.set({ autoGrants: ag });\n", "", "v0.3.0 quyền tự động không bị tiêu khi claim"),
    ("src/background.js", '  if (s.completeClaim) return no("already_claimed");\n', "", "v0.3.0 giữ lượt HOÀN THÀNH lần hai",
     [('  if (s.state !== "applied") return no(`state_${s.state}`);\n', "")]),
    ("src/background.js", '  if (!msg.token || s.autoToken !== msg.token) return no("token");\n', "", "v0.3.0 tab khác giữ lượt HOÀN THÀNH"),
    ("src/background.js", '  if (!a.auto || a.planHash !== msg.planHash || !s.applyResult || s.applyResult.hash !== msg.planHash) return no("not_auto");\n', "", "v0.3.0 giữ lượt HOÀN THÀNH cho lượt không tự động / kế hoạch khác"),
    ("src/background.js", "  if (r.done === true) {", "  if (true) {", "v0.3.0 kết quả HOÀN THÀNH chưa rõ ghi thành done"),
    ("src/background.js", '  if (s.state === "auto_completing" && !(state === "done" && s.completeClaim && Date.now() - s.completeClaim.at > T.completeStaleMs)) throw new Error("Phiên đang tự HOÀN THÀNH");\n', "", "v0.3.0 hook / tab khác đóng sớm phiên đang tự HOÀN THÀNH"),
    ("src/background.js", '        if (s && s.state === "auto_completing" && !(s.completeClaim && Date.now() - s.completeClaim.at > T.completeStaleMs)) throw new Error("Phiên đang tự HOÀN THÀNH — chờ xong mới huỷ");\n', "", "v0.3.0 huỷ được phiên đang tự HOÀN THÀNH"),
    ("src/background.js", "for (const [k, g] of Object.entries(autoGrants || {})) if (isCurrent(g)) keptAuto[k] = g;", "for (const [k, g] of Object.entries(autoGrants || {})) keptAuto[k] = g;", "v0.3.0 nâng cấp giữ quyền tự động của bản cũ"),
    ("src/pos/pos-content.js", "    if (!chk.ok) return skip(chk.reason);\n", "", "v0.3.0 bỏ autoPlanCheck trước khi tự điền"),
    ("src/pos/pos-content.js", '    if (!link.ok || link.deliveryCode !== s.deliveryCode || link.soBase !== s.soBase || gr.posId !== s.posId || gr.id !== s.grId) return skip("link_changed");\n', "", "v0.3.0 bỏ đọc lại PO / SO trước khi tự điền"),
    ("src/pos/pos-content.js", '    if (!(await waitAnchored(gr, T.autoAnchorWaitMs))) return skip("ui_not_anchored");\n', "", "v0.3.0 bỏ chờ khung gắn đúng trang trước khi tự điền"),
    ("src/pos/pos-content.js", '    if (!v.ok) {\n      logTo(s.key, { type: "auto_verify_failed"', '    if (false) {\n      logTo(s.key, { type: "auto_verify_failed"', "v0.3.0 bỏ đọc lại toàn phiếu trước HOÀN THÀNH"),
    ("src/pos/pos-content.js", '    const completed = !!after && after.id === gr.id && after.status === "COMPLETED";', "    const completed = !!after;", "v0.3.0 done không cần GET thấy COMPLETED"),
    ("src/pos/pos-content.js", "    if (auto && res.ok && finished) {", "    if (false && auto && res.ok && finished) {", "v0.3.0 tải lại thay vì tự HOÀN THÀNH"),
    ("src/lib/plan.js", '    if (plan.warnings.length) return no("plan_warning");\n', "", "v0.3.0 tự chạy khi nhận thiếu (cảnh báo)"),
    ("src/lib/plan.js", '    if (!plan.summary || plan.summary.alreadyOnGr !== 0) return no("uid_already_on_gr");\n', "", "v0.3.0 tự chạy khi phiếu đã có UID"),
    ("src/lib/plan.js", '    if (planned.size !== uids.length || uids.some((u) => !planned.has(u))) return no("uid_set");\n', "", "v0.3.0 kế hoạch không phủ hết UID vẫn tự chạy"),
    ("src/lib/plan.js", '        if (want.length !== got.length || want.some((c, i) => c !== got[i])) bad("codes", d.id);\n', "", "v0.3.0 verifyFinal bỏ so tập mã từng lô"),
    ("src/lib/plan.js", '        if (d.received !== st.target) bad("received", d.id);\n', "", "v0.3.0 verifyFinal bỏ so lượng nhận"),
    ("src/lib/plan.js", '        if (st.lotId !== d.lotId || st.lotDate !== d.lotDate) bad("lot", d.id);\n', "", "v0.3.0 verifyFinal bỏ so lô"),
    ("src/lib/plan.js", '    if (gr.status !== "RECEIVING") bad("status");\n', "", "v0.3.0 verifyFinal bỏ so trạng thái phiếu"),
    ("src/lib/plan.js", '        if ((d.qrCodeCount === undefined ? d.qrCodes.length : d.qrCodeCount) !== d.qrCodes.length) bad("duplicate_codes", d.id);\n', "", "v0.3.0 verifyFinal bỏ mã nối trùng"),
    ("src/lib/plan.js", '          bad("detail_new", d.id);\n          continue;', "          continue;", "v0.3.0 verifyFinal bỏ chi tiết lạ"),
    ("src/popup/popup.js", "    open.addEventListener(\"click\", () => {\n      wrap.replaceChildren();", "    open.addEventListener(\"click\", async () => {\n      await bg(\"auto:arm\", { key: s.key, confirm: { grCode: s.grCode, nwPoNumber: s.nwPoNumber, epcCount: epcs } }).catch(() => {});\n      wrap.replaceChildren();", "v0.3.0 popup cấp quyền ngay khi bấm, bỏ bước xác nhận"),
    ("src/popup/popup.js", '    if (!env || !env.writeEnabled || s.envId !== env.id || s.state !== "nw_ready") return null;', "    if (!env) return null;", "v0.3.0 popup hiện nút cho phiên không đủ điều kiện"),
    ("src/background.js", '  if (!s.autoRun || s.autoRun.skipped || !sender.tab || sender.tab.id !== s.autoRun.tabId) return s;', '  if (!s.autoRun || s.autoRun.skipped) return s;', "v0.3.0 tab không được giao bỏ qua hộ lượt tự động"),
    ("src/background.js", '  if (s.autoRun.skipped) return { eligible: false, reason: "skipped" };\n', "", "v0.3.0 auto:status không giữ quyết định bỏ qua"),
    ("src/background.js", '    if (!s.autoRun || s.autoRun.skipped || !sender || !sender.tab || sender.tab.id !== s.autoRun.tabId) return no("auto_tab");', '    if (!s.autoRun || !sender || !sender.tab || sender.tab.id !== s.autoRun.tabId) return no("auto_tab");', "v0.3.0 claim tự động sau khi lượt đã bị bỏ qua"),
    ("src/background.js", "  } else if (armedEarlier(s)) {", "  } else if (false) {", "v0.3.0 không ghi grant_expired"),
    ("src/pos/pos-content.js", "    const skip = async (reason) => {\n      await autoSkip(s, reason);\n      return reason;\n    };", "    const skip = async (reason) => reason;", "v0.3.0 không lưu quyết định bỏ qua (tự chạy lại khi Kiểm tra lại)"),
    ("src/pos/pos-content.js", 'const autoPending = s && (s.state === "auto_completing" || s.state === "auto_complete_unknown");', 'const autoPending = s && s.state === "auto_completing";', "v0.3.0 hook đóng phiên HOÀN THÀNH chưa rõ"),
    # v0.3.0 P2.5 (PM Codex AUDIT-G0-v0.2.5-G1-PRELIM §2): bỏ qua → thu hồi quyền, popup / Nextwaves báo đã dừng
    ("src/background.js", "  await dropAutoGrant(s.key); // P2.5: quyết định cuối cho lượt nhận này — quyền không còn hiển thị / dùng được\n", "", "v0.3.0 P2.5 bỏ qua ở POS không thu hồi quyền"),
    ("src/background.js", "      await dropAutoGrant(key); // P2.5: lượt nhận này không tự chạy → thu hồi quyền\n", "", "v0.3.0 P2.5 bỏ qua ở điểm kích hoạt không thu hồi quyền"),
    ("src/popup/popup.js", "    if (skipped) {", "    if (false) {", "v0.3.0 P2.5 popup không báo tự động đã dừng"),
    # v0.3.0 — audit độc lập (sub-agent, 29/10): F1–F6
    ('src/background.js', '  if (s.scanOk) throw new Error("Nextwaves đã ghi nhận lượt xác nhận nhận hàng — không cho phép tự động cho lượt này");\n', '', 'audit F1 cho phép tự động sau lượt nhận 2xx'),
    ('src/background.js', '    else if (!(cur.scanOkAt >= g.createdAt)) reason = "armed_after_scan"; // F1: quyền phải có TRƯỚC lượt xác nhận nhận hàng (cấp quyền sau đó đã bị auto:arm chặn)\n', '', 'audit F1 kích hoạt với quyền có sau lượt nhận'),
    ('src/background.js', '  if ((s.receiptIdsBefore || []).length) throw new Error("PO Nextwaves đã có biên nhận từ trước — không cho phép tự động");\n', '', 'audit F2 cho phép tự động khi PO đã có biên nhận'),
    ('src/background.js', '        await dropAutoGrant(msg.key); // audit F3: huỷ phiên thì bỏ luôn quyền tự động của phiên đó\n', '', 'audit F3 huỷ phiên không thu hồi quyền'),
    ('src/popup/popup.js', '    if (autoGrant && autoGrant.sessionCreatedAt === s.createdAt) {', '    if (autoGrant) {', 'audit F3 popup hiện quyền của phiên cũ'),
    ('src/background.js', 'if (chrome.tabs && chrome.tabs.onRemoved) chrome.tabs.onRemoved.addListener((tabId) => serial(() => onTabRemoved(tabId)));\n', '', 'audit F4 tab được giao đóng không bỏ qua'),
    ('src/pos/pos-content.js', '      if (st.reason === "grant_invalid") await autoSkip(s, "grant_invalid"); // audit F4 (background chỉ nhận từ tab được giao)\n', '', 'audit F4 quyền hết hạn sau kích hoạt không bỏ qua'),
    ('src/pos/pos-content.js', '      if (s.state === "received" && s.autoRun && !s.autoRun.skipped) await autoSkip(s, "uid_already_on_gr"); // audit F4: thu hồi quyền\n', '', 'audit F4 phiếu đã đủ UID không bỏ qua'),
    ('src/nw/nw-content.js', '    if (stopped || s.state === "apply_stopped") return ["Tự động đã dừng — POS xử lý theo luồng thủ công."];\n', '', 'audit F4 Nextwaves vẫn báo tự động khi đã dừng'),
    ('src/pos/pos-content.js', '        if (s.state === "auto_completing" && s.completeClaim && Date.now() - s.completeClaim.at < T.autoCompleteGraceMs) {', '        if (false) {', 'audit F5 tab khác khuyên bấm khi đang gửi'),
    ('src/pos/pos-content.js', '    if (auto && !vf && !stoppedAfter && !s.completeClaim && !missing.length && s.applyResult && Date.now() - s.applyResult.at < T.autoCompleteGraceMs) {', '    if (false) {', 'audit F5 tab khác khuyên bấm khi tab chủ đang đọc lại'),
    ('src/background.js', '  return had; // audit F6: false = không còn quyền (lượt tự động đã bắt đầu / đã dừng / hết hạn)', '  return true;', 'audit F6 thu hồi luôn báo thành công'),
]


def run_tests(base):
    pr = subprocess.Popen(["node", "--test", "--test-timeout=60000", "tests/*.test.js"], cwd=base, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8")
    try:
        out, _ = pr.communicate(timeout=TIMEOUT_S)
        return pr.returncode, out
    except subprocess.TimeoutExpired:
        if os.name == "nt":
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(pr.pid)], capture_output=True)
        else:
            pr.kill()
        pr.communicate()
        return None, f"✖ (hết giờ {TIMEOUT_S} s — bộ test không xong)"


def main():
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    base = tempfile.mkdtemp(prefix="cgn-mutate-")
    try:
        for d in ("src", "tests", "samples"):
            shutil.copytree(os.path.join(ROOT, d), os.path.join(base, d))
        shutil.copy2(os.path.join(ROOT, "package.json"), base)
        code, out = run_tests(base)
        if code != 0:
            print("Bộ test gốc chưa xanh — dừng.", flush=True)
            print(out[-2000:])
            return 2
        killed = 0
        for m in muts[start:]:
            f, a, b, name = m[:4]
            # Ca kép: phần tử thứ 5 = các cặp (neo, thay) gỡ thêm trên cùng file (hàng rào lớp dưới che hàng rào đang kiểm).
            pairs = [(a, b)] + list(m[4] if len(m) > 4 else [])
            p = os.path.join(base, f)
            orig = open(p, encoding="utf-8").read()
            if any(orig.count(x) != 1 for x, _ in pairs):
                print("ANCHOR?", name, [orig.count(x) for x, _ in pairs], flush=True)
                continue
            # env.js có bản sao y hệt cho MAIN world: đột biến áp lên cả hai.
            twins = [p] + ([os.path.join(base, "src/main/env.js")] if f == "src/lib/env.js" else [])
            origs = {q: open(q, encoding="utf-8").read() for q in twins}
            for q in twins:
                mutated = origs[q]
                for x, y in pairs:
                    mutated = mutated.replace(x, y)
                open(q, "w", encoding="utf-8", newline="\n").write(mutated)
            try:
                _, out = run_tests(base)
            finally:
                for q in twins:
                    open(q, "w", encoding="utf-8", newline="\n").write(origs[q])
            fails = sorted(set(l[:72] for l in out.splitlines() if l.startswith("✖") and "failing tests" not in l))
            if fails:
                killed += 1
            print(("KILLED " if fails else "SURVIVED ") + name, "|", " || ".join(fails[:2]), flush=True)
        total = len(muts) - start
        print(f"{killed}/{total} bị bắt (từ ca {start + 1})", flush=True)
        return 0 if killed == total else 1
    finally:
        shutil.rmtree(base, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
