/**
 * Navy speaking test scoring + print helpers (pure / no DOM deps beyond window.open).
 */
(function (global) {
    'use strict';

    const RUBRIC_CATEGORIES = [
        { key: 'pronunciation', label: 'Pronunciation', max: 2 },
        { key: 'speed', label: 'Speed', max: 2 },
        { key: 'intonation', label: 'Intonation', max: 1 },
        { key: 'grammar', label: 'Grammar', max: 2 },
        { key: 'content', label: 'Content', max: 3 }
    ];

    const GRADE_POINT_MAP = {
        A: { pronunciation: 2, speed: 2, intonation: 1, grammar: 2, content: 3 },
        B: { pronunciation: 1.5, speed: 1.5, intonation: 0.8, grammar: 1.5, content: 2.4 },
        C: { pronunciation: 1, speed: 1, intonation: 0.6, grammar: 1, content: 1.8 },
        D: { pronunciation: 0.5, speed: 0.5, intonation: 0.4, grammar: 0.5, content: 1.2 }
    };

    const GRADE_OPTIONS = ['A', 'B', 'C', 'D'];
    const QUESTION_COUNT = 10;
    const LOCAL_STORAGE_KEY = 'studentScoreTrackerData';
    const LOCAL_IMPORT_MARK_KEY = 'studentScoreTrackerDataImported';

    function createDefaultScoreBreakdown() {
        return {
            pronunciation: 'A',
            speed: 'A',
            intonation: 'A',
            grammar: 'A',
            content: 'A',
            note: ''
        };
    }

    function convertGradeToPoints(categoryKey, grade) {
        const g = String(grade || 'A').toUpperCase();
        return (GRADE_POINT_MAP[g] && GRADE_POINT_MAP[g][categoryKey]) || 0;
    }

    function calculateQuestionTotal(score) {
        if (!score || typeof score !== 'object') {
            return 0;
        }
        let total = 0;
        for (let i = 0; i < RUBRIC_CATEGORIES.length; i += 1) {
            const cat = RUBRIC_CATEGORIES[i];
            total += convertGradeToPoints(cat.key, score[cat.key]);
        }
        return total;
    }

    function calculateCategoryAverages(scores) {
        const averages = {};
        let totalSum = 0;
        for (let i = 0; i < RUBRIC_CATEGORIES.length; i += 1) {
            averages[RUBRIC_CATEGORIES[i].key] = 0;
        }
        if (!scores || !scores.length) {
            return { averages, totalSum: 0 };
        }
        const sums = {};
        for (let i = 0; i < RUBRIC_CATEGORIES.length; i += 1) {
            sums[RUBRIC_CATEGORIES[i].key] = 0;
        }
        for (let q = 0; q < scores.length; q += 1) {
            const score = scores[q] || {};
            for (let i = 0; i < RUBRIC_CATEGORIES.length; i += 1) {
                const cat = RUBRIC_CATEGORIES[i];
                sums[cat.key] += convertGradeToPoints(cat.key, score[cat.key]);
            }
        }
        for (let i = 0; i < RUBRIC_CATEGORIES.length; i += 1) {
            const cat = RUBRIC_CATEGORIES[i];
            const avg = sums[cat.key] / scores.length;
            averages[cat.key] = avg;
            totalSum += avg;
        }
        return { averages, totalSum };
    }

    function generateScoreTooltip(scores) {
        if (!scores || !scores.length) {
            return 'No scores entered yet.';
        }
        return scores
            .map((score, index) => `Q${index + 1}: ${calculateQuestionTotal(score).toFixed(1)}`)
            .join('\n');
    }

    function parseNameParts(fullName) {
        const name = String(fullName || '').trim();
        const parenMatch = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
        if (parenMatch) {
            return { korean: parenMatch[1].trim(), english: parenMatch[2].trim() };
        }
        return { korean: name, english: '' };
    }

    function compareStudents(a, b, sortMode) {
        const mode = sortMode || 'alphabetical';
        if (mode === 'alphabetical') {
            const aParts = parseNameParts(a.name);
            const bParts = parseNameParts(b.name);
            const koreanCmp = aParts.korean.localeCompare(bParts.korean, 'ko');
            if (koreanCmp !== 0) {
                return koreanCmp;
            }
            return aParts.english.localeCompare(bParts.english, 'en');
        }
        if (mode === 'pasteOrder') {
            const aOrder = a.pasteOrder != null ? a.pasteOrder : a.entryOrder != null ? a.entryOrder : 0;
            const bOrder = b.pasteOrder != null ? b.pasteOrder : b.entryOrder != null ? b.entryOrder : 0;
            if (aOrder !== bOrder) {
                return aOrder - bOrder;
            }
            return (a.entryOrder != null ? a.entryOrder : 0) - (b.entryOrder != null ? b.entryOrder : 0);
        }
        return (a.entryOrder != null ? a.entryOrder : 0) - (b.entryOrder != null ? b.entryOrder : 0);
    }

    function getSortedStudents(students, sortMode) {
        return (Array.isArray(students) ? students.slice() : []).sort((a, b) =>
            compareStudents(a, b, sortMode)
        );
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function openPrintWindow(title, htmlBody) {
        const reportWindow = global.open('', '_blank', 'width=800,height=600');
        if (!reportWindow) {
            return null;
        }
        reportWindow.document.write(
            `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head><body>${htmlBody}</body></html>`
        );
        reportWindow.document.close();
        return reportWindow;
    }

    function buildStudentReportHtml(student, assignments, scoresByAssignment) {
        let html = `
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; line-height: 1.6; padding: 20px; }
            h1 { font-size: 24px; } h2 { font-size: 20px; margin-top: 30px; border-bottom: 1px solid #eee; padding-bottom: 5px;} h3 { margin-top: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
            th { background-color: #f4f4f4; }
            .summary-table .total-row { font-weight: bold; background-color: #f9f9f9; }
            .score-sheet { font-size: 11px; } .score-sheet th { background-color: #f8f8f8; }
            .score-sheet .q-total { font-weight: bold; background-color: #f9f9f9; text-align: center; }
            .score-sheet td { text-align: center; }
            @media print {
              body { padding: 0.5in; }
              h2 { page-break-before: always; } h2:first-of-type { page-break-before: auto; }
            }
          </style>
          <h1>Student Report: ${escapeHtml(student.name)}</h1>
        `;
        const sortedAssignments = (assignments || [])
            .slice()
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));
        for (let i = 0; i < sortedAssignments.length; i += 1) {
            const assignment = sortedAssignments[i];
            html += `<h2>Assignment: ${escapeHtml(assignment.title)} (${escapeHtml(assignment.date)})</h2>`;
            const scores = scoresByAssignment && scoresByAssignment[assignment.id];
            if (scores && scores.length) {
                const { averages, totalSum } = calculateCategoryAverages(scores);
                html += `<h3>Summary Statistics</h3><table class="summary-table">
                  <thead><tr><th>Category</th><th>Average Score</th><th>Max Score</th></tr></thead><tbody>`;
                for (let c = 0; c < RUBRIC_CATEGORIES.length; c += 1) {
                    const cat = RUBRIC_CATEGORIES[c];
                    html += `<tr><td>${escapeHtml(cat.label)}</td><td>${averages[cat.key].toFixed(1)}</td><td>${cat.max}</td></tr>`;
                }
                html += `<tr class="total-row"><td>Total</td><td>${totalSum.toFixed(1)}</td><td>10</td></tr></tbody></table>`;
                html += `<h3>Detailed Score Sheet</h3><table class="score-sheet">
                  <thead><tr><th>Q #</th>
                    ${RUBRIC_CATEGORIES.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}
                    <th>Q. Total (/10)</th>
                    <th>Notes</th>
                  </tr></thead><tbody>`;
                for (let q = 0; q < scores.length; q += 1) {
                    const qScore = scores[q];
                    html += `<tr>
                      <td><b>Q${q + 1}</b></td>
                      ${RUBRIC_CATEGORIES.map((c) => `<td>${escapeHtml(qScore[c.key])}</td>`).join('')}
                      <td class="q-total">${calculateQuestionTotal(qScore).toFixed(1)}</td>
                      <td class="q-note">${escapeHtml(qScore.note || '')}</td>
                    </tr>`;
                }
                html += '</tbody></table>';
            } else {
                html += '<p>No scores submitted for this assignment.</p>';
            }
        }
        return html;
    }

    function buildAllSummariesHtml(students, assignments) {
        let html = `
          <style>
            body { font-family: sans-serif; line-height: 1.6; padding: 20px; }
            h1 { font-size: 24px; } h2 { font-size: 20px; margin-top: 30px; border-bottom: 1px solid #eee; padding-bottom: 5px;}
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
            th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
            th { background-color: #f4f4f4; }
            .student-row td:first-child { font-weight: bold; }
            .no-score { color: #888; text-align: center; }
            @media print {
              body { padding: 0.5in; }
              h2 { page-break-before: always; } h2:first-of-type { page-break-before: auto; }
            }
          </style>
          <h1>All Student Summaries</h1>
        `;
        const sortedAssignments = (assignments || [])
            .slice()
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));
        for (let i = 0; i < sortedAssignments.length; i += 1) {
            const assignment = sortedAssignments[i];
            html += `<h2>Assignment: ${escapeHtml(assignment.title)} (${escapeHtml(assignment.date)})</h2><table>
              <thead><tr><th>Student</th>
                ${RUBRIC_CATEGORIES.map((c) => `<th>${escapeHtml(c.label.substring(0, 5))}. (${c.max})</th>`).join('')}
                <th>Total (/10)</th>
              </tr></thead><tbody>`;
            for (let s = 0; s < students.length; s += 1) {
                const student = students[s];
                const scores =
                    student.scores && student.scores[assignment.id] ? student.scores[assignment.id] : null;
                html += `<tr class="student-row"><td>${escapeHtml(student.name)}</td>`;
                if (scores && scores.length) {
                    const { averages, totalSum } = calculateCategoryAverages(scores);
                    for (let c = 0; c < RUBRIC_CATEGORIES.length; c += 1) {
                        html += `<td>${averages[RUBRIC_CATEGORIES[c].key].toFixed(1)}</td>`;
                    }
                    html += `<td><b>${totalSum.toFixed(1)}</b></td>`;
                } else {
                    html += `<td colspan="${RUBRIC_CATEGORIES.length + 1}" class="no-score">No score submitted</td>`;
                }
                html += '</tr>';
            }
            html += '</tbody></table>';
        }
        return html;
    }

    function buildBlankScoreSheetsHtml(students, className) {
        const classDisplay = String(className || '').trim() || '___________________________________';
        let html = `
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; line-height: 1.5; padding: 20px; color: #111; }
            .sheet { border: 1px solid #ccc; padding: 1.5rem; border-radius: 8px; page-break-after: always; margin-bottom: 2rem; }
            .sheet:last-child { page-break-after: auto; }
            h1 { font-size: 1.5rem; color: #000; }
            .header-info { margin: 1.5rem 0; font-size: 1.1rem; }
            .header-info div { margin-bottom: 0.5rem; }
            table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; font-size: 1rem; }
            th, td { border: 1px solid #999; padding: 10px; text-align: center; height: 3rem; }
            th { background-color: #f4f4f4; font-size: 0.9rem; }
            .question-num { font-weight: bold; width: 8%; }
            .total-col { width: 12%; }
            @media print {
              body { padding: 0.5in; }
              .sheet { border: none; padding: 0; margin-bottom: 0; }
            }
          </style>
        `;
        for (let s = 0; s < students.length; s += 1) {
            const student = students[s];
            html += `
              <div class="sheet">
                <h1>Speaking Score Sheet</h1>
                <div class="header-info">
                  <div><strong>Class:</strong> ${escapeHtml(classDisplay)}</div>
                  <div><strong>Student:</strong> ${escapeHtml(student.name)}</div>
                  <div><strong>Assignment:</strong> ___________________________________</div>
                  <div><strong>Date:</strong> _________________</div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th class="question-num">Q #</th>
                      ${RUBRIC_CATEGORIES.map((c) => `<th>${escapeHtml(c.label)} (${c.max})</th>`).join('')}
                      <th class="total-col">Q. Total (/10)</th>
                    </tr>
                  </thead>
                  <tbody>
            `;
            for (let i = 1; i <= QUESTION_COUNT; i += 1) {
                html += `
                  <tr>
                    <td class="question-num">${i}</td>
                    ${RUBRIC_CATEGORIES.map(() => '<td></td>').join('')}
                    <td class="total-col"></td>
                  </tr>
                `;
            }
            html += '</tbody></table></div>';
        }
        return html;
    }

    function printStudentReport(student, assignments, scoresByAssignment) {
        const win = openPrintWindow(
            `Student Report: ${student.name}`,
            buildStudentReportHtml(student, assignments, scoresByAssignment)
        );
        if (win) {
            win.print();
        }
        return win;
    }

    function printAllSummaries(students, assignments) {
        const win = openPrintWindow('All Student Summaries', buildAllSummariesHtml(students, assignments));
        if (win) {
            win.print();
        }
        return win;
    }

    function printBlankScoreSheets(students, className) {
        const win = openPrintWindow(
            'Blank Student Score Sheets',
            buildBlankScoreSheetsHtml(students, className)
        );
        if (win) {
            win.print();
        }
        return win;
    }

    function readLocalStorageTracker() {
        try {
            const raw = global.localStorage && global.localStorage.getItem(LOCAL_STORAGE_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return null;
            }
            return parsed;
        } catch (err) {
            return null;
        }
    }

    function wasLocalStorageImported() {
        try {
            return !!(global.localStorage && global.localStorage.getItem(LOCAL_IMPORT_MARK_KEY));
        } catch (err) {
            return false;
        }
    }

    function markLocalStorageImported() {
        try {
            if (global.localStorage) {
                global.localStorage.setItem(LOCAL_IMPORT_MARK_KEY, '1');
            }
        } catch (err) {
            /* ignore */
        }
    }

    /**
     * Map offline tracker students (by name) onto class roster studentIds.
     * Returns { assignments, scores, matched, unmatched } or null if nothing useful.
     */
    function mapLocalStorageToRecord(localData, rosterStudents) {
        if (!localData || !Array.isArray(localData.students) || !localData.students.length) {
            return null;
        }
        const roster = Array.isArray(rosterStudents) ? rosterStudents : [];
        const nameToId = Object.create(null);
        roster.forEach((s) => {
            if (s && s.id && s.name) {
                nameToId[String(s.name).trim().toLowerCase()] = s.id;
            }
        });
        const assignments = Array.isArray(localData.assignments)
            ? localData.assignments
                  .filter((a) => a && a.id && a.title && a.date)
                  .map((a) => ({
                      id: String(a.id),
                      title: String(a.title),
                      date: String(a.date)
                  }))
            : [];
        const scores = {};
        let matched = 0;
        const unmatched = [];
        localData.students.forEach((stu) => {
            if (!stu || !stu.name) {
                return;
            }
            const sid = nameToId[String(stu.name).trim().toLowerCase()];
            if (!sid) {
                unmatched.push(stu.name);
                return;
            }
            matched += 1;
            if (stu.scores && typeof stu.scores === 'object') {
                scores[sid] = {};
                Object.keys(stu.scores).forEach((aid) => {
                    const qs = stu.scores[aid];
                    if (Array.isArray(qs)) {
                        scores[sid][aid] = qs.map((q) =>
                            Object.assign(createDefaultScoreBreakdown(), q || {})
                        );
                    }
                });
            }
        });
        if (!matched && !assignments.length) {
            return null;
        }
        const settings = localData.settings && typeof localData.settings === 'object' ? localData.settings : {};
        return {
            assignments,
            scores,
            settings: {
                studentSortMode: settings.studentSortMode || 'alphabetical'
            },
            matched,
            unmatched
        };
    }

    global.CCPSpeakingTestCore = {
        RUBRIC_CATEGORIES,
        GRADE_POINT_MAP,
        GRADE_OPTIONS,
        QUESTION_COUNT,
        LOCAL_STORAGE_KEY,
        createDefaultScoreBreakdown,
        convertGradeToPoints,
        calculateQuestionTotal,
        calculateCategoryAverages,
        generateScoreTooltip,
        parseNameParts,
        compareStudents,
        getSortedStudents,
        printStudentReport,
        printAllSummaries,
        printBlankScoreSheets,
        buildStudentReportHtml,
        buildAllSummariesHtml,
        buildBlankScoreSheetsHtml,
        readLocalStorageTracker,
        wasLocalStorageImported,
        markLocalStorageImported,
        mapLocalStorageToRecord
    };
})(typeof window !== 'undefined' ? window : globalThis);
