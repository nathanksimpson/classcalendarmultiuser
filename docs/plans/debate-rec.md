# Debate Rec — Implementation Plan

**Feature:** Tools → **Debate Rec** sub-tab
**Goal:** Warn when a student was absent on the day the Debate **Day 4** homework was assigned (the day the debate is recorded in class), so teachers can collect a make-up recording.
**Status:** Implemented on branch `plan/debate-rec` (see §15 for differences from the plan)
**Owner:** Nathan
**Last updated:** 2026-10-24

---

## 1. Summary

On Debate Day 4 the class debate is video-recorded. A student who is absent that day has no recording. Today a teacher has to notice this manually and tick **NV** (debate video missing) on the Day 4 essay in Tools → Essays.

Debate Rec automates that check:

1. Find every Day 4 row in each debate class's syllabus and the **date the Day 4 homework was assigned** (from TMS essay sync when available, otherwise the syllabus date).
2. Read each student's **TMS attendance** (already scraped by the Briefing sync — read-only).
3. Cross-reference: absence on that date → warning.
4. Show results on a new **Debate Rec** sub-tab, in the notifications bell, and as the existing **NV** badge on Essays.
5. Teachers resolve each warning. **A teacher's decision is never overwritten by a later TMS check.**

---

## 2. Rules (confirmed)

### 2.1 TMS status → Debate Rec status

| TMS status (on assigned date) | Debate Rec status | Sets NV on Day 4 essay? |
|---|---|---|
| **결석** (absent) | **Not recorded** (confirmed) | Yes |
| **지각** (late) | **Needs confirmation** | No |
| **조퇴** (early leave) | **Needs confirmation** | No |
| **미참석** or any other non-present status | **Needs confirmation** | No |
| No absence record that day | Present — no row shown | No |

### 2.2 Attendance is whole-day

