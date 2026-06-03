/**
 * PDF-derived session templates (day-independent). Source: Reference/Syllabi/Sample Syllabi/.
 */
(function (global) {
    const GR_PLAN_DETAIL = `<수업>
1) 과제검사
2) 문제풀이
3) 시험
<과제>
1) 문법공부계획표 작성
2) 문법공부
3) 문법문제풀이
4) 문법시험`;

    const RC_GREENBLUE_DETAIL = `<수업>
1) 과제검사
2) 단어시험 (10분)
3) 본 수업 (30~35분)
- 원어수업
<과제>
1) 음원듣고 따라읽기
2) 해석숙제
3) 워크북 (복습 숙제)
4) 단어시험준비
- 주 1회 진행
5) 틀린 단어 오답 해오기`;

    const RC_NAVY_DETAIL = `<수업>
1) 출석체크
2) 단어 or 해석시험 (10분)
- 단어 : 20개 중 10개 시험
- 해석 : 유닛당 5문장 시험
* 단어&해석 시험 매주 진행
3) 과제 확인 및 채점 (10분)
4) 본 수업(35-40분)
- New Words
- 본문해석 & 문제풀이
- RC Chart & Summary
- Grammar
<과제>
1) 음원 듣고 멘트 싸인받기
2) 배운 내용 해석(Subnote)
3) 매 유닛 학습 후, 워크북
4) 필수보카 / 해석 시험준비
5) 단어/ 해석시험 오답`;

    const RC_SAEMMUL_DETAIL = `<수업>
1) 과제검사
2) 단어시험 (10분)
3) 본 수업 (30~35분)
- RC Reading
<과제>
1) 음원듣고 따라읽기
2) 해석숙제
3) 워크북
4) 단어시험준비
5) 틀린 단어 오답`;

    const SIMDOK_DETAIL = `<수업>
1) 출석체크
2) 단어 or 해석시험 (10분)
3) 과제 확인 및 채점 (10분)
4) 본 수업(35-40분)
<과제>
1회차: 음원듣기, 문장해석, 단어정리, RC 문제풀기
2회차: 음원듣기, 문장해석, Fix&Arrange, Essay Builder, 온라인보카, 다음유닛 보카+셀프리딩`;

    const PHONICS_RED_DETAIL = `<수업>
1) 파닉스 본 수업
2) 책 따라 읽기 / 쓰기
<과제>
1) 음원 듣기
2) 워크북
3) 복습`;

    /** Hand in Hand 1–3: shared SB pagination (22 lessons); Red includes verified listening tracks. Holidays/extra days come from the calendar. */
    const HAND_IN_HAND_LISTENING_PATH =
        '[음원경로] : 통합자료실 → [반이름] → [교재이름] 교재파일 다운';
    const HAND_IN_HAND_PARENT_SIGN =
        'Parents can sign on the homework checklist when completed';
    const HAND_IN_HAND_INCOMPLETE_HW = 'If not completed in class, it is homework.';

    const HAND_IN_HAND_LESSONS = [
        { sb: 'Unit 1 – Pages 4-7', worksheet: 1, tracks: [2, 4], homeworkHeading: false },
        { sb: 'Unit 1 – Pages 8-11', tracks: [5, 9] },
        { sb: 'Unit 2 – Pages 12-15', worksheet: 2, tracks: [10, 16] },
        { sb: 'Unit 2 – Pages 16-19', pb: 'p 1', tracks: [17, 19] },
        { sb: 'Unit 3 – Pages 20-23', worksheet: 3, tracks: [20, 25] },
        { sb: 'Units 3 & 4 – Pages 24-27', tracks: [26, 30] },
        { sb: 'Unit 4 – Pages 28-31', worksheet: 4, tracks: [31, 36] },
        { sb: 'Units 4 & 5 – Pages 32-35', pb: 'p 3', tracks: [37, 40] },
        { sb: 'Unit 5 – Pages 36-39', worksheet: 5, tracks: [41, 46] },
        { sb: 'Unit 6 – Pages 40-43', worksheet: 6, tracks: [47, 52] },
        { sb: 'Unit 6 – Pages 44-47', pb: 'p 5', tracks: [53, 55] },
        { sb: 'Unit 7 – Pages 48-51', worksheet: 7, tracks: [56, 61] },
        { sb: 'Units 7 & 8 – Pages 52-55', tracks: [62, 65] },
        { sb: 'Unit 8 – Pages 56-59', worksheet: 8, tracks: [66, 71] },
        {
            sb: 'Units 8 & 9 – Pages 60-63',
            pb: 'p 7-8',
            tracks: [72, 75],
            incompleteInClass: false,
            homeworkHeading: false
        },
        { sb: 'Unit 9 – Pages 64-67', worksheet: 9, tracks: [76, 80] },
        { sb: 'Unit 10 – Pages 68-71', worksheet: 10, tracks: [81, 87] },
        { sb: 'Unit 10 – Pages 72-75', pb: 'p 9', tracks: [88, 90] },
        { sb: 'Unit 11 – Pages 76-79', worksheet: 11, tracks: [91, 97] },
        { sb: 'Units 11 & 12 – Pages 80-83', tracks: [98, 102] },
        { sb: 'Unit 12 – Pages 84-87', worksheet: 12, tracks: [103, 107] },
        { sb: 'Unit 12, Review Pages 88-93', pb: 'p 11', tracks: [108, 118] }
    ];

    function handInHandLessonTitle(lesson) {
        const parts = [`Student Book: ${lesson.sb}`];
        if (lesson.pb) {
            parts[0] += `, PB ${lesson.pb}`;
        }
        return parts[0];
    }

    function handInHandFormatTracks(tracks) {
        if (!tracks || tracks.length < 2) {
            return '';
        }
        if (tracks[0] === tracks[1]) {
            return `Tracks: ${tracks[0]}`;
        }
        return `Tracks: ${tracks[0]}-${tracks[1]}`;
    }

    function handInHandPlanDetail(lesson, level) {
        const lines = ['Covered in Class:', `Student Book: ${lesson.sb}`];
        if (lesson.worksheet != null) {
            lines.push(`Worksheet ${lesson.worksheet}`);
        }
        if (lesson.pb) {
            lines.push(`PB ${lesson.pb}`);
        }
        if (lesson.incompleteInClass !== false) {
            lines.push(HAND_IN_HAND_INCOMPLETE_HW);
        }
        const includeListening = level === 'Red' && lesson.tracks;
        if (includeListening) {
            if (lesson.homeworkHeading !== false) {
                lines.push('Homework:');
            }
            lines.push(HAND_IN_HAND_LISTENING_PATH, handInHandFormatTracks(lesson.tracks));
        }
        lines.push(HAND_IN_HAND_PARENT_SIGN);
        return lines.join('\n');
    }

    const HAND_IN_HAND_SESSION_COUNT = HAND_IN_HAND_LESSONS.length;

    const SESSION_KIND_LABEL = {
        speak: 'Speaking',
        write: 'Writing',
        project: 'Project',
        review: 'Review'
    };

    function formatPageRange(range, sep) {
        if (!range || range.length < 2) {
            return '';
        }
        const dash = sep != null ? sep : '–';
        return `p.${range[0]}${dash}${range[1]}`;
    }

    function formatPageRangeDetail(range) {
        return formatPageRange(range, '-');
    }

    /**
     * Write Right 1–3: SB/WB ranges per Lesson A/B; two combined project days (18 sessions).
     */
    const WRITE_RIGHT_LESSONS = [
        { lesson: 1, speak: { sb: [8, 11], wb: [3, 4] }, write: { sb: [12, 15], wb: [5, 5] } },
        { lesson: 2, speak: { sb: [16, 19], wb: [7, 8] }, write: { sb: [20, 23], wb: [9, 9] } },
        { lesson: 3, speak: { sb: [24, 27], wb: [11, 12] }, write: { sb: [28, 31], wb: [13, 13] } },
        { lesson: 4, speak: { sb: [32, 35], wb: [15, 16] }, write: { sb: [36, 39], wb: [17, 17] } },
        { lesson: 5, speak: { sb: [40, 43], wb: [19, 20] }, write: { sb: [44, 47], wb: [21, 21] } },
        { lesson: 6, speak: { sb: [48, 51], wb: [23, 24] }, write: { sb: [52, 55], wb: [25, 25] } },
        { lesson: 7, speak: { sb: [56, 59], wb: [27, 28] }, write: { sb: [60, 63], wb: [29, 29] } },
        { lesson: 8, speak: { sb: [64, 67], wb: [31, 32] }, write: { sb: [68, 71], wb: [33, 33] } }
    ];

    const WRITE_RIGHT_PROJECT_BLOCKS = [
        { label: 'Writing Project 1 & 2', sbRanges: [[72, 73], [74, 75]] },
        { label: 'Writing Project 3 & 4', sbRanges: [[76, 77], [78, 79]] }
    ];

    const WRITE_RIGHT_SESSION_COUNT = WRITE_RIGHT_LESSONS.length * 2 + WRITE_RIGHT_PROJECT_BLOCKS.length;

    const WRITE_RIGHT_INCOMPLETE_HW = 'If students could not complete in class it is homework.';

    function formatWriteRightSbWbDetail(sb, wb) {
        const sbPart = `SB ${formatPageRangeDetail(sb)}`;
        if (!wb) {
            return sbPart;
        }
        return `${sbPart}, WB ${formatPageRangeDetail(wb)}`;
    }

    function formatWriteRightSbListDetail(sbRanges) {
        return sbRanges.map(r => formatPageRangeDetail(r)).join(', ');
    }

    function buildWriteRightSessionSpecs() {
        const specs = [];
        WRITE_RIGHT_LESSONS.forEach(row => {
            specs.push({
                kind: 'speak',
                lesson: row.lesson,
                part: 'A',
                sbRange: row.speak.sb,
                wbRange: row.speak.wb
            });
            specs.push({
                kind: 'write',
                lesson: row.lesson,
                part: 'B',
                sbRange: row.write.sb,
                wbRange: row.write.wb
            });
        });
        WRITE_RIGHT_PROJECT_BLOCKS.forEach(block => {
            specs.push({
                kind: 'project',
                projectLabel: block.label,
                sbRanges: block.sbRanges
            });
        });
        return specs;
    }

    function writeRightBookLabel(bookNum) {
        if (bookNum == null || bookNum === '') {
            return 'Write Right';
        }
        return `Write Right ${bookNum}`;
    }

    function writeRightPlanTitle(spec) {
        const typeLabel = SESSION_KIND_LABEL[spec.kind] || spec.kind;
        if (spec.kind === 'project') {
            return `${spec.projectLabel} – ${typeLabel} (${formatWriteRightSbListDetail(spec.sbRanges)})`;
        }
        return `Lesson ${spec.lesson}${spec.part} – ${typeLabel} (${formatPageRange(spec.sbRange)})`;
    }

    function writeRightPlanDetail(bookNum, spec) {
        const book = writeRightBookLabel(bookNum);
        const typeLabel = SESSION_KIND_LABEL[spec.kind] || spec.kind;
        if (spec.kind === 'project') {
            return `<${typeLabel} — ${book}, ${spec.projectLabel}>
Covered in class: ${formatWriteRightSbListDetail(spec.sbRanges)}
${WRITE_RIGHT_INCOMPLETE_HW}`;
        }
        return `<${typeLabel} — ${book}, Lesson ${spec.lesson}${spec.part}>
Covered in class: ${formatWriteRightSbWbDetail(spec.sbRange, spec.wbRange)}
${WRITE_RIGHT_INCOMPLETE_HW}`;
    }

    function buildWriteRightTemplates(bookNum) {
        return buildWriteRightSessionSpecs().map((spec, i) => ({
            sessionNumber: i + 1,
            planTitle: writeRightPlanTitle(spec),
            planDetail: writeRightPlanDetail(bookNum, spec)
        }));
    }

    /**
     * Early Writers 1–3: Unit [1/2]/[2/2] with SB/WB ranges; mid-term projects/revision; level test (21 sessions).
     */
    const EARLY_WRITERS_UNITS = [
        { unit: 1, speak: { sb: [8, 11], wb: [2, 2] }, write: { sb: [12, 15], wb: [3, 3] } },
        { unit: 2, speak: { sb: [16, 19], wb: [4, 4] }, write: { sb: [20, 23], wb: [5, 5] } },
        { unit: 3, speak: { sb: [24, 27], wb: [6, 6] }, write: { sb: [28, 31], wb: [7, 7] } },
        { unit: 4, speak: { sb: [32, 35], wb: [8, 8] }, write: { sb: [36, 39], wb: [9, 9] } },
        { unit: 5, speak: { sb: [40, 43], wb: [10, 10] }, write: { sb: [44, 47], wb: [11, 11] } },
        { unit: 6, speak: { sb: [48, 51], wb: [12, 12] }, write: { sb: [52, 55], wb: [13, 13] } },
        { unit: 7, speak: { sb: [56, 59], wb: [14, 14] }, write: { sb: [60, 63], wb: [15, 15] } },
        { unit: 8, speak: { sb: [64, 67], wb: [16, 16] }, write: { sb: [68, 71], wb: [17, 17] } }
    ];

    const EARLY_WRITERS_AFTER_UNIT_5 = [
        { kind: 'special', title: 'Project #1 (Handouts) / Reviews' },
        { kind: 'special', title: 'Level Test Revision Week' },
        { kind: 'special', title: 'Level Test Revision Week' }
    ];

    const EARLY_WRITERS_AFTER_UNIT_6 = [
        { kind: 'special', title: '(4/28) Level Test' }
    ];

    const EARLY_WRITERS_AFTER_UNIT_7 = [
        { kind: 'special', title: 'Project #2 (Handouts) / Reviews' }
    ];

    const EARLY_WRITERS_WR_SESSION_COUNT = 21;

    const EARLY_WRITERS_INCOMPLETE_HW = 'If students could not complete in class it is homework.';

    function earlyWritersBookLabel(bookNum) {
        if (bookNum == null || bookNum === '') {
            return 'Early Writers';
        }
        return `Early Writers ${bookNum}`;
    }

    function formatEarlyWritersBookPages(range) {
        if (!range || range.length < 2) {
            return '';
        }
        if (range[0] === range[1]) {
            return `Page ${range[0]}`;
        }
        return `Pages ${range[0]}-${range[1]}`;
    }

    function formatEarlyWritersClassLine(sb, wb) {
        const parts = [`Student Book: ${formatEarlyWritersBookPages(sb)}`];
        if (wb) {
            parts.push(`Workbook: ${formatEarlyWritersBookPages(wb)}`);
        }
        return parts.join(' / ');
    }

    function pushEarlyWritersUnitSpecs(specs, unitRow) {
        specs.push({
            kind: 'speak',
            unit: unitRow.unit,
            sbRange: unitRow.speak.sb,
            wbRange: unitRow.speak.wb
        });
        specs.push({
            kind: 'write',
            unit: unitRow.unit,
            sbRange: unitRow.write.sb,
            wbRange: unitRow.write.wb
        });
    }

    function buildEarlyWritersSessionSpecs() {
        const specs = [];
        for (let u = 1; u <= 5; u += 1) {
            pushEarlyWritersUnitSpecs(specs, EARLY_WRITERS_UNITS[u - 1]);
        }
        EARLY_WRITERS_AFTER_UNIT_5.forEach(row => {
            specs.push({ kind: row.kind, title: row.title });
        });
        pushEarlyWritersUnitSpecs(specs, EARLY_WRITERS_UNITS[5]);
        EARLY_WRITERS_AFTER_UNIT_6.forEach(row => {
            specs.push({ kind: row.kind, title: row.title });
        });
        pushEarlyWritersUnitSpecs(specs, EARLY_WRITERS_UNITS[6]);
        EARLY_WRITERS_AFTER_UNIT_7.forEach(row => {
            specs.push({ kind: row.kind, title: row.title });
        });
        pushEarlyWritersUnitSpecs(specs, EARLY_WRITERS_UNITS[7]);
        return specs;
    }

    function earlyWritersPlanTitle(spec) {
        if (spec.kind === 'special') {
            return spec.title;
        }
        const typeLabel = SESSION_KIND_LABEL[spec.kind] || spec.kind;
        const half = spec.kind === 'speak' ? '[1/2]' : '[2/2]';
        return `Unit ${spec.unit} ${half} – ${typeLabel} (${formatPageRange(spec.sbRange)})`;
    }

    function earlyWritersPlanDetail(bookNum, spec) {
        const book = earlyWritersBookLabel(bookNum);
        if (spec.kind === 'special') {
            return `${spec.title}
${EARLY_WRITERS_INCOMPLETE_HW}`;
        }
        const typeLabel = SESSION_KIND_LABEL[spec.kind] || spec.kind;
        const half = spec.kind === 'speak' ? '[1/2]' : '[2/2]';
        return `<${typeLabel} — ${book}, Unit ${spec.unit} ${half}>
${formatEarlyWritersClassLine(spec.sbRange, spec.wbRange)}
${EARLY_WRITERS_INCOMPLETE_HW}`;
    }

    function buildEarlyWritersTemplates(bookNum) {
        const bookLabel = earlyWritersBookLabel(bookNum);
        return buildEarlyWritersSessionSpecs().map((spec, i) => ({
            sessionNumber: i + 1,
            planTitle: earlyWritersPlanTitle(spec),
            planDetail: earlyWritersPlanDetail(bookNum, spec)
        }));
    }

    /**
     * The Best Writing Starter 1–3: shared SB ranges; Unit N-1 / N-2 + 2 review days.
     */
    const BWS_UNITS = [
        { unit: 1, part1Sb: [8, 11], part2Sb: [12, 15] },
        { unit: 2, part1Sb: [16, 19], part2Sb: [20, 23] },
        { unit: 3, part1Sb: [24, 27], part2Sb: [28, 31] },
        { unit: 4, part1Sb: [32, 35], part2Sb: [36, 39] },
        { unit: 5, part1Sb: [44, 47], part2Sb: [48, 51] },
        { unit: 6, part1Sb: [52, 55], part2Sb: [56, 59] },
        { unit: 7, part1Sb: [60, 63], part2Sb: [64, 67] },
        { unit: 8, part1Sb: [68, 71], part2Sb: [72, 75] }
    ];

    const BWS_REVIEWS = [
        { review: 1, sb: [40, 43] },
        { review: 2, sb: [76, 79] }
    ];

    const BWS_UNIT_COUNT = 8;
    const BWS_SESSION_COUNT = BWS_UNIT_COUNT * 2 + BWS_REVIEWS.length;

    const BWS_HW_EVERY_OTHER_DAY = 'Homework will be assigned only every other day.';

    function buildBestWritingStarterSessionSpecs() {
        const specs = [];
        for (let unit = 1; unit <= BWS_UNIT_COUNT; unit += 1) {
            const u = BWS_UNITS[unit - 1];
            specs.push({ kind: 'speak', unit, sbRange: u.part1Sb });
            specs.push({ kind: 'write', unit, sbRange: u.part2Sb });
            if (unit === 4) {
                specs.push({ kind: 'review', review: 1, sbRange: BWS_REVIEWS[0].sb });
            }
            if (unit === 8) {
                specs.push({ kind: 'review', review: 2, sbRange: BWS_REVIEWS[1].sb });
            }
        }
        return specs;
    }

    function bestWritingStarterBookLabel(bookNum) {
        if (bookNum == null || bookNum === '') {
            return 'The Best Writing Starter';
        }
        return `The Best Writing Starter ${bookNum}`;
    }

    function bestWritingStarterPlanTitle(spec) {
        const typeLabel = SESSION_KIND_LABEL[spec.kind] || spec.kind;
        if (spec.kind === 'review') {
            return `Review ${spec.review} – ${typeLabel} (${formatPageRange(spec.sbRange)})`;
        }
        const partNum = spec.kind === 'speak' ? '1' : '2';
        return `Unit ${spec.unit}-${partNum} – ${typeLabel} (${formatPageRange(spec.sbRange)})`;
    }

    function bestWritingStarterPlanDetail(bookNum, spec) {
        const book = bestWritingStarterBookLabel(bookNum);
        const typeLabel = SESSION_KIND_LABEL[spec.kind] || spec.kind;
        if (spec.kind === 'review') {
            return `<${typeLabel} — ${book}, Review ${spec.review}>
Covered in class: Student Book ${formatPageRangeDetail(spec.sbRange)}
Homework: ${BWS_HW_EVERY_OTHER_DAY}`;
        }
        const partNum = spec.kind === 'speak' ? '1' : '2';
        const homework = spec.kind === 'speak'
            ? BWS_HW_EVERY_OTHER_DAY
            : `Portfolio book Unit ${spec.unit}`;
        return `<${typeLabel} — ${book}, Unit ${spec.unit}-${partNum}>
Covered in class: Student Book ${formatPageRangeDetail(spec.sbRange)}
Homework: ${homework}`;
    }

    function buildBestWritingStarterTemplates(bookNum) {
        return buildBestWritingStarterSessionSpecs().map((spec, i) => ({
            sessionNumber: i + 1,
            planTitle: bestWritingStarterPlanTitle(spec),
            planDetail: bestWritingStarterPlanDetail(bookNum, spec)
        }));
    }

    /**
     * Write Now 1–3: shared SB/WB page ranges (books 1–3); Part 1/2 per unit + projects.
     */
    const WRITE_NOW_UNITS = [
        { unit: 1, part1Sb: [8, 11], part1Wb: [2, 3], part2Sb: [12, 15], part2Wb: [4, 5], listening: 1 },
        { unit: 2, part1Sb: [16, 19], part1Wb: [6, 7], part2Sb: [20, 23], part2Wb: [8, 9], listening: 2 },
        { unit: 3, part1Sb: [26, 29], part1Wb: [10, 11], part2Sb: [30, 33], part2Wb: [12, 13], listening: 3 },
        { unit: 4, part1Sb: [34, 37], part1Wb: [14, 15], part2Sb: [38, 41], part2Wb: [16, 17], listening: 4 },
        { unit: 5, part1Sb: [44, 47], part1Wb: [18, 19], part2Sb: [48, 51], part2Wb: [20, 21], listening: 5 },
        { unit: 6, part1Sb: [52, 55], part1Wb: [22, 23], part2Sb: [56, 59], part2Wb: [24, 25], listening: 6 },
        { unit: 7, part1Sb: [62, 65], part1Wb: [26, 27], part2Sb: [66, 69], part2Wb: [28, 29], listening: 7 },
        { unit: 8, part1Sb: [70, 73], part1Wb: [30, 31], part2Sb: [74, 77], part2Wb: [32, 33], listening: 8 }
    ];

    const WRITE_NOW_PROJECTS = [
        { project: 1, sb: [24, 25] },
        { project: 2, sb: [42, 43] },
        { project: 3, sb: [60, 61] },
        { project: 4, sb: [78, 79] }
    ];

    const WRITE_NOW_SESSION_COUNT = 20;

    const WRITE_NOW_LISTENING_PATH_KO =
        '[음원경로] : 통합자료실 → [반이름] → [교재이름] 교재파일 다운';
    const WRITE_NOW_LISTENING_SIGN =
        'Listen 5x, Parents please sign on model writing page when completed.';
    const WRITE_NOW_LISTENING_VIDEO_NOTE = 'See the video file for more details.';
    const WRITE_NOW_PROJECT_READ_HW = 'Students can read project 3x for practice.';
    const WRITE_NOW_PROJECT_PARENT_SIGN = '[ ] [ ] [ ] __________(parent\'s signature.';

    function formatWriteNowPageRange(range) {
        if (!range || range.length < 2) {
            return '';
        }
        return `P.${range[0]}-${range[1]}`;
    }

    function formatWriteNowProjectPageRange(range) {
        if (!range || range.length < 2) {
            return '';
        }
        return `P. ${range[0]}-${range[1]}`;
    }

    function buildWriteNowSessionSpecs() {
        const specs = [];
        for (let block = 0; block < 4; block += 1) {
            const uA = WRITE_NOW_UNITS[block * 2];
            const uB = WRITE_NOW_UNITS[block * 2 + 1];
            [uA, uB].forEach(u => {
                specs.push({
                    kind: 'speak',
                    unit: u.unit,
                    sbRange: u.part1Sb,
                    wbRange: u.part1Wb
                });
                specs.push({
                    kind: 'write',
                    unit: u.unit,
                    sbRange: u.part2Sb,
                    wbRange: u.part2Wb,
                    listening: u.listening
                });
            });
            const proj = WRITE_NOW_PROJECTS[block];
            specs.push({
                kind: 'project',
                project: proj.project,
                sbRange: proj.sb
            });
        }
        return specs;
    }

    function writeNowPlanTitle(spec) {
        if (spec.kind === 'project') {
            return `Project ${spec.project}`;
        }
        const part = spec.kind === 'speak' ? 'Part 1' : 'Part 2';
        return `Unit ${spec.unit} ${part}`;
    }

    function writeNowProjectCoveredLine(spec) {
        const pages = formatWriteNowProjectPageRange(spec.sbRange);
        if (spec.project === 4) {
            return `Project 4 SB ${pages}`;
        }
        return pages;
    }

    function writeNowPlanDetail(spec) {
        if (spec.kind === 'project') {
            const sbEnd = spec.sbRange[1];
            const parentLine = spec.project >= 2
                ? `Parents can sign on the project page. SB ${sbEnd}`
                : 'Parents can sign on the project page.';
            return [
                `Project ${spec.project}`,
                'Covered in Class:',
                writeNowProjectCoveredLine(spec),
                'Homework:',
                WRITE_NOW_PROJECT_READ_HW,
                parentLine,
                WRITE_NOW_PROJECT_PARENT_SIGN
            ].join('\n');
        }
        const part = spec.kind === 'speak' ? 'Part 1' : 'Part 2';
        const heading = `Unit ${spec.unit} ${part}`;
        const coveredUnitLine = spec.kind === 'speak'
            ? `Unit ${spec.unit}`
            : heading;
        const lines = [
            heading,
            'Covered in Class:',
            coveredUnitLine,
            formatWriteNowPageRange(spec.sbRange),
            'Homework:',
            `Workbook: ${formatWriteNowPageRange(spec.wbRange)}`
        ];
        if (spec.kind === 'write' && spec.listening != null) {
            lines.push(
                `Listening Track ${spec.listening}`,
                WRITE_NOW_LISTENING_SIGN,
                WRITE_NOW_LISTENING_PATH_KO
            );
            if (spec.listening <= 2) {
                lines.push(WRITE_NOW_LISTENING_VIDEO_NOTE);
            }
        }
        return lines.join('\n');
    }

    function buildWriteNowTemplates() {
        return buildWriteNowSessionSpecs().map((spec, i) => ({
            sessionNumber: i + 1,
            planTitle: writeNowPlanTitle(spec),
            planDetail: writeNowPlanDetail(spec)
        }));
    }

    function buildHandInHandTemplates(level) {
        return HAND_IN_HAND_LESSONS.map((lesson, i) => ({
            sessionNumber: i + 1,
            planTitle: handInHandLessonTitle(lesson),
            planDetail: handInHandPlanDetail(lesson, level)
        }));
    }

    function sessionsFromTitles(titles, planDetail) {
        return titles.map((planTitle, i) => ({
            sessionNumber: i + 1,
            planTitle,
            planDetail: planDetail || ''
        }));
    }

    function buildUnitPairTitles(count) {
        const titles = ['OT + Unit 1'];
        let unit = 2;
        while (titles.length < count) {
            titles.push(`Unit ${unit} (1/2)`);
            if (titles.length >= count) {
                break;
            }
            titles.push(`Unit ${unit} (2/2)`);
            unit += 1;
        }
        return titles.slice(0, count);
    }

    function buildSimdokTitles(count) {
        const titles = [];
        let unit = 1;
        while (titles.length < count) {
            titles.push(`유닛 ${unit} ( 1 / 2 )`);
            if (titles.length >= count) {
                break;
            }
            titles.push(`유닛 ${unit} ( 2 / 2 )`);
            unit += 1;
        }
        return titles.slice(0, count);
    }

    function grTemplates(count) {
        const rows = [];
        for (let i = 1; i <= count; i += 1) {
            rows.push({
                sessionNumber: i,
                planTitle: i === 1 ? 'OT + Unit 1' : `Unit ${i}`,
                planDetail: GR_PLAN_DETAIL
            });
        }
        return rows;
    }

    const RED_PHONICS_TITLES = [
        '1권 Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5 (Review)', 'Unit 6',
        'Unit 7', 'Unit 8', 'Unit 9', 'Unit 10 (Review)',
        '2권 Unit 1 [단모음]', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5 (Review)', 'Unit 6',
        'Unit 7', 'Unit 8', 'Unit 9', 'Unit 10 (Review)',
        '2권 테스트 / 복습',
        '3권 Unit 1 (1/2)', 'Unit 1 (2/2)', 'Unit 2 (1/2)', 'Unit 2 (2/2)'
    ];

    const NAVY_RC_TITLES = [
        'Unit 1', 'Unit 2', 'Unit 3 (1/2)', 'Unit 3 (2/2)',
        '스피치 작성주간', '스피치 작성주간',
        'Unit 4 (1/2)', 'Unit 4 (2/2)', 'Unit 5 (1/2)', 'Unit 5 (2/2)',
        'Unit 6 (1/2)', 'Unit 6 (2/2)',
        '스피치 촬영주간', '스피치 촬영주간',
        'Unit 7', 'Unit 8', '레벨테스트', '어린이날 행사',
        'Unit 9 (1/2)', 'Unit 9 (2/2)', 'Unit 10 (1/2)', 'Unit 10 (2/2)',
        'Unit 11 (1/2)', 'Unit 11 (2/2)', 'Unit 12 (1/2)', 'Unit 12 (2/2)'
    ];

    const TOEFL_TRC_TITLES = buildUnitPairTitles(20).map((t, i) => {
        if (i === 0) {
            return 'OT + p.1–2';
        }
        const pageStart = 3 + (i - 1) * 2;
        return `p.${pageStart}–${pageStart + 1}`;
    });

    function curriculum(fields) {
        return {
            isBuiltin: true,
            isSyllabusPreset: true,
            scheduleModel: 'sequentialTerm',
            defaultCompressionMode: 'sequentialTerm',
            ...fields
        };
    }

    function debateCurriculum(fields) {
        return curriculum({
            scheduleModel: 'debateMonthly',
            defaultCompressionMode: 'autoWhenNeeded',
            homeworkImportMode: 'debate',
            programTrack: 'debate',
            defaultTotalLessons: 4,
            ...fields
        });
    }

    /** Middle-school section levels (same set as books-editor). */
    const DEBATE_MIDDLE_SCHOOL_LEVEL_IDS = [
        '\uC720\uB9C8', '\uB808\uC624', '\uD30C\uBCF4', '\uD3F4\uB77C',
        '\uD649\uC2A4', '\uD2F0\uCE74', '\uBE45\uD0A4', '\uBC14\uC774\uCEEC',
        '\uC548\uB098', '\uB0AD\uAC00', '\uB85C\uCCB4', '\uCE89\uCCB8'
    ];

    const DEBATE_SENIOR_ELEM_LEVELS = ['Garam', 'Bada', 'Byeolmaru', 'Mirinae'];

    const DEBATE_BAND_LEVELS = {
        purple: ['Purple'],
        yeoulSaemmul: ['Yeoul', 'Saemmul'],
        senior: [...DEBATE_SENIOR_ELEM_LEVELS, ...DEBATE_MIDDLE_SCHOOL_LEVEL_IDS]
    };

    const DEBATE_DAY1_DETAIL = `Vocabulary, p. 7 (Write example sentences)
Reading Comprehension, p. 11 (if not finished during class)
(If not done as preview:
Vocabulary, p.7
Listen 5x, Parents please sign on page 10 when completed.
[음원경로] : 통합자료실 → [반이름] → [교재이름] 교재파일 다운)
And…
Find the argument, warrant, and evidence for each pro and con for each perspective.
See the attached file for hints. Sometimes, not every part will be there, but try your best to find them.`;

    const DEBATE_DAY1_NOTE = 'NOTE: Month 2 outlines are blank. Provide explicit modeling and guidance.';

    const DEBATE_PREVIEW_BLOCK = `Preview next month's material (if possible):
1. Vocabulary, p.7
2. Reading, p.8-10
Listen 5x, Parents please sign on page 10 when completed.
[음원경로] : 통합자료실 → [반이름] → [교재이름] 교재파일 다운`;

    const DEBATE_ESSAY_INTRO = `Write an essay with the opposite opinion of your debate speech. TRY NOT TO COPY EXACTLY FROM THE BOOK PLEASE!
(You can use the ideas but try to use your own words.)`;

    function buildDebateRowTemplates(band) {
        const isPurple = band === 'purple';
        const isYeoulSaemmul = band === 'yeoulSaemmul';
        const day2Pages = isPurple ? '20-21' : '20-25';
        const day2Title = isPurple ? 'Complete Speeches' : 'Complete Speech(es)';
        const day3Memorize = isPurple
            ? 'Memorize the completed speech for your role (ex. read out templates loud 5-10 times)'
            : 'Memorize the completed speeches (ex. read out templates loud 5-10 times)';
        const altDay3Memorize = isPurple || band === 'senior'
            ? 'Memorize the completed speech for your role (ex. read out templates loud 5-10 times)'
            : 'Memorize the completed speeches (ex. read out templates loud 5-10 times)';
        const essayPages = isPurple ? '30-31' : '34-35';

        let combinedDetail;
        if (isPurple || isYeoulSaemmul) {
            combinedDetail = `Complete Templates, p. 20-25
Complete Templates, p. 20-21
Practice each template.
Memorize the completed template for your role (ex. read out templates loud 5-10 times)`;
        } else {
            combinedDetail = `Complete Templates, p. 20-25
Practice each template.
Memorize the completed template for your role (ex. read out templates loud 5-10 times)

Submit your completed essay for feedback 2 days before your next class.`;
        }

        return [
            {
                sessionNumber: 1,
                planTitle: 'Day 1',
                planDetail: DEBATE_DAY1_DETAIL,
                note: DEBATE_DAY1_NOTE
            },
            {
                sessionNumber: 2,
                planTitle: 'Day 2',
                planDetail: `${day2Title}, p. ${day2Pages}
Complete the rebuttals section if not completed in class
Practice your assigned speech(es).`,
                note: 'NOTE: Provide sentence frames and modeling.'
            },
            {
                sessionNumber: 3,
                planTitle: 'Day 3',
                planDetail: day3Memorize,
                note: 'NOTE: Model pronunciation and chunking.'
            },
            {
                planTitle: 'Alt Day 3',
                planDetail: altDay3Memorize,
                note: 'NOTE: Extra support likely needed.'
            },
            {
                planTitle: 'Day 2 & 3 Combined',
                planDetail: combinedDetail
            },
            {
                sessionNumber: 4,
                planTitle: 'Day 4 / Preview',
                planDetail: `${DEBATE_ESSAY_INTRO}
See P. ${essayPages} for a good example essay.

${DEBATE_PREVIEW_BLOCK}`,
                note: 'NOTE: Provide brainstorming + structure support.'
            }
        ];
    }

    function resolveDebateHomeworkBand(level) {
        const t = (level || '').trim();
        if (t === 'Purple') {
            return 'purple';
        }
        if (t === 'Yeoul' || t === 'Saemmul') {
            return 'yeoulSaemmul';
        }
        if (DEBATE_SENIOR_ELEM_LEVELS.includes(t) || DEBATE_MIDDLE_SCHOOL_LEVEL_IDS.includes(t)) {
            return 'senior';
        }
        return null;
    }

    function resolveDebatePresetId(level) {
        const band = resolveDebateHomeworkBand(level);
        if (band === 'purple') {
            return 'preset-debate-purple';
        }
        if (band === 'yeoulSaemmul') {
            return 'preset-debate-yeoul-saemmul';
        }
        if (band === 'senior') {
            return 'preset-debate-senior';
        }
        return null;
    }

    function getDebateBandLevels(band) {
        return (DEBATE_BAND_LEVELS[band] || []).slice();
    }

    const LEVEL_GROUP_META = {
        redOrangeYellow: { order: 1, label: { en: 'Red / Orange / Yellow', ko: 'Red / Orange / Yellow' } },
        greenBlueNavy: { order: 2, label: { en: 'Green / Blue / Navy', ko: 'Green / Blue / Navy' } },
        purple: { order: 3, label: { en: 'Purple', ko: 'Purple' } },
        yeoulSaemmul: { order: 4, label: { en: 'Yeoul / Saemmul', ko: '여울 / 샘물' } },
        badaGaram: { order: 5, label: { en: 'Bada / Garam', ko: '바다 / 가람' } },
        mirinaeByeolmaru: { order: 6, label: { en: 'Mirinae / Byeolmaru', ko: '미리내 / 별마루' } }
    };

    const PROGRAM_TRACK_META = {
        juniorRainbow: { order: 1, label: { en: 'Junior Rainbow', ko: 'Junior Rainbow' } },
        seniorWaterflow: { order: 2, label: { en: 'Senior Waterflow', ko: 'Senior Waterflow' } }
    };

    const CURRICULA = [
        curriculum({
            id: 'preset-phonics-red',
            name: 'Phonics Red',
            fallbackName: 'Phonics Red',
            programTrack: 'juniorRainbow',
            levelGroup: 'redOrangeYellow',
            level: 'Red',
            subjectTrack: 'phonics',
            defaultTotalLessons: RED_PHONICS_TITLES.length,
            defaultBook: 'Monster Phonics 1',
            lessonLabelMode: 'phonicsUnit',
            homeworkImportMode: 'nonDebate',
            defaultSyllabusRowTemplates: sessionsFromTitles(RED_PHONICS_TITLES, PHONICS_RED_DETAIL)
        }),
        curriculum({
            id: 'preset-hand-in-hand-red',
            name: 'Hand in Hand Red',
            fallbackName: 'Hand in Hand Red',
            programTrack: 'juniorRainbow',
            levelGroup: 'redOrangeYellow',
            level: 'Red',
            subjectTrack: 'handInHand',
            defaultTotalLessons: HAND_IN_HAND_SESSION_COUNT,
            defaultBook: 'Hand in Hand 1',
            lessonLabelMode: 'handInHandUnit',
            homeworkImportMode: 'nonDebate',
            defaultSyllabusRowTemplates: buildHandInHandTemplates('Red')
        }),
        curriculum({
            id: 'preset-hand-in-hand-orange',
            name: 'Hand in Hand Orange',
            fallbackName: 'Hand in Hand Orange',
            programTrack: 'juniorRainbow',
            levelGroup: 'redOrangeYellow',
            level: 'Orange',
            subjectTrack: 'handInHand',
            defaultTotalLessons: HAND_IN_HAND_SESSION_COUNT,
            defaultBook: 'Hand in Hand 2',
            lessonLabelMode: 'handInHandUnit',
            homeworkImportMode: 'nonDebate',
            defaultSyllabusRowTemplates: buildHandInHandTemplates('Orange')
        }),
        curriculum({
            id: 'preset-hand-in-hand-yellow',
            name: 'Hand in Hand Yellow',
            fallbackName: 'Hand in Hand Yellow',
            programTrack: 'juniorRainbow',
            levelGroup: 'redOrangeYellow',
            level: 'Yellow',
            subjectTrack: 'handInHand',
            defaultTotalLessons: HAND_IN_HAND_SESSION_COUNT,
            defaultBook: 'Hand in Hand 3',
            lessonLabelMode: 'handInHandUnit',
            homeworkImportMode: 'nonDebate',
            defaultSyllabusRowTemplates: buildHandInHandTemplates('Yellow')
        }),
        curriculum({
            id: 'preset-phonics-orange',
            name: 'Phonics Orange',
            fallbackName: 'Phonics Orange',
            programTrack: 'juniorRainbow',
            levelGroup: 'redOrangeYellow',
            level: 'Orange',
            subjectTrack: 'phonics',
            defaultTotalLessons: 24,
            defaultBook: 'Monster Phonics (Orange)',
            lessonLabelMode: 'phonicsUnit',
            isStub: true
        }),
        curriculum({
            id: 'preset-phonics-yellow',
            name: 'Phonics Yellow',
            fallbackName: 'Phonics Yellow',
            programTrack: 'juniorRainbow',
            levelGroup: 'redOrangeYellow',
            level: 'Yellow',
            subjectTrack: 'phonics',
            defaultTotalLessons: 24,
            defaultBook: 'Monster Phonics (Yellow)',
            lessonLabelMode: 'phonicsUnit',
            isStub: true
        }),
        curriculum({
            id: 'preset-rc-green-blue',
            name: 'RC Green-Blue',
            fallbackName: 'Green-Blue RC',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Green',
            subjectTrack: 'reading',
            defaultTotalLessons: 24,
            defaultBook: '50/80 Word Reading 1',
            usesUnitPairLabels: true,
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: sessionsFromTitles(buildUnitPairTitles(24), RC_GREENBLUE_DETAIL)
        }),
        curriculum({
            id: 'preset-rc-navy',
            name: 'RC Navy',
            fallbackName: 'Navy RC',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Navy',
            subjectTrack: 'reading',
            defaultTotalLessons: NAVY_RC_TITLES.length,
            defaultBook: '120 Word Reading 1',
            lessonLabelMode: 'rcNavyUnit',
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: sessionsFromTitles(NAVY_RC_TITLES, RC_NAVY_DETAIL)
        }),
        curriculum({
            id: 'preset-wr-sp-green',
            name: 'WR+SP Write Right Green',
            fallbackName: 'WR+SP Write Right 1 (Green)',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Green',
            subjectTrack: 'spkWr',
            defaultTotalLessons: WRITE_RIGHT_SESSION_COUNT,
            defaultBook: 'Write Right 1',
            usesUnitPairLabels: true,
            lessonLabelMode: 'wrSpUnit',
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: buildWriteRightTemplates(1)
        }),
        curriculum({
            id: 'preset-wr-sp-blue',
            name: 'WR+SP Write Right Blue',
            fallbackName: 'WR+SP Write Right 2 (Blue)',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Blue',
            subjectTrack: 'spkWr',
            defaultTotalLessons: WRITE_RIGHT_SESSION_COUNT,
            defaultBook: 'Write Right 2',
            usesUnitPairLabels: true,
            lessonLabelMode: 'wrSpUnit',
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: buildWriteRightTemplates(2)
        }),
        curriculum({
            id: 'preset-wr-sp-navy',
            name: 'WR+SP Write Right Navy',
            fallbackName: 'WR+SP Write Right 3 (Navy)',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Navy',
            subjectTrack: 'spkWr',
            defaultTotalLessons: WRITE_RIGHT_SESSION_COUNT,
            defaultBook: 'Write Right 3',
            usesUnitPairLabels: true,
            lessonLabelMode: 'wrSpUnit',
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: buildWriteRightTemplates(3)
        }),
        curriculum({
            id: 'preset-early-writers-green',
            name: 'WR+SP Early Writers Green',
            fallbackName: 'WR+SP Early Writers 1 (Green)',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Green',
            subjectTrack: 'spkWr',
            defaultTotalLessons: EARLY_WRITERS_WR_SESSION_COUNT,
            defaultBook: 'Early Writers 1',
            usesUnitPairLabels: true,
            lessonLabelMode: 'wrSpUnit',
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: buildEarlyWritersTemplates(1)
        }),
        curriculum({
            id: 'preset-early-writers-blue',
            name: 'WR+SP Early Writers Blue',
            fallbackName: 'WR+SP Early Writers 2 (Blue)',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Blue',
            subjectTrack: 'spkWr',
            defaultTotalLessons: EARLY_WRITERS_WR_SESSION_COUNT,
            defaultBook: 'Early Writers 2',
            usesUnitPairLabels: true,
            lessonLabelMode: 'wrSpUnit',
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: buildEarlyWritersTemplates(2)
        }),
        curriculum({
            id: 'preset-early-writers-navy',
            name: 'WR+SP Early Writers Navy',
            fallbackName: 'WR+SP Early Writers 3 (Navy)',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Navy',
            subjectTrack: 'spkWr',
            defaultTotalLessons: EARLY_WRITERS_WR_SESSION_COUNT,
            defaultBook: 'Early Writers 3',
            usesUnitPairLabels: true,
            lessonLabelMode: 'wrSpUnit',
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: buildEarlyWritersTemplates(3)
        }),
        curriculum({
            id: 'preset-bws-green',
            name: 'WR+SP Best Writing Starter Green',
            fallbackName: 'WR+SP Best Writing Starter 1 (Green)',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Green',
            subjectTrack: 'spkWr',
            defaultTotalLessons: BWS_SESSION_COUNT,
            defaultBook: 'The Best Writing Starter 1',
            usesUnitPairLabels: true,
            lessonLabelMode: 'wrSpUnit',
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: buildBestWritingStarterTemplates(1)
        }),
        curriculum({
            id: 'preset-bws-blue',
            name: 'WR+SP Best Writing Starter Blue',
            fallbackName: 'WR+SP Best Writing Starter 2 (Blue)',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Blue',
            subjectTrack: 'spkWr',
            defaultTotalLessons: BWS_SESSION_COUNT,
            defaultBook: 'The Best Writing Starter 2',
            usesUnitPairLabels: true,
            lessonLabelMode: 'wrSpUnit',
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: buildBestWritingStarterTemplates(2)
        }),
        curriculum({
            id: 'preset-bws-navy',
            name: 'WR+SP Best Writing Starter Navy',
            fallbackName: 'WR+SP Best Writing Starter 3 (Navy)',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Navy',
            subjectTrack: 'spkWr',
            defaultTotalLessons: BWS_SESSION_COUNT,
            defaultBook: 'The Best Writing Starter 3',
            usesUnitPairLabels: true,
            lessonLabelMode: 'wrSpUnit',
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: buildBestWritingStarterTemplates(3)
        }),
        curriculum({
            id: 'preset-write-now-green',
            name: 'Write Now Green',
            fallbackName: 'Write Now 1 (Green)',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Green',
            subjectTrack: 'spkWr',
            defaultTotalLessons: WRITE_NOW_SESSION_COUNT,
            defaultBook: 'Write Now 1',
            usesUnitPairLabels: true,
            lessonLabelMode: 'writeNowUnit',
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: buildWriteNowTemplates(1)
        }),
        curriculum({
            id: 'preset-write-now-blue',
            name: 'Write Now Blue',
            fallbackName: 'Write Now 2 (Blue)',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Blue',
            subjectTrack: 'spkWr',
            defaultTotalLessons: WRITE_NOW_SESSION_COUNT,
            defaultBook: 'Write Now 2',
            usesUnitPairLabels: true,
            lessonLabelMode: 'writeNowUnit',
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: buildWriteNowTemplates(2)
        }),
        curriculum({
            id: 'preset-write-now-navy',
            name: 'Write Now Navy',
            fallbackName: 'Write Now 3 (Navy)',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Navy',
            subjectTrack: 'spkWr',
            defaultTotalLessons: WRITE_NOW_SESSION_COUNT,
            defaultBook: 'Write Now 3',
            usesUnitPairLabels: true,
            lessonLabelMode: 'writeNowUnit',
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: buildWriteNowTemplates(3)
        }),
        curriculum({
            id: 'preset-rc-purple',
            name: 'RC Purple (stub)',
            fallbackName: 'RC Purple',
            programTrack: 'juniorRainbow',
            levelGroup: 'purple',
            level: 'Purple',
            subjectTrack: 'reading',
            defaultTotalLessons: 24,
            defaultBook: 'RC Reading',
            usesUnitPairLabels: true,
            homeworkImportMode: 'unitPair',
            isStub: true
        }),
        curriculum({
            id: 'preset-rc-yeoul-saemmul',
            name: 'RC Yeoul-Saemmul',
            fallbackName: 'RC 샘물-여울',
            programTrack: 'seniorWaterflow',
            levelGroup: 'yeoulSaemmul',
            level: 'Saemmul',
            subjectTrack: 'news',
            defaultTotalLessons: 24,
            defaultBook: 'RC Reading',
            usesUnitPairLabels: true,
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: sessionsFromTitles(buildUnitPairTitles(24), RC_SAEMMUL_DETAIL)
        }),
        curriculum({
            id: 'preset-simdok-garam',
            name: '심독 가람바다',
            fallbackName: '심독 가람바다',
            programTrack: 'seniorWaterflow',
            levelGroup: 'badaGaram',
            level: 'Garam',
            subjectTrack: 'reading',
            defaultTotalLessons: 26,
            defaultBook: '심슨독해-가람,바다',
            usesUnitPairLabels: true,
            homeworkImportMode: 'unitPair',
            defaultSyllabusRowTemplates: sessionsFromTitles(buildSimdokTitles(26), SIMDOK_DETAIL)
        }),
        curriculum({
            id: 'preset-gr-garam',
            name: 'GR 가람',
            fallbackName: 'GR 가람바다',
            programTrack: 'seniorWaterflow',
            levelGroup: 'badaGaram',
            level: 'Garam',
            subjectTrack: 'grammar',
            defaultTotalLessons: 12,
            defaultBook: '가람 GR',
            lessonLabelMode: 'grWeeklyUnit',
            homeworkImportMode: 'grUnit',
            defaultSyllabusRowTemplates: grTemplates(12)
        }),
        curriculum({
            id: 'preset-gr-saemmul',
            name: 'GR 샘물',
            fallbackName: 'GR 샘물',
            programTrack: 'seniorWaterflow',
            levelGroup: 'yeoulSaemmul',
            level: 'Saemmul',
            subjectTrack: 'grammar',
            defaultTotalLessons: 13,
            defaultBook: '샘물 GR',
            lessonLabelMode: 'grWeeklyUnit',
            homeworkImportMode: 'grUnit',
            defaultSyllabusRowTemplates: grTemplates(13)
        }),
        curriculum({
            id: 'preset-gr-yeoul',
            name: 'GR 여울',
            fallbackName: 'GR 여울',
            programTrack: 'seniorWaterflow',
            levelGroup: 'yeoulSaemmul',
            level: 'Yeoul',
            subjectTrack: 'grammar',
            defaultTotalLessons: 13,
            defaultBook: '여울 GR',
            lessonLabelMode: 'grWeeklyUnit',
            homeworkImportMode: 'grUnit',
            defaultSyllabusRowTemplates: grTemplates(13)
        }),
        curriculum({
            id: 'preset-gr-mirinae-byeolmaru',
            name: 'GR 별마루 (형용사)',
            fallbackName: 'GR 별마루 (형용사)',
            programTrack: 'seniorWaterflow',
            levelGroup: 'mirinaeByeolmaru',
            level: 'Byeolmaru',
            subjectTrack: 'grammar',
            defaultTotalLessons: 20,
            defaultBook: '별마루 GR (형용사)',
            lessonLabelMode: 'grWeeklyUnit',
            homeworkImportMode: 'grUnit',
            defaultSyllabusRowTemplates: grTemplates(20)
        }),
        curriculum({
            id: 'preset-toefl-rc-byeolmaru',
            name: 'TOEFL RC 별마루',
            fallbackName: 'TOEFL RC 별마루',
            programTrack: 'seniorWaterflow',
            levelGroup: 'mirinaeByeolmaru',
            level: 'Byeolmaru',
            subjectTrack: 'toeflRc',
            defaultTotalLessons: TOEFL_TRC_TITLES.length,
            defaultBook: 'TOEFL RC',
            lessonLabelMode: 'toeflRcPage',
            homeworkImportMode: 'nonDebate',
            defaultSyllabusRowTemplates: sessionsFromTitles(TOEFL_TRC_TITLES, RC_SAEMMUL_DETAIL)
        }),
        debateCurriculum({
            id: 'preset-debate-purple',
            name: 'Debate — Purple',
            fallbackName: 'Debate — Purple',
            levelGroup: 'purple',
            level: 'Purple',
            subjectTrack: 'debate',
            debateBand: 'purple',
            defaultBook: 'Debate Purple',
            defaultSyllabusRowTemplates: buildDebateRowTemplates('purple'),
            syllabusGeneralNotes: 'Month 2 book outlines may be blank — provide explicit modeling and guidance.'
        }),
        debateCurriculum({
            id: 'preset-debate-yeoul-saemmul',
            name: 'Debate — Yeoul / Saemmul',
            fallbackName: 'Debate — Yeoul / Saemmul',
            levelGroup: 'yeoulSaemmul',
            level: 'Saemmul',
            subjectTrack: 'debate',
            debateBand: 'yeoulSaemmul',
            defaultBook: 'Debate Yeoul Saemmul',
            defaultSyllabusRowTemplates: buildDebateRowTemplates('yeoulSaemmul'),
            syllabusGeneralNotes: 'Month 2 book outlines may be blank — provide explicit modeling and guidance.'
        }),
        debateCurriculum({
            id: 'preset-debate-senior',
            name: 'Debate — Garam+ (elem. & middle school)',
            fallbackName: 'Debate — Garam+',
            levelGroup: 'badaGaram',
            level: 'Garam',
            subjectTrack: 'debate',
            debateBand: 'senior',
            defaultBook: 'Debate Garam Plus',
            defaultSyllabusRowTemplates: buildDebateRowTemplates('senior'),
            syllabusGeneralNotes: 'Garam and above pagination (includes middle-school debate). Month 2 outlines may be blank.'
        }),
        curriculum({
            id: 'preset-animation-junior',
            name: 'Animation (stub)',
            fallbackName: 'Animation',
            programTrack: 'juniorRainbow',
            levelGroup: 'greenBlueNavy',
            level: 'Green',
            subjectTrack: 'animation',
            defaultTotalLessons: 24,
            defaultBook: 'Animation',
            isStub: true
        })
    ];

    const LEGACY_ID_ALIASES = {
        'preset-rc-saemmul': 'preset-rc-yeoul-saemmul',
        'preset-rc-saemmul-wf': 'preset-rc-yeoul-saemmul',
        'preset-rc-saemmul-mw': 'preset-rc-yeoul-saemmul',
        'preset-rc-saemmul-mf': 'preset-rc-yeoul-saemmul',
        'preset-rc-saemmul-tt': 'preset-rc-yeoul-saemmul',
        'preset-rc-greenblue': 'preset-rc-green-blue',
        'preset-rc-greenblue-wf': 'preset-rc-green-blue',
        'preset-rc-greenblue-mw': 'preset-rc-green-blue',
        'preset-rc-greenblue-mf': 'preset-rc-green-blue',
        'preset-rc-greenblue-tt': 'preset-rc-green-blue',
        'preset-gr-garambada': 'preset-gr-garam',
        'preset-gr-garambada-m-wed': 'preset-gr-garam',
        'preset-gr-saemmul-t-tue': 'preset-gr-saemmul',
        'preset-gr-yeoul-m-mon': 'preset-gr-yeoul',
        'preset-gr-yeoul-t-tue': 'preset-gr-yeoul',
        'preset-gr-byeolmaru': 'preset-gr-mirinae-byeolmaru',
        'preset-gr-byeolmaru-mf': 'preset-gr-mirinae-byeolmaru',
        'builtin-early-writer-weekly': 'preset-early-writers-navy'
    };

    global.CCPCurriculaData = {
        buildDebateRowTemplates,
        resolveDebateHomeworkBand,
        resolveDebatePresetId,
        getDebateBandLevels,
        DEBATE_BAND_LEVELS,
        buildWriteRightTemplates,
        buildEarlyWritersTemplates,
        buildBestWritingStarterTemplates,
        buildWriteNowTemplates,
        WRITE_RIGHT_SESSION_COUNT,
        EARLY_WRITERS_WR_SESSION_COUNT,
        BWS_SESSION_COUNT,
        WRITE_NOW_SESSION_COUNT,
        getAll() {
            return CURRICULA.slice();
        },
        getById(id) {
            const resolved = LEGACY_ID_ALIASES[id] || id;
            return CURRICULA.find(p => p.id === resolved) || null;
        },
        resolvePresetId(id) {
            return LEGACY_ID_ALIASES[id] || id;
        },
        getLegacyAliases() {
            return { ...LEGACY_ID_ALIASES };
        },
        getLevelGroupMeta() {
            return LEVEL_GROUP_META;
        },
        getProgramTrackMeta() {
            return PROGRAM_TRACK_META;
        },
        groupPresetsByLevelGroup(presets, lang) {
            const lg = lang === 'ko' ? 'ko' : 'en';
            const groups = {};
            presets.forEach(p => {
                const key = p.levelGroup || 'other';
                if (!groups[key]) {
                    const meta = LEVEL_GROUP_META[key];
                    groups[key] = {
                        levelGroup: key,
                        label: meta ? meta.label[lg] : key,
                        order: meta ? meta.order : 99,
                        presets: []
                    };
                }
                groups[key].presets.push(p);
            });
            return Object.values(groups).sort((a, b) => a.order - b.order);
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
