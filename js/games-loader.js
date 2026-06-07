/**
 * Lazy-load easter egg games on first trigger interaction (lock button / Calendar tab).
 */
(function (global) {
    'use strict';

    const TRIGGER_CLICKS = 8;
    const SCRIPTS = {
        snake: 'js/snake-game.js?v=20260531-star',
        dino: 'js/dino-game.js?v=20260603-cleanup-review'
    };
    const CALENDAR_TAB_TRIGGER_IDS = ['tabBtn-calendar-teaching', 'tabBtn-calendar'];

    let lockClickStreak = 0;
    let calendarClickStreak = 0;
    let snakeLoadPromise = null;
    let dinoLoadPromise = null;

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const marker = src.split('?')[0];
            const existing = document.querySelector('script[data-cc-game-src="' + marker + '"]');
            if (existing) {
                if (existing.dataset.ccLoaded === '1') {
                    resolve();
                    return;
                }
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error('Failed to load ' + src)), {
                    once: true
                });
                return;
            }
            const s = document.createElement('script');
            s.src = src;
            s.defer = true;
            s.dataset.ccGameSrc = marker;
            s.addEventListener(
                'load',
                () => {
                    s.dataset.ccLoaded = '1';
                    resolve();
                },
                { once: true }
            );
            s.addEventListener('error', () => reject(new Error('Failed to load ' + src)), { once: true });
            document.head.appendChild(s);
        });
    }

    function ensureSnakeLoaded() {
        if (!snakeLoadPromise) {
            snakeLoadPromise = loadScript(SCRIPTS.snake);
        }
        return snakeLoadPromise;
    }

    function ensureDinoLoaded() {
        if (!dinoLoadPromise) {
            dinoLoadPromise = loadScript(SCRIPTS.dino);
        }
        return dinoLoadPromise;
    }

    function getLockButton() {
        return document.getElementById('teamLockStatusBtn');
    }

    function isLockClick(target) {
        const btn = getLockButton();
        return Boolean(btn && target && btn.contains(target));
    }

    function isCalendarTabClick(target) {
        if (!target || !target.closest) {
            return false;
        }
        return CALENDAR_TAB_TRIGGER_IDS.some((id) => {
            const el = document.getElementById(id);
            return el && el.contains(target);
        });
    }

    function resetLockStreak() {
        lockClickStreak = 0;
    }

    function resetCalendarStreak() {
        calendarClickStreak = 0;
    }

    async function tryOpenSnake(e) {
        ensureSnakeLoaded();
        lockClickStreak += 1;
        if (lockClickStreak < TRIGGER_CLICKS) {
            return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        lockClickStreak = 0;
        try {
            await ensureSnakeLoaded();
            if (global.CCPSnakeGame && typeof global.CCPSnakeGame.open === 'function') {
                global.CCPSnakeGame.open();
            }
        } catch (_err) {
            /* ignore */
        }
    }

    async function tryOpenDino(e) {
        ensureDinoLoaded();
        calendarClickStreak += 1;
        if (calendarClickStreak < TRIGGER_CLICKS) {
            return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        calendarClickStreak = 0;
        try {
            await ensureDinoLoaded();
            if (global.CCPDinoGame && typeof global.CCPDinoGame.open === 'function') {
                global.CCPDinoGame.open();
            }
        } catch (_err) {
            /* ignore */
        }
    }

    function onDocumentClick(e) {
        if (global.CCPSnakeGame && global.CCPSnakeGame.isOpen && global.CCPSnakeGame.isOpen()) {
            return;
        }
        if (global.CCPDinoGame && global.CCPDinoGame.isOpen && global.CCPDinoGame.isOpen()) {
            return;
        }
        if (isLockClick(e.target)) {
            void tryOpenSnake(e);
            return;
        }
        if (isCalendarTabClick(e.target)) {
            void tryOpenDino(e);
            return;
        }
        resetLockStreak();
        resetCalendarStreak();
    }

    function init() {
        document.addEventListener('click', onDocumentClick, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : globalThis);
