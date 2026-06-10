const canvas = document.getElementById('gameCanvas'); const ctx = canvas.getContext('2d');
const views = { main: document.getElementById('startMenu'), map: document.getElementById('mapMenu'), briefing: document.getElementById('briefingMenu'), shop: document.getElementById('shopMenu'), gameover: document.getElementById('gameOverMenu'), hud: document.getElementById('hud') };
const uiGold = document.getElementById('goldText'), uiDist = document.getElementById('distText'), uiHpBar = document.getElementById('hpBar'), uiHpText = document.getElementById('hpText'), uiTargetGold = document.getElementById('targetGoldText'), uiMaxDist = document.getElementById('maxDistHud'), goReason = document.getElementById('gameOverReason'), goStats = document.getElementById('finalStats');

// MOTOR AUDIO PROCEDURAL CON BLOQUEO ANTI-CRASH DEFENSIVO
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const SoundEngine = {
    playTone: (freq, type, duration, vol) => {
        try {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
            osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(vol, audioCtx.currentTime);

            let endTime = audioCtx.currentTime + duration;
            gain.gain.linearRampToValueAtTime(0.01, endTime);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(); osc.stop(endTime);
        } catch (e) {
            console.warn("Audio timeline collision avoided safely:", e);
        }
    },
    jump: () => SoundEngine.playTone(150, 'sine', 0.3, 0.4),
    coin: () => SoundEngine.playTone(850, 'square', 0.08, 0.15),
    hit: () => SoundEngine.playTone(90, 'sawtooth', 0.3, 0.5),
    alert: () => { SoundEngine.playTone(380, 'square', 0.15, 0.2); setTimeout(() => SoundEngine.playTone(280, 'square', 0.2, 0.2), 150); }
};

const CAMPANA_MISIONES = [
    { id: 0, nombre: "NIVEL 1: Cueva de Hielo", metaDist: 2000, cuota: 10, biomaBase: "CRIO", vInicial: 15, textoStory: "Diario del día 1.\nEstoy atrapado. Hay cristales de energía azules brillando en las paredes. Si logro juntar 10 de estos cristales antes de llegar a los 2000 metros, podré reactivar la radio." },
    { id: 1, nombre: "NIVEL 2: Cañón de Lava", metaDist: 3500, cuota: 15, biomaBase: "MAGMA", vInicial: 19, textoStory: "Diario del día 3.\nEl túnel bajó hacia una zona volcánica. El traje se está sobrecalentando rápido. Necesito 15 cristales para darle energía a la refrigeración de la armadura. Tengo que ser rápido." },
    { id: 2, nombre: "NIVEL 3: El Nexo de Datos", metaDist: 5000, cuota: 25, biomaBase: "ABISO", vInicial: 24, textoStory: "Diario del día 7.\nLlegué al Nexo de Datos. No hay piedra acá abajo; las paredes son estructuras geométricas puras que titilan en la oscuridad. La linterna falla por la interferencia magnética. Descubrí que el colapso de la superficie no fue un accidente natural. Necesito 25 cristales para encender el decodificador." },
    { id: 3, nombre: "NIVEL 4: Falla del Núcleo", metaDist: 6500, cuota: 30, biomaBase: "MAGMA", vInicial: 27, textoStory: "Diario del día 11.\nEl entorno se volvió inestable. El magma se está filtrando a través de los servidores de la caverna y la armadura del traje está absorbiendo demasiada radiación. La velocidad de descenso es peligrosa. Juntá 30 cristales para sobrecargar los escudos." },
    { id: 4, nombre: "NIVEL 5: La Ecuación Final", metaDist: 8000, cuota: 40, biomaBase: "ABISO", vInicial: 30, textoStory: "Diario del día 15.\nEste es el punto de no retorno. La gravedad está alterada y la señal de radio con la estación espacial exterior se está desvaneciendo. Si logro extraer los últimos 40 cristales, podré transmitir los datos de salvación para el resto de la humanidad." },
    { id: 5, nombre: "NIVEL 6: Ruinas de Silicio", metaDist: 9500, cuota: 45, biomaBase: "MAGMA", vInicial: 32, textoStory: "Diario del día 19.\nHe detectado cimientos de una antigua megaestructura de servidores sepultada por la lava. El calor de las placas de silicio deforma la telemetría. Cuota: 45 cristales." },
    { id: 6, nombre: "NIVEL 7: Fosa Holográfica", metaDist: 11000, cuota: 50, biomaBase: "ABISO", vInicial: 35, textoStory: "Diario del día 24.\nLas leyes de la física ya no se aplican en esta profundidad. Todo el entorno está compuesto de proyecciones de luz sólida erráticas. Juntá 50 cristales para estabilizar la frecuencia." },
    { id: 7, nombre: "NIVEL 8: Singularidad FSM", metaDist: 13000, cuota: 60, biomaBase: "ABISO", vInicial: 38, textoStory: "Diario del día 30.\nEstoy frente a la fuente de la anomalía FSM. Si completo la recolección de los últimos 60 cristales primordiales, el algoritmo se cerrará y la información será evacuada a la órbita." }
];

