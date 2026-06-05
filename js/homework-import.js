/**
 * Paste parsers and syllabus row mapping (window.CCPHomeworkImport).
 */
(function (global) {
    const DEBATE_MARKERS = [
        { key: 'day1', patterns: [/^Day\s*1\s*$/i] },
        { key: 'day2', patterns: [/^Day\s*2\s*$/i] },
        { key: 'day3', patterns: [/^Day\s*3\s*$/i] },
        { key: 'altDay3', patterns: [/^Alt\s*Day\s*3\s*$/i] },
        { key: 'day2and3', patterns: [/^Day\s*2\s*&\s*3\s*Combined\s*$/i] },
        { key: 'day4', patterns: [/^Day\s*4\s*\/\s*Preview\s*$/i, /^Day\s*4\/Preview\s*$/i] }
    ];

    const UNIT_PART_RE = /Unit\s*(\d+)\s*(?:-|—)?\s*Part\s*(\d+)/i;
    const UNIT_PART_ALT = /Unit\s*(\d+)\s+pt\s*(\d+)/i;

    function normalizePasteText(text) {
        let n = String(text ?? '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .trim();
        if (global.CCPUtils && global.CCPUtils.normalizeClipboardText) {
            n = global.CCPUtils.normalizeClipboardText(n);
        } else {
            n = n
                .replace(/\u2014/g, '-')
                .replace(/\u2013/g, '-')
                .replace(/\u2212/g, '-');
        }
        return n;
    }

    function splitBlocks(text, delimiterRe) {
        const lines = normalizePasteText(text).split('\n');
        const blocks = [];
        let current = null;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                if (current && current.lines.length) {
                    blocks.push(current);
                    current = null;
                }
                return;
            }
            if (delimiterRe.test(trimmed)) {
                if (current && current.lines.length) {
                    blocks.push(current);
                }
                current = { header: trimmed, lines: [] };
                return;
            }
            if (!current) {
                return;
            }
            current.lines.push(trimmed);
        });
        if (current && current.lines.length) {
            blocks.push(current);
        }
        return blocks;
    }

    function parseDebateHomework(text) {
        const blocks = [];
        const lines = normalizePasteText(text).split('\n');
        let current = null;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                if (current) {
                    blocks.push(current);
                    current = null;
                }
                return;
            }
            const marker = DEBATE_MARKERS.find(m => m.patterns.some(p => p.test(trimmed)));
            if (marker) {
                if (current) {
                    blocks.push(current);
                }
                current = { marker: marker.key, title: trimmed, body: [] };
                return;
            }
            if (current) {
                current.body.push(trimmed);
            }
        });
        if (current) {
            blocks.push(current);
        }
        return blocks.map(b => ({
            title: b.title,
            body: b.body.join('\n'),
            marker: b.marker
        }));
    }

    function parseUnitPairHomework(text) {
        return splitBlocks(text, /^(?:Unit\s*\d+\s*(?:-|—)?\s*Part\s*\d+|Unit\s*\d+\s+pt\s*\d+)/i)
            .map(b => ({
                title: b.header,
                body: b.lines.join('\n')
            }));
    }

    function parseGrUnitHomework(text) {
        return splitBlocks(text, /^(?:Unit\s*\d+|OT\s*\+?\s*Unit|▷\s*TEST)/i)
            .map(b => ({
                title: b.header,
                body: b.lines.join('\n')
            }));
    }

    function parseNonDebateHomework(text) {
        const lines = normalizePasteText(text).split('\n');
        const blocks = [];
        let book = '';
        let current = null;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                if (current && current.lines.length) {
                    blocks.push({ book, title: current.title, body: current.lines.join('\n') });
                    current = null;
                }
                return;
            }
            if (/^(IPE|Subject Link|150 Word Reading|Simson Reading|Write Now|The Best Writing Starter|Write Right|Early Writers|Hand in Hand)/i.test(trimmed)) {
                if (current && current.lines.length) {
                    blocks.push({ book, title: current.title, body: current.lines.join('\n') });
                }
                book = trimmed;
                current = null;
                return;
            }
            if (/^Unit\s+\d+/i.test(trimmed) || /^Block\s/i.test(trimmed)) {
                if (current && current.lines.length) {
                    blocks.push({ book, title: current.title, body: current.lines.join('\n') });
                }
                current = { title: trimmed, lines: [] };
                return;
            }
            if (current) {
                current.lines.push(trimmed);
            }
        });
        if (current && current.lines.length) {
            blocks.push({ book, title: current.title, body: current.lines.join('\n') });
        }
        return blocks;
    }

    function sessionFromUnitPart(title) {
        const m = title.match(UNIT_PART_RE) || title.match(UNIT_PART_ALT);
        if (!m) {
            return null;
        }
        const unit = parseInt(m[1], 10);
        const part = parseInt(m[2], 10);
        if (Number.isNaN(unit) || Number.isNaN(part)) {
            return null;
        }
        return (unit - 1) * 2 + part;
    }

    function normalizeTitleForMatch(s) {
        return String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function rowMatchesDebateMarker(row, marker) {
        const title = normalizeTitleForMatch(row.planTitle);
        if (marker === 'day1') {
            return /\bday\s*1\b/.test(title) && !/day\s*2/.test(title);
        }
        if (marker === 'day2') {
            return /\bday\s*2\b/.test(title) && !/day\s*3/.test(title) && !/combined/.test(title);
        }
        if (marker === 'day3') {
            return /\bday\s*3\b/.test(title) && !/alt/.test(title);
        }
        if (marker === 'altDay3') {
            return /alt\s*day\s*3/.test(title);
        }
        if (marker === 'day2and3') {
            return /combined/.test(title) || (/day\s*2/.test(title) && /day\s*3/.test(title));
        }
        if (marker === 'day4') {
            return /\bday\s*4\b/.test(title) || /preview/.test(title);
        }
        return false;
    }

    function rowMatchesGrTitle(row, blockTitle) {
        const t = normalizeTitleForMatch(row.planTitle);
        const b = normalizeTitleForMatch(blockTitle);
        if (t === b) {
            return true;
        }
        const unitNum = blockTitle.match(/unit\s*(\d+)/i);
        if (unitNum && t.includes(`unit ${unitNum[1]}`)) {
            return true;
        }
        if (/^ot/.test(b) && /unit\s*1/.test(t) && /ot|unit\s*1/.test(t)) {
            return true;
        }
        return false;
    }

    function mapBlocksToSyllabusTargets(blocks, rows, mode) {
        const lessonRows = (rows || []).filter(r =>
            r.kind === 'lesson' || r.kind === 'event' || r.kind === 'overflow'
        );
        const mappings = [];
        const unmatched = [];

        blocks.forEach(block => {
            let match = null;
            if (mode === 'debate') {
                match = lessonRows.find(r => rowMatchesDebateMarker(r, block.marker));
            } else if (mode === 'unitPair') {
                const session = sessionFromUnitPart(block.title);
                if (session) {
                    match = lessonRows.find(r => r.sessionNumber === session);
                }
                if (!match) {
                    match = lessonRows.find(r =>
                        normalizeTitleForMatch(r.planTitle).includes(
                            normalizeTitleForMatch(block.title).slice(0, 12)
                        )
                    );
                }
            } else if (mode === 'grUnit') {
                match = lessonRows.find(r => rowMatchesGrTitle(r, block.title));
            } else {
                match = lessonRows.find(r =>
                    normalizeTitleForMatch(r.planTitle).includes(
                        normalizeTitleForMatch(block.title).slice(0, 8)
                    )
                );
            }

            if (match) {
                mappings.push({
                    blockTitle: block.title,
                    rowId: match.id,
                    sessionNumber: match.sessionNumber,
                    planTitle: match.planTitle,
                    planDetail: block.body,
                    status: 'matched'
                });
            } else {
                unmatched.push({ blockTitle: block.title, planDetail: block.body, status: 'unmatched' });
            }
        });

        return { mappings, unmatched };
    }

    function detectImportMode(text, classData) {
        if (classData && classData.homeworkImportMode) {
            return classData.homeworkImportMode;
        }
        const n = normalizePasteText(text);
        if (DEBATE_MARKERS.some(m => m.patterns.some(p => p.test(n)))) {
            return 'debate';
        }
        if (/Unit\s*\d+\s*Part\s*\d+/i.test(n)) {
            return 'unitPair';
        }
        if (/^(IPE|Subject Link|Simson Reading)/im.test(n)) {
            return 'nonDebate';
        }
        if (/Unit\s*\d+/i.test(n) && (/<수업>|과제검사|문법공부/i.test(n))) {
            return 'grUnit';
        }
        return 'unitPair';
    }

    function parseByMode(text, mode) {
        if (mode === 'debate') {
            return parseDebateHomework(text);
        }
        if (mode === 'grUnit') {
            return parseGrUnitHomework(text);
        }
        if (mode === 'nonDebate') {
            return parseNonDebateHomework(text);
        }
        return parseUnitPairHomework(text);
    }

    global.CCPHomeworkImport = {
        normalizePasteText,
        parseDebateHomework,
        parseUnitPairHomework,
        parseGrUnitHomework,
        parseNonDebateHomework,
        mapBlocksToSyllabusTargets,
        detectImportMode,
        parseByMode,
        sessionFromUnitPart
    };
})(typeof window !== 'undefined' ? window : globalThis);
