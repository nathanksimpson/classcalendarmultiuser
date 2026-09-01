/**
 * Homeroom directory — pair cohorts into class-family rows (Classes | MWF | T/T).
 */
(function (global) {
    const ARCHIVE_COHORT_ID = 'cohort-student-archive';
    const TTH_WEEKDAYS = new Set([2, 4]);
    const MWF_PATTERN_IDS = new Set(['mwf', 'mw', 'wf', 'mf']);
    const HANGUL_RE = /[\u3131-\u318E\uAC00-\uD7A3]/;

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function containsHangul(text) {
        return HANGUL_RE.test(String(text || ''));
    }

    function isArchiveCohort(cohort) {
        if (!cohort) {
            return false;
        }
        if (global.CCPClassroomDomain && typeof global.CCPClassroomDomain.isArchiveCohort === 'function') {
            return global.CCPClassroomDomain.isArchiveCohort(cohort);
        }
        if (cohort.isArchiveCohort === true) {
            return true;
        }
        return normalizeStr(cohort.id) === ARCHIVE_COHORT_ID;
    }

    function scheduleBucket(cohort) {
        if (!cohort) {
            return 'mwf';
        }
        const pat = normalizeStr(cohort.schedulePattern).toLowerCase();
        if (pat === 'tth') {
            return 'tth';
        }
        if (MWF_PATTERN_IDS.has(pat)) {
            return 'mwf';
        }
        const days = Array.isArray(cohort.meetingDays) ? cohort.meetingDays : [];
        const weekdays = days
            .map((d) => Number(d))
            .filter((d) => d >= 1 && d <= 5);
        if (weekdays.length && weekdays.every((d) => TTH_WEEKDAYS.has(d))) {
            return 'tth';
        }
        return 'mwf';
    }

    function parseTmsMeta(name) {
        const api = global.CCPTmsClassName;
        if (!api || typeof api.parseTmsClassNameMeta !== 'function') {
            return null;
        }
        try {
            return api.parseTmsClassNameMeta(name);
        } catch (_err) {
            return null;
        }
    }

    function familyKeyFromCohort(cohort) {
        const rawName = normalizeStr(cohort && (cohort.name || cohort.level || ''));
        if (!rawName) {
            return normalizeStr(cohort && cohort.id);
        }
        const meta = parseTmsMeta(rawName);
        if (meta && meta.dayPattern && meta.baseName) {
            return normalizeStr(meta.baseName) || rawName;
        }
        const spaced = rawName.replace(/[\s_-]+[MTmt]$/, '').trim();
        if (spaced && spaced !== rawName) {
            return spaced;
        }
        const bucket = scheduleBucket(cohort);
        const camel = rawName.match(/^(.*[a-z])([MT])$/);
        if (camel) {
            const letter = camel[2];
            if ((letter === 'M' && bucket === 'mwf') || (letter === 'T' && bucket === 'tth')) {
                return camel[1];
            }
        }
        if (meta && meta.baseName) {
            return normalizeStr(meta.baseName) || rawName;
        }
        return rawName;
    }

    function findTeacherAccountName(userId, teachers) {
        const uid = normalizeStr(userId);
        if (!uid || !Array.isArray(teachers)) {
            return '';
        }
        const hit = teachers.find((row) => row && normalizeStr(row.userId) === uid);
        if (!hit) {
            return '';
        }
        const name = normalizeStr(hit.displayName || hit.name);
        if (!name || name === uid) {
            return '';
        }
        return name;
    }

    /**
     * Full Korean name when available. Prefer Hangul over an English/short label.
     * Never shortens to a first token. Does not append 선생님.
     */
    function resolveHomeroomKoreanName(cohort, teachers) {
        if (!cohort) {
            return '';
        }
        const stored = normalizeStr(cohort.homeroomTeacherName);
        const accountName = findTeacherAccountName(cohort.homeroomTeacherUserId, teachers);
        if (containsHangul(accountName)) {
            return accountName;
        }
        if (containsHangul(stored)) {
            return stored;
        }
        return accountName || stored;
    }

    function joinTeacherNames(names) {
        const seen = new Set();
        const out = [];
        (Array.isArray(names) ? names : []).forEach((name) => {
            const s = normalizeStr(name);
            if (!s) {
                return;
            }
            const key = s.toLowerCase();
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            out.push(s);
        });
        return out.join(' / ');
    }

    /**
     * @param {object} appData
     * @param {{ teachers?: { userId?: string, displayName?: string, name?: string }[] }} [options]
     * @returns {{ familyKey: string, familyName: string, mwf: string, tth: string }[]}
     */
    function buildRows(appData, options) {
        const teachers = options && Array.isArray(options.teachers) ? options.teachers : [];
        const cohorts = appData && Array.isArray(appData.cohorts) ? appData.cohorts : [];
        const byFamily = new Map();

        cohorts.forEach((cohort) => {
            if (!cohort || isArchiveCohort(cohort)) {
                return;
            }
            const familyKey = familyKeyFromCohort(cohort);
            if (!familyKey) {
                return;
            }
            const mapKey = familyKey.toLowerCase();
            if (!byFamily.has(mapKey)) {
                byFamily.set(mapKey, {
                    familyKey,
                    familyName: familyKey,
                    mwfNames: [],
                    tthNames: []
                });
            }
            const row = byFamily.get(mapKey);
            const teacher = resolveHomeroomKoreanName(cohort, teachers);
            if (scheduleBucket(cohort) === 'tth') {
                row.tthNames.push(teacher);
            } else {
                row.mwfNames.push(teacher);
            }
        });

        return Array.from(byFamily.values())
            .map((row) => ({
                familyKey: row.familyKey,
                familyName: row.familyName,
                mwf: joinTeacherNames(row.mwfNames),
                tth: joinTeacherNames(row.tthNames)
            }))
            .sort((a, b) =>
                (a.familyName || '').localeCompare(b.familyName || '', undefined, { sensitivity: 'base' })
            );
    }

    function t(hooks, key) {
        return hooks && typeof hooks.t === 'function' ? hooks.t(key) : key;
    }

    async function printHomeroomList(hooks) {
        const printApi = global.CCPHomeroomDirectoryPrint;
        if (!printApi || typeof printApi.renderDocumentHtml !== 'function') {
            return;
        }
        if (hooks && typeof hooks.ensureTeamTeacherAccountsLoaded === 'function') {
            try {
                await hooks.ensureTeamTeacherAccountsLoaded();
            } catch (_err) {
                /* print with whatever teacher names we already have */
            }
        }
        const appData = hooks && typeof hooks.getAppData === 'function' ? hooks.getAppData() : {};
        const teachers = hooks && typeof hooks.listTeachers === 'function' ? hooks.listTeachers() || [] : [];
        const rows = buildRows(appData, { teachers });
        const calendarName =
            hooks && typeof hooks.getCalendarName === 'function'
                ? hooks.getCalendarName()
                : normalizeStr(appData && appData.calendarName);
        const labels = {
            title: t(hooks, 'homeroomDirectoryPrintTitle'),
            colClasses: t(hooks, 'homeroomDirectoryColClasses'),
            colMwf: t(hooks, 'homeroomDirectoryColMwf'),
            colTth: t(hooks, 'homeroomDirectoryColTth'),
            empty: '—',
            noRows: t(hooks, 'homeroomDirectoryEmpty')
        };
        const bodyHtml = printApi.renderDocumentHtml({ calendarName, rows }, labels);
        const opened = printApi.openPrintDocument(labels.title, bodyHtml, printApi.PRINT_STYLES);
        if (!opened && hooks && typeof hooks.showToast === 'function') {
            hooks.showToast(t(hooks, 'printSyllabusBlocked'), true);
        }
    }

    function bindPrintButton(hooks) {
        const btn = document.getElementById('cohortsPrintHomeroomListBtn');
        if (!btn || btn.dataset.homeroomDirectoryBound === '1') {
            return;
        }
        btn.dataset.homeroomDirectoryBound = '1';
        btn.addEventListener('click', () => {
            void printHomeroomList(hooks);
        });
    }

    function init(hooks) {
        bindPrintButton(hooks || {});
    }

    global.CCPHomeroomDirectory = {
        containsHangul,
        isArchiveCohort,
        scheduleBucket,
        familyKeyFromCohort,
        resolveHomeroomKoreanName,
        buildRows,
        printHomeroomList,
        init
    };
})(typeof window !== 'undefined' ? window : globalThis);
