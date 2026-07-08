import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const refPath =
    '\\\\simson-jsl\\simson-jsl\\잠실르엘\\2. 교수팀개인\\심나단 (Nathan)\\Apps In Development\\Cursor Builds\\Debate Team Randomizer\\index.html';
const outPath = path.join(__dirname, '..', 'js', 'debate', 'debate-randomizer-core.js');

const html = fs.readFileSync(refPath, 'utf8');
const m = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/);
if (!m) {
    console.error('Could not find script block');
    process.exit(1);
}

let js = m[1];
js = js.replace(
    /window\.addEventListener\('DOMContentLoaded'[\s\S]*?\}\);\s*\n\n\n/,
    `function initDebateRandomizerDom() {
            const savedFormatsBridge = global.CCPDebateSessionBridge && global.CCPDebateSessionBridge.getCustomFormats
                ? global.CCPDebateSessionBridge.getCustomFormats()
                : null;
            if (Array.isArray(savedFormatsBridge) && savedFormatsBridge.length) {
                savedCustomFormats = savedFormatsBridge.slice();
            } else {
                const savedFormats = localStorage.getItem('customDebateFormats');
                if (savedFormats) {
                    savedCustomFormats = JSON.parse(savedFormats);
                }
            }

            const limitCheckbox = document.getElementById('limit-team-size');
            const maxTeamSizeGroup = document.getElementById('max-team-size-group');
            if (limitCheckbox && maxTeamSizeGroup) {
                limitCheckbox.addEventListener('change', () => {
                    maxTeamSizeGroup.style.display = limitCheckbox.checked ? 'block' : 'none';
                });
            }

            onFormatChange();
            addTeamPair();
            wireStaleListeners();
        }

`
);

js = js.replace(
    /function saveSession\(\) \{[\s\S]*?\}\n\n        function tryResumeSession/,
    `function saveSession() {
            try {
                if (global.CCPDebateSessionBridge && typeof global.CCPDebateSessionBridge.onSave === 'function') {
                    global.CCPDebateSessionBridge.onSave(collectAppState());
                    return;
                }
                if (debates.length > 0) {
                    localStorage.setItem(DEBATE_SESSION_KEY, JSON.stringify(collectAppState()));
                } else {
                    localStorage.removeItem(DEBATE_SESSION_KEY);
                }
            } catch (e) {}
        }

        function tryResumeSession`
);

js = js.replace(
    /localStorage\.setItem\('customDebateFormats', JSON\.stringify\(savedCustomFormats\)\);/g,
    `persistCustomFormats();`
);

js = js.replace(
    /function loadSavedFormats\(\)/,
    `function persistCustomFormats() {
            if (global.CCPDebateSessionBridge && typeof global.CCPDebateSessionBridge.saveCustomFormats === 'function') {
                global.CCPDebateSessionBridge.saveCustomFormats(savedCustomFormats);
            } else {
                localStorage.setItem('customDebateFormats', JSON.stringify(savedCustomFormats));
            }
        }

        function loadSavedFormats()`
);

js = js.replace(
    /localStorage\.setItem\('debateStudents', JSON\.stringify\(students\)\);/,
    `if (!(global.CCPDebateSessionBridge && global.CCPDebateSessionBridge.onRosterChange)) {
                localStorage.setItem('debateStudents', JSON.stringify(students));
            } else {
                global.CCPDebateSessionBridge.onRosterChange(students.slice());
            }`
);

const windowExports = `
const __debateWindowHandlers = {
    setMode, addStudentsFromPaste, addStudent, clearAllStudents, addTeamPair, clearAllTeamPairs,
    onFormatChange, addCustomRole, removeCustomRole, saveCustomFormat, loadSavedFormats,
    applySavedFormat, deleteSavedFormat, generateDebates, regenerateDebates, clearAssignments,
    clearResultsStale, exportStateJson, triggerImportState, handleStateFileSelected,
    copyResults, exportFeedbackWord, exportFeedbackPdf, printFeedbackScoreSheets,
    scrollToSetup, switchMemberSideTwoTeam, switchMemberFourTeamBench,
    onMemberRoleChange, onMemberRoleChangeFour
};
Object.keys(__debateWindowHandlers).forEach((k) => { global[k] = __debateWindowHandlers[k]; });
`;

const wrapped = `(function (global) {
'use strict';
${js}
${windowExports}
global.CCPDebateRandomizerCore = {
    initDebateRandomizerDom,
    debateFormats,
    getCurrentFormat,
    generateDebates,
    generateFromTeamPairs,
    distributeForEvenTeams,
    generateTwoTeamDebates,
    generateFourTeamDebates,
    assignTeamsAndRolesBySpeakerOrder,
    assignFourTeamsAndRolesBySpeakerOrder,
    sortDebateBySpeakingOrder,
    displayResults,
    generateTwoTeamCard,
    generateFourTeamCard,
    switchMemberSideTwoTeam,
    switchMemberFourTeamBench,
    onMemberRoleChange,
    onMemberRoleChangeFour,
    collectAppState,
    importStateFromJson,
    exportFeedbackWord,
    exportFeedbackPdf,
    printFeedbackScoreSheets,
    copyResults,
    collectAllWordLines,
    getFeedbackExportContext,
    promptFeedbackWordTemplate,
    FEEDBACK_TEMPLATES,
    collectDebateUiExtras,
    markResultsStale,
    clearResultsStale,
    updateStaleBanner,
    updatePrintHeaders,
    updateStickyBar,
    scrollToSetup,
    clearAssignments,
    regenerateDebates,
    onFormatChange,
    generateFormatInfoHTML,
    addCustomRole,
    removeCustomRole,
    updateCustomRolesDisplay,
    saveCustomFormat,
    loadSavedFormats,
    applySavedFormat,
    deleteSavedFormat,
    addTeamPair,
    removeTeamPair,
    renderTeamPairs,
    getTeamPairsFromInputs,
    setMode,
    updateStudentList,
    addStudent,
    removeStudent,
    addAllStudents,
    shuffleArray,
    initDebateRandomizerDom,
    saveSession,
    tryResumeSession,
    wireStaleListeners,
    exportStateJson,
    triggerImportState,
    handleStateFileSelected,
    addStudentsFromPaste,
    clearAllStudents,
    clearAllTeamPairs,
    persistCustomFormats
};
})(typeof window !== 'undefined' ? window : globalThis);
`;

fs.writeFileSync(outPath, wrapped);
console.log('Wrote', outPath, fs.statSync(outPath).size, 'bytes');
