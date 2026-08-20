import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const counsel = require(path.join(root, 'shared', 'tms-counsel-core.cjs'));

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

{
    const html = readFileSync(path.join(__dirname, 'fixtures', 'tms', 'profiles-new-snippet.html'), 'utf8');
    const parsed = counsel.parseProfileHtml(html, { studentId: 's1', name: 'Test', mpidx: '100' });
    assert(parsed.notes.length >= 4, `snippet counsel notes ${parsed.notes.length}`);
    assert(parsed.attendanceRecords.length >= 3, `snippet attendance ${parsed.attendanceRecords.length}`);
    assert(parsed.enrollStatus === '재원', `enroll ${parsed.enrollStatus}`);
    assert(!parsed.notes.some((n) => n.kind === '인수인계'), 'drops handover row from output');
    const flagged = parsed.notes.find((n) => n.flags.includes('quit'));
    assert(flagged, 'quit flag from counsel text');
}

{
    const counselHtml = readFileSync(path.join(__dirname, 'fixtures', 'tms', 'iframe-consult-snippet.html'), 'utf8');
    const absenceHtml = readFileSync(path.join(__dirname, 'fixtures', 'tms', 'iframe-absence-snippet.html'), 'utf8');
    const parsed = counsel.parseProfileParts(
        { counselHtml, attendanceHtml: absenceHtml, profileHtml: '' },
        { studentId: 's2', mpidx: '200' }
    );
    assert(parsed.notes.length === 4, `iframe counsel kept ${parsed.notes.length} (drops 인수인계)`);
    assert(parsed.attendanceRecords.length === 3, `iframe attendance ${parsed.attendanceRecords.length}`);
    const outNote = parsed.notes.find((n) => n.kind.includes('out'));
    assert(outNote && outNote.teacher === '김선생', `counselor split teacher=${outNote && outNote.teacher}`);
    assert(outNote && outNote.text.includes('숙제'), `full text from title attr`);
    assert(parsed.notes.some((n) => n.flags.includes('attendance')), 'attendance flag in counsel');
    assert(parsed.notes.some((n) => n.flags.includes('break')), 'break flag in counsel');
}

{
    const flags = counsel.detectFlags('다음 달 퇴원 예정입니다');
    assert(flags.includes('quit'), 'detect quit keyword');
}

{
    const earlyLeave = counsel.detectFlags('오늘 조퇴했습니다');
    assert(!earlyLeave.includes('quit'), '조퇴 must not flag quit/Left');
}

console.log('tms-counsel-profiles.test.mjs: ok');
