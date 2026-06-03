const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hud = document.getElementById('hud');
const startMenu = document.getElementById('startMenu');
const gameOverMenu = document.getElementById('gameOverMenu');
const uiGold = document.getElementById('goldText');
const uiDist = document.getElementById('distText');
const uiHpBar = document.getElementById('hpBar');
const uiHpText = document.getElementById('hpText');
const goReason = document.getElementById('gameOverReason');
const goStats = document.getElementById('finalStats');

// PARÁMETROS 3D AJUSTABLES DINÁMICAMENTE POR TAMAÑO DE LIENZO
const FOV = 280;
const CAMERA_Y = -120;
let HORIZON_Y = canvas.height * 0.45;
let CENTER_X = canvas.width / 2;
const LANE_SPACING = 60;
const LANES_X = [-LANE_SPACING, 0, LANE_SPACING];

const TARGET_GOLD = 15;
const MAX_DISTANCE = 2500;

let currentState = 'MENU';
let globalSpeed = 16;
let distanceTraveled = 0;
let goldCollected = 0;
let frameCount = 0;
let currentLane = 1;
let entities = [];
let player = null;

let screenShake = 0;
let damageFlashTime = 0;
let particles = [];

// --- RE-ESCALADO DINÁMICO DEL CANVAS INTERNO ---
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    CENTER_X = canvas.width / 2;
    HORIZON_Y = canvas.height * 0.45;
}
window.addEventListener('resize', resizeCanvas);

// --- MOTOR DE GESTOS (SWIPE DETECTION) ---
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 40; // Sensibilidad del deslizamiento en píxeles

window.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

window.addEventListener('touchend', e => {
    if (currentState !== 'PLAYING') return;

    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Determinar eje dominante del gesto
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Movimiento Horizontal
        if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
            if (deltaX > 0 && currentLane < 2) {
                currentLane++; triggerLaneChangeParticles();
            } else if (deltaX < 0 && currentLane > 0) {
                currentLane--; triggerLaneChangeParticles();
            }
        }
    } else {
        // Movimiento Vertical
        if (Math.abs(deltaY) > SWIPE_THRESHOLD && deltaY < 0) {
            if (!player.isJumping) player.jump();
        }
    }
}, { passive: true });

// --- ENTRADAS PC ---
window.addEventListener('keydown', e => {
    if (currentState !== 'PLAYING') return;
    if ((e.code === 'KeyA' || e.code === 'ArrowLeft') && currentLane > 0) {
        currentLane--; triggerLaneChangeParticles();
    }
    if ((e.code === 'KeyD' || e.code === 'ArrowRight') && currentLane < 2) {
        currentLane++; triggerLaneChangeParticles();
    }
    if ((e.code === 'Space' || e.code === 'ArrowUp') && !player.isJumping) player.jump();
});

function triggerLaneChangeParticles() {
    if (!player) return;
    createExplosion(player.x, player.y, player.z, 'rgba(0, 240, 255, 0.5)', 5);
}