const FOV = 280; const CAMERA_Y = -120; let HORIZON_Y = canvas.height * 0.45; let CENTER_X = canvas.width / 2;
const LANE_SPACING = 60; const LANES_X = [-LANE_SPACING, 0, LANE_SPACING];

let saveData = { gold: 0, hpLvl: 1, lightLvl: 1, magnetLvl: 1, maxNivelDesbloqueado: 0 };
let levelSelected = 0;
let globalSpeed = 16; let distanceTraveled = 0; let goldCollected = 0; let frameCount = 0; let currentLane = 1;
let player = null, screenShake = 0, damageFlashTime = 0, biomaActual = 'CRIO', biomeAlertTimer = 0;
let adUsedInRun = false;

const BIOMAS_CONFIG = {
    CRIO: { colorCore: '#00f0ff', rgb: '0, 240, 255', colorMid: '#062f4f', name: 'Cueva de Hielo' },
    MAGMA: { colorCore: '#ff5500', rgb: '255, 85, 0', colorMid: '#4a0e17', name: 'Cañón de Lava' },
    ABISO: { colorCore: '#7900ff', rgb: '121, 0, 255', colorMid: '#1a0033', name: 'Abismo Oscuro' }
};

const LAUNCH_PATTERNS = [
    [{ l: 1, t: 'obstacle_high', z: 0 }, { l: 0, t: 'gold', z: 100 }, { l: 2, t: 'gold', z: 100 }],
    [{ l: 1, t: 'obstacle_low', z: 0 }, { l: 2, t: 'obstacle_high', z: 140 }, { l: 0, t: 'gold', z: 240 }],
    [{ l: 0, t: 'obstacle_high', z: 0 }, { l: 2, t: 'obstacle_high', z: 0 }, { l: 1, t: 'obstacle_low', z: 150 }, { l: 1, t: 'gold', z: 150 }],
    [{ l: 0, t: 'gold', z: 0 }, { l: 1, t: 'obstacle_low', z: 100 }, { l: 2, t: 'gold', z: 200 }, { l: 1, t: 'obstacle_high', z: 300 }]
];

class Entity3D {
    constructor() { this.active = false; this.lane = 0; this.x = 0; this.y = 0; this.z = 0; this.type = ''; this.baseRadius = 0; this.rotation = 0; }
    spawn(lane, type, zOffset) {
        this.active = true; this.lane = lane; this.x = LANES_X[lane]; this.y = 0; this.z = 2500 + zOffset;
        this.type = type; this.baseRadius = type === 'obstacle_high' ? 22 : 14; this.rotation = Math.random() * Math.PI * 2;
    }
    update() { if (!this.active) return; this.z -= globalSpeed; if (this.z < 10) this.active = false; if (this.type === 'gold') this.rotation += 0.06; }
    draw() {
        if (!this.active) return;
        const p = project(this.x, this.y, this.z); if (p.scale === 0) return; const r = this.baseRadius * p.scale;
        ctx.save();
        if (this.type === 'obstacle_high') {
            let rockGrad = ctx.createLinearGradient(p.x, p.y, p.x, p.y - r * 3.5); rockGrad.addColorStop(0, '#02050a'); rockGrad.addColorStop(1, BIOMAS_CONFIG[biomaActual].colorCore);
            ctx.fillStyle = rockGrad; ctx.beginPath(); ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x - r * 0.3, p.y - r * 3.5); ctx.lineTo(p.x + r * 0.3, p.y - r * 3.5); ctx.lineTo(p.x + r, p.y); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = BIOMAS_CONFIG[biomaActual].colorCore; ctx.lineWidth = 1 * p.scale; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - r * 3.5); ctx.stroke();
        } else if (this.type === 'obstacle_low') {
            ctx.fillStyle = '#111'; ctx.fillRect(p.x - r * 1.4, p.y - r * 1.2, r * 2.8, r * 1.2); ctx.fillStyle = '#ff3c3c'; ctx.fillRect(p.x - r * 1.4, p.y - r * 1.0, r * 2.8, r * 0.2);
        } else {
            ctx.translate(p.x, p.y - r * 1.4); ctx.rotate(this.rotation);
            let goldGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4); goldGlow.addColorStop(0, 'rgba(255, 204, 0, 0.4)'); goldGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = goldGlow; ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffcc00'; ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(r, -r * 0.4); ctx.lineTo(r * 0.5, r * 0.8); ctx.lineTo(-r * 0.5, r * 0.8); ctx.lineTo(-r, -r * 0.4); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

