/**
 * Notes tab: class-board feed, replies, and reactions.
 */
(function (global) {
    /** Facebook-style reactions: one per person. Order matches shared/board-core.cjs REACTIONS. */
    const REACTION_INFO = [
        { emoji: '\u{1F44D}', key: 'boardReactLike' },
        { emoji: '\u2764\uFE0F', key: 'boardReactLove' },
        { emoji: '\u{1F970}', key: 'boardReactCare' },
        { emoji: '\u{1F606}', key: 'boardReactHaha' },
        { emoji: '\u{1F62E}', key: 'boardReactWow' },
        { emoji: '\u{1F622}', key: 'boardReactSad' }
    ];
    const REACTIONS = REACTION_INFO.map((row) => row.emoji);
    const ORDER_KEY = 'ccp.board.order';

    const state = {
        scope: 'feed',
        ref: '',
        posts: [],
        nextCursor: null,
        unread: [],
        threads: {},
        replyDrafts: {},
        editingId: '',
        editingText: '',
        compose: '',
        special: false,
        tagged: [],
        status: '',
        error: '',
        loading: false,
        ready: false,
        order: readSavedOrder(),
        category: 'class-notes',
        target: '',
        filterTag: '',
        exportOpen: false,
        exp: null,
        expPosts: null,
        expLoading: false
    };

    const SPECIAL_KIND = '__special';

    /** Export choices; starts as today, my notes, every class, every kind. */
    function exportOptions() {
        if (!state.exp) {
            const today = localIsoDate();
            state.exp = {
                from: today,
                to: today,
                mine: true,
                classes: null,
                kinds: null
            };
        }
        return state.exp;
    }

    function exportKinds() {
        return categories().map((row) => ({ id: row.id, name: row.name }))
            .concat([{ id: SPECIAL_KIND, name: '\u2605 ' + tr('boardSpecial') }]);
    }

    /** Boards a teacher can export from: each class, plus one entry for staff and 반 boards. */
    function exportBoards() {
        return classes().map((row) => ({ id: 'class:' + row.id, name: row.name || row.id }))
            .concat([{ id: 'other', name: tr('boardExportOtherBoards') }]);
    }

    function exportPostMatches(post, opts) {
        if (post.deleted) {
            return false;
        }
        const boardId = post.boardKind === 'class' ? 'class:' + post.boardRef : 'other';
        if (opts.classes && !opts.classes.includes(boardId)) {
            return false;
        }
        if (opts.kinds) {
            const cat = postCategory(post) || DEFAULT_CATEGORY;
            const byKind = opts.kinds.includes(cat);
            const bySpecial = post.isSpecial && opts.kinds.includes(SPECIAL_KIND);
            if (!byKind && !bySpecial) {
                return false;
            }
        }
        return true;
    }

    const NEXT_CLASS = 'next-class-notes';
    const DEFAULT_CATEGORY = 'class-notes';

    /** Note categories teachers can pick (built-in + custom), without system-managed ones. */
    function categories() {
        const api = global.CCPDayNoteCategories;
        if (!api || typeof api.getAllCategories !== 'function') {
            return [
                { id: DEFAULT_CATEGORY, name: tr('dayNoteCategoryClassNotes') },
                { id: NEXT_CLASS, name: tr('dayNoteCategoryNextClass') },
                { id: 'parent-consult', name: tr('dayNoteCategoryParentConsult') }
            ];
        }
        const isSystem = typeof api.isSystemManagedCategoryId === 'function' ? api.isSystemManagedCategoryId : () => false;
        return api.getAllCategories(data().dayNoteCategories, tr).filter((cat) => !isSystem(cat.id));
    }

    function categoryLabel(id) {
        const cat = categories().find((row) => row.id === id);
        if (cat) {
            return cat.name;
        }
        const api = global.CCPDayNoteCategories;
        return api && typeof api.resolveCategoryLabel === 'function'
            ? api.resolveCategoryLabel(id, data().dayNoteCategories, tr)
            : '';
    }

    /** First tag on a post that is a known category (old notes carry their category as a tag). */
    function postCategory(post) {
        const ids = new Set(categories().map((row) => row.id));
        return (post.tags || []).find((tag) => ids.has(tag)) || '';
    }

    function localIsoDate(d) {
        const x = d || new Date();
        return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    }

    /** Where a new post goes: "staff", "class:<id>" or "cohort:<id>"; defaults to the board in view. */
    function composeTarget() {
        if (state.target) {
            return state.target;
        }
        if ((state.scope === 'class' || state.scope === 'cohort') && state.ref) {
            return state.scope + ':' + state.ref;
        }
        return 'staff';
    }

    function readSavedOrder() {
        try {
            return global.localStorage && global.localStorage.getItem(ORDER_KEY) === 'oldest' ? 'oldest' : 'newest';
        } catch (_) {
            return 'newest';
        }
    }

    function saveOrder(order) {
        try {
            if (global.localStorage) {
                global.localStorage.setItem(ORDER_KEY, order);
            }
        } catch (_) {
            /* per-browser convenience only */
        }
    }

    /** API path for the board or feed being viewed, with the current sort. */
    function listPath(id) {
        const base = state.scope === 'feed'
            ? '/calendars/' + encodeURIComponent(id) + '/board/feed?scope=mine'
            : '/calendars/' + encodeURIComponent(id) + '/board?kind=' + encodeURIComponent(state.scope) + '&ref=' + encodeURIComponent(state.ref || '');
        return base + '&order=' + encodeURIComponent(state.order) +
            (state.filterTag ? '&tag=' + encodeURIComponent(state.filterTag) : '');
    }

    function tr(key) {
        return typeof global.t === 'function' ? global.t(key) : key;
    }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function rich(text) {
        return esc(text)
            .replace(/#([^\s#&<]+)/g, '<span class="class-board-tag">#$1</span>')
            .replace(/@([^\s@&<]+)/g, '<span class="class-board-mention">@$1</span>')
            .replace(/\n/g, '<br>');
    }

    function data() {
        return global.appData || {};
    }

    function me() {
        if (global.TeamAuth && typeof global.TeamAuth.getUser === 'function') {
            return global.TeamAuth.getUser() || {};
        }
        return {};
    }

    function calendarId() {
        if (global.CalendarSync && typeof global.CalendarSync.getActiveCalendarId === 'function') {
            return String(global.CalendarSync.getActiveCalendarId() || '');
        }
        return '';
    }

    function classes() {
        return (data().classes || []).filter((row) => row && row.id);
    }

    function cohorts() {
        return (data().cohorts || []).filter((row) => row && row.id && !row.isArchiveCohort);
    }

    function students() {
        const seen = new Set();
        const out = [];
        cohorts().forEach((cohort) => {
            (cohort.students || []).forEach((student) => {
                if (!student || !student.id || seen.has(student.id)) {
                    return;
                }
                seen.add(student.id);
                out.push({
                    id: String(student.id),
                    name: String(student.name || student.id),
                    tmsMpidx: student.tmsMpidx ? String(student.tmsMpidx) : ''
                });
            });
        });
        return out;
    }

    function className(id) {
        const row = classes().find((item) => String(item.id) === String(id));
        return row ? String(row.name || row.id) : String(id || '');
    }

    function cohortName(id) {
        const row = cohorts().find((item) => String(item.id) === String(id));
        return row ? String(row.name || row.id) : String(id || '');
    }

    function boardLabel(kind, ref) {
        if (kind === 'staff') {
            return tr('boardStaff');
        }
        if (kind === 'cohort') {
            return cohortName(ref);
        }
        if (kind === 'class') {
            return className(ref);
        }
        return tr('boardFeed');
    }

    function isUnread(kind, ref) {
        return state.unread.some((row) => row.boardKind === kind && String(row.boardRef || '') === String(ref || ''));
    }

    function rootEl() {
        return document.getElementById('classBoardRoot');
    }

    function api(path, options) {
        if (!global.CCPApi || typeof global.CCPApi.apiFetch !== 'function') {
            const err = new Error(tr('boardError'));
            err.status = 0;
            throw err;
        }
        return global.CCPApi.apiFetch(path, options);
    }

    function schemaMissing(err) {
        const message = String((err && err.message) || '');
        return /no such table/i.test(message) || (err && err.body && err.body.code === 'BOARD_SCHEMA');
    }

    async function load() {
        const id = calendarId();
        const mount = rootEl();
        if (!id || !mount) {
            state.error = tr('boardNoCalendar');
            paint();
            return;
        }
        state.loading = true;
        state.error = '';
        paintStatus();
        try {
            const body = await api(listPath(id));
            state.posts = body.posts || [];
            state.nextCursor = body.nextCursor || null;
            if (body.unreadBoards) {
                state.unread = body.unreadBoards;
            }
            if (state.scope !== 'feed') {
                await api('/calendars/' + encodeURIComponent(id) + '/board/read', {
                    method: 'POST',
                    body: { boardKind: state.scope, boardRef: state.ref || '' }
                });
                state.unread = state.unread.filter((row) => !(row.boardKind === state.scope && String(row.boardRef || '') === String(state.ref || '')));
            }
        } catch (err) {
            state.error = schemaMissing(err) ? tr('boardSchemaMissing') : (err && err.message) || tr('boardError');
        } finally {
            state.loading = false;
            paint();
        }
        if (!state.error) {
            importOldNotesInBackground(id);
        }
    }

    /**
     * Copy old day notes onto the board after the feed is showing, a chunk per request,
     * so a slow import never blocks the page and an interrupted one resumes next time.
     */
    const importRuns = {};
    async function importOldNotesInBackground(id) {
        if (importRuns[id]) {
            return;
        }
        importRuns[id] = true;
        let total = 0;
        let repaired = 0;
        try {
            for (let round = 0; round < 50; round += 1) {
                const result = await api('/calendars/' + encodeURIComponent(id) + '/board/import-day-notes', {
                    method: 'POST',
                    body: {}
                });
                const n = (result && result.imported) || 0;
                total += n;
                repaired += (result && result.repaired) || 0;
                if (total > 0 && result && result.remaining > 0) {
                    state.status = tr('boardImporting').replace('{n}', String(total)).replace('{left}', String(result.remaining));
                    paintStatus();
                }
                if (!n || !result || !(result.remaining > 0)) {
                    break;
                }
            }
        } catch (err) {
            // Non-fatal: the feed already shows; the next visit picks up where this stopped.
            importRuns[id] = false;
        }
        if ((total > 0 || repaired > 0) && calendarId() === id) {
            await load();
            if (total > 0) {
                state.status = tr('boardImported').replace('{n}', String(total));
                paintStatus();
            }
        }
    }

    function taggedFromText(text) {
        const found = state.tagged.slice();
        const seen = new Set(found.map((row) => row.studentId));
        students().forEach((student) => {
            if (seen.has(student.id)) {
                return;
            }
            if (text.indexOf('@' + student.name) >= 0) {
                found.push({ studentId: student.id, tmsMpidx: student.tmsMpidx, name: student.name });
            }
        });
        return found;
    }

    async function publish() {
        const text = state.compose.trim();
        if (!text) {
            return;
        }
        const id = calendarId();
        const target = composeTarget();
        const sep = target.indexOf(':');
        const kind = sep > 0 ? target.slice(0, sep) : 'staff';
        const ref = sep > 0 ? target.slice(sep + 1) : '';
        if (kind !== 'staff' && !ref) {
            state.error = tr('boardPickBoard');
            paintStatus();
            return;
        }
        if (state.category === NEXT_CLASS && kind !== 'class') {
            state.error = tr('boardNextClassNeedsClass');
            paintStatus();
            return;
        }
        state.error = '';
        const tagged = taggedFromText(state.compose);
        try {
            await api('/calendars/' + encodeURIComponent(id) + '/board/posts', {
                method: 'POST',
                body: {
                    boardKind: kind,
                    boardRef: ref,
                    body: state.compose,
                    isSpecial: state.special,
                    tags: state.category && state.category !== DEFAULT_CATEGORY ? [state.category] : [],
                    students: tagged.map((row) => ({ studentId: row.studentId, tmsMpidx: row.tmsMpidx })),
                    lessonDate: localIsoDate()
                }
            });
            state.compose = '';
            state.special = false;
            state.tagged = [];
            state.category = DEFAULT_CATEGORY;
            state.status = '';
            await load();
        } catch (err) {
            state.error = (err && err.message) || tr('boardError');
            paintStatus();
        }
    }

    async function sendReply(postId) {
        const text = String(state.replyDrafts[postId] || '').trim();
        if (!text) {
            return;
        }
        try {
            await api('/calendars/' + encodeURIComponent(calendarId()) + '/board/posts/' + encodeURIComponent(postId) + '/replies', {
                method: 'POST',
                body: { body: text }
            });
            state.replyDrafts[postId] = '';
            await openThread(postId, true);
        } catch (err) {
            state.error = (err && err.message) || tr('boardError');
            paintStatus();
        }
    }

    async function openThread(postId, force) {
        if (!force && state.threads[postId]) {
            delete state.threads[postId];
            paintList();
            return;
        }
        const body = await api('/calendars/' + encodeURIComponent(calendarId()) + '/board/posts/' + encodeURIComponent(postId));
        state.threads[postId] = body.replies || [];
        const idx = state.posts.findIndex((post) => post.id === postId);
        if (idx >= 0 && body.post) {
            state.posts[idx] = body.post;
        }
        paintList();
    }

    async function react(targetId, emoji) {
        const body = await api('/calendars/' + encodeURIComponent(calendarId()) + '/board/reactions', {
            method: 'POST',
            body: { targetId, emoji }
        });
        const post = state.posts.find((row) => row.id === targetId);
        if (post) {
            post.reactions = body.reactions || [];
        }
        Object.keys(state.threads).forEach((postId) => {
            state.threads[postId] = (state.threads[postId] || []).map((reply) => {
                if (reply.id !== targetId) {
                    return reply;
                }
                return Object.assign({}, reply, { reactions: body.reactions || [] });
            });
        });
        paintList();
    }

    async function saveEdit(kind, id) {
        const text = state.editingText.trim();
        if (!text) {
            return;
        }
        const path = kind === 'reply'
            ? '/calendars/' + encodeURIComponent(calendarId()) + '/board/replies/' + encodeURIComponent(id)
            : '/calendars/' + encodeURIComponent(calendarId()) + '/board/posts/' + encodeURIComponent(id);
        await api(path, { method: 'PATCH', body: { body: text } });
        state.editingId = '';
        state.editingText = '';
        await load();
    }

    async function removeItem(kind, id, postId) {
        const path = kind === 'reply'
            ? '/calendars/' + encodeURIComponent(calendarId()) + '/board/replies/' + encodeURIComponent(id)
            : '/calendars/' + encodeURIComponent(calendarId()) + '/board/posts/' + encodeURIComponent(id);
        await api(path, { method: 'DELETE' });
        if (kind === 'reply' && postId) {
            await openThread(postId, true);
        } else {
            await load();
        }
    }

    function reactionLabel(emoji) {
        const info = REACTION_INFO.find((row) => row.emoji === emoji);
        return info ? tr(info.key) : '';
    }

    /** "👍❤️ 3" — top kinds by count, total, and who reacted in the tooltip. */
    function reactionSummary(reactions) {
        const rows = reactions || [];
        if (!rows.length) {
            return '';
        }
        const counts = new Map();
        rows.forEach((row) => counts.set(row.emoji, (counts.get(row.emoji) || 0) + 1));
        const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map((pair) => pair[0]);
        const who = REACTIONS.filter((emoji) => counts.has(emoji)).map((emoji) => {
            const names = rows.filter((row) => row.emoji === emoji).map((row) => row.userName || '').filter(Boolean);
            return emoji + ' ' + names.join(', ');
        }).join('\n');
        return '<span class="class-board-react-summary" title="' + esc(who) + '">' +
            '<span class="class-board-react-icons" aria-hidden="true">' + top.join('') + '</span>' +
            '<span>' + esc(String(rows.length)) + '</span></span>';
    }

    /** Like button; hover (mouse) or press-and-hold (touch) opens the reaction picker. */
    function reactionControl(targetId, reactions) {
        const mine = String(me().id || '');
        const myRow = (reactions || []).find((row) => String(row.userId) === mine);
        const current = myRow ? myRow.emoji : '';
        const label = current ? reactionLabel(current) : tr('boardReactLike');
        const main = '<button type="button" class="class-board-like-btn' + (current ? ' is-on' : '') + '" data-react="' + esc(current || REACTIONS[0]) + '" data-target="' + esc(targetId) + '" aria-haspopup="true">' +
            '<span aria-hidden="true">' + (current || REACTIONS[0]) + '</span> ' + esc(label) + '</button>';
        const picker = '<div class="class-board-react-picker" role="group" aria-label="' + esc(tr('boardReactPick')) + '">' +
            REACTION_INFO.map((row) => '<button type="button" class="class-board-react-choice' + (row.emoji === current ? ' is-on' : '') + '" data-react="' + esc(row.emoji) + '" data-target="' + esc(targetId) + '" title="' + esc(tr(row.key)) + '" aria-label="' + esc(tr(row.key)) + '">' + row.emoji + '</button>').join('') +
            '</div>';
        return '<div class="class-board-like" data-like="' + esc(targetId) + '">' + main + picker + '</div>';
    }

    function quietActions(kind, id, authorId, bodyText, postId) {
        const mine = String(me().id || '') === String(authorId || '');
        const copy = '<button type="button" class="btn btn-outline btn-small" data-copy="' + esc(id) + '">' + esc(tr('boardCopy')) + '</button>';
        if (!mine) {
            return '<div class="class-board-actions">' + copy + '</div>';
        }
        return '<div class="class-board-actions">' +
            '<button type="button" class="btn btn-outline btn-small" data-edit="' + esc(id) + '" data-kind="' + kind + '">' + esc(tr('boardEdit')) + '</button>' +
            '<button type="button" class="btn btn-outline btn-small" data-delete="' + esc(id) + '" data-kind="' + kind + '" data-post="' + esc(postId || id) + '">' + esc(tr('boardDelete')) + '</button>' +
            copy +
            '</div>';
    }

    function cardHtml(post) {
        if (post.deleted) {
            return '<article class="class-board-card class-board-card--deleted"><p class="class-board-meta">' + esc(tr('boardDeleted')) + '</p></article>';
        }
        const where = boardLabel(post.boardKind, post.boardRef);
        const when = post.lessonDate || String(post.createdAt || '').slice(0, 10);
        const star = post.isSpecial ? '<span class="class-board-star" aria-hidden="true">\u2605</span> ' : '';
        const editing = state.editingId === post.id;
        const body = editing
            ? '<textarea class="field-input class-board-edit" data-editing="' + esc(post.id) + '">' + esc(state.editingText) + '</textarea>' +
                '<div class="class-board-actions">' +
                '<button type="button" class="btn btn-primary btn-small" data-save-edit="' + esc(post.id) + '" data-kind="post">' + esc(tr('boardSave')) + '</button>' +
                '<button type="button" class="btn btn-outline btn-small" data-cancel-edit="1">' + esc(tr('boardCancel')) + '</button>' +
                '</div>'
            : '<div class="class-board-body">' + rich(post.body || '') + '</div>';
        const thread = state.threads[post.id];
        const replies = thread
            ? '<div class="class-board-thread">' + thread.map(replyHtml).join('') +
                '<form class="class-board-reply-form" data-reply-form="' + esc(post.id) + '">' +
                '<textarea class="field-input" data-reply-text="' + esc(post.id) + '" placeholder="' + esc(tr('boardReplyPlaceholder')) + '">' + esc(state.replyDrafts[post.id] || '') + '</textarea>' +
                '<button type="submit" class="btn btn-primary btn-small">' + esc(tr('boardReply')) + '</button>' +
                '</form></div>'
            : '';
        return '<article class="class-board-card">' +
            '<p class="class-board-meta">' + star + esc(post.authorName || '') + ' \u00b7 ' + esc(where) + ' \u00b7 ' + esc(when) +
            categoryBadge(post) + '</p>' +
            body +
            (post.reactions && post.reactions.length ? '<div class="class-board-react">' + reactionSummary(post.reactions) + '</div>' : '') +
            '<div class="class-board-foot">' +
            reactionControl(post.id, post.reactions) +
            '<button type="button" class="class-board-like-btn" data-replies="' + esc(post.id) + '">\u{1F4AC} ' + esc(tr('boardReply')) + (post.replyCount ? ' \u00b7 ' + esc(String(post.replyCount)) : '') + '</button>' +
            (editing ? '' : quietActions('post', post.id, post.authorUserId, post.body, post.id)) +
            '</div>' +
            replies +
            '</article>';
    }

    function categoryBadge(post) {
        const cat = postCategory(post);
        if (!cat) {
            return '';
        }
        const cls = cat === NEXT_CLASS ? ' class-board-cat--next' : '';
        return ' <span class="class-board-cat' + cls + '">' + esc(categoryLabel(cat)) + '</span>';
    }

    function replyHtml(reply) {
        if (reply.deleted) {
            return '<div class="class-board-reply class-board-card--deleted"><p class="class-board-meta">' + esc(tr('boardDeleted')) + '</p></div>';
        }
        const editing = state.editingId === reply.id;
        const body = editing
            ? '<textarea class="field-input class-board-edit" data-editing="' + esc(reply.id) + '">' + esc(state.editingText) + '</textarea>' +
                '<button type="button" class="btn btn-primary btn-small" data-save-edit="' + esc(reply.id) + '" data-kind="reply">' + esc(tr('boardSave')) + '</button>'
            : '<div class="class-board-body">' + rich(reply.body || '') + '</div>';
        return '<div class="class-board-reply">' +
            '<p class="class-board-meta">' + esc(reply.authorName || '') + '</p>' +
            body +
            '<div class="class-board-foot">' + reactionControl(reply.id, reply.reactions) +
            reactionSummary(reply.reactions) +
            (editing ? '' : quietActions('reply', reply.id, reply.authorUserId, reply.body, reply.postId)) + '</div>' +
            '</div>';
    }

    function scopeHtml() {
        const dot = (kind, ref) => (isUnread(kind, ref) ? '<span class="class-board-unread" aria-hidden="true"></span>' : '');
        const feedOn = state.scope === 'feed' ? ' is-on' : '';
        const staffOn = state.scope === 'staff' ? ' is-on' : '';
        const classOptions = classes().map((row) => {
            const selected = state.scope === 'class' && state.ref === row.id ? ' selected' : '';
            return '<option value="' + esc(row.id) + '"' + selected + '>' + esc(row.name || row.id) + '</option>';
        }).join('');
        const cohortOptions = cohorts().map((row) => {
            const selected = state.scope === 'cohort' && state.ref === row.id ? ' selected' : '';
            return '<option value="' + esc(row.id) + '"' + selected + '>' + esc(row.name || row.id) + '</option>';
        }).join('');
        const feedDot = state.unread.length ? '<span class="class-board-unread" aria-hidden="true"></span>' : '';
        return '<button type="button" class="btn btn-outline btn-small class-board-scope-btn' + feedOn + '" data-scope="feed">' + feedDot + esc(tr('boardFeed')) + '</button>' +
            '<label class="class-board-pick">' + esc(tr('boardClass')) +
            '<select class="field-input" data-pick="class"><option value="">' + esc(tr('boardChoose')) + '</option>' + classOptions + '</select>' +
            (state.scope === 'class' && isUnread('class', state.ref) ? '<span class="class-board-unread" aria-hidden="true"></span>' : '') +
            '</label>' +
            '<label class="class-board-pick">' + esc(tr('boardCohort')) +
            '<select class="field-input" data-pick="cohort"><option value="">' + esc(tr('boardChoose')) + '</option>' + cohortOptions + '</select>' +
            '</label>' +
            '<button type="button" class="btn btn-outline btn-small class-board-scope-btn' + staffOn + '" data-scope="staff">' + dot('staff', '') + esc(tr('boardStaff')) + '</button>' +
            '<span class="class-board-scope-end">' +
            '<label class="class-board-pick">' + esc(tr('boardShow')) +
            '<select class="field-input" data-filter-tag="1">' +
            '<option value="">' + esc(tr('boardShowAll')) + '</option>' +
            categories().filter((row) => row.id !== DEFAULT_CATEGORY).map((row) => '<option value="' + esc(row.id) + '"' + (row.id === state.filterTag ? ' selected' : '') + '>' + esc(row.name) + '</option>').join('') +
            '</select></label>' +
            '<label class="class-board-pick">' + esc(tr('boardSort')) +
            '<select class="field-input" data-sort="1">' +
            '<option value="newest"' + (state.order === 'newest' ? ' selected' : '') + '>' + esc(tr('boardSortNewest')) + '</option>' +
            '<option value="oldest"' + (state.order === 'oldest' ? ' selected' : '') + '>' + esc(tr('boardSortOldest')) + '</option>' +
            '</select></label>' +
            '<button type="button" class="btn btn-outline btn-small class-board-scope-btn' + (state.exportOpen ? ' is-on' : '') + '" data-export-open="1" aria-expanded="' + (state.exportOpen ? 'true' : 'false') + '">' + esc(tr('boardExport')) + '</button>' +
            '</span>';
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function localStamp(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) {
            return String(iso || '');
        }
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    /** Posts in the chosen date range (whole calendar, mine or everyone's), current sort. */
    async function fetchExportPosts() {
        const opts = exportOptions();
        const id = calendarId();
        let base = '/calendars/' + encodeURIComponent(id) + '/board/feed?scope=all&order=' + encodeURIComponent(state.order) + '&limit=50';
        if (opts.from) {
            base += '&from=' + encodeURIComponent(opts.from);
        }
        if (opts.to) {
            base += '&to=' + encodeURIComponent(opts.to);
        }
        if (opts.mine && me().id) {
            base += '&author=' + encodeURIComponent(me().id);
        }
        const all = [];
        const seen = new Set();
        let cursor = '';
        for (let page = 0; page < 60; page += 1) {
            const body = await api(base + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
            (body.posts || []).forEach((post) => {
                if (!seen.has(post.id)) {
                    seen.add(post.id);
                    all.push(post);
                }
            });
            cursor = body.nextCursor || '';
            if (!cursor) {
                break;
            }
        }
        return all;
    }

    function weekdayLabel(iso) {
        const d = new Date(iso + 'T00:00:00');
        if (Number.isNaN(d.getTime())) {
            return iso;
        }
        const loc = (global.CCPCalendarI18n && global.currentLanguage === 'ko') || document.documentElement.lang === 'ko' ? 'ko-KR' : 'en-US';
        return iso + ' (' + d.toLocaleDateString(loc, { weekday: 'short' }) + ')';
    }

    /** Plain-text export grouped by lesson day. */
    function exportText(posts) {
        const opts = exportOptions();
        const range = opts.from === opts.to ? opts.from : opts.from + ' ~ ' + opts.to;
        const lines = [
            tr('boardExportTitle') + ' \u2014 ' + range + ' \u00b7 ' + (opts.mine ? tr('boardExportMine') : tr('boardExportEveryone')),
            ''
        ];
        let day = '';
        posts.forEach((post) => {
            const postDay = post.lessonDate || localStamp(post.createdAt).slice(0, 10);
            if (postDay !== day) {
                if (day) {
                    lines.push('');
                }
                day = postDay;
                lines.push('\u25a0 ' + weekdayLabel(day));
                lines.push('');
            }
            const cat = postCategory(post);
            const head = [boardLabel(post.boardKind, post.boardRef)];
            if (!opts.mine) {
                head.push(post.authorName || '');
            }
            head.push(localStamp(post.createdAt).slice(11));
            const marks = [];
            if (post.isSpecial) {
                marks.push('\u2605 ' + tr('boardSpecial'));
            }
            if (cat) {
                marks.push('[' + categoryLabel(cat) + ']');
            }
            lines.push(head.filter(Boolean).join(' \u00b7 ') + (marks.length ? '  ' + marks.join(' ') : ''));
            lines.push(String(post.body || ''));
            const tail = [];
            if (post.replyCount) {
                tail.push(post.replyCount === 1 ? tr('boardExportReply1') : tr('boardExportReplies').replace('{n}', String(post.replyCount)));
            }
            if (post.reactions && post.reactions.length) {
                tail.push(post.reactions.map((row) => row.emoji).join('') + ' ' + post.reactions.length);
            }
            if (tail.length) {
                lines.push('(' + tail.join(' \u00b7 ') + ')');
            }
            lines.push('');
        });
        return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    }

    function matchingExportPosts() {
        const opts = exportOptions();
        return (state.expPosts || []).filter((post) => exportPostMatches(post, opts));
    }

    /** Re-fetch for the date range / whose; class and kind ticks filter what is already loaded. */
    async function refreshExportPreview() {
        state.expLoading = true;
        paintExport();
        try {
            state.expPosts = await fetchExportPosts();
        } catch (err) {
            state.expPosts = [];
            state.error = (err && err.message) || tr('boardError');
            paintStatus();
        }
        state.expLoading = false;
        paintExport();
    }

    async function runExport(kind) {
        if (!state.expPosts) {
            await refreshExportPreview();
        }
        const posts = matchingExportPosts();
        const text = exportText(posts);
        const opts = exportOptions();
        if (kind === 'download') {
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'notes-' + opts.from + (opts.to !== opts.from ? '_' + opts.to : '') + '.txt';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        }
        state.status = (kind === 'download' ? tr('boardExportDownloaded') : tr('boardExportCopied')).replace('{n}', String(posts.length));
        paintStatus();
    }

    function exportChip(group, id, label, on) {
        return '<label class="class-board-export-chip' + (on ? ' is-on' : '') + '">' +
            '<input type="checkbox" data-exp-' + group + '="' + esc(id) + '"' + (on ? ' checked' : '') + '>' +
            '<span>' + esc(label) + '</span></label>';
    }

    function exportHtml() {
        const opts = exportOptions();
        const boards = exportBoards();
        const kinds = exportKinds();
        const boardOn = (id) => !opts.classes || opts.classes.includes(id);
        const kindOn = (id) => !opts.kinds || opts.kinds.includes(id);
        const count = state.expLoading
            ? tr('boardExportCounting')
            : state.expPosts
                ? tr('boardExportCount').replace('{n}', String(matchingExportPosts().length))
                : '';
        const has = !state.expLoading && state.expPosts && matchingExportPosts().length > 0;
        return '<div class="class-board-export-panel-inner">' +
            '<div class="class-board-export-head"><h3>' + esc(tr('boardExportHeading')) + '</h3>' +
            '<button type="button" class="class-board-like-btn" data-export-open="1" aria-label="' + esc(tr('boardCancel')) + '">\u2715</button></div>' +
            '<div class="class-board-export-section">' +
            '<span class="class-board-export-label">' + esc(tr('boardExportDates')) + '</span>' +
            '<div class="class-board-export-row">' +
            '<input type="date" class="field-input" data-exp-from="1" value="' + esc(opts.from) + '">' +
            '<span aria-hidden="true">~</span>' +
            '<input type="date" class="field-input" data-exp-to="1" value="' + esc(opts.to) + '">' +
            '<button type="button" class="class-board-like-btn" data-exp-range="today">' + esc(tr('boardExportToday')) + '</button>' +
            '<button type="button" class="class-board-like-btn" data-exp-range="week">' + esc(tr('boardExportThisWeek')) + '</button>' +
            '</div></div>' +
            '<div class="class-board-export-section">' +
            '<span class="class-board-export-label">' + esc(tr('boardExportWhose')) + '</span>' +
            '<div class="class-board-export-row">' +
            '<label class="checkbox-label"><input type="radio" name="boardExpWhose" data-exp-mine="1"' + (opts.mine ? ' checked' : '') + '> ' + esc(tr('boardExportMine')) + '</label>' +
            '<label class="checkbox-label"><input type="radio" name="boardExpWhose" data-exp-mine="0"' + (opts.mine ? '' : ' checked') + '> ' + esc(tr('boardExportEveryone')) + '</label>' +
            '</div></div>' +
            '<div class="class-board-export-section">' +
            '<span class="class-board-export-label">' + esc(tr('boardExportClasses')) +
            ' <button type="button" class="class-board-inline-link" data-exp-all="classes">' + esc(opts.classes && opts.classes.length === 0 ? tr('boardExportSelectAll') : tr('boardExportSelectNone')) + '</button></span>' +
            '<div class="class-board-export-chips">' + boards.map((row) => exportChip('class', row.id, row.name, boardOn(row.id))).join('') + '</div></div>' +
            '<div class="class-board-export-section">' +
            '<span class="class-board-export-label">' + esc(tr('boardExportKinds')) +
            ' <button type="button" class="class-board-inline-link" data-exp-all="kinds">' + esc(opts.kinds && opts.kinds.length === 0 ? tr('boardExportSelectAll') : tr('boardExportSelectNone')) + '</button></span>' +
            '<div class="class-board-export-chips">' + kinds.map((row) => exportChip('kind', row.id, row.name, kindOn(row.id))).join('') + '</div></div>' +
            '<div class="class-board-export-foot">' +
            '<span class="class-board-export-count" role="status" aria-live="polite">' + esc(count) + '</span>' +
            '<button type="button" class="btn btn-outline btn-small" data-export="copy"' + (has ? '' : ' disabled') + '>' + esc(tr('boardExportCopy')) + '</button>' +
            '<button type="button" class="btn btn-primary btn-small" data-export="download"' + (has ? '' : ' disabled') + '>' + esc(tr('boardExportDownload')) + '</button>' +
            '</div></div>';
    }

    function paintExport() {
        const mount = rootEl();
        const el = mount && mount.querySelector('[data-region="export"]');
        if (!el) {
            return;
        }
        el.hidden = !state.exportOpen;
        el.innerHTML = state.exportOpen ? exportHtml() : '';
    }

    function toggleListValue(list, all, id, on) {
        const current = list ? list.slice() : all.slice();
        const next = on ? Array.from(new Set(current.concat([id]))) : current.filter((x) => x !== id);
        return next.length === all.length ? null : next;
    }

    function composeHtml() {
        const chips = state.tagged.map((row) => '<span class="class-board-chip">' + esc(row.name) + '</span>').join('');
        const hint = state.special && taggedFromText(state.compose).length === 0
            ? '<p class="class-board-hint">' + esc(tr('boardSpecialHint')) + '</p>'
            : '';
        const studentOptions = students().map((row) => '<option value="' + esc(row.id) + '">' + esc(row.name) + '</option>').join('');
        const target = composeTarget();
        const opt = (value, label) => '<option value="' + esc(value) + '"' + (value === target ? ' selected' : '') + '>' + esc(label) + '</option>';
        const targetOptions = opt('staff', tr('boardStaff')) +
            '<optgroup label="' + esc(tr('boardClass')) + '">' + classes().map((row) => opt('class:' + row.id, row.name || row.id)).join('') + '</optgroup>' +
            '<optgroup label="' + esc(tr('boardCohort')) + '">' + cohorts().map((row) => opt('cohort:' + row.id, row.name || row.id)).join('') + '</optgroup>';
        const categoryOptions = categories().map((row) => '<option value="' + esc(row.id) + '"' + (row.id === state.category ? ' selected' : '') + '>' + esc(row.name) + '</option>').join('');
        return '<textarea class="field-input class-board-compose-text" data-compose="1" placeholder="' + esc(tr('boardComposePlaceholder')) + '">' + esc(state.compose) + '</textarea>' +
            '<div class="class-board-compose-row">' +
            '<label class="class-board-pick">' + esc(tr('dayNoteCategoryLabel')) +
            '<select class="field-input" data-category="1">' + categoryOptions + '</select></label>' +
            '<label class="class-board-pick">' + esc(tr('boardPostTo')) +
            '<select class="field-input" data-target="1">' + targetOptions + '</select></label>' +
            '</div>' +
            '<div class="class-board-compose-row">' +
            '<label class="checkbox-label"><input type="checkbox" data-special="1"' + (state.special ? ' checked' : '') + '> ' + esc(tr('boardSpecial')) + '</label>' +
            '<label class="class-board-pick">' + esc(tr('boardTagStudent')) +
            '<select class="field-input" data-tag-student="1"><option value="">' + esc(tr('boardChoose')) + '</option>' + studentOptions + '</select></label>' +
            '<button type="submit" class="btn btn-primary btn-small">' + esc(tr('boardPost')) + '</button>' +
            '</div>' +
            (chips ? '<div class="class-board-chips">' + chips + '</div>' : '') +
            hint;
    }

    function paintStatus() {
        const mount = rootEl();
        if (!mount) {
            return;
        }
        const el = mount.querySelector('[data-region="status"]');
        if (!el) {
            return;
        }
        const text = state.error || state.status || (state.loading ? tr('boardLoading') : '');
        el.textContent = text;
        el.classList.toggle('class-board-status--error', Boolean(state.error));
    }

    function paintList() {
        const mount = rootEl();
        if (!mount) {
            return;
        }
        const list = mount.querySelector('[data-region="list"]');
        if (!list) {
            return;
        }
        const more = state.nextCursor
            ? '<button type="button" class="btn btn-outline btn-small class-board-more" data-more="1">' + esc(tr('boardMore')) + '</button>'
            : '';
        list.innerHTML = state.posts.length
            ? state.posts.map(cardHtml).join('') + more
            : '<p class="class-board-empty">' + esc(tr('boardEmpty')) + '</p>';
    }

    function paint() {
        const mount = rootEl();
        if (!mount) {
            return;
        }
        if (!mount.querySelector('[data-region="scope"]')) {
            mount.innerHTML = '<div class="class-board">' +
                '<div class="class-board-scope" data-region="scope"></div>' +
                '<section class="class-board-export-panel" data-region="export" hidden></section>' +
                '<form class="class-board-compose" data-region="compose"></form>' +
                '<p class="class-board-status" data-region="status"></p>' +
                '<div data-region="list"></div>' +
                '</div>';
            bind(mount);
        }
        mount.querySelector('[data-region="scope"]').innerHTML = scopeHtml();
        paintExport();
        const compose = mount.querySelector('[data-region="compose"]');
        const focused = compose.contains(document.activeElement);
        if (!focused) {
            compose.innerHTML = composeHtml();
        }
        paintStatus();
        paintList();
    }

    function bind(mount) {
        mount.addEventListener('click', (event) => {
            const target = event.target.closest('button, [data-react]');
            if (!target || !mount.contains(target)) {
                return;
            }
            if (target.dataset.scope) {
                state.scope = target.dataset.scope;
                state.ref = '';
                state.target = '';
                state.threads = {};
                load();
                return;
            }
            if (target.dataset.replies) {
                openThread(target.dataset.replies, false).catch((err) => {
                    state.error = err.message || tr('boardError');
                    paintStatus();
                });
                return;
            }
            if (target.dataset.react) {
                if (suppressNextReactClick) {
                    suppressNextReactClick = false;
                    return;
                }
                const openLike = mount.querySelector('.class-board-like.is-open');
                if (openLike) {
                    openLike.classList.remove('is-open');
                }
                react(target.dataset.target, target.dataset.react).catch((err) => {
                    state.error = err.message || tr('boardError');
                    paintStatus();
                });
                return;
            }
            if (target.dataset.edit) {
                const kind = target.dataset.kind;
                const id = target.dataset.edit;
                const source = kind === 'reply'
                    ? Object.values(state.threads).flat().find((row) => row.id === id)
                    : state.posts.find((row) => row.id === id);
                state.editingId = id;
                state.editingText = source && source.body ? source.body : '';
                paintList();
                return;
            }
            if (target.dataset.cancelEdit != null) {
                state.editingId = '';
                paintList();
                return;
            }
            if (target.dataset.saveEdit) {
                saveEdit(target.dataset.kind, target.dataset.saveEdit).catch((err) => {
                    state.error = err.message || tr('boardError');
                    paintStatus();
                });
                return;
            }
            if (target.dataset.delete) {
                removeItem(target.dataset.kind, target.dataset.delete, target.dataset.post).catch((err) => {
                    state.error = err.message || tr('boardError');
                    paintStatus();
                });
                return;
            }
            if (target.dataset.copy) {
                const post = state.posts.find((row) => row.id === target.dataset.copy);
                const reply = Object.values(state.threads).flat().find((row) => row.id === target.dataset.copy);
                const text = (post && post.body) || (reply && reply.body) || '';
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).catch(() => {});
                }
                return;
            }
            if (target.dataset.exportOpen) {
                state.exportOpen = !state.exportOpen;
                mount.querySelector('[data-region="scope"]').innerHTML = scopeHtml();
                paintExport();
                if (state.exportOpen) {
                    refreshExportPreview();
                }
                return;
            }
            if (target.dataset.expRange) {
                const opts = exportOptions();
                const now = new Date();
                if (target.dataset.expRange === 'week') {
                    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
                    opts.from = localIsoDate(monday);
                } else {
                    opts.from = localIsoDate(now);
                }
                opts.to = localIsoDate(now);
                refreshExportPreview();
                return;
            }
            if (target.dataset.expAll) {
                const opts = exportOptions();
                const key = target.dataset.expAll;
                const isNone = opts[key] && opts[key].length === 0;
                opts[key] = isNone ? null : [];
                paintExport();
                return;
            }
            if (target.dataset.export) {
                runExport(target.dataset.export).catch((err) => {
                    state.error = (err && err.message) || tr('boardError');
                    paintStatus();
                });
                return;
            }
            if (target.dataset.more) {
                loadMore().catch((err) => {
                    state.error = err.message || tr('boardError');
                    paintStatus();
                });
            }
        });
        // Touch: press and hold the Like button to open the picker (like Facebook).
        let holdTimer = null;
        mount.addEventListener('pointerdown', (event) => {
            const btn = event.target.closest('.class-board-like-btn[data-react]');
            if (!btn || event.pointerType === 'mouse') {
                return;
            }
            clearTimeout(holdTimer);
            holdTimer = setTimeout(() => {
                const wrap = btn.closest('.class-board-like');
                if (wrap) {
                    mount.querySelectorAll('.class-board-like.is-open').forEach((el) => el.classList.remove('is-open'));
                    wrap.classList.add('is-open');
                    suppressNextReactClick = true;
                }
            }, 450);
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
            mount.addEventListener(type, () => clearTimeout(holdTimer));
        });
        mount.addEventListener('contextmenu', (event) => {
            if (event.target.closest('.class-board-like')) {
                event.preventDefault();
            }
        });
        document.addEventListener('pointerdown', (event) => {
            if (!event.target.closest('.class-board-like')) {
                mount.querySelectorAll('.class-board-like.is-open').forEach((el) => el.classList.remove('is-open'));
            }
        });
        mount.addEventListener('change', (event) => {
            const target = event.target;
            if (target.dataset.expFrom || target.dataset.expTo) {
                const opts = exportOptions();
                if (target.dataset.expFrom) {
                    opts.from = target.value || localIsoDate();
                } else {
                    opts.to = target.value || opts.from;
                }
                if (opts.to < opts.from) {
                    opts.to = opts.from;
                }
                refreshExportPreview();
                return;
            }
            if (target.dataset.expMine != null) {
                exportOptions().mine = target.dataset.expMine === '1';
                refreshExportPreview();
                return;
            }
            if (target.dataset.expClass != null) {
                const opts = exportOptions();
                opts.classes = toggleListValue(opts.classes, exportBoards().map((row) => row.id), target.dataset.expClass, target.checked);
                paintExport();
                return;
            }
            if (target.dataset.expKind != null) {
                const opts = exportOptions();
                opts.kinds = toggleListValue(opts.kinds, exportKinds().map((row) => row.id), target.dataset.expKind, target.checked);
                paintExport();
                return;
            }
            if (target.dataset.category) {
                state.category = target.value || DEFAULT_CATEGORY;
                if (state.category === NEXT_CLASS && !composeTarget().startsWith('class:')) {
                    state.error = tr('boardNextClassNeedsClass');
                } else {
                    state.error = '';
                }
                paintStatus();
                return;
            }
            if (target.dataset.target === '1' && target.tagName === 'SELECT') {
                state.target = target.value;
                if (state.error === tr('boardNextClassNeedsClass') && state.target.startsWith('class:')) {
                    state.error = '';
                    paintStatus();
                }
                return;
            }
            if (target.dataset.filterTag) {
                state.filterTag = target.value;
                state.threads = {};
                load();
                return;
            }
            if (target.dataset.sort) {
                state.order = target.value === 'oldest' ? 'oldest' : 'newest';
                saveOrder(state.order);
                state.threads = {};
                load();
                return;
            }
            if (target.dataset.pick) {
                state.scope = target.dataset.pick;
                state.ref = target.value;
                state.target = '';
                state.threads = {};
                if (state.ref) {
                    load();
                }
                return;
            }
            if (target.dataset.special != null) {
                state.special = target.checked;
                paint();
                return;
            }
            if (target.dataset.tagStudent != null && target.value) {
                const student = students().find((row) => row.id === target.value);
                if (student && !state.tagged.some((row) => row.studentId === student.id)) {
                    state.tagged.push({ studentId: student.id, tmsMpidx: student.tmsMpidx, name: student.name });
                    if (state.compose.indexOf('@' + student.name) < 0) {
                        state.compose = (state.compose ? state.compose + ' ' : '') + '@' + student.name;
                    }
                }
                target.value = '';
                paint();
            }
        });
        mount.addEventListener('input', (event) => {
            const target = event.target;
            if (target.dataset.compose != null) {
                state.compose = target.value;
                const hint = mount.querySelector('.class-board-hint');
                const show = state.special && taggedFromText(state.compose).length === 0;
                if (show && !hint) {
                    target.insertAdjacentHTML('afterend', '<p class="class-board-hint">' + esc(tr('boardSpecialHint')) + '</p>');
                }
                if (!show && hint) {
                    hint.remove();
                }
                return;
            }
            if (target.dataset.replyText) {
                state.replyDrafts[target.dataset.replyText] = target.value;
                return;
            }
            if (target.dataset.editing) {
                state.editingText = target.value;
            }
        });
        mount.addEventListener('submit', (event) => {
            const form = event.target;
            if (form.dataset.replyForm) {
                event.preventDefault();
                sendReply(form.dataset.replyForm);
                return;
            }
            if (form.dataset.region === 'compose' || form.classList.contains('class-board-compose')) {
                event.preventDefault();
                publish();
            }
        });
    }

    async function loadMore() {
        if (!state.nextCursor) {
            return;
        }
        const id = calendarId();
        const body = await api(listPath(id) + '&cursor=' + encodeURIComponent(state.nextCursor));
        const seen = new Set(state.posts.map((post) => post.id));
        (body.posts || []).forEach((post) => {
            if (!seen.has(post.id)) {
                state.posts.push(post);
            }
        });
        state.nextCursor = body.nextCursor || null;
        paintList();
    }

    let shownAt = 0;
    let suppressNextReactClick = false;

    function show() {
        const oldMount = document.getElementById('panelNotesMount');
        const promo = document.getElementById('notesMobileAppPromo');
        if (oldMount) {
            oldMount.hidden = true;
        }
        if (promo) {
            promo.hidden = true;
        }
        const mount = rootEl();
        if (mount) {
            mount.hidden = false;
        }
        paint();
        if (Date.now() - shownAt < 1500) {
            return;
        }
        shownAt = Date.now();
        load();
    }

    global.CCPClassBoard = { show, render: show, REACTIONS };
})(typeof window !== 'undefined' ? window : globalThis);
