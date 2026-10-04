import type { GameEvent, GameEventKind } from "../events";
import {
  BOSS_EVERY,
  BOSSES,
  ENEMY_SPECS,
  NO_MUTATOR,
  POWERUP_SPECS,
  difficultySpec,
  TIMED_POWERUPS,
  modeSpec,
  type BossPattern,
  type BossSpec,
  type DifficultyId,
  type DifficultySpec,
  type EnemyType,
  type ModeId,
  type ModeSpec,
  type MutatorSpec,
  type PowerupType,
} from "./content";

export { ENEMY_SPECS, type EnemyType, type PowerupType } from "./content";

export type Command =
  | "left"
  | "right"
  | "up"
  | "down"
  | "fire"
  | "confirm"
  | "back"
  | "bomb"
  | "restart"
  | "pause"
  | "menu"
  | "none";
export type RunStatus = "playing" | "paused" | "attention" | "gameover";

export interface BossState {
  spec: BossSpec;
  attackIn: number;
  patternIndex: number;
  /** Phase of the side-to-side sweep, accumulated so a change of pace never jumps. */
  sweep: number;
}

export interface Enemy {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  hitFlash: number;
  /** Seconds until this enemy may act again: fire, or launch a scout. */
  fireIn: number;
  /** Seconds alive, for wobble and sweep motion. */
  age: number;
  points: number;
  label?: string;
  boss?: BossState;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Laser shots pass through, hitting each enemy once. */
  pierce?: boolean;
  hit?: number[];
  /** Fired by the wingman: does not count toward accuracy. */
  ally?: boolean;
}

export interface Powerup {
  id: number;
  type: PowerupType;
  x: number;
  y: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  glyph: string;
  color: string;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

export interface Star {
  x: number;
  y: number;
  speed: number;
}

export interface Toast {
  title: string;
  text: string;
  color: string;
  life: number;
}

export interface LogLine {
  text: string;
  color: string;
  at: number;
}

/** Everything a run did, for the summary screen, achievements and the profile. */
export interface RunStats {
  kills: number;
  shots: number;
  hits: number;
  maxCombo: number;
  bosses: number;
  powerups: number;
  testsPassed: number;
  perfectWaves: number;
  wavesCleared: number;
  bombsUsed: number;
  bombKillsBest: number;
  elapsed: number;
  toolEvents: number;
  fevers: number;
  maxActive: number;
  maxBombs: number;
  allies: number;
  supplies: number;
  clutchBoss: boolean;
}

export function emptyStats(): RunStats {
  return {
    kills: 0,
    shots: 0,
    hits: 0,
    maxCombo: 0,
    bosses: 0,
    powerups: 0,
    testsPassed: 0,
    perfectWaves: 0,
    wavesCleared: 0,
    bombsUsed: 0,
    bombKillsBest: 0,
    elapsed: 0,
    toolEvents: 0,
    fevers: 0,
    maxActive: 0,
    maxBombs: 0,
    allies: 0,
    supplies: 0,
    clutchBoss: false,
  };
}

/** Sounds the front end may play: the engine itself never touches a terminal. */
export type Cue = "hit" | "boss" | "boss_down" | "gameover" | "fever";

export interface EngineOptions {
  mode?: ModeId;
  /** Daily runs set one; everything else plays straight. */
  mutator?: MutatorSpec;
  difficulty?: DifficultyId;
  /** Swap in a seeded generator for daily runs and tests. */
  rng?: () => number;
}

const BULLET_SPEED = 34;
const ENEMY_BULLET_SPEED = 11;
const BASE_FIRE_DELAY = 0.17;
const RAPID_FIRE_DELAY = 0.07;
const WINGMAN_FIRE_DELAY = 0.3;
const INVULN_TIME = 1.4;
const COMBO_WINDOW = 3.0;
/** Combo multiplier stops growing here, so one long streak cannot break the board. */
const MAX_MULTIPLIER = 5;
/** Every this many combo kills starts a fever. */
const FEVER_EVERY = 25;
const FEVER_TIME = 8;
/** With no events arriving, trickle in targets so the game stands on its own. */
const IDLE_SPAWN_DELAY = 2.4;
/** Seconds without Claude spawning anything before formations fly in. */
const QUIET_BEFORE_FORMATIONS = 8;
const FORMATION_EVERY = 14;
/** Enemies never get faster than this, however long the session runs. */
const MAX_SPEED_FACTOR = 1.8;
const KILL_DROP_CHANCE = 0.05;
export const MAX_BOMBS = 3;
const START_BOMBS = 1;
const SLOW_FACTOR = 0.45;
const BREAK_BETWEEN_WAVES = 2.5;
/** Cells the ship moves per key press; auto-repeat makes a held key glide. */
export const MOVE_STEP = 2;

/** Tool results: proof Claude is working, which may clear the attention banner. */
const WORK_EVENTS = new Set<GameEventKind>([
  "bug",
  "splitter",
  "scout",
  "diver",
  "probe",
  "carrier",
  "powerup",
  "damage",
]);
/** A turn starting or ending always means the human has answered. */
const TURN_EVENTS = new Set<GameEventKind>(["turn_start", "wave_clear"]);
/** Event kinds that put an enemy on the field. */
const SPAWN_EVENTS: Partial<Record<GameEventKind, EnemyType>> = {
  bug: "bug",
  splitter: "splitter",
  scout: "scout",
  diver: "diver",
  probe: "probe",
  carrier: "carrier",
};
/**
 * Hooks run concurrently, so a tool that finished just before the permission
 * prompt can land after it. Unrelated work only clears the banner once it is
 * clearly newer than the prompt.
 */
const ATTENTION_SETTLE_MS = 1500;

type Formation = "v" | "line" | "rain";

interface SpawnOrder {
  type: EnemyType;
  label?: string;
  formation?: Formation;
}

export class Engine {
  readonly width: number;
  readonly height: number;
  readonly mode: ModeSpec;
  readonly mutator: MutatorSpec;
  readonly difficulty: DifficultySpec;
  /** The mutator and the difficulty folded into one set of multipliers. */
  private readonly tuning: Pick<MutatorSpec, "speed" | "hp" | "spawns" | "enemyFire" | "drops" | "score">;
  private readonly rng: () => number;

