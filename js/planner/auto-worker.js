/**
 * Web Worker for the schedule planner's auto-schedule search.
 *
 * The search is bounded by time but still CPU-heavy; running it here keeps the page responsive.
 * Message in : { id, appData, draft, analysis, options }
 * Message out: { id, ok:true, options:[...] }  or  { id, ok:false, error }
 * The page falls back to running the search itself when a worker cannot be started.
 */
/* global importScripts */
(function () {
    const v = (self.location.search || '');
    importScripts(
        '../schedule-matrix-data.js' + v,
        '../timetable-periods.js' + v,
        '../level-profile.js' + v,
        '../teacher-timetable.js' + v,
        'teacher-planner-core.js' + v,
        'teacher-planner-auto.js' + v
    );
    self.onmessage = function (ev) {
        const m = ev.data || {};
        try {
            const out = self.CCPPlannerAuto.buildOptions(m.appData, m.draft, m.analysis, m.options || {});
            self.postMessage({ id: m.id, ok: true, options: out });
        } catch (err) {
            self.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) });
        }
    };
})();
