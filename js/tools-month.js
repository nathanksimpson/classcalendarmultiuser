/**
 * Shared month for the Tools zone (CCPToolsMonth).
 *
 * One month drives Essays, Debate Rec, Debate Books, Debate Teams and Debate Scores,
 * and stays put when the class or tab changes.
 *
 * Stored per viewer in appData.ui.toolsMonth:
 *   'YYYY-MM' → that month
 *   'all'     → All months (no month filter)
 *   missing   → the current month (first use)
 */
(function (global) {
    'use strict';

    const UI_KEY = 'toolsMonth';
    const ALL = 'all';
    const CHANGE_EVENT = 'ccp:toolsMonthChanged';
    const MONTH_RE = /^\d{4}-\d{2}$/;

    function getAppData(appData) {
        if (appData && typeof appData === 'object') {
            return appData;
        }
        return typeof global.appData !== 'undefined' && global.appData ? global.appData : {};
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function currentMonth(now) {
        const d = global.CCPClassroomDomain;
        if (!now && d && typeof d.todayISO === 'function') {
            const today = String(d.todayISO() || '');
            if (/^\d{4}-\d{2}/.test(today)) {
                return today.slice(0, 7);
            }
        }
        const date = now instanceof Date ? now : new Date();
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    }

    function isMonth(value) {
        return MONTH_RE.test(String(value || ''));
    }

    /** 'YYYY-MM', or '' for All months. */
    function get(appData) {
        const ui = getAppData(appData).ui || {};
        const raw = String(ui[UI_KEY] || '').trim();
        if (raw === ALL) {
            return '';
        }
        if (isMonth(raw)) {
            return raw;
        }
        return currentMonth();
    }

    function set(value, options) {
        const opts = options || {};
        const data = getAppData(opts.appData);
        if (!data.ui || typeof data.ui !== 'object') {
            data.ui = {};
        }
        const next = isMonth(value) ? String(value) : ALL;
        const previous = get(data);
        data.ui[UI_KEY] = next;
        if (typeof global.saveUiStateToLocalStorage === 'function') {
            try {
                global.saveUiStateToLocalStorage();
            } catch (_) {
                /* ignore */
            }
        }
        const month = next === ALL ? '' : next;
        if (month !== previous && typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
            try {
                global.dispatchEvent(
                    new global.CustomEvent(CHANGE_EVENT, {
                        detail: { month, previous, source: opts.source || 'set' }
                    })
                );
            } catch (_) {
                /* CustomEvent unavailable (tests) */
            }
        }
        return month !== previous;
    }

    /** Month `delta` months from `month` ('YYYY-MM'). */
    function shift(month, delta) {
        const base = isMonth(month) ? month : currentMonth();
        const [y, m] = base.split('-').map(Number);
        const index = y * 12 + (m - 1) + Number(delta || 0);
        return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
    }

    /** "Nov 2026" / "2026년 11월". */
    function label(month, lang) {
        if (!isMonth(month)) {
            return '';
        }
        const [y, m] = month.split('-').map(Number);
        if (String(lang || '').toLowerCase().startsWith('ko')) {
            return `${y}년 ${m}월`;
        }
        const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${names[m - 1]} ${y}`;
    }

    /** Nearest month in `months` to `month` (ties prefer the later month). '' when none. */
    function nearest(month, months) {
        const list = (Array.isArray(months) ? months : []).filter(isMonth);
        if (!list.length) {
            return '';
        }
        const toIndex = (v) => {
            const [y, m] = v.split('-').map(Number);
            return y * 12 + m;
        };
        const ref = toIndex(isMonth(month) ? month : currentMonth());
        let best = '';
        let bestDist = Infinity;
        list.forEach((candidate) => {
            const dist = Math.abs(toIndex(candidate) - ref);
            if (dist < bestDist || (dist === bestDist && candidate > best)) {
                best = candidate;
                bestDist = dist;
            }
        });
        return best;
    }

    function subscribe(fn) {
        if (typeof fn !== 'function' || typeof global.addEventListener !== 'function') {
            return () => {};
        }
        const handler = (e) => fn((e && e.detail) || {});
        global.addEventListener(CHANGE_EVENT, handler);
        return () => {
            if (typeof global.removeEventListener === 'function') {
                global.removeEventListener(CHANGE_EVENT, handler);
            }
        };
    }

    global.CCPToolsMonth = {
        UI_KEY,
        ALL,
        CHANGE_EVENT,
        currentMonth,
        isMonth,
        get,
        set,
        shift,
        label,
        nearest,
        subscribe
    };
})(typeof window !== 'undefined' ? window : globalThis);
