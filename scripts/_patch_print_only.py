"""Apply print-only syllabus cleanup across project files."""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent


def patch_index_html():
    p = ROOT / "index.html"
    text = p.read_text(encoding="utf-8")
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
    p.write_text(text, encoding="utf-8")
    print("index.html updated")


EN_I18N_REMOVE = [
    "exportSyllabi",
    "exportSyllabiPickerTitle",
    "exportSyllabiPickerHint",
    "exportSyllabiSelectAll",
    "exportSyllabiSelectNone",
    "exportSyllabiPreviewBtn",
    "exportSyllabiNoClasses",
    "exportSyllabiPickOne",
    "exportClassSyllabus",
    "exportSyllabiPreviewTitle",
    "exportSyllabiPreviewHint",
    "exportSyllabiPreparingPreview",
    "exportSyllabiSavePdf",
    "exportSyllabiPdfHint",
    "exportSyllabiPdfError",
    "exportSyllabiPreviewFailed",
    "exportSyllabiSaveFailedStatus",
]


def remove_i18n_keys(text, keys):
    for key in keys:
        text = re.sub(
            rf"        {re.escape(key)}: '[^']*',\n",
            "",
            text,
        )
    return text


def patch_app_js():
    p = ROOT / "app.js"
    text = p.read_text(encoding="utf-8")

    text = remove_i18n_keys(text, EN_I18N_REMOVE)
    text = text.replace(
        "        printClassSyllabus: 'Print syllabus',\n"
        "        printClassSyllabusTitle: 'Syllabus',\n",
        "        printClassSyllabus: 'Print syllabus',\n"
        "        printClassSyllabusHint: 'Opens the print dialog; choose Save as PDF to download.',\n"
        "        printClassSyllabusTitle: 'Syllabus',\n",
    )
    text = text.replace(
        "        printClassSyllabus: '강의 계획표 인쇄',\n"
        "        printClassSyllabusTitle: '강의 계획표',\n",
        "        printSyllabusBlocked: '인쇄 창을 열 수 없습니다. 팝업을 허용한 뒤 다시 시도하세요.',\n",
        "        printClassSyllabus: '강의 계획표 인쇄',\n"
        "        printClassSyllabusHint: '인쇄 창이 열립니다. PDF로 저장을 선택하면 파일로 저장할 수 있습니다.',\n"
        "        printClassSyllabusTitle: '강의 계획표',\n"
        "        printSyllabusBlocked: '인쇄 창을 열 수 없습니다. 팝업을 허용한 뒤 다시 시도하세요.',\n",
    )

    text = text.replace(
        "    ['exportClassSyllabusBtn', 'printClassSyllabusBtn'].forEach(id => {",
        "    ['printClassSyllabusBtn'].forEach(id => {",
    )

    old_listeners = """    const exportSyllabiBtn = document.getElementById('exportSyllabiBtn');
    if (exportSyllabiBtn) {
        exportSyllabiBtn.addEventListener('click', exportSyllabiHtml);
    }
    const closeSyllabusExportModalBtn = document.getElementById('closeSyllabusExportModal');
    if (closeSyllabusExportModalBtn) {
        closeSyllabusExportModalBtn.addEventListener('click', closeSyllabusExportPickerModal);
    }
    const syllabusExportPreviewBtn = document.getElementById('syllabusExportPreviewBtn');
    if (syllabusExportPreviewBtn) {
        syllabusExportPreviewBtn.addEventListener('click', onSyllabusExportPreviewClick);
    }
    const syllabusExportSelectAll = document.getElementById('syllabusExportSelectAll');
    if (syllabusExportSelectAll) {
        syllabusExportSelectAll.addEventListener('click', () => {
            document.querySelectorAll('#syllabusExportClassList input[type="checkbox"]').forEach(cb => {
                cb.checked = true;
            });
            updateSyllabusExportPreviewBtnState();
        });
    }
    const syllabusExportSelectNone = document.getElementById('syllabusExportSelectNone');
    if (syllabusExportSelectNone) {
        syllabusExportSelectNone.addEventListener('click', () => {
            document.querySelectorAll('#syllabusExportClassList input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            updateSyllabusExportPreviewBtnState();
        });
    }
    const exportClassSyllabusBtn = document.getElementById('exportClassSyllabusBtn');
    if (exportClassSyllabusBtn) {
        exportClassSyllabusBtn.addEventListener('click', exportClassSyllabusFromModal);
    }
    const printClassSyllabusBtn = document.getElementById('printClassSyllabusBtn');
    if (printClassSyllabusBtn) {
        printClassSyllabusBtn.addEventListener('click', printClassSyllabusFromModal);
    }
    const closeSyllabusPdfPreviewModalBtn = document.getElementById('closeSyllabusPdfPreviewModal');
    if (closeSyllabusPdfPreviewModalBtn) {
        closeSyllabusPdfPreviewModalBtn.addEventListener('click', closeSyllabusPdfPreviewModal);
    }
    const syllabusPdfSaveBtn = document.getElementById('syllabusPdfSaveBtn');
    if (syllabusPdfSaveBtn) {
        syllabusPdfSaveBtn.addEventListener('click', saveSyllabusPdfFromPreview);
    }

"""
    text = text.replace(old_listeners, """    const printClassSyllabusBtn = document.getElementById('printClassSyllabusBtn');
    if (printClassSyllabusBtn) {
        printClassSyllabusBtn.addEventListener('click', printClassSyllabusFromModal);
    }

""")

    old_modal = """    const syllabusPdfPreviewModal = document.getElementById('syllabusPdfPreviewModal');
    const syllabusExportModal = document.getElementById('syllabusExportModal');
    [elements.classModal, elements.holidayModal, elements.printModal, elements.classTypeModal, syllabusExportModal]
        .filter(Boolean)
        .forEach(bindModalBackdropClose);
    if (syllabusPdfPreviewModal) {
        let pressStartedOnBackdrop = false;
        syllabusPdfPreviewModal.addEventListener('pointerdown', (e) => {
            pressStartedOnBackdrop = e.target === syllabusPdfPreviewModal;
        });
        syllabusPdfPreviewModal.addEventListener('click', (e) => {
            if (e.target === syllabusPdfPreviewModal && pressStartedOnBackdrop) {
                closeSyllabusPdfPreviewModal();
            }
            pressStartedOnBackdrop = false;
        });
    }
    
    // Close modals on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(elements.classModal);
            closeModal(elements.holidayModal);
            closeModal(elements.printModal);
            if (elements.classTypeModal) {
                closeModal(elements.classTypeModal);
            }
            if (syllabusExportModal && syllabusExportModal.classList.contains('active')) {
                closeSyllabusExportPickerModal();
            }
            if (syllabusPdfPreviewModal && syllabusPdfPreviewModal.classList.contains('active')) {
                closeSyllabusPdfPreviewModal();
            }
        }
    });"""
    new_modal = """    [elements.classModal, elements.holidayModal, elements.printModal, elements.classTypeModal]
        .filter(Boolean)
        .forEach(bindModalBackdropClose);
    
    // Close modals on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(elements.classModal);
            closeModal(elements.holidayModal);
            closeModal(elements.printModal);
            if (elements.classTypeModal) {
                closeModal(elements.classTypeModal);
            }
        }
    });"""
    text = text.replace(old_modal, new_modal)

    pdf_block_start = text.find("const HTML2CANVAS_CDN = ")
    pdf_block_end = text.find("function printSyllabusDocument(docHtml, windowTitle) {")
    if pdf_block_start == -1 or pdf_block_end == -1:
        raise RuntimeError("Could not locate PDF block boundaries in app.js")

    keep_block = """/** A4 content area (mm) inside 15 mm margins. */
const SYLLABUS_PDF_A4 = {
    pageW: 210,
    pageH: 297,
    margin: 15,
    fitSafety: 6,
    get contentW() {
        return this.pageW - this.margin * 2;
    },
    get contentH() {
        return this.pageH - this.margin * 2;
    },
    get fitContentH() {
        return this.contentH - this.fitSafety;
    }
};

function buildSyllabusExportDocument(classIds) {
    const mod = getSyllabusModule();
    if (!mod) {
        return null;
    }
    const sections = buildSyllabusExportSections(classIds);
    if (sections.length === 0) {
        return null;
    }
    const meta = {
        title: (appData.calendarName && appData.calendarName.trim()) || t('syllabusTables'),
        subtitle: appData.termStart ? appData.termStart : ''
    };
    const labels = {
        ...getSyllabusTableLabels(),
        pdfLayout: true,
        a4Pdf: true
    };
    return {
        docHtml: mod.renderSyllabusDocumentHtml(meta, sections, labels)
    };
}

"""
    text = text[:pdf_block_start] + keep_block + text[pdf_block_end:]

    text = text.replace(
        """function exportClassSyllabusFromModal() {
    const classId = getSyllabusClassIdFromClassModal();
    if (!classId) {
        return;
    }
    startSyllabusExport([classId]);
}

function printClassSyllabusFromModal() {""",
        "function printClassSyllabusFromModal() {",
    )

    text = text.replace(
        """function onSyllabusExportPreviewClick() {
    const selected = getSelectedSyllabusExportClassIds();
    if (!selected.length) {
        alert(t('exportSyllabiPickOne'));
        return;
    }
    startSyllabusExport(selected);
}

function applyEventTypeDefaultColors() {""",
        "function applyEventTypeDefaultColors() {",
    )

    p.write_text(text, encoding="utf-8")
    print("app.js updated")


