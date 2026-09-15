/**
 * Debate duties / roles PowerPoint export for class display.
 * Uses PptxGenJS (loaded via CDN from app-tab-scripts).
 */
(function (global) {
    const ROLE_DEFAULT_DUTIES = {
        PM: {
            rebut: '',
            present: 'Introduce topic and key terms. Arguments to introduce, Prop Clash Point 1'
        },
        LO: {
            rebut: 'Rebut Pro Clash Point 1',
            present: 'present Opp Clash Point 1'
        },
        DPM: {
            rebut: 'Rebut Opp Clash Point 1',
            present: 'Introduce Pro Clash Point 2'
        },
        DLO: {
            rebut: 'Rebut Pro Clash Point 2',
            present: 'Introduce Opp Clash Point 2'
        },
        GW: {
            rebut: '',
            present: 'Summarize and reinforce Pro'
        },
        OW: {
            rebut: '',
            present: 'Summarize and reinforce Opp'
        }
    };

    function dateForFilename() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function sanitizeClassForFilename(raw) {
        const cleaned = String(raw || '')
            .replace(/[^\w\-]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 40);
        return cleaned || 'Class';
    }

    function defaultsForRoleAbbr(abbr) {
        const key = String(abbr || '').trim();
        if (!key || !ROLE_DEFAULT_DUTIES[key]) {
            return { rebut: '', present: '' };
        }
        return {
            rebut: ROLE_DEFAULT_DUTIES[key].rebut || '',
            present: ROLE_DEFAULT_DUTIES[key].present || ''
        };
    }

    function dutyText(member) {
        const defaults = defaultsForRoleAbbr(member.role && member.role.abbr);
        const rebut = (member.rebut && String(member.rebut).trim()) || defaults.rebut || '';
        const present = (member.present && String(member.present).trim()) || defaults.present || '';
        const parts = [];
        if (rebut) {
            parts.push(rebut);
        }
        if (present) {
            parts.push(present);
        }
        return parts.join(', ');
    }

    /**
     * Speakers grouped by debate, each group in speaking order.
     * @returns {Array<{ debateNumber: number, speakers: Array }>}
     */
    function debatesFromSession(sessionState) {
        const src = sessionState || {};
        const debates = Array.isArray(src.debates) ? src.debates : [];
        const out = [];
        debates.forEach((d) => {
            const order = Array.isArray(d.order) ? d.order : [];
            const rank = new Map();
            order.forEach((token, i) => {
                const abbr = String(token).replace('*', '');
                if (!rank.has(abbr)) {
                    rank.set(abbr, i);
                }
            });
            const speakers = [];
            (d.benches || []).forEach((b) => {
                (b.members || []).forEach((m) => {
                    if (!m || !m.name) {
                        return;
                    }
                    const roleAbbr = m.role && m.role.abbr ? m.role.abbr : '';
                    speakers.push({
                        debateNumber: d.number || 1,
                        name: String(m.name),
                        roleAbbr,
                        bench: b.label || '',
                        duties: dutyText(m),
                        _r: roleAbbr && rank.has(roleAbbr) ? rank.get(roleAbbr) : 999
                    });
                });
            });
            speakers.sort((a, b) => a._r - b._r);
            speakers.forEach((s) => {
                delete s._r;
            });
            if (speakers.length) {
                out.push({
                    debateNumber: d.number || out.length + 1,
                    speakers
                });
            }
        });
        return out;
    }

    function speakersFromSession(sessionState) {
        const rows = [];
        debatesFromSession(sessionState).forEach((d) => {
            d.speakers.forEach((s) => rows.push(s));
        });
        return rows;
    }

    function getPptxCtor() {
        return global.PptxGenJS || global.pptxgenjs || null;
    }

    function addTitleSlide(pptx, meta, subtitle) {
        const slide = pptx.addSlide();
        slide.addText(String(meta.classTitle || 'Debate'), {
            x: 0.4,
            y: 2.2,
            w: 9.2,
            h: 1,
            fontSize: 40,
            bold: true,
            color: '0F766E',
            align: 'center',
            fontFace: 'Arial'
        });
        if (meta.topic) {
            slide.addText(String(meta.topic), {
                x: 0.4,
                y: 3.3,
                w: 9.2,
                h: 0.6,
                fontSize: 22,
                color: '334155',
                align: 'center',
                fontFace: 'Arial'
            });
        }
        slide.addText(String(subtitle || ''), {
            x: 0.4,
            y: 4.2,
            w: 9.2,
            h: 0.4,
            fontSize: 18,
            color: '64748B',
            align: 'center',
            fontFace: 'Arial'
        });
        if (meta.date) {
            slide.addText(String(meta.date), {
                x: 0.4,
                y: 4.8,
                w: 9.2,
                h: 0.35,
                fontSize: 14,
                color: '94A3B8',
                align: 'center',
                fontFace: 'Arial'
            });
        }
    }

    function lineFontSize(speakerCount, includeDuties) {
        const n = Math.max(1, speakerCount);
        if (includeDuties) {
            if (n <= 4) {
                return 26;
            }
            if (n <= 6) {
                return 22;
            }
            if (n <= 8) {
                return 18;
            }
            return 15;
        }
        if (n <= 4) {
            return 34;
        }
        if (n <= 6) {
            return 28;
        }
        if (n <= 8) {
            return 24;
        }
        return 20;
    }

    /** One slide listing every speaker in a debate (roles and/or duties). */
    function addDebateSlide(pptx, debateGroup, options) {
        options = options || {};
        const includeDuties = !!options.includeDuties;
        const multiDebate = !!options.multiDebate;
        const speakers = debateGroup.speakers || [];
        const slide = pptx.addSlide();

        const heading = multiDebate
            ? 'Debate ' + debateGroup.debateNumber
            : options.slideHeading || 'Speaking order';
        slide.addText(heading, {
            x: 0.4,
            y: 0.25,
            w: 9.2,
            h: 0.55,
            fontSize: 32,
            bold: true,
            color: '0F766E',
            align: 'center',
            fontFace: 'Arial'
        });

        const fontSize = lineFontSize(speakers.length, includeDuties);
        const textRuns = [];
        speakers.forEach((s, idx) => {
            const name = String(s.name || '').trim() || 'Student';
            textRuns.push({
                text: name,
                options: { bold: true, breakLine: false }
            });
            if (s.roleAbbr) {
                textRuns.push({
                    text: ' - ' + s.roleAbbr,
                    options: { bold: false, breakLine: false }
                });
            }
            if (!includeDuties && s.bench) {
                textRuns.push({
                    text: ' — ' + s.bench,
                    options: { bold: false, breakLine: false }
                });
            }
            if (includeDuties && s.duties) {
                textRuns.push({
                    text: ' - ' + s.duties,
                    options: { bold: false, breakLine: false }
                });
            }
            if (textRuns.length) {
                const last = textRuns[textRuns.length - 1];
                last.options = Object.assign({}, last.options, {
                    breakLine: idx < speakers.length - 1
                });
            }
        });

        slide.addText(textRuns.length ? textRuns : ' ', {
            x: 0.45,
            y: 0.95,
            w: 9.1,
            h: 6.2,
            fontSize,
            color: '0F172A',
            fontFace: 'Arial',
            valign: 'top',
            align: 'left'
        });
    }

    async function buildAndDownload(sessionState, meta, options) {
        options = options || {};
        const PptxGenJS = getPptxCtor();
        if (!PptxGenJS) {
            throw new Error('PptxGenJS not loaded');
        }
        const debateGroups = debatesFromSession(sessionState);
        if (!debateGroups.length) {
            throw new Error('No speakers');
        }
        const pptx = new PptxGenJS();
        pptx.defineLayout({ name: 'LAYOUT_16x9', width: 10, height: 7.5 });
        pptx.layout = 'LAYOUT_16x9';

        const titleMeta = {
            classTitle: (meta && meta.classTitle) || sessionState.classTitle || 'Debate',
            topic: (meta && meta.topic) || sessionState.topic || '',
            date: (meta && meta.date) || ''
        };
        addTitleSlide(pptx, titleMeta, options.titleSubtitle || '');

        const multiDebate = debateGroups.length > 1;
        debateGroups.forEach((group) => {
            addDebateSlide(pptx, group, {
                includeDuties: !!options.includeDuties,
                multiDebate,
                slideHeading: options.slideHeading
            });
        });

        const speakerCount = debateGroups.reduce((n, g) => n + g.speakers.length, 0);
        const classPart = sanitizeClassForFilename(titleMeta.classTitle);
        const fileBase =
            classPart +
            '-' +
            (options.filePrefix || 'Debate') +
            '-' +
            dateForFilename();
        await pptx.writeFile({ fileName: fileBase + '.pptx' });
        return { ok: true, count: speakerCount, debates: debateGroups.length };
    }

    async function exportDutiesPptx(sessionState, meta) {
        return buildAndDownload(sessionState, meta || {}, {
            includeDuties: true,
            titleSubtitle: 'Speaking duties — one debate per slide',
            slideHeading: 'Speaking duties',
            filePrefix: 'Debate-Duties'
        });
    }

    async function exportRolesPptx(sessionState, meta) {
        return buildAndDownload(sessionState, meta || {}, {
            includeDuties: false,
            titleSubtitle: 'Speaking roles — one debate per slide',
            slideHeading: 'Speaking roles',
            filePrefix: 'Debate-Roles'
        });
    }

    global.CCPDebateDutiesPptx = {
        exportDutiesPptx,
        exportRolesPptx,
        speakersFromSession,
        debatesFromSession,
        sanitizeClassForFilename
    };
})(typeof window !== 'undefined' ? window : globalThis);
