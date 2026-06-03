"""Apply print-only syllabus cleanup to index.html, styles.css, howto.js; verify app.js."""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def patch_index_html():
    p = ROOT / "index.html"
    text = p.read_text(encoding="utf-8")
    orig = text

    text = text.replace(
        '                    <button id="exportBtn" class="btn btn-outline btn-small" data-i18n="export">Export</button>\n'
        '                    <button type="button" id="exportSyllabiBtn" class="btn btn-outline btn-small" data-i18n="exportSyllabi">Export syllabi</button>\n'
        '                    <button id="importBtn"',
        '                    <button id="exportBtn" class="btn btn-outline btn-small" data-i18n="export">Export</button>\n'
        '                    <button id="importBtn"',
    )

    old_class = (
        '                        <button type="button" id="refreshSyllabusBtn" class="btn btn-outline btn-small" data-i18n="refreshSyllabusFromCalendar">Refresh from calendar</button>\n'
        '                        <button type="button" id="addSyllabusNoteRowBtn" class="btn btn-outline btn-small" data-i18n="addSyllabusNoteRow">Add note row</button>\n'
        '                        <button type="button" id="exportClassSyllabusBtn" class="btn btn-outline btn-small" data-i18n="exportClassSyllabus">Export syllabus</button>\n'
        '                        <button type="button" id="printClassSyllabusBtn" class="btn btn-outline btn-small" data-i18n="printClassSyllabus">Print syllabus</button>\n'
        '                    </div>'
    )
    new_class = (
        '                        <button type="button" id="refreshSyllabusBtn" class="btn btn-outline btn-small" data-i18n="refreshSyllabusFromCalendar">Refresh from calendar</button>\n'
        '                        <button type="button" id="addSyllabusNoteRowBtn" class="btn btn-outline btn-small" data-i18n="addSyllabusNoteRow">Add note row</button>\n'
        '                        <button type="button" id="printClassSyllabusBtn" class="btn btn-outline btn-small" data-i18n="printClassSyllabus">Print syllabus</button>\n'
        '                    </div>\n'
        '                    <p class="section-hint" data-i18n="printClassSyllabusHint">Opens the print dialog; choose Save as PDF to download.</p>'
    )
    text = text.replace(old_class, new_class)

    start = text.find("    <!-- Syllabus export: choose classes -->")
    end = text.find("    <!-- Print Options Modal -->")
    if start != -1 and end != -1:
        text = text[:start] + text[end:]

    text = re.sub(
        r'    <script src="js/syllabus-table\.js"></script>\n'
        r'(?:    <script src="https://cdnjs\.cloudflare\.com/ajax/libs/html2canvas[^"]+" crossorigin="anonymous"></script>\n'
        r'    <script src="https://cdnjs\.cloudflare\.com/ajax/libs/jspdf[^"]+" crossorigin="anonymous"></script>\n)?'
        r'    <script src="app\.js\?v=[^"]+"></script>',
        '    <script src="js/syllabus-table.js"></script>\n'
        '    <script src="app.js?v=20260521-print-only"></script>',
        text,
    )

    if text == orig:
        print("index.html: no changes (may already be patched)")
    else:
        p.write_text(text, encoding="utf-8")
        print("index.html updated")


def patch_styles_css():
    p = ROOT / "styles.css"
    text = p.read_text(encoding="utf-8")
    start = text.find("/* Syllabus PDF preview modal */")
    end = text.find("/* Books by month editor */")
    if start != -1 and end != -1:
        text = text[:start] + text[end:]
        p.write_text(text, encoding="utf-8")
        print("styles.css updated")
    else:
        print("styles.css: PDF preview block not found (may already be removed)")


def patch_howto_js():
    p = ROOT / "howto.js"
    text = p.read_text(encoding="utf-8")
    text = text.replace(
        "                        'Click Save Class. Rows are stored with the class.',\n"
        "                        'Header → Export syllabi (PDF) downloads one A4 PDF file with one page per class syllabus (uses your browser; needs internet for the PDF library).',\n"
        "                        'Print → check Syllabus tables (per class) to include the same tables on the summary page.'",
        "                        'Click Save Class. Rows are stored with the class.',\n"
        "                        'Click Print syllabus to open the print dialog for this class only. Choose Save as PDF to download.',\n"
        "                        'Header → Print → check Syllabus tables (per class) to print all class syllabi. Uncheck other summary sections for syllabi only.'",
    )
    text = text.replace(
        "                        'Click Print — your browser opens the print dialog. Choose “Save as PDF” to get a PDF file.'",
        "                        'Click Print — your browser opens the print dialog. Choose Save as PDF to get a PDF file.',\n"
        "                        'For syllabi only: uncheck Print Calendar and all summary sections except Syllabus tables (per class).'",
    )
    text = text.replace(
        "                        '저장 후 수업과 함께 저장됩니다.',\n"
        "                        '헤더 → 강의 계획표 PDF로 수업별 A4 PDF(수업당 1페이지)를 받을 수 있습니다.',\n"
        "                        'Print → 강의 계획표 (수업별)를 선택하면 요약 페이지에 같은 표가 포함됩니다.'",
        "                        '저장 후 수업과 함께 저장됩니다.',\n"
        "                        '강의 계획표 인쇄를 누르면 이 수업만 인쇄 창이 열립니다. PDF로 저장을 선택하면 파일로 저장할 수 있습니다.',\n"
        "                        '헤더 → Print → 강의 계획표 (수업별)를 선택하면 모든 수업의 강의 계획표를 인쇄합니다. 다른 요약 항목을 해제하면 강의 계획표만 인쇄됩니다.'",
    )
    text = text.replace(
        "                        'Print 클릭 → 브라우저 인쇄 창에서 “PDF로 저장”을 선택하면 PDF 파일을 만들 수 있습니다.'",
        "                        'Print 클릭 → 브라우저 인쇄 창에서 PDF로 저장을 선택하면 PDF 파일을 만들 수 있습니다.',\n"
        "                        '강의 계획표만: Print Calendar와 다른 요약 항목을 해제하고 강의 계획표 (수업별)만 선택하세요.'",
    )
    p.write_text(text, encoding="utf-8")
    print("howto.js updated")


def verify():
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    app = (ROOT / "app.js").read_text(encoding="utf-8")
    checks = [
        ("exportSyllabiBtn" not in index, "exportSyllabiBtn removed"),
        ("syllabusExportModal" not in index, "syllabusExportModal removed"),
        ("html2canvas" not in index, "html2canvas removed from index"),
        ("exportClassSyllabusBtn" not in index, "exportClassSyllabusBtn removed"),
        ("printClassSyllabusHint" in index, "printClassSyllabusHint in index"),
        ("HTML2CANVAS" not in app, "HTML2CANVAS removed from app.js"),
        ("getSyllabusPdfPreview" not in app, "PDF preview removed from app.js"),
        ("printSyllabusDocument" in app, "printSyllabusDocument kept"),
        ("printClassSyllabusFromModal" in app, "printClassSyllabusFromModal kept"),
        ("exportData" in app, "exportData kept"),
        (app.count("function applyEventTypeDefaultColors") == 1, "single applyEventTypeDefaultColors"),
    ]
    failed = [msg for ok, msg in checks if not ok]
    if failed:
        print("FAILED:", *failed, sep="\n  - ")
        sys.exit(1)
    print("All verification checks passed")


if __name__ == "__main__":
    patch_index_html()
    patch_styles_css()
    patch_howto_js()
    verify()