def patch_styles_css():
    p = ROOT / "styles.css"
    text = p.read_text(encoding="utf-8")
    start = text.find("/* Syllabus PDF preview modal */")
    end = text.find("/* Books by month editor */")
    if start != -1 and end != -1:
        text = text[:start] + text[end:]
    p.write_text(text, encoding="utf-8")
    print("styles.css updated")


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
        ("exportSyllabiBtn" not in index, "exportSyllabiBtn removed from index.html"),
        ("syllabusExportModal" not in index, "syllabusExportModal removed from index.html"),
        ("html2canvas" not in index, "html2canvas removed from index.html"),
        ("HTML2CANVAS_CDN" not in app, "PDF constants removed from app.js"),
        ("printSyllabusDocument" in app, "printSyllabusDocument kept in app.js"),
        ("printClassSyllabusFromModal" in app, "printClassSyllabusFromModal kept in app.js"),
        ("exportData" in app, "exportData kept in app.js"),
        ("printClassSyllabusHint" in app, "printClassSyllabusHint added to app.js"),
    ]
    failed = [msg for ok, msg in checks if not ok]
    if failed:
        raise RuntimeError("Verification failed:\n- " + "\n- ".join(failed))
    print("verification passed")


if __name__ == "__main__":
    patch_index_html()
    patch_app_js()
    patch_styles_css()
    patch_howto_js()
    verify()
