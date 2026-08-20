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
 * → ASP.NET LinkButton postback per class (same as TMS UI). GET ?classidx= is fallback only.
 * Legacy table-header guessing is last resort when the popup yields no classes.
 *
 * HTTP uses global fetch (Node 18+ / Workers) with redirect: 'manual'.
 */
'use strict';

const DEFAULT_BASE = 'http://tms.esimson.com';
const LOGIN_PATH = '/member/login.aspx';
const CLASS_POPUP_PATH = '/class/class_Main_New_PopUp.aspx';
const WRITING_LIST_PATH = '/lms/Writing_list.aspx';
/** Max Writing_list pagination posts after the first page (ctl00… ≈ pages 2+). */
const MAX_WRITING_LIST_PAGES = 12;

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
    '신규학생', // status label "New student" — never a person name
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
    '신규학생', // UI status "New student" — not a person
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

/**
 * Collect all hidden inputs for an ASP.NET postback (browser submits the whole form).
 * ViewState alone is often not enough — missing fields → invalid postback / no class switch.
 */
function extractHiddenInputs(html) {
    const fields = {};
    const inputRe = /<input\b([^>]*)>/gi;
    let m;
    while ((m = inputRe.exec(String(html || '')))) {
        const attrs = m[1] || '';
        const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']*)["']/i);
        const type = typeMatch ? String(typeMatch[1] || '').toLowerCase() : 'text';
        if (type && type !== 'hidden') {
            continue;
        }
        const nameMatch = attrs.match(/\bname\s*=\s*["']([^"']*)["']/i);
        if (!nameMatch) {
            continue;
        }
        const name = nameMatch[1];
        if (!name || Object.prototype.hasOwnProperty.call(fields, name)) {
            continue;
        }
        const valueMatch = attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i);
        fields[name] = valueMatch ? decodeHtmlEntities(valueMatch[1]) : '';
    }
    return fields;
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
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
            const code = parseInt(h, 16);
            return Number.isFinite(code) ? String.fromCodePoint(code) : '';
        })
        .replace(/&#(\d+);/g, (_, n) => {
            const code = Number(n);
            return Number.isFinite(code) ? String.fromCodePoint(code) : '';
        });
}

/** Trailing name marks from TMS. A-D are identity; S/★/◆ are expirable status. */
const TMS_TRANSFER_MARK_CHARS = '◆◇♦♢⬥⬦◈';
const TMS_NEW_MARK_CHARS = '★☆✦✧';
const TMS_NEUTRAL_STATUS_MARK_CHARS = '＊●○■□▲△▼▽※';
const TMS_STATUS_SYMBOL_CHARS =
    `${TMS_TRANSFER_MARK_CHARS}${TMS_NEW_MARK_CHARS}${TMS_NEUTRAL_STATUS_MARK_CHARS}`;
const TMS_IDENTITY_LETTER_CHARS = 'A-D';
const TMS_SHUTTLE_MARK_CHAR = 'S';
const TMS_NAME_MARK_CHARS = `${TMS_STATUS_SYMBOL_CHARS}${TMS_IDENTITY_LETTER_CHARS}${TMS_SHUTTLE_MARK_CHAR}`;
const TMS_NAME_MARK_RE = new RegExp(`[${TMS_NAME_MARK_CHARS}]`);
const TMS_STATUS_SYMBOL_RE = new RegExp(`[${TMS_STATUS_SYMBOL_CHARS}]`, 'g');
const TMS_STATUS_SYMBOL_ONLY_RE = new RegExp(`^[${TMS_STATUS_SYMBOL_CHARS}]$`);
const TMS_TRANSFER_MARK_RE = new RegExp(`[${TMS_TRANSFER_MARK_CHARS}]`);
const TMS_NEW_MARK_RE = new RegExp(`[${TMS_NEW_MARK_CHARS}]`);
const TMS_EMPTY_NAME_SUFFIX_RE = /(?:\(\s*\)|（\s*）|\[\s*\]|［\s*］)+$/u;
const TMS_STUDENT_NAME_RE = new RegExp(
    `^([\\uac00-\\ud7a3]{2,6})([${TMS_IDENTITY_LETTER_CHARS}]?)(?:${TMS_SHUTTLE_MARK_CHAR})?([${TMS_STATUS_SYMBOL_CHARS}]*)$`
);

