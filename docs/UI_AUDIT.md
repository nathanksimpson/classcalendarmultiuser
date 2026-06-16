# UI Audit — React-Style Best Practices (June 2026)

Full audit for Class Calendar Multi User. Reference: [UI_STYLE_GUIDE.md](../UI_STYLE_GUIDE.md).

---

## 1. Surface inventory

| Surface | State owner | Render / refresh | A11y status |
|---------|-------------|------------------|-------------|
| Zone nav + segments | `appData.ui.activeZone`, `activeTab` | `navigateToZone`, `navigateToTab` | Good — `role="tablist"`, `aria-selected` in `index.html` |
| Lock / sync banners | `CalendarSync` + DOM | `updateTeamLockUi`, `refreshTeamLockDebugPanel` | Good — `aria-live`, drawer `aria-expanded` |
| Notice rail | ephemeral | `CCPNotice.show` / `showSyncToast` | Good — `aria-live` polite/assertive |
| Calendar month/agenda | `appData` classes/events + `appData.ui` filters | `renderCalendarNow` → orchestrator `calendar` | Partial — dynamic tiles lack live regions |
| Lesson filter popover | `appData.ui.lessonFilters` | `renderLessonFilterPopoverBody` | Good — `aria-expanded` on trigger |
| Class editor (movable form) | `appData.classes[]` | `populateClassForm`, `mountClassForm` | Good — modal focus trap via `CCPModal` |
| Event editor | `appData.events[]` | `populateHolidayForm`, `mountHolidayForm` | Good |
| Class list | `appData.classes[]` + selection | `CCPClassListView.render` / orchestrator `classList` | Improved — keyed rows + delegation |
| Event list | `appData.events[]` | `CCPEventListView.render` / orchestrator `eventList` | Improved — keyed rows + delegation |
| Setup board | `appData.cohorts` etc. | `CCPSetupBoard.renderBoard` / orchestrator `cohorts` | Good on tablet+; hidden on phone |
| Cohorts / teachers | module state + `appData` | `cohort-management.js`, `teacher-management.js` | Partial — some modals use admin a11y |
| Classroom tabs | lazy `js/classroom-*.js` | per-tab render in modules | Partial — touch targets OK; empty states vary |
| Syllabus tab | `appData.classes[].syllabusRows` | `renderAllSyllabusTables`, orchestrator `syllabus` | Partial — large tables, no row announcements |
| Homework tab | `appData.ui.homeworkTabClassId` | `renderHomeworkEditor`, orchestrator `homework` | OK |
| Timetable | `appData` + UI selectors | `renderTimetableView`, orchestrator `timetable` | OK |
| Class notes | `appData.dayNotes` | `renderClassNotesTab`, orchestrator `classNotes` | OK |
| Print modals | `appData.ui` print prefs | modal open + form mount | Good — scrollable `.modal-body` |
| Login / pending | server session | static + `login.html` JS | OK |
| Admin | `admin.js` | `admin.js` render fns | Partial — uses `CCPModal.bindA11y` after consolidation |
| Notes app | `notes.html` + `js/notes.js` | `js/notes.js` | OK — mobile-first |
| Help | `help.html` | `help-page.js` | OK — separate CSS |

---

## 2. Architecture audit

### State → dispatch coverage

| Action type | Dispatched? | Notes |
|-------------|-------------|-------|
| `ui/set`, `ui/merge` | Yes | `dispatchUiSet`, `dispatchUiMerge` |
| `classes/upsert`, `classes/remove` | Yes | `dispatchClassesUpsert`, `dispatchClassesRemove` |
| `events/upsert`, `events/remove` | Yes | `dispatchEventsUpsert`, `dispatchEventsRemove` |
| `dayNotes/mutate` | Yes | silent meta for typing |
| `calendar/replace`, `sync/remote` | Yes | load / remote sync |
| Direct `appData.classes[i] =` | Remaining in curriculum push, schedule confirm | Low-frequency; document for Phase 2 |
| Direct `appData.ui` writes | Fallback when store missing | Dev-only edge case |

### Manual `renderX()` calls to eliminate (when orchestrator active)

After `classes/*` or `events/*` dispatch, remove duplicate `renderClassList()` / `renderEventList()` / `requestUiCalendarRender()` where orchestrator already schedules the same views.

Retain explicit renders for: active-tab-only surfaces (syllabus editor table, homework editor body), form field refresh (`renderScheduleAdjustmentRows`), and search-input handlers (filter lists locally).

### Render strategy by surface

| Surface | Strategy | Listener binding |
|---------|----------|------------------|
| Class/event lists | Keyed diff by `data-id` | Delegation on `#classList`, `#eventList` |
| Calendar agenda | Partial (remove old list only) | Per-tile listeners on rebuild |
| Calendar month | Full rebuild | Per-cell listeners |
| Filter popovers | Full `innerHTML` | Per-checkbox on rebuild |
| Setup board | `createElement` tree | Mixed |

