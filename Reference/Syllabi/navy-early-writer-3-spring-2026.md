# Write Right / WR+SP classes — basic structure

## Pattern

- **One lesson per calendar week** (two class days that week):
  1. **Speaking** (`Lesson N [1/2]`)
  2. **Writing** (`Lesson N [2/2]`)
- After **8 lessons**, four **Project** days (one per project; pages 72, 74, 76, 78)
- **No review days** in the Write Right preset (reviews are not part of this book line’s syllabus template)
- **No debate-style compression** (no Day 2+3 merges per month)
- **Pagination is the same** for Write Right 1, 2, and 3; only `defaultBook` changes

## Calendar app setup

| Field | Typical value |
|-------|----------------|
| Class type | **WR+SP Write Right Navy** (`preset-wr-sp-navy`), or Green/Blue presets, or generic **builtin-wr-sp** |
| Meeting days | **Two weekdays** (e.g. Mon + Wed for M-style, Tue + Thu for T-style) |
| Total lessons | **20** = 8 lessons × 2 + 4 projects |
| Term | 3 months (adjust start/end dates) |
| Default book | **Write Right 3** (Navy); Green = 1, Blue = 2 |

Example lesson labels (same for all three books; pages shared):

- `Lesson 1 [1/2] – Speaking (p.8)`
- `Lesson 1 [2/2] – Writing`
- …
- `Project 1 – Project (p.72)`

Optional: override any week in **Syllabus units** if you need a custom title (test week, holiday, etc.).

## M vs T sections

Same structure; only **meeting days** differ:

- **M class** → e.g. Monday + Wednesday  
- **T class** → e.g. Tuesday + Thursday  

Use **Apply preset pages** after refresh if you change preset or book.

## Write Now (separate preset)

Write Now uses the same idea (Speaking / Writing / Project + shared pages across books 1–3) but places **projects after every two units**, not all at the end. Use `preset-write-now-*`, not `preset-wr-sp-*`.
