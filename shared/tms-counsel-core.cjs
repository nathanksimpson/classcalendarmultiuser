/**
 * TMS counsel + attendance profile scrape — shared by local Node server.
 *
 * Fetches /popup/profiles_new.aspx per student (login reused from tms-roster-core).
 * Parses:
 *   1. Enrollment status block: 구분 (재원/휴원/퇴원), 퇴원일, 휴원기간
 *   2. 출석 table: date, status (출석/결석/지각/조퇴), memo
 *   3. [상담저장시 학부모님께 문자전송] counsel table (skips 인수인계 & 메모 rows)
 *
 * Keeps raw HTML on result._rawHtml so tms-probe.mjs can write the fixture.
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
const MAX_NOTES_PER_STUDENT = 20;

// ─── keyword sets ────────────────────────────────────────────────────────────

const QUIT_KEYWORDS_KO = ['퇴원', '그만', '중단', '그만둘', '등록 취소', '등록취소', '퇴'];
const BREAK_KEYWORDS_KO = ['휴원', '쉬다', '잠시', '휴식', '방학 중 휴'];
const ATTENDANCE_KEYWORDS_KO = ['결석', '지각', '조퇴', '미참석'];
const STARTEND_KEYWORDS_KO = ['개강', '종료예정', '마지막'];
const QUIT_KEYWORDS_EN = ['quit', 'leave', 'withdraw', 'left', 'cancel'];
const BREAK_KEYWORDS_EN = ['break', 'time off', 'hiatus', 'vacation leave'];
const ATTENDANCE_KEYWORDS_EN = ['absent', 'late', 'early leave', 'missed'];
const STARTEND_KEYWORDS_EN = ['starting', 'last class', 'final class'];

// Rows with these kind labels are always dropped (they're internal handover/memo notes)
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

function extractCells(rowHtml) {
    const cells = [];
    const re = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let m;
    while ((m = re.exec(rowHtml)) !== null) {
        cells.push(stripTags(m[1]));
    }
    return cells;
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

function extractTableByIndex(html, index) {
    const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
    let i = 0;
    let m;
    while ((m = re.exec(String(html || ''))) !== null) {
        if (i === index) return m[1];
        i++;
    }
    return '';
}

/**
 * Find the table whose preceding heading text contains 상담저장시
 * Falls back to scanning all tables for one whose first header row contains 날짜 + 내용.
 */
function findCounselTable(html) {
    const s = stripComments(html);
    // Look for the section heading then grab the next table
    const headingRe = /상담저장시[^<]*인수인계[^<]*/i;
    const headingMatch = headingRe.exec(s);
    if (headingMatch) {
        const after = s.slice(headingMatch.index + headingMatch[0].length);
        const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/i;
        const tableMatch = tableRe.exec(after);
        if (tableMatch) return tableMatch[1];
    }
    // Fallback: find table with 날짜 내용 headers
    const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
    let m;
    while ((m = tableRe.exec(s)) !== null) {
        const text = stripTags(m[1]);
        if (text.includes('날짜') && text.includes('내용')) return m[1];
    }
    return '';
}

/**
 * Find the 출석 attendance table.
 */