// --- MOTOR GRÁFICO 3D ---
class Particle3D {
    constructor(x, y, z, vx, vy, vz, color, size, lifetime, type = 'spark') {
        this.x = x; this.y = y; this.z = z;
        this.vx = vx; this.vy = vy; this.vz = vz;
        this.color = color; this.baseSize = size;
        this.lifetime = lifetime; this.maxLifetime = lifetime; this.type = type;
    }
    update() {
        this.x += this.vx; this.y += this.vy; this.z += this.vz;
        if (this.type === 'dust') {
            this.z -= (currentState === 'MENU') ? 4 : globalSpeed;
            if (this.z < 20) {
                this.z = 2500 + Math.random() * 500;
                this.x = (Math.random() - 0.5) * 800;
                this.y = -100 - Math.random() * 300;
            }
        } else { this.lifetime--; }
    }
    draw() {
        const p = project(this.x, this.y, this.z);
        if (p.scale === 0) return;
        const s = this.baseSize * p.scale;
        let alpha = this.type === 'dust' ? Math.min(1, (this.z - 20) / 400) * 0.3 : (this.lifetime / this.maxLifetime);
        ctx.fillStyle = this.color; ctx.globalAlpha = Math.max(0, alpha);
        ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

function initAtmosphericDust() {
    particles = [];
    for (let i = 0; i < 60; i++) {
        particles.push(new Particle3D((Math.random() - 0.5) * 1000, -50 - Math.random() * 400, Math.random() * 2500, 0, 0, 0, 'rgba(0, 240, 255, 0.35)', 1.5, 9999, 'dust'));
    }
}

function createExplosion(x, y, z, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2; const speed = 5 + Math.random() * 10;
        particles.push(new Particle3D(x, y, z, Math.cos(angle) * speed, (Math.random() - 0.7) * speed, (Math.random() - 0.5) * 15, color, 2 + Math.random() * 3, 30 + Math.random() * 20, 'spark'));
    }
}

function project(x, y, z) {
    if (z <= 0) return { scale: 0, x: 0, y: 0 };
    const scale = (FOV * (canvas.width / 600)) / z; // Escala adaptada al ancho real del canvas
    return { x: CENTER_X + (x * scale), y: HORIZON_Y + ((y - CAMERA_Y) * scale), scale: scale };
}

class Miner {
    constructor() {
        this.x = LANES_X[currentLane]; this.y = 0; this.z = 100; this.radius = 14; this.lerpFactor = 0.22;
        this.isJumping = false; this.vy = 0; this.gravity = 1.1; this.jumpStrength = -17;
        this.maxHp = 100; this.hp = 100; this.iFrames = 0; this.tilt = 0; this.bobAngle = 0;
        this.scaleX = 1; this.scaleY = 1; this.updateHpUI();
    }
    jump() { this.isJumping = true; this.vy = this.jumpStrength; this.scaleY = 0.7; this.scaleX = 1.3; }
    update() {
        const prevX = this.x; this.x = this.x + (LANES_X[currentLane] - this.x) * this.lerpFactor;
        this.tilt = (this.x - prevX) * 0.15;
        if (this.isJumping) {
            this.vy += this.gravity; this.y += this.vy;
            if (this.y >= 0) {
                this.y = 0; this.isJumping = false; this.vy = 0; this.scaleY = 0.6; this.scaleX = 1.4;
                screenShake = Math.max(screenShake, 5); createExplosion(this.x, 0, this.z, '#6c8fa8', 6);
            }
        } else { this.bobAngle += globalSpeed * 0.015; }
        this.scaleX += (1 - this.scaleX) * 0.15; this.scaleY += (1 - this.scaleY) * 0.15;
        if (this.iFrames > 0) this.iFrames--;
    }
    takeDamage(amount) {
        if (this.iFrames > 0) return;
        this.hp = Math.max(0, this.hp - amount); this.iFrames = 40; this.updateHpUI();
        screenShake = 22; damageFlashTime = 12; createExplosion(this.x, this.y - 15, this.z, '#ff3c3c', 25);
        if (this.hp <= 0) endGame("COLAPSO DEL NANOTRAJE Y SOPORTE VITAL", "#ff3c3c");
    }
    updateHpUI() {
        const ratio = this.hp / this.maxHp; uiHpBar.style.width = (ratio * 100) + '%';
        uiHpText.innerText = Math.floor(ratio * 100) + '%'; uiHpBar.style.backgroundPosition = `${(1 - ratio) * 100}% center`;
    }
    draw() {
        if (this.iFrames > 0 && Math.floor(frameCount / 3) % 2 === 0) return;
        const p = project(this.x, this.y, this.z); if (p.scale === 0) return;
        const s = p.scale; const r = this.radius * s; const currentBob = this.isJumping ? 0 : Math.sin(this.bobAngle) * 3 * s;

        ctx.save(); ctx.translate(p.x, p.y + currentBob); ctx.rotate(this.tilt); ctx.scale(this.scaleX, this.scaleY);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.beginPath();
        const shadowRadius = Math.max(5, r * (1 - Math.abs(this.y) / 250));
        ctx.ellipse(0, -this.y * s - currentBob, shadowRadius, shadowRadius * 0.4, 0, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#0f172a'; ctx.fillRect(-6 * s, -10 * s, 4 * s, 10 * s); ctx.fillRect(2 * s, -10 * s, 4 * s, 10 * s);
        ctx.fillStyle = '#ff6b00'; ctx.fillRect(-6 * s, -6 * s, 4 * s, 3 * s); ctx.fillRect(2 * s, -6 * s, 4 * s, 3 * s);
        ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.roundRect(-10 * s, -28 * s, 20 * s, 18 * s, 4 * s); ctx.fill();
        ctx.fillStyle = '#ff6b00'; ctx.fillRect(-8 * s, -25 * s, 16 * s, 5 * s);
        ctx.fillStyle = '#00f0ff'; ctx.fillRect(-7 * s, -28 * s, 3 * s, 18 * s); ctx.fillRect(4 * s, -28 * s, 3 * s, 18 * s);
        ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.arc(0, -34 * s, 6.5 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000814'; ctx.beginPath(); ctx.roundRect(-4.5 * s, -36 * s, 9 * s, 4.5 * s, 1.5 * s); ctx.fill();
        ctx.fillStyle = '#00f0ff'; ctx.fillRect(-3 * s, -35 * s, 2 * s, 1 * s); ctx.restore();

        ctx.save(); const headY = p.y + (-34 * s) + currentBob;
        let lightCone = ctx.createRadialGradient(p.x, headY, 0, p.x, headY + 300, 300);
        lightCone.addColorStop(0, 'rgba(255, 255, 255, 0.6)'); lightCone.addColorStop(0.2, 'rgba(0, 240, 255, 0.25)');
        lightCone.addColorStop(0.8, 'rgba(0, 240, 255, 0.04)'); lightCone.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lightCone; ctx.beginPath(); ctx.moveTo(p.x, headY);
        const sweepX = p.x + (this.tilt * 200); ctx.lineTo(sweepX - 180, headY + 450); ctx.lineTo(sweepX + 180, headY + 450);
        ctx.closePath(); ctx.fill(); ctx.restore();
    }
}

class Entity3D {
    constructor(laneIndex, type) {
        this.x = LANES_X[laneIndex]; this.y = 0; this.z = 3000; this.type = type;
        this.baseRadius = type === 'obstacle_high' ? 22 : 14; this.markedForDeletion = false;
        this.rotation = Math.random() * Math.PI * 2;
    }
    update() { this.z -= globalSpeed; if (this.z < 10) this.markedForDeletion = true; if (this.type === 'gold') this.rotation += 0.05; }
    draw() {
        const p = project(this.x, this.y, this.z); if (p.scale === 0) return;
        const r = this.baseRadius * p.scale;
        ctx.save();
        if (this.type === 'obstacle_high') {
            let rockGrad = ctx.createLinearGradient(p.x, p.y, p.x, p.y - r * 3.5);
            rockGrad.addColorStop(0, '#040b13'); rockGrad.addColorStop(0.4, '#0f243a'); rockGrad.addColorStop(0.9, '#00f0ff');
            ctx.fillStyle = rockGrad; ctx.beginPath(); ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x - r * 0.4, p.y - r * 3.5); ctx.lineTo(p.x + r * 0.4, p.y - r * 3.5); ctx.lineTo(p.x + r, p.y);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)'; ctx.lineWidth = 1 * p.scale; ctx.beginPath();
            ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - r * 3.5); ctx.moveTo(p.x - r * 0.5, p.y - r * 1.5); ctx.lineTo(p.x, p.y - r * 3.5); ctx.lineTo(p.x + r * 0.5, p.y - r * 1.5); ctx.stroke();
            ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 15 * p.scale; ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)'; ctx.stroke();
        } else if (this.type === 'obstacle_low') {
            ctx.fillStyle = '#0f172a'; ctx.fillRect(p.x - r * 1.4, p.y - r * 1.2, r * 2.8, r * 1.2);
            ctx.fillStyle = '#ffd700'; ctx.fillRect(p.x - r * 1.4, p.y - r * 1.0, r * 2.8, r * 0.35);
            ctx.fillStyle = '#000';
            for (let i = -1.2; i < 1.2; i += 0.4) {
                ctx.beginPath(); ctx.moveTo(p.x + i * r, p.y - r * 1.0); ctx.lineTo(p.x + (i + 0.2) * r, p.y - r * 1.0); ctx.lineTo(p.x + (i - 0.1) * r, p.y - r * 0.65); ctx.lineTo(p.x + (i - 0.3) * r, p.y - r * 0.65); ctx.closePath(); ctx.fill();
            }
            const flash = Math.sin(frameCount * 0.25) > 0; ctx.fillStyle = flash ? '#ff3c3c' : '#300';
            ctx.beginPath(); ctx.arc(p.x, p.y - r * 1.5, r * 0.25, 0, Math.PI * 2); ctx.fill();
            if (flash) {
                let beaconGlow = ctx.createRadialGradient(p.x, p.y - r * 1.5, 0, p.x, p.y - r * 1.5, r * 1.5);
                beaconGlow.addColorStop(0, 'rgba(255,60,60,0.8)'); beaconGlow.addColorStop(1, 'rgba(255,60,60,0)');
                ctx.fillStyle = beaconGlow; ctx.beginPath(); ctx.arc(p.x, p.y - r * 1.5, r * 1.5, 0, Math.PI * 2); ctx.fill();
            }
        } else {
            ctx.translate(p.x, p.y - r * 1.4); ctx.rotate(this.rotation);
            let goldGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.5);
            goldGlow.addColorStop(0, 'rgba(255, 215, 0, 0.3)'); goldGlow.addColorStop(1, 'rgba(255, 215, 0, 0)');
            ctx.fillStyle = goldGlow; ctx.beginPath(); ctx.arc(0, 0, r * 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.moveTo(0, -r * 1.4); ctx.lineTo(r, -r * 0.5); ctx.lineTo(r * 0.6, r * 0.8); ctx.lineTo(-r * 0.6, r * 0.8); ctx.lineTo(-r, -r * 0.5); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.moveTo(0, -r * 1.4); ctx.lineTo(r * 0.6, -r * 0.5); ctx.lineTo(0, r * 0.5); ctx.lineTo(-r * 0.6, -r * 0.5); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.4, r * 0.3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

function drawAtmosphericCave() {
    let coreGrad = ctx.createRadialGradient(CENTER_X, HORIZON_Y - 20, 10, CENTER_X, HORIZON_Y - 20, canvas.height * 0.7);
    coreGrad.addColorStop(0, '#00f0ff'); coreGrad.addColorStop(0.08, '#0b4a6b'); coreGrad.addColorStop(0.35, '#051121'); coreGrad.addColorStop(1, '#010306');
    ctx.fillStyle = coreGrad; ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#030a13'; ctx.beginPath(); ctx.moveTo(CENTER_X - 70, HORIZON_Y); ctx.quadraticCurveTo(CENTER_X, HORIZON_Y - 100, CENTER_X + 70, HORIZON_Y); ctx.quadraticCurveTo(CENTER_X, HORIZON_Y + 70, CENTER_X - 70, HORIZON_Y); ctx.fill();

    const speedOffset = distanceTraveled % 260;
    for (let z = 2600; z > 40; z -= 260) {
        let currentZ = z - speedOffset; if (currentZ <= 0) continue;
        const pL = project(-LANE_SPACING * 3.5, 0, currentZ); const pR = project(LANE_SPACING * 3.5, 0, currentZ);
        const pL_next = project(-LANE_SPACING * 3.5, 0, currentZ - 80); const pR_next = project(LANE_SPACING * 3.5, 0, currentZ - 80);

        if (pL.scale > 0 && pL_next.scale > 0) {
            const alpha = Math.min(1, (2600 - currentZ) / 1000) * 0.15;
            ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`; ctx.beginPath(); ctx.moveTo(pL.x, pL.y); ctx.lineTo(pR.x, pR.y); ctx.lineTo(pR_next.x, pR_next.y); ctx.lineTo(pL_next.x, pL_next.y); ctx.fill();

            ctx.strokeStyle = `rgba(0, 240, 255, ${pL.scale * 0.08})`; ctx.lineWidth = 1.5 * pL.scale; ctx.beginPath();
            ctx.moveTo(project(-LANE_SPACING * 0.5, 0, currentZ).x, project(-LANE_SPACING * 0.5, 0, currentZ).y); ctx.lineTo(project(-LANE_SPACING * 0.5, 0, currentZ - 80).x, project(-LANE_SPACING * 0.5, 0, currentZ - 80).y);
            ctx.moveTo(project(LANE_SPACING * 0.5, 0, currentZ).x, project(LANE_SPACING * 0.5, 0, currentZ).y); ctx.lineTo(project(LANE_SPACING * 0.5, 0, currentZ - 80).x, project(LANE_SPACING * 0.5, 0, currentZ - 80).y);
            ctx.stroke();
        }
    }

    ctx.fillStyle = '#01050a'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(140, 200, 100, 380); ctx.lineTo(150, 520); ctx.quadraticCurveTo(90, 680, 0, canvas.height); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#00f0ff'; ctx.globalAlpha = 0.15; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(140, 200, 100, 380); ctx.lineTo(150, 520); ctx.quadraticCurveTo(90, 680, 0, canvas.height); ctx.stroke(); ctx.globalAlpha = 1.0;

    ctx.fillStyle = '#01050a'; ctx.beginPath(); ctx.moveTo(canvas.width, 0); ctx.quadraticCurveTo(canvas.width - 140, 180, canvas.width - 100, 400); ctx.lineTo(canvas.width - 150, 540); ctx.quadraticCurveTo(canvas.width - 90, 690, canvas.width, canvas.height); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#00f0ff'; ctx.globalAlpha = 0.15; ctx.beginPath(); ctx.moveTo(canvas.width, 0); ctx.quadraticCurveTo(canvas.width - 140, 180, canvas.width - 100, 400); ctx.lineTo(canvas.width - 150, 540); ctx.quadraticCurveTo(canvas.width - 90, 690, canvas.width, canvas.height); ctx.stroke(); ctx.globalAlpha = 1.0;

    ctx.fillStyle = '#010306'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(canvas.width, 0); ctx.lineTo(canvas.width, 100); ctx.quadraticCurveTo(CENTER_X, 50, 0, 100); ctx.closePath(); ctx.fill();

    const caveSpikes = [{ x: 90, w: 26, h: 150 }, { x: 140, w: 16, h: 240 }, { x: 210, w: 38, h: 120 }, { x: 280, w: 20, h: 280 }, { x: 350, w: 24, h: 200 }, { x: 430, w: 32, h: 140 }, { x: 500, w: 18, h: 230 }];
    ctx.fillStyle = '#010408';
    for (let sp of caveSpikes) {
        ctx.beginPath(); ctx.moveTo(sp.x - sp.w / 2, 80); ctx.lineTo(sp.x + sp.w / 2, 80);
        let motionModifier = Math.sin(distanceTraveled * 0.02 + sp.x) * 3;
        ctx.lineTo(sp.x, sp.h + motionModifier); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sp.x, 80); ctx.lineTo(sp.x, sp.h - 15 + motionModifier); ctx.stroke();
    }
}

function menuLoop() {
    if (currentState !== 'MENU') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    distanceTraveled += 3;
    drawAtmosphericCave();
    for (let i = 0; i < particles.length; i++) { particles[i].update(); particles[i].draw(); }
    frameCount++; requestAnimationFrame(menuLoop);
}

function startGame() {
    globalSpeed = 16; distanceTraveled = 0; goldCollected = 0; frameCount = 0; currentLane = 1; entities = [];
    player = new Miner();
    uiGold.innerText = '0'; uiGold.classList.remove('gold-glow'); uiDist.innerText = '0';
    startMenu.style.display = 'none'; gameOverMenu.style.display = 'none'; hud.style.display = 'block';
    initAtmosphericDust();
    currentState = 'PLAYING';
    requestAnimationFrame(gameLoop);
}

function endGame(reason, color) {
    currentState = 'GAMEOVER'; hud.style.display = 'none';
    goReason.innerHTML = reason; goReason.style.color = color;
    const finalDist = Math.floor(distanceTraveled / 10);
    goStats.innerHTML = `MÉTRICA DE OPERACIÓN:<br><br>• ORO EXTRAÍDO: <span style="color:var(--accent); font-weight:bold;">${goldCollected} Oz</span><br>• PROFUNDIDAD CRÍTICA: <span style="color:var(--primary); font-weight:bold;">${finalDist} m</span>`;
    gameOverMenu.style.display = 'flex';
}

function spawnEntities() {
    const spawnRate = Math.max(12, 25 - Math.floor(distanceTraveled / 2000));
    if (frameCount % spawnRate === 0) {
        const lane = Math.floor(Math.random() * 3); const rand = Math.random(); let type = 'gold';
        if (rand > 0.72) type = 'obstacle_high'; else if (rand > 0.48) type = 'obstacle_low';
        entities.push(new Entity3D(lane, type));
    }
}

function checkCollision3D(player, entity) {
    if (Math.abs(player.z - entity.z) > 35) return false;
    if (Math.abs(player.x - entity.x) > 25) return false;
    if (entity.type === 'obstacle_low' && player.y < -35) return false;
    return true;
}

function gameLoop() {
    if (currentState !== 'PLAYING') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (screenShake > 0) {
        let dx = (Math.random() - 0.5) * screenShake; let dy = (Math.random() - 0.5) * screenShake;
        ctx.translate(dx, dy); screenShake *= 0.88; if (screenShake < 0.2) screenShake = 0;
    }

    drawAtmosphericCave();

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(); particles[i].draw();
        if (particles[i].type !== 'dust' && particles[i].lifetime <= 0) particles.splice(i, 1);
    }

    distanceTraveled += globalSpeed;
    if (frameCount % 180 === 0) globalSpeed += 0.35;

    let currentDist = Math.floor(distanceTraveled / 10);
    uiDist.innerText = currentDist;

    if (currentDist >= MAX_DISTANCE) {
        if (goldCollected >= TARGET_GOLD) endGame("EXTRACCIÓN COMPLETADA.<br>CONTRATO CORPORATIVO SATISFACTORIO.", "var(--primary)");
        else endGame(`PENALIZACIÓN CORPORATIVA:<br>DÉFICIT DE RECOLECCIÓN (${goldCollected}/${TARGET_GOLD} Oz).`, "var(--danger)");
        ctx.restore(); return;
    }

    player.update(); spawnEntities();

    for (let i = entities.length - 1; i >= 0; i--) {
        entities[i].update();
        if (entities[i].z > 70 && entities[i].z < 130) {
            if (checkCollision3D(player, entities[i])) {
                if (entities[i].type === 'gold') {
                    goldCollected++; uiGold.innerText = goldCollected;
                    if (goldCollected >= TARGET_GOLD) uiGold.classList.add('gold-glow');
                    createExplosion(entities[i].x, player.y - 10, entities[i].z, '#ffd700', 14);
                    entities[i].markedForDeletion = true;
                } else {
                    const dmg = entities[i].type === 'obstacle_high' ? 34 : 25;
                    player.takeDamage(dmg); entities[i].markedForDeletion = true;
                }
            }
        }
        if (entities[i].markedForDeletion) entities.splice(i, 1);
    }

    entities.sort((a, b) => b.z - a.z);
    let playerDrawn = false;
    for (let e of entities) {
        if (!playerDrawn && e.z < player.z) { player.draw(); playerDrawn = true; }
        e.draw();
    }
    if (!playerDrawn) player.draw();

    ctx.restore();

    if (damageFlashTime > 0) {
        ctx.fillStyle = `rgba(255, 60, 60, ${damageFlashTime * 0.04})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
        damageFlashTime--;
    }

    frameCount++; requestAnimationFrame(gameLoop);
}

// REGISTRO DEL SERVICE WORKER EXTERNO
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => { });
    });
}

// Inicialización
resizeCanvas();
initAtmosphericDust();
menuLoop();
