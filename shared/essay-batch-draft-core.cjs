/**
 * Pure batch-draft helpers shared by local Express and the Cloudflare Worker.
 * One draft per teacher per campus calendar. API keys never belong in it.
 */

const MAX_DRAFT_BYTES = 1000000;
const MAX_RESULTS = 200;
const MAX_DEPTH = 12;
const MAX_ARRAY = 500;
const ESSAY_TYPES = new Set(['news-response', 'opinion', 'argumentative', 'speech']);
const SECRET_KEY = /api[-_]?key|secret|password|token|authorization|openai/i;

function draftEntityId(userId, calendarId) {
    return `essay-batch-draft:${String(userId || '')}:${String(calendarId || '')}`;
}

function emptyDraftResponse() {
    return { draft: null, updatedAt: null };
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function byteLength(text) {
    return new TextEncoder().encode(String(text || '')).length;
}

function stripSecrets(value, depth) {
    if (value == null || depth > MAX_DEPTH) {
        return null;
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (Array.isArray(value)) {
        return value.slice(0, MAX_ARRAY).map((item) => stripSecrets(item, depth + 1));
    }
    if (!isPlainObject(value)) {
        return null;
    }
    const out = {};
    Object.keys(value).forEach((key) => {
        if (!key || SECRET_KEY.test(key) || key === '_pending') {
            return;
        }
        out[key] = stripSecrets(value[key], depth + 1);
    });
    return out;
}

function sanitizeLink(link) {
    const src = isPlainObject(link) ? link : {};
    return {
        studentName: typeof src.studentName === 'string' ? src.studentName : '',
        className: typeof src.className === 'string' ? src.className : '',
        title: typeof src.title === 'string' ? src.title : typeof src.essayTitle === 'string' ? src.essayTitle : '',
        classId: typeof src.classId === 'string' ? src.classId : '',
        syllabusRowId: typeof src.syllabusRowId === 'string' ? src.syllabusRowId : '',
        studentId: typeof src.studentId === 'string' ? src.studentId : ''
    };
}

/**
 * Keep the current batch only. Drop grader setup, view filters, and any key material.
 * @returns {{ draft: object } | { error: string, status: number, code: string }}
 */
function sanitizeDraft(input) {
    const src = isPlainObject(input) ? input : {};
    const essayType = ESSAY_TYPES.has(src.essayType) ? src.essayType : 'news-response';
    const textInput = typeof src.textInput === 'string' ? src.textInput : '';
    const results = (Array.isArray(src.results) ? src.results : [])
        .filter((row) => isPlainObject(row) && !row._pending)
        .slice(0, MAX_RESULTS)
        .map((row) => stripSecrets(row, 0))
        .filter(isPlainObject);
    const batchTeachingNotes = isPlainObject(src.batchTeachingNotes)
        ? stripSecrets(src.batchTeachingNotes, 0)
        : null;
    const listLinks = (Array.isArray(src.listLinks) ? src.listLinks : [])
        .filter(isPlainObject)
        .slice(0, MAX_RESULTS)
        .map(sanitizeLink);
    const draft = {
        version: 1,
        essayType,
        textInput,
        results,
        batchTeachingNotes,
        listLinks
    };
    if (byteLength(JSON.stringify(draft)) > MAX_DRAFT_BYTES) {
        return {
            error: 'Draft is too large to save',
            status: 413,
            code: 'DRAFT_TOO_LARGE'
        };
    }
    return { draft };
}

/** True when a row exists and the client did not send its updatedAt. */
function draftConflict(existingUpdatedAt, baseUpdatedAt) {
    const existing = existingUpdatedAt ? String(existingUpdatedAt) : '';
    if (!existing) {
        return false;
    }
    if (baseUpdatedAt == null || baseUpdatedAt === '') {
        return true;
    }
    return String(baseUpdatedAt) !== existing;
}

function draftHasWork(draft) {
    if (!draft || typeof draft !== 'object') {
        return false;
    }
    if (typeof draft.textInput === 'string' && draft.textInput.trim()) {
        return true;
    }
    if (Array.isArray(draft.results) && draft.results.length > 0) {
        return true;
    }
    if (draft.batchTeachingNotes && typeof draft.batchTeachingNotes === 'object') {
        return true;
    }
    return false;
}

module.exports = {
    MAX_DRAFT_BYTES,
    draftEntityId,
    emptyDraftResponse,
    sanitizeDraft,
    draftConflict,
    draftHasWork
};
