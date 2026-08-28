/**
 * Timetable PDF import — pdf.js text extraction with OCR fallback via CCPTimetableImportOcr.
 */
(function (global) {
    const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const marker = src.split('?')[0];
            const existing = document.querySelector(`script[data-cc-src="${marker}"]`);
            if (existing && existing.dataset.ccLoaded === '1') {
                resolve();
                return;
            }
            if (existing) {
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error('Failed to load ' + src)), {
                    once: true
                });
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.defer = true;
            script.dataset.ccSrc = marker;
            script.onload = () => {
                script.dataset.ccLoaded = '1';
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load ' + src));
            document.head.appendChild(script);
        });
    }

    function ensurePdfJs() {
        if (global.pdfjsLib) {
            return Promise.resolve(global.pdfjsLib);
        }
        return loadScript(PDFJS_URL).then(() => {
            if (!global.pdfjsLib) {
                throw new Error('pdf.js failed to load');
            }
            global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
            return global.pdfjsLib;
        });
    }

    function clusterLines(items, yTolerance) {
        const tol = yTolerance != null ? yTolerance : 4;
        const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
        const lines = [];
        sorted.forEach((item) => {
            let row = lines.find((ln) => Math.abs(ln.y - item.y) <= tol);
            if (!row) {
                row = { y: item.y, parts: [] };
                lines.push(row);
            }
            row.parts.push(item);
        });
        lines.sort((a, b) => b.y - a.y);
        return lines.map((ln) => {
            ln.parts.sort((a, b) => a.x - b.x);
            return ln.parts.map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim();
        });
    }

    function linesToAoA(textLines) {
        const imp = global.CCPTimetableImport;
        if (!imp) {
            return textLines.map((line) => [line]);
        }
        const aoa = [];
        textLines.forEach((line) => {
            if (!line) {
                return;
            }
            const headerIdx = imp.findHeaderRowIndex(aoa.length ? aoa.concat([[line]]) : [[line]]);
            aoa.push([line]);
        });
        return textLines.map((line) => {
            const cols = String(line).split(/\s{2,}|\t/).map((c) => c.trim());
            if (cols.length > 1) {
                return cols;
            }
            return [line];
        });
    }

    function reconstructAoAFromPositionedText(items) {
        if (!items.length) {
            return [];
        }
        const lines = [];
        const yTol = 5;
        const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
        const rowBuckets = [];
        sorted.forEach((item) => {
            let bucket = rowBuckets.find((b) => Math.abs(b.y - item.y) <= yTol);
            if (!bucket) {
                bucket = { y: item.y, items: [] };
                rowBuckets.push(bucket);
            }
            bucket.items.push(item);
        });
        rowBuckets.sort((a, b) => b.y - a.y);
        rowBuckets.forEach((bucket) => {
            bucket.items.sort((a, b) => a.x - b.x);
            const cols = [];
            let lastX = -1;
            let colIdx = -1;
            bucket.items.forEach((it) => {
                if (lastX < 0 || it.x - lastX > 40) {
                    colIdx += 1;
                    cols[colIdx] = it.text;
                } else {
                    cols[colIdx] = `${cols[colIdx]} ${it.text}`.trim();
                }
                lastX = it.x;
            });
            lines.push(cols);
        });
        return lines;
    }

    async function extractTextItemsFromPdf(buffer) {
        const pdfjsLib = await ensurePdfJs();
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();
        const items = [];
        (textContent.items || []).forEach((item) => {
            const str = String(item.str || '').trim();
            if (!str) {
                return;
            }
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            items.push({
                text: str,
                x: tx[4],
                y: tx[5]
            });
        });
        return { items, page, pdfjsLib };
    }

    async function renderPdfPageToCanvas(buffer, scale) {
        const pdfjsLib = await ensurePdfJs();
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: scale || 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        return canvas;
    }

    /**
     * Parse PDF buffer into TimetableImportDraft.
     */
    async function parsePdfArrayBuffer(buffer, options) {
        options = options || {};
        const imp = global.CCPTimetableImport;
        if (!imp) {
            throw new Error('CCPTimetableImport not loaded');
        }

        let aoa = [];
        let sourceType = 'pdf_text';
        try {
            const { items } = await extractTextItemsFromPdf(buffer);
            const meaningful = items.filter((it) => it.text.length > 0);
            if (meaningful.length >= 12) {
                aoa = reconstructAoAFromPositionedText(meaningful);
            }
        } catch (e) {
            options.warnings = (options.warnings || []).concat(['pdf_text_failed']);
        }

        const textChars = aoa.flat().join('');
        const hasGrid =
            aoa.length >= 4 &&
            imp.findHeaderRowIndex(aoa) >= 0 &&
            /mon|tue|월|화|time|시간|\d{1,2}:\d{2}/i.test(textChars);

        if (!hasGrid) {
            sourceType = 'pdf_ocr';
            const ocr = global.CCPTimetableImportOcr;
            if (!ocr || typeof ocr.parseImageToDraft !== 'function') {
                throw new Error('pdf_ocr_unavailable');
            }
            const canvas = await renderPdfPageToCanvas(buffer, 2);
            const draft = await ocr.parseImageToDraft(canvas, options);
            return Object.assign({}, draft, { sourceType: 'pdf_ocr' });
        }

        return imp.parseGridFromAoA(aoa, Object.assign({ sourceType }, options));
    }

    global.CCPTimetableImportPdf = {
        ensurePdfJs,
        parsePdfArrayBuffer,
        renderPdfPageToCanvas,
        reconstructAoAFromPositionedText,
        extractTextItemsFromPdf
    };
})(typeof window !== 'undefined' ? window : globalThis);
