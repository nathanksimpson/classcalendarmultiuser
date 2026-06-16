# UI Style Guide

How on-screen UI is built in Class Calendar Multi User. **Read this before planning or implementing UI changes.**

For broader dev workflow (deploy, API, locks), see [DEVELOPER.md](DEVELOPER.md). For **syllabus A4 print/PDF layout only**, see [Syllabus Style Guide.md](Syllabus%20Style%20Guide.md) — that guide does **not** apply to the on-screen syllabus editor or general app chrome.

---

## When to use this guide

| Task | Guide |
|------|--------|
| Buttons, forms, modals, tabs, toolbars, setup board, calendar chrome | **This file** |
| Syllabus 진도표 print/PDF (two-table jindo layout, A4 fit) | [Syllabus Style Guide.md](Syllabus%20Style%20Guide.md) |
| API, sync, locks, deploy | [DEVELOPER.md](DEVELOPER.md) / [AGENTS.md](AGENTS.md) |

---

## Design foundation

Tokens live in [`styles.css`](styles.css) `:root` (Simple Design System + 8px grid). **Always use tokens** — do not hard-code hex colors, pixel spacing, or font sizes in new feature CSS.

### Colors

| Token | Role |
|-------|------|
| `--primary`, `--primary-dark` | Primary actions, links, accents |
| `--secondary` | Secondary buttons |
| `--danger`, `--success` | Destructive / positive actions |
| `--text-primary`, `--text-secondary`, `--text-muted` | Body and label text |
| `--bg-main`, `--bg-card`, `--bg-hover`, `--input-bg` | Surfaces |
| `--border-color` | Default borders |
| `--accent`, `--accent-muted` | Selected chips, highlights |

Semantic status/banner tokens: `--status-success-*`, `--status-error-*`, `--banner-warn-*`, `--banner-error-*`, `--banner-info-*`, `--lock-status-*`.

### Spacing (8px grid)

| Token | Value |
|-------|-------|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 24px |
| `--space-6` | 32px |
| `--space-7` | 48px |

Padding aliases: `--pad-control-y`, `--pad-control-x`, `--pad-surface`, `--pad-overlay`, `--pad-popover`, `--pad-popover-body`.

Z-index aliases: `--z-context-menu`, `--z-popover`, `--z-tab-warnings`, `--z-modal`, `--z-header-popover`.

Layout: `--app-gutter`, `--split-sidebar-min` / `--split-sidebar-max`, `--editor-prose-max`.

### Typography

| Token | Typical use |
|-------|-------------|
| `--text-h1` … `--text-h6` | Page and section headings |
| `--text-body-xl` … `--text-body-xs` | UI copy |
| `--leading-heading`, `--leading-body` | Line height |

Font: `--font-main` (Inter + Korean fallbacks on `body`). Monospace: `--font-mono`.

### Radii and shadows

`--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (16px), `--radius-full`.

`--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-dialog`.

### Breakpoints

Use these in `@media` — **not** ad-hoc pixel values:

| Token | Value |
|-------|-------|
| `--bp-sm` | 640px |
| `--bp-md` | 768px |
| `--bp-lg` | 900px |
| `--bp-tablet` | 1024px |
| `--bp-xl` | 1100px |

**CSS and JS must agree:**

| Tier | Width | `html[data-viewport]` | JS helper |
|------|-------|----------------------|-----------|
| Phone | ≤640px | `phone` | `isViewportPhone()` / `VIEWPORT_BP_PHONE` |
| Small tablet | 641–900px | `tablet-sm` | `matchMedia('(max-width: 900px)')` |
| Tablet | 901–1024px | `tablet` | `isViewportTabletOrBelow()` |
| Desktop | >1024px | (unset) | default |

Touch targets: `--touch-min` (44px) on primary controls at `max-width: var(--bp-md)`.

---

## Component cookbook

### Buttons

Base: `.btn`. Variants: `.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-danger`.

Sizes: `.btn-sm` / `.btn-small`, `.btn-compact`, `.btn-lg`.

Header-specific (tinted): `.btn-header-print`, `.btn-header-lang`, `.btn-header-theme`, `.btn-help`, `.btn-lang`.

```html
<button type="button" class="btn btn-primary">Save</button>
<button type="button" class="btn btn-outline btn-sm">Cancel</button>
```

### Text inputs and selects

Outside `.form-group`: `.field-input`, `.field-select`, or `.field-control`.

Toolbar/catalog (compact): add `.field-control--compact`.

Inside forms: wrap label + control in `.form-group`; inputs inherit styles automatically.

### Forms and sections

| Class | Use |
|-------|-----|
| `.form-group` | Label + one control |
| `.form-row` | Two-column grid |
| `.form-section-title` | Section heading (`<h3>`) |
| `.section-hint` | Muted helper text below a section |
| `.form-group--full-only` | Hidden in calendar popout (`data-editor-mode="popout"`) |

### Selection chips (checkbox tiles)

Prefer `.checkbox-label.selection-chip` for bordered checkbox tiles (Teachers/Cohorts catalogs, filter rows).

Legacy `.visibility-chip` still works on the calendar visibility bar — use `.selection-chip` in **new** setup-tab UI.

Dense calendar lesson filters only: plain `.lesson-filter-chip` (intentionally borderless).

```html
<label class="checkbox-label selection-chip">
  <input type="checkbox" name="grade" value="3" />
  Grade 3
</label>
```

### Modals

Structure: `.modal` → `.modal-content` → `.modal-header` + `.modal-body`.

Variants: `.modal-small`, `.modal-wide`, `.modal-content--scrollable`.

Direct children after `.modal-header` (when `.modal-body` is omitted) receive horizontal padding via shared rules in `styles.css`. Prefer wrapping content in `.modal-body` for new modals. Nested `form` inside `.modal-body` should not add extra padding (`.modal-body > form { padding: 0 }`).

Print modals: wrap forms in `.print-form-mount` inside `.modal-body-scroll`.

Register open/close/focus via `CCPModalRegistry` in `app.js`. Admin modals: `bindAdminModalA11y` in `js/admin.js`.

Z-index: `--z-modal` (1000). Tab warnings popover uses `--z-tab-warnings` (950) so it stays below modals.

### Notices and status

Satellite pages and shared chrome: `CCPPageChrome` / `CCPNotice` in [`js/page-chrome.js`](js/page-chrome.js).

Use existing banner/status token classes rather than inventing new alert colors.

### Toolbars and cards

Calendar term settings: `#calendarOptions` with `.term-settings-header` and `.calendar-options-details` (collapse is calendar-only; does not hide lock UI).

Top app chrome: zone buttons (`.app-zone-btn`) + segment row (`.app-zone-segment-btn`) in `.app-header-unified`, plus `.app-top-bar` lock/banner stack.

### Accessibility

`.visually-hidden` for screen-reader-only labels.

---

## Theming

- **Light** — default `:root` tokens.
- **Dark** — `[data-theme="dark"]` overrides the same token names (do not branch on hard-coded colors in JS-rendered HTML).
- **Print** — `html.print-color-mode-light` forces light palette regardless of theme.
- **Super-admin** — `html.role-super-admin` tweaks accent colors.

Theme toggle: `js/theme-init.js` + `js/theme-toggle.js` (`CCPTheme`).

---

## Editing surfaces

One movable form per entity (`#classForm`, `#holidayForm`): cloned once, mounted via `mountClassForm` / `mountHolidayForm` in `app.js`.

| Surface | Mode | Notes |
|---------|------|-------|
| Calendar popout | `data-editor-mode="popout"` | Shared fields only; Save in header |
| Classes / Events tab | `data-editor-mode="full"` | Full field order + `.form-group--full-only` sections |
| Syllabus tab | — | Table first; header Save + Refresh + ⋮ More |
| Workspace | `workspace.html` | Redirect stub → `/?zone=…&contentExpanded=1` (homework or curriculum in main app) |
| Day notes app | `notes.html` | Mobile journal |

**Class field order** (same DOM in popout and full; popout hides full-only groups):

name → colors → curriculum → term dates → period/level/grade → total lessons → meeting days → *(full only)* teacher & cohort, books, notes, custom schedule, compression.

**Event field order:** name → colors → date range → dates → event type → applies to → *(full only)* notes.

---

## Mobile UX rules

- Setup host hidden on phone (`syncSetupTabsVisibility`); `mobileSetupLimitedBanner` if user lands on setup tabs.
- Notes tab on phone redirects to `notes.html`; tab label becomes “Day notes”.
- Calendar defaults to agenda on phone; Month segment hidden when `data-calendar-view="agenda"`.
- New controls at phone/tablet widths: meet `--touch-min` (44px) minimum.

---

## Do / don't checklist

**Do**

