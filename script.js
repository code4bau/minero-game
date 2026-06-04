const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hud = document.getElementById('hud');
const startMenu = document.getElementById('startMenu');
const shopMenu = document.getElementById('shopMenu');
const gameOverMenu = document.getElementById('gameOverMenu');
const uiGold = document.getElementById('goldText');
const uiDist = document.getElementById('distText');
const uiHpBar = document.getElementById('hpBar');
const uiHpText = document.getElementById('hpText');
const goReason = document.getElementById('gameOverReason');
const goStats = document.getElementById('finalStats');

// AJUSTES LOGÍSTICOS EQUILIBRADOS
const FOV = 280;
const CAMERA_Y = -120;
let HORIZON_Y = canvas.height * 0.45;
let CENTER_X = canvas.width / 2;
const LANE_SPACING = 60;
const LANES_X = [-LANE_SPACING, 0, LANE_SPACING];
const TARGET_GOLD = 25;
const MAX_DISTANCE = 5000; // Distancia duplicada para dar tiempo a juntar el oro

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

let biomaActual = 'CRIO';
const BIOMAS_CONFIG = {
    CRIO: { colorCore: '#00f0ff', colorMid: '#0b4a6b', name: 'Sector Criogénico' },
    MAGMA: { colorCore: '#ff5500', colorMid: '#5a1100', name: 'Núcleo Magmático' },
    ABISO: { colorCore: '#111122', colorMid: '#020208', name: 'Abismo de Presión' }
};

// PERSISTENCIA
let saveData = { gold: 0, hpLvl: 1, lightLvl: 1 };
function loadGameData() {
    const local = localStorage.getItem('deep_cavern_save');
    if (local) { try { saveData = JSON.parse(local); } catch (e) { } }
    updateShopUI();
}
function saveGameData() { localStorage.setItem('deep_cavern_save', JSON.stringify(saveData)); }

function updateShopUI() {
    document.getElementById('walletGold').innerText = saveData.gold;
    document.getElementById('hpLvlText').innerText = `Niv.${saveData.hpLvl} (${100 + (saveData.hpLvl - 1) * 25} HP máxima)`;
    document.getElementById('lightLvlText').innerText = `Niv.${saveData.lightLvl} (${300 + (saveData.lightLvl - 1) * 60}m cono haz)`;
    document.getElementById('btnUpgradeHp').disabled = saveData.gold < 5 || saveData.hpLvl >= 5;
    document.getElementById('btnUpgradeLight').disabled = saveData.gold < 5 || saveData.lightLvl >= 5;
}

function openShop() { startMenu.style.display = 'none'; shopMenu.style.display = 'flex'; }
function closeShop() { shopMenu.style.display = 'none'; startMenu.style.display = 'flex'; }

function buyUpgrade(type) {
    if (saveData.gold >= 5) {
        if (type === 'hp' && saveData.hpLvl < 5) { saveData.gold -= 5; saveData.hpLvl++; }
        if (type === 'light' && saveData.lightLvl < 5) { saveData.gold -= 5; saveData.lightLvl++; }
        saveGameData(); updateShopUI();
        createExplosion(0, CAMERA_Y, 200, '#00f0ff', 10);
    }
}

// ARQUITECTURA DE CHUNKS CON RITMO MEJORADO
const LAUNCH_PATTERNS = [
    [{ l: 0, t: 'obstacle_low', z: 0 }, { l: 1, t: 'gold', z: 120 }, { l: 2, t: 'obstacle_high', z: 240 }],
    [{ l: 0, t: 'obstacle_low', z: 0 }, { l: 1, t: 'obstacle_low', z: 0 }, { l: 2, t: 'obstacle_low', z: 0 }, { l: 1, t: 'gold', z: 100 }],
    [{ l: 0, t: 'obstacle_high', z: 0 }, { l: 2, t: 'obstacle_high', z: 0 }, { l: 1, t: 'gold', z: 120 }],
    [{ l: 1, t: 'gold', z: 0 }, { l: 0, t: 'gold', z: 100 }, { l: 2, t: 'gold', z: 200 }, { l: 1, t: 'gold', z: 300 }]
];

