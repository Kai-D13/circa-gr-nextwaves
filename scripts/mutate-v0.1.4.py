"""Đột biến có chủ đích cho các hàng rào của v0.1.4 (PM audit 24/10: P1.1–P1.7, P2.1–P2.4, P3; chống vòng lặp tạo phiên).

Mỗi ca gỡ đúng MỘT hàng rào trong src/, chạy `node --test "tests/*.test.js"`; bộ test phải hỏng (KILLED).
Chạy trên BẢN SAO trong thư mục tạm — không sửa src/ của repo. Cần Node (node --test) trên PATH.

  python -I scripts/mutate-v0.1.4.py            # mọi ca
  python -I scripts/mutate-v0.1.4.py 24         # bắt đầu từ ca thứ 25
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
    ("src/pos/pos-content.js", "const writeLocks = lock ? [lock] : [];", "const writeLocks = [];", "P1.6 phiên không mang khoá SO"),
    ("src/pos/pos-content.js", '''    if (!found.ok) {
      watched = { key: null, state: null };''', '''    if (false) {
      watched = { key: null, state: null };''', "P1.6 đường /chi-tiet-so đi tiếp khi chưa đủ"),
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
    # Chống vòng lặp tạo phiên (phát hiện khi chạy đột biến v0.1.3)
    ("src/pos/pos-content.js", "if (lastStart.grId === gr.id && Date.now() - lastStart.at < T.restartGuardMs) {", "if (false) {", "Chống vòng lặp: bỏ chốt chặn tạo phiên lặp"),
]


def run_tests(base):
    pr = subprocess.Popen(["node", "--test", "tests/*.test.js"], cwd=base, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8")
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
            open(p, "w", encoding="utf-8", newline="\n").write(orig.replace(a, b))
            try:
                _, out = run_tests(base)
            finally:
                open(p, "w", encoding="utf-8", newline="\n").write(orig)
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
