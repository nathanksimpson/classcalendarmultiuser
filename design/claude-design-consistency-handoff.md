# ClassManager — Claude Design consistency-check handoff

**Purpose:** Copy-paste package for a **UI + workflow consistency audit** (not a full redesign).  
**Scope:** Whole app — shell, all 5 zones, shared components, main workflows.  
**Out of scope:** Syllabus A4 print/PDF (`Syllabus Style Guide.md`).

---

## How to paste into Claude Design (beginner steps)

Do these in order. Each step is one paste (or one file attach).

1. Open **`CLAUDE_DESIGN_STATUS.md`** (repo root) → select all → paste into Claude Design.  
   This is the live layout / IA ground truth (5 zones, Essays under Tools).
2. Open **`CLAUDE_DESIGN_BRIEF.md`** (repo root) → select all → paste next.  
   This is tokens, type, colors, and component rules.
3. Paste the entire **[Review prompt](#review-prompt)** section below (from the heading through the end of that section).
4. *(Optional but helpful)* Paste the **[Code snippet appendix](#code-snippet-appendix)** below so Claude Design sees real markup.
5. *(Optional)* Attach 2–4 screenshots from https://classmanager.live or local `npm start`:
   - Schedule → Calendar  
   - Classroom → Attendance  
   - Tools → Essays  
   - Class Setup → Cohorts  

**Do not paste `CLAUDE_DESIGN_SCENES.md` alone without the STATUS doc** — STATUS is the current nav map. After the SCENES IA refresh (Sep 2026), you may also paste SCENES for workflow detail.

---

## Repo pointers (if Claude Design can read files)

| File | Use |
|------|-----|
| `CLAUDE_DESIGN_STATUS.md` | Live shell, zones, panels, layout patterns |
| `CLAUDE_DESIGN_BRIEF.md` | Design system tokens and components |
| `CLAUDE_DESIGN_SCENES.md` | Personas, workflows, scene IDs, lock rules |
| `design/mockups/essays-redesign.html` | Essays two-stage status cell target |
| `design/mockups/README.md` | Mockup verification gate |
| `index.html` | Live shell + panel markup |
| `css/tokens.css` | Source of truth for CSS variables |

---

## Review prompt

Copy everything in this section into Claude Design after STATUS + BRIEF:

---

You are reviewing **ClassManager** for **UI and workflow consistency** — not inventing a new visual identity.

**Product:** Team calendar + curriculum app for teachers (EN + KO). Calm professional productivity tool. Teal primary `#14b98f`. IBM Plex Sans + Noto Sans KR. Long sessions in calendars and spreadsheet-like sheets.

**Live information architecture (ground truth — STATUS doc wins if anything conflicts):**

```
Schedule → Calendar · Events · Command Center (hidden) · Homework copy · Timetable
Class Setup → All classes · Cohorts · Teachers (hidden) · Books · Syllabi
Classroom → Briefing · Students · Attendance · Ledger · Homework · Points · Tests · Notes · Portfolio (hidden)
Tools → Essays · Debate Teams · Debate Scores · Books · Speaking Test
Data → Data  (internal id remains data-zone="more"; label = Data)
```

**Canonical feature homes (edit in one place; elsewhere should link):**

| Feature | Canonical home | Other surfaces |
|---------|----------------|----------------|
| Cohort board | Class Setup → Cohorts | Setup Hub removed |
| Weekly timetable | Schedule → Timetable | Cohorts links out (no embedded preview) |
| Homework copy text | Schedule → Homework copy | Command Center (hidden) links out |

**Known consistency risks to audit:**

1. Zone/segment wayfinding and **naming collisions** (“Homework copy” vs Classroom “Homework”; Class Setup “Books” vs Tools “Books”).
2. Shell chrome consistency: zone tabs, segment pills, term strip, lock/sync language (`#teamLockSyncBar` states: free / held / blocked / waiting / pending).
3. Classroom **sheet grammar**: one shared context bar (`#classroomZoneContextBar`), shared toolbar (`.module-toolbar.classroom-tab-toolbar`), shared row/cell pattern across Attendance → Notes.
4. **Tools vs Classroom boundary** — Essays/Debate/Speaking live under Tools; daily sheets stay in Classroom. Does the workflow still feel coherent for a classroom teacher?
5. Token/brand drift: teal-only primary actions; blue is print-tint only; 8px spacing grid; bilingual EN+KO must fit tabs/pills/headers.
6. Light **and** dark parity for shell + sheets.
7. Touch: ≥44px targets on ≤1024px; zone/segment rows scroll horizontally, never wrap.

**Return format (required):**

A structured audit table (or numbered list) with:

| Finding | Severity (High / Med / Low) | Where (zone/segment or component) | Why inconsistent | Suggested fix (design-level, keep teal system) |

Also include:

- A short **verdict** (1–3 sentences): overall consistency health.
- **Top 5 fixes** ranked by user-impact.
- Call out anything that is **intentionally different** (e.g. print buttons blue) and should stay.

Do **not** redesign the whole app. Do **not** change the Syllabus A4 print system. Prefer reuse of existing patterns over new components.

---

## Code snippet appendix

Representative live markup from `index.html` and tokens from `css/tokens.css` (September 2026). Use these as structure references, not as a full restyle target.

### A. Lock / sync bar

```html
<div id="teamLockSyncBar" class="team-lock-sync-bar" hidden>
  <div id="teamLockStatus" class="team-lock-status team-lock-status--compact team-lock-status--sync-bar">
    <div class="team-lock-control">
      <button type="button" id="teamLockStatusBtn" class="team-lock-status-btn team-lock-status-btn--skeuo" aria-live="polite">
        <!-- closed / open lock badges -->
      </button>
      <span id="teamLockChipLabel" class="team-lock-chip-label"></span>
      <button type="button" id="teamLockActionBtn" class="btn btn-primary btn-small team-lock-action-btn" hidden></button>
      <button type="button" id="teamLockDrawerToggle" class="btn btn-outline btn-small team-lock-drawer-toggle"
        aria-expanded="false" aria-controls="teamLockDetails">Details</button>
      <span id="teamLockPendingActions" class="team-lock-pending-actions" hidden>
        <button type="button" id="teamLockAllowBtn" class="btn btn-outline btn-small">Allow</button>
        <button type="button" id="teamLockDismissBtn" class="btn btn-outline btn-small">Dismiss</button>
      </span>
    </div>
    <div id="teamLockDetails" class="team-lock-details">
      <!-- editing / wants / viewing / remote-newer / expiry lines -->
    </div>
  </div>
  <span id="teamSyncSavedDot" class="team-sync-saved-indicator" hidden>
    <span class="team-sync-saved-indicator__dot" aria-hidden="true"></span>
    <span>All changes saved</span>
  </span>
</div>
```

### B. Zone tabs + segment pills (5 zones)

```html
<div class="app-zone-nav" id="appZoneNav" role="tablist" aria-label="Main sections">
  <button type="button" class="app-zone-btn is-active" data-zone="schedule">Schedule</button>
  <button type="button" class="app-zone-btn" data-zone="classes">Class Setup</button>
  <button type="button" class="app-zone-btn" data-zone="classroom">Classroom</button>
  <button type="button" class="app-zone-btn" data-zone="tools">Tools</button>
  <!-- Label "Data"; internal id remains more (label ≠ id) -->
  <button type="button" class="app-zone-btn app-zone-btn--more" data-zone="more">Data</button>
</div>

<nav class="app-zone-segment-nav" id="appZoneSegmentNav" role="tablist">
  <div id="zoneSegments-schedule" class="app-zone-segment-panel is-active" data-zone="schedule">
    <button class="app-zone-segment-btn is-active" data-segment="calendar" data-tab="calendar">Calendar</button>
    <button class="app-zone-segment-btn" data-segment="events" data-tab="events">Events</button>
    <button class="app-zone-segment-btn" data-segment="command-center" data-tab="command-center" hidden>Command Center</button>
    <button class="app-zone-segment-btn" data-segment="homework" data-tab="homework">Homework copy</button>
    <button class="app-zone-segment-btn" data-segment="timetable" data-tab="timetable">Timetable</button>
  </div>
  <div id="zoneSegments-classes" class="app-zone-segment-panel" data-zone="classes" hidden>
    <button class="app-zone-segment-btn is-active" data-segment="classes" data-tab="classes">All classes</button>
    <button class="app-zone-segment-btn" data-segment="cohorts" data-tab="cohorts">Cohorts</button>
    <button class="app-zone-segment-btn" data-segment="teachers" data-tab="teachers" hidden>Teachers</button>
    <button class="app-zone-segment-btn" data-segment="curriculum" data-tab="curriculum">Books</button>
    <button class="app-zone-segment-btn" data-segment="syllabus" data-tab="syllabus">Syllabi</button>
  </div>
  <div id="zoneSegments-classroom" class="app-zone-segment-panel" data-zone="classroom" hidden>
    <button class="app-zone-segment-btn" data-segment="briefing" data-tab="briefing">Briefing</button>
    <button class="app-zone-segment-btn is-active" data-segment="students" data-tab="students">Students</button>
    <button class="app-zone-segment-btn" data-segment="attendance" data-tab="attendance">Attendance</button>
    <button class="app-zone-segment-btn" data-segment="ledger" data-tab="ledger">Ledger</button>
    <button class="app-zone-segment-btn" data-segment="homework-tracking" data-tab="homework-tracking">Homework</button>
    <button class="app-zone-segment-btn" data-segment="points" data-tab="points">Points</button>
    <button class="app-zone-segment-btn" data-segment="tests" data-tab="tests">Tests</button>
    <button class="app-zone-segment-btn" data-segment="notes" data-tab="notes">Notes</button>
    <button class="app-zone-segment-btn" data-segment="portfolio" data-tab="portfolio" disabled hidden>Portfolio</button>
  </div>
  <div id="zoneSegments-tools" class="app-zone-segment-panel" data-zone="tools" hidden>
    <button class="app-zone-segment-btn is-active" data-segment="essays" data-tab="essays">Essays</button>
    <button class="app-zone-segment-btn" data-segment="debate-teams" data-tab="debate-teams">Debate Teams</button>
    <button class="app-zone-segment-btn" data-segment="debate-scores" data-tab="debate-scores">Debate Scores</button>
    <button class="app-zone-segment-btn" data-segment="debate-books" data-tab="debate-books">Books</button>
    <button class="app-zone-segment-btn" data-segment="speaking-test" data-tab="speaking-test">Speaking Test</button>
  </div>
</nav>
<!-- Data zone has no segment panel; opens #panel-data directly -->
```

### C. Classroom shared context + attendance sheet shell

```html
<div id="classroomZoneContextBar" class="classroom-zone-context-bar" hidden></div>

<section id="panel-attendance" class="app-tab-panel" data-tab="attendance" role="tabpanel" hidden>
  <div id="classroomAttendanceHeader"></div>
  <div class="classroom-sheet-panel">
    <div class="module-toolbar classroom-tab-toolbar">
      <button type="button" class="btn btn-outline btn-compact">Mark all present</button>
      <div class="toolbar-actions">
        <span class="classroom-save-status section-hint" role="status">Saved</span>
        <button type="button" class="btn btn-outline btn-compact">Save now</button>
      </div>
    </div>
    <div class="classroom-sheet-scroll" tabindex="0">
      <table class="classroom-sheet classroom-sheet--attendance">
        <thead>
          <tr>
            <th scope="col" class="classroom-sheet-col-student">Student</th>
            <th scope="col" class="classroom-sheet-col-attendance">Attendance</th>
            <th scope="col" class="classroom-sheet-col-notes">Notes</th>
          </tr>
        </thead>
        <tbody id="classroomAttendanceRows"></tbody>
      </table>
    </div>
  </div>
</section>
```

**Pattern to reuse across Classroom sheets:**  
`.classroom-sheet-panel` > `.module-toolbar.classroom-tab-toolbar` + `.toolbar-actions` > `.classroom-sheet-scroll` > `.classroom-sheet` (+ variant).

### D. Design tokens (excerpt from `css/tokens.css`)

```css
:root {
  --primary: #14b98f;
  --primary-dark: #0e9b76;
  --accent: #14b98f;
  --accent-muted: #eaf6f1;
  --brand-accent: #14b98f;
  --brand-accent-dark: #06241c;

  --bg-main: #f4f6f9;
  --bg-card: #ffffff;
  --bg-hover: #eef1f5;
  --text-primary: #1c2430;
  --text-secondary: #5a6a80;
  --text-muted: #8893a3;
  --border-color: #e3e8ef;

  --danger: #dc2626;
  --success: #16a34a;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-card: 10px;
  --touch-min: 44px;

  --shell-zone-track-bg: #eef1f5;
  --shell-zone-active-top: #14b98f;
  --shell-segment-active-bg: linear-gradient(180deg, #22d6a8, #12a37f);

  --font-main: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
  --z-modal: 1100;
}
```

---

## After Claude Design replies

1. Keep the audit findings (table + top 5).
2. Turn High/Med items into small Cursor tasks using Design-Rules redline shape (one component per task).
3. Do not restyle adjacent chrome “while you’re in there.”

*Generated for Claude Design consistency check — September 2026.*
