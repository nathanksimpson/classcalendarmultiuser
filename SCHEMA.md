# Calendar export JSON schema (schemaVersion 3)

## Top level

| Field | Type | Notes |
|-------|------|--------|
| `schemaVersion` | number | Currently `3` (classroom MVP adds attendance + homework tracking) |
| `calendarName` | string | Display title |
| `termStart` | string | `YYYY-MM` term start month |
| `termMonthCount` | number | 3–6 months shown |
| `classes` | array | Class definitions |
| `events` | array | **Source of truth** for holidays and other events |
| `customClassTypes` | array | User-defined class type presets |
| `customSyllabusTemplates` | array | Reusable syllabus templates (units + session row templates); see below |
| `defaultClassTypeOverrides` | object | Per-id edits to built-in / PDF preset defaults (`preset-rc-yeoul-saemmul`, `builtin-wr-sp`, etc.) |
| `bookOverrides` | object | Legacy per-book session templates (migrated into `curriculumOverrides` on load) |
| `curriculumOverrides` | object | Per-book curriculum edits: `sessions`, `classDefaults`, `applicableLevels`, optional `syllabusGeneralNotes` (printed in 진도표 Note column unless a class overrides), optional `teamDefault` (admin/head-teacher adopted baseline for warnings and reset) |
| `curriculumRemovedIds` | string[] | Optional. Admins can hide built-in program books from this calendar’s Curriculum tab (factory presets remain in the app; restore clears this list) |

**Syllabus data (not in saved calendar JSON):** `Reference/Syllabi/schedule-matrix.json` (Junior Rainbow / Senior Waterflow slots), session templates in `js/syllabus-curricula-data.js`. Presets include `programTrack`, `levelGroup`, `level`, `subjectTrack` for schedule suggestions; legacy IDs alias to new preset ids (e.g. `preset-rc-greenblue` → `preset-rc-green-blue`).
| `ui` | object | `visibilityFilters`, `printVisibility`, `lessonFilters` (optional class/grade/level filters) |
| `cohorts` | array | Student groups (same students); homeroom teacher (담임) per cohort — see below |
| `timetableTimeSlots` | array | Clock times for weekly timetable rows — see below |
| `periodSlotMap` | object | Maps class period `"1"`…`"7"` to `timetableTimeSlots[].id` |
| `dayNotes` | array | Daily class log entries from the calendar (see below) |
| `dayNoteCategories` | array | Custom day note category labels (see below) |
| `attendanceSessions` | array | Per-class daily attendance (see below) — schema v3 |
| `homeworkCompletions` | array | Per-assignment homework grades (see below) — schema v3 |
| `studentPoints` | array | Phase 2 stub — point ledger entries (empty on migrate) |
| `studentTests` | array | Phase 2 stub — test scores |
| `portfolioRecordings` | array | Phase 2 stub — lesson recordings |
| `portfolioEntries` | array | Phase 2 stub — portfolio essays / news |
| `smsLog` | array | Phase 2 stub — SMS send log |

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
| `authorUserId` | string | Optional. Team user id of the teacher who created the note; stamped on save. Co-teachers may read all notes for a class/day but only edit or delete their own (admins with calendar-access management may bypass). Entries without this field are legacy (editable by admins only). |
| `homeroomNotifyUserId` | string | Optional. When a co-teacher saves a new note, the app stamps the cohort/class 담임 user id so the homeroom teacher gets an in-app bell notification. Omitted when the author is the homeroom teacher or no 담임 is linked. |
| `taggedStudentIds` | string[] | Optional. Stable student ids mentioned in the note via `@` tags (e.g. `@홍길동`). Derived from note text on save; used for search, highlighted display, and student profile timeline. |
| `categoryId` | string | Note category. Default `class-notes`. Built-in: `class-notes`, `parent-consult`. Custom ids from `dayNoteCategories[]`. |

**Not the same as** `classes[].notes` (static class memo in the class editor).

### `dayNoteCategories[]` (optional)

User-defined day note categories for this calendar. Built-in categories (`class-notes`, `parent-consult`) are always available and are not stored here.

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id, e.g. `dnc_…` |
| `name` | string | Display label |

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
| `isArchiveCohort` | boolean | Optional. `true` on the system **student archive** cohort (`id`: `cohort-student-archive`). Not linked to classes; holds inactive/archived students. Auto-created on migrate. |
| `students[]` | array | Optional. Individual students in this cohort (schema v3) — see below |

