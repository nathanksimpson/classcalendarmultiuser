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
    assert(list[0].eventTarget === 'repe1$ctl00$LinkButton1', 'first postback target');
    assert(list[0].selected === true, 'first class selected in fixture');
    assert(list[1].cohortName === 'OrangeM^2606', 'second name OrangeM^2606');
    assert(list[1].tmsClassId === '30964', 'second id 30964');
    assert(list[1].eventTarget === 'repe1$ctl01$LinkButton1', 'second postback target');
    assert(list[1].selected === false, 'second not selected');
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
    assert(tms.isLikelyStudentName('권이안♦'), 'card-suit diamond allowed');
    assert(tms.isLikelyStudentName('김민수A'), 'disambiguator latin allowed');
    assert(tms.isLikelyStudentName('권이안 ◆'), 'space before mark normalized');
    assert(!tms.isLikelyStudentName('◆'), 'symbol alone rejected');
    assert(tms.stripTmsAttendanceNoise('권이안 (Absent)') === '권이안', 'strip english attendance');
    assert(tms.stripTmsAttendanceNoise('권이안 결석') === '권이안', 'strip korean attendance');
    assert(tms.normalizeTmsStudentName('권이안◆ 결석').name === '권이안◆', 'keep diamond after attendance strip');
    assert(tms.normalizeTmsStudentName('권이안 ◆').name === '권이안◆', 'collapse space before mark');
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
      <td><a href="javascript:studentinf(10104)">박지훈</a>◆<br>(Alice)</td>
      <td><a href="javascript:studentinf(10105)">최유나</a> ♦ </td>
    `;
    const students = tms.parseStudentsFromClassPopup(html);
    assert(students.length === 5, `disambiguator names expected 5, got ${students.length}`);
    assert(students[0].name === '권이안◆', 'kept diamond disambiguator');
    assert(students[0].nameEn === '', 'empty english preserved');
    assert(students[1].name === '김민수A', 'kept latin disambiguator');
    assert(students[2].name === '이서연◆', 'attendance stripped, diamond kept');
    assert(students[3].name === '박지훈◆', 'mark after </a> captured');
    assert(students[3].nameEn === 'Alice', 'english after trailing mark');
    assert(students[4].name === '최유나♦', 'card-suit diamond after </a>');
}

{
    // Trailing ◆ after </a> must apply before name dedupe so twins are not collapsed.
    const twinHtml = `
      <td><a href="javascript:studentinf(90001)">유마</a></td>
      <td><a href="javascript:studentinf(90002)">유마</a>◆</td>
    `;
    const twins = tms.parseStudentsFromClassPopup(twinHtml);
    assert(twins.length === 2, `trailing ◆ must keep both twins, got ${twins.length}`);
    assert(twins[0].name === '유마', 'first twin plain');
    assert(twins[1].name === '유마◆', 'second twin with trailing mark');
    assert(twins[0].mpidx === '90001', 'first mpidx');
    assert(twins[1].mpidx === '90002', 'second mpidx');
}

{
    const byId = tms.findClassSelectById(FIXTURE_CLASS_SELECT, '30964');
    assert(byId && byId.cohortName === 'OrangeM^2606', 'findClassSelectById OrangeM');
    assert(byId.eventTarget === 'repe1$ctl01$LinkButton1', 'live postback target');
    assert(byId.selected === false, 'OrangeM not selected');
    assert(!tms.findClassSelectById(FIXTURE_CLASS_SELECT, '99999'), 'missing id returns null');
    assert(tms.classIsSelectedOnPage(FIXTURE_CLASS_SELECT, '30496'), 'NavyM selected on page');
    assert(!tms.classIsSelectedOnPage(FIXTURE_CLASS_SELECT, '30964'), 'OrangeM not selected on page');
}

{
    // Inner HTML containing the word "selected" must NOT mark the <li> selected —
    // that bug assigned one roster to every class and removed reverse Map options.
    const poison = `
<div class="class_select">
  <ul>
    <li class="selected">
      <a href="javascript:__doPostBack('repe1$ctl00$LinkButton1','')">NavyM_26SP</a>
      <input type="hidden" name="repe1$ctl00$Hsubclass" value="30496">
    </li>
    <li>
      <a href="javascript:__doPostBack('repe1$ctl01$LinkButton1','')">OrangeM^2606</a>
      <span>previously selected note</span>
      <input type="hidden" name="repe1$ctl01$Hsubclass" value="30964">
    </li>
  </ul>
</div>`;
    const list = tms.parseClassSelectList(poison);
    assert(list[0].selected === true, 'li class=selected still true');
    assert(list[1].selected === false, 'inner text "selected" must not mark li selected');
}

{
    const html = `
<form>
  <input type="hidden" name="__VIEWSTATE" value="vs1" />
  <input type="hidden" name="__EVENTVALIDATION" value="ev1" />
  <input type="hidden" name="repe1$ctl00$Hsubclass" id="repe1_Hsubclass_0" value="30496" />
  <input type="text" name="q" value="nope" />
</form>`;
    const fields = tms.extractHiddenInputs(html);
    assert(fields.__VIEWSTATE === 'vs1', 'viewstate extracted');
    assert(fields.__EVENTVALIDATION === 'ev1', 'eventvalidation extracted');
    assert(fields['repe1$ctl00$Hsubclass'] === '30496', 'Hsubclass hidden included');
    assert(fields.q == null, 'non-hidden inputs excluded');
}

{
    // Real TMS often wraps Hangul / mark in nested tags — old [^<]+ regex dropped these.
    const html = `
      <td><span><a href="javascript:studentinf(20101)">권이안<span style="color:red">◆</span></a><br></span></td>
      <td><a href="javascript:studentinf(20102)"><font color="#c00">서하린</font></a>◆</td>
      <td><a href="javascript:studentinf(20103)">민서아</a><br>(Mina)◆</td>
      <td><a href="javascript:studentinf(20104)">윤도현&#9670;</a></td>
      <td><a href="javascript:studentinf(20105)">하은별&#x25C6;</a></td>
      <td><a href="javascript:studentinf(20106)">채원◆&#xfe0f;</a></td>
    `;
    const students = tms.parseStudentsFromClassPopup(html);
    assert(students.length === 6, `nested/entity names expected 6, got ${students.length}`);
    assert(students[0].name === '권이안◆', 'mark inside nested span kept');
    assert(students[1].name === '서하린◆', 'font wrap + mark after </a>');
    assert(students[2].name === '민서아◆', 'mark after English paren kept');
    assert(students[2].nameEn === 'Mina', 'english before trailing mark');
    assert(students[3].name === '윤도현◆', 'decimal &#9670; decoded');
    assert(students[4].name === '하은별◆', 'hex &#x25C6; decoded');
    assert(students[5].name === '채원◆', 'emoji variation selector stripped');
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
