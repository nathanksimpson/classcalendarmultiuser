/**
 * Run: node tests/classroom-debate-scores.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'classroom-domain.js')).href);

const d = globalThis.CCPClassroomDomain;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

assert(d.getDebateScoreCriteria('garam').join(',') === 'eyeContact,voice,fluency,content,logic,confidence', 'garam criteria');
assert(d.getDebateScoreCriteria('yeoul').join(',') === 'eyeContact,voice,fluency,confidence', 'yeoul criteria');
assert(d.getDebateScoreMaxTotal('garam') === 30, 'garam max');
assert(d.getDebateScoreMaxTotal('yeoul') === 20, 'yeoul max');

assert(d.computeDebateScoreTotal({ eyeContact: 5, voice: 4, fluency: 3, content: 2, logic: 1, confidence: 5 }, 'garam') === 20, 'garam total');
assert(d.computeDebateScoreTotal({ eyeContact: 5, voice: 4, fluency: 3, content: 2, logic: 1, confidence: 5 }, 'yeoul') === 17, 'yeoul ignores content/logic');
assert(d.computeDebateScoreTotal({}, 'garam') === null, 'empty total is null');

const record = d.normalizeDebateScoreRecord(
    {
        studentId: 's1',
        roleAbbr: 'PM',
        scores: { eyeContact: 5, voice: 5, fluency: 5, content: 5, logic: 5, confidence: 5 },
        note: 'strong'
    },
    'garam'
);
assert(record.total === 30, 'normalize computes garam total');
assert(record.roleAbbr === 'PM', 'role preserved');

const yeoulRec = d.normalizeDebateScoreRecord(
    {
        studentId: 's1',
        scores: { eyeContact: 5, voice: 5, fluency: 5, content: 5, logic: 5, confidence: 5 }
    },
    'yeoul'
);
assert(yeoulRec.total === 20, 'yeoul total caps criteria');

let sessions = [];
sessions = d.upsertDebateScoreSession(sessions, {
    id: 'dbs1',
    classId: 'cls1',
    date: '2026-07-10',
    sheetTemplate: 'garam',
    records: [record]
});
assert(sessions.length === 1, 'upsert inserts');
const found = d.findDebateScoreSession(sessions, 'cls1', '2026-07-10');
assert(found && found.records.length === 1, 'find by class+date');

sessions = d.upsertDebateScoreSession(sessions, {
    id: 'dbs2',
    classId: 'cls1',
    date: '2026-07-10',
    sheetTemplate: 'yeoul',
    records: [yeoulRec]
});
assert(sessions.length === 1, 'upsert replaces same key');
assert(sessions[0].id === 'dbs1', 'keeps original id');
assert(sessions[0].sheetTemplate === 'yeoul', 'updates template');

const data = {};
assert(d.migrateClassroomData(data) === true, 'migrate adds arrays');
assert(Array.isArray(data.debateScores) && data.debateScores.length === 0, 'debateScores migrated');

console.log('classroom-debate-scores.test.mjs: ok');
