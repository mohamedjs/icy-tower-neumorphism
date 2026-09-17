/**
 * Icy Tower - Neumorphism Edition
 * High-performance, robust game engine with responsive keyboard and multi-touch controls.
 */
(function () {
    // Cross-browser safe rounded rect helper
    function drawRoundRect(ctx, x, y, width, height, radius) {
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, width, height, radius);
            return;
        }
        let r = typeof radius === 'number' ? radius : 8;
        if (width < 2 * r) r = width / 2;
        if (height < 2 * r) r = height / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y + width, y, r);
        ctx.closePath();
    }

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // DOM UI elements
    const scoreVal = document.getElementById('scoreVal');
    const floorVal = document.getElementById('floorVal');
    const bestVal = document.getElementById('bestVal');
    const comboBanner = document.getElementById('comboBanner');
    const comboText = document.getElementById('comboText');
    const comboScore = document.getElementById('comboScore');
    const gameOverModal = document.getElementById('gameOverModal');
    const startOverlay = document.getElementById('startOverlay');
    const finalScore = document.getElementById('finalScore');
    const finalFloor = document.getElementById('finalFloor');
    const finalBest = document.getElementById('finalBest');
    const restartBtn = document.getElementById('restartBtn');
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const soundBtn = document.getElementById('soundBtn');

    // Virtual dimensions
    const V_WIDTH = 480;
    const V_HEIGHT = 700;
    canvas.width = V_WIDTH;
    canvas.height = V_HEIGHT;

    // Game state: 'idle', 'playing', 'paused', 'gameover'
    let state = 'idle';
    let score = 0;
    let currentFloor = 0;
    let highestFloor = 0;
    let highScore = parseInt(localStorage.getItem('icy_tower_hs_v2') || '0', 10);
    bestVal.textContent = highScore;

    // Responsive Controls State
    const keys = {
        left: false,
        right: false,
        jump: false
    };

    // Jump buffer and coyote time for crisp game feel
    let jumpBuffer = 0;
    let coyoteTimer = 0;

    // Camera & Screen Shake
    let cameraY = 0;
    let autoScrollSpeed = 0;
    let gameStartTime = 0;
    let cameraStarted = false;
    let screenShake = 0;

    // Combo tracking
    let lastLandedFloor = 0;
    let comboTimeout = null;

    // Particles
    let particles = [];

    // Player Object
    const player = {
        x: V_WIDTH / 2 - 16,
        y: 580,
        w: 32,
        h: 46,
        vx: 0,
        vy: 0,
        ax: 0.74,
        friction: 0.86,
        maxSpeed: 8.8,
        turboSpeed: 12.5,
        runTimer: 0,
        gravity: 0.60,
        jumpStrength: -14.0,
        onGround: false,
        facing: 1, // 1 for right, -1 for left
        squashX: 1,
        squashY: 1,
        isSpinning: false,
        spinAngle: 0,
        walkFrame: 0,
        wallCooldown: 0,

        reset() {
            this.x = V_WIDTH / 2 - 16;
            this.y = 580;
            this.vx = 0;
            this.vy = 0;
            this.runTimer = 0;
            this.onGround = true;
            this.facing = 1;
            this.squashX = 1;
            this.squashY = 1;
            this.isSpinning = false;
            this.spinAngle = 0;
            this.walkFrame = 0;
            this.wallCooldown = 0;
        }
    };

    // Platforms
    let platforms = [];
    const PLATFORM_SPACING = 80;
    let nextPlatformFloor = 1;
    let nextPlatformY = 530;

    function initPlatforms() {
        platforms = [];
        // Base ground at floor 0
        platforms.push({
            floor: 0,
            x: 20,
            y: 630,
            w: V_WIDTH - 40,
            h: 24,
            type: 'ground'
        });

        // Pre-generate the first 20 platforms
        for (let i = 1; i <= 20; i++) {
            generateNextPlatform();
        }
    }

    function generateNextPlatform() {
        const floor = nextPlatformFloor++;
        const y = nextPlatformY;
        nextPlatformY -= PLATFORM_SPACING;

        // Platform width narrows gracefully as player climbs higher
        const minW = Math.max(70, 160 - Math.floor(floor / 12) * 6);
        const maxW = Math.max(90, 210 - Math.floor(floor / 12) * 6);
        const w = minW + Math.random() * (maxW - minW);

        const minX = 26;
        const maxX = V_WIDTH - w - 26;
        const x = minX + Math.random() * (maxX - minX);

        platforms.push({
            floor: floor,
            x: x,
            y: y,
            w: w,
            h: 18,
            type: floor % 10 === 0 ? 'milestone' : 'regular'
        });
    }

    function addParticles(x, y, count = 6, color = '#6366f1', speed = 2.5) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = (Math.random() * 0.8 + 0.2) * speed;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd - 1,
                alpha: 1,
                size: Math.random() * 4 + 2,
                color: color
            });
        }
    }

    function triggerComboBanner(text, points, tier = 1) {
        comboText.textContent = text;
        comboScore.textContent = `+${points} PTS`;
        comboBanner.classList.remove('hidden', 'pop-in');
        void comboBanner.offsetWidth; // trigger CSS reflow
        comboBanner.classList.add('pop-in');

        screenShake = Math.min(12, tier * 3);
        window.soundEngine.playCombo(tier);

        if (comboTimeout) clearTimeout(comboTimeout);
        comboTimeout = setTimeout(() => {
            comboBanner.classList.add('hidden');
        }, 1800);
    }

    function startGame() {
        state = 'playing';
        score = 0;
        currentFloor = 0;
        highestFloor = 0;
        scoreVal.textContent = '0';
        floorVal.textContent = '0';
        cameraY = 0;
        autoScrollSpeed = 0;
        cameraStarted = false;
        gameStartTime = Date.now();
        lastLandedFloor = 0;
        screenShake = 0;
        jumpBuffer = 0;
        coyoteTimer = 0;
        particles = [];
        nextPlatformFloor = 1;
        nextPlatformY = 530;

        player.reset();
        initPlatforms();

        if (startOverlay) startOverlay.classList.add('hidden');
        if (gameOverModal) gameOverModal.classList.add('hidden');
        if (comboBanner) comboBanner.classList.add('hidden');
    }

    function update() {
        if (state !== 'playing') return;

        // Screen shake decay
        if (screenShake > 0) screenShake *= 0.88;
        if (screenShake < 0.2) screenShake = 0;

        // Jump buffer and coyote timers
        if (jumpBuffer > 0) jumpBuffer--;

        if (player.onGround) {
            coyoteTimer = 6; // 6 frames grace (~100ms)
        } else if (coyoteTimer > 0) {
            coyoteTimer--;
        }

        // Dynamic rising screen clock
        const elapsedSec = (Date.now() - gameStartTime) / 1000;
        if (!cameraStarted && (highestFloor >= 5 || elapsedSec > 4)) {
            cameraStarted = true;
        }

        if (cameraStarted) {
            autoScrollSpeed = 0.85 + (highestFloor * 0.016);
            cameraY -= autoScrollSpeed;
        }

        // Horizontal Movement & Momentum
        if (keys.left && !keys.right) {
            player.facing = -1;
            player.runTimer++;
            const topSpd = player.runTimer > 18 ? player.turboSpeed : player.maxSpeed;
            player.vx -= player.ax;
            if (player.vx < -topSpd) player.vx = -topSpd;
            player.walkFrame += 0.25;
        } else if (keys.right && !keys.left) {
            player.facing = 1;
            player.runTimer++;
            const topSpd = player.runTimer > 18 ? player.turboSpeed : player.maxSpeed;
            player.vx += player.ax;
            if (player.vx > topSpd) player.vx = topSpd;
            player.walkFrame += 0.25;
        } else {
            player.runTimer = 0;
            player.vx *= player.friction;
            if (Math.abs(player.vx) < 0.1) player.vx = 0;
            player.walkFrame = 0;
        }

        // Jump Execution (Jump Buffering + Coyote Time for responsive feel)
        const wantsJump = keys.jump || jumpBuffer > 0;
        const canJump = (player.onGround || coyoteTimer > 0) && player.vy >= -2.0;

        if (wantsJump && canJump) {
            jumpBuffer = 0;
            coyoteTimer = 0;
            player.onGround = false;

            const speedRatio = Math.abs(player.vx) / player.maxSpeed;
            const extraBoost = speedRatio > 0.70 ? speedRatio * 5.4 : 0;
            const totalJump = player.jumpStrength - extraBoost;

            player.vy = totalJump;
            player.squashX = 0.7;
            player.squashY = 1.35;

            const isSuper = extraBoost > 2.8;
            if (isSuper) {
                player.isSpinning = true;
                player.spinAngle = 0;
                screenShake = 3;
            }

            window.soundEngine.playJump(isSuper);
            addParticles(player.x + player.w / 2, player.y + player.h, 8, isSuper ? '#38bdf8' : '#94a3b8');
        }

        // Super Jump spin animation
        if (player.isSpinning) {
            player.spinAngle += player.facing * 0.28;
            if (player.onGround || Math.abs(player.spinAngle) >= Math.PI * 2) {
                player.isSpinning = false;
                player.spinAngle = 0;
            }
        }

        // Gravity & Terminal Velocity
        player.vy += player.gravity;
        if (player.vy > 14) player.vy = 14;

        // Position Integration
        player.x += player.vx;
        player.y += player.vy;

        // Squash & Stretch Recovery
        player.squashX += (1 - player.squashX) * 0.16;
        player.squashY += (1 - player.squashY) * 0.16;

        // Wall Bounce (Classic Icy Tower signature mechanic)
        if (player.wallCooldown > 0) player.wallCooldown--;

        if (player.x <= 16) {
            player.x = 16;
            if (!player.onGround && player.wallCooldown === 0 && player.vx < -1.0) {
                player.vx = Math.abs(player.vx) * 1.14;
                player.vy = Math.min(player.vy, -8.5);
                player.facing = 1;
                player.wallCooldown = 10;
                screenShake = 4;
                window.soundEngine.playBounce();
                addParticles(player.x, player.y + player.h / 2, 10, '#38bdf8', 3.5);
            } else {
                player.vx = 0;
            }
        } else if (player.x + player.w >= V_WIDTH - 16) {
            player.x = V_WIDTH - 16 - player.w;
            if (!player.onGround && player.wallCooldown === 0 && player.vx > 1.0) {
                player.vx = -Math.abs(player.vx) * 1.14;
                player.vy = Math.min(player.vy, -8.5);
                player.facing = -1;
                player.wallCooldown = 10;
                screenShake = 4;
                window.soundEngine.playBounce();
                addParticles(player.x + player.w, player.y + player.h / 2, 10, '#38bdf8', 3.5);
            } else {
                player.vx = 0;
            }
        }

        // Platform Collisions (Landing when falling downwards)
        player.onGround = false;
        if (player.vy > 0) {
            for (let i = 0; i < platforms.length; i++) {
                const p = platforms[i];
                const prevY = player.y - player.vy;

                if (player.x + player.w > p.x && player.x < p.x + p.w) {
                    if (prevY + player.h <= p.y + 7 && player.y + player.h >= p.y) {
                        player.y = p.y - player.h;
                        player.vy = 0;
                        player.onGround = true;
                        player.isSpinning = false;
                        player.spinAngle = 0;
                        player.squashX = 1.3;
                        player.squashY = 0.7;
                        window.soundEngine.playLand();
                        addParticles(player.x + player.w / 2, p.y, 4, '#cbd5e1');

                        const landedFloor = p.floor;
                        if (landedFloor > currentFloor) {
                            const floorGain = landedFloor - currentFloor;
                            score += floorGain * 10;
                            currentFloor = landedFloor;
                            floorVal.textContent = currentFloor;

                            if (currentFloor > highestFloor) {
                                highestFloor = currentFloor;
                            }
                        }

                        // Combo check: Leap 2 or more floors in single jump!
                        const floorJumped = landedFloor - lastLandedFloor;
                        if (floorJumped >= 2 && lastLandedFloor > 0) {
                            let title = 'Good!';
                            let tier = 1;
                            if (floorJumped === 2) { title = 'Good!'; tier = 1; }
                            else if (floorJumped === 3) { title = 'Sweet!'; tier = 2; }
                            else if (floorJumped === 4) { title = 'Great!'; tier = 3; }
                            else if (floorJumped <= 6) { title = 'Super!'; tier = 4; }
                            else { title = 'AMAZING!'; tier = 5; }

                            const comboBonus = floorJumped * floorJumped * 18;
                            score += comboBonus;
                            triggerComboBanner(`${title} +${floorJumped}`, comboBonus, tier);
                        }
                        lastLandedFloor = landedFloor;
                        scoreVal.textContent = score;
                        break;
                    }
                }
            }
        }

        // Camera smoothly follows player upward
        const targetCameraY = player.y - 350;
        if (targetCameraY < cameraY) {
            cameraY += (targetCameraY - cameraY) * 0.14;
        }

        // Procedural generation of upcoming platforms
        while (nextPlatformY > cameraY - 250) {
            generateNextPlatform();
        }

        // Clean up distant platforms
        const bottomCutoff = cameraY + V_HEIGHT + 160;
        platforms = platforms.filter(p => p.y < bottomCutoff);

        // Update particle life
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.038;
            if (p.alpha <= 0) {
                particles.splice(i, 1);
            }
        }

        // Game Over trigger
        if (player.y > cameraY + V_HEIGHT + 25) {
            handleGameOver();
        }
    }

    function handleGameOver() {
        state = 'gameover';
        window.soundEngine.playGameOver();

        if (score > highScore) {
            highScore = score;
            localStorage.setItem('icy_tower_hs_v2', highScore.toString());
            bestVal.textContent = highScore;
        }

        finalScore.textContent = score;
        finalFloor.textContent = highestFloor;
        finalBest.textContent = highScore;
        gameOverModal.classList.remove('hidden');
    }

    // Render loop
    function draw() {
        ctx.clearRect(0, 0, V_WIDTH, V_HEIGHT);

        ctx.save();
        // Screen Shake
        if (screenShake > 0) {
            const sx = (Math.random() - 0.5) * screenShake * 2;
            const sy = (Math.random() - 0.5) * screenShake * 2;
            ctx.translate(sx, sy);
        }

        // Translate world coordinates
        ctx.translate(0, -cameraY);

        // Draw Tower Wall Rails
        drawTowerWalls();

        // Draw Platforms
        drawPlatforms();

        // Draw Particles
        drawParticles();

        // Draw Player Character
        drawPlayer();

        ctx.restore();
    }

    function drawTowerWalls() {
        const topY = cameraY - 60;
        const h = V_HEIGHT + 120;

        // Left Neumorphic Wall Rail
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(0, topY, 16, h);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(16, topY, 2, h);

        // Brick mortar patterns along left rail
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        for (let y = Math.floor(topY / 40) * 40; y < topY + h; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(16, y);
            ctx.stroke();
        }

        // Right Neumorphic Wall Rail
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(V_WIDTH - 18, topY, 2, h);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(V_WIDTH - 16, topY, 16, h);

        // Brick mortar on right rail
        for (let y = Math.floor(topY / 40) * 40 + 20; y < topY + h; y += 40) {
            ctx.beginPath();
            ctx.moveTo(V_WIDTH - 16, y);
            ctx.lineTo(V_WIDTH, y);
            ctx.stroke();
        }
    }

    function drawPlatforms() {
        for (let i = 0; i < platforms.length; i++) {
            const p = platforms[i];
            if (p.y < cameraY - 40 || p.y > cameraY + V_HEIGHT + 40) continue;

            const r = 8;

            // Neumorphic Drop Shadow
            ctx.shadowColor = 'rgba(163, 177, 198, 0.55)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 4;
            ctx.shadowOffsetY = 6;

            // Platform base
            ctx.fillStyle = p.type === 'milestone' ? '#e0e7ff' : '#e6ecf5';
            drawRoundRect(ctx, p.x, p.y, p.w, p.h, r);
            ctx.fill();

            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Frosted Snow Cap on Top Edge
            ctx.beginPath();
            ctx.moveTo(p.x + r, p.y + 1.5);
            ctx.lineTo(p.x + p.w - r, p.y + 1.5);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Bottom Shadow Bevel
            ctx.beginPath();
            ctx.moveTo(p.x + r, p.y + p.h - 1.5);
            ctx.lineTo(p.x + p.w - r, p.y + p.h - 1.5);
            ctx.strokeStyle = p.type === 'milestone' ? '#c7d2fe' : '#cbd5e1';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Milestone Badge
            if (p.type === 'milestone') {
                ctx.fillStyle = '#6366f1';
                ctx.beginPath();
                ctx.arc(p.x + 14, p.y + p.h / 2, 4.5, 0, Math.PI * 2);
                ctx.fill();
            }

            // Floor Label
            if (p.floor > 0) {
                ctx.fillStyle = p.type === 'milestone' ? '#4338ca' : '#94a3b8';
                ctx.font = 'bold 10px Outfit, system-ui, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(`FL ${p.floor}`, p.x + p.w - 10, p.y + p.h / 2 + 3.5);
            }
        }
    }

    function drawPlayer() {
        ctx.save();
        ctx.translate(player.x + player.w / 2, player.y + player.h / 2);

        // Rotation & Squash
        if (player.isSpinning) {
            ctx.rotate(player.spinAngle);
        }
        ctx.scale(player.facing * player.squashX, player.squashY);

        const pw = player.w;
        const ph = player.h;

        // Player Drop Shadow
        ctx.shadowColor = 'rgba(79, 70, 229, 0.3)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 5;

        // Body: Cool Winter Hoodie
        ctx.fillStyle = '#4f46e5';
        drawRoundRect(ctx, -pw / 2, -ph / 2 + 10, pw, ph - 16, 8);
        ctx.fill();

        ctx.shadowColor = 'transparent';

        // Winter Beanie (Cap)
        ctx.fillStyle = '#38bdf8';
        drawRoundRect(ctx, -pw / 2 - 1, -ph / 2, pw + 2, 14, 7);
        ctx.fill();

        // Beanie Pom-Pom
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, -ph / 2 - 3, 5, 0, Math.PI * 2);
        ctx.fill();

        // Face Visor
        ctx.fillStyle = '#f8fafc';
        drawRoundRect(ctx, -pw / 2 + 4, -ph / 2 + 12, pw - 8, 14, 5);
        ctx.fill();

        // Expressive Eyes (looking towards movement direction)
        const eyeOffset = player.facing > 0 ? 1 : -1;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-pw / 2 + 11 + eyeOffset, -ph / 2 + 18, 3, 0, Math.PI * 2);
        ctx.arc(-pw / 2 + 21 + eyeOffset, -ph / 2 + 18, 3, 0, Math.PI * 2);
        ctx.fill();

        // Eye Sparkle Highlights
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-pw / 2 + 12 + eyeOffset, -ph / 2 + 17, 1.2, 0, Math.PI * 2);
        ctx.arc(-pw / 2 + 22 + eyeOffset, -ph / 2 + 17, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Sneaker Boots with running step animation
        const legBob = player.onGround && Math.abs(player.vx) > 0.5 ? Math.sin(player.walkFrame) * 3 : 0;
        ctx.fillStyle = '#0284c7';
        drawRoundRect(ctx, -pw / 2 + 2, ph / 2 - 8 + legBob, 11, 7, 3);
        ctx.fill();
        drawRoundRect(ctx, pw / 2 - 13, ph / 2 - 8 - legBob, 11, 7, 3);
        ctx.fill();

        ctx.restore();
    }

    function drawParticles() {
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function gameLoop() {
        update();
        draw();
        requestAnimationFrame(gameLoop);
    }

    // ==========================================
    // KEYBOARD CONTROLS (Desktop & Laptop)
    // ==========================================
    function onKeyDown(e) {
        window.soundEngine.ensureContext();

        // Auto-start on any key
        if (state === 'idle') {
            startGame();
        } else if (state === 'gameover') {
            if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.code === 'Space' || e.code === 'Enter') {
                startGame();
                e.preventDefault();
                return;
            }
        }

        const k = e.key ? e.key.toLowerCase() : '';
        const c = e.code || '';

        // Left Movement: ArrowLeft or A
        if (c === 'ArrowLeft' || k === 'arrowleft' || c === 'KeyA' || k === 'a') {
            keys.left = true;
            e.preventDefault();
        }
        // Right Movement: ArrowRight or D
        else if (c === 'ArrowRight' || k === 'arrowright' || c === 'KeyD' || k === 'd') {
            keys.right = true;
            e.preventDefault();
        }
        // Up / Jump: ArrowUp, Space, or W
        else if (c === 'ArrowUp' || k === 'arrowup' || c === 'Space' || k === ' ' || c === 'KeyW' || k === 'w') {
            keys.jump = true;
            jumpBuffer = 10; // 10 frames buffer (~160ms)
            e.preventDefault();
        }
    }

    function onKeyUp(e) {
        const k = e.key ? e.key.toLowerCase() : '';
        const c = e.code || '';

        if (c === 'ArrowLeft' || k === 'arrowleft' || c === 'KeyA' || k === 'a') {
            keys.left = false;
        } else if (c === 'ArrowRight' || k === 'arrowright' || c === 'KeyD' || k === 'd') {
            keys.right = false;
        } else if (c === 'ArrowUp' || k === 'arrowup' || c === 'Space' || k === ' ' || c === 'KeyW' || k === 'w') {
            keys.jump = false;
        }
    }

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });

    // Release all keys if window loses focus
    window.addEventListener('blur', () => {
        keys.left = false;
        keys.right = false;
        keys.jump = false;
    });

    // ==========================================
    // TOUCH & POINTER CONTROLS (Mobile & Tablet)
    // ==========================================
    const btnLeft = document.getElementById('btnLeft');
    const btnRight = document.getElementById('btnRight');
    const btnJump = document.getElementById('btnJump');

    function attachButtonControls(el, keyName) {
        if (!el) return;

        // Pointer Events (Multi-touch robust tracking)
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            window.soundEngine.ensureContext();
            if (state === 'idle') startGame();
            try { el.setPointerCapture(e.pointerId); } catch (err) {}

            keys[keyName] = true;
            if (keyName === 'jump') jumpBuffer = 12;
            el.classList.add('active');
        }, { passive: false });

        el.addEventListener('pointerup', (e) => {
            e.preventDefault();
            try { el.releasePointerCapture(e.pointerId); } catch (err) {}
            keys[keyName] = false;
            el.classList.remove('active');
        }, { passive: false });

        el.addEventListener('pointercancel', (e) => {
            try { el.releasePointerCapture(e.pointerId); } catch (err) {}
            keys[keyName] = false;
            el.classList.remove('active');
        }, { passive: false });

        // Touch Fallback
        el.addEventListener('touchstart', (e) => {
            e.preventDefault();
            window.soundEngine.ensureContext();
            if (state === 'idle') startGame();
            keys[keyName] = true;
            if (keyName === 'jump') jumpBuffer = 12;
            el.classList.add('active');
        }, { passive: false });

        el.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys[keyName] = false;
            el.classList.remove('active');
        }, { passive: false });
    }

    attachButtonControls(btnLeft, 'left');
    attachButtonControls(btnRight, 'right');
    attachButtonControls(btnJump, 'jump');

    // Canvas Direct Touch / Swipe Area (Touch Left, Touch Right, Swipe Up for Jump)
    let touchStartY = 0;
    let canvasTouchActive = false;

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        window.soundEngine.ensureContext();
        if (state === 'idle') {
            startGame();
            return;
        }

        const rect = canvas.getBoundingClientRect();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const relativeX = (t.clientX - rect.left) / rect.width;
            const relativeY = (t.clientY - rect.top) / rect.height;
            touchStartY = t.clientY;

            // Touch left half -> move left, touch right half -> move right
            if (relativeX < 0.35) {
                keys.left = true;
                keys.right = false;
            } else if (relativeX > 0.65) {
                keys.right = true;
                keys.left = false;
            }

            // Tap top portion -> jump up
            if (relativeY < 0.45) {
                keys.jump = true;
                jumpBuffer = 12;
            }
        }
        canvasTouchActive = true;
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const relativeX = (t.clientX - rect.left) / rect.width;
            const deltaY = t.clientY - touchStartY;

            // Swipe Up -> trigger jump
            if (deltaY < -22) {
                keys.jump = true;
                jumpBuffer = 12;
            }

            if (relativeX < 0.4) {
                keys.left = true;
                keys.right = false;
            } else if (relativeX > 0.6) {
                keys.right = true;
                keys.left = false;
            } else {
                keys.left = false;
                keys.right = false;
            }
        }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        // If no touches remain on canvas, release keys
        if (e.touches.length === 0) {
            keys.left = false;
            keys.right = false;
            keys.jump = false;
            canvasTouchActive = false;
        }
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => {
        keys.left = false;
        keys.right = false;
        keys.jump = false;
        canvasTouchActive = false;
    });

    // UI Buttons
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            window.soundEngine.ensureContext();
            startGame();
        });
    }

    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            window.soundEngine.ensureContext();
            startGame();
        });
    }

    if (soundBtn) {
        soundBtn.addEventListener('click', () => {
            const enabled = window.soundEngine.toggle();
            soundBtn.innerHTML = enabled ? '🔊' : '🔇';
        });
    }

    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            if (state === 'playing') {
                state = 'paused';
                pauseBtn.innerHTML = '▶';
            } else if (state === 'paused') {
                state = 'playing';
                pauseBtn.innerHTML = '⏸';
            }
        });
    }

    // Initialize display & loop
    initPlatforms();
    requestAnimationFrame(gameLoop);
})();
