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

const FIXTURE_CLASS_SELECT = `
<div class="class_select">
  <ul>
    <li class="selected">
      <a id="repe1_LinkButton1_0" class="clock" href="javascript:__doPostBack('repe1$ctl00$LinkButton1','')">NavyM_26SP</a>
      <input type="hidden" name="repe1$ctl00$Hsubclass" id="repe1_Hsubclass_0" value="30496">
    </li>
    <li>
      <a id="repe1_LinkButton1_1" href="javascript:__doPostBack('repe1$ctl01$LinkButton1','')">OrangeM^2606</a>
      <input type="hidden" name="repe1$ctl01$Hsubclass" id="repe1_Hsubclass_1" value="30964">
    </li>
    <li>
      <a href="javascript:__doPostBack('repe1$ctl02$LinkButton1','')">숙제미확인</a>
      <input type="hidden" name="repe1$ctl02$Hsubclass" id="repe1_Hsubclass_2" value="111">
    </li>
    <li>
      <a href="javascript:__doPostBack('repe1$ctl03$LinkButton1','')">클래스관리</a>
      <input type="hidden" name="repe1$ctl03$Hsubclass" id="repe1_Hsubclass_3" value="222">
    </li>
    <li>
      <a href="javascript:__doPostBack('repe1$ctl04$LinkButton1','')">BadZero</a>
      <input type="hidden" name="repe1$ctl04$Hsubclass" id="repe1_Hsubclass_4" value="0">
    </li>
  </ul>
</div>
`;

{
    const list = tms.parseClassSelectList(FIXTURE_CLASS_SELECT);
    assert(list.length === 2, `expected 2 actionable classes, got ${list.length}`);
    assert(list[0].cohortName === 'NavyM_26SP', 'first name NavyM_26SP');
    assert(list[0].tmsClassId === '30496', 'first id 30496');
    assert(list[1].cohortName === 'OrangeM^2606', 'second name OrangeM^2606');
    assert(list[1].tmsClassId === '30964', 'second id 30964');
}

{
    assert(tms.isNoiseClassName('숙제미확인'), 'noise 숙제미확인');
    assert(tms.isNoiseClassName('클래스관리'), 'noise 클래스관리');
    assert(!tms.isNoiseClassName('NavyM^2606'), 'real class not noise');
    assert(tms.isJunkHeaderCohortName('번호 제목 파일 조회수 등록자 등록일'), 'junk headers');
    assert(tms.isJunkHeaderCohortName('심슨어학원 TMS 페이지입니다.'), 'site title junk');
    assert(!tms.isJunkHeaderCohortName('PurpleM^2606'), 'real class not junk');
}

{
    const merged = tms.mergeCohortLists([
        {
            cohortName: 'OldName',
            tmsClassId: '30496',
            students: [{ name: '김민수', nameEn: '' }],
            source: 'class-popup'
        },
        {
            cohortName: 'NavyM_26SP',
            tmsClassId: '30496',
            students: [{ name: '이서연', nameEn: '' }],
            source: 'class-popup'
        },
        {
            cohortName: '번호 제목 파일',
            tmsClassId: '',
            students: [{ name: '박지훈', nameEn: '' }],
            source: 'table'
        }
    ]);
    const byId = merged.find((c) => c.tmsClassId === '30496');
    assert(byId, 'merged by tmsClassId');
    assert(byId.students.length === 2, 'merged students under same id');
    assert(
        byId.students.some((s) => s.name === '김민수') && byId.students.some((s) => s.name === '이서연'),
        'both students kept'
    );
}

{
    assert(!tms.isLikelyStudentName('매우만족'), '매우만족 not a student name');
    assert(!tms.isLikelyStudentName('만족'), '만족 not a student name');
    assert(tms.isLikelyStudentName('조하연'), '조하연 is a student name');
    assert(tms.isLikelyStudentName('권이안◆'), 'disambiguator diamond allowed');
    assert(tms.isLikelyStudentName('김민수A'), 'disambiguator latin allowed');
    assert(!tms.isLikelyStudentName('◆'), 'symbol alone rejected');
    assert(tms.stripTmsAttendanceNoise('권이안 (Absent)') === '권이안', 'strip english attendance');
    assert(tms.stripTmsAttendanceNoise('권이안 결석') === '권이안', 'strip korean attendance');
    assert(tms.normalizeTmsStudentName('권이안◆ 결석').name === '권이안◆', 'keep diamond after attendance strip');
}