**Student archive cohort:** One per calendar (`cohort-student-archive`). Students on break, not yet started, or who left are moved here via Classroom → Students. They do not appear on attendance or homework until restored to an active cohort. Permanent delete requires admin password and purges that student's attendance/homework records.

#### `cohorts[].students[]` (optional, schema v3)

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id |
| `name` | string | Korean display name |
| `nameEn` | string | English name (optional) |
| `locationTag` | string | Branch tag, e.g. 잠동 |
| `sortOrder` | number | List order |
| `active` | boolean | `false` = deactivated (hidden from attendance/homework) |
| `tags[]` | string[] | `interested`, `new`, `ending_soon`, `starting_soon` |
| `memo` | string | Persistent note (pickup address, etc.) |
| `archivedAt` | string | ISO-8601 when moved to archive cohort (empty when active) |
| `archiveReason` | string | `break`, `new`, `left`, `starting_soon` |
| `expectedStartDate` | string | `YYYY-MM-DD` when `archiveReason` is `starting_soon` |

### `attendanceSessions[]` (optional, schema v3)

One record per class per calendar day. Saved via `classroomOnly` partial PUT (does not require full calendar edit lock).

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id |
| `classId` | string | Links to `classes[].id` |
| `date` | string | `YYYY-MM-DD` |
| `records[]` | array | `{ studentId, status, sessionNote }` — status: `present`, `late`, `absent`, `early_leave` |
| `authorUserId` | string | Last editor (stamped on save) |
| `updatedAt` | string | ISO-8601 |

### `homeworkCompletions[]` (optional, schema v3)

One record per class per syllabus lesson row (assignment). Keyed by `classId` + `syllabusRowId` (syllabus row `id` or fallback `date|sessionNumber|planTitle`).

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id |
| `classId` | string | Links to `classes[].id` |
| `syllabusRowId` | string | Links to a lesson row in `classes[].syllabusRows` |
| `lessonDate` | string | `YYYY-MM-DD` (display / filter) |
| `records[]` | array | `{ studentId, grade, selfCheck, parentCheck, note }` — grade: `A`–`F`, `N`, `X`; selfCheck: `none`, `not_checked`, `satisfied` |
| `authorUserId` | string | Last editor |
| `updatedAt` | string | ISO-8601 |

### Phase 2 stubs (schema v3, not used in MVP UI)

Initialized as empty arrays on migrate. Reserved for points, tests, portfolio, SMS.

| Array | Intended use |
|-------|----------------|
| `studentPoints[]` | Point ledger (+/- per student) |
| `studentTests[]` | Mock test / listening scores |
| `portfolioRecordings[]` | Lesson recording metadata |
| `portfolioEntries[]` | Portfolio essays, news clips |
| `smsLog[]` | Outbound SMS audit trail |

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
| `studentArchiveRetentionDays` | number | Days after `archivedAt` before UI warns (warn only; default 90). Admin-only setting on Classroom → Students. |
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
| `curriculumId` | string | Optional curriculum book key from the Curriculum tab. `__none__` = no curriculum assigned; `__no_book__` = level-only defaults (no shared session pages); otherwise a book id (e.g. `write-now`, `debate-purple`) or a custom curriculum slug until deleted. |
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
| `cohortId` | string | Primary cohort link (first in `cohortIds`; kept for older clients). Optional at create time. Drives homeroom display in the class editor. |
| `cohortIds` | string[] | Optional; all cohorts sharing this class (**combined groups / 합반**). Migrated from `cohortId` on load. One calendar, one syllabus, one timetable cell — link every cohort that meets together. Example: cohorts `grade3-m` and `grade3-t` both list the same Debate class id in `cohortIds`; each cohort’s `classIds` includes that class after sync. |
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
| `type` | string | `holiday`, `evaluation_period` (remove class days for applicable classes), `evaluation_deadline`, `homework_deadline`, `other` (calendar reference only — does not remove class days) |
| `name` | string | |
| `date` or `startDate`/`endDate` | string | Single or range |
| `isRange` | boolean | |
| `grades`, `sectionLevels`, `classNames` | arrays | Optional filters |
| `allElementary`, `allMiddleSchool` | boolean | Quick bands |
| `bgColor`, `textColor` | string | |

If no targeting filters are set, the event applies to all classes.

## Migration

`migrateData()` in `app.js` upgrades older files (legacy A/B/C levels, `dayOfWeek` → `meetingDays`, holidays → events).
