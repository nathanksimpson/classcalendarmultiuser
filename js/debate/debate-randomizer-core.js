(function (global) {
'use strict';
let students = [];
        let debates = [];
        let roleHistory = {};
        let customGovRoles = [];
        let customOppRoles = [];
        let savedCustomFormats = [];
        let currentMode = 'random'; // 'random' or 'teams'
        let teamPairs = []; // For pre-made teams mode
        let resultsStale = false;
        const DEBATE_SESSION_KEY = 'debateSession';
        const BTN = {
            primary: 'btn btn-primary btn-compact',
            outline: 'btn btn-outline btn-compact',
            danger: 'btn btn-outline btn-danger btn-compact'
        };

        function debateT(key, vars) {
            const bridge = global.CCPDebateSessionBridge;
            let text = bridge && typeof bridge.t === 'function' ? bridge.t(key) : key;
            if (!text) text = key;
            if (vars && typeof vars === 'object') {
                Object.keys(vars).forEach((k) => {
                    text = text.replace('{' + k + '}', String(vars[k]));
                });
            }
            return text;
        }

        function notifyResultsVisibility() {
            if (global.CCPDebateSessionBridge && typeof global.CCPDebateSessionBridge.onResultsVisibility === 'function') {
                const results = document.getElementById('results-section');
                const visible = !!(results && !results.classList.contains('hidden'));
                global.CCPDebateSessionBridge.onResultsVisibility(visible);
            }
        }

        // ========================================
        // DEBATE FORMAT DEFINITIONS
        // ========================================
        const debateFormats = {
            ap: {
                name: "Asia Parliamentary (AP)",
                teams: 2,
                govName: "Proposition",
                oppName: "Opposition",
                govIcon: "✅",
                oppIcon: "❌",
                govRoles: [
                    { abbr: "PM", name: "Prime Minister", desc: "Defines the motion, sets framework, presents main arguments" },
                    { abbr: "DPM", name: "Deputy Prime Minister", desc: "Rebuts LO, expands Prop case" },
                    { abbr: "GW", name: "Government Whip", desc: "Rebuts, summarizes Prop case (no new arguments)", isWhip: true }
                ],
                oppRoles: [
                    { abbr: "LO", name: "Leader of Opposition", desc: "Responds to PM, rebuts, presents Opp case" },
                    { abbr: "DLO", name: "Deputy Leader of Opposition", desc: "Rebuts DPM, expands Opp case" },
                    { abbr: "OW", name: "Opposition Whip", desc: "Rebuts, summarizes Opp case (no new arguments)", isWhip: true }
                ],
                replyRoles: {
                    opp: { abbr: "OR", name: "Opposition Reply", desc: "Summary speech for Opposition" },
                    gov: { abbr: "GR", name: "Government Reply", desc: "Summary speech for Government" }
                },
                speakerOrder: ["PM", "LO", "DPM", "DLO", "GW", "OW", "OR*", "GR*"],
                minStudents: 4,
                idealStudents: 6
            },
            bp: {
                name: "British Parliamentary (BP)",
                teams: 4,
                isFourTeam: true,
                teamStructure: [
                    { id: "og", name: "Opening Government", icon: "🟢", class: "opening-gov" },
                    { id: "oo", name: "Opening Opposition", icon: "🔴", class: "opening-opp" },
                    { id: "cg", name: "Closing Government", icon: "🟩", class: "closing-gov" },
                    { id: "co", name: "Closing Opposition", icon: "🟥", class: "closing-opp" }
                ],
                roles: {
                    og: [
                        { abbr: "PM", name: "Prime Minister", desc: "Defines the case, sets OG arguments" },
                        { abbr: "DPM", name: "Deputy Prime Minister", desc: "Supports PM, adds OG extension" }
                    ],
                    oo: [
                        { abbr: "LO", name: "Leader of Opposition", desc: "Direct rebuttal to PM, OO arguments" },
                        { abbr: "DLO", name: "Deputy Leader of Opposition", desc: "Supports LO, OO extension" }
                    ],
                    cg: [
                        { abbr: "MG", name: "Member of Government", desc: "Provides new CG extension" },
                        { abbr: "GW", name: "Government Whip", desc: "Summarizes CG/OG, no new material", isWhip: true }
                    ],
                    co: [
                        { abbr: "MO", name: "Member of Opposition", desc: "Provides new CO extension" },
                        { abbr: "OW", name: "Opposition Whip", desc: "Summarizes CO/OO, no new material", isWhip: true }
                    ]
                },
                speakerOrder: ["PM", "LO", "DPM", "DLO", "MG", "MO", "GW", "OW"],
                minStudents: 8,
                idealStudents: 8,
                notes: "Only CG and CO provide 'extensions'. Whips summarize the half."
            },
            wudc: {
                name: "WUDC (World Universities)",
                teams: 4,
                isFourTeam: true,
                teamStructure: [
                    { id: "og", name: "Opening Government", icon: "🟢", class: "opening-gov" },
                    { id: "oo", name: "Opening Opposition", icon: "🔴", class: "opening-opp" },
                    { id: "cg", name: "Closing Government", icon: "🟩", class: "closing-gov" },
                    { id: "co", name: "Closing Opposition", icon: "🟥", class: "closing-opp" }
                ],
                roles: {
                    og: [
                        { abbr: "PM", name: "Prime Minister", desc: "Defines the case, sets OG arguments" },
                        { abbr: "DPM", name: "Deputy Prime Minister", desc: "Supports PM, adds OG extension" }
                    ],
                    oo: [
                        { abbr: "LO", name: "Leader of Opposition", desc: "Direct rebuttal to PM, OO arguments" },
                        { abbr: "DLO", name: "Deputy Leader of Opposition", desc: "Supports LO, OO extension" }
                    ],
                    cg: [
                        { abbr: "MG", name: "Member of Government", desc: "Provides new CG extension" },
                        { abbr: "GW", name: "Government Whip", desc: "Summarizes CG/OG, no new material", isWhip: true }
                    ],
                    co: [
                        { abbr: "MO", name: "Member of Opposition", desc: "Provides new CO extension" },
                        { abbr: "OW", name: "Opposition Whip", desc: "Summarizes CO/OO, no new material", isWhip: true }
                    ]
                },
                speakerOrder: ["PM", "LO", "DPM", "DLO", "MG", "MO", "GW", "OW"],
                minStudents: 8,
                idealStudents: 8,
                notes: "No reply speeches. No POIs during whip speeches (depending on tournament rules)."
            },
            policy: {
                name: "Policy Debate (CX)",
                teams: 2,
                govName: "Affirmative",
                oppName: "Negative",
                govIcon: "🔵",
                oppIcon: "🔶",
                govRoles: [
                    { abbr: "1A", name: "First Affirmative", desc: "1AC: Case presentation, 2AC: Responds to 1NC" },
                    { abbr: "2A", name: "Second Affirmative", desc: "1AR: Responds to Neg block, 2AR: Final Affirmative speech" }
                ],
                oppRoles: [
                    { abbr: "1N", name: "First Negative", desc: "1NC: Off-case attacks, disadvantages, counterplans" },
                    { abbr: "2N", name: "Second Negative", desc: "2NC: Develops Neg strategy, NR: Negative summary" }
                ],
                speakerOrder: ["1AC", "CX", "1NC", "CX", "2AC", "CX", "2NC", "CX", "1NR", "1AR", "2NR", "2AR"],
                speakerOrderRoleAliases: {
                    "1AC": "1A", "2AC": "2A", "1NC": "1N", "2NC": "2N",
                    "1NR": "1N", "2NR": "2N", "1AR": "1A", "2AR": "2A"
                },
                minStudents: 4,
                idealStudents: 4,
                notes: "Cross-examinations occur after each constructive speech."
            },
            ld: {
                name: "Lincoln-Douglas (LD)",
                teams: 2,
                isOneVsOne: true,
                govName: "Affirmative",
                oppName: "Negative",
                govIcon: "🔵",
                oppIcon: "🔶",
                govRoles: [
                    { abbr: "AFF", name: "Affirmative", desc: "AC: Framework + value + contention, 1AR & 2AR: Rebuttals" }
                ],
                oppRoles: [
                    { abbr: "NEG", name: "Negative", desc: "NC: Neg case + refutation, NR: Negative Rebuttal" }
                ],
                speakerOrder: ["AC", "CX by Neg", "NC", "CX by Aff", "1AR", "NR", "2AR"],
                speakerOrderRoleAliases: {
                    "AC": "AFF",
                    "NC": "NEG",
                    "1AR": "AFF",
                    "NR": "NEG",
                    "2AR": "AFF"
                },
                minStudents: 2,
                idealStudents: 2,
                notes: "Focus on values & philosophy. 1v1 format."
            },
            pf: {
                name: "Public Forum (PF)",
                teams: 2,
                govName: "Pro",
                oppName: "Con",
                govIcon: "👍",
                oppIcon: "👎",
                govRoles: [
                    { abbr: "1st Pro", name: "First Speaker Pro", desc: "Opening, Summary, Final Focus" },
                    { abbr: "2nd Pro", name: "Second Speaker Pro", desc: "Rebuttal, Crossfire participation" }
                ],
                oppRoles: [
                    { abbr: "1st Con", name: "First Speaker Con", desc: "Opening, Summary, Final Focus" },
                    { abbr: "2nd Con", name: "Second Speaker Con", desc: "Rebuttal, Crossfire participation" }
                ],
                speakerOrder: ["1st Pro", "1st Con", "Crossfire", "2nd Pro", "2nd Con", "Crossfire", "Summary Pro", "Summary Con", "Grand Crossfire", "Final Focus Pro", "Final Focus Con"],
                speakerOrderRoleAliases: {
                    "Summary Pro": "1st Pro",
                    "Final Focus Pro": "2nd Pro",
                    "Summary Con": "1st Con",
                    "Final Focus Con": "2nd Con"
                },
                minStudents: 4,
                idealStudents: 4,
                notes: "Focus on accessibility for general audiences."
            },
            bf: {
                name: "Balloon/Forum Debate (BF)",
                teams: 2,
                govName: "Team A",
                oppName: "Team B",
                govIcon: "🅰️",
                oppIcon: "🅱️",
                govRoles: [
                    { abbr: "A1", name: "Speaker 1", desc: "Opening Statement" },
                    { abbr: "A2", name: "Speaker 2", desc: "Rebuttals & Arguments" },
                    { abbr: "A3", name: "Speaker 3", desc: "Final Statement (optional)" }
                ],
                oppRoles: [
                    { abbr: "B1", name: "Speaker 1", desc: "Opening Statement" },
                    { abbr: "B2", name: "Speaker 2", desc: "Rebuttals & Arguments" },
                    { abbr: "B3", name: "Speaker 3", desc: "Final Statement (optional)" }
                ],
                speakerOrder: ["A1 Opening", "B1 Opening", "Rebuttals", "Further Arguments", "Final Statements"],
                speakerOrderRoleAliases: {
                    "A1 Opening": "A1",
                    "B1 Opening": "B1"
                },
                minStudents: 4,
                idealStudents: 6,
                notes: "Used more for training and light competition. Flexible format."
            },
            knc: {
                name: "KNC (Korea National Congress)",
                teams: 2,
                govName: "Affirmative",
                oppName: "Negative",
                govIcon: "🇰🇷",
                oppIcon: "⚖️",
                govRoles: [
                    { abbr: "Aff Rep", name: "Affirmative Representative", desc: "Opening Statement, Interpellation, Rebuttal, Closing" },
                    { abbr: "Aff 2", name: "Affirmative Second", desc: "Support during Free Debate" }
                ],
                oppRoles: [
                    { abbr: "Neg Rep", name: "Negative Representative", desc: "Opening Statement, Interpellation, Rebuttal, Closing" },
                    { abbr: "Neg 2", name: "Negative Second", desc: "Support during Free Debate" }
                ],
                speakerOrder: ["Aff Opening", "Neg Opening", "Interpellation (A→B)", "Interpellation (B→A)", "Rebuttals", "Free Debate", "Aff Closing", "Neg Closing"],
                speakerOrderRoleAliases: {
                    "Aff Opening": "Aff Rep",
                    "Neg Opening": "Neg Rep",
                    "Aff Closing": "Aff Rep",
                    "Neg Closing": "Neg Rep"
                },
                minStudents: 4,
                idealStudents: 4,
                notes: "Parliamentary/political simulation. Interpellation is cross-examination."
            },
            simson: {
                name: "Simson Format",
                teams: 2,
                govName: "Government",
                oppName: "Opposition",
                govIcon: "🏛️",
                oppIcon: "⚔️",
                govRoles: [
                    { abbr: "PM", name: "Prime Minister", desc: "Opens the case for Government, presents main arguments" },
                    { abbr: "DPM", name: "Deputy Prime Minister", desc: "Supports PM, expands Government case" },
                    { abbr: "DPM2", name: "Deputy Prime Minister 2", desc: "Further develops Government arguments" }
                ],
                oppRoles: [
                    { abbr: "LO", name: "Leader of Opposition", desc: "Responds to PM, presents Opposition case" },
                    { abbr: "DLO", name: "Deputy Leader of Opposition", desc: "Supports LO, expands Opposition case" },
                    { abbr: "DLO2", name: "Deputy Leader of Opposition 2", desc: "Further develops Opposition arguments" }
                ],
                speakerOrder: ["PM", "LO", "DPM", "DLO", "DPM2", "DLO2"],
                minStudents: 4,
                idealStudents: 4,
                notes: "2v2 debate format with extended deputy positions."
            },
            simple: {
                name: "Simple (No Roles)",
                teams: 2,
                govName: "Proposition",
                oppName: "Opposition",
                govIcon: "✅",
                oppIcon: "❌",
                govRoles: [],
                oppRoles: [],
                speakerOrder: [],
                minStudents: 4,
                idealStudents: 4,
                notes: "Basic team assignment without specific roles."
            },
            custom: {
                name: "Custom Format",
                teams: 2,
                govName: "Government",
                oppName: "Opposition",
                govIcon: "🟢",
                oppIcon: "🔴",
                govRoles: [],
                oppRoles: [],
                speakerOrder: [],
                minStudents: 2,
                idealStudents: 4,
                notes: "Create your own debate format with custom roles."
            }
        };

        // ========================================
        // INITIALIZATION
        // ========================================
        function usingClassManagerBridge() {
            return !!(global.CCPDebateSessionBridge && typeof global.CCPDebateSessionBridge.onSave === 'function');
        }

        function initDebateRandomizerDom() {
            const useBridge = usingClassManagerBridge();

            if (!useBridge) {
                const saved = localStorage.getItem('debateStudents');
                if (saved) {
                    students = JSON.parse(saved);
                    updateStudentList();
                }
            }

            const savedFormatsBridge = global.CCPDebateSessionBridge && global.CCPDebateSessionBridge.getCustomFormats
                ? global.CCPDebateSessionBridge.getCustomFormats()
                : null;
            if (Array.isArray(savedFormatsBridge) && savedFormatsBridge.length) {
                savedCustomFormats = savedFormatsBridge.slice();
            } else if (!useBridge) {
                const savedFormats = localStorage.getItem('customDebateFormats');
                if (savedFormats) {
                    savedCustomFormats = JSON.parse(savedFormats);
                }
            }

            const limitCheckbox = document.getElementById('limit-team-size');
            const maxTeamSizeGroup = document.getElementById('max-team-size-group');
            if (limitCheckbox && maxTeamSizeGroup) {
                limitCheckbox.addEventListener('change', () => {
                    maxTeamSizeGroup.classList.toggle('hidden', !limitCheckbox.checked);
                });
            }

            onFormatChange();

            const classTitleInput = document.getElementById('class-title');
            const hrTeacherInput = document.getElementById('hr-teacher');
            if (useBridge) {
                const onMetaChange = () => saveSession();
                if (classTitleInput) classTitleInput.addEventListener('input', onMetaChange);
                if (hrTeacherInput) hrTeacherInput.addEventListener('input', onMetaChange);
            } else {
                const savedClassTitle = localStorage.getItem('debateClassTitle');
                if (classTitleInput && savedClassTitle) {
                    classTitleInput.value = savedClassTitle;
                }
                if (classTitleInput) {
                    classTitleInput.addEventListener('input', () => {
                        localStorage.setItem('debateClassTitle', classTitleInput.value);
                    });
                }

                const savedHrTeacher = localStorage.getItem('debateHrTeacher');
                if (hrTeacherInput && savedHrTeacher) {
                    hrTeacherInput.value = savedHrTeacher;
                }
                if (hrTeacherInput) {
                    hrTeacherInput.addEventListener('input', () => {
                        localStorage.setItem('debateHrTeacher', hrTeacherInput.value);
                    });
                }
            }

            addTeamPair();
            wireStaleListeners();
            if (!useBridge) {
                tryResumeSession();
            }
        }


        // ========================================
        // SECTION REFRESH & STALE RESULTS
        // ========================================
        function syncTeamPairsFromDom() {
            if (!teamPairs.length) return;
            teamPairs = getTeamPairsFromInputs();
        }

        function markResultsStale() {
            if (!debates.length) return;
            resultsStale = true;
            updateStaleBanner();
        }

        function clearResultsStale() {
            resultsStale = false;
            updateStaleBanner();
        }

        function updateStaleBanner() {
            const banner = document.getElementById('stale-results-banner');
            if (!banner) return;
            banner.classList.toggle('hidden', !resultsStale || !debates.length);
        }

        function updatePrintHeaders() {
            const classTitle = document.getElementById('class-title')?.value.trim() || '';
            const formatName = getCurrentFormat().name;
            const titleText = classTitle || 'Debate Team Assignments';
            const dateText = new Date().toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
            set('print-title', titleText);
            set('print-date', dateText);
            set('print-header-title', titleText);
            set('print-header-date', dateText + ' | Format: ' + formatName);
            set('running-title', titleText);
            set('running-date', dateText + ' | ' + formatName);
            document.querySelectorAll('.debate-card').forEach(card => {
                card.setAttribute('data-class-title', titleText);
            });
        }

        function refreshSetupSections() {
            updateStudentList();
            if (currentMode === 'teams') {
                syncTeamPairsFromDom();
                renderTeamPairs();
            }
            onFormatChange();
        }

        function refreshResultsSection(options) {
            options = options || {};
            if (!debates.length) {
                document.getElementById('results-section')?.classList.add('hidden');
                updateStickyBar();
                notifyResultsVisibility();
                return;
            }
            displayResults(options);
        }

        function updateSetupDetailsState() {
            const details = document.getElementById('setup-details');
            if (details && debates.length > 0) details.open = false;
        }

        function updateStickyBar() {
            const bar = document.getElementById('results-sticky-bar');
            const visible = debates.length > 0 &&
                !document.getElementById('results-section')?.classList.contains('hidden');
            if (bar) bar.classList.toggle('hidden', !visible);
            const debatePanel = document.querySelector('.classroom-debate-panel');
            if (debatePanel) {
                debatePanel.classList.toggle('classroom-debate-has-sticky-bar', visible);
            } else {
                document.body.classList.toggle('has-sticky-bar', visible);
            }
        }

        function scrollToSetup() {
            const details = document.getElementById('setup-details');
            if (details) {
                details.open = true;
                details.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

        function hasDebateUiEdits() {
            const extras = collectDebateUiExtras();
            return Object.keys(extras).some(function (k) {
                const e = extras[k];
                if (e.notes && e.notes.trim()) return true;
                if (!e.argumentsByMember) return false;
                return Object.keys(e.argumentsByMember).some(function (n) {
                    const a = e.argumentsByMember[n];
                    return (a.present && a.present.trim()) || (a.rebut && a.rebut.trim());
                });
            });
        }

        function clearAssignments() {
            if (debates.length && !confirm('Clear all debate assignments? Your student list and settings will stay.')) return;
            debates = [];
            clearResultsStale();
            document.getElementById('results-section')?.classList.add('hidden');
            updateStickyBar();
            notifyResultsVisibility();
            saveSession();
            const details = document.getElementById('setup-details');
            if (details) details.open = true;
        }

        function regenerateDebates() {
            if (!debates.length) {
                generateDebates();
                return;
            }
            if (hasDebateUiEdits()) {
                if (!confirm(
                    'Regenerate will create new random teams and reset role history.\n\n' +
                    'Notes and argument fields you entered may be lost. Export a backup first if you need to keep them.\n\n' +
                    'Click OK to regenerate, or Cancel to keep current assignments.'
                )) return;
            }
            generateDebates();
        }

        function saveSession() {
            try {
                if (usingClassManagerBridge()) {
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

        function tryResumeSession() {
            if (usingClassManagerBridge()) return;
            if (students.length > 0 || debates.length > 0) return;
            try {
                const raw = localStorage.getItem(DEBATE_SESSION_KEY);
                if (!raw) return;
                const data = JSON.parse(raw);
                if (!data.debates || !data.debates.length) return;
                if (!confirm('Resume your last debate session from this browser?')) return;
                importStateFromJson(data, { silent: true });
            } catch (e) {}
        }

        function wireStaleListeners() {
            const mark = function () { markResultsStale(); };
            document.getElementById('debate-format')?.addEventListener('change', mark);
            document.getElementById('include-reply')?.addEventListener('change', mark);
            document.getElementById('limit-team-size')?.addEventListener('change', mark);
            document.getElementById('max-team-size')?.addEventListener('input', mark);
            document.getElementById('teams-randomize-sides')?.addEventListener('change', mark);
            document.getElementById('class-title')?.addEventListener('input', function () {
                if (debates.length) updatePrintHeaders();
            });
            document.getElementById('hr-teacher')?.addEventListener('input', function () {
                if (debates.length) updatePrintHeaders();
            });
            const pc = document.getElementById('team-pairs-container');
            if (pc) {
                pc.addEventListener('input', function (e) {
                    if (e.target.matches('textarea, input[type="text"]')) markResultsStale();
                });
            }
        }


        // ========================================
        // MODE SWITCHING
        // ========================================
        function setMode(mode) {
            currentMode = mode;
            
            // Update button states
            document.getElementById('mode-random').classList.toggle('active', mode === 'random');
            document.getElementById('mode-teams').classList.toggle('active', mode === 'teams');
            
            // Show/hide sections
            document.getElementById('random-mode-section').classList.toggle('hidden', mode !== 'random');
            document.getElementById('teams-mode-section').classList.toggle('hidden', mode !== 'teams');
            
            // Update generate button text
            const generateSection = document.querySelector('.section:has(#class-title)');
            if (generateSection) {
                const h2 = generateSection.querySelector('h2');
                if (mode === 'teams') {
                    h2.textContent = 'Randomize Sides & Generate';
                } else {
                    h2.textContent = 'Generate Teams';
                }
            }
            markResultsStale();
        }

        // ========================================
        // PRE-MADE TEAMS FUNCTIONS
        // ========================================
        function addTeamPair() {
            syncTeamPairsFromDom();
            const pairId = Date.now();
            teamPairs.push({
                id: pairId,
                teamA: { name: '', members: [] },
                teamB: { name: '', members: [] }
            });
            
            renderTeamPairs();
        }

        function removeTeamPair(pairId) {
            syncTeamPairsFromDom();
            if (teamPairs.length <= 1) {
                alert('You need at least one debate!');
                return;
            }
            teamPairs = teamPairs.filter(p => p.id !== pairId);
            renderTeamPairs();
        }

        function clearAllTeamPairs() {
            syncTeamPairsFromDom();
            if (confirm('Are you sure you want to clear all team pairs?')) {
                teamPairs = [];
                addTeamPair();
            }
        }

        function renderTeamPairs() {
            syncTeamPairsFromDom();
            const container = document.getElementById('team-pairs-container');
            container.innerHTML = '';
            
            teamPairs.forEach((pair, index) => {
                const pairDiv = document.createElement('div');
                pairDiv.className = 'team-pair';
                pairDiv.innerHTML = `
                    <div class="team-pair-header">
                        <h3>${escapeHtml(debateT('classroomDebateDebateN', { n: index + 1 }))}</h3>
                        <button type="button" onclick="removeTeamPair(${pair.id})" class="${BTN.danger}">${escapeHtml(debateT('classroomDebateRemove'))}</button>
                    </div>
                    <div class="team-pair-inputs">
                        <div class="team-input-box team-a">
                            <h4>${escapeHtml(debateT('classroomDebateTeamA'))}</h4>
                            <input type="text" class="field-input" id="team-a-name-${pair.id}" placeholder="Team name (optional)" value="${pair.teamA.name}">
                            <textarea class="field-control" id="team-a-members-${pair.id}" placeholder="Enter team members (one per line)&#10;Alice&#10;Bob&#10;Charlie">${pair.teamA.members.join('\n')}</textarea>
                            <div class="manual-entry">
                                <input type="text" class="field-input" id="team-a-manual-${pair.id}" placeholder="Or add one member at a time" onkeypress="if(event.key === 'Enter') { event.preventDefault(); addTeamMemberManual(${pair.id}, 'a'); }">
                                <button type="button" onclick="addTeamMemberManual(${pair.id}, 'a')" class="${BTN.primary}">${escapeHtml(debateT('classroomDebateAdd'))}</button>
                            </div>
                        </div>
                        <div class="team-input-box team-b">
                            <h4>${escapeHtml(debateT('classroomDebateTeamB'))}</h4>
                            <input type="text" class="field-input" id="team-b-name-${pair.id}" placeholder="Team name (optional)" value="${pair.teamB.name}">
                            <textarea class="field-control" id="team-b-members-${pair.id}" placeholder="Enter team members (one per line)&#10;Diana&#10;Eve&#10;Frank">${pair.teamB.members.join('\n')}</textarea>
                            <div class="manual-entry">
                                <input type="text" class="field-input" id="team-b-manual-${pair.id}" placeholder="Or add one member at a time" onkeypress="if(event.key === 'Enter') { event.preventDefault(); addTeamMemberManual(${pair.id}, 'b'); }">
                                <button type="button" onclick="addTeamMemberManual(${pair.id}, 'b')" class="${BTN.primary}">${escapeHtml(debateT('classroomDebateAdd'))}</button>
                            </div>
                        </div>
                    </div>
                    <div class="randomize-indicator teams-side-hint section-hint">
                        <span class="teams-side-hint-text">${escapeHtml(debateT('classroomDebateSidesHint'))}</span>
                    </div>
                `;
                container.appendChild(pairDiv);
            });
        }

        function addTeamMemberManual(pairId, side) {
            const isA = side === 'a';
            const input = document.getElementById(isA ? `team-a-manual-${pairId}` : `team-b-manual-${pairId}`);
            const textarea = document.getElementById(isA ? `team-a-members-${pairId}` : `team-b-members-${pairId}`);
            if (!input || !textarea) return;
            const name = input.value.trim();
            if (!name) return;
            const existing = textarea.value.trim();
            textarea.value = existing ? existing + '\n' + name : name;
            input.value = '';
            input.focus();
        }

        function getTeamPairsFromInputs() {
            return teamPairs.map(pair => {
                const teamAName = document.getElementById(`team-a-name-${pair.id}`)?.value.trim() || '';
                const teamBName = document.getElementById(`team-b-name-${pair.id}`)?.value.trim() || '';
                const teamAMembers = (document.getElementById(`team-a-members-${pair.id}`)?.value || '')
                    .split('\n')
                    .map(m => m.trim())
                    .filter(m => m.length > 0);
                const teamBMembers = (document.getElementById(`team-b-members-${pair.id}`)?.value || '')
                    .split('\n')
                    .map(m => m.trim())
                    .filter(m => m.length > 0);
                
                return {
                    id: pair.id,
                    teamA: { name: teamAName, members: teamAMembers },
                    teamB: { name: teamBName, members: teamBMembers }
                };
            });
        }

        function generateFromTeamPairs() {
            syncTeamPairsFromDom();
            const format = getCurrentFormat();
            const pairs = getTeamPairsFromInputs();
            
            // Validate
            const validPairs = pairs.filter(p => p.teamA.members.length > 0 && p.teamB.members.length > 0);
            
            if (validPairs.length === 0) {
                alert('Please add members to both teams in at least one debate.');
                return;
            }

            debates = [];
            let debateNumber = 1;

            const randomizeSidesEl = document.getElementById('teams-randomize-sides');
            const randomizeSides = randomizeSidesEl ? randomizeSidesEl.checked : true;

            validPairs.forEach(pair => {
                let propTeam, oppTeam;
                if (randomizeSides) {
                    const coinFlip = Math.random() < 0.5;
                    if (coinFlip) {
                        propTeam = pair.teamA;
                        oppTeam = pair.teamB;
                    } else {
                        propTeam = pair.teamB;
                        oppTeam = pair.teamA;
                    }
                } else {
                    propTeam = pair.teamA;
                    oppTeam = pair.teamB;
                }

                // Assign roles
                const proposition = assignRolesToTeam(propTeam.members, format.govRoles);
                const opposition = assignRolesToTeam(oppTeam.members, format.oppRoles);

                debates.push({
                    number: debateNumber++,
                    format: format,
                    proposition: proposition,
                    opposition: opposition,
                    propTeamName: propTeam.name,
                    oppTeamName: oppTeam.name
                });
            });

            displayResults();
            clearResultsStale();
            saveSession();
        }

        // ========================================
        // FORMAT SELECTION HANDLING
        // ========================================
        function onFormatChange() {
            const formatSelect = document.getElementById('debate-format');
            const selectedFormat = formatSelect.value;
            const customBuilder = document.getElementById('custom-format-builder');
            const formatInfo = document.getElementById('format-info');
            const maxTeamSizeInput = document.getElementById('max-team-size');

            // Show/hide custom builder
            if (selectedFormat === 'custom') {
                customBuilder.classList.remove('hidden');
            } else {
                customBuilder.classList.add('hidden');
            }

            // Update format info display
            const format = debateFormats[selectedFormat];
            
            // Update max team size suggestion based on format
            if (format.isFourTeam) {
                maxTeamSizeInput.value = 2;
            } else if (format.isOneVsOne) {
                maxTeamSizeInput.value = 1;
            } else {
                maxTeamSizeInput.value = Math.max(format.govRoles.length, format.oppRoles.length) || 3;
            }

            formatInfo.innerHTML = generateFormatInfoHTML(format);
            markResultsStale();
        }

        function generateFormatInfoHTML(format) {
            let html = `<h3>${format.name}</h3>`;
            html += `<div class="format-details">`;
            html += `<div class="detail-item"><div class="detail-label">Teams</div><div class="detail-value">${format.teams} ${format.isFourTeam ? '(4-team format)' : format.isOneVsOne ? '(1v1)' : ''}</div></div>`;
            html += `<div class="detail-item"><div class="detail-label">Min Students</div><div class="detail-value">${format.minStudents}</div></div>`;
            html += `<div class="detail-item"><div class="detail-label">Ideal Students</div><div class="detail-value">${format.idealStudents}</div></div>`;
            if (format.notes) {
                html += `<div class="detail-item detail-item--full"><div class="detail-label">Notes</div><div class="detail-value">${format.notes}</div></div>`;
            }
            html += `</div>`;

            // Roles preview
            if (format.isFourTeam) {
                html += `<div class="roles-preview"><h4>Speaker Order: ${format.speakerOrder.join(' → ')}</h4>`;
                html += `<div class="roles-preview-grid">`;
                format.teamStructure.forEach(team => {
                    const roles = format.roles[team.id];
                    html += `<div class="roles-column ${team.id.includes('g') ? 'gov' : 'opp'}">`;
                    html += `<h5>${team.icon} ${team.name}</h5><ul>`;
                    roles.forEach(r => {
                        html += `<li><span class="role-abbr">${r.abbr}</span> - ${r.name}</li>`;
                    });
                    html += `</ul></div>`;
                });
                html += `</div></div>`;
            } else if (format.govRoles.length > 0 || format.oppRoles.length > 0) {
                html += `<div class="roles-preview"><h4>Speaker Order: ${format.speakerOrder.join(' → ')}</h4>`;
                html += `<div class="roles-grid">`;
                html += `<div class="roles-column gov"><h5>${format.govIcon} ${format.govName} Roles</h5><ul>`;
                format.govRoles.forEach(r => {
                    html += `<li><span class="role-abbr">${r.abbr}</span> - ${r.name}</li>`;
                });
                html += `</ul></div>`;
                html += `<div class="roles-column opp"><h5>${format.oppIcon} ${format.oppName} Roles</h5><ul>`;
                format.oppRoles.forEach(r => {
                    html += `<li><span class="role-abbr">${r.abbr}</span> - ${r.name}</li>`;
                });
                html += `</ul></div>`;
                html += `</div></div>`;
            }

            return html;
        }

        // ========================================
        // CUSTOM FORMAT BUILDER
        // ========================================
        function addCustomRole(side) {
            const input = document.getElementById(`custom-${side}-role`);
            const roleName = input.value.trim();
            
            if (!roleName) return;

            if (side === 'gov') {
                customGovRoles.push({ abbr: roleName.substring(0, 3).toUpperCase(), name: roleName });
            } else {
                customOppRoles.push({ abbr: roleName.substring(0, 3).toUpperCase(), name: roleName });
            }

            input.value = '';
            updateCustomRolesDisplay();
        }

        function removeCustomRole(side, index) {
            if (side === 'gov') {
                customGovRoles.splice(index, 1);
            } else {
                customOppRoles.splice(index, 1);
            }
            updateCustomRolesDisplay();
        }

        function updateCustomRolesDisplay() {
            const govContainer = document.getElementById('custom-gov-roles');
            const oppContainer = document.getElementById('custom-opp-roles');

            govContainer.innerHTML = customGovRoles.map((r, i) =>
                `<div class="role-tag role-tag--gov"><span>${escapeHtml(r.name)}</span><button type="button" class="remove-role" onclick="removeCustomRole('gov', ${i})">×</button></div>`
            ).join('');

            oppContainer.innerHTML = customOppRoles.map((r, i) => 
                `<div class="role-tag role-tag--opp"><span>${escapeHtml(r.name)}</span><button type="button" class="remove-role" onclick="removeCustomRole('opp', ${i})">×</button></div>`
            ).join('');
        }

        function saveCustomFormat() {
            const formatName = document.getElementById('custom-format-name').value.trim() || 'My Custom Format';
            const govName = document.getElementById('custom-gov-name').value.trim() || 'Government';
            const oppName = document.getElementById('custom-opp-name').value.trim() || 'Opposition';

            if (customGovRoles.length === 0 && customOppRoles.length === 0) {
                alert('Please add at least one role before saving.');
                return;
            }

            const customFormat = {
                id: 'custom_' + Date.now(),
                name: formatName,
                govName: govName,
                oppName: oppName,
                govRoles: [...customGovRoles],
                oppRoles: [...customOppRoles]
            };

            savedCustomFormats.push(customFormat);
            persistCustomFormats();
            
            alert(`Custom format "${formatName}" saved!`);
            loadSavedFormats();
        }

        function persistCustomFormats() {
            if (global.CCPDebateSessionBridge && typeof global.CCPDebateSessionBridge.saveCustomFormats === 'function') {
                global.CCPDebateSessionBridge.saveCustomFormats(savedCustomFormats);
            } else {
                localStorage.setItem('customDebateFormats', JSON.stringify(savedCustomFormats));
            }
        }

        function loadSavedFormats() {
            const container = document.getElementById('saved-formats-list');
            
            if (savedCustomFormats.length === 0) {
                container.innerHTML = '<p class="section-hint">' + escapeHtml(debateT('classroomDebateNoSavedFormats')) + '</p>';
                container.classList.remove('hidden');
                return;
            }

            let html = '<h4 class="form-section-title">' + escapeHtml(debateT('classroomDebateSavedFormatsTitle')) + '</h4>';
            savedCustomFormats.forEach((format, index) => {
                html += `
                    <div class="saved-format-row">
                        <div>
                            <strong>${escapeHtml(format.name)}</strong>
                            <span class="section-hint saved-format-meta"> (${format.govRoles.length} gov, ${format.oppRoles.length} opp roles)</span>
                        </div>
                        <div class="classroom-debate-actions saved-format-actions">
                            <button type="button" onclick="applySavedFormat(${index})" class="${BTN.primary}">${escapeHtml(debateT('classroomDebateUseFormat'))}</button>
                            <button type="button" onclick="deleteSavedFormat(${index})" class="${BTN.danger}">${escapeHtml(debateT('classroomDebateDeleteFormat'))}</button>
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
            container.classList.remove('hidden');
        }

        function applySavedFormat(index) {
            const format = savedCustomFormats[index];
            customGovRoles = [...format.govRoles];
            customOppRoles = [...format.oppRoles];
            document.getElementById('custom-format-name').value = format.name;
            document.getElementById('custom-gov-name').value = format.govName;
            document.getElementById('custom-opp-name').value = format.oppName;
            updateCustomRolesDisplay();
            alert(`Loaded "${format.name}" format!`);
        }

        function deleteSavedFormat(index) {
            if (confirm(`Delete "${savedCustomFormats[index].name}"?`)) {
                savedCustomFormats.splice(index, 1);
                persistCustomFormats();
                loadSavedFormats();
            }
        }

        // ========================================
        // STUDENT MANAGEMENT
        // ========================================
        function addStudent() {
            const input = document.getElementById('manual-student');
            const name = input.value.trim();
            
            if (name && !students.includes(name)) {
                students.push(name);
                input.value = '';
                updateStudentList();
                saveStudents();
                markResultsStale();
            } else if (students.includes(name)) {
                alert('This student is already in the list!');
            }
        }

        function addStudentsFromPaste() {
            const textarea = document.getElementById('paste-students');
            const names = textarea.value
                .split('\n')
                .map(name => name.trim())
                .filter(name => name.length > 0);
            
            let added = 0;
            names.forEach(name => {
                if (!students.includes(name)) {
                    students.push(name);
                    added++;
                }
            });
            
            if (added > 0) {
                textarea.value = '';
                updateStudentList();
                saveStudents();
                markResultsStale();
                alert(`Added ${added} student(s)!`);
            } else {
                alert('No new students to add. All names are already in the list.');
            }
        }

        function removeStudent(name) {
            students = students.filter(s => s !== name);
            updateStudentList();
            saveStudents();
            markResultsStale();
        }

        function clearAllStudents() {
            if (confirm('Are you sure you want to clear all students?')) {
                students = [];
                updateStudentList();
                saveStudents();
                markResultsStale();
            }
        }

        function updateStudentList() {
            const container = document.getElementById('student-list');
            if (!container) {
                return;
            }
            container.innerHTML = '';
            
            if (students.length === 0) {
                container.innerHTML = '<div class="empty-state section-hint">' + escapeHtml(debateT('classroomDebateNoStudents')) + '</div>';
                return;
            }
            
            students.forEach(name => {
                const tag = document.createElement('div');
                tag.className = 'student-tag';
                tag.innerHTML = `
                    <span>${escapeHtml(name)}</span>
                    <button type="button" class="remove-btn btn btn-outline btn-compact" onclick="removeStudent('${escapeHtml(name)}')" title="Remove">×</button>
                `;
                container.appendChild(tag);
            });
        }

        function saveStudents() {
            if (!(global.CCPDebateSessionBridge && global.CCPDebateSessionBridge.onRosterChange)) {
                localStorage.setItem('debateStudents', JSON.stringify(students));
            } else {
                global.CCPDebateSessionBridge.onRosterChange(students.slice());
            }
        }

        function importStudentsFromNames(names, options) {
            options = options || {};
            const mode = options.mode === 'merge' ? 'merge' : 'replace';
            const list = (Array.isArray(names) ? names : [])
                .map((name) => String(name || '').trim())
                .filter(Boolean);
            if (mode === 'merge') {
                let added = 0;
                list.forEach((name) => {
                    if (!students.includes(name)) {
                        students.push(name);
                        added++;
                    }
                });
                if (added > 0) {
                    updateStudentList();
                    saveStudents();
                    if (debates.length) {
                        markResultsStale();
                    }
                }
                return { count: students.length, added, mode: 'merge' };
            }
            const changed = list.length !== students.length || list.some((name, idx) => students[idx] !== name);
            students = list.slice();
            updateStudentList();
            saveStudents();
            if (changed && debates.length) {
                markResultsStale();
            }
            return { count: students.length, added: students.length, mode: 'replace', changed };
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // ========================================
        // DEBATE GENERATION
        // ========================================
        function getCurrentFormat() {
            const formatId = document.getElementById('debate-format').value;
            let format = { ...debateFormats[formatId] };

            // If custom format, use the custom roles
            if (formatId === 'custom') {
                const govName = document.getElementById('custom-gov-name').value.trim() || 'Government';
                const oppName = document.getElementById('custom-opp-name').value.trim() || 'Opposition';
                format.govName = govName;
                format.oppName = oppName;
                format.govRoles = [...customGovRoles];
                format.oppRoles = [...customOppRoles];
            }

            // Add reply speeches if enabled (for AP format)
            const includeReply = document.getElementById('include-reply').checked;
            if (includeReply && format.replyRoles) {
                format.govRoles = [...format.govRoles, { ...format.replyRoles.gov, isReply: true }];
                format.oppRoles = [...format.oppRoles, { ...format.replyRoles.opp, isReply: true }];
            }

            return format;
        }

        function assignRolesToTeam(members, roles) {
            const assigned = [];
            members.forEach((member, index) => {
                const role = roles[index] || null;
                assigned.push({
                    name: member,
                    role: role
                });
            });
            return assigned;
        }

        // Assign students to teams and roles based on speaker order (2-team format)
        function assignTeamsAndRolesBySpeakerOrder(students, format) {
            const speakerOrder = format.speakerOrder || [];
            const proposition = [];
            const opposition = [];
            
            // Create maps to find which team and role index each speaker position belongs to
            let govRoleIndex = 0;
            let oppRoleIndex = 0;
            
            students.forEach((student, studentIndex) => {
                // If we have a speaker order, use it to determine team assignment
                if (speakerOrder.length > 0 && studentIndex < speakerOrder.length) {
                    const roleAbbr = speakerOrder[studentIndex].replace('*', ''); // Remove reply marker
                    
                    // Find which team this role belongs to
                    const govRole = format.govRoles.find(r => r.abbr === roleAbbr);
                    const oppRole = format.oppRoles.find(r => r.abbr === roleAbbr);
                    
                    if (govRole) {
                        // This role belongs to Government/Proposition
                        proposition.push({
                            name: student,
                            role: govRole
                        });
                    } else if (oppRole) {
                        // This role belongs to Opposition
                        opposition.push({
                            name: student,
                            role: oppRole
                        });
                    } else {
                        // Role not found in speaker order, assign based on position
                        // Alternate: even positions go to Proposition, odd to Opposition
                        if (studentIndex % 2 === 0) {
                            const role = format.govRoles[govRoleIndex] || null;
                            proposition.push({
                                name: student,
                                role: role
                            });
                            govRoleIndex++;
                        } else {
                            const role = format.oppRoles[oppRoleIndex] || null;
                            opposition.push({
                                name: student,
                                role: role
                            });
                            oppRoleIndex++;
                        }
                    }
                } else {
                    // No speaker order or more students than speaker order positions
                    // Alternate assignment: even positions go to Proposition, odd to Opposition
                    if (studentIndex % 2 === 0) {
                        const role = format.govRoles[govRoleIndex] || null;
                        proposition.push({
                            name: student,
                            role: role
                        });
                        govRoleIndex++;
                    } else {
                        const role = format.oppRoles[oppRoleIndex] || null;
                        opposition.push({
                            name: student,
                            role: role
                        });
                        oppRoleIndex++;
                    }
                }
            });
            
            return { proposition, opposition };
        }

        function speakingOrderRankForMember(member, rankByAbbr) {
            if (!member.role) return 10000;
            if (!rankByAbbr || rankByAbbr.size === 0) return 10001;
            const r = rankByAbbr.get(member.role.abbr);
            return r !== undefined ? r : 9999;
        }

        function buildTwoTeamSpeakingRankMap(format) {
            const order = format.speakerOrder || [];
            let slots = order.length > 0 ? order : buildSyntheticInterleavedSpeakerOrder(format);
            const map = new Map();
            slots.forEach((token, i) => {
                const abbr = String(token).replace(/\*$/, '').trim();
                if (!abbr || map.has(abbr)) return;
                map.set(abbr, i);
            });
            return map;
        }

        function buildSyntheticInterleavedSpeakerOrder(format) {
            const g = format.govRoles || [];
            const o = format.oppRoles || [];
            const out = [];
            const max = Math.max(g.length, o.length);
            for (let i = 0; i < max; i++) {
                if (g[i]) out.push(g[i].abbr);
                if (o[i]) out.push(o[i].abbr);
            }
            return out;
        }

        /** Keeps proposition / opposition / four-team benches ordered like format speaking order (after role edits). */
        function sortDebateBySpeakingOrder(debate) {
            if (!debate || !debate.format) return;

            if (debate.isFourTeam && debate.teams) {
                const fmt = debate.format;
                const order = fmt.speakerOrder || [];
                const rankByAbbr = new Map();
                if (order.length > 0) {
                    order.forEach((token, i) => {
                        const abbr = String(token).replace(/\*$/, '').trim();
                        if (abbr && !rankByAbbr.has(abbr)) rankByAbbr.set(abbr, i);
                    });
                }

                ['og', 'oo', 'cg', 'co'].forEach(teamId => {
                    const list = debate.teams[teamId];
                    if (!list || list.length === 0) return;

                    if (rankByAbbr.size > 0) {
                        list.sort((a, b) => {
                            const d = speakingOrderRankForMember(a, rankByAbbr) - speakingOrderRankForMember(b, rankByAbbr);
                            if (d !== 0) return d;
                            return (a.name || '').localeCompare(b.name || '');
                        });
                    } else {
                        const teamRoles = fmt.roles[teamId] || [];
                        list.sort((a, b) => {
                            const ra = getRoleIndexInTeamRolesForSort(a.role, teamRoles);
                            const rb = getRoleIndexInTeamRolesForSort(b.role, teamRoles);
                            if (ra !== rb) return ra - rb;
                            return (a.name || '').localeCompare(b.name || '');
                        });
                    }
                });
                return;
            }

            if (!debate.proposition || !debate.opposition) return;

            const rankByAbbr = buildTwoTeamSpeakingRankMap(debate.format);

            const cmp = (a, b) => {
                const d = speakingOrderRankForMember(a, rankByAbbr) - speakingOrderRankForMember(b, rankByAbbr);
                if (d !== 0) return d;
                return (a.name || '').localeCompare(b.name || '');
            };

            debate.proposition.sort(cmp);
            debate.opposition.sort(cmp);
        }

        function getRoleIndexInTeamRolesForSort(role, teamRoles) {
            if (!role || !teamRoles || teamRoles.length === 0) return 10000;
            const idx = teamRoles.findIndex(r => r.abbr === role.abbr);
            return idx >= 0 ? idx : 9999;
        }

        // Assign students to teams and roles based on speaker order (4-team format)
        function assignFourTeamsAndRolesBySpeakerOrder(students, format) {
            const speakerOrder = format.speakerOrder || [];
            const teams = {
                og: [],
                oo: [],
                cg: [],
                co: []
            };
            
            // Track role indices for each team
            const roleIndices = {
                og: 0,
                oo: 0,
                cg: 0,
                co: 0
            };
            
            students.forEach((student, studentIndex) => {
                // If we have a speaker order, use it to determine team assignment
                if (speakerOrder.length > 0 && studentIndex < speakerOrder.length) {
                    const roleAbbr = speakerOrder[studentIndex].replace('*', ''); // Remove reply marker
                    
                    // Find which team this role belongs to by checking all team roles
                    let assigned = false;
                    for (const teamId of ['og', 'oo', 'cg', 'co']) {
                        const teamRoles = format.roles[teamId] || [];
                        const role = teamRoles.find(r => r.abbr === roleAbbr);
                        if (role) {
                            teams[teamId].push({
                                name: student,
                                role: role
                            });
                            assigned = true;
                            break;
                        }
                    }
                    
                    // If role not found, assign based on position in speaker order
                    if (!assigned) {
                        // For BP/WUDC: positions 0,2 → OG; 1,3 → OO; 4,6 → CG; 5,7 → CO
                        if (studentIndex % 4 === 0 || studentIndex % 4 === 2) {
                            // OG or CG
                            const teamId = studentIndex < 4 ? 'og' : 'cg';
                            const role = format.roles[teamId][roleIndices[teamId]] || null;
                            teams[teamId].push({
                                name: student,
                                role: role
                            });
                            roleIndices[teamId]++;
                        } else {
                            // OO or CO
                            const teamId = studentIndex < 4 ? 'oo' : 'co';
                            const role = format.roles[teamId][roleIndices[teamId]] || null;
                            teams[teamId].push({
                                name: student,
                                role: role
                            });
                            roleIndices[teamId]++;
                        }
                    }
                } else {
                    // No speaker order or more students than speaker order positions
                    // Assign in round-robin: OG, OO, CG, CO
                    const teamIds = ['og', 'oo', 'cg', 'co'];
                    const teamId = teamIds[studentIndex % 4];
                    const role = format.roles[teamId][roleIndices[teamId]] || null;
                    teams[teamId].push({
                        name: student,
                        role: role
                    });
                    roleIndices[teamId]++;
                }
            });
            
            return teams;
        }

        function generateDebates() {
            // Check which mode we're in
            if (currentMode === 'teams') {
                generateFromTeamPairs();
                return;
            }

            // Random mode - original logic
            const format = getCurrentFormat();
            
            if (students.length < format.minStudents) {
                alert(`Please add at least ${format.minStudents} students for ${format.name} format.`);
                return;
            }

            // Check if max team size limit is enabled
            const limitEnabled = document.getElementById('limit-team-size').checked;
            const maxTeamSizeInput = document.getElementById('max-team-size');
            let maxTeamSize;
            
            if (limitEnabled) {
                maxTeamSize = parseInt(maxTeamSizeInput.value, 10);
                if (isNaN(maxTeamSize) || maxTeamSize < 1) {
                    alert('Maximum team size must be at least 1.');
                    return;
                }
            } else {
                maxTeamSize = 9999;
            }

            // Reset role history for fresh generation
            roleHistory = {};
            
            // Shuffle students
            let shuffledStudents = [...students].sort(() => Math.random() - 0.5);
            debates = [];
            
            if (format.isFourTeam) {
                generateFourTeamDebates(shuffledStudents, format, maxTeamSize);
            } else {
                generateTwoTeamDebates(shuffledStudents, format, maxTeamSize);
            }
            
            displayResults();
            clearResultsStale();
            saveSession();
        }

function generateTwoTeamDebates(shuffledStudents, format, maxTeamSize) {
            const totalStudents = shuffledStudents.length;
            
            // Goal: Create debates with EVEN teams (2v2, 3v3, etc.)
            // Priority: Even teams within each debate > number of debates
            
            // Max students per debate based on team size limit
            const maxStudentsPerDebate = maxTeamSize * 2;
            
            // Calculate minimum debates needed to respect max team size
            let numDebates = Math.ceil(totalStudents / maxStudentsPerDebate);
            if (numDebates === 0) numDebates = 1;
            
            // Distribute students across debates, prioritizing EVEN numbers per debate
            let debateSizes = distributeForEvenTeams(totalStudents, numDebates, maxStudentsPerDebate);
            
            // Sort: larger debates first
            debateSizes.sort((a, b) => b - a);

            let debateNumber = 1;
            let studentIndex = 0;
            const assignedStudents = new Set(); // Track which students have been assigned
            
            for (let d = 0; d < debateSizes.length; d++) {
                const studentsForThisDebate = debateSizes[d];
                if (studentsForThisDebate < 2) continue;
                
                const debateStudents = shuffledStudents.slice(studentIndex, studentIndex + studentsForThisDebate);
                studentIndex += studentsForThisDebate;
                
                if (debateStudents.length === 0) continue;

                // Assign teams and roles based on speaker order
                const { proposition, opposition } = assignTeamsAndRolesBySpeakerOrder(debateStudents, format);
                
                // If one team is empty, try to redistribute students
                if (proposition.length === 0 || opposition.length === 0) {
                    // Redistribute: split students evenly
                    const half = Math.ceil(debateStudents.length / 2);
                    const propStudents = debateStudents.slice(0, half);
                    const oppStudents = debateStudents.slice(half);
                    
                    // Assign roles
                    const propWithRoles = propStudents.map((student, idx) => ({
                        name: student,
                        role: format.govRoles[idx] || null
                    }));
                    const oppWithRoles = oppStudents.map((student, idx) => ({
                        name: student,
                        role: format.oppRoles[idx] || null
                    }));
                    
                    if (propWithRoles.length > 0 && oppWithRoles.length > 0) {
                        debates.push({
                            number: debateNumber++,
                            format: format,
                            proposition: propWithRoles,
                            opposition: oppWithRoles
                        });
                        
                        // Mark students as assigned
                        debateStudents.forEach(s => assignedStudents.add(s));
                    }
                    continue;
                }
                
                debates.push({
                    number: debateNumber++,
                    format: format,
                    proposition: proposition,
                    opposition: opposition
                });
                
                // Mark students as assigned
                debateStudents.forEach(s => assignedStudents.add(s));
            }
            
            // Handle any remaining unassigned students
            const unassignedStudents = shuffledStudents.filter(s => !assignedStudents.has(s));
            
            if (unassignedStudents.length > 0) {
                // Try to add remaining students to existing debates
                let remaining = [...unassignedStudents];
                
                // First, try to add pairs to existing debates
                while (remaining.length >= 2) {
                    let added = false;
                    for (let debate of debates) {
                        const currentPropSize = debate.proposition.length;
                        const currentOppSize = debate.opposition.length;
                        const totalInDebate = currentPropSize + currentOppSize;
                        
                        // Check if we can add 2 more students (1 to each team) without exceeding max
                        if (totalInDebate + 2 <= maxStudentsPerDebate) {
                            // Add one to each team
                            const propRole = format.govRoles[currentPropSize] || null;
                            const oppRole = format.oppRoles[currentOppSize] || null;
                            
                            debate.proposition.push({
                                name: remaining[0],
                                role: propRole
                            });
                            debate.opposition.push({
                                name: remaining[1],
                                role: oppRole
                            });
                            
                            remaining.splice(0, 2);
                            added = true;
                            break;
                        }
                    }
                    
                    // If couldn't add to existing debates, create a new debate
                    if (!added && remaining.length >= 2) {
                        const debateStudents = remaining.splice(0, 2);
                        const { proposition, opposition } = assignTeamsAndRolesBySpeakerOrder(debateStudents, format);
                        
                        if (proposition.length > 0 && opposition.length > 0) {
                            debates.push({
                                number: debateNumber++,
                                format: format,
                                proposition: proposition,
                                opposition: opposition
                            });
                        }
                    } else if (!added) {
                        break; // Can't add pairs, will handle single student below
                    }
                }
                
                // Handle single remaining student
                if (remaining.length === 1) {
                    // Add to the smallest team in the smallest debate
                    if (debates.length > 0) {
                        // Find debate with smallest total size
                        const smallestDebate = debates.reduce((smallest, current) => {
                            const smallestSize = smallest.proposition.length + smallest.opposition.length;
                            const currentSize = current.proposition.length + current.opposition.length;
                            return currentSize < smallestSize ? current : smallest;
                        });
                        
                        // Add to the smaller team
                        if (smallestDebate.proposition.length <= smallestDebate.opposition.length) {
                            const role = format.govRoles[smallestDebate.proposition.length] || null;
                            smallestDebate.proposition.push({
                                name: remaining[0],
                                role: role
                            });
                        } else {
                            const role = format.oppRoles[smallestDebate.opposition.length] || null;
                            smallestDebate.opposition.push({
                                name: remaining[0],
                                role: role
                            });
                        }
                    } else {
                        // No debates exist, create a minimal debate (will need at least 2 students)
                        // This shouldn't happen, but handle it anyway
                        const singleStudent = remaining[0];
                        // Can't create a debate with 1 student, so we'll add them to a placeholder
                        // Actually, if we have only 1 student total, we can't create a debate
                        // But the minStudents check should prevent this
                    }
                }
            }
        }

        // Helper: Distribute students to maximize even teams (2v2, 3v3, etc.)
        function distributeForEvenTeams(totalStudents, minDebates, maxPerDebate) {
            // We want each debate to have an EVEN number of students (for equal teams)
            // Example: 10 students → 6 + 4 (3v3 + 2v2) ✓
            // Example: 11 students → 6 + 4 + 1? No → 6 + 6 - 1 = try 4 + 4 + 3? → 6 + 4 with 1 extra
            
            const sizes = [];
            let remaining = totalStudents;
            let debatesLeft = minDebates;
            
            while (remaining > 0 && debatesLeft > 0) {
                // Calculate ideal size for this debate
                let idealSize = Math.ceil(remaining / debatesLeft);
                
                // Make it even if possible (for equal teams)
                if (idealSize % 2 === 1 && idealSize < remaining) {
                    // Try to make it even by adding 1
                    if (idealSize + 1 <= maxPerDebate) {
                        idealSize++;
                    } else if (idealSize > 2) {
                        // Or subtract 1
                        idealSize--;
                    }
                }
                
                // Ensure we don't exceed max
                idealSize = Math.min(idealSize, maxPerDebate, remaining);
                
                // Ensure minimum of 2
                if (idealSize < 2 && remaining >= 2) {
                    idealSize = 2;
                }
                
                sizes.push(idealSize);
                remaining -= idealSize;
                debatesLeft--;
            }
            
            // Handle any remaining students - MUST assign all students
            if (remaining > 0) {
                // First, try to add pairs to existing debates to keep teams even
                for (let i = 0; i < sizes.length && remaining >= 2; i++) {
                    // Add pairs to keep teams even
                    while (remaining >= 2 && sizes[i] + 2 <= maxPerDebate) {
                        sizes[i] += 2;
                        remaining -= 2;
                    }
                }
                
                // If still have pairs remaining, create new debates
                while (remaining >= 2) {
                    const newDebateSize = Math.min(remaining, maxPerDebate);
                    // Make it even if possible
                    const evenSize = newDebateSize % 2 === 0 ? newDebateSize : newDebateSize - 1;
                    if (evenSize >= 2) {
                        sizes.push(evenSize);
                        remaining -= evenSize;
                    } else {
                        // Can't make it even, but must assign - add as odd
                        sizes.push(newDebateSize);
                        remaining -= newDebateSize;
                    }
                }
                
                // Handle single remaining student - MUST be assigned
                if (remaining === 1) {
                    // Try to add to smallest debate that has room
                    let added = false;
                    const sortedIndices = sizes.map((s, i) => ({ size: s, index: i }))
                        .sort((a, b) => a.size - b.size);
                    
                    for (const { index } of sortedIndices) {
                        if (sizes[index] + 1 <= maxPerDebate) {
                            sizes[index]++;
                            remaining = 0;
                            added = true;
                            break;
                        }
                    }
                    
                    // If couldn't add to existing debate, create a new debate with just 1 student
                    // (This will be handled later in generateTwoTeamDebates to ensure it gets assigned)
                    if (!added) {
                        // Can't create a debate with 1 student, but we'll handle this in the main function
                        // For now, add it to the smallest debate even if it exceeds max (better than losing it)
                        if (sizes.length > 0) {
                            const smallestIdx = sizes.indexOf(Math.min(...sizes));
                            sizes[smallestIdx]++;
                            remaining = 0;
                        }
                    }
                }
            }
            
            // Final pass: try to make all debates have even numbers
            // by transferring between debates
            for (let i = 0; i < sizes.length; i++) {
                if (sizes[i] % 2 === 1) {
                    // This debate has odd number, try to fix
                    for (let j = i + 1; j < sizes.length; j++) {
                        if (sizes[j] % 2 === 1) {
                            // Both odd - transfer 1 student to make both even
                            if (sizes[i] < maxPerDebate && sizes[j] > 2) {
                                sizes[i]++;
                                sizes[j]--;
                                break;
                            } else if (sizes[j] < maxPerDebate && sizes[i] > 2) {
                                sizes[j]++;
                                sizes[i]--;
                                break;
                            }
                        }
                    }
                }
            }
            
            // Ensure all students are accounted for - sum should equal totalStudents
            const totalDistributed = sizes.reduce((sum, s) => sum + s, 0);
            if (totalDistributed !== totalStudents) {
                // This shouldn't happen, but if it does, adjust the last debate
                const difference = totalStudents - totalDistributed;
                if (sizes.length > 0 && difference > 0) {
                    const lastIdx = sizes.length - 1;
                    sizes[lastIdx] += difference;
                }
            }
            
            // Remove any zeros, but ensure we have at least one debate if totalStudents >= 2
            const filtered = sizes.filter(s => s >= 2);
            if (filtered.length === 0 && totalStudents >= 2) {
                // Should have at least one debate
                filtered.push(Math.min(totalStudents, maxPerDebate));
            }
            
            return filtered;
        }

        function generateFourTeamDebates(shuffledStudents, format, maxTeamSize) {
            const totalStudents = shuffledStudents.length;
            const teamsPerDebate = 4;
            const studentsPerTeam = 2; // BP/WUDC standard
            const studentsPerDebate = teamsPerDebate * studentsPerTeam;
            
            let numDebates = Math.floor(totalStudents / studentsPerDebate);
            if (numDebates === 0) numDebates = 1;
            
            let debateNumber = 1;
            let studentIndex = 0;
            
            for (let d = 0; d < numDebates && studentIndex < totalStudents; d++) {
                const debateStudents = shuffledStudents.slice(studentIndex, studentIndex + studentsPerDebate);
                studentIndex += studentsPerDebate;
                
                if (debateStudents.length < 4) continue;

                // Assign teams and roles based on speaker order
                const teams = assignFourTeamsAndRolesBySpeakerOrder(debateStudents, format);
                
                debates.push({
                    number: debateNumber++,
                    format: format,
                    isFourTeam: true,
                    teams: teams
                });
            }

            // Handle remaining students (less than 8)
            const remainingStudents = shuffledStudents.slice(studentIndex);
            if (remainingStudents.length >= 4) {
                // Create a simplified 2-team debate with remaining students
                // Use speaker order to assign teams and roles
                const simplifiedFormat = { 
                    ...format, 
                    name: format.name + ' (Simplified)',
                    govRoles: format.roles.og || [],
                    oppRoles: format.roles.oo || []
                };
                const { proposition, opposition } = assignTeamsAndRolesBySpeakerOrder(remainingStudents, simplifiedFormat);

                debates.push({
                    number: debateNumber++,
                    format: simplifiedFormat,
                    isFourTeam: false,
                    proposition: proposition,
                    opposition: opposition
                });
            }
        }

        // ========================================
        // DISPLAY RESULTS
        // ========================================
        function displayResults(options) {
            options = options || {};
            const scroll = options.scroll !== false;
            const resultsSection = document.getElementById('results-section');
            const statsContainer = document.getElementById('stats');
            const debatesContainer = document.getElementById('debates-container');
            
            resultsSection.classList.remove('hidden');
            
            updatePrintHeaders();
            const formatName = getCurrentFormat().name;
            const classTitle = document.getElementById('class-title').value.trim();
            const titleText = classTitle || 'Debate Team Assignments';
            
            // Calculate statistics
            let totalStudents;
            if (currentMode === 'teams') {
                // Count students from team pairs
                totalStudents = debates.reduce((sum, d) => {
                    if (d.isFourTeam) {
                        return sum + Object.values(d.teams).reduce((ts, t) => ts + t.length, 0);
                    }
                    return sum + d.proposition.length + d.opposition.length;
                }, 0);
            } else {
                totalStudents = students.length;
            }
            const totalDebates = debates.length;
            
            // Display statistics
            statsContainer.innerHTML = `
                <div class="stat-item">
                    <div class="stat-value">${totalStudents}</div>
                    <div class="stat-label">${escapeHtml(debateT('classroomDebateStatStudents'))}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${totalDebates}</div>
                    <div class="stat-label">${escapeHtml(debateT('classroomDebateStatDebates'))}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${escapeHtml(formatName.split(' ')[0])}</div>
                    <div class="stat-label">${escapeHtml(debateT('classroomDebateStatFormat'))}</div>
                </div>
                ${currentMode === 'teams' ? `
                <div class="stat-item">
                    <div class="stat-value">${escapeHtml(debateT('classroomDebateStatYes'))}</div>
                    <div class="stat-label">${escapeHtml(debateT('classroomDebateStatSidesRandom'))}</div>
                </div>
                ` : ''}
            `;
            
            // Order speakers in each team by format speaking order (matches role dropdown edits)
            debates.forEach(sortDebateBySpeakingOrder);
            
            // Display debates
            debatesContainer.innerHTML = '';
            debates.forEach((debate, debateIndex) => {
                const card = document.createElement('div');
                card.className = 'debate-card';
                card.setAttribute('data-class-title', titleText); // For print header on each card
                
                if (debate.isFourTeam) {
                    card.innerHTML = generateFourTeamCard(debate, debateIndex);
                } else {
                    card.innerHTML = generateTwoTeamCard(debate, debateIndex);
                }
                
                debatesContainer.appendChild(card);
            });
            
            if (scroll) {
                resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            clearResultsStale();
            updateSetupDetailsState();
            updateStickyBar();
            saveSession();
            notifyResultsVisibility();
        }

        const FOUR_TEAM_OPPOSITE_BENCH = { og: 'oo', oo: 'og', cg: 'co', co: 'cg' };

        function fourTeamSwitchButtonLabel(teamId) {
            const labels = {
                og: '→ Opening Opposition',
                oo: '→ Opening Government',
                cg: '→ Closing Opposition',
                co: '→ Closing Government'
            };
            return labels[teamId] || 'Switch bench';
        }

        function captureArgumentSnapshotsByName(debate) {
            const byName = {};
            debate.proposition.forEach((m, i) => {
                if (!m.name) return;
                const pre = document.getElementById(`present-${debate.number}-prop-${i}`);
                const reb = document.getElementById(`rebut-${debate.number}-prop-${i}`);
                byName[m.name] = { present: pre?.value ?? '', rebut: reb?.value ?? '' };
            });
            debate.opposition.forEach((m, i) => {
                if (!m.name) return;
                const pre = document.getElementById(`present-${debate.number}-opp-${i}`);
                const reb = document.getElementById(`rebut-${debate.number}-opp-${i}`);
                byName[m.name] = { present: pre?.value ?? '', rebut: reb?.value ?? '' };
            });
            return byName;
        }

        function applyArgumentSnapshotsByName(debate, byName) {
            Object.keys(byName).forEach(name => {
                const { present, rebut } = byName[name];
                const pi = debate.proposition.findIndex(m => m.name === name);
                if (pi >= 0) {
                    const pre = document.getElementById(`present-${debate.number}-prop-${pi}`);
                    const reb = document.getElementById(`rebut-${debate.number}-prop-${pi}`);
                    if (pre) pre.value = present;
                    if (reb) reb.value = rebut;
                }
                const oi = debate.opposition.findIndex(m => m.name === name);
                if (oi >= 0) {
                    const pre = document.getElementById(`present-${debate.number}-opp-${oi}`);
                    const reb = document.getElementById(`rebut-${debate.number}-opp-${oi}`);
                    if (pre) pre.value = present;
                    if (reb) reb.value = rebut;
                }
            });
        }

        function refreshDebateCardAtIndex(debateIndex) {
            const debate = debates[debateIndex];
            const container = document.getElementById('debates-container');
            if (!debate || !container) return;
            const card = container.children[debateIndex];
            if (!card) return;
            const notesVal = document.getElementById(`notes-${debate.number}`)?.value ?? '';
            const titleText = document.getElementById('class-title').value.trim() || 'Debate Team Assignments';
            card.setAttribute('data-class-title', titleText);
            card.innerHTML = debate.isFourTeam
                ? generateFourTeamCard(debate, debateIndex)
                : generateTwoTeamCard(debate, debateIndex);
            const notesAfter = document.getElementById(`notes-${debate.number}`);
            if (notesAfter) notesAfter.value = notesVal;
        }

        function switchMemberSideTwoTeam(debateIndex, fromSide, memberIndex) {
            const debate = debates[debateIndex];
            if (!debate || debate.isFourTeam) return;
            const fromList = fromSide === 'prop' ? debate.proposition : debate.opposition;
            if (memberIndex < 0 || memberIndex >= fromList.length) return;
            const argSnaps = captureArgumentSnapshotsByName(debate);
            const [member] = fromList.splice(memberIndex, 1);
            member.role = null;
            const toList = fromSide === 'prop' ? debate.opposition : debate.proposition;
            toList.push(member);
            sortDebateBySpeakingOrder(debate);
            refreshDebateCardAtIndex(debateIndex);
            applyArgumentSnapshotsByName(debate, argSnaps);
        }

        function switchMemberFourTeamBench(debateIndex, fromTeamId, memberIndex) {
            const debate = debates[debateIndex];
            if (!debate || !debate.isFourTeam || !debate.teams) return;
            const toTeamId = FOUR_TEAM_OPPOSITE_BENCH[fromTeamId];
            if (!toTeamId) return;
            const fromList = debate.teams[fromTeamId];
            if (!fromList || memberIndex < 0 || memberIndex >= fromList.length) return;
            const [member] = fromList.splice(memberIndex, 1);
            member.role = null;
            if (!debate.teams[toTeamId]) debate.teams[toTeamId] = [];
            debate.teams[toTeamId].push(member);
            sortDebateBySpeakingOrder(debate);
            refreshDebateCardAtIndex(debateIndex);
        }

        function roleSelectHtmlForTwoTeam(roles, m, debateIndex, side, idx) {
            if (!roles || roles.length === 0) return '';
            let opts = '<option value="none">— None —</option>';
            roles.forEach((r, i) => {
                const sel = m.role && m.role.abbr === r.abbr ? ' selected' : '';
                opts += `<option value="${i}"${sel}>${escapeHtml(r.abbr)} — ${escapeHtml(r.name)}</option>`;
            });
            return `
                <div class="role-reassign">
                    <label class="role-reassign-label" for="role-sel-${debateIndex}-${side}-${idx}">Role:</label>
                    <select class="role-select" id="role-sel-${debateIndex}-${side}-${idx}" title="Change role" onchange="onMemberRoleChange(${debateIndex}, '${side}', ${idx}, this.value)">${opts}</select>
                </div>`;
        }

        function twoTeamMemberRowHtml(m, idx, debate, debateIndex, side) {
            const format = debate.format;
            const roles = side === 'prop' ? format.govRoles : format.oppRoles;
            const ts = side === 'prop' ? 'prop' : 'opp';
            const badgeClass = m.role
                ? `role-badge ${m.role.isWhip ? 'whip ' : ''}${m.role.isReply ? 'reply' : ''}`.trim()
                : 'role-badge';
            const badgeInner = m.role ? escapeHtml(m.role.abbr) : '';
            const selectHtml = roleSelectHtmlForTwoTeam(roles, m, debateIndex, side, idx);
            const switchLabel = side === 'prop' ? '→ Opposition' : '→ Proposition';
            return `
                                <li>
                                    <div class="student-header">
                                        <span>${escapeHtml(m.name)}</span>
                                        <div class="role-controls">
                                            <span class="${badgeClass}" data-role-badge="${debateIndex}-${side}-${idx}">${badgeInner}</span>
                                            ${selectHtml}
                                        </div>
                                    </div>
                                    <div class="member-actions">
                                        <button type="button" class="switch-side-btn ${BTN.outline}" onclick="switchMemberSideTwoTeam(${debateIndex}, '${side}', ${idx})">${switchLabel}</button>
                                    </div>
                                    <div class="student-arguments">
                                        <div>
                                            <label for="present-${debate.number}-${ts}-${idx}">Arguments to Present:</label>
                                            <textarea id="present-${debate.number}-${ts}-${idx}" placeholder="List arguments this student will present" rows="2"></textarea>
                                        </div>
                                        <div>
                                            <label for="rebut-${debate.number}-${ts}-${idx}">Arguments to Rebut:</label>
                                            <textarea id="rebut-${debate.number}-${ts}-${idx}" placeholder="List arguments this student will rebut" rows="2"></textarea>
                                        </div>
                                    </div>
                                </li>`;
        }

        function onMemberRoleChange(debateIndex, side, memberIndex, value) {
            const debate = debates[debateIndex];
            if (!debate) return;
            const format = debate.format;
            const roles = side === 'prop' ? format.govRoles : format.oppRoles;
            const list = side === 'prop' ? debate.proposition : debate.opposition;
            const member = list[memberIndex];
            if (!member) return;

            if (value === 'none' || value === '') {
                member.role = null;
            } else {
                const idx = parseInt(value, 10);
                member.role = roles[idx] ? { ...roles[idx] } : null;
            }

            const argSnaps = captureArgumentSnapshotsByName(debate);
            sortDebateBySpeakingOrder(debate);
            refreshDebateCardAtIndex(debateIndex);
            applyArgumentSnapshotsByName(debate, argSnaps);
        }

        function roleSelectHtmlFourTeam(roles, m, debateIndex, teamId, midx) {
            if (!roles || roles.length === 0) return '';
            let opts = '<option value="none">— None —</option>';
            roles.forEach((r, i) => {
                const sel = m.role && m.role.abbr === r.abbr ? ' selected' : '';
                opts += `<option value="${i}"${sel}>${escapeHtml(r.abbr)} — ${escapeHtml(r.name)}</option>`;
            });
            return `
                <div class="role-reassign">
                    <label class="role-reassign-label" for="role-sel-${debateIndex}-${teamId}-${midx}">Role:</label>
                    <select class="role-select" id="role-sel-${debateIndex}-${teamId}-${midx}" title="Change role" onchange="onMemberRoleChangeFour(${debateIndex}, '${teamId}', ${midx}, this.value)">${opts}</select>
                </div>`;
        }

        function onMemberRoleChangeFour(debateIndex, teamId, memberIndex, value) {
            const debate = debates[debateIndex];
            if (!debate || !debate.teams) return;
            const format = debate.format;
            const roles = (format.roles && format.roles[teamId]) ? format.roles[teamId] : [];
            const list = debate.teams[teamId];
            const member = list[memberIndex];
            if (!member) return;

            if (value === 'none' || value === '') {
                member.role = null;
            } else {
                const idx = parseInt(value, 10);
                member.role = roles[idx] ? { ...roles[idx] } : null;
            }

            sortDebateBySpeakingOrder(debate);
            refreshDebateCardAtIndex(debateIndex);
        }

        function generateTwoTeamCard(debate, debateIndex) {
            const format = debate.format;
            
            // Use custom team names if provided, otherwise use format defaults
            const propTeamLabel = debate.propTeamName 
                ? `${format.govIcon} ${format.govName}: ${escapeHtml(debate.propTeamName)}`
                : `${format.govIcon} ${format.govName} Team`;
            const oppTeamLabel = debate.oppTeamName 
                ? `${format.oppIcon} ${format.oppName}: ${escapeHtml(debate.oppTeamName)}`
                : `${format.oppIcon} ${format.oppName} Team`;
            
            return `
                <div class="debate-header">
                    ${escapeHtml(debateT('classroomDebateDebateN', { n: debate.number }))}
                    <span class="format-badge">${escapeHtml(format.name)}</span>
                </div>
                    <div class="teams">
                        <div class="team proposition">
                        <div class="team-header">${propTeamLabel}</div>
                            <ul class="team-members">
                            ${debate.proposition.map((m, idx) => twoTeamMemberRowHtml(m, idx, debate, debateIndex, 'prop')).join('')}
                            </ul>
                        </div>
                        <div class="team opposition">
                        <div class="team-header">${oppTeamLabel}</div>
                            <ul class="team-members">
                            ${debate.opposition.map((m, idx) => twoTeamMemberRowHtml(m, idx, debate, debateIndex, 'opp')).join('')}
                            </ul>
                        </div>
                    </div>
                    <div class="debate-notes form-group">
                        <label for="notes-${debate.number}">${escapeHtml(debateT('classroomDebateNotesLabel'))}</label>
                        <textarea id="notes-${debate.number}" class="field-control" data-i18n-placeholder="classroomDebateNotesPlaceholder" placeholder="Add notes for this debate (topic, room, time, etc.)"></textarea>
                    </div>
                `;
        }

        function generateFourTeamCard(debate, debateIndex) {
            const format = debate.format;
            
            let teamsHTML = '';
            format.teamStructure.forEach(team => {
                const teamData = debate.teams[team.id];
                const roles = format.roles[team.id] || [];
                teamsHTML += `
                    <div class="team ${team.class}">
                        <div class="team-header">${team.icon} ${team.name}</div>
                        <ul class="team-members">
                            ${teamData.map((m, midx) => `
                                <li>
                                    <div class="student-header">
                                        <span>${escapeHtml(m.name)}</span>
                                        <div class="role-controls">
                                            <span class="role-badge ${m.role && m.role.isWhip ? 'whip' : ''}" data-role-badge-four="${debateIndex}-${team.id}-${midx}">${m.role ? escapeHtml(m.role.abbr) : ''}</span>
                                            ${roleSelectHtmlFourTeam(roles, m, debateIndex, team.id, midx)}
                                        </div>
                                    </div>
                                    <div class="member-actions">
                                        <button type="button" class="switch-side-btn ${BTN.outline}" onclick="switchMemberFourTeamBench(${debateIndex}, '${team.id}', ${midx})">${fourTeamSwitchButtonLabel(team.id)}</button>
                                    </div>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                `;
            });

            return `
                <div class="debate-header">
                    ${escapeHtml(debateT('classroomDebateDebateN', { n: debate.number }))}
                    <span class="format-badge">${escapeHtml(format.name)}</span>
                </div>
                <div class="teams four-teams">
                    ${teamsHTML}
                </div>
                <div class="debate-notes form-group">
                    <label for="notes-${debate.number}">${escapeHtml(debateT('classroomDebateNotesLabel'))}</label>
                    <textarea id="notes-${debate.number}" class="field-control" data-i18n-placeholder="classroomDebateNotesPlaceholder" placeholder="Add notes for this debate (topic, room, time, etc.)"></textarea>
                </div>
            `;
        }

        // ========================================
        // SPEAKING ORDER (copy + Word export)
        // ========================================
        function normalizeSpeakerOrderToken(token) {
            return String(token).replace(/\*$/, '').trim();
        }

        function resolveSpeakingTokenToRoleAbbr(format, token) {
            const base = normalizeSpeakerOrderToken(token);
            if (!base) return null;
            if (format.speakerOrderRoleAliases && format.speakerOrderRoleAliases[base]) {
                return format.speakerOrderRoleAliases[base];
            }
            if (format.isFourTeam && format.roles) {
                for (const teamId of Object.keys(format.roles)) {
                    const roles = format.roles[teamId] || [];
                    if (roles.some(r => r.abbr === base)) return base;
                }
                return null;
            }
            const gov = format.govRoles || [];
            const opp = format.oppRoles || [];
            if (gov.some(r => r.abbr === base) || opp.some(r => r.abbr === base)) return base;
            return null;
        }

        function findMemberWithRoleAbbr(debate, roleAbbr) {
            if (!roleAbbr || !debate) return null;
            if (debate.isFourTeam) {
                const orderBench = ['og', 'oo', 'cg', 'co'];
                for (const teamId of orderBench) {
                    const list = debate.teams[teamId];
                    if (!list) continue;
                    const m = list.find(x => x.role && x.role.abbr === roleAbbr);
                    if (m) return { member: m, fourTeamId: teamId };
                }
                return null;
            }
            const pi = debate.proposition.findIndex(x => x.role && x.role.abbr === roleAbbr);
            if (pi >= 0) return { member: debate.proposition[pi], side: 'prop', sideIdx: pi };
            const oi = debate.opposition.findIndex(x => x.role && x.role.abbr === roleAbbr);
            if (oi >= 0) return { member: debate.opposition[oi], side: 'opp', sideIdx: oi };
            return null;
        }

        function getTwoTeamArgumentField(debate, side, idx, which) {
            if (!debate || debate.isFourTeam) return '';
            const ts = side === 'prop' ? 'prop' : 'opp';
            const el = document.getElementById(`${which}-${debate.number}-${ts}-${idx}`);
            return el && el.value ? el.value.trim() : '';
        }

        function forEachDebateMember(debate, fn) {
            if (!debate || typeof fn !== 'function') return;
            if (debate.isFourTeam) {
                ['og', 'oo', 'cg', 'co'].forEach(teamId => {
                    const list = debate.teams[teamId] || [];
                    list.forEach((m, i) => fn(m, { fourTeamId: teamId, listIdx: i }));
                });
            } else {
                (debate.proposition || []).forEach((m, i) => fn(m, { side: 'prop', listIdx: i }));
                (debate.opposition || []).forEach((m, i) => fn(m, { side: 'opp', listIdx: i }));
            }
        }

        function collectSpeakingOrderBundle(debate) {
            const fmt = debate.format;
            const order = fmt.speakerOrder;
            if (!order || order.length === 0) {
                return { useTraditional: true, rows: [], extras: [] };
            }

            const rows = [];
            const appeared = new Set();

            order.forEach(token => {
                const slotLabel = normalizeSpeakerOrderToken(token);
                const roleAbbr = resolveSpeakingTokenToRoleAbbr(fmt, token);
                if (!roleAbbr) {
                    rows.push({ kind: 'stage', slotLabel });
                    return;
                }
                const found = findMemberWithRoleAbbr(debate, roleAbbr);
                if (!found) {
                    rows.push({ kind: 'stage', slotLabel });
                    return;
                }
                appeared.add(found.member);
                rows.push({ kind: 'member', found, slotLabel });
            });

            const extras = [];
            forEachDebateMember(debate, (m, ctx) => {
                if (appeared.has(m)) return;
                extras.push({ member: m, ctx });
            });

            return { useTraditional: false, rows, extras };
        }

        function buildTraditionalCopySection(debate) {
            let text = '';
            if (debate.isFourTeam) {
                debate.format.teamStructure.forEach(team => {
                    const teamData = debate.teams[team.id] || [];
                    text += `${team.name}:\n`;
                    teamData.forEach(m => {
                        text += `  * ${m.name}${m.role ? ` (${m.role.abbr})` : ''}\n`;
                    });
                });
            } else {
                const propLabel = debate.propTeamName
                    ? `${debate.format.govName} (${debate.propTeamName})`
                    : `${debate.format.govName} Team`;
                const oppLabel = debate.oppTeamName
                    ? `${debate.format.oppName} (${debate.oppTeamName})`
                    : `${debate.format.oppName} Team`;

                text += `${propLabel}:\n`;
                (debate.proposition || []).forEach((m, idx) => {
                    text += `  * ${m.name}${m.role ? ` (${m.role.abbr})` : ''}\n`;
                    const pr = getTwoTeamArgumentField(debate, 'prop', idx, 'present');
                    const rb = getTwoTeamArgumentField(debate, 'prop', idx, 'rebut');
                    if (pr) text += `    Present: ${pr}\n`;
                    if (rb) text += `    Rebut: ${rb}\n`;
                });
                text += `${oppLabel}:\n`;
                (debate.opposition || []).forEach((m, idx) => {
                    text += `  * ${m.name}${m.role ? ` (${m.role.abbr})` : ''}\n`;
                    const pr = getTwoTeamArgumentField(debate, 'opp', idx, 'present');
                    const rb = getTwoTeamArgumentField(debate, 'opp', idx, 'rebut');
                    if (pr) text += `    Present: ${pr}\n`;
                    if (rb) text += `    Rebut: ${rb}\n`;
                });
            }
            return text;
        }

        function formatSpeakingRowToCopyLines(debate, row) {
            if (row.kind === 'stage') {
                return `  --- ${row.slotLabel} ---\n`;
            }
            const m = row.found.member;
            let t = `  * ${m.name}${m.role ? ` (${m.role.abbr})` : ''}\n`;
            if (!debate.isFourTeam && row.found.side) {
                const pr = getTwoTeamArgumentField(debate, row.found.side, row.found.sideIdx, 'present');
                const rb = getTwoTeamArgumentField(debate, row.found.side, row.found.sideIdx, 'rebut');
                if (pr) t += `    Present: ${pr}\n`;
                if (rb) t += `    Rebut: ${rb}\n`;
            }
            return t;
        }

        function formatMemberExtraCopy(debate, member, ctx) {
            let t = `  * ${member.name}${member.role ? ` (${member.role.abbr})` : ''}\n`;
            if (!debate.isFourTeam && ctx.side) {
                const pr = getTwoTeamArgumentField(debate, ctx.side, ctx.listIdx, 'present');
                const rb = getTwoTeamArgumentField(debate, ctx.side, ctx.listIdx, 'rebut');
                if (pr) t += `    Present: ${pr}\n`;
                if (rb) t += `    Rebut: ${rb}\n`;
            }
            return t;
        }

        function buildSpeakingOrderCopySection(debate) {
            const bundle = collectSpeakingOrderBundle(debate);
            if (bundle.useTraditional) {
                return buildTraditionalCopySection(debate);
            }
            let text = 'Speaking order:\n';
            bundle.rows.forEach(row => {
                text += formatSpeakingRowToCopyLines(debate, row);
            });
            if (bundle.extras.length) {
                text += '  (Also assigned — not placed in speaking-order slots)\n';
                bundle.extras.forEach(({ member, ctx }) => {
                    text += formatMemberExtraCopy(debate, member, ctx);
                });
            }
            return text;
        }

        function wordRowFromStage(debate, slotLabel) {
            return {
                debate: String(debate.number),
                formatName: debate.format.name,
                slot: slotLabel,
                bench: '—',
                roleAbbr: '',
                roleName: '',
                name: '',
                present: '',
                rebut: ''
            };
        }

        function wordRowFromMember(debate, found, slotLabel) {
            const m = found.member;
            const fmt = debate.format;
            let bench = '';
            let present = '';
            let rebut = '';
            if (debate.isFourTeam) {
                const ts = (fmt.teamStructure || []).find(t => t.id === found.fourTeamId);
                bench = ts ? ts.name : found.fourTeamId;
            } else {
                bench = found.side === 'prop' ? fmt.govName : fmt.oppName;
                present = getTwoTeamArgumentField(debate, found.side, found.sideIdx, 'present');
                rebut = getTwoTeamArgumentField(debate, found.side, found.sideIdx, 'rebut');
            }
            return {
                debate: String(debate.number),
                formatName: fmt.name,
                slot: slotLabel,
                bench,
                roleAbbr: m.role ? m.role.abbr : '',
                roleName: m.role ? m.role.name : '',
                name: m.name || '',
                present,
                rebut
            };
        }

        function wordRowFromExtra(debate, member, ctx) {
            const fmt = debate.format;
            let bench = '';
            let present = '';
            let rebut = '';
            if (debate.isFourTeam) {
                const ts = (fmt.teamStructure || []).find(t => t.id === ctx.fourTeamId);
                bench = ts ? ts.name : ctx.fourTeamId;
            } else {
                bench = ctx.side === 'prop' ? fmt.govName : fmt.oppName;
                present = getTwoTeamArgumentField(debate, ctx.side, ctx.listIdx, 'present');
                rebut = getTwoTeamArgumentField(debate, ctx.side, ctx.listIdx, 'rebut');
            }
            return {
                debate: String(debate.number),
                formatName: fmt.name,
                slot: '(extra / unplaced)',
                bench,
                roleAbbr: member.role ? member.role.abbr : '',
                roleName: member.role ? member.role.name : '',
                name: member.name || '',
                present,
                rebut
            };
        }

        function collectAllWordLines(debates) {
            const lines = [];
            debates.forEach(debate => {
                const bundle = collectSpeakingOrderBundle(debate);
                if (bundle.useTraditional) {
                    if (debate.isFourTeam) {
                        debate.format.teamStructure.forEach(team => {
                            (debate.teams[team.id] || []).forEach(m => {
                                lines.push({
                                    debate: String(debate.number),
                                    formatName: debate.format.name,
                                    slot: '—',
                                    bench: team.name,
                                    roleAbbr: m.role ? m.role.abbr : '',
                                    roleName: m.role ? m.role.name : '',
                                    name: m.name || '',
                                    present: '',
                                    rebut: ''
                                });
                            });
                        });
                    } else {
                        const fmt = debate.format;
                        (debate.proposition || []).forEach((m, idx) => {
                            lines.push({
                                debate: String(debate.number),
                                formatName: fmt.name,
                                slot: '—',
                                bench: fmt.govName,
                                roleAbbr: m.role ? m.role.abbr : '',
                                roleName: m.role ? m.role.name : '',
                                name: m.name || '',
                                present: getTwoTeamArgumentField(debate, 'prop', idx, 'present'),
                                rebut: getTwoTeamArgumentField(debate, 'prop', idx, 'rebut')
                            });
                        });
                        (debate.opposition || []).forEach((m, idx) => {
                            lines.push({
                                debate: String(debate.number),
                                formatName: fmt.name,
                                slot: '—',
                                bench: fmt.oppName,
                                roleAbbr: m.role ? m.role.abbr : '',
                                roleName: m.role ? m.role.name : '',
                                name: m.name || '',
                                present: getTwoTeamArgumentField(debate, 'opp', idx, 'present'),
                                rebut: getTwoTeamArgumentField(debate, 'opp', idx, 'rebut')
                            });
                        });
                    }
                    return;
                }
                bundle.rows.forEach(row => {
                    if (row.kind === 'stage') {
                        lines.push(wordRowFromStage(debate, row.slotLabel));
                    } else {
                        lines.push(wordRowFromMember(debate, row.found, row.slotLabel));
                    }
                });
                bundle.extras.forEach(({ member, ctx }) => {
                    lines.push(wordRowFromExtra(debate, member, ctx));
                });
            });
            return lines;
        }

        const FEEDBACK_TEMPLATES = {
            garam: {
                file: 'Debate Feedback Sheet-Garam-Mirinae.docx',
                fileLabel: 'Garam-Mirinae',
                rowsPerStudent: 9,
                studentsPerPage: 6,
                primary: '#1b5e20',
                scoreRows: ['Eye Contact (/5)', 'Voice & Pronunciation (/5)', 'Fluency (/5)', 'Content (/5)', 'Logic (/5)', 'Confidence & Posture (/5)', 'Total (/30)']
            },
            yeoul: {
                file: 'Debate Feedback Sheet Purple-Yeoul.docx',
                fileLabel: 'Purple-Yeoul',
                rowsPerStudent: 7,
                studentsPerPage: 6,
                primary: '#4a148c',
                scoreRows: ['Eye Contact (/5)', 'Voice & Pronunciation (/5)', 'Fluency (/5)', 'Confidence & Posture (/5)', 'Total (/20)']
            }
        };

        function dateForFilename() {
            const d = new Date();
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        }

        function getClassTitleForExport() {
            return document.getElementById('class-title')?.value.trim() || '';
        }

        function getHrTeacherForExport() {
            return document.getElementById('hr-teacher')?.value.trim() || '';
        }

        function getFeedbackExportContext(classKeyOverride) {
            if (!debates || debates.length === 0) {
                alert('Generate debate assignments first — there is nothing to export.');
                return null;
            }
            const classKey = classKeyOverride != null
                ? classKeyOverride
                : (document.getElementById('feedback-export-class')?.value || 'garam');
            const template = FEEDBACK_TEMPLATES[classKey] || FEEDBACK_TEMPLATES.garam;
            const classTitle = getClassTitleForExport();
            const hrTeacher = getHrTeacherForExport();
            const assignmentFormat = getCurrentFormat().name;
            const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            const modeNote = currentMode === 'teams' ? 'Sides randomly assigned' : '';
            const lines = collectAllWordLines(debates);
            return { classKey, template, classTitle, hrTeacher, assignmentFormat, dateStr, modeNote, lines };
        }

        function collectSpeakersForScoreSheet(lines) {
            return lines
                .filter(row => row.name && String(row.name).trim())
                .map(row => ({
                    name: row.name.trim(),
                    roleAbbr: row.roleAbbr || '',
                    roleName: row.roleName || '',
                    debate: row.debate,
                    bench: row.bench || ''
                }));
        }

        function escapeXml(text) {
            return String(text || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function decodeXmlText(text) {
            return String(text || '')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"');
        }

        function getCellPlainText(cellXml) {
            const parts = cellXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
            return decodeXmlText(parts.map(p => p.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '')).join('')).trim();
        }

        function getTableRowXmlList(documentXml) {
            return documentXml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
        }

        function getRowCells(trXml) {
            return trXml.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
        }

        function setTableCellText(cellXml, text) {
            const safe = escapeXml(text);
            const inner = `<w:p><w:r><w:t xml:space="preserve">${safe}</w:t></w:r></w:p>`;
            if (/<w:tcPr[\s>]/.test(cellXml)) {
                return cellXml.replace(/(<w:tc[^>]*><w:tcPr[\s\S]*?<\/w:tcPr>)[\s\S]*?(<\/w:tc>)/, '$1' + inner + '$2');
            }
            return cellXml.replace(/(<w:tc[^>]*>)[\s\S]*?(<\/w:tc>)/, '$1' + inner + '$2');
        }

        function setRowMiddleCell(trXml, text) {
            const cells = getRowCells(trXml);
            if (cells.length < 2) return trXml;
            const newCell = setTableCellText(cells[1], text);
            return trXml.replace(cells[1], newCell);
        }

        function findStudentBlockStarts(tableRows) {
            const starts = [];
            tableRows.forEach((tr, i) => {
                const cells = getRowCells(tr);
                if (cells.length && getCellPlainText(cells[0]) === 'Name') {
                    starts.push(i);
                }
            });
            return starts;
        }

        function speakerIndexForBlock(blockIndex, studentsPerPage) {
            const page = Math.floor(blockIndex / studentsPerPage);
            const slot = blockIndex % studentsPerPage;
            return page * studentsPerPage + slot;
        }

        function appendScoreSheetPageRows(tableRows, blockStarts, template, extraPageCount) {
            if (extraPageCount <= 0) return tableRows;
            const perPage = template.studentsPerPage || 6;
            const rowsPerStudent = template.rowsPerStudent;
            if (blockStarts.length <= perPage) {
                throw new Error('Template has no second page to clone for overflow.');
            }
            const pageStart = blockStarts[perPage];
            const lastBlockOnPage = blockStarts[perPage + perPage - 1];
            const pageEnd = lastBlockOnPage + rowsPerStudent;
            const pageChunk = tableRows.slice(pageStart, pageEnd);
            let extended = tableRows.slice();
            for (let i = 0; i < extraPageCount; i++) {
                extended = extended.concat(pageChunk);
            }
            return extended;
        }

        function applyFilledTableRowsToDocument(documentXml, filledRows) {
            const rowRegex = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
            let cursor = 0;
            let xml = documentXml.replace(rowRegex, function () {
                if (cursor < filledRows.length) {
                    return filledRows[cursor++];
                }
                return '';
            });
            if (cursor < filledRows.length) {
                const extra = filledRows.slice(cursor).join('');
                const tblEnd = xml.lastIndexOf('</w:tbl>');
                if (tblEnd < 0) {
                    throw new Error('Could not extend score sheet table.');
                }
                xml = xml.slice(0, tblEnd) + extra + xml.slice(tblEnd);
            }
            return xml;
        }

        function promptFeedbackWordTemplate() {
            return new Promise(function (resolve) {
                const modal = document.getElementById('word-template-modal');
                const btnGaram = document.getElementById('word-template-pick-garam');
                const btnYeoul = document.getElementById('word-template-pick-yeoul');
                const btnCancel = document.getElementById('word-template-cancel');
                if (!modal || !btnGaram || !btnYeoul || !btnCancel) {
                    resolve(null);
                    return;
                }
                const defaultKey = document.getElementById('feedback-export-class')?.value || 'garam';
                btnGaram.classList.toggle('template-pick-default', defaultKey === 'garam');
                btnYeoul.classList.toggle('template-pick-default', defaultKey === 'yeoul');

                function cleanup(key) {
                    if (global.CCPModal && global.CCPModal.close) {
                        global.CCPModal.close(modal);
                    } else {
                        modal.classList.remove('active');
                        modal.setAttribute('hidden', '');
                        modal.setAttribute('aria-hidden', 'true');
                    }
                    btnGaram.onclick = null;
                    btnYeoul.onclick = null;
                    btnCancel.onclick = null;
                    document.removeEventListener('keydown', onKey);
                    resolve(key);
                }

                function onKey(e) {
                    if (e.key === 'Escape') cleanup(null);
                }

                if (global.CCPModal && global.CCPModal.open) {
                    global.CCPModal.open(modal);
                } else {
                    modal.removeAttribute('hidden');
                    modal.classList.add('active');
                    modal.setAttribute('aria-hidden', 'false');
                }
                (defaultKey === 'yeoul' ? btnYeoul : btnGaram).focus();

                btnGaram.onclick = function () { cleanup('garam'); };
                btnYeoul.onclick = function () { cleanup('yeoul'); };
                btnCancel.onclick = function () { cleanup(null); };
                document.addEventListener('keydown', onKey);
            });
        }

        function fillStudentScoreBlock(filledRows, startIdx, speaker) {
            const name = speaker ? speaker.name : '';
            const roleLabel = speaker ? (speaker.roleAbbr || '') : '';
            filledRows[startIdx] = setRowMiddleCell(filledRows[startIdx], name);
            if (filledRows[startIdx + 1]) {
                filledRows[startIdx + 1] = setRowMiddleCell(filledRows[startIdx + 1], roleLabel);
            }
        }

        function buildScoreSheetStudentCardHtml(t, sp) {
            const roleLabel = sp.roleAbbr || '';
            let criteriaHtml = '';
            t.scoreRows.forEach(label => {
                criteriaHtml += `<div style="display:grid;grid-template-columns:1fr 48px;gap:6px;margin:2px 0;"><span>${escapeHtml(label)}</span><span style="border-bottom:1px solid #999;min-height:14px;"></span></div>`;
            });
            return `
                <div class="score-student-card" style="border:2px solid ${t.primary};border-radius:4px;padding:8px 10px;margin-bottom:10px;font-size:9.5pt;page-break-inside:avoid;">
                    <div style="font-size:8pt;color:#666;margin-bottom:4px;">Debate ${escapeHtml(sp.debate)} · ${escapeHtml(sp.bench)}</div>
                    <div style="display:grid;grid-template-columns:52px 1fr 72px;gap:4px 8px;margin-bottom:4px;">
                        <span style="font-weight:600;">Name</span><span style="font-weight:600;">${escapeHtml(sp.name)}</span><span style="font-weight:600;">Comments</span>
                    </div>
                    <div style="display:grid;grid-template-columns:52px 1fr;gap:4px 8px;margin-bottom:6px;">
                        <span style="font-weight:600;">Role</span><span>${escapeHtml(roleLabel)}</span>
                    </div>
                    ${criteriaHtml}
                </div>`;
        }

        function buildScoreSheetPageHeaderHtml(t, headerClass, ctx) {
            const classLine = headerClass
                ? `Class: <strong>${escapeHtml(headerClass)}</strong>`
                : 'Class: ____________________';
            const hrLine = ctx.hrTeacher
                ? `HR Teacher: <strong>${escapeHtml(ctx.hrTeacher)}</strong>`
                : 'HR Teacher: ______________';
            return `
                <header style="border-bottom:3px solid ${t.primary};margin-bottom:12px;padding-bottom:8px;">
                    <h1 style="margin:0;font-size:17pt;color:${t.primary};">Debate Feedback Sheet</h1>
                    <p style="margin:6px 0 0 0;font-size:10.5pt;">${classLine} &nbsp; Month-Year: <strong>${escapeHtml(ctx.dateStr)}</strong> &nbsp; ${hrLine}</p>
                    <p style="margin:4px 0 0 0;font-size:9pt;color:#555;">Format: ${escapeHtml(ctx.assignmentFormat)}${ctx.modeNote ? ' · ' + escapeHtml(ctx.modeNote) : ''}</p>
                </header>`;
        }

        function replaceDocxFieldAfterLabel(documentXml, label, value) {
            if (!value) return documentXml;
            const safe = escapeXml(value);
            let xml = documentXml;
            let from = 0;
            while (from < xml.length) {
                const idx = xml.indexOf(label, from);
                if (idx < 0) break;
                const tail = xml.slice(idx + label.length);
                const sameRun = tail.match(/^(\s*_{2,})/);
                if (sameRun) {
                    xml = xml.slice(0, idx + label.length) + ' ' + safe + tail.slice(sameRun[0].length);
                    from = idx + label.length + safe.length + 2;
                    continue;
                }
                const nextRun = tail.match(/<w:t([^>]*)>([\s_]{3,})<\/w:t>/);
                if (nextRun && /^[\s_]+$/.test(nextRun[2]) && nextRun[2].replace(/\s/g, '').includes('_')) {
                    const insert = `<w:t${nextRun[1]} xml:space="preserve">${safe}</w:t>`;
                    xml = xml.slice(0, idx + label.length) + insert + tail.slice(nextRun[0].length);
                    from = idx + label.length + insert.length;
                    continue;
                }
                from = idx + label.length;
            }
            return xml;
        }

        function fillDocumentHeaderFields(documentXml, classTitle, dateStr, hrTeacher) {
            let xml = documentXml;
            if (classTitle) {
                const safeClass = escapeXml(classTitle);
                xml = xml.replace(/Class:\s*_{2,}/g, 'Class: ' + safeClass);
                xml = replaceDocxFieldAfterLabel(xml, 'Class:', classTitle);
            }
            if (dateStr) {
                const safeDate = escapeXml(dateStr);
                xml = xml.replace(/Month-Year:\s*_{2,}/g, 'Month-Year: ' + safeDate);
                xml = replaceDocxFieldAfterLabel(xml, 'Month-Year:', dateStr);
            }
            if (hrTeacher) {
                const safeHr = escapeXml(hrTeacher);
                xml = xml.replace(/HR Teacher:\s*_{2,}/g, 'HR Teacher: ' + safeHr);
                xml = replaceDocxFieldAfterLabel(xml, 'HR Teacher:', hrTeacher);
            }
            return xml;
        }

        function applyTemplateScoreLabelOverrides(documentXml, classKey) {
            if (classKey !== 'yeoul') return documentXml;
            return documentXml.replace(/Total \(\/30\)/g, 'Total (/20)');
        }

        function fillFeedbackDocx(arrayBuffer, ctx) {
            const zip = new PizZip(arrayBuffer);
            let documentXml = zip.file('word/document.xml').asText();
            documentXml = fillDocumentHeaderFields(documentXml, ctx.classTitle, ctx.dateStr, ctx.hrTeacher);
            documentXml = applyTemplateScoreLabelOverrides(documentXml, ctx.classKey);

            const template = ctx.template;
            const perPage = template.studentsPerPage || 6;
            let tableRows = getTableRowXmlList(documentXml);
            let blockStarts = findStudentBlockStarts(tableRows);
            const speakers = collectSpeakersForScoreSheet(ctx.lines);

            if (blockStarts.length === 0) {
                throw new Error('Could not find student score blocks in the template.');
            }

            const templatePages = Math.floor(blockStarts.length / perPage);
            const pagesNeeded = Math.max(1, Math.ceil(speakers.length / perPage));
            if (pagesNeeded > templatePages) {
                tableRows = appendScoreSheetPageRows(tableRows, blockStarts, template, pagesNeeded - templatePages);
                blockStarts = findStudentBlockStarts(tableRows);
            }

            const filledRows = tableRows.slice();
            blockStarts.forEach((startIdx, blockIdx) => {
                const speakerIdx = speakerIndexForBlock(blockIdx, perPage);
                const sp = speakerIdx < speakers.length ? speakers[speakerIdx] : null;
                fillStudentScoreBlock(filledRows, startIdx, sp);
            });

            const filledXml = applyFilledTableRowsToDocument(documentXml, filledRows);

            zip.file('word/document.xml', filledXml);
            return zip.generate({
                type: 'arraybuffer',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            });
        }

        function base64ToArrayBuffer(b64) {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
        }

        async function fetchFeedbackTemplate(classKey) {
            const key = classKey || 'garam';
            if (typeof FEEDBACK_TEMPLATE_B64 !== 'undefined' && FEEDBACK_TEMPLATE_B64[key]) {
                return base64ToArrayBuffer(FEEDBACK_TEMPLATE_B64[key]);
            }
            const cfg = FEEDBACK_TEMPLATES[key] || FEEDBACK_TEMPLATES.garam;
            const url = encodeURI(cfg.file);
            try {
                const res = await fetch(url);
                if (res.ok) {
                    return res.arrayBuffer();
                }
            } catch (err) {
                console.warn('fetch template failed', err);
            }
            throw new Error(
                'Could not load the score sheet template. Run scripts/embed_templates.py after updating the .docx files, or keep "' +
                cfg.file + '" next to index.html and open the app through a local web server.'
            );
        }

        function buildScoreSheetPdfHtml(ctx) {
            const t = ctx.template;
            const perPage = t.studentsPerPage || 6;
            const speakers = collectSpeakersForScoreSheet(ctx.lines);
            const headerClass = ctx.classTitle;
            const pageCount = Math.ceil(speakers.length / perPage) || 0;
            let pagesHtml = '';
            for (let p = 0; p < pageCount; p++) {
                const chunk = speakers.slice(p * perPage, p * perPage + perPage);
                let cards = '';
                chunk.forEach(sp => {
                    cards += buildScoreSheetStudentCardHtml(t, sp);
                });
                const pageBreak = p < pageCount - 1 ? 'page-break-after:always;' : '';
                pagesHtml += `<div class="feedback-sheet-page" style="font-family:Calibri,'Segoe UI',Arial,sans-serif;padding:12px 16px;max-width:210mm;${pageBreak}">
                    ${buildScoreSheetPageHeaderHtml(t, headerClass, ctx)}
                    <div>${cards}</div>
                </div>`;
            }
            return pagesHtml;
        }

        function mountFeedbackSheetElement(ctx) {
            const mount = document.getElementById('feedback-sheet-mount');
            if (!mount) return null;
            mount.innerHTML = buildScoreSheetPdfHtml(ctx);
            return mount;
        }

        function downloadBlob(blob, filename) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        }

        async function exportFeedbackWord() {
            const baseCtx = getFeedbackExportContext();
            if (!baseCtx) return;
            const classKey = await promptFeedbackWordTemplate();
            if (!classKey) return;
            const ctx = {
                ...baseCtx,
                classKey,
                template: FEEDBACK_TEMPLATES[classKey] || FEEDBACK_TEMPLATES.garam
            };
            if (typeof PizZip === 'undefined') {
                alert('Word export library did not load. Check your internet connection and refresh the page.');
                return;
            }
            try {
                const templateBuf = await fetchFeedbackTemplate(ctx.classKey);
                const out = fillFeedbackDocx(templateBuf, ctx);
                downloadBlob(
                    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
                    `Debate-Feedback-${ctx.template.fileLabel}-${dateForFilename()}.docx`
                );
            } catch (err) {
                console.error(err);
                alert('Word export failed: ' + (err && err.message ? err.message : String(err)));
            }
        }

        async function exportFeedbackPdf() {
            const ctx = getFeedbackExportContext();
            if (!ctx) return;
            if (typeof html2pdf === 'undefined') {
                alert('PDF library did not load. Check your internet connection and refresh the page.');
                return;
            }
            const el = mountFeedbackSheetElement(ctx);
            if (!el) return;
            const fname = `Debate-Feedback-${ctx.template.fileLabel}-${dateForFilename()}.pdf`;
            try {
                await html2pdf().set({
                    margin: [8, 8, 8, 8],
                    filename: fname,
                    image: { type: 'jpeg', quality: 0.95 },
                    html2canvas: { scale: 2, useCORS: true, logging: false },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'] }
                }).from(el).save();
            } catch (err) {
                console.error(err);
                alert('PDF export failed: ' + (err && err.message ? err.message : String(err)) + '\n\nTip: use Download Word for the exact school score sheet.');
            }
        }

        function buildPrintScoreSheetStudentBlock(t, sp, borderColor) {
            const roleLabel = sp.roleAbbr || '';
            let rows = '';
            t.scoreRows.forEach(label => {
                rows += `<tr><td style="text-align:left;font-weight:600;width:42%;">${escapeHtml(label)}</td><td></td><td style="width:28%;"></td></tr>`;
            });
            return `
                <div class="student-block" style="margin-bottom:0.75rem;">
                    <table style="width:100%;border-collapse:collapse;font-size:10pt;">
                        <tr>
                            <th style="width:18%;border:1px solid #999;padding:6px;background:#f4f4f4;">Name</th>
                            <th style="width:42%;border:1px solid #999;padding:6px;text-align:left;">${escapeHtml(sp.name)}</th>
                            <th style="border:1px solid #999;padding:6px;background:#f4f4f4;">Comments</th>
                        </tr>
                        <tr>
                            <th style="border:1px solid #999;padding:6px;background:#f4f4f4;">Role</th>
                            <th colspan="2" style="border:1px solid #999;padding:6px;text-align:left;">${escapeHtml(roleLabel)}</th>
                        </tr>
                        ${rows}
                    </table>
                    <p style="margin:4px 0 0 0;font-size:8.5pt;color:#666;">Debate ${escapeHtml(sp.debate)} · ${escapeHtml(sp.bench)}</p>
                </div>`;
        }

        function buildPrintScoreSheetsHtml(ctx) {
            const t = ctx.template;
            const perPage = t.studentsPerPage || 6;
            const speakers = collectSpeakersForScoreSheet(ctx.lines);
            const headerClass = ctx.classTitle;
            const borderColor = t.primary;
            const pageCount = Math.ceil(speakers.length / perPage) || 0;
            let body = '';
            for (let p = 0; p < pageCount; p++) {
                const chunk = speakers.slice(p * perPage, p * perPage + perPage);
                let blocks = '';
                chunk.forEach(sp => {
                    blocks += buildPrintScoreSheetStudentBlock(t, sp, borderColor);
                });
                body += `
                <section class="sheet-page" style="page-break-after:always;">
                    <h1 style="color:${borderColor};margin:0 0 12px 0;">Debate Feedback Sheet</h1>
                    <div class="header-info" style="margin-bottom:1rem;font-size:11pt;">
                        <div><strong>Class:</strong> ${escapeHtml(headerClass)}</div>
                        <div><strong>Month-Year:</strong> ${escapeHtml(ctx.dateStr)}</div>
                        <div><strong>HR Teacher:</strong> ${escapeHtml(ctx.hrTeacher)}</div>
                        <div><strong>Format:</strong> ${escapeHtml(ctx.assignmentFormat)}</div>
                    </div>
                    ${blocks}
                </section>`;
            }
            return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Debate score sheets</title>
                <style>
                    body{font-family:Calibri,'Segoe UI',Arial,sans-serif;line-height:1.4;padding:20px;color:#111;}
                    .sheet-page{border:2px solid ${borderColor};padding:1.25rem;border-radius:6px;margin-bottom:2rem;}
                    .sheet-page:last-child{page-break-after:auto;}
                    .header-info div{margin:0.25rem 0;}
                    th,td{border:1px solid #999;}
                    @media print{body{padding:0.4in;} .sheet-page{border-width:1px;margin-bottom:0;}}
                </style></head><body>${body}</body></html>`;
        }

        function printFeedbackScoreSheets() {
            const ctx = getFeedbackExportContext();
            if (!ctx) return;
            const speakers = collectSpeakersForScoreSheet(ctx.lines);
            if (!speakers.length) {
                alert('No student names to print. Generate assignments with named students first.');
                return;
            }
            const win = window.open('', '_blank', 'width=900,height=700');
            if (!win) {
                alert('Could not open the print window. Allow pop-ups for this page and try again.');
                return;
            }
            win.document.write(buildPrintScoreSheetsHtml(ctx));
            win.document.close();
            win.focus();
            win.print();
        }

        // ========================================
        // SAVE & RESTORE (JSON BACKUP)
        // ========================================
        const STATE_BACKUP_VERSION = 1;
        const STATE_BACKUP_APP = 'debate-team-randomizer';

        function collectDebateUiExtras() {
            const extras = {};
            debates.forEach(debate => {
                const notesEl = document.getElementById(`notes-${debate.number}`);
                extras[debate.number] = {
                    notes: notesEl ? notesEl.value : '',
                    argumentsByMember: captureArgumentSnapshotsByName(debate)
                };
            });
            return extras;
        }

        function collectAppState() {
            const formatSelect = document.getElementById('debate-format');
            const limitCheckbox = document.getElementById('limit-team-size');
            const teamsRandomizeEl = document.getElementById('teams-randomize-sides');
            const pairs = currentMode === 'teams' ? getTeamPairsFromInputs() : teamPairs;

            return {
                version: STATE_BACKUP_VERSION,
                app: STATE_BACKUP_APP,
                exportedAt: new Date().toISOString(),
                settings: {
                    currentMode,
                    formatId: formatSelect ? formatSelect.value : 'ap',
                    includeReply: document.getElementById('include-reply')?.checked ?? false,
                    classTitle: document.getElementById('class-title')?.value ?? '',
                    hrTeacher: document.getElementById('hr-teacher')?.value ?? '',
                    limitTeamSize: limitCheckbox ? limitCheckbox.checked : true,
                    maxTeamSize: parseInt(document.getElementById('max-team-size')?.value, 10) || 3,
                    teamsRandomizeSides: teamsRandomizeEl ? teamsRandomizeEl.checked : true,
                    customFormatName: document.getElementById('custom-format-name')?.value ?? '',
                    customGovName: document.getElementById('custom-gov-name')?.value ?? '',
                    customOppName: document.getElementById('custom-opp-name')?.value ?? ''
                },
                students: [...students],
                roleHistory: JSON.parse(JSON.stringify(roleHistory)),
                customGovRoles: [...customGovRoles],
                customOppRoles: [...customOppRoles],
                savedCustomFormats: JSON.parse(JSON.stringify(savedCustomFormats)),
                teamPairs: JSON.parse(JSON.stringify(pairs)),
                debates: debates.map(d => {
                    const { format, ...rest } = d;
                    return JSON.parse(JSON.stringify(rest));
                }),
                debateUi: collectDebateUiExtras()
            };
        }

        function exportStateJson() {
            const state = collectAppState();
            const json = JSON.stringify(state, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const datePart = new Date().toISOString().slice(0, 10);
            const a = document.createElement('a');
            a.href = url;
            a.download = `debate-randomizer-backup-${datePart}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function triggerImportState() {
            const input = document.getElementById('state-file-input');
            if (!input) return;
            input.value = '';
            input.click();
        }

        function handleStateFileSelected(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    importStateFromJson(data);
                } catch (err) {
                    alert('Could not read backup file. Make sure it is a valid JSON backup from this app.\n\n' + (err.message || String(err)));
                }
            };
            reader.onerror = () => alert('Could not read the selected file.');
            reader.readAsText(file);
        }

        function resolveFormatForDebate(settings) {
            if (!settings || !settings.formatId) return getCurrentFormat();
            const base = debateFormats[settings.formatId];
            if (!base) return getCurrentFormat();
            let format = { ...base };
            if (settings.formatId === 'custom') {
                format.govName = settings.customGovName || 'Government';
                format.oppName = settings.customOppName || 'Opposition';
                format.govRoles = [...customGovRoles];
                format.oppRoles = [...customOppRoles];
            }
            if (settings.includeReply && format.replyRoles) {
                format.govRoles = [...format.govRoles, { ...format.replyRoles.gov, isReply: true }];
                format.oppRoles = [...format.oppRoles, { ...format.replyRoles.opp, isReply: true }];
            }
            return format;
        }

        function applyDebateUiExtras(extras) {
            if (!extras) return;
            debates.forEach(debate => {
                const e = extras[debate.number] ?? extras[String(debate.number)];
                if (!e) return;
                const notesEl = document.getElementById(`notes-${debate.number}`);
                if (notesEl && e.notes != null) notesEl.value = e.notes;
                if (e.argumentsByMember) applyArgumentSnapshotsByName(debate, e.argumentsByMember);
            });
        }

        function restoreTeamPairsFromBackup(pairs) {
            if (pairs && pairs.length > 0) {
                teamPairs = pairs.map(p => ({
                    id: p.id || Date.now() + Math.floor(Math.random() * 10000),
                    teamA: { name: (p.teamA && p.teamA.name) || '', members: [...((p.teamA && p.teamA.members) || [])] },
                    teamB: { name: (p.teamB && p.teamB.name) || '', members: [...((p.teamB && p.teamB.members) || [])] }
                }));
            } else {
                teamPairs = [];
                addTeamPair();
                return;
            }
            renderTeamPairs();
        }

        function persistStateToLocalStorage(settings) {
            if (usingClassManagerBridge()) {
                saveSession();
                return;
            }
            saveStudents();
            persistCustomFormats();
            if (settings && settings.classTitle != null) {
                localStorage.setItem('debateClassTitle', settings.classTitle);
            }
            if (settings && settings.hrTeacher != null) {
                localStorage.setItem('debateHrTeacher', settings.hrTeacher);
            }
        }

        function importStateFromJson(data, options) {
            options = options || {};
            const silent = !!options.silent;
            if (!data || typeof data !== 'object') {
                if (!silent) alert('Invalid backup: file is empty or not a JSON object.');
                return;
            }
            if (!silent && data.app && data.app !== STATE_BACKUP_APP) {
                if (!confirm('This file may be from a different app. Load it anyway?')) return;
            }
            if (!silent && data.version != null && data.version > STATE_BACKUP_VERSION) {
                if (!confirm('This backup was made with a newer version of the app. Some details might not restore correctly. Continue?')) return;
            }

            const hasExisting = students.length > 0 || debates.length > 0;
            if (!silent && hasExisting && !confirm('Loading a backup will replace your current students, teams, and debate assignments. Continue?')) {
                return;
            }

            const settings = data.settings || {};

            students = Array.isArray(data.students) ? [...data.students] : [];
            roleHistory = data.roleHistory && typeof data.roleHistory === 'object' ? JSON.parse(JSON.stringify(data.roleHistory)) : {};
            customGovRoles = Array.isArray(data.customGovRoles) ? [...data.customGovRoles] : [];
            customOppRoles = Array.isArray(data.customOppRoles) ? [...data.customOppRoles] : [];
            savedCustomFormats = Array.isArray(data.savedCustomFormats) ? JSON.parse(JSON.stringify(data.savedCustomFormats)) : [];

            const formatSelect = document.getElementById('debate-format');
            if (formatSelect && settings.formatId && debateFormats[settings.formatId]) {
                formatSelect.value = settings.formatId;
            }
            const includeReplyEl = document.getElementById('include-reply');
            if (includeReplyEl && settings.includeReply != null) includeReplyEl.checked = !!settings.includeReply;

            const classTitleEl = document.getElementById('class-title');
            if (classTitleEl && settings.classTitle != null) classTitleEl.value = settings.classTitle;

            const hrTeacherEl = document.getElementById('hr-teacher');
            if (hrTeacherEl && settings.hrTeacher != null) hrTeacherEl.value = settings.hrTeacher;

            const limitCheckbox = document.getElementById('limit-team-size');
            const maxTeamSizeGroup = document.getElementById('max-team-size-group');
            if (limitCheckbox && settings.limitTeamSize != null) {
                limitCheckbox.checked = !!settings.limitTeamSize;
                if (maxTeamSizeGroup) maxTeamSizeGroup.style.display = limitCheckbox.checked ? 'block' : 'none';
            }
            const maxTeamSizeEl = document.getElementById('max-team-size');
            if (maxTeamSizeEl && settings.maxTeamSize != null) maxTeamSizeEl.value = settings.maxTeamSize;

            const teamsRandomizeEl = document.getElementById('teams-randomize-sides');
            if (teamsRandomizeEl && settings.teamsRandomizeSides != null) {
                teamsRandomizeEl.checked = !!settings.teamsRandomizeSides;
            }

            const customNameEl = document.getElementById('custom-format-name');
            if (customNameEl && settings.customFormatName != null) customNameEl.value = settings.customFormatName;
            const customGovNameEl = document.getElementById('custom-gov-name');
            if (customGovNameEl && settings.customGovName != null) customGovNameEl.value = settings.customGovName;
            const customOppNameEl = document.getElementById('custom-opp-name');
            if (customOppNameEl && settings.customOppName != null) customOppNameEl.value = settings.customOppName;

            updateCustomRolesDisplay();
            onFormatChange();

            setMode(settings.currentMode === 'teams' ? 'teams' : 'random');
            updateStudentList();
            restoreTeamPairsFromBackup(data.teamPairs);

            const restoredFormat = resolveFormatForDebate(settings);
            debates = Array.isArray(data.debates)
                ? data.debates.map(d => ({ ...d, format: restoredFormat }))
                : [];

            persistStateToLocalStorage(settings);

            if (debates.length > 0) {
                displayResults();
                applyDebateUiExtras(data.debateUi);
                clearResultsStale();
            } else {
                document.getElementById('results-section')?.classList.add('hidden');
            }
            updateStickyBar();
            notifyResultsVisibility();
            if (!options.silent) alert('Backup loaded successfully.');
        }

        // ========================================
        // COPY RESULTS
        // ========================================
        function copyResults() {
            const classTitle = document.getElementById('class-title').value.trim();
            const format = getCurrentFormat();

            let text = classTitle ? `${classTitle}\n` : 'DEBATE TEAM ASSIGNMENTS\n';
            text += `Format: ${format.name}\n`;
            if (currentMode === 'teams') {
                text += `(Sides randomly assigned)\n`;
            }
            text += '='.repeat(40) + '\n\n';

            debates.forEach(debate => {
                text += `DEBATE ${debate.number}\n`;
                text += '-'.repeat(20) + '\n';
                text += buildSpeakingOrderCopySection(debate);
                const notesEl = document.getElementById(`notes-${debate.number}`);
                if (notesEl && notesEl.value.trim()) {
                    text += `Notes: ${notesEl.value.trim()}\n`;
                }
                text += '\n';
            });

            navigator.clipboard.writeText(text).then(() => {
                alert('Results copied to clipboard!');
            }).catch(() => {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                alert('Results copied to clipboard!');
            });
        }
    

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
    importStudentsFromNames,
    addStudent,
    removeStudent,
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
