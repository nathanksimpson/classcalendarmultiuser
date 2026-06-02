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
| `bookOverrides` | object | Legacy per-book session templates (migrated into `curriculumOverrides` on load) |
| `curriculumOverrides` | object | Per-book curriculum edits: `sessions`, `classDefaults`, `applicableLevels`, optional `teamDefault` (admin/head-teacher adopted baseline for warnings and reset) |

**Syllabus data (not in saved calendar JSON):** `Reference/Syllabi/schedule-matrix.json` (Junior Rainbow / Senior Waterflow slots), session templates in `js/syllabus-curricula-data.js`. Presets include `programTrack`, `levelGroup`, `level`, `subjectTrack` for schedule suggestions; legacy IDs alias to new preset ids (e.g. `preset-rc-greenblue` → `preset-rc-green-blue`).
| `ui` | object | `visibilityFilters`, `printVisibility`, `lessonFilters` (optional class/grade/level filters) |
| `cohorts` | array | Student groups (same students); homeroom teacher (담임) per cohort — see below |
| `timetableTimeSlots` | array | Clock times for weekly timetable rows — see below |
| `periodSlotMap` | object | Maps class period `"1"`…`"7"` to `timetableTimeSlots[].id` |
| `dayNotes` | array | Daily class log entries from the calendar (see below) |

`holidays` may appear in old exports; on load they are merged into `events`. New saves omit `holidays` (derived in memory from `events`).

### `dayNotes[]` (optional)

Timestamped notes about what happened in class on a given calendar day. Entered from the calendar (right-click a lesson). Class name and subject are resolved at display/export time from `classes[]`, not stored on each entry.

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id |
| `classId` | string | Links to `classes[].id` |
| `date` | string | Calendar day `YYYY-MM-DD` |
| `text` | string | Note body |
| `createdAt` | string | ISO-8601 datetime when saved |

**Not the same as** `classes[].notes` (static class memo in the class editor).

### `cohorts[]` (optional)

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id |
| `name` | string | Display name (e.g. Purple T) |
| `level` | string | Legacy Simson level label |
| `levelPreset` | string | Simson level preset id (preferred) |
| `grade` | string | Optional grade |
| `schedulePattern` | string | `mwf`, `tth`, `mw`, `wf`, `mf`, or `custom` |
| `meetingDays` | number[] | 0=Sun … 6=Sat (from pattern or custom) |
| `periodCount` | number | UI hint; distinct periods from matrix |
| `scheduleBlock` | string | `primary` or `secondary` default for generated classes |
| `subjectSlots[]` | array | `{ id, subjectTrack, classId?, enabled?, period?, periodByWeekday?, placements? }[]` |
| `classIds` | string[] | Classes sharing this student group |
| `homeroomTeacherUserId` | string | 담임 — app user id |
| `homeroomTeacherName` | string | Free-text fallback |
| `homeroomDaySuffix` | string | Shown in timetable header (e.g. `M`, `T`) |

**Setup workflow:** Create cohorts on the **Cohorts** tab (Setup group), generate subject classes from the schedule matrix, then assign teachers on the **Teachers** tab. A class may be saved **without** a cohort (`cohortId` / `cohortIds` empty); link later via the Cohorts board drag-and-drop pool or the cohort class catalog (Apply). Warnings in the class editor are informational — only class name is required to save.

**Homeroom (담임) vs teaching:** Homeroom is an **administrative cohort role** (student contact, retests). It is **not** a teaching subject and must **not** appear in `classTeachers[].category`. A teacher who is 담임 and also teaches must still be listed in `classTeachers[]` on each class they teach, with the appropriate subject category (Debate, RC, etc.) and curriculum.

### `timetableTimeSlots[]` (optional)

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id (e.g. `ts1`) |
| `start`, `end` | string | `HH:MM` clock labels |
| `durationMin` | number | Optional minutes (display) |
| `sortOrder` | number | Row order |

### `periodSlotMap` (optional)

Object mapping period number strings (`"1"` … `"7"`) to a `timetableTimeSlots[].id`.

### `ui` viewer preferences (optional)

Stored in calendar JSON and mirrored to `localStorage` for quick restore. Not required for team sync document integrity.

