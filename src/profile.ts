/**
 * The player's lasting progress: experience and level, lifetime totals,
 * unlocked achievements, a top-ten board per mode, daily bests and the chosen
 * ship. Kept in one small JSON file next to the session logs.
 *
 * Several game panes (one per Claude session) may finish runs at once, so
 * every change re-reads the file, applies itself, and writes it back whole.
 */
import * as fs from "fs";
import { ensureDirs, highScorePath, profilePath, writeAtomic } from "./paths";
import { ACHIEVEMENTS, type Totals } from "./game/achievements";
import { MODES, isDifficultyId, type DifficultyId, type ModeId } from "./game/content";
import type { RunStats } from "./game/engine";

export interface RunRecord {
  score: number;
  wave: number;
  kills: number;
  maxCombo: number;
  at: number;
  /** The daily mutator, for daily runs. */
  mutator?: string;
  difficulty?: DifficultyId;
}

export interface Profile {
  version: 1;
  xp: number;
  totals: Totals;
  /** Achievement id -> epoch ms it was unlocked. */
  achievements: Record<string, number>;
  boards: Record<ModeId, RunRecord[]>;
  /** YYYY-MM-DD -> best daily score that day. */
  daily: Record<string, number>;
  skin: string;
  difficulty: DifficultyId;
}

export const BOARD_SIZE = 10;
const DAILY_DAYS_KEPT = 30;

export function emptyProfile(): Profile {
  return {
    version: 1,
    xp: 0,
    totals: { runs: 0, kills: 0, bosses: 0, powerups: 0, playSeconds: 0, toolEvents: 0 },
    achievements: {},
    boards: { storm: [], endless: [], zen: [], daily: [] },
    daily: {},
    skin: "pioneer",
    difficulty: "medium",
  };
}

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** Accept whatever is on disk, keeping only fields of the right shape. */
export function normalizeProfile(raw: unknown): Profile {
  const out = emptyProfile();
  if (!raw || typeof raw !== "object") return out;
  const p = raw as Partial<Record<keyof Profile, unknown>>;
  out.xp = num(p.xp);
  const totals = (p.totals ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(out.totals) as Array<keyof Totals>) out.totals[key] = num(totals[key]);
  if (p.achievements && typeof p.achievements === "object") {
    for (const [id, at] of Object.entries(p.achievements as Record<string, unknown>)) {
      if (ACHIEVEMENTS.some((a) => a.id === id)) out.achievements[id] = num(at);
    }
  }
  const boards = (p.boards ?? {}) as Record<string, unknown>;
  for (const mode of MODES) {
    const list = boards[mode.id];
    if (!Array.isArray(list)) continue;
    out.boards[mode.id] = list
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof r.score === "number")
      .map((r) => {
        const record: RunRecord = {
          score: num(r.score),
          wave: num(r.wave),
          kills: num(r.kills),
          maxCombo: num(r.maxCombo),
          at: num(r.at),
        };
        if (typeof r.mutator === "string") record.mutator = r.mutator;
        if (isDifficultyId(r.difficulty)) record.difficulty = r.difficulty;
        return record;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, BOARD_SIZE);
  }
  if (p.daily && typeof p.daily === "object") {
    for (const [day, best] of Object.entries(p.daily as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) out.daily[day] = num(best);
    }
  }
  if (typeof p.skin === "string") out.skin = p.skin;
  if (isDifficultyId(p.difficulty)) out.difficulty = p.difficulty;
  return out;
}

/** XP to go from `level` to the next one. Each level asks a little more. */
export function xpToNext(level: number): number {
  return 400 + 200 * (level - 1);
}

export function levelFor(xp: number): { level: number; into: number; needed: number } {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level += 1;
  }
  return { level, into: rest, needed: xpToNext(level) };
}

/** Experience a run earns before achievements. */
export function xpForRun(score: number, stats: RunStats): number {
  return Math.floor(score / 25) + stats.kills + stats.bosses * 150 + stats.wavesCleared * 20;
}

/** Lifetime totals as they would be with this run added. */
export function totalsWith(profile: Profile, stats: RunStats, finished: boolean): Totals {
  const t = profile.totals;
  return {
    runs: t.runs + (finished ? 1 : 0),
    kills: t.kills + stats.kills,
    bosses: t.bosses + stats.bosses,
    powerups: t.powerups + stats.powerups,
    playSeconds: t.playSeconds + stats.elapsed,
    toolEvents: t.toolEvents + stats.toolEvents,
  };
}

