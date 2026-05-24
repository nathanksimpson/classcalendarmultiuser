"""Fix app.js: replace corrupted PDF block with print-only syllabus helpers."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / "app.js"

KEEP = '''
/** A4 content area (mm) inside 15 mm margins. */
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

function getSyllabusClassIdFromClassModal() {
    const classId = elements.classId && elements.classId.value;
    if (!classId) {
        alert(t('syllabusTableEmptyHint'));
        return null;
    }
    const classData = appData.classes.find(c => c.id === classId);
    if (!classData) {
        return null;
    }
    const rows = getSyllabusRowsForClass(classData, { preferMerged: true });
    if (!rows.length) {
        alert(t('syllabusTableEmptyHint'));
        return null;
    }
    return classId;
}

function printSyllabusDocument(docHtml, windowTitle) {
    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert(t('printSyllabusBlocked'));
        return;
    }
    printWin.document.open();
    printWin.document.write(docHtml);
    printWin.document.close();
    printWin.document.title = windowTitle || t('printClassSyllabusTitle');
    printWin.focus();

    const mod = getSyllabusModule();
    const runPrint = () => {
        if (mod && typeof mod.fitSyllabusPagesToA4 === 'function'
            && printWin.document.querySelector('.syllabus-a4-sheet')) {
            mod.fitSyllabusPagesToA4(printWin.document, SYLLABUS_PDF_A4);
        }
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                try {
                    printWin.print();
                } catch (e) {
                    /* user can print manually from the new tab */
                }
            });
        });
    };

    setTimeout(runPrint, 400);
}

function printClassSyllabusFromModal() {
    const classId = getSyllabusClassIdFromClassModal();
    if (!classId) {
        return;
    }
    const built = buildSyllabusExportDocument([classId]);
    if (!built) {
        alert(t('syllabusTableEmptyHint'));
        return;
    }
    const classData = appData.classes.find(c => c.id === classId);
    const title = classData
        ? formatSyllabusPdfClassTitle(classData)
        : t('printClassSyllabusTitle');
    printSyllabusDocument(built.docHtml, title);
}

function applyEventTypeDefaultColors() {
    if (!elements.eventType) return;
    const type = normalizeEventType(elements.eventType.value);
    const defaults = EVENT_TYPE_DEFAULT_COLORS[type] || EVENT_TYPE_DEFAULT_COLORS.other;
    elements.holidayBgColor.value = defaults.bg;
    elements.holidayTextColor.value = defaults.text;
    if (type === EVENT_TYPES.EVALUATION_PERIOD) {
        elements.holidayIsRange.checked = true;
        elements.holidaySingleDate.style.display = 'none';
        elements.holidayDateRange.style.display = 'grid';
        syncHolidayRangeEndFromStart();
    }
}

'''

APPLY_COLORS = '''function applyEventTypeDefaultColors() {
    if (!elements.eventType) return;
    const type = normalizeEventType(elements.eventType.value);
    const defaults = EVENT_TYPE_DEFAULT_COLORS[type] || EVENT_TYPE_DEFAULT_COLORS.other;
    elements.holidayBgColor.value = defaults.bg;
    elements.holidayTextColor.value = defaults.text;
    if (type === EVENT_TYPES.EVALUATION_PERIOD) {
        elements.holidayIsRange.checked = true;
        elements.holidaySingleDate.style.display = 'none';
        elements.holidayDateRange.style.display = 'grid';
        syncHolidayRangeEndFromStart();
    }
}

'''


def main():
    text = APP.read_text(encoding="utf-8")
    start = text.find("function buildSyllabusExportSections(classIds = null) {")
    if start == -1:
        raise SystemExit("buildSyllabusExportSections not found")
    end_sections = text.find("\n}\n", text.find("return sections;", start))
    if end_sections == -1:
        raise SystemExit("end of buildSyllabusExportSections not found")
    end_sections += len("\n}\n")

    end = text.find("function openClassModal(classData = null, options = {}) {")
    if end == -1:
        raise SystemExit("openClassModal not found")

    new_text = text[:end_sections] + KEEP + text[end:]
    APP.write_text(new_text, encoding="utf-8")
    print("app.js fixed")


if __name__ == "__main__":
    main()
