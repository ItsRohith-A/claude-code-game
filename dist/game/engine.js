"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Engine = exports.ENEMY_SPECS = void 0;
exports.glyphFor = glyphFor;
exports.colorFor = colorFor;
const events_1 = require("../events");
exports.ENEMY_SPECS = {
    scout: { hp: 1, points: 50, speed: 5.2, shoots: false },
    bug: { hp: 2, points: 120, speed: 2.6, shoots: false },
    probe: { hp: 3, points: 240, speed: 1.9, shoots: true },
};
const BULLET_SPEED = 34;
const ENEMY_BULLET_SPEED = 11;
const BASE_FIRE_DELAY = 0.17;
const RAPID_FIRE_DELAY = 0.07;
const INVULN_TIME = 1.4;
const COMBO_WINDOW = 3.0;
/** With no events arriving, trickle in targets so the game stands on its own. */
const IDLE_SPAWN_DELAY = 2.4;
/** Events that prove Claude is working again, which clears the attention banner. */
const RESUMING_EVENTS = new Set([
    "tool_pending",
    "bug",
    "scout",
    "probe",
    "powerup",
    "turn_start",
    "wave_clear",
]);
class Engine {
    width;
    height;
    playerX;
    lives = events_1.MAX_LIVES;
    score = 0;
    wave = 1;
    combo = 0;
    status = "playing";
    /** Why the game is showing the attention banner. */
    attentionNote = "";
    enemies = [];
    bullets = [];
    enemyBullets = [];
    powerups = [];
    particles = [];
    log = [];
    shieldTime = 0;
    rapidTime = 0;
    spreadTime = 0;
    invulnTime = 0;
    /** Set for a few frames after taking damage so the renderer can flash. */
    shakeTime = 0;
    bannerText = "";
    bannerTime = 0;
    comboTimer = 0;
    fireCooldown = 0;
    holdFire = false;
    nextId = 1;
    idleTimer = 0;
    pendingSpawns = [];
    spawnDrip = 0;
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.playerX = Math.floor(width / 2);
    }
    reset() {
        this.playerX = Math.floor(this.width / 2);
        this.lives = events_1.MAX_LIVES;
        this.score = 0;
        this.wave = 1;
        this.combo = 0;
        this.status = "playing";
        this.enemies = [];
        this.bullets = [];
        this.enemyBullets = [];
        this.powerups = [];
        this.particles = [];
        this.pendingSpawns = [];
        this.shieldTime = 0;
        this.rapidTime = 0;
        this.spreadTime = 0;
        this.invulnTime = 0;
        this.fireCooldown = 0;
        this.pushLog("new run - good luck", "green");
        this.banner("GET READY");
    }
    // ---------------------------------------------------------------- input ---
    apply(command) {
        switch (command) {
            case "fire":
                this.holdFire = true;
                break;
            case "restart":
                if (this.status === "gameover")
                    this.reset();
                break;
            case "pause":
                if (this.status === "playing")
                    this.status = "paused";
                else if (this.status === "paused" || this.status === "attention") {
                    this.status = "playing";
                    // A moment of grace so you are not shot the instant you return.
                    this.invulnTime = Math.max(this.invulnTime, 1.0);
                }
                break;
            case "left":
                this.moveBy(-2);
                break;
            case "right":
                this.moveBy(2);
                break;
            default:
                break;
        }
    }
    moveBy(cells) {
        if (this.status !== "playing")
            return;
        this.playerX = Math.max(1, Math.min(this.width - 2, this.playerX + cells));
    }
    // ------------------------------------------------------------ game feed ---
    /** Translate one real Claude Code event into something on screen. */
    ingest(event) {
        const tool = event.tool ?? "";
        const label = event.label;
        const weight = Math.max(1, Math.min(6, event.weight ?? 1));
        // Claude only resumes calling tools once the human has answered the
        // prompt that interrupted us, so any work event clears the banner.
        if (this.status === "attention" && RESUMING_EVENTS.has(event.kind)) {
            this.status = "playing";
            this.invulnTime = Math.max(this.invulnTime, 1.0);
        }
        switch (event.kind) {
            case "session_start":
                this.pushLog("session started", "cyan");
                break;
            case "turn_start":
                this.pushLog("you asked Claude to work", "white");
                this.banner(`WAVE ${this.wave}`);
                break;
            case "tool_pending":
                // Telegraph only: the enemy itself arrives on the matching post-tool.
                if (tool)
                    this.pushLog(`- ${tool}${label ? " " + label : ""}`, "dim");
                break;
            case "bug":
                for (let i = 0; i < weight; i++)
                    this.queueSpawn("bug", label);
                this.pushLog(`edit ${label ?? tool} -> bug`, "magenta");
                break;
            case "scout":
                for (let i = 0; i < weight; i++)
                    this.queueSpawn("scout", label);
                break;
            case "probe":
                for (let i = 0; i < weight; i++)
                    this.queueSpawn("probe", label);
                this.pushLog(`${tool} -> probe`, "yellow");
                break;
            case "powerup":
                this.dropPowerup();
                this.pushLog(`${label ?? tool} passed`, "green");
                break;
            case "damage":
                this.pushLog(`${tool} failed`, "red");
                this.hurt();
                break;
            case "attention":
                if (this.status === "playing" || this.status === "paused")
                    this.status = "attention";
                this.attentionNote = event.label ?? "Claude needs you";
                break;
            case "resume":
                if (this.status === "attention")
                    this.status = "playing";
                break;
            case "wave_clear": {
                const bonus = 250 * this.wave;
                this.score += bonus;
                this.wave += 1;
                this.pushLog(`turn done - wave bonus +${bonus}`, "cyan");
                this.banner(`WAVE CLEAR  +${bonus}`);
                if (this.status === "attention")
                    this.status = "playing";
                break;
            }
            case "session_end":
                this.pushLog("session ended", "dim");
                break;
        }
    }
    queueSpawn(type, label) {
        // Spread arrivals out over time instead of dumping a wall of enemies the
        // instant a batch of tool calls lands.
        if (this.pendingSpawns.length < 60)
            this.pendingSpawns.push({ type, label });
    }
    spawn(type, label) {
        const spec = exports.ENEMY_SPECS[type];
        const difficulty = 1 + (this.wave - 1) * 0.07;
        this.enemies.push({
            id: this.nextId++,
            type,
            x: 1 + Math.random() * (this.width - 3),
            y: 0,
            vx: type === "scout" ? (Math.random() - 0.5) * 7 : (Math.random() - 0.5) * 2.5,
            vy: spec.speed * difficulty * (0.85 + Math.random() * 0.3),
            hp: spec.hp,
            hitFlash: 0,
            fireIn: 0.8 + Math.random() * 2.2,
            label,
        });
    }
    dropPowerup() {
        const roll = Math.random();
        // An extra life is the rare prize; the rest are common and short-lived.
        const type = roll < 0.08 && this.lives < events_1.MAX_LIVES
            ? "life"
            : roll < 0.4
                ? "spread"
                : roll < 0.72
                    ? "rapid"
                    : "shield";
        this.powerups.push({
            id: this.nextId++,
            type,
            x: 2 + Math.random() * (this.width - 4),
            y: 0,
        });
    }
    // ------------------------------------------------------------- stepping ---
    step(dt) {
        if (this.bannerTime > 0)
            this.bannerTime -= dt;
        if (this.shakeTime > 0)
            this.shakeTime -= dt;
        // Particles keep animating even while paused so the screen never looks dead.
        this.stepParticles(dt);
        if (this.status !== "playing") {
            this.holdFire = false;
            return;
        }
        if (this.invulnTime > 0)
            this.invulnTime -= dt;
        if (this.shieldTime > 0)
            this.shieldTime -= dt;
        if (this.rapidTime > 0)
            this.rapidTime -= dt;
        if (this.spreadTime > 0)
            this.spreadTime -= dt;
        this.stepCombo(dt);
        this.stepSpawning(dt);
        this.stepFiring(dt);
        this.stepBullets(dt);
        this.stepEnemies(dt);
        this.stepPowerups(dt);
        this.resolveHits();
    }
    stepCombo(dt) {
        if (this.combo > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0)
                this.combo = 0;
        }
    }
    stepSpawning(dt) {
        this.spawnDrip -= dt;
        if (this.spawnDrip <= 0 && this.pendingSpawns.length > 0) {
            const next = this.pendingSpawns.shift();
            if (next)
                this.spawn(next.type, next.label);
            // Drain faster when a big batch is waiting.
            this.spawnDrip = this.pendingSpawns.length > 8 ? 0.08 : 0.3;
            this.idleTimer = 0;
            return;
        }
        if (this.pendingSpawns.length === 0) {
            this.idleTimer += dt;
            if (this.idleTimer >= IDLE_SPAWN_DELAY && this.enemies.length < 4) {
                this.idleTimer = 0;
                this.spawn(Math.random() < 0.8 ? "scout" : "bug");
            }
        }
    }
    stepFiring(dt) {
        if (this.fireCooldown > 0)
            this.fireCooldown -= dt;
        if (!this.holdFire)
            return;
        this.holdFire = false;
        if (this.fireCooldown > 0)
            return;
        this.fireCooldown = this.rapidTime > 0 ? RAPID_FIRE_DELAY : BASE_FIRE_DELAY;
        const y = this.height - 2;
        this.bullets.push({ x: this.playerX, y, vy: -BULLET_SPEED });
        if (this.spreadTime > 0) {
            this.bullets.push({ x: this.playerX - 1.5, y, vy: -BULLET_SPEED });
            this.bullets.push({ x: this.playerX + 1.5, y, vy: -BULLET_SPEED });
        }
    }
    stepBullets(dt) {
        for (const b of this.bullets)
            b.y += b.vy * dt;
        this.bullets = this.bullets.filter((b) => b.y > 0);
        for (const b of this.enemyBullets)
            b.y += b.vy * dt;
        this.enemyBullets = this.enemyBullets.filter((b) => b.y < this.height - 1);
    }
    stepEnemies(dt) {
        const survivors = [];
        for (const e of this.enemies) {
            e.y += e.vy * dt;
            e.x += e.vx * dt;
            if (e.hitFlash > 0)
                e.hitFlash -= dt;
            // Bounce off the walls instead of sliding along them.
            if (e.x < 1) {
                e.x = 1;
                e.vx = Math.abs(e.vx);
            }
            else if (e.x > this.width - 2) {
                e.x = this.width - 2;
                e.vx = -Math.abs(e.vx);
            }
            if (exports.ENEMY_SPECS[e.type].shoots) {
                e.fireIn -= dt;
                if (e.fireIn <= 0) {
                    e.fireIn = 1.6 + Math.random() * 2.4;
                    this.enemyBullets.push({ x: e.x, y: e.y + 1, vy: ENEMY_BULLET_SPEED });
                }
            }
            // Anything that reaches the floor gets through and costs a life.
            if (e.y >= this.height - 2) {
                this.burst(e.x, this.height - 2, "red");
                this.pushLog(`${glyphFor(e.type)} broke through`, "red");
                this.hurt();
                continue;
            }
            survivors.push(e);
        }
        this.enemies = survivors;
    }
    stepPowerups(dt) {
        for (const p of this.powerups)
            p.y += 4.5 * dt;
        this.powerups = this.powerups.filter((p) => {
            if (p.y < this.height - 2)
                return true;
            // Picked up only if the ship is under it when it lands.
            if (Math.abs(p.x - this.playerX) <= 2)
                this.collect(p.type);
            return false;
        });
    }
    stepParticles(dt) {
        for (const p of this.particles) {
            p.life -= dt;
            p.y += dt * 2;
        }
        this.particles = this.particles.filter((p) => p.life > 0);
    }
    resolveHits() {
        // Player bullets vs enemies.
        const spentBullets = new Set();
        for (const b of this.bullets) {
            for (const e of this.enemies) {
                if (e.hp > 0 && Math.abs(e.x - b.x) < 1.2 && Math.abs(e.y - b.y) < 1.0) {
                    spentBullets.add(b);
                    e.hp -= 1;
                    e.hitFlash = 0.12;
                    if (e.hp <= 0)
                        this.kill(e);
                    break;
                }
            }
        }
        if (spentBullets.size > 0)
            this.bullets = this.bullets.filter((b) => !spentBullets.has(b));
        this.enemies = this.enemies.filter((e) => e.hp > 0);
        const playerY = this.height - 2;
        // Enemy bullets vs player.
        const spentEnemyBullets = new Set();
        for (const b of this.enemyBullets) {
            if (Math.abs(b.x - this.playerX) < 1.2 && Math.abs(b.y - playerY) < 1.0) {
                spentEnemyBullets.add(b);
                this.hurt();
            }
        }
        if (spentEnemyBullets.size > 0) {
            this.enemyBullets = this.enemyBullets.filter((b) => !spentEnemyBullets.has(b));
        }
        // Enemies ramming the ship.
        for (const e of this.enemies) {
            if (Math.abs(e.x - this.playerX) < 1.4 && Math.abs(e.y - playerY) < 1.2) {
                this.burst(e.x, e.y, "red");
                e.hp = 0;
                this.hurt();
            }
        }
        this.enemies = this.enemies.filter((e) => e.hp > 0);
    }
    kill(e) {
        this.combo += 1;
        this.comboTimer = COMBO_WINDOW;
        const multiplier = 1 + Math.floor(this.combo / 5) * 0.5;
        this.score += Math.round(exports.ENEMY_SPECS[e.type].points * multiplier);
        this.burst(e.x, e.y, colorFor(e.type));
    }
    collect(type) {
        switch (type) {
            case "shield":
                this.shieldTime = 10;
                this.pushLog("shield up (10s)", "cyan");
                break;
            case "spread":
                this.spreadTime = 12;
                this.pushLog("spread shot (12s)", "yellow");
                break;
            case "rapid":
                this.rapidTime = 12;
                this.pushLog("rapid fire (12s)", "green");
                break;
            case "life":
                this.lives = Math.min(events_1.MAX_LIVES, this.lives + 1);
                this.pushLog("extra life!", "magenta");
                break;
        }
        this.burst(this.playerX, this.height - 2, "cyan");
    }
    hurt() {
        if (this.status !== "playing")
            return;
        if (this.invulnTime > 0)
            return;
        if (this.shieldTime > 0) {
            this.shieldTime = 0;
            this.invulnTime = INVULN_TIME;
            this.pushLog("shield absorbed it", "cyan");
            this.shakeTime = 0.2;
            return;
        }
        this.lives -= 1;
        this.combo = 0;
        this.invulnTime = INVULN_TIME;
        this.shakeTime = 0.35;
        this.burst(this.playerX, this.height - 2, "red");
        if (this.lives <= 0) {
            this.lives = 0;
            this.status = "gameover";
            this.banner("GAME OVER");
            this.pushLog(`game over - ${this.score} pts`, "red");
        }
    }
    burst(x, y, color) {
        const glyphs = ["*", "+", ".", "x"];
        for (let i = 0; i < 7; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 3,
                y: y + (Math.random() - 0.5) * 2,
                life: 0.18 + Math.random() * 0.3,
                glyph: glyphs[i % glyphs.length] ?? "*",
                color,
            });
        }
    }
    banner(text) {
        this.bannerText = text;
        this.bannerTime = 1.6;
    }
    pushLog(text, color) {
        this.log.push({ text, color, at: Date.now() });
        if (this.log.length > 40)
            this.log.splice(0, this.log.length - 40);
    }
}
exports.Engine = Engine;
function glyphFor(type) {
    switch (type) {
        case "scout":
            return "v";
        case "bug":
            return "#";
        case "probe":
            return "O";
    }
}
function colorFor(type) {
    switch (type) {
        case "scout":
            return "cyan";
        case "bug":
            return "magenta";
        case "probe":
            return "yellow";
    }
}
