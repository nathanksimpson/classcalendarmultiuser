# Class Calendar App — Pages, Import & Syllabus Presets (Plan Summary)

**Purpose:** Printable overview for teachers and admins (pre-implementation plan)  
**App:** Class Calendar Planner (`index.html`)  
**Based on:** Analysis of seven Spring 2026 sample syllabus PDFs  

---

## 1. What this plan delivers

| Goal | Description |
|------|-------------|
| **Meeting-day quick presets** | Add **Mon/Wed (월수)**, **Wed/Fri (수금)**, **Mon/Fri (월금)**, plus existing MWF and T/T (Tue/Thu = 화목) |
| **PDF syllabi → class types** | Turn your seven sample PDFs into **built-in class type presets** in the app |
| **Per-lesson pages / work** | Store in-class and homework detail in the syllabus table **Pages / detail** column |
| **Homework paste import** | Paste debate `Day 1`… or RC `Unit (1/2)`… blocks and map them to the correct lesson rows |

**Where it shows:** Mainly the **syllabus table and print/PDF**, not necessarily on every calendar day bar (optional later).

---

## 2. Schedule structure (how often class meets)

| Type | Programs | Meets per week | Four variants (수금/월수/월금/화목)? |
|------|----------|----------------|--------------------------------------|
| **Once a week** | **Debate**; **GR** (가람바다, 샘물, 여울) | **1** weekday | **No** |
| **Twice a week** | RC, Green-Blue, WR+SP, 심독, Phonics; **GR 미리내/별마루** | 2 days | RC: four variants; **별마루: 월금 only** |

**Debate** — `debateMonthly`, Day 1–4.

**GR (Grammar)** — **Usually once per week.** Exception: **Mirinae/Byeolmaru (미리내/별마루)** = **twice per week (Mon+Fri)**. See section 5.4.

---

## 3. Implementation phases

| Phase | Work |
|-------|------|
| **0a** | Meeting-day presets: 월수 `[1,3]`, 수금 `[3,5]`, 월금 `[1,5]` + i18n |
| **0b** | Extract seven PDFs → `syllabus-presets.json` → class type dropdown entries |
| **1** | Direct table edit, “Fill pages from units,” preset on new class, how-to text |
| **2** | `homework-import.js` + paste panel (preview → apply) |
| **3** | Book-heading import, LLM prompt copy, polish |
| **4** (optional) | Short page detail on calendar hover |

---

## 4. Meeting-day quick presets (after Phase 0a)

| Button | Actual class days | Notes |
|--------|-------------------|--------|
| **MWF** | Mon · Wed · Fri (3×/week) | **Not the same as 수금** (includes Friday) |
| **Mon/Wed (월수)** | Mon · Wed | M-section 월수 syllabi |
| **Wed/Fri (수금)** | Wed · Fri | M-section 수금 syllabi (RC, etc.) |
| **Mon/Fri (월금)** | Mon · Fri | Requested addition |
| **T/T (화목)** | Tue · Thu | T-section RC |
| **Clear** | Uncheck all | |

**Warning:** Using **MWF** for a **수금** class puts lessons on Friday and **misaligns dates** with your progress charts. Use the matching preset.

---

## 5. Level-grouped curricula (implemented)

| Layer | File | Role |
|-------|------|------|
| Schedule matrix | `Reference/Syllabi/schedule-matrix.json` | Junior Rainbow / Senior Waterflow: which **subject** sits in which **period** on MWF vs Tue/Thu |
| Session templates | `js/syllabus-curricula-data.js` | Day-independent `sessionTemplates` (회차 order from PDFs; ignore week/date columns) |
| Loaders | `js/syllabus-schedule-matrix.js`, `js/syllabus-curricula.js` | Suggest meeting days; group class-type dropdown by level band |

**Level groups (six):** Red/Orange/Yellow · Green/Blue/Navy · Purple · Yeoul/Saemmul · Bada/Garam · Mirinae/Byeolmaru.

