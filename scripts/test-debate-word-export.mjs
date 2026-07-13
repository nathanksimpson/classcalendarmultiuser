/**
 * One-off diagnostic: generate a filled score-sheet docx and validate document.xml.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { execSync } from 'child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const tplPath = path.join(root, 'js', 'debate', 'feedback-templates.js');

import vm from 'vm';

const sandbox = { globalThis: {}, window: {} };
sandbox.window = sandbox.globalThis;
vm.runInNewContext(fs.readFileSync(tplPath, 'utf8'), sandbox);
const FEEDBACK_TEMPLATE_B64 = sandbox.globalThis.FEEDBACK_TEMPLATE_B64 || sandbox.FEEDBACK_TEMPLATE_B64;

// Load PizZip from CDN cache or install
let PizZip;
try {
    PizZip = require(path.join(root, 'node_modules', 'pizzip'));
} catch {
    console.log('Installing pizzip for test...');
    execSync('npm install pizzip@3.1.7 --no-save', { cwd: root, stdio: 'inherit' });
    PizZip = require(path.join(root, 'node_modules', 'pizzip'));
}

// Minimal copy of export fill logic for node test
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

function fillStudentScoreBlock(filledRows, startIdx, speaker) {
    const name = speaker ? speaker.name : '';
    const roleLabel = speaker ? speaker.roleAbbr || '' : '';
    filledRows[startIdx] = setRowMiddleCell(filledRows[startIdx], name);
    if (filledRows[startIdx + 1]) {
        filledRows[startIdx + 1] = setRowMiddleCell(filledRows[startIdx + 1], roleLabel);
    }
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

function applyFilledTableRowsToDocument(documentXml, filledRows) {
    const rowRegex = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
    let cursor = 0;
    return documentXml.replace(rowRegex, function (match) {
        if (cursor < filledRows.length) {
            return filledRows[cursor++];
        }
        return match;
    });
}

function getTopLevelTableSpans(documentXml) {
    const bodyStart = documentXml.indexOf('<w:body');
    if (bodyStart < 0) return [];
    const bodyContentStart = documentXml.indexOf('>', bodyStart) + 1;
    const bodyEnd = documentXml.indexOf('</w:body>');
    const spans = [];
    let i = bodyContentStart;
    let depth = 0;
    let start = -1;
    while (i < bodyEnd) {
        if (documentXml.slice(i, i + 6) === '<w:tbl' && (documentXml[i + 6] === ' ' || documentXml[i + 6] === '>')) {
            if (depth === 0) start = i;
            depth++;
            i += 6;
            continue;
        }
        if (documentXml.slice(i, i + 8) === '</w:tbl>') {
            depth--;
            if (depth === 0 && start >= 0) {
                spans.push({ start, end: i + 8, xml: documentXml.slice(start, i + 8) });
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
    if (spans.length <= pageTableIndex) throw new Error('Template page layout is incomplete.');
    const span = spans[pageTableIndex];
    const before = documentXml.slice(0, span.start);
    const breakIdx = before.lastIndexOf('<w:lastRenderedPageBreak/>');
    let chunkStart = span.start;
    if (breakIdx >= 0) {
        const pStart = before.lastIndexOf('<w:p ', breakIdx);
        if (pStart >= 0) chunkStart = pStart;
    }
    return documentXml.slice(chunkStart, span.end);
}

function appendScoreSheetPageTables(documentXml, template, extraPageCount) {
    if (extraPageCount <= 0) return documentXml;
    const pageChunk = getScoreSheetPageCloneChunk(documentXml, 1);
    let cloneXml = '';
    for (let i = 0; i < extraPageCount; i++) cloneXml += pageChunk;
    const sectIdx = documentXml.lastIndexOf('<w:sectPr');
    if (sectIdx < 0) throw new Error('Could not extend score sheet document.');
    return documentXml.slice(0, sectIdx) + cloneXml + documentXml.slice(sectIdx);
}

const FEEDBACK_TEMPLATES = {
    garam: { studentsPerPage: 6, rowsPerStudent: 9 },
    yeoul: { studentsPerPage: 6, rowsPerStudent: 7 }
};

function fillFeedbackDocx(arrayBuffer, ctx) {
    const zip = new PizZip(arrayBuffer);
    let documentXml = zip.file('word/document.xml').asText();
    documentXml = fillDocumentHeaderFields(documentXml, ctx.classTitle, ctx.dateStr, ctx.hrTeacher);

    const template = ctx.template;
    const perPage = template.studentsPerPage || 6;
    let tableRows = getTableRowXmlList(documentXml);
    let blockStarts = findStudentBlockStarts(tableRows);
    const speakers = ctx.speakers || [];

    if (blockStarts.length === 0) {
        throw new Error('Could not find student score blocks in the template.');
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
        type: 'nodebuffer',
        compression: 'DEFLATE'
    });
}

function base64ToBuffer(b64) {
    return Buffer.from(b64, 'base64');
}

function validateXml(xml) {
    const issues = [];
    const openTags = xml.match(/<w:[^/>][^>]*>/g) || [];
    const closeTags = xml.match(/<\/w:[^>]+>/g) || [];
    if (!xml.includes('<?xml') && !xml.includes('<w:document')) {
        issues.push('missing document root');
    }
    // crude: unescaped bare ampersands
    const badAmp = xml.match(/&(?!amp;|lt;|gt;|quot;|apos;|#)/g);
    if (badAmp) issues.push(`unescaped ampersands: ${badAmp.length}`);
    // check for raw text outside tags in body (very crude)
    if (/<\/w:t>[^<]+<w:/.test(xml)) {
        issues.push('possible raw text between XML elements');
    }
    return issues;
}

const speakers = [
    { name: 'Alice Kim', roleAbbr: 'PM', debate: '1', bench: 'Government' },
    { name: 'Bob Lee', roleAbbr: 'LO', debate: '1', bench: 'Opposition' },
    { name: "O'Brien", roleAbbr: 'DPM', debate: '1', bench: 'Government' },
    { name: 'Test & <script>', roleAbbr: 'GW', debate: '1', bench: 'Government' }
];

for (const classKey of ['garam', 'yeoul']) {
    const buf = base64ToBuffer(FEEDBACK_TEMPLATE_B64[classKey]);
    const ctx = {
        classKey,
        template: FEEDBACK_TEMPLATES[classKey],
        classTitle: 'Period 3 & History',
        hrTeacher: 'Mr. Kim',
        dateStr: 'Jul 10, 2026',
        speakers
    };
    try {
        const out = fillFeedbackDocx(buf, ctx);
        const outPath = path.join(root, 'scripts', `_test-export-${classKey}.docx`);
        fs.writeFileSync(outPath, out);
        const zip2 = new PizZip(out);
        const docXml = zip2.file('word/document.xml').asText();
        const issues = validateXml(docXml);
        const origZip = new PizZip(buf);
        const origRows = getTableRowXmlList(origZip.file('word/document.xml').asText()).length;
        const newRows = getTableRowXmlList(docXml).length;
        console.log(`${classKey}: wrote ${outPath} (${out.length} bytes)`);
        console.log(`  rows: ${origRows} -> ${newRows}, blocks: ${findStudentBlockStarts(getTableRowXmlList(docXml)).length}`);
        console.log(`  xml issues: ${issues.length ? issues.join('; ') : 'none detected'}`);
    } catch (err) {
        console.error(`${classKey}: FAILED`, err.message);
    }
}

// Overflow: 13 speakers needs an extra cloned page
function fillFeedbackDocxFull(arrayBuffer, ctx) {
    const zip = new PizZip(arrayBuffer);
    let documentXml = zip.file('word/document.xml').asText();
    documentXml = fillDocumentHeaderFields(documentXml, ctx.classTitle, ctx.dateStr, ctx.hrTeacher);

    const template = ctx.template;
    const perPage = template.studentsPerPage || 6;
    let tableRows = getTableRowXmlList(documentXml);
    let blockStarts = findStudentBlockStarts(tableRows);
    const speakersList = ctx.speakers || [];

    if (blockStarts.length === 0) {
        throw new Error('Could not find student score blocks in the template.');
    }

    const templatePages = Math.floor(blockStarts.length / perPage);
    const pagesNeeded = Math.max(1, Math.ceil(speakersList.length / perPage));
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
        const sp = speakerIdx < speakersList.length ? speakersList[speakerIdx] : null;
        fillStudentScoreBlock(filledRows, startIdx, sp);
    });

    const filledXml = applyFilledTableRowsToDocument(documentXml, filledRows);
    zip.file('word/document.xml', filledXml);
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const manySpeakers = Array.from({ length: 13 }, (_, i) => ({
    name: `Student ${i + 1}`,
    roleAbbr: 'PM',
    debate: '1',
    bench: 'Gov'
}));
const bufG = base64ToBuffer(FEEDBACK_TEMPLATE_B64.garam);
try {
    const out = fillFeedbackDocxFull(bufG, {
        classKey: 'garam',
        template: FEEDBACK_TEMPLATES.garam,
        classTitle: 'Big Class',
        hrTeacher: 'Kim',
        dateStr: 'Jul 10, 2026',
        speakers: manySpeakers
    });
    const outPath = path.join(root, 'scripts', '_test-export-13speakers.docx');
    fs.writeFileSync(outPath, out);
    const zip2 = new PizZip(out);
    const docXml = zip2.file('word/document.xml').asText();
    const newRows = getTableRowXmlList(docXml).length;
    console.log(`overflow 13 speakers: ${out.length} bytes, rows ${newRows}, blocks ${findStudentBlockStarts(getTableRowXmlList(docXml)).length}`);
} catch (err) {
    console.error('overflow FAILED', err.message);
}