function spawnPatternChunk() {
    if (entities.length > 0) {
        let maxZ = 0;
        for (let i = 0; i < entities.length; i++) { if (entities[i].z > maxZ) maxZ = entities[i].z; }
        if (maxZ > 1400) return;
    }

    const idx = Math.floor(Math.random() * LAUNCH_PATTERNS.length);
    const chunk = LAUNCH_PATTERNS[idx];

    for (let i = 0; i < chunk.length; i++) {
        let ent = new Entity3D(chunk[i].l, chunk[i].t);
        ent.z = 2500 + chunk[i].z;
        entities.push(ent);
    }
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    CENTER_X = canvas.width / 2; HORIZON_Y = canvas.height * 0.45;
}
window.addEventListener('resize', resizeCanvas);

let touchStartX = 0, touchStartY = 0;
const SWIPE_THRESHOLD = 35;

window.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX; touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

window.addEventListener('touchend', e => {
    if (currentState !== 'PLAYING') return;
    const deltaX = e.changedTouches[0].screenX - touchStartX;
    const deltaY = e.changedTouches[0].screenY - touchStartY;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
            if (deltaX > 0 && currentLane < 2) { currentLane++; triggerLaneChangeParticles(); }
            else if (deltaX < 0 && currentLane > 0) { currentLane--; triggerLaneChangeParticles(); }
        }
    } else {
        if (Math.abs(deltaY) > SWIPE_THRESHOLD && deltaY < 0 && !player.isJumping) player.jump();
    }
}, { passive: true });

window.addEventListener('keydown', e => {
    if (currentState !== 'PLAYING') return;
    if ((e.code === 'KeyA' || e.code === 'ArrowLeft') && currentLane > 0) { currentLane--; triggerLaneChangeParticles(); }
    if ((e.code === 'KeyD' || e.code === 'ArrowRight') && currentLane < 2) { currentLane++; triggerLaneChangeParticles(); }
    if ((e.code === 'Space' || e.code === 'ArrowUp') && !player.isJumping) player.jump();
});

function triggerLaneChangeParticles() { if (player) createExplosion(player.x, player.y, player.z, 'rgba(0, 240, 255, 0.4)', 4); }
function project(x, y, z) { if (z <= 0) return { scale: 0, x: 0, y: 0 }; const scale = (FOV * (canvas.width / 600)) / z; return { x: CENTER_X + (x * scale), y: HORIZON_Y + ((y - CAMERA_Y) * scale), scale: scale }; }

class Particle3D {
    constructor(x, y, z, vx, vy, vz, color, size, lifetime, type = 'spark') { this.x = x; this.y = y; this.z = z; this.vx = vx; this.vy = vy; this.vz = vz; this.color = color; this.baseSize = size; this.lifetime = lifetime; this.maxLifetime = lifetime; this.type = type; }
    update() {
        this.x += this.vx; this.y += this.vy; this.z += this.vz;
        if (this.type === 'dust') {
            this.z -= (currentState === 'MENU') ? 4 : globalSpeed;
            if (this.z < 20) { this.z = 2500 + Math.random() * 500; this.x = (Math.random() - 0.5) * 800; this.y = -100 - Math.random() * 300; }
        } else { this.lifetime--; }
    }
    draw() {
        const p = project(this.x, this.y, this.z); if (p.scale === 0) return; const s = this.baseSize * p.scale;
        let alpha = this.type === 'dust' ? Math.min(1, (this.z - 20) / 400) * 0.3 : (this.lifetime / this.maxLifetime);
        ctx.fillStyle = this.color; ctx.globalAlpha = Math.max(0, alpha);
        ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0;
    }
}

function initAtmosphericDust() {
    particles = [];
    for (let i = 0; i < 45; i++) { particles.push(new Particle3D((Math.random() - 0.5) * 1000, -50 - Math.random() * 400, Math.random() * 2500, 0, 0, 0, 'rgba(0, 240, 255, 0.25)', 1.5, 9999, 'dust')); }
}
function createExplosion(x, y, z, color, count) {
    for (let i = 0; i < count; i++) { const angle = Math.random() * Math.PI * 2; const speed = 4 + Math.random() * 6; particles.push(new Particle3D(x, y, z, Math.cos(angle) * speed, (Math.random() - 0.6) * speed, (Math.random() - 0.5) * 10, color, 2 + Math.random() * 2, 25 + Math.random() * 15, 'spark')); }
}

