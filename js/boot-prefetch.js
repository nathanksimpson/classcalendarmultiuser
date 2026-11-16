/**
 * Start the main page's startup API reads while the HTML is still parsing.
 *
 * Every authenticated API call costs ~150 ms of auth/D1 overhead on top of the network
 * round trip, and the app used to make its startup reads one after another (auth → teachers
 * → health → host-info → calendars → calendar → ui-prefs → meta). This script (loaded
 * without defer in <head> of index.html only) fires them in two parallel waves, long before
 * the deferred app scripts have downloaded:
 *
 *   wave 1: health, auth/me, calendars, teachers, host-info, me/ui-prefs
 *   wave 2 (needs auth/me + calendars to pick the calendar the app would pick):
 *           calendar document, meta, notification-meta, calendar ui-prefs
 *
 * Nothing here changes what the app does. The app's own functions (TeamAuth, CalendarSync)
 * call CCPBootPrefetch.take(key) once; a hit hands over this response, a miss (not
 * prefetched, already used, older than MAX_AGE_MS, or any non-2xx / network error) returns
 * null and the caller makes its normal request, so redirects, 401/403/404 handling and
 * error messages stay exactly as before. GET only, same endpoints and same headers.
 * Skipped in View As mode, which takes its own path.
 */
(function () {
    'use strict';

    var MAX_AGE_MS = 15000;
    var ACTIVE_PREFIX = 'teamCalendarActiveId:';
    var LEGACY_ACTIVE = 'teamCalendarActiveId';
    var entries = Object.create(null);
    var startedAt = Date.now();

    function inViewAs() {
        try {
            // A View As link (?viewAsExchange=…) switches identity during boot: never prefetch then.
            if (/[?&]viewAsExchange=/.test(location.search || '')) {
                return true;
            }
            return Boolean(sessionStorage.getItem('cal_view_as_session'));
        } catch (_) {
            return true;
        }
    }

    function get(path) {
        return fetch('/api' + path, { credentials: 'same-origin' }).then(
            function (res) {
                return res.text().then(function (text) {
                    var json = null;
                    if (text) {
                        try {
                            json = JSON.parse(text);
                        } catch (_) {
                            json = null;
                        }
                    }
                    return { ok: res.ok && json !== null, status: res.status, json: json };
                });
            },
            function () {
                return { ok: false, status: 0, json: null };
            }
        );
    }

    function start(key, path, reusable) {
        var promise = get(path);
        entries[key] = { promise: promise, reusable: Boolean(reusable), used: false };
        return promise;
    }

    function pickCalendarId(me, list) {
        if (!me || !me.id || !Array.isArray(list) || list.length === 0) {
            return null;
        }
        // Same choice as CCPSessionRestore.getActiveCalendarIdFromStorage + ensureActiveCalendarLoaded.
        var userId = me.viewAs && me.viewAs.active && me.viewAs.actorUserId
            ? String(me.viewAs.actorUserId)
            : String(me.id);
        var stored = null;
        try {
            stored = localStorage.getItem(ACTIVE_PREFIX + userId) || localStorage.getItem(LEGACY_ACTIVE);
        } catch (_) {
            stored = null;
        }
        var ok = stored && list.some(function (c) {
            return c && String(c.id) === String(stored);
        });
        return ok ? String(stored) : (list[0] && list[0].id ? String(list[0].id) : null);
    }

    var CCPBootPrefetch = {
        /** Hand over the prefetched JSON for key once (health may be shared). Null = do your own request. */
        take: function (key) {
            var entry = entries[key];
            if (!entry || (entry.used && !entry.reusable) || Date.now() - startedAt > MAX_AGE_MS) {
                return null;
            }
            entry.used = true;
            return entry.promise.then(function (r) {
                return r && r.ok ? r.json : null;
            });
        },
        /** Path the meta prefetch used (the caller only takes it when its own path is identical). */
        metaPathFor: function (calId) {
            return '/calendars/' + encodeURIComponent(calId) + '/meta';
        },
        /** For measuring and tests: which keys were started. */
        keys: function () {
            return Object.keys(entries);
        }
    };

    window.CCPBootPrefetch = CCPBootPrefetch;

    if (location.protocol === 'file:' || typeof fetch !== 'function' || inViewAs()) {
        return;
    }

    start('health', '/health', true);
    var meP = start('auth-me', '/auth/me');
    var listP = start('calendars', '/calendars');
    start('teachers', '/teachers');
    start('host-info', '/host-info');
    start('me-ui-prefs', '/me/ui-prefs');

    Promise.all([meP, listP]).then(function (results) {
        var me = results[0] && results[0].ok ? results[0].json : null;
        var list = results[1] && results[1].ok ? results[1].json : null;
        var calId = pickCalendarId(me, list);
        if (!calId) {
            return;
        }
        var enc = encodeURIComponent(calId);
        start('calendar:' + calId, '/calendars/' + enc);
        start('meta:' + calId, CCPBootPrefetch.metaPathFor(calId));
        start('notification-meta:' + calId, '/calendars/' + enc + '/notification-meta');
        start('ui-prefs:' + calId, '/calendars/' + enc + '/ui-prefs');
    });
})();