**Built-ins:** `builtin-debate` unchanged. **`builtin-wr-sp`** — generic Write Right (18 lessons, Lesson A/B ranges + combined project days). **Write Right (WR+SP):** `preset-wr-sp-green` / `-blue` / `-navy` → **Write Right 1 / 2 / 3** — **18 lessons** = Lesson 1A–8B (SB + WB ranges) + **Writing Project 1&2** and **3&4** (combined project days). **Early Writers (WR+SP):** `preset-early-writers-green` / `-blue` / `-navy` → **Early Writers 1 / 2 / 3** — **21 lessons** = Units 1–8 × [1/2]/[2/2] with **SB + Workbook page ranges**, plus Project #1, two Level Test Revision weeks, (4/28) Level Test, and Project #2 (handouts/reviews). Same schedule for books 1–3. **The Best Writing Starter (WR+SP):** `preset-bws-green` / `-blue` / `-navy` → **The Best Writing Starter 1 / 2 / 3** — **18 lessons** = Unit N-1 / N-2 (Speaking / Writing) with **SB page ranges**; Part 1 homework every other day; Part 2 **Portfolio book Unit N**; **Review 1** (p.40–43) and **Review 2** (p.76–79). Same ranges for books 1–3. **Write Now:** `preset-write-now-*` — **20 lessons** = Unit Part 1/2 (SB + Workbook ranges, listening on Part 2) + **4 project days**; shared ranges for books 1–3. Legacy `builtin-early-writer-weekly` → **Early Writers Navy**.

**Hand in Hand (Red / Orange / Yellow):** `preset-hand-in-hand-red`, `-orange`, `-yellow` — **22 lessons** in the book (same SB/worksheet/PB pagination for books 1–3). Calendar holidays and special days are merged into syllabi separately. **Red (Hand in Hand 1)** includes verified **listening track ranges** and audio-path homework lines; **Orange/Yellow** use the same page plan but **omit track numbers** until book-specific audio is added.

Legacy preset IDs in old calendars still resolve via aliases in `syllabus-curricula-data.js`.

---

## 5a. Seven sample PDFs → class types

### 5.1 Same curriculum, different schedules (Saemmul–Yeoul RC)

**Same unit flow** (`Unit N (1/2)` + `(2/2)`, 12 units → **24 sessions**); only **meeting days** differ:

| PDF (short) | Section | Days |
|-------------|---------|------|
| RC [M] (수금) | M | Wed + Fri |
| RC [M] (월수) | M | Mon + Wed |
| RC [T] (화목) | T | Tue + Thu |

**Design:** One curriculum per subject; **four schedule variants** each — not separate unrelated programs.

### 5.2 One preset per subject; **you choose meeting days**

There is **one PDF preset per curriculum** (e.g. `RC Saemmul–Yeoul`, `GR Garambada`) — not separate 수금 / 월수 / 월금 / 화목 class types.

| You set | App does |
|---------|----------|
| Meeting days (checkboxes or quick presets: MWF, 월수, 수금, 월금, T/T) | Places lesson 1…N on those weekdays across the term |
| Term start / end | Skips holidays; may leave overflow rows if the term is short |
| **Refresh from calendar** | Syllabus table gets real dates on **your** days |
| **Apply preset pages** (GR) or units / paste (RC) | Sample syllabus content maps to **session #**, not a fixed weekday |

Sample PDFs that used Wed+Fri or Tue+Thu only define **content**; your section’s days can differ.

### 5.3 Program notes (lesson shape)

| Program | Sample PDF days | Lesson shape | Sessions (typ.) |
|---------|-----------------|--------------|-----------------|
| Green-Blue RC | 수금 | Unit (1/2) + (2/2), 12 units | 24 |
| Red Phonics | 수금 | One unit per class; book change mid-term | Special handling |
| Garambada 심독 | 수금 | Unit halves | 24 |
| Garambada GR 2025 | TBD | GR program | Confirm on re-extract |

**Red Phonics** still needs a dedicated lesson-label mode; use your own meeting days like other presets.

### 5.4 GR / Grammar (one preset per book)

| Preset | Book | Sessions (typ.) |
|--------|------|-----------------|
| GR 가람바다 | 가람바다 GR | 12 |
| GR 샘물 | 샘물 GR | 13 |
| GR 여울 | 여울 GR | 13 |
| GR 별마루 (형용사) | 별마루 GR | 20 |

