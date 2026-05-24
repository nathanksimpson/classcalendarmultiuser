"""Replay StrReplace operations on app.js from agent transcripts."""
import json
import pathlib
import sys

TRANSCRIPTS = [
    pathlib.Path(r"C:\Users\SIMSTER\.cursor\projects\simson-jsl-simson-jsl-2-Nathan-Apps-In-Development-Cursor-Builds-Calendar-App\agent-transcripts\38164a19-752c-410d-afe8-87487d940b24\38164a19-752c-410d-afe8-87487d940b24.jsonl"),
    pathlib.Path(r"C:\Users\SIMSTER\.cursor\projects\simson-jsl-simson-jsl-2-Nathan-Apps-In-Development-Cursor-Builds-Calendar-App\agent-transcripts\9aace57d-6481-4ac9-9991-a210759b5d76\9aace57d-6481-4ac9-9991-a210759b5d76.jsonl"),
]
OUT = pathlib.Path(__file__).resolve().parent.parent / "app.js"


def iter_str_replaces(path: pathlib.Path):
    if not path.exists():
        return
    with path.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if obj.get("role") != "assistant":
                continue
            content = obj.get("message", {}).get("content", [])
            if not isinstance(content, list):
                continue
            for block in content:
                if block.get("type") != "tool_use":
                    continue
                if block.get("name") != "StrReplace":
                    continue
                inp = block.get("input", {})
                p = inp.get("path", "")
                if p.endswith("app.js") or p == "app.js":
                    yield path.name, line_no, inp.get("old_string"), inp.get("new_string")


def main():
    content = None
    applied = 0
    skipped = 0
    for tpath in TRANSCRIPTS:
        for tname, line_no, old, new in iter_str_replaces(tpath):
            if old is None or new is None:
                continue
            if content is None:
                print(f"SKIP (no base): {tname}:{line_no}")
                skipped += 1
                continue
            if old not in content:
                print(f"FAIL {tname}:{line_no} old_string not found ({len(old)} chars)")
                skipped += 1
                continue
            content = content.replace(old, new, 1)
            applied += 1
            print(f"OK {tname}:{line_no}")
    if content is None:
        print("No base content — cannot replay without initial app.js")
        sys.exit(1)
    OUT.write_text(content, encoding="utf-8")
    print(f"Wrote {OUT} ({len(content)} bytes), applied={applied}, skipped={skipped}")


if __name__ == "__main__":
    main()