class Particle3D {
    constructor() { this.active = false; }
    spawn(x, y, z, vx, vy, vz, color, size, lifetime, type) {
        this.active = true; this.x = x; this.y = y; this.z = z; this.vx = vx; this.vy = vy; this.vz = vz;
        this.color = color; this.baseSize = size; this.lifetime = lifetime; this.maxLifetime = lifetime; this.type = type;
    }
    update() {
        if (!this.active) return;
        this.x += this.vx; this.y += this.vy; this.z += this.vz;
        if (this.type === 'dust') {
            this.z -= (currentState === 'MENU') ? 4 : globalSpeed;
            if (this.z < 20) { this.z = 2500 + Math.random() * 500; this.x = (Math.random() - 0.5) * 800; this.y = -100 - Math.random() * 300; }
        } else { this.lifetime--; if (this.lifetime <= 0) this.active = false; }
    }
    draw() {
        if (!this.active) return;
        const p = project(this.x, this.y, this.z); if (p.scale === 0) return; const s = this.baseSize * p.scale;
        ctx.fillStyle = this.color; ctx.globalAlpha = this.type === 'dust' ? 0.2 : (this.lifetime / this.maxLifetime);
        ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0;
    }
}

const entityPool = Array.from({ length: 120 }, () => new Entity3D());
const particlePool = Array.from({ length: 250 }, () => new Particle3D());

function getFreeEntity() { return entityPool.find(e => !e.active); }
function getFreeParticle() { return particlePool.find(p => !p.active); }

function initAtmosphericDust() {
    particlePool.forEach(p => p.active = false);
    for (let i = 0; i < 45; i++) {
        let p = getFreeParticle(); if (p) p.spawn((Math.random() - 0.5) * 1000, -50 - Math.random() * 400, Math.random() * 2500, 0, 0, 0, 'rgba(0, 240, 255, 0.2)', 1.5, 9999, 'dust');
    }
}

function createExplosion(x, y, z, color, count) {
    for (let i = 0; i < count; i++) {
        let p = getFreeParticle(); if (!p) break;
        const angle = Math.random() * Math.PI * 2; const speed = 4 + Math.random() * 6;
        p.spawn(x, y, z, Math.cos(angle) * speed, (Math.random() - 0.6) * speed, (Math.random() - 0.5) * 10, color, 2 + Math.random() * 1.5, 25 + Math.random() * 15, 'spark');
    }
}

function spawnPatternChunk() {
    let maxZ = 0; for (let i = 0; i < entityPool.length; i++) { if (entityPool[i].active && entityPool[i].z > maxZ) maxZ = entityPool[i].z; }
    if (maxZ > 1400) return;
    const idx = Math.floor(Math.random() * LAUNCH_PATTERNS.length); const chunk = LAUNCH_PATTERNS[idx];
    for (let i = 0; i < chunk.length; i++) { let ent = getFreeEntity(); if (ent) ent.spawn(chunk[i].l, chunk[i].t, chunk[i].z); }
}

function loadGameData() {
    const local = localStorage.getItem('deep_cavern_save_v4');
    if (local) { try { saveData = JSON.parse(local); } catch (e) { } }
    if (saveData.maxNivelDesbloqueado === undefined || typeof saveData.maxNivelDesbloqueado !== 'number') saveData.maxNivelDesbloqueado = 0;
    updateShopUI(); buildMapNodes();
}
function saveGameData() { localStorage.setItem('deep_cavern_save_v4', JSON.stringify(saveData)); }

