const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elementos DOM
const hud = document.getElementById('hud');
const startMenu = document.getElementById('startMenu');
const gameOverMenu = document.getElementById('gameOverMenu');
const uiGold = document.getElementById('goldText');
const uiDist = document.getElementById('distText');
const uiHpBar = document.getElementById('hpBar');
const goReason = document.getElementById('gameOverReason');
const goStats = document.getElementById('finalStats');

// --- MATRIZ DE PROYECCIÓN ---
const FOV = 300;
const CAMERA_Y = -120;
const HORIZON_Y = canvas.height * 0.4;
const CENTER_X = canvas.width / 2;
const LANE_SPACING = 60;
const LANES_X = [-LANE_SPACING, 0, LANE_SPACING];

// --- ESTADO GLOBAL (FSM) ---
const TARGET_GOLD = 15;
const MAX_DISTANCE = 2500;

let currentState = 'MENU'; // MENU, PLAYING, GAMEOVER
let globalSpeed = 15;
let distanceTraveled = 0;
let goldCollected = 0;
let frameCount = 0;
let currentLane = 1;
let entities = [];
let player = null;

// --- ENTRADA HARDWARE ---
window.addEventListener('keydown', e => {
    if (currentState !== 'PLAYING') return;
    if ((e.code === 'KeyA' || e.code === 'ArrowLeft') && currentLane > 0) currentLane--;
    if ((e.code === 'KeyD' || e.code === 'ArrowRight') && currentLane < 2) currentLane++;
    if ((e.code === 'Space' || e.code === 'ArrowUp') && !player.isJumping) player.jump();
});

function project(x, y, z) {
    if (z <= 0) return { scale: 0, x: 0, y: 0 };
    const scale = FOV / z;
    return {
        x: CENTER_X + (x * scale),
        y: HORIZON_Y + ((y - CAMERA_Y) * scale),
        scale: scale
    };
}

class Miner {
    constructor() {
        this.x = LANES_X[currentLane];
        this.y = 0;
        this.z = 100;
        this.radius = 15;
        this.lerpFactor = 0.2;

        // Cinemática Ajustada
        this.isJumping = false;
        this.vy = 0;
        this.gravity = 1.1; // Incremento de fuerza de atracción
        this.jumpStrength = -18; // Reducción de delta vectorial inicial

        this.maxHp = 100;
        this.hp = 100;
        this.iFrames = 0;
        this.updateHpUI();
    }

    jump() {
        this.isJumping = true;
        this.vy = this.jumpStrength;
    }

    update() {
        this.x = this.x + (LANES_X[currentLane] - this.x) * this.lerpFactor;

        if (this.isJumping) {
            this.vy += this.gravity;
            this.y += this.vy;
            if (this.y >= 0) {
                this.y = 0;
                this.isJumping = false;
                this.vy = 0;
            }
        }

        if (this.iFrames > 0) this.iFrames--;
    }

    takeDamage(amount) {
        if (this.iFrames > 0) return;
        this.hp = Math.max(0, this.hp - amount);
        this.iFrames = 30; // Reducido a medio segundo a 60FPS

        this.updateHpUI();

        if (this.hp <= 0) endGame("DAÑO CRÍTICO ESTRUCTURAL", "#f44336");
    }

    updateHpUI() {
        const ratio = this.hp / this.maxHp;
        uiHpBar.style.width = (ratio * 100) + '%';
        // LERP Cromático mediante espacio cilíndrico HSL
        const hue = Math.floor(120 * ratio);
        uiHpBar.style.backgroundColor = `hsl(${hue}, 100%, 40%)`;
    }

    draw() {
        if (this.iFrames > 0 && Math.floor(frameCount / 4) % 2 === 0) return;

        const p = project(this.x, this.y, this.z);
        if (p.scale === 0) return;
        const r = this.radius * p.scale;

        // Sombra de oclusión
        const shadow = project(this.x, 0, this.z);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.ellipse(shadow.x, shadow.y, r, r / 2, 0, 0, Math.PI * 2); ctx.fill();

        // Geometría del personaje
        ctx.fillStyle = '#ffdbac';
        ctx.beginPath(); ctx.arc(p.x, p.y - (10 * p.scale), r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd700';
        ctx.beginPath(); ctx.arc(p.x, p.y - (15 * p.scale), r * 1.1, Math.PI, 0); ctx.fill();
    }
}

class Entity3D {
    constructor(laneIndex, type) {
        this.x = LANES_X[laneIndex];
        this.y = 0;
        this.z = 3000;
        this.type = type;
        this.baseRadius = type === 'obstacle_high' ? 22 : 12;
        this.markedForDeletion = false;
    }

