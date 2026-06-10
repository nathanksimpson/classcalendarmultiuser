/**
 * Run: node tests/day-note-mentions.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'classroom-domain.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'day-note-categories.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'day-notes.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'day-note-mentions.js')).href);

const mentions = globalThis.CCPDayNoteMentions;
const dayNotes = globalThis.CCPDayNotes;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const cohorts = [
    {
        id: 'cohort-a',
        name: 'Purple T',
        students: [
            { id: 'stu-1', name: '김민지', nameEn: 'Minji Kim', sortOrder: 0, active: true },
            { id: 'stu-2', name: '이서준', nameEn: 'Seojun Lee', sortOrder: 1, active: true }
        ]
    },
    {
        id: 'cohort-b',
        name: 'Green M',
        students: [
            { id: 'stu-3', name: '김민지', nameEn: 'Minji B', sortOrder: 0, active: true }
        ]
    }
];

const classes = [
    { id: 'class-1', cohortIds: ['cohort-a'] },
    { id: 'class-dup', cohortIds: ['cohort-a', 'cohort-b'] }
];

const studentsSingle = mentions.getStudentsForMentions('class-1', cohorts, classes);
assert(studentsSingle.length === 3, 'class-1 includes class roster plus other active students');
assert(studentsSingle[0].tier === 0 && studentsSingle[0].studentId === 'stu-1', 'class roster listed first');
assert(studentsSingle.filter((s) => s.tier === 0).length === 2, 'class-1 tier 0 is class roster');
const otherStudent = studentsSingle.find((s) => s.studentId === 'stu-3');
assert(otherStudent && otherStudent.tier === 1, 'other-cohort student is tier 1 and still taggable');

const studentsDup = mentions.getStudentsForMentions('class-dup', cohorts, classes);
const classDupTier0 = studentsDup.filter((s) => s.tier === 0);
const classDupTier1 = studentsDup.filter((s) => s.tier === 1);
assert(classDupTier0.length === 3, 'class-dup tier 0 has all linked cohort students');
assert(classDupTier1.length === 0, 'class-dup has no tier 1 when roster covers all active students');

const sorted = mentions.sortMentionCandidates([
    { insertLabel: 'Zed', tier: 1 },
    { insertLabel: 'Amy', tier: 0 },
    { insertLabel: 'Bob', tier: 0 }
]);
assert(sorted[0].tier === 0 && sorted[0].insertLabel === 'Amy', 'sortMentionCandidates tier 0 first');

const textOther = '@Minji B participated.';
const idsOther = mentions.syncTaggedStudentIdsFromText(textOther, 'class-dup', cohorts, classes);
assert(idsOther.length === 1 && idsOther[0] === 'stu-3', 'sync non-class student from full roster');
const minjiEntries = studentsDup.filter((s) => s.name === '김민지');
assert(minjiEntries.length === 2, 'duplicate names appear twice');
assert(
    minjiEntries.some((s) => s.insertLabel === `김민지${mentions.DISAMBIG_SEP}Purple T`),
    'first duplicate disambiguated with cohort'
);
assert(
    minjiEntries.some((s) => s.insertLabel === `김민지${mentions.DISAMBIG_SEP}Green M`),
    'second duplicate disambiguated with cohort'
);

const textKo = '@김민지 participated well today.';
const idsKo = mentions.syncTaggedStudentIdsFromText(textKo, 'class-1', cohorts, classes);
assert(idsKo.length === 1 && idsKo[0] === 'stu-1', 'sync Korean name');

const textEn = '@Minji Kim was late.';
const idsEn = mentions.syncTaggedStudentIdsFromText(textEn, 'class-1', cohorts, classes);
assert(idsEn.length === 1 && idsEn[0] === 'stu-1', 'sync English name');

const disambigLabel = minjiEntries.find((s) => s.cohortName === 'Green M').insertLabel;
const textDisambig = `@${disambigLabel} needs follow-up.`;
const idsDisambig = mentions.syncTaggedStudentIdsFromText(textDisambig, 'class-dup', cohorts, classes);
assert(idsDisambig.length === 1 && idsDisambig[0] === 'stu-3', 'sync disambiguated duplicate name');

const removed = mentions.syncTaggedStudentIdsFromText('No tags here.', 'class-1', cohorts, classes);
assert(removed.length === 0, 'removing @mention clears ids on re-sync');

const normalized = dayNotes.normalizeDayNote({
    id: 'n1',
    classId: 'class-1',
    date: '2026-06-10',
    text: textKo,
    createdAt: '2026-06-10T10:00:00.000Z',
    taggedStudentIds: ['stu-1', 'stu-1', '']
});
assert(
    normalized.taggedStudentIds.length === 1 && normalized.taggedStudentIds[0] === 'stu-1',
    'normalizeDayNote dedupes taggedStudentIds'
);

const html = mentions.renderMentionHtml(
    'Hello @김민지 & <script>',
    ['stu-1'],
    (sid) => (sid === 'stu-1' ? { name: '김민지', nameEn: 'Minji Kim' } : null)
);
assert(html.includes('<span class="day-note-mention">@김민지</span>'), 'render highlights mention');
assert(html.includes('&lt;script&gt;'), 'render escapes non-mention HTML');

const hayMatch = dayNotes.noteMatchesTextQuery(
    { text: 'quiet day', classId: 'class-1', taggedStudentIds: ['stu-2'] },
    'seojun',
    null,
    (note) => '이서준 Seojun Lee'
);
assert(hayMatch === true, 'text search matches tagged student hay');

console.log('day-note-mentions.test.mjs: all passed');
