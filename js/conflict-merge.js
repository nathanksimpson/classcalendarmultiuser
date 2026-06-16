/**
 * Conflict merge assistant — summarize differences between local and server calendar JSON.
 */
(function (global) {
    function countById(arr) {
        const set = new Set();
        (arr || []).forEach((item) => {
            if (item && item.id != null) {
                set.add(String(item.id));
            }
        });
        return set;
    }

    function diffIdSets(localArr, serverArr) {
        const localIds = countById(localArr);
        const serverIds = countById(serverArr);
        let addedLocal = 0;
        let addedServer = 0;
        localIds.forEach((id) => {
            if (!serverIds.has(id)) {
                addedLocal += 1;
            }
        });
        serverIds.forEach((id) => {
            if (!localIds.has(id)) {
                addedServer += 1;
            }
        });
        let changed = 0;
        localIds.forEach((id) => {
            if (!serverIds.has(id)) {
                return;
            }
            const localItem = (localArr || []).find((x) => x && String(x.id) === id);
            const serverItem = (serverArr || []).find((x) => x && String(x.id) === id);
            if (JSON.stringify(localItem) !== JSON.stringify(serverItem)) {
                changed += 1;
            }
        });
        return { addedLocal, addedServer, changed };
    }

    function summarizeConflict(localData, serverData) {
        const local = localData || {};
        const server = serverData || {};
        const sections = [
            { key: 'classes', labelKey: 'syncConflictClasses' },
            { key: 'events', labelKey: 'syncConflictEvents' },
            { key: 'dayNotes', labelKey: 'syncConflictDayNotes' },
            { key: 'cohorts', labelKey: 'syncConflictCohorts' }
        ];
        const lines = [];
        sections.forEach((section) => {
            const diff = diffIdSets(local[section.key], server[section.key]);
            if (diff.addedLocal || diff.addedServer || diff.changed) {
                lines.push({
                    labelKey: section.labelKey,
                    addedLocal: diff.addedLocal,
                    addedServer: diff.addedServer,
                    changed: diff.changed
                });
            }
        });
        if (local.calendarName !== server.calendarName) {
            lines.push({ labelKey: 'syncConflictCalendarName', calendarName: true });
        }
        return lines;
    }

    function renderSummaryHtml(lines, t, escapeHtml) {
        const esc = escapeHtml || ((s) => String(s || ''));
        const translate = t || ((k) => k);
        if (!lines.length) {
            return `<p class="section-hint">${esc(translate('syncConflictNoDiff'))}</p>`;
        }
        return `<ul class="conflict-merge-summary">${lines
            .map((line) => {
                if (line.calendarName) {
                    return `<li>${esc(translate('syncConflictCalendarName'))}</li>`;
                }
                const parts = [];
                if (line.addedLocal) {
                    parts.push(
                        translate('syncConflictYoursOnly').replace('{n}', String(line.addedLocal))
                    );
                }
                if (line.addedServer) {
                    parts.push(
                        translate('syncConflictTheirsOnly').replace('{n}', String(line.addedServer))
                    );
                }
                if (line.changed) {
                    parts.push(translate('syncConflictChanged').replace('{n}', String(line.changed)));
                }
                return `<li><strong>${esc(translate(line.labelKey))}</strong>: ${esc(parts.join('; '))}</li>`;
            })
            .join('')}</ul>`;
    }

    global.CCPConflictMerge = {
        summarizeConflict,
        renderSummaryHtml,
        diffIdSets
    };
})(typeof window !== 'undefined' ? window : globalThis);
