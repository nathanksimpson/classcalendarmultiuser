/**
 * Run: node tests/nav-tab-layout.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

function loadApi() {
    const sandbox = { window: {}, globalThis: {} };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const code = readFileSync(path.join(root, 'js', 'nav-tab-layout.js'), 'utf8');
    vm.runInNewContext(code, sandbox);
    return sandbox.CCPNavTabLayout;
}

const ZONE_SEGMENT_TO_TAB = {
    schedule: { calendar: 'calendar', events: 'events', homework: 'homework', timetable: 'timetable' },
    classes: {
        classes: 'classes',
        cohorts: 'cohorts',
        teachers: 'teachers',
        curriculum: 'curriculum',
        syllabus: 'syllabus'
    },
    classroom: {
        students: 'students',
        attendance: 'attendance',
        ledger: 'ledger',
        homework: 'homework-tracking',
        points: 'points',
        tests: 'tests',
        notes: 'notes'
    },
    tools: {
        essays: 'essays',
        'debate-teams': 'debate-teams',
        'debate-scores': 'debate-scores',
        'speaking-test': 'speaking-test'
    },
    more: { data: 'data' }
};

const ZONE_IDS = ['schedule', 'classes', 'classroom', 'tools', 'more'];

const api = loadApi();

const defaultsZone = api.buildDefaultTabZone(ZONE_SEGMENT_TO_TAB);
assert(defaultsZone.essays === 'tools', 'default essays in tools');
assert(defaultsZone['speaking-test'] === 'tools', 'default speaking-test in tools');
assert(defaultsZone['homework-tracking'] === 'classroom', 'classroom homework tab');
assert(defaultsZone.homework === 'schedule', 'schedule homework tab');
assert(!defaultsZone.data, 'data not in default tab zone map');

const migrated = api.migrateSegmentOrderToTabOrder(
    {
        tools: ['debate-teams', 'essays'],
        classroom: ['notes', 'students']
    },
    ZONE_SEGMENT_TO_TAB
);
assert(migrated.tools[0] === 'debate-teams', 'migrate preserves tools order');
assert(migrated.tools.includes('essays'), 'migrate keeps essays in tools');
assert(migrated.classroom[0] === 'notes', 'migrate classroom order');
assert(migrated.classroom.includes('attendance'), 'migrate fills missing classroom tabs');

const moved = api.normalizeTabLayout(
    {
        navTabZone: { essays: 'classroom' },
        navTabOrder: {
            classroom: ['students', 'essays', 'attendance'],
            tools: ['debate-teams']
        }
    },
    ZONE_SEGMENT_TO_TAB,
    ZONE_IDS
);
assert(moved.navTabZone.essays === 'classroom', 'custom essays assignment kept');
assert(moved.navTabOrder.classroom.includes('essays'), 'essays listed under classroom');
assert(!moved.navTabOrder.tools.includes('essays'), 'essays removed from tools order');
assert(moved.navTabOrder.tools.includes('debate-teams'), 'tools keeps debate-teams');
assert(moved.navTabOrder.tools.includes('debate-scores'), 'tools keeps debate-scores default');
assert(moved.navTabOrder.tools.includes('speaking-test'), 'tools keeps speaking-test default');

assert(!api.canAcceptSegmentDrop('more', 'essays'), 'Data zone rejects segment drops');
assert(!api.canAcceptSegmentDrop('classroom', 'teachers'), 'teachers not movable');
assert(api.canAcceptSegmentDrop('classroom', 'essays'), 'essays can move to classroom');

const emptyAttempt = api.applyCrossZoneMove(
    {
        navTabZone: {
            essays: 'classroom',
            'debate-teams': 'tools',
            'debate-scores': 'classroom',
            'speaking-test': 'classroom'
        },
        navTabOrder: {
            classroom: ['students', 'essays', 'attendance', 'debate-scores', 'speaking-test'],
            tools: ['debate-teams']
        }
    },
    'debate-teams',
    'classroom'
);
assert(!emptyAttempt.ok && emptyAttempt.reason === 'empty-zone', 'cannot empty tools zone');

const okMove = api.applyCrossZoneMove(
    {
        navTabZone: {
            essays: 'tools',
            'debate-teams': 'tools',
            'debate-scores': 'tools',
            'speaking-test': 'tools',
            students: 'classroom',
            attendance: 'classroom',
            ledger: 'classroom',
            'homework-tracking': 'classroom',
            points: 'classroom',
            tests: 'classroom',
            notes: 'classroom'
        },
        navTabOrder: {
            tools: ['essays', 'debate-teams', 'debate-scores', 'speaking-test'],
            classroom: ['students', 'attendance', 'ledger', 'homework-tracking', 'points', 'tests', 'notes']
        }
    },
    'essays',
    'classroom',
    'attendance'
);
assert(okMove.ok, 'essays move to classroom allowed when tools still has debate tabs');
assert(okMove.layout.navTabZone.essays === 'classroom', 'essays zone updated');
assert(okMove.layout.navTabOrder.classroom.indexOf('essays') < okMove.layout.navTabOrder.classroom.indexOf('attendance'), 'insert before attendance');
assert(
    okMove.layout.navTabOrder.tools.join(',') === 'debate-teams,debate-scores,speaking-test',
    'tools left with debate and speaking tabs'
);

assert(
    api.tabForZoneSegment('schedule', 'homework', ZONE_SEGMENT_TO_TAB, defaultsZone) === 'homework',
    'schedule homework resolves to homework tab'
);
assert(
    api.tabForZoneSegment('classroom', 'homework', ZONE_SEGMENT_TO_TAB, defaultsZone) === 'homework-tracking',
    'classroom homework resolves to homework-tracking'
);
assert(
    api.tabForZoneSegment('tools', 'debate-scores', ZONE_SEGMENT_TO_TAB, defaultsZone) === 'debate-scores',
    'tools debate-scores resolves'
);
assert(
    api.tabForZoneSegment('tools', 'speaking-test', ZONE_SEGMENT_TO_TAB, defaultsZone) === 'speaking-test',
    'tools speaking-test resolves'
);

const emptiedNormalized = api.normalizeTabLayout(
    {
        navTabZone: {
            essays: 'classroom',
            'debate-teams': 'classroom',
            'debate-scores': 'classroom',
            'speaking-test': 'classroom'
        },
        navTabOrder: { tools: [], classroom: ['essays', 'debate-teams', 'debate-scores', 'speaking-test'] }
    },
    ZONE_SEGMENT_TO_TAB,
    ZONE_IDS
);
assert(emptiedNormalized.navTabOrder.tools.length > 0, 'normalize restores empty tools zone');

console.log('nav-tab-layout.test.mjs: all passed');
