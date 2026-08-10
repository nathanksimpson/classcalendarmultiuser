/**
 * Run: node tests/calendar-export.test.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const exportCore = require(path.join(root, 'shared', 'calendar-export-core.cjs'));

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const {
    CALENDAR_DOMAIN_TOP_LEVEL_KEYS,
    EXPORT_FORMAT_VERSION,
    buildCalendarExportPayload,
    stripExportMeta
} = exportCore;

{
    const minimal = {
        classes: [{ id: 'c1', name: 'Purple T' }],
        events: [{ id: 'e1', type: 'holiday', name: 'Test Day', startDate: '2026-03-01' }],
        holidays: [{ id: 'e1', name: 'legacy' }],
        futureFeatureX: { enabled: true }
    };
    const payload = buildCalendarExportPayload(minimal, {
        schemaVersion: 3,
        normalizeTermStartDate: (v) => v || null,
        getResolvedTermEndISO: () => '2026-05-31',
        getTermMonthCount: () => 3,
        exportedAt: '2026-08-10T00:00:00.000Z'
    });

    CALENDAR_DOMAIN_TOP_LEVEL_KEYS.forEach((key) => {
        assert(Object.prototype.hasOwnProperty.call(payload, key), `missing canonical key: ${key}`);
    });
    assert(Array.isArray(payload.classes) && payload.classes.length === 1, 'classes preserved');
    assert(Array.isArray(payload.events) && payload.events.length === 1, 'events preserved');
    assert(Array.isArray(payload.attendanceSessions), 'attendanceSessions default []');
    assert(Array.isArray(payload.debateBookDistributions), 'debateBookDistributions default []');
    assert(Array.isArray(payload.speakingTestRecords), 'speakingTestRecords default []');
    assert(
        payload.tmsRosterLinks && typeof payload.tmsRosterLinks === 'object' && !Array.isArray(payload.tmsRosterLinks),
        'tmsRosterLinks object'
    );
    assert(
        payload.tmsEssayLinks && typeof payload.tmsEssayLinks === 'object' && !Array.isArray(payload.tmsEssayLinks),
        'tmsEssayLinks object'
    );
    assert(payload.plannerState === null, 'plannerState default null');
    assert(payload.ui && typeof payload.ui === 'object', 'ui kept');
    assert(!Object.prototype.hasOwnProperty.call(payload, 'holidays'), 'legacy holidays omitted');
    assert(payload.futureFeatureX && payload.futureFeatureX.enabled === true, 'unknown keys preserved');
    assert(payload.exportMeta && payload.exportMeta.exportFormatVersion === EXPORT_FORMAT_VERSION, 'exportMeta version');
    assert(payload.exportMeta.exportedAt === '2026-08-10T00:00:00.000Z', 'exportMeta exportedAt');
    assert(payload.exportMeta.schemaVersion === 3, 'exportMeta schemaVersion');
    assert(payload.termEnd === '2026-05-31', 'termEnd from helper');
    assert(payload.termMonthCount === 3, 'termMonthCount from helper');
}

{
    const rich = {
        classes: [],
        events: [],
        ui: { studentArchiveRetentionDays: 45, activeTab: 'data' },
        tmsEssayLinks: { essay_1: { action: 'map', syllabusRowId: 'r1' } },
        debateBookDistributions: [{ id: 'd1', classId: 'c1', periodKey: 'term', records: [] }],
        speakingTestRecords: [{ id: 's1', classId: 'c1', records: [] }]
    };
    const payload = buildCalendarExportPayload(rich, { schemaVersion: 3 });
    assert(payload.ui.studentArchiveRetentionDays === 45, 'ui retention days exported');
    assert(payload.ui.activeTab === 'data', 'ui activeTab exported');
    assert(payload.tmsEssayLinks.essay_1.syllabusRowId === 'r1', 'tmsEssayLinks exported');
    assert(payload.debateBookDistributions[0].id === 'd1', 'debateBookDistributions exported');
    assert(payload.speakingTestRecords[0].id === 's1', 'speakingTestRecords exported');
}

{
    const imported = {
        classes: [],
        events: [],
        exportMeta: { exportFormatVersion: 1, exportedAt: 'x', schemaVersion: 3 }
    };
    stripExportMeta(imported);
    assert(!Object.prototype.hasOwnProperty.call(imported, 'exportMeta'), 'stripExportMeta removes exportMeta');
}

{
    const badLinks = {
        classes: [],
        events: [],
        tmsRosterLinks: [],
        tmsEssayLinks: 'nope'
    };
    const payload = buildCalendarExportPayload(badLinks, { schemaVersion: 3 });
    assert(
        payload.tmsRosterLinks && typeof payload.tmsRosterLinks === 'object' && !Array.isArray(payload.tmsRosterLinks),
        'bad tmsRosterLinks normalized to object'
    );
    assert(
        payload.tmsEssayLinks && typeof payload.tmsEssayLinks === 'object' && !Array.isArray(payload.tmsEssayLinks),
        'bad tmsEssayLinks normalized to object'
    );
}

console.log('calendar-export.test.mjs: ok');
