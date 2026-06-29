# ClassManager — Design System Brief (for AI design)

**Purpose:** Copy-paste design spec for Claude Design, Figma AI, or other design tools.  
**Keep in sync:** When you change UI tokens, shell layout, or component patterns, update **this file** and [`UI_STYLE_GUIDE.md`](UI_STYLE_GUIDE.md) together. Source of truth for values is [`styles.css`](styles.css) `:root`.

---

## Product context

**ClassManager** is a team calendar and curriculum app for teachers (Korean + English UI). It is a **professional, calm productivity tool** — not playful or consumer-social. Users spend long sessions in calendars, forms, and setup boards.

**Design philosophy:** Simple Design System + **8px grid**. Token-driven. Light skeuomorphic chrome (subtle gradients on tabs/segments). **Calm calendar chips** (tinted fills, not loud blocks). Bilingual: English + Korean must look good together.

---

## Brand

| Item | Value |
|------|-------|
| Product name | **ClassManager** |
| Primary accent | `#14b98f` (teal-green) |
| Primary hover/dark | `#0e9b76` |
| Link color | `#0f9b75` |
| Accent muted (selected chips, highlights) | `#eaf6f1` |
| Brand dark accent | `#06241c` |

**Personality:** Trustworthy, organized, school-admin friendly. Teal = growth/learning without feeling childish.

---

## Typography

| Role | Font | Size | Weight | Line height |
|------|------|------|--------|-------------|
| UI body | **IBM Plex Sans** + `Noto Sans KR` / `Malgun Gothic` fallbacks | 16px (`1rem`) | 400 | 1.4 |
| UI small | IBM Plex Sans | 14px (`0.875rem`) | 400–600 | 1.4 |
| Buttons | IBM Plex Sans | 14px | **600** | 1.4 |
| H1 | IBM Plex Sans | 48px (`3rem`) | 600–700 | 1.1–1.2 |
| H2 | | 40px | | 1.2 |
| H3 | | 32px | | 1.2 |
| H4 | | 24px | | 1.2 |
| H5 | | 20px | | 1.2 |
| H6 | | 18px | | 1.2 |
| Monospace (code, IDs) | `ui-monospace`, Cascadia Code | 14px | 400 | 1.4 |

**Rules:** Clean sans-serif throughout. No decorative fonts. Section titles are semibold. Muted helper text one step lighter than body.

---

## Color palette — Light (default)

### Surfaces

| Token | Hex | Use |
|-------|-----|-----|
| Page background | `#f4f6f9` | Main app canvas |
| Card / panel | `#ffffff` | Cards, modals, header card |
| Hover / elevated | `#eef1f5` | Row hover, inactive zones |
| Input background | `#ffffff` | Fields, selects |
| Border | `#e3e8ef` | Default borders |
| Toolbar border | `#d4dbe4` | Section dividers in toolbars |

### Text

| Token | Hex | Use |
|-------|-----|-----|
| Primary text | `#1c2430` | Headings, body |
| Secondary text | `#5a6a80` | Labels, subtitles |
| Muted text | `#8893a3` | Hints, placeholders |
| On primary button | `#f8fafc` | White-ish text on teal |

### Semantic

| Role | Background | Text | Border |
|------|------------|------|--------|
| Success | `#ecfdf5` | `#065f46` | `#a7f3d0` |
| Error / danger | `#fef2f2` | `#991b1b` | `#fecaca` |
| Danger button | `#dc2626` | `#f8fafc` | — |
| Success button | `#16a34a` | white | — |
| Warning badge | `#fef3c7` | `#b45309` | — |
| Holiday highlight | `#fef3c7` | — | `#f59e0b` |

### Header utility buttons (tinted, not flat gray)

| Button | BG | Border | Text |
|--------|-----|--------|------|
| Print | `#eff6ff` | `#93c5fd` | `#1d4ed8` |
| Language | `#f5f3ff` | `#c4b5fd` | `#5b21b6` |
| Theme | `#f1f5f9` | `#cbd5e1` | `#334155` |

---

## Color palette — Dark

