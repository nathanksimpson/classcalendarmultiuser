/**
 * Polite English text messages for parents (copy & paste into KakaoTalk / SMS).
 * Shared by Tools → Debate Rec and Tools → Essays.
 *
 * Every message starts with "[Simson Academy] …" so parents see right away
 * what was missed, and points them to their child's homeroom teacher
 * (by role only, never by name).
 */
(function (global) {
    'use strict';

    const ACADEMY_NAME = 'Simson Academy';
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

    function intro(info, role, full) {
        const teacher = str(info && info.teacherName);
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
    function debateRecording(info) {
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
    function essay(info) {
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

    global.CCPParentMessages = {
        ACADEMY_NAME,
        longDate,
        debateRecording,
        essay
    };
})(typeof window !== 'undefined' ? window : globalThis);
