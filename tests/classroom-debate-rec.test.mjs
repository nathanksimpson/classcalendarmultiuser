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
        ['s3', []]
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
    check(data, new Map([['s1', []], ['s2', []]]));
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
    assert(!rec(data, 'r4', 's1').debateRecStatus, 'reset clears status');
    eq(rec(data, 'r4', 's1').debateVideoMissing, false, 'reset clears NV');
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
    check(data, new Map([['s1', []]]));
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
        ['s3', []]
    ]);
    check(data, tms);
    view = d.computeDebateRecView(data, 'c1', tms, { todayIso: TODAY });
    eq(view.counts.not_recorded, 1, 'view not_recorded');
    eq(view.counts.needs_confirmation, 1, 'view needs_confirmation');
    eq(view.counts.not_checked, 0, 'all checked');
    eq(view.rows.length, 2, 'two rows');
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

console.log(`classroom-debate-rec.test.mjs: ok (${passed} assertions)`);
