/**
 * Everything the game is made of, as plain data: enemies, power-ups, bosses,
 * modes, daily mutators and ship skins. The engine reads these tables and the
 * renderer draws them; neither hard-codes a number that belongs here.
 */

export type EnemyType = "scout" | "bug" | "splitter" | "diver" | "probe" | "carrier" | "boss";

export interface EnemySpec {
  hp: number;
  points: number;
  /** Cells per second, downwards. */
  speed: number;
  shoots: boolean;
  /** Collision reach either side of the centre, in cells. */
  reach: number;
  glyph: string;
  ascii: string;
  color: string;
}

export const ENEMY_SPECS: Record<EnemyType, EnemySpec> = {
  scout: { hp: 1, points: 50, speed: 5.2, shoots: false, reach: 1.2, glyph: "▾", ascii: "v", color: "cyan" },
  bug: { hp: 2, points: 120, speed: 2.6, shoots: false, reach: 1.2, glyph: "◆", ascii: "#", color: "magenta" },
  splitter: { hp: 2, points: 150, speed: 2.9, shoots: false, reach: 1.2, glyph: "✚", ascii: "X", color: "green" },
  diver: { hp: 1, points: 90, speed: 3.0, shoots: false, reach: 1.2, glyph: "◣", ascii: "V", color: "red" },
  probe: { hp: 3, points: 240, speed: 1.9, shoots: true, reach: 1.2, glyph: "●", ascii: "O", color: "yellow" },
  carrier: { hp: 10, points: 600, speed: 1.1, shoots: false, reach: 2.2, glyph: "<◉>", ascii: "<@>", color: "blue" },
  boss: { hp: 60, points: 2500, speed: 0, shoots: true, reach: 3.6, glyph: "", ascii: "", color: "red" },
};

export type PowerupType =
  | "shield"
  | "spread"
  | "rapid"
  | "life"
  | "laser"
  | "bomb"
  | "magnet"
  | "slow"
  | "wingman";

export interface PowerupSpec {
  letter: string;
  name: string;
  color: string;
  /** Seconds it lasts; 0 for instant pickups. */
  duration: number;
  /** Relative chance in a random drop. */
  weight: number;
}

export const POWERUP_SPECS: Record<PowerupType, PowerupSpec> = {
  spread: { letter: "W", name: "spread shot", color: "yellow", duration: 12, weight: 18 },
  rapid: { letter: "R", name: "rapid fire", color: "green", duration: 12, weight: 18 },
  shield: { letter: "S", name: "shield", color: "cyan", duration: 10, weight: 15 },
  laser: { letter: "L", name: "piercing laser", color: "magenta", duration: 8, weight: 10 },
  magnet: { letter: "M", name: "magnet", color: "blue", duration: 15, weight: 9 },
  slow: { letter: "T", name: "time warp", color: "white", duration: 6, weight: 9 },
  wingman: { letter: "D", name: "wingman drone", color: "cyan", duration: 15, weight: 8 },
  bomb: { letter: "B", name: "bomb", color: "red", duration: 0, weight: 8 },
  life: { letter: "+", name: "extra life", color: "magenta", duration: 0, weight: 5 },
};

/** The timed power-ups, in HUD order. */
export const TIMED_POWERUPS: PowerupType[] = ["shield", "spread", "rapid", "laser", "magnet", "slow", "wingman"];

export type BossPattern = "fan" | "aimed" | "summon" | "rain";

export interface BossSpec {
  name: string;
  /** Two rows, seven cells each, ASCII so every terminal draws it. */
  sprite: [string, string];
  color: string;
  patterns: [BossPattern, BossPattern];
}

/** Every bug a developer has met at 2 a.m., in the order they show up. */
export const BOSSES: BossSpec[] = [
  { name: "MERGE CONFLICT", sprite: ["<<<|>>>", " \\=|=/ "], color: "red", patterns: ["fan", "aimed"] },
  { name: "HEISENBUG", sprite: ["(?)-(?)", " \\_?_/ "], color: "magenta", patterns: ["aimed", "summon"] },
  { name: "NULL POINTER", sprite: ["[ 0x0 ]", " /|||\\ "], color: "yellow", patterns: ["rain", "fan"] },
  { name: "INFINITE LOOP", sprite: ["(@)=(@)", " \\_8_/ "], color: "cyan", patterns: ["summon", "rain"] },
  { name: "DEPENDENCY HELL", sprite: ["{#[@]#}", " /\\|/\\ "], color: "green", patterns: ["fan", "summon"] },
  { name: "LEGACY MONOLITH", sprite: ["|#####|", "|_|#|_|"], color: "white", patterns: ["aimed", "rain"] },
];

/** A boss turns up every this many waves. */
export const BOSS_EVERY = 5;

export type ModeId = "storm" | "endless" | "zen" | "daily";

export interface ModeSpec {
  id: ModeId;
  name: string;
  blurb: string;
  lives: number;
  /** Hits cost nothing but your combo. */
  invincible: boolean;
  /** Claude's tool calls spawn enemies. */
  claudeFed: boolean;
  /** Waves come from Claude's turns (true) or from the built-in director. */
  claudeWaves: boolean;
}

export const MODES: ModeSpec[] = [
  {
    id: "storm",
    name: "STORM",
    blurb: "Claude's real tool calls are your enemies",
    lives: 3,
    invincible: false,
    claudeFed: true,
    claudeWaves: true,
  },
  {
    id: "endless",
    name: "ENDLESS",
    blurb: "pure arcade waves, a boss every 5",
    lives: 3,
    invincible: false,
    claudeFed: true,
    claudeWaves: false,
  },
  {
    id: "zen",
    name: "ZEN",
    blurb: "no lives to lose, just flow",
    lives: 3,
    invincible: true,
    claudeFed: true,
    claudeWaves: true,
  },
  {
    id: "daily",
    name: "DAILY",
    blurb: "same seed for everyone today",
    lives: 3,
    invincible: false,
    claudeFed: false,
    claudeWaves: false,
  },
];

