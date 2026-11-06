"""Đột biến cho v0.4.0 = các ca của v0.3.1 (scripts/mutate-v0.3.1.py ← v0.3.0) CÒN NEO được trên mã hiện tại + ca mới của v0.4.0.

v0.4.0 (operator 06/11) bỏ cấp phép / quyền tự động / tự HOÀN THÀNH và bảng cửa hàng → kho: ca cũ của các phần đó không còn neo
(mã đã xoá) → tự loại, in số lượng. Ca cũ còn neo (lõi kế hoạch / ghi / khoá / khung trang phiếu) chạy lại trên bộ test MỚI.

  python -I scripts/mutate-v0.4.0.py            # mọi ca còn neo + ca v0.4.0
  CGN_MUT_ONLY_NEW=1 python -I scripts/mutate-v0.4.0.py   # chỉ ca v0.4.0
"""
import importlib.util
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
spec = importlib.util.spec_from_file_location("mutate031", os.path.join(HERE, "mutate-v0.3.1.py"))
m031 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m031)
m030 = m031.m030


def src(f):
    return open(os.path.join(ROOT, f), encoding="utf-8").read()


def anchored(m):
    text = src(m[0])
    pairs = [(m[1], m[2])] + list(m[4] if len(m) > 4 else [])
    return all(text.count(a) == 1 for a, _ in pairs)


old = list(m030.muts)
kept = [m for m in old if anchored(m)]
print(f"ca cũ: {len(old)}; còn neo trên v0.4.0: {len(kept)}; bỏ (mã đã xoá / đổi): {len(old) - len(kept)}", flush=True)