Pick **your** meeting day(s) for the section. PDF examples (Wed-only, Tue-only, etc.) are not forced by the app.

GR presets include `<수업>` / `<과제>` templates applied by **session number** after refresh.

---

## 6. Creating a class — step by step (after implementation)

### 6.1 Term and calendar

1. Set **calendar name**, **term start month**, and **months to display** in the top bar.  
2. Add **+ Add Event** for holidays, eval periods, Children’s Day, etc., as needed.

### 6.2 **+ Add Class**

| Step | Field | Action |
|------|-------|--------|
| 1 | **Class name** | e.g. `26 SP Saemmul–Yeoul RC M` |
| 2 | **Class type** | e.g. `RC Saemmul–Yeoul` or `GR Garambada` (one preset per curriculum) |
| 2b | **Edit defaults** (optional) | Change factory lesson count, book, labels for any built-in / PDF preset |
| 3 | (auto-filled) | Total lessons, default book; **not** meeting days |
| 4 | **Meeting days** | Check weekdays or use quick presets (월수 / 수금 / 월금 / T/T, etc.) |
| 5 | **Start / end dates** | Term range |
| 6 | **Period, level, grade, books by month** | Adjust if needed |
| 7 | **Save Class** | Lessons appear on the calendar |

### 6.3 Syllabus table (pages / work)

| Step | Action | Result |
|------|--------|--------|
| ① | **Refresh from calendar** | Rows with date, week, #, lesson title |
| ② | **Apply preset pages** (from PDF) | In-class + homework into **Pages / detail** |
| ③ | **Fill pages from units** | Unit speaking/writing → each session |
| ④ | **Import from paste** | Preview → Apply |
| ⑤ | Edit **Pages / detail** and **Note** | |
| ⑥ | **Save** | Stored in browser; included in Export JSON |

**Order:** Run ① **before** ②–④ so session numbers and dates match.

### 6.4 Print

- **Print syllabus** in the class modal, or include syllabus tables in the main **Print** dialog.  
- **Pages / detail** column prints as your progress-chart content.

---

## 7. Data flow

```
Calendar schedule (meeting days + term + events)
        ↓  Refresh from calendar
Syllabus rows (date, week, session #, lesson title)
        ↓  Units / paste / PDF preset
Pages / detail (in-class + homework) + notes
        ↓  Print
Syllabus PDF
```

- **Syllabus units:** Bulk per-unit speaking/writing page lines.  
- **Syllabus rows:** Per-date truth for printing.  
- **Refresh** keeps non-empty **Pages / detail** when possible.

---

## 8. Today vs after the plan

| Item | Today | After plan |
|------|-------|------------|
| Day quick presets | MWF, T/T only | + Mon/Wed, Wed/Fri, Mon/Fri |
| PDF syllabi | Manual setup | Class type presets |
| Wed/Fri classes | Easy to pick wrong (MWF) | Dedicated **수금** button |
| Page content | Mostly manual in table | Paste + preset seed |
| RC M vs T | Repeat setup | **RC-style 2×/week:** 수금 / 월수 / 월금 / **화목**; **GR:** book + weekday preset (see 5.4) |

---

## 9. Out of scope for v1

- In-app PDF upload or live PDF parsing (PDFs are a **one-time dev input** to build presets).  
- Full “Build Book Templates” flow from the separate Homework Organizer app.  
- Always showing long page text on calendar day bars (optional later).

---

## 10. Before implementation

1. Copy all **seven PDFs** into `Reference/Syllabi/` in the Calendar App project.  
2. Confirm **Red Phonics** labeling (one unit per class vs forced half-units).  
3. Ask to **implement the plan** when ready.

---

## 11. Printing this document

- Open this file in Cursor/VS Code → Markdown preview (`Ctrl+Shift+V`) → **Print** (`Ctrl+P`).  
- Or open preview in a browser and print.  
- Enable background graphics if tables clip.

---

**Korean version:** [계획-요약-한국어.md](./계획-요약-한국어.md)  
**Technical plan (Cursor):** `per-day_pages_import`  
**App folder:** Calendar App
