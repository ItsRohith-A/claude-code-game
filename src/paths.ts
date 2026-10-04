import * as os from "os";
import * as path from "path";
import * as fs from "fs";

/** Root data directory. Overridable so tests and multiple checkouts don't collide. */
export function rootDir(): string {
  const override = process.env.CLAUDE_ARCADE_HOME;
  if (override && override.trim()) return override;
  return path.join(os.homedir(), ".claude-arcade");
}

export function sessionsDir(): string {
  return path.join(rootDir(), "sessions");
}

/** Append-only event log the hooks write and the game tails. */
export function eventLogPath(sessionId: string): string {
  return path.join(sessionsDir(), `${safeId(sessionId)}.jsonl`);
}

/** Live game state the status line reads. One file per session. */
export function statePath(sessionId: string): string {
  return path.join(sessionsDir(), `${safeId(sessionId)}.state.json`);
}

/** Pointer to the most recent session, the fallback when no id is passed. */
export function currentSessionPath(): string {
  return path.join(rootDir(), "current-session");
}

export function highScorePath(): string {
  return path.join(rootDir(), "highscore.json");
}

/** Level, totals, achievements, leaderboards and the chosen ship. */
export function profilePath(): string {
  return path.join(rootDir(), "profile.json");
}

/**
 * Where the plugin's current dist/ lives. Hooks refresh it on every session
 * start, because the plugin root is a versioned directory that an update
 * replaces.
 */
export function pluginRootPointerPath(): string {
  return path.join(rootDir(), "plugin-dist");
}

/**
 * The status line command points here rather than into the plugin root, so a
 * plugin update cannot leave settings.json pointing at a deleted directory.
 */
export function statuslineShimPath(): string {
  return path.join(rootDir(), "toolstorm-statusline.js");
}

/** The user's own status line, saved by install so remove can put it back. */
export function statuslineBackupPath(): string {
  return path.join(rootDir(), "statusline-backup.json");
}

/**
 * Whether a status line command is ours. Matches the shim by its unique name,
 * and the plugin-root path older versions wrote, never a bare `statusline.js`
 * that could be anybody's.
 */
export function isToolstormStatusline(command: unknown): boolean {
  if (typeof command !== "string") return false;
  if (command.includes("toolstorm-statusline")) return true;
  return /toolstorm/i.test(command) && /[\\/]dist[\\/]statusline\.js/.test(command);
}

/** Session ids come from Claude Code, but never trust them as path segments. */
export function safeId(sessionId: string): string {
  const cleaned = sessionId.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.slice(0, 120) || "unknown";
}

export function ensureDirs(): void {
  // The logs name files and commands from the user's work: keep them private.
  fs.mkdirSync(sessionsDir(), { recursive: true, mode: 0o700 });
}

/**
 * Write a file without ever leaving a half-written file behind for a reader.
 * A symlinked target (dotfile managers do this to settings.json) is written
 * through, so the link survives.
 */
export function writeAtomic(target: string, data: string, mode = 0o600): void {
  let real = target;
  try {
    real = fs.realpathSync(target);
  } catch {
    /* does not exist yet */
  }
  const tmp = `${real}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data, { mode });
  try {
    fs.renameSync(tmp, real);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/** Drop session files nobody has touched for `maxAgeMs`. */
export function pruneSessions(maxAgeMs: number, now = Date.now()): void {
  let names: string[];
  try {
    names = fs.readdirSync(sessionsDir());
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(sessionsDir(), name);
    try {
      if (now - fs.statSync(file).mtimeMs > maxAgeMs) fs.rmSync(file, { force: true });
    } catch {
      /* raced with another session: fine */
    }
  }
}
