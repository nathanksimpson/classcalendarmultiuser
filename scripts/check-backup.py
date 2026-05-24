import pathlib
import shutil

here = pathlib.Path(__file__).resolve().parent.parent
multi = here.parent / "Calendar App - Multi User" / "app.js"
main = here / "app.js"
out = here / "scripts" / "check-backup-out.txt"
lines = []
for label, p in [("main", main), ("multi", multi)]:
    lines.append(f"{label}: exists={p.exists()} size={p.stat().st_size if p.exists() else 0}")
    if p.exists() and p.stat().st_size > 1000:
        t = p.read_text(encoding="utf-8")
        lines.append(f"  lines={t.count(chr(10))+1}")
        lines.append(f"  escapeHtml={'escapeHtml' in t}")
        lines.append(f"  classTypeSelect={'classTypeSelect' in t}")
        lines.append(f"  getHolidayEventsList={'getHolidayEventsList' in t}")
if multi.exists() and multi.stat().st_size > 50000:
    shutil.copy2(multi, here / "app.js.recovered-from-multi")
    lines.append("COPIED multi -> app.js.recovered-from-multi")
out.write_text("\n".join(lines), encoding="utf-8")
print("wrote", out)