  playerX: number;
  maxLives: number;
  lives: number;
  score = 0;
  wave = 1;
  combo = 0;
  bombs = START_BOMBS;

  status: RunStatus = "playing";
  /** Why the game is showing the attention banner. */
  attentionNote = "";
  /** The tool call the banner is waiting on, and when the banner went up. */
  private attentionId: string | undefined;
  private attentionAt = 0;

  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  enemyBullets: Bullet[] = [];
  powerups: Powerup[] = [];
  particles: Particle[] = [];
  popups: Popup[] = [];
  stars: Star[] = [];
  toasts: Toast[] = [];
  log: LogLine[] = [];
  cues: Cue[] = [];
  stats: RunStats = emptyStats();

  /** Seconds left on each timed power-up. */
  timers: Record<PowerupType, number> = {
    shield: 0,
    spread: 0,
    rapid: 0,
    life: 0,
    laser: 0,
    bomb: 0,
    magnet: 0,
    slow: 0,
    wingman: 0,
  };
  feverTime = 0;
  invulnTime = 0;

  /** Set for a few frames after taking damage so the renderer can flash. */
  shakeTime = 0;
  /** A bomb lights the whole field for a moment. */
  flashTime = 0;
  bannerText = "";
  bannerTime = 0;
  /** Total time the run has been on screen, paused or not, for animation. */
  clock = 0;

  private comboTimer = 0;
  private fireCooldown = 0;
  private wingmanCooldown = 0;
  private holdFire = false;
  private nextId = 1;
  private idleTimer = 0;
  private quietTime = 0;
  private formationTimer = 0;
  private pendingSpawns: SpawnOrder[] = [];
  private spawnDrip = 0;
  private hitThisWave = false;
  private bossesSpawned = 0;
  private bossWave = 0;

  /** The built-in wave director, for modes whose waves are not Claude's turns. */
  private plan: SpawnOrder[] = [];
  private planDrip = 0;
  private breakTime = BREAK_BETWEEN_WAVES;

  constructor(width: number, height: number, options: EngineOptions = {}) {
    this.width = width;
    this.height = height;
    this.mode = modeSpec(options.mode ?? "storm");
    this.mutator = options.mutator ?? NO_MUTATOR;
    this.difficulty = difficultySpec(options.difficulty);
    const d = this.difficulty;
    const m = this.mutator;
    this.tuning = {
      speed: m.speed * d.speed,
      hp: m.hp * d.hp,
      spawns: m.spawns * d.spawns,
      enemyFire: m.enemyFire * d.enemyFire,
      drops: m.drops * d.drops,
      score: m.score * d.score,
    };
    this.rng = options.rng ?? Math.random;
    this.playerX = Math.floor(width / 2);
    this.maxLives = this.mutator.lives ?? this.difficulty.lives;
    this.lives = this.maxLives;
    const starCount = Math.floor((width * height) / 28);
    for (let i = 0; i < starCount; i++) {
      this.stars.push({ x: this.rng() * width, y: this.rng() * height, speed: 1 + this.rng() * 5 });
    }
    this.pushLog(this.mode.claudeFed ? "new run - good luck" : "daily run - same seed for all", "green");
    this.banner(this.mutator.name ? `${this.mode.name}: ${this.mutator.name}` : "GET READY");
  }

  // ---------------------------------------------------------------- input ---

  apply(command: Command): void {
    switch (command) {
      case "fire":
      case "up":
        this.holdFire = true;
        break;
      case "bomb":
        this.useBomb();
        break;
      case "pause":
        if (this.status === "playing") this.status = "paused";
        else if (this.status === "paused" || this.status === "attention") {
          this.status = "playing";
          // A moment of grace so you are not shot the instant you return.
          this.invulnTime = Math.max(this.invulnTime, 1.0);
        }
        break;
      case "left":
        this.moveBy(-MOVE_STEP);
        break;
      case "right":
        this.moveBy(MOVE_STEP);
        break;
      default:
        break;
    }
  }

