/**
 * Shared student row UI helpers for attendance & homework panels.
 */
(function (global) {
    function escapeHtml(s) {
        if (typeof CCPUtils !== 'undefined' && CCPUtils.escapeHtml) {
            return CCPUtils.escapeHtml(s);
        }
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function tagLabel(tag, t) {
        const map = {
            interested: t('classroomTagInterested'),
            new: t('classroomTagNew'),
            ending_soon: t('classroomTagEndingSoon'),
            starting_soon: t('classroomTagStartingSoon')
        };
        return map[tag] || tag;
    }

    function buildTagBadges(student, t) {
        const tags = student && Array.isArray(student.tags) ? student.tags : [];
        if (!tags.length) {
            return '';
        }
        return tags
            .map(
                (tag) =>
                    `<span class="classroom-student-tag classroom-student-tag--${escapeHtml(tag)}">${escapeHtml(tagLabel(tag, t))}</span>`
            )
            .join('');
    }

    function buildPlaceholderActions(t) {
        const items = [
            { key: 'test', label: t('classroomActionTest') },
            { key: 'point', label: t('classroomActionPoint') },
            { key: 'recording', label: t('classroomActionRecording') },
            { key: 'sms', label: t('classroomActionSms') }
        ];
        return items
            .map(
                (item) =>
                    `<span class="classroom-action-placeholder" aria-disabled="true" title="${escapeHtml(t('classroomComingSoon'))}">${escapeHtml(item.label)}</span>`
            )
            .join('<span class="classroom-action-sep" aria-hidden="true">·</span>');
    }

    function formatStudentLabel(entry, t) {
        const student = entry.student;
        const name = escapeHtml(student.name || student.id);
        const en = student.nameEn ? ` <span class="classroom-student-en">(${escapeHtml(student.nameEn)})</span>` : '';
        const loc = student.locationTag
            ? `<span class="classroom-student-location">${escapeHtml(student.locationTag)}</span> `
            : '';
        const tags = buildTagBadges(student, t);
        return `${loc}<span class="classroom-student-name">${name}</span>${en}${tags ? ` ${tags}` : ''}`;
    }

    global.CCPClassroomStudentRow = {
        escapeHtml,
        buildTagBadges,
        buildPlaceholderActions,
        formatStudentLabel
    };
})(typeof window !== 'undefined' ? window : globalThis);
