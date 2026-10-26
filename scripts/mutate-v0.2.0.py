"""Đột biến có chủ đích cho các hàng rào của v0.2.0 = ca của v0.1.6 (đổi neo theo mã mới; bỏ ca "chốt chặn tạo phiên lặp" vì v0.2
không còn tự tạo phiên — thay bằng ca "tự tạo phiên khi mở phiếu") + ca v0.2 (lối vào danh sách, thứ tự lượt R1, huỷ cú bấm R2,
header S3, returnUrl S4, hợp đồng hook S5, cache QR / lọc refresh S6, log scan_ok).
Các ca cũ: hàng rào của v0.1.5 (PM audit 24/10: P1.1–P1.7, P2.1–P2.4, P3; manifest không nạp trùng env.js — lỗi T1 25/10)
và v0.1.6 (khung không che nút trang). Phần DOM của nút danh sách (pos/gr-list.js) kiểm trên Edge thật (scripts/edge-check.js).

Mỗi ca gỡ đúng MỘT hàng rào trong src/, chạy `node --test "tests/*.test.js"`; bộ test phải hỏng (KILLED).
Chạy trên BẢN SAO trong thư mục tạm — không sửa src/ của repo. Cần Node (node --test) trên PATH.

  python -I scripts/mutate-v0.2.0.py            # mọi ca
  python -I scripts/mutate-v0.2.0.py 24         # bắt đầu từ ca thứ 25

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
    ("src/background.js", "if (!(all[k].expiresAt > now) || !isCurrent(all[k])) delete all[k];", "if (!(all[k].expiresAt > now)) delete all[k];", "P2.4 cấp phép kiểu cũ vẫn dùng được"),
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
        for f, a, b, name in muts[start:]:
            p = os.path.join(base, f)
            orig = open(p, encoding="utf-8").read()
            if orig.count(a) != 1:
                print("ANCHOR?", name, orig.count(a), flush=True)
                continue
            # env.js có bản sao y hệt cho MAIN world: đột biến áp lên cả hai.
            twins = [p] + ([os.path.join(base, "src/main/env.js")] if f == "src/lib/env.js" else [])
            origs = {q: open(q, encoding="utf-8").read() for q in twins}
            for q in twins:
                open(q, "w", encoding="utf-8", newline="\n").write(origs[q].replace(a, b))
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
