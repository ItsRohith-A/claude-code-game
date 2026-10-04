/**
 * The whole game behind the terminal: which screen is up, the run in
 * progress, and the player's profile. It does no I/O of its own beyond the
 * profile store it is handed, so tests can drive it frame by frame.
 */
import type { GameEvent, GameState } from "../events";
import { ACHIEVEMENTS, newlyEarned, type AchievementContext } from "./achievements";
import {
  DIFFICULTIES,
  MODES,
  SKINS,
  dailyMutator,
  dayKey,
  hashString,
  seededRng,
  skinSpec,
  type DifficultyId,
  type ModeId,
} from "./content";
import { Engine, type Command, type Cue, type Star } from "./engine";
import { renderFrame, type RenderOptions, type RunSummary } from "./render";
import { HANGAR_TOP, TITLE_ITEMS, renderMenu, titleMenuTop, trophyRows, type Screen } from "./screens";
import {
  applyRun,
  bestScore,
  levelFor,
  totalsWith,
  type Profile,
  type ProfileStore,
  type RunOutcome,
} from "../profile";

export interface AppOptions {
  width: number;
  height: number;
  attached: boolean;
  store: ProfileStore;
  /** Skip the title screen and start this mode straight away. */
  startMode?: ModeId;
  /** Set and save this difficulty before anything else. */
  difficulty?: DifficultyId;
  today?: () => Date;
  rng?: () => number;
}

export interface FrameOptions {
  columns: number;
  rows: number;
  ascii: boolean;
  mouse: boolean;
  sessionLabel: string;
}

/** How often the run is checked for newly earned achievements. */
const ACHIEVEMENT_CHECK_S = 0.5;
/** A run this short with no score is not worth a line in the profile. */
const MIN_RECORDED_S = 5;

export class App {
  screen: Screen = "title";
  cursor = 0;
  listCursor = 0;
  engine: Engine | null = null;
  profile: Profile;
  summary: RunSummary | null = null;
  quitRequested = false;

  private width: number;
  private height: number;
  private readonly attached: boolean;
  private readonly store: ProfileStore;
  private readonly today: () => Date;
  private readonly rng: () => number;
  private readonly stars: Star[] = [];
  private clock = 0;
  private runMode: ModeId = "storm";
  private runBest = 0;
  private recorded = false;
  private earned: string[] = [];
  private unlocked = new Set<string>();
  private checkTimer = 0;
  private triggerHeld = false;
  /** The menu row under the mouse pointer, or null when it is over nothing. */
  private pointerRow: number | null = null;
  /** A line of feedback under a menu, such as "Trident equipped". */
  notice = "";
  /** The terminal size of the last frame, for mouse hit-testing and scrolling. */
  private lastColumns = 80;
  private lastRows = 24;

  constructor(options: AppOptions) {
    this.width = options.width;
    this.height = options.height;
    this.attached = options.attached;
    this.store = options.store;
    this.today = options.today ?? (() => new Date());
    this.rng = options.rng ?? Math.random;
    this.profile = this.store.load();
    if (options.difficulty && options.difficulty !== this.profile.difficulty) this.setDifficulty(options.difficulty);
    for (let i = 0; i < 70; i++) {
      this.stars.push({ x: this.rng() * 160, y: this.rng() * 60, speed: 1 + this.rng() * 5 });
    }
    if (options.startMode) this.startRun(options.startMode);
  }