{
    const html = `
      <td class="TL">
        <span><a href="javascript:studentinf(137338)">조하연</a><br></span>
        (<a href="#">Alice</a>)
      </td>
      <td class="TL">
        <div class="studentlisttable3">
          <table><tr><td class="box01">[숙제확인]</td></tr>
          <tr><td class="box01">매우만족</td></tr>
          <tr><td><a href="#">No Check</a></td></tr>
        </table>
      </div>
      <input type="hidden" name="Hselfcheck" value="매우만족">
      <input type="hidden" name="HHmpidx" value="137338">
      </td>
      <td><a href="javascript:studentinf(135691)">김민수</a></td>
    `;
    const students = tms.parseStudentsFromClassPopup(html);
    assert(students.length === 2, `expected 2 students, got ${students.length}`);
    assert(students[0].name === '조하연', 'first 조하연');
    assert(students[0].nameEn === 'Alice', 'english Alice');
    assert(students[1].name === '김민수', 'second 김민수');
    assert(!students.some((s) => s.name === '매우만족'), 'no 매우만족');
    assert(!students.some((s) => /숙제확인/.test(s.name)), 'no 숙제확인');
}

{
    const html = `
      <td><a href="javascript:studentinf(10101)">권이안◆</a></td>
      <td><a href="javascript:studentinf(10102)">김민수A</a></td>
      <td><a href="javascript:studentinf(10103)">이서연◆ (Absent)</a></td>
    `;
    const students = tms.parseStudentsFromClassPopup(html);
    assert(students.length === 3, `disambiguator names expected 3, got ${students.length}`);
    assert(students[0].name === '권이안◆', 'kept diamond disambiguator');
    assert(students[0].nameEn === '', 'empty english preserved');
    assert(students[1].name === '김민수A', 'kept latin disambiguator');
    assert(students[2].name === '이서연◆', 'attendance stripped, diamond kept');
}

{
    const numbered = `
Navy M
1. 촬영실
김민수
(Minsu)
2. 본관
이서연
(Seoyeon)
[숙제확인]
매우만족
학부모확인
`;
    const students = tms.parseStudentsFromNumberedBlocks(numbered);
    assert(students.length === 2, `numbered expected 2, got ${students.length}`);
    assert(students[0].name === '김민수' && students[0].nameEn === 'Minsu', 'numbered first');
    assert(students[1].name === '이서연', 'numbered second');
    assert(!students.some((s) => s.name === '매우만족'), 'tail trimmed 매우만족');
}

{
    const numbered = `
Garam M
1. 권이안
결석
2. 김민수
(Minsu)
`;
    const students = tms.parseStudentsFromNumberedBlocks(numbered);
    assert(students.length === 2, `numbered korean-only expected 2, got ${students.length}`);
    assert(students[0].name === '권이안', 'numbered first-line korean name');
    assert(students[0].nameEn === '', 'numbered first-line english empty');
    assert(students[1].name === '김민수', 'numbered second student');
}

// Domain still resolves tmsClassId from scrape rows
{
    const D = loadDomain();
    const cohorts = [{ id: 'c1', name: 'Navy Morning', students: [] }];
    const links = {
        'id:30496': {
            action: 'map',
            cohortId: 'c1',
            tmsClassName: 'NavyM_26SP',
            tmsClassId: '30496'
        }
    };
    const resolved = D.resolveTmsRosterLink(links, 'NavyM_26SP', cohorts, {
        tmsClassId: '30496'
    });
    assert(resolved.userAction === 'map', 'remembered map by id');
    assert(resolved.userTargetId === 'c1', 'target c1');
}

console.log('tms-roster-class-select.test.mjs: ok');
