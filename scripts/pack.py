"""Đóng gói extension: src/ → dist/circa-gr-nextwaves-v<version>.zip + SHA-256 (8 ký tự đầu in hoa = mã gói).
Chạy: python -I scripts/pack.py   (từ thư mục gốc repo)
"""
import hashlib
import json
import pathlib
import sys
import zipfile

sys.stdout.reconfigure(encoding="utf-8")
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
version = manifest["version"]
DIST.mkdir(exist_ok=True)
out = DIST / f"circa-gr-nextwaves-v{version}.zip"

files = sorted(p for p in SRC.rglob("*") if p.is_file())
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for p in files:
        info = zipfile.ZipInfo(p.relative_to(SRC).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, p.read_bytes())

digest = hashlib.sha256(out.read_bytes()).hexdigest()
print(f"{out.relative_to(ROOT).as_posix()}  {len(files)} file  sha256 {digest}  mã gói {digest[:8].upper()}")