### Duplicate code (addressed in this refactor)

- Modal a11y → `js/ui/modal.js` (`CCPModal`)
- `escapeHtml` → `CCPUtils.escapeHtml` (audit list in §5)
- List render → `js/views/class-list-view.js`, `event-list-view.js`

---

## 3. UX / a11y test matrix

Test at http://localhost:8080 after `npm start`. Mark: Pass / Gap / N/A.

| Flow | Phone ≤640 | Tablet 901–1024 | Desktop | Light | Dark | Findings |
|------|------------|-----------------|---------|-------|------|----------|
| Zone navigation | Pass | Pass | Pass | Pass | Pass | Segments hide correctly on phone |
| Calendar agenda default | Pass | Pass | N/A | Pass | Pass | Month hidden on phone |
| Class list selection | Pass | Pass | Pass | Pass | Pass | Keyed update preserves focus better |
| Event list selection | Pass | Pass | Pass | Pass | Pass | Same |
| Calendar popout edit | Pass | Gap | Pass | Pass | Pass | Phone: small popout scroll |
| Setup board | N/A | Pass | Pass | Pass | Pass | Hidden on phone by design |
| Filters popover | Gap | Pass | Pass | Pass | Pass | Phone: popover width tight |
| Print modal | Gap | Pass | Pass | Pass | Pass | Phone: use landscape or desktop |
| Team lock banner | Pass | Pass | Pass | Pass | Pass | Clear copy |
| Keyboard Escape modals | Pass | Pass | Pass | Pass | Pass | Via `CCPModal` |
| Icon-only bell | Pass | Pass | Pass | Pass | Pass | `title` + `aria-haspopup` |

**Gaps to track (not blocking):**

1. Dynamic calendar edits — no `aria-live` on grid (acceptable; use toast for save feedback).
2. Syllabus table — large DOM; consider virtual scroll later.
3. Some classroom sub-tabs — empty state copy only in English until i18n pass.

---

## 4. Visual consistency audit

### Token usage

`:root` tokens in `styles.css` lines 8–185 are the source of truth. Feature CSS should use `var(--*)` only.

### Violations found (top offenders)

| Location | Issue | Severity |
|----------|-------|----------|
| `renderClassList` / `renderEventList` empty state | Inline `padding: 12px` | Low — use `var(--space-3)` |
| `header-controls` gap `12px` | Hard-coded | Low — use `var(--space-3)` |
| `.visibility-chip` in calendar bar | Legacy (allowed) | Info |
| New setup UI | Uses `.selection-chip` correctly | Pass |

### Breakpoint alignment

CSS uses `--bp-sm` (640), `--bp-lg` (900), `--bp-tablet` (1024). JS uses `VIEWPORT_BP_PHONE` (640), `isViewportTabletOrBelow()` (1024). `data-viewport` set on `<html>` — aligned.

### Chip / button classes

New setup tabs use `.selection-chip`. Calendar visibility bar retains `.visibility-chip` per style guide exception.

---

## 5. innerHTML / escapeHtml audit (Phase F)

All dynamic user text should pass through `CCPUtils.escapeHtml` before `innerHTML`.

| File | innerHTML uses | Escaped? |
|------|----------------|----------|
| `app.js` | ~100 | Majority escaped; badge HTML uses trusted template helpers |
| `cohort-management.js` | ~36 | Escaped |
| `admin.js` | ~14 | Escaped |
| `setup-board.js` | ~4 | Escaped |
| `class-notes-panel.js` | ~2 | Escaped |

**Rule:** Use `CCPDom.html` tagged template for new code; grep `innerHTML` in PR review.

---

## 6. Implementation status

| Phase | Status | Artifacts |
|-------|--------|-----------|
| Audit (this doc) | Done | `docs/UI_AUDIT.md` |
| A — Store pipeline | Done | dispatch helpers, extended orchestrator |
| D — Modal primitive | Done | `js/ui/modal.js` |
| B — View modules | Done | `js/views/class-list-view.js`, `event-list-view.js` |
| C — DOM + delegation | Done | `js/dom.js`, list delegation |
| E — CSS split | Done | `css/*.css`, build concat |
| F — Tests | Done | `tests/app-store.test.mjs`, `tests/dom.test.mjs` |

---

## 7. Manual pre-deploy checklist

- [ ] `npm test` passes
- [ ] `npm start` — class save updates list without focus jump
- [ ] `npm start` — event save updates list
- [ ] Light + dark theme on calendar + modals
- [ ] Phone width: agenda view, no setup board
- [ ] Team lock: read-only message when blocked
- [ ] `npm run build` then smoke test `dist/` if deploying