    update() {
        this.z -= globalSpeed;
        if (this.z < 10) this.markedForDeletion = true;
    }

    draw() {
        const p = project(this.x, this.y, this.z);
        if (p.scale === 0) return;
        const r = this.baseRadius * p.scale;

        if (this.type === 'obstacle_high') {
            ctx.fillStyle = '#2a013a';
            ctx.fillRect(p.x - r, p.y - r * 3, r * 2, r * 3);
            ctx.fillStyle = '#6a0dad';
            ctx.fillRect(p.x - r, p.y - r * 3, r * 2, r * 0.5);
        } else if (this.type === 'obstacle_low') {
            // Geometría de Alta Visibilidad (Barrera de peligro)
            ctx.fillStyle = '#ffff00'; // Base amarilla brillante
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - r * 2);
            ctx.lineTo(p.x - r * 1.5, p.y);
            ctx.lineTo(p.x + r * 1.5, p.y);
            ctx.fill();

            // Detalle de contraste (Triángulo central negro)
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - r * 1.2);
            ctx.lineTo(p.x - r * 0.8, p.y);
            ctx.lineTo(p.x + r * 0.8, p.y);
            ctx.fill();

            // Cúspide de advertencia
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(p.x, p.y - r * 2, r * 0.3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(p.x, p.y - r, r, 0, Math.PI * 2); ctx.fill();
        }
    }
}

// --- FUNCIONES DE CONTROL DE ESTADO ---
function startGame() {
    // Limpieza de memoria e inicialización
    globalSpeed = 15;
    distanceTraveled = 0;
    goldCollected = 0;
    frameCount = 0;
    currentLane = 1;
    entities = [];

    player = new Miner();

    uiGold.innerText = '0';
    uiGold.style.color = '#ffd700';
    uiDist.innerText = '0';

    startMenu.style.display = 'none';
    gameOverMenu.style.display = 'none';
    hud.style.display = 'block';

    currentState = 'PLAYING';
    requestAnimationFrame(gameLoop);
}

function endGame(reason, color) {
    currentState = 'GAMEOVER';
    hud.style.display = 'none';
    goReason.innerHTML = reason;
    goReason.style.color = color;
    goStats.innerHTML = `Masa de Oro: ${goldCollected}/${TARGET_GOLD} <br> Distancia Recorrida: ${Math.floor(distanceTraveled / 10)}m`;
    gameOverMenu.style.display = 'flex';
}

function spawnEntities() {
    // Generar cada 25 frames en lugar de 35
    if (frameCount % 25 === 0) {
        const lane = Math.floor(Math.random() * 3);
        const rand = Math.random();
        let type = 'gold';

        // Nueva distribución probabilística
        if (rand > 0.8) {
            type = 'obstacle_high';
        } else if (rand > 0.6) {
            type = 'obstacle_low';
        }
        // 60% de probabilidad (0.0 a 0.6) cae en 'gold' por defecto

        entities.push(new Entity3D(lane, type));
    }
}

function checkCollision3D(player, entity) {
    if (Math.abs(player.z - entity.z) > 30) return false;
    if (Math.abs(player.x - entity.x) > 20) return false;
    if (entity.type === 'obstacle_low' && player.y < -35) return false;
    return true;
}

function drawEnvironment() {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    const laneBorders = [-LANE_SPACING * 1.5, -LANE_SPACING * 0.5, LANE_SPACING * 0.5, LANE_SPACING * 1.5];

    for (let bx of laneBorders) {
        const pNear = project(bx, 0, 10);
        const pFar = project(bx, 0, 3000);
        ctx.beginPath(); ctx.moveTo(pNear.x, pNear.y); ctx.lineTo(pFar.x, pFar.y); ctx.stroke();
    }

    const tileZOffset = distanceTraveled % 200;
    for (let z = 100; z < 3000; z += 200) {
        const pL = project(-LANE_SPACING * 1.5, 0, z - tileZOffset);
        const pR = project(LANE_SPACING * 1.5, 0, z - tileZOffset);
        if (pL.scale > 0) {
            ctx.beginPath(); ctx.moveTo(pL.x, pL.y); ctx.lineTo(pR.x, pR.y); ctx.stroke();
        }
    }
}

