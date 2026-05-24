# Calendar export JSON schema (schemaVersion 2)

## Top level

| Field | Type | Notes |
|-------|------|--------|
| `schemaVersion` | number | Currently `2` |
| `calendarName` | string | Display title |
| `termStart` | string | `YYYY-MM` term start month |
| `termMonthCount` | number | 3–6 months shown |
| `classes` | array | Class definitions |
| `events` | array | **Source of truth** for holidays and other events |
| `customClassTypes` | array | User-defined class type presets |
| `customSyllabusTemplates` | array | Reusable syllabus templates (units + session row templates); see below |
| `defaultClassTypeOverrides` | object | Per-id edits to built-in / PDF preset defaults (`preset-rc-yeoul-saemmul`, `builtin-wr-sp`, etc.) |

**Syllabus data (not in saved calendar JSON):** `Reference/Syllabi/schedule-matrix.json` (Junior Rainbow / Senior Waterflow slots), session templates in `js/syllabus-curricula-data.js`. Presets include `programTrack`, `levelGroup`, `level`, `subjectTrack` for schedule suggestions; legacy IDs alias to new preset ids (e.g. `preset-rc-greenblue` → `preset-rc-green-blue`).
| `ui` | object | `visibilityFilters`, `printVisibility`, `lessonFilters` (optional class/grade/level filters) |

`holidays` may appear in old exports; on load they are merged into `events`. New saves omit `holidays` (derived in memory from `events`).

### `ui.lessonFilters` (optional)

Each key is `null` (no filter — show all) or a string array (only matching classes are shown on the calendar and in class-related print sections). Dimensions are combined with **AND** logic.

| Key | Matches |
|-----|---------|
| `classIds` | Class `id` |
| `grades` | `grade` (empty → sentinel `__no_grade__`) |
| `levelPresets` | `levelPreset` (empty → `__no_level__`) |
| `classTypeIds` | `classTypeId` (empty → `__no_type__`) |
| `periods` | Any period in `period` / `periodByWeekday` |
| `books` | Default `book` (empty → `__no_book__`) |

## Class (`classes[]`)

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id |
| `name` | string | Class name |
| `period` | number | Optional school period **1–7** (1 = first period). Lists, print summary, and same-day lesson bars sort by this, then name. |
| `levelPreset` | string | Simson level id |
| `levelCustom` | string | Optional custom level |
| `grade` | string | Optional (e.g. 중1). **Empty grade:** does not match grade-specific holidays; “all elementary” / “all middle school” bands still apply |
| `book` | string | Default book |
| `booksByMonth` | object | `YYYY-MM` → book title |
| `meetingDays` | number[] | 0=Sun … 6=Sat |
| `classTypeId` | string | Builtin or custom type |
| `scheduleModel` | string | `debateMonthly` (weekly + day merges) or `sequentialTerm` (lessons 1…N across term) |
| `startDate`, `endDate` | string | `YYYY-MM-DD` |
| `termCalendarMonths` | number | |
| `useAutoTermEnd` | boolean | |
| `totalLessons` | number | Per month in auto schedule |
| `compressionMode` | string | Debate: `autoWhenNeeded`, `manual`, `manualPerMonth`. Multi-day: `sequentialTerm` |
| `compressionMerges` | number[] | Merge start days (global manual fallback) |
| `compressionMergesByMonth` | object | `YYYY-MM` → merge start days (debate / per-month mode) |
| `customSchedule` | object | Optional manual dates |
| `syllabusUnits` | array | Optional planning units (see below) |
| `syllabusGeneralNotes` | string | Optional general notes and instructions (shown at top of printed syllabus) |
| `syllabusRows` | array | Per-class syllabus table rows for print/export (see below) |
| `color`, `textColor` | string | Hex colors |

### `syllabusUnits[]` (optional)

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id |
| `title` | string | Unit title |
| `notes` | string | Free text |
| `speakingPages` | string | e.g. `Student Book: Pages 8–11 / Workbook: Page 2` (Speaking session) |
| `writingPages` | string | Same for Writing session |
| `linkedSessionStart` | number | Optional 1-based session # where unit starts |

### `customSyllabusTemplates[]` (optional)

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id |
| `name` | string | Display name |
| `notes` | string | Optional short description (legacy; optional list hint) |
| `syllabusGeneralNotes` | string | General notes and instructions (same role as on classes) |
| `syllabusUnits` | array | Same shape as class `syllabusUnits[]` |
| `rowTemplates` | array | `{ sessionNumber, planTitle, planDetail, note? }[]` — applied by session # |
| `noteRows` | array | Optional standalone note rows when expanding template in editor |
| `homeworkImportMode`, `lessonLabelMode` | string | Optional; copied when applying to a class |

### `syllabusRows[]` (optional)

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable row id |
| `kind` | string | `lesson`, `holiday`, or `note` |
| `date` | string | `YYYY-MM-DD` when applicable |
| `monthKey` | string | `YYYY-MM` for Month column |
| `weekLabel` | string | Mon–Fri school week label (e.g. `Mar 2–6`) |
| `sessionNumber` | number | Class # column (1-based in term) |
| `planTitle` | string | Lesson or holiday title |
| `planDetail` | string | Book pages / extra plan line |
| `note` | string | Note column |
| `source` | string | `generated`, `manual`, or `imported` (manual/imported edits kept on refresh) |

## Event (`events[]`)

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | |
| `type` | string | `holiday`, `evaluation_deadline`, `homework_deadline`, `evaluation_period`, `other` |
| `name` | string | |
| `date` or `startDate`/`endDate` | string | Single or range |
| `isRange` | boolean | |
| `grades`, `sectionLevels`, `classNames` | arrays | Optional filters |
| `allElementary`, `allMiddleSchool` | boolean | Quick bands |
| `bgColor`, `textColor` | string | |

If no targeting filters are set, the event applies to all classes.

## Migration

`migrateData()` in `app.js` upgrades older files (legacy A/B/C levels, `dayOfWeek` → `meetingDays`, holidays → events).