TMS attendance is recorded per **day**, not per class. An absence on a date means the student missed every class that day (e.g. a Mon/Wed/Fri student absent on Wednesday missed Wednesday's debate). So:

- No per-class matching is needed — match on **student + date** only.
- The ClassManager Attendance tab does **not** override TMS.

### 2.3 Teacher overrides are final

| Source | Can a later TMS check change it? |
|---|---|
| Status set by the **TMS check** (`not_recorded`, `needs_confirmation`) | Yes — re-checks refresh it (e.g. TMS corrected to present → row cleared) |
| Status set by a **teacher** (any status) | **No — never resynced** |

- Manually ticking/clearing **NV** on the Essays tab also counts as a teacher decision.
- Every teacher decision stores **who** and **when**.
- A per-row **"Reset to TMS"** action hands the student back to automatic checking (confirmed).

### 2.4 Read-only toward TMS

**No part of Debate Rec writes to TMS.** It only reuses the existing Briefing scrape, which issues GET requests (class popup, absence list, counseling list, profile) plus the standard sign-in POST that every sync already uses. All Debate Rec writes go to ClassManager's own calendar data. A contract test enforces this (§10.3).

---

## 3. What already exists (reuse)

| Need | Existing code |
|---|---|
| Day 4 row detection | `classroom-domain.js` → `isDebateDayFourTitle()`, `sessionNumber === 4`, `isEssayAssignmentRow()` |
| Debate classes | `classUsesDebateTeamAssignments(classData)` → `scheduleModel === 'debateMonthly'` |
| Day 4 homework = essay | Debate template row `Day 4 / Preview` has `trackEssay: true` (`syllabus-curricula-data.js`) |
| TMS assigned date | `tmsEssayLinks[key]` → `{ action:'map', classId, syllabusRowId, lessonDate }` written by Essays → Sync from TMS |
| TMS attendance | `shared/tms-counsel-core.cjs` → `parseAttendanceTable()` → `attendanceRecords: [{ date, status, memo, flags }]` per student |
| Attendance fetch + cache | `js/classroom-briefing.js` → `runSync()` (job `counsel`) → `_cache` (`briefing-<classId>` → student profiles), persisted to IndexedDB |
| NV flag | `essaySubmissions[].records[].debateVideoMissing` + NV badge/attention tile on Essays |
| Roster for a class | `resolveStudentsForClass(classData, cohorts)` |
| Save path | `hooks.saveClassroom({ essaySubmissions })` → `classroomOnly` partial PUT (server passes record fields through) |
| Bell warnings pattern | `tab-warnings.js` → `homework_chronic_skip` warning in `pushClassExtraWarnings()` |

**No D1 migration.** Classroom data lives inside the calendar document.

---

## 4. Data model

Store Debate Rec state on the **existing Day 4 essay record** (`essaySubmissions[].records[]`), keyed by `classId + syllabusRowId + studentId`. This keeps one source of truth with the Essays NV badge and avoids a new top-level collection (which would need allow-list changes in ~10 places: server, Worker, sync merge, export, mutations, access core).

### 4.1 New fields on `essaySubmissions[].records[]`

| Field | Type | Notes |
|---|---|---|
| `debateRecStatus` | string | `''` (none) · `not_recorded` · `needs_confirmation` · `recorded` · `received` · `exempt` |
| `debateRecSource` | string | `''` · `tms` · `teacher` — **`teacher` is never overwritten by sync** |
| `debateRecDate` | string | `YYYY-MM-DD` assigned date used for the check |
| `debateRecTmsStatus` | string | Raw TMS label (`결석`, `지각`, `조퇴`, `미참석`, …) |
| `debateRecTmsMemo` | string | TMS attendance memo, if any |
| `debateRecCheckedAt` | string | ISO-8601 of last TMS check that touched this record |
| `debateRecUpdatedBy` | string | User id of the teacher who set it (teacher source only) |
| `debateRecUpdatedAt` | string | ISO-8601 of the teacher decision |
| `debateRecNote` | string | Free-text teacher note |

### 4.2 Status meanings

| Status | Meaning | Set by | NV (`debateVideoMissing`) |
|---|---|---|---|
| `not_recorded` | Absent (결석) / confirmed no recording | TMS or teacher | **true** |
| `needs_confirmation` | Late / early leave / other — teacher must check | TMS only | false |
| `recorded` | Was present for the debate after all | teacher | false |
| `received` | Make-up recording turned in | teacher | false |
| `exempt` | Excused, no recording required | teacher | false |

`debateVideoMissing` is **derived** from `debateRecStatus === 'not_recorded'` whenever Debate Rec writes a record. Legacy records with `debateVideoMissing: true` and no `debateRecStatus` are read as `not_recorded` / source `teacher`.

### 4.3 Example record

```json
{
  "studentId": "stu_8f21",
  "status": "not_submitted",
  "debateVideoMissing": true,
  "debateRecStatus": "not_recorded",
  "debateRecSource": "tms",
  "debateRecDate": "2026-10-21",
  "debateRecTmsStatus": "결석",
  "debateRecTmsMemo": "병결",
  "debateRecCheckedAt": "2026-10-24T01:42:10.000Z",
  "debateRecUpdatedBy": "",
  "debateRecUpdatedAt": "",
  "debateRecNote": ""
}
```

### 4.4 `normalizeEssayRecord` must keep the new fields

The client normalizer currently whitelists fields, so new fields would be dropped on load. Update `js/classroom-domain.js`:

```js
const DEBATE_REC_STATUSES = [
    'not_recorded', 'needs_confirmation', 'recorded', 'received', 'exempt'
];
const DEBATE_REC_SOURCES = ['tms', 'teacher'];

function normalizeDebateRecFields(raw) {
    let status = normalizeStr(raw.debateRecStatus);
    let source = normalizeStr(raw.debateRecSource);
    if (!DEBATE_REC_STATUSES.includes(status)) {
        status = '';
    }
    if (!DEBATE_REC_SOURCES.includes(source)) {
        source = '';
    }
    // Legacy: NV ticked by hand before Debate Rec existed → teacher decision.
    if (!status && raw.debateVideoMissing) {
        status = 'not_recorded';
        source = 'teacher';
    }
    return {
        debateRecStatus: status,
        debateRecSource: status ? source : '',
        debateRecDate: normalizeStr(raw.debateRecDate),
        debateRecTmsStatus: normalizeStr(raw.debateRecTmsStatus),
        debateRecTmsMemo: normalizeStr(raw.debateRecTmsMemo),
        debateRecCheckedAt: normalizeStr(raw.debateRecCheckedAt),
        debateRecUpdatedBy: normalizeStr(raw.debateRecUpdatedBy),
        debateRecUpdatedAt: normalizeStr(raw.debateRecUpdatedAt),
        debateRecNote: normalizeStr(raw.debateRecNote)
    };
}

function normalizeEssayRecord(raw) {
    // ...existing body...
    return Object.assign({
        studentId: normalizeStr(raw.studentId),
        status: validStatus,
        // ...existing fields...
        debateVideoMissing: Boolean(raw.debateVideoMissing),
        submittedAt: normalizeEssaySubmittedAt(raw.submittedAt)
    }, normalizeDebateRecFields(raw));
}
```

Also carry the fields through every place that copies essay records field-by-field (search `debateVideoMissing:` in `classroom-domain.js` — lines ~2111, ~4802, ~4893, ~4997, ~8938 and `classroom-essays.js` ~2127, ~2178). `pickRicherEssayRecord()` (student merge) should prefer a `teacher`-sourced Debate Rec status over a `tms` one.

---

## 5. Domain logic (`js/classroom-domain.js`)

### 5.1 Find recording days and their assigned dates

```js
/** Day 4 syllabus rows that require a debate recording (debate-monthly classes only). */
function isDebateRecordingRow(row) {
    if (!row || !isEssayTrackableSyllabusRow(row) || !normalizeStr(row.date)) {
        return false;
    }
    const title = row.planTitle || row.label || '';
    if (isDebateDayThreeTitle(title) && !isDebateDayFourTitle(title)) {
        return false;
    }
    return Number(row.sessionNumber) === 4 || isDebateDayFourTitle(title);
}

/**
 * TMS assigned date for a syllabus row, from Essays → Sync from TMS links.
 * Falls back to the syllabus date when the class has not been synced.
 */
function resolveDebateRecAssignedDate(appData, classId, row) {
    const links = normalizeTmsEssayLinks(appData && appData.tmsEssayLinks);
    const rowId = getSyllabusRowKey(row);
    const hit = Object.values(links).find(
        (l) => l.action === 'map' && l.classId === classId && l.syllabusRowId === rowId && l.lessonDate
    );
    return {
        date: hit ? hit.lessonDate : normalizeStr(row.date),
        source: hit ? 'tms' : 'syllabus'
    };
}

/** @returns {{ rowId, row, date, dateSource }[]} sorted by date */
function listDebateRecordingDays(appData, classData) {
    if (!classData || !classUsesDebateTeamAssignments(classData)) {
        return [];
    }
    return getLessonRowsFromSyllabus(classData.syllabusRows)
        .filter(isDebateRecordingRow)
        .map((row) => {
            const resolved = resolveDebateRecAssignedDate(appData, classData.id, row);
            return {
                rowId: getSyllabusRowKey(row),
                row,
                date: resolved.date,
                dateSource: resolved.source
            };
        })
        .sort((a, b) => compareDateStr(a.date, b.date));
}
```

### 5.2 Classify a TMS attendance record

```js
const TMS_ABSENT_STATUSES = ['결석'];

/** Map one TMS attendance status to a Debate Rec status ('' = present / ignore). */
function debateRecStatusFromTms(tmsStatus) {
    const s = normalizeStr(tmsStatus);
    if (!s || s === '출석') {
        return '';
    }
    if (TMS_ABSENT_STATUSES.includes(s)) {
        return 'not_recorded';
    }
    return 'needs_confirmation'; // 지각, 조퇴, 미참석, anything else
}

/** When a student has several TMS rows on one date, the strongest wins. */
function pickTmsAttendanceForDate(records, date) {
    const onDate = (records || []).filter((r) => r && normalizeStr(r.date) === date);
    if (!onDate.length) {
        return null;
    }
    return onDate.find((r) => debateRecStatusFromTms(r.status) === 'not_recorded')
        || onDate.find((r) => debateRecStatusFromTms(r.status) === 'needs_confirmation')
        || null;
}
```

### 5.3 Apply a TMS check (never touches teacher decisions)

```js
/**
 * Cross-reference TMS attendance with Debate Day 4 dates for one class.
 * Pure: returns a new essaySubmissions list plus a summary. Never writes to TMS.
 *
 * @param {object} appData
 * @param {string} classId
 * @param {Map<string, object[]>} tmsAttendanceByStudentId  studentId → attendanceRecords
 * @param {{ nowIso?: string, newSubmissionId?: () => string }} [options]
 */
function applyDebateRecTmsCheck(appData, classId, tmsAttendanceByStudentId, options) {
    const opts = options || {};
    const nowIso = opts.nowIso || new Date().toISOString();
    const classData = (appData.classes || []).find((c) => c && c.id === classId);
    let submissions = Array.isArray(appData.essaySubmissions)
        ? appData.essaySubmissions.slice()
        : [];
    const summary = { flagged: 0, needsConfirmation: 0, cleared: 0, skippedTeacher: 0, noTmsData: 0 };
    if (!classData) {
        return { submissions, summary };
    }
    const students = resolveStudentsForClass(classData, appData.cohorts);
    const days = listDebateRecordingDays(appData, classData)
        .filter((d) => compareDateStr(d.date, todayISO()) <= 0); // only past/today

    days.forEach((day) => {
        let submission = findEssaySubmission(submissions, classId, day.rowId) || {
            id: typeof opts.newSubmissionId === 'function' ? opts.newSubmissionId() : newId('essay'),
            classId,
            syllabusRowId: day.rowId,
            lessonDate: day.row.date,
            records: []
        };
        const records = (submission.records || []).slice();

        students.forEach(({ student }) => {
            const tmsRecords = tmsAttendanceByStudentId.get(student.id);
            if (!tmsRecords) {
                summary.noTmsData += 1;
                return; // never cleared/flagged without data
            }
            const idx = records.findIndex((r) => r.studentId === student.id);
            const prev = idx >= 0 ? records[idx] : null;

            // Rule 2.3: teacher decisions are final.
            if (prev && prev.debateRecSource === 'teacher') {
                summary.skippedTeacher += 1;
                return;
            }

            const hit = pickTmsAttendanceForDate(tmsRecords, day.date);
            const nextStatus = hit ? debateRecStatusFromTms(hit.status) : '';

            if (!nextStatus && !(prev && prev.debateRecSource === 'tms')) {
                return; // present and nothing to clear
            }

            const base = prev || { studentId: student.id, status: 'not_submitted' };
            const next = Object.assign({}, base, {
                debateRecStatus: nextStatus,
                debateRecSource: nextStatus ? 'tms' : '',
                debateRecDate: day.date,
                debateRecTmsStatus: hit ? normalizeStr(hit.status) : '',
                debateRecTmsMemo: hit ? normalizeStr(hit.memo) : '',
                debateRecCheckedAt: nowIso,
                debateVideoMissing: nextStatus === 'not_recorded'
            });

            if (nextStatus === 'not_recorded') summary.flagged += 1;
            else if (nextStatus === 'needs_confirmation') summary.needsConfirmation += 1;
            else summary.cleared += 1;

            if (idx >= 0) records[idx] = next;
            else records.push(next);
        });

        submission = Object.assign({}, submission, { records });
        submissions = upsertEssaySubmission(submissions, submission);
    });

    return { submissions, summary };
}
```

### 5.4 Teacher decision + reset

```js
const DEBATE_REC_TEACHER_STATUSES = ['not_recorded', 'recorded', 'received', 'exempt'];

function setDebateRecTeacherStatus(submissions, options) {
    const o = options || {};
    if (!DEBATE_REC_TEACHER_STATUSES.includes(o.status)) {
        return { error: 'invalid', submissions };
    }
    return patchEssayRecord(submissions, o, (prev) => Object.assign({}, prev, {
        debateRecStatus: o.status,
        debateRecSource: 'teacher',
        debateRecDate: o.date || prev.debateRecDate || '',
        debateRecUpdatedBy: o.userId || '',
        debateRecUpdatedAt: o.nowIso || new Date().toISOString(),
        debateVideoMissing: o.status === 'not_recorded'
    }));
}

/** Hand the student back to the automatic TMS check. */
function resetDebateRecToTms(submissions, options) {
    return patchEssayRecord(submissions, options, (prev) => Object.assign({}, prev, {
        debateRecStatus: '',
        debateRecSource: '',
        debateRecUpdatedBy: '',
        debateRecUpdatedAt: '',
        debateVideoMissing: false
    }));
}

/** Shared helper: find-or-create the essay record, apply `fn`, upsert. */
function patchEssayRecord(submissions, o, fn) {
    const list = Array.isArray(submissions) ? submissions.slice() : [];
    let sub = findEssaySubmission(list, o.classId, o.syllabusRowId) || {
        id: newId('essay'),
        classId: o.classId,
        syllabusRowId: o.syllabusRowId,
        lessonDate: o.lessonDate || '',
        records: []
    };
    const records = (sub.records || []).slice();
    const idx = records.findIndex((r) => r.studentId === o.studentId);
    const prev = idx >= 0 ? records[idx] : { studentId: o.studentId, status: 'not_submitted' };
    const next = fn(prev);
    if (idx >= 0) records[idx] = next;
    else records.push(next);
    sub = Object.assign({}, sub, { records });
    return { error: null, submissions: upsertEssaySubmission(list, sub) };
}
```

### 5.5 Essays tab NV toggle → teacher decision

In `classroom-essays.js`, where the `.classroom-essay-debate-video` checkbox changes `debateVideoMissing`, also set the Debate Rec source so a later TMS check won't undo it:

```js
// checked → not_recorded (teacher); unchecked → received (teacher)
Object.assign(rec, {
    debateVideoMissing: checked,
    debateRecStatus: checked ? 'not_recorded' : 'received',
    debateRecSource: 'teacher',
    debateRecUpdatedBy: hooks.getCurrentUserId ? hooks.getCurrentUserId() : '',
    debateRecUpdatedAt: new Date().toISOString()
});
```

### 5.6 Summaries for UI and warnings

```js
/** Rows for the Debate Rec table + counts. "Not checked" = past day with no TMS data. */
function computeDebateRecView(appData, classId, tmsAttendanceByStudentId) {
    const classData = (appData.classes || []).find((c) => c && c.id === classId);
    const students = resolveStudentsForClass(classData, appData.cohorts);
    const days = listDebateRecordingDays(appData, classData);
    const counts = { not_recorded: 0, needs_confirmation: 0, received: 0, exempt: 0, recorded: 0, not_checked: 0 };
    const rows = [];
    days.forEach((day) => {
        const sub = findEssaySubmission(appData.essaySubmissions, classId, day.rowId);
        students.forEach(({ student }) => {
            const rec = getEssayRecordForStudent(sub, student.id);
            const status = rec && rec.debateRecStatus;
            if (status) {
                counts[status] += 1;
                rows.push({ day, student, rec });
            } else if (!(tmsAttendanceByStudentId && tmsAttendanceByStudentId.has(student.id))
                && compareDateStr(day.date, todayISO()) <= 0) {
                counts.not_checked += 1;
            }
        });
    });
    return { days, rows, counts };
}

/** Open items for the bell: not_recorded + needs_confirmation. */
function countOpenDebateRecWarnings(appData, classId) {
    const out = { notRecorded: 0, needsConfirmation: 0 };
    (appData.essaySubmissions || [])
        .filter((s) => s && s.classId === classId)
        .forEach((s) => (s.records || []).forEach((r) => {
            if (r.debateRecStatus === 'not_recorded') out.notRecorded += 1;
            if (r.debateRecStatus === 'needs_confirmation') out.needsConfirmation += 1;
        }));
    return out;
}
```

Export all new functions on `CCPClassroomDomain` (bottom of `classroom-domain.js`).

---

## 6. TMS attendance source (read-only)

### 6.1 Expose Briefing's cached attendance

`js/classroom-briefing.js` currently exports only `initTab, render, ensureSyncUi, runSync, estimateSyncMinutes`. Add two read-only accessors:

```js
/** studentId → attendanceRecords for one class, from the in-memory/IDB cache. */
async function getCachedAttendanceByStudent(classId) {
    if (!_cache.size) {
        await loadBriefingCache();
    }
    const map = new Map();
    (_cache.get(`briefing-${classId}`) || []).forEach((p) => {
        if (p && p.studentId && Array.isArray(p.attendanceRecords) && !p.error) {
            map.set(String(p.studentId), p.attendanceRecords);
        }
    });
    return map;
}

function getCacheSavedAt() {
    // New module variable: set from snapshot.savedAt in applyCacheSnapshot()
    // and to Date.now() in persistBriefingCacheNow().
    return lastCacheSavedAt || 0;
}

global.CCPClassroomBriefing = {
    initTab,
    render: renderIdle,
    ensureSyncUi,
    runSync,
    estimateSyncMinutes,
    getCachedAttendanceByStudent,
    getCacheSavedAt
};
```

> Only students whose profile scraped successfully get a map entry. Missing students stay **Not checked** — Debate Rec never clears or flags without data.

### 6.2 "Check TMS attendance" flow

```js
async function runTmsCheck(classIds) {
    const briefing = global.CCPClassroomBriefing;
    // Always scrape fresh (confirmed): same sign-in modal + Sync Helper path as Briefing.
    // Read-only GETs plus the standard sign-in.
    await briefing.runSync(await promptTmsCredentials(), { classIds, counselOnly: true });
    let data = hooks.getAppData();
    let totals = { flagged: 0, needsConfirmation: 0, cleared: 0, skippedTeacher: 0, noTmsData: 0 };
    for (const classId of classIds) {
        const byStudent = await briefing.getCachedAttendanceByStudent(classId);
        const { submissions, summary } = domain().applyDebateRecTmsCheck(data, classId, byStudent);
        data = Object.assign({}, data, { essaySubmissions: submissions });
        Object.keys(totals).forEach((k) => { totals[k] += summary[k]; });
    }
    await hooks.saveClassroom({ essaySubmissions: data.essaySubmissions }); // ClassManager only
    return totals;
}
```

Check scope: **This class** (default) or **All my debate classes** (one sign-in, same as Briefing's multi-class sync).

---

## 7. UI — Tools → Debate Rec

### 7.1 Layout

```
┌ Context bar ─────────────────────────────────────────────────────────┐
│ Class [Purple M반 ▾]   Day 4 dates: [10/7 ✓] [10/21 ⚠2] [11/4 —]   All │
├ Summary strip ───────────────────────────────────────────────────────┤
│  Not recorded 2 · Needs confirmation 1 · Received 3 · Exempt 0 · Not checked 0 │
├ Toolbar ─────────────────────────────────────────────────────────────┤
│ [Check TMS attendance…] [This class ▾]  Last checked 10/24 09:12 · Saved │
├ Table ───────────────────────────────────────────────────────────────┤
│ ☐ │ Student   │ Day 4 date │ TMS        │ Recording           │ Note  │
│ ☐ │ 김민준     │ 10/21 (TMS)│ 결석 · 병결 │ ● Not recorded ▾ ↺  │       │
│ ☐ │ 이서연     │ 10/21 (TMS)│ 조퇴        │ ◐ Needs confirm. ▾  │       │
│ ☐ │ 박지호     │ 10/7  (syl)│ 결석        │ ✓ Received · Nathan 10/9 │  │
└──────────────────────────────────────────────────────────────────────┘
Batch: [Mark received] [Mark exempt] [Mark recorded]
```

- **Day 4 date chips** show `(TMS)` or `(syllabus)` for where the date came from.
- **Recording** dropdown options depend on current status:
  - `not_recorded` → Received / Exempt
  - `needs_confirmation` → Recorded / Not recorded
  - teacher-set → any; shows "by {name} {date}"
- **↺ Reset to TMS** shown on every teacher-set row.
- **All** chip = cross-date view of every open item for the class.
- Summary across classes: reuse the Essays class-summary report pattern (`classroom-essay-class-summary.js`) for a "Debate Rec — all classes" report.

### 7.2 New files

| File | Purpose |
|---|---|
| `js/classroom-debate-rec.js` | Tab module: `CCPClassroomDebateRec.initTab(hooks, options)`, render, events, TMS check, autosave |
| `tests/classroom-debate-rec.test.mjs` | Domain tests (§10) |
| `tests/debate-rec-tms-readonly.test.mjs` | Read-only contract test (§10.3) |

### 7.3 Module skeleton

```js
/**
 * Tools → Debate Rec.
 * Warns when a student was absent (TMS) on the Debate Day 4 assigned date.
 * READ-ONLY TOWARD TMS: uses CCPClassroomBriefing's existing scrape (GET + sign-in only).
 * All writes go to essaySubmissions via hooks.saveClassroom().
 */
(function (global) {
    'use strict';

    let hooks = null;
    let classId = '';
    let selectedDate = ''; // '' = All
    let attendanceByStudent = new Map();

    const domain = () => global.CCPClassroomDomain;
    const t = (k) => (hooks && hooks.t ? hooks.t(k) : k);

    async function initTab(nextHooks, options) {
        hooks = nextHooks;
        const opts = options || {};
        classId = opts.classId
            || (global.CCPClassroomZoneContext && global.CCPClassroomZoneContext.getActiveClassId
                ? global.CCPClassroomZoneContext.getActiveClassId() : '')
            || '';
        if (global.CCPClassroomBriefing) {
            attendanceByStudent = await global.CCPClassroomBriefing.getCachedAttendanceByStudent(classId);
        }
        bindOnce();
        render(opts.focusStudentId || '');
    }

    function render(focusStudentId) {
        const view = domain().computeDebateRecView(hooks.getAppData(), classId, attendanceByStudent);
        renderContextBar(view.days);
        renderSummary(view.counts);
        renderRows(view.rows.filter((r) => !selectedDate || r.day.date === selectedDate), focusStudentId);
    }

    async function onStatusChange(rowEl, nextStatus) {
        const res = domain().setDebateRecTeacherStatus(hooks.getAppData().essaySubmissions, {
            classId,
            syllabusRowId: rowEl.dataset.rowId,
            studentId: rowEl.dataset.studentId,
            date: rowEl.dataset.date,
            status: nextStatus,
            userId: hooks.getCurrentUserId()
        });
        if (!res.error) {
            await hooks.saveClassroom({ essaySubmissions: res.submissions });
            render();
        }
    }

    // renderContextBar, renderSummary, renderRows, bindOnce, runTmsCheck (§6.2) …

    global.CCPClassroomDebateRec = { initTab };
})(typeof window !== 'undefined' ? window : globalThis);
```

Follow `classroom-debate-books.js` for the context bar, batch row, autosave (`js/ui/classroom-autosave.js`) and read-only handling (`CCPClassroomAccess` — teachers can only edit classes they teach).

---

## 8. Wiring

### 8.1 `index.html` — segment button (after Debate Scores)

```html
<button type="button" class="app-zone-segment-btn" role="tab" aria-selected="false"
        data-segment="debate-rec" data-tab="debate-rec"
        data-i18n="classroomTabDebateRec">Debate Rec</button>
```

### 8.2 `index.html` — panel

```html
<section id="panel-debate-rec" class="app-tab-panel classroom-debate-rec-layout" data-tab="debate-rec"
         role="tabpanel" aria-labelledby="zoneBtn-tools" hidden>
    <div class="classroom-sheet-panel">
        <div id="classroomDebateRecContextBar" class="classroom-essays-context-bar"></div>
        <div id="classroomDebateRecStatsBar" class="classroom-essay-attention-strip" role="group"
             aria-label="Debate recording summary" data-i18n-aria-label="debateRecStatsLabel"></div>
        <div class="module-toolbar classroom-tab-toolbar">
            <div id="classroomDebateRecBatchActions" class="classroom-batch-row" hidden></div>
            <div class="toolbar-actions">
                <button type="button" id="classroomDebateRecCheckBtn" class="btn btn-outline btn-compact"
                        data-i18n="debateRecCheckTms">Check TMS attendance&hellip;</button>
                <span id="classroomDebateRecLastChecked" class="section-hint"></span>
                <span id="classroomDebateRecSaveStatus" class="classroom-save-status section-hint classroom-save-status--saved"
                      role="status" aria-live="polite" data-i18n="classroomSaveSaved">Saved</span>
            </div>
        </div>
        <div class="classroom-sheet-scroll" tabindex="0">
            <table class="classroom-sheet classroom-sheet--debate-rec">
                <thead>
                    <tr>
                        <th scope="col" class="classroom-sheet-col-select">
                            <input type="checkbox" id="classroomDebateRecSelectAll" aria-label="Select all"
                                   data-i18n-aria-label="classroomEssayBatchSelectAll" />
                        </th>
                        <th scope="col" class="classroom-sheet-col-student" data-i18n="classroomColStudent">Student</th>
                        <th scope="col" data-i18n="debateRecColDate">Day 4 date</th>
                        <th scope="col" data-i18n="debateRecColTms">TMS</th>
                        <th scope="col" class="classroom-sheet-col-status" data-i18n="debateRecColRecording">Recording</th>
                        <th scope="col" class="classroom-sheet-col-notes" data-i18n="classroomColNotes">Notes</th>
                    </tr>
                </thead>
                <tbody id="classroomDebateRecRows"></tbody>
            </table>
        </div>
    </div>
</section>
```

### 8.3 `app.js`

```js
// APP_SHARED_TAB_IDS (~line 14325): add after 'debate-scores'
'debate-rec',

// zone segment map, tools (~line 14374)
'debate-rec': 'debate-rec',

// tab → zone map (~line 14921)
'debate-rec': { zone: APP_ZONE_TOOLS, segment: 'debate-rec' },

// initClassroomTab (~line 22193)
} else if (tabId === 'debate-rec' && typeof CCPClassroomDebateRec !== 'undefined') {
    await CCPClassroomDebateRec.initTab(hooks, options);
```

Also add `'debate-rec'` alongside `'debate-books'` in the class-scoped tab checks (search `tab === 'debate-books'` / `tabId === 'debate-books'`, ~lines 16563, 38192, 38204, 41102).

### 8.4 `js/app-tab-scripts.js`

```js
'debate-rec': [
    'js/classroom-access.js?v=20260911-essay-groups',
    'js/classroom-student-row.js?v=20260723-tms-sync',
    'js/ui/classroom-autosave.js?v=20260807-deconflict-min',
    'js/tms-sync-client.js?v=20261024-debate-rec',
    'js/classroom-briefing.js?v=20261024-debate-rec',
    'js/classroom-debate-rec.js?v=20261024-debate-rec'
],
```

(Copy the exact current `?v=` strings for shared scripts from the `essays` / `briefing` entries; `npm run build` re-stamps them.)

### 8.5 Bell warning — `js/tab-warnings.js`

Shown to the class's assigned teachers **and** homeroom (담임) teachers of any cohort linked to the class (confirmed). Homeroom is resolved by `isHomeroomTeacherForClass(appData, classData, userId)` in the domain (class `homeroomTeacherUserId` or a linked cohort's `homeroomTeacherUserId`), because `classroom-access.js` is not loaded on every page.

```js
if (domainApi && typeof domainApi.countOpenDebateRecWarnings === 'function') {
    const data = typeof hooks.getAppData === 'function' ? hooks.getAppData() : null;
    const open = domainApi.countOpenDebateRecWarnings(data, classData.id);
    if (open.notRecorded || open.needsConfirmation) {
        out.push({
            id: `class:${classData.id}:debate_rec`,
            tabId: 'debate-rec',
            severity: open.notRecorded ? 'warn' : 'info',
            messageKey: 'tabWarnDebateRec',
            params: { name, notRecorded: open.notRecorded, needsConfirmation: open.needsConfirmation },
            navigate: { type: 'class', tabId: 'debate-rec', classId: classData.id }
        });
    }
}
```

### 8.6 Essays NV badge

No change in logic: the NV badge/attention tile already counts `debateVideoMissing`, which Debate Rec sets only for `not_recorded`. Add a tooltip line "From Debate Rec" when `debateRecSource === 'tms'`.

---

## 9. i18n

`js/i18n/calendar-en.js` / `calendar-ko.js`:

| Key | English | Korean |
|---|---|---|
| `classroomTabDebateRec` | Debate Rec | 토론 녹화 |
| `debateRecStatsLabel` | Debate recording summary | 토론 녹화 요약 |
| `debateRecCheckTms` | Check TMS attendance… | TMS 출결 확인… |
| `debateRecLastChecked` | Last checked {time} | 마지막 확인 {time} |
| `debateRecColDate` | Day 4 date | Day 4 날짜 |
| `debateRecColTms` | TMS | TMS |
| `debateRecColRecording` | Recording | 녹화 |
| `debateRecStatusNotRecorded` | Not recorded | 녹화 안 됨 |
| `debateRecStatusNeedsConfirmation` | Needs confirmation | 확인 필요 |
| `debateRecStatusRecorded` | Recorded | 녹화함 |
| `debateRecStatusReceived` | Received | 제출됨 |
| `debateRecStatusExempt` | Exempt | 면제 |
| `debateRecStatusNotChecked` | Not checked | 미확인 |
| `debateRecDateFromTms` | TMS | TMS |
| `debateRecDateFromSyllabus` | syllabus | 진도표 |
| `debateRecSetBy` | by {name} {date} | {name} · {date} |
| `debateRecResetToTms` | Reset to TMS | TMS 기준으로 되돌리기 |
| `debateRecCheckDone` | Checked {classes} classes: {flagged} not recorded, {confirm} need confirmation, {kept} teacher decisions kept. | {classes}개 반 확인: 녹화 안 됨 {flagged}명, 확인 필요 {confirm}명, 교사 결정 {kept}건 유지. |
| `tabWarnDebateRec` | {name}: {notRecorded} not recorded, {needsConfirmation} need confirmation (debate Day 4) | {name}: 토론 Day 4 녹화 안 됨 {notRecorded}명, 확인 필요 {needsConfirmation}명 |

After adding keys, run `node scripts/extract-i18n.mjs` to check nothing is missing (there is no npm script for it).

---

## 10. Tests

### 10.1 Domain — `tests/classroom-debate-rec.test.mjs`

| # | Case | Expect |
|---|---|---|
| 1 | Day 4 row (`sessionNumber: 4`, "Day 4 / Preview") in debate-monthly class | listed |
| 2 | Day 3 / Alt Day 3 / "Day 2 & 3 Combined" rows | not listed |
| 3 | Non-debate class with a "Day 4" title | not listed |
| 4 | `tmsEssayLinks` maps the row with a different `lessonDate` | uses TMS date, `dateSource: 'tms'` |
| 5 | No TMS link | uses syllabus date, `dateSource: 'syllabus'` |
| 6 | TMS 결석 on assigned date | `not_recorded`, source `tms`, `debateVideoMissing: true` |
| 7 | TMS 지각 / 조퇴 / 미참석 | `needs_confirmation`, NV false |
| 8 | 결석 + 지각 same date | `not_recorded` wins |
| 9 | Absence on a different date | no record |
| 10 | Student missing from TMS map | untouched, counted `noTmsData` |
| 11 | **Teacher set `received`; TMS still says 결석; re-run check 3×** | stays `received`, source `teacher` |
| 12 | **Teacher ticked NV on Essays; TMS shows present** | stays `not_recorded` (teacher) |
| 13 | TMS-sourced `not_recorded`, TMS later corrected to present | cleared, NV false |
| 14 | `resetDebateRecToTms` then re-run check | TMS status applies again |
| 15 | Legacy record `debateVideoMissing: true`, no `debateRecStatus` | normalizes to `not_recorded` / `teacher` |
| 16 | Archived / inactive student | excluded |
| 17 | Future Day 4 date | not checked, not counted |
| 18 | `normalizeEssayRecord` round-trip | all `debateRec*` fields preserved |

```js
import test from 'node:test';
import assert from 'node:assert/strict';
// New helper file to add: tests/helpers/debate-rec-fixtures.mjs (loads classroom-domain.js like
// tests/classroom-domain.test.mjs does, plus tiny builders for a debate class and appData).
import { loadDomain, makeDebateClass, makeAppData } from './helpers/debate-rec-fixtures.mjs';

const d = loadDomain();

test('teacher decision survives repeated TMS checks', () => {
    let data = makeAppData({ classes: [makeDebateClass({ id: 'c1', day4Date: '2026-10-21' })] });
    const tms = new Map([['stu1', [{ date: '2026-10-21', status: '결석', memo: '' }]]]);

    let r = d.applyDebateRecTmsCheck(data, 'c1', tms, { nowIso: '2026-10-22T00:00:00Z' });
    data.essaySubmissions = r.submissions;

    const rowId = d.listDebateRecordingDays(data, data.classes[0])[0].rowId;
    data.essaySubmissions = d.setDebateRecTeacherStatus(data.essaySubmissions, {
        classId: 'c1', syllabusRowId: rowId, studentId: 'stu1', status: 'received', userId: 'u1'
    }).submissions;

    for (let i = 0; i < 3; i += 1) {
        r = d.applyDebateRecTmsCheck(data, 'c1', tms);
        data.essaySubmissions = r.submissions;
    }
    const rec = d.getEssayRecordForStudent(
        d.findEssaySubmission(data.essaySubmissions, 'c1', rowId), 'stu1');
    assert.equal(rec.debateRecStatus, 'received');
    assert.equal(rec.debateRecSource, 'teacher');
    assert.equal(rec.debateVideoMissing, false);
    assert.equal(r.summary.skippedTeacher, 1);
});
```

### 10.2 UI smoke

Add `debate-rec` to the tab-routing contract tests (`tests/app-enums.test.mjs` / class-filter contracts) so the segment, panel and script list stay in sync.

### 10.3 Read-only toward TMS — `tests/debate-rec-tms-readonly.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Debate Rec module never calls TMS directly', () => {
    const src = readFileSync('js/classroom-debate-rec.js', 'utf8');
    // Only allowed TMS entry point is the existing Briefing scrape.
    assert.doesNotMatch(src, /CCPTmsSync\.run\(\s*['"](?!counsel['"])/);
    assert.doesNotMatch(src, /\/api\/tms\/(?!bridge\/counsel|counsel\/preview)/);
    assert.doesNotMatch(src, /fetch\(\s*['"`]https?:\/\//);
});

test('counsel scrape only issues GET (plus sign-in POST)', async () => {
    const calls = [];
    const counsel = await loadCounselCoreWithStubbedHttp((url, opts) => {
        calls.push({ url, method: (opts && opts.method) || 'GET' });
        return fixtureResponseFor(url);
    });
    await counsel.scrapeCounselProfiles(fakeCfg(), fakeStudents(), { tmsClassId: '123' });
    const nonGet = calls.filter((c) => c.method !== 'GET');
    assert.ok(nonGet.every((c) => /login/i.test(c.url)), 'only the sign-in form may POST');
});
```

---

## 11. Docs

- `SCHEMA.md` → add the `debateRec*` fields to `essaySubmissions[].records[]` and a note: *Debate Rec is read-only toward TMS; teacher-sourced status is never overwritten by sync.*
- `help/guide-content.json` → short "Debate Rec" entry (what the statuses mean, Check TMS attendance, how to resolve).
- `FOR TEACHERS.md` / `FOR TEACHERS-ko.md` → one paragraph each.

---

## 12. Decisions

1. **Reset to TMS** — yes, per-row action on teacher-set rows.
2. **Check freshness** — always scrape TMS fresh when "Check TMS attendance" runs (no cache reuse for the check).
3. **Bell warning audience** — the class's teachers **and** homeroom (담임) teachers of linked cohorts.

---

## 13. Build order

1. Domain: record fields + normalizer (§4.4), recording days + dates (§5.1), TMS classification + apply (§5.2–5.3), teacher/reset (§5.4), view/counts (§5.6).
2. Tests §10.1 and §10.3 — green before UI.
3. Briefing accessors (§6.1).
4. Debate Rec module + HTML panel + wiring (§7–8).
5. Essays NV toggle → teacher source (§5.5); NV tooltip (§8.6).
6. Bell warning (§8.5).
7. i18n (§9), docs (§11).
8. `npm test` (all tests: `npm run test:all`), then manual check with `npm start` + Sync Helper on the work PC:
   - Debate class with a known absent student on a past Day 4 → flagged.
   - Mark Received → re-run check → still Received.
   - Late student → Needs confirmation → mark Recorded.
9. Commit on a branch → PR → review → `npm run deploy`.

---

## 14. Files touched

| File | Change |
|---|---|
| `js/classroom-domain.js` | New Debate Rec functions; keep `debateRec*` fields in record normalize/merge paths; exports |
| `js/classroom-essays.js` | NV toggle sets teacher source; carry fields in record copies; NV tooltip |
| `js/classroom-briefing.js` | `getCachedAttendanceByStudent`, `getCacheSavedAt` exports |
| `js/classroom-debate-rec.js` | **New** tab module |
| `index.html` | Segment button + panel |
| `app.js` | Tab id, zone maps, init dispatch, class-scoped tab checks |
| `js/app-tab-scripts.js` | Script list for `debate-rec` |
| `js/tab-warnings.js` | `debate_rec` bell warning |
| `js/i18n/calendar-en.js`, `calendar-ko.js` | New keys |
| `styles.css` | `.classroom-sheet--debate-rec` column widths, status chips (reuse essay chip styles) |
| `tests/classroom-debate-rec.test.mjs` | **New** |
| `tests/debate-rec-tms-readonly.test.mjs` | **New** |
| `tests/helpers/debate-rec-fixtures.mjs` | **New** test builders |
| `SCHEMA.md`, `help/guide-content.json`, `FOR TEACHERS*.md` | Docs |

**Not touched:** `server/`, `worker/src/`, `shared/tms-*.cjs`, D1 schema. The server already passes essay record fields through and validates by class; no new TMS endpoint is added.

---

## 15. Implementation notes (differences from the plan)

- **TMS check entry point.** Briefing's `runSync()` reads credentials from its own sign-in fields, so Debate Rec does not call it directly. "Check TMS attendance…" opens the shared **TMS Sync window** (`CCPTmsSyncCenter.open({ kinds: ['counsel'], scope })`) with only attendance ticked. When the window closes, Debate Rec checks `CCPClassroomBriefing.getLastSyncAppliedAt()`; if no scrape ran after the button was pressed, nothing is checked or saved.
- **Class picker.** `debate-rec` was added to the shared Classroom class bar (`classroom-zone-context.js`), which also shows per-class NV / "?" pills while the tab is open.
- **Bell id.** The warning id includes the open counts (`class:<id>:debate_rec:<notRecorded>:<needsConfirmation>`) so a newly flagged student notifies again after a dismissal.
- **"Not checked".** Counted for past Day 4 dates where a student has no Debate Rec status and no attendance in this browser's Briefing cache.
- **Essays NV toggle** saves `debateRecStatus` `not_recorded` (on) or `received` (off) with source `teacher`.
- **New hook** `getUserDisplayName(userId)` on the classroom hooks (uses the existing teacher-name resolver) for the "Set by" line.
- **Tests.** `tests/classroom-debate-rec.test.mjs` (domain, including teacher-override and reset) and `tests/debate-rec-tms-readonly.test.mjs` (static + runtime read-only check with stubbed TMS HTTP, plus scrape → flag end to end). `tests/header-hierarchy.test.mjs` tab snapshot updated.
- **Reports ▾** (added after review, modeled on the Essays reports menu): *Print this class* (every flagged student per Day 4, resolved included, with a tick box and who decided), *All classes report…* (a window like the Essays summary: search, Month, Grade, Level, Homeroom, Classes mine/all/other, Show open-only/all flagged, only-classes-with-students, class checklist with Select all/Clear all, live preview, Print / PDF, Copy as text; filters saved with `setUiPref('debateRecReportFilters')`), *Copy open list* (plain text for KakaoTalk). Rows come from `listDebateRecReportGroups()`; rendering lives in `js/classroom-debate-rec-print.js` (`renderDocumentHtml`, `formatCopyText`, `PRINT_STYLES`). Printing opens a new window like Essays; a `hooks.openPrintDocument` override exists for embedding (used by the test bench).
- **Reports now match the Essays class summary.** *Class summary…* opens a window like Essays → Class summary: Homeroom teacher, Month, Classes (mine/all/other) and Show (all students / still needed / completed); classes listed A–Z with one checkbox per past Day 4 (one per month) and a "{complete}/{total} complete" hint; Select all / Clear all; preview; Copy; Print / PDF. The printout reuses `CCPClassroomEssayClassSummaryPrint.PRINT_STYLES` and its structure: homeroom heading (new page per homeroom) → class → Day 4 table (#, Student, status chip, TMS, Notes) with the **full roster**, so completed students show too (no TMS absence = "Recorded in class"; Received / Recorded / Exempt with who decided). Data: `listDebateRecReportEntries()`, `buildDebateRecClassSummary()`.
- **Parent message.** A *Message* button beside each Not recorded student copies a polite English text for parents (built by `CCPClassroomDebateRecPrint.buildParentMessage()`): first line "[Simson Academy] Debate recording not finished", then the teacher's name, the date and class of the missed Day 4 recording, a request to record at home and send a video before the next class, and a "Simson Academy" sign-off.

