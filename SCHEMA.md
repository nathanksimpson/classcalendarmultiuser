# Calendar export JSON schema (schemaVersion 3)

## Top level

| Field | Type | Notes |
|-------|------|--------|
| `schemaVersion` | number | Currently `3` (classroom MVP adds attendance + homework tracking) |
| `calendarName` | string | Display title |
| `termStart` | string | `YYYY-MM-DD` term start date (legacy `YYYY-MM` migrates to `-01`) |
| `termEnd` | string | `YYYY-MM-DD` term end date |
| `useAutoTermEnd` | boolean | When true, `termEnd` is derived from `termMonthCount` |
| `termMonthCount` | number | 3–6 months (drives auto end and calendar month span) |
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
| `essaySubmissions` | array | Per-assignment essay submission status (see below) — schema v3 |
| `studentPoints` | array | Phase 2 stub — point ledger entries (empty on migrate) |
| `studentTests` | array | Phase 2 stub — test scores |
| `debateTeamSessions` | array | Debate Teams session state per class+date |
| `debateScores` | array | Debate Scores rubric entries (Tools → Debate Scores) |
| `debateCustomFormats` | array | Custom debate formats for scoring |
| `speakingTestRecords` | array | Speaking Test scores per class (Tools → Speaking Test) |
| `debateBookDistributions` | array | Debate Books handout checklist per class+period (Tools → Debate Books) |
| `pendingDebateBookChecks` | array | Mid-term cohort-move reminders to confirm book delivery (Tools → Debate Books + Notifications bell) — see below |
| `tmsRosterLinks` | object | TMS class → cohort mapping from roster Sync / Migrate (`{ [tmsKey]: { action, cohortId, … } }`) |
| `tmsEssayLinks` | object | TMS essay assignment → syllabus row mapping from Essays Sync |
| `portfolioRecordings` | array | Phase 2 stub — lesson recordings |
| `portfolioEntries` | array | Phase 2 stub — portfolio essays / news |
| `smsLog` | array | Phase 2 stub — SMS send log |
| `rooms` | array | Schedule planner rooms catalog |
| `teacherProfiles` | array | Schedule planner teacher profiles |
| `plannerDrafts` | array | Schedule planner versioned drafts |
| `plannerState` | object\|null | Active planner draft pointer / UI state |
| `exportMeta` | object | **Backup-only** (Export calendar). `{ exportFormatVersion, exportedAt, schemaVersion }`. Ignored on import / team save. |

`holidays` may appear in old exports; on load they are merged into `events`. New saves omit `holidays` (derived in memory from `events`). Full **Export calendar** backups also keep `ui` (including `studentArchiveRetentionDays`); team sync PUT still strips `ui` (viewer prefs live in localStorage / account prefs).

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
| `categoryId` | string | Note category. Default `class-notes`. Built-in: `class-notes`, `parent-consult`, `next-class-notes`, `class-points` (auto-synced from Points tab). Custom ids from `dayNoteCategories[]`. |

**Not the same as** `classes[].notes` (static class memo in the class editor).

### `dayNoteCategories[]` (optional)

User-defined day note categories for this calendar. Built-in categories (`class-notes`, `parent-consult`, `next-class-notes`, `class-points`) are always available and are not stored here.

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id, e.g. `dnc_…` |
| `name` | string | Display label |

### `cohorts[]` (optional)

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id |
| `name` | string | Display name (e.g. Purple T) |
| `color` | string | Hex parent accent (calm palette). Classes inherit this color at **first** cohort assignment (Generate subjects or catalog link when the class had no prior cohort). Manual class color edits are never overwritten; changing the cohort color later does not recolor already-linked classes. |
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
| `tmsBlockStart` / `tmsBlockEnd` | string | Optional. `HH:MM` from TMS 반정보 block schedule (Migrate / Sync create) |
| `tmsSuggestedPeriod` | number | Optional. Period inferred via `timetableTimeSlots` + `periodSlotMap` |
| `tmsSuggestedTimeSlotId` | string | Optional. Matching `timetableTimeSlots[].id` |

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
| `tmsMpidx` | string | Optional stable TMS student id from `studentinf(mpidx)` (roster Sync / Migrate) |

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

### `essaySubmissions[]` (optional, schema v3)

One record per class per syllabus lesson row (essay assignment). Keyed by `classId` + `syllabusRowId`.

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id |
| `classId` | string | Links to `classes[].id` |
| `syllabusRowId` | string | Links to a lesson row in `classes[].syllabusRows` |
| `lessonDate` | string | `YYYY-MM-DD` (display / filter) |
| `ssDueDate` | string | Student submission due (`YYYY-MM-DD`, optional override) |
| `teacherEvalDueDate` | string | Teacher evaluation due (`YYYY-MM-DD`, optional override) |
| `records[]` | array | `{ studentId, status, submittedRetest, debateVideoMissing, note, submissionLate, overdueDismissed }` — status: `not_submitted`, `submitted`, `complete`, `resubmit_required` (+ `incomplete`, `exempt` in code). `submissionLate`: teacher marked the submission late (not inferred from when Received was clicked). `overdueDismissed`: teacher cleared overdue after verifying e.g. TMS shows on time. `debateVideoMissing`: teacher marked debate video missing (NV warning). |
| `authorUserId` | string | Last editor |
| `updatedAt` | string | ISO-8601 |