| Token | Hex |
|-------|-----|
| Page background | `#0e1726` |
| Card | `#111c2c` |
| Hover | `#16202f` |
| Input BG | `#0e1726` |
| Border | `#232f44` |
| Primary text | `#e8edf4` |
| Secondary text | `#aebbcd` |
| Muted text | `#7c8aa0` |
| Primary accent | `#1ed3a4` |
| Link | `#7fe8c8` |
| Top bar | `rgba(17, 28, 44, 0.96)` + blur |

Modal backdrop dark: `rgba(2, 6, 23, 0.72)`

---

## Spacing (8px grid)

| Step | Value | Typical use |
|------|-------|-------------|
| 1 | 4px | Tight gaps, chip padding |
| 2 | 8px | Control vertical padding, small gaps |
| 3 | 12px | Control horizontal padding |
| 4 | 16px | Card padding, section gaps |
| 5 | 24px | Modal padding, section spacing |
| 6 | 32px | Large section breaks |
| 7 | 48px | Page-level spacing |

**App gutter:** `clamp(16px, 2vw, 32px)`

**Touch minimum (phone/tablet ≤1024px):** 44px hit targets on buttons and toggles. Desktop controls can be 36–40px compact.

---

## Border radius

| Token | Value | Use |
|-------|-------|-----|
| Small | 4px | Chips, badges |
| Medium | 8px | Buttons, inputs, tabs (default) |
| Card | 10px | Cards, panels |
| Large | 16px | Modals, large containers |
| Full | 9999px | Pills, avatars |

---

## Shadows

| Level | Value |
|-------|-------|
| Small | `0 1px 4px rgba(12,12,13,0.1), 0 1px 4px rgba(12,12,13,0.05)` |
| Medium | `0 4px 4px -1px rgba(12,12,13,0.1)...` |
| Large | `0 10px 15px -3px rgba(0,0,0,0.1)...` |
| Dialog / modal | `0 16px 32px -4px rgba(12,12,13,0.1)...` |
| Top bar | `0 4px 16px rgba(20,30,50,0.08)` |

---

## App shell layout

**Three-row chrome** inside a **unified header card** (`#ffffff`, rounded, subtle shadow):

```text
┌─────────────────────────────────────────────────────────────┐
│ ROW 1 — Tools: Calendar menu · Display · Print · Help · Account │
├─────────────────────────────────────────────────────────────┤
│ ROW 2 — Zone tabs: Calendar | Classes | Events | Syllabus | …  │
│         (horizontal scroll on narrow screens + edge fade)      │
├─────────────────────────────────────────────────────────────┤
│ ROW 3 — Segment pills: Month | Week | Agenda  +  term summary  │
└─────────────────────────────────────────────────────────────┘
│ Sticky lock/sync bar (team editing status)                     │
├─────────────────────────────────────────────────────────────┤
│ Main content (calendar grid, lists, editors)                   │
└─────────────────────────────────────────────────────────────┘
```

**Zone tabs:** Track background `#eef1f5`. Active tab has **3px teal top rail** `#14b98f`.

**Segment pills:** Active = teal gradient `180deg #22d6a8 → #12a37f`. Inactive = white-to-gray gradient `180deg #ffffff → #eef2f6`.

**Top bar:** Frosted glass — `rgba(255,255,255,0.94)` + `backdrop-filter: blur(10px)`.

---

## Core components

### Buttons

- Base: 40px min-height, 8px radius, font-weight 600, 14px
- **Primary:** teal fill `#14b98f`, white text; hover darkens + 1px lift + medium shadow
- **Secondary:** slate `#5a6a80`
- **Outline:** transparent, 1px border `#e3e8ef`
- **Danger:** red `#dc2626`
- Sizes: compact (36px), default (40px), large (48px)

### Inputs & selects

- White background, 1px border `#e3e8ef`, 8px radius
- Focus: teal ring/border accent
- Compact variant for toolbars
- Form pattern: label above field in `.form-group`; two-column `.form-row` on desktop

### Selection chips

