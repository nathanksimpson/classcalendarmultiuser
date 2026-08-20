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

const QUIT_KEYWORDS_KO = ['퇴원', '그만', '중단', '그만둘', '등록 취소', '등록취소', '퇴'];
const BREAK_KEYWORDS_KO = ['휴원', '쉬다', '잠시', '휴식', '방학 중 휴'];
const ATTENDANCE_KEYWORDS_KO = ['결석', '지각', '조퇴', '미참석'];
const STARTEND_KEYWORDS_KO = ['개강', '종료예정', '마지막'];
const QUIT_KEYWORDS_EN = ['quit', 'leave', 'withdraw', 'left', 'cancel'];
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
    const s = stripComments(html);
    const sectionRe = /출석[\s\S]{0,80}?<\/div>/i;
    const sectionMatch = sectionRe.exec(s);
    if (sectionMatch) {
        const after = s.slice(sectionMatch.index);
        const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/i;
        const tableMatch = tableRe.exec(after);
        if (tableMatch) return tableMatch[1];
    }
    const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
    let m;
    while ((m = tableRe.exec(s)) !== null) {
        const text = stripTags(m[1]);
        if ((text.includes('출결') || text.includes('출석')) && text.includes('날짜')) return m[1];
        if (text.includes('날짜') && text.includes('상태')) return m[1];
    }
    return '';
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
    const attendanceTableHtml = findAttendanceTable(attendanceHtml);
    const attendanceRecords = parseAttendanceTable(attendanceTableHtml);
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

        const counselHtml = await fetchHtmlPage(jar, counselUrl, urls.shell);
        const absenceHtml = await fetchHtmlPage(jar, absenceUrl, urls.shell);
        const profileHtml = await fetchHtmlPage(jar, urls.profile, urls.shell);

        const combinedLen = (counselHtml || '').length + (absenceHtml || '').length + (profileHtml || '').length;
        if (combinedLen < 200) {
            return Object.assign(emptyProfile(student, 'empty_response'), { missingClassIdx: !classId });
        }

        const parsed = parseProfileParts(
            { counselHtml, attendanceHtml: absenceHtml, profileHtml, shellHtml },
            { studentId: student.id || mpidx, name: student.name || '', mpidx }
        );

        parsed.missingClassIdx = !classId;
        parsed._rawHtml = shellHtml;
        parsed._iframeHtml = { counsel: counselHtml, absence: absenceHtml, profile: profileHtml };

        const hasData =
            parsed.enrollStatus ||
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
    const bulk = await scrapeCounselProfilesBatch(cfg, batch);
    return {
        students: bulk.classes[''] ? bulk.classes[''].students : bulk.classes.__default__ ? bulk.classes.__default__.students : [],
        staffId: bulk.staffId,
        stats: bulk.stats
    };
}

async function scrapeCounselProfilesBatch(cfg, classBatches) {
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
    let requestCount = 0;
    let scraped = 0;
    let noMpidx = 0;
    let errors = 0;
    let parse_empty = 0;
    let empty_response = 0;
    let totalNotes = 0;
    let missingClassIdx = 0;

    for (const batch of classBatches || []) {
        const classId = String(batch.classId || '').trim();
        const tmsClassId = String(batch.tmsClassId || '').trim();
        const bucketKey = classId || '__default__';
        const profiles = [];

        if (!tmsClassId && (batch.students || []).length) {
            missingClassIdx += (batch.students || []).length;
        }

        for (const student of batch.students || []) {
            if (requestCount > 0) {
                await new Promise((r) => setTimeout(r, 300));
            }
            requestCount += 1;
            const profile = await fetchStudentProfile(cfg, jar, staffId, student, tmsClassId, { warmedClasses });
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
            profiles.push(cleaned);
        }

        classes[bucketKey] = { classId, tmsClassId, students: profiles };
    }

    return {
        classes,
        staffId,
        stats: {
            classes: Object.keys(classes).length,
            students: requestCount,
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
