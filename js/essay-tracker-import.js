/**
 * Essay Completion-Resubmit Tracker JSON → calendar roster pack converter.
 */
(function (global) {
    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function isEssayTrackerPack(json) {
        if (!json || typeof json !== 'object') {
            return false;
        }
        if (Array.isArray(json.classes) && json.classes.length) {
            return true;
        }
        if (Array.isArray(json.students) && (json.className || json.name)) {
            return true;
        }
        return false;
    }

    function normalizeEssayTrackerApp(data) {
        if (!data || typeof data !== 'object') {
            return { classes: [] };
        }
        if (Array.isArray(data.classes)) {
            return {
                version: data.version || 1,
                updatedAt: normalizeStr(data.updatedAt),
                classes: data.classes.filter(Boolean).map((c) => ({
                    id: normalizeStr(c.id),
                    name: normalizeStr(c.name) || 'Imported class',
                    ssDueDate: normalizeStr(c.ssDueDate),
                    teacherEvalDueDate: normalizeStr(c.teacherEvalDueDate),
                    students: Array.isArray(c.students) ? c.students.filter(Boolean) : []
                }))
            };
        }
        if (Array.isArray(data.students)) {
            return {
                version: 1,
                updatedAt: normalizeStr(data.updatedAt),
                classes: [
                    {
                        id: normalizeStr(data.id),
                        name: normalizeStr(data.className || data.name) || 'Imported class',
                        ssDueDate: normalizeStr(data.ssDueDate),
                        teacherEvalDueDate: normalizeStr(data.teacherEvalDueDate),
                        students: data.students.filter(Boolean)
                    }
                ]
            };
        }
        return { classes: [] };
    }

    function stableStudentId(className, index) {
        if (global.CCPRosterImport && global.CCPRosterImport.stableStudentId) {
            return global.CCPRosterImport.stableStudentId(className, index);
        }
        const slug = String(className || 'import')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        const nn = String(index + 1).padStart(2, '0');
        return `stu-${slug}-${nn}`;
    }

    function trackerStudentToCalendar(raw, className) {
        if (!raw || typeof raw !== 'object') {
            return null;
        }
        const name = normalizeStr(raw.koreanName || raw.name);
        const nameEn = normalizeStr(raw.englishName || raw.nameEn);
        if (!name && !nameEn) {
            return null;
        }
        const sortOrder = Number.isFinite(raw.index) ? raw.index : 0;
        const tags = [];
        if (raw.flags && raw.flags.star) {
            tags.push('interested');
        }
        const memoParts = [];
        if (normalizeStr(raw.school)) {
            memoParts.push(normalizeStr(raw.school));
        }
        if (normalizeStr(raw.grade)) {
            memoParts.push(normalizeStr(raw.grade));
        }
        if (normalizeStr(raw.notes)) {
            memoParts.push(normalizeStr(raw.notes));
        }
        return {
            id: stableStudentId(className, Math.max(0, sortOrder - 1)),
            name,
            nameEn,
            locationTag: normalizeStr(raw.branch || raw.locationTag),
            sortOrder,
            active: true,
            tags,
            memo: memoParts.join(' · ')
        };
    }

    function parseEssayTrackerPack(json) {
        const app = normalizeEssayTrackerApp(json);
        const cohorts = [];
        app.classes.forEach((cls) => {
            const className = cls.name || 'Imported class';
            const students = (cls.students || [])
                .map((s) => trackerStudentToCalendar(s, className))
                .filter(Boolean);
            if (!students.length) {
                return;
            }
            cohorts.push({
                cohortId: null,
                cohortName: className,
                students
            });
        });
        if (!cohorts.length) {
            return { error: 'No classes with students found in Essay Tracker file', pack: null };
        }
        return {
            error: null,
            pack: {
                version: 1,
                source: 'essay-homework-tracker',
                mergeByName: true,
                exportedAt: app.updatedAt || new Date().toISOString(),
                calendarName: '',
                cohorts
            }
        };
    }

    global.CCPEssayTrackerImport = {
        isEssayTrackerPack,
        normalizeEssayTrackerApp,
        trackerStudentToCalendar,
        parseEssayTrackerPack
    };
})(typeof window !== 'undefined' ? window : globalThis);
