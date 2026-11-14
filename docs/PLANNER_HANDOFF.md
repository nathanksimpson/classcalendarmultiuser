# Schedule planner — handoff for Cursor

You are continuing work on the **Schedule planner** in ClassManager (repo `nathanksimpson/classcalendarmultiuser`, live at classmanager.live). Read this whole file before changing planner code. It explains what was built, why, and the order of priorities to follow when a change seems to conflict with something here.

Also follow `AGENTS.md`, `DEVELOPER.md` and `UI_STYLE_GUIDE.md`. The rules from those that matter most here:

- **Pushing to `main` deploys to production** (Cloudflare Workers Builds). Confirm with Nathan before merging anything big.
- API behaviour lives in **both** `worker/src/` and `server/`. The planner itself is client-only and needs no API change.
- Saves go through the live-sync diff (`saveData()` → `js/sync-diff.js`). Never send the whole calendar for normal edits.
- Files are UTF-8 without BOM. Every user-facing string has a key in **both** `js/i18n/calendar-en.js` and `calendar-ko.js`.
- Committed fixtures and sample data **never contain real student or teacher names** (pattern: 김테가 / Stuaa).
- CSS goes in root `styles.css` only.

---

## 1. Reasoning hierarchy (apply in this order)

1. **Nathan's explicit rules** (section 3) beat everything below, including "good practice" from scheduling literature.
2. **Never lose or silently change the user's data.** Nothing is written to the calendar until **Apply to calendar**, and cohort time blocks change only after **Save to cohorts**; both ask for confirmation first. Every board change is one Undo step. Auto-schedule never moves locked classes, and moves hand-placed ones only after the user says yes.
3. **Freeform first.** The board lets the user do almost anything. A short list of things is refused (section 3, tier 1); everything else is a warning the user can see and fix.
4. **Explain, don't block.** Every warning or refusal says why in plain words: on the dragged tile, on the tile itself, and in the To fix list, which jumps to the spot.
5. **Simple, predictable code** over clever code: rules in one place (core), algorithm in one place (auto), DOM in one place (ui).

## 2. Files

| File | Global | What it holds |
|---|---|---|
| `js/planner/teacher-planner-core.js` | `CCPTeacherPlanner` | **All rules and data operations. No DOM.** Demands (one per class), drafts, placement checks, issues, apply-to-calendar, cohort blocks, teacher limits, rooms. |
| `js/planner/teacher-planner-auto.js` | `CCPPlannerAuto` | Auto-schedule, previous-term analysis, plan options, clash fixing. No DOM. |
| `js/planner/teacher-planner-ui.js` | `CCPTeacherPlannerUi` | **DOM only**: board, tray, To fix list, drag engine, Setup, dialogs, print. |
| `js/planner/teacher-planner-page.js` | | Page bootstrap: loads the calendar, sync, read-only state. |
| `planner.html` | | Page shell: Schedule sub-tab row, top bar, dialogs (`spSetup`, `spAuto`, `spFix`, `spConfirm`), print area. |
| `js/schedule-matrix-data.js` | `CCPScheduleMatrixData` | Subjects per level and MWF/TT (Red–Mirinae). **No middle school yet.** |
| `js/level-profile.js` | `CCPLevelProfile` | Levels; `defaultScheduleBlockForLevel`, `schedulingGroupForLevel`. |
| `tests/teacher-planner-core.test.mjs`, `tests/planner-auto.test.mjs` | | Rule and algorithm tests (plain Node). |
| `scripts/make-sample-calendars.mjs` | | Rebuilds the two sample calendars in `Example Calendars/`. |

Entry points: Schedule → **Planner** sub-tab, Data → Class scheduler, avatar menu. All open `/planner.html`.

## 3. Rules (Nathan's decisions)

### Rule tiers

| Tier | By hand on the board | Auto-schedule and Suggest fixes |
|---|---|---|
| **1. Refused** | Teacher, cohort or room double-booked. Room with fewer seats than the class. | Never |
| **2. Confirm first** | A class on a day its cohort doesn't come (MWF cohorts never on Tue/Thu and the other way round). Allowed after "Place anyway", then shown as a warning. | Never |
| **3. Warning** | Teacher times off; before clock-in or after clock-out; outside the hours students are at school; teacher limits (native/Korean type, "own type only", levels, class types); over daily or weekly max; more than **4 in a row** (setting `plannerState.maxConsecutive`); two periods on one day; no room | Never broken |