function stripInvisibleNameNoise(name) {
    return String(name || '')
        .normalize('NFC')
        // Zero-width / BOM / word-joiner / soft hyphen
        .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD]/g, '')
        // Emoji variation selectors after a mark (◆️)
        .replace(/[\uFE0E\uFE0F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripTmsAttendanceNoise(name) {
    return stripInvisibleNameNoise(name)
        .replace(/\s*\((?:Absent|Present|Late|Tardy|Early leave|Early leave\/pickup)\)\s*$/i, '')
        .replace(/\s*(?:Absent|Present|Late|Tardy|Early leave|Early leave\/pickup)\s*$/i, '')
        .replace(/\s*\((?:결석|출석|지각|조퇴|미참석)\)\s*$/u, '')
        .replace(/\s*(?:결석|출석|지각|조퇴|미참석)\s*$/u, '')
        .trim();
}

function stripEmptyNameSuffixGroups(name) {
    let current = String(name || '');
    let previous = '';
    while (current && current !== previous) {
        previous = current;
        current = current.replace(TMS_EMPTY_NAME_SUFFIX_RE, '').trim();
    }
    return current;
}

function collapseTmsNameMarkSpacing(name) {
    return String(name || '')
        .replace(
            new RegExp(`([\\uac00-\\ud7a3]{2,6})\\s+([${TMS_IDENTITY_LETTER_CHARS}${TMS_SHUTTLE_MARK_CHAR}${TMS_STATUS_SYMBOL_CHARS}])$`, 'u'),
            '$1$2'
        )
        .replace(
            new RegExp(`([\\uac00-\\ud7a3]{2,6}[${TMS_IDENTITY_LETTER_CHARS}]?)\\s+(${TMS_SHUTTLE_MARK_CHAR}|[${TMS_STATUS_SYMBOL_CHARS}])$`, 'u'),
            '$1$2'
        )
        .replace(
            new RegExp(`([\\uac00-\\ud7a3]{2,6}[${TMS_IDENTITY_LETTER_CHARS}]?${TMS_SHUTTLE_MARK_CHAR}?)\\s+([${TMS_STATUS_SYMBOL_CHARS}]+)$`, 'u'),
            '$1$2'
        )
        .replace(/\s+/g, ' ')
        .trim();
}

function parseTmsStudentNameParts(raw) {
    let source = stripTmsAttendanceNoise(raw);
    source = stripEmptyNameSuffixGroups(source);
    source = collapseTmsNameMarkSpacing(source);
    if (!source) {
        return {
            source,
            name: '',
            statusMarks: { isNew: false, shuttle: false, transferIn: false },
            parseUncertain: false
        };
    }
    const match = source.match(TMS_STUDENT_NAME_RE);
    if (!match) {
        return {
            source,
            name: source,
            statusMarks: { isNew: false, shuttle: false, transferIn: false },
            parseUncertain: true
        };
    }
    const hangul = match[1] || '';
    const identityLetter = match[2] || '';
    const suffix = source.slice((hangul + identityLetter).length);
    return {
        source,
        name: `${hangul}${identityLetter}`,
        statusMarks: {
            isNew: TMS_NEW_MARK_RE.test(suffix),
            shuttle: suffix.includes(TMS_SHUTTLE_MARK_CHAR),
            transferIn: TMS_TRANSFER_MARK_RE.test(suffix)
        },
        parseUncertain: false
    };
}

/**
 * Canonical TMS identity: Hangul + optional permanent A-D disambiguator.
 * Expirable marks (S / ★ / ◆) are parsed into status flags, not kept in name.
 * Grammar failures keep best-effort text and set parseUncertain (never-drop).
 */
function normalizeTmsStudentName(raw) {
    const parsed = parseTmsStudentNameParts(raw);
    if (!parsed.name) {
        return {
            name: '',
            nameEnHint: '',
            statusMarks: parsed.statusMarks,
            parseUncertain: Boolean(parsed.parseUncertain)
        };
    }
    return {
        name: parsed.name,
        nameEnHint: '',
        statusMarks: parsed.statusMarks,
        parseUncertain: Boolean(parsed.parseUncertain)
    };
}

function isLikelyStudentName(name) {
    const parsed = parseTmsStudentNameParts(name);
    const normalized = parsed.name;
    if (!normalized || normalized.length < 2 || normalized.length > 7) {
        return false;
    }
    const hangulOnly = normalized.replace(/[A-D]/g, '');
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
 * If TMS puts the disambiguator just after </a> (권이안</a>◆ or </a>(Alice)◆), pick it up.
 */
function extractTrailingDisambiguator(afterHtml) {
    const text = stripInvisibleNameNoise(
        stripTags(decodeHtmlEntities(String(afterHtml || '')))
    );
    if (!text) {
        return '';
    }
    // Status marks may sit right after </a>, or after an English (Name) group.
    const m = text.match(
        new RegExp(
            `^(?:(?:\\([^)]{0,40}\\)|\\[[^\\]]{0,40}\\])\\s*)?([${TMS_NAME_MARK_CHARS}]+)(?:\\s|$|[\\(（\\[［])`
        )
    );
    if (m && m[1]) {
        return m[1];
    }
    const firstChunk = (text.match(new RegExp(`^[${TMS_NAME_MARK_CHARS}]+`)) || [])[0] || '';
    if (firstChunk) {
        return firstChunk;
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
        let statusMarks = { isNew: false, shuttle: false, transferIn: false };
        let parseUncertain = false;
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
            const enParen = L.match(/^(?:\(([^)]*)\)|（([^）]*)）|\[([^\]]*)\]|［([^］]*)］)$/);
            if (enParen) {
                if (!nameEn) {
                    nameEn = String(
                        enParen[1] != null ? enParen[1] :
                        enParen[2] != null ? enParen[2] :
                        enParen[3] != null ? enParen[3] :
                        enParen[4] != null ? enParen[4] : ''
                    ).trim();
                }
                j += 1;
                continue;
            }
            const parsedLine = parseTmsStudentNameParts(L);
            const cleanL = parsedLine.name;
            if (!name && cleanL && isLikelyStudentName(cleanL)) {
                name = cleanL;
                statusMarks = parsedLine.statusMarks;
                parseUncertain = parsedLine.parseUncertain;
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
            const parsedFirst = parseTmsStudentNameParts(firstLine);
            const fromFirst = parsedFirst.name;
            if (fromFirst && isLikelyStudentName(fromFirst)) {
                name = fromFirst;
                statusMarks = parsedFirst.statusMarks;
                parseUncertain = parsedFirst.parseUncertain;
            }
        }
        if (name && isLikelyStudentName(name) && !seen.has(name)) {
            seen.add(name);
            students.push({
                name,
                nameEn: nameEn || '',
                statusMarks,
                parseUncertain: Boolean(parseUncertain)
            });
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
 * Primary: studentinf(mpidx) / StudentPopup.aspx?mpidx= (+ optional English / trailing ◆).
 * Inner HTML may nest spans/fonts (권이안<span>◆</span>) — strip tags, keep mark.
 * Fallback: numbered paste-style blocks after cutting homework/self-check tails.
 * Never greedy-scan all Hangul table cells (avoids 매우만족 etc.).
 */
function parseStudentsFromClassPopup(html) {
    const raw = String(html || '');
    const students = [];
    const seenMpidx = new Set();
    const seenName = new Set();

    function pushStudent(mpidx, rawInner, afterWindow) {
        const id = String(mpidx || '').trim();
        const innerText = stripInvisibleNameNoise(
            stripTags(decodeHtmlEntities(rawInner))
        );
        const parsedInner = parseTmsStudentNameParts(innerText);
        let name = parsedInner.name;
        let statusMarks = parsedInner.statusMarks;
        let parseUncertain = parsedInner.parseUncertain;
        if (!id || (!name && !parseUncertain) || (!parseUncertain && !isLikelyStudentName(name))) {
            return;
        }
        if (seenMpidx.has(id)) {
            return;
        }
        let nameEn = '';
        const windowText = String(afterWindow || '');
        // Disambiguator often sits just after </a>, not inside the link text.
        // Apply BEFORE name dedupe so 김민수</a>◆ is not dropped as a duplicate of 김민수.
        if (!parseUncertain && name && !/[A-D]$/.test(name)) {
            const trailingMark = extractTrailingDisambiguator(windowText);
            if (trailingMark) {
                const reparsed = parseTmsStudentNameParts(name + trailingMark);
                if (reparsed.name && isLikelyStudentName(reparsed.name)) {
                    name = reparsed.name;
                    statusMarks = reparsed.statusMarks;
                    parseUncertain = reparsed.parseUncertain;
                }
            }
        }
        const nameKey = parseUncertain ? `${name || innerText}#${id}` : name;
        const enMatch =
            windowText.match(/\(\s*<a[^>]*>\s*([^<]+?)\s*<\/a>\s*\)/i) ||
            windowText.match(/\(\s*([A-Za-z][A-Za-z\s.'-]{0,40})\s*\)/);
        if (enMatch) {
            const candidate = stripInvisibleNameNoise(
                stripTags(decodeHtmlEntities(enMatch[1]))
            );
            if (
                candidate &&
                !/^(Absent|Present|Late|Tardy|Early leave)$/i.test(candidate)
            ) {
                nameEn = candidate;
            }
        }
        seenMpidx.add(id);
        seenName.add(nameKey);
        students.push({
            name: name || parsedInner.source || innerText,
            nameEn,
            mpidx: id,
            statusMarks,
            parseUncertain: Boolean(parseUncertain)
        });
    }

    // Capture full anchor inner HTML (nested <span>/<font> allowed).
    const studentInfRe =
        /javascript:\s*studentinf\s*\(\s*['"]?(\d+)['"]?\s*\)[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = studentInfRe.exec(raw))) {
        const after = raw.slice(m.index + m[0].length, m.index + m[0].length + 280);
        const nextStudent = after.search(
            /javascript:\s*studentinf\s*\(|StudentPopup\.aspx\?[^"'>\s]*mpidx=/i
        );
        const afterWindow = nextStudent >= 0 ? after.slice(0, nextStudent) : after;
        pushStudent(m[1], m[2], afterWindow);
    }

    // Alternate TMS markup: StudentPopup.aspx?mpidx=12345
    const popupRe =
        /(?:href|onclick)\s*=\s*["'][^"']*StudentPopup\.aspx\?[^"']*mpidx=(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = popupRe.exec(raw))) {
        const after = raw.slice(m.index + m[0].length, m.index + m[0].length + 280);
        const nextStudent = after.search(
            /javascript:\s*studentinf\s*\(|StudentPopup\.aspx\?[^"'>\s]*mpidx=/i
        );
        const afterWindow = nextStudent >= 0 ? after.slice(0, nextStudent) : after;
        pushStudent(m[1], m[2], afterWindow);
    }

    if (students.length) {
        return students.map((s) => ({
            name: s.name,
            nameEn: s.nameEn || '',
            mpidx: s.mpidx || '',
            statusMarks: s.statusMarks || { isNew: false, shuttle: false, transferIn: false },
            parseUncertain: s.parseUncertain === true
        }));
    }

    // Fallback: paste-style numbered list from visible text (tail-trimmed).
    const text = stripTags(decodeHtmlEntities(raw))
        .replace(/\s{2,}/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
    return parseStudentsFromNumberedBlocks(text);
}

/** @deprecated Use parseStudentsFromClassPopup — kept as alias for call sites. */
function parseStudentsFromHtml(html) {
    return parseStudentsFromClassPopup(html);
}

/**
 * Extract inner HTML of the first element matching class_select (balanced tags).
 * Non-greedy([\s\S]*?)</div> truncates when an <li> contains a nested <div>.
 */
function extractClassSelectBlock(html) {
    const raw = String(html || '');
    const startRe =
        /<div\b[^>]*class=["'][^"']*\bclass_select\b[^"']*["'][^>]*>/i;
    const startMatch = startRe.exec(raw);
    if (!startMatch) {
        return raw;
    }
    const openTagEnd = startMatch.index + startMatch[0].length;
    let depth = 1;
    const tagRe = /<\/?div\b[^>]*>/gi;
    tagRe.lastIndex = openTagEnd;
    let tm;
    while ((tm = tagRe.exec(raw))) {
        if (/^<\//.test(tm[0])) {
            depth -= 1;
            if (depth === 0) {
                return raw.slice(openTagEnd, tm.index);
            }
        } else if (!/\/>$/.test(tm[0])) {
            depth += 1;
        }
    }
    return raw.slice(openTagEnd);
}

/**
 * Parse TMS class popup sidebar: .class_select li → name + Hsubclass id + postback target.
 * @returns {{ cohortName: string, tmsClassId: string, eventTarget: string, eventArgument: string, selected: boolean }[]}
 */
function parseClassSelectList(html) {
    const results = [];
    const seen = new Set();
    const block = extractClassSelectBlock(html);
    const liRe = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = liRe.exec(block))) {
        const liAttrs = m[1] || '';
        const li = m[2];
        if (!/Hsubclass/i.test(li)) {
            continue;
        }
        const aOpenMatch = li.match(/<a\b([^>]*)>/i);
        const aAttrs = aOpenMatch ? aOpenMatch[1] || '' : '';
        // Selected may be on <li> or the LinkButton <a> — not arbitrary inner text.
        const selected =
            /\bselected\b/i.test(liAttrs) || /\bselected\b/i.test(aAttrs);
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
        const postMatch = li.match(
            /__doPostBack\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/i
        );
        const eventTarget = postMatch ? String(postMatch[1] || '').trim() : '';
        const eventArgument = postMatch ? String(postMatch[2] || '') : '';
        if (!name || name.length < 2 || !tmsClassId || tmsClassId === '0') {
            continue;
        }
        if (isNoiseClassName(name) || seen.has(tmsClassId)) {
            continue;
        }
        seen.add(tmsClassId);
        results.push({
            cohortName: name,
            tmsClassId,
            eventTarget,
            eventArgument,
            selected: Boolean(selected)
        });
    }
    return results;
}

function studentMpidxSet(students) {
    const set = new Set();
    (students || []).forEach((s) => {
        if (s && s.mpidx) {
            set.add(String(s.mpidx));
        }
    });
    return set;
}

function mpidxSetsDiffer(a, b) {
    if (a.size !== b.size) {
        return true;
    }
    for (const id of a) {
        if (!b.has(id)) {
            return true;
        }
    }
    return false;
}

/**
 * Find a class_select entry on the current popup HTML by Hsubclass id.
 * Re-resolve after each postback — ASP.NET control ids can shift with ViewState.
 */
function findClassSelectById(html, tmsClassId) {
    const id = String(tmsClassId || '').trim();
    if (!id) {
        return null;
    }
    return parseClassSelectList(html).find((c) => c.tmsClassId === id) || null;
}

/** True when the popup sidebar marks this Hsubclass as the active class. */
function classIsSelectedOnPage(html, tmsClassId) {
    const live = findClassSelectById(html, tmsClassId);
    return Boolean(live && live.selected);
}

/**
 * Switch class popup via ASP.NET LinkButton postback (same as the TMS UI).
 * GET ?classidx= is unreliable — often returns the previously selected class.
 * Submit all hidden fields (browser form submit), not only ViewState.
 */
async function fetchClassPopupPostback(jar, popupUrl, pageHtml, eventTarget, eventArgument) {
    const target = String(eventTarget || '').trim();
    if (!target) {
        const err = new Error('Missing postback event target');
        err.code = 'TMS_POSTBACK_TARGET_MISSING';
        throw err;
    }
    const fields = extractHiddenInputs(pageHtml);
    // Ensure core ASP.NET fields exist even if attribute order confused the scanner.
    if (!fields.__VIEWSTATE) {
        fields.__VIEWSTATE = extractHidden(pageHtml, '__VIEWSTATE');
    }
    if (!fields.__VIEWSTATEGENERATOR) {
        fields.__VIEWSTATEGENERATOR = extractHidden(pageHtml, '__VIEWSTATEGENERATOR');
    }
    if (!fields.__EVENTVALIDATION) {
        fields.__EVENTVALIDATION = extractHidden(pageHtml, '__EVENTVALIDATION');
    }
    fields.__EVENTTARGET = target;
    fields.__EVENTARGUMENT = eventArgument == null ? '' : String(eventArgument);
    const body = encodeForm(fields);
    return requestFollow(popupUrl, {
        method: 'POST',
        jar,
        body,
        headers: { Referer: popupUrl },
        contentType: 'application/x-www-form-urlencoded'
    });
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
                source: c.source || '',
                schedule: c.schedule || null,
                tmsHomeroomName: c.tmsHomeroomName || ''
            });
        }
        const bucket = byKey.get(key);
        if (!bucket.cohortName && name) {
            bucket.cohortName = name;
        }
        if (!bucket.tmsClassId && tmsClassId) {
            bucket.tmsClassId = tmsClassId;
        }
        if (!bucket.schedule && c.schedule) {
            bucket.schedule = c.schedule;
        }
        if (!bucket.tmsHomeroomName && c.tmsHomeroomName) {
            bucket.tmsHomeroomName = c.tmsHomeroomName;
        }
        const seenNames = new Set(bucket.students.map((s) => s.name));
        const seenMpidx = new Set(
            bucket.students.map((s) => (s && s.mpidx ? String(s.mpidx) : '')).filter(Boolean)
        );
        (c.students || []).forEach((s) => {
            if (!s || !s.name) {
                return;
            }
            const mpidx = s.mpidx ? String(s.mpidx) : '';
            if (mpidx) {
                if (seenMpidx.has(mpidx)) {
                    return;
                }
                seenMpidx.add(mpidx);
            } else if (seenNames.has(s.name)) {
                return;
            }
            seenNames.add(s.name);
            bucket.students.push({
                name: s.name,
                nameEn: s.nameEn || '',
                mpidx: mpidx || '',
                statusMarks: s.statusMarks || { isNew: false, shuttle: false, transferIn: false },
                parseUncertain: s.parseUncertain === true
            });
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

/** Strip campus bracket prefixes like `[잠실르엘C]` from TMS class labels. */
function cleanTmsCohortDisplayName(name) {
    return String(name || '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\[[^\]]*\]\s*/, '')
        .trim();
}

/**
 * Parse schedule block from class_Main_New_PopUp class-info title,
 * e.g. OrangeM^2606_…_파닉스(15:20~17:00).
 * @returns {{ start: string, end: string } | null}
 */
function parseClassPopupSchedule(html) {
    const raw = String(html || '');
    // Prefer the Class information / 반정보 row title attribute.
    const infoTitle =
        raw.match(
            /title=["']Class\s+infomation["'][^>]*>[\s\S]*?<td[^>]*>\s*<a[^>]*title=["']([^"']+)["']/i
        ) ||
        raw.match(
            /title=["']반정보["'][^>]*>[\s\S]*?<td[^>]*>\s*<a[^>]*title=["']([^"']+)["']/i
        );
    const haystack = infoTitle
        ? infoTitle[1]
        : raw.match(/\((\d{1,2}:\d{2})\s*[~～\-–—]\s*(\d{1,2}:\d{2})\)/)
          ? raw
          : '';
    const m = String(haystack || '').match(
        /\((\d{1,2}):(\d{2})\s*[~～\-–—]\s*(\d{1,2}):(\d{2})\)/
    );
    if (!m) {
        return null;
    }
    const pad = (n) => String(Number(n)).padStart(2, '0');
    return {
        start: `${pad(m[1])}:${m[2]}`,
        end: `${pad(m[3])}:${m[4]}`
    };
}

/**
 * Parse 담임 teacher display name from 담당선생님 / Main teacher row.
 * e.g. 최미영[담임](파닉스),차지민[비담임](애니메이션)
 * @returns {string}
 */
function parseClassPopupHomeroomName(html) {
    const raw = String(html || '');
    const titleMatch =
        raw.match(
            /title=["']Main\s+teacher["'][^>]*>[\s\S]*?<td[^>]*>\s*<a[^>]*title=["']([^"']+)["']/i
        ) ||
        raw.match(
            /title=["']담당선생님["'][^>]*>[\s\S]*?<td[^>]*>\s*<a[^>]*title=["']([^"']+)["']/i
        );
    const blob = titleMatch ? titleMatch[1] : '';
    if (!blob) {
        return '';
    }
    const hr = blob.match(/([^,，\[]+?)\s*\[\s*담임\s*\]/);
    return hr ? String(hr[1] || '').trim() : '';
}

/**
 * Infer MWF/TTh from common TMS class suffixes (…M^ / …T^).
 * @returns {{ schedulePattern: 'mwf'|'tth'|'', meetingDays: number[] }}
 */
function inferScheduleFromTmsClassName(name) {
    const s = cleanTmsCohortDisplayName(name);
    if (/T\^/i.test(s) || /(?:^|[^A-Za-z])T(?:\d|$)/.test(s)) {
        return { schedulePattern: 'tth', meetingDays: [2, 4] };
    }
    if (/M\^/i.test(s) || /(?:^|[^A-Za-z])M(?:\d|$)/.test(s)) {
        return { schedulePattern: 'mwf', meetingDays: [1, 3, 5] };
    }
    return { schedulePattern: '', meetingDays: [] };
}

/** Merge class_select-style lists by tmsClassId (later entries win non-empty fields). */
function unionTmsClassLists(lists) {
    const byId = new Map();
    (Array.isArray(lists) ? lists : []).forEach((list) => {
        (Array.isArray(list) ? list : []).forEach((row) => {
            if (!row) {
                return;
            }
            const id = String(row.tmsClassId || '').trim();
            if (!id) {
                return;
            }
            const prev = byId.get(id) || {};
            byId.set(
                id,
                Object.assign({}, prev, row, {
                    cohortName: row.cohortName || prev.cohortName || '',
                    tmsClassId: id
                })
            );
        });
    });
    return Array.from(byId.values());
}

/** Parse Writing_list.aspx cmbban class filter options. */
function parseWritingCmbbanOptions(html) {
    const raw = String(html || '');
    const selectMatch =
        raw.match(/<select[^>]*name=["']cmbban["'][^>]*>([\s\S]*?)<\/select>/i) ||
        raw.match(/<select[^>]*id=["'][^"']*cmbban[^"']*["'][^>]*>([\s\S]*?)<\/select>/i);
    if (!selectMatch) {
        return [];
    }
    const out = [];
    const optRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let m;
    while ((m = optRe.exec(selectMatch[1]))) {
        const attrs = m[1] || '';
        const valueMatch = attrs.match(/\bvalue=["']([^"']*)["']/i);
        const value = valueMatch ? String(valueMatch[1] || '').trim() : '';
        if (!value) {
            continue;
        }
        const label = cleanTmsCohortDisplayName(stripTags(decodeHtmlEntities(m[2])));
        if (!label) {
            continue;
        }
        out.push({ tmsClassId: value, className: label, cohortName: label });
    }
    return out;
}

/**
 * Parse student cell from Writing_list: "박세빈S(Sally)" / "김유겸(YooGyum)" / "황연진()".
 * Uses the same mark grammar as roster scrape (canonical Hangul+A–D + statusMarks).
 */
function parseWritingStudentLabel(raw) {
    let text = stripTags(decodeHtmlEntities(String(raw || '')))
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) {
        return {
            name: '',
            nameEn: '',
            statusMarks: { isNew: false, shuttle: false, transferIn: false },
            parseUncertain: false
        };
    }
    let nameEn = '';
    const paren = text.match(/^(.*)[\(（]\s*([^）)]*)\s*[\)）]\s*$/);
    if (paren) {
        text = paren[1].trim();
        nameEn = String(paren[2] || '').trim();
    }
    const parsed = parseTmsStudentNameParts(text);
    if (parsed.name && (STUDENT_NOISE_NAMES.has(parsed.name) || SKIP_NAME_WORDS.has(parsed.name))) {
        return {
            name: '',
            nameEn: '',
            statusMarks: { isNew: false, shuttle: false, transferIn: false },
            parseUncertain: false
        };
    }
    if (parsed.name) {
        return {
            name: parsed.name,
            nameEn,
            statusMarks: parsed.statusMarks,
            parseUncertain: Boolean(parsed.parseUncertain)
        };
    }
    const loose = text.match(/^([\uac00-\ud7a3]{2,6}\s*[A-Da-dSs★☆◆◇♦♢]?)/u);
    if (loose) {
        const n2 = parseTmsStudentNameParts(loose[1]);
        if (n2.name) {
            return {
                name: n2.name,
                nameEn,
                statusMarks: n2.statusMarks,
                parseUncertain: Boolean(n2.parseUncertain)
            };
        }
    }
    return {
        name: '',
        nameEn,
        statusMarks: { isNew: false, shuttle: false, transferIn: false },
        parseUncertain: true
    };
}

function parseYyyymmddToIso(raw) {
    const s = String(raw || '').replace(/\D/g, '');
    if (s.length !== 8) {
        return '';
    }
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function parseIsoDateLoose(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (!m) {
        return '';
    }
    const y = m[1];
    const mo = String(m[2]).padStart(2, '0');
    const d = String(m[3]).padStart(2, '0');
    return `${y}-${mo}-${d}`;
}

/**
 * Parse assigned date from TMS 포트폴리오제목 (YYYY-MM-DD or YYYYMMDD).
 */
function parsePortfolioAssignedDate(raw) {
    const text = String(raw || '').trim();
    if (!text) {
        return '';
    }
    const iso = parseIsoDateLoose(text);
    if (iso) {
        return iso;
    }
    const compact = text.match(/(\d{8})/);
    return compact ? parseYyyymmddToIso(compact[1]) : '';
}

function extractLabeledFieldValue(html, label) {
    const raw = String(html || '');
    const escaped = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escaped) {
        return '';
    }
    const pairRe = new RegExp(
        `<(?:th|td|label|span|div)[^>]*>\\s*${escaped}\\s*(?:[:：])?\\s*<\\/(?:th|td|label|span|div)>\\s*<(?:td|span|div)[^>]*>([\\s\\S]*?)<\\/(?:td|span|div)>`,
        'i'
    );
    const pair = raw.match(pairRe);
    if (pair) {
        return stripTags(decodeHtmlEntities(pair[1])).replace(/\s+/g, ' ').trim();
    }
    return '';
}

function parseEssayDetailMeta(html) {
    const portfolioTitle = extractLabeledFieldValue(html, '포트폴리오제목');
    const assignedDate = parsePortfolioAssignedDate(portfolioTitle);
    return {
        portfolioTitle,
        assignedDate,
        assignedMonth: assignedDate ? assignedDate.slice(0, 7) : ''
    };
}

/**
 * Parse 에세이관리 Writing_list.aspx submission table rows.
 * Presence on this list means the student submitted (submitted: true).
 */
function parseWritingListRows(html) {
    const raw = String(html || '');
    const tableMatch =
        raw.match(
            /<div[^>]*class=["'][^"']*\bboardlisttable\b[^"']*["'][^>]*>[\s\S]*?<table[\s\S]*?<\/table>/i
        ) || raw.match(/<th[^>]*>\s*student\s*name\s*<\/th>[\s\S]*?<\/table>/i);
    if (!tableMatch) {
        return [];
    }
    const tableHtml = tableMatch[0];
    const rows = [];
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr;
    while ((tr = trRe.exec(tableHtml))) {
        const rowHtml = tr[1];
        if (/<th\b/i.test(rowHtml)) {
            continue;
        }
        const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((m) => m[1]);
        if (cells.length < 7) {
            continue;
        }
        const student = parseWritingStudentLabel(cells[0]);
        if (!student.name) {
            continue;
        }
        const classCell = cells[1] || '';
        const photo =
            classCell.match(
                /photopoliview\s*\(\s*['"]?(\d+)['"]?\s*,\s*['"]?(\d+)['"]?\s*,\s*['"]?(\d+)['"]?\s*,\s*['"]?(\d{8})['"]?\s*\)/i
            ) || null;
        const className = cleanTmsCohortDisplayName(stripTags(decodeHtmlEntities(classCell)));
        if (!className || isNoiseClassName(className)) {
            continue;
        }
        const title = stripTags(decodeHtmlEntities(cells[3] || ''))
            .replace(/\s+/g, ' ')
            .trim();
        if (!title) {
            continue;
        }
        const correct = stripTags(decodeHtmlEntities(cells[4] || ''))
            .replace(/\s+/g, ' ')
            .trim();
        const submittedAt = parseIsoDateLoose(stripTags(decodeHtmlEntities(cells[6] || '')));
        rows.push({
            name: student.name,
            nameEn: student.nameEn,
            statusMarks: student.statusMarks,
            parseUncertain: Boolean(student.parseUncertain),
            className,
            tmsClassId: photo ? photo[2] : '',
            mpidx: photo ? photo[1] : '',
            homeworkItemIdx: photo ? photo[3] : '',
            lessonDate: photo ? parseYyyymmddToIso(photo[4]) : '',
            title,
            correct,
            submitted: true,
            submittedAt
        });
    }
    return rows;
}

function extractWritingPagingTargets(html) {
    const targets = [];
    const seen = new Set();
    const decoded = decodeHtmlEntities(String(html || ''));
    const re = /__doPostBack\s*\(\s*['"](pagingHelper\$ctl\d+)['"]/gi;
    let m;
    while ((m = re.exec(decoded))) {
        const t = m[1];
        if (!seen.has(t)) {
            seen.add(t);
            targets.push(t);
        }
    }
    return targets;
}

/**
 * Group flat Writing_list rows into assignment buckets.
 */
function groupWritingRowsIntoAssignments(rows) {
    const byKey = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        if (!row || !row.name || !row.title) {
            return;
        }
        const key = row.homeworkItemIdx
            ? `hw:${row.homeworkItemIdx}`
            : `n:${String(row.className || '').toLowerCase()}|${String(row.title || '').toLowerCase()}|${row.lessonDate || ''}`;
        if (!byKey.has(key)) {
            byKey.set(key, {
                tmsClassId: String(row.tmsClassId || ''),
                className: String(row.className || ''),
                title: String(row.title || ''),
                mpidx: String(row.mpidx || ''),
                homeworkItemIdx: String(row.homeworkItemIdx || ''),
                lessonDate: String(row.lessonDate || ''),
                assignedDate: '',
                assignedMonth: '',
                portfolioTitle: '',
                dueDate: '',
                students: []
            });
        }
        const bucket = byKey.get(key);
        if (!bucket.tmsClassId && row.tmsClassId) {
            bucket.tmsClassId = String(row.tmsClassId);
        }
        if (!bucket.className && row.className) {
            bucket.className = String(row.className);
        }
        if (!bucket.lessonDate && row.lessonDate) {
            bucket.lessonDate = String(row.lessonDate);
        }
        if (!bucket.mpidx && row.mpidx) {
            bucket.mpidx = String(row.mpidx);
        }
        const seen = new Set(bucket.students.map((s) => `${s.mpidx || ''}|${s.name}`));
        const studentKey = `${row.mpidx || ''}|${row.name}`;
        if (!seen.has(studentKey)) {
            bucket.students.push({
                name: row.name,
                nameEn: row.nameEn || '',
                mpidx: row.mpidx || '',
                statusMarks: row.statusMarks || { isNew: false, shuttle: false, transferIn: false },
                parseUncertain: row.parseUncertain === true,
                submitted: true,
                submittedAt: row.submittedAt || ''
            });
        }
    });
    return Array.from(byKey.values());
}

function collectWritingFormFields(html) {
    return {
        __VIEWSTATE: extractHidden(html, '__VIEWSTATE'),
        __VIEWSTATEGENERATOR: extractHidden(html, '__VIEWSTATEGENERATOR'),
        __EVENTVALIDATION: extractHidden(html, '__EVENTVALIDATION'),
        cmbBanInd: '1',
        cmbban: '',
        cmbCorrect: '',
        cmbboardkind: '1'
    };
}

/**
 * Scrape TMS 에세이관리 (/lms/Writing_list.aspx) submission list.
 * Rows on this page are submissions; status write in ClassManager is Received only.
 */
async function scrapeEssaySubmissions(options) {
    const cfg = Object.assign({}, getConfig(), options || {});
    if (!credentialsConfigured(cfg)) {
        const err = new Error('TMS credentials not configured');
        err.code = 'TMS_CREDS_MISSING';
        throw err;
    }
    const jar = createJar();
    const pages = [];
    const loginInfo = await login(cfg, jar);
    const listUrl = `${cfg.baseUrl}${WRITING_LIST_PATH}`;
    let page = await fetchPage(jar, listUrl);
    if (page.status >= 400 || stillOnLoginPage(page.text, page.finalUrl)) {
        const err = new Error('TMS Writing list failed');
        err.code = 'TMS_SCRAPE_FAILED';
        throw err;
    }
    pages.push({
        url: page.finalUrl || listUrl,
        status: page.status,
        ok: true,
        source: 'writing-list',
        rowCount: 0
    });

    let allRows = parseWritingListRows(page.text);
    pages[0].rowCount = allRows.length;

    const pagingTargets = extractWritingPagingTargets(page.text).slice(0, MAX_WRITING_LIST_PAGES);
    for (const target of pagingTargets) {
        try {
            const fields = Object.assign(collectWritingFormFields(page.text), {
                __EVENTTARGET: target,
                __EVENTARGUMENT: ''
            });
            page = await requestFollow(listUrl, {
                method: 'POST',
                jar,
                headers: { Referer: listUrl },
                body: encodeForm(fields)
            });
            if (page.status >= 400 || stillOnLoginPage(page.text, page.finalUrl)) {
                pages.push({
                    url: page.finalUrl || listUrl,
                    status: page.status,
                    ok: false,
                    source: 'writing-list-page',
                    eventTarget: target
                });
                break;
            }
            const rows = parseWritingListRows(page.text);
            pages.push({
                url: page.finalUrl || listUrl,
                status: page.status,
                ok: true,
                source: 'writing-list-page',
                eventTarget: target,
                rowCount: rows.length
            });
            allRows = allRows.concat(rows);
        } catch (e) {
            pages.push({
                url: listUrl,
                status: 0,
                ok: false,
                error: e.message || String(e),
                source: 'writing-list-page',
                eventTarget: target
            });
            break;
        }
    }

    const seenRow = new Set();
    const deduped = [];
    allRows.forEach((r) => {
        const k = `${r.tmsClassId}|${r.homeworkItemIdx}|${r.mpidx || ''}|${r.name}|${r.title}|${r.lessonDate}`;
        if (seenRow.has(k)) {
            return;
        }
        seenRow.add(k);
        deduped.push(r);
    });

    const assignments = groupWritingRowsIntoAssignments(deduped);
    return {
        assignments,
        rows: deduped,
        meta: {
            homeUrl: loginInfo.homeUrl,
            pagesFetched: pages.length,
            source: 'writing-list',
            assignmentCount: assignments.length,
            studentRowCount: deduped.length,
            pages
        }
    };
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
            // Chain ViewState across postbacks so each class switch matches the TMS UI.
            let currentHtml = popupPage.text;
            let previousStudents = parseStudentsFromClassPopup(currentHtml);
            for (const cls of classList.slice(0, 80)) {
                const getUrl = `${cfg.baseUrl}${CLASS_POPUP_PATH}?classidx=${encodeURIComponent(cls.tmsClassId)}`;
                let students = [];
                let source = 'class-popup';
                let pageUrl = getUrl;
                let pageStatus = 0;
                let pageOk = false;
                let pageError = '';
                let accepted = false;
                const prevMpidx = studentMpidxSet(previousStudents);

                // Re-resolve LinkButton target from the latest popup HTML (ViewState-safe).
                // Do NOT fall back to the initial cls.selected — that poisons other classes
                // with the first page's roster and wipes reverse-map candidates.
                const live = findClassSelectById(currentHtml, cls.tmsClassId);
                const eventTarget =
                    (live && live.eventTarget) || cls.eventTarget || '';
                const eventArgument =
                    live && live.eventArgument != null
                        ? live.eventArgument
                        : cls.eventArgument || '';

                // Already selected on this page → use current roster when non-empty.
                // Empty parse still falls through to postback/GET (parser/page race).
                if (live && live.selected) {
                    students = parseStudentsFromClassPopup(currentHtml);
                    if (students.length) {
                        source = 'class-popup-selected';
                        pageUrl = popupUrl;
                        pageStatus = 200;
                        pageOk = true;
                        accepted = true;
                    }
                }

                // Prefer ASP.NET LinkButton postback (fresh roster for that Hsubclass).
                if (!accepted && eventTarget) {
                    try {
                        const posted = await fetchClassPopupPostback(
                            jar,
                            popupUrl,
                            currentHtml,
                            eventTarget,
                            eventArgument
                        );
                        pageStatus = posted.status || 0;
                        pageUrl = posted.finalUrl || popupUrl;
                        if (
                            posted.status < 400 &&
                            !stillOnLoginPage(posted.text, posted.finalUrl)
                        ) {
                            const switched = classIsSelectedOnPage(
                                posted.text,
                                cls.tmsClassId
                            );
                            const parsed = parseStudentsFromClassPopup(posted.text);
                            const rosterChanged = mpidxSetsDiffer(
                                prevMpidx,
                                studentMpidxSet(parsed)
                            );
                            // Prefer sidebar selected; also accept when the student set
                            // clearly changed (TMS sometimes marks selected on <a> only
                            // in ways we already cover, or omits the class briefly).
                            if (switched || (parsed.length && rosterChanged)) {
                                currentHtml = posted.text;
                                students = parsed;
                                previousStudents = parsed;
                                source = switched
                                    ? 'class-popup-postback'
                                    : 'class-popup-postback-roster-change';
                                pageOk = true;
                                accepted = true;
                            } else {
                                pageError =
                                    pageError ||
                                    'Postback did not select requested class';
                            }
                        }
                    } catch (e) {
                        pageError = e.message || String(e);
                    }
                }

                // Fallback: GET ?classidx= (legacy; may return previously selected class).
                if (!accepted) {
                    try {
                        const page = await fetchPage(jar, getUrl);
                        pageStatus = page.status || 0;
                        pageUrl = page.finalUrl || getUrl;
                        if (page.status >= 400 || stillOnLoginPage(page.text, page.finalUrl)) {
                            pageOk = false;
                            pages.push({
                                url: pageUrl,
                                status: pageStatus,
                                ok: false,
                                error: pageError || undefined,
                                source: 'class-popup'
                            });
                            allCohorts.push({
                                cohortName: cls.cohortName,
                                tmsClassId: cls.tmsClassId,
                                students: [],
                                source: 'class-popup'
                            });
                            continue;
                        }
                        const parsed = parseStudentsFromClassPopup(page.text);
                        const switched = classIsSelectedOnPage(page.text, cls.tmsClassId);
                        const rosterChanged = mpidxSetsDiffer(
                            prevMpidx,
                            studentMpidxSet(parsed)
                        );
                        if (switched || (parsed.length && rosterChanged)) {
                            currentHtml = page.text;
                            students = parsed;
                            previousStudents = parsed;
                            source = pageError || eventTarget
                                ? 'class-popup-get-fallback'
                                : 'class-popup';
                            pageOk = true;
                            accepted = true;
                        } else if (parsed.length && !prevMpidx.size) {
                            // First class / empty prior — keep students but do not claim switch.
                            students = parsed;
                            source = 'class-popup-get-unverified';
                            pageOk = true;
                            accepted = true;
                        } else {
                            pageOk = false;
                            pages.push({
                                url: pageUrl,
                                status: pageStatus,
                                ok: false,
                                error:
                                    pageError ||
                                    'GET classidx did not select requested class',
                                source: 'class-popup'
                            });
                            allCohorts.push({
                                cohortName: cls.cohortName,
                                tmsClassId: cls.tmsClassId,
                                students: [],
                                source: 'class-popup'
                            });
                            continue;
                        }
                    } catch (e) {
                        pages.push({
                            url: getUrl,
                            status: 0,
                            ok: false,
                            error: pageError || e.message || String(e),
                            source: 'class-popup'
                        });
                        allCohorts.push({
                            cohortName: cls.cohortName,
                            tmsClassId: cls.tmsClassId,
                            students: [],
                            source: 'class-popup'
                        });
                        continue;
                    }
                }

                if (accepted) {
                    previousStudents = students;
                }

                const scheduleHtml = accepted ? currentHtml : '';
                const schedule = scheduleHtml ? parseClassPopupSchedule(scheduleHtml) : null;
                const tmsHomeroomName = scheduleHtml
                    ? parseClassPopupHomeroomName(scheduleHtml)
                    : '';

                pages.push({
                    url: pageUrl,
                    status: pageStatus,
                    ok: pageOk,
                    cohortCount: 1,
                    studentCount: students.length,
                    source,
                    error: pageError || undefined
                });
                allCohorts.push({
                    cohortName: cls.cohortName,
                    tmsClassId: cls.tmsClassId,
                    students,
                    source,
                    schedule: schedule || null,
                    tmsHomeroomName: tmsHomeroomName || ''
                });
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
            source: allCohorts.some((c) =>
                String(c.source || '').startsWith('class-popup')
            )
                ? 'class-popup'
                : 'legacy'
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
    fetchPage,
    stillOnLoginPage,
    scrapeRosters,
    scrapeEssaySubmissions,
    parseWritingListRows,
    parseWritingStudentLabel,
    groupWritingRowsIntoAssignments,
    extractWritingPagingTargets,
    parseEssayDetailMeta,
    parsePortfolioAssignedDate,
    parseWritingCmbbanOptions,
    cleanTmsCohortDisplayName,
    inferScheduleFromTmsClassName,
    unionTmsClassLists,
    probe,
    parseCohortsFromHtml,
    parseStudentsFromTextLines,
    parseStudentsFromHtml,
    parseStudentsFromClassPopup,
    parseStudentsFromNumberedBlocks,
    trimRosterPasteTail,
    parseClassSelectList,
    parseClassPopupSchedule,
    parseClassPopupHomeroomName,
    extractClassSelectBlock,
    findClassSelectById,
    classIsSelectedOnPage,
    extractHiddenInputs,
    fetchClassPopupPostback,
    mergeCohortLists,
    isLikelyStudentName,
    stripTmsAttendanceNoise,
    normalizeTmsStudentName,
    parseTmsStudentNameParts,
    isNoiseClassName,
    isJunkHeaderCohortName,
    CLASS_POPUP_PATH,
    WRITING_LIST_PATH
};
