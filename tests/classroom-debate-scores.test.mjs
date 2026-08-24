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

assert(d.normalizeDebateScoreValue(3.5) === 3.5, 'half point kept');
assert(d.normalizeDebateScoreValue(3.2) === 3, '3.2 snaps down to 3');
assert(d.normalizeDebateScoreValue(3.3) === 3.5, '3.3 snaps up to 3.5');
assert(d.normalizeDebateScoreValue(5.4) === 5, 'clamp max 5');
assert(d.normalizeDebateScoreValue(-1) === 0, 'clamp min 0');
assert(
    d.computeDebateScoreTotal(
        { eyeContact: 3.5, voice: 4.5, fluency: 5, content: 2.5, logic: 1.5, confidence: 4 },
        'garam'
    ) === 21,
    'garam total with halves'
);

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

const students = [
    { id: 's-pm', name: '김민수', nameEn: 'Minsu' },
    { id: 's-lo', name: '이서연', nameEn: 'Seoyeon' },
    { id: 's-legacy', name: '박지훈', nameEn: '' }
];

const teamSession = {
    id: 'dts1',
    classId: 'cls1',
    date: '2026-07-10',
    sessionState: {
        version: 2,
        debates: [
            {
                number: 1,
                benches: [
                    {
                        id: 'gov',
                        label: 'Government',
                        members: [
                            {
                                name: 'Minsu',
                                studentId: 's-pm',
                                role: { abbr: 'PM', name: 'Prime Minister' }
                            },
                            {
                                name: '박지훈',
                                role: { abbr: 'DPM', name: 'Deputy Prime Minister' }
                            }
                        ]
                    },
                    {
                        id: 'opp',
                        label: 'Opposition',
                        members: [
                            {
                                name: 'Seoyeon',
                                studentId: 's-lo',
                                role: { abbr: 'LO', name: 'Leader of Opposition' }
                            }
                        ]
                    }
                ]
            }
        ]
    }
};

const roleMap = d.buildDebateRoleMapFromTeamSession(teamSession, students);
assert(roleMap['s-pm'] && roleMap['s-pm'].roleAbbr === 'PM', 'role by studentId');
assert(roleMap['s-lo'] && roleMap['s-lo'].roleAbbr === 'LO', 'role by studentId LO');
assert(roleMap['s-legacy'] && roleMap['s-legacy'].roleAbbr === 'DPM', 'role by Korean name fallback');
assert(roleMap['s-pm'].bench === 'Government', 'bench preserved');
assert(roleMap['s-pm'].debateNumber === 1, 'debate number preserved');

assert(
    d.formatDebateScoreRoleLabel({ roleAbbr: 'PM', bench: 'Government' }) === 'PM · Government',
    'role label with bench'
);
assert(d.formatDebateScoreRoleLabel({ roleAbbr: 'PM' }) === 'PM', 'role label abbr only');
assert(
    d.formatDebateScoreRoleLabel({ roleName: 'Prime Minister' }) === 'Prime Minister',
    'role label name fallback'
);

const preservedScores = d.normalizeDebateScoreRecord(
    {
        studentId: 's-pm',
        roleAbbr: 'OLD',
        scores: { eyeContact: 4, voice: 4, fluency: 4, content: 4, logic: 4, confidence: 4 },
        note: 'keep me'
    },
    'garam'
);
assert(preservedScores.note === 'keep me', 'note stays on normalize');
assert(preservedScores.total === 24, 'scores stay on normalize');

const refreshed = d.normalizeDebateScoreRecord(
    {
        studentId: 's-pm',
        roleAbbr: roleMap['s-pm'].roleAbbr,
        roleName: roleMap['s-pm'].roleName,
        debateNumber: roleMap['s-pm'].debateNumber,
        bench: roleMap['s-pm'].bench,
        scores: preservedScores.scores,
        note: preservedScores.note
    },
    'garam'
);
assert(refreshed.roleAbbr === 'PM', 'teams role replaces old abbr');
assert(refreshed.note === 'keep me', 'note preserved when roles refresh');
assert(refreshed.total === 24, 'scores preserved when roles refresh');

console.log('classroom-debate-scores.test.mjs: ok');
