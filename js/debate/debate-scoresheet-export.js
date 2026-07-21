/**
 * Shared debate score sheet export (Word / PDF / print).
 * Used by debate-teams-v2; extracted from debate-randomizer-core.
 */
(function (global) {
    const FEEDBACK_TEMPLATES = {
        garam: {
            key: 'garam',
            label: 'Garam–Mirinae',
            file: 'Debate Feedback Sheet-Garam-Mirinae.docx',
            fileLabel: 'Garam-Mirinae',
            rowsPerStudent: 9,
            studentsPerPage: 6,
            primary: '#3d6b5e',
            scoreRows: [
                'Eye Contact (/5)',
                'Voice & Pronunciation (/5)',
                'Fluency (/5)',
                'Content (/5)',
                'Logic (/5)',
                'Confidence & Posture (/5)',
                'Total (/30)'
            ],
            scoreKeys: ['eyeContact', 'voice', 'fluency', 'content', 'logic', 'confidence', 'total']
        },
        yeoul: {
            key: 'yeoul',
            label: 'Purple–Yeoul',
            file: 'Debate Feedback Sheet Purple-Yeoul.docx',
            fileLabel: 'Purple-Yeoul',
            rowsPerStudent: 7,
            studentsPerPage: 6,
            primary: '#5b3a7e',
            scoreRows: [
                'Eye Contact (/5)',
                'Voice & Pronunciation (/5)',
                'Fluency (/5)',
                'Confidence & Posture (/5)',
                'Total (/20)'
            ],
            scoreKeys: ['eyeContact', 'voice', 'fluency', 'confidence', 'total']
        }
    };

    function dateForFilename() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
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
        return decodeXmlText(parts.map((p) => p.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '')).join('')).trim();
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
        if (cells.length < 2) {
            return trXml;
        }
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

    function getTopLevelTableSpans(documentXml) {
        const bodyStart = documentXml.indexOf('<w:body');
        if (bodyStart < 0) {
            return [];
        }
        const bodyContentStart = documentXml.indexOf('>', bodyStart) + 1;
        const bodyEnd = documentXml.indexOf('</w:body>');
        const spans = [];
        let i = bodyContentStart;
        let depth = 0;
        let start = -1;
        while (i < bodyEnd) {
            if (
                documentXml.slice(i, i + 6) === '<w:tbl' &&
                (documentXml[i + 6] === ' ' || documentXml[i + 6] === '>')
            ) {
                if (depth === 0) {
                    start = i;
                }
                depth++;
                i += 6;
                continue;
            }
            if (documentXml.slice(i, i + 8) === '</w:tbl>') {
                depth--;
                if (depth === 0 && start >= 0) {
                    spans.push({
                        start,
                        end: i + 8,
                        xml: documentXml.slice(start, i + 8)
                    });
                    start = -1;
                }
                i += 8;
                continue;
            }
            i++;
        }
        return spans;
    }

    function getScoreSheetPageCloneChunk(documentXml, pageTableIndex) {
        const spans = getTopLevelTableSpans(documentXml);
        if (spans.length <= pageTableIndex) {
            throw new Error('Template page layout is incomplete — cannot clone overflow pages.');
        }
        const span = spans[pageTableIndex];
        const before = documentXml.slice(0, span.start);
        const breakIdx = before.lastIndexOf('<w:lastRenderedPageBreak/>');
        let chunkStart = span.start;
        if (breakIdx >= 0) {
            const pStart = before.lastIndexOf('<w:p ', breakIdx);
            if (pStart >= 0) {
                chunkStart = pStart;
            }
        }
        return documentXml.slice(chunkStart, span.end);
    }

    /**
     * Clone page 2 of the score sheet (header + grid table with 6 nested student blocks).
     * Templates use two top-level tables (one per page), not 12 sibling tables.
     */
    function appendScoreSheetPageTables(documentXml, template, extraPageCount) {
        if (extraPageCount <= 0) {
            return documentXml;
        }
        const pageChunk = getScoreSheetPageCloneChunk(documentXml, 1);
        let cloneXml = '';
        for (let i = 0; i < extraPageCount; i++) {
            cloneXml += pageChunk;
        }
        // sectPr must remain the last child of w:body (OOXML); never append after it.
        const sectIdx = documentXml.lastIndexOf('<w:sectPr');
        if (sectIdx < 0) {
            throw new Error('Could not extend score sheet document.');
        }
        return documentXml.slice(0, sectIdx) + cloneXml + documentXml.slice(sectIdx);
    }

    function applyFilledTableRowsToDocument(documentXml, filledRows) {
        const rowRegex = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
        let cursor = 0;
        const xml = documentXml.replace(rowRegex, function (match) {
            if (cursor < filledRows.length) {
                return filledRows[cursor++];
            }
            return match;
        });
        if (cursor !== filledRows.length) {
            console.warn(
                'Score sheet row count mismatch after fill:',
                cursor,
                'of',
                filledRows.length
            );
        }
        return xml;
    }

    function formatScoreCellValue(value) {
        if (value == null || value === '') {
            return '';
        }
        const n = Number(value);
        if (!Number.isFinite(n)) {
            return String(value);
        }
        return String(Math.round(n * 10) / 10);
    }

    function speakerScoreValue(speaker, key) {
        if (!speaker) {
            return '';
        }
        if (key === 'total') {
            return formatScoreCellValue(speaker.total);
        }
        const scores = speaker.scores && typeof speaker.scores === 'object' ? speaker.scores : {};
        return formatScoreCellValue(scores[key]);
    }

    function fillStudentScoreBlock(filledRows, startIdx, speaker, template) {
        const name = speaker ? speaker.name : '';
        const roleLabel = speaker ? speaker.roleAbbr || '' : '';
        filledRows[startIdx] = setRowMiddleCell(filledRows[startIdx], name);
        if (filledRows[startIdx + 1]) {
            filledRows[startIdx + 1] = setRowMiddleCell(filledRows[startIdx + 1], roleLabel);
        }
        // Comments title stays on the Name row (cell 2). Note text goes in the
        // tall Comments column that starts on the Role row (vMerge restart).
        if (speaker && speaker.note && filledRows[startIdx + 1]) {
            const cells = getRowCells(filledRows[startIdx + 1]);
            if (cells.length >= 3) {
                const commentCell = setTableCellText(cells[2], speaker.note);
                filledRows[startIdx + 1] = filledRows[startIdx + 1].replace(cells[2], commentCell);
            }
        }
        const keys = (template && template.scoreKeys) || [];
        keys.forEach((key, i) => {
            const rowIdx = startIdx + 2 + i;
            if (!filledRows[rowIdx]) {
                return;
            }
            filledRows[rowIdx] = setRowMiddleCell(filledRows[rowIdx], speakerScoreValue(speaker, key));
        });
    }

    function replaceDocxFieldAfterLabel(documentXml, label, value) {
        if (!value) {
            return documentXml;
        }
        const safe = escapeXml(value);
        let xml = documentXml;
        let from = 0;
        while (from < xml.length) {
            const idx = xml.indexOf(label, from);
            if (idx < 0) {
                break;
            }
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
        if (classKey !== 'yeoul') {
            return documentXml;
        }
        return documentXml.replace(/Total \(\/30\)/g, 'Total (/20)');
    }

    function normalizeSpeakers(ctx) {
        if (Array.isArray(ctx.speakers)) {
            return ctx.speakers.filter((s) => s && s.name && String(s.name).trim());
        }
        if (Array.isArray(ctx.lines)) {
            return ctx.lines
                .filter((row) => row.name && String(row.name).trim())
                .map((row) => ({
                    name: row.name.trim(),
                    roleAbbr: row.roleAbbr || '',
                    roleName: row.roleName || '',
                    debate: row.debate,
                    bench: row.bench || ''
                }));
        }
        return [];
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
        const speakers = normalizeSpeakers(ctx);

        if (blockStarts.length === 0) {
            throw new Error('Could not find student score blocks in the template.');
        }

        const templatePages = Math.floor(blockStarts.length / perPage);
        const pagesNeeded = Math.max(1, Math.ceil(speakers.length / perPage));
        if (pagesNeeded > templatePages) {
            documentXml = appendScoreSheetPageTables(
                documentXml,
                template,
                pagesNeeded - templatePages
            );
            tableRows = getTableRowXmlList(documentXml);
            blockStarts = findStudentBlockStarts(tableRows);
        }

        const filledRows = tableRows.slice();
        blockStarts.forEach((startIdx, blockIdx) => {
            const speakerIdx = speakerIndexForBlock(blockIdx, perPage);
            const sp = speakerIdx < speakers.length ? speakers[speakerIdx] : null;
            fillStudentScoreBlock(filledRows, startIdx, sp, template);
        });

        const filledXml = applyFilledTableRowsToDocument(documentXml, filledRows);
        zip.file('word/document.xml', filledXml);
        return zip.generate({
            type: 'arraybuffer',
            compression: 'DEFLATE',
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
        const res = await fetch(url);
        if (res.ok) {
            return res.arrayBuffer();
        }
        throw new Error(
            'Could not load the score sheet template. Run scripts/embed_templates.py or keep "' +
                cfg.file +
                '" next to index.html.'
        );
    }

    function buildScoreSheetStudentCardHtml(t, sp) {
        const roleLabel = sp.roleAbbr || '';
        const keys = t.scoreKeys || [];
        let criteriaHtml = '';
        t.scoreRows.forEach((label, i) => {
            const key = keys[i];
            const value = speakerScoreValue(sp, key);
            criteriaHtml += `<div style="display:grid;grid-template-columns:1fr 48px;gap:6px;margin:2px 0;"><span>${escapeHtml(label)}</span><span style="border-bottom:1px solid #999;min-height:14px;text-align:center;">${escapeHtml(value)}</span></div>`;
        });
        const comments = sp.note ? escapeHtml(sp.note) : '';
        return `
            <div class="score-student-card" style="border:2px solid ${t.primary};border-radius:4px;padding:8px 10px;margin-bottom:10px;font-size:9.5pt;page-break-inside:avoid;break-inside:avoid;">
                <div style="font-size:8pt;color:#666;margin-bottom:4px;">Debate ${escapeHtml(sp.debate)} · ${escapeHtml(sp.bench)}</div>
                <div style="display:grid;grid-template-columns:52px 1fr 28%;gap:4px 8px;margin-bottom:4px;">
                    <span style="font-weight:600;">Name</span><span style="font-weight:600;">${escapeHtml(sp.name)}</span><span style="font-weight:600;font-size:8.5pt;">Comments</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 28%;gap:8px;align-items:stretch;">
                    <div>
                        <div style="display:grid;grid-template-columns:52px 1fr;gap:4px 8px;margin-bottom:6px;">
                            <span style="font-weight:600;">Role</span><span>${escapeHtml(roleLabel)}</span>
                        </div>
                        ${criteriaHtml}
                    </div>
                    <div style="border:1px solid #ccc;padding:4px 6px;font-size:8.5pt;white-space:pre-wrap;min-height:100%;">${comments}</div>
                </div>
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
                <p style="margin:4px 0 0 0;font-size:9pt;color:#555;">Format: ${escapeHtml(ctx.assignmentFormat)}</p>
            </header>`;
    }

    function buildScoreSheetPdfHtml(ctx) {
        const t = ctx.template;
        const perPage = t.studentsPerPage || 6;
        const speakers = normalizeSpeakers(ctx);
        const headerClass = ctx.classTitle;
        const pageCount = Math.ceil(speakers.length / perPage) || 0;
        let pagesHtml = '';
        for (let p = 0; p < pageCount; p++) {
            const chunk = speakers.slice(p * perPage, p * perPage + perPage);
            let cards = '';
            chunk.forEach((sp) => {
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

    function buildPrintScoreSheetStudentBlock(t, sp) {
        const roleLabel = sp.roleAbbr || '';
        const keys = t.scoreKeys || [];
        const scoreCount = t.scoreRows.length;
        const commentsRowspan = 1 + scoreCount;
        const comments = sp.note ? escapeHtml(sp.note) : '';
        let rows = '';
        t.scoreRows.forEach((label, i) => {
            const value = speakerScoreValue(sp, keys[i]);
            rows += `<tr><td style="text-align:left;font-weight:600;width:42%;padding:5px 6px;">${escapeHtml(label)}</td><td style="text-align:center;padding:5px 6px;">${escapeHtml(value)}</td></tr>`;
        });
        return `
            <div class="student-block" style="margin-bottom:0.75rem;page-break-inside:avoid;break-inside:avoid;">
                <table style="width:100%;border-collapse:collapse;font-size:10pt;">
                    <tr>
                        <th style="width:18%;border:1px solid #999;padding:6px;background:#f4f4f4;">Name</th>
                        <th style="width:42%;border:1px solid #999;padding:6px;text-align:left;">${escapeHtml(sp.name)}</th>
                        <th style="width:28%;border:1px solid #999;padding:6px;background:#f4f4f4;">Comments</th>
                    </tr>
                    <tr>
                        <th style="border:1px solid #999;padding:6px;background:#f4f4f4;">Role</th>
                        <td style="border:1px solid #999;padding:6px;text-align:left;">${escapeHtml(roleLabel)}</td>
                        <td rowspan="${commentsRowspan}" style="border:1px solid #999;padding:6px;vertical-align:top;width:28%;white-space:pre-wrap;">${comments}</td>
                    </tr>
                    ${rows}
                </table>
                <p style="margin:4px 0 0 0;font-size:8.5pt;color:#666;">Debate ${escapeHtml(sp.debate)} · ${escapeHtml(sp.bench)}</p>
            </div>`;
    }

    function buildPrintScoreSheetsHtml(ctx) {
        const t = ctx.template;
        const perPage = t.studentsPerPage || 6;
        const speakers = normalizeSpeakers(ctx);
        const headerClass = ctx.classTitle;
        const borderColor = t.primary;
        const pageCount = Math.ceil(speakers.length / perPage) || 0;
        let body = '';
        for (let p = 0; p < pageCount; p++) {
            const chunk = speakers.slice(p * perPage, p * perPage + perPage);
            let blocks = '';
            chunk.forEach((sp) => {
                blocks += buildPrintScoreSheetStudentBlock(t, sp);
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
                .student-block{page-break-inside:avoid;break-inside:avoid;}
                .header-info div{margin:0.25rem 0;}
                th,td{border:1px solid #999;}
                @media print{body{padding:0.4in;} .sheet-page{border-width:1px;margin-bottom:0;} .student-block{page-break-inside:avoid;break-inside:avoid;}}
            </style></head><body>${body}</body></html>`;
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

    function buildExportContext(opts) {
        const classKey = opts.sheetTemplate === 'yeoul' ? 'yeoul' : 'garam';
        return {
            classKey,
            template: FEEDBACK_TEMPLATES[classKey],
            classTitle: opts.classTitle || '',
            hrTeacher: opts.hrTeacher || '',
            assignmentFormat: opts.formatName || '',
            dateStr:
                opts.dateStr ||
                new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
            speakers: opts.speakers || []
        };
    }

    async function exportWord(ctx) {
        if (typeof PizZip === 'undefined') {
            throw new Error('Word export library did not load. Check your connection and refresh.');
        }
        const templateBuf = await fetchFeedbackTemplate(ctx.classKey);
        const out = fillFeedbackDocx(templateBuf, ctx);
        downloadBlob(
            new Blob([new Uint8Array(out)], {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }),
            'Debate-Feedback-' + ctx.template.fileLabel.replace('–', '-') + '-' + dateForFilename() + '.docx'
        );
    }

    async function exportPdf(ctx, options) {
        if (typeof html2pdf === 'undefined') {
            throw new Error('PDF library did not load. Check your connection and refresh.');
        }
        const speakers = normalizeSpeakers(ctx);
        if (!speakers.length) {
            throw new Error('No student names to print. Generate assignments with named students first.');
        }
        const opts = options || {};
        let mount = document.getElementById(opts.mountId || 'feedback-sheet-mount');
        let createdMount = false;
        if (!mount) {
            mount = document.createElement('div');
            mount.id = 'feedback-sheet-mount-temp';
            mount.setAttribute('aria-hidden', 'true');
            mount.hidden = true;
            document.body.appendChild(mount);
            createdMount = true;
        }
        const prevHtml = mount.innerHTML;
        mount.innerHTML = buildScoreSheetPdfHtml(ctx);
        try {
            await html2pdf()
                .set({
                    margin: [8, 8, 8, 8],
                    filename: 'Debate-Feedback-' + dateForFilename() + '.pdf',
                    image: { type: 'jpeg', quality: 0.95 },
                    html2canvas: { scale: 2, useCORS: true, logging: false },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'] }
                })
                .from(mount)
                .save();
        } finally {
            mount.innerHTML = prevHtml;
            if (createdMount && mount.parentNode) {
                mount.parentNode.removeChild(mount);
            }
        }
    }

    function printSheets(ctx) {
        const speakers = normalizeSpeakers(ctx);
        if (!speakers.length) {
            throw new Error('No student names to print. Generate assignments with named students first.');
        }
        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win) {
            throw new Error('Allow pop-ups for this page to print score sheets.');
        }
        win.document.write(buildPrintScoreSheetsHtml(ctx));
        win.document.close();
        win.focus();
        win.print();
    }

    global.CCPDebateScoresheetExport = {
        FEEDBACK_TEMPLATES,
        buildExportContext,
        exportWord,
        exportPdf,
        printSheets,
        buildScoreSheetPdfHtml,
        buildPrintScoreSheetsHtml,
        normalizeSpeakers,
        dateForFilename
    };
})(typeof window !== 'undefined' ? window : globalThis);
