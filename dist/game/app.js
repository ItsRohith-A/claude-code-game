"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.App = void 0;
const achievements_1 = require("./achievements");
const content_1 = require("./content");
const engine_1 = require("./engine");
const render_1 = require("./render");
const screens_1 = require("./screens");
const profile_1 = require("../profile");
/** How often the run is checked for newly earned achievements. */
const ACHIEVEMENT_CHECK_S = 0.5;
/** A run this short with no score is not worth a line in the profile. */
const MIN_RECORDED_S = 5;
class App {
    screen = "title";
    cursor = 0;
    listCursor = 0;
    engine = null;
    profile;
    summary = null;
    quitRequested = false;
    width;
    height;
    attached;
    store;
    today;
    rng;
    stars = [];
    clock = 0;
    runMode = "storm";
    runBest = 0;
    recorded = false;
    earned = [];
    unlocked = new Set();
    checkTimer = 0;
    triggerHeld = false;
    /** The menu row under the mouse pointer, or null when it is over nothing. */
    pointerRow = null;
    /** A line of feedback under a menu, such as "Trident equipped". */
    notice = "";
    /** The terminal size of the last frame, for mouse hit-testing and scrolling. */
    lastColumns = 80;
    lastRows = 24;
    constructor(options) {
        this.width = options.width;
        this.height = options.height;
        this.attached = options.attached;
        this.store = options.store;
        this.today = options.today ?? (() => new Date());
        this.rng = options.rng ?? Math.random;
        this.profile = this.store.load();
        if (options.difficulty && options.difficulty !== this.profile.difficulty)
            this.setDifficulty(options.difficulty);
        for (let i = 0; i < 70; i++) {
            this.stars.push({ x: this.rng() * 160, y: this.rng() * 60, speed: 1 + this.rng() * 5 });
        }
        if (options.startMode)
            this.startRun(options.startMode);
    }
    /** Fit the screen, and the run in progress, to a new terminal size. */
    resize(width, height) {
        this.width = width;
        this.height = height;
        this.engine?.resize(width, height);
    }
    // ---------------------------------------------------------------- input ---
    handle(command) {
        this.notice = "";
        if (this.screen === "game") {
            this.handleGame(command);
            return;
        }
        switch (this.screen) {
            case "title":
                this.handleTitle(command);
                break;
            case "hangar":
                this.handleList(command, content_1.SKINS.length, () => this.equip());
                break;
            case "trophies":
                this.handleList(command, Math.max(1, achievements_1.ACHIEVEMENTS.length - (0, screens_1.trophyRows)(this.lastRows) + 1));
                break;
            case "scores":
                if (command === "left")
                    this.listCursor = (this.listCursor + content_1.MODES.length - 1) % content_1.MODES.length;
                else if (command === "right" || command === "fire" || command === "confirm") {
                    this.listCursor = (this.listCursor + 1) % content_1.MODES.length;
                }
                else
                    this.handleList(command, content_1.MODES.length);
                break;
        }
    }
    handleGame(command) {
        const engine = this.engine;
        if (!engine)
            return;
        if (command === "menu") {
            if (engine.status === "paused" || engine.status === "gameover")
                this.toTitle();
            return;
        }
        if (command === "restart") {
            if (engine.status === "gameover")
                this.startRun(this.runMode);
            return;
        }
        engine.apply(command);
    }
    handleTitle(command) {
        if (screens_1.TITLE_ITEMS[this.cursor] === "difficulty") {
            if (command === "left")
                return this.shiftDifficulty(-1);
            if (command === "right" || command === "confirm" || command === "fire")
                return this.shiftDifficulty(1);
        }
        if (command === "up")
            this.cursor = (this.cursor + screens_1.TITLE_ITEMS.length - 1) % screens_1.TITLE_ITEMS.length;
        else if (command === "down")
            this.cursor = (this.cursor + 1) % screens_1.TITLE_ITEMS.length;
        else if (command === "confirm" || command === "fire")
            this.select();
    }
    handleList(command, length, onConfirm) {
        if (command === "up")
            this.listCursor = Math.max(0, this.listCursor - 1);
        else if (command === "down")
            this.listCursor = Math.min(length - 1, this.listCursor + 1);
        else if ((command === "confirm" || command === "fire") && onConfirm)
            onConfirm();
        else if (command === "back" || command === "menu")
            this.toTitle();
    }
    select() {
        const item = screens_1.TITLE_ITEMS[this.cursor];
        switch (item) {
            case "hangar":
                this.screen = "hangar";
                this.listCursor = Math.max(0, content_1.SKINS.findIndex((s) => s.id === this.profile.skin));
                break;
            case "trophies":
            case "scores":
                this.screen = item;
                this.listCursor = 0;
                break;
            case "quit":
                this.quitRequested = true;
                break;
            case "difficulty":
                this.shiftDifficulty(1);
                break;
            case undefined:
                break;
            default:
                this.startRun(item);
                break;
        }
    }
    shiftDifficulty(by) {
        const index = content_1.DIFFICULTIES.findIndex((d) => d.id === this.profile.difficulty);
        const next = content_1.DIFFICULTIES[(index + by + content_1.DIFFICULTIES.length) % content_1.DIFFICULTIES.length];
        if (next)
            this.setDifficulty(next.id);
    }
    setDifficulty(id) {
        this.profile = this.store.update((p) => ({ ...p, difficulty: id }));
    }
    equip() {
        const skin = content_1.SKINS[this.listCursor];
        if (!skin)
            return;
        if ((0, profile_1.levelFor)(this.profile.xp).level < skin.level) {
            this.notice = `${skin.name} is locked until level ${skin.level}`;
            return;
        }
        if (this.profile.skin === skin.id) {
            this.notice = `${skin.name} is already your ship - M to go back and play`;
            return;
        }
        this.profile = this.store.update((p) => ({ ...p, skin: skin.id }));
        this.notice = `${skin.name} equipped`;
    }
    /** The mouse pointer moved to a 1-based terminal cell. */
    point(column, row) {
        if (this.screen === "game") {
            // The field starts one column in, past the border, and terminal columns
            // count from 1: column 2 is field x 0.
            this.engine?.moveTo(column - 2);
            return;
        }
        this.pointerRow = null;
        if (this.screen === "title") {
            const index = row - 1 - (0, screens_1.titleMenuTop)(this.lastColumns, this.lastRows);
            if (index >= 0 && index < screens_1.TITLE_ITEMS.length) {
                this.cursor = index;
                this.pointerRow = index;
            }
        }
        else if (this.screen === "hangar") {
            const index = row - 1 - screens_1.HANGAR_TOP;
            if (index >= 0 && index < content_1.SKINS.length) {
                this.listCursor = index;
                this.pointerRow = index;
            }
        }
    }
    /** The left button's state this frame: fire in a run, click in a menu. */
    trigger(held) {
        const pressed = held && !this.triggerHeld;
        this.triggerHeld = held;
        if (this.screen === "game") {
            if (held)
                this.engine?.apply("fire");
        }
        else if (pressed && this.pointerRow !== null) {
            // Only a click on a row acts. The click that focuses the pane, or one
            // on empty space, must not start or open anything.
            this.handle("confirm");
        }
    }
    wheel(down) {
        if (this.screen !== "game")
            this.handle(down ? "down" : "up");
    }
    ingest(event) {
        if (this.screen === "game")
            this.engine?.ingest(event);
    }
    // ------------------------------------------------------------------ runs ---
    startRun(mode) {
        this.runMode = mode;
        const day = (0, content_1.dayKey)(this.today());
        this.engine =
            mode === "daily"
                ? // Daily is always MEDIUM, so everyone's daily scores compare.
                    new engine_1.Engine(this.width, this.height, { mode, mutator: (0, content_1.dailyMutator)(day), rng: (0, content_1.seededRng)((0, content_1.hashString)(day)) })
                : new engine_1.Engine(this.width, this.height, { mode, rng: this.rng, difficulty: this.profile.difficulty });
        this.screen = "game";
        this.summary = null;
        this.recorded = false;
        this.earned = [];
        this.unlocked = new Set(Object.keys(this.profile.achievements));
        this.checkTimer = 0;
        this.runBest = (0, profile_1.bestScore)(this.profile, mode);
    }
    context(finished) {
        const engine = this.engine;
        if (!engine)
            return null;
        return {
            stats: engine.stats,
            mode: this.runMode,
            score: engine.score,
            wave: engine.wave,
            totals: (0, profile_1.totalsWith)(this.profile, engine.stats, finished),
            finished,
        };
    }
    checkAchievements(finished) {
        const ctx = this.context(finished);
        if (!ctx)
            return;
        for (const a of (0, achievements_1.newlyEarned)(ctx, this.unlocked)) {
            this.unlocked.add(a.id);
            this.earned.push(a.id);
            this.engine?.toast("TROPHY", `${a.name} +${a.xp}xp`);
        }
    }
    /** Save the run into the profile, once. Safe to call at any point. */
    finishRun() {
        const engine = this.engine;
        if (!engine || this.recorded)
            return;
        this.recorded = true;
        if (engine.score === 0 && engine.stats.elapsed < MIN_RECORDED_S)
            return;
        this.checkAchievements(true);
        const day = this.runMode === "daily" ? (0, content_1.dayKey)(this.today()) : undefined;
        const run = {
            mode: this.runMode,
            score: engine.score,
            wave: engine.wave,
            stats: engine.stats,
            day,
            mutator: day ? engine.mutator.name : undefined,
            difficulty: engine.difficulty.id,
        };
        const result = {};
        this.profile = this.store.update((p) => {
            result.outcome = (0, profile_1.applyRun)(p, run, this.earned);
            return result.outcome.profile;
        });
        const o = result.outcome;
        if (!o)
            return;
        const s = engine.stats;
        this.summary = {
            score: engine.score,
            wave: engine.wave,
            kills: s.kills,
            maxCombo: s.maxCombo,
            accuracy: s.shots > 0 ? s.hits / s.shots : 0,
            xpGained: o.xpGained,
            levelBefore: o.levelBefore,
            levelAfter: o.levelAfter,
            rank: o.rank,
            newDailyBest: o.newDailyBest,
            achievements: this.earned.map((id) => achievements_1.ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id),
        };
    }
    toTitle() {
        this.finishRun();
        this.engine = null;
        this.screen = "title";
        this.listCursor = 0;
    }
    // ------------------------------------------------------------- stepping ---
    step(dt) {
        this.clock += dt;
        for (const s of this.stars) {
            s.y += s.speed * dt;
            if (s.y >= 60) {
                s.y = 0;
                s.x = this.rng() * 160;
            }
        }
        const engine = this.engine;
        if (this.screen !== "game" || !engine)
            return;
        engine.step(dt);
        this.checkTimer += dt;
        if (engine.status === "playing" && this.checkTimer >= ACHIEVEMENT_CHECK_S) {
            this.checkTimer = 0;
            this.checkAchievements(false);
        }
        // Save at game over, not at quit: the pane may be closed without a clean exit.
        if (engine.status === "gameover")
            this.finishRun();
    }
    drainCues() {
        const engine = this.engine;
        if (!engine)
            return [];
        const cues = engine.cues;
        engine.cues = [];
        return cues;
    }
    // -------------------------------------------------------------- drawing ---
    frame(opts) {
        this.lastColumns = opts.columns;
        this.lastRows = opts.rows;
        const level = (0, profile_1.levelFor)(this.profile.xp).level;
        if (this.screen === "game" && this.engine) {
            const render = {
                ...opts,
                attached: this.attached,
                highScore: this.runBest,
                level,
                skin: (0, content_1.skinSpec)(this.profile.skin),
                summary: this.summary,
            };
            return (0, render_1.renderFrame)(this.engine, render);
        }
        const day = (0, content_1.dayKey)(this.today());
        return (0, screens_1.renderMenu)({
            screen: this.screen === "game" ? "title" : this.screen,
            columns: opts.columns,
            rows: opts.rows,
            ascii: opts.ascii,
            mouse: opts.mouse,
            clock: this.clock,
            stars: this.stars,
            attached: this.attached,
            sessionLabel: opts.sessionLabel,
            profile: this.profile,
            cursor: this.cursor,
            listCursor: this.listCursor,
            daily: (0, content_1.dailyMutator)(day),
            dailyBest: this.profile.daily[day] ?? 0,
            notice: this.notice,
        });
    }
    /** What the status line shows. */
    snapshot(sessionId, pid, now = Date.now()) {
        const engine = this.engine;
        const level = (0, profile_1.levelFor)(this.profile.xp).level;
        const best = (0, profile_1.bestScore)(this.profile);
        if (this.screen !== "game" || !engine) {
            return {
                sessionId,
                score: 0,
                highScore: best,
                lives: 0,
                wave: 0,
                combo: 0,
                enemies: 0,
                status: "menu",
                heartbeat: now,
                pid,
                level,
            };
        }
        return {
            sessionId,
            score: engine.score,
            highScore: Math.max(best, engine.score),
            lives: engine.lives,
            wave: engine.wave,
            combo: engine.combo,
            enemies: engine.enemies.length,
            status: engine.status,
            heartbeat: now,
            pid,
            mode: engine.mode.name,
            level,
            bombs: engine.bombs,
            fever: engine.feverTime > 0,
            boss: engine.boss()?.boss?.spec.name,
            difficulty: engine.difficulty.name,
            maxLives: engine.maxLives,
        };
    }
}
exports.App = App;