  /** Fit the screen, and the run in progress, to a new terminal size. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.engine?.resize(width, height);
  }

  // ---------------------------------------------------------------- input ---

  handle(command: Command): void {
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
        this.handleList(command, SKINS.length, () => this.equip());
        break;
      case "trophies":
        this.handleList(command, Math.max(1, ACHIEVEMENTS.length - trophyRows(this.lastRows) + 1));
        break;
      case "scores":
        if (command === "left") this.listCursor = (this.listCursor + MODES.length - 1) % MODES.length;
        else if (command === "right" || command === "fire" || command === "confirm") {
          this.listCursor = (this.listCursor + 1) % MODES.length;
        } else this.handleList(command, MODES.length);
        break;
    }
  }

  private handleGame(command: Command): void {
    const engine = this.engine;
    if (!engine) return;
    if (command === "menu") {
      if (engine.status === "paused" || engine.status === "gameover") this.toTitle();
      return;
    }
    if (command === "restart") {
      if (engine.status === "gameover") this.startRun(this.runMode);
      return;
    }
    engine.apply(command);
  }

  private handleTitle(command: Command): void {
    if (TITLE_ITEMS[this.cursor] === "difficulty") {
      if (command === "left") return this.shiftDifficulty(-1);
      if (command === "right" || command === "confirm" || command === "fire") return this.shiftDifficulty(1);
    }
    if (command === "up") this.cursor = (this.cursor + TITLE_ITEMS.length - 1) % TITLE_ITEMS.length;
    else if (command === "down") this.cursor = (this.cursor + 1) % TITLE_ITEMS.length;
    else if (command === "confirm" || command === "fire") this.select();
  }

  private handleList(command: Command, length: number, onConfirm?: () => void): void {
    if (command === "up") this.listCursor = Math.max(0, this.listCursor - 1);
    else if (command === "down") this.listCursor = Math.min(length - 1, this.listCursor + 1);
    else if ((command === "confirm" || command === "fire") && onConfirm) onConfirm();
    else if (command === "back" || command === "menu") this.toTitle();
  }

  private select(): void {
    const item = TITLE_ITEMS[this.cursor];
    switch (item) {
      case "hangar":
        this.screen = "hangar";
        this.listCursor = Math.max(0, SKINS.findIndex((s) => s.id === this.profile.skin));
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

  private shiftDifficulty(by: number): void {
    const index = DIFFICULTIES.findIndex((d) => d.id === this.profile.difficulty);
    const next = DIFFICULTIES[(index + by + DIFFICULTIES.length) % DIFFICULTIES.length];
    if (next) this.setDifficulty(next.id);
  }

  private setDifficulty(id: DifficultyId): void {
    this.profile = this.store.update((p) => ({ ...p, difficulty: id }));
  }

  private equip(): void {
    const skin = SKINS[this.listCursor];
    if (!skin) return;
    if (levelFor(this.profile.xp).level < skin.level) {
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
  point(column: number, row: number): void {
    if (this.screen === "game") {
      // The field starts one column in, past the border, and terminal columns
      // count from 1: column 2 is field x 0.
      this.engine?.moveTo(column - 2);
      return;
    }
    this.pointerRow = null;
    if (this.screen === "title") {
      const index = row - 1 - titleMenuTop(this.lastColumns, this.lastRows);
      if (index >= 0 && index < TITLE_ITEMS.length) {
        this.cursor = index;
        this.pointerRow = index;
      }
    } else if (this.screen === "hangar") {
      const index = row - 1 - HANGAR_TOP;
      if (index >= 0 && index < SKINS.length) {
        this.listCursor = index;
        this.pointerRow = index;
      }
    }
  }

  /** The left button's state this frame: fire in a run, click in a menu. */
  trigger(held: boolean): void {
    const pressed = held && !this.triggerHeld;
    this.triggerHeld = held;
    if (this.screen === "game") {
      if (held) this.engine?.apply("fire");
    } else if (pressed && this.pointerRow !== null) {
      // Only a click on a row acts. The click that focuses the pane, or one
      // on empty space, must not start or open anything.
      this.handle("confirm");
    }
  }

  wheel(down: boolean): void {
    if (this.screen !== "game") this.handle(down ? "down" : "up");
  }

  ingest(event: GameEvent): void {
    if (this.screen === "game") this.engine?.ingest(event);
  }

  // ------------------------------------------------------------------ runs ---

