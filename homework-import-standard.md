# Homework Import Standard

Use this file to help an LLM convert existing homework copy-paste text into the exact format expected by the app import parsers.

## Goal

Create import text that:

- splits cleanly into book/day categories
- creates one template entry per intended unit/day block
- works with:
  - `Build Book Templates (Non-Debate)`
  - `Build Debate Templates`

## Non-Debate Format

### Required structure

1. Start with a recognized book heading line.
2. Put that book's unit/part block content below it.
3. Separate each block with one empty line.
4. Repeat for additional blocks and books.
5. Organize by `Unit N - Part 1` and `Unit N - Part 2` (or equivalent wording like `Unit N Part 1`).

### Recognized non-debate headings

- `IPE` (or `IPE- Purple, 샘물, 여울`)
- `Subject Link` (or `Subject Link- 샘물, 여울`)
- `150 Word Reading 2` (or `150 Word Reading 2 (Purple)`)
- `Simson Reading` (or `Simson Reading- Purple, 샘물, 여울`)
- `Write Now`
- `The Best Writing Starter`
- `Write Right: Beginner`
- `Early Writers`
- `Hand in Hand`

### Parser behavior (important)

- Each recognized heading starts a new book section.
- Inside each section, blocks are split by blank lines.
- Each block becomes one template entry.
- The first line of each block becomes the entry title.
- Filtering UI extracts non-debate categories from text patterns like:
  - `Unit 1 Part 1`
  - `Unit 1 - Part 2`
  - `Unit 2 pt 1`

### Non-debate example

```text
IPE
Unit 1 Part 1
Covered in class: ...
Homework: ...

Unit 1 Part 2
Covered in class: ...
Homework: ...

Subject Link
Unit 3 Part 1
Covered in class: ...
Homework: ...
```

## Debate Format

### Required structure

Use day markers exactly, then place content under each marker.

### Recognized debate day markers

- `Day 1`
- `Day 2`
- `Day 3`
- `Alt Day 3`
- `Day 2 & 3 Combined`
- `Day 4 / Preview` (also accepted: `Day4 / Preview`, `Day 4/Preview`)

### Parser behavior (important)

- Each day marker starts a new block.
- All following lines belong to that day until the next marker.
- Text before the first day marker is ignored as warning.

### Debate example

```text
Day 1
Covered in class: ...
Homework: ...

Day 2
Covered in class: ...
Homework: ...

Day 3
Covered in class: ...
Homework: ...

Alt Day 3
Covered in class: ...
Homework: ...

Day 2 & 3 Combined
Covered in class: ...
Homework: ...

Day 4 / Preview
Covered in class: ...
Homework: ...
```

## LLM Prompt Template (copy/paste)

Use this prompt when giving raw text to an LLM:

```text
You are formatting homework copy text for strict parser import.

Task:
Rewrite the input into parser-compatible plain text.

Rules:
1) Keep educational meaning exactly.
2) Do not add commentary, markdown, or explanations.
3) Start immediately with a valid heading/day marker (no preface lines).
4) For NON-DEBATE:
   - Use only recognized book headings:
     IPE
     Subject Link
     150 Word Reading 2
     Simson Reading
     Write Now
     The Best Writing Starter
     Write Right: Beginner
     Early Writers
     Hand in Hand
   - Under each heading, split each intended unit/part into its own block.
   - Prefer naming each block heading as:
     Unit <number> Part 1
     Unit <number> Part 2
   - Separate blocks with one blank line.
5) For DEBATE:
   - Use only recognized day markers:
     Day 1
     Day 2
     Day 3
     Alt Day 3
     Day 2 & 3 Combined
     Day 4 / Preview
   - Put each day's content directly under that marker.
6) Keep enough content in each block (not tiny fragments).
7) Return plain text only.

Input text:
<<<PASTE SOURCE HERE>>>
```

## Quick validation checklist

Before import, quickly check:

- First line is valid heading/day marker
- Blank lines separate non-debate blocks clearly
- Debate markers are exact
- Non-debate entries include clear `Unit X Part Y` wording
- No random text before first heading/marker
- No tiny stray blocks