Where this lives in code:
- Tier 1 is `FORBIDDEN` plus the room-size check in `checkSlot`, `setMeetingRoom` and `setClassTeacher`.
- Tier 2 is `outside_cohort_days` in `FORBIDDEN`, lifted by `target.allowOffDay`; the UI asks first through `evaluateDrop` → `confirm`.
- Tier 3 reasons come from `isValidPlacement`/`checkSlot` (`softReasons`), and the matching issues are built in `recomputeDraftMetrics`.
- Auto-schedule enforces tier 3 in `teacherCanTake` and `chooseSlots`.

A rule change usually touches four places: the check, the issue, the text (`reasonText`/`issueText` with en+ko keys) and a test.

### Other decisions
- **Combined classes (합반):** one class can belong to several cohorts. Its size is every student of all its cohorts, counted once (`classSizeOf`). It needs a time free for all of them, a day all of them come (`classAllowedDays`; no common day means it can't be placed automatically), and a room that seats the total.
- **Student hours,** in priority order:
  1. the planner's unsaved copy (`plannerState.cohortBlocks`);
  2. `cohort.blockStart`/`blockEnd`;
  3. `tmsBlockStart`/`tmsBlockEnd`;
  4. a cohort on the secondary block → senior periods;
  5. level defaults: junior periods 1–3 on Mon/Wed/Fri and 1–4 on Tue/Thu (elementary runs to 18:00 on Tue/Thu); senior periods 4–7 from 17:00. Middle uses senior hours.

  The function is `outsideStudentHours(appData, demand, period, dow)`. Always pass `dow`.
- **Schedule blocks:** Red–Navy use primary; Purple and above, and all middle and pre-middle, use secondary. **Pre-middle counts as middle** for scheduling. Existing Purple cohorts were left as they were (one-time retcon, marker `cohort.blockDefaultV`).
- **Teachers:** within a term (after `termStart`), changing a teacher in Suggest fixes needs an explicit tick. Before the term starts it's offered with a warning. Auto-schedule never changes a teacher already on a class.
- **Clash fixing:** a locked class stays put; otherwise the class moved most recently stays (`meeting.movedAt`). The others move. Same teacher first.
- **TMS is read-only, always.** Nothing in ClassManager writes to TMS.

## 4. Data model

The planner's draft is stored on the calendar (`plannerDrafts`, `plannerState`) and is separate from the classes until Apply.

```
demand      one per class (buildDemandsFromAppData): demandId 'demand:<classId>', cohortIds,
            band (junior|middle|senior), teacherRequirementType (korean|native|either),
            weeklyFrequency, includedInDraft
assignment  one per demand in draft.assignments: teacherProfileId|null, roomId (class default),
            locked, auto (why auto-schedule picked the teacher), meetings[]
meeting     { meetingId, dow 1-5, period '1'..'8', roomId? ('' = no room, overrides the default),
            movedAt }
```

- Meetings are per period; a class can have different periods on different days.
- **Apply** writes `meetingDays`, `period`/`periodByWeekday`, `classTeachers` (the planner owns the first teacher row), `roomId`, and `roomIdByWeekday` when rooms differ by day. Reopening the planner reads them back; keep that round trip working (there's a test).
- `teacherProfiles[]` hold limits (`maxPeriodsPerWeek` default 22, `maxPeriodsPerDay`, `juniorAllowed`/`middleAllowed`/`seniorAllowed`, `ownTypeOnly`, `onlyClassTypeIds`), availability (`workStart` / `workEnd` = clock-in / clock-out, `unavailableSlots`), `color` and `userId`.
- `plannerState` holds `cohortBlocks`, `maxConsecutive`, `previousCalendarId`, `blockouts` and `teacherBoard.panelOrder`.
- `SCHEMA.md` documents all fields. **Update it when you add one.**

## 5. Auto-schedule (teacher-planner-auto.js)

The approach is a greedy pass with scoring, then local repair. That's the right size for one academy: a few dozen classes, instant in the browser, and the same answer every time. A constraint solver would be the next step only if real data leaves classes unplaced that a person can place by hand.

1. **Previous term** (`analysePreviousTerm`): students are matched across terms by TMS id (`tmsMpidx`), or by a name that is unique in the term. For each class it records which last-term teachers taught how many of its students, same subject first.
2. **Order:** the hardest classes go first: already has a teacher, more cohorts, fewer possible teachers, strongest tie to a teacher.
3. **For each class,** every allowed teacher is tried and slots are chosen with `chooseSlots`, scored for:
   - continuity with last term;
   - teacher day shape: no one-period holes, no long waits, at most `maxConsecutive` in a row;
   - students' day: contiguous periods;
   - spreading the class over different days;
   - a free room that seats the class;
   - teacher preferences;
   - workload balance.
4. **Repair:** a left-over period may push aside periods placed **in the same run only**, re-homing them; the push is undone if they can't all be re-homed.
5. **Rooms:** the smallest free room that seats the class. Never a too-small or busy room.
6. **`buildOptions`** runs three priorities (continuity, breaks, balance), drops duplicate plans and returns stats for the plan cards.
7. **`resolveClashes` / `clashOptions`** produce the "Suggest fixes" choices.

## 6. UI principles

- **Controls by scope, pinned at the top:** the sheet (Teachers / Cohorts / Rooms), the day or week and the level filter decide what is shown, so they sit first in the sticky top bar. Actions come after them.
- **Drag for everything:** tray → board places, tile → cell moves, tile → tile swaps, tile → tray removes.
  - It uses pointer events, so it works with touch (press briefly to start).
  - The held item floats under the pointer, and target cells show OK, warning or refused, with a hint.
  - Holding over a day or name switches to it.
  - **Reorderable lists use drag only, never up/down arrows,** and the other rows animate out of the way.
- **The model is rebuilt each render:** `render()` rebuilds from `buildModel()`. Every change goes through `mutate(fn)`, which handles read-only, undo snapshot, `saveData` and re-render. Don't change `appData` from the UI without it, except Setup edits through `setupEdit`.
- **Colour:**
  - the Teachers sheet uses cohort colours;
  - the per-day Cohorts and Rooms sheets (and the printed room schedule) use **teacher colours**, with a legend;
  - clashes are red, warnings amber and dashed.
- **Cohorts sheet by day:**
  - only the cohorts that come that day;
  - student count under each cohort name;
  - a room row (picker) under each period;
  - combined classes show "N students (combined)".
- **Theme:** use app tokens (`--bg-card`, `--text-primary`, …) and the planner's `--sp-*` tokens (light and dark values in `styles.css`). No hard-coded colours on screen. Print is always dark on white.
- **Print** (Print menu): teacher timetables, the room schedule (one page per day: cohort columns, 반명 and 인원 rows, a 강의실 row under each period), cohort timetables and room timetables.
  - `print()` is called directly from the tap; iPad Safari can drop a delayed one.
  - The print area stays in place afterwards, because on iPad `print()` returns before the page is captured.
  - Wide sheets get smaller type (`data-density`).
- **Words:** short, plain, specific to this academy. For example, "The cohort does not come on this day", not "constraint violated". The CSS prefix is `sp-`; i18n keys are `sp…`.

## 7. Testing

- **Tests:** `node tests/teacher-planner-core.test.mjs`, `node tests/planner-auto.test.mjs`, plus `i18n-parity`, `js-syntax`, `encoding` and `header-hierarchy`. Run the full suite with `node scripts/run-all-tests.mjs`. Seven files need `better-sqlite3`; they fail where it can't be installed, and pass in GitHub CI.
- **New rules need a test,** both "refused/warned by hand" and "never broken by auto".
- **Samples:**
  - `Example Calendars/Sample-Fall-2026-scheduled.json` is fully scheduled: 17 cohorts, 130 students, 4 Korean teachers and 1 native teacher (native classes only), at most 22 periods each, two combined classes.
  - `Sample-Winter-2027-to-schedule.json` is the levelled-up next term with nothing placed.
  - Import each in Data → Import calendar → new calendar.
  - `node scripts/make-sample-calendars.mjs` rebuilds both. It fails loudly if Fall can't be fully placed.
- **UI check without a server:** a small HTML page that loads the planner scripts, sets `window.appData` from a sample file and stubs `CalendarSync`, then drive it with Playwright (`executablePath: '/usr/bin/google-chrome'`). Check drag results, the To fix list, the dark theme and the print media.

## 8. Known gaps and next steps

- **TMS sync for the planner:** class info lines already include subjects and every subject's teacher (`최테카[담임](파닉스),…`). The roster scraper currently keeps only the times and the homeroom name. It is read-only, and it only sees what the logged-in account sees.
- **Generating classes for a cohort:** the cohort editor's "Generate subjects" uses the matrix, but it works one cohort at a time, sets no teacher type, and has **no middle-school data**. Nathan will provide that.
- **Planner-only teachers:** the Timetable lists teachers by account (`userId`), so teachers with no account don't show there.
- **Later:** a final swap pass to improve breaks; per-weekday clock-in/out; Durable Objects for live sync.
