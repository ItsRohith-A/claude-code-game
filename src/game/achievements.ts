import type { ModeId } from "./content";
import type { RunStats } from "./engine";

/** Lifetime counters, including the run in progress. */
export interface Totals {
  runs: number;
  kills: number;
  bosses: number;
  powerups: number;
  playSeconds: number;
  toolEvents: number;
}

export interface AchievementContext {
  stats: RunStats;
  mode: ModeId;
  score: number;
  wave: number;
  totals: Totals;
  /** True only when judging a run that just ended. */
  finished: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  text: string;
  xp: number;
  test(ctx: AchievementContext): boolean;
}

const accuracy = (s: RunStats) => (s.shots > 0 ? s.hits / s.shots : 0);

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_blood", name: "First Blood", text: "Destroy your first enemy", xp: 25, test: (c) => c.stats.kills >= 1 },
  { id: "combo_10", name: "On a Roll", text: "Reach a 10 combo", xp: 50, test: (c) => c.stats.maxCombo >= 10 },
  { id: "combo_30", name: "Unstoppable", text: "Reach a 30 combo", xp: 150, test: (c) => c.stats.maxCombo >= 30 },
  { id: "combo_75", name: "Flow State", text: "Reach a 75 combo", xp: 400, test: (c) => c.stats.maxCombo >= 75 },
  { id: "fever", name: "Fever Pitch", text: "Trigger fever mode", xp: 100, test: (c) => c.stats.fevers >= 1 },
  { id: "boss_1", name: "Bug Squasher", text: "Defeat a boss", xp: 200, test: (c) => c.stats.bosses >= 1 },
  { id: "boss_3", name: "Exterminator", text: "Defeat 3 bosses in one run", xp: 600, test: (c) => c.stats.bosses >= 3 },
  { id: "clutch", name: "Clutch", text: "Defeat a boss on your last heart", xp: 300, test: (c) => c.stats.clutchBoss },
  { id: "bomb_6", name: "Clean Slate", text: "Clear 6 enemies with one bomb", xp: 100, test: (c) => c.stats.bombKillsBest >= 6 },
  { id: "hoarder", name: "Hoarder", text: "Hold 3 bombs at once", xp: 75, test: (c) => c.stats.maxBombs >= 3 },
  { id: "wave_5", name: "Warmed Up", text: "Reach wave 5", xp: 75, test: (c) => c.wave >= 5 },
  { id: "wave_10", name: "Veteran", text: "Reach wave 10", xp: 200, test: (c) => c.wave >= 10 },
  { id: "wave_20", name: "Legend", text: "Reach wave 20", xp: 500, test: (c) => c.wave >= 20 },
  { id: "score_10k", name: "Five Digits", text: "Score 10,000 in one run", xp: 100, test: (c) => c.score >= 10_000 },
  { id: "score_50k", name: "High Roller", text: "Score 50,000 in one run", xp: 300, test: (c) => c.score >= 50_000 },
  { id: "score_150k", name: "Hall of Fame", text: "Score 150,000 in one run", xp: 800, test: (c) => c.score >= 150_000 },
  { id: "perfect", name: "Untouchable", text: "Clear a wave without a hit", xp: 100, test: (c) => c.stats.perfectWaves >= 1 },
  { id: "perfect_5", name: "Ghost", text: "5 perfect waves in one run", xp: 400, test: (c) => c.stats.perfectWaves >= 5 },
  { id: "green_build", name: "Green Build", text: "3 passing test runs in one game", xp: 100, test: (c) => c.stats.testsPassed >= 3 },
  { id: "arsenal", name: "Arsenal", text: "3 power-ups active at once", xp: 150, test: (c) => c.stats.maxActive >= 3 },
  {
    id: "sharpshooter",
    name: "Sharpshooter",
    text: "80% accuracy over 150+ shots",
    xp: 250,
    test: (c) => c.stats.shots >= 150 && accuracy(c.stats) >= 0.8,
  },
  {
    id: "survivor",
    name: "Survivor",
    text: "Last 5 minutes in one run",
    xp: 200,
    test: (c) => c.mode !== "zen" && c.stats.elapsed >= 300,
  },
  { id: "zen", name: "Inner Peace", text: "Play Zen for 5 minutes", xp: 100, test: (c) => c.mode === "zen" && c.stats.elapsed >= 300 },
  { id: "daily", name: "Daily Driver", text: "Finish a daily run", xp: 100, test: (c) => c.mode === "daily" && c.finished },
  { id: "wingman", name: "Pair Programming", text: "A subagent flies as your wingman", xp: 100, test: (c) => c.stats.allies >= 1 },
  { id: "supply", name: "Compact Delivery", text: "Get a bomb from context compaction", xp: 100, test: (c) => c.stats.supplies >= 1 },
  { id: "witness", name: "Watchful Eye", text: "Watch 250 of Claude's tool calls", xp: 200, test: (c) => c.totals.toolEvents >= 250 },
  { id: "centurion", name: "Centurion", text: "1,000 enemies destroyed in total", xp: 400, test: (c) => c.totals.kills >= 1000 },
  { id: "marathon", name: "Marathon", text: "Play for an hour in total", xp: 500, test: (c) => c.totals.playSeconds >= 3600 },
  { id: "regular", name: "Regular", text: "Play 25 runs", xp: 300, test: (c) => c.totals.runs >= 25 },
];

export function achievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** The achievements this context earns that are not already unlocked. */
export function newlyEarned(ctx: AchievementContext, unlocked: ReadonlySet<string>): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.has(a.id) && a.test(ctx));
}