  startRun(mode: ModeId): void {
    this.runMode = mode;
    const day = dayKey(this.today());
    this.engine =
      mode === "daily"
        ? // Daily is always MEDIUM, so everyone's daily scores compare.
          new Engine(this.width, this.height, { mode, mutator: dailyMutator(day), rng: seededRng(hashString(day)) })
        : new Engine(this.width, this.height, { mode, rng: this.rng, difficulty: this.profile.difficulty });
    this.screen = "game";
    this.summary = null;
    this.recorded = false;
    this.earned = [];
    this.unlocked = new Set(Object.keys(this.profile.achievements));
    this.checkTimer = 0;
    this.runBest = bestScore(this.profile, mode);
  }

  private context(finished: boolean): AchievementContext | null {
    const engine = this.engine;
    if (!engine) return null;
    return {
      stats: engine.stats,
      mode: this.runMode,
      score: engine.score,
      wave: engine.wave,
      totals: totalsWith(this.profile, engine.stats, finished),
      finished,
    };
  }

  private checkAchievements(finished: boolean): void {
    const ctx = this.context(finished);
    if (!ctx) return;
    for (const a of newlyEarned(ctx, this.unlocked)) {
      this.unlocked.add(a.id);
      this.earned.push(a.id);
      this.engine?.toast("TROPHY", `${a.name} +${a.xp}xp`);
    }
  }

  /** Save the run into the profile, once. Safe to call at any point. */
  finishRun(): void {
    const engine = this.engine;
    if (!engine || this.recorded) return;
    this.recorded = true;
    if (engine.score === 0 && engine.stats.elapsed < MIN_RECORDED_S) return;

    this.checkAchievements(true);
    const day = this.runMode === "daily" ? dayKey(this.today()) : undefined;
    const run = {
      mode: this.runMode,
      score: engine.score,
      wave: engine.wave,
      stats: engine.stats,
      day,
      mutator: day ? engine.mutator.name : undefined,
      difficulty: engine.difficulty.id,
    };
    const result: { outcome?: RunOutcome } = {};
    this.profile = this.store.update((p) => {
      result.outcome = applyRun(p, run, this.earned);
      return result.outcome.profile;
    });
    const o = result.outcome;
    if (!o) return;
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
      achievements: this.earned.map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id),
    };
  }

  toTitle(): void {
    this.finishRun();
    this.engine = null;
    this.screen = "title";
    this.listCursor = 0;
  }

  // ------------------------------------------------------------- stepping ---

  step(dt: number): void {
    this.clock += dt;
    for (const s of this.stars) {
      s.y += s.speed * dt;
      if (s.y >= 60) {
        s.y = 0;
        s.x = this.rng() * 160;
      }
    }
    const engine = this.engine;
    if (this.screen !== "game" || !engine) return;
    engine.step(dt);

    this.checkTimer += dt;
    if (engine.status === "playing" && this.checkTimer >= ACHIEVEMENT_CHECK_S) {
      this.checkTimer = 0;
      this.checkAchievements(false);
    }
    // Save at game over, not at quit: the pane may be closed without a clean exit.
    if (engine.status === "gameover") this.finishRun();
  }

  drainCues(): Cue[] {
    const engine = this.engine;
    if (!engine) return [];
    const cues = engine.cues;
    engine.cues = [];
    return cues;
  }

  // -------------------------------------------------------------- drawing ---

  frame(opts: FrameOptions): string {
    this.lastColumns = opts.columns;
    this.lastRows = opts.rows;
    const level = levelFor(this.profile.xp).level;
    if (this.screen === "game" && this.engine) {
      const render: RenderOptions = {
        ...opts,
        attached: this.attached,
        highScore: this.runBest,
        level,
        skin: skinSpec(this.profile.skin),
        summary: this.summary,
      };
      return renderFrame(this.engine, render);
    }
    const day = dayKey(this.today());
    return renderMenu({
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
      daily: dailyMutator(day),
      dailyBest: this.profile.daily[day] ?? 0,
      notice: this.notice,
    });
  }

  /** What the status line shows. */
  snapshot(sessionId: string, pid: number, now = Date.now()): GameState {
    const engine = this.engine;
    const level = levelFor(this.profile.xp).level;
    const best = bestScore(this.profile);
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
