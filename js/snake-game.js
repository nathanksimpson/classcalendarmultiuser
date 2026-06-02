/**
 * Hidden snake game easter egg — 8 consecutive lock-button clicks opens the game.
 */
(function (global) {
    'use strict';

    const HIGH_SCORE_KEY = 'calendarSnakeHighScore';
    const TRIGGER_CLICKS = 8;
    const GRID_SIZE = 20;
    const CELL_SIZE = 18;
    const TICK_MS = 130;

    const DIRECTIONS = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        W: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        S: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        A: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
        D: { x: 1, y: 0 }
    };

    let lockClickStreak = 0;
    let overlay = null;
    let canvas = null;
    let ctx = null;
    let scoreEl = null;
    let highScoreEl = null;
    let statusEl = null;
    let rafId = null;
    let lastTick = 0;
    let paused = false;
    let gameOpen = false;

    let snake = [];
    let direction = { x: 1, y: 0 };
    let nextDirection = { x: 1, y: 0 };
    let food = { x: 0, y: 0 };
    let score = 0;
    let alive = true;

    function getHighScore() {
        try {
            const raw = localStorage.getItem(HIGH_SCORE_KEY);
            const n = parseInt(raw, 10);
            return Number.isFinite(n) && n >= 0 ? n : 0;
        } catch (_err) {
            return 0;
        }
    }

    function saveHighScore(value) {
        try {
            localStorage.setItem(HIGH_SCORE_KEY, String(value));
        } catch (_err) {
            /* ignore */
        }
    }

    function isTypingTarget(el) {
        if (!el) {
            return false;
        }
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    function getLockButton() {
        return document.getElementById('teamLockStatusBtn');
    }

    function isLockClick(target) {
        const btn = getLockButton();
        return Boolean(btn && target && btn.contains(target));
    }

    function resetStreak() {
        lockClickStreak = 0;
    }

    function ensureOverlay() {
        if (overlay) {
            return;
        }

        overlay = document.createElement('div');
        overlay.id = 'snakeGameOverlay';
        overlay.className = 'snake-game-overlay';
        overlay.hidden = true;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Shooting star game');

        overlay.innerHTML =
            '<div class="snake-game-panel">' +
            '  <div class="snake-game-header">' +
            '    <h2 class="snake-game-title">Shooting Star</h2>' +
            '    <button type="button" class="modal-close snake-game-close" aria-label="Close">&times;</button>' +
            '  </div>' +
            '  <div class="snake-game-hud">' +
            '    <span class="snake-game-score">Score: <strong id="snakeGameScore">0</strong></span>' +
            '    <span class="snake-game-high-score">Best: <strong id="snakeGameHighScore">0</strong></span>' +
            '  </div>' +
            '  <canvas id="snakeGameCanvas" class="snake-game-canvas" width="' +
            GRID_SIZE * CELL_SIZE +
            '" height="' +
            GRID_SIZE * CELL_SIZE +
            '"></canvas>' +
            '  <p id="snakeGameStatus" class="snake-game-status" role="status"></p>' +
            '  <p class="snake-game-hint">Arrow keys or WASD · Esc to close · Space to restart</p>' +
            '</div>';

        document.body.appendChild(overlay);

        canvas = overlay.querySelector('#snakeGameCanvas');
        ctx = canvas.getContext('2d');
        scoreEl = overlay.querySelector('#snakeGameScore');
        highScoreEl = overlay.querySelector('#snakeGameHighScore');
        statusEl = overlay.querySelector('#snakeGameStatus');

        overlay.querySelector('.snake-game-close').addEventListener('click', closeGame);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeGame();
            }
        });
    }

    function randomFoodPosition() {
        const occupied = new Set(snake.map((seg) => seg.x + ',' + seg.y));
        let x;
        let y;
        let attempts = 0;
        do {
            x = Math.floor(Math.random() * GRID_SIZE);
            y = Math.floor(Math.random() * GRID_SIZE);
            attempts++;
        } while (occupied.has(x + ',' + y) && attempts < GRID_SIZE * GRID_SIZE);
        food = { x, y };
    }

    function resetGameState() {
        const mid = Math.floor(GRID_SIZE / 2);
        snake = [
            { x: mid - 1, y: mid },
            { x: mid - 2, y: mid },
            { x: mid - 3, y: mid }
        ];
        direction = { x: 1, y: 0 };
        nextDirection = { x: 1, y: 0 };
        score = 0;
        alive = true;
        paused = false;
        randomFoodPosition();
        updateHud();
        if (statusEl) {
            statusEl.textContent = '';
        }
    }

    function updateHud() {
        if (scoreEl) {
            scoreEl.textContent = String(score);
        }
        if (highScoreEl) {
            highScoreEl.textContent = String(getHighScore());
        }
    }

    function getThemeColors() {
        const root = getComputedStyle(document.documentElement);
        const read = (name, fallback) => {
            const v = root.getPropertyValue(name).trim();
            return v || fallback;
        };
        return {
            bg: read('--bg-card', '#ffffff'),
            grid: read('--border-color', '#e2e8f0'),
            starCore: '#fef08a',
            starGlow: '#fbbf24',
            trailInner: read('--accent', '#60a5fa'),
            trailOuter: '#bfdbfe',
            food: read('--danger', '#dc2626'),
            text: read('--text-primary', '#0f172a')
        };
    }

    function cellCenter(seg) {
        return {
            cx: seg.x * CELL_SIZE + CELL_SIZE / 2,
            cy: seg.y * CELL_SIZE + CELL_SIZE / 2
        };
    }

    function drawFourPointStar(cx, cy, outerR, innerR, rotation, fill, stroke) {
        ctx.beginPath();
        for (let i = 0; i < 8; i += 1) {
            const r = i % 2 === 0 ? outerR : innerR;
            const a = rotation + (i * Math.PI) / 4;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    function drawShootingStar(colors) {
        if (!snake.length) {
            return;
        }

        const headPt = cellCenter(snake[0]);
        const travelAngle = Math.atan2(direction.y, direction.x);
        const tailPt = cellCenter(snake[snake.length - 1]);

        if (snake.length > 1) {
            const gradient = ctx.createLinearGradient(tailPt.cx, tailPt.cy, headPt.cx, headPt.cy);
            gradient.addColorStop(0, 'rgba(191, 219, 254, 0)');
            gradient.addColorStop(0.25, 'rgba(147, 197, 253, 0.25)');
            gradient.addColorStop(0.65, 'rgba(96, 165, 250, 0.7)');
            gradient.addColorStop(1, 'rgba(254, 240, 138, 0.95)');

            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = gradient;

            for (let i = snake.length - 1; i > 0; i -= 1) {
                const fade = 1 - i / snake.length;
                const from = cellCenter(snake[i]);
                const to = cellCenter(snake[i - 1]);
                ctx.globalAlpha = 0.2 + fade * 0.75;
                ctx.lineWidth = Math.max(2, CELL_SIZE * (0.12 + fade * 0.38));
                ctx.beginPath();
                ctx.moveTo(from.cx, from.cy);
                ctx.lineTo(to.cx, to.cy);
                ctx.stroke();
            }

            ctx.globalAlpha = 1;
            ctx.restore();
        }

        for (let i = 1; i < snake.length; i += 1) {
            const fade = 1 - i / snake.length;
            const pt = cellCenter(snake[i]);
            ctx.fillStyle = 'rgba(254, 240, 138, ' + (0.12 + fade * 0.55) + ')';
            ctx.beginPath();
            ctx.arc(pt.cx, pt.cy, 1 + fade * 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.save();
        ctx.shadowColor = colors.starGlow;
        ctx.shadowBlur = 14;
        drawFourPointStar(
            headPt.cx,
            headPt.cy,
            8,
            3.5,
            travelAngle + Math.PI / 4,
            colors.starCore,
            colors.starGlow
        );
        ctx.restore();

        ctx.fillStyle = '#fffbeb';
        ctx.beginPath();
        ctx.arc(headPt.cx, headPt.cy, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawCollectible(colors) {
        const pt = cellCenter(food);
        ctx.save();
        ctx.shadowColor = colors.food;
        ctx.shadowBlur = 8;
        ctx.fillStyle = colors.food;
        drawFourPointStar(pt.cx, pt.cy, 5, 2, Math.PI / 4, colors.food, null);
        ctx.restore();
    }

    function drawBoard() {
        if (!ctx) {
            return;
        }
        const colors = getThemeColors();
        const w = GRID_SIZE * CELL_SIZE;
        const h = GRID_SIZE * CELL_SIZE;

        ctx.fillStyle = colors.bg;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        for (let i = 0; i <= GRID_SIZE; i++) {
            const p = i * CELL_SIZE + 0.5;
            ctx.beginPath();
            ctx.moveTo(p, 0);
            ctx.lineTo(p, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, p);
            ctx.lineTo(w, p);
            ctx.stroke();
        }

        ctx.fillStyle = colors.food;
        drawCollectible(colors);

        drawShootingStar(colors);

        if (!alive) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = colors.text;
            ctx.font = '600 18px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Game over', w / 2, h / 2 - 12);
            ctx.font = '14px "DM Sans", system-ui, sans-serif';
            ctx.fillText('Space to restart', w / 2, h / 2 + 12);
        } else if (paused) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = colors.text;
            ctx.font = '600 16px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Paused', w / 2, h / 2);
        }
    }

    function isOpposite(dirA, dirB) {
        return dirA.x + dirB.x === 0 && dirA.y + dirB.y === 0;
    }

    function tick() {
        if (!alive || paused) {
            return;
        }

        direction = isOpposite(direction, nextDirection) ? direction : nextDirection;

        const head = snake[0];
        const newHead = {
            x: head.x + direction.x,
            y: head.y + direction.y
        };

        if (
            newHead.x < 0 ||
            newHead.y < 0 ||
            newHead.x >= GRID_SIZE ||
            newHead.y >= GRID_SIZE
        ) {
            alive = false;
            if (statusEl) {
                statusEl.textContent = 'You hit the wall.';
            }
            return;
        }

        if (snake.some((seg) => seg.x === newHead.x && seg.y === newHead.y)) {
            alive = false;
            if (statusEl) {
                statusEl.textContent = 'You ran into yourself.';
            }
            return;
        }

        snake.unshift(newHead);

        if (newHead.x === food.x && newHead.y === food.y) {
            score += 1;
            const best = getHighScore();
            if (score > best) {
                saveHighScore(score);
            }
            updateHud();
            randomFoodPosition();
        } else {
            snake.pop();
        }
    }

    function gameLoop(timestamp) {
        if (!gameOpen) {
            return;
        }
        rafId = global.requestAnimationFrame(gameLoop);
        if (timestamp - lastTick >= TICK_MS) {
            lastTick = timestamp;
            tick();
        }
        drawBoard();
    }

    function startLoop() {
        lastTick = 0;
        if (rafId) {
            global.cancelAnimationFrame(rafId);
        }
        rafId = global.requestAnimationFrame(gameLoop);
    }

    function stopLoop() {
        if (rafId) {
            global.cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    function openGame() {
        ensureOverlay();
        resetGameState();
        gameOpen = true;
        overlay.hidden = false;
        document.body.classList.add('snake-game-open');
        startLoop();
        overlay.querySelector('.snake-game-close').focus();
    }

    function closeGame() {
        if (!overlay) {
            return;
        }
        gameOpen = false;
        stopLoop();
        overlay.hidden = true;
        document.body.classList.remove('snake-game-open');
        resetStreak();
    }

    function handleDirectionKey(key) {
        const dir = DIRECTIONS[key];
        if (!dir) {
            return false;
        }
        if (isOpposite(direction, dir)) {
            return true;
        }
        nextDirection = { x: dir.x, y: dir.y };
        return true;
    }

    function onDocumentClick(e) {
        if (gameOpen) {
            return;
        }
        if (isLockClick(e.target)) {
            lockClickStreak += 1;
            if (lockClickStreak >= TRIGGER_CLICKS) {
                e.preventDefault();
                e.stopImmediatePropagation();
                lockClickStreak = 0;
                openGame();
            }
            return;
        }
        resetStreak();
    }

    function onDocumentKeydown(e) {
        if (isTypingTarget(document.activeElement)) {
            return;
        }
        if (gameOpen) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeGame();
                return;
            }
            if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                if (!alive) {
                    resetGameState();
                    startLoop();
                }
                return;
            }
            if (handleDirectionKey(e.key)) {
                e.preventDefault();
            }
            return;
        }
    }

    function onVisibilityChange() {
        if (!gameOpen) {
            return;
        }
        paused = document.hidden;
    }

    function init() {
        document.addEventListener('click', onDocumentClick, true);
        document.addEventListener('keydown', onDocumentKeydown, true);
        document.addEventListener('visibilitychange', onVisibilityChange);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.CCPSnakeGame = {
        open: openGame,
        close: closeGame,
        getHighScore
    };
})(typeof window !== 'undefined' ? window : globalThis);