### `debateBookDistributions[]` (optional, schema v3)

Physical book handout checklist (Tools → Debate Books). Keyed by `classId` + `periodKey`.

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id |
| `classId` | string | Links to `classes[].id` |
| `periodKey` | string | `YYYY-MM` for debate monthly classes (`scheduleModel === 'debateMonthly'`); `'term'` for one-book-per-term classes |
| `bookTitle` | string | Snapshot of book title for the period |
| `bookLevel` | string | Snapshot of class level (`levelCustom` / `levelPreset`) |
| `records[]` | array | `{ studentId, status, note, issuedAt? }` — status: `not_issued`, `issued`, `missing`; `issuedAt` is `YYYY-MM-DD` when status is `issued` |
| `authorUserId` | string | Last editor |
| `updatedAt` | string | ISO-8601 |

### `pendingDebateBookChecks[]` (optional, schema v3)

Created when students move cohorts mid-term (Students → Move, or TMS Sync transfer). Reminds teachers to confirm book handoff on the destination class. Saved via `classroomOnly` partial PUT (same as other classroom fields).

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable id (`dbc_…`) |
| `studentId` | string | Stable student id |
| `studentName` | string | Snapshot at move time |
| `fromCohortId` / `toCohortId` | string | Source / destination cohorts |
| `fromClassIds` / `toClassIds` | string[] | Debate-book-tracking classes linked to those cohorts |
| `priorStatusByClassId` | object | Per old class: `{ periodKey, status, bookTitle, issuedAt }` snapshot |
| `createdAt` | string | ISO-8601 |
| `resolvedAt` | string \| null | Set when confirmed/dismissed |
| `resolvedByUserId` | string \| null | User who resolved |

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

Each key is `null` (no filter — show all) or a string array (only matching classes are shown on the calendar and in class-related print sections). Dimensions are combined with **AND** (intersection) logic — this is a **viewer filter**, not event applicability.

| Key | Matches |
|-----|---------|
| `classIds` | Class `id` (stable identity; never class display name) |
| `grades` | `grade` (empty → sentinel `__no_grade__`) |
| `levelPresets` | `levelPreset` (empty → `__no_level__`) |
| `classTypeIds` | `classTypeId` (empty → `__no_type__`) |
| `periods` | Any period in `period` / `periodByWeekday` |
| `books` | Default `book` (empty → `__no_book__`) |
| `teacherUserIds` | Team account `userId` on `classTeachers[]` / legacy `assignedTeacherUserId` (empty → `__no_teacher__`). Fuzzy display-name matching is legacy-only when a row has no `userId`. |

## Class filter contracts (viewer vs applicability)

The app has **two different filter semantics**. Do not mix them.

### 1. Viewer filters — “show me fewer classes”

**Purpose:** Narrow what the signed-in viewer sees or prints. Intersection across active dimensions.

**Stable identity:** Classes match by `class.id`. Teachers match by team `userId`. Display names are migration/legacy fallbacks only.

**Surfaces that share (or should share) this contract:**

| Surface | Helper / pipeline | Notes |
|---------|-------------------|--------|
| Calendar lesson bars / print chips | `classPassesLessonFilters()` + `ui.lessonFilters` | AND across dimensions |
| Homework class list | `resolveClassListFilter()` then `filterClassesForActiveCohort()` | Plus optional text search and on-day split |
| Daily summary print | Same my-classes + date-occurs + **active cohort** as homework | No text search |
| Desktop Class Notes filters | `resolveClassListFilter()` + notes chip state | Subject/grade/homeroom chips are additional AND layers |
| Essay / zone “my classes” | Teacher `userId` on class rows | Separate modules; same identity rule |

**Explicit class checkboxes in viewer filters mean intersection**, not “override and force include.” Selecting a class still requires that class to pass other active dimensions (grade, teacher, etc.).

**Intentionally independent:**

| Surface | Why |
|---------|-----|
| Syllabus class list | Editor catalog — search over all classes so you can open any syllabus |
| Mobile notes day roster | Date + my-classes only; not the full desktop notes chip set |
| Timetable teacher grid | Teacher-centric, not the calendar lesson-filter popover |

### 2. Applicability filters — “this event applies to these classes”

**Purpose:** Decide which classes a holiday / evaluation period / other event cancels or annotates. Used by schedule generation, syllabus holiday rows, and homework due-date skipping via `eventAppliesToClass()` / `isHolidayForClass()`.

**Precedence (additive across categories):**

