# Middle school — levels, cohorts and sample timetables

Source: the academy's printed flyer **심슨어학원 중등 커리큘럼 / Simson Middle School** (photo: [`middle-school-curriculum-flyer.jpg`](middle-school-curriculum-flyer.jpg)), added Nov 2026.
Machine-readable copy: [`middle-school.json`](middle-school.json).
Elementary: see [`elementary.md`](elementary.md).

`js/schedule-matrix-data.js` holds these timetables (programTrack `middleSchool`) since Nov 2026: "Debate or RC" defaults to Debate, "LC or VOCA" to LC, 중3 RC 1 is the RC class, and the once-a-week class is pattern `mon`. Generate subjects uses them only when TMS has no timetable for the cohort.

## Subjects (과목)

| Subject | What it is (flyer) |
|--|--|
| News | 뉴스와 세기의 명연설을 통해 영어로 세상 보기 — current news and famous speeches |
| Debate | 시사뉴스에 대한 Debate로 4대영역 비판적 사고 기르기 — debate on current affairs |
| RC (실전모의고사 & Reading) | 매주 수능 모의고사와 구문학습 — weekly 수능 mock test and sentence-structure study |
| Grammar | 영작 중심의 문법, 에세이 쓰기, 중등 서술형 대비 — writing-centred grammar |
| Vocabulary (VOCA) | 수준별 단어 부교재와 수능 모의고사 단어 |
| 내신완성 | 학교별/수준별 프린트 & 수행평가 첨삭 관리 — school-exam prep (not on the sample timetables) |
| LC | Listening (Pre-Basic only, alternates with VOCA) |
| Mentoring | Only on the once-a-week Monday class |

## Levels and cohorts (레벨 구성)

Each level has one cohort per school year. Levels run low → high left to right.

| Level | 수능 score | 중1 | 중2 | 중3 |
|--|--|--|--|--|
| Pre-Basic | 50 이하 | S1 | S2 | S3 |
| Basic | 50 / 55 / 60 | 유마 | 홉스 | 안나 |
| Inter-low | 65 / 70 / 75 | 레오 | 티카 | 낭가 |
| Inter-high | 70 / 75 / 80 | 파보 | 빅키 | 로체 |
| Advanced | 80 / 85 / 90 | 폴라 | 바이칼 | 캉첸 |

- Score column: one figure per grade (중1 / 중2 / 중3), as printed.
- Scores are averaged on 수능 mock tests: Advanced uses 고2–고3 papers, Inter-high 고1–고2, Inter-low and Basic 고1.
- 중3 starts the 예비고1 (pre-high-school) course from the summer term.

## Sample weekly timetables (커리큘럼 예시 시간표)

Every regular track is **360 minutes a week**: either 3 days × 2 periods (Mon/Wed/Fri) or 2 days × 3 periods (Tue/Thu) — so one period is 60 minutes. This matches the planner's MWF 2 / TT 3 day length. Periods (교시) are counted within the cohort's block (middle school = academy periods 5–8).

### Pre-Basic (중1 / 중2 / 중3)

| 교시 | Mon | Wed | Fri |
|--|--|--|--|
| 1 | RC | RC | Grammar |
| 2 | Grammar | Grammar | LC or VOCA |

| 교시 | Tue | Thu |
|--|--|--|
| 1 | RC | RC |
| 2 | Grammar | Grammar |
| 3 | Grammar | LC or VOCA |

### 중1 / 중2 (Basic and above)

| 교시 | Mon | Wed | Fri |
|--|--|--|--|
| 1 | News | Grammar | News |
| 2 | Grammar | RC | Debate or RC |

| 교시 | Tue | Thu |
|--|--|--|
| 1 | News | News |
| 2 | RC | Grammar |
| 3 | Grammar | Debate or RC |

### 중3 (Basic and above)

| 교시 | Mon | Wed | Fri |
|--|--|--|--|
| 1 | RC 1 | RC 1 | News |
| 2 | Grammar | Grammar | Debate or RC 2 |

| 교시 | Tue | Thu |
|--|--|--|
| 1 | RC 1 | RC 1 |
| 2 | News | Grammar |
| 3 | Grammar | Debate or RC 2 |

### 중2 / 중3 once a week (주 1회, 240 min) — Inter-high and above only

| 교시 | Mon |
|--|--|
| 1 | News |
| 2 | RC |
| 3 | Grammar |
| 4 | Grammar |
| 5 | Mentoring |

5 periods in 240 minutes (≈ 48 min each). This is outside the usual "2 periods MWF" day length — treat it as a special case in the planner.

## Extra courses (특강) — outside the regular timetable

| Course | Who | When |
|--|--|--|
| Debate 실전 특강 (online) | Students who can already speak English | 1×/week, 120 min; day set per group of 6 applicants |
| 원어민 회화 특강 (online) | All middle school (5 per level) | 2×/week, 120 min; day set per group of 5 applicants |
| 자소서 특강 (with 심슨진학연구소) | — | Every summer term |

## Notes for the planner

- "X or Y" slots (Debate or RC, LC or VOCA, Debate or RC 2) depend on the cohort; pick one when building classes.
- "Debate or RC" is in the last period on Fri (MWF) and Thu (Tue/Thu).
- RC 1 / RC 2 on 중3 are two separate RC classes.
