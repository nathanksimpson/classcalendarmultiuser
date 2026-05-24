#!/usr/bin/env python3
"""Extract plain text from .docx files (syllabus reference). Usage:
  python scripts/extract-docx-text.py "path/to/file.docx" ...
"""
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

W_NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def docx_to_text(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        xml = z.read('word/document.xml')
    root = ET.fromstring(xml)
    lines = []
    for para in root.iter(f'{W_NS}p'):
        parts = []
        for node in para.iter(f'{W_NS}t'):
            if node.text:
                parts.append(node.text)
            if node.tail:
                parts.append(node.tail)
        line = ''.join(parts).strip()
        if line:
            lines.append(line)
    return '\n'.join(lines)


def main():
    if len(sys.argv) < 2:
        print('Provide one or more .docx paths', file=sys.stderr)
        sys.exit(1)
    for arg in sys.argv[1:]:
        p = Path(arg)
        print('=' * 72)
        print(p)
        print('=' * 72)
        if not p.exists():
            print(f'NOT FOUND: {p}')
            continue
        print(docx_to_text(p))
        print()


if __name__ == '__main__':
    main()