1. `excludedClassIds` — class is out regardless of other filters
2. **Class-only mode** — when only `classIds` / legacy `classNames` are set (no grades, sections, bands, or exclusions): whitelist those classes only
3. **Multi-category mode** — each active category must match (AND). A category is active when it has a partial selection (some but not all options checked). Within an active category, the class must match one of the selected values:
   - School band — exactly one of `allElementary` / `allMiddleSchool` selected
   - `grades` — partial grade list
   - `sectionLevels` — partial section list
4. Legacy `classNames` — only when `classIds` is empty; maps by display name (prefer re-saving with ids)

**Empty targeting** (no grades / sections / bands / classIds / classNames / excludedClassIds) means **all classes**.

**UI note:** When broad filters are active, unchecked class chips are stored as `excludedClassIds`. When only class chips are used (no broad filters), checked chips become `classIds`.

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
| `termEndMode` | string | Optional: `calendarMonths` (default) or `exactMonths` when auto end is on |
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
| `classIds` | string[] | Preferred class targeting by stable `classes[].id` (one option per class instance, including same-name different periods) |
| `excludedClassIds` | string[] | Class ids excluded when broad filters would otherwise include them |
| `grades`, `sectionLevels` | arrays | Optional broad include filters |
| `classNames` | string[] | Legacy display-name targeting; used only when `classIds` is empty. Prefer `classIds` on save. |
| `allElementary`, `allMiddleSchool` | boolean | Quick school-band includes |
| `bgColor`, `textColor` | string | Display colors (derived from `accentColor` when set) |
| `accentColor` | string | Optional calm-palette accent hex (theme-aware tint at render) |

If no targeting filters are set, the event applies to all classes. See **Class filter contracts → Applicability filters** above for precedence.

## Team sync PATCH mutations (API)

`PATCH /api/calendars/:id` accepts `{ "baseRevision": number, "mutations": [...] }`. Empty `mutations` returns **400**. Stale `baseRevision` returns **409** with `{ conflict: true, document }` (same as PUT).

Each mutation:

| Field | Type | Notes |
|-------|------|--------|
| `entity` | string | `classes`, `events`, or `dayNotes` |
| `action` | string | `upsert`, `remove`, or `mutate` (dayNotes only) |
| `payload` | object | Entity-specific partial data |
| `timestamp` | number | Optional client ms timestamp |

**classes:** `upsert` → `{ class: { id, ... } }`; `remove` → `{ classId }`

**events:** `upsert` → `{ event: { id, ... } }`; `remove` → `{ eventId }`

**dayNotes:** `mutate` → `{ op: "upsert", note: {...} }` or `{ op: "remove", noteId }`

Offline queue key: `classCalendarQueue:` + calendar id in `localStorage` (via `CCPSessionRestore`).

## Teacher planner fields (Schedule planner page)

Optional top-level fields used by the satellite page [`planner.html`](planner.html) (not a Timetable tab). Calendars without them load normally; `CCPTeacherPlanner.ensurePlannerFields` fills defaults.

| Field | Type | Notes |
|-------|------|--------|
| `rooms[]` | array | `{ id, name, capacity?, allowedClassTypes?, notes?, sortOrder? }` |
| `teacherProfiles[]` | array | Planner teacher rows: role, limits, availability block-outs, preferences, learnedPreferences |
| `plannerState` | object | Active draft id, board zoom/order, filters, global blockouts, `lockToCohortDays` (default true) |
| `plannerDrafts[]` | array | Versioned drafts with assignments, issues, metrics (keep last ~5) |
| `classes[].teacherRequirementType` | string | `korean` \| `native` \| `either` |
| `classes[].weeklyFrequency` | number | Optional 1 or 2; else derived from meetings |
| `classes[].roomId` | string | Soft default room |
| `classes[].roomIdByWeekday` | object | Optional weekday room overrides |
| `classes[].plannerExcluded` | boolean | Exclude from draft demand when true |

Legacy note: older deferred `teacherTeachingProfiles[]` is migrated into `teacherProfiles[]` when present.

## Planned admin scheduling fields (legacy / deferred)

These optional top-level fields were reserved earlier; prefer `teacherProfiles[]` + `plannerState` above.

| Field | Type | Notes |
|-------|------|--------|
| `teacherTeachingProfiles[]` | array | Legacy; migrated into `teacherProfiles[]` |
| `teacherAvailability[]` | array | Optional hard windows (schema TBD) |
| `scheduleOptimizerPrefs` | object | `version`, `weights`, `thresholds`, `strategy` for break/load optimizer |
| `rooms[]` | array | `{ id, name, capacity?, notes? }` room catalog |
| `classes[].roomId` | string | Default room for class (combined `cohortIds[]` share one class → one room) |
| `classes[].roomIdByWeekday` | object | Optional `{ "1": roomId, ... }` weekday overrides |

## Migration

`migrateData()` in `app.js` upgrades older files (legacy A/B/C levels, `dayOfWeek` → `meetingDays`, holidays → events).
