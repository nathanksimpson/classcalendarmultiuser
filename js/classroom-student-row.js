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
            starting_soon: t('classroomTagStartingSoon'),
            off_roster: t('classroomTagOffRoster')
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

    function formatStudentIdentityColumn(entry, t, options) {
        const opts = options || {};
        const student = entry.student;
        const name = escapeHtml(student.name || student.id);
        const en = student.nameEn ? ` <span class="classroom-student-en">(${escapeHtml(student.nameEn)})</span>` : '';
        const tags = buildTagBadges(student, t);
        const extra = opts.extraHtml || '';
        const schoolPart = student.locationTag
            ? `<span class="classroom-sheet-school-inline">${escapeHtml(student.locationTag)}</span>`
            : '';
        const schoolSep = schoolPart ? '<span class="classroom-sheet-school-sep" aria-hidden="true"> · </span>' : '';
        const nameLine = `<div class="classroom-sheet-name-line"><span class="classroom-student-name">${name}</span>${en}${schoolSep}${schoolPart}</div>`;
        const metaLine =
            tags || extra
                ? `<div class="classroom-sheet-meta-line">${tags ? `${tags} ` : ''}${extra}</div>`
                : '';
        return `${nameLine}${metaLine}`;
    }

    function formatEssayStudentCell(entry, t) {
        const student = entry.student;
        const ko = escapeHtml(student.name || student.id);
        const en = student.nameEn
            ? `<span class="classroom-essay-student-en">${escapeHtml(student.nameEn)}</span>`
            : '';
        const tags = buildTagBadges(student, t);
        const branch = student.locationTag
            ? `<span class="classroom-essay-branch-chip">${escapeHtml(student.locationTag)}</span>`
            : '';
        const metaBits = [branch, tags].filter(Boolean).join(' ');
        const meta = metaBits
            ? `<div class="classroom-essay-student-meta">${metaBits}</div>`
            : '';
        return `<div class="classroom-essay-student-cell">
            <div class="classroom-essay-student-name-line">
                <span class="classroom-essay-student-ko">${ko}</span>${en}
            </div>
            ${meta}
        </div>`;
    }

    global.CCPClassroomStudentRow = {
        escapeHtml,
        buildTagBadges,
        buildPlaceholderActions,
        formatStudentLabel,
        formatStudentIdentityColumn,
        formatEssayStudentCell
    };
})(typeof window !== 'undefined' ? window : globalThis);
