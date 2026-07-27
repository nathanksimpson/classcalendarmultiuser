/**
 * TMS (tms.esimson.com) roster scrape — shared by local Node and Cloudflare Worker.
 *
 * Credentials (prefer request override; never store in calendar JSON):
 *   options.username / options.password from Sync modal POST body
 *   Local fallback: TMS_USERNAME, TMS_PASSWORD in process.env (.env)
 *   TMS_BASE_URL=http://tms.esimson.com
 *   TMS_ROSTER_URLS=comma-separated absolute or path URLs (optional fallback only)
 *
 * Primary path: login → class_Main_New_PopUp.aspx sidebar (.class_select + Hsubclass)
 * → fetch each ?classidx= for students. Legacy table-header guessing is fallback only.
 *
 * HTTP uses global fetch (Node 18+ / Workers) with redirect: 'manual'.
 */
'use strict';

const DEFAULT_BASE = 'http://tms.esimson.com';
const LOGIN_PATH = '/member/login.aspx';
const CLASS_POPUP_PATH = '/class/class_Main_New_PopUp.aspx';

function envGet(key) {
    try {
        if (typeof process !== 'undefined' && process.env && process.env[key] != null) {
            return process.env[key];
        }
    } catch (_) {
        /* Workers / locked env */
    }
    return '';
}

const HANGUL_NAME_RE = /[\uac00-\ud7a3]{2,6}/g;
const NUMBERED_STUDENT_RE = /^\s*\d{1,3}\s*[.)]\s*([\uac00-\ud7a3]{2,6})/;
const STUDENT_NUM_BLOCK_RE = /^\d+\.\s+/;
const NOISE_CLASS_NAME_RE =
    /공지|마케팅|인사발령|숙제미확인|총점|휴퇴원|클래스관리|수업일지|오늘의수업/i;
