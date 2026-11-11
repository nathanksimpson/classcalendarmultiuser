# Class board (notes → BBS / SNS-style board) — build handoff

**Status:** planned, not started. Owner: Nathan. Plan whiteboard: https://claude.ai/artifact/V6QnF4fYvsBymcZKFSphLY

**Goal:** turn class day notes into a shared, searchable record of what happens in class — an SNS-style feed plus per-class boards where any teacher can post, reply and react, and where a student's history follows them across terms.

Read first: [AGENTS.md](../../AGENTS.md), [DEVELOPER.md](../../DEVELOPER.md), [UI_STYLE_GUIDE.md](../../UI_STYLE_GUIDE.md), [SCHEMA.md](../../SCHEMA.md) (`dayNotes[]`, `cohorts[].students[]`).

---

## Decisions (final — do not re-litigate)

| Topic | Decision |
|---|---|
| Model | SNS/BBS board. **Not** a ticketing/help-desk system: no status, assignee, priority or macros. |
| Boards | One per class, one per 반 (cohort), one all-staff board. Class/반 boards **start fresh each term** (scoped to the term's calendar). |
| Across terms | Posts **follow students**: a student profile shows every post that tags them, across all term calendars. |
| Who can post / reply / react | **Anyone with access to the calendar, including view-only accounts.** Board writes must not grant any other calendar permission. |
| Reactions | Fixed set 👍 ✅ 👀 ❤️ (one of each per person per post); show who reacted on hover/tap. |
| ★ 특이사항 | A post flag/tag. Pinned to the top of its board. |
| Bell: replies | Post author + everyone who already replied on that post (never the actor). |
| Bell: 특이사항 | Teachers of the **@-tagged students** (`classTeachers[].userId` of classes those students are in + cohort 담임). Untagged 특이사항 notify nobody. |
| Bell: mentions | @teacher mentions notify that teacher. |
| TMS 특이사항 | Shown **read-only** on student profiles (from the existing TMS roster sync). **Nothing is ever written to TMS.** |
| Record keeping | Edits keep revision history; deletes are soft (tombstone "deleted by X"), never silent. |

## Findings that shape the design

- **Notes are wiped each term:** `js/term-clone-wizard.js` and `js/term-migrate-wizard.js` set `cloned.dayNotes = []`. Board data must therefore live **outside the calendar document**.
- **Calendar documents are one encrypted blob** (`worker/src/blob-at-rest.js`, `crypto/blob-at-rest.js`). Do not grow it with posts/replies. Encrypt board bodies at rest with the same helpers.
- **Student ids across terms:** *Clone term* copies cohorts/students with ids unchanged. *Migrate term* (`applyTermMigrateTransferPlan` in `js/classroom-domain.js`) keeps the previous `studentId` for every matched/manually linked student, but **unmatched TMS adds get a new `stu_…` id**. So posts must store **both** `studentId` and `tmsMpidx` (stable TMS id on `cohorts[].students[]`), and student-profile lookups match on either.

## Data model (new D1 tables — migration `worker/migrations/0022_class_board.sql`, mirror in `server/schema.js`)

```
board_posts        id, calendar_id, board_kind ('class'|'cohort'|'staff'), board_ref (class_id | cohort_id | ''),
                   lesson_date (YYYY-MM-DD, nullable), author_user_id, body (encrypted), tags_json,
                   is_special (0/1), created_at, updated_at, deleted_at, deleted_by
board_post_students post_id, calendar_id, student_id, tms_mpidx            -- index student_id, tms_mpidx
board_post_mentions post_id, user_id                                     -- @teacher mentions
board_replies      id, post_id, author_user_id, body (encrypted), created_at, updated_at, deleted_at, deleted_by
board_reactions    target_id (post or reply id), user_id, emoji, created_at  -- PK (target_id, user_id, emoji)
board_revisions    id, target_id, body (encrypted), editor_user_id, edited_at
board_read_state   user_id, calendar_id, board_key, last_read_at
```

Indexes on `(calendar_id, board_kind, board_ref, created_at)`, `(calendar_id, lesson_date)`, `author_user_id`, and the student columns. Every reply/reaction is its own row, so concurrent activity never overwrites (this is why comments are *not* stored inside the post).

**Search:** bodies are encrypted, so no plaintext FTS index. Filter by indexed columns first (calendar(s), board, date range, student, tag, author, special), decrypt the page in the Worker, then substring-match the text. Return paged results with snippets.

## API (both `server/` and `worker/src/` — keep them in sync)

- Separate endpoints under `/api/calendars/:id/board/...` — **do not** route board writes through calendar `PATCH`, so calendar edit permissions stay untouched.
- Access: `CalAccess.canAccessCalendar` (any access level) for read **and** write. Writes blocked in View As (`rejectViewAsJson`).
- Server stamps `author_user_id`; only the author edits/deletes their own post/reply; admins with `MANAGE_CALENDAR_ACCESS` may delete (soft). Reaction emoji must be in the fixed set. Body length cap.
- Endpoints (sketch): list feed (my classes, newest first, cursor paging), list board, get post + replies, create/edit/delete post, create/edit/delete reply, toggle reaction, mark board read, search, student history (by `student_id` or `tms_mpidx`, across every calendar the user can access), inbox/notifications.
- Log writes to the activity log like other saves.

## UI

- Replaces the Notes tab panel (`#panel-notes`, template `#classNotesShellTemplate` in `index.html`; logic in `app.js` `renderClassNotesTab` etc. and `js/class-notes-panel.js`). Reuse the styles from the Nov 2026 notes declutter (inline quiet actions, Export menu).
- **Scope controls pinned at the top** (board picker: Feed / class / 반 / staff; search; filters) above any tabs — Nathan's standing UI rule.
- Post card: author · class · date meta line, body with highlighted `@student` / `@teacher` / `#tag`, reaction chips (only when present), "💬 N" opens replies inline, quiet Edit/Delete/Copy (hover on mouse, always visible on touch).
- Compose box placeholder (native grey `placeholder`, disappears on typing): *"What happened in class? Type @ to tag a student — their teachers will be notified."* When ★ 특이사항 is on and no student is tagged, show a small grey line under the box: *"No student tagged — this won't notify anyone."* (non-blocking).
- Unread: "new" dots per board from `board_read_state`.
- Student profile: timeline of posts tagging the student (all terms) + a separate read-only "From TMS" 특이사항 box.
- Permalinks: `/?post=<id>` (or hash route) opening the post; copyable for KakaoTalk.
- All strings in `js/i18n/calendar-en.js` **and** `calendar-ko.js`. Tokens only (no hard-coded colours/spacing). Check phone (≤640), tablet (≤1024) and desktop.

## Existing notes

Import existing `dayNotes[]` into `board_posts` (class board of `classId`, `lesson_date = date`, `author_user_id`, `taggedStudentIds` → `board_post_students` with each student's `tmsMpidx`, category → tag: `parent-consult`, `next-class-notes`, custom categories). **Ask Nathan** before deciding what happens to system-managed categories (`class-points`, `essay-resubmit`). Keep the old `dayNotes` read path working until the import is verified; do not delete `dayNotes` data.

## Phases — each ends deployable; stop after each for Nathan to test

1. **Storage + API.** Migration 0022, schema mirror in `server/schema.js`, access module (`board-access.js` in both servers), endpoints, encryption, tests in `tests/` (permissions incl. view-only, own-only edit, soft delete + revisions, concurrent replies/reactions, student lookup by `tms_mpidx` after a migrate with a new `stu_` id). No UI yet.
2. **Feed + boards UI** in the Notes tab, compose with placeholder/hint, replies, reactions, ★ pin, unread dots, dayNotes import.
3. **Search + student profiles + permalinks + revision view.**
4. **Bell** (replies, mentions, 특이사항 → teachers of tagged students; reuse dismissal in `notification-meta.js`), **live updates** (poll on focus first; later the planned per-calendar Durable Object), **phone** (`notes.html` becomes the phone feed).

## Rules

- **Pushing to `main` deploys production.** Work on branch `class-board`; Nathan merges.
- **D1 migrations are not run by the build.** Don't run `npm run db:migrate:remote` — Nathan does, after testing locally (`npm start`, `.env` with `ALLOW_OPEN_ACCESS=1`).
- **Never write to TMS.**
- Update `SCHEMA.md` and `DEVELOPER.md` for new tables/endpoints. Run `npm test`.
