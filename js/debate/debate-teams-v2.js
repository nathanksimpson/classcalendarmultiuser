/**
 * Debate Teams v2 — sidebar layout engine (port of bundled Debate Teams.html).
 */
(function (global) {
    const FORMATS = {
        ap: {
            name: 'Asia Parliamentary (AP)',
            min: 4,
            govName: 'Proposition',
            oppName: 'Opposition',
            govRoles: [
                { abbr: 'PM', name: 'Prime Minister' },
                { abbr: 'DPM', name: 'Deputy Prime Minister' },
                { abbr: 'GW', name: 'Government Whip', isWhip: true }
            ],
            oppRoles: [
                { abbr: 'LO', name: 'Leader of Opposition' },
                { abbr: 'DLO', name: 'Deputy Leader of Opposition' },
                { abbr: 'OW', name: 'Opposition Whip', isWhip: true }
            ],
            reply: {
                gov: { abbr: 'GR', name: 'Government Reply', isReply: true },
                opp: { abbr: 'OR', name: 'Opposition Reply', isReply: true }
            },
            order: ['PM', 'LO', 'DPM', 'DLO', 'GW', 'OW', 'OR', 'GR']
        },
        bp: {
            name: 'British Parliamentary (BP)',
            min: 8,
            fourTeam: true,
            benches: [
                { id: 'og', name: 'Opening Government' },
                { id: 'oo', name: 'Opening Opposition' },
                { id: 'cg', name: 'Closing Government' },
                { id: 'co', name: 'Closing Opposition' }
            ],
            roles: {
                og: [
                    { abbr: 'PM', name: 'Prime Minister' },
                    { abbr: 'DPM', name: 'Deputy Prime Minister' }
                ],
                oo: [
                    { abbr: 'LO', name: 'Leader of Opposition' },
                    { abbr: 'DLO', name: 'Deputy Leader of Opposition' }
                ],
                cg: [
                    { abbr: 'MG', name: 'Member of Government' },
                    { abbr: 'GW', name: 'Government Whip', isWhip: true }
                ],
                co: [
                    { abbr: 'MO', name: 'Member of Opposition' },
                    { abbr: 'OW', name: 'Opposition Whip', isWhip: true }
                ]
            },
            order: ['PM', 'LO', 'DPM', 'DLO', 'MG', 'MO', 'GW', 'OW']
        },
        wudc: {
            name: 'WUDC (World Universities)',
            min: 8,
            fourTeam: true,
            benches: [
                { id: 'og', name: 'Opening Government' },
                { id: 'oo', name: 'Opening Opposition' },
                { id: 'cg', name: 'Closing Government' },
                { id: 'co', name: 'Closing Opposition' }
            ],
            roles: {
                og: [
                    { abbr: 'PM', name: 'Prime Minister' },
                    { abbr: 'DPM', name: 'Deputy Prime Minister' }
                ],
                oo: [
                    { abbr: 'LO', name: 'Leader of Opposition' },
                    { abbr: 'DLO', name: 'Deputy Leader of Opposition' }
                ],
                cg: [
                    { abbr: 'MG', name: 'Member of Government' },
                    { abbr: 'GW', name: 'Government Whip', isWhip: true }
                ],
                co: [
                    { abbr: 'MO', name: 'Member of Opposition' },
                    { abbr: 'OW', name: 'Opposition Whip', isWhip: true }
                ]
            },
            order: ['PM', 'LO', 'DPM', 'DLO', 'MG', 'MO', 'GW', 'OW']
        },
        policy: {
            name: 'Policy Debate (CX)',
            min: 4,
            govName: 'Affirmative',
            oppName: 'Negative',
            govRoles: [
                { abbr: '1A', name: 'First Affirmative' },
                { abbr: '2A', name: 'Second Affirmative' }
            ],
            oppRoles: [
                { abbr: '1N', name: 'First Negative' },
                { abbr: '2N', name: 'Second Negative' }
            ],
            order: ['1AC', '1NC', '2AC', '2NC'],
            aliases: { '1AC': '1A', '2AC': '2A', '1NC': '1N', '2NC': '2N' }
        },
        ld: {
            name: 'Lincoln-Douglas (LD)',
            min: 2,
            oneVsOne: true,
            govName: 'Affirmative',
            oppName: 'Negative',
            govRoles: [{ abbr: 'AFF', name: 'Affirmative' }],
            oppRoles: [{ abbr: 'NEG', name: 'Negative' }],
            order: ['AC', 'NC'],
            aliases: { AC: 'AFF', NC: 'NEG' }
        },
        pf: {
            name: 'Public Forum (PF)',
            min: 4,
            govName: 'Pro',
            oppName: 'Con',
            govRoles: [
                { abbr: '1st Pro', name: 'First Speaker Pro' },
                { abbr: '2nd Pro', name: 'Second Speaker Pro' }
            ],
            oppRoles: [
                { abbr: '1st Con', name: 'First Speaker Con' },
                { abbr: '2nd Con', name: 'Second Speaker Con' }
            ],
            order: ['1st Pro', '1st Con', '2nd Pro', '2nd Con']
        },
        bf: {
            name: 'Balloon/Forum Debate (BF)',
            min: 4,
            govName: 'Team A',
            oppName: 'Team B',
            govRoles: [
                { abbr: 'A1', name: 'Speaker 1' },
                { abbr: 'A2', name: 'Speaker 2' },
                { abbr: 'A3', name: 'Speaker 3' }
            ],
            oppRoles: [
                { abbr: 'B1', name: 'Speaker 1' },
                { abbr: 'B2', name: 'Speaker 2' },
                { abbr: 'B3', name: 'Speaker 3' }
            ],
            order: ['A1', 'B1', 'A2', 'B2', 'A3', 'B3']
        },
        knc: {
            name: 'KNC (Korea National Congress)',
            min: 4,
            govName: 'Affirmative',
            oppName: 'Negative',
            govRoles: [
                { abbr: 'Aff Rep', name: 'Affirmative Representative' },
                { abbr: 'Aff 2', name: 'Affirmative Second' }
            ],
            oppRoles: [
                { abbr: 'Neg Rep', name: 'Negative Representative' },
                { abbr: 'Neg 2', name: 'Negative Second' }
            ],
            order: ['Aff Rep', 'Neg Rep', 'Aff 2', 'Neg 2']
        },
        simson: {
            name: 'Simson Format',
            min: 4,
            govName: 'Government',
            oppName: 'Opposition',
            govRoles: [
                { abbr: 'PM', name: 'Prime Minister' },
                { abbr: 'DPM', name: 'Deputy Prime Minister' },
                { abbr: 'DPM2', name: 'Deputy Prime Minister 2' }
            ],
            oppRoles: [
                { abbr: 'LO', name: 'Leader of Opposition' },
                { abbr: 'DLO', name: 'Deputy Leader of Opposition' },
                { abbr: 'DLO2', name: 'Deputy Leader of Opposition 2' }
            ],
            order: ['PM', 'LO', 'DPM', 'DLO', 'DPM2', 'DLO2']
        },
        simple: {
            name: 'Simple (No Roles)',
            min: 4,
            govName: 'Proposition',
            oppName: 'Opposition',
            govRoles: [],
            oppRoles: [],
            order: []
        },
        purple: {
            name: 'Purple (PM / LO only)',
            min: 1,
            fixedTeamSize: 1,
            allowSoloDebate: true,
            govName: 'Proposition',
            oppName: 'Opposition',
            govRoles: [{ abbr: 'PM', name: 'Prime Minister' }],
            oppRoles: [{ abbr: 'LO', name: 'Leader of Opposition' }],
            order: ['PM', 'LO']
        }
    };

    const COLORS = {
        gov: '#3d6b5e',
        opp: '#8c4a3f',
        og: '#3d6b5e',
        oo: '#8c4a3f',
        cg: '#2b4f45',
        co: '#6d3630'
    };

    let root = null;
    let mountElRef = null;
    let bridge = null;
    let eventsAbort = null;
    let toastTimer = null;
    let pasteOpen = false;
    const PRINT_CARDS_CLASS = 'print-debate-cards-only';
    let printCardsCleanupTimer = null;
    let printHooksBound = false;
    const showArguments = true;
    const showNotes = true;

    const state = {
        version: 2,
        students: [],
        formatId: 'ap',
        includeReply: false,
        maxTeamSize: 3,
        classTitle: '',
        hrTeacher: '',
        topic: '',
        sheetTemplate: 'garam',
        purpleMode: false,
        debates: []
    };

    function effectiveFormatId() {
        return state.purpleMode ? 'purple' : state.formatId;
    }

    function activeFormatLabel() {
        return state.purpleMode ? FORMATS.purple.name : baseFmt(state.formatId).name;
    }

    function applyPurpleModeSettings(on) {
        if (!on) {
            return;
        }
        state.maxTeamSize = 1;
        state.includeReply = false;
        state.sheetTemplate = 'yeoul';
    }

    function normalizePurpleSession(session) {
        const s = session || {};
        if (s.purpleMode === true || s.purpleMode === '1') {
            s.purpleMode = true;
            return s;
        }
        if (s.formatId === 'purple') {
            s.purpleMode = true;
            s.formatId = 'ap';
        } else {
            s.purpleMode = false;
        }
        return s;
    }

    function t(key) {
        return bridge && bridge.t ? bridge.t(key) : key;
    }

    function escapeHtml(s) {
        if (global.CCPUtils && global.CCPUtils.escapeHtml) {
            return global.CCPUtils.escapeHtml(s);
        }
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function resolveShell(mountEl) {
        if (!mountEl) {
            return null;
        }
        if (mountEl.querySelector) {
            return mountEl.querySelector('.classroom-debate-v2') || mountEl;
        }
        return mountEl;
    }

    function el(id) {
        return root ? root.querySelector('#' + id) : null;
    }

    function hasLiveDom() {
        return !!(root && el('debateV2Generate'));
    }

    function ensureRootBound() {
        if (!mountElRef) {
            return;
        }
        const shell = resolveShell(mountElRef);
        if (!shell) {
            return;
        }
        if (shell !== root || !hasLiveDom()) {
            root = shell;
            bindEvents();
        }
    }

    function notifySave() {
        if (bridge && bridge.onSave) {
            bridge.onSave(collectState());
        }
    }

    function notifyStudentsEdited() {
        if (bridge && bridge.onStudentsEdited) {
            bridge.onStudentsEdited();
            return;
        }
        notifySave();
    }

    function isEditable() {
        if (bridge && bridge.canEdit) {
            return !!bridge.canEdit();
        }
        return true;
    }

    function guardEdit() {
        if (!isEditable()) {
            showToast(t('classroomDebateViewOnly') || 'You can only edit debate teams for classes you teach.');
            return false;
        }
        return true;
    }

    function clearDebatesOnStudentChange() {
        if (state.debates.length) {
            state.debates = [];
        }
    }

    function showToast(msg) {
        const toastEl = el('debateV2Toast');
        if (!toastEl) {
            return;
        }
        toastEl.textContent = msg;
        toastEl.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastEl.hidden = true;
        }, 2200);
    }

    function baseFmt(id) {
        return FORMATS[id] || FORMATS.ap;
    }

    function fmt() {
        if (state.purpleMode) {
            return Object.assign({}, FORMATS.purple);
        }
        const base = baseFmt(state.formatId);
        const f = Object.assign({}, base);
        if (state.includeReply && base.reply) {
            f.govRoles = [...base.govRoles, Object.assign({}, base.reply.gov)];
            f.oppRoles = [...base.oppRoles, Object.assign({}, base.reply.opp)];
        }
        return f;
    }

    function effOrder(f) {
        const has = new Set();
        if (f.fourTeam) {
            Object.values(f.roles).forEach((rs) => rs.forEach((r) => has.add(r.abbr)));
        } else {
            (f.govRoles || []).forEach((r) => has.add(r.abbr));
            (f.oppRoles || []).forEach((r) => has.add(r.abbr));
        }
        return (f.order || []).filter((token) => {
            const base = String(token).replace('*', '');
            return has.has((f.aliases && f.aliases[base]) || base);
        });
    }

    function roleAbbrKey(f, token) {
        const base = String(token || '').replace('*', '');
        return (f && f.aliases && f.aliases[base]) || base;
    }

    function findMemberByRoleAbbr(debate, abbr) {
        if (!debate || !abbr || !Array.isArray(debate.benches)) {
            return null;
        }
        for (let bi = 0; bi < debate.benches.length; bi++) {
            const members = debate.benches[bi].members || [];
            for (let mi = 0; mi < members.length; mi++) {
                const m = members[mi];
                if (m.role && m.role.abbr === abbr) {
                    return m;
                }
            }
        }
        return null;
    }

    /** Index in speaking order, or -1 if missing. */
    function speakingIndex(debate, memberRoleAbbr) {
        if (!debate || !memberRoleAbbr) {
            return -1;
        }
        const f = baseFmt(debate.formatId);
        const order = debate.order || f.order || [];
        const myKey = roleAbbrKey(f, memberRoleAbbr);
        for (let i = 0; i < order.length; i++) {
            if (roleAbbrKey(f, order[i]) === myKey) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Previous speaker in debate order, or null if this role opens (index 0) / unknown.
     * Returns { name, roleAbbr } when a prior slot exists.
     */
    function previousSpeaker(debate, memberRoleAbbr) {
        const idx = speakingIndex(debate, memberRoleAbbr);
        if (idx <= 0) {
            return null;
        }
        const f = baseFmt(debate.formatId);
        const order = debate.order || f.order || [];
        const priorAbbr = roleAbbrKey(f, order[idx - 1]);
        const prior = findMemberByRoleAbbr(debate, priorAbbr);
        return {
            name: (prior && prior.name) || priorAbbr,
            roleAbbr: (prior && prior.role && prior.role.abbr) || priorAbbr
        };
    }

    /** Left arg field: Introduce (first speaker) or Rebut {name} ({role}). */
    function leftArgMeta(debate, member) {
        if (!member || !member.role) {
            return {
                kind: 'rebut',
                label: t('classroomDebateV2Rebut') || 'Rebut',
                placeholder: 'Arguments to rebut'
            };
        }
        const idx = speakingIndex(debate, member.role.abbr);
        if (idx === 0) {
            return {
                kind: 'introduce',
                label: t('classroomDebateV2Introduce') || 'Introduce',
                placeholder: 'Arguments to introduce'
            };
        }
        const prior = previousSpeaker(debate, member.role.abbr);
        if (prior) {
            const template = t('classroomDebateV2RebutTarget') || 'Rebut {name} ({role})';
            return {
                kind: 'rebut',
                label: template.replace('{name}', prior.name).replace('{role}', prior.roleAbbr),
                placeholder: 'Arguments to rebut'
            };
        }
        return {
            kind: 'rebut',
            label: t('classroomDebateV2Rebut') || 'Rebut',
            placeholder: 'Arguments to rebut'
        };
    }

    function effMax(f) {
        if (f.fixedTeamSize) {
            return f.fixedTeamSize;
        }
        if (f.fourTeam) {
            return 2;
        }
        if (f.oneVsOne) {
            return 1;
        }
        const v = parseInt(state.maxTeamSize, 10);
        return Number.isNaN(v) ? 3 : Math.min(10, Math.max(1, v));
    }

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function genTwo(list, f) {
        const maxPer = effMax(f) * 2;
        const minDebateSize = f.allowSoloDebate ? 1 : 2;
        const d = Math.max(1, Math.ceil(list.length / maxPer));
        const sizes = Array(d).fill(0);
        for (let i = 0; i < list.length; i++) {
            sizes[i % d]++;
        }
        if (!f.allowSoloDebate) {
            for (let i = 0; i < sizes.length; i++) {
                for (let j = i + 1; j < sizes.length; j++) {
                    if (sizes[i] % 2 === 1 && sizes[j] % 2 === 1 && sizes[i] + 1 <= maxPer && sizes[j] - 1 >= 2) {
                        sizes[i]++;
                        sizes[j]--;
                    }
                }
            }
        }
        let idx = 0;
        const out = [];
        sizes.forEach((sz) => {
            if (sz < minDebateSize) {
                return;
            }
            const chunk = list.slice(idx, idx + sz);
            idx += sz;
            const gov = [];
            const opp = [];
            chunk.forEach((name, i) => {
                const arr = i % 2 === 0 ? gov : opp;
                const roles = i % 2 === 0 ? f.govRoles : f.oppRoles;
                arr.push({
                    name,
                    role: roles[arr.length] ? Object.assign({}, roles[arr.length]) : null,
                    present: '',
                    rebut: ''
                });
            });
            out.push({
                number: out.length + 1,
                formatId: effectiveFormatId(),
                fourTeam: false,
                notes: '',
                order: effOrder(f),
                benches: [
                    { id: 'gov', label: f.govName, members: gov },
                    { id: 'opp', label: f.oppName, members: opp }
                ]
            });
        });
        return out;
    }

    function assignDebates() {
        const f = fmt();
        const shuffled = shuffle(state.students);
        return f.fourTeam ? genFour(shuffled, f) : genTwo(shuffled, f);
    }

    function genFour(list, f) {
        const out = [];
        let idx = 0;
        const seat = ['og', 'oo', 'og', 'oo', 'cg', 'co', 'cg', 'co'];
        while (idx + 8 <= list.length) {
            const chunk = list.slice(idx, idx + 8);
            idx += 8;
            const benches = f.benches.map((b) => ({ id: b.id, label: b.name, members: [] }));
            chunk.forEach((name, i) => {
                const bench = benches.find((x) => x.id === seat[i]);
                const roles = f.roles[seat[i]];
                bench.members.push({
                    name,
                    role: roles[bench.members.length] ? Object.assign({}, roles[bench.members.length]) : null,
                    present: '',
                    rebut: ''
                });
            });
            out.push({
                number: out.length + 1,
                formatId: state.formatId,
                fourTeam: true,
                notes: '',
                order: effOrder(f),
                benches
            });
        }
        const left = list.slice(idx);
        if (left.length >= 4) {
            const gov = [];
            const opp = [];
            left.forEach((name, i) => {
                const arr = i % 2 === 0 ? gov : opp;
                const roles = i % 2 === 0 ? f.roles.og : f.roles.oo;
                arr.push({
                    name,
                    role: roles[arr.length] ? Object.assign({}, roles[arr.length]) : null,
                    present: '',
                    rebut: ''
                });
            });
            out.push({
                number: out.length + 1,
                formatId: state.formatId,
                fourTeam: false,
                simplified: true,
                notes: '',
                order: ['PM', 'LO', 'DPM', 'DLO'],
                benches: [
                    { id: 'gov', label: 'Government', members: gov },
                    { id: 'opp', label: 'Opposition', members: opp }
                ]
            });
        } else if (left.length && out.length) {
            const benches = out[out.length - 1].benches;
            left.forEach((name, i) =>
                benches[i % benches.length].members.push({ name, role: null, present: '', rebut: '' })
            );
        }
        return out;
    }

    function hasEdits() {
        return state.debates.some(
            (d) =>
                (d.notes && d.notes.trim()) ||
                d.benches.some((b) => b.members.some((m) => (m.present && m.present.trim()) || (m.rebut && m.rebut.trim())))
        );
    }

    function generateDebates() {
        if (!guardEdit()) {
            return;
        }
        const f = fmt();
        const n = state.students.length;
        if (n < f.min) {
            alert(
                (t('classroomDebateNeedMinStudents') || 'Please add at least {count} students for {format}.')
                    .replace('{count}', String(f.min))
                    .replace('{format}', f.name)
            );
            return;
        }
        if (state.debates.length) {
            if (!confirm(t('classroomDebateV2RegenerateConfirm') || t('classroomDebateConfirmRegenerateLossy'))) {
                return;
            }
        }
        const shuffled = shuffle(state.students);
        state.debates = assignDebates();
        notifySave();
        render();
    }

    function updMember(di, bi, mi, key, val) {
        if (!guardEdit()) {
            return;
        }
        const debates = state.debates;
        if (!debates[di] || !debates[di].benches[bi] || !debates[di].benches[bi].members[mi]) {
            return;
        }
        debates[di].benches[bi].members[mi][key] = val;
        notifySave();
    }

    function updNotes(di, val) {
        if (!guardEdit()) {
            return;
        }
        if (!state.debates[di]) {
            return;
        }
        state.debates[di].notes = val;
        notifySave();
    }

    function exportName(name) {
        const m = String(name).match(/\(\s*([A-Za-z][^)]*)\)/);
        return m ? m[1].trim() : name;
    }

    function speakers() {
        const out = [];
        state.debates.forEach((d) => {
            const f = baseFmt(d.formatId);
            const rank = new Map();
            (d.order || f.order || []).forEach((token, i) => {
                const base = String(token).replace('*', '');
                const abbr = (f.aliases && f.aliases[base]) || base;
                if (!rank.has(abbr)) {
                    rank.set(abbr, i);
                }
            });
            const all = [];
            d.benches.forEach((b) =>
                b.members.forEach((m) => {
                    if (!m.name) {
                        return;
                    }
                    all.push({
                        name: exportName(m.name),
                        roleAbbr: m.role ? m.role.abbr : '',
                        roleName: m.role ? m.role.name : '',
                        debate: String(d.number),
                        bench: b.label,
                        _r: m.role && rank.has(m.role.abbr) ? rank.get(m.role.abbr) : 999
                    });
                })
            );
            all.sort((a, b) => a._r - b._r);
            out.push(...all);
        });
        return out;
    }

    function exportContext() {
        return {
            classTitle: state.classTitle.trim(),
            hrTeacher: state.hrTeacher.trim(),
            formatName: activeFormatLabel(),
            sheetTemplate: state.sheetTemplate,
            speakers: speakers()
        };
    }

    function formatSummary(f) {
        if (f.fourTeam) {
            return '4 benches of 2 (' + f.min + ' per room) · ' + f.order.join(' → ');
        }
        if (f.oneVsOne) {
            return '1 v 1 · values & philosophy';
        }
        const g = f.govRoles.map((r) => r.abbr).join(', ');
        const o = f.oppRoles.map((r) => r.abbr).join(', ');
        if (!f.govRoles.length) {
            return 'Two teams, no assigned roles · min ' + f.min;
        }
        let summary = f.govRoles.length + ' v ' + f.oppRoles.length + ' · ' + g + ' / ' + o + ' · min ' + f.min;
        if (f.allowSoloDebate) {
            summary += ' · odd student solo PM';
        }
        return summary;
    }

    function parseRoster(text) {
        const out = [];
        const re = /([가-힣]{2,4})\s*★*\s*\n?\s*\(\s*([A-Za-z][A-Za-z\-.' ]*)\s*\)/g;
        let m;
        while ((m = re.exec(text))) {
            const name = m[1] + ' (' + m[2].trim() + ')';
            if (!out.includes(name)) {
                out.push(name);
            }
        }
        return out;
    }

    function looksLikeRoster(text) {
        return /촬영\s*알림|\tSMS|출석\s*지각|Test Point/.test(text);
    }

    function addPaste() {
        if (!guardEdit()) {
            return;
        }
        const raw = el('debateV2PasteText') ? el('debateV2PasteText').value : '';
        let names;
        if (looksLikeRoster(raw)) {
            names = parseRoster(raw);
            if (!names.length) {
                names = raw
                    .split('\n')
                    .map((n) => n.trim())
                    .filter(Boolean);
            }
        } else {
            names = raw
                .split('\n')
                .map((n) => n.replace(/^\s*\d+[.)]\s*/, '').replace(/★+/g, '').trim())
                .filter(Boolean);
        }
        let added = 0;
        names.forEach((n) => {
            if (!state.students.includes(n)) {
                state.students.push(n);
                added++;
            }
        });
        if (added) {
            el('debateV2PasteText').value = '';
            pasteOpen = false;
            clearDebatesOnStudentChange();
            notifyStudentsEdited();
        } else {
            notifySave();
        }
        render();
        showToast(
            added
                ? (t('classroomDebateV2AddedStudents') || 'Added {count} student(s)').replace(
                      '{count}',
                      String(added)
                  )
                : t('classroomDebateV2NoNewNames') || 'No new names to add'
        );
    }

    function copyResults() {
        let text = (state.classTitle.trim() || 'DEBATE TEAM ASSIGNMENTS') + '\n';
        if (state.topic.trim()) {
            text += 'Motion: ' + state.topic.trim() + '\n';
        }
        text += 'Format: ' + activeFormatLabel() + '\n' + '='.repeat(40) + '\n\n';
        state.debates.forEach((d) => {
            text += 'DEBATE ' + d.number + '\n' + '-'.repeat(20) + '\n';
            d.benches.forEach((b) => {
                text += b.label + ':\n';
                b.members.forEach((m) => {
                    text += '  * ' + m.name + (m.role ? ' (' + m.role.abbr + ')' : '') + '\n';
                    const left = leftArgMeta(d, m);
                    if (m.rebut && m.rebut.trim()) {
                        text += '    ' + left.label + ': ' + m.rebut.trim() + '\n';
                    }
                    if (m.present && m.present.trim()) {
                        text += '    Present: ' + m.present.trim() + '\n';
                    }
                });
            });
            if (d.notes && d.notes.trim()) {
                text += 'Notes: ' + d.notes.trim() + '\n';
            }
            text += '\n';
        });
        navigator.clipboard.writeText(text).then(
            () => showToast(t('classroomDebateCopySuccess') || 'Results copied to clipboard'),
            () => showToast(t('classroomDebateCopyFailed') || 'Copy failed — select and copy manually')
        );
    }

    function exportJson() {
        const data = {
            app: 'debate-teams',
            version: 2,
            exportedAt: new Date().toISOString(),
            students: state.students,
            formatId: state.formatId,
            purpleMode: state.purpleMode,
            includeReply: state.includeReply,
            maxTeamSize: state.maxTeamSize,
            classTitle: state.classTitle,
            hrTeacher: state.hrTeacher,
            topic: state.topic,
            sheetTemplate: state.sheetTemplate,
            debates: state.debates
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'debate-teams-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showToast(t('classroomDebateV2BackupSaved') || 'Backup downloaded');
    }

    function importJsonFile(file) {
        if (!guardEdit()) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                if (data.app === 'debate-teams' && Array.isArray(data.students)) {
                    if (
                        (state.students.length || state.debates.length) &&
                        !confirm(t('classroomDebateV2BackupLoadConfirm') || 'Loading a backup replaces your current students and assignments. Continue?')
                    ) {
                        return;
                    }
                    applyV2Payload(data);
                    showToast(t('classroomDebateV2BackupLoaded') || 'Backup loaded');
                } else if (data.app === 'debate-team-randomizer') {
                    if (
                        (state.students.length || state.debates.length) &&
                        !confirm(
                            t('classroomDebateV2OldBackupConfirm') ||
                                'This is a backup from the old app. Students and settings will load; assignments must be regenerated. Continue?'
                        )
                    ) {
                        return;
                    }
                    const st = data.settings || {};
                    state.students = Array.isArray(data.students) ? data.students : [];
                    state.formatId = FORMATS[st.formatId] ? st.formatId : 'ap';
                    state.includeReply = !!st.includeReply;
                    state.maxTeamSize = st.maxTeamSize || 3;
                    state.classTitle = st.classTitle || '';
                    state.hrTeacher = st.hrTeacher || '';
                    state.debates = [];
                    notifySave();
                    render();
                    showToast(t('classroomDebateV2OldBackup') || 'Old backup loaded — press Generate teams');
                } else {
                    alert('This file is not a recognised backup from this app.');
                }
            } catch (err) {
                alert('Could not read backup file: ' + (err.message || err));
            }
        };
        reader.onerror = () => alert('Could not read the selected file.');
        reader.readAsText(file);
    }

    function applyV2Payload(data) {
        normalizePurpleSession(data);
        state.students = Array.isArray(data.students) ? data.students.slice() : [];
        state.formatId = FORMATS[data.formatId] ? data.formatId : 'ap';
        state.purpleMode = !!data.purpleMode;
        state.includeReply = !!data.includeReply;
        state.maxTeamSize = data.maxTeamSize || 3;
        state.classTitle = data.classTitle || '';
        state.hrTeacher = data.hrTeacher || '';
        state.topic = data.topic || '';
        state.sheetTemplate = data.sheetTemplate === 'yeoul' ? 'yeoul' : 'garam';
        state.debates = Array.isArray(data.debates) ? JSON.parse(JSON.stringify(data.debates)) : [];
        notifySave();
        render();
    }

    function migrateOldSession(sessionState) {
        if (!sessionState || typeof sessionState !== 'object') {
            return null;
        }
        if (sessionState.version === 2 || (sessionState.debates && sessionState.debates[0] && sessionState.debates[0].benches)) {
            return sessionState;
        }
        const settings = sessionState.settings || {};
        const migrated = {
            version: 2,
            students: Array.isArray(sessionState.students) ? sessionState.students.slice() : [],
            formatId: FORMATS[settings.formatId] ? settings.formatId : sessionState.formatId || 'ap',
            includeReply: !!(settings.includeReply ?? sessionState.includeReply),
            maxTeamSize: settings.maxTeamSize || sessionState.maxTeamSize || 3,
            classTitle: settings.classTitle || sessionState.classTitle || '',
            hrTeacher: settings.hrTeacher || sessionState.hrTeacher || '',
            topic: sessionState.topic || '',
            sheetTemplate: sessionState.sheetTemplate === 'yeoul' ? 'yeoul' : 'garam',
            debates: []
        };
        if (Array.isArray(sessionState.debates)) {
            sessionState.debates.forEach((d, idx) => {
                if (d.benches) {
                    migrated.debates.push(JSON.parse(JSON.stringify(d)));
                    return;
                }
                const formatId = d.formatId || migrated.formatId;
                const f = baseFmt(formatId);
                const benches = [];
                if (d.proposition || d.opposition) {
                    benches.push({
                        id: 'gov',
                        label: f.govName || 'Proposition',
                        members: (d.proposition || []).map((m) => ({
                            name: m.name || m,
                            role: m.role ? Object.assign({}, m.role) : null,
                            present: m.present || '',
                            rebut: m.rebut || ''
                        }))
                    });
                    benches.push({
                        id: 'opp',
                        label: f.oppName || 'Opposition',
                        members: (d.opposition || []).map((m) => ({
                            name: m.name || m,
                            role: m.role ? Object.assign({}, m.role) : null,
                            present: m.present || '',
                            rebut: m.rebut || ''
                        }))
                    });
                } else if (d.teams && typeof d.teams === 'object') {
                    Object.keys(d.teams).forEach((tid) => {
                        const benchMeta = (f.benches || []).find((b) => b.id === tid);
                        benches.push({
                            id: tid,
                            label: benchMeta ? benchMeta.name : tid,
                            members: (d.teams[tid] || []).map((m) => ({
                                name: m.name || m,
                                role: m.role ? Object.assign({}, m.role) : null,
                                present: m.present || '',
                                rebut: m.rebut || ''
                            }))
                        });
                    });
                }
                if (benches.length) {
                    const ui = sessionState.debateUi && sessionState.debateUi[d.number || idx + 1];
                    migrated.debates.push({
                        number: d.number || idx + 1,
                        formatId,
                        fourTeam: !!d.isFourTeam || !!d.fourTeam,
                        notes: (ui && ui.notes) || d.notes || '',
                        order: d.order || effOrder(f),
                        benches
                    });
                }
            });
        }
        return migrated;
    }

    function renderCards() {
        const container = el('debateV2Cards');
        if (!container) {
            return;
        }
        const f = fmt();
        let html = '';
        state.debates.forEach((d, di) => {
            const base = baseFmt(d.formatId);
            const order = d.order || base.order || [];
            const orderText = order.length ? order.join(' → ') : '';
            html += `<article class="debate-v2-card" data-card>
                <header class="debate-v2-card-header">
                    <div class="debate-v2-card-title">Debate ${d.number}</div>
                    <div class="debate-v2-card-format">${escapeHtml(base.name)}${d.simplified ? ' — simplified' : ''}</div>
                    ${orderText ? `<div class="debate-v2-card-order">Speaking order: ${escapeHtml(orderText)}</div>` : ''}
                </header>
                <div class="debate-v2-benches">`;
            d.benches.forEach((b, bi) => {
                const color = COLORS[b.id] || '#3d6b5e';
                const isGovSide = b.id === 'gov' || b.id === 'og' || b.id === 'cg';
                html += `<section class="debate-v2-bench">
                    <div class="debate-v2-bench-label" style="color:${color}">
                        <span class="debate-v2-bench-dot" style="background:${color}"></span>${escapeHtml(b.label)}
                    </div>
                    <div class="debate-v2-members">`;
                b.members.forEach((m, mi) => {
                    const chipClass =
                        m.role && m.role.isWhip
                            ? 'debate-v2-role-chip--whip'
                            : isGovSide
                              ? 'debate-v2-role-chip--gov'
                              : 'debate-v2-role-chip--opp';
                    html += `<div class="debate-v2-member" data-di="${di}" data-bi="${bi}" data-mi="${mi}">
                        <div class="debate-v2-member-head">
                            <span class="debate-v2-member-name">${escapeHtml(m.name)}</span>`;
                    if (m.role) {
                        html += `<span class="debate-v2-role-chip ${chipClass}" title="${escapeHtml(m.role.name)}">${escapeHtml(m.role.abbr)}</span>`;
                    }
                    html += `</div>`;
                    if (showArguments && !d.fourTeam) {
                        const left = leftArgMeta(d, m);
                        html += `<div class="debate-v2-args">
                            <div>
                                <label class="debate-v2-arg-label">${escapeHtml(left.label)}</label>
                                <textarea class="field-input debate-v2-arg-input" data-field="rebut" rows="2" placeholder="${escapeHtml(left.placeholder)}">${escapeHtml(m.rebut || '')}</textarea>
                            </div>
                            <div>
                                <label class="debate-v2-arg-label">${escapeHtml(t('classroomDebateV2Present') || 'Present')}</label>
                                <textarea class="field-input debate-v2-arg-input" data-field="present" rows="2" placeholder="Arguments to present">${escapeHtml(m.present || '')}</textarea>
                            </div>
                        </div>`;
                    }
                    html += `</div>`;
                });
                html += `</div></section>`;
            });
            html += `</div>`;
            if (showNotes) {
                html += `<div class="debate-v2-card-notes">
                    <textarea class="field-input debate-v2-notes-input" data-notes-di="${di}" rows="1" placeholder="Notes — topic, room, time…">${escapeHtml(d.notes || '')}</textarea>
                </div>`;
            }
            html += `</article>`;
        });
        container.innerHTML = html;
    }

    function render() {
        if (!root) {
            return;
        }
        ensureRootBound();
        const f = fmt();
        const genBtn = el('debateV2Generate');
        if (genBtn) {
            genBtn.textContent =
                state.debates.length
                    ? t('classroomDebateRegenerate') || 'Regenerate teams'
                    : t('classroomDebateV2Generate') || 'Generate teams';
        }
        const classTitle = el('debateV2ClassTitle');
        const hrTeacher = el('debateV2HrTeacher');
        const topic = el('debateV2Topic');
        const formatSel = el('debateV2Format');
        const reply = el('debateV2IncludeReply');
        const maxSize = el('debateV2MaxTeamSize');
        const sheetTpl = el('debateV2SheetTemplate');
        if (classTitle && classTitle.value !== state.classTitle) {
            classTitle.value = state.classTitle;
        }
        if (hrTeacher && hrTeacher.value !== state.hrTeacher) {
            hrTeacher.value = state.hrTeacher;
        }
        if (topic && topic.value !== state.topic) {
            topic.value = state.topic;
        }
        if (formatSel) {
            formatSel.value = state.formatId;
        }
        const purpleModeEl = el('debateV2PurpleMode');
        if (purpleModeEl) {
            purpleModeEl.checked = state.purpleMode;
        }
        const standardFormatWrap = el('debateV2StandardFormatWrap');
        if (standardFormatWrap) {
            standardFormatWrap.hidden = state.purpleMode;
        }
        const summary = el('debateV2FormatSummary');
        if (summary) {
            summary.textContent = formatSummary(f);
        }
        const replyWrap = el('debateV2ReplyWrap');
        if (replyWrap) {
            replyWrap.hidden = state.purpleMode || !baseFmt(state.formatId).reply;
        }
        if (reply) {
            reply.checked = state.includeReply;
        }
        const maxWrap = el('debateV2MaxSizeWrap');
        if (maxWrap) {
            maxWrap.hidden = !!(f.fourTeam || f.oneVsOne || f.fixedTeamSize);
        }
        if (maxSize) {
            maxSize.value = state.maxTeamSize;
        }
        if (sheetTpl) {
            sheetTpl.value = state.sheetTemplate;
        }
        const countEl = el('debateV2StudentCount');
        if (countEl) {
            countEl.textContent = String(state.students.length);
        }
        const clearBtn = el('debateV2ClearStudents');
        if (clearBtn) {
            clearBtn.hidden = state.students.length === 0;
        }
        const chips = el('debateV2StudentChips');
        if (chips) {
            chips.innerHTML = state.students
                .map(
                    (name, idx) =>
                        `<span class="debate-v2-chip">${escapeHtml(name)}<button type="button" class="debate-v2-chip-remove" data-remove-idx="${idx}" title="Remove">×</button></span>`
                )
                .join('');
        }
        const pasteBox = el('debateV2PasteBox');
        const pasteToggle = el('debateV2TogglePaste');
        if (pasteBox) {
            pasteBox.hidden = !pasteOpen;
        }
        if (pasteToggle) {
            pasteToggle.textContent = pasteOpen
                ? t('classroomDebateV2HidePaste') || 'Hide paste box'
                : t('classroomDebateV2PasteToggle') || 'Paste a list…';
        }
        const hasDebates = state.debates.length > 0;
        const hasDebatesEl = el('debateV2HasDebates');
        const emptyEl = el('debateV2Empty');
        if (hasDebatesEl) {
            hasDebatesEl.hidden = !hasDebates;
        }
        if (emptyEl) {
            emptyEl.hidden = hasDebates;
        }
        if (hasDebates) {
            const total = state.debates.reduce(
                (sum, d) => sum + d.benches.reduce((t2, b) => t2 + b.members.length, 0),
                0
            );
            const stats = el('debateV2StatsText');
            if (stats) {
                stats.textContent =
                    total +
                    ' students · ' +
                    state.debates.length +
                    (state.debates.length === 1 ? ' debate · ' : ' debates · ') +
                    activeFormatLabel();
            }
            const motionBanner = el('debateV2MotionBanner');
            const motionText = el('debateV2MotionText');
            if (motionBanner && motionText) {
                const hasTopic = !!state.topic.trim();
                motionBanner.hidden = !hasTopic;
                motionText.textContent = state.topic.trim();
            }
            renderCards();
        }
        const printTitle = el('debateV2PrintTitle');
        const printMeta = el('debateV2PrintMeta');
        if (printTitle) {
            printTitle.textContent = state.classTitle.trim() || 'Debate Team Assignments';
        }
        if (printMeta) {
            printMeta.textContent =
                new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }) +
                ' · ' +
                activeFormatLabel();
        }
        if (bridge && bridge.onResultsVisibility) {
            bridge.onResultsVisibility(hasDebates);
        }
        syncEditState(isEditable());
    }

    function addStudentFromInput() {
        if (!guardEdit()) {
            return;
        }
        const input = el('debateV2NewName');
        const name = input ? input.value.trim() : '';
        if (!name) {
            return;
        }
        if (state.students.includes(name)) {
            showToast('"' + name + '" is already in the list');
            return;
        }
        state.students.push(name);
        if (input) {
            input.value = '';
        }
        clearDebatesOnStudentChange();
        notifyStudentsEdited();
        render();
    }

    async function exportWordSheets() {
        if (!state.debates.length) {
            alert('Generate assignments first.');
            return;
        }
        const exp = global.CCPDebateScoresheetExport;
        if (!exp) {
            alert('Score sheet module not loaded.');
            return;
        }
        try {
            const ctx = exp.buildExportContext(exportContext());
            await exp.exportWord(ctx);
        } catch (err) {
            alert('Word export failed: ' + (err && err.message ? err.message : err));
        }
    }

    async function exportPdfSheets() {
        if (!state.debates.length) {
            alert('Generate assignments first.');
            return;
        }
        const exp = global.CCPDebateScoresheetExport;
        if (!exp) {
            alert('Score sheet module not loaded.');
            return;
        }
        try {
            const ctx = exp.buildExportContext(exportContext());
            await exp.exportPdf(ctx);
        } catch (err) {
            alert(
                'PDF export failed: ' +
                    (err && err.message ? err.message : err) +
                    '\n\nTip: use Download Word for the exact school score sheet.'
            );
        }
    }

    function printScoreSheets() {
        if (!state.debates.length) {
            alert('Generate assignments first.');
            return;
        }
        const exp = global.CCPDebateScoresheetExport;
        if (!exp) {
            alert('Score sheet module not loaded.');
            return;
        }
        try {
            const ctx = exp.buildExportContext(exportContext());
            exp.printSheets(ctx);
        } catch (err) {
            alert(err && err.message ? err.message : String(err));
        }
    }

    function isDebateTeamsTabActive() {
        return !!(document.body && document.body.getAttribute('data-active-tab') === 'debate-teams');
    }

    function beginDebateCardsPrintMode() {
        if (!document.body) {
            return;
        }
        document.body.classList.add(PRINT_CARDS_CLASS);
    }

    function endDebateCardsPrintMode() {
        if (printCardsCleanupTimer) {
            clearTimeout(printCardsCleanupTimer);
            printCardsCleanupTimer = null;
        }
        if (!document.body) {
            return;
        }
        document.body.classList.remove(PRINT_CARDS_CLASS);
    }

    function assignmentCardsPrintMeta() {
        return (
            new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) +
            ' · ' +
            activeFormatLabel()
        );
    }

    /** Popup print — reliable; avoids app chrome / term-summary fighting in-page print CSS. */
    function printAssignmentCards() {
        if (!state.debates.length) {
            alert('Generate assignments first.');
            return;
        }
        const cardsEl = el('debateV2Cards');
        if (!cardsEl || !cardsEl.innerHTML.trim()) {
            alert('Generate assignments first.');
            return;
        }
        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win) {
            alert('Allow pop-ups for this page to print assignment cards.');
            return;
        }
        const title = state.classTitle.trim() || 'Debate Team Assignments';
        const meta = assignmentCardsPrintMeta();
        const topic = state.topic.trim();
        win.document.open();
        win.document.write(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
                escapeHtml(title) +
                '</title><style>' +
                'body{font-family:Calibri,"Segoe UI",Arial,sans-serif;margin:16px;color:#1e293b;background:#fff;line-height:1.35;}' +
                'h1{font-size:18pt;margin:0 0 4px;}' +
                '.meta{font-size:10pt;color:#64748b;margin:0 0 12px;}' +
                '.motion{font-size:11pt;margin:0 0 16px;padding:8px 12px;border-left:3px solid #0f766e;background:#f0fdfa;}' +
                '.debate-v2-cards{display:flex;flex-direction:column;gap:14px;}' +
                '.debate-v2-card{border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;break-inside:avoid;page-break-inside:avoid;}' +
                '.debate-v2-card-header{margin-bottom:10px;}' +
                '.debate-v2-card-title{font-size:13pt;font-weight:700;}' +
                '.debate-v2-card-format,.debate-v2-card-order{font-size:9.5pt;color:#64748b;}' +
                '.debate-v2-benches{display:grid;grid-template-columns:1fr 1fr;gap:12px;}' +
                '.debate-v2-bench-label{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;display:flex;align-items:center;gap:6px;}' +
                '.debate-v2-bench-dot{width:8px;height:8px;border-radius:50%;display:inline-block;}' +
                '.debate-v2-members{display:flex;flex-direction:column;gap:8px;}' +
                '.debate-v2-member{border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;background:#f8fafc;}' +
                '.debate-v2-member-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;}' +
                '.debate-v2-member-name{font-weight:600;font-size:11pt;}' +
                '.debate-v2-role-chip{font-size:8.5pt;font-weight:700;padding:2px 6px;border-radius:4px;background:#e2e8f0;}' +
                '.debate-v2-args{display:grid;grid-template-columns:1fr 1fr;gap:8px;}' +
                '.debate-v2-arg-label{display:block;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:2px;}' +
                '.debate-v2-arg-input,.debate-v2-notes-input{display:block;width:100%;box-sizing:border-box;font:inherit;font-size:10pt;border:1px solid #cbd5e1;border-radius:4px;padding:6px 8px;min-height:2.6em;resize:none;background:#fff;}' +
                '.debate-v2-card-notes{margin-top:10px;padding-top:8px;border-top:1px dashed #cbd5e1;}' +
                '@media print{body{margin:0.4in;} .debate-v2-card{box-shadow:none;}}' +
                '@media (max-width:700px){.debate-v2-benches,.debate-v2-args{grid-template-columns:1fr;}}' +
                '</style></head><body>' +
                '<h1>' +
                escapeHtml(title) +
                '</h1><p class="meta">' +
                escapeHtml(meta) +
                '</p>' +
                (topic ? '<p class="motion"><strong>Motion:</strong> ' + escapeHtml(topic) + '</p>' : '') +
                '<div class="debate-v2-cards">' +
                cardsEl.innerHTML +
                '</div>' +
                '</body></html>'
        );
        win.document.close();
        try {
            win.focus();
        } catch (err) {
            /* ignore */
        }
        // Let the popup finish layout before opening the print dialog.
        setTimeout(() => {
            try {
                win.print();
            } catch (err) {
                /* ignore */
            }
        }, 50);
    }

    function ensurePrintHooks() {
        if (printHooksBound) {
            return;
        }
        if (typeof window.addEventListener !== 'function') {
            return;
        }
        printHooksBound = true;
        // Ctrl+P while Debate Teams is active should not pull syllabus/calendar summary.
        window.addEventListener('beforeprint', () => {
            if (isDebateTeamsTabActive()) {
                beginDebateCardsPrintMode();
            }
        });
        window.addEventListener('afterprint', () => {
            endDebateCardsPrintMode();
        });
    }

    function bindEvents() {
        if (!root) {
            return;
        }
        if (eventsAbort) {
            eventsAbort.abort();
        }
        eventsAbort = new AbortController();
        const { signal } = eventsAbort;

        root.addEventListener(
            'click',
            (e) => {
                const target = e.target;
                if (target.closest('#debateV2Generate')) {
                    generateDebates();
                    return;
                }
                if (target.closest('#debateV2AddName')) {
                    addStudentFromInput();
                    return;
                }
                if (target.closest('#debateV2ClearStudents')) {
                    if (!guardEdit()) {
                        return;
                    }
                    if (confirm(t('classroomDebateConfirmClearStudents') || 'Remove all students?')) {
                        state.students = [];
                        state.debates = [];
                        notifyStudentsEdited();
                        render();
                    }
                    return;
                }
                if (target.closest('#debateV2TogglePaste')) {
                    if (!guardEdit()) {
                        return;
                    }
                    pasteOpen = !pasteOpen;
                    render();
                    return;
                }
                if (target.closest('#debateV2AddPaste')) {
                    addPaste();
                    return;
                }
                if (target.closest('#debateV2ExportJson')) {
                    exportJson();
                    return;
                }
                if (target.closest('#debateV2Copy')) {
                    copyResults();
                    return;
                }
                if (target.closest('#debateV2PrintCards')) {
                    printAssignmentCards();
                    return;
                }
                if (target.closest('#debateV2Word')) {
                    void exportWordSheets();
                    return;
                }
                if (target.closest('#debateV2Pdf')) {
                    void exportPdfSheets();
                    return;
                }
                if (target.closest('#debateV2PrintSheets')) {
                    printScoreSheets();
                    return;
                }
                const removeBtn = target.closest('[data-remove-idx]');
                if (removeBtn) {
                    if (!guardEdit()) {
                        return;
                    }
                    const idx = Number(removeBtn.getAttribute('data-remove-idx'));
                    if (Number.isFinite(idx) && idx >= 0 && idx < state.students.length) {
                        state.students.splice(idx, 1);
                        clearDebatesOnStudentChange();
                        notifyStudentsEdited();
                        render();
                    }
                }
            },
            { signal }
        );

        root.addEventListener(
            'keydown',
            (e) => {
                if (e.target.id === 'debateV2NewName' && e.key === 'Enter') {
                    e.preventDefault();
                    addStudentFromInput();
                }
            },
            { signal }
        );

        root.addEventListener(
            'input',
            (e) => {
                const id = e.target.id;
                if (id === 'debateV2ClassTitle') {
                    if (!guardEdit()) {
                        e.target.value = state.classTitle;
                        return;
                    }
                    state.classTitle = e.target.value;
                    notifySave();
                    render();
                    return;
                }
                if (id === 'debateV2HrTeacher') {
                    if (!guardEdit()) {
                        e.target.value = state.hrTeacher;
                        return;
                    }
                    state.hrTeacher = e.target.value;
                    notifySave();
                    render();
                    return;
                }
                if (id === 'debateV2Topic') {
                    if (!guardEdit()) {
                        e.target.value = state.topic;
                        return;
                    }
                    state.topic = e.target.value;
                    notifySave();
                    render();
                    return;
                }
                const arg = e.target.closest('.debate-v2-arg-input');
                if (arg) {
                    const member = arg.closest('.debate-v2-member');
                    if (!member) {
                        return;
                    }
                    updMember(
                        Number(member.dataset.di),
                        Number(member.dataset.bi),
                        Number(member.dataset.mi),
                        arg.dataset.field,
                        arg.value
                    );
                    return;
                }
                const notes = e.target.closest('.debate-v2-notes-input');
                if (notes) {
                    updNotes(Number(notes.dataset.notesDi), notes.value);
                }
            },
            { signal }
        );

        root.addEventListener(
            'change',
            (e) => {
                const id = e.target.id;
                if (id === 'debateV2PurpleMode') {
                    if (!guardEdit()) {
                        e.target.checked = state.purpleMode;
                        return;
                    }
                    state.purpleMode = e.target.checked;
                    if (state.purpleMode) {
                        applyPurpleModeSettings(true);
                    }
                    notifySave();
                    render();
                    return;
                }
                if (id === 'debateV2Format') {
                    if (!guardEdit()) {
                        e.target.value = state.formatId;
                        return;
                    }
                    state.formatId = e.target.value;
                    notifySave();
                    render();
                    return;
                }
                if (id === 'debateV2IncludeReply') {
                    if (!guardEdit()) {
                        e.target.checked = state.includeReply;
                        return;
                    }
                    state.includeReply = e.target.checked;
                    notifySave();
                    render();
                    return;
                }
                if (id === 'debateV2MaxTeamSize') {
                    if (!guardEdit()) {
                        e.target.value = state.maxTeamSize;
                        return;
                    }
                    state.maxTeamSize = e.target.value;
                    notifySave();
                    render();
                    return;
                }
                if (id === 'debateV2SheetTemplate') {
                    state.sheetTemplate = e.target.value;
                    notifySave();
                    return;
                }
                if (id === 'debateV2ImportFile') {
                    if (!guardEdit()) {
                        e.target.value = '';
                        return;
                    }
                    const file = e.target.files && e.target.files[0];
                    e.target.value = '';
                    if (file) {
                        importJsonFile(file);
                    }
                }
            },
            { signal }
        );
    }

    function init(mountEl, bridgeApi) {
        mountElRef = mountEl;
        root = resolveShell(mountEl);
        bridge = bridgeApi || null;
        ensurePrintHooks();
        bindEvents();
        render();
    }

    function setBridge(bridgeApi) {
        bridge = bridgeApi || null;
        syncEditState(isEditable());
    }

    function loadState(sessionState) {
        const migrated = migrateOldSession(sessionState);
        if (migrated) {
            normalizePurpleSession(migrated);
            state.students = migrated.students || [];
            state.formatId = FORMATS[migrated.formatId] ? migrated.formatId : 'ap';
            state.purpleMode = !!migrated.purpleMode;
            state.includeReply = !!migrated.includeReply;
            state.maxTeamSize = migrated.maxTeamSize || 3;
            state.classTitle = migrated.classTitle || '';
            state.hrTeacher = migrated.hrTeacher || '';
            state.topic = migrated.topic || '';
            state.sheetTemplate = migrated.sheetTemplate === 'yeoul' ? 'yeoul' : 'garam';
            state.debates = Array.isArray(migrated.debates) ? migrated.debates : [];
        }
        render();
    }

    function collectState() {
        return {
            version: 2,
            students: state.students.slice(),
            formatId: state.formatId,
            purpleMode: state.purpleMode,
            includeReply: state.includeReply,
            maxTeamSize: state.maxTeamSize,
            classTitle: state.classTitle,
            hrTeacher: state.hrTeacher,
            topic: state.topic,
            sheetTemplate: state.sheetTemplate,
            debates: JSON.parse(JSON.stringify(state.debates))
        };
    }

    function importRoster(names, options) {
        options = options || {};
        const list = (Array.isArray(names) ? names : []).filter(Boolean);
        if (!list.length) {
            return { ok: false, reason: 'empty', count: 0, debatesCleared: false };
        }
        const unchanged =
            list.length === state.students.length && list.every((name, idx) => name === state.students[idx]);
        if (unchanged) {
            const clearDebates = options.clearDebates !== false;
            if (clearDebates && state.debates.length > 0) {
                state.debates = [];
                notifySave();
                render();
                return { ok: true, reason: 'cleared-debates', count: list.length, debatesCleared: true };
            }
            return { ok: true, reason: 'unchanged', count: list.length, debatesCleared: false };
        }
        if (options.confirm && state.students.length > 0) {
            if (!confirm(t('classroomDebateImportRosterConfirm'))) {
                return { ok: false, reason: 'cancelled', count: 0, debatesCleared: false };
            }
        }
        const clearDebates = options.clearDebates !== false;
        const hadDebates = state.debates.length > 0;
        state.students = list.slice();
        let debatesCleared = false;
        if (clearDebates && hadDebates) {
            state.debates = [];
            debatesCleared = true;
        }
        notifySave();
        render();
        return { ok: true, reason: 'imported', count: list.length, debatesCleared };
    }

    function isPurpleDebateClass(classData, debateBook) {
        if (!classData) {
            return false;
        }
        const preset = String(classData.levelPreset || '').trim();
        const custom = String(classData.levelCustom || classData.level || '').trim();
        if (preset === 'Purple' || custom === 'Purple') {
            return true;
        }
        const book = String(debateBook || classData.book || '').trim();
        return /purple/i.test(book);
    }

    function applyClassFormatDefaults(classData, options) {
        options = options || {};
        if (!isPurpleDebateClass(classData, options.debateBook)) {
            return;
        }
        if (options.onlyIfPristine) {
            const pristine =
                state.debates.length === 0 &&
                !state.purpleMode &&
                state.formatId === 'ap' &&
                !state.includeReply &&
                state.sheetTemplate === 'garam';
            if (!pristine) {
                return;
            }
        } else if (state.debates.length > 0) {
            return;
        }
        state.purpleMode = true;
        applyPurpleModeSettings(true);
        render();
    }

    function applyMetadataDefaults(classTitle, hrTeacher, options) {
        options = options || {};
        const force = !!options.force;
        const nextTitle = classTitle != null ? String(classTitle).trim() : '';
        const nextHr = hrTeacher != null ? String(hrTeacher).trim() : '';
        if (force) {
            if (nextTitle) {
                state.classTitle = nextTitle;
            }
            state.hrTeacher = nextHr;
        } else {
            if (nextTitle && !state.classTitle.trim()) {
                state.classTitle = nextTitle;
            }
            if (nextHr && !state.hrTeacher.trim()) {
                state.hrTeacher = nextHr;
            }
        }
        render();
    }

    function syncEditState(enabled) {
        if (!root) {
            return;
        }
        const shell =
            root.classList && root.classList.contains('classroom-debate-v2')
                ? root
                : root.querySelector('.classroom-debate-v2');
        if (shell) {
            shell.classList.toggle('debate-v2--readonly', !enabled);
        }
    }

    function setEditEnabled(enabled) {
        syncEditState(!!enabled);
    }

    global.CCPDebateTeamsV2 = {
        FORMATS,
        init,
        setBridge,
        hasLiveDom,
        loadState,
        collectState,
        importRoster,
        render,
        assignDebates,
        generateDebates,
        applyMetadataDefaults,
        applyClassFormatDefaults,
        isPurpleDebateClass,
        setEditEnabled,
        migrateOldSession
    };
})(typeof window !== 'undefined' ? window : globalThis);
