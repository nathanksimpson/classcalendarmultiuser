# Syllabus Style Guide

How **syllabus A4 portrait print/PDF** layout is built, fitted to A4, and kept in sync with the Print Styles mockup.

Use this document when recreating or debugging print/PDF output—not the on-screen syllabus editor table.

---

## Reference model (teacher print — current)

Matches **Print Styles (A4) standalone** syllabus section (`css/syllabus-print-a4.css`, synced from the Figma mockup):

| Month | Week | Date | Lesson plan | Pages / detail | *(Notes — side panel)* |
|-------|------|------|-------------|----------------|------------------------|

```text
┌ Title · Syllabus + meta ─────────────── P2 · Class ─┐
├──────────────────────────────┬─────────────────────┤
│ Month │ Week │ Date │ Plan │ Pages │ Notes (200px)  │
│ (flex div rows)              │ general notes       │
└──────────────────────────────┴─────────────────────┘
│ ClassManager · Header repeats…                    Page │
```

- **Flex grid** (`syllabus-a4-print-grid`): **div rows** + **200px** Notes aside (Print Styles layout; not an HTML table).
- **Title block** (`syllabus-print-title-block`): `Class · Syllabus`, meta (days · Term: … · book), optional page label.
- **Dates:** `M/D` via `formatModernPrintDate()`.
- **Row styles:** holiday `#fef3c7`; test/evaluation deadline `inset 4px 0 0 #c0392b`.
- **Notes panel:** class general notes only (`buildPrintGeneralNotesHtml()`), synced height via `stretchModernPrintLayout()`.
- **Print CSS source of truth:** [`css/syllabus-print-a4.css`](css/syllabus-print-a4.css) → embedded in export via `npm run css:split`.

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
| [`css/syllabus-print-a4.css`](css/syllabus-print-a4.css) | Print Styles A4 layout (source of truth; synced into export CSS) |
| [`js/syllabus-table.js`](js/syllabus-table.js) | Render HTML, merge logic, fit/stretch |
| [`js/load-extension-scripts.js`](js/load-extension-scripts.js) | Cache-bust `?v=` on `syllabus-table.js` |
| [`tests/syllabus-table.test.mjs`](tests/syllabus-table.test.mjs) | Unit tests for render/fit |

---

## Verify after changes

1. Print summary → syllabus only for a class with holidays, tests, and long general notes.
2. Confirm five-column div grid + 200px Notes aside (`syllabus-a4-print-grid`), not a merged Note `<td>`.
3. **Ctrl+F5** after changing `syllabus-table.js` (check Network for current `?v=`).

---

## Deploy checklist

1. Edit layout/CSS in `css/syllabus-print-a4.css`, then `npm run css:split` (syncs into `js/syllabus-table.js`).
2. Update render logic in `js/syllabus-table.js` if markup changes.
3. Bump `js/syllabus-table.js?v=` in [`js/load-extension-scripts.js`](js/load-extension-scripts.js).
3. Run `npm test` (syllabus-table tests).
4. `npm run deploy` when production should update.

*Last aligned with implementation: June 2026 (`20260629-print-styles-a4`).*