// --- BUCLE PRINCIPAL ---
function gameLoop() {
    if (currentState !== 'PLAYING') return; // Interrupción del bucle por FSM

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    distanceTraveled += globalSpeed;
    if (frameCount % 300 === 0) globalSpeed += 0.5;

    let currentDist = Math.floor(distanceTraveled / 10);
    uiDist.innerText = currentDist;

    // Condición de Victoria / Fallo por Cuota
    if (currentDist >= MAX_DISTANCE) {
        if (goldCollected >= TARGET_GOLD) {
            endGame("ZONA DE EXTRACCIÓN ALCANZADA.<br>SUPERVIVENCIA EXITOSA.", "#4caf50");
        } else {
            endGame(`FALLO DE CUOTA.<br>FALTÓ ORO (${goldCollected}/${TARGET_GOLD}).`, "#ff9800");
        }
        return;
    }

    drawEnvironment();
    player.update();
    spawnEntities();

    // Análisis de Lógica Física
    for (let i = entities.length - 1; i >= 0; i--) {
        entities[i].update();

        if (entities[i].z > 80 && entities[i].z < 130) {
            if (checkCollision3D(player, entities[i])) {
                if (entities[i].type === 'gold') {
                    goldCollected++;
                    uiGold.innerText = goldCollected;
                    if (goldCollected >= TARGET_GOLD) uiGold.style.color = '#4caf50';
                    entities[i].markedForDeletion = true;
                } else {
                    // Penalización algorítmica: 34 puntos por golpe (3 golpes = muerte)
                    player.takeDamage(34);
                    entities[i].markedForDeletion = true;
                }
            }
        }
        if (entities[i].markedForDeletion) entities.splice(i, 1);
    }

    // Algoritmo del Pintor (Renderizado por profundidad z)
    entities.sort((a, b) => b.z - a.z);

    let playerDrawn = false;
    for (let e of entities) {
        if (!playerDrawn && e.z < player.z) {
            player.draw();
            playerDrawn = true;
        }
        e.draw();
    }
    if (!playerDrawn) player.draw();

    frameCount++;
    requestAnimationFrame(gameLoop);
}

// Fase inicial de renderizado pasivo del menú (sin ejecutar lógica térmica del juego)
ctx.fillStyle = '#0a0a1a';
ctx.fillRect(0, 0, canvas.width, canvas.height);
drawEnvironment();


// --- INTERFAZ TÁCTIL PARA MÓVILES ---
window.addEventListener('touchstart', e => {
    // Prevenir el comportamiento por defecto (scroll, zoom)
    e.preventDefault();

    if (currentState === 'MENU') {
        startGame();
        return;
    }
    if (currentState === 'GAMEOVER') {
        startGame();
        return;
    }

    if (currentState !== 'PLAYING') return;

    // Procesar cada dedo que toca la pantalla
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        // Normalizamos la posición del toque (0.0 a 1.0) relativa al ancho/alto de la pantalla
        const touchX = touch.clientX / window.innerWidth;
        const touchY = touch.clientY / window.innerHeight;

        // Lógica de partición espacial:
        // Mitad superior de la pantalla = Salto
        if (touchY < 0.5 && !player.isJumping) {
            player.jump();
        }
        // Mitad inferior izquierda (Tercio 0.0 - 0.33)
        else if (touchX < 0.33 && currentLane > 0) {
            currentLane--;
        }
        // Mitad inferior derecha (Tercio 0.66 - 1.0)
        else if (touchX > 0.66 && currentLane < 2) {
            currentLane++;
        }
        // Centro inferior (Tercio 0.33 - 0.66) = Salto alternativo
        else if (touchX >= 0.33 && touchX <= 0.66 && !player.isJumping) {
            player.jump();
        }
    }
}, { passive: false }); // { passive: false } es crucial para que e.preventDefault() funcione en móviles