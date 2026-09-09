# Simson Level & Essay Grading Context

**Source:** Class Calendar Multi User (`syllabus-curricula-data.js`, `app.js` SIMSON_LEVEL_GROUPS, `books-editor.js` debate bands).  
**Purpose:** Tell the essay grader which standards apply based on student class/level.  
**Used by:** `batch_news_essay_feedback_generator (1).html` → injected into API system prompt.

---

## 1. Level hierarchy (top → bottom)

Simson uses two school bands. Each class has a **level preset** (stored as `className` line 2 in the batch grader, e.g. `Leo`, `Pavo`, `Garam`).

### Elementary (초등) — Junior Rainbow → Senior Waterflow

| Level group | Levels | Typical programs | Debate? |
|-------------|--------|------------------|---------|
| Red / Orange / Yellow | Red, Orange, Yellow | Phonics, Hand in Hand | No |
| Green / Blue / Navy | Green, Blue, Navy | RC, Grammar, Reading | No |
| Purple | Purple | Debate Purple book | Yes — **purple band** |
| Yeoul / Saemmul | Yeoul, Saemmul | Debate Yeoul/Saemmul | Yes — **yeoulSaemmul band** |
| Bada / Garam | Bada, Garam | Senior waterflow + debate | Yes — **senior band** |
| Mirinae / Byeolmaru | Mirinae, Byeolmaru | Senior waterflow + debate | Yes — **senior band** |

### Middle school (중등) — grade cohorts

| Grade | Korean levels | English aliases (class line) | Debate band |
|-------|---------------|------------------------------|-------------|
| 중1 (MS1) | 유마, 레오, 파보, 폴라 | Yuma, **Leo**, Pavo, Pola | **senior** |
| 중2 (MS2) | 홍스, 티카, 빅키, 바이컬 | Hongs, Tika, Bigkey, Bikel | **senior** |
| 중3 (MS3) | 안나, 랑가, 로체, 캉첸 | Anna, Langga, Loche, Kangchen | **senior** |

**All middle-school debate classes use the Garam+ (senior) debate curriculum** — same monthly Day 1–4 cycle and essay expectations as Garam/Bada/Byeolmaru/Mirinae elementary debate.

---

## 2. Debate monthly cycle (syllabus Day 1–4)

From debate curriculum templates (`buildDebateRowTemplates`):

| Day | Focus | Essay relevance |
|-----|--------|-----------------|
| **Day 1** | Vocabulary, reading, find argument/warrant/evidence for pro/con | Builds motion understanding |
| **Day 2** | Complete speech templates (p. 20–25), rebuttals | Template phrases introduced |
| **Day 3** | Memorize completed speech / templates | Oral practice |
| **Day 4 / Preview** | **Write persuasive essay** (opposite opinion of debate role) + preview next unit | **This is what the batch grader scores** |

Day 4 essay instruction (syllabus): *"Write an essay with the opposite opinion of your debate speech. TRY NOT TO COPY EXACTLY FROM THE BOOK. See p. 34–35 for a good example essay."* (p. 30–31 for Purple band.)

Essay structure taught in class:

- **4 paragraphs:** Intro → Body 1 → Body 2 → Conclusion  
- Built from **Day 1 motion**, **Day 2 clash points**, **Day 3 debate templates**

---

## 3. Essay tier hierarchy (what to grade against)

Grade each student against **one tier only**. Do not compare B/C template writers to A-level academic prose.

### Tier A — Academic persuasive (A-Level)

**Who:** Advanced students explicitly writing academic style (often MS2+ or strong Garam+).  
**Markers:** Rhetorical intro question; "First, from an economic perspective"; "Second, from a social perspective"; formal conclusion without "I agree with the motion that…"  
**Example:** Rent Freezes A-Level essay (reference model).  
**Typical score if requirements met:** 17–20 / 20

### Tier B/C — IPE / debate template (most MS1 & template-track classes)

**Who:** Leo, Pavo, and most debate students using class templates. **IPE** = template-based persuasive writing track (secondary schedule block).  
**Markers (REQUIRED — reward, do not penalize):**

- `I agree with the motion that…`
- `The most important reason is that…`
- `I think this is important because…`
- `For example,…`
- `The next important reason is that…`
- `I believe this matters because…`
- `In conclusion, I agree with the motion because…`
- `Therefore,…`

**Examples:** Zoos vs Wild essay, Worker Profits / Samsung essay (reference models).  
**Typical score if 4 paragraphs + 2 reasons + 2 examples + ≥7 sentences:** 14–17 / 20

### Tier Purple (simplified)

**Who:** Purple elementary debate only.  
**Markers:** Same template family but shorter; teacher provides more sentence frames.  
**Typical score if requirements met:** 13–16 / 20

### Tier Yeoul / Saemmul

**Who:** Yeoul, Saemmul elementary debate.  
**Markers:** B/C templates with extra modeling on Day 2–3.  
**Typical score if requirements met:** 14–17 / 20

---

## 4. Class name → level resolution (batch input line 2)

The grader reads **line 2** as `className`. Match case-insensitively:

| If class line contains | Resolve to | Essay tier default |
|------------------------|------------|-------------------|
| leo, 레오 | 중1 / Leo | B/C template |
| pavo, pabo, 파보 | 중1 / Pavo | B/C template |
| yuma, 유마 | 중1 / Yuma | B/C template |
| pola, polla, 폴라 | 중1 / Pola | B/C template |
| hongs, 홍스 | 중2 | B/C or A if academic |
| tika, 티카 | 중2 | B/C or A |
| bigkey, 빅키 | 중2 | B/C or A |
| bikel, 바이컬 | 중2 | B/C or A |
| anna, 안나 | 중3 | B/C or A |
| langga, 랑가 | 중3 | B/C or A |
| loche, 로체 | 중3 | B/C or A |
| kangchen, 캉첸 | 중3 | B/C or A |
| purple | Purple debate | Purple tier |
| yeoul, 여울 | Yeoul debate | Yeoul/Saemmul tier |
| saemmul, 샘물 | Saemmul debate | Yeoul/Saemmul tier |
| garam, 가람 | Garam+ debate | B/C template (A if academic style) |
| bada, 바다 | Garam+ debate | B/C template |
| byeolmaru, 별마루 | Garam+ debate | B/C template |
| mirinae, 미리내 | Garam+ debate | B/C template |

If no match: infer tier from **essay style** (template phrases → B/C; academic → A).

---

## 5. Scoring rules by tier

### All debate tiers

- **Content (0–10):** Motion clear? Two reasons? Two examples? On-topic?  
- **Structure (0–5):** Four paragraphs? Each body has reason + explanation + example?  
- **Grammar (0–5):** ESL-appropriate; minor errors OK; deduct by pattern not per typo.

### Do NOT penalize

- Formulaic template language at B/C tier  
- Korean-influenced word order if meaning is clear  
- Simple vocabulary when appropriate for level  

### Deduct more only when

- Missing entire paragraph  
- Off-topic / wrong motion  
- No examples  
- Under 7 sentences (deduct 1–2 content points, not fail)  
- Copied verbatim from textbook with no original wording (mention in feedback)

---

## 6. Other essay types (non-debate)

| Essay type in grader | Program context |
|----------------------|-----------------|
| news-response | RC / News classes (Green–Navy, Simson Reading) |
| opinion | Write Now, Write Right, Early Writers |
| argumentative | Debate Day 4 / IPE persuasive (this document) |

---

## 7. Maintenance

When Class Calendar syllabi change:

1. Update `js/syllabus-curricula-data.js` (debate templates, bands).  
2. Sync this file and `SIMSON_LEVEL_CONTEXT` in the HTML grader.  
3. Bump `LEVEL_CONTEXT_VERSION` in the grader to invalidate prompt cache.

### Grader prompt sync (ESL leniency + sentence metrics)

The HTML grader also maintains:

- **`ESL_LENIENCY_BLOCK`** — global do-not-penalize and per-dimension scoring guidance (injected into every grading prompt). Affects scores only—not checklist reporting.
- **`rule_esl_global`** — default rule for all essay types (`RULES_VERSION`); bump version when changing default rules so users receive updates.
- **`countEssaySentences()` / `buildEssayMetricsBlock()`** — pre-computed sentence and evidence metrics sent to the LLM in the user message.
- **`PROMPT_TEMPLATE_VERSION`** — bump when changing `buildGradingPrompt()` or `FEEDBACK_STYLE_BLOCK`.

### Rule checklist pipeline (chips + feedback)

Built-in and custom rules may include:

| Field | Purpose |
|-------|---------|
| `checklistCriteria` | Pass/fail questions the LLM must evaluate |
| `failureChips` | Short labels shown as chips when a check fails |
| `detectable` | `{ type: sentenceMin \| evidenceMin \| paragraphMin, value: N }` for JS verification |

Flow: `getApplicableRules()` → numbered **RULE CHECKLIST** in prompt → LLM returns `ruleResults` + `checklistIssues` → `normalizeGradingResponse()` merges JS detectable checks → chips render from `checklistIssues`.

**MS1 News Response built-ins** (Leo/Yuma, `news-response`): minimum 7 sentences, intro/body/conclusion, 2 evidences, Present Perfect + adjective clauses.

AI-generated custom rules (`generateRule`) also produce `checklistCriteria`, `failureChips`, and optional `detectable`.

Teacher feedback length is flexible (6–12 sentences) based on how many checklist items failed; each failure must appear in feedback.

---

*Last synced from Class Calendar Multi User debate curricula and SIMSON_LEVEL_GROUPS.*
