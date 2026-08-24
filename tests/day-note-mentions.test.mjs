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

const stu1Entry = studentsSingle.find((s) => s.studentId === 'stu-1');
assert(stu1Entry && stu1Entry.insertLabel === 'Purple T: 김민지', 'insertLabel is cohort: Korean name');

const textOther = '@Green M 김민지 participated.';
const idsOther = mentions.syncTaggedStudentIdsFromText(textOther, 'class-dup', cohorts, classes);
assert(idsOther.length === 1 && idsOther[0] === 'stu-3', 'sync non-class student with legacy cohort-first tag');

const minjiEntries = studentsDup.filter((s) => s.name === '김민지');
assert(minjiEntries.length === 2, 'duplicate names appear twice');
assert(
    minjiEntries.some((s) => s.insertLabel === 'Purple T: 김민지'),
    'first duplicate uses cohort: Korean label'
);
assert(
    minjiEntries.some((s) => s.insertLabel === 'Green M: 김민지'),
    'second duplicate uses cohort: Korean label'
);

const textKoLegacyAt = '@Purple T 김민지 participated well today.';
const idsKoLegacyAt = mentions.syncTaggedStudentIdsFromText(textKoLegacyAt, 'class-1', cohorts, classes);
assert(idsKoLegacyAt.length === 1 && idsKoLegacyAt[0] === 'stu-1', 'sync legacy @ cohort-space Korean tag');

const textKoColon = 'Purple T: 김민지 participated well today.';
const idsKoColon = mentions.syncTaggedStudentIdsFromText(textKoColon, 'class-1', cohorts, classes);
assert(idsKoColon.length === 1 && idsKoColon[0] === 'stu-1', 'sync bare Class: Name tag');

const textKoAtColon = '@Purple T: 김민지 participated well today.';
const idsKoAtColon = mentions.syncTaggedStudentIdsFromText(textKoAtColon, 'class-1', cohorts, classes);
assert(idsKoAtColon.length === 1 && idsKoAtColon[0] === 'stu-1', 'sync @ Class: Name tag');

const textLegacy = '@김민지 participated well today.';
const idsLegacy = mentions.syncTaggedStudentIdsFromText(textLegacy, 'class-1', cohorts, classes);
assert(idsLegacy.length === 1 && idsLegacy[0] === 'stu-1', 'sync legacy name-only tag');

const textEn = '@Minji Kim was late.';
const idsEn = mentions.syncTaggedStudentIdsFromText(textEn, 'class-1', cohorts, classes);
assert(idsEn.length === 1 && idsEn[0] === 'stu-1', 'sync English name');

const disambigLabel = `김민지${mentions.DISAMBIG_SEP}Green M`;
const textDisambig = `@${disambigLabel} needs follow-up.`;
const idsDisambig = mentions.syncTaggedStudentIdsFromText(textDisambig, 'class-dup', cohorts, classes);
assert(idsDisambig.length === 1 && idsDisambig[0] === 'stu-3', 'sync legacy disambiguated duplicate name');

const removed = mentions.syncTaggedStudentIdsFromText('No tags here.', 'class-1', cohorts, classes);
assert(removed.length === 0, 'removing @mention clears ids on re-sync');

const normalized = dayNotes.normalizeDayNote({
    id: 'n1',
    classId: 'class-1',
    date: '2026-06-10',
    text: textKoColon,
    createdAt: '2026-06-10T10:00:00.000Z',
    taggedStudentIds: ['stu-1', 'stu-1', '']
});
assert(
    normalized.taggedStudentIds.length === 1 && normalized.taggedStudentIds[0] === 'stu-1',
    'normalizeDayNote dedupes taggedStudentIds'
);

const resolveStu1 = (sid) =>
    sid === 'stu-1'
        ? { name: '김민지', nameEn: 'Minji Kim', cohortName: 'Purple T' }
        : null;

const htmlLegacy = mentions.renderMentionHtml('Hello @Purple T 김민지 & <script>', ['stu-1'], resolveStu1);
assert(htmlLegacy.includes('<span class="day-note-mention">@Purple T 김민지</span>'), 'render highlights legacy @ mention');
assert(htmlLegacy.includes('&lt;script&gt;'), 'render escapes non-mention HTML');