function updateShopUI() {
    document.getElementById('txtWallet').innerText = saveData.gold;
    document.getElementById('txtLvlHp').innerText = `Niv.${saveData.hpLvl}`;
    document.getElementById('txtLvlLight').innerText = `Niv.${saveData.lightLvl}`;
    document.getElementById('txtLvlMagnet').innerText = `Niv.${saveData.magnetLvl}`;
    document.getElementById('btnBuyHp').disabled = saveData.gold < 5 || saveData.hpLvl >= 5;
    document.getElementById('btnBuyLight').disabled = saveData.gold < 5 || saveData.lightLvl >= 5;
    document.getElementById('btnBuyMagnet').disabled = saveData.gold < 5 || saveData.magnetLvl >= 5;
}

function ejecutarUpgrade(type) {
    if (saveData.gold >= 5) {
        if (type === 'hp' && saveData.hpLvl < 5) { saveData.gold -= 5; saveData.hpLvl++; }
        if (type === 'light' && saveData.lightLvl < 5) { saveData.gold -= 5; saveData.lightLvl++; }
        if (type === 'magnet' && saveData.magnetLvl < 5) { saveData.gold -= 5; saveData.magnetLvl++; }
        saveGameData(); updateShopUI(); SoundEngine.coin();
    }
}

function switchView(target) {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => { });
    Object.values(views).forEach(v => v.style.display = 'none');
    if (target === 'main') { views.main.style.display = 'flex'; currentState = 'MENU'; }
    else if (target === 'shop') { views.shop.style.display = 'flex'; updateShopUI(); currentState = 'MENU'; }
    else if (target === 'map') { views.map.style.display = 'flex'; buildMapNodes(); currentState = 'MENU'; }
}

function buildMapNodes() {
    const contenedor = document.getElementById('misionesContenedor'); contenedor.innerHTML = '';
    CAMPANA_MISIONES.forEach(m => {
        const node = document.createElement('div'); const isLocked = m.id > saveData.maxNivelDesbloqueado;
        node.className = `mission-node ${isLocked ? 'locked' : ''}`;
        node.innerHTML = `<div class="mission-meta"><div class="mission-name">${m.nombre}</div><div class="mission-target">OBJETIVO: ${m.metaDist}m | CUOTA: ${m.cuota} U</div></div><div>${isLocked ? '🔒 BLOQUEADO' : '⚡ JUGAR'}</div>`;
        if (!isLocked) { node.onclick = () => inicializarNarrativaBriefing(m.id); } contenedor.appendChild(node);
    });
}

let typewriterTimer = null;
function inicializarNarrativaBriefing(misionId) {
    levelSelected = misionId; switchView('none'); views.briefing.style.display = 'flex';
    const txtBox = document.getElementById('briefingTexto'); txtBox.innerText = '';
    const fullText = CAMPANA_MISIONES[misionId].textoStory; let charIdx = 0;

    if (typewriterTimer) clearInterval(typewriterTimer);
    document.getElementById('btnIniciarMision').style.display = 'none';

    typewriterTimer = setInterval(() => {
        try {
            txtBox.innerText += fullText.charAt(charIdx); charIdx++;
            if (charIdx % 3 === 0) SoundEngine.playTone(600, 'sine', 0.05, 0.05);
            if (charIdx >= fullText.length) { clearInterval(typewriterTimer); document.getElementById('btnIniciarMision').style.display = 'block'; }
        } catch (err) {
            clearInterval(typewriterTimer); txtBox.innerText = fullText;
            document.getElementById('btnIniciarMision').style.display = 'block';
        }
    }, 20);
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio; canvas.height = rect.height * window.devicePixelRatio;
    CENTER_X = canvas.width / 2; HORIZON_Y = canvas.height * 0.45;
}
window.addEventListener('resize', resizeCanvas);

let touchStartX = 0, touchStartY = 0;
window.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; touchStartY = e.changedTouches[0].screenY; }, { passive: true });
window.addEventListener('touchend', e => {
    if (currentState !== 'PLAYING') return;
    const deltaX = e.changedTouches[0].screenX - touchStartX; const deltaY = e.changedTouches[0].screenY - touchStartY;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (Math.abs(deltaX) > 35) { if (deltaX > 0 && currentLane < 2) { currentLane++; triggerLaneChangeParticles(); } else if (deltaX < 0 && currentLane > 0) { currentLane--; triggerLaneChangeParticles(); } }
    } else { if (Math.abs(deltaY) > 35 && deltaY < 0 && !player.isJumping) player.jump(); }
}, { passive: true });