- Bordered checkbox tiles: rounded 8px, border `#e3e8ef`, selected = teal accent + muted fill `#eaf6f1`
- Calendar filter chips: class-colored, borderless, small

### Modals

- Centered card, 16px radius, dialog shadow
- Header with title + × close
- Backdrop: semi-transparent dark overlay
- Variants: small, wide, scrollable body

### Calendar event chips (`.event-bar--calm`)

- Tinted fill at ~14% opacity of class color
- **3px left color rail** in full class color
- Max 4 lessons per day, then “+N more”
- Subtext muted `#6b7689`

### Status & notifications

- **Toast rail** (bottom or corner): success / error / info / lock / sync types
- **Bell inbox** for dismissible setup warnings
- **Lock badge:** teal gradient pill for “you have edit access”
- Lock states: free (gray), held (green tint), blocked (red tint), pending (amber)

### Cards & toolbars

- White cards on gray page background
- Toolbar sections: white card, bordered `#d4dbe4`, grouped controls

---

## Responsive breakpoints

| Tier | Width | Behavior |
|------|-------|----------|
| Phone | ≤640px | Agenda default, 44px touch targets, horizontal tab scroll |
| Small tablet | 641–900px | Compact layout |
| Tablet | 901–1024px | Touch targets, some columns stack |
| Desktop | >1024px | Full month view, compact 36px controls OK |

Zone and segment rows **never wrap** — they scroll horizontally with fade hints at edges.

---

## Motion

- Button hover: 200ms ease
- Toast in: 420ms `cubic-bezier(0.16, 1, 0.3, 1)`
- Toast out: 320ms
- Subtle transforms on primary button hover (`translateY(-1px)`)

**Avoid:** bouncy animations, parallax, heavy motion.

---

## Accessibility

- Minimum contrast on text vs surfaces
- `.visually-hidden` for screen-reader labels
- Focus visible on interactive elements
- `viewport-fit=cover` + safe-area insets on iOS for fixed chrome

---

## Do / don't for new designs

**Do**

- Use the teal primary and gray-blue neutrals
- Keep generous whitespace (16–24px in forms)
- Use IBM Plex Sans + Korean fallback
- Design light **and** dark variants with the same structure
- Show lock/sync state clearly in the header
- Calendar = calm tinted chips, not solid loud blocks

**Don't**

- Neon colors, heavy gradients (except segment pills / lock badge)
- Rounded “bubble” consumer app aesthetic
- Tiny touch targets on mobile
- Replace teal with blue as primary (blue is only for print button tint)
- Mix syllabus **print** layout rules into on-screen UI (print is separate A4 document style)

---

## Quick reference — CSS variables (light)

```css
--primary: #14b98f;
--primary-dark: #0e9b76;
--secondary: #5a6a80;
--danger: #dc2626;
--success: #16a34a;
--bg-main: #f4f6f9;
--bg-card: #ffffff;
--bg-hover: #eef1f5;
--text-primary: #1c2430;
--text-secondary: #5a6a80;
--text-muted: #8893a3;
--border-color: #e3e8ef;
--accent-muted: #eaf6f1;
--radius-md: 8px;
--radius-card: 10px;
--radius-lg: 16px;
--font-main: 'IBM Plex Sans', 'Noto Sans KR', sans-serif;
```

---

## How to use with Claude Design

Paste this file (or link to it), then add your specific request, for example:

> “Design a mobile ‘Add class’ bottom sheet using the ClassManager design system above.”

> “Create a settings page mockup in light and dark mode following this spec.”

---

## Related docs

| What | Path |
|------|------|
| UI implementation rules + cookbook | [`UI_STYLE_GUIDE.md`](UI_STYLE_GUIDE.md) |
| Syllabus A4 print only (not on-screen UI) | [`Syllabus Style Guide.md`](Syllabus%20Style%20Guide.md) |
| Token definitions (source of truth) | [`styles.css`](styles.css) `:root` |
| Dev workflow | [`DEVELOPER.md`](DEVELOPER.md) |

---

*Aligned with `styles.css` and `UI_STYLE_GUIDE.md` — June 2026.*
