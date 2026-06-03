# Syllabus print QA samples

## Reference 진도표 (layout target)

Place a copy of the school reference PDF here for side-by-side QA:

- **File:** `26-sp-green-blue-rc-jindo-M-wedfri.pdf`
- **Source:** `26 SP Green-Blue RC 진도표 [M반] (수금)_완.pdf` (teacher progress chart, Wed/Fri M-section)

Printed output from **Print syllabus** should match that layout:

| Column | Reference |
|--------|-----------|
| Year / month | `2026년`, `3월`, … |
| Week | `1주`, `2주`, … (per month) |
| Date | `3/4`, `3/6`, … |
| Lesson plan | Short title per row only |
| Note (비고) | General notes on first class row; blank elsewhere |

Optional **homework detail appendix** is off by default (Print options → “Include homework detail pages”).

## Manual check

1. `npm start` → open a class with Wed+Fri (or your Write Now class).
2. Print syllabus → compare to the reference PDF.
3. Enable appendix checkbox → confirm extra pages appear after the 진도표 table.