function findAttendanceTable(html) {
    const s = stripComments(html);
    // Look for 출석 section heading
    const sectionRe = /출석\s*<\/div>/i;
    const sectionMatch = sectionRe.exec(s);
    if (sectionMatch) {
        const after = s.slice(sectionMatch.index);
        const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/i;
        const tableMatch = tableRe.exec(after);
        if (tableMatch) return tableMatch[1];
    }
    // Fallback: table with 출결 header
    const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
    let m;
    while ((m = tableRe.exec(s)) !== null) {
        const text = stripTags(m[1]);
        if (text.includes('출결') && text.includes('날짜')) return m[1];
    }
    return '';
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

/**
 * Scan text for flag keywords. Returns array of flag strings.
 */
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

// ─── parsers ─────────────────────────────────────────────────────────────────

/** Strip HTML comments so they don't pollute parsers */
function stripComments(html) {
    return String(html || '').replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Parse enrollment status block from table_profile.
 * Returns { enrollStatus, quitDate, breakPeriod, breakStart, breakEnd }
 */
function parseEnrollmentStatus(html) {
    const s = stripComments(html);
    const result = {
        enrollStatus: '',   // '재원' | '휴원' | '퇴원' | ''
        quitDate: '',       // YYYY-MM-DD
        breakPeriod: '',    // raw string e.g. "2026-07-15 ~ 2026-08-20"
        breakStart: '',
        breakEnd: ''
    };

    // Look for label/value pairs in the profile table
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
                // Parse "YYYY-MM-DD ~ YYYY-MM-DD"
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

/**
 * Parse 출석 attendance table.
 * Returns array of { date, status, memo, flags[] }
 * status: '출석' | '결석' | '지각' | '조퇴' | ''
 */
function parseAttendanceTable(tableHtml) {
    const rows = extractRows(tableHtml);
    const records = [];
    for (const row of rows) {
        const cells = extractCells(row);
        if (cells.length < 2) continue;
        const maybeDate = cells[0];
        if (!isDateLike(maybeDate)) continue; // skip header rows
        const date = normalizeDate(maybeDate);
        const status = String(cells[1] || '').trim();
        const memo = String(cells[2] || '').trim();
        const flags = [];
        if (['결석', '지각', '조퇴', '미참석'].includes(status)) flags.push('attendance');
        records.push({ date, status, memo, flags });
    }
    return records;
}

/**
 * Parse the counsel table (상담저장시… section).
 * Returns array of { date, direction, kind, teacher, text, flags[], isDropped }
 * direction: 'outgoing' | 'incoming' | ''
 */
function parseCounselTable(tableHtml) {
    const rows = extractRows(tableHtml);
    const notes = [];
    // Detect column order from first header row
    let colDate = 0, colKind = 1, colTeacher = 2, colText = 3;
    let headerFound = false;
    for (const row of rows) {
        const cells = extractCells(row);
        if (!headerFound) {
            // Detect header by looking for 날짜 cell
            const lower = cells.map(c => c.toLowerCase());
            const dateIdx = lower.findIndex(c => c.includes('날짜') || c.includes('일자'));
            if (dateIdx >= 0) {
                colDate = dateIdx;
                const kindIdx = lower.findIndex(c => c.includes('구분') || c.includes('종류'));
                if (kindIdx >= 0) colKind = kindIdx;
                const teacherIdx = lower.findIndex(c => c.includes('교사') || c.includes('담당') || c.includes('작성자'));
                if (teacherIdx >= 0) colTeacher = teacherIdx;
                const textIdx = lower.findIndex(c => c.includes('내용') || c.includes('상담'));
                if (textIdx >= 0) colText = textIdx;
                headerFound = true;
                continue;
            }
            // If first cell looks like a date, treat this as a data row (no header row present)
            if (isDateLike(cells[0])) {
                headerFound = true;
            } else {
                continue;
            }
        }
        if (cells.length < 2) continue;
        const maybeDate = cells[colDate] || '';
        if (!isDateLike(maybeDate)) continue;
        const date = normalizeDate(maybeDate);
        const kind = String(cells[colKind] || '').trim();
        const teacher = String(cells[colTeacher] || '').trim();
        const text = String(cells[colText] || '').trim();

        const isDropped = DROP_KINDS.has(kind);
        const direction = kind.includes('발신') ? 'outgoing'
            : kind.includes('수신') ? 'incoming'
            : '';
        const flags = isDropped ? [] : detectFlags(text);

        notes.push({ date, direction, kind, teacher, text, flags, isDropped });
    }
    return notes;
}

// ─── main public API ──────────────────────────────────────────────────────────

/**
 * Fetch and parse counsel + attendance profile for one student.
 *
 * @param {object} cfg   - tmsRoster config (has baseUrl, username, password)
 * @param {object} jar   - existing cookie jar from tmsRoster.login()
 * @param {string} staffId - Createby (logged-in TMS staff id)
 * @param {object} student - { id, name, tmsMpidx, tmsClassId? }
 * @param {string} [tmsClassId] - fallback class id
 * @returns {Promise<object>}
 */
async function fetchStudentProfile(cfg, jar, staffId, student, tmsClassId) {
    const mpidx = String(student.tmsMpidx || student.mpidx || '').trim();
    const classId = String(student.tmsClassId || tmsClassId || '').trim();
    if (!mpidx) {
        return {
            studentId: student.id || mpidx,
            name: student.name || '',
            mpidx,
            error: 'no_mpidx',
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

    const url = `${cfg.baseUrl}${PROFILES_PATH}?MPIdx=${encodeURIComponent(mpidx)}&Createby=${encodeURIComponent(staffId)}&ClassIdx=${encodeURIComponent(classId)}`;
    const page = await tmsRoster.fetchClassPopupPostback
        ? // use existing low-level request helper via roster module if available
          null
        : null;

    // Use the exported request helper from roster core via the module's internal request path
    // Since tmsRoster doesn't export request() directly, we make a plain fetch-based GET
    // using the cookie jar pattern from roster core.
    const cookieHeader = jar && jar.map
        ? Array.from(jar.map.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
        : '';

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 20000) : null;
    let html = '';
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'ClassManager-TMS-Sync/1.0',
                Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
                Cookie: cookieHeader,
                Referer: `${cfg.baseUrl}/`
            },
            redirect: 'follow',
            signal: controller ? controller.signal : undefined
        });
        if (timer) clearTimeout(timer);
        const buf = new Uint8Array(await res.arrayBuffer());
        let decoded = new TextDecoder('utf-8').decode(buf);
        if (/charset\s*=\s*euc-kr/i.test(decoded) || /charset\s*=\s*ks_c_5601/i.test(decoded)) {
            try { decoded = new TextDecoder('euc-kr').decode(buf); } catch (_) { /* keep utf8 */ }
        }
        html = decoded;
    } catch (err) {
        if (timer) clearTimeout(timer);
        return {
            studentId: student.id || mpidx,
            name: student.name || '',
            mpidx,
            error: err && err.name === 'AbortError' ? 'timeout' : (err && err.message) || 'fetch_failed',
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

    return parseProfileHtml(html, { studentId: student.id || mpidx, name: student.name || '', mpidx });
}

/**
 * Parse a profiles_new.aspx HTML string.
 * Exported so tests can call it directly with fixture HTML.
 */
function parseProfileHtml(html, meta) {
    const s = String(html || '');
    const m = Object.assign({ studentId: '', name: '', mpidx: '' }, meta || {});

    // 1. Enrollment status
    const enrollment = parseEnrollmentStatus(s);

    // 2. Attendance table (출석 section)
    const attendanceTableHtml = findAttendanceTable(s);
    const attendanceRecords = parseAttendanceTable(attendanceTableHtml);

    // 3. Counsel table
    const counselTableHtml = findCounselTable(s);
    const allNotes = parseCounselTable(counselTableHtml);

    // Keep: not dropped + cap at MAX_NOTES_PER_STUDENT (always keep flagged)
    const flagged = allNotes.filter(n => !n.isDropped && n.flags.length > 0);
    const unflagged = allNotes.filter(n => !n.isDropped && n.flags.length === 0);
    const keepCount = Math.max(0, MAX_NOTES_PER_STUDENT - flagged.length);
    const notes = [...flagged, ...unflagged.slice(0, keepCount)]
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // 4. Derive top-level watch flags
    const watchFlags = deriveWatchFlags(enrollment, attendanceRecords, notes);

    return {
        studentId: m.studentId,
        name: m.name,
        mpidx: m.mpidx,
        error: null,
        ...enrollment,
        notes,
        attendanceRecords,
        watchFlags,
        _rawHtml: html  // callers may strip this before persisting
    };
}

/**
 * Build the final watchFlags array for a student.
 * Each flag: { type, severity, label, date, source }
 *   type: 'quit' | 'break' | 'attendance' | 'ending_soon' | 'starting_soon'
 *   severity: 'danger' | 'warning' | 'info'
 *   source: 'tms_profile' | 'tms_note' | 'cm_roster' | 'cm_attendance'
 */
function deriveWatchFlags(enrollment, attendanceRecords, notes) {
    const flags = [];

    // From TMS profile header
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

    // From TMS counsel notes keywords
    for (const note of notes) {
        if (note.flags.includes('quit') && !flags.some(f => f.type === 'quit')) {
            flags.push({ type: 'quit', severity: 'danger', label: '퇴원 언급', date: note.date, source: 'tms_note' });
        }
        if (note.flags.includes('break') && !flags.some(f => f.type === 'break')) {
            flags.push({ type: 'break', severity: 'warning', label: '휴원 언급', date: note.date, source: 'tms_note' });
        }
    }

    // Recent attendance problems (last 5 records, flag consecutive absences or recent absences)
    const recent = (attendanceRecords || []).slice(0, 5);
    const recentAbsent = recent.filter(r => r.status === '결석' || r.status === '조퇴');
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

/**
 * Resolve Createby (logged-in TMS staff id) from the post-login home page HTML.
 * Falls back to '' if not found — TMS still loads profiles without it.
 */
function resolveStaffId(homeHtml) {
    const s = String(homeHtml || '');
    // Common patterns in TMS ASP.NET pages:
    //   HHmpidx, Createby=XXXX, staffidx=XXXX
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
    // Look in all hrefs
    const hrefRe = /href=["'][^"']*[?&](?:Createby|staffidx)=(\d+)/gi;
    let m;
    while ((m = hrefRe.exec(s)) !== null) {
        return m[1];
    }
    return '';
}

/**
 * Scrape counsel profiles for multiple students in one class.
 *
 * @param {object} cfg      - { baseUrl, username, password }
 * @param {object[]} students - [{ id, name, tmsMpidx, tmsClassId? }]
 * @param {object} [options] - { tmsClassId }
 */
async function scrapeCounselProfiles(cfg, students, options) {
    const opts = options || {};
    const tmsClassId = String(opts.tmsClassId || '').trim();

    if (!tmsRoster.credentialsConfigured(cfg)) {
        const err = new Error('TMS credentials not configured');
        err.code = 'TMS_CREDS_MISSING';
        throw err;
    }

    const jar = { map: new Map() };
    const { homeHtml } = await tmsRoster.login(cfg, jar);
    const staffId = resolveStaffId(homeHtml);

    const results = [];
    for (const student of (students || [])) {
        // Small delay between requests to be polite to TMS
        if (results.length > 0) {
            await new Promise(r => setTimeout(r, 300));
        }
        const profile = await fetchStudentProfile(cfg, jar, staffId, student, tmsClassId);
        // Strip raw HTML from bulk results (callers can use probe mode for the raw HTML)
        const { _rawHtml: _, ...cleaned } = profile;
        results.push(cleaned);
    }

    return { students: results, staffId };
}

/**
 * Scrape one student profile. Exported for probe script (keeps _rawHtml).
 */
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
    scrapeCounselProfile,
    parseProfileHtml,
    parseEnrollmentStatus,
    parseAttendanceTable,
    parseCounselTable,
    detectFlags,
    resolveStaffId,
    deriveWatchFlags,
    // Keyword lists exported for tests
    QUIT_KEYWORDS_KO,
    BREAK_KEYWORDS_KO,
    ATTENDANCE_KEYWORDS_KO,
    DROP_KINDS
};
