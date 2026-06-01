/**
 * Compact meeting-day toggles for setup board class cards (0=Sun … 6=Sat).
 */
(function (global) {
    const PRESETS = {
        mwf: [1, 3, 5],
        tth: [2, 4],
        mw: [1, 3],
        wf: [3, 5],
        mf: [1, 5]
    };

    function normalizeMeetingDaysArray(raw) {
        if (!Array.isArray(raw)) {
            return [];
        }
        const nums = raw
            .map((v) => parseInt(v, 10))
            .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6);
        return [...new Set(nums)].sort((a, b) => a - b);
    }

    function meetingDaysKey(days) {
        return normalizeMeetingDaysArray(days).join(',');
    }

    function formatMeetingDaysShort(days, t) {
        const norm = normalizeMeetingDaysArray(days);
        if (!norm.length) {
            return '—';
        }
        const short = t && t('dayNamesShort') ? t('dayNamesShort') : ['Su', 'M', 'T', 'W', 'T', 'F', 'Sa'];
        return norm.map((d) => (short[d] != null ? short[d] : String(d))).join(' ');
    }

    /**
     * @param {HTMLElement} mount
     * @param {object} options
     * @param {number[]} options.days
     * @param {boolean} [options.compact]
     * @param {boolean} [options.readOnly]
     * @param {function(number[]): void} [options.onChange]
     * @param {function(string): string} options.t
     */
    function renderCompactMeetingDays(mount, options) {
        if (!mount) {
            return;
        }
        const t = options.t || ((k) => k);
        const readOnly = !!options.readOnly;
        const compact = options.compact !== false;
        let days = normalizeMeetingDaysArray(options.days);

        mount.innerHTML = '';
        mount.className = 'meeting-days-compact' + (compact ? ' meeting-days-compact--chip' : '');

        const badge = document.createElement('span');
        badge.className = 'meeting-days-compact-badge';
        badge.textContent = formatMeetingDaysShort(days, t);
        mount.appendChild(badge);

        if (readOnly) {
            return;
        }

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn btn-outline btn-small meeting-days-compact-edit-btn';
        toggleBtn.textContent = t('setupBoardEditDays') || 'Days';
        mount.appendChild(toggleBtn);

        const pop = document.createElement('div');
        pop.className = 'meeting-days-compact-popover';
        pop.hidden = true;

        const presets = document.createElement('div');
        presets.className = 'meeting-days-compact-presets';
        [
            ['mwf', 'meetingDaysPresetMwf'],
            ['tth', 'meetingDaysPresetTt'],
            ['mw', 'meetingDaysPresetMw'],
            ['clear', 'meetingDaysPresetClear']
        ].forEach(([key, i18nKey]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-outline btn-small';
            b.textContent = t(i18nKey);
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                if (key === 'clear') {
                    days = [];
                } else {
                    days = PRESETS[key] ? PRESETS[key].slice() : [];
                }
                refreshRow();
                if (options.onChange) {
                    options.onChange(days.slice());
                }
            });
            presets.appendChild(b);
        });
        pop.appendChild(presets);

        const row = document.createElement('div');
        row.className = 'meeting-days-row meeting-days-compact-row';
        row.setAttribute('role', 'group');

        function refreshRow() {
            row.innerHTML = '';
            const short = t('dayNamesShort');
            for (let d = 0; d < 7; d += 1) {
                const label = document.createElement('label');
                label.className = 'meeting-day-chip';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = String(d);
                cb.checked = days.includes(d);
                cb.addEventListener('change', () => {
                    const set = new Set(days);
                    if (cb.checked) {
                        set.add(d);
                    } else {
                        set.delete(d);
                    }
                    days = [...set].sort((a, b) => a - b);
                    badge.textContent = formatMeetingDaysShort(days, t);
                    if (options.onChange) {
                        options.onChange(days.slice());
                    }
                });
                const span = document.createElement('span');
                span.className = 'meeting-day-chip-text';
                span.textContent = short[d] != null ? short[d] : String(d);
                label.appendChild(cb);
                label.appendChild(span);
                row.appendChild(label);
            }
            badge.textContent = formatMeetingDaysShort(days, t);
        }

        refreshRow();
        pop.appendChild(row);
        mount.appendChild(pop);

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            pop.hidden = !pop.hidden;
        });

        document.addEventListener('click', function closePop(ev) {
            if (!mount.contains(ev.target)) {
                pop.hidden = true;
            }
        });
    }

    global.CCPMeetingDaysControl = {
        normalizeMeetingDaysArray,
        meetingDaysKey,
        formatMeetingDaysShort,
        renderCompactMeetingDays,
        PRESETS
    };
})(typeof window !== 'undefined' ? window : globalThis);
