/**
 * Hidden dinosaur runner easter egg — 8 consecutive Calendar tab clicks opens the game.
 */
(function (global) {
    'use strict';

    const HIGH_SCORE_KEY = 'calendarDinoHighScore';
    const TRIGGER_CLICKS = 8;
    const CANVAS_W = 560;
    const CANVAS_H = 140;
    const GROUND_Y = 118;
    const DINO_X = 44;
    const GRAVITY = 0.62;
    const JUMP_VELOCITY = -11.5;
    const INITIAL_SPEED = 2.8;
    const MAX_SPEED = 14;
    const MIN_SPAWN_GAP = 320;
    const MAX_SPAWN_GAP = 480;
    const BIRD_MIN_SCORE = 180;

    let calendarClickStreak = 0;
    let overlay = null;
    let canvas = null;
    let ctx = null;
    let scoreEl = null;
    let highScoreEl = null;
    let statusEl = null;
    let rafId = null;
    let gameOpen = false;
    let paused = false;
    let audioCtx = null;

    let dinoY = GROUND_Y;
    let dinoVy = 0;
    let ducking = false;
    let onGround = true;
    let legFrame = 0;
    let speed = INITIAL_SPEED;
    let distance = 0;
    let score = 0;
    let alive = true;
    let obstacles = [];
    let nextSpawnIn = 0;
    let animTick = 0;

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

    function getCalendarButton() {
        return document.getElementById('tabBtn-calendar');
    }

    function isCalendarClick(target) {
        const btn = getCalendarButton();
        return Boolean(btn && target && btn.contains(target));
    }

    function resetStreak() {
        calendarClickStreak = 0;
    }

    function ensureAudio() {
        if (audioCtx) {
            return audioCtx;
        }
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) {
            return null;
        }
        audioCtx = new Ctx();
        return audioCtx;
    }

    async function resumeAudio() {
        const ctx = ensureAudio();
        if (ctx && ctx.state === 'suspended') {
            try {
                await ctx.resume();
            } catch (_err) {
                /* ignore */
            }
        }
        return ctx;
    }

    function playJumpSound() {
        const ctx = ensureAudio();
        if (!ctx) {
            return;
        }
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.08);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
    }

    function playDieSound() {
        const ctx = ensureAudio();
        if (!ctx) {
            return;
        }
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.45);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.52);

        const click = ctx.createOscillator();
        const clickGain = ctx.createGain();
        click.type = 'square';
        click.frequency.setValueAtTime(90, t);
        click.frequency.exponentialRampToValueAtTime(30, t + 0.12);
        clickGain.gain.setValueAtTime(0.0001, t);
        clickGain.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        click.connect(clickGain);
        clickGain.connect(ctx.destination);
        click.start(t);
        click.stop(t + 0.15);
    }

    function ensureOverlay() {
        if (overlay) {
            return;
        }

        overlay = document.createElement('div');
        overlay.id = 'dinoGameOverlay';
        overlay.className = 'dino-game-overlay';
        overlay.hidden = true;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Dinosaur runner game');

        overlay.innerHTML =
            '<div class="dino-game-panel">' +
            '  <div class="dino-game-header">' +
            '    <h2 class="dino-game-title">Dino Run</h2>' +
            '    <button type="button" class="modal-close dino-game-close" aria-label="Close">&times;</button>' +
            '  </div>' +
            '  <div class="dino-game-hud">' +
            '    <span class="dino-game-score">Score: <strong id="dinoGameScore">0</strong></span>' +
            '    <span class="dino-game-high-score">Best: <strong id="dinoGameHighScore">0</strong></span>' +
            '  </div>' +
            '  <canvas id="dinoGameCanvas" class="dino-game-canvas" width="' +
            CANVAS_W +
            '" height="' +
            CANVAS_H +
            '"></canvas>' +
            '  <p id="dinoGameStatus" class="dino-game-status" role="status"></p>' +
            '  <p class="dino-game-hint">Space or Up to jump · Down to duck · Esc to close</p>' +
            '</div>';

        document.body.appendChild(overlay);

        canvas = overlay.querySelector('#dinoGameCanvas');
        ctx = canvas.getContext('2d');
        scoreEl = overlay.querySelector('#dinoGameScore');
        highScoreEl = overlay.querySelector('#dinoGameHighScore');
        statusEl = overlay.querySelector('#dinoGameStatus');

        overlay.querySelector('.dino-game-close').addEventListener('click', closeGame);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeGame();
            }
        });
    }

    function randomSpawnGap() {
        return MIN_SPAWN_GAP + Math.floor(Math.random() * (MAX_SPAWN_GAP - MIN_SPAWN_GAP));
    }

    function spawnObstacle() {
        const canSpawnBird = score >= BIRD_MIN_SCORE && Math.random() < 0.38;
        if (canSpawnBird) {
            const highBird = Math.random() < 0.5;
            obstacles.push({
                x: CANVAS_W + 24,
                type: 'bird',
                y: highBird ? GROUND_Y - 52 : GROUND_Y - 28
            });
        } else {
            const tall = Math.random() < 0.55;
            const wide = Math.random() < 0.35;
            obstacles.push({
                x: CANVAS_W + 20,
                type: 'cactus',
                tall,
                wide
            });
        }
        nextSpawnIn = randomSpawnGap();
    }

    function resetGameState() {
        dinoY = GROUND_Y;
        dinoVy = 0;
        ducking = false;
        onGround = true;
        legFrame = 0;
        speed = INITIAL_SPEED;
        distance = 0;
        score = 0;
        alive = true;
        paused = false;
        obstacles = [];
        nextSpawnIn = randomSpawnGap();
        animTick = 0;
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

    function updateSpeed() {
        const ramp = Math.min(1, distance / 14000);
        speed = INITIAL_SPEED + (MAX_SPEED - INITIAL_SPEED) * ramp;
    }

    function getThemeColors() {
        const root = getComputedStyle(document.documentElement);
        const read = (name, fallback) => {
            const v = root.getPropertyValue(name).trim();
            return v || fallback;
        };
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return {
            sky: isDark ? '#1e293b' : '#f8fafc',
            ground: isDark ? '#475569' : '#cbd5e1',
            groundLine: isDark ? '#94a3b8' : '#64748b',
            dino: isDark ? '#e2e8f0' : '#334155',
            cactus: isDark ? '#4ade80' : '#15803d',
            bird: isDark ? '#94a3b8' : '#475569',
            text: read('--text-primary', '#0f172a')
        };
    }

    function dinoHitbox() {
        if (ducking) {
            return { x: DINO_X - 16, y: GROUND_Y - 18, w: 34, h: 18 };
        }
        return { x: DINO_X - 14, y: dinoY - 42, w: 30, h: 42 };
    }

    function obstacleHitbox(obs) {
        if (obs.type === 'bird') {
            return { x: obs.x - 14, y: obs.y - 8, w: 28, h: 16 };
        }
        const baseY = GROUND_Y;
        if (obs.wide) {
            return { x: obs.x - 8, y: baseY - (obs.tall ? 44 : 32), w: 28, h: obs.tall ? 44 : 32 };
        }
        return { x: obs.x - 5, y: baseY - (obs.tall ? 44 : 28), w: 12, h: obs.tall ? 44 : 28 };
    }

    function boxesOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function drawGround(colors) {
        ctx.fillStyle = colors.ground;
        ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);
        ctx.strokeStyle = colors.groundLine;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, GROUND_Y + 0.5);
        ctx.lineTo(CANVAS_W, GROUND_Y + 0.5);
        ctx.stroke();
    }

    function drawDino(colors) {
        ctx.fillStyle = colors.dino;
        const x = DINO_X;
        const y = ducking ? GROUND_Y - 18 : dinoY;

        if (ducking) {
            ctx.fillRect(x - 16, y, 34, 14);
            ctx.fillRect(x + 10, y - 8, 14, 10);
            ctx.fillRect(x - 20, y + 10, 8, 4);
            ctx.fillRect(x + 6, y + 12, 6, 4);
            return;
        }

        ctx.fillRect(x - 10, y - 28, 22, 24);
        ctx.fillRect(x + 8, y - 38, 16, 14);
        ctx.fillRect(x + 18, y - 34, 8, 6);
        ctx.fillRect(x - 18, y - 18, 10, 8);
        ctx.fillRect(x - 4, y - 6, 8, 6);

        const legUp = Math.floor(legFrame / 6) % 2 === 0;
        ctx.fillRect(x - 6, y, 6, legUp ? 8 : 6);
        ctx.fillRect(x + 2, y, 6, legUp ? 6 : 8);
    }

    function drawCactus(obs, colors) {
        ctx.fillStyle = colors.cactus;
        const baseY = GROUND_Y;
        const h = obs.tall ? 44 : obs.wide ? 32 : 28;

        if (obs.wide) {
            ctx.fillRect(obs.x - 4, baseY - h, 8, h);
            ctx.fillRect(obs.x + 6, baseY - h + 6, 8, h - 6);
            ctx.fillRect(obs.x - 10, baseY - h + 14, 6, 4);
            ctx.fillRect(obs.x + 12, baseY - h + 18, 6, 4);
            return;
        }

        ctx.fillRect(obs.x - 3, baseY - h, 6, h);
        ctx.fillRect(obs.x - 9, baseY - h + 10, 6, 4);
        ctx.fillRect(obs.x + 3, baseY - h + 16, 6, 4);
    }

    function drawBird(obs, colors) {
        ctx.fillStyle = colors.bird;
        const x = obs.x;
        const y = obs.y;
        const wingUp = Math.floor(animTick / 8) % 2 === 0;
        const wingOffset = wingUp ? -4 : 4;

        ctx.fillRect(x - 10, y - 2, 18, 4);
        ctx.fillRect(x + 6, y - 4, 8, 8);
        ctx.beginPath();
        ctx.moveTo(x - 12, y);
        ctx.lineTo(x - 18, y + wingOffset);
        ctx.lineTo(x - 8, y + 2);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 2, y);
        ctx.lineTo(x - 4, y + wingOffset);
        ctx.lineTo(x + 4, y + 2);
        ctx.closePath();
        ctx.fill();
    }

    function drawObstacle(obs, colors) {
        if (obs.type === 'bird') {
            drawBird(obs, colors);
        } else {
            drawCactus(obs, colors);
        }
    }

    function drawBoard() {
        if (!ctx) {
            return;
        }
        const colors = getThemeColors();

        ctx.fillStyle = colors.sky;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        drawGround(colors);

        obstacles.forEach((obs) => drawObstacle(obs, colors));
        drawDino(colors);

        if (!alive) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
            ctx.fillStyle = colors.text;
            ctx.font = '600 18px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Game over', CANVAS_W / 2, CANVAS_H / 2 - 12);
            ctx.font = '14px "DM Sans", system-ui, sans-serif';
            ctx.fillText('Space to restart', CANVAS_W / 2, CANVAS_H / 2 + 12);
        } else if (paused) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
            ctx.fillStyle = colors.text;
            ctx.font = '600 16px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Paused', CANVAS_W / 2, CANVAS_H / 2);
        }
    }

    function die(message) {
        if (!alive) {
            return;
        }
        alive = false;
        const best = getHighScore();
        if (score > best) {
            saveHighScore(score);
        }
        updateHud();
        playDieSound();
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    function tick() {
        if (!alive || paused) {
            return;
        }

        animTick += 1;
        if (onGround) {
            legFrame += 1;
        }

        dinoVy += GRAVITY;
        dinoY += dinoVy;
        if (dinoY >= GROUND_Y) {
            dinoY = GROUND_Y;
            dinoVy = 0;
            onGround = true;
        } else {
            onGround = false;
        }

        distance += speed;
        score = Math.floor(distance / 12);
        updateSpeed();

        nextSpawnIn -= speed;
        if (nextSpawnIn <= 0) {
            spawnObstacle();
        }

        obstacles.forEach((obs) => {
            obs.x -= speed;
        });
        obstacles = obstacles.filter((obs) => obs.x > -40);

        const dinoBox = dinoHitbox();
        for (let i = 0; i < obstacles.length; i += 1) {
            if (boxesOverlap(dinoBox, obstacleHitbox(obstacles[i]))) {
                const msg =
                    obstacles[i].type === 'bird'
                        ? 'Bonk! A bird got you.'
                        : 'Bonk! You hit a cactus.';
                die(msg);
                break;
            }
        }

        if (alive && scoreEl) {
            scoreEl.textContent = String(score);
        }
    }

    function gameLoop() {
        if (!gameOpen) {
            return;
        }
        rafId = global.requestAnimationFrame(gameLoop);
        tick();
        drawBoard();
    }

    function startLoop() {
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

    function jump() {
        if (!alive || paused) {
            return;
        }
        if (onGround && !ducking) {
            dinoVy = JUMP_VELOCITY;
            onGround = false;
            playJumpSound();
        }
    }

    function setDucking(on) {
        if (!alive || paused || !onGround) {
            return;
        }
        ducking = on;
    }

    function openGame() {
        ensureOverlay();
        resetGameState();
        resumeAudio();
        gameOpen = true;
        overlay.hidden = false;
        document.body.classList.add('dino-game-open');
        startLoop();
        overlay.querySelector('.dino-game-close').focus();
    }

    function closeGame() {
        if (!overlay) {
            return;
        }
        gameOpen = false;
        stopLoop();
        overlay.hidden = true;
        document.body.classList.remove('dino-game-open');
        ducking = false;
        resetStreak();
    }

    function onDocumentClick(e) {
        if (gameOpen) {
            return;
        }
        if (isCalendarClick(e.target)) {
            calendarClickStreak += 1;
            if (calendarClickStreak >= TRIGGER_CLICKS) {
                e.preventDefault();
                e.stopImmediatePropagation();
                calendarClickStreak = 0;
                openGame();
            }
            return;
        }
        resetStreak();
    }

    function onDocumentKeydown(e) {
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
                } else {
                    jump();
                }
                return;
            }
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                e.preventDefault();
                jump();
                return;
            }
            if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
                e.preventDefault();
                setDucking(true);
                return;
            }
            return;
        }

        if (isTypingTarget(document.activeElement)) {
            return;
        }
    }

    function onDocumentKeyup(e) {
        if (!gameOpen || !alive) {
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            ducking = false;
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
        document.addEventListener('keyup', onDocumentKeyup, true);
        document.addEventListener('visibilitychange', onVisibilityChange);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.CCPDinoGame = {
        open: openGame,
        close: closeGame,
        getHighScore
    };
})(typeof window !== 'undefined' ? window : globalThis);
