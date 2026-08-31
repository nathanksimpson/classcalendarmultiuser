import { createRequire } from 'module';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const require = createRequire(import.meta.url);
const tms = require('../server/tms-roster');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

function loadDomain() {
    const code = readFileSync(path.join(root, 'js', 'classroom-domain.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {} };
    vm.runInNewContext(code, sandbox);
    return sandbox.window.CCPClassroomDomain;
}

const D = loadDomain();

{
    const slots = [
        { id: 'ts1', start: '14:30', end: '15:20' },
        { id: 'ts2', start: '15:20', end: '16:10' },
        { id: 'ts3', start: '16:10', end: '17:00' },
        { id: 'ts4', start: '17:00', end: '18:00' }
    ];
    const map = { '1': 'ts1', '2': 'ts2', '3': 'ts3', '4': 'ts4' };
    const mapped = D.mapTmsBlockToPeriod({ start: '15:20', end: '17:00' }, slots, map);
    assert(mapped.period === 2, `expected period 2 got ${mapped.period}`);
    assert(mapped.timeSlotId === 'ts2', 'slot ts2');
    assert(mapped.start === '15:20' && mapped.end === '17:00', 'keeps block times');

    const early = D.mapTmsBlockToPeriod({ start: '14:30', end: '15:20' }, slots, map);
    assert(early.period === 1, '14:30 → period 1');

    assert(D.mapTmsBlockToPeriod(null, slots, map).period == null, 'null block');
}

{
    const previous = [
        {
            id: 'coh_old_a',
            name: '여울M',
            levelPreset: 'yeoul',
            students: [
                { id: 'stu_1', name: '김민수', nameEn: 'Minsu', tmsMpidx: '1001' },
                { id: 'stu_2', name: '이서연', nameEn: 'Seoyeon', tmsMpidx: '' }
            ]
        },
        {
            id: 'coh_old_b',
            name: '가람M',
            levelPreset: 'garam',
            students: [{ id: 'stu_3', name: '박지훈', nameEn: '', tmsMpidx: '1003' }]
        }
    ];
    const targets = [
        {
            cohortId: 'coh_new_a',
            cohortName: '가람M',
            levelPreset: 'garam',
            students: [
                { name: '김민수', nameEn: 'Minsu', mpidx: '1001' },
                { name: '이서연', nameEn: 'Seoyeon', mpidx: '2002' },
                { name: '최유나', nameEn: 'Yuna', mpidx: '3003' }
            ]
        }
    ];
    const plan = D.buildTermMigrateTransferPlan(previous, targets);
    assert(plan.moves.length === 2, `expected 2 moves got ${plan.moves.length}`);
    const byMpidx = plan.moves.find((m) => m.matchedBy === 'mpidx');
    assert(byMpidx && byMpidx.studentId === 'stu_1', 'mpidx match 김민수');
    assert(byMpidx.toCohortId === 'coh_new_a', 'moved to new garam');
    assert(byMpidx.fromCohortId === 'coh_old_a', 'from yeoul');
    assert(byMpidx.likelyLevelUp === true, 'level up yeoul → garam');
    const byName = plan.moves.find((m) => m.matchedBy === 'name');
    assert(byName && byName.studentId === 'stu_2', 'name match 이서연');
    assert(plan.adds.length === 1 && plan.adds[0].tmsName === '최유나', 'new student add');
    assert(
        plan.unmatchedPrevious.some((u) => u.studentId === 'stu_3'),
        '박지훈 unmatched previous'
    );
}

{
    const cohorts = [
        {
            id: 'coh_old',
            name: 'Old',
            students: [{ id: 'stu_1', name: '김민수', nameEn: '', tmsMpidx: '9', active: true, tags: [], sortOrder: 0 }]
        },
        {
            id: 'coh_new',
            name: 'New',
            students: []
        }
    ];
    const applied = D.applyTermMigrateTransferPlan(cohorts, {
        moves: [
            {
                studentId: 'stu_1',
                fromCohortId: 'coh_old',
                toCohortId: 'coh_new',
                tmsName: '김민수◆',
                nameEn: 'Minsu',
                tmsMpidx: '9'
            }
        ],
        adds: [{ toCohortId: 'coh_new', tmsName: '이서연', tmsNameEn: 'Seoyeon', tmsMpidx: '10' }]
    });
    assert(!applied.errors.length, 'no apply errors');
    const neu = applied.cohorts.find((c) => c.id === 'coh_new');
    const old = applied.cohorts.find((c) => c.id === 'coh_old');
    assert(neu.students.some((s) => s.id === 'stu_1' && s.tmsMpidx === '9'), 'preserved stu id');
    assert(neu.students.some((s) => s.name === '이서연'), 'added new');
    assert(!(old.students || []).some((s) => s.id === 'stu_1'), 'removed from old');
}

{
    const html = readFileSync(
        path.join(root, 'tests', 'fixtures', 'tms', 'class-popup-orange-schedule-snippet.html'),
        'utf8'
    );
    assert(typeof tms.parseClassPopupSchedule === 'function', 'parseClassPopupSchedule exported');
    const schedule = tms.parseClassPopupSchedule(html);
    assert(schedule && schedule.start === '15:20', `schedule start got ${schedule && schedule.start}`);
    assert(schedule.end === '17:00', `schedule end got ${schedule.end}`);
    const mapped = D.mapTmsBlockToPeriod(
        schedule,
        [
            { id: 'ts1', start: '14:30', end: '15:20' },
            { id: 'ts2', start: '15:20', end: '16:10' },
            { id: 'ts3', start: '16:10', end: '17:00' }
        ],
        { '1': 'ts1', '2': 'ts2', '3': 'ts3' }
    );
    assert(mapped.period === 2, 'fixture block maps to period 2');
    assert(typeof tms.parseClassPopupHomeroomName === 'function', 'homeroom parser');
    const hr = tms.parseClassPopupHomeroomName(html);
    assert(hr === '최미영', `expected 최미영 got ${hr}`);

    const yellowHtml = readFileSync(
        path.join(__dirname, 'fixtures', 'tms', 'class-popup-yellow-schedule-snippet.html'),
        'utf8'
    );
    const yellowHr = tms.parseClassPopupHomeroomName(yellowHtml);
    assert(yellowHr === '최미영', `yellow fixture 담임 got ${yellowHr}`);
}

{
    const merged = D.mergeRosterByKoreanName(
        [{ id: 'stu_x', name: '권이안', nameEn: '', tmsMpidx: '555' }],
        [{ name: '권이안◆', nameEn: 'Kwon', mpidx: '555' }]
    );
    assert(merged.summary.matched.length === 1, 'mpidx merge matched');
    assert(merged.summary.matched[0].matchedBy === 'mpidx', 'matched by mpidx');
    assert(merged.students[0].tmsMpidx === '555', 'keeps mpidx');
    assert(merged.students[0].name === '권이안', 'stores Korean identity without mark');
    assert(
        Array.isArray(merged.students[0].tags) && merged.students[0].tags.includes('transfer_in'),
        '◆ becomes transfer_in tag'
    );
    assert(merged.students[0].nameEn === 'Kwon', 'adopts TMS English');
}

{
    const previous = [
        {
            id: 'coh_yeoul',
            name: '여울M',
            levelPreset: 'yeoul',
            homeroomTeacherUserId: 'u1',
            homeroomTeacherName: 'Nathan'
        }
    ];
    const links = {
        'id:99': { action: 'map', cohortId: 'coh_yeoul', tmsClassId: '99', tmsClassName: '여울M' }
    };
    const byLink = D.matchPreviousCohortForTmsClass(previous, links, '99', '여울M');
    assert(byLink.cohort && byLink.cohort.id === 'coh_yeoul', 'match by tms link');
    assert(byLink.matchedBy === 'link', 'matchedBy link');

    const byName = D.matchPreviousCohortForTmsClass(previous, {}, '', '여울M');
    assert(byName.cohort && byName.cohort.id === 'coh_yeoul', 'match by name');
}

{
    const appData = {
        classes: [
            {
                id: 'cls_1',
                name: '여울 · Debate',
                cohortId: 'coh_yeoul',
                cohortIds: ['coh_yeoul'],
                period: 2,
                classTeachers: [{ id: 'ct1', userId: 'u_me', name: 'Me' }],
                startDate: '2026-03-01',
                endDate: '2026-05-31',
                syllabusRows: [{ date: '2026-03-05', topic: 'A' }]
            },
            {
                id: 'cls_other',
                name: '여울 · RC',
                cohortId: 'coh_yeoul',
                classTeachers: [{ id: 'ct2', userId: 'u_other', name: 'Other' }]
            }
        ]
    };
    const mine = D.findPreviousClassesForUser(appData, 'coh_yeoul', 'u_me');
    assert(mine.length === 1 && mine[0].id === 'cls_1', 'only my class');

    const carried = D.carryForwardClassForTerm(
        appData.classes[0],
        { id: 'coh_new' },
        3,
        'u_me',
        {
            shiftIsoDate: (d, delta) => {
                const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (!m) {
                    return d;
                }
                let month = Number(m[2]) + delta;
                let year = Number(m[1]);
                while (month > 12) {
                    month -= 12;
                    year += 1;
                }
                return `${year}-${String(month).padStart(2, '0')}-${m[3]}`;
            },
            newClassId: () => 'cls_new',
            teacherName: 'Me',
            startDate: '2026-06-01',
            endDate: '2026-08-31',
            period: 3
        }
    );
    assert(carried.id === 'cls_new', 'new class id');
    assert(carried.cohortId === 'coh_new', 'remapped cohort');
    assert(carried.startDate === '2026-06-01', 'override start');
    assert(carried.period === 3, 'override period');
    assert(carried.syllabusRows[0].date === '2026-06-05', 'syllabus shifted +3 months');
    assert(
        carried.classTeachers.length === 1 && carried.classTeachers[0].userId === 'u_me',
        'only current teacher'
    );
}

{
    const previousAppData = {
        termStart: '2026-03-01',
        termEnd: '2026-05-31',
        classes: [
            {
                id: 'cls_1',
                name: 'Debate',
                cohortId: 'coh_old',
                period: 2,
                classTeachers: [{ userId: 'u_me', name: 'Me' }]
            }
        ],
        cohorts: [{ id: 'coh_old', name: '여울M', levelPreset: 'yeoul' }]
    };
    const map = [
        {
            cohortId: 'tmp1',
            cohortName: '여울M',
            matchedPreviousCohortId: 'coh_old',
            tmsSuggestedPeriod: 2,
            levelPreset: 'yeoul'
        },
        {
            cohortId: 'tmp2',
            cohortName: 'NewClass',
            matchedPreviousCohortId: '',
            tmsSuggestedPeriod: null,
            levelPreset: 'garam'
        }
    ];
    const defaults = D.buildPerCohortTeachingDefaults(previousAppData, map, 'u_me', {
        monthShift: 3,
        termStart: '2026-06-01',
        termEnd: '2026-08-31',
        shiftIsoDate: (d) => d
    });
    assert(defaults[0].iTeachHere === true, 'teach default on for prior class');
    assert(defaults[0].classMode === 'carry', 'carry mode');
    assert(defaults[0].previousClassId === 'cls_1', 'prev class id');
    assert(defaults[1].iTeachHere === false, 'no prior → not teaching');
}

{
    const events = [
        { id: 'evt_1', title: 'Holiday', date: '2026-03-01', type: 'holiday' },
        { id: 'evt_2', title: 'Eval', startDate: '2026-04-01', endDate: '2026-04-07' }
    ];
    const shifted = D.shiftCalendarEvents(events, 3, {
        shiftIsoDate: (d, delta) => {
            const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!m) {
                return d;
            }
            let month = Number(m[2]) + delta;
            let year = Number(m[1]);
            while (month > 12) {
                month -= 12;
                year += 1;
            }
            return `${year}-${String(month).padStart(2, '0')}-${m[3]}`;
        },
        newEventId: () => `evt_${Math.random().toString(36).slice(2, 6)}`
    });
    assert(shifted.length === 2, 'two events');
    assert(shifted[0].date === '2026-06-01', 'event date shifted');
    assert(shifted[1].startDate === '2026-07-01', 'event start shifted');
    assert(shifted[0].id !== 'evt_1', 'new event id');
}

console.log('term-migrate.test.mjs: ok');