document.body.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

class Miner {
    constructor() {
        this.x = LANES_X[currentLane]; this.y = 0; this.z = 100; this.radius = 14; this.lerpFactor = 0.22;
        this.isJumping = false; this.vy = 0; this.gravity = 1.1; this.jumpStrength = -17;
        this.maxHp = 100 + (saveData.hpLvl - 1) * 25; this.hp = this.maxHp; this.iFrames = 0;
        this.tilt = 0; this.bobAngle = 0; this.scaleX = 1; this.scaleY = 1;
        this.lightMaxRadius = 300 + (saveData.lightLvl - 1) * 60;
        this.updateHpUI();
    }
    jump() { this.isJumping = true; this.vy = this.jumpStrength; this.scaleY = 0.7; this.scaleX = 1.3; }
    update() {
        const prevX = this.x; this.x = this.x + (LANES_X[currentLane] - this.x) * this.lerpFactor; this.tilt = (this.x - prevX) * 0.15;
        if (this.isJumping) {
            this.vy += this.gravity; this.y += this.vy;
            if (this.y >= 0) { this.y = 0; this.isJumping = false; this.vy = 0; this.scaleY = 0.6; this.scaleX = 1.4; screenShake = Math.max(screenShake, 5); createExplosion(this.x, 0, this.z, '#6c8fa8', 5); }
        } else { this.bobAngle += globalSpeed * 0.015; }
        this.scaleX += (1 - this.scaleX) * 0.15; this.scaleY += (1 - this.scaleY) * 0.15;
        if (this.iFrames > 0) this.iFrames--;
    }
    takeDamage(amount) {
        if (this.iFrames > 0) return;
        this.hp = Math.max(0, this.hp - amount); this.iFrames = 40; this.updateHpUI();
        screenShake = 22; damageFlashTime = 12; createExplosion(this.x, this.y - 15, this.z, '#ff3c3c', 20);
        if (this.hp <= 0) endGame("COLAPSO CRÍTICO DEL NANOTRAJE", "#ff3c3c");
    }
    updateHpUI() {
        const ratio = this.hp / this.maxHp; uiHpBar.style.width = (ratio * 100) + '%';
        uiHpText.innerText = Math.floor(ratio * 100) + '%';
    }
    draw() {
        if (this.iFrames > 0 && Math.floor(frameCount / 3) % 2 === 0) return;
        const p = project(this.x, this.y, this.z); if (p.scale === 0) return;
        const s = p.scale; const r = this.radius * s; const currentBob = this.isJumping ? 0 : Math.sin(this.bobAngle) * 3 * s;

        ctx.save(); ctx.translate(p.x, p.y + currentBob); ctx.rotate(this.tilt); ctx.scale(this.scaleX, this.scaleY);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.beginPath(); ctx.ellipse(0, -this.y * s - currentBob, Math.max(5, r * (1 - Math.abs(this.y) / 250)), Math.max(2, r * 0.4), 0, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#0f172a'; ctx.fillRect(-6 * s, -10 * s, 4 * s, 10 * s); ctx.fillRect(2 * s, -10 * s, 4 * s, 10 * s);
        ctx.fillStyle = biomaActual === 'MAGMA' ? '#ff3c3c' : '#ff6b00'; ctx.fillRect(-6 * s, -6 * s, 4 * s, 3 * s); ctx.fillRect(2 * s, -6 * s, 4 * s, 3 * s);
        ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.roundRect(-10 * s, -28 * s, 20 * s, 18 * s, 4 * s); ctx.fill();
        ctx.fillStyle = '#ff6b00'; ctx.fillRect(-8 * s, -25 * s, 16 * s, 5 * s); ctx.fillStyle = BIOMAS_CONFIG[biomaActual].colorCore; ctx.fillRect(-7 * s, -28 * s, 3 * s, 18 * s); ctx.fillRect(4 * s, -28 * s, 3 * s, 18 * s);
        ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.arc(0, -34 * s, 6.5 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000814'; ctx.beginPath(); ctx.roundRect(-4.5 * s, -36 * s, 9 * s, 4.5 * s, 1.5 * s); ctx.fill();
        ctx.restore();

        ctx.save(); const headY = p.y + (-34 * s) + currentBob;
        let currentLightRadius = this.lightMaxRadius;
        if (biomaActual === 'ABISO') { currentLightRadius *= (0.4 + Math.abs(Math.sin(frameCount * 0.08)) * 0.6); }
        let lightCone = ctx.createRadialGradient(p.x, headY, 0, p.x, headY + 300, currentLightRadius);
        lightCone.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
        lightCone.addColorStop(0.2, biomaActual === 'MAGMA' ? 'rgba(255,100,0,0.3)' : 'rgba(0, 240, 255, 0.25)');
        lightCone.addColorStop(0.8, 'rgba(0, 0, 0, 0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lightCone; ctx.beginPath(); ctx.moveTo(p.x, headY);
        const sweepX = p.x + (this.tilt * 200); ctx.lineTo(sweepX - 180, headY + 450); ctx.lineTo(sweepX + 180, headY + 450); ctx.closePath(); ctx.fill(); ctx.restore();
    }
}

class Entity3D {
    constructor(laneIndex, type) {
        this.lane = laneIndex; this.x = LANES_X[laneIndex]; this.y = 0; this.z = 3000; this.type = type;
        this.baseRadius = type === 'obstacle_high' ? 22 : 14; this.markedForDeletion = false; this.rotation = Math.random() * Math.PI * 2;
    }
    update() { this.z -= globalSpeed; if (this.z < 10) this.markedForDeletion = true; if (this.type === 'gold') this.rotation += 0.05; }
    draw() {
        const p = project(this.x, this.y, this.z); if (p.scale === 0) return; const r = this.baseRadius * p.scale;
        ctx.save();
        if (this.type === 'obstacle_high') {
            let rockGrad = ctx.createLinearGradient(p.x, p.y, p.x, p.y - r * 3.5);
            rockGrad.addColorStop(0, '#040b13'); rockGrad.addColorStop(0.4, '#0f243a'); rockGrad.addColorStop(0.9, BIOMAS_CONFIG[biomaActual].colorCore);
            ctx.fillStyle = rockGrad; ctx.beginPath(); ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x - r * 0.4, p.y - r * 3.5); ctx.lineTo(p.x + r * 0.4, p.y - r * 3.5); ctx.lineTo(p.x + r, p.y); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = BIOMAS_CONFIG[biomaActual].colorCore; ctx.lineWidth = 1 * p.scale; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - r * 3.5); ctx.stroke();
        } else if (this.type === 'obstacle_low') {
            ctx.fillStyle = '#0f172a'; ctx.fillRect(p.x - r * 1.4, p.y - r * 1.2, r * 2.8, r * 1.2);
            ctx.fillStyle = biomaActual === 'MAGMA' ? '#ff3c3c' : '#ffd700'; ctx.fillRect(p.x - r * 1.4, p.y - r * 1.0, r * 2.8, r * 0.35);
        } else {
            ctx.translate(p.x, p.y - r * 1.4); ctx.rotate(this.rotation);
            ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.moveTo(0, -r * 1.4); ctx.lineTo(r, -r * 0.5); ctx.lineTo(r * 0.6, r * 0.8); ctx.lineTo(-r * 0.6, r * 0.8); ctx.lineTo(-r, -r * 0.5); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.moveTo(0, -r * 1.4); ctx.lineTo(r * 0.6, -r * 0.5); ctx.lineTo(0, r * 0.5); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }
}

function drawAtmosphericCave() {
    const config = BIOMAS_CONFIG[biomaActual];
    let coreGrad = ctx.createRadialGradient(CENTER_X, HORIZON_Y - 20, 10, CENTER_X, HORIZON_Y - 20, canvas.height * 0.7);
    coreGrad.addColorStop(0, config.colorCore); coreGrad.addColorStop(0.09, config.colorMid); coreGrad.addColorStop(0.4, '#030912'); coreGrad.addColorStop(1, '#000103');
    ctx.fillStyle = coreGrad; ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#01050d'; ctx.beginPath(); ctx.moveTo(CENTER_X - 70, HORIZON_Y); ctx.quadraticCurveTo(CENTER_X, HORIZON_Y - 100, CENTER_X + 70, HORIZON_Y); ctx.quadraticCurveTo(CENTER_X, HORIZON_Y + 70, CENTER_X - 70, HORIZON_Y); ctx.fill();

    const speedOffset = distanceTraveled % 260;
    for (let z = 2600; z > 40; z -= 260) {
        let currentZ = z - speedOffset; if (currentZ <= 0) continue;
        const pL = project(-LANE_SPACING * 3.5, 0, currentZ); const pR = project(LANE_SPACING * 3.5, 0, currentZ);
        const pL_next = project(-LANE_SPACING * 3.5, 0, currentZ - 80); const pR_next = project(LANE_SPACING * 3.5, 0, currentZ - 80);

        if (pL.scale > 0 && pL_next.scale > 0) {
            const alpha = Math.min(1, (2600 - currentZ) / 1000) * 0.12;
            ctx.fillStyle = biomaActual === 'MAGMA' ? `rgba(255, 85, 0, ${alpha})` : `rgba(0, 240, 255, ${alpha})`;
            ctx.beginPath(); ctx.moveTo(pL.x, pL.y); ctx.lineTo(pR.x, pR.y); ctx.lineTo(pR_next.x, pR_next.y); ctx.lineTo(pL_next.x, pL_next.y); ctx.fill();

            ctx.strokeStyle = biomaActual === 'MAGMA' ? `rgba(255, 85, 0, ${pL.scale * 0.08})` : `rgba(0, 240, 255, ${pL.scale * 0.08})`;
            ctx.lineWidth = 1.5 * pL.scale; ctx.beginPath();
            ctx.moveTo(project(-LANE_SPACING * 0.5, 0, currentZ).x, project(-LANE_SPACING * 0.5, 0, currentZ).y); ctx.lineTo(project(-LANE_SPACING * 0.5, 0, currentZ - 80).x, project(-LANE_SPACING * 0.5, 0, currentZ - 80).y);
            ctx.moveTo(project(LANE_SPACING * 0.5, 0, currentZ).x, project(LANE_SPACING * 0.5, 0, currentZ).y); ctx.lineTo(project(LANE_SPACING * 0.5, 0, currentZ - 80).x, project(LANE_SPACING * 0.5, 0, currentZ - 80).y);
            ctx.stroke();
        }
    }

    ctx.fillStyle = '#010307';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(140, 200, 100, 380); ctx.lineTo(150, 520); ctx.quadraticCurveTo(90, 680, 0, canvas.height); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(canvas.width, 0); ctx.quadraticCurveTo(canvas.width - 140, 180, canvas.width - 100, 400); ctx.lineTo(canvas.width - 150, 540); ctx.quadraticCurveTo(canvas.width - 90, 690, canvas.width, canvas.height); ctx.closePath(); ctx.fill();
}

function updateBiomaLog(dist) {
    let prevBioma = biomaActual;
    if (dist < 1500) { biomaActual = 'CRIO'; }
    else if (dist >= 1500 && dist < 3200) { biomaActual = 'MAGMA'; }
    else { biomaActual = 'ABISO'; }

    if (prevBioma !== biomaActual) {
        document.getElementById('lblBioma').innerText = BIOMAS_CONFIG[biomaActual].name;
        if (biomaActual === 'MAGMA') globalSpeed = 21;
        if (biomaActual === 'ABISO') globalSpeed = 26;
        createExplosion(0, CAMERA_Y, 400, BIOMAS_CONFIG[biomaActual].colorCore, 15);
    }
}

function checkCollision3D(pRef, eRef) {
    if (Math.abs(pRef.z - eRef.z) > 40) return false;
    if (LANES_X[currentLane] !== eRef.x) return false;
    if (eRef.type === 'obstacle_low' && pRef.y < -35) return false;
    return true;
}

function menuLoop() {
    if (currentState !== 'MENU') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); distanceTraveled += 3;
    drawAtmosphericCave();
    for (let i = 0; i < particles.length; i++) { particles[i].update(); particles[i].draw(); }
    frameCount++; requestAnimationFrame(menuLoop);
}

function startGame() {
    const unitSpan = document.querySelector('.hud-value.gold-glow .unit');
    if (unitSpan) unitSpan.innerHTML = ` / ${TARGET_GOLD} Oz`; globalSpeed = 16; distanceTraveled = 0; goldCollected = 0; frameCount = 0; currentLane = 1; entities = [];
    biomaActual = 'CRIO'; document.getElementById('lblBioma').innerText = BIOMAS_CONFIG[biomaActual].name;
    player = new Miner();
    uiGold.innerText = '0'; uiDist.innerText = '0';
    startMenu.style.display = 'none'; gameOverMenu.style.display = 'none'; hud.style.display = 'block';
    initAtmosphericDust();
    currentState = 'PLAYING';
    requestAnimationFrame(gameLoop);
}

function backToMenuFromGameOver() {
    gameOverMenu.style.display = 'none';
    startMenu.style.display = 'flex';
    currentState = 'MENU';
    requestAnimationFrame(menuLoop);
}

function endGame(reason, color) {
    currentState = 'GAMEOVER'; hud.style.display = 'none'; goReason.innerHTML = reason; goReason.style.color = color;
    const finalDist = Math.floor(distanceTraveled / 10);

    saveData.gold += goldCollected; saveGameData(); updateShopUI();

    goStats.innerHTML = `REPORTE DE LOGÍSTICA:<br><br>• ORO EXTRAÍDO: <span style="color:var(--accent); font-weight:bold;">+${goldCollected} Oz</span><br>• TOTAL EN DEPÓSITO: ${saveData.gold} Oz<br>• PROFUNDIDAD: <span style="color:var(--primary); font-weight:bold;">${finalDist} m</span>`;
    gameOverMenu.style.display = 'flex';
}

function gameLoop() {
    if (currentState !== 'PLAYING') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save();
    if (screenShake > 0) { ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake); screenShake *= 0.88; if (screenShake < 0.2) screenShake = 0; }