export function modeSpec(id: ModeId): ModeSpec {
  return MODES.find((m) => m.id === id) ?? (MODES[0] as ModeSpec);
}

export function isModeId(value: unknown): value is ModeId {
  return typeof value === "string" && MODES.some((m) => m.id === value);
}

export type MutatorId = "hyperdrive" | "glass" | "swarm" | "bullethell" | "surge" | "titans";

export interface MutatorSpec {
  id: MutatorId;
  name: string;
  blurb: string;
  speed: number;
  hp: number;
  spawns: number;
  enemyFire: number;
  drops: number;
  lives?: number;
  score: number;
}

export const MUTATORS: MutatorSpec[] = [
  { id: "hyperdrive", name: "HYPERDRIVE", blurb: "everything is 40% faster", speed: 1.4, hp: 1, spawns: 1, enemyFire: 1, drops: 1, score: 1.5 },
  { id: "glass", name: "GLASS CANNON", blurb: "one life, double points", speed: 1, hp: 1, spawns: 1, enemyFire: 1, drops: 1, lives: 1, score: 2 },
  { id: "swarm", name: "SWARM", blurb: "half again as many enemies", speed: 1, hp: 1, spawns: 1.5, enemyFire: 1, drops: 1.2, score: 1.3 },
  { id: "bullethell", name: "BULLET HELL", blurb: "enemies fire twice as often", speed: 1, hp: 1, spawns: 1, enemyFire: 2, drops: 1.2, score: 1.5 },
  { id: "surge", name: "POWER SURGE", blurb: "power-ups everywhere", speed: 1.1, hp: 1, spawns: 1.2, enemyFire: 1, drops: 3, score: 1 },
  { id: "titans", name: "TITANS", blurb: "enemies take twice the hits", speed: 0.9, hp: 2, spawns: 1, enemyFire: 1, drops: 1.3, score: 1.6 },
];

/** The neutral mutator every non-daily run uses. */
export const NO_MUTATOR: MutatorSpec = {
  id: "hyperdrive",
  name: "",
  blurb: "",
  speed: 1,
  hp: 1,
  spawns: 1,
  enemyFire: 1,
  drops: 1,
  score: 1,
};

/** Local calendar day as YYYY-MM-DD: the daily seed and the daily-best key. */
export function dayKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A stable 32-bit hash of a string (FNV-1a). */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function dailyMutator(day: string): MutatorSpec {
  return MUTATORS[hashString(day) % MUTATORS.length] as MutatorSpec;
}

/** A small seeded generator (mulberry32), so a daily run is the same for everyone. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type DifficultyId = "easy" | "medium" | "hard";

export interface DifficultySpec {
  id: DifficultyId;
  name: string;
  blurb: string;
  lives: number;
  speed: number;
  hp: number;
  spawns: number;
  enemyFire: number;
  drops: number;
  /** Harder settings pay more, so one board can hold them all. */
  score: number;
}

export const DIFFICULTIES: DifficultySpec[] = [
  {
    id: "easy",
    name: "EASY",
    blurb: "5 hearts, slower foes, more drops",
    lives: 5,
    speed: 0.75,
    hp: 1,
    spawns: 0.75,
    enemyFire: 0.55,
    drops: 1.6,
    score: 0.6,
  },
  {
    id: "medium",
    name: "MEDIUM",
    blurb: "3 hearts, the standard game",
    lives: 3,
    speed: 1,
    hp: 1,
    spawns: 1,
    enemyFire: 1,
    drops: 1,
    score: 1,
  },
  {
    id: "hard",
    name: "HARD",
    blurb: "2 hearts, tougher foes, x1.6 points",
    lives: 2,
    speed: 1.3,
    hp: 1.4,
    spawns: 1.3,
    enemyFire: 1.6,
    drops: 0.7,
    score: 1.6,
  },
];

export function difficultySpec(id: DifficultyId | undefined): DifficultySpec {
  return DIFFICULTIES.find((d) => d.id === id) ?? (DIFFICULTIES[1] as DifficultySpec);
}

export function isDifficultyId(value: unknown): value is DifficultyId {
  return typeof value === "string" && DIFFICULTIES.some((d) => d.id === value);
}

export interface SkinSpec {
  id: string;
  name: string;
  glyph: string;
  ascii: string;
  /** A colour name, or "rainbow" to cycle. */
  color: string;
  /** Player level that unlocks it. */
  level: number;
}

export const SKINS: SkinSpec[] = [
  { id: "pioneer", name: "Pioneer", glyph: "▲", ascii: "A", color: "green", level: 1 },
  { id: "trident", name: "Trident", glyph: "Ψ", ascii: "Y", color: "cyan", level: 3 },
  { id: "comet", name: "Comet", glyph: "▲", ascii: "A", color: "yellow", level: 5 },
  { id: "omega", name: "Omega", glyph: "Ω", ascii: "W", color: "magenta", level: 8 },
  { id: "phantom", name: "Phantom", glyph: "♠", ascii: "M", color: "white", level: 12 },
  { id: "prism", name: "Prism", glyph: "▲", ascii: "A", color: "rainbow", level: 16 },
  { id: "spark", name: "Spark", glyph: "✻", ascii: "*", color: "red", level: 20 },
];

export function skinSpec(id: string | undefined): SkinSpec {
  return SKINS.find((s) => s.id === id) ?? (SKINS[0] as SkinSpec);
}

export const RAINBOW = ["red", "yellow", "green", "cyan", "blue", "magenta"];
