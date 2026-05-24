"""Restore app.js from app.js.recovered-from-multi (run from project root)."""
import shutil
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = root / "app.js.recovered-from-multi"
dst = root / "app.js"
if not src.is_file():
    raise SystemExit(f"Missing backup: {src}")
shutil.copy2(src, dst)
print(f"Restored {dst} ({dst.stat().st_size} bytes)")