const htmlBare = mentions.renderMentionHtml('Hello Purple T: 김민지 & <script>', ['stu-1'], resolveStu1);
assert(htmlBare.includes('<span class="day-note-mention">Purple T: 김민지</span>'), 'render highlights bare Class: Name');
assert(htmlBare.includes('&lt;script&gt;'), 'render escapes non-mention HTML for bare label');

const hayMatch = dayNotes.noteMatchesTextQuery(
    { text: 'quiet day', classId: 'class-1', taggedStudentIds: ['stu-2'] },
    'seojun',
    null,
    (note) => '이서준 Seojun Lee'
);
assert(hayMatch === true, 'text search matches tagged student hay');

function makeMockTextarea(value, pos) {
    return {
        value,
        selectionStart: pos != null ? pos : value.length,
        selectionEnd: pos != null ? pos : value.length,
        dispatchEvent() {},
        focus() {}
    };
}

const partialTa = makeMockTextarea('@Purple', 7);
mentions.insertMentionAtCursor(partialTa, 'Purple T: 김민지', { atIndex: 0, end: 7 });
assert(
    partialTa.value === 'Purple T: 김민지 ',
    'insertMentionAtCursor replaces partial @query with Class: Name and no @'
);

const afterMentionTa = makeMockTextarea('@Purple T 김민지 ', 17);
const mentionOpts = { classId: 'class-1', cohorts, classes };
const afterCtx = mentions.getMentionQueryAtCursor(afterMentionTa, mentionOpts);
assert(afterCtx === null, 'getMentionQueryAtCursor returns null after completed legacy mention');

const afterMentionMoreText = '@Purple T 김민지 participated well today.';
const afterMoreTa = makeMockTextarea(afterMentionMoreText, afterMentionMoreText.length);
const afterMoreCtx = mentions.getMentionQueryAtCursor(afterMoreTa, mentionOpts);
assert(afterMoreCtx === null, 'getMentionQueryAtCursor returns null after completed mention + more text');

const afterColonInsert = makeMockTextarea('Purple T: 김민지 ', 'Purple T: 김민지 '.length);
const afterColonCtx = mentions.getMentionQueryAtCursor(afterColonInsert, mentionOpts);
assert(afterColonCtx === null, 'getMentionQueryAtCursor returns null after bare insert (no @)');

const activeTa = makeMockTextarea('@Purple T', 9);
const activeCtx = mentions.getMentionQueryAtCursor(activeTa, mentionOpts);
assert(activeCtx && activeCtx.query === 'Purple T', 'getMentionQueryAtCursor allows spaces in active query');

const ambiguousCohorts = [
    {
        id: 'cohort-purple',
        name: 'Purple',
        students: [
            { id: 'stu-t', name: 'T', nameEn: 'Tee', sortOrder: 0, active: true }
        ]
    },
    {
        id: 'cohort-purple-t',
        name: 'Purple T',
        students: [
            { id: 'stu-1', name: '김민지', nameEn: 'Minji Kim', sortOrder: 0, active: true }
        ]
    }
];
const ambiguousClasses = [{ id: 'class-amb', cohortIds: ['cohort-purple', 'cohort-purple-t'] }];
const ambiguousOpts = { classId: 'class-amb', cohorts: ambiguousCohorts, classes: ambiguousClasses };

const ambiguousTa = makeMockTextarea('@Purple T', 9);
const ambiguousCtx = mentions.getMentionQueryAtCursor(ambiguousTa, ambiguousOpts);
assert(
    ambiguousCtx && ambiguousCtx.query === 'Purple T',
    'ambiguous Purple T prefix stays active (not falsely completed)'
);

const pickTa = makeMockTextarea('@Purple T', 9);
mentions.insertMentionAtCursor(pickTa, 'Purple T: 김민지', { atIndex: 0, end: 9 });
assert(
    pickTa.value === 'Purple T: 김민지 ',
    'insertMentionAtCursor with explicit range inserts Class: Name after ambiguous prefix'
);

