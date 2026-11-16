# Elementary — levels and sample timetables

Source: the academy's printed flyer **심슨어학원 초등 커리큘럼** (photo: [`elementary-curriculum-flyer.jpg`](elementary-curriculum-flyer.jpg)), added Nov 2026.
Machine-readable copy: [`elementary.json`](elementary.json) — same slot shape as `js/schedule-matrix-data.js`.
Middle school: see [`middle-school.md`](middle-school.md).

## Subjects (과목)

| Subject | What it is (flyer) |
|--|--|
| News (Animation) & 앵커되기 | 뉴스를 통한 4대영역 학습 및 세상보기 (애니메이션을 통한 역할극) |
| Debate & Essay | 시사뉴스에 대한 Debate로 4대영역 비판적 사고 기르기 |
| '심독' 토플리딩 — Reading(V) | Simson's own 심독 textbooks; reading towards middle-school 내신 |
| Grammar & Writing | 영작 중심의 문법, 에세이 쓰기, 중등 서술형 대비 문법 |
| 온라인 학습 | 전자 도서 월 5~6권, 영영 풀이 Vocabulary, 듣기평가대비 LC |

Abbreviations on the timetables: Spk & Wr / Wr & Spk = Speaking & Writing; (V) = with vocabulary; News(LC) = News with listening.

## Simson Junior Rainbow — 초등 1~4학년

| Level group | Stage |
|--|--|
| Red / Orange / Yellow | Phonics 완성 |
| Green / Blue / Navy | ESL 확산 |
| Purple G | Bridge |

주니어 Writing: 원어민 Writing 수업, 1분 스피치 (Navy).

### Red / Orange / Yellow

| 교시 | Mon | Wed | Fri |
|--|--|--|--|
| 1 | Phonics | Phonics | Spk & Wr |
| 2 | Spk & Wr | Animation | Animation |

| 교시 | Tue | Thu |
|--|--|--|
| 1 | Phonics | Phonics |
| 2 | Spk & Wr | Spk & Wr |
| 3 | Animation | Animation |

### Green / Blue / Navy

| 교시 | Mon | Wed | Fri |
|--|--|--|--|
| 1 | Reading | Reading | Wr & Spk |
| 2 | Wr & Spk | Animation | Animation |

| 교시 | Tue | Thu |
|--|--|--|
| 1 | Reading | Reading |
| 2 | Wr & Spk | Wr & Spk |
| 3 | Animation | Animation |

### Purple G

| 교시 | Mon | Wed | Fri |
|--|--|--|--|
| 1 | Reading(V) | Reading(V) | News |
| 2 | News | Debate | Grammar |

| 교시 | Tue | Thu |
|--|--|--|
| 1 | Reading(V) | Reading(V) |
| 2 | News | News |
| 3 | Grammar | Debate |

## Simson Senior Waterflow — 초등 4~6학년

Levels and 기준 점수 (TOEFL Junior):

| Level | Score |
|--|--|
| 샘물 | 680 |
| 여울 | 700 |
| 가람 | 740 |
| 바다 | 780 |
| 미리내 | 820 (iBT 80) |
| 별마루 | 870 이상 (iBT 90) |

시니어 Writing: 뉴스 연계 Essay, 디베이트 연계 Essay, 쓰기 중심 문법.

### 샘물 / 여울

| 교시 | Mon | Wed | Fri |
|--|--|--|--|
| 1 | News | News | Reading(V) |
| 2 | Reading(V) | Debate | Grammar |

| 교시 | Tue | Thu |
|--|--|--|
| 1 | News | News |
| 2 | Reading(V) | Debate |
| 3 | Grammar | Reading(V) |

### 가람 / 바다

| 교시 | Mon | Wed | Fri |
|--|--|--|--|
| 1 | News(LC) | News | Debate |
| 2 | Reading(V) | Grammar | Reading(V) |

| 교시 | Tue | Thu |
|--|--|--|
| 1 | News(LC) | News |
| 2 | Debate | Reading(V) |
| 3 | Reading(V) | Grammar |

### 미리내 / 별마루

| 교시 | Mon | Wed | Fri |
|--|--|--|--|
| 1 | News(LC) | Debate | TOEFL RC(V) |
| 2 | Grammar | TOEFL RC(V) | Grammar |

| 교시 | Tue | Thu |
|--|--|--|
| 1 | News(LC) | Debate |
| 2 | TOEFL RC(V) | TOEFL RC(V) |
| 3 | Grammar | Grammar |

## Differences from the app's current matrix (`js/schedule-matrix-data.js`)

Compared with Reading(V) = `ipkV` and TOEFL RC(V) = `toeflRc`. The app data was **not** changed — the flyer is a sample timetable and may not match the real term.

| Level(s) | Slot | Flyer | App |
|--|--|--|--|
| Red / Orange / Yellow | Fri 1 | Spk & Wr | phonics |
| Red / Orange / Yellow | Fri 2 | Animation | spkWr |
| Purple | Wed 2, Thu 3 | Debate | ipeNative |
| 샘물 / 여울 | Wed 2, Thu 2 | Debate | ipeNative |
| 샘물 / 여울 | Fri 1 | Reading(V) | news |
| 샘물 / 여울 | Fri 2 | Grammar | ipkV |
| 가람 / 바다 | Thu 1 | News | newsLc |

Everything else matches.
