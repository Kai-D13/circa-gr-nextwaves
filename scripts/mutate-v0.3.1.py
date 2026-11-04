"""Đột biến cho v0.3.1 = 205 ca của v0.3.0 (lấy nguyên từ scripts/mutate-v0.3.0.py, chạy lại trên bộ test MỚI) + ca v0.3.1.

v0.3.1 (operator chốt 05/11): production được ghi nhưng chỉ ở cửa hàng đã khai kho Nextwaves (Florita); popup hỏi lại trước cấp phép
THỦ CÔNG khi phiếu còn chạy tự động được (G3-1); khung POS ghi trạng thái tự động của lượt nhận (G3-2 / G3-3).

Ca "P1.3 PRD được ghi" của v0.3.0 (writeEnabled false → true) không còn neo — thay bằng ca "PRD mở mọi cửa hàng".
Hai môi trường đều writeEnabled: các hàng rào `!env.writeEnabled` trong background không còn đường nào chạm tới bằng cấu hình
thật — ca gỡ chúng SỐNG là đúng, ghi rõ trong báo cáo (bảo vệ thay bằng danh sách cửa hàng + cấp phép từng phiếu).

  python -I scripts/mutate-v0.3.1.py            # mọi ca
  python -I scripts/mutate-v0.3.1.py 205        # chỉ ca v0.3.1
"""
import importlib.util
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("mutate030", os.path.join(HERE, "mutate-v0.3.0.py"))
m030 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m030)

OLD_PRD = ("src/lib/env.js", "      writeEnabled: false,", "      writeEnabled: true,", "P1.3 PRD được ghi")
muts = [m for m in m030.muts if tuple(m[:4]) != OLD_PRD]
assert len(muts) == len(m030.muts) - 1, "không tìm thấy ca P1.3 PRD được ghi của v0.3.0"
muts.insert(m030.muts.index(next(m for m in m030.muts if tuple(m[:4]) == OLD_PRD)), (
    "src/lib/env.js",
    '      storeAllowlist: Object.freeze(["c476efb2-415c-429a-978e-d389b4b06607"]),',
    "      storeAllowlist: null,",
    "v0.3.1 PRD mở mọi cửa hàng (thay ca P1.3 PRD được ghi)",
))

muts += [
    # Phạm vi production
    ("src/lib/env.js", '      storeAllowlist: Object.freeze(["c476efb2-415c-429a-978e-d389b4b06607"]),',
     '      storeAllowlist: Object.freeze(["c476efb2-415c-429a-978e-d389b4b06607", "64a8663b-0c9e-49c6-9626-0a4c7c4bd53d"]),',
     "v0.3.1 PRD nhận cả cửa hàng staging"),
    ("src/lib/env.js", 'warehouseByStore: Object.freeze({ "c476efb2-415c-429a-978e-d389b4b06607": "eb5e2b4f-6f92-413b-90ef-6be1730b94c0" }),',
     'warehouseByStore: Object.freeze({}),', "v0.3.1 PRD mất cặp kho Florita"),
    # G3-1 popup
    ("src/popup/popup.js", "&& autoPossible(env, s)) && manualConfirmed !== `${env.id}:${code}`) {", "&& autoPossible(env, s)) && false) {",
     "v0.3.1 G3-1 cấp phép thủ công không hỏi lại"),
    ("src/popup/popup.js", "      manualConfirmed = null;\n", "", "v0.3.1 G3-1 lần hỏi cũ dùng lại cho lần sau"),
    ("src/popup/popup.js", 's.state === "waiting_nw") && !s.scanOk && !(s.receiptIdsBefore || []).length;', 's.state === "waiting_nw") && !(s.receiptIdsBefore || []).length;',
     "v0.3.1 G3-1 hỏi lại cả khi Nextwaves đã ghi nhận lượt nhận"),
    ("src/popup/popup.js", 's.state === "waiting_nw") && !s.scanOk && !(s.receiptIdsBefore || []).length;', 's.state === "waiting_nw") && !s.scanOk;',
     "v0.3.1 G3-1 hỏi lại cả khi PO đã có biên nhận"),
    ("src/popup/popup.js", '!!env && env.writeEnabled && env.id === s.envId && (s.state === "nw_ready" || s.state === "waiting_nw")',
     '!!env && env.writeEnabled && env.id === s.envId && s.state !== "done"',
     "v0.3.1 G3-1 hỏi lại cả phiếu đã nhận"),
    # G3-2 / G3-3 khung POS
    ("src/pos/pos-content.js", '} else if (s.state === "received" && !(s.authorization && s.authorization.auto)) {', '} else if (false) {',
     "v0.3.1 G3-2 khung không ghi trạng thái tự động"),
    ("src/pos/pos-content.js", '    grant_expired: "quyền tự động đã hết hạn hoặc bị thu hồi trước khi nhận",\n', "",
     "v0.3.1 G3-2 lý do hết hạn in mã thô"),
    ("src/pos/pos-content.js", '    const skip = log.slice(i + 1).filter((l) => l.type === "auto_skipped").pop();', '    const skip = null;',
     "v0.3.1 G3-2 bỏ qua lý do lúc nhận"),
    ("src/popup/popup.js", "    if (grantBusy) return;
", "", "v0.3.1 audit P2-1 bấm đúp lọt bước hỏi lại"),
]
# Chạy lại một phần: CGN_MUT_FILTER="chuỗi 1|chuỗi 2" → chỉ các ca có tên chứa một trong các chuỗi (vd. ca từng sống + ca v0.3.1).
if os.environ.get("CGN_MUT_FILTER"):
    keys = [k for k in os.environ["CGN_MUT_FILTER"].split("|") if k]
    muts = [m for m in muts if any(k in m[3] for k in keys)]
m030.muts = muts


# Test v0.3.1 G3-5 chạy scripts/kiem-*.js → bản sao tạm cần cả scripts/ (main() của v0.3.0 chỉ chép src / tests / samples).
class _ShutilWithScripts:
    def __getattr__(self, name):
        return getattr(m030_shutil, name)

    @staticmethod
    def copytree(srcdir, dst, *a, **k):
        out = m030_shutil.copytree(srcdir, dst, *a, **k)
        if os.path.basename(srcdir) == "samples":
            m030_shutil.copytree(os.path.join(os.path.dirname(srcdir), "scripts"), os.path.join(os.path.dirname(dst), "scripts"))
        return out


m030_shutil = m030.shutil
m030.shutil = _ShutilWithScripts()

if __name__ == "__main__":
    sys.exit(m030.main())
