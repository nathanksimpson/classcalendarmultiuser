/**
 * Books class summary — roster rows grouped by HR teacher for preview/copy/print.
 */
(function (global) {
    const NO_HOMEROOM_KEY = '__no_homeroom__';
    const WARN_MODES = ['all', 'attention', 'not_issued', 'missing'];

    const STATUS_CSS = {
        not_issued: 'debate-book-summary-status--not-issued',
        issued: 'debate-book-summary-status--issued',
        missing: 'debate-book-summary-status--missing'
    };

    function domain() {
        return global.CCPClassroomDomain;
    }

    function essaySummaryApi() {
        return global.CCPClassroomEssayClassSummary;
    }

    function resolveHomeroomMeta(classData, appData) {
        const api = essaySummaryApi();
        if (api && typeof api.resolveHomeroomMeta === 'function') {
            return api.resolveHomeroomMeta(classData, appData);
        }
        return { key: NO_HOMEROOM_KEY, label: '' };
    }

    function compareHomeroomKeys(a, b, labelForKey) {
        const api = essaySummaryApi();
        if (api && typeof api.compareHomeroomKeys === 'function') {
            return api.compareHomeroomKeys(a, b, labelForKey);
        }
        if (a === b) {
            return 0;
        }
        if (a === NO_HOMEROOM_KEY) {
            return 1;
        }
        if (b === NO_HOMEROOM_KEY) {
            return -1;
        }
        return String(labelForKey(a)).localeCompare(String(labelForKey(b)), undefined, {
            sensitivity: 'base'
        });
    }

    function statusCssClass(status) {
        return STATUS_CSS[status] || STATUS_CSS.not_issued;
    }

    function normalizeWarnMode(mode) {
        const m = String(mode || '').trim();
        return WARN_MODES.includes(m) ? m : 'all';
    }

    function rowMatchesWarnMode(row, mode) {
        const m = normalizeWarnMode(mode);
        if (m === 'all') {
            return true;
        }
        if (!row) {
            return false;
        }
        if (m === 'not_issued') {
            return row.status === 'not_issued';
        }
        if (m === 'missing') {
            return row.status === 'missing';
        }
        if (m === 'attention') {
            return row.status === 'not_issued' || row.status === 'missing';
        }
        return true;
    }

    function filterRowsByWarnMode(rows, mode) {
        const m = normalizeWarnMode(mode);
        if (m === 'all') {
            return Array.isArray(rows) ? rows.slice() : [];
        }
        return (Array.isArray(rows) ? rows : []).filter((row) => rowMatchesWarnMode(row, m));
    }

    function listHomeroomFilterOptions(entries, appData) {
        const byKey = new Map();
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
            if (!entry || !entry.classId) {
                return;
            }
            const classData = (appData.classes || []).find((c) => c && c.id === entry.classId);
            const hr = resolveHomeroomMeta(classData, appData);
            if (!byKey.has(hr.key)) {
                byKey.set(hr.key, { key: hr.key, label: hr.label || hr.key });
            }
        });
        const labelForKey = (key) => {
            const g = byKey.get(key);
            return g ? g.label || key : key;
        };
        return Array.from(byKey.keys())
            .sort((a, b) => compareHomeroomKeys(a, b, labelForKey))
            .map((key) => byKey.get(key));
    }

    function listMonthFilterOptions(entries) {
        const months = new Set();
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
            const month = String(entry && entry.monthKey ? entry.monthKey : '').trim();
            if (month) {
                months.add(month);
            }
        });
        return Array.from(months).sort((a, b) => String(b).localeCompare(String(a)));
    }

    function entryClassIsMine(classData, userId, deps) {
        if (!classData || !userId) {
            return false;
        }
        const filterApi = global.CCPEssayClassFilter;
        if (filterApi && typeof filterApi.classIsMine === 'function') {
            return filterApi.classIsMine(classData, userId, deps);
        }
        if (deps && typeof deps.classIsMine === 'function') {
            return deps.classIsMine(classData, userId);
        }
        return (classData.classTeachers || []).some((row) => row && row.userId === userId);
    }

    function filterEntriesByHrAndMonth(entries, appData, filters, ctx) {
        const f = filters || {};
        const homeroomKey = String(f.homeroomKey || '').trim();
        const month = String(f.month || '').trim();
        const debateOnly = f.debateOnly === true;
        const myClassesOnly = f.myClassesOnly === true;
        const d = domain();
        return (Array.isArray(entries) ? entries : []).filter((entry) => {
            if (!entry) {
                return false;
            }
            if (month && String(entry.monthKey || '') !== month) {
                return false;
            }
            const classData = (appData.classes || []).find((c) => c && c.id === entry.classId);
            if (homeroomKey) {
                const hr = resolveHomeroomMeta(classData, appData);
                if (hr.key !== homeroomKey) {
                    return false;
                }
            }
            if (debateOnly) {
                if (!classData || !d || !d.classUsesMonthlyDebateBooks(classData)) {
                    return false;
                }
            }
            if (myClassesOnly) {
                const userId = (ctx && ctx.currentUserId) || '';
                if (!entryClassIsMine(classData, userId, ctx && ctx.deps)) {
                    return false;
                }
            }
            return true;
        });
    }

    function listRowsForEntries(appData, entries, options) {
        const d = domain();
        if (!d || !d.listDebateBookSummaryRows) {
            return [];
        }
        const entryList = Array.isArray(entries) ? entries : [];
        const keys = entryList.map((entry) => entry && entry.key).filter(Boolean);
        if (!keys.length) {
            return [];
        }
        return d.listDebateBookSummaryRows(appData, Object.assign({}, options || {}, { selectedKeys: keys }));
    }

    function groupRowsByHomeroom(rows, appData, options) {
        const opts = options || {};
        const warnMode = normalizeWarnMode(opts.warnMode);
        const classesById = new Map();
        (Array.isArray(appData && appData.classes) ? appData.classes : []).forEach((c) => {
            if (c && c.id) {
                classesById.set(c.id, c);
            }
        });
        const hrMap = new Map();
        (rows || []).forEach((row) => {
            if (!row || !row.classId) {
                return;
            }
            if (!rowMatchesWarnMode(row, warnMode)) {
                return;
            }
            const classData = classesById.get(row.classId) || {
                id: row.classId,
                name: row.className
            };
            const hr = resolveHomeroomMeta(classData, appData);
            if (!hrMap.has(hr.key)) {
                hrMap.set(hr.key, {
                    homeroomKey: hr.key,
                    homeroomLabel: hr.label,
                    classMap: new Map()
                });
            }
            const hrGroup = hrMap.get(hr.key);
            if (!hrGroup.classMap.has(row.classId)) {
                hrGroup.classMap.set(row.classId, {
                    classId: row.classId,
                    className: row.className || row.classId,
                    classTypeLabel: row.classTypeLabel || '',
                    levelLabel: row.levelLabel || '',
                    periodMap: new Map()
                });
            }
            const classGroup = hrGroup.classMap.get(row.classId);
            const periodKey = row.periodKey || row.key || '';
            if (!classGroup.periodMap.has(periodKey)) {
                classGroup.periodMap.set(periodKey, {
                    key: row.key,
                    periodKey,
                    periodLabel: row.periodLabel || periodKey,
                    bookTitle: row.bookTitle || '',
                    bookLevel: row.bookLevel || '',
                    students: []
                });
            }
            classGroup.periodMap.get(periodKey).students.push(row);
        });

        const labelForKey = (key) => {
            const g = hrMap.get(key);
            return g ? g.homeroomLabel || key : key;
        };

        return Array.from(hrMap.keys())
            .sort((a, b) => compareHomeroomKeys(a, b, labelForKey))
            .map((hrKey) => {
                const hrGroup = hrMap.get(hrKey);
                const classes = Array.from(hrGroup.classMap.values())
                    .map((classGroup) => {
                        const periods = Array.from(classGroup.periodMap.values())
                            .map((period) => {
                                const students = (period.students || [])
                                    .slice()
                                    .sort((a, b) =>
                                        String(a.studentName || '').localeCompare(
                                            String(b.studentName || ''),
                                            undefined,
                                            { sensitivity: 'base' }
                                        )
                                    )
                                    .map((student, index) =>
                                        Object.assign({}, student, {
                                            rosterIndex: index + 1,
                                            statusCss: statusCssClass(student.status)
                                        })
                                    );
                                return Object.assign({}, period, { students });
                            })
                            .filter((period) => period.students.length)
                            .sort((a, b) =>
                                String(a.periodKey || '').localeCompare(String(b.periodKey || ''))
                            );
                        return {
                            classId: classGroup.classId,
                            className: classGroup.className,
                            classTypeLabel: classGroup.classTypeLabel,
                            levelLabel: classGroup.levelLabel,
                            periods
                        };
                    })
                    .filter((classGroup) => classGroup.periods.length)
                    .sort((a, b) =>
                        String(a.className || '').localeCompare(String(b.className || ''), undefined, {
                            sensitivity: 'base'
                        })
                    );
                return {
                    homeroomKey: hrGroup.homeroomKey,
                    homeroomLabel: hrGroup.homeroomLabel,
                    classes
                };
            })
            .filter((hrGroup) => hrGroup.classes.length);
    }

    function formatStudentDisplayName(row) {
        const api = essaySummaryApi();
        if (api && typeof api.formatStudentDisplayName === 'function') {
            return api.formatStudentDisplayName(row);
        }
        const ko = String(row.studentName || '').trim();
        const en = String(row.studentNameEn || '').trim();
        return ko && en ? `${ko} (${en})` : ko || en || '';
    }

    function statusLabel(status, labels) {
        const map = (labels && labels.statusLabels) || {};
        return map[status] || status || '';
    }

    function sanitizeCopyText(text) {
        const api = essaySummaryApi();
        if (api && typeof api.sanitizeCopyText === 'function') {
            return api.sanitizeCopyText(text);
        }
        return String(text ?? '');
    }

    function formatStudentCopyLine(row, labels) {
        const idx = row.rosterIndex || '';
        const name = formatStudentDisplayName(row);
        const status = statusLabel(row.status, labels);
        let line = `${idx}. ${name}\t${status}`;
        if (row.status === 'issued' && row.issuedAt) {
            line += `\t${row.issuedAt}`;
        }
        const note = String(row.note || '').trim();
        if (note) {
            line += ` - ${note}`;
        }
        return sanitizeCopyText(line);
    }

    function formatCopyText(hrGroups, labels) {
        const L = labels || {};
        const lines = [];
        const groups = Array.isArray(hrGroups) ? hrGroups : [];
        if (!groups.length) {
            return sanitizeCopyText(String(L.noStudents || '').trim());
        }
        groups.forEach((hrGroup, hi) => {
            if (hi > 0) {
                lines.push('');
            }
            const hrLabel =
                hrGroup.homeroomKey === NO_HOMEROOM_KEY
                    ? L.noHomeroom || 'No homeroom'
                    : hrGroup.homeroomLabel || hrGroup.homeroomKey || L.noHomeroom || 'No homeroom';
            const hrHeading = L.hrHeading
                ? String(L.hrHeading).replace('{name}', hrLabel)
                : `== HR Teacher: ${hrLabel} ==`;
            lines.push(hrHeading);
            (hrGroup.classes || []).forEach((classGroup, ci) => {
                (classGroup.periods || []).forEach((period, pi) => {
                    if (ci > 0 || pi > 0) {
                        lines.push('');
                    }
                    const meta = [classGroup.classTypeLabel, classGroup.levelLabel]
                        .filter(Boolean)
                        .join(' · ');
                    const classTitle = meta
                        ? `${classGroup.className || ''} (${meta})`
                        : classGroup.className || '';
                    const periodTitle = period.periodLabel || period.periodKey || '';
                    lines.push(`-- ${classTitle} - ${periodTitle} --`);
                    (period.students || []).forEach((student) => {
                        lines.push(formatStudentCopyLine(student, L));
                    });
                });
            });
        });
        return sanitizeCopyText(lines.join('\n').trimEnd());
    }

    function formatEntryHint(entry) {
        const counts = (entry && entry.counts) || {};
        const issued = counts.issued || 0;
        const total = entry && entry.totalStudents ? entry.totalStudents : 0;
        return { issued, total };
    }

    global.CCPClassroomDebateBooksSummary = {
        NO_HOMEROOM_KEY,
        WARN_MODES,
        STATUS_CSS,
        statusCssClass,
        normalizeWarnMode,
        rowMatchesWarnMode,
        filterRowsByWarnMode,
        listHomeroomFilterOptions,
        listMonthFilterOptions,
        filterEntriesByHrAndMonth,
        listRowsForEntries,
        groupRowsByHomeroom,
        formatCopyText,
        formatStudentCopyLine,
        formatStudentDisplayName,
        formatEntryHint,
        sanitizeCopyText
    };
})(typeof window !== 'undefined' ? window : globalThis);
