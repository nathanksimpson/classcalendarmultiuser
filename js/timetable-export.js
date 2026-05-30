/**
 * Export teacher weekly timetable to .xlsx (SheetJS, lazy-loaded).
 */
(function (global) {
    const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

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
                existing.addEventListener('error', () => reject(new Error('Failed to load ' + src)), { once: true });
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

    function ensureXlsx() {
        if (global.XLSX) {
            return Promise.resolve(global.XLSX);
        }
        return loadScript(SHEETJS_URL).then(() => {
            if (!global.XLSX) {
                throw new Error('SheetJS failed to load');
            }
            return global.XLSX;
        });
    }

    function hexToArgb(hex, fallback) {
        let h = String(hex || fallback || '6366f1').replace('#', '').trim();
        if (h.length === 3) {
            h = h.split('').map((c) => c + c).join('');
        }
        if (h.length !== 6) {
            h = '6366f1';
        }
        return 'FF' + h.toUpperCase();
    }

    function sanitizeFilename(name) {
        return String(name || 'timetable')
            .trim()
            .replace(/[^a-zA-Z0-9가-힣\s-]/g, '')
            .replace(/\s+/g, '-')
            .slice(0, 80) || 'timetable';
    }

    function cellText(entry, homeroomPrefix) {
        const lines = [];
        if (entry.className) {
            lines.push(entry.className);
        }
        if (entry.category) {
            lines.push(`(${entry.category})`);
        }
        if (entry.homeroomLabel && homeroomPrefix) {
            lines.push(`${homeroomPrefix}: ${entry.homeroomLabel}`);
        }
        return lines.join('\n');
    }

    function buildSheetAoA(block, meta) {
        const lang = meta.lang === 'ko' ? 'ko' : 'en';
        const homeroomPrefix = lang === 'ko' ? '담임' : 'HR';
        const timeHeader = meta.timeHeader || 'Time';
        const cols = block.columns || [];
        const aoa = [];
        aoa.push([meta.teacherName || '']);
        if (meta.homeroomLabels && meta.homeroomLabels.length) {
            const hrLabel = meta.homeroomLineLabel || 'Homeroom';
            aoa.push([`${hrLabel}: ${meta.homeroomLabels.join(' ')}`]);
        } else {
            aoa.push([]);
        }
        aoa.push([timeHeader].concat(cols.map((c) => (lang === 'ko' ? c.ko : c.en))));
        (block.rows || []).forEach((row) => {
            const line = [row.timeLabel || ''];
            row.cells.forEach((cell) => {
                if (!cell.entries || !cell.entries.length) {
                    line.push('');
                    return;
                }
                line.push(cell.entries.map((e) => cellText(e, homeroomPrefix)).join('\n'));
            });
            aoa.push(line);
        });
        return aoa;
    }

    function applySheetStyles(ws, block, XLSX) {
        if (!ws['!ref']) {
            return;
        }
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r; R <= range.e.r; R += 1) {
            for (let C = range.s.c; C <= range.e.c; C += 1) {
                const addr = XLSX.utils.encode_cell({ r: R, c: C });
                const cell = ws[addr];
                if (!cell) {
                    continue;
                }
                if (R < 3) {
                    cell.s = { font: { bold: R === 2 } };
                } else if (C === 0 || R === 2) {
                    cell.s = { font: { bold: true } };
                }
            }
        }
        const dataStartRow = 3;
        (block.rows || []).forEach((row, ri) => {
            row.cells.forEach((gridCell, ci) => {
                const R = dataStartRow + ri;
                const C = 1 + ci;
                const addr = XLSX.utils.encode_cell({ r: R, c: C });
                const cell = ws[addr];
                if (!cell || !gridCell.entries || !gridCell.entries.length) {
                    return;
                }
                const entry = gridCell.entries[0];
                const fillRgb = hexToArgb(entry.color, '6366f1').slice(2);
                const fontRgb = hexToArgb(entry.textColor, 'ffffff').slice(2);
                cell.s = {
                    fill: { patternType: 'solid', fgColor: { rgb: fillRgb } },
                    font: { color: { rgb: fontRgb } }
                };
            });
        });
    }

    /**
     * @param {object} grid - buildTeacherWeeklyGrid result
     * @param {object} meta - { lang, timeHeader, homeroomLineLabel, filename }
     */
    function exportTeacherTimetableXlsx(grid, meta) {
        meta = meta || {};
        return ensureXlsx().then((XLSX) => {
            const wb = XLSX.utils.book_new();
            const blocks = (grid && grid.blocks) || [];
            const names = blocks.length > 1 ? ['Primary', 'Secondary'] : ['Timetable'];
            blocks.forEach((block, i) => {
                const aoa = buildSheetAoA(block, {
                    teacherName: grid.teacherName,
                    homeroomLabels: grid.homeroomLabels,
                    lang: meta.lang,
                    timeHeader: meta.timeHeader,
                    homeroomLineLabel: meta.homeroomLineLabel
                });
                const ws = XLSX.utils.aoa_to_sheet(aoa);
                ws['!cols'] = [{ wch: 14 }].concat(block.columns.map(() => ({ wch: 18 })));
                try {
                    applySheetStyles(ws, block, XLSX);
                } catch (_) {
                    /* styling optional if pro features missing */
                }
                const sheetName = block.id === 'secondary' ? 'Secondary' : (names[i] || `Sheet${i + 1}`);
                XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
            });
            if (!blocks.length) {
                const ws = XLSX.utils.aoa_to_sheet([[grid.teacherName || ''], [], ['No classes assigned']]);
                XLSX.utils.book_append_sheet(wb, ws, 'Timetable');
            }
            const fname = `${sanitizeFilename(meta.filename || grid.teacherName)}.xlsx`;
            XLSX.writeFile(wb, fname);
        });
    }

    global.CCPTimetableExport = {
        exportTeacherTimetableXlsx,
        ensureXlsx
    };
})(typeof window !== 'undefined' ? window : globalThis);
