/**
 * Notes tab: class-board feed, replies, and reactions.
 */
(function (global) {
    const REACTIONS = ['\u{1F44D}', '\u2705', '\u{1F440}', '\u2764\uFE0F'];

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
        ready: false
    };

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
            if (!state.ready) {
                try {
                    const imported = await api('/calendars/' + encodeURIComponent(id) + '/board/import-day-notes', {
                        method: 'POST',
                        body: {}
                    });
                    if (imported && imported.imported) {
                        state.status = tr('boardImported').replace('{n}', String(imported.imported));
                    }
                } catch (err) {
                    if (schemaMissing(err)) {
                        throw err;
                    }
                }
                state.ready = true;
            }
            const path = state.scope === 'feed'
                ? '/calendars/' + encodeURIComponent(id) + '/board/feed?scope=mine'
                : '/calendars/' + encodeURIComponent(id) + '/board?kind=' + encodeURIComponent(state.scope) + '&ref=' + encodeURIComponent(state.ref || '');
            const body = await api(path);
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
        const kind = state.scope === 'feed' ? 'staff' : state.scope;
        const ref = kind === 'staff' ? '' : state.ref;
        if (kind !== 'staff' && !ref) {
            state.error = tr('boardPickBoard');
            paintStatus();
            return;
        }
        const tagged = taggedFromText(state.compose);
        try {
            await api('/calendars/' + encodeURIComponent(id) + '/board/posts', {
                method: 'POST',
                body: {
                    boardKind: kind,
                    boardRef: ref,
                    body: state.compose,
                    isSpecial: state.special,
                    students: tagged.map((row) => ({ studentId: row.studentId, tmsMpidx: row.tmsMpidx })),
                    lessonDate: new Date().toISOString().slice(0, 10)
                }
            });
            state.compose = '';
            state.special = false;
            state.tagged = [];
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

    function reactionButtons(targetId, reactions) {
        const mine = String(me().id || '');
        return REACTIONS.map((emoji) => {
            const rows = (reactions || []).filter((row) => row.emoji === emoji);
            const on = rows.some((row) => String(row.userId) === mine);
            const count = rows.length ? ' ' + rows.length : '';
            return '<button type="button" class="class-board-react-btn' + (on ? ' is-on' : '') + '" data-react="' + esc(emoji) + '" data-target="' + esc(targetId) + '">' + emoji + count + '</button>';
        }).join('');
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
            '<p class="class-board-meta">' + star + esc(post.authorName || '') + ' \u00b7 ' + esc(where) + ' \u00b7 ' + esc(when) + '</p>' +
            body +
            '<div class="class-board-react">' + reactionButtons(post.id, post.reactions) + '</div>' +
            '<div class="class-board-foot">' +
            '<button type="button" class="btn btn-outline btn-small" data-replies="' + esc(post.id) + '">\u{1F4AC} ' + esc(String(post.replyCount || 0)) + '</button>' +
            (editing ? '' : quietActions('post', post.id, post.authorUserId, post.body, post.id)) +
            '</div>' +
            replies +
            '</article>';
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
            '<div class="class-board-react">' + reactionButtons(reply.id, reply.reactions) + '</div>' +
            (editing ? '' : quietActions('reply', reply.id, reply.authorUserId, reply.body, reply.postId)) +
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
            '<button type="button" class="btn btn-outline btn-small class-board-scope-btn' + staffOn + '" data-scope="staff">' + dot('staff', '') + esc(tr('boardStaff')) + '</button>';
    }

    function composeHtml() {
        const chips = state.tagged.map((row) => '<span class="class-board-chip">' + esc(row.name) + '</span>').join('');
        const hint = state.special && taggedFromText(state.compose).length === 0
            ? '<p class="class-board-hint">' + esc(tr('boardSpecialHint')) + '</p>'
            : '';
        const studentOptions = students().map((row) => '<option value="' + esc(row.id) + '">' + esc(row.name) + '</option>').join('');
        return '<textarea class="field-input class-board-compose-text" data-compose="1" placeholder="' + esc(tr('boardComposePlaceholder')) + '">' + esc(state.compose) + '</textarea>' +
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
                '<form class="class-board-compose" data-region="compose"></form>' +
                '<p class="class-board-status" data-region="status"></p>' +
                '<div data-region="list"></div>' +
                '</div>';
            bind(mount);
        }
        mount.querySelector('[data-region="scope"]').innerHTML = scopeHtml();
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
            if (target.dataset.more) {
                loadMore().catch((err) => {
                    state.error = err.message || tr('boardError');
                    paintStatus();
                });
            }
        });
        mount.addEventListener('change', (event) => {
            const target = event.target;
            if (target.dataset.pick) {
                state.scope = target.dataset.pick;
                state.ref = target.value;
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
        const base = state.scope === 'feed'
            ? '/calendars/' + encodeURIComponent(id) + '/board/feed?scope=mine'
            : '/calendars/' + encodeURIComponent(id) + '/board?kind=' + encodeURIComponent(state.scope) + '&ref=' + encodeURIComponent(state.ref || '');
        const body = await api(base + '&cursor=' + encodeURIComponent(state.nextCursor));
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
