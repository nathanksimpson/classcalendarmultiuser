/**
 * Essay class summary — full roster rows grouped by HR teacher for preview/copy/print.
 */
(function (global) {
    const NO_HOMEROOM_KEY = '__no_homeroom__';

    const STATUS_CSS = {
        not_submitted: 'essay-status--not',
        submitted: 'essay-status--submitted',
        complete: 'essay-status--complete',
        resubmit_required: 'essay-status--resubmit',
        incomplete: 'essay-status--incomplete',
        exempt: 'essay-status--exempt'
    };

    function domain() {
        return global.CCPClassroomDomain;
    }

    function normalizeKey(classId, syllabusRowId) {
        return `${String(classId || '').trim()}|${String(syllabusRowId || '').trim()}`;
    }

    function statusCssClass(status) {
        return STATUS_CSS[status] || STATUS_CSS.not_submitted;
    }

    function resolveHomeroomMeta(classData, appData, resolveFn) {
        if (typeof resolveFn === 'function') {
            const custom = resolveFn(classData, appData) || {};
            const key = String(custom.key || custom.homeroomKey || '').trim();
            const label = String(custom.label || custom.homeroomLabel || '').trim();
            if (key) {
                return { key, label: label || key };
            }
            if (label) {
                return { key: label, label };
            }
            return { key: NO_HOMEROOM_KEY, label: '' };
        }
        const api = global.CCPTeacherTimetable;
        if (api && classData) {
            const cohorts = (appData && appData.cohorts) || [];
            const cohortsById = {};
            cohorts.forEach((c) => {
                if (c && c.id) {
                    cohortsById[c.id] = c;
                }
            });
            const uid =
                typeof api.resolveHomeroomUserIdForClass === 'function'
                    ? api.resolveHomeroomUserIdForClass(classData, appData)
                    : '';
            const label =
                typeof api.resolveHomeroomLabel === 'function'
                    ? api.resolveHomeroomLabel(classData, cohortsById, appData)
                    : '';
            const trimmedUid = String(uid || '').trim();
            const trimmedLabel = String(label || '').trim();
            if (trimmedUid) {
                return { key: trimmedUid, label: trimmedLabel || trimmedUid };
            }
            if (trimmedLabel) {
                return { key: trimmedLabel, label: trimmedLabel };
            }
        }
        // Fallback when timetable helpers are not loaded (e.g. essays-only script set).
        if (classData) {
            const classUid = String(classData.homeroomTeacherUserId || '').trim();
            const className = String(classData.homeroomTeacherName || '').trim();
            if (classUid || className) {
                return {
                    key: classUid || className,
                    label: className || classUid
                };
            }
            const cohorts = (appData && appData.cohorts) || [];
            const cohortIds = Array.isArray(classData.cohortIds)
                ? classData.cohortIds
                : classData.cohortId
                    ? [classData.cohortId]
                    : [];
            for (let i = 0; i < cohortIds.length; i += 1) {
                const cohort = cohorts.find((c) => c && c.id === cohortIds[i]);
                if (!cohort) {
                    continue;
                }
                const uid = String(cohort.homeroomTeacherUserId || '').trim();
                const name = String(cohort.homeroomTeacherName || '').trim();
                if (uid || name) {
                    return { key: uid || name, label: name || uid };
                }
            }
        }
        return { key: NO_HOMEROOM_KEY, label: '' };
    }

    function compareHomeroomKeys(a, b, labelForKey) {
        if (a === b) {
            return 0;
        }
        if (a === NO_HOMEROOM_KEY) {
            return 1;
        }
        if (b === NO_HOMEROOM_KEY) {
            return -1;
        }
        const la = typeof labelForKey === 'function' ? labelForKey(a) : a;
        const lb = typeof labelForKey === 'function' ? labelForKey(b) : b;
        return String(la || '').localeCompare(String(lb || ''), undefined, { sensitivity: 'base' });
    }

    /** YYYY-MM from an ISO due date (ssDueDate), or '' if missing/invalid. */
    function monthKeyFromDueDate(ssDueDate) {
        const raw = String(ssDueDate || '').trim();
        if (/^\d{4}-\d{2}/.test(raw)) {
            return raw.slice(0, 7);
        }
        return '';
    }

    function findClassForAssignment(assignment, appData, options) {
        const opts = options || {};
        const classId = assignment && assignment.classId;
        if (!classId) {
            return null;
        }
        const lists = [];
        if (Array.isArray(opts.classes)) {
            lists.push(opts.classes);
        }
        if (Array.isArray(appData && appData.classes)) {
            lists.push(appData.classes);
        }
        for (let i = 0; i < lists.length; i += 1) {
            const found = lists[i].find((c) => c && c.id === classId);
            if (found) {
                return found;
            }
        }
        return {
            id: classId,
            name: (assignment && assignment.className) || classId
        };
    }

    function listHomeroomFilterOptions(assignments, appData, options) {
        const opts = options || {};
        const byKey = new Map();
        (Array.isArray(assignments) ? assignments : []).forEach((row) => {
            if (!row || !row.classId) {
                return;
            }
            const classData = findClassForAssignment(row, appData, opts);
            const hr = resolveHomeroomMeta(classData, appData, opts.resolveHomeroom);
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

    function listMonthFilterOptions(assignments) {
        const months = new Set();
        (Array.isArray(assignments) ? assignments : []).forEach((row) => {
            const month = monthKeyFromDueDate(row && row.ssDueDate);
            if (month) {
                months.add(month);
            }
        });
        return Array.from(months).sort((a, b) => String(b).localeCompare(String(a)));
    }

    /**
     * Narrow assignment checklist by HR teacher and/or ssDueDate month (YYYY-MM).
     * Empty homeroomKey / month = no filter on that axis.
     */
    function filterAssignmentsByHrAndMonth(assignments, appData, filters, options) {
        const opts = options || {};
        const f = filters || {};
        const homeroomKey = String(f.homeroomKey || '').trim();
        const month = String(f.month || '').trim();
        return (Array.isArray(assignments) ? assignments : []).filter((row) => {
            if (!row) {
                return false;
            }
            if (month) {
                if (monthKeyFromDueDate(row.ssDueDate) !== month) {
                    return false;
                }
            }
            if (homeroomKey) {
                const classData = findClassForAssignment(row, appData, opts);
                const hr = resolveHomeroomMeta(classData, appData, opts.resolveHomeroom);
                if (hr.key !== homeroomKey) {
                    return false;
                }
            }
            return true;
        });
    }

    /**
     * @param {object} appData
     * @param {object[]} assignments — from listEssayAssignments (need classId + syllabusRowId / key)
     * @param {{ classes?: object[], resolveHomeroom?: function }} [options]
     */
    function listRowsForAssignments(appData, assignments, options) {
        const d = domain();
        if (!d || !d.listEssayClassSummaryRows) {
            return [];
        }
        const opts = options || {};
        const assignmentList = Array.isArray(assignments) ? assignments : [];
        const keySet = new Set(
            assignmentList
                .map((row) => (row && row.key) || normalizeKey(row && row.classId, row && row.syllabusRowId))
                .filter(Boolean)
        );
        if (!keySet.size) {
            return [];
        }
        const classIds = new Set();
        assignmentList.forEach((row) => {
            if (row && row.classId) {
                classIds.add(row.classId);
            }
        });
        const allClasses = Array.isArray(opts.classes)
            ? opts.classes
            : Array.isArray(appData && appData.classes)
                ? appData.classes
                : [];
        const classFilter = allClasses.filter((c) => c && classIds.has(c.id));
        const rows = d.listEssayClassSummaryRows(appData, {
            classes: classFilter.length ? classFilter : undefined
        });
        return rows.filter((row) => keySet.has(normalizeKey(row.classId, row.syllabusRowId)));
    }

    /**
     * Group student rows: HR → class → assignment → students (with roster index).
     */
    function groupRowsByHomeroom(rows, appData, options) {
        const opts = options || {};
        const resolveFn = opts.resolveHomeroom;
        const classesById = new Map();
        (Array.isArray(appData && appData.classes) ? appData.classes : []).forEach((c) => {
            if (c && c.id) {
                classesById.set(c.id, c);
            }
        });
        if (Array.isArray(opts.classes)) {
            opts.classes.forEach((c) => {
                if (c && c.id) {
                    classesById.set(c.id, c);
                }
            });
        }

        const hrMap = new Map();
        (rows || []).forEach((row) => {
            if (!row || !row.classId) {
                return;
            }
            const classData = classesById.get(row.classId) || {
                id: row.classId,
                name: row.className,
                classTypeId: row.classTypeId,
                grade: row.grade,
                subject: row.subject,
                levelPreset: row.levelLabel
            };
            const hr = resolveHomeroomMeta(classData, appData, resolveFn);
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
                    assignmentMap: new Map()
                });
            }
            const classGroup = hrGroup.classMap.get(row.classId);
            const assignKey = normalizeKey(row.classId, row.syllabusRowId);
            if (!classGroup.assignmentMap.has(assignKey)) {
                classGroup.assignmentMap.set(assignKey, {
                    key: assignKey,
                    syllabusRowId: row.syllabusRowId,
                    assignmentLabel: row.assignmentLabel || '',
                    lessonDate: row.lessonDate || '',
                    ssDueDate: row.ssDueDate || '',
                    students: []
                });
            }
            classGroup.assignmentMap.get(assignKey).students.push(row);
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
                        const assignments = Array.from(classGroup.assignmentMap.values())
                            .map((assign) => {
                                const students = (assign.students || [])
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
                                return Object.assign({}, assign, { students });
                            })
                            .sort((a, b) =>
                                String(a.lessonDate || '').localeCompare(String(b.lessonDate || ''))
                            );
                        return {
                            classId: classGroup.classId,
                            className: classGroup.className,
                            classTypeLabel: classGroup.classTypeLabel,
                            levelLabel: classGroup.levelLabel,
                            assignments
                        };
                    })
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
            });
    }

    function statusLabel(status, labels) {
        const map = (labels && labels.statusLabels) || {};
        return map[status] || status || '';
    }

    function sanitizeCopyText(text) {
        return String(text ?? '')
            .replace(/\u2014/g, '-') // em dash
            .replace(/\u2013/g, '-') // en dash
            .replace(/\u2212/g, '-'); // minus sign
    }

    function formatStudentDisplayName(row) {
        const r = row || {};
        const ko = String(r.studentName || '').trim();
        const en = String(r.studentNameEn || '').trim();
        let base = ko && en ? `${ko} (${en})` : ko || en || '';
        const tags = Array.isArray(r.studentTags) ? r.studentTags : [];
        if (tags.includes('off_roster')) {
            base = base ? `${base} [Off roster]` : '[Off roster]';
        }
        return base;
    }

    function formatStudentCopyLine(row, labels) {
        const r = row || {};
        const idx = r.rosterIndex || '';
        const name = formatStudentDisplayName(r);
        const status = statusLabel(r.status, labels);
        const parts = [`${idx}. ${name}\t${status}`];
        const note = String(r.note || '').trim();
        if (note) {
            parts[0] += ` - ${note}`;
        }
        if (r.submittedRetest && labels && labels.retestReceived) {
            parts[0] += ` [${labels.retestReceived}]`;
        }
        if (r.ssOverdue && labels) {
            const overdueLabel =
                r.ssOverdueKind === 'received_late' || r.submissionLate
                    ? labels.receivedLate || labels.overdue
                    : labels.overdue;
            if (overdueLabel) {
                parts[0] += ` (${overdueLabel})`;
            }
        }
        return sanitizeCopyText(parts[0]);
    }

    /**
     * Plain-text export grouped by HR → class → assignment.
     */
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
                (classGroup.assignments || []).forEach((assign, ai) => {
                    if (ci > 0 || ai > 0) {
                        lines.push('');
                    }
                    const meta = [classGroup.classTypeLabel, classGroup.levelLabel]
                        .filter(Boolean)
                        .join(' · ');
                    const classTitle = meta
                        ? `${classGroup.className || ''} (${meta})`
                        : classGroup.className || '';
                    const assignTitle = assign.assignmentLabel || '';
                    lines.push(`-- ${classTitle} - ${assignTitle} --`);
                    (assign.students || []).forEach((student) => {
                        lines.push(formatStudentCopyLine(student, L));
                    });
                });
            });
        });
        return sanitizeCopyText(lines.join('\n').trimEnd());
    }

    global.CCPClassroomEssayClassSummary = {
        NO_HOMEROOM_KEY,
        STATUS_CSS,
        normalizeKey,
        statusCssClass,
        resolveHomeroomMeta,
        monthKeyFromDueDate,
        listHomeroomFilterOptions,
        listMonthFilterOptions,
        filterAssignmentsByHrAndMonth,
        listRowsForAssignments,
        groupRowsByHomeroom,
        formatCopyText,
        formatStudentCopyLine,
        formatStudentDisplayName,
        sanitizeCopyText
    };
})(typeof window !== 'undefined' ? window : globalThis);
