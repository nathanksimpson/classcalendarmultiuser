"""Restore js/syllabus-table.js by replaying Write/StrReplace from agent transcripts."""
import json
import pathlib
import sys

TRANSCRIPT_ROOT = pathlib.Path(
    r"C:\Users\SIMSTER\.cursor\projects"
    r"\simson-jsl-simson-jsl-2-Nathan-Apps-In-Development-Cursor-Builds-Calendar-App"
    r"\agent-transcripts"
)
OUT = pathlib.Path(__file__).resolve().parent.parent / "js" / "syllabus-table.js"
TARGET_SUFFIX = "syllabus-table.js"

# Prefer known sessions in chronological order; append any other jsonl after.
PRIORITY = [
    "89ba3830-7e04-4c98-9388-b91185f7d5ed",
    "70c12c97-e8f3-42c8-b128-ce21c45d834d",
    "4c2c3ffa-1353-4045-8d61-c48e3434e598",
    "d9829502-7807-4e02-8391-1e6b1f804988",
    "d7e05de1-0a9c-4cb7-b4cf-2236781041f3",
    "ed1efc04-10e0-4271-9e13-fbb9ecb6ff3d",
    "38164a19-752c-410d-afe8-87487d940b24",
]


def is_target_path(p: str) -> bool:
    if not p:
        return False
    norm = p.replace("\\", "/")
    return norm.endswith(TARGET_SUFFIX)


def ordered_transcript_files():
    seen = set()
    files = []
    for uid in PRIORITY:
        for p in TRANSCRIPT_ROOT.rglob(f"{uid}.jsonl"):
            if p not in seen:
                seen.add(p)
                files.append(p)
        for p in TRANSCRIPT_ROOT.rglob(f"{uid}/*.jsonl"):
            if p not in seen:
                seen.add(p)
                files.append(p)
    for p in sorted(TRANSCRIPT_ROOT.rglob("*.jsonl")):
        if p not in seen:
            seen.add(p)
            files.append(p)
    return files


def iter_ops(path: pathlib.Path):
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
                name = block.get("name")
                if name not in ("Write", "StrReplace"):
                    continue
                inp = block.get("input", {})
                p = inp.get("path", "")
                if not is_target_path(p):
                    continue
                yield name, path.name, line_no, inp


def main():
    content = None
    writes = 0
    applied = 0
    skipped = 0
    failures = []

    for tpath in ordered_transcript_files():
        for op, tname, line_no, inp in iter_ops(tpath):
            if op == "Write":
                content = inp.get("contents", "")
                writes += 1
                print(f"WRITE {tname}:{line_no} ({len(content)} chars)")
                continue
            old = inp.get("old_string")
            new = inp.get("new_string")
            if content is None:
                skipped += 1
                print(f"SKIP (no base) {tname}:{line_no}")
                continue
            if old is None or new is None:
                skipped += 1
                continue
            if old not in content:
                failures.append(f"{tname}:{line_no}")
                skipped += 1
                print(f"FAIL {tname}:{line_no} old_string not found ({len(old)} chars)")
                continue
            content = content.replace(old, new, 1)
            applied += 1
            print(f"OK {tname}:{line_no}")

    if content is None:
        print("No Write base found in transcripts")
        sys.exit(1)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(content, encoding="utf-8")
    line_count = content.count("\n") + (1 if content and not content.endswith("\n") else 0)
    print(f"\nWrote {OUT}")
    print(f"  bytes={len(content.encode('utf-8'))} lines={line_count}")
    print(f"  writes={writes} applied={applied} skipped={skipped} failures={len(failures)}")
    if failures:
        print("First failures:", failures[:10])


if __name__ == "__main__":
    main()