- Use CSS variables from `:root` for color, spacing, type, radius, shadow.
- Reuse shared classes (`.btn`, `.form-group`, `.field-control`, `.selection-chip`).
- Match breakpoint tokens in CSS **and** JS (`data-viewport`, `isViewportPhone()`, etc.).
- Copy patterns from reference implementations (below).
- Bump `?v=` cache strings in `index.html` (or `js/load-extension-scripts.js`) when changing JS/CSS.
- List which existing components you will reuse when **planning** a UI change.

**Don't**

- Add one-off `padding`, `font-size`, or hex colors in feature-specific CSS.
- Invent new button or input styles when `.btn` / `.field-control` suffice.
- Use `.visibility-chip` in new setup-tab UI (prefer `.selection-chip`).
- Apply [Syllabus Style Guide.md](Syllabus%20Style%20Guide.md) rules to on-screen editor UI.
- Open HTML as `file://` for testing — use `npm start` at http://localhost:8080.

---

## Reference implementations

| Pattern | Where to look |
|---------|----------------|
| Full class editor form | [`templates/class-form.html`](templates/class-form.html) |
| Cohort editor sections | [`js/cohort-management.js`](js/cohort-management.js) — `.form-section-title`, `.field-control` |
| Calendar toolbar | [`styles.css`](styles.css) — `.calendar-toolbar-section` |
| Token definitions | [`styles.css`](styles.css) `:root` (lines ~8–185) |
| Mobile touch pass | [`styles.css`](styles.css) — “UI tightening pass (2026-06)” section |
| Page chrome / notices | [`js/page-chrome.js`](js/page-chrome.js) |
| Help page (separate CSS) | `help.html`, `help.css`, `js/help-guide.js` |

---

## Planning checklist (for agents)

Before implementing a UI change:

1. **Surface** — popout, full tab, modal, toolbar, or satellite page?
2. **Existing class** — which cookbook entry applies (button, field, chip, modal)?
3. **Viewport** — phone/tablet behavior? Need `data-viewport` or JS helper?
4. **Theme** — works in light and dark (tokens only)?
5. **Mount pattern** — new fields in movable form vs new shell?
6. **Cache bust** — which `?v=` strings need bumping?
7. **Print only?** — if yes, switch to [Syllabus Style Guide.md](Syllabus%20Style%20Guide.md).

---

## React-style architecture (vanilla JS)

State and UI updates follow a single pipeline — no React framework:

| Piece | Module | Role |
|-------|--------|------|
| Store | `js/core/app-store.js` | `dispatch({ type, ... })` mutates `appData` |
| Render scheduler | `js/core/render-orchestrator.js` | Maps actions → `requestRender('calendar' \| 'classList' \| …)` |
| View modules | `js/views/*.js` | `init(hooks)` + `render()`; read fresh state from hooks |
| DOM helpers | `js/dom.js` | `CCPDom.html` (auto-escape), `CCPDom.el` |
| Modals | `js/ui/modal.js` | `CCPModal` — focus trap, backdrop, registry |
| Delegation | `js/core/app-delegation.js` | One listener per stable list parent |

**Rules for new UI:**

1. Mutate through `dispatchClassesUpsert`, `dispatchUiSet`, etc. in `app.js` — not ad-hoc `appData` writes.
2. Do not call `renderX()` after dispatch unless the surface is not registered on the orchestrator.
3. Prefer `data-action` + delegation over per-row `addEventListener` on lists.
4. Use `CCPDom.html` for interpolated markup; `CCPUtils.escapeHtml` for manual strings.
5. Register new modals with `CCPModal.register`.

Full audit: [docs/UI_AUDIT.md](docs/UI_AUDIT.md).

---

## Key files

| Area | Paths |
|------|--------|
| Global styles + tokens | `styles.css` (dev), `css/*.css` partials + `npm run css:split` |
| State / render core | `js/core/app-store.js`, `js/core/render-orchestrator.js` |
| View modules | `js/views/class-list-view.js`, `event-list-view.js`, `calendar-view.js` |
| UI primitives | `js/dom.js`, `js/ui/modal.js` |
| Main app shell | `index.html`, `app.js` |
| Form templates | `templates/class-form.html`, `templates/syllabus-editor.html` |
| Shared JS modules | `js/utils.js`, `js/page-chrome.js`, `js/theme-toggle.js` |
| Satellite pages | `login.html`, `help.html`, `workspace.html`, `notes.html`, `admin.html` |

---

*Aligned with `styles.css` and [DEVELOPER.md](DEVELOPER.md) UI tokens section — June 2026.*
