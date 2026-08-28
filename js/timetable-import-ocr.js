/**
 * Timetable photo / scanned-PDF OCR — grid alignment + Tesseract.js per-cell read.
 */
(function (global) {
    const TESSERACT_URL =
        'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';

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

    function ensureTesseract() {
        if (global.Tesseract) {
            return Promise.resolve(global.Tesseract);
        }
        return loadScript(TESSERACT_URL).then(() => {
            if (!global.Tesseract) {
                throw new Error('Tesseract failed to load');
            }
            return global.Tesseract;
        });
    }

    function imageToCanvas(imageSource) {
        return new Promise((resolve, reject) => {
            if (imageSource instanceof HTMLCanvasElement) {
                resolve(imageSource);
                return;
            }
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                ctx.drawImage(img, 0, 0);
                resolve(canvas);
            };
            img.onerror = () => reject(new Error('image_load_failed'));
            if (typeof imageSource === 'string') {
                img.src = imageSource;
            } else if (imageSource instanceof Blob) {
                img.src = URL.createObjectURL(imageSource);
            } else {
                reject(new Error('unsupported_image_source'));
            }
        });
    }

    function detectGridBounds(canvas) {
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        const data = ctx.getImageData(0, 0, width, height).data;
        const marginX = Math.floor(width * 0.08);
        const marginY = Math.floor(height * 0.12);
        const gridW = width - marginX * 2;
        const gridH = height - marginY * 2;
        const cols = 6;
        const headerRows = 3;
        const bodyRows = 8;
        return {
            left: marginX,
            top: marginY,
            width: gridW,
            height: gridH,
            cols,
            headerRows,
            bodyRows,
            colWidth: gridW / cols,
            rowHeight: gridH / (headerRows + bodyRows)
        };
    }

    function preprocessCell(ctx, x, y, w, h) {
        const img = ctx.getImageData(x, y, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const v = gray > 140 ? 255 : 0;
            d[i] = d[i + 1] = d[i + 2] = v;
            d[i + 3] = 255;
        }
        const cell = document.createElement('canvas');
        cell.width = w;
        cell.height = h;
        cell.getContext('2d').putImageData(img, 0, 0);
        return cell;
    }

    async function ocrCanvasRegion(canvas, bounds, col, row) {
        const Tesseract = await ensureTesseract();
        const x = Math.floor(bounds.left + col * bounds.colWidth);
        const y = Math.floor(bounds.top + row * bounds.rowHeight);
        const w = Math.floor(bounds.colWidth);
        const h = Math.floor(bounds.rowHeight);
        const src = canvas.getContext('2d');
        const cell = preprocessCell(src, x, y, w, h);
        const result = await Tesseract.recognize(cell, 'eng+kor', {
            tessedit_pageseg_mode: Tesseract.PSM?.SINGLE_BLOCK || '6'
        });
        const text = String((result.data && result.data.text) || '')
            .replace(/\s+/g, ' ')
            .trim();
        const conf = result.data && result.data.confidence != null ? result.data.confidence / 100 : 0.5;
        return { text, confidence: conf };
    }

    /**
     * Parse image/canvas into TimetableImportDraft using fixed grid heuristics.
     */
    async function parseImageToDraft(imageSource, options) {
        options = options || {};
        const imp = global.CCPTimetableImport;
        if (!imp) {
            throw new Error('CCPTimetableImport not loaded');
        }
        const canvas = await imageToCanvas(imageSource);
        const bounds = detectGridBounds(canvas);
        const aoa = [];

        for (let r = 0; r < bounds.headerRows + bounds.bodyRows; r += 1) {
            const row = [];
            for (let c = 0; c < bounds.cols; c += 1) {
                const { text, confidence } = await ocrCanvasRegion(canvas, bounds, c, r);
                row.push(text);
                if (r >= bounds.headerRows && c > 0 && text) {
                    row._conf = row._conf || [];
                    row._conf[c] = confidence;
                }
            }
            aoa.push(row);
        }

        const draft = imp.parseGridFromAoA(aoa, {
            sourceType: options.sourceType || 'photo_ocr',
            timetableTimeSlots: options.timetableTimeSlots,
            periodSlotMap: options.periodSlotMap,
            defaultConfidence: 0.85
        });

        draft.rows.forEach((dataRow) => {
            dataRow.cells.forEach((cell) => {
                if (cell.confidence == null || cell.confidence === 1) {
                    cell.confidence = 0.85;
                }
            });
        });

        if (!draft.rows.length) {
            draft.warnings = (draft.warnings || []).concat(['ocr_low_structure']);
        }
        return draft;
    }

    global.CCPTimetableImportOcr = {
        ensureTesseract,
        imageToCanvas,
        detectGridBounds,
        parseImageToDraft,
        ocrCanvasRegion
    };
})(typeof window !== 'undefined' ? window : globalThis);