/** UI / self-check labels that look like Hangul names but are not students (paste-import tails). */
const STUDENT_NOISE_NAMES = new Set([
    '매우만족',
    '만족',
    '보통',
    '불만족',
    '학부모확인',
    '셀프체크',
    '출석',
    '지각',
    '결석',
    '조퇴',
    '미참석',
    '합격',
    '불합격',
    '관심',
    '신규',
    '종료예정',
    '전체선택',
    '촬영',
    '알림'
]);
const ROSTER_TAIL_START_RES = [
    /^\[숙제확인\]/,
    /^전숙제/,
    /^시험종류/,
    /^숙제미확인/,
    /^미참석/,
    /^셀프체크/,
    /^학부모확인/,
    /^No Check$/i,
    /^Wr&Spk$/i,
    /^Covered in Class/,
    /^Homework \(if not finished/,
    /^Workbook[：:]/
];
const HEADER_JUNK_TOKENS = new Set([
    '번호',
    '제목',
    '파일',
    '파일수',
    '조회수',
    '등록자',
    '등록일',
    '담임',
    '반명',
    '학생명',
    '학생',
    '퇴원일',
    '퇴원분류',
    '수강기간',
    '기타사유',
    '퇴원의의견서',
    '퇴원의견서',
    '평가기간',
    '평가자수',
    '배정일',
    '학교',
    '학년',
    '구분',
    '대강일',
    '수업시간',
    '과목',
    '휴가자',
    '인계메시지',
    '대강',
    '진행여부',
    '설문제목',
    '참여인원',
    '자신참여',
    '마감일',
    '마감구분',
    '자료구분',
    '업무성격',
    '회사명',
    '전화번호',
    '담당자',
    '담당자핸드폰',
    '학부모핸드폰',
    '해당반',
    '답변여부',
    '사용여부',
    '종류',
    '분류',
    '이름',
    '아이디',
    '선생님',
    '교재',
    '단어명',
    '뜻',
    '작성자',
    '작성일',
    '시험종류',
    '시험영역',
    '순서',
    '문제수',
    '수정',
    '분원명',
    '학원전화번호',
    '우편번호',
    '주소',
    '분원사용여부',
    '사용선생님',
    '사용관리자',
    '레벨',
    '사용구분',
    '자주장',
    '년도',
    '중',
    '초'
]);
const SKIP_NAME_WORDS = new Set([
    '학생',
    '이름',
    '성명',
    '출석',
    '반명',
    '담임',
    '로그인',
    '비밀번호',
    '아이디',
    '전체',
    '선택',
    '검색',
    '저장',
    '취소',
    '삭제',
    '수정',
    '등록',
    '목록',
    '번호'
]);

function getConfig() {
    const baseUrl = String(envGet('TMS_BASE_URL') || DEFAULT_BASE)
        .trim()
        .replace(/\/$/, '');
    const username = String(envGet('TMS_USERNAME') || '').trim();
    const password = String(envGet('TMS_PASSWORD') || '');
    const rosterUrls = String(envGet('TMS_ROSTER_URLS') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((u) => (u.startsWith('http') ? u : `${baseUrl}${u.startsWith('/') ? '' : '/'}${u}`));
    return { baseUrl, username, password, rosterUrls };
}

function credentialsConfigured(cfg) {
    return Boolean(cfg && cfg.username && cfg.password);
}

function createJar() {
    return { map: new Map() };
}

function storeCookies(jar, setCookieHeader) {
    if (!setCookieHeader) {
        return;
    }
    const parts = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    parts.forEach((raw) => {
        const first = String(raw).split(';')[0];
        const eq = first.indexOf('=');
        if (eq <= 0) {
            return;
        }
        const name = first.slice(0, eq).trim();
        const value = first.slice(eq + 1).trim();
        if (name) {
            jar.map.set(name, value);
        }
    });
}

function cookieHeader(jar) {
    return Array.from(jar.map.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
}

function getSetCookieList(headers) {
    if (headers && typeof headers.getSetCookie === 'function') {
        try {
            const list = headers.getSetCookie();
            if (Array.isArray(list) && list.length) {
                return list;
            }
        } catch (_) {
            /* ignore */
        }
    }
    const single = headers && typeof headers.get === 'function' ? headers.get('set-cookie') : null;
    return single ? [single] : [];
}

function request(urlStr, options) {
    const opts = options || {};
    const headers = Object.assign(
        {
            'User-Agent': 'ClassManager-TMS-Sync/1.0',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        opts.headers || {}
    );
    if (opts.jar) {
        const c = cookieHeader(opts.jar);
        if (c) {
            headers.Cookie = c;
        }
    }
    const body = opts.body != null ? opts.body : null;
    if (body != null) {
        headers['Content-Type'] = opts.contentType || 'application/x-www-form-urlencoded';
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutMs = opts.timeout || 25000;
    let timer = null;
    if (controller) {
        timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    return fetch(urlStr, {
        method: opts.method || 'GET',
        headers,
        body: body != null ? body : undefined,
        redirect: 'manual',
        signal: controller ? controller.signal : undefined
    })
        .then(async (res) => {
            if (timer) {
                clearTimeout(timer);
            }
            if (opts.jar) {
                storeCookies(opts.jar, getSetCookieList(res.headers));
            }
            const buf = new Uint8Array(await res.arrayBuffer());
            let text = new TextDecoder('utf-8').decode(buf);
            // ASP.NET TMS pages are often EUC-KR / Windows-949
            if (/charset\s*=\s*euc-kr/i.test(text) || /charset\s*=\s*ks_c_5601/i.test(text)) {
                try {
                    text = new TextDecoder('euc-kr').decode(buf);
                } catch (_) {
                    /* keep utf8 */
                }
            }
            return {
                status: res.status || 0,
                headers: {
                    location: res.headers.get('location') || undefined,
                    'set-cookie': getSetCookieList(res.headers)
                },
                url: urlStr,
                text,
                buffer: buf
            };
        })
        .catch((err) => {
            if (timer) {
                clearTimeout(timer);
            }
            if (err && err.name === 'AbortError') {
                throw new Error('TMS request timeout');
            }
            throw err;
        });
}

async function requestFollow(urlStr, options, maxRedirects) {
    let url = urlStr;
    let method = (options && options.method) || 'GET';
    let body = options && options.body;
    const limit = maxRedirects == null ? 8 : maxRedirects;
    for (let i = 0; i <= limit; i += 1) {
        const res = await request(url, Object.assign({}, options, { method, body }));
        if (res.status >= 300 && res.status < 400 && res.headers.location) {
            url = new URL(res.headers.location, url).href;
            method = 'GET';
            body = null;
            continue;
        }
        return Object.assign({}, res, { finalUrl: url });
    }
    throw new Error('Too many redirects from TMS');
}

function extractHidden(html, name) {
    const re = new RegExp(`<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["']`, 'i');
    const m = String(html || '').match(re);
    if (m) {
        return m[1];
    }
    const re2 = new RegExp(`<input[^>]*value=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i');
    const m2 = String(html || '').match(re2);
    return m2 ? m2[1] : '';
}

function encodeForm(fields) {
    return Object.keys(fields)
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(fields[k] == null ? '' : fields[k])}`)
        .join('&');
}

function stripTags(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeHtmlEntities(s) {
    return String(s || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Trailing identity marks used academy-wide to disambiguate same Hangul names. */
// Includes geometric diamonds (◆◇), card-suit diamonds (♦♢), stars, bullets, Latin/digit.
const TMS_DISAMBIGUATOR_CHARS = '◆◇♦♢★☆✦✧●○■□▲△▼▽※A-Za-z0-9';
const TMS_NAME_DISAMBIGUATOR_RE = new RegExp(`[${TMS_DISAMBIGUATOR_CHARS}]`);
const TMS_NAME_DISAMBIGUATOR_ONLY_RE = new RegExp(`^[${TMS_DISAMBIGUATOR_CHARS}]$`);
const TMS_STUDENT_NAME_RE = new RegExp(
    `^[\\uac00-\\ud7a3]{2,6}\\s*[${TMS_DISAMBIGUATOR_CHARS}]?$`
);

function stripTmsAttendanceNoise(name) {
    return String(name || '')
        .replace(/\s+/g, ' ')
        .replace(/\s*\((?:Absent|Present|Late|Tardy|Early leave|Early leave\/pickup)\)\s*$/i, '')
        .replace(/\s*(?:Absent|Present|Late|Tardy|Early leave|Early leave\/pickup)\s*$/i, '')
        .replace(/\s*\((?:결석|출석|지각|조퇴|미참석)\)\s*$/u, '')
        .replace(/\s*(?:결석|출석|지각|조퇴|미참석)\s*$/u, '')
        .trim();
}

/**
 * Keep Hangul + optional trailing disambiguator (권이안◆ / 김민수A).
 * Collapses spaces between Hangul and the mark. Strips attendance only.
 */
function normalizeTmsStudentName(raw) {
    let name = stripTmsAttendanceNoise(raw);
    if (!name) {
        return { name: '', nameEnHint: '' };
    }
    // 권이안 ◆ → 권이안◆
    name = name.replace(
        new RegExp(`([\\uac00-\\ud7a3]{2,6})\\s+([${TMS_DISAMBIGUATOR_CHARS}])$`),
        '$1$2'
    );
    if (!TMS_STUDENT_NAME_RE.test(name)) {
        return { name: '', nameEnHint: '' };
    }
    // Canonical form: no space before mark
    name = name.replace(
        new RegExp(`([\\uac00-\\ud7a3]{2,6})\\s*([${TMS_DISAMBIGUATOR_CHARS}])$`),
        '$1$2'
    );
    return { name, nameEnHint: '' };
}

function isLikelyStudentName(name) {
    const normalized = normalizeTmsStudentName(name).name;
    if (!normalized || normalized.length < 2 || normalized.length > 7) {
        return false;
    }
    const hangulOnly = normalized.replace(TMS_NAME_DISAMBIGUATOR_RE, '');
    if (SKIP_NAME_WORDS.has(hangulOnly) || STUDENT_NOISE_NAMES.has(hangulOnly)) {
        return false;
    }
    if (SKIP_NAME_WORDS.has(normalized) || STUDENT_NOISE_NAMES.has(normalized)) {
        return false;
    }
    if (/^셀프체크/i.test(normalized) || /^\[숙제확인\]/.test(normalized)) {
        return false;
    }
    return true;
}

/**
 * If TMS puts the disambiguator just after </a> (권이안</a>◆), pick it up.
 */
function extractTrailingDisambiguator(afterHtml) {
    const text = stripTags(decodeHtmlEntities(String(afterHtml || '')))
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) {
        return '';
    }
    const m = text.match(new RegExp(`^\\s*([${TMS_DISAMBIGUATOR_CHARS}])(?:\\s|$|[\\(（])`));
    if (m && TMS_NAME_DISAMBIGUATOR_ONLY_RE.test(m[1])) {
        return m[1];
    }
    // Bare mark as first non-space char
    const first = text.charAt(0);
    if (TMS_NAME_DISAMBIGUATOR_ONLY_RE.test(first)) {
        return first;
    }
    return '';
}

function isNoiseClassName(name) {
    const n = String(name || '').trim();
    if (!n || n.length < 2) {
        return true;
    }
    if (n.length > 100) {
        return true;
    }
    if (/^\d+$/.test(n)) {
        return true;
    }
    if (NOISE_CLASS_NAME_RE.test(n)) {
        return true;
    }
    return false;
}

function isJunkHeaderCohortName(name) {
    const n = String(name || '').trim();
    if (!n) {
        return true;
    }
    if (/심슨어학원\s*TMS/i.test(n) || /TMS\s*페이지/i.test(n)) {
        return true;
    }
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 3) {
        const junkCount = parts.filter((p) => HEADER_JUNK_TOKENS.has(p) || SKIP_NAME_WORDS.has(p)).length;
        if (junkCount >= Math.ceil(parts.length * 0.5)) {
            return true;
        }
    }
    return false;
}

function extractLinks(html, baseUrl) {
    const out = [];
    const re = /href\s*=\s*["']([^"'#]+)["']/gi;
    let m;
    while ((m = re.exec(html))) {
        try {
            const abs = new URL(m[1], baseUrl).href;
            if (abs.includes(new URL(baseUrl).hostname)) {
                out.push(abs);
            }
        } catch (_) {
            /* ignore */
        }
    }
    return Array.from(new Set(out));
}

function looksLikeRosterUrl(url) {
    const u = String(url || '').toLowerCase();
    return (
        /student|roster|class|ban|sms|member|attend|homeroom|sugang|suhang|haksaeng|myclass|classroom/.test(
            u
        ) || /list\.aspx|detail\.aspx/.test(u)
    );
}

function trimRosterPasteTail(text) {
    const lines = String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n');
    const cutAt = lines.findIndex((raw) => {
        const t = String(raw || '').trim();
        if (!t) {
            return false;
        }
        return ROSTER_TAIL_START_RES.some((re) => re.test(t));
    });
    const kept = cutAt < 0 ? lines : lines.slice(0, cutAt);
    return kept.join('\n').trim();
}

/**
 * Paste-import style: numbered blocks only (no greedy Hangul scan).
 * `1. locationTag` then Korean name on a following line (same as roster-import parseStudentBlock).
 */
function parseStudentsFromNumberedBlocks(text) {
    const trimmed = trimRosterPasteTail(text);
    const lines = trimmed.split('\n').map((l) => l.trim());
    const students = [];
    const seen = new Set();
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (!STUDENT_NUM_BLOCK_RE.test(line)) {
            i += 1;
            continue;
        }
        let name = '';
        let nameEn = '';
        const firstLine = stripTmsAttendanceNoise(
            String(line || '').replace(STUDENT_NUM_BLOCK_RE, '').trim()
        );
        let j = i + 1;
        while (j < lines.length && !STUDENT_NUM_BLOCK_RE.test(lines[j])) {
            const L = lines[j];
            if (!L || SKIP_NAME_WORDS.has(L) || STUDENT_NOISE_NAMES.has(L)) {
                j += 1;
                continue;
            }
            if (/^출석\s/.test(L) || /^:\s*관심/.test(L)) {
                break;
            }
            const enParen = L.match(/^\(([^)]*)\)$/);
            if (enParen) {
                if (!nameEn) {
                    nameEn = enParen[1].trim();
                }
                j += 1;
                continue;
            }
            const cleanL = normalizeTmsStudentName(L).name;
            if (!name && cleanL && isLikelyStudentName(cleanL)) {
                name = cleanL;
                j += 1;
                continue;
            }
            if (!name && /^[A-Za-z]/.test(L) && !nameEn) {
                nameEn = L;
                j += 1;
                continue;
            }
            j += 1;
        }
        if (!name) {
            const fromFirst = normalizeTmsStudentName(firstLine).name;
            if (fromFirst && isLikelyStudentName(fromFirst)) {
                name = fromFirst;
            }
        }
        if (name && isLikelyStudentName(name) && !seen.has(name)) {
            seen.add(name);
            students.push({ name, nameEn: nameEn || '' });
        }
        i = j > i ? j : i + 1;
    }
    return students;
}

function parseStudentsFromTextLines(text) {
    // Kept for tests / legacy callers — prefer numbered blocks only (no raw Hangul sweep).
    return parseStudentsFromNumberedBlocks(text);
}

/**
 * Primary: studentinf(mpidx)">KoreanName</a> (+ optional English).
 * Fallback: numbered paste-style blocks after cutting homework/self-check tails.
 * Never greedy-scan all Hangul table cells (avoids 매우만족 etc.).
 */
function parseStudentsFromClassPopup(html) {
    const raw = String(html || '');
    const students = [];
    const seenMpidx = new Set();
    const seenName = new Set();

    const re =
        /javascript:\s*studentinf\s*\(\s*['"]?(\d+)['"]?\s*\)[^>]*>\s*([^<]+?)\s*<\/a>/gi;
    let m;
    while ((m = re.exec(raw))) {
        const mpidx = String(m[1] || '').trim();
        let name = normalizeTmsStudentName(
            stripTags(decodeHtmlEntities(m[2])).replace(/\s+/g, ' ').trim()
        ).name;
        if (!mpidx || !name || !isLikelyStudentName(name)) {
            continue;
        }
        if (seenMpidx.has(mpidx) || seenName.has(name)) {
            continue;
        }
        let nameEn = '';
        const after = raw.slice(m.index + m[0].length, m.index + m[0].length + 280);
        const nextStudent = after.search(/javascript:\s*studentinf\s*\(/i);
        const afterWindow = nextStudent >= 0 ? after.slice(0, nextStudent) : after;
        // Disambiguator often sits just after </a>, not inside the link text.
        if (!TMS_NAME_DISAMBIGUATOR_RE.test(name.slice(-1))) {
            const trailingMark = extractTrailingDisambiguator(afterWindow);
            if (trailingMark) {
                const withMark = normalizeTmsStudentName(name + trailingMark).name;
                if (withMark && isLikelyStudentName(withMark) && !seenName.has(withMark)) {
                    name = withMark;
                }
            }
        }
        const enMatch =
            afterWindow.match(/\(\s*<a[^>]*>\s*([^<]+?)\s*<\/a>\s*\)/i) ||
            afterWindow.match(/\(\s*([A-Za-z][A-Za-z\s.'-]{0,40})\s*\)/);
        if (enMatch) {
            const candidate = stripTags(decodeHtmlEntities(enMatch[1])).replace(/\s+/g, ' ').trim();
            if (
                candidate &&
                !/^(Absent|Present|Late|Tardy|Early leave)$/i.test(candidate)
            ) {
                nameEn = candidate;
            }
        }
        seenMpidx.add(mpidx);
        seenName.add(name);
        students.push({ name, nameEn, mpidx });
    }

    if (students.length) {
        return students.map((s) => ({ name: s.name, nameEn: s.nameEn || '' }));
    }

    // Fallback: paste-style numbered list from visible text (tail-trimmed).
    const text = stripTags(raw)
        .replace(/\s{2,}/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
    return parseStudentsFromNumberedBlocks(text);
}

/** @deprecated Use parseStudentsFromClassPopup — kept as alias for call sites. */
function parseStudentsFromHtml(html) {
    return parseStudentsFromClassPopup(html);
}

/**
 * Parse TMS class popup sidebar: .class_select li → name + Hsubclass id.
 * @returns {{ cohortName: string, tmsClassId: string }[]}
 */
function parseClassSelectList(html) {
    const results = [];
    const seen = new Set();
    const raw = String(html || '');
    const blockMatch = raw.match(
        /<div[^>]*class=["'][^"']*\bclass_select\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );
    const block = blockMatch ? blockMatch[1] : raw;
    const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = liRe.exec(block))) {
        const li = m[1];
        if (!/Hsubclass/i.test(li)) {
            continue;
        }
        const aMatch = li.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
        const name = aMatch
            ? stripTags(decodeHtmlEntities(aMatch[1]))
                  .replace(/\s+/g, ' ')
                  .trim()
            : '';
        const idMatch =
            li.match(
                /<input[^>]*(?:id|name)=["'][^"']*Hsubclass[^"']*["'][^>]*value=["']([^"']*)["']/i
            ) ||
            li.match(
                /<input[^>]*value=["']([^"']*)["'][^>]*(?:id|name)=["'][^"']*Hsubclass[^"']*["']/i
            );
        const tmsClassId = idMatch ? String(idMatch[1]).trim() : '';
        if (!name || name.length < 2 || !tmsClassId || tmsClassId === '0') {
            continue;
        }
        if (isNoiseClassName(name) || seen.has(tmsClassId)) {
            continue;
        }
        seen.add(tmsClassId);
        results.push({ cohortName: name, tmsClassId });
    }
    return results;
}

function parseTitle(html) {
    const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return m ? stripTags(decodeHtmlEntities(m[1])) : '';
}

/** Legacy fallback only — do not use for primary class naming. */
function parseTableCohorts(html) {
    const cohorts = [];
    const tableRe = /<table[\s\S]*?<\/table>/gi;
    const tables = String(html || '').match(tableRe) || [];
    tables.forEach((table, ti) => {
        const students = parseStudentsFromHtml(table);
        if (students.length < 2) {
            return;
        }
        const rowRe = /<tr[\s\S]*?<\/tr>/gi;
        const firstRow = (table.match(rowRe) || [])[0] || '';
        const cells = Array.from(firstRow.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((m) =>
            stripTags(decodeHtmlEntities(m[1]))
        );
        const headerHint = cells.join(' ');
        const titleMatch = headerHint.match(
            /[\uac00-\ud7a3A-Za-z0-9][\uac00-\ud7a3A-Za-z0-9\s_-]{1,40}/
        );
        const cohortName = titleMatch ? titleMatch[0].trim() : `TMS table ${ti + 1}`;
        if (isJunkHeaderCohortName(cohortName) || isNoiseClassName(cohortName)) {
            return;
        }
        cohorts.push({
            cohortName,
            tmsClassId: '',
            students,
            source: 'table'
        });
    });
    return cohorts;
}

function parseCohortsFromHtml(html, pageUrl) {
    const fromTables = parseTableCohorts(html);
    if (fromTables.length) {
        return fromTables;
    }
    const students = parseStudentsFromHtml(html);
    if (students.length < 2) {
        return [];
    }
    const title = parseTitle(html);
    let name = title;
    try {
        const path = new URL(pageUrl).pathname.split('/').filter(Boolean).pop() || 'class';
        name = title || path.replace(/\.aspx$/i, '');
    } catch (_) {
        /* keep title */
    }
    if (isJunkHeaderCohortName(name) || isNoiseClassName(name)) {
        return [];
    }
    return [{ cohortName: name || 'TMS class', tmsClassId: '', students, source: 'page-text' }];
}

function stillOnLoginPage(html, finalUrl) {
    const u = String(finalUrl || '').toLowerCase();
    if (u.includes('login.aspx')) {
        return true;
    }
    return /name=["']txtpass["']/i.test(html) && /name=["']cmdLogin["']/i.test(html);
}

async function login(cfg, jar) {
    const loginUrl = `${cfg.baseUrl}${LOGIN_PATH}`;
    const page = await requestFollow(loginUrl, { method: 'GET', jar });
    const viewState = extractHidden(page.text, '__VIEWSTATE');
    const viewStateGen = extractHidden(page.text, '__VIEWSTATEGENERATOR');
    const eventValidation = extractHidden(page.text, '__EVENTVALIDATION');
    const body = encodeForm({
        __VIEWSTATE: viewState,
        __VIEWSTATEGENERATOR: viewStateGen,
        __EVENTVALIDATION: eventValidation,
        returnURL: '',
        txtid: cfg.username,
        txtpass: cfg.password,
        cmdLogin: '로그인'
    });
    const posted = await requestFollow(loginUrl, {
        method: 'POST',
        jar,
        body,
        headers: { Referer: loginUrl }
    });
    if (stillOnLoginPage(posted.text, posted.finalUrl)) {
        const err = new Error('TMS login failed');
        err.code = 'TMS_LOGIN_FAILED';
        throw err;
    }
    return { homeHtml: posted.text, homeUrl: posted.finalUrl || loginUrl };
}

async function fetchPage(jar, url) {
    return requestFollow(url, { method: 'GET', jar });
}

function mergeCohortLists(lists) {
    const byKey = new Map();
    (lists || []).forEach((c) => {
        const name = String(c.cohortName || '').trim() || 'TMS class';
        const tmsClassId = String(c.tmsClassId || '').trim();
        const key = tmsClassId ? `id:${tmsClassId}` : `name:${name.toLowerCase().replace(/\s+/g, '')}`;
        if (!byKey.has(key)) {
            byKey.set(key, {
                cohortName: name,
                tmsClassId,
                students: [],
                source: c.source || ''
            });
        }
        const bucket = byKey.get(key);
        if (!bucket.cohortName && name) {
            bucket.cohortName = name;
        }
        if (!bucket.tmsClassId && tmsClassId) {
            bucket.tmsClassId = tmsClassId;
        }
        const seen = new Set(bucket.students.map((s) => s.name));
        (c.students || []).forEach((s) => {
            if (s && s.name && !seen.has(s.name)) {
                seen.add(s.name);
                bucket.students.push({ name: s.name, nameEn: s.nameEn || '' });
            }
        });
    });
    return Array.from(byKey.values()).filter(
        (c) => c.tmsClassId || (c.students && c.students.length > 0)
    );
}

async function scrapeLegacyRosterPages(cfg, jar, homeHtml, homeUrl, pages) {
    const candidateUrls = [];
    const seenUrl = new Set();
    const pushUrl = (u) => {
        if (!u || seenUrl.has(u)) {
            return;
        }
        seenUrl.add(u);
        candidateUrls.push(u);
    };

    (cfg.rosterUrls || []).forEach(pushUrl);
    extractLinks(homeHtml, homeUrl || cfg.baseUrl)
        .filter(looksLikeRosterUrl)
        .slice(0, 40)
        .forEach(pushUrl);

    [
        '/Class/ClassList.aspx',
        '/Class/ClassStudentList.aspx',
        '/Class/StudentList.aspx',
        '/Sms/SmsSend.aspx',
        '/SMS/SmsSend.aspx',
        '/Member/ClassList.aspx',
        '/Attend/ClassList.aspx'
    ].forEach((p) => pushUrl(`${cfg.baseUrl}${p}`));

    const allCohorts = [];
    for (const url of candidateUrls.slice(0, 25)) {
        try {
            const page = await fetchPage(jar, url);
            if (page.status >= 400 || stillOnLoginPage(page.text, page.finalUrl)) {
                pages.push({ url, status: page.status, ok: false });
                continue;
            }
            const cohorts = parseCohortsFromHtml(page.text, page.finalUrl || url).filter(
                (c) => !isJunkHeaderCohortName(c.cohortName)
            );
            pages.push({
                url: page.finalUrl || url,
                status: page.status,
                ok: true,
                cohortCount: cohorts.length,
                studentCount: cohorts.reduce((n, c) => n + c.students.length, 0),
                source: 'legacy'
            });
            cohorts.forEach((c) => allCohorts.push(c));
            if (cohorts.length === 0) {
                extractLinks(page.text, page.finalUrl || url)
                    .filter(looksLikeRosterUrl)
                    .slice(0, 10)
                    .forEach(pushUrl);
            }
        } catch (e) {
            pages.push({ url, status: 0, ok: false, error: e.message || String(e) });
        }
    }

    if (!allCohorts.length) {
        parseCohortsFromHtml(homeHtml, homeUrl)
            .filter((c) => !isJunkHeaderCohortName(c.cohortName))
            .forEach((c) => allCohorts.push(c));
    }
    return allCohorts;
}

async function scrapeRosters(options) {
    const cfg = Object.assign({}, getConfig(), options || {});
    if (!credentialsConfigured(cfg)) {
        const err = new Error('TMS credentials not configured');
        err.code = 'TMS_CREDS_MISSING';
        throw err;
    }
    const jar = createJar();
    const { homeHtml, homeUrl } = await login(cfg, jar);

    const pages = [];
    const allCohorts = [];
    const popupUrl = `${cfg.baseUrl}${CLASS_POPUP_PATH}`;

    try {
        const popupPage = await fetchPage(jar, popupUrl);
        const classList = parseClassSelectList(popupPage.text);
        pages.push({
            url: popupPage.finalUrl || popupUrl,
            status: popupPage.status,
            ok: popupPage.status < 400 && !stillOnLoginPage(popupPage.text, popupPage.finalUrl),
            cohortCount: classList.length,
            studentCount: 0,
            source: 'class-popup-list'
        });

        if (
            classList.length &&
            popupPage.status < 400 &&
            !stillOnLoginPage(popupPage.text, popupPage.finalUrl)
        ) {
            for (const cls of classList.slice(0, 80)) {
                const url = `${cfg.baseUrl}${CLASS_POPUP_PATH}?classidx=${encodeURIComponent(cls.tmsClassId)}`;
                try {
                    const page = await fetchPage(jar, url);
                    if (page.status >= 400 || stillOnLoginPage(page.text, page.finalUrl)) {
                        pages.push({ url, status: page.status, ok: false, source: 'class-popup' });
                        allCohorts.push({
                            cohortName: cls.cohortName,
                            tmsClassId: cls.tmsClassId,
                            students: [],
                            source: 'class-popup'
                        });
                        continue;
                    }
                    const students = parseStudentsFromClassPopup(page.text);
                    pages.push({
                        url: page.finalUrl || url,
                        status: page.status,
                        ok: true,
                        cohortCount: 1,
                        studentCount: students.length,
                        source: 'class-popup'
                    });
                    allCohorts.push({
                        cohortName: cls.cohortName,
                        tmsClassId: cls.tmsClassId,
                        students,
                        source: 'class-popup'
                    });
                } catch (e) {
                    pages.push({
                        url,
                        status: 0,
                        ok: false,
                        error: e.message || String(e),
                        source: 'class-popup'
                    });
                    allCohorts.push({
                        cohortName: cls.cohortName,
                        tmsClassId: cls.tmsClassId,
                        students: [],
                        source: 'class-popup'
                    });
                }
            }
        }
    } catch (e) {
        pages.push({
            url: popupUrl,
            status: 0,
            ok: false,
            error: e.message || String(e),
            source: 'class-popup-list'
        });
    }

    // Fallback only when popup sidebar yielded no classes
    if (!allCohorts.length) {
        const legacy = await scrapeLegacyRosterPages(cfg, jar, homeHtml, homeUrl, pages);
        legacy.forEach((c) => allCohorts.push(c));
    }

    return {
        cohorts: mergeCohortLists(allCohorts),
        meta: {
            homeUrl,
            pagesFetched: pages.length,
            pages,
            source: allCohorts.some((c) => c.source === 'class-popup') ? 'class-popup' : 'legacy'
        }
    };
}

async function probe(options) {
    const cfg = Object.assign({}, getConfig(), options || {});
    if (!credentialsConfigured(cfg)) {
        const err = new Error('TMS credentials not configured');
        err.code = 'TMS_CREDS_MISSING';
        throw err;
    }
    const jar = createJar();
    const { homeHtml, homeUrl } = await login(cfg, jar);
    const links = extractLinks(homeHtml, homeUrl || cfg.baseUrl);
    let classList = [];
    try {
        const popup = await fetchPage(jar, `${cfg.baseUrl}${CLASS_POPUP_PATH}`);
        classList = parseClassSelectList(popup.text);
    } catch (_) {
        /* ignore */
    }
    return {
        homeUrl,
        linkCount: links.length,
        rosterLikeLinks: links.filter(looksLikeRosterUrl).slice(0, 80),
        allLinks: links.slice(0, 120),
        title: parseTitle(homeHtml),
        classSelectCount: classList.length,
        classSelectSample: classList.slice(0, 15)
    };
}

module.exports = {
    getConfig,
    credentialsConfigured,
    login,
    scrapeRosters,
    probe,
    parseCohortsFromHtml,
    parseStudentsFromTextLines,
    parseStudentsFromHtml,
    parseStudentsFromClassPopup,
    parseStudentsFromNumberedBlocks,
    trimRosterPasteTail,
    parseClassSelectList,
    mergeCohortLists,
    isLikelyStudentName,
    stripTmsAttendanceNoise,
    normalizeTmsStudentName,
    isNoiseClassName,
    isJunkHeaderCohortName,
    CLASS_POPUP_PATH
};