NEW = [
    # A1 — tab Nextwaves tìm đơn một lần (lỗi GR84570)
    ("src/nw/nw-content.js", "      if (sig === sessionsSig) return;\n", "", "v0.4 A1 đánh giá lại mọi lần sessions đổi (vòng lặp GR84570)"),
    ("src/nw/nw-content.js", "      if (latch && latch.sig === sigOf(s) && !force) return panel.show(latch.view);\n", "", "v0.4 A1 bỏ giữ lỗi (latch)"),
    ("src/nw/nw-content.js", '      if (r.reason === "no_order") {', "      if (false) {", "v0.4 không có đơn không sang no_nw_order"),
    ("src/nw/nw-content.js", "      else if (changed && latch && latch.status === 401) {", "      else if (false) {", "v0.4 A1 không tìm lại khi token mới sau 401"),
    ("src/nw/nw-content.js", '          title: "Chưa thấy Nextwaves tải dữ liệu",', '          title: "Đang chờ Nextwaves tải dữ liệu…",', "v0.4 A4 không báo F5 khi chờ token quá lâu"),
    # C2 — đầu đọc trên màn quét
    ("src/nw/nw-content.js", "    if (rd.clicks.length >= T.readerMaxClicks) {", "    if (false) {", "v0.4 C2 bấm Kết nối đầu đọc không giới hạn"),
    ("src/nw/nw-content.js", "  const READER_CONNECT = /^(kết nối đầu đọc|connect reader)$/iu;", "  const READER_CONNECT = /^(kết nối đầu đọc|connect reader|xác nhận nhận hàng)$/iu;", "v0.4 C2 bấm cả nút Xác nhận nhận hàng"),
    # A7 / A2 / A3 / C5 — background
    ("src/background.js", "  if (hits.length !== 1) return null;", "  if (!hits.length) return null;", "v0.4 A7 nhiều phiên vẫn giao lượt nhận"),
    ("src/background.js", "  if (!UUID_RE.test(sid) || !(scan.httpStatus >= 200 && scan.httpStatus < 300)) return null;", "  if (!UUID_RE.test(sid)) return null;", "v0.4 A7 giao cả lượt không 2xx"),
    ("src/background.js", '  if (!cur) throw new Error("Không có phiên — Nextwaves ĐÃ nhận nhưng POS CHƯA điền: nhận tay trên POS");', "  if (!cur) return null;", "v0.4 A2 phiên mất sau khi nhận → im lặng"),
    ("src/background.js", '  if (!s) throw new Error("Không có phiên — Nextwaves đã nhận nhưng extension không còn phiên của phiếu này");', "  if (!s) return null;", "v0.4 A2 scanOk phiên mất → im lặng"),
    ("src/background.js", '  if (page && (page.kind === "gr_list" || (page.kind === "gr" && page.grId === s.grId))) {', "  if (tab && page) {", "v0.4 A3 giật tab POS đang ở phiếu khác"),
    ("src/background.js", "        await chrome.tabs.remove(nwTabId);", "        void 0;", "v0.4 C5 không đóng tab Nextwaves sau khi nhận"),
    ("src/background.js", '    const r = await readerRelay(s, "return", leaseId).catch(() => null);', '    const r = await readerRelay(s, "return", "khac").catch(() => null);', "v0.4 trả sai lượt mượn đầu đọc"),
    ("src/background.js", '  laterReturnReader(s2, "no_order");\n', "", "v0.4 không có đơn không trả đầu đọc"),
    ("src/background.js", "      s.nwTenant === env.nwTenant &&\n", "", "v0.4 B6 tìm phiên không theo tenant"),
    ("src/background.js", "    isStr(m.warehouseId) &&\n    UUID_RE.test(m.warehouseId) &&\n", "", "v0.4 khớp đơn không cần kho của đơn"),
    ("src/background.js", '  if (!s.warehouseId) out.push("nw_not_matched");\n', "", "v0.4 ghi được khi chưa khớp đơn Nextwaves"),
    ("src/background.js", '  const stale = s.state === "applying" && !leaseLive(s);', "  const stale = false;", "v0.4 A8 applying hết lease không đóng được"),
    ("src/background.js", '      if (sender && sender.tab) throw new Error("Chỉ đổi cấu hình từ popup extension");\n', "", "v0.4 trang web đổi được cấu hình"),
    ("src/background.js", "  if (next.nwTenant && !E.normTenant(next.nwTenant)) throw new Error(", "  if (false) throw new Error(", "v0.4 lưu tenant sai"),
    ("src/background.js", "  if (cur && isCurrent(cur) && ACTIVE.has(cur.state) && cur.state !== \"no_nw_order\") {", "  if (cur && isCurrent(cur) && ACTIVE.has(cur.state)) {", "v0.4 bấm lại phiếu không có đơn không tìm lại"),
    # pos-content — tự điền, 5xx, đầu đọc
    ("src/pos/pos-content.js", '    if (!res.ok && res.reason === "put_failed" && (!res.status || res.status >= 500)) res = Object.assign({}, res, { reason: "put_uncertain" });\n', "", "v0.4 A9 PUT 5xx coi là lỗi chắc chắn (không hạ nhiệt)"),
    ("src/pos/pos-content.js", '    if (s.state === "received" && !autoTried.has(autoKey)) {', '    if (s.state === "received") {', "v0.4 tự điền lặp lại mỗi lần đánh giá"),
    ("src/pos/pos-content.js", '    if (s.state === "received" && !autoTried.has(autoKey)) {', "    if (!autoTried.has(autoKey)) {", "v0.4 tự điền cả khi đã dừng"),
    ("src/pos/pos-content.js", "      const reader = await readerLend(gr.code, s0 && s0.reader ? s0.reader.leaseId : null);", "      const reader = null;", "v0.4 không mượn đầu đọc trước khi mở Nextwaves"),
    ("src/pos/pos-content.js", '      if (msg.cmd === "return") return (await readerAsk({ type: "return", leaseId: msg.leaseId }, T.readerLendMs)) || { ok: false, reason: "no_answer" };', '      if (msg.cmd === "return") return { ok: true };', "v0.4 báo đã trả đầu đọc mà không trả"),
    ("src/pos/pos-content.js", '    if (!m || m.ns !== RNS || m.from !== "qsl" || typeof m.reqId !== "string") return;', '    if (!m || m.ns !== RNS || typeof m.reqId !== "string") return;', "v0.4 nhận trả lời của chính mình như QR Scan Log"),
    # resolve / env
    ("src/lib/resolve.js", "    if (whs.length !== 1 || !whs[0]) return fail(", "    if (false) return fail(", "v0.4 đơn cùng SO khác kho vẫn chọn"),
    ("src/lib/resolve.js", '    if (verified.length === 0) return fail("no_order");\n', "", "v0.4 không phân biệt không có đơn"),
    ("src/lib/env.js", "  const TENANT_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/;", "  const TENANT_RE = /^.+$/;", "v0.4 tenant nhận mọi chuỗi"),
    ("src/lib/env.js", "    return isNwApiUrl(url, env) ? env : null; // isNwApiUrl", "    return env; // isNwApiUrl", "v0.4 coi mọi URL Nextwaves là API"),
]
for m in NEW:
    assert src(m[0]).count(m[1]) == 1, ("neo v0.4.0", m[3], src(m[0]).count(m[1]))

muts = NEW if os.environ.get("CGN_MUT_ONLY_NEW") else kept + NEW
if os.environ.get("CGN_MUT_FILTER"):
    keys = [k for k in os.environ["CGN_MUT_FILTER"].split("|") if k]
    muts = [m for m in muts if any(k in m[3] for k in keys)]
m030.muts = muts
print(f"chạy {len(muts)} ca ({len(NEW)} ca v0.4.0)", flush=True)

if __name__ == "__main__":
    sys.exit(m030.main())