const savedAmbiguous = '@Purple T 김민지 did great.';
const foundAmbiguous = mentions.findMentionsInText(savedAmbiguous, 'class-amb', ambiguousCohorts, ambiguousClasses);
assert(
    foundAmbiguous.length === 1
        && foundAmbiguous[0].label === 'Purple T 김민지'
        && foundAmbiguous[0].studentId === 'stu-1',
    'findMentionsInText picks longest legacy insertLabel when shorter prefix also exists'
);

const savedAmbiguousColon = 'Purple T: 김민지 did great.';
const foundAmbiguousColon = mentions.findMentionsInText(
    savedAmbiguousColon,
    'class-amb',
    ambiguousCohorts,
    ambiguousClasses
);
assert(
    foundAmbiguousColon.length === 1
        && foundAmbiguousColon[0].label === 'Purple T: 김민지'
        && foundAmbiguousColon[0].studentId === 'stu-1',
    'findMentionsInText picks bare Class: Name for ambiguous cohort'
);

const resolveAmbiguous = (sid) =>
    sid === 'stu-1'
        ? { name: '김민지', nameEn: 'Minji Kim', cohortName: 'Purple T' }
        : null;
const htmlAmbiguous = mentions.renderMentionHtml(savedAmbiguous, ['stu-1'], resolveAmbiguous);
assert(
    htmlAmbiguous.includes('<span class="day-note-mention">@Purple T 김민지</span>'),
    'renderMentionHtml highlights full ambiguous legacy cohort mention span'
);

const htmlAmbiguousColon = mentions.renderMentionHtml(savedAmbiguousColon, ['stu-1'], resolveAmbiguous);
assert(
    htmlAmbiguousColon.includes('<span class="day-note-mention">Purple T: 김민지</span>'),
    'renderMentionHtml highlights bare Class: Name ambiguous span'
);

const insertRangeTa = makeMockTextarea('@Purple T', 9);
const insertRange = mentions.resolveMentionInsertRange(insertRangeTa, ambiguousOpts);
assert(
    insertRange && insertRange.atIndex === 0 && insertRange.end === 9,
    'resolveMentionInsertRange captures @ through caret for pick insert'
);

const prevCandidates = [
    { studentId: 'stu-1', insertLabel: 'Purple T: 김민지' },
    { studentId: 'stu-2', insertLabel: 'Purple T: 이서준' }
];
const nextCandidates = [
    { studentId: 'stu-2', insertLabel: 'Purple T: 이서준' }
];
assert(
    mentions.preserveMentionActiveIndex(1, prevCandidates, nextCandidates) === 0,
    'preserveMentionActiveIndex follows highlighted student across filter'
);
assert(
    mentions.preserveMentionActiveIndex(0, prevCandidates, nextCandidates) === -1,
    'preserveMentionActiveIndex clears highlight when student drops from list'
);
assert(
    mentions.preserveMentionActiveIndex(-1, prevCandidates, nextCandidates) === -1,
    'preserveMentionActiveIndex stays -1 when nothing was highlighted'
);

const purpleFiltered = mentions.filterMentionCandidates(studentsSingle, 'Purple');
assert(
    purpleFiltered.length > 0 && purpleFiltered[0].studentId === 'stu-1',
    'filterMentionCandidates ranks Purple T prefix match first'
);

const minjiFiltered = mentions.filterMentionCandidates(studentsSingle, 'Minji');
assert(
    minjiFiltered.length > 0 && minjiFiltered[0].studentId === 'stu-1',
    'filterMentionCandidates ranks English name prefix first'
);

assert(
    mentions.getMentionCompletionSuffix('Purple', stu1Entry) === ' T: 김민지 ',
    'getMentionCompletionSuffix returns insertLabel remainder for prefix match'
);

assert(
    mentions.getMentionCompletionSuffix('Minji', stu1Entry) === 'Purple T: 김민지 ',
    'getMentionCompletionSuffix returns full insertLabel for name prefix match'
);

assert(
    mentions.scoreMentionCandidate(stu1Entry, 'Purple T: 김민지')
        > mentions.scoreMentionCandidate(stu1Entry, 'Purple'),
    'exact insertLabel match scores higher than prefix'
);

console.log('day-note-mentions.test.mjs: all passed');