  moveBy(cells: number): void {
    this.moveTo(this.playerX + cells);
  }

  /** Put the ship at a field column, as the mouse pointer does. */
  moveTo(x: number): void {
    if (this.status !== "playing") return;
    this.playerX = Math.max(1, Math.min(this.width - 2, Math.round(x)));
  }

  // ------------------------------------------------------------ game feed ---

  /** Translate one real Claude Code event into something on screen. */
  ingest(event: GameEvent): void {
    const tool = event.tool ?? "";
    const label = event.label;
    const weight = Math.max(1, Math.min(6, event.weight ?? 1));
    const over = this.status === "gameover";
    const fed = this.mode.claudeFed && !over;

    // Claude only resumes once the human has answered the prompt that
    // interrupted us, so the right kind of event clears the banner.
    if (this.status === "attention" && this.resumes(event)) {
      this.status = "playing";
      this.invulnTime = Math.max(this.invulnTime, 1.0);
    }
    if (WORK_EVENTS.has(event.kind)) this.stats.toolEvents += 1;

    const spawnType = SPAWN_EVENTS[event.kind];
    if (spawnType) {
      if (fed) {
        for (let i = 0; i < weight; i++) this.queueSpawn(spawnType, label);
        this.quietTime = 0;
      }
      if (event.kind === "bug") this.pushLog(`edit ${label ?? tool} -> bug`, "magenta");
      else if (event.kind === "splitter") this.pushLog(`write ${label ?? tool} -> splitter`, "green");
      else if (event.kind === "probe") this.pushLog(`${label ?? tool} -> probe`, "yellow");
      else if (event.kind === "carrier") this.pushLog(`subagent -> CARRIER`, "blue");
      else if (event.kind === "diver") this.pushLog(`${label ?? tool} -> diver`, "red");
      return;
    }

    switch (event.kind) {
      case "session_start":
        this.pushLog("session started", "cyan");
        break;

      case "turn_start":
        this.pushLog("you asked Claude to work", "white");
        if (!this.mode.claudeWaves || over) break;
        this.hitThisWave = false;
        if (this.wave % BOSS_EVERY === 0 && this.bossWave !== this.wave && !this.bossAlive()) {
          this.bossWave = this.wave;
          this.spawnBoss();
        } else {
          this.banner(`WAVE ${this.wave}`);
        }
        break;

      case "powerup":
        this.pushLog(`${label ?? tool} passed`, "green");
        if (!fed) break;
        this.stats.testsPassed += 1;
        this.dropPowerup(2 + this.rng() * (this.width - 4));
        break;

      case "damage":
        this.pushLog(`${tool} failed`, "red");
        if (fed) this.hurt();
        break;

      case "ally":
        if (!fed) break;
        this.timers.wingman = Math.max(this.timers.wingman, POWERUP_SPECS.wingman.duration);
        this.stats.allies += 1;
        this.pushLog("subagent joined as wingman", "cyan");
        this.banner("WINGMAN ONLINE");
        break;

      case "supply":
        if (!fed) break;
        this.addBomb();
        this.stats.supplies += 1;
        this.pushLog("context compacted: +1 bomb", "red");
        this.banner("SUPPLY DROP: BOMB");
        break;

      case "attention":
        if (this.status === "playing" || this.status === "paused") this.status = "attention";
        this.attentionNote = event.label ?? "Claude needs you";
        this.attentionId = event.id;
        this.attentionAt = event.at;
        break;

      case "resume":
        if (this.status === "attention") this.status = "playing";
        break;

      case "wave_clear":
        if (this.status === "attention") this.status = "playing";
        // After a game over the run is finished: nothing may add to its score.
        if (!this.mode.claudeWaves || over) {
          this.pushLog("Claude finished the turn", "cyan");
          break;
        }
        this.clearWave();
        break;

      case "session_end":
        this.pushLog("session ended", "dim");
        break;

      default:
        break;
    }
  }

  private resumes(event: GameEvent): boolean {
    if (TURN_EVENTS.has(event.kind)) return true;
    if (!WORK_EVENTS.has(event.kind)) return false;
    if (this.attentionId && event.id === this.attentionId) return true;
    return event.at - this.attentionAt > ATTENTION_SETTLE_MS;
  }

  private queueSpawn(type: EnemyType, label?: string): void {
    // Spread arrivals out over time instead of dumping a wall of enemies the
    // instant a batch of tool calls lands.
    if (this.pendingSpawns.length < 60) this.pendingSpawns.push({ type, label });
  }

  bossAlive(): boolean {
    return this.enemies.some((e) => e.type === "boss");
  }

