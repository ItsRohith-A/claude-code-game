"use strict";
/**
 * Everything the game is made of, as plain data: enemies, power-ups, bosses,
 * modes, daily mutators and ship skins. The engine reads these tables and the
 * renderer draws them; neither hard-codes a number that belongs here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAINBOW = exports.SKINS = exports.DIFFICULTIES = exports.NO_MUTATOR = exports.MUTATORS = exports.MODES = exports.BOSS_EVERY = exports.BOSSES = exports.TIMED_POWERUPS = exports.POWERUP_SPECS = exports.ENEMY_SPECS = void 0;
exports.modeSpec = modeSpec;
exports.isModeId = isModeId;
exports.dayKey = dayKey;
exports.hashString = hashString;
exports.dailyMutator = dailyMutator;
exports.seededRng = seededRng;
exports.difficultySpec = difficultySpec;
exports.isDifficultyId = isDifficultyId;
exports.skinSpec = skinSpec;
exports.ENEMY_SPECS = {
    scout: { hp: 1, points: 50, speed: 5.2, shoots: false, reach: 1.2, glyph: "▾", ascii: "v", color: "cyan" },
    bug: { hp: 2, points: 120, speed: 2.6, shoots: false, reach: 1.2, glyph: "◆", ascii: "#", color: "magenta" },
    splitter: { hp: 2, points: 150, speed: 2.9, shoots: false, reach: 1.2, glyph: "✚", ascii: "X", color: "green" },
    diver: { hp: 1, points: 90, speed: 3.0, shoots: false, reach: 1.2, glyph: "◣", ascii: "V", color: "red" },
    probe: { hp: 3, points: 240, speed: 1.9, shoots: true, reach: 1.2, glyph: "●", ascii: "O", color: "yellow" },
    carrier: { hp: 10, points: 600, speed: 1.1, shoots: false, reach: 2.2, glyph: "<◉>", ascii: "<@>", color: "blue" },
    boss: { hp: 60, points: 2500, speed: 0, shoots: true, reach: 3.6, glyph: "", ascii: "", color: "red" },
};
exports.POWERUP_SPECS = {
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
exports.TIMED_POWERUPS = ["shield", "spread", "rapid", "laser", "magnet", "slow", "wingman"];
/** Every bug a developer has met at 2 a.m., in the order they show up. */
exports.BOSSES = [
    { name: "MERGE CONFLICT", sprite: ["<<<|>>>", " \\=|=/ "], color: "red", patterns: ["fan", "aimed"] },
    { name: "HEISENBUG", sprite: ["(?)-(?)", " \\_?_/ "], color: "magenta", patterns: ["aimed", "summon"] },
    { name: "NULL POINTER", sprite: ["[ 0x0 ]", " /|||\\ "], color: "yellow", patterns: ["rain", "fan"] },
    { name: "INFINITE LOOP", sprite: ["(@)=(@)", " \\_8_/ "], color: "cyan", patterns: ["summon", "rain"] },
    { name: "DEPENDENCY HELL", sprite: ["{#[@]#}", " /\\|/\\ "], color: "green", patterns: ["fan", "summon"] },
    { name: "LEGACY MONOLITH", sprite: ["|#####|", "|_|#|_|"], color: "white", patterns: ["aimed", "rain"] },
];
/** A boss turns up every this many waves. */
exports.BOSS_EVERY = 5;
exports.MODES = [
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
function modeSpec(id) {
    return exports.MODES.find((m) => m.id === id) ?? exports.MODES[0];
}
function isModeId(value) {
    return typeof value === "string" && exports.MODES.some((m) => m.id === value);
}
exports.MUTATORS = [
    { id: "hyperdrive", name: "HYPERDRIVE", blurb: "everything is 40% faster", speed: 1.4, hp: 1, spawns: 1, enemyFire: 1, drops: 1, score: 1.5 },
    { id: "glass", name: "GLASS CANNON", blurb: "one life, double points", speed: 1, hp: 1, spawns: 1, enemyFire: 1, drops: 1, lives: 1, score: 2 },
    { id: "swarm", name: "SWARM", blurb: "half again as many enemies", speed: 1, hp: 1, spawns: 1.5, enemyFire: 1, drops: 1.2, score: 1.3 },
    { id: "bullethell", name: "BULLET HELL", blurb: "enemies fire twice as often", speed: 1, hp: 1, spawns: 1, enemyFire: 2, drops: 1.2, score: 1.5 },
    { id: "surge", name: "POWER SURGE", blurb: "power-ups everywhere", speed: 1.1, hp: 1, spawns: 1.2, enemyFire: 1, drops: 3, score: 1 },
    { id: "titans", name: "TITANS", blurb: "enemies take twice the hits", speed: 0.9, hp: 2, spawns: 1, enemyFire: 1, drops: 1.3, score: 1.6 },
];
/** The neutral mutator every non-daily run uses. */
exports.NO_MUTATOR = {
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
function dayKey(date = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
/** A stable 32-bit hash of a string (FNV-1a). */
function hashString(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
function dailyMutator(day) {
    return exports.MUTATORS[hashString(day) % exports.MUTATORS.length];
}
/** A small seeded generator (mulberry32), so a daily run is the same for everyone. */
function seededRng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
exports.DIFFICULTIES = [
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
function difficultySpec(id) {
    return exports.DIFFICULTIES.find((d) => d.id === id) ?? exports.DIFFICULTIES[1];
}
function isDifficultyId(value) {
    return typeof value === "string" && exports.DIFFICULTIES.some((d) => d.id === value);
}
exports.SKINS = [
    { id: "pioneer", name: "Pioneer", glyph: "▲", ascii: "A", color: "green", level: 1 },
    { id: "trident", name: "Trident", glyph: "Ψ", ascii: "Y", color: "cyan", level: 3 },
    { id: "comet", name: "Comet", glyph: "▲", ascii: "A", color: "yellow", level: 5 },
    { id: "omega", name: "Omega", glyph: "Ω", ascii: "W", color: "magenta", level: 8 },
    { id: "phantom", name: "Phantom", glyph: "♠", ascii: "M", color: "white", level: 12 },
    { id: "prism", name: "Prism", glyph: "▲", ascii: "A", color: "rainbow", level: 16 },
    { id: "spark", name: "Spark", glyph: "✻", ascii: "*", color: "red", level: 20 },
];
function skinSpec(id) {
    return exports.SKINS.find((s) => s.id === id) ?? exports.SKINS[0];
}
exports.RAINBOW = ["red", "yellow", "green", "cyan", "blue", "magenta"];
