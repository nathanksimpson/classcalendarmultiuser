/**
 * Event date alerts for the notification bell.
 */
(function (global) {
    'use strict';

    function parseIsoDate(iso) {
        const m = String(iso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) {
            return null;
        }
        return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }

    function isoFromUtcDate(d) {
        const y = d.getUTCFullYear();
        const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${mo}-${day}`;
    }

    function addDaysIso(iso, delta) {
        const d = parseIsoDate(iso);
        if (!d) {
            return '';
        }
        d.setUTCDate(d.getUTCDate() + delta);
        return isoFromUtcDate(d);
    }

    function daysBetweenIso(fromIso, toIso) {
        const a = parseIsoDate(fromIso);
        const b = parseIsoDate(toIso);
        if (!a || !b) {
            return null;
        }
        return Math.round((b - a) / 86400000);
    }

    function getEventAnchorDate(ev) {
        if (!ev) {
            return '';
        }
        if (ev.isRange && ev.startDate) {
            return String(ev.startDate).trim();
        }
        return String(ev.date || ev.startDate || '').trim();
    }

    function clampNotifyLeadDays(n) {
        const v = Number(n);
        if (!Number.isFinite(v) || v < 0) {
            return 0;
        }
        return Math.min(30, Math.floor(v));
    }

    /**
     * @param {object[]} events
     * @param {string} todayIso YYYY-MM-DD
     * @param {{ getDisplayName?: (ev: object) => string }} [options]
     */
    function collectEventDateWarnings(events, todayIso, options) {
        const opts = options || {};
        const today = String(todayIso || '').trim();
        if (!today) {
            return [];
        }
        const list = Array.isArray(events) ? events : [];
        const warnings = [];
        const getDisplayName = typeof opts.getDisplayName === 'function'
            ? opts.getDisplayName
            : (ev) => (ev && ev.name) || '';

        list.forEach((raw) => {
            if (!raw || !raw.id || raw.notifyEnabled !== true) {
                return;
            }
            const anchor = getEventAnchorDate(raw);
            if (!anchor) {
                return;
            }
            const leadDays = clampNotifyLeadDays(raw.notifyLeadDays);
            const windowStart = addDaysIso(anchor, -leadDays);
            if (today < windowStart || today > anchor) {
                return;
            }
            const isToday = today === anchor;
            const daysUntil = daysBetweenIso(today, anchor);
            const idSuffix = isToday ? 'today' : 'alert';
            warnings.push({
                id: `event:${raw.id}:${idSuffix}`,
                tabId: 'events',
                severity: 'info',
                messageKey: isToday ? 'eventAlertToday' : 'eventAlertUpcoming',
                params: {
                    name: getDisplayName(raw),
                    date: anchor,
                    days: daysUntil != null ? String(daysUntil) : '0'
                },
                actionLabelKey: 'eventAlertGo',
                navigate: { type: 'event', eventId: raw.id }
            });
        });
        return warnings;
    }

    global.CCPEventDateWarnings = {
        collectEventDateWarnings,
        getEventAnchorDate,
        clampNotifyLeadDays,
        addDaysIso,
        daysBetweenIso
    };
})(typeof window !== 'undefined' ? window : globalThis);