| Field | Type | Notes |
|-------|------|--------|
| `activeTab` | string | Last main tab (`calendar`, `classes`, `timetable`, …) |
| `homeworkTabClassId` | string | Selected class on Homework tab |
| `syllabusTabClassId` | string | Selected class on Syllabus tab |
| `timetableTabTeacherUserId` | string | Selected teacher on Timetable tab (team account id) |
| `timetableTabTeacherName` | string | Fallback display name when matching legacy assignments |
| `teachersTabTeacherUserId` | string | Selected teacher on Teachers tab (head teacher / admin) |
| `teachersTabTeacherName` | string | Fallback display name on Teachers tab |
| `lessonFilters` | object | See below |

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
| `teacherUserIds` | Any `classTeachers[].userId` or legacy `assignedTeacherUserId` (empty → `__no_teacher__`) |

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
| `booksByMonth` | object | Legacy `YYYY-MM` → book title (migrated to `debateBookPeriods` on load) |
| `debateBookPeriods` | array | Debate only: `{ id, startDate, book }[]` — book + Day 1–4 cycle from each `startDate` until the next period |
| `debateBookPeriodsMigrated` | boolean | One-time migration flag from `booksByMonth` |
| `meetingDays` | number[] | 0=Sun … 6=Sat |
| `classTypeId` | string | Builtin or custom type |
| `scheduleModel` | string | `debateMonthly` (weekly + day merges) or `sequentialTerm` (lessons 1…N across term) |
| `startDate`, `endDate` | string | `YYYY-MM-DD` |
| `termCalendarMonths` | number | |
| `useAutoTermEnd` | boolean | |
| `totalLessons` | number | Per book period in debate auto schedule (typically 4) |
| `compressionMode` | string | `autoWhenNeeded`, `manual`, `manualPerMonth` (debate per period). Legacy `sequentialTerm` migrates to `autoWhenNeeded` |
| `compressionMerges` | number[] | Merge start days N+(N+1) on **this class’s** term schedule only |
| `skippedLessons` | number[] | Lesson numbers omitted from calendar this term (e.g. skip 11–15) |
| `compressionMergesByPeriod` | object | `periodId` → merge start days (`manualPerMonth` mode) |
| `compressionMergesByMonth` | object | Legacy `YYYY-MM` → merges (migrated to `compressionMergesByPeriod`) |
| `customSchedule` | object | Optional manual dates |
| `syllabusUnits` | array | Optional planning units (see below) |
| `syllabusGeneralNotes` | string | Optional general notes and instructions (shown at top of printed syllabus) |
| `syllabusRows` | array | Per-class syllabus table rows for print/export (see below) |
| `color`, `textColor` | string | Hex colors |
| `cohortId` | string | Primary cohort link (first in `cohortIds`; kept for older clients). Optional at create time. |
| `cohortIds` | string[] | Optional; all cohorts sharing this class (combined groups). Migrated from `cohortId` on load. |
| `generatedFromCohort` | boolean | Optional; set when class is created by Cohort tab **Generate subjects** |
| `classTeachers` | array | Teachers who **teach** this class: `{ id, userId?, name?, category?, curriculumId?, classTypeId?, book?, meetingDays?, period?, periodByWeekday?, placements?, scheduleBlock?, timeSlotId? }[]` — `userId` is the team account id from Accounts management (same as login); each row’s curriculum drives that teacher’s calendar/syllabus/homework view. `category` = **subject taught** in this class (Debate, RC, …), never “Homeroom”. Optional per-teacher schedule: `meetingDays` (0=Sun…6=Sat), `period`, `periodByWeekday`, `placements: [{ dow, period }]`, `scheduleBlock` (`primary` / `secondary`). Empty `classTeachers` clears legacy `assignedTeacher*` fields on save. 담임 for the student group is set on `cohorts[]`, not here. |
| `assignedTeacherUserId` | string | Legacy: first teacher id (kept in sync with `classTeachers[0]`) |
| `assignedTeacherName` | string | Legacy: first teacher name |
| `teacherCategory` | string | Legacy: first teacher category |
| `homeroomTeacherUserId` | string | Optional class-level HR override (usually use cohort 담임) |
| `homeroomTeacherName` | string | Optional HR display name override |
| `scheduleBlock` | string | `primary` (main grid) or `secondary` (Conversation / IPE / MS block) |
| `timeSlotId` | string | Optional override linking to `timetableTimeSlots[].id` |

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
