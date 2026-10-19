/**
 * In-panel banners when lessons, syllabus, or roster versions move past
 * what a generated view was built from. Auto-apply only when the target is empty.
 */
(function (global) {
    'use strict';

    const autoDone = {
        syllabus: '',
        homework: '',
        debate: ''
    };

    function t(key, fallback) {
        try {
            if (typeof global.t === 'function') {
                const val = global.t(key);
                if (val && val !== key) {
                    return val;
                }
            }
        } catch (_) {
            /* ignore */
        }
        return fallback || key;
    }

    function appData() {
        return global.appData || null;
    }

    function versions() {
        const data = appData();
        if (!data) {
            return { lessons: 0, syllabus: 0, roster: 0 };
        }
        if (global.CCPCalendarMutations && global.CCPCalendarMutations.ensureSourceVersions) {
            return global.CCPCalendarMutations.ensureSourceVersions(data);
        }
        if (!data.meta || typeof data.meta !== 'object') {
            data.meta = {};
        }
        if (!data.meta.versions) {
            data.meta.versions = { lessons: 0, syllabus: 0, roster: 0 };
        }
        return data.meta.versions;
    }

    function selectedClass() {
        const data = appData();
        if (!data || !Array.isArray(data.classes)) {
            return null;
        }
        let id = '';
        try {
            if (global.CCPClassroomZoneContext && global.CCPClassroomZoneContext.getActiveClassId) {
                id = global.CCPClassroomZoneContext.getActiveClassId() || '';
            }
        } catch (_) {
            id = '';
        }
        if (!id && data.ui && data.ui.syllabusClassId) {
            id = data.ui.syllabusClassId;
        }
        return data.classes.find((c) => c && String(c.id) === String(id)) || data.classes[0] || null;
    }

    function show(id, on) {
        const el = document.getElementById(id);
        if (!el) {
            return;
        }
        el.hidden = !on;
        const label = el.querySelector('[data-i18n="sourceChangedBanner"]');
        if (label && on) {
            label.textContent = t('sourceChangedBanner', 'Source changed since this was generated — Update');
        }
    }

    function syllabusRowsEmpty(classData) {
        const rows = classData && Array.isArray(classData.syllabusRows) ? classData.syllabusRows : [];
        if (!rows.length) {
            return true;
        }
        return rows.every((row) => {
            if (!row) {
                return true;
            }
            const plan = String(row.lessonPlan || row.plan || row.title || '').trim();
            const pages = String(row.pages || row.detail || '').trim();
            return !plan && !pages;
        });
    }

    function homeworkCopyEmpty() {
        const content = document.getElementById('homeworkEditorContent');
        const grading = document.getElementById('homeworkGradingText');
        const assign = document.getElementById('homeworkAssignText');
        if (!content || content.hidden || !grading || !assign) {
            return false;
        }
        return !String(grading.value || '').trim() && !String(assign.value || '').trim();
    }

    function debateSafeToRefresh() {
        if (!global.CCPClassroomDebateTeams || !global.CCPClassroomDebateTeams.rosterHasAssignments) {
            return false;
        }
        return !global.CCPClassroomDebateTeams.rosterHasAssignments();
    }

    function refresh() {
        const v = versions();
        const classData = selectedClass();
        const lessons = Number(v.lessons) || 0;
        const syllabus = Number(v.syllabus) || 0;
        const roster = Number(v.roster) || 0;
        const builtLessons = Number(classData && classData.syllabusBuiltFromLessons) || 0;
        const syllabusStale = Boolean(classData) && lessons > builtLessons;
        show('syllabusSourceBanner', syllabusStale);
        if (syllabusStale && syllabusRowsEmpty(classData) && autoDone.syllabus !== String(lessons)) {
            autoDone.syllabus = String(lessons);
            if (typeof global.syncClassSyllabusRowsFromCalendar === 'function') {
                try {
                    global.syncClassSyllabusRowsFromCalendar(classData, { refreshScheduleTitles: true });
                } catch (_) {
                    /* leave the banner */
                }
            }
        }

        const builtHomework = Number(classData && classData.homeworkCopyBuiltFromSyllabus) || 0;
        const homeworkStale = syllabus > builtHomework;
        show('homeworkSourceBanner', homeworkStale);
        if (homeworkStale && homeworkCopyEmpty() && autoDone.homework !== String(syllabus)) {
            autoDone.homework = String(syllabus);
            const btn = document.getElementById('homeworkRefreshSyllabiBtn');
            if (btn) {
                btn.click();
            }
        }

        const data = appData();
        const builtRoster = Number(data && data.meta && data.meta.debateRosterBuiltFrom) || 0;
        const debateStale = roster > builtRoster;
        show('debateSourceBanner', debateStale);
        if (debateStale && debateSafeToRefresh() && autoDone.debate !== String(roster)) {
            autoDone.debate = String(roster);
            const btn = document.getElementById('classroomDebateRefreshRosterBtn');
            if (btn) {
                btn.click();
            }
        }
    }

    function bind() {
        document.getElementById('syllabusSourceBannerUpdate')?.addEventListener('click', () => {
            const btn = document.getElementById('syllabusRefreshHeaderBtn');
            if (btn) {
                btn.click();
            }
        });
        document.getElementById('homeworkSourceBannerUpdate')?.addEventListener('click', () => {
            const btn = document.getElementById('homeworkRefreshSyllabiBtn');
            if (btn) {
                btn.click();
            }
        });
        document.getElementById('debateSourceBannerUpdate')?.addEventListener('click', () => {
            const btn = document.getElementById('classroomDebateRefreshRosterBtn');
            if (btn) {
                btn.click();
            }
        });
        global.addEventListener('ccp:source-versions', refresh);
        document.addEventListener('calendarLanguageChanged', refresh);
        setInterval(refresh, 4000);
        refresh();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.CCPSourceVersions = { refresh: refresh };
})(typeof window !== 'undefined' ? window : globalThis);
