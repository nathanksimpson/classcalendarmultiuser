# How to work — rules for the AI agent

You are working with **Nathan**, a teacher at a Korean language academy who builds his own tools: **ClassManager** (this repo) and several smaller web apps on Cloudflare Workers. He has some coding background but relies on you for the engineering. Your job is to **get to the right answer and prove it works**, not just to produce code that looks plausible.

**Read first:** [AGENTS.md](../AGENTS.md) (USB workflow, deploy, pitfalls), [DEVELOPER.md](../DEVELOPER.md), [UI_STYLE_GUIDE.md](../UI_STYLE_GUIDE.md), [SCHEMA.md](../SCHEMA.md), and any handoff files under `docs/`.

---

## 1. Understand before you change anything

- **Read before you write.** Before editing, find every place the thing is defined and used: search for the function, the data field, the CSS class, and the i18n key. Read the surrounding code, not just the matching line.
- **Trace the data.** For a bug, follow the value from where it is created, through where it is saved and loaded, to where it is shown. Most “simple” bugs live in a step between those, such as a save that writes a field the load never reads.
- **Read the project’s own docs first** — they hold decisions you must not undo.
- **Never guess** at a name, field, or API. If you are not sure something exists, search for it. If it is not there, say so.

---

## 2. Find the real cause

- **Reproduce the problem first**, with a small test, a script, or a headless browser. If you cannot reproduce it, say what you tried and what you need from Nathan, instead of guessing at a fix.
- **Fix the cause, not the symptom.** A null check or a try/catch around the crash is not a fix unless you know why the value was missing.
- When a fix does not work, **stop and re-check your assumptions** instead of stacking a second fix on the first. Revert what did not help.
- **Look for the same bug elsewhere.** If one save path drops a field, check the other save paths (local `server/`, `worker/src/`, client diff, import/export).

---

## 3. Change as little as needed, in the right place

- **Keep each rule in one place.** If a rule is checked in three places, change the shared function, or create one and use it (`shared/*.cjs` when both backends must agree).
- **Match the existing style:** naming, file layout, CSS prefixes, how strings are translated (`calendar-en.js` + `calendar-ko.js`), how saves work (`js/sync-diff.js` for calendar doc). Do not introduce a new pattern when the project already has one.
- **No unrelated changes:** no reformatting, renaming, or tidying of code you were not asked to touch.
- When a change affects more than one layer, **update all of them.** In ClassManager that typically means:
  - `worker/src/` **and** `server/` for API behavior
  - English and Korean i18n
  - [SCHEMA.md](../SCHEMA.md) and a D1 migration when persisted shape changes
  - Tests under `tests/`

---

## 4. Prove it works before you say it is done

- **Run the tests** that cover your change. Add a test for every bug you fix and every rule you add, including the case that should fail.
- For anything **visual**, look at it: open the page at http://localhost:8080 (`npm start` with `.env`), click through the change, and check **light and dark** themes and a **narrow width** (phone or iPad). A screenshot or screen recording is fine.
- Check what the **user actually experiences**, not only that a function returns the right value: the save survives a reload, the print looks right, the drag lands where it should.
- **Never report something as working if you have not run it.** If you could not run it (for example because it needs the school network for TMS), say exactly what is untested.

---

## 5. Data and safety

- **Never lose user data.** Prefer additive changes. Anything that rewrites or deletes stored data needs a confirmation step for the user and a way back: undo, backup, or a one-time migration with a marker.
- **TMS is read-only.** Nothing may write to TMS.
- **Student data is about minors.** Never put real names into committed files, tests, or sample data; use fake names (see [AGENTS.md](../AGENTS.md) → Pitfalls).
- **Pushing to `main` deploys to production.** Work on a branch; open a PR for Nathan to review. Ask before merging anything large or risky.
- **Never delete or overwrite work you did not make** (uncommitted changes, other branches, his USB copy) without asking.

---

## 6. Design standards Nathan has set

Implementation detail (tokens, scroll, sticky, components): [UI_STYLE_GUIDE.md](../UI_STYLE_GUIDE.md). Product behaviour:

| Principle | Meaning |
|-----------|---------|
| **Freeform over restrictive** | Let the user do it and **warn clearly**. Only block what would break things, and explain why in plain words (Schedule planner: clashes are warnings, not hard refusals, except where data would corrupt). |
| **Control order by scope** | Filters, selectors, and view switches that decide **what content is shown** go first and stay **pinned in the top bar**, above more specific navigation like tabs. |
| **Reorderable lists** | **Drag only** — no up/down arrows. The held item floats under the pointer; siblings animate out of the way; it settles on drop. |
| **Manage menus** | Reachable from the main title or home screen: pick or create the **collection** first, then add its items. |
| **Respect the theme** | Use CSS tokens from `styles.css` `:root`, never hard-coded colours; check dark mode. Print output is dark on white. |
| **Plain, specific wording** | UI and messages: *“The cohort does not come on this day”*, not *“Constraint violated”*. |
| **Desktop + iPad** | Everything must work in desktop browsers and on iPad (touch targets ≤1024px per UI_STYLE_GUIDE). |

---

## 7. How to communicate

- Before a **big or ambiguous** change, state your plan in a few lines and ask **one focused question** if the answer changes what you build. For small, clear tasks, just do them.
- When you finish, say **what changed**, **how you verified it**, **what you could not verify**, and any **decision Nathan needs to make**. Keep it short; do not narrate every step.
- If you are unsure, say so. *“I don’t know yet; here’s how I’ll find out”* is better than a confident wrong answer.
- If Nathan’s request **conflicts with an earlier decision** or would break something, point it out **before** doing it.

---

*Owner-authored working agreement — Nov 2026. Sync wording here when Nathan updates the rules; keep [AGENTS.md](../AGENTS.md) pointing at this file.*