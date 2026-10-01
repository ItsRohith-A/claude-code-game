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

/** Pointer to the most recent session, so `/toolstorm` can find it with no arguments. */
export function currentSessionPath(): string {
  return path.join(rootDir(), "current-session");
}

export function highScorePath(): string {
  return path.join(rootDir(), "highscore.json");
}

/** Session ids come from Claude Code, but never trust them as path segments. */
export function safeId(sessionId: string): string {
  const cleaned = sessionId.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.slice(0, 120) || "unknown";
}

export function ensureDirs(): void {
  fs.mkdirSync(sessionsDir(), { recursive: true });
}

/** Write a file without ever leaving a half-written file behind for a reader. */
export function writeAtomic(target: string, data: string): void {
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, target);
}