  /** The boss on screen, for the renderer's health bar. */
  boss(): Enemy | undefined {
    return this.enemies.find((e) => e.type === "boss");
  }

  private speedFactor(): number {
    return Math.min(MAX_SPEED_FACTOR, 1 + (this.wave - 1) * 0.05) * this.tuning.speed;
  }

  private spawn(type: EnemyType, at: { x?: number; y?: number; vx?: number; label?: string } = {}): Enemy {
    const spec = ENEMY_SPECS[type];
    const hp = Math.max(1, Math.round(spec.hp * this.tuning.hp));
    const randomVx =
      type === "scout" ? (this.rng() - 0.5) * 7 : type === "carrier" ? (this.rng() - 0.5) * 3 : (this.rng() - 0.5) * 2.5;
    const enemy: Enemy = {
      id: this.nextId++,
      type,
      x: at.x ?? 1 + this.rng() * (this.width - 3),
      y: at.y ?? 0,
      vx: at.vx ?? randomVx,
      vy: spec.speed * this.speedFactor() * (0.85 + this.rng() * 0.3),
      hp,
      maxHp: hp,
      hitFlash: 0,
      fireIn: type === "carrier" ? 1.5 : 0.8 + this.rng() * 2.2,
      age: this.rng() * 6,
      points: spec.points,
      label: at.label,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  private spawnBoss(): void {
    const spec = BOSSES[this.bossesSpawned % BOSSES.length] as BossSpec;
    const hp = Math.round((60 + 25 * this.bossesSpawned) * this.tuning.hp);
    const enemy = this.spawn("boss", { x: this.width / 2, y: -2, vx: 0 });
    enemy.hp = hp;
    enemy.maxHp = hp;
    enemy.vy = 0;
    enemy.age = 0;
    enemy.points = 2500 + 1000 * this.bossesSpawned;
    enemy.boss = { spec, attackIn: 2.2, patternIndex: 0, sweep: 0 };
    this.bossesSpawned += 1;
    this.banner(`WARNING: ${spec.name}`, 2.6);
    this.pushLog(`BOSS: ${spec.name}`, "red");
    this.cues.push("boss");
  }

  private spawnFormation(kind: Formation, type: EnemyType): void {
    const mid = 3 + this.rng() * (this.width - 6);
    switch (kind) {
      case "v":
        for (let k = -2; k <= 2; k++) {
          const x = Math.max(1, Math.min(this.width - 2, mid + k * 2.5));
          const enemy = this.spawn(type, { x, y: -Math.abs(k) * 0.9, vx: 0 });
          enemy.vy *= 0.9;
        }
        break;
      case "line": {
        const count = Math.min(7, Math.floor(this.width / 6));
        const gap = (this.width - 4) / Math.max(1, count - 1);
        for (let i = 0; i < count; i++) this.spawn(type, { x: 2 + i * gap, y: 0, vx: 0 });
        break;
      }
      case "rain":
        for (let i = 0; i < 7; i++) this.spawn("scout", { y: -i * 1.2 });
        break;
    }
  }

  private pickPowerup(): PowerupType {
    const choices = (Object.keys(POWERUP_SPECS) as PowerupType[]).filter(
      (type) => type !== "life" || this.lives < this.maxLives,
    );
    const total = choices.reduce((sum, type) => sum + POWERUP_SPECS[type].weight, 0);
    let roll = this.rng() * total;
    for (const type of choices) {
      roll -= POWERUP_SPECS[type].weight;
      if (roll <= 0) return type;
    }
    return "spread";
  }

  private dropPowerup(x: number, type: PowerupType = this.pickPowerup(), y = 0): void {
    this.powerups.push({
      id: this.nextId++,
      type,
      x: Math.max(1, Math.min(this.width - 2, x)),
      y: Math.max(0, y),
    });
  }

  // ------------------------------------------------------------- stepping ---

  step(dt: number): void {
    this.clock += dt;
    if (this.bannerTime > 0) this.bannerTime -= dt;
    if (this.shakeTime > 0) this.shakeTime -= dt;
    if (this.flashTime > 0) this.flashTime -= dt;

    // Particles, popups and toasts keep animating even while paused so the
    // screen never looks dead.
    this.stepParticles(dt);
    this.stepToasts(dt);

    if (this.status !== "playing") {
      this.holdFire = false;
      return;
    }

    this.stats.elapsed += dt;
    if (this.invulnTime > 0) this.invulnTime -= dt;
    if (this.feverTime > 0) this.feverTime -= dt;
    for (const type of TIMED_POWERUPS) {
      if (this.timers[type] > 0) this.timers[type] = Math.max(0, this.timers[type] - dt);
    }

    this.stepStars(dt);
    this.stepCombo(dt);
    if (this.mode.claudeWaves) this.stepIdle(dt);
    else this.stepDirector(dt);
    this.stepClaudeSpawns(dt);
    this.stepFiring(dt);
    this.stepBullets(dt);
    this.stepEnemies(dt);
    this.stepPowerups(dt);
    this.resolveHits();
  }

  private stepStars(dt: number): void {
    const warp = this.feverTime > 0 ? 3 : 1;
    for (const s of this.stars) {
      s.y += s.speed * warp * dt;
      if (s.y >= this.height) {
        s.y = 0;
        s.x = this.rng() * this.width;
      }
    }
  }

  private stepCombo(dt: number): void {
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
  }

  private stepClaudeSpawns(dt: number): void {
    this.spawnDrip -= dt;
    if (this.spawnDrip > 0 || this.pendingSpawns.length === 0) return;
    const next = this.pendingSpawns.shift();
    if (next) this.spawn(next.type, { label: next.label });
    // Drain faster when a big batch is waiting.
    this.spawnDrip = this.pendingSpawns.length > 8 ? 0.08 : 0.3;
    this.idleTimer = 0;
  }

  /** Claude-paced modes: fill quiet stretches so the field is never empty. */
  private stepIdle(dt: number): void {
    this.quietTime += dt;
    if (this.pendingSpawns.length > 0) return;

    this.idleTimer += dt;
    if (this.idleTimer >= IDLE_SPAWN_DELAY / this.tuning.spawns && this.enemies.length < 4) {
      this.idleTimer = 0;
      const roll = this.rng();
      this.spawn(roll < 0.65 ? "scout" : roll < 0.85 ? "bug" : "diver");
    }

    if (this.quietTime < QUIET_BEFORE_FORMATIONS) return;
    this.formationTimer += dt;
    if (this.formationTimer >= FORMATION_EVERY && this.enemies.length < 10) {
      this.formationTimer = 0;
      const roll = this.rng();
      if (roll < 0.4) this.spawnFormation("v", "scout");
      else if (roll < 0.7) this.spawnFormation("line", this.wave >= 3 ? "bug" : "scout");
      else this.spawnFormation("rain", "scout");
    }
  }

  /** Arcade modes: build each wave, feed it in, and call it clear when empty. */
  private stepDirector(dt: number): void {
    if (this.breakTime > 0) {
      this.breakTime -= dt;
      if (this.breakTime <= 0) this.planWave();
      return;
    }

    if (this.plan.length > 0) {
      this.planDrip -= dt;
      if (this.planDrip <= 0) {
        const next = this.plan.shift();
        if (next?.formation) this.spawnFormation(next.formation, next.type);
        else if (next) this.spawn(next.type);
        this.planDrip = Math.max(0.22, 1.0 - 0.04 * this.wave) / this.tuning.spawns;
      }
      return;
    }

    if (this.enemies.length === 0 && this.pendingSpawns.length === 0) {
      this.clearWave();
      this.breakTime = BREAK_BETWEEN_WAVES;
    }
  }

  private planWave(): void {
    const w = this.wave;
    this.hitThisWave = false;
    this.plan = [];
    if (w % BOSS_EVERY === 0) {
      this.spawnBoss();
      for (let i = 0; i < Math.min(6, w / BOSS_EVERY + 1); i++) this.plan.push({ type: "scout" });
      return;
    }
    this.banner(`WAVE ${w}`);
    const count = Math.min(40, Math.round((6 + 2 * w) * this.tuning.spawns));
    for (let i = 0; i < count; i++) {
      const roll = this.rng();
      if (w >= 2 && roll < 0.08) {
        this.plan.push({ type: "scout", formation: this.rng() < 0.5 ? "v" : "rain" });
        continue;
      }
      const pool: EnemyType[] = ["scout", "scout", "bug"];
      if (w >= 2) pool.push("diver");
      if (w >= 3) pool.push("probe");
      if (w >= 4) pool.push("splitter", "bug");
      if (w >= 6 && i % 12 === 11) pool.push("carrier");
      this.plan.push({ type: pool[Math.floor(this.rng() * pool.length)] ?? "scout" });
    }
  }

  private clearWave(): void {
    const bonus = Math.round(250 * this.wave * this.tuning.score);
    this.score += bonus;
    this.stats.wavesCleared += 1;
    let note = `WAVE CLEAR  +${bonus}`;
    if (!this.hitThisWave) {
      const perfect = Math.round(100 * this.wave * this.tuning.score);
      this.score += perfect;
      this.stats.perfectWaves += 1;
      note = `PERFECT WAVE  +${bonus + perfect}`;
    }
    this.pushLog(`wave ${this.wave} clear +${bonus}`, "cyan");
    this.banner(note);
    this.wave += 1;
    this.hitThisWave = false;
  }

  private stepFiring(dt: number): void {
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.wingmanCooldown > 0) this.wingmanCooldown -= dt;
    const y = this.height - 2;

    if (this.timers.wingman > 0 && this.wingmanCooldown <= 0 && this.enemies.length > 0) {
      this.wingmanCooldown = WINGMAN_FIRE_DELAY;
      this.bullets.push({ x: this.wingmanX(), y, vx: 0, vy: -BULLET_SPEED, ally: true });
    }

    if (!this.holdFire) return;
    this.holdFire = false;
    if (this.fireCooldown > 0) return;

    const fast = this.timers.rapid > 0 || this.feverTime > 0;
    this.fireCooldown = fast ? RAPID_FIRE_DELAY : BASE_FIRE_DELAY;
    const pierce = this.timers.laser > 0;
    const shot = (x: number, vx = 0): Bullet => ({ x, y, vx, vy: -BULLET_SPEED, pierce, hit: pierce ? [] : undefined });
    this.bullets.push(shot(this.playerX));
    this.stats.shots += 1;
    if (this.timers.spread > 0) {
      this.bullets.push(shot(this.playerX - 1, -5), shot(this.playerX + 1, 5));
      this.stats.shots += 2;
    }
  }

  /** Where the wingman flies: beside the ship, on whichever side has room. */
  wingmanX(): number {
    return this.playerX + 3 < this.width - 1 ? this.playerX + 3 : this.playerX - 3;
  }

  private stepBullets(dt: number): void {
    for (const b of this.bullets) {
      b.y += b.vy * dt;
      b.x += b.vx * dt;
    }
    this.bullets = this.bullets.filter((b) => b.y > -1 && b.x >= 0 && b.x < this.width);

    const slow = this.timers.slow > 0 ? SLOW_FACTOR : 1;
    for (const b of this.enemyBullets) {
      b.y += b.vy * dt * slow;
      b.x += b.vx * dt * slow;
    }
    this.enemyBullets = this.enemyBullets.filter((b) => b.y < this.height - 1 && b.x >= 0 && b.x < this.width);
  }

  private stepEnemies(dt: number): void {
    const slow = this.timers.slow > 0 ? SLOW_FACTOR : 1;
    const step = dt * slow;
    const survivors: Enemy[] = [];
    const playerY = this.height - 2;

    for (const e of this.enemies) {
      e.age += step;
      if (e.hitFlash > 0) e.hitFlash -= dt;

      if (e.type === "boss") {
        this.stepBoss(e, step);
        survivors.push(e);
        continue;
      }

      if (e.type === "bug") e.x += Math.sin(e.age * 2.2 + e.id) * 1.6 * step;
      if (e.type === "diver" && e.y > this.height * 0.3) {
        // Past the first third, it banks toward the ship.
        const pull = Math.sign(this.playerX - e.x) * 16 * step;
        e.vx = Math.max(-9, Math.min(9, e.vx + pull));
      }

      e.y += e.vy * step;
      e.x += e.vx * step;

      // Bounce off the walls instead of sliding along them.
      if (e.x < 1) {
        e.x = 1;
        e.vx = Math.abs(e.vx);
      } else if (e.x > this.width - 2) {
        e.x = this.width - 2;
        e.vx = -Math.abs(e.vx);
      }

      e.fireIn -= step * this.tuning.enemyFire;
      if (e.fireIn <= 0 && e.y >= 0) {
        if (ENEMY_SPECS[e.type].shoots) {
          e.fireIn = 1.6 + this.rng() * 2.4;
          this.enemyBullets.push({ x: e.x, y: e.y + 1, vx: 0, vy: ENEMY_BULLET_SPEED });
        } else if (e.type === "carrier") {
          e.fireIn = 2.8;
          if (this.enemies.length < 30) {
            this.spawn("scout", { x: e.x, y: e.y + 1 });
          }
        } else {
          e.fireIn = 99;
        }
      }

      // Anything that reaches the floor gets through and costs a life.
      if (e.y >= playerY) {
        this.burst(e.x, playerY, "red");
        this.pushLog(`${ENEMY_SPECS[e.type].ascii} broke through`, "red");
        this.hurt();
        continue;
      }
      survivors.push(e);
    }
    // Scouts a carrier or boss launched mid-loop were appended to the array
    // being iterated, so the loop already visited them into `survivors`.
    this.enemies = survivors;
  }

  private stepBoss(e: Enemy, step: number): void {
    const boss = e.boss;
    if (!boss) return;
    // Drop in from above, then sweep side to side across the top.
    if (e.y < 1) e.y = Math.min(1, e.y + 2.5 * step);
    const span = Math.max(0, this.width / 2 - 5);
    const enraged = e.hp < e.maxHp / 2;
    boss.sweep += step * (enraged ? 0.95 : 0.6);
    e.x = this.width / 2 + Math.sin(boss.sweep) * span;

    if (e.y < 1) return;
    boss.attackIn -= step * this.tuning.enemyFire;
    if (boss.attackIn > 0) return;
    boss.attackIn = enraged ? 0.85 : 1.4;
    const pattern = boss.spec.patterns[boss.patternIndex % 2] as BossPattern;
    boss.patternIndex += 1;
    this.bossAttack(e, pattern, enraged);
  }

  private bossAttack(e: Enemy, pattern: BossPattern, enraged: boolean): void {
    const muzzle = e.y + 2;
    switch (pattern) {
      case "fan": {
        const spread = enraged ? 3 : 2;
        for (let k = -spread; k <= spread; k++) {
          this.enemyBullets.push({ x: e.x, y: muzzle, vx: k * 3, vy: 9 });
        }
        break;
      }
      case "aimed": {
        const dy = this.height - 2 - muzzle;
        const vx = ((this.playerX - e.x) / Math.max(1, dy)) * 12;
        for (const off of enraged ? [-2, 0, 2] : [-1.5, 1.5]) {
          this.enemyBullets.push({ x: e.x, y: muzzle, vx: vx + off, vy: 12 });
        }
        break;
      }
      case "summon":
        if (this.enemies.length < 24) {
          this.spawn("scout", { x: Math.max(1, e.x - 3), y: muzzle });
          this.spawn("scout", { x: Math.min(this.width - 2, e.x + 3), y: muzzle });
          if (enraged) this.spawn("diver", { x: e.x, y: muzzle });
        }
        break;
      case "rain":
        for (let i = 0; i < (enraged ? 6 : 4); i++) {
          const x = Math.max(0, Math.min(this.width - 1, e.x + (this.rng() - 0.5) * 16));
          this.enemyBullets.push({ x, y: muzzle, vx: 0, vy: 8 + this.rng() * 4 });
        }
        break;
    }
  }

  private stepPowerups(dt: number): void {
    const magnet = this.timers.magnet > 0;
    for (const p of this.powerups) {
      p.y += (magnet ? 9 : 4.5) * dt;
      if (magnet) {
        const dx = this.playerX - p.x;
        p.x += Math.sign(dx) * Math.min(Math.abs(dx), 12 * dt);
      }
    }
    this.powerups = this.powerups.filter((p) => {
      if (p.y < this.height - 2) return true;
      // Picked up only if the ship is under it when it lands.
      if (Math.abs(p.x - this.playerX) <= 2) this.collect(p.type);
      return false;
    });
  }

  private stepParticles(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.popups) {
      p.life -= dt;
      p.y -= 3 * dt;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  private stepToasts(dt: number): void {
    const toast = this.toasts[0];
    if (!toast) return;
    toast.life -= dt;
    if (toast.life <= 0) this.toasts.shift();
  }

  private hits(e: Enemy, x: number, y: number): boolean {
    const reach = ENEMY_SPECS[e.type].reach;
    if (Math.abs(e.x - x) >= reach) return false;
    if (e.type === "boss") return y > e.y - 1 && y < e.y + 2;
    return Math.abs(e.y - y) < 1.0;
  }

  private resolveHits(): void {
    // Player bullets vs enemies.
    const spentBullets = new Set<Bullet>();
    for (const b of this.bullets) {
      for (const e of this.enemies) {
        if (e.hp <= 0 || !this.hits(e, b.x, b.y)) continue;
        if (b.pierce) {
          if (b.hit?.includes(e.id)) continue;
          b.hit?.push(e.id);
        } else {
          spentBullets.add(b);
        }
        if (!b.ally) this.stats.hits += 1;
        e.hp -= 1;
        e.hitFlash = 0.12;
        if (e.hp <= 0) this.kill(e);
        if (!b.pierce) break;
      }
    }
    if (spentBullets.size > 0) this.bullets = this.bullets.filter((b) => !spentBullets.has(b));
    this.enemies = this.enemies.filter((e) => e.hp > 0);

    const playerY = this.height - 2;

    // Enemy bullets vs player.
    const spentEnemyBullets = new Set<Bullet>();
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
      if (e.type === "boss") continue;
      if (Math.abs(e.x - this.playerX) < ENEMY_SPECS[e.type].reach + 0.2 && Math.abs(e.y - playerY) < 1.2) {
        this.burst(e.x, e.y, "red");
        e.hp = 0;
        this.hurt();
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  /** Current points multiplier from combo, fever, difficulty and the day's mutator. */
  multiplier(): number {
    const combo = Math.min(MAX_MULTIPLIER, 1 + Math.floor(this.combo / 5) * 0.5);
    return combo * (this.feverTime > 0 ? 2 : 1) * this.tuning.score;
  }

  private kill(e: Enemy): void {
    this.combo += 1;
    this.comboTimer = COMBO_WINDOW;
    this.stats.kills += 1;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);

    const points = Math.round(e.points * this.multiplier());
    this.score += points;
    this.popups.push({ x: e.x, y: e.y, text: `+${points}`, color: this.feverTime > 0 ? "magenta" : "white", life: 0.8 });
    this.burst(e.x, e.y, ENEMY_SPECS[e.type].color, e.type === "boss" ? 40 : e.type === "carrier" ? 16 : 8);

    if (this.combo % FEVER_EVERY === 0) {
      this.feverTime = FEVER_TIME;
      this.stats.fevers += 1;
      this.banner(`FEVER x${this.combo}!  DOUBLE POINTS`);
      this.cues.push("fever");
    }

    if (e.type === "splitter") {
      this.spawn("scout", { x: Math.max(1, e.x - 1), y: e.y, vx: -5 });
      this.spawn("scout", { x: Math.min(this.width - 2, e.x + 1), y: e.y, vx: 5 });
    }

    if (e.type === "boss" && e.boss) {
      this.stats.bosses += 1;
      if (this.lives === 1 && !this.mode.invincible) this.stats.clutchBoss = true;
      this.banner(`${e.boss.spec.name} DEFEATED`, 2.4);
      this.pushLog(`boss down: ${e.boss.spec.name}`, "yellow");
      this.dropPowerup(e.x - 3, undefined, e.y + 2);
      this.dropPowerup(e.x + 3, undefined, e.y + 2);
      this.dropPowerup(e.x, "bomb", e.y + 2);
      this.enemyBullets = [];
      this.shakeTime = 0.5;
      this.cues.push("boss_down");
      return;
    }

    if (this.rng() < KILL_DROP_CHANCE * this.tuning.drops * (e.type === "carrier" ? 6 : 1)) {
      this.dropPowerup(e.x, undefined, e.y);
    }
  }

  private collect(type: PowerupType): void {
    const spec = POWERUP_SPECS[type];
    this.stats.powerups += 1;
    switch (type) {
      case "bomb":
        this.addBomb();
        this.pushLog("bomb +1", "red");
        break;
      case "life":
        if (this.lives < this.maxLives) {
          this.lives += 1;
          this.pushLog("extra life!", "magenta");
        } else {
          this.score += 500;
          this.pushLog("full health: +500", "magenta");
        }
        break;
      default:
        this.timers[type] = Math.max(this.timers[type], spec.duration);
        this.pushLog(`${spec.name} (${spec.duration}s)`, spec.color);
        break;
    }
    const active = TIMED_POWERUPS.filter((t) => this.timers[t] > 0).length;
    this.stats.maxActive = Math.max(this.stats.maxActive, active);
    this.popups.push({ x: this.playerX, y: this.height - 3, text: spec.name.toUpperCase(), color: spec.color, life: 0.9 });
    this.burst(this.playerX, this.height - 2, spec.color);
  }

  private addBomb(): void {
    this.bombs = Math.min(MAX_BOMBS, this.bombs + 1);
    this.stats.maxBombs = Math.max(this.stats.maxBombs, this.bombs);
  }

  /** Clear the screen of everything but a boss, which takes a heavy hit. */
  useBomb(): void {
    if (this.status !== "playing" || this.bombs <= 0) return;
    this.bombs -= 1;
    this.stats.bombsUsed += 1;
    this.flashTime = 0.35;
    this.shakeTime = 0.4;
    this.enemyBullets = [];
    let kills = 0;
    for (const e of this.enemies) {
      if (e.type === "boss") {
        e.hp -= Math.max(5, Math.round(e.maxHp * 0.15));
        e.hitFlash = 0.3;
      } else {
        e.hp = 0;
        kills += 1;
      }
      if (e.hp <= 0) this.kill(e);
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.stats.bombKillsBest = Math.max(this.stats.bombKillsBest, kills);
    this.pushLog(`BOMB! ${kills} cleared`, "red");
  }

  private hurt(): void {
    if (this.status !== "playing") return;
    if (this.invulnTime > 0) return;
    this.hitThisWave = true;

    if (this.timers.shield > 0) {
      this.timers.shield = 0;
      this.invulnTime = INVULN_TIME;
      this.pushLog("shield absorbed it", "cyan");
      this.shakeTime = 0.2;
      return;
    }

    this.combo = 0;
    this.invulnTime = INVULN_TIME;
    this.shakeTime = 0.35;
    this.burst(this.playerX, this.height - 2, "red");
    this.cues.push("hit");
    if (this.mode.invincible) return;

    this.lives -= 1;
    if (this.lives <= 0) {
      this.lives = 0;
      this.status = "gameover";
      this.banner("GAME OVER");
      this.pushLog(`game over - ${this.score} pts`, "red");
      this.cues.push("gameover");
    }
  }

  private burst(x: number, y: number, color: string, count = 8): void {
    const glyphs = ["*", "+", ".", "x", "'"];
    for (let i = 0; i < count; i++) {
      const angle = this.rng() * Math.PI * 2;
      const speed = 2 + this.rng() * (count > 20 ? 12 : 6);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.5,
        life: 0.2 + this.rng() * (count > 20 ? 0.8 : 0.35),
        glyph: glyphs[i % glyphs.length] ?? "*",
        color,
      });
    }
  }

  banner(text: string, seconds = 1.6): void {
    this.bannerText = text;
    this.bannerTime = seconds;
  }

  toast(title: string, text: string, color = "yellow"): void {
    this.toasts.push({ title, text, color, life: 2.8 });
  }

  pushLog(text: string, color: string): void {
    this.log.push({ text, color, at: Date.now() });
    if (this.log.length > 40) this.log.splice(0, this.log.length - 40);
  }
}