window.addEventListener('keydown', e => {
    if (currentState !== 'PLAYING') return;
    if ((e.code === 'KeyA' || e.code === 'ArrowLeft') && currentLane > 0) { currentLane--; triggerLaneChangeParticles(); }
    if ((e.code === 'KeyD' || e.code === 'ArrowRight') && currentLane < 2) { currentLane++; triggerLaneChangeParticles(); }
    if ((e.code === 'Space' || e.code === 'ArrowUp') && !player.isJumping) player.jump();
});

function triggerLaneChangeParticles() { if (player) createExplosion(player.x, player.y, player.z, 'var(--primary)', 4); }
function project(x, y, z) { if (z <= 0) return { scale: 0, x: 0, y: 0 }; const scale = (FOV * (canvas.width / 600)) / z; return { x: CENTER_X + (x * scale), y: HORIZON_Y + ((y - CAMERA_Y) * scale), scale: scale }; }

function drawAtmosphericCave() {
    const config = BIOMAS_CONFIG[biomaActual];
    let coreGrad = ctx.createRadialGradient(CENTER_X, HORIZON_Y - 20, 5, CENTER_X, HORIZON_Y - 20, canvas.height * 0.7);
    let visibilityCap = 0.03 + (saveData.lightLvl - 1) * 0.05;
    coreGrad.addColorStop(0, config.colorCore);
    coreGrad.addColorStop(Math.min(visibilityCap, 0.25), config.colorMid);
    coreGrad.addColorStop(0.35, '#010204');
    coreGrad.addColorStop(1, '#000000');

    ctx.fillStyle = coreGrad; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(CENTER_X - 60, HORIZON_Y); ctx.quadraticCurveTo(CENTER_X, HORIZON_Y - 80, CENTER_X + 60, HORIZON_Y); ctx.quadraticCurveTo(CENTER_X, HORIZON_Y + 60, CENTER_X - 60, HORIZON_Y); ctx.fill();

    const speedOffset = distanceTraveled % 240;
    for (let z = 2400; z > 40; z -= 240) {
        let currentZ = z - speedOffset; if (currentZ <= 0) continue;
        const pL = project(-LANE_SPACING * 3.5, 0, currentZ); const pR = project(LANE_SPACING * 3.5, 0, currentZ);
        const pL_next = project(-LANE_SPACING * 3.5, 0, currentZ - 80); const pR_next = project(LANE_SPACING * 3.5, 0, currentZ - 80);
        if (pL.scale > 0 && pL_next.scale > 0) {
            const alpha = Math.min(1, (2400 - currentZ) / 1000) * 0.15;
            ctx.fillStyle = `rgba(${config.rgb}, ${alpha})`; ctx.beginPath(); ctx.moveTo(pL.x, pL.y); ctx.lineTo(pR.x, pR.y); ctx.lineTo(pR_next.x, pR_next.y); ctx.lineTo(pL_next.x, pL_next.y); ctx.fill();
            ctx.strokeStyle = `rgba(${config.rgb}, ${pL.scale * 0.1})`; ctx.lineWidth = 1 * pL.scale; ctx.beginPath(); ctx.moveTo(project(-LANE_SPACING * 0.5, 0, currentZ).x, project(-LANE_SPACING * 0.5, 0, currentZ).y); ctx.lineTo(project(-LANE_SPACING * 0.5, 0, currentZ - 80).x, project(-LANE_SPACING * 0.5, 0, currentZ - 80).y); ctx.moveTo(project(LANE_SPACING * 0.5, 0, currentZ).x, project(LANE_SPACING * 0.5, 0, currentZ).y); ctx.lineTo(project(LANE_SPACING * 0.5, 0, currentZ - 80).x, project(LANE_SPACING * 0.5, 0, currentZ - 80).y); ctx.stroke();
        }
    }
    let sideWallWidth = canvas.width * 0.18;
    ctx.fillStyle = '#010203';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sideWallWidth, HORIZON_Y); ctx.lineTo(sideWallWidth * 1.2, canvas.height); ctx.lineTo(0, canvas.height); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(canvas.width, 0); ctx.lineTo(canvas.width - sideWallWidth, HORIZON_Y); ctx.lineTo(canvas.width - (sideWallWidth * 1.2), canvas.height); ctx.lineTo(canvas.width, canvas.height); ctx.closePath(); ctx.fill();
}

class Miner {
    constructor() {
        this.x = LANES_X[currentLane]; this.y = 0; this.z = 100; this.radius = 14; this.lerpFactor = 0.22;
        this.isJumping = false; this.vy = 0; this.gravity = 1.1; this.jumpStrength = -17;
        this.maxHp = 100; this.hp = this.maxHp; this.iFrames = 0;
        this.tilt = 0; this.bobAngle = 0; this.scaleX = 1; this.scaleY = 1;
        this.lightMaxRadius = 300 + (saveData.lightLvl - 1) * 65;
        this.magnetRange = (saveData.magnetLvl - 1) * 20;
        this.updateHpUI();
    }
    jump() { this.isJumping = true; this.vy = this.jumpStrength; this.scaleY = 0.7; this.scaleX = 1.3; SoundEngine.jump(); }
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
        let damageReduction = (saveData.hpLvl - 1) * 0.12;
        let finalDamage = amount * (1 - damageReduction);
        this.hp = Math.max(0, this.hp - finalDamage); this.iFrames = 40; this.updateHpUI(); SoundEngine.hit();
        screenShake = 22; damageFlashTime = 12; createExplosion(this.x, this.y - 15, this.z, 'var(--danger)', 20);
        if (this.hp <= 0) endGame("ARMADURA DESTRUIDA", "var(--danger)");
    }
    updateHpUI() { const ratio = this.hp / this.maxHp; uiHpBar.style.width = (ratio * 100) + '%'; uiHpText.innerText = Math.floor(ratio * 100) + '%'; }
    draw() {
        if (this.iFrames > 0 && Math.floor(frameCount / 3) % 2 === 0) return;
        const p = project(this.x, this.y, this.z); if (p.scale === 0) return; const s = p.scale; const r = this.radius * s; const currentBob = this.isJumping ? 0 : Math.sin(this.bobAngle) * 3 * s;
        ctx.save(); ctx.translate(p.x, p.y + currentBob); ctx.rotate(this.tilt); ctx.scale(this.scaleX, this.scaleY);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; ctx.beginPath(); ctx.ellipse(0, -this.y * s - currentBob, Math.max(5, r * (1 - Math.abs(this.y) / 250)), Math.max(2, r * 0.4), 0, 0, Math.PI * 2); ctx.fill();

        let shieldTones = ['#111', '#1a2430', '#253545', '#30465c', '#3c5875'];
        ctx.fillStyle = shieldTones[Math.min(saveData.hpLvl - 1, 4)];
        ctx.fillRect(-6 * s, -10 * s, 4 * s, 10 * s); ctx.fillRect(2 * s, -10 * s, 4 * s, 10 * s);

        ctx.fillStyle = BIOMAS_CONFIG[biomaActual].colorCore; ctx.fillRect(-6 * s, -5 * s, 4 * s, 2 * s); ctx.fillRect(2 * s, -5 * s, 4 * s, 2 * s);
        ctx.fillStyle = '#222'; ctx.fillRect(-9 * s, -28 * s, 18 * s, 18 * s);
        ctx.fillStyle = 'var(--primary)'; ctx.fillRect(-2 * s, -22 * s, 4 * s, 6 * s); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, -34 * s, 6 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = BIOMAS_CONFIG[biomaActual].colorCore; ctx.fillRect(-4 * s, -36 * s, 8 * s, 3.5 * s); ctx.restore();

        ctx.save(); const headY = p.y + (-34 * s) + currentBob; let currentLightRadius = this.lightMaxRadius;
        if (biomaActual === 'ABISO') { currentLightRadius *= (0.35 + Math.abs(Math.sin(frameCount * 0.1)) * 0.65); }
        let lightCone = ctx.createRadialGradient(p.x, headY, 0, p.x, headY + 300, currentLightRadius);
        lightCone.addColorStop(0, 'rgba(255, 255, 255, 0.6)'); lightCone.addColorStop(0.2, `rgba(${BIOMAS_CONFIG[biomaActual].rgb}, 0.15)`); lightCone.addColorStop(0.8, 'rgba(0, 0, 0, 0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lightCone; ctx.beginPath(); ctx.moveTo(p.x, headY);
        const sweepX = p.x + (this.tilt * 200); ctx.lineTo(sweepX - 170, headY + 450); ctx.lineTo(sweepX + 170, headY + 450); ctx.closePath(); ctx.fill(); ctx.restore();
    }
}

function evaluarBiomaPorProfundidad(dist) {
    let conf = CAMPANA_MISIONES[levelSelected]; let porc = dist / conf.metaDist; let prev = biomaActual;
    if (conf.biomaBase === 'CRIO') { biomaActual = porc < 0.6 ? 'CRIO' : 'MAGMA'; } else if (conf.biomaBase === 'MAGMA') { biomaActual = porc < 0.5 ? 'MAGMA' : 'ABISO'; } else { biomaActual = 'ABISO'; }
    if (prev !== biomaActual) {
        document.getElementById('lblBioma').innerText = BIOMAS_CONFIG[biomaActual].name;
        globalSpeed *= 1.35; screenShake = 35; damageFlashTime = 20; biomeAlertTimer = 120; SoundEngine.alert();
        createExplosion(0, CAMERA_Y, 400, BIOMAS_CONFIG[biomaActual].colorCore, 40);
    }
}

function checkCollision3D(pRef, eRef) {
    if (Math.abs(pRef.z - eRef.z) > 40) return false;
    if (eRef.type === 'gold') {
        let deltaX = Math.abs(pRef.x - eRef.x); let deltaY = Math.abs(pRef.y - eRef.y);
        if (deltaX < 26 && deltaY < 28) return true;
        return false;
    }
    if (currentLane !== eRef.lane) return false;
    if (eRef.type === 'obstacle_low' && pRef.y < -35) return false;
    return true;
}

function terminarVideo() {
    const videoOverlay = document.getElementById('videoContainer');
    const vid = document.getElementById('introVideo');
    if (vid) vid.pause();
    if (videoOverlay) videoOverlay.style.display = 'none';
    iniciarPartidaReal();
}

function iniciarPartidaReal() {
    let conf = CAMPANA_MISIONES[levelSelected]; views.hud.style.display = 'block';
    entityPool.forEach(e => e.active = false);
    globalSpeed = conf.vInicial; distanceTraveled = 0; goldCollected = 0; frameCount = 0; currentLane = 1;
    biomaActual = conf.biomaBase; biomeAlertTimer = 0; adUsedInRun = false;

    document.getElementById('lblBioma').innerText = BIOMAS_CONFIG[biomaActual].name;
    uiTargetGold.innerText = conf.cuota; uiMaxDist.innerText = `/ ${conf.metaDist}m`;
    player = new Miner(); uiGold.innerText = '0'; uiDist.innerText = '0'; uiGold.style.color = 'var(--text-main)';
    initAtmosphericDust(); currentState = 'PLAYING'; requestAnimationFrame(gameLoop);
}

function ejecutarInmersion() {
    views.briefing.style.display = 'none';
    if (levelSelected === 0 && !sessionStorage.getItem('introPlayed')) {
        sessionStorage.setItem('introPlayed', 'true');
        const videoOverlay = document.getElementById('videoContainer');
        const vid = document.getElementById('introVideo');
        if (videoOverlay && vid) {
            videoOverlay.style.display = 'flex';
            vid.src = '../assets/PRESENTACION_DEEPCAVERN.mp4';
            vid.play().catch(() => terminarVideo());
            vid.onended = terminarVideo;
            return;
        }
    }
    iniciarPartidaReal();
}

function reintentarMisionActual() { views.gameover.style.display = 'none'; ejecutarInmersion(); }
function abortarMisionAlMenu() { views.gameover.style.display = 'none'; switchView('map'); }

function activarAnuncioRevivir() {
    document.getElementById('btnRewardAd').style.display = 'none';
    goReason.innerHTML = "CONECTANDO CON SATÉLITE DE ENERGÍA...";
    setTimeout(() => {
        player.hp = player.maxHp;
        player.updateHpUI();
        views.gameover.style.display = 'none';
        views.hud.style.display = 'block';
        currentState = 'PLAYING';
        frameCount = 0;
        requestAnimationFrame(gameLoop);
        SoundEngine.alert();
    }, 3000);
}

function endGame(reason, color) {
    currentState = 'GAMEOVER'; views.hud.style.display = 'none'; goReason.innerHTML = reason; goReason.style.color = color;
    let conf = CAMPANA_MISIONES[levelSelected]; let finalDist = Math.floor(distanceTraveled / 10);
    let exito = (finalDist >= conf.metaDist) && (goldCollected >= conf.cuota);

    if (exito) {
        saveData.gold += goldCollected;
        if (levelSelected === saveData.maxNivelDesbloqueado && saveData.maxNivelDesbloqueado < CAMPANA_MISIONES.length - 1) saveData.maxNivelDesbloqueado++;
        saveGameData(); goReason.innerHTML = "MISIÓN CUMPLIDA"; goReason.style.color = "#00ff66";
        document.getElementById('btnRewardAd').style.display = 'none';
        goStats.innerHTML = `<span style='color:var(--text-main)'>Cristales conseguidos:</span> <span style='color:#ffcc00'>+${goldCollected}</span><br><br>Has alcanzado los ${finalDist}m y reparado el sector.`;
    } else {
        if (player.hp <= 0 && !adUsedInRun) {
            document.getElementById('btnRewardAd').style.display = 'block';
            adUsedInRun = true;
        } else {
            document.getElementById('btnRewardAd').style.display = 'none';
        }
        goStats.innerHTML = `Cristales obtenidos: ${goldCollected} / ${conf.cuota}<br>Profundidad: ${finalDist}m / ${conf.metaDist}m`;
    }
    views.gameover.style.display = 'flex';
}

function gameLoop() {
    if (currentState !== 'PLAYING') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save();
    if (screenShake > 0) { ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake); screenShake *= 0.88; if (screenShake < 0.2) screenShake = 0; }

    drawAtmosphericCave();
    for (let i = 0; i < particlePool.length; i++) { let p = particlePool[i]; if (p.active) { p.update(); p.draw(); } }

    distanceTraveled += globalSpeed; let currentDist = Math.floor(distanceTraveled / 10); uiDist.innerText = currentDist;
    evaluarBiomaPorProfundidad(currentDist);

    let conf = CAMPANA_MISIONES[levelSelected];
    if (currentDist >= conf.metaDist) { endGame("ZONA SEGURA ALCANZADA", "var(--primary)"); ctx.restore(); return; }

    player.update();
    if (frameCount % 42 === 0) spawnPatternChunk();

    let activeEntities = [];
    for (let i = 0; i < entityPool.length; i++) {
        let e = entityPool[i]; if (!e.active) continue;

        if (e.type === 'gold' && saveData.magnetLvl > 1 && e.z < 550) {
            let intensity = (saveData.magnetLvl - 1) * 0.035;
            e.x += (player.x - e.x) * intensity; e.y += (player.y - e.y) * intensity;
        }

        e.update();
        if (e.z > 60 && e.z < 140 && checkCollision3D(player, e)) {
            if (e.type === 'gold') {
                goldCollected++; uiGold.innerText = goldCollected; SoundEngine.coin();
                if (goldCollected >= conf.cuota) uiGold.style.color = '#00ff66';
                createExplosion(e.x, player.y - 10, e.z, '#ffcc00', 12); e.active = false;
            } else {
                player.takeDamage(e.type === 'obstacle_high' ? 34 : 25); e.active = false;
            }
        }
        if (e.active) activeEntities.push(e);
    }

    activeEntities.sort((a, b) => b.z - a.z);
    let playerDrawn = false;
    for (let i = 0; i < activeEntities.length; i++) {
        if (!playerDrawn && activeEntities[i].z < player.z) { player.draw(); playerDrawn = true; }
        activeEntities[i].draw();
    }
    if (!playerDrawn) player.draw();

    ctx.restore();
    if (damageFlashTime > 0) { ctx.fillStyle = `rgba(${BIOMAS_CONFIG[biomaActual].rgb}, ${damageFlashTime * 0.04})`; ctx.fillRect(0, 0, canvas.width, canvas.height); damageFlashTime--; }
    if (biomeAlertTimer > 0) {
        ctx.save(); ctx.fillStyle = BIOMAS_CONFIG[biomaActual].colorCore; ctx.font = "900 22px Orbitron"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(`CUEVA DETECTADA`, canvas.width / 2, canvas.height / 3); ctx.font = "700 16px 'Share Tech Mono'"; ctx.fillStyle = "#fff";
        ctx.fillText(BIOMAS_CONFIG[biomaActual].name.toUpperCase(), canvas.width / 2, canvas.height / 3 + 30); ctx.restore();
        biomeAlertTimer--;
    }
    frameCount++; requestAnimationFrame(gameLoop);
}

function menuLoop() {
    if (currentState !== 'MENU') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); distanceTraveled += 3; drawAtmosphericCave();
    for (let i = 0; i < particlePool.length; i++) { if (particlePool[i].active) { particlePool[i].update(); particlePool[i].draw(); } }
    frameCount++; requestAnimationFrame(menuLoop);
}

loadGameData(); resizeCanvas(); initAtmosphericDust(); currentState = 'MENU'; menuLoop();