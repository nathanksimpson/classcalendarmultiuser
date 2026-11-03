/**
 * TMS counsel + attendance profile scrape — shared by local Node server.
 *
 * Live TMS profiles_new.aspx is a shell with iframes. We fetch:
 *   - /iframe/student_consulting_list_new.aspx (counsel notes)
 *   - /iFrame/student_absense_list.aspx (attendance)
 *   - /popup/student_profile.aspx (enrollment status)
 *
 * Usage:
 *   const counsel = require('./tms-counsel-core.cjs');
 *   const tmsRoster = require('./tms-roster-core.cjs');
 *   const cfg = tmsRoster.getConfig();
 *   const result = await counsel.scrapeCounselProfiles(cfg, students, { tmsClassId });
 */
'use strict';

const tmsRoster = require('./tms-roster-core.cjs');

const PROFILES_PATH = '/popup/profiles_new.aspx';
const CONSULT_IFRAME_PATH = '/iframe/student_consulting_list_new.aspx';
const ABSENCE_IFRAME_PATH = '/iFrame/student_absense_list.aspx';
const PROFILE_POPUP_PATH = '/popup/student_profile.aspx';
const CLASS_POPUP_PATH = tmsRoster.CLASS_POPUP_PATH;
const MAX_NOTES_PER_STUDENT = 20;

// ─── keyword sets ────────────────────────────────────────────────────────────

const QUIT_KEYWORDS_KO = ['퇴원', '그만', '중단', '그만둘', '등록 취소', '등록취소'];
const BREAK_KEYWORDS_KO = ['휴원', '쉬다', '잠시', '휴식', '방학 중 휴'];
const ATTENDANCE_KEYWORDS_KO = ['결석', '지각', '조퇴', '미참석'];
const STARTEND_KEYWORDS_KO = ['개강', '종료예정', '마지막'];
const QUIT_KEYWORDS_EN = ['quit', 'withdraw', 'withdrawal', 'cancel enrollment', 'cancelled enrollment'];
const BREAK_KEYWORDS_EN = ['break', 'time off', 'hiatus', 'vacation leave'];
const ATTENDANCE_KEYWORDS_EN = ['absent', 'late', 'early leave', 'missed'];
const STARTEND_KEYWORDS_EN = ['starting', 'last class', 'final class'];

const DROP_KINDS = new Set(['인수인계', '메모']);

// ─── helpers ─────────────────────────────────────────────────────────────────

function stripTags(html) {
    return String(html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/\s+/g, ' ')
        .trim();
}

function extractCellHtmls(rowHtml) {
    const cells = [];
    const re = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let m;
    while ((m = re.exec(rowHtml)) !== null) {
        cells.push(m[1]);
    }
    return cells;
}

function extractCells(rowHtml) {
    return extractCellHtmls(rowHtml).map((html) => stripTags(html));
}

function decodeHtmlEntities(s) {
    return String(s || '')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
}

function cellTextFromHtml(cellHtml) {
    const titleM = /title=["']([^"']*)["']/i.exec(String(cellHtml || ''));
    if (titleM && titleM[1].length > 12) {
        return stripTags(decodeHtmlEntities(titleM[1]));
    }
    return stripTags(cellHtml);
}

function splitCounselorCell(text) {
    const s = String(text || '').trim();
    const m = s.match(/^(.+?)\((.+)\)\s*$/);
    if (m) {
        return { teacher: m[1].trim(), kind: m[2].trim() };
    }
    return { teacher: s, kind: '' };
}

function extractRows(tableHtml) {
    const rows = [];
    const re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = re.exec(tableHtml)) !== null) {
        rows.push(m[1]);
    }
    return rows;
}

function stripComments(html) {
    return String(html || '').replace(/<!--[\s\S]*?-->/g, '');
}

function isDateLike(s) {
    return /\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(String(s || ''));
}

function normalizeDate(s) {
    const m = String(s || '').match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (!m) return '';
    const yy = m[1];
    const mm = m[2].padStart(2, '0');
    const dd = m[3].padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

function detectFlags(text) {
    const t = String(text || '').toLowerCase();
    const tKo = String(text || '');
    const flags = new Set();

    for (const kw of QUIT_KEYWORDS_KO) {
        if (tKo.includes(kw)) { flags.add('quit'); break; }
    }
    for (const kw of BREAK_KEYWORDS_KO) {
        if (tKo.includes(kw)) { flags.add('break'); break; }
    }
    for (const kw of ATTENDANCE_KEYWORDS_KO) {
        if (tKo.includes(kw)) { flags.add('attendance'); break; }
    }
    for (const kw of STARTEND_KEYWORDS_KO) {
        if (tKo.includes(kw)) { flags.add('startend'); break; }
    }
    for (const kw of QUIT_KEYWORDS_EN) {
        if (t.includes(kw)) { flags.add('quit'); break; }
    }
    for (const kw of BREAK_KEYWORDS_EN) {
        if (t.includes(kw)) { flags.add('break'); break; }
    }
    for (const kw of ATTENDANCE_KEYWORDS_EN) {
        if (t.includes(kw)) { flags.add('attendance'); break; }
    }
    for (const kw of STARTEND_KEYWORDS_EN) {
        if (t.includes(kw)) { flags.add('startend'); break; }
    }
    return Array.from(flags);
}

function resolveAbsoluteUrl(cfg, href) {
    const raw = String(href || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return `${cfg.baseUrl.replace(/^http:/i, 'https:').split('://')[0]}://${raw.slice(2)}`;
    if (raw.startsWith('/')) return `${cfg.baseUrl}${raw}`;
    return `${cfg.baseUrl}/popup/${raw.replace(/^\.\//, '')}`;
}

function buildProfileShellUrl(cfg, mpidx, staffId, classId) {
    return `${cfg.baseUrl}${PROFILES_PATH}?MPIdx=${encodeURIComponent(mpidx)}&Createby=${encodeURIComponent(staffId)}&ClassIdx=${encodeURIComponent(classId)}`;
}

function buildIframeUrls(cfg, mpidx, staffId, classId) {
    const qs = (path, params) => {
        const u = new URL(`${cfg.baseUrl}${path}`);
        Object.keys(params).forEach((k) => {
            const v = params[k];
            if (v != null && String(v).trim() !== '') {
                u.searchParams.set(k, String(v));
            }
        });
        return u.href;
    };
    return {
        shell: buildProfileShellUrl(cfg, mpidx, staffId, classId),
        counsel: qs(CONSULT_IFRAME_PATH, { idx: mpidx, createby: staffId, ClassIdx: classId }),
        absence: qs(ABSENCE_IFRAME_PATH, { idx: mpidx }),
        profile: qs(PROFILE_POPUP_PATH, { mpidx, createby: staffId }),
        classPopup: classId
            ? `${cfg.baseUrl}${CLASS_POPUP_PATH}?classidx=${encodeURIComponent(classId)}`
            : `${cfg.baseUrl}${CLASS_POPUP_PATH}`
    };
}

function extractIframeSrcFromShell(shellHtml, pattern) {
    const re = new RegExp(`<iframe[^>]+src=["']([^"']*${pattern}[^"']*)["']`, 'i');
    const m = re.exec(String(shellHtml || ''));
    return m ? m[1] : '';
}

async function fetchHtmlPage(jar, url, referer) {
    const headers = {};
    if (referer) {
        headers.Referer = referer;
    }
    const page = await tmsRoster.fetchPage(jar, url, { headers });
    if (tmsRoster.stillOnLoginPage && tmsRoster.stillOnLoginPage(page.text, page.finalUrl)) {
        const err = new Error('TMS session expired');
        err.code = 'TMS_LOGIN_FAILED';
        throw err;
    }
    return page && page.text ? page.text : '';
}

async function warmClassPopup(jar, cfg, tmsClassId, referer) {
    if (!tmsClassId) {
        return;
    }
    const url = `${cfg.baseUrl}${CLASS_POPUP_PATH}?classidx=${encodeURIComponent(tmsClassId)}`;
    await fetchHtmlPage(jar, url, referer || `${cfg.baseUrl}${CLASS_POPUP_PATH}`);
}

/**
 * Find the counsel table — heading 상담저장시 or table with 날짜 + 내용 headers.
 */
function findCounselTable(html) {
    const s = stripComments(html);
    const headingRe = /상담저장시[\s\S]{0,120}?인수인계/i;
    const headingMatch = headingRe.exec(s);
    if (headingMatch) {
        const after = s.slice(headingMatch.index + headingMatch[0].length);
        const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/i;
        const tableMatch = tableRe.exec(after);
        if (tableMatch) return tableMatch[1];
    }
    const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
    let m;
    while ((m = tableRe.exec(s)) !== null) {
        const text = stripTags(m[1]);
        if (text.includes('날짜') && (text.includes('내용') || text.includes('상담'))) return m[1];
        if (text.includes('날짜') && text.includes('상담자')) return m[1];
    }
    return '';
}

/**
 * Find the attendance table — 출석 section or 출결 + 날짜 headers.
 */
function findAttendanceTable(html) {
    const tables = findAttendanceTables(html);
    return tables[0] || '';
}

/** Every attendance table on the page. TMS sometimes splits recent and older rows. */
function findAttendanceTables(html) {
    const s = stripComments(html);
    const tables = [];
    const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
    let m;
    while ((m = tableRe.exec(s)) !== null) {
        const text = stripTags(m[1]);
        if ((text.includes('출결') || text.includes('출석')) && text.includes('날짜')) {
            tables.push(m[1]);
        } else if (text.includes('날짜') && text.includes('상태')) {
            tables.push(m[1]);
        }
    }
    return tables;
}

function mergeAttendanceRecords(lists) {
    const out = [];
    const seen = new Set();
    (Array.isArray(lists) ? lists : []).forEach((list) => {
        (Array.isArray(list) ? list : []).forEach((rec) => {
            if (!rec || !rec.date) {
                return;
            }
            const key = `${rec.date}|${rec.status || ''}|${rec.memo || ''}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            out.push(rec);
        });
    });
    out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return out;
}

function decodePagingHtml(html) {
    return String(html || '')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
}

/** ASP.NET pager links on the absence list. Other postbacks (sort, buttons) are ignored. */
function extractAbsencePagingTargets(html) {
    const decoded = decodePagingHtml(html);
    const targets = [];
    const seen = new Set();
    const re = /__doPostBack\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/gi;
    let m;
    while ((m = re.exec(decoded)) !== null) {
        const target = m[1];
        const arg = m[2] || '';
        if (!/paging|page\$/i.test(`${target}${arg}`)) {
            continue;
        }
        const key = `${target}\0${arg}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        targets.push({ target, arg });
        if (targets.length >= 12) {
            break;
        }
    }
    return targets;
}

function encodeFormFields(fields) {
    return Object.keys(fields || {})
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(fields[key] == null ? '' : fields[key])}`)
        .join('&');
}

/** Pager links to follow. Separate from the month walk so a long term is not cut off. */
const ABSENCE_PAGER_CAP = 12;
/** One post per month from the earliest Day 4 through today. A term fits in a school year. */
const ABSENCE_TERM_MONTH_CAP = 14;

function oldestAttendanceDate(html) {
    const records = mergeAttendanceRecords(findAttendanceTables(html).map(parseAttendanceTable));
    if (!records.length) {
        return '';
    }
    return records[records.length - 1].date || '';
}

function oldestDateInPages(pages) {
    let oldest = '';
    (pages || []).forEach((html) => {
        const date = oldestAttendanceDate(html);
        if (date && (!oldest || date < oldest)) {
            oldest = date;
        }
    });
    return oldest;
}

function monthsFromThrough(throughDate, todayIso) {
    const through = String(throughDate || '').slice(0, 10);
    const today = String(todayIso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(through) || !/^\d{4}-\d{2}-\d{2}$/.test(today) || through > today) {
        return [];
    }
    let y = Number(through.slice(0, 4));
    let m = Number(through.slice(5, 7));
    const endKey = today.slice(0, 7);
    const out = [];
    while (out.length < ABSENCE_TERM_MONTH_CAP) {
        const key = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
        out.push({ year: String(y), month: m, key });
        if (key >= endKey) {
            break;
        }
        m += 1;
        if (m > 12) {
            m = 1;
            y += 1;
        }
    }
    return out;
}

function textBefore(html, index) {
    const start = Math.max(0, index - 80);
    return stripTags(String(html || '').slice(start, index)).replace(/\s+/g, ' ').trim();
}

function labelForId(html, id) {
    if (!id) {
        return '';
    }
    const escaped = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`<label\\b[^>]*for=["']${escaped}["'][^>]*>([\\s\\S]*?)</label>`, 'i');
    const m = String(html || '').match(re);
    return m ? stripTags(m[1]).replace(/\s+/g, ' ').trim() : '';
}

function parseSelects(html) {
    const selects = [];
    const re = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
    let m;
    const src = String(html || '');
    while ((m = re.exec(src)) !== null) {
        const attrs = m[1] || '';
        const name = (attrs.match(/\bname=["']([^"']+)["']/i) || [])[1] || '';
        const id = (attrs.match(/\bid=["']([^"']+)["']/i) || [])[1] || '';
        const options = [];
        const optRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
        let om;
        while ((om = optRe.exec(m[2])) !== null) {
            const valueAttr = om[1].match(/\bvalue=["']([^"']*)["']/i);
            const label = stripTags(om[2]).replace(/\s+/g, ' ').trim();
            options.push({ value: valueAttr ? valueAttr[1] : label, label });
        }
        const hint = `${name} ${id} ${labelForId(src, id)} ${textBefore(src, m.index)}`;
        selects.push({ name, options, hint });
    }
    return selects;
}

function looksLikeYear(select) {
    if (!select || !/year|yyyy|년도|년/i.test(select.hint || '')) {
        return false;
    }
    return (select.options || []).some((o) => /^20\d{2}$/.test(String((o && (o.value || o.label)) || '').trim()));
}

function monthNumberFrom(text) {
    const s = String(text || '').trim();
    if (!s || /^20\d{2}/.test(s)) {
        return 0;
    }
    const m = s.match(/^0?(\d{1,2})(?:\s*월)?$/);
    if (!m) {
        return 0;
    }
    const n = Number(m[1]);
    return n >= 1 && n <= 12 ? n : 0;
}

function looksLikeMonth(select) {
    if (!select || !/month|\bmm\b|월/i.test(select.hint || '')) {
        return false;
    }
    return (select.options || []).some((o) => monthNumberFrom(o && o.value) || monthNumberFrom(o && o.label));
}

function optionForMonth(select, month) {
    return (select.options || []).find((o) => monthNumberFrom(o && o.value) === month || monthNumberFrom(o && o.label) === month) || null;
}

function optionForYear(select, year) {
    return (select.options || []).find((o) => String((o && o.value) || '').trim() === year || String((o && o.label) || '').trim() === year) || null;
}

function parseDateInputs(html) {
    const inputs = [];
    const re = /<input\b([^>]*)>/gi;
    let m;
    const src = String(html || '');
    while ((m = re.exec(src)) !== null) {
        const attrs = m[1] || '';
        const type = ((attrs.match(/\btype=["']([^"']+)["']/i) || [])[1] || 'text').toLowerCase();
        if (/hidden|submit|button|checkbox|radio|image|file/.test(type)) {
            continue;
        }
        const name = (attrs.match(/\bname=["']([^"']+)["']/i) || [])[1] || '';
        if (!name) {
            continue;
        }
        const id = (attrs.match(/\bid=["']([^"']+)["']/i) || [])[1] || '';
        const hint = `${name} ${id} ${labelForId(src, id)} ${textBefore(src, m.index)}`;
        if (!/date|날짜|년|월|sdate|edate|from|to/i.test(hint)) {
            continue;
        }
        inputs.push({ name, hint });
    }
    return inputs;
}

function isoMonthStart(year, month) {
    return `${year}-${String(month).padStart(2, '0')}-01`;
}

function isoMonthEnd(year, month, todayIso) {
    const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return todayIso && String(todayIso).slice(0, 7) === key && todayIso < end ? todayIso : end;
}

/** null = login page, stop. '' = empty page, keep going. */
async function postAbsenceForm(jar, absenceUrl, referer, baseHtml, extraFields) {
    if (!tmsRoster.extractHiddenInputs || !tmsRoster.fetchPage) {
        return '';
    }
    const fields = Object.assign({}, tmsRoster.extractHiddenInputs(baseHtml), extraFields || {});
    const res = await tmsRoster.fetchPage(jar, absenceUrl, {
        method: 'POST',
        preservePost: true,
        headers: {
            Referer: referer || absenceUrl,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: encodeFormFields(fields)
    });
    const text = res && res.text ? res.text : '';
    if (tmsRoster.stillOnLoginPage && tmsRoster.stillOnLoginPage(text, res && res.finalUrl)) {
        return null;
    }
    return text;
}

/**
 * First absence page, later pager pages, then one form post per month from
 * attendanceThroughDate through today. That date is the earliest debate
 * recording day in the term, whatever month it falls in.
 * No control and no pager means the recent page is all TMS sent.
 */
async function fetchAbsenceHistory(jar, absenceUrl, referer, options) {
    const opts = options || {};
    const throughDate = String(opts.attendanceThroughDate || '').slice(0, 10);
    const todayIso = String(opts.attendanceToday || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const first = await fetchHtmlPage(jar, absenceUrl, referer);
    const pages = [first];
    let extra = 0;
    const targets = extractAbsencePagingTargets(first);
    if (targets.length && tmsRoster.extractHiddenInputs && tmsRoster.fetchPage) {
        for (let i = 0; i < targets.length && extra < ABSENCE_PAGER_CAP; i += 1) {
            extra += 1;
            try {
                const text = await postAbsenceForm(jar, absenceUrl, referer, first, {
                    __EVENTTARGET: targets[i].target,
                    __EVENTARGUMENT: targets[i].arg
                });
                if (text == null) {
                    break;
                }
                if (text) {
                    pages.push(text);
                }
            } catch (_) {
                break;
            }
        }
    }
    const oldest = oldestDateInPages(pages);
    const needsOlder = Boolean(throughDate && (!oldest || oldest > throughDate));
    if (!needsOlder) {
        return pages;
    }

    const selects = parseSelects(first);
    const yearSel = selects.find((s) => s.name && looksLikeYear(s));
    const monthSel = selects.find((s) => s.name && looksLikeMonth(s) && s !== yearSel);
    const dateInputs = !monthSel ? parseDateInputs(first) : [];
    if (!monthSel && !dateInputs.length) {
        return pages;
    }

    const months = monthsFromThrough(throughDate, todayIso);
    const formBase = pages[pages.length - 1] || first;
    let monthPosts = 0;
    for (let i = 0; i < months.length && monthPosts < ABSENCE_TERM_MONTH_CAP; i += 1) {
        const slot = months[i];
        const extraFields = { __EVENTARGUMENT: '' };
        if (monthSel) {
            const monthOpt = optionForMonth(monthSel, slot.month);
            if (!monthOpt) {
                continue;
            }
            extraFields[monthSel.name] = monthOpt.value;
            extraFields.__EVENTTARGET = monthSel.name;
            if (yearSel) {
                const yearOpt = optionForYear(yearSel, slot.year);
                if (yearOpt) {
                    extraFields[yearSel.name] = yearOpt.value;
                }
            }
        } else {
            const start = isoMonthStart(slot.year, slot.month);
            const end = isoMonthEnd(slot.year, slot.month, todayIso);
            const fromInput = dateInputs.find((inp) => /from|start|sdate|시작|부터/i.test(inp.hint));
            const toInput = dateInputs.find((inp) => /to|end|edate|종료|까지/i.test(inp.hint) && inp !== fromInput);
            if (fromInput && toInput) {
                extraFields[fromInput.name] = start;
                extraFields[toInput.name] = end;
                extraFields.__EVENTTARGET = toInput.name;
            } else if (dateInputs.length === 1) {
                extraFields[dateInputs[0].name] = start;
                extraFields.__EVENTTARGET = dateInputs[0].name;
            } else {
                break;
            }
        }
        monthPosts += 1;
        try {
            const text = await postAbsenceForm(jar, absenceUrl, referer, formBase, extraFields);
            if (text == null) {
                break;
            }
            if (text) {
                pages.push(text);
            }
        } catch (_) {
            break;
        }
    }
    return pages;
}

function parseEnrollmentStatus(html) {
    const s = stripComments(html);
    const result = {
        enrollStatus: '',
        quitDate: '',
        breakPeriod: '',
        breakStart: '',
        breakEnd: ''
    };

    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = rowRe.exec(s)) !== null) {
        const cells = extractCells(m[1]);
        for (let i = 0; i + 1 < cells.length; i += 2) {
            const label = String(cells[i] || '').trim();
            const value = String(cells[i + 1] || '').trim();
            if (!value) continue;
            if (label === '구분') {
                result.enrollStatus = value;
            } else if (label === '퇴원일') {
                result.quitDate = normalizeDate(value) || value;
            } else if (label === '휴원기간' || label === '휴원') {
                result.breakPeriod = value;
                const range = value.match(/(\d{4}[-./]\d{1,2}[-./]\d{1,2})\s*[~–-]\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/);
                if (range) {
                    result.breakStart = normalizeDate(range[1]);
                    result.breakEnd = normalizeDate(range[2]);
                } else {
                    result.breakStart = normalizeDate(value) || '';
                }
            }
        }
    }
    return result;
}

function parseAttendanceTable(tableHtml) {
    const rows = extractRows(tableHtml);
    const records = [];
    let colDate = 0;
    let colStatus = 1;
    let colMemo = 2;
    let headerFound = false;

    for (const row of rows) {
        const cellHtmls = extractCellHtmls(row);
        const cells = cellHtmls.map((html) => stripTags(html));
        if (!headerFound) {
            const lower = cells.map((c) => c.toLowerCase());
            const dateIdx = lower.findIndex((c) => c.includes('날짜') || c.includes('일자'));
            const statusIdx = lower.findIndex((c) => c.includes('상태') || c.includes('출결'));
            if (dateIdx >= 0 || statusIdx >= 0) {
                if (dateIdx >= 0) colDate = dateIdx;
                if (statusIdx >= 0) {
                    colStatus = statusIdx;
                    const memoIdx = lower.findIndex((c) => c.includes('메모'));
                    if (memoIdx >= 0) colMemo = memoIdx;
                }
                headerFound = true;
                continue;
            }
            if (!isDateLike(cells[0])) {
                continue;
            }
            headerFound = true;
        }
        if (cells.length < 2) continue;
        const maybeDate = cells[colDate] || cells[0] || '';
        if (!isDateLike(maybeDate)) continue;
        const date = normalizeDate(maybeDate);
        const status = String(cells[colStatus] || cells[1] || '').trim();
        const memo = cellTextFromHtml(cellHtmls[colMemo] || cellHtmls[2] || '');
        const flags = [];
        if (['결석', '지각', '조퇴', '미참석'].includes(status)) flags.push('attendance');
        records.push({ date, status, memo, flags });
    }
    return records;
}

function parseCounselTable(tableHtml) {
    const rows = extractRows(tableHtml);
    const notes = [];
    let colDate = 0;
    let colKind = 1;
    let colTeacher = 2;
    let colText = 3;
    let format = 'legacy';
    let headerFound = false;

    for (const row of rows) {
        const cellHtmls = extractCellHtmls(row);
        const cells = cellHtmls.map((html) => stripTags(html));
        if (!headerFound) {
            const lower = cells.map((c) => c.toLowerCase());
            const dateIdx = lower.findIndex((c) => c.includes('날짜') || c.includes('일자'));
            const counselorIdx = lower.findIndex((c) => c.includes('상담자'));
            if (dateIdx >= 0 || counselorIdx >= 0) {
                colDate = dateIdx >= 0 ? dateIdx : 0;
                if (counselorIdx >= 0) {
                    format = 'counselor';
                    colTeacher = counselorIdx;
                    const textIdx = lower.findIndex((c) => c.includes('내용'));
                    colText = textIdx >= 0 ? textIdx : counselorIdx + 1;
                } else {
                    const kindIdx = lower.findIndex((c) => c.includes('구분') || c.includes('종류'));
                    if (kindIdx >= 0) colKind = kindIdx;
                    const teacherIdx = lower.findIndex(
                        (c) => c.includes('상담자') || c.includes('교사') || c.includes('담당') || c.includes('작성자')
                    );
                    if (teacherIdx >= 0) colTeacher = teacherIdx;
                    const textIdx = lower.findIndex((c) => c.includes('내용'));
                    if (textIdx >= 0) colText = textIdx;
                }
                headerFound = true;
                continue;
            }
            if (isDateLike(cells[0])) {
                headerFound = true;
            } else {
                continue;
            }
        }
        if (cells.length < 2) continue;
        const maybeDate = cells[colDate] || cells[0] || '';
        if (!isDateLike(maybeDate)) continue;
        const date = normalizeDate(maybeDate);

        let kind = '';
        let teacher = '';
        let text = '';
        if (format === 'counselor') {
            const counselor = splitCounselorCell(cells[colTeacher] || cells[1] || '');
            kind = counselor.kind;
            teacher = counselor.teacher;
            text = cellTextFromHtml(cellHtmls[colText] || cellHtmls[2] || '');
        } else {
            kind = String(cells[colKind] || '').trim();
            teacher = String(cells[colTeacher] || '').trim();
            text = cellTextFromHtml(cellHtmls[colText] || cellHtmls[3] || '');
        }

        const isDropped = DROP_KINDS.has(kind);
        const direction = kind.includes('발신') || kind.includes('out')
            ? 'outgoing'
            : kind.includes('수신') || kind.includes('in')
              ? 'incoming'
              : '';
        const flags = isDropped ? [] : detectFlags(text);

        notes.push({ date, direction, kind, teacher, text, flags, isDropped });
    }
    return notes;
}

function parseProfileParts(parts, meta) {
    const m = Object.assign({ studentId: '', name: '', mpidx: '' }, meta || {});
    const counselHtml = parts.counselHtml || parts.shellHtml || '';
    const attendanceHtml = parts.attendanceHtml || parts.shellHtml || '';
    const profileHtml = parts.profileHtml || parts.shellHtml || '';

    const enrollment = parseEnrollmentStatus(profileHtml);
    const attendanceRecords = mergeAttendanceRecords(
        findAttendanceTables(attendanceHtml).map((table) => parseAttendanceTable(table))
    );
    const counselTableHtml = findCounselTable(counselHtml);
    const allNotes = parseCounselTable(counselTableHtml);

    const flagged = allNotes.filter((n) => !n.isDropped && n.flags.length > 0);
    const unflagged = allNotes.filter((n) => !n.isDropped && n.flags.length === 0);
    const keepCount = Math.max(0, MAX_NOTES_PER_STUDENT - flagged.length);
    const notes = [...flagged, ...unflagged.slice(0, keepCount)].sort((a, b) =>
        (b.date || '').localeCompare(a.date || '')
    );

    const watchFlags = deriveWatchFlags(enrollment, attendanceRecords, notes);

    return {
        studentId: m.studentId,
        name: m.name,
        mpidx: m.mpidx,
        error: null,
        ...enrollment,
        notes,
        attendanceRecords,
        watchFlags
    };
}

/**
 * Parse a single HTML blob (legacy inline page or merged fixture).
 */
function parseProfileHtml(html, meta) {
    const parsed = parseProfileParts({ shellHtml: html }, meta);
    parsed._rawHtml = html;
    return parsed;
}

function deriveWatchFlags(enrollment, attendanceRecords, notes) {
    const flags = [];

    if (enrollment.enrollStatus === '퇴원') {
        flags.push({
            type: 'quit',
            severity: 'danger',
            label: '퇴원',
            date: enrollment.quitDate || '',
            source: 'tms_profile'
        });
    } else if (enrollment.enrollStatus === '휴원') {
        flags.push({
            type: 'break',
            severity: 'warning',
            label: '휴원',
            date: enrollment.breakStart || enrollment.breakPeriod || '',
            endDate: enrollment.breakEnd || '',
            source: 'tms_profile'
        });
    }

    for (const note of notes) {
        if (note.flags.includes('quit') && !flags.some((f) => f.type === 'quit')) {
            flags.push({ type: 'quit', severity: 'danger', label: '퇴원 언급', date: note.date, source: 'tms_note' });
        }
        if (note.flags.includes('break') && !flags.some((f) => f.type === 'break')) {
            flags.push({ type: 'break', severity: 'warning', label: '휴원 언급', date: note.date, source: 'tms_note' });
        }
    }

    const recent = (attendanceRecords || []).slice(0, 5);
    const recentAbsent = recent.filter((r) => r.status === '결석' || r.status === '조퇴');
    if (recentAbsent.length >= 2) {
        flags.push({
            type: 'attendance',
            severity: 'warning',
            label: `최근 결석 ${recentAbsent.length}회`,
            date: recentAbsent[0] && recentAbsent[0].date,
            source: 'tms_attendance'
        });
    } else if (recentAbsent.length === 1) {
        flags.push({
            type: 'attendance',
            severity: 'warning',
            label: '최근 결석',
            date: recentAbsent[0] && recentAbsent[0].date,
            source: 'tms_attendance'
        });
    }

    return flags;
}

function resolveStaffId(homeHtml) {
    const s = String(homeHtml || '');
    const patterns = [
        /[?&]Createby=(\d+)/i,
        /[?&]staffidx=(\d+)/i,
        /name=["']HHmpidx["'][^>]*value=["'](\d+)["']/i,
        /Createby\s*=\s*(\d+)/i
    ];
    for (const re of patterns) {
        const m = re.exec(s);
        if (m) return m[1];
    }
    const hrefRe = /href=["'][^"']*[?&](?:Createby|staffidx)=(\d+)/gi;
    let m;
    while ((m = hrefRe.exec(s)) !== null) {
        return m[1];
    }
    return '';
}

function emptyProfile(student, error) {
    return {
        studentId: student.id || student.tmsMpidx || '',
        name: student.name || '',
        mpidx: String(student.tmsMpidx || student.mpidx || '').trim(),
        error: error || 'fetch_failed',
        enrollStatus: '',
        quitDate: '',
        breakPeriod: '',
        breakStart: '',
        breakEnd: '',
        notes: [],
        attendanceRecords: [],
        watchFlags: []
    };
}

async function fetchStudentProfile(cfg, jar, staffId, student, tmsClassId, options) {
    const opts = options || {};
    const mpidx = String(student.tmsMpidx || student.mpidx || '').trim();
    const classId = String(student.tmsClassId || tmsClassId || '').trim();
    if (!mpidx) {
        return emptyProfile(student, 'no_mpidx');
    }

    const urls = buildIframeUrls(cfg, mpidx, staffId, classId);
    const warmedClasses = opts.warmedClasses;

    try {
        if (classId && warmedClasses && !warmedClasses.has(classId)) {
            await warmClassPopup(jar, cfg, classId, `${cfg.baseUrl}${CLASS_POPUP_PATH}`);
            warmedClasses.add(classId);
        } else if (classId && !warmedClasses) {
            await warmClassPopup(jar, cfg, classId, `${cfg.baseUrl}${CLASS_POPUP_PATH}`);
        }

        const shellHtml = await fetchHtmlPage(jar, urls.shell, `${cfg.baseUrl}${CLASS_POPUP_PATH}?classidx=${encodeURIComponent(classId)}`);

        let counselUrl = urls.counsel;
        let absenceUrl = urls.absence;
        const shellCounselSrc = extractIframeSrcFromShell(shellHtml, 'student_consulting');
        const shellAbsenceSrc = extractIframeSrcFromShell(shellHtml, 'student_absense');
        if (shellCounselSrc) {
            counselUrl = resolveAbsoluteUrl(cfg, shellCounselSrc);
        }
        if (shellAbsenceSrc) {
            absenceUrl = resolveAbsoluteUrl(cfg, shellAbsenceSrc);
        }

        const attendanceOnly = opts.attendanceOnly === true;
        const counselHtml = attendanceOnly ? '' : await fetchHtmlPage(jar, counselUrl, urls.shell);
        const absencePages = await fetchAbsenceHistory(jar, absenceUrl, urls.shell, {
            attendanceThroughDate: opts.attendanceThroughDate || '',
            attendanceToday: opts.attendanceToday || ''
        });
        const absenceHtml = absencePages[0] || '';
        const profileHtml = attendanceOnly ? '' : await fetchHtmlPage(jar, urls.profile, urls.shell);

        const combinedLen = (counselHtml || '').length + (absenceHtml || '').length + (profileHtml || '').length;
        if (combinedLen < 200) {
            return Object.assign(emptyProfile(student, 'empty_response'), { missingClassIdx: !classId });
        }

        const parsed = parseProfileParts(
            { counselHtml, attendanceHtml: absencePages.join('\n'), profileHtml, shellHtml },
            { studentId: student.id || mpidx, name: student.name || '', mpidx }
        );

        parsed.missingClassIdx = !classId;
        parsed._rawHtml = shellHtml;
        parsed._iframeHtml = { counsel: counselHtml, absence: absenceHtml, profile: profileHtml };

        const hasData = attendanceOnly
            ? Array.isArray(parsed.attendanceRecords)
            : parsed.enrollStatus ||
              (parsed.notes && parsed.notes.length) ||
              (parsed.attendanceRecords && parsed.attendanceRecords.length);

        if (!hasData) {
            parsed.error = 'parse_empty';
        }

        return parsed;
    } catch (err) {
        if (err && err.code === 'TMS_LOGIN_FAILED') {
            throw err;
        }
        return Object.assign(emptyProfile(student, err && err.name === 'AbortError' ? 'timeout' : (err && err.message) || 'fetch_failed'), {
            missingClassIdx: !classId
        });
    }
}

async function scrapeCounselProfiles(cfg, students, options) {
    const opts = options || {};
    const tmsClassId = String(opts.tmsClassId || '').trim();
    const batch = [{ classId: '', tmsClassId, students: students || [] }];
    const bulk = await scrapeCounselProfilesBatch(cfg, batch, opts);
    return {
        students: bulk.classes[''] ? bulk.classes[''].students : bulk.classes.__default__ ? bulk.classes.__default__.students : [],
        staffId: bulk.staffId,
        stats: bulk.stats
    };
}

async function scrapeCounselProfilesBatch(cfg, classBatches, options) {
    const attendanceOnly = Boolean(options && options.attendanceOnly);
    if (!tmsRoster.credentialsConfigured(cfg)) {
        const err = new Error('TMS credentials not configured');
        err.code = 'TMS_CREDS_MISSING';
        throw err;
    }

    const jar = { map: new Map() };
    const { homeHtml } = await tmsRoster.login(cfg, jar);
    const staffId = resolveStaffId(homeHtml);

    const classes = {};
    const warmedClasses = new Set();
    const profileByMpidx = new Map();
    const seenMpidx = new Set();
    const attendanceByMpidx = new Map();
    let requestCount = 0;
    let scraped = 0;
    let noMpidx = 0;
    let errors = 0;
    let parse_empty = 0;
    let empty_response = 0;
    let totalNotes = 0;
    let missingClassIdx = 0;
    let reused = 0;

    for (const batch of classBatches || []) {
        const classId = String(batch.classId || '').trim();
        const tmsClassId = String(batch.tmsClassId || '').trim();
        const bucketKey = classId || '__default__';
        const profiles = [];

        if (!tmsClassId && (batch.students || []).length) {
            missingClassIdx += (batch.students || []).length;
        }

        for (const student of batch.students || []) {
            const mpidx = String(student.tmsMpidx || student.mpidx || '').trim();
            if (mpidx) {
                seenMpidx.add(mpidx);
            }
            // Attendance is per TMS class. Reuse only the same class; a later class merges records.
            const cacheKey = attendanceOnly ? `${mpidx}\0${tmsClassId}` : mpidx;
            if (mpidx && profileByMpidx.has(cacheKey)) {
                const cached = profileByMpidx.get(cacheKey);
                // Clone so each class card can carry its own studentId/name from this roster seat.
                const reusedProfile = Object.assign({}, cached, {
                    studentId: student.id || cached.studentId,
                    name: student.name || cached.name,
                    mpidx
                });
                reused += 1;
                totalNotes += (reusedProfile.notes && reusedProfile.notes.length) || 0;
                if (attendanceOnly && Array.isArray(reusedProfile.attendanceRecords)) {
                    attendanceByMpidx.set(mpidx, mergeAttendanceRecords([
                        attendanceByMpidx.get(mpidx) || [],
                        reusedProfile.attendanceRecords
                    ]));
                }
                profiles.push(reusedProfile);
                continue;
            }

            if (requestCount > 0) {
                await new Promise((r) => setTimeout(r, 300));
            }
            requestCount += 1;
            const profile = await fetchStudentProfile(cfg, jar, staffId, student, tmsClassId, {
                warmedClasses,
                attendanceOnly,
                attendanceThroughDate: options && options.attendanceThroughDate,
                attendanceToday: options && options.attendanceToday
            });
            const { _rawHtml: _r, _iframeHtml: _i, ...cleaned } = profile;
            if (cleaned.error === 'no_mpidx') {
                noMpidx += 1;
            } else if (cleaned.error === 'parse_empty') {
                parse_empty += 1;
                errors += 1;
            } else if (cleaned.error === 'empty_response') {
                empty_response += 1;
                errors += 1;
            } else if (cleaned.error) {
                errors += 1;
            } else {
                scraped += 1;
            }
            totalNotes += (cleaned.notes && cleaned.notes.length) || 0;
            if (mpidx && !cleaned.error) {
                profileByMpidx.set(cacheKey, cleaned);
            } else if (mpidx && cleaned.error === 'parse_empty') {
                // Still cache parse_empty so we do not hammer TMS for the same shell.
                profileByMpidx.set(cacheKey, cleaned);
            }
            if (attendanceOnly && mpidx && Array.isArray(cleaned.attendanceRecords) && cleaned.attendanceRecords.length) {
                attendanceByMpidx.set(mpidx, mergeAttendanceRecords([
                    attendanceByMpidx.get(mpidx) || [],
                    cleaned.attendanceRecords
                ]));
            }
            profiles.push(cleaned);
        }

        classes[bucketKey] = { classId, tmsClassId, students: profiles };
    }

    if (attendanceOnly && attendanceByMpidx.size) {
        Object.keys(classes).forEach((key) => {
            const bucket = classes[key];
            bucket.students = (bucket.students || []).map((profile) => {
                const mpidx = String((profile && profile.mpidx) || '').trim();
                const merged = mpidx ? attendanceByMpidx.get(mpidx) : null;
                if (!merged || !merged.length || !profile || profile.error === 'no_mpidx') {
                    return profile;
                }
                const next = Object.assign({}, profile, { attendanceRecords: merged });
                if (next.error) {
                    delete next.error;
                }
                return next;
            });
        });
    }

    return {
        classes,
        staffId,
        stats: {
            classes: Object.keys(classes).length,
            students: requestCount,
            uniqueMpidx: seenMpidx.size,
            reused,
            scraped,
            noMpidx,
            errors,
            parse_empty,
            empty_response,
            totalNotes,
            missingClassIdx
        }
    };
}

/**
 * Attendance-only fetch for one student: just the absence list iframe (one GET),
 * instead of the profile shell + counsel notes + enrollment popup (four GETs).
 * Falls back to the shell's iframe src once if the direct URL returns nothing.
 */
async function fetchStudentAttendance(cfg, jar, staffId, student, tmsClassId, warmedClasses) {
    const mpidx = String(student.tmsMpidx || student.mpidx || '').trim();
    const classId = String(student.tmsClassId || tmsClassId || '').trim();
    const base = {
        studentId: student.id || mpidx,
        name: student.name || '',
        mpidx,
        attendanceOnly: true,
        missingClassIdx: !classId
    };
    if (!mpidx) {
        return Object.assign(base, { error: 'no_mpidx', attendanceRecords: [] });
    }
    const urls = buildIframeUrls(cfg, mpidx, staffId, classId);
    try {
        if (classId && !warmedClasses.has(classId)) {
            await warmClassPopup(jar, cfg, classId, `${cfg.baseUrl}${CLASS_POPUP_PATH}`);
            warmedClasses.add(classId);
        }
        let absenceHtml = await fetchHtmlPage(jar, urls.absence, urls.shell);
        let tableHtml = findAttendanceTable(absenceHtml);
        if (!tableHtml) {
            // Some TMS sessions only serve the iframe after the profile shell is opened.
            const shellHtml = await fetchHtmlPage(
                jar,
                urls.shell,
                `${cfg.baseUrl}${CLASS_POPUP_PATH}?classidx=${encodeURIComponent(classId)}`
            );
            const src = extractIframeSrcFromShell(shellHtml, 'student_absense');
            absenceHtml = await fetchHtmlPage(jar, src ? resolveAbsoluteUrl(cfg, src) : urls.absence, urls.shell);
            tableHtml = findAttendanceTable(absenceHtml);
        }
        if (!tableHtml) {
            return Object.assign(base, {
                error: (absenceHtml || '').length < 200 ? 'empty_response' : 'parse_empty',
                attendanceRecords: []
            });
        }
        // An empty table is a valid answer: no absences on record.
        return Object.assign(base, { error: null, attendanceRecords: parseAttendanceTable(tableHtml) });
    } catch (err) {
        if (err && err.code === 'TMS_LOGIN_FAILED') {
            throw err;
        }
        return Object.assign(base, {
            error: err && err.name === 'AbortError' ? 'timeout' : (err && err.message) || 'fetch_failed',
            attendanceRecords: []
        });
    }
}

/**
 * Fast attendance sync for Debate Rec: one sign-in, then one GET per unique student.
 * Same response shape as scrapeCounselProfilesBatch, but profiles carry only
 * attendanceRecords (attendanceOnly: true) — callers must merge, not replace.
 * READ-ONLY toward TMS: sign-in POST, then GET requests only.
 */
async function scrapeAttendanceBatch(cfg, classBatches) {
    if (!tmsRoster.credentialsConfigured(cfg)) {
        const err = new Error('TMS credentials not configured');
        err.code = 'TMS_CREDS_MISSING';
        throw err;
    }
    const jar = { map: new Map() };
    const { homeHtml } = await tmsRoster.login(cfg, jar);
    const staffId = resolveStaffId(homeHtml);

    const classes = {};
    const warmedClasses = new Set();
    const byMpidx = new Map();
    const stats = {
        classes: 0,
        students: 0,
        uniqueMpidx: 0,
        reused: 0,
        scraped: 0,
        noMpidx: 0,
        errors: 0,
        parse_empty: 0,
        empty_response: 0,
        totalNotes: 0,
        missingClassIdx: 0,
        attendanceOnly: true
    };

    for (const batch of classBatches || []) {
        const classId = String(batch.classId || '').trim();
        const tmsClassId = String(batch.tmsClassId || '').trim();
        const profiles = [];
        if (!tmsClassId && (batch.students || []).length) {
            stats.missingClassIdx += (batch.students || []).length;
        }
        for (const student of batch.students || []) {
            const mpidx = String(student.tmsMpidx || student.mpidx || '').trim();
            if (mpidx && byMpidx.has(mpidx)) {
                stats.reused += 1;
                profiles.push(Object.assign({}, byMpidx.get(mpidx), {
                    studentId: student.id || mpidx,
                    name: student.name || ''
                }));
                continue;
            }
            if (stats.students > 0) {
                await new Promise((r) => setTimeout(r, 150));
            }
            stats.students += 1;
            const profile = await fetchStudentAttendance(cfg, jar, staffId, student, tmsClassId, warmedClasses);
            if (profile.error === 'no_mpidx') {
                stats.noMpidx += 1;
            } else if (profile.error) {
                stats.errors += 1;
                if (profile.error === 'parse_empty') {
                    stats.parse_empty += 1;
                } else if (profile.error === 'empty_response') {
                    stats.empty_response += 1;
                }
            } else {
                stats.scraped += 1;
            }
            if (mpidx && !profile.error) {
                byMpidx.set(mpidx, profile);
            }
            profiles.push(profile);
        }
        classes[classId || '__default__'] = { classId, tmsClassId, students: profiles };
    }
    stats.classes = Object.keys(classes).length;
    stats.uniqueMpidx = byMpidx.size;
    return { classes, staffId, stats };
}

async function scrapeCounselProfile(cfg, student, options) {
    const opts = options || {};
    const tmsClassId = String(opts.tmsClassId || student.tmsClassId || '').trim();

    if (!tmsRoster.credentialsConfigured(cfg)) {
        const err = new Error('TMS credentials not configured');
        err.code = 'TMS_CREDS_MISSING';
        throw err;
    }

    const jar = { map: new Map() };
    const { homeHtml } = await tmsRoster.login(cfg, jar);
    const staffId = resolveStaffId(homeHtml);
    return fetchStudentProfile(cfg, jar, staffId, student, tmsClassId);
}

module.exports = {
    scrapeCounselProfiles,
    scrapeCounselProfilesBatch,
    scrapeAttendanceBatch,
    scrapeCounselProfile,
    parseProfileHtml,
    parseProfileParts,
    parseEnrollmentStatus,
    parseAttendanceTable,
    parseCounselTable,
    findCounselTable,
    findAttendanceTable,
    buildIframeUrls,
    detectFlags,
    resolveStaffId,
    deriveWatchFlags,
    QUIT_KEYWORDS_KO,
    BREAK_KEYWORDS_KO,
    ATTENDANCE_KEYWORDS_KO,
    DROP_KINDS
};
