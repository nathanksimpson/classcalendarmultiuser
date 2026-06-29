# Syllabus Style Guide

How **syllabus A4 portrait print/PDF** layout is built, fitted to A4, and kept in sync with the Print Styles mockup.

Use this document when recreating or debugging print/PDF output—not the on-screen syllabus editor table.

---

## Reference model (teacher print — current)

Matches [`Print Styles (A4).dc.html`](Print%20Styles%20(A4).dc.html) syllabus section:

| Month | Week | Date | Lesson plan | Pages / detail | *(Note — side panel)* |
|-------|------|------|-------------|----------------|------------------------|

```text
┌ Title · Syllabus + meta ─────────────── P2 · Class ─┐
├──────────────────────────────┬─────────────────────┤
│ Month │ Week │ Date │ Plan │ Pages │ Note (200px)   │
│ (rows, holiday/test styles)  │ general notes       │
└──────────────────────────────┴─────────────────────┘
│ ClassManager · Header repeats…                    Page │
```

- **Flex shell** (`syllabus-modern-print-shell`): **5-column** main table + **200px** Note aside (not a table column).
- **Title block** (`syllabus-print-title-block`): `Class · Syllabus`, meta (days · Term: … · book), optional page label.
- **Dates:** `M/D` via `formatModernPrintDate()` (same as jindo).
- **Row styles:** holiday `#fef3c7`; test/evaluation deadline `inset 4px 0 0 #c0392b`.
- **Note panel:** class general notes only (`buildPrintGeneralNotesHtml()`), synced height via `stretchModernPrintLayout()`.

Implementation flag: `modernPdf` in [`js/syllabus-table.js`](js/syllabus-table.js) when `pdfLayout` + jindo layout is enabled for teacher (non-student) print.

---

## Legacy jindo two-table layout (retired for teacher print)

Older teacher PDFs used a Korean **진도표** grid: main table (year/month/week/date/plan) + separate notes table (~85% / ~15%). That path remains in code for **student syllabus** variants only. Do not reintroduce the two-table layout for standard teacher print.

---

## Widths (constants)

Defined in [`js/syllabus-table.js`](js/syllabus-table.js):

| Constant | Role |
|----------|------|
| `SYLLABUS_MODERN_MAIN_COL_WIDTHS` | Month, Week, Date, Plan, Pages/detail (teacher A4 main table) |
| `SYLLABUS_A4_COL_WIDTHS` | Legacy non-jindo five-column layout |
| `SYLLABUS_JINDO_*` | Student / legacy jindo paths |

---

## Key files

| File | Role |
|------|------|
| [`js/syllabus-table.js`](js/syllabus-table.js) | Render HTML, `A4_PDF_CSS`, merge logic, fit/stretch |
| [`js/load-extension-scripts.js`](js/load-extension-scripts.js) | Cache-bust `?v=` on `syllabus-table.js` |
| [`tests/syllabus-table.test.mjs`](tests/syllabus-table.test.mjs) | Unit tests for render/fit |

---

## Verify after changes

1. Print summary → syllabus only for a class with holidays, tests, and long general notes.
2. Confirm five-column main table + 200px Note aside (`syllabus-modern-print-shell`), not a merged Note `<td>`.
3. **Ctrl+F5** after changing `syllabus-table.js` (check Network for current `?v=`).

---

## Deploy checklist

1. Update render/CSS in `js/syllabus-table.js`.
2. Bump `js/syllabus-table.js?v=` in [`js/load-extension-scripts.js`](js/load-extension-scripts.js).
3. Run `npm test` (syllabus-table tests).
4. `npm run deploy` when production should update.

*Last aligned with implementation: June 2026 (`20260629-print-styles-a4`).*