export interface FinishedRun {
  mode: ModeId;
  score: number;
  wave: number;
  stats: RunStats;
  day?: string;
  mutator?: string;
  difficulty?: DifficultyId;
}

export interface RunOutcome {
  profile: Profile;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  /** 1-based place on the mode's board, or 0 when it missed the top ten. */
  rank: number;
  newDailyBest: boolean;
}

/** Fold a finished run, and the achievements it earned, into a profile. */
export function applyRun(profile: Profile, run: FinishedRun, earned: string[], now = Date.now()): RunOutcome {
  const next = normalizeProfile(JSON.parse(JSON.stringify(profile)));
  const levelBefore = levelFor(next.xp).level;

  next.totals = totalsWith(next, run.stats, true);
  let xpGained = xpForRun(run.score, run.stats);
  for (const id of earned) {
    if (next.achievements[id]) continue;
    next.achievements[id] = now;
    xpGained += ACHIEVEMENTS.find((a) => a.id === id)?.xp ?? 0;
  }
  next.xp += xpGained;

  let rank = 0;
  if (run.score > 0) {
    const record: RunRecord = {
      score: run.score,
      wave: run.wave,
      kills: run.stats.kills,
      maxCombo: run.stats.maxCombo,
      at: now,
      ...(run.mutator ? { mutator: run.mutator } : {}),
      ...(run.difficulty ? { difficulty: run.difficulty } : {}),
    };
    const board = [...next.boards[run.mode], record].sort((a, b) => b.score - a.score).slice(0, BOARD_SIZE);
    next.boards[run.mode] = board;
    rank = board.indexOf(record) + 1;
  }

  let newDailyBest = false;
  if (run.day) {
    if (run.score > (next.daily[run.day] ?? 0)) {
      next.daily[run.day] = run.score;
      newDailyBest = true;
    }
    const days = Object.keys(next.daily).sort().reverse();
    for (const old of days.slice(DAILY_DAYS_KEPT)) delete next.daily[old];
  }

  return { profile: next, xpGained, levelBefore, levelAfter: levelFor(next.xp).level, rank, newDailyBest };
}

/** The best score on any board, for the status line and the HUD. */
export function bestScore(profile: Profile, mode?: ModeId): number {
  const modes = mode ? [mode] : MODES.map((m) => m.id);
  return Math.max(0, ...modes.map((m) => profile.boards[m][0]?.score ?? 0));
}

/** Where profiles are kept. Swapped for an in-memory one in tests. */
export interface ProfileStore {
  load(): Profile;
  /** Re-read, change, write back; returns what was written. */
  update(change: (profile: Profile) => Profile): Profile;
}

export function fileProfileStore(): ProfileStore {
  const load = (): Profile => {
    try {
      return normalizeProfile(JSON.parse(fs.readFileSync(profilePath(), "utf8")));
    } catch {
      return migrateHighScore(emptyProfile());
    }
  };
  return {
    load,
    update(change) {
      const next = change(load());
      try {
        ensureDirs();
        writeAtomic(profilePath(), JSON.stringify(next));
      } catch {
        /* progress is nice to keep, never worth crashing the game over */
      }
      return next;
    },
  };
}

export function memoryProfileStore(initial: Profile = emptyProfile()): ProfileStore {
  let current = initial;
  return {
    load: () => normalizeProfile(JSON.parse(JSON.stringify(current))),
    update(change) {
      current = change(normalizeProfile(JSON.parse(JSON.stringify(current))));
      return current;
    },
  };
}

/** Before 0.3 only a single best score existed: carry it onto the STORM board. */
function migrateHighScore(profile: Profile): Profile {
  try {
    const old = JSON.parse(fs.readFileSync(highScorePath(), "utf8")) as { score?: unknown; at?: unknown };
    const score = num(old.score);
    if (score > 0) {
      profile.boards.storm.push({ score, wave: 0, kills: 0, maxCombo: 0, at: num(old.at) || Date.now() });
    }
  } catch {
    /* no old score */
  }
  return profile;
}
