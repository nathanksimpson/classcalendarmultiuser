/**
 * Debate Rec domain: Day 4 recording days, TMS attendance cross-reference,
 * teacher overrides never resynced, reset to TMS, bell counts, homeroom.
 * Run: node tests/classroom-debate-rec.test.mjs
 */
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'debate-periods.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'classroom-domain.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'classroom-essay-class-summary-print.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'classroom-parent-messages.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'classroom-debate-rec-print.js')).href);

const d = globalThis.CCPClassroomDomain;

let passed = 0;
function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
    passed += 1;
}
function eq(a, b, msg) {
    assert(a === b, `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const TODAY = '2026-10-24';
const NOW = '2026-10-24T01:00:00.000Z';

function makeData(overrides) {
    const o = overrides || {};
    return Object.assign({
        classes: [{
            id: 'c1',
            name: 'Purple M',
            scheduleModel: 'debateMonthly',
            cohortIds: ['co1'],
            syllabusRows: [
                { id: 'r1', kind: 'lesson', date: '2026-10-05', sessionNumber: 1, planTitle: 'Day 1' },
                { id: 'r3', kind: 'lesson', date: '2026-10-14', sessionNumber: 3, planTitle: 'Day 3' },
                { id: 'r4', kind: 'lesson', date: '2026-10-21', sessionNumber: 4, planTitle: 'Day 4 / Preview', trackEssay: true },
                { id: 'r8', kind: 'lesson', date: '2026-11-18', sessionNumber: 4, planTitle: 'Day 4 / Preview', trackEssay: true }
            ]
        }],
        cohorts: [{
            id: 'co1',
            name: 'Purple M',
            homeroomTeacherUserId: 'hr1',
            students: [
                { id: 's1', name: '김민준', active: true },
                { id: 's2', name: '이서연', active: true },
                { id: 's3', name: '박지호', active: true },
                { id: 's4', name: '최하은', active: false }
            ]
        }],
        essaySubmissions: [],
        tmsEssayLinks: {}
    }, o);
}

function rec(data, rowId, studentId) {
    return d.getEssayRecordForStudent(d.findEssaySubmission(data.essaySubmissions, 'c1', rowId), studentId);
}

function check(data, tms) {
    const r = d.applyDebateRecTmsCheck(data, 'c1', tms, { nowIso: NOW, todayIso: TODAY });
    data.essaySubmissions = r.submissions;
    return r.summary;
}


// A TMS absence list that reaches back past every test Day 4 with no absence on it.
const PRESENT = [{ date: '2026-08-01', status: '출석' }];
// ── Recording days ──────────────────────────────────────────────────────
{
    const data = makeData();
    const days = d.listDebateRecordingDays(data, data.classes[0]);
    eq(days.length, 2, 'two Day 4 rows');
    eq(days[0].rowId, 'r4', 'first Day 4');
    eq(days[0].dateSource, 'syllabus', 'syllabus date fallback');
    assert(!days.some((x) => x.rowId === 'r3'), 'Day 3 excluded');

    assert(d.isDebateRecordingRow({ kind: 'lesson', date: '2026-10-21', planTitle: 'Day 4 / Preview' }), 'title match');
    assert(!d.isDebateRecordingRow({ kind: 'lesson', date: '2026-10-21', planTitle: 'Day 2 & 3 Combined' }), 'combined excluded');
    assert(!d.isDebateRecordingRow({ kind: 'lesson', date: '2026-10-21', planTitle: 'Alt Day 3' }), 'alt day 3 excluded');
    assert(!d.isDebateRecordingRow({ kind: 'holiday', date: '2026-10-21', planTitle: 'Day 4' }), 'holiday excluded');

    const nonDebate = Object.assign({}, data.classes[0], { scheduleModel: 'sequentialTerm' });
    eq(d.listDebateRecordingDays(data, nonDebate).length, 0, 'non-debate class has no recording days');
}

// ── TMS assigned date wins over syllabus ───────────────────────────────
{
    const data = makeData({
        tmsEssayLinks: {
            k1: { action: 'map', classId: 'c1', syllabusRowId: 'r4', lessonDate: '2026-10-22', title: 'Day 4' }
        }
    });
    const day = d.listDebateRecordingDays(data, data.classes[0])[0];
    eq(day.date, '2026-10-22', 'TMS assigned date');
    eq(day.dateSource, 'tms', 'TMS date source');

    const tms = new Map([
        ['s1', [{ date: '2026-10-21', status: '결석' }]],
        ['s2', [{ date: '2026-10-22', status: '결석' }]],
        ['s3', PRESENT]
    ]);
    check(data, tms);
    eq(rec(data, 'r4', 's1'), null, 'absence on syllabus date ignored when TMS date differs');
    eq(rec(data, 'r4', 's2').debateRecStatus, 'not_recorded', 'absence on TMS date flagged');
}

// ── Status mapping ─────────────────────────────────────────────────────
{
    eq(d.debateRecStatusFromTms('결석'), 'not_recorded', '결석');
    eq(d.debateRecStatusFromTms('결석(병결)'), 'not_recorded', '결석 with reason');
    eq(d.debateRecStatusFromTms('지각'), 'needs_confirmation', '지각');
    eq(d.debateRecStatusFromTms('조퇴'), 'needs_confirmation', '조퇴');
    eq(d.debateRecStatusFromTms('미참석'), 'needs_confirmation', '미참석');
    eq(d.debateRecStatusFromTms('출석'), '', '출석');
    eq(d.debateRecStatusFromTms(''), '', 'blank');
    const both = d.pickTmsAttendanceForDate(
        [{ date: '2026-10-21', status: '지각' }, { date: '2026-10-21', status: '결석' }],
        '2026-10-21'
    );
    eq(both.status, '결석', 'absent beats late on same day');
}

// ── Full check ─────────────────────────────────────────────────────────
{
    const data = makeData();
    const tms = new Map([
        ['s1', [{ date: '2026-10-21', status: '결석', memo: '병결' }]],
        ['s2', [{ date: '2026-10-21', status: '조퇴' }]],
        ['s3', [{ date: '2026-10-07', status: '결석' }]]
    ]);
    const summary = check(data, tms);
    eq(summary.days, 1, 'future Day 4 not checked');
    eq(summary.flagged, 1, 'one flagged');
    eq(summary.needsConfirmation, 1, 'one needs confirmation');

    const r1 = rec(data, 'r4', 's1');
    eq(r1.debateRecStatus, 'not_recorded', 's1 not recorded');
    eq(r1.debateRecSource, 'tms', 's1 source tms');
    eq(r1.debateVideoMissing, true, 's1 NV set');
    eq(r1.debateRecTmsMemo, '병결', 's1 memo');
    eq(r1.debateRecDate, '2026-10-21', 's1 date');

    const r2 = rec(data, 'r4', 's2');
    eq(r2.debateRecStatus, 'needs_confirmation', 's2 needs confirmation');
    eq(r2.debateVideoMissing, false, 's2 NV not set');

    eq(rec(data, 'r4', 's3'), null, 'absence on other date ignored');
    eq(rec(data, 'r4', 's4'), null, 'inactive student excluded');
    eq(rec(data, 'r8', 's1'), null, 'future Day 4 untouched');
}

// ── Missing TMS data never flags or clears ─────────────────────────────
{
    const data = makeData();
    check(data, new Map([['s1', [{ date: '2026-10-21', status: '결석' }]]]));
    const summary = check(data, new Map());
    eq(summary.noTmsData, 3, 'all three active students lack TMS data');
    eq(rec(data, 'r4', 's1').debateRecStatus, 'not_recorded', 'no data → status kept');
}

// ── Teacher overrides are never resynced ───────────────────────────────
{
    const data = makeData();
    const tms = new Map([
        ['s1', [{ date: '2026-10-21', status: '결석' }]],
        ['s2', [{ date: '2026-10-21', status: '지각' }]]
    ]);
    check(data, tms);

    data.essaySubmissions = d.setDebateRecTeacherStatus(data.essaySubmissions, {
        classId: 'c1', syllabusRowId: 'r4', studentId: 's1', status: 'received', userId: 'u1', nowIso: NOW
    }).submissions;
    data.essaySubmissions = d.setDebateRecTeacherStatus(data.essaySubmissions, {
        classId: 'c1', syllabusRowId: 'r4', studentId: 's2', status: 'not_recorded', userId: 'u1', nowIso: NOW
    }).submissions;

    let summary;
    for (let i = 0; i < 3; i += 1) {
        summary = check(data, tms);
    }
    eq(summary.skippedTeacher, 2, 'both teacher rows skipped');
    const r1 = rec(data, 'r4', 's1');
    eq(r1.debateRecStatus, 'received', 's1 stays received');
    eq(r1.debateRecSource, 'teacher', 's1 stays teacher');
    eq(r1.debateVideoMissing, false, 's1 NV cleared');
    eq(r1.debateRecUpdatedBy, 'u1', 's1 who');
    const r2 = rec(data, 'r4', 's2');
    eq(r2.debateRecStatus, 'not_recorded', 's2 stays not_recorded');
    eq(r2.debateVideoMissing, true, 's2 NV on');

    // TMS later says present → teacher decision still kept
    check(data, new Map([['s1', PRESENT], ['s2', PRESENT]]));
    eq(rec(data, 'r4', 's1').debateRecStatus, 'received', 'teacher kept when TMS clears');

    // invalid teacher status rejected
    const bad = d.setDebateRecTeacherStatus(data.essaySubmissions, {
        classId: 'c1', syllabusRowId: 'r4', studentId: 's1', status: 'needs_confirmation'
    });
    eq(bad.error, 'invalid', 'needs_confirmation is TMS-only');
}

// ── Reset to TMS hands the student back ────────────────────────────────
{
    const data = makeData();
    const tms = new Map([['s1', [{ date: '2026-10-21', status: '결석' }]]]);
    data.essaySubmissions = d.setDebateRecTeacherStatus(data.essaySubmissions, {
        classId: 'c1', syllabusRowId: 'r4', studentId: 's1', status: 'exempt', userId: 'u1', nowIso: NOW
    }).submissions;
    check(data, tms);
    eq(rec(data, 'r4', 's1').debateRecStatus, 'exempt', 'exempt kept');

    data.essaySubmissions = d.resetDebateRecToTms(data.essaySubmissions, {
        classId: 'c1', syllabusRowId: 'r4', studentId: 's1'
    }).submissions;
    // TMS said 결석 during the check (kept on the record while the teacher's Exempt stood),
    // so Reset to TMS restores Not recorded straight away.
    eq(rec(data, 'r4', 's1').debateRecStatus, 'not_recorded', 'reset restores last TMS result');
    eq(rec(data, 'r4', 's1').debateRecSource, 'tms', 'reset hands back to TMS');
    eq(rec(data, 'r4', 's1').debateVideoMissing, true, 'reset restores NV for 결석');
    check(data, tms);
    const r = rec(data, 'r4', 's1');
    eq(r.debateRecStatus, 'not_recorded', 'TMS applies again after reset');
    eq(r.debateRecSource, 'tms', 'source tms after reset');
}

// ── TMS correction clears a TMS-sourced flag ───────────────────────────
{
    const data = makeData();
    check(data, new Map([['s1', [{ date: '2026-10-21', status: '결석' }]]]));
    const summary = check(data, new Map([['s1', [{ date: '2026-10-21', status: '출석' }]]]));
    eq(summary.cleared, 1, 'cleared counted');
    const r = rec(data, 'r4', 's1');
    eq(r.debateRecStatus, '', 'cleared');
    eq(r.debateVideoMissing, false, 'NV cleared');
}

// ── Essays NV toggle counts as teacher decision ────────────────────────
{
    const patch = d.debateRecPatchForNvToggle(true, 'u9', NOW);
    eq(patch.debateRecSource, 'teacher', 'NV toggle is teacher');
    eq(patch.debateRecStatus, 'not_recorded', 'NV on → not_recorded');
    eq(d.debateRecPatchForNvToggle(false, 'u9', NOW).debateRecStatus, 'received', 'NV off → received');

    const data = makeData({
        essaySubmissions: [{
            id: 'e1', classId: 'c1', syllabusRowId: 'r4', lessonDate: '2026-10-21',
            records: [Object.assign({ studentId: 's1', status: 'not_submitted' }, patch)]
        }]
    });
    check(data, new Map([['s1', PRESENT]]));
    eq(rec(data, 'r4', 's1').debateRecStatus, 'not_recorded', 'manual NV survives TMS present');
}

// ── Legacy NV without Debate Rec fields → teacher decision ─────────────
{
    const n = d.normalizeDebateRecFields({ debateVideoMissing: true });
    eq(n.debateRecStatus, 'not_recorded', 'legacy NV status');
    eq(n.debateRecSource, 'teacher', 'legacy NV source');
    const plain = d.normalizeEssaySubmission({
        id: 'e', classId: 'c1', syllabusRowId: 'r4',
        records: [{ studentId: 's1', status: 'submitted' }]
    });
    assert(!('debateRecStatus' in plain.records[0]), 'untouched record gets no Debate Rec fields');
    const kept = d.normalizeEssaySubmission({
        id: 'e', classId: 'c1', syllabusRowId: 'r4',
        records: [{
            studentId: 's1', status: 'submitted', debateRecStatus: 'received', debateRecSource: 'teacher',
            debateRecUpdatedBy: 'u1', debateRecNote: 'sent on Kakao'
        }]
    });
    eq(kept.records[0].debateRecStatus, 'received', 'normalize keeps status');
    eq(kept.records[0].debateRecNote, 'sent on Kakao', 'normalize keeps note');
}

// ── View + bell counts ─────────────────────────────────────────────────
{
    const data = makeData();
    let view = d.computeDebateRecView(data, 'c1', new Map(), { todayIso: TODAY });
    eq(view.counts.not_checked, 3, 'three active students not checked before first check');

    const tms = new Map([
        ['s1', [{ date: '2026-10-21', status: '결석' }]],
        ['s2', [{ date: '2026-10-21', status: '지각' }]],
        ['s3', PRESENT]
    ]);
    check(data, tms);
    view = d.computeDebateRecView(data, 'c1', tms, { todayIso: TODAY });
    eq(view.counts.not_recorded, 1, 'view not_recorded');
    eq(view.counts.needs_confirmation, 1, 'view needs_confirmation');
    eq(view.counts.not_checked, 0, 'all checked');
    eq(view.rows.length, 3, 'full roster (3 students) on the past Day 4');
    eq(view.counts.present, 1, 's3 recorded in class');
    eq(view.rows.find((r) => r.student.id === 's3').displayStatus, 'present', 'present display status');
    eq(view.dayCounts.r4.open, 2, 'Day 4 open count');

    const bell = d.countOpenDebateRecWarnings(data, 'c1');
    eq(bell.notRecorded, 1, 'bell not recorded');
    eq(bell.needsConfirmation, 1, 'bell needs confirmation');
}

// ── Homeroom ───────────────────────────────────────────────────────────
{
    const data = makeData();
    assert(d.isHomeroomTeacherForClass(data, data.classes[0], 'hr1'), 'cohort homeroom');
    assert(!d.isHomeroomTeacherForClass(data, data.classes[0], 'someone'), 'not homeroom');
    assert(d.isHomeroomTeacherForClass(data, Object.assign({}, data.classes[0], { homeroomTeacherUserId: 'x' }), 'x'), 'class homeroom');
}

// ── Class summary report (Essays class summary shape) ──────────────────
{
    const data = makeData();
    data.classes[0].grade = '초4';
    data.classes[0].levelPreset = 'Purple';
    data.classes.push({
        id: 'c2', name: 'Yeoul T', scheduleModel: 'debateMonthly', cohortIds: ['co2'], grade: '초5', levelPreset: 'Yeoul',
        syllabusRows: [{ id: 'y4', kind: 'lesson', date: '2026-09-17', sessionNumber: 4, planTitle: 'Day 4 / Preview', trackEssay: true }]
    });
    data.classes.push({ id: 'rc', name: 'Navy RC', scheduleModel: 'sequentialTerm', cohortIds: ['co1'], syllabusRows: [] });
    data.cohorts.push({ id: 'co2', name: 'Yeoul T', students: [{ id: 'y1', name: '강하늘', active: true }, { id: 'y2', name: '나봄', active: true }] });
    check(data, new Map([
        ['s1', [{ date: '2026-10-21', status: '결석', memo: '병결' }]],
        ['s2', [{ date: '2026-10-21', status: '지각' }]],
        ['s3', [{ date: '2026-10-21', status: '결석' }]]
    ]));
    data.essaySubmissions = d.setDebateRecTeacherStatus(data.essaySubmissions, {
        classId: 'c1', syllabusRowId: 'r4', studentId: 's3', status: 'received', userId: 'u1', nowIso: NOW
    }).submissions;
    data.essaySubmissions = d.setDebateRecNote(data.essaySubmissions, {
        classId: 'c1', syllabusRowId: 'r4', studentId: 's1', note: 'Mom will send video'
    }).submissions;
    const r2 = d.applyDebateRecTmsCheck(data, 'c2', new Map([['y1', [{ date: '2026-09-17', status: '결석' }]], ['y2', PRESENT]]), { todayIso: TODAY });
    data.essaySubmissions = r2.submissions;

    // Filter options: past months only, homerooms incl. "no homeroom".
    const opts = d.debateRecReportFilterOptions(data, data.classes, { todayIso: TODAY });
    eq(opts.months.join(), '2026-10,2026-09', 'past months newest first (November Day 4 is in the future)');
    eq(opts.homerooms.join(), 'hr1', 'homerooms');
    eq(opts.noHomeroom, true, 'a class without homeroom');

    // Entries: classes sorted, one checkbox per past Day 4 (month).
    const entries = (filters, isMine) => d.listDebateRecReportEntries(data, data.classes, filters || {}, { isMine, todayIso: TODAY });
    const all = entries();
    eq(all.map((c) => c.classId).join(), 'c1,c2', 'debate classes only, sorted by name');
    eq(all[0].entries.length, 1, 'future Day 4 has no checkbox');
    eq(all[0].entries[0].key, 'c1|r4', 'entry key');
    eq(all[0].entries[0].month, '2026-10', 'entry month');
    eq(all[0].entries[0].total, 3, 'roster size');
    eq(all[0].entries[0].open, 2, 'open count');
    eq(all[0].entries[0].completed, 1, 'completed count');
    eq(entries({ month: '2026-09' }).map((c) => c.classId).join(), 'c2', 'month filter');
    eq(entries({ homeroomUserId: 'hr1' }).map((c) => c.classId).join(), 'c1', 'homeroom filter');
    eq(entries({ homeroomUserId: '__none__' }).map((c) => c.classId).join(), 'c2', 'no-homeroom filter');
    eq(entries({ classScope: 'mine' }, (c) => c.id === 'c2').map((c) => c.classId).join(), 'c2', 'my classes');
    eq(entries({ classScope: 'other' }, (c) => c.id === 'c2').map((c) => c.classId).join(), 'c1', 'other classes');

    // Summary: homeroom → class → Day 4 → full roster incl. completed.
    const names = { u1: 'Nathan', hr1: 'Ms. Kim' };
    const groups = d.buildDebateRecClassSummary(data, ['c1|r4', 'c2|y4'], { nameForUser: (id) => names[id] || '' });
    eq(groups.length, 2, 'two homeroom groups');
    eq(groups[0].homeroomLabel, 'Ms. Kim', 'named homeroom first');
    eq(groups[1].homeroomUserId, '', 'no-homeroom group last');
    const rows = groups[0].classes[0].assignments[0].students;
    eq(rows.length, 3, 'full roster');
    eq(rows.map((r) => r.rosterIndex).join(), '1,2,3', 'roster numbers');
    const byName = Object.fromEntries(rows.map((r) => [r.studentId, r]));
    eq(byName.s1.status, 'not_recorded', 'absent');
    eq(byName.s2.status, 'needs_confirmation', 'late');
    eq(byName.s3.status, 'received', 'completed by teacher');
    eq(byName.s3.updatedByName, 'Nathan', 'who completed it');
    const c2rows = groups[1].classes[0].assignments[0].students;
    eq(c2rows.find((r) => r.studentId === 'y2').status, 'present', 'no absence → recorded in class');

    const open = d.buildDebateRecClassSummary(data, ['c1|r4'], { show: 'open' })[0].classes[0].assignments[0].students;
    eq(open.map((r) => r.studentId).sort().join(), 's1,s2', 'show open');
    const done = d.buildDebateRecClassSummary(data, ['c1|r4', 'c2|y4'], { show: 'completed' });
    eq(done.length, 2, 'show completed keeps both classes');
    eq(done[0].classes[0].assignments[0].students.map((r) => r.studentId).join(), 's3', 'completed only');

    // Print + copy use the Essays class summary layout.
    const P = globalThis.CCPClassroomDebateRecPrint;
    const labels = {
        title: 'Debate recordings', generatedAt: 'Printed', hrHeading: '== HR Teacher: {name} ==', noHomeroom: 'No homeroom',
        dayHeading: 'Day 4 · {date}', dayCounts: '{done} completed · {open} still needed', dateFromTms: 'TMS', dateFromSyllabus: 'syllabus',
        colStudent: 'Student', colStatus: 'Recording', colTms: 'TMS', colNotes: 'Notes', setBy: 'Set by {name} · {date}',
        noStudents: 'Nothing', noStudentsInSection: 'None',
        statusLabels: { not_recorded: 'Not recorded', needs_confirmation: 'Needs confirmation', present: 'Recorded in class', received: 'Received', recorded: 'Recorded', exempt: 'Exempt' }
    };
    const html = P.renderDocumentHtml({ title: 'Report <x>', generatedAt: TODAY, groups }, labels);
    assert(html.includes('essay-class-summary-root') && html.includes('essay-class-summary-hr-block'), 'Essays class summary structure');
    assert(html.includes('Report &lt;x&gt;'), 'title escaped');
    assert(html.includes('== HR Teacher: Ms. Kim =='), 'homeroom heading');
    assert(html.includes('== HR Teacher: No homeroom =='), 'no-homeroom heading');
    assert(html.includes('Purple M (초4 Purple)'), 'class heading with grade + level');
    assert(html.includes('Day 4 · 10/21 (syllabus) · 1 completed · 2 still needed'), 'Day 4 heading with counts');
    assert(html.includes('essay-status--resubmit') && html.includes('essay-status--complete'), 'Essays status chips');
    assert(html.includes('Recorded in class'), 'completed-in-class students shown');
    assert(html.includes('결석 (병결)') && html.includes('Mom will send video') && html.includes('Set by Nathan'), 'row details');
    eq(typeof P.PRINT_STYLES, 'string', 'print styles');
    assert(P.PRINT_STYLES.includes('essay-class-summary-hr-block'), 'Essays print styles reused');

    const text = P.formatCopyText(groups, labels);
    assert(text.startsWith('== HR Teacher: Ms. Kim =='), 'copy starts with homeroom');
    assert(text.includes('-- Purple M (초4 Purple) - Day 4 · 10/21 (syllabus) · 1 completed · 2 still needed --'), 'copy class line');
    assert(/\d\. 김민준\tNot recorded - TMS 결석 \(병결\) - Mom will send video/.test(text), `copy student line: ${text}`);
    assert(text.includes('Recorded in class'), 'copy includes completed');
}

// ── Parent messages (Debate + Essays) ─────────────────────────────────
{
    const P = globalThis.CCPClassroomDebateRecPrint;
    const M = globalThis.CCPParentMessages;
    const msg = P.buildParentMessage({ studentName: '김민준', nameEn: 'Minjun', className: 'Purple M', date: '2026-10-21', teacherName: 'Nathan' });
    const lines = msg.split('\n');
    eq(lines[0], '[Simson Academy] Debate recording not finished', 'Simson Academy at the top');
    assert(msg.includes('This is Nathan, the debate teacher for Minjun (김민준) at Simson Academy.'), 'teacher intro');
    assert(msg.includes('On Wednesday, October 21, the Purple M class recorded their debate speeches (Debate Day 4).'), 'what was missed');
    assert(msg.includes('Minjun will need to make up the recording here at Simson Academy.'), 'recorded at the academy');
    assert(msg.includes("Please contact Minjun's homeroom teacher to arrange a time"), 'contact homeroom teacher');
    assert(msg.includes('come in a little early before class or stay a little after class'), 'early or late');
    assert(!/at home|send us the video/.test(msg), 'no home recording');
    eq(lines[lines.length - 1], 'Simson Academy', 'sign-off');
    const noEn = P.buildParentMessage({ studentName: '이서연', date: '2026-09-17' });
    assert(noEn.includes('This is the debate teacher for 이서연 at Simson Academy.'), 'no teacher / no English name');
    assert(noEn.includes('On Thursday, September 17, the class recorded'), 'no class name');

    const overdue = M.essay({ kind: 'overdue', studentName: '김민준', nameEn: 'Minjun', className: 'Purple M', assignedDate: '2026-10-21', dueDate: '2026-10-23', teacherName: 'Nathan' });
    eq(overdue.split('\n')[0], '[Simson Academy] Essay not submitted', 'essay overdue header');
    assert(overdue.includes('Minjun has not yet submitted the essay assigned on Wednesday, October 21 in the Purple M class.'), 'essay overdue body');
    assert(!/due|October 23/i.test(overdue), 'no due date in the essay message');
    assert(overdue.includes("please contact Minjun's homeroom teacher"), 'essay overdue homeroom');
    const resub = M.essay({ kind: 'resubmit', studentName: '김민준', nameEn: 'Minjun', className: 'Purple M', assignedDate: '2026-10-21', teacherName: 'Nathan' });
    eq(resub.split('\n')[0], '[Simson Academy] Essay needs to be resubmitted', 'essay resubmit header');
    assert(resub.includes('needs some corrections'), 'essay resubmit body');
    assert(resub.includes("please contact Minjun's homeroom teacher"), 'essay resubmit homeroom');
    [msg, overdue, resub].forEach((m) => {
        assert(!/Ms\.|Mr\.|담임/.test(m), 'never names the homeroom teacher');
    });
}

// ── Teacher name without account labels ───────────────────────────────
{
    const M = globalThis.CCPParentMessages;
    eq(M.cleanTeacherName('Nathan Simpson (Admin)'), 'Nathan Simpson', 'drops (Admin)');
    eq(M.cleanTeacherName('Nathan Simpson [관리자]'), 'Nathan Simpson', 'drops [관리자]');
    eq(M.cleanTeacherName('Kim Minsu (김민수)'), 'Kim Minsu (김민수)', 'keeps a real name in brackets');
    const deb = M.debateRecording({ studentName: '김민준', nameEn: 'Minjun', date: '2026-10-21', teacherName: 'Nathan Simpson (Admin)' });
    const ess = M.essay({ kind: 'overdue', studentName: '김민준', nameEn: 'Minjun', teacherName: 'Nathan Simpson (Admin)' });
    [deb, ess].forEach((m) => {
        assert(m.includes('Nathan Simpson') && !/admin/i.test(m), 'no (Admin) in parent message');
    });
}

// ── Korean parent messages (user chooses the language) ────────────────
{
    const M = globalThis.CCPParentMessages;
    const P = globalThis.CCPClassroomDebateRecPrint;
    const base = { studentName: '김민준', nameEn: 'Minjun', className: 'Purple M', date: '2026-10-21', assignedDate: '2026-10-21', teacherName: 'Nathan Simpson (Admin)' };
    eq(M.koDate('2026-10-21'), '10월 21일(수)', 'Korean date');

    const deb = P.buildParentMessage(base, 'ko');
    eq(deb.split('\n')[0], '[심슨어학원] 토론 영상 촬영 미완료 안내', 'KO debate header');
    assert(deb.includes('심슨어학원 Purple M반 토론 수업을 담당하고 있는 Nathan Simpson 선생님입니다.'), 'KO debate intro, no (Admin)');
    assert(deb.includes('10월 21일(수) 수업에서 토론 스피치 영상 촬영(Debate Day 4)이 진행되었으나, 김민준 학생은 당일 촬영에 참여하지 못하여') && deb.endsWith('심슨어학원\nNathan Simpson 드림') && !deb.includes('지난'), 'KO what was missed');
    assert(deb.includes('번거로우시겠지만 반담임 선생님과 상의하시어') && !deb.includes('토론 담당'), 'KO contact homeroom');
    assert(deb.includes('수업 시작 전 조금 일찍 등원하거나 수업 종료 후 잠시 남아 촬영할 수 있도록'), 'KO early/late');
    assert(P.buildParentMessage(base).startsWith('[Simson Academy] Debate recording not finished'), 'English stays the default');

    const od = M.essay(Object.assign({ kind: 'overdue' }, base), 'ko');
    eq(od.split('\n')[0], '[심슨어학원] 에세이 미제출 안내', 'KO essay overdue header');
    assert(od.includes('10월 21일(수) 수업에서 안내된 에세이를 김민준 학생이 아직 제출하지 않은 상태입니다.') && od.includes('심슨어학원 Purple M반 수업을 담당하고 있는 Nathan Simpson 선생님입니다.'), 'KO essay overdue body');
    assert(od.includes('반담임 선생님과 상의해 주시기 바랍니다'), 'KO essay homeroom');
    const rs = M.essay(Object.assign({ kind: 'resubmit' }, base), 'ko');
    eq(rs.split('\n')[0], '[심슨어학원] 에세이 재제출 안내', 'KO essay resubmit header');
    assert(rs.includes('제출하였으나, 수정이 필요하여 다시 제출해야 합니다'), 'KO resubmit body');
    [deb, od, rs].forEach((m) => assert(!/admin/i.test(m) && !/마감|due/i.test(m), 'KO: no admin label, no due date'));
    eq(M.essay({ kind: 'overdue', studentName: '이서연', className: '2반', teacherName: 'Kim' }, 'ko').includes(' 2반 수업을 담당'), true, 'no double 반');
    eq(M.debateRecording({ studentName: '이서연' }, 'ko').split('\n')[4], '심슨어학원입니다.', 'KO no-teacher intro');
    assert(!M.debateRecording({ studentName: '이서연' }, 'ko').includes('드림'), 'KO no 드림 without a teacher');
}

// ── Before any TMS check: full roster, Not checked, teacher can set ────
{
    const data = makeData();
    let view = d.computeDebateRecView(data, 'c1', new Map(), { todayIso: TODAY });
    eq(view.rows.length, 3, 'roster shown before TMS check');
    assert(view.rows.every((r) => r.displayStatus === 'not_checked'), 'everyone Not checked');
    eq(view.dayCounts.r4.checked, false, 'Day 4 not checked');
    eq(view.dayCounts.r8.past, false, 'future Day 4 has no rows');

    // Teacher marks s1 Not recorded and s2 Recorded before syncing.
    data.essaySubmissions = d.setDebateRecTeacherStatus(data.essaySubmissions, {
        classId: 'c1', syllabusRowId: 'r4', studentId: 's1', status: 'not_recorded', userId: 'u1', nowIso: NOW
    }).submissions;
    data.essaySubmissions = d.setDebateRecTeacherStatus(data.essaySubmissions, {
        classId: 'c1', syllabusRowId: 'r4', studentId: 's2', status: 'recorded', userId: 'u1', nowIso: NOW
    }).submissions;
    view = d.computeDebateRecView(data, 'c1', new Map(), { todayIso: TODAY });
    eq(view.counts.not_recorded, 1, 'manual Not recorded before sync');
    eq(view.counts.recorded, 1, 'manual Recorded before sync');
    eq(view.counts.not_checked, 1, 's3 still Not checked');
    eq(d.countOpenDebateRecWarnings(data, 'c1').notRecorded, 1, 'bell counts manual Not recorded');

    // TMS says the opposite for both; teacher choices are kept. Nobody else absent.
    check(data, new Map([
        ['s1', PRESENT],
        ['s2', [{ date: '2026-10-21', status: '결석' }]],
        ['s3', PRESENT]
    ]));
    view = d.computeDebateRecView(data, 'c1', new Map(), { todayIso: TODAY });
    eq(view.dayCounts.r4.checked, true, 'Day 4 marked checked even with no TMS flags for unflagged students');
    eq(view.rows.find((r) => r.student.id === 's1').displayStatus, 'not_recorded', 'manual Not recorded kept');
    eq(view.rows.find((r) => r.student.id === 's2').displayStatus, 'recorded', 'manual Recorded kept over TMS 결석');
    eq(view.rows.find((r) => r.student.id === 's3').displayStatus, 'present', 'unflagged → Recorded in class after check');

    // Marker survives normalization (save/load round trip).
    const sub = d.findEssaySubmission(data.essaySubmissions, 'c1', 'r4');
    assert(d.normalizeEssaySubmission(sub).debateRecCheckedAt, 'checked marker persisted');

    // Report: unchecked days show Not checked, not Recorded in class.
    const fresh = makeData();
    const g = d.buildDebateRecClassSummary(fresh, ['c1|r4'], {});
    assert(g[0].classes[0].assignments[0].students.every((r) => r.status === 'not_checked'), 'report Not checked before sync');
    eq(d.buildDebateRecClassSummary(fresh, ['c1|r4'], { show: 'completed' }).length, 0, 'Not checked is not completed');
    const entry = d.listDebateRecReportEntries(fresh, fresh.classes, {}, { todayIso: TODAY })[0].entries[0];
    eq(entry.checked, false, 'entry unchecked');
    eq(entry.notChecked, 3, 'entry notChecked count');
    eq(entry.completed, 0, 'entry completed count');
}

// ── Reset to TMS restores the last TMS result (production bug fix) ─────
{
    const one = () => makeData();
    const steps = (data, list) => list.forEach(([k, a]) => {
        if (k === 'tms') {
            data.essaySubmissions = d.applyDebateRecTmsCheck(data, 'c1', new Map([['s1', a], ['s2', PRESENT], ['s3', PRESENT]]), { todayIso: TODAY }).submissions;
        } else if (k === 'set') {
            data.essaySubmissions = d.setDebateRecTeacherStatus(data.essaySubmissions, { classId: 'c1', syllabusRowId: 'r4', studentId: 's1', status: a, userId: 'u1' }).submissions;
        } else {
            data.essaySubmissions = d.resetDebateRecToTms(data.essaySubmissions, { classId: 'c1', syllabusRowId: 'r4', studentId: 's1' }).submissions;
        }
    });
    const shown = (data) => d.computeDebateRecView(data, 'c1', null, { todayIso: TODAY }).rows.find((r) => r.student.id === 's1').displayStatus;
    const A = [{ date: '2026-10-21', status: '결석', memo: '병결' }];
    const L = [{ date: '2026-10-21', status: '지각' }];

    let data = one(); steps(data, [['tms', A], ['set', 'received'], ['reset']]);
    eq(shown(data), 'not_recorded', '결석 → Received → reset = Not recorded (not "Recorded in class")');
    eq(rec(data, 'r4', 's1').debateRecTmsMemo, '병결', 'TMS memo kept through teacher decision');

    data = one(); steps(data, [['set', 'recorded'], ['tms', A], ['reset']]);
    eq(shown(data), 'not_recorded', 'teacher before check, TMS 결석 remembered, reset = Not recorded');

    data = one(); steps(data, [['tms', L], ['set', 'recorded'], ['reset']]);
    eq(shown(data), 'needs_confirmation', '지각 → Recorded → reset = Needs confirmation');

    data = one(); steps(data, [['tms', PRESENT], ['set', 'not_recorded'], ['reset']]);
    eq(shown(data), 'present', 'no TMS absence → reset = Recorded in class');

    data = one(); steps(data, [['set', 'exempt'], ['reset']]);
    eq(shown(data), 'not_checked', 'no TMS check yet → reset = Not checked');

    // Teacher decision still never changed by a check.
    data = one(); steps(data, [['set', 'received'], ['tms', A]]);
    eq(shown(data), 'received', 'check keeps teacher decision');

    // TMS's absence list is one page of recent days. A later check whose list no longer
    // reaches the Day 4 must not wipe the stored 결석 (the "flaky reset" bug).
    const LATER = [{ date: '2026-11-20', status: '출석' }];
    data = one(); steps(data, [['tms', A], ['tms', LATER]]);
    eq(shown(data), 'not_recorded', 'Day 4 off the TMS list → stored Not recorded kept');
    data = one(); steps(data, [['tms', A], ['set', 'received'], ['tms', LATER], ['reset']]);
    eq(shown(data), 'not_recorded', 'Day 4 off the TMS list → teacher row keeps TMS 결석 → reset = Not recorded');
    assert(d.tmsAttendanceCoversDate(A, '2026-10-21') && !d.tmsAttendanceCoversDate(LATER, '2026-10-21') && !d.tmsAttendanceCoversDate([], '2026-10-21'), 'coverage helper');

    // Reset uses fresh cached TMS records when they cover the date (repairs old wiped rows).
    data = one(); steps(data, [['set', 'received']]);
    data.essaySubmissions = d.resetDebateRecToTms(data.essaySubmissions, { classId: 'c1', syllabusRowId: 'r4', studentId: 's1', date: '2026-10-21', tmsRecords: A }).submissions;
    eq(shown(data), 'not_recorded', 'reset with fresh TMS 결석 = Not recorded even without a stored result');
    eq(rec(data, 'r4', 's1').debateRecTmsStatus, '결석', 'reset stores the fresh TMS status');
    data = one(); steps(data, [['tms', A], ['set', 'received']]);
    data.essaySubmissions = d.resetDebateRecToTms(data.essaySubmissions, { classId: 'c1', syllabusRowId: 'r4', studentId: 's1', date: '2026-10-21', tmsRecords: LATER }).submissions;
    eq(shown(data), 'not_recorded', 'reset with TMS list not reaching the date falls back to the stored 결석');
}

console.log(`classroom-debate-rec.test.mjs: ok (${passed} assertions)`);
