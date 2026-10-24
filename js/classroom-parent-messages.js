/**
 * Polite parent text messages in English or Korean (copy & paste into KakaoTalk / SMS).
 * Shared by Tools → Debate Rec and Tools → Essays.
 *
 * Every message starts with "[Simson Academy] …" so parents see right away
 * what was missed, and points them to their child's homeroom teacher
 * (by role only, never by name).
 */
(function (global) {
    'use strict';

    const ACADEMY_NAME = 'Simson Academy';
    /** Academy name used in the Korean messages. */
    const ACADEMY_NAME_KO = '심슨어학원';
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
        'September', 'October', 'November', 'December'];

    function str(v) {
        return String(v == null ? '' : v).trim();
    }

    /** "2026-10-21" → "Wednesday, October 21". */
    function longDate(iso) {
        const m = str(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) {
            return str(iso);
        }
        const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
        return `${DAYS[dt.getUTCDay()]}, ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
    }

    /** Names used in the message: English name first, Korean in brackets once. */
    function names(info) {
        const i = info || {};
        const en = str(i.nameEn);
        const ko = str(i.studentName);
        const child = en || ko || 'your child';
        const full = en && ko && ko !== en ? `${en} (${ko})` : child;
        return { child, full };
    }

    /**
     * Teacher name as parents should see it: drop account labels such as
     * "(Admin)", "[관리자]", "(Test)" that are only there to tell accounts apart.
     * "Nathan Simpson (Admin)" → "Nathan Simpson".
     */
    function cleanTeacherName(name) {
        const ROLE = '(?:admin(?:istrator)?|super\\s*admin|test(?:er)?|user|staff|manager|teacher|관리자|운영자|원장|테스트|선생님)';
        return str(name)
            .replace(new RegExp(`\\s*[\\(\\[\\{（［]\\s*${ROLE}\\s*[\\)\\]\\}）］]`, 'gi'), '')
            .replace(new RegExp(`\\s*[-–—:·|/]\\s*${ROLE}\\s*$`, 'i'), '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    function intro(info, role, full) {
        const teacher = cleanTeacherName(info && info.teacherName);
        if (role) {
            return teacher
                ? `This is ${teacher}, the ${role} for ${full} at ${ACADEMY_NAME}.`
                : `This is the ${role} for ${full} at ${ACADEMY_NAME}.`;
        }
        return teacher
            ? `This is ${teacher} from ${ACADEMY_NAME}, writing about ${full}.`
            : `This is ${ACADEMY_NAME}, writing about ${full}.`;
    }

    function classPhrase(className) {
        const cls = str(className);
        return cls ? `the ${cls} class` : 'the class';
    }

    /**
     * Debate Day 4 recording was missed. Make-ups are recorded at the academy.
     * @param {{ studentName: string, nameEn?: string, className?: string, date: string, teacherName?: string }} info
     */
    function debateRecordingEn(info) {
        const i = info || {};
        const { child, full } = names(i);
        return [
            `[${ACADEMY_NAME}] Debate recording not finished`,
            '',
            'Hello,',
            intro(i, 'debate teacher', full),
            '',
            `On ${longDate(i.date)}, ${classPhrase(i.className)} recorded their debate speeches (Debate Day 4). ${child} was not able to record that day, so the debate recording is not finished yet.`,
            '',
            `${child} will need to make up the recording here at ${ACADEMY_NAME}. Please contact ${child}'s homeroom teacher to arrange a time when ${child} can come in a little early before class or stay a little after class to record it.`,
            '',
            'Thank you very much for your help.',
            '',
            ACADEMY_NAME
        ].join('\n');
    }

    /**
     * Essay not handed in (overdue) or needing to be resubmitted.
     * @param {{ kind: 'overdue'|'resubmit', studentName: string, nameEn?: string, className?: string,
     *           assignedDate?: string, teacherName?: string }} info
     */
    function essayEn(info) {
        const i = info || {};
        const { child, full } = names(i);
        const assigned = str(i.assignedDate) ? ` assigned on ${longDate(i.assignedDate)}` : '';
        const where = str(i.className) ? ` in ${classPhrase(i.className)}` : '';
        if (i.kind === 'resubmit') {
            return [
                `[${ACADEMY_NAME}] Essay needs to be resubmitted`,
                '',
                'Hello,',
                intro(i, '', full),
                '',
                `${child}'s essay${assigned}${where} needs some corrections, so it has to be revised and handed in again. The essay is not finished until the corrected version is submitted.`,
                '',
                `Could you please remind ${child} to make the corrections and resubmit the essay as soon as possible? If ${child} needs help or more time, please contact ${child}'s homeroom teacher.`,
                '',
                'Thank you very much for your help.',
                '',
                ACADEMY_NAME
            ].join('\n');
        }
        return [
            `[${ACADEMY_NAME}] Essay not submitted`,
            '',
            'Hello,',
            intro(i, '', full),
            '',
            `${child} has not yet submitted the essay${assigned}${where}.`,
            '',
            `Could you please remind ${child} to finish the essay and submit it as soon as possible? If ${child} needs help or more time, please contact ${child}'s homeroom teacher.`,
            '',
            'Thank you very much for your help.',
            '',
            ACADEMY_NAME
        ].join('\n');
    }

    // ── Korean ──────────────────────────────────────────────────────────

    const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

    /** "2026-10-21" → "10월 21일(수)". */
    function koDate(iso) {
        const m = str(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) {
            return str(iso);
        }
        const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
        return `${Number(m[2])}월 ${Number(m[3])}일(${KO_DAYS[dt.getUTCDay()]})`;
    }

    /** "김민준 학생" (Korean name preferred, English name as fallback). */
    function koStudent(info) {
        const i = info || {};
        const name = str(i.studentName) || str(i.nameEn);
        return name ? `${name} 학생` : '학생';
    }

    /** "Purple M반" (no double 반). */
    function koClass(className) {
        const cls = str(className);
        if (!cls) {
            return '';
        }
        return /반$/.test(cls) ? cls : `${cls}반`;
    }

    /** "심슨어학원 Purple M반 토론 수업을 담당하고 있는 Nathan Simpson 선생님입니다." */
    function koIntro(teacher, cls, subject) {
        if (!teacher) {
            return `${ACADEMY_NAME_KO}입니다.`;
        }
        const what = [cls, subject].filter(Boolean).join(' ');
        return what
            ? `${ACADEMY_NAME_KO} ${what} 수업을 담당하고 있는 ${teacher} 선생님입니다.`
            : `${ACADEMY_NAME_KO} ${teacher} 선생님입니다.`;
    }

    /** Sign-off: academy name, then "Nathan Simpson 드림" when a teacher is known. */
    function koSignOff(teacher) {
        return teacher ? [ACADEMY_NAME_KO, `${teacher} 드림`] : [ACADEMY_NAME_KO];
    }

    function debateRecordingKo(info) {
        const i = info || {};
        const student = koStudent(i);
        const teacher = cleanTeacherName(i.teacherName);
        const cls = koClass(i.className);
        const when = str(i.date) ? `${koDate(i.date)} 수업에서` : '토론 수업에서';
        return [
            `[${ACADEMY_NAME_KO}] 토론 영상 촬영 미완료 안내`,
            '',
            '안녕하세요, 학부모님.',
            '',
            koIntro(teacher, cls, '토론'),
            '',
            `${when} 토론 스피치 영상 촬영(Debate Day 4)이 진행되었으나, ${student}은 당일 촬영에 참여하지 못하여 아직 영상 촬영이 완료되지 않은 상태입니다.`,
            '',
            '이에 학원에서 별도로 보충 촬영을 진행하고자 합니다.',
            '',
            `번거로우시겠지만 반담임 선생님과 상의하시어, ${student}이 수업 시작 전 조금 일찍 등원하거나 수업 종료 후 잠시 남아 촬영할 수 있도록 일정을 조율해 주시면 감사하겠습니다.`,
            '',
            '협조해 주셔서 감사합니다.',
            '',
            ...koSignOff(teacher)
        ].join('\n');
    }

    function essayKo(info) {
        const i = info || {};
        const student = koStudent(i);
        const teacher = cleanTeacherName(i.teacherName);
        const cls = koClass(i.className);
        const when = str(i.assignedDate) ? `${koDate(i.assignedDate)} 수업에서 안내된 에세이를` : '';
        const help = '도움이나 시간이 더 필요하시면 반담임 선생님과 상의해 주시기 바랍니다.';
        const resubmit = i.kind === 'resubmit';
        const body = resubmit
            ? (when
                ? `${when} ${student}이 제출하였으나, 수정이 필요하여 다시 제출해야 합니다. 수정본이 제출되어야 에세이가 완료됩니다.`
                : `${student}이 제출한 에세이에 수정이 필요하여 다시 제출해야 합니다. 수정본이 제출되어야 에세이가 완료됩니다.`)
            : (when
                ? `${when} ${student}이 아직 제출하지 않은 상태입니다.`
                : `${student}이 아직 에세이를 제출하지 않은 상태입니다.`);
        const ask = resubmit
            ? `번거로우시겠지만 ${student}이 에세이를 수정하여 가능한 한 빨리 다시 제출할 수 있도록 지도 부탁드립니다. ${help}`
            : `번거로우시겠지만 ${student}이 에세이를 마무리하여 가능한 한 빨리 제출할 수 있도록 지도 부탁드립니다. ${help}`;
        return [
            `[${ACADEMY_NAME_KO}] ${resubmit ? '에세이 재제출 안내' : '에세이 미제출 안내'}`,
            '',
            '안녕하세요, 학부모님.',
            '',
            koIntro(teacher, cls, ''),
            '',
            body,
            '',
            ask,
            '',
            '협조해 주셔서 감사합니다.',
            '',
            ...koSignOff(teacher)
        ].join('\n');
    }

    /** lang: 'en' (default) or 'ko'. */
    function debateRecording(info, lang) {
        return lang === 'ko' ? debateRecordingKo(info) : debateRecordingEn(info);
    }

    function essay(info, lang) {
        return lang === 'ko' ? essayKo(info) : essayEn(info);
    }

    global.CCPParentMessages = {
        ACADEMY_NAME,
        ACADEMY_NAME_KO,
        longDate,
        koDate,
        cleanTeacherName,
        debateRecording,
        essay
    };
})(typeof window !== 'undefined' ? window : globalThis);
