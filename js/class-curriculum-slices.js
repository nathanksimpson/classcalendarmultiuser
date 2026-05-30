/**
 * Per-teacher curriculum slices: one class, multiple curricula on the calendar.
 */
(function (global) {
    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function normalizeMeetingDaysArray(days) {
        if (!global.CCPTeacherTimetable || !global.CCPTeacherTimetable.getMeetingDaysFromClass) {
            if (!Array.isArray(days)) {
                return [];
            }
            return days.map((d) => parseInt(d, 10)).filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6);
        }
        const tmp = { meetingDays: days };
        return global.CCPTeacherTimetable.getMeetingDaysFromClass(
            Array.isArray(days) && days.length ? tmp : { meetingDays: [] }
        );
    }

    function normalizeClassTeacherRow(row, classData) {
        const base = classData || {};
        const r = row || {};
        const meetingDays = Array.isArray(r.meetingDays) && r.meetingDays.length
            ? normalizeMeetingDaysArray(r.meetingDays)
            : [];
        return {
            id: normalizeStr(r.id) || '',
            userId: normalizeStr(r.userId),
            name: normalizeStr(r.name),
            category: normalizeStr(r.category),
            curriculumId: normalizeStr(r.curriculumId) || normalizeStr(base.curriculumId),
            classTypeId: normalizeStr(r.classTypeId) || normalizeStr(base.classTypeId),
            book: normalizeStr(r.book) || normalizeStr(base.book),
            scheduleModel: normalizeStr(r.scheduleModel) || normalizeStr(base.scheduleModel),
            totalLessons: r.totalLessons != null && r.totalLessons !== ''
                ? parseInt(r.totalLessons, 10)
                : null,
            meetingDays
        };
    }

    function getClassTeachersList(classData) {
        if (!classData) {
            return [];
        }
        const api = global.CCPTeacherTimetable;
        if (api && api.getClassTeachersList) {
            return api.getClassTeachersList(classData);
        }
        const rows = [];
        if (Array.isArray(classData.classTeachers)) {
            classData.classTeachers.forEach((row) => {
                const userId = normalizeStr(row.userId);
                const name = normalizeStr(row.name);
                if (userId || name) {
                    rows.push(row);
                }
            });
        }
        if (!rows.length && (classData.assignedTeacherUserId || classData.assignedTeacherName)) {
            rows.push({
                userId: classData.assignedTeacherUserId,
                name: classData.assignedTeacherName,
                category: classData.teacherCategory,
                curriculumId: classData.curriculumId,
                classTypeId: classData.classTypeId,
                book: classData.book
            });
        }
        return rows;
    }

    function getNormalizedClassTeachers(classData) {
        const raw = getClassTeachersList(classData);
        const rows = raw.map((row) => normalizeClassTeacherRow(row, classData));
        if (!rows.length) {
            rows.push(normalizeClassTeacherRow({}, classData));
        }
        return rows;
    }

    function teacherMatchesTeacherRef(ref, selector, options) {
        if (global.CCPTeacherTimetable && global.CCPTeacherTimetable.teacherMatchesTeacherRef) {
            return global.CCPTeacherTimetable.teacherMatchesTeacherRef(ref, selector, options);
        }
        if (!ref || !selector) {
            return false;
        }
        const uid = normalizeStr(selector.userId);
        const refUid = normalizeStr(ref.userId);
        if (uid && refUid && uid === refUid) {
            return true;
        }
        if (options && options.accountOnly === true) {
            return false;
        }
        const a = normalizeStr(selector.displayName).toLowerCase();
        const b = normalizeStr(ref.displayName || ref.name).toLowerCase();
        return a && b && (a === b || a.includes(b) || b.includes(a));
    }

    function resolvePresetForRow(classData, row, appData) {
        if (!global.CCPBooksEditor || !appData) {
            return row.classTypeId || classData.classTypeId || '';
        }
        const level = normalizeStr(classData.levelPreset)
            || normalizeStr(classData.levelCustom)
            || normalizeStr(classData.level);
        const cid = normalizeStr(row.curriculumId);
        if (!cid) {
            return row.classTypeId || classData.classTypeId || '';
        }
        return global.CCPBooksEditor.resolvePresetFromLevelAndBook(level, cid, appData)
            || row.classTypeId
            || classData.classTypeId
            || '';
    }

    function buildEffectiveClassForTeacherRow(classData, teacherRow, appData) {
        const row = normalizeClassTeacherRow(teacherRow, classData);
        const presetId = resolvePresetForRow(classData, row, appData);
        const effective = Object.assign({}, classData);
        if (row.curriculumId) {
            effective.curriculumId = row.curriculumId;
        }
        if (presetId) {
            effective.classTypeId = presetId;
        } else if (row.classTypeId) {
            effective.classTypeId = row.classTypeId;
        }
        if (row.book) {
            effective.book = row.book;
        }
        if (row.scheduleModel) {
            effective.scheduleModel = row.scheduleModel;
        }
        if (row.totalLessons != null && !Number.isNaN(row.totalLessons) && row.totalLessons > 0) {
            effective.totalLessons = row.totalLessons;
        }
        if (global.CCPBooksEditor && row.curriculumId && appData) {
            const level = normalizeStr(classData.levelPreset)
                || normalizeStr(classData.levelCustom);
            const merged = global.CCPBooksEditor.buildMergedClassDefaults(
                row.curriculumId,
                presetId || effective.classTypeId,
                appData,
                level
            );
            if (merged.scheduleModel && !row.scheduleModel) {
                effective.scheduleModel = merged.scheduleModel;
            }
            if (merged.defaultTotalLessons != null && row.totalLessons == null) {
                effective.totalLessons = merged.defaultTotalLessons;
            }
            if (merged.defaultBook && !row.book) {
                effective.book = merged.defaultBook;
            }
        }
        if (row.meetingDays && row.meetingDays.length) {
            effective.meetingDays = row.meetingDays.slice();
            if (effective.meetingDays.length === 1) {
                effective.dayOfWeek = effective.meetingDays[0];
            } else {
                effective.dayOfWeek = null;
            }
        }
        return { effective, teacherRow: row };
    }

    function getClassCurriculumSlices(classData, appData, options) {
        options = options || {};
        const showAll = options.showAll === true;
        const viewer = options.viewerSelector || null;
        const teachers = getNormalizedClassTeachers(classData);
        const slices = [];

        const accountMatchOpts = viewer && viewer.userId ? { accountOnly: true } : null;
        teachers.forEach((row, index) => {
            if (!showAll && viewer && viewer.userId) {
                if (!row.userId) {
                    return;
                }
                if (!teacherMatchesTeacherRef(
                    { userId: row.userId, displayName: row.name },
                    viewer,
                    accountMatchOpts
                )) {
                    return;
                }
            }
            const built = buildEffectiveClassForTeacherRow(classData, row, appData);
            const sliceId = row.id || `idx${index}`;
            const sliceKey = `${classData.id}:${sliceId}`;
            const suffix = row.category
                || (global.CCPBooksEditor && row.curriculumId
                    ? global.CCPBooksEditor.getCurriculumDisplayName(row.curriculumId, appData)
                    : '');
            slices.push({
                sliceKey,
                sliceId,
                classData: built.effective,
                baseClassData: classData,
                teacherRow: built.teacherRow,
                calendarLabelSuffix: suffix,
                calendarTitle: suffix
                    ? `${classData.name || ''} (${suffix})`
                    : (classData.name || '')
            });
        });

        if (!slices.length) {
            slices.push({
                sliceKey: `${classData.id}:default`,
                sliceId: 'default',
                classData: Object.assign({}, classData),
                baseClassData: classData,
                teacherRow: null,
                calendarLabelSuffix: '',
                calendarTitle: classData.name || ''
            });
        }
        return slices;
    }

    function getViewerTeacherSelector() {
        if (typeof global.TeamAuth === 'undefined' || !global.TeamAuth.getUser) {
            return null;
        }
        const me = global.TeamAuth.getUser();
        if (!me || !me.id) {
            return null;
        }
        return {
            userId: me.id,
            displayName: me.displayName || me.email || me.id,
            email: me.email || ''
        };
    }

    global.CCPClassCurriculumSlices = {
        normalizeClassTeacherRow,
        getNormalizedClassTeachers,
        getClassCurriculumSlices,
        buildEffectiveClassForTeacherRow,
        getViewerTeacherSelector,
        teacherMatchesTeacherRef,
        resolvePresetForRow
    };
})(typeof window !== 'undefined' ? window : globalThis);
