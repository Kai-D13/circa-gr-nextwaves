"""Đột biến cho v0.4.1 = các ca cũ (v0.4.0 ← v0.3.1 ← v0.3.0) CÒN NEO được trên mã hiện tại + ca neo lại (mã v0.4.1 dời chỗ neo,
cùng ý) + ca mới của v0.4.1 (phiếu phần còn lại, đầu đọc bị QR Scan Log giữ, audit v0.4.0 F1–F3 + P3).

Ca riêng của v0.4.0 đọc bằng ast từ scripts/mutate-v0.4.0.py (KHÔNG chạy file đó: nó khẳng định neo của chính nó, mà v0.4.1 dời vài
chỗ neo). Chạy MỘT MÌNH — không song song `node --test` / `npm test` (memory: mutation mồ côi sửa source).

  python -I scripts/mutate-v0.4.1.py                              # mọi ca
  CGN_MUT_ONLY_NEW=1 python -I scripts/mutate-v0.4.1.py           # chỉ ca v0.4.1 (+ ca neo lại)
  CGN_MUT_FILTER="P3-6|F1" python -I scripts/mutate-v0.4.1.py     # lọc theo tên
"""
import ast
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


def literal(script, name):
    tree = ast.parse(open(os.path.join(HERE, script), encoding="utf-8").read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise KeyError(f"{script}: không thấy {name}")


def anchored(m):
    text = src(m[0])
    pairs = [(m[1], m[2])] + list(m[4] if len(m) > 4 else [])
    return all(text.count(a) == 1 for a, _ in pairs)


NEW040 = literal("mutate-v0.4.0.py", "NEW")
DEAD040 = literal("mutate-v0.4.0.py", "DEAD")
old = [m for m in list(m030.muts) + NEW040 if m[3] not in DEAD040]
# Ca v0.4.0 mà v0.4.1 dời chỗ neo (cùng ý, cùng tên) → thay bằng neo mới ở REANCHOR; không tính là "bỏ".
REANCHOR = [
    ("src/nw/nw-content.js", '      if (r.reason === "no_order" || r.reason === "nw_partial_received") {', "      if (false) {", "v0.4 không có đơn không sang no_nw_order"),
    ("src/background.js", "        await chrome.tabs.remove(id);", "        void 0;", "v0.4 C5 không đóng tab Nextwaves sau khi nhận"),
    ("src/background.js", "  const list = Object.values(all).filter((s) => isCurrent(s) && s.envId === env.id && s.nwTenant === env.nwTenant && ACTIVE.has(s.state) && matchesNwPo(s, po));", "  const list = Object.values(all).filter((s) => isCurrent(s) && s.envId === env.id && ACTIVE.has(s.state) && matchesNwPo(s, po));", "v0.4 B6 tìm phiên không theo tenant"),
    ("src/pos/pos-content.js", '      v = fresh ? PL.verifyFinal(plan, fresh, unitsForPlan(s)) : { ok: false, diffs: [{ why: "read_failed", detailId: null }] };', "      v = { ok: true, diffs: [] };", "khớp cuối: không kiểm cả phiếu sau khi điền"),
    ("src/background.js", '  laterCloseNwAndReturn(s, s.nwTabId, "cancel", [s.nwTabPrev]);', '  laterReturnReader(s, "cancel");', "review P2-3 huỷ phiên không đóng tab Nextwaves"),
    ("src/background.js", '  if (state === "done" && (NW_OPEN.has(s.state) || s.state === "no_nw_order")) laterCloseNwAndReturn(s2, s.nwTabId, "gr_done", [s.nwTabPrev]);\n', "", "review P3-6 phiếu xong không trả đầu đọc"),
    # soWriteLock tách bước (v0.4.1 thêm nhánh phiếu phần còn lại): cùng hai ý của v0.3.0 / v0.3.1.
    ("src/lib/pos-model.js", '    return "so_many_gr";', "    return null;", "P3 bỏ khoá SO nhiều GR (theo PO, 06/11)"),
    ("src/lib/pos-model.js", "    const same = live.filter((g) => g.poId === me.poId);", "    const same = live;", "v0.3.1 SO tách giao: GR của PO khác vẫn khoá"),
    # startSession (bấm lại phiếu không có đơn): khoá cũ qua bộ lọc phiếu phần còn lại.
    ("src/background.js", "    const locks = [...new Set([].concat(keep, msgLocks))];", "    const locks = keep;", "review P3-5 tìm lại bỏ khoá vừa tính ở POS"),
    # Khung lỗi của phiên vẽ qua showBase (review v0.4.1 P2-2).
    ("src/nw/nw-content.js", "      if (latch && latch.sig === sigOf(s) && !force) return showBase(latch.view);\n", "", "v0.4 A1 bỏ giữ lỗi (latch)"),
    # readerTick: kiểm có phiên / modal dời lên trên (audit P3-10).
    ("src/nw/nw-content.js", '    if (r.state !== "disconnected" || !r.btn || hidden) return;', '    if (r.state !== "disconnected" || !r.btn) return;', "07/11 bấm cả khi tab ẩn"),
]
renamed = {m[3] for m in REANCHOR}
kept = [m for m in old if anchored(m) and m[3] not in renamed]
dropped = [m[3] for m in old if not anchored(m) and m[3] not in renamed]
print(f"ca cũ: {len(old)}; còn neo trên v0.4.1: {len(kept)}; neo lại: {len(REANCHOR)}; bỏ (mã đã xoá / đổi): {len(dropped)}", flush=True)
for name in dropped:
    print("  bỏ:", name, flush=True)

NEW = [
    # ---- A. phiếu phần còn lại: pos-model.remainderOf / soWriteLock ----
    ("src/lib/pos-model.js", '    if (live.length < 2) return no("single_gr");', '    if (false) return no("single_gr");', "v0.4.1 remainderOf: PO một phiếu vẫn là phần còn lại"),
    ("src/lib/pos-model.js", '    if (!live.some((g) => g.id === gr.id)) return no("gr_not_in_po");', '    if (false) return no("gr_not_in_po");', "v0.4.1 remainderOf: phiếu không thuộc PO"),
    ("src/lib/pos-model.js", '    if (others.some((g) => g.status !== "COMPLETED")) return no("other_gr_open"', '    if (false) return no("other_gr_open"', "v0.4.1 remainderOf: phiếu khác của PO còn mở"),
    ("src/lib/pos-model.js", '    if (done.length !== others.length) return no("completed_unread");', '    if (false) return no("completed_unread");', "v0.4.1 remainderOf: thiếu phiếu đã xong chưa đọc"),
    ("src/lib/pos-model.js", '      if (!g || g.status !== "COMPLETED" || g.poId !== gr.poId) return no("completed_unread", { code: o.code });', '      if (!g) return no("completed_unread", { code: o.code });', "v0.4.1 remainderOf: phiếu đọc lại không xong / khác PO"),
    ("src/lib/pos-model.js", '      if (it.received) return no("open_gr_touched");\n', "", "v0.4.1 remainderOf: phiếu mở đã nhận tay vẫn là phần còn lại",
     [("      for (const d of it.details) if (d.received || d.qrCodes.length || (d.internalCodes || []).length) return no(\"open_gr_touched\");", "      for (const d of it.details) if (false) return no(\"open_gr_touched\");")]),
    ("src/lib/pos-model.js", "if (d.received || d.qrCodes.length || (d.internalCodes || []).length) return no(\"open_gr_touched\");", "if (d.received) return no(\"open_gr_touched\");", "v0.4.1 remainderOf: phiếu mở đã có mã (chưa nhận) vẫn là phần còn lại"),
    ("src/lib/pos-model.js", '    for (const it of gr.items) if (!it.refId || !poById.has(it.refId)) return no("line_not_in_po", { productId: it.productId });', '    for (const it of gr.items) if (false) return no("line_not_in_po", { productId: it.productId });', "v0.4.1 remainderOf: dòng phiếu không ánh xạ dòng PO"),
    ("src/lib/pos-model.js", '          if (cur[u] !== undefined && cur[u] !== r) return no("rate_conflict", { productId: it.productId, unit: u });', '          if (false) return no("rate_conflict", { productId: it.productId, unit: u });', "v0.4.1 remainderOf: tỉ lệ đơn vị lệch giữa các phiếu"),
    ("src/lib/pos-model.js", '      if (!p.id || !(p.baseQuantity > 0) || !(p.quantity > 0)) return no("po_line_unreadable", { productId: p.productId });', '      if (false) return no("po_line_unreadable", { productId: p.productId });', "v0.4.1 remainderOf: dòng PO thiếu số"),
    ("src/lib/pos-model.js", '          if (it.received !== got) return no("received_inconsistent", { code: g.code, productId: p.productId });', '          if (false) return no("received_inconsistent", { code: g.code, productId: p.productId });', "v0.4.1 remainderOf: đã nhận dòng ≠ tổng lô"),
    ("src/lib/pos-model.js", '          if (got && !(it.unitRate > 0)) return no("rate_missing", { code: g.code, productId: p.productId });', '          if (false) return no("rate_missing", { code: g.code, productId: p.productId });', "v0.4.1 remainderOf: thiếu unitRate"),
    ("src/lib/pos-model.js", '      if (open.length > 1) return no("line_split", { productId: p.productId });', '      if (false) return no("line_split", { productId: p.productId });', "v0.4.1 remainderOf: dòng PO tách hai dòng phiếu"),
    ("src/lib/pos-model.js", '      if (!(openBase >= 0) || openBase + doneBase !== p.baseQuantity) return no("line_mismatch"', '      if (false) return no("line_mismatch"', "v0.4.1 remainderOf: cộng sổ dòng PO không khớp"),
    ("src/lib/pos-model.js", '      if (p.received * p.baseQuantity !== doneBase * p.quantity) return no("po_received_mismatch", { productId: p.productId });', '      if (false) return no("po_received_mismatch", { productId: p.productId });', "v0.4.1 remainderOf: không đối chiếu received của PO"),
    ("src/lib/pos-model.js", "d.qrCodes.concat(d.internalCodes || [])", "d.qrCodes", "v0.4.1 excludeUids bỏ UID Nextwaves POS gắn lúc HOÀN THÀNH"),
    ("src/lib/pos-model.js", "    for (const g of [gr].concat(done)) {", "    for (const g of [gr]) {", "v0.4.1 tỉ lệ đơn vị chỉ lấy phiếu mở"),
    ("src/lib/pos-model.js", "    if (rem && rem.ok && Array.isArray(rem.completed)) {", "    if (false) {", "v0.4.1 phiếu phần còn lại vẫn khoá so_many_gr"),
    ("src/lib/pos-model.js", '      if (others.length === counted.size && others.every((g) => counted.has(g.id) && g.status === "COMPLETED")) return null;', "      return null;", "v0.4.1 bỏ khoá SO cả khi phiếu SO khác chưa đếm"),
    # ---- A. pos-content / background ----
    ("src/pos/pos-content.js", "        fingerprint: rem && rem.ok ? rem.source : P.grFingerprintSource(gr),", "        fingerprint: P.grFingerprintSource(gr),", "v0.4.1 phiếu phần còn lại dùng vân tay của phiếu"),
    ("src/pos/pos-content.js", '        remainderNote: rem && !rem.ok && rem.reason !== "single_gr" ? rem.reason : null,', "        remainderNote: null,", "v0.4.1 không báo lý do cộng sổ không đạt"),
    ("src/pos/pos-content.js", "    return ex.size ? units.filter((u) => !ex.has(u.uid)) : units;", "    return units;", "v0.4.1 điền cả tem món đã bán gấp"),
    ("src/pos/pos-content.js", "    if (sold.length) out.push(`⚠ Nextwaves đã nhận cả", "    if (false) out.push(`⚠ Nextwaves đã nhận cả", "v0.4.1 I6 không cảnh báo tồn Nextwaves dư"),
    ("src/pos/pos-content.js", '    if (s && s.remainder && om === "close_short") out.push(', "    if (false) out.push(", "v0.4.1 POS không báo lượt nhận chọn Đóng đơn"),
    ("src/pos/pos-content.js", '"Hàng này không có tem RFID (hoặc Nextwaves chưa giao): dược sĩ nhận tay phần còn thiếu, kiểm lại rồi mới bấm HOÀN THÀNH.", SPLIT_HINT]', '"Hàng này không có tem RFID (hoặc Nextwaves chưa giao): dược sĩ nhận tay phần còn thiếu, kiểm lại rồi mới bấm HOÀN THÀNH."]', "v0.4.1 I7 không nói POS sẽ tách phiếu"),
    ("src/pos/pos-content.js", "    if (fv && fv.ok === false) return showGr(gr, verifyFailedView(gr, fv.diffs, sessionLines(s).concat(extra)));", "    void fv;", "audit P3-4 F5 sau khớp cuối lệch thành khung xanh"),
    ("src/pos/pos-content.js", "    if (res.ok && finished && v && !v.ok) {", "    if (false) {", "audit P3-4 khớp cuối lệch không báo ngay"),
    ("src/pos/pos-content.js", '    if (s.readerTakenAt && !["waiting_nw", "nw_ready"].includes(s.state)) out.push(', "    if (false) out.push(", "v0.4.1 POS không nhắc Kết nối RFID sau lượt lấy đầu đọc"),
    ("src/background.js", '    const keep = (cur.writeLocks || []).filter((l) => !(remainder && l === "so_many_gr"));', "    const keep = cur.writeLocks || [];", "v0.4.1 phiên cũ giữ so_many_gr dù đã chứng minh phần còn lại"),
    ("src/background.js", "  if (!r.completed.every((g) => g && E.isUuid(g.id) && isStr(g.code) && g.code.length <= 20)) return null;\n", "", "v0.4.1 nhận remainder sai dạng từ trang"),
    # ---- A. phía Nextwaves ----
    ("src/lib/resolve.js", '    if (verified.every(consumed)) return fail("nw_partial_received"', '    if (false) return fail("nw_partial_received"', "v0.4.1 đơn đã nhận một phần rơi vào lý do khác"),
    ("src/lib/resolve.js", '    const consumed = (v) => v.c.openShipmentCount === 0 && /^PARTIALLY_RECEIVED$/i.test(v.c.poStatus || v.order.poStatus || "");', "    const consumed = (v) => v.c.openShipmentCount === 0;", "v0.4.1 coi đã dùng phiếu gửi không cần PARTIALLY_RECEIVED"),
    ("src/lib/nw-model.js", '      openShipmentCount: typeof it.openShipmentCount === "number" && Number.isFinite(it.openShipmentCount) ? it.openShipmentCount : null,', "      openShipmentCount: Number(it.openShipmentCount) || 0,", "v0.4.1 openShipmentCount vắng coi là 0"),
    ("src/nw/nw-content.js", "    const real = rec.missing.filter((e) => !sold.epcs.has(e));", "    const real = rec.missing.slice();", "v0.4.1 thiếu tem món đã bán gấp vẫn coi là thiếu"),
    ("src/nw/nw-content.js", "    if (c && c.lastScan && Array.isArray(c.lastScan.missingUids)) for (const u of c.lastScan.missingUids) if (!sold.uids.has(u)) real.push(`uid:${u}`);\n", "", "v0.4.1 bỏ đối chiếu missingUnitUids của Nextwaves"),
    ("src/nw/nw-content.js", "        if (rec.units.length > 0 && realMissing(c, rec).length === 0 && rec.problems.length === 0) break;", "        if (rec.units.length > 0 && rec.missing.length === 0 && rec.problems.length === 0) break;", "v0.4.1 vòng đọc kết quả không thoát sớm khi chỉ thiếu món đã bán"),
    ("src/nw/nw-content.js", "      for (const l of s.lines) for (const u of l.units) if (u.uid && ex.has(u.uid)) {", "      for (const l of s.lines) for (const u of l.units) if (u.uid) {", "v0.4.1 coi mọi tem là món đã bán gấp"),
    ("src/nw/nw-content.js", '      if (missingChoice() === "close_short") {', "      if (false) {", "v0.4.1 không cảnh báo Đóng đơn dù còn thiếu"),
    # ---- F1 / F2 / F3 ----
    ("src/nw/nw-content.js", "    const wrongShipment = rh.open && rh.shipment && mine.length && !mine.includes(rh.shipment);", "    const wrongShipment = false;", "audit F1 không báo mở nhầm phiếu gửi"),
    ("src/lib/match.js", "        const n = l.units.filter((u) => !ex.has(u.uid)).length;", "        const n = l.units.length;", "audit F2 kiểm trước không trừ tem đã bán gấp"),
    ("src/lib/match.js", '          problems.push({ code: "product_not_on_gr", productId: l.posProductId || "?", count: n });\n', "", "audit F2 không báo sản phẩm không có trên phiếu"),
    ("src/lib/match.js", "        if (!rate) {", "        if (false) {", "audit F2 không báo đơn vị lạ"),
    ("src/lib/match.js", "      if (g.unitRate > 0 && base % g.unitRate !== 0) problems.push(", "      if (false) problems.push(", "audit F2 không báo số lẻ"),
    ("src/lib/match.js", "      if (base > g.base) problems.push(", "      if (false) problems.push(", "audit F2 không báo vượt phiếu"),
    ("src/lib/match.js", "    for (const [pid, g] of gr) if (g.received > 0 && g.codes === 0) problems.push(", "    for (const [pid, g] of gr) if (false) problems.push(", "audit F2 không báo phiếu đã nhận tay"),
    ("src/nw/nw-content.js", '    const nwLocks = r.writeLocks.concat(wc.known && !wc.ok ? ["warehouse_mismatch"] : []);', "    const nwLocks = r.writeLocks;", "audit F3 kho lệch không khoá"),
    ("src/background.js", 'const NW_LOCKS = new Set(["nw_many_orders", "warehouse_mismatch"]);', 'const NW_LOCKS = new Set(["nw_many_orders"]);', "audit F3 background bỏ khoá warehouse_mismatch"),
    ("src/lib/env.js", '    return { known: true, ok: exp === String(warehouseId || "").toLowerCase(), expected: exp };', "    return { known: true, ok: true, expected: exp };", "audit F3 bảng kho luôn đạt"),
    # ---- B. đầu đọc bị QR Scan Log giữ ----
    ("src/lib/pos-model.js", "holding: displayed && QSL_HOLDING.has(connection)", "holding: QSL_HOLDING.has(connection)", "v0.4.1 B khung QR Scan Log ẩn vẫn coi là đang giữ"),
    ("src/lib/pos-model.js", 'busy: state === "processing"', "busy: false", "v0.4.1 B không nhận ra đang gửi tem vào giỏ"),
    ("src/lib/pos-model.js", "button: btn && !btn.disabled ? btn : null", "button: btn || null", "v0.4.1 B bấm cả nút Ngắt đang tắt"),
    ("src/background.js", '  if (holders.length !== 1) return done({ ok: false, reason: holders.length ? "many_holders" : "no_holder", holders: holders.length });', '  if (!holders.length) return done({ ok: false, reason: "no_holder", holders: 0 });', "v0.4.1 B nhiều tab giữ vẫn bấm Ngắt"),
    ("src/background.js", '  if (holders[0].busy) return done({ ok: false, reason: "busy" });\n', "", "v0.4.1 B background gửi lệnh Ngắt khi đang gửi tem"),
    ("src/pos/pos-content.js", '      if (v.busy) return { ok: false, reason: "busy" };\n', "", "v0.4.1 B tab POS bấm Ngắt khi đang gửi tem"),
    ("src/pos/pos-content.js", '      if (!v.holding && !hiddenOk) return { ok: false, reason: "not_holding" };\n', "", "v0.4.1 B tab POS bấm Ngắt khi không còn giữ"),
    ("src/pos/pos-content.js", "        if (await qslLockFree()) return { ok: true, released: true, ms: Date.now() - t0 };", "        return { ok: true, released: true, ms: Date.now() - t0 };", "v0.4.1 B không chờ QR Scan Log nhả cổng"),
    ("src/nw/nw-content.js", "    if (!env || String(location.origin || \"\").toLowerCase() !== env.nwUiOrigin.toLowerCase()) return { open: false, shipment: null };", "    if (!env) return { open: false, shipment: null };", "v0.4.1 B modal ở tenant khác cũng xử lý"),
    ("src/nw/nw-content.js", "    if (!ctx && !rh.open) return;", "    if (!ctx) return;", "v0.4.1 B modal không phiên không tự kết nối"),
    ("src/nw/nw-content.js", "    if (!ctx && !rh.open) return;", "    if (false) return;", "audit P3-10 quét nút đầu đọc mọi trang"),
    ("src/nw/nw-content.js", "(rd.gaveUp || rd.clicks.length >= 1)) askQsl(now);", "(rd.gaveUp || rd.clicks.length >= 1)) takeFromQsl();", "v0.4.1 B tự bấm hộ Ngắt khi dược sĩ chưa bấm"),
    # (bỏ ca "lấy đầu đọc xong không kết nối ngay": tương đương — thiếu connectNow() thì readerTick bấm trong ≤ readerPollMs (1 s), vẫn
    # trong hiệu lực cú bấm của dược sĩ; connectNow chỉ rút ngắn thời gian, không đổi kết quả quan sát được.)
    ("src/nw/nw-content.js", "        if (rh.taken) rh.reminder = true;\n", "", "v0.4.1 B không nhắc Kết nối RFID sau lượt"),
    # ---- P3 ----
    ("src/background.js", "    for (const o of Object.values(all)) if (o.key !== s.key && o.nwTabId === tabId) await updateSession(o.key, { nwTabId: null }, { type: \"nw_tab_reused\", by: s.grCode });\n", "", "audit P3-6 routeScan để hai phiên chung tab"),
    ("src/background.js", "    if (s.nwTabId !== null && s.nwTabId !== undefined && s.nwTabId !== tabId) patch.nwTabPrev = s.nwTabId;\n", "", "audit P3-6 quên tab cũ của phiên"),
    ("src/background.js", '  laterCloseNwAndReturn(s2, nwTabId, "received", [s.nwTabId, s.nwTabPrev]);', '  laterCloseNwAndReturn(s2, nwTabId, "received");', "audit P3-6 nhận xong chỉ đóng tab gửi"),
    ("src/background.js", "        if (others.some((o) => matchesNwPo(o, page.po))) continue;\n", "", "audit P3-6 đóng tab cũ khi phiếu khác cùng đơn còn cần"),
    ("src/background.js", "        if (!matchesNwPo(s, page.po)) continue;\n", "", "audit P3-6 đóng tab cũ đã sang đơn khác"),
    ("src/background.js", '    if (o.state === "nw_ready" && o.scanOk) continue;\n', "", "audit P3-7 tái dùng tab có lượt 2xx chưa đọc xong"),
    ("src/background.js", "      if (!busy || busy.ok !== true || busy.busy !== false) continue;\n", "", "audit P3-7 tái dùng tab đang mở modal quét"),
    ("src/nw/nw-content.js", "    reply({ ok: true, busy: !!(receiveModal().open || collecting || pendingScan) });", "    reply({ ok: true, busy: false });", "audit P3-7 tab báo không bận khi đang quét"),
    ("src/nw/nw-content.js", "        latch = { sig: sigOf(s2 || s), view, reports: r.reports };", "        latch = { sig: sigOf(s2 || s), view: null, reports: r.reports };", "audit P3-8 latch không có view"),
    ("src/nw/nw-content.js", "        .filter(mine)\n", "", "audit P3-11 chữ ký phiên xét mọi phiên"),
    # ---- review độc lập v0.4.1 ----
    ("src/background.js", "  return all.filter((x) => x.hiddenHolding && x.lockHeld).map(", "  return all.filter((x) => x.hiddenHolding).map(", "review P2-1 tin khung ẩn không cần Web Lock"),
    ("src/background.js", "  if (shown.length) return shown;\n", "  return shown;\n", "review P2-1 không nhận ra tab giữ đã rời trang Bán hàng"),
    ("src/nw/nw-content.js", "    if (baseView) return panel.show(withReader(baseView)); // review v0.4.1 P2-2", "    if (false) return panel.show(withReader(baseView)); // review v0.4.1 P2-2", "review P2-2 khung đầu đọc thay khung lỗi của phiên"),
    ("src/nw/nw-content.js", "    if (!view || !rh.open) return view;\n", "    return view;\n", "review P2-2 khung của phiên không thêm phần đầu đọc"),
    ("src/nw/nw-content.js", "    if (r && (r.ok || r.clicked)) {", "    if (r && r.ok) {", "review P3-5 đã bấm Ngắt mà lock chưa nhả coi là hỏng"),
    ("src/background.js", "  const remainderRejected = !!msg.remainder && !remainder;", "  const remainderRejected = false;", "review P3-6 remainder bị từ chối không khoá lại"),
    ("src/background.js", "    if (!isCurrent(s) || stuck) {", "    if (!isCurrent(s)) {", "review P3-7 nâng bản giữ phiên cũ kẹt so_many_gr"),
    ("src/pos/pos-content.js", '      if (rem && !rem.ok && (rem.reason === "completed_read_failed" || rem.reason === "completed_unreadable")) return fail(', "      if (false) return fail(", "review P3-7 đọc phiếu đã xong lỗi vẫn tạo phiên khoá"),
    ("src/background.js", "  return { onMissing, missingUids };\n}", "  return { onMissing: null, missingUids: null };\n}", "review P3-8 không lưu lựa chọn khi thiếu vào phiên"),
    ("src/nw/nw-content.js", "    if (st && st.holders === 1 && !st.busy && st.canRelease) out.push(", "    if (st && st.holders === 1 && !st.busy) out.push(", "review P3-10 đưa nút khi nút Ngắt QR Scan Log đang tắt"),
    ("src/nw/nw-content.js", "(rd.gaveUp || rd.clicks.length >= 1)) askQsl(now);", "rd.gaveUp) askQsl(now);", "review P3-12 chỉ hỏi QR Scan Log khi hết lượt tự bấm"),
    ("src/nw/nw-content.js", '    const whWrong = locks.includes("warehouse_mismatch");', "    const whWrong = false;", "review P3-14 kho lệch không đỏ"),
    ("src/nw/nw-content.js", "        closeShort = true;", "        closeShort = false;", "review P3-14 chọn Đóng đơn không đỏ"),
    ("src/nw/nw-content.js", "        return onReceiveScan(p, true);\n      }\n      return rh.open || rh.reminder ? renderHelper() : panel.hide();", "        return onReceiveScan(p, true);\n      }\n      return panel.hide();", "review P3-15 màn quét không phiên ẩn khung đầu đọc"),
    ("src/pos/pos-content.js", "s.retryNotBefore || null, s.readerTakenAt || null]);", "s.retryNotBefore || null]);", "review POS không vẽ lại khi vừa lấy đầu đọc"),
]
bad = [(m[3], src(m[0]).count(m[1])) for m in REANCHOR + NEW if src(m[0]).count(m[1]) != 1 or any(src(m[0]).count(x) != 1 for x, _ in (m[4] if len(m) > 4 else []))]
# Hai ca dùng chung một neo (một dòng, hai cách đột biến) — neo vẫn phải duy nhất trong file.
assert not bad, ("neo v0.4.1 hỏng", bad)

muts = REANCHOR + NEW if os.environ.get("CGN_MUT_ONLY_NEW") else kept + REANCHOR + NEW
if os.environ.get("CGN_MUT_FILTER"):
    keys = [k for k in os.environ["CGN_MUT_FILTER"].split("|") if k]
    muts = [m for m in muts if any(k in m[3] for k in keys)]
m030.muts = muts
print(f"chạy {len(muts)} ca ({len(REANCHOR)} neo lại + {len(NEW)} ca v0.4.1)", flush=True)

if __name__ == "__main__":
    sys.exit(m030.main())