    drawAtmosphericCave();

    for (let i = particles.length - 1; i >= 0; i--) { particles[i].update(); particles[i].draw(); if (particles[i].type !== 'dust' && particles[i].lifetime <= 0) particles.splice(i, 1); }

    distanceTraveled += globalSpeed;
    let currentDist = Math.floor(distanceTraveled / 10);
    uiDist.innerText = currentDist;

    updateBiomaLog(currentDist);

    if (currentDist >= MAX_DISTANCE) {
        if (goldCollected >= TARGET_GOLD) endGame("CONTRATO CUMPLIDO. EXTRACCIÓN SATISFACTORIA.", "var(--primary)");
        else endGame(`CUOTA INCUMPLIDA (${goldCollected}/${TARGET_GOLD} Oz).`, "var(--danger)");
        ctx.restore(); return;
    }

    player.update();

    // Ritmo acelerado (cada 40 frames) para garantizar abundancia de oro
    if (frameCount % 40 === 0) spawnPatternChunk();

    for (let i = entities.length - 1; i >= 0; i--) {
        entities[i].update();
        if (entities[i].z > 60 && entities[i].z < 140) {
            if (checkCollision3D(player, entities[i])) {
                if (entities[i].type === 'gold') {
                    goldCollected++; uiGold.innerText = goldCollected;
                    createExplosion(entities[i].x, player.y - 10, entities[i].z, '#ffd700', 12);
                    entities[i].markedForDeletion = true;
                } else {
                    const dmg = entities[i].type === 'obstacle_high' ? 34 : 25;
                    player.takeDamage(dmg); entities[i].markedForDeletion = true;
                }
            }
        }
        if (entities[i].markedForDeletion) { entities.splice(i, 1); }
    }

    entities.sort((a, b) => b.z - a.z);
    let playerDrawn = false;
    for (let i = 0; i < entities.length; i++) {
        if (!playerDrawn && entities[i].z < player.z) { player.draw(); playerDrawn = true; }
        entities[i].draw();
    }
    if (!playerDrawn) player.draw();

    ctx.restore();
    if (damageFlashTime > 0) { ctx.fillStyle = `rgba(255, 60, 60, ${damageFlashTime * 0.04})`; ctx.fillRect(0, 0, canvas.width, canvas.height); damageFlashTime--; }
    frameCount++; requestAnimationFrame(gameLoop);
}

loadGameData();
resizeCanvas();
initAtmosphericDust();
menuLoop();
