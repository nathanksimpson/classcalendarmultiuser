/**
 * Run: node tests/zone-nav-reorder.test.mjs
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

function loadReorderApi() {
    const sandbox = { window: {}, globalThis: {} };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const code = readFileSync(path.join(root, 'js', 'zone-nav-reorder.js'), 'utf8');
    vm.runInNewContext(code, sandbox);
    return sandbox.CCPZoneNavReorder;
}

const api = loadReorderApi();
const DEFAULT_ZONES = ['schedule', 'classes', 'setup-hub', 'classroom', 'more'];
const SCHEDULE_DEFAULTS = ['calendar', 'events', 'homework', 'timetable'];

assert(
    api.normalizeZoneOrder(['classroom', 'schedule'], DEFAULT_ZONES).join(',') === 'classes,setup-hub,classroom,schedule,more',
    'custom zone order preserved with missing zones merged at canonical positions'
);

assert(
    api.normalizeZoneOrder(['bogus', 'schedule', 'classroom'], DEFAULT_ZONES).join(',') === 'schedule,classes,setup-hub,classroom,more',
    'unknown zone ids are stripped'
);

assert(
    api.normalizeSegmentOrder('schedule', ['timetable', 'calendar'], SCHEDULE_DEFAULTS).join(',') === 'events,homework,timetable,calendar',
    'missing default segments merge at canonical index'
);

assert(
    !api.normalizeSegmentOrder('schedule', ['command-center', 'calendar'], [...SCHEDULE_DEFAULTS, 'command-center']).includes('command-center'),
    'archived command-center segment excluded from normalized order'
);

const classesOrder = api.normalizeSegmentOrder('classes', ['syllabus', 'classes'], ['classes', 'cohorts', 'curriculum', 'syllabus']);
assert(
    classesOrder.join(',') === 'cohorts,curriculum,syllabus,classes',
    'segment order stays scoped to one zone defaults'
);

console.log('zone-nav-reorder.test.mjs: all passed');
