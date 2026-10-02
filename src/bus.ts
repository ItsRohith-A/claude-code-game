import * as fs from "fs";
import {
  currentSessionPath,
  ensureDirs,
  eventLogPath,
  highScorePath,
  statePath,
  writeAtomic,
} from "./paths";
import { isLive, type GameEvent, type GameState } from "./events";

/** A log past this size is restarted; the game tail notices the truncation. */
const MAX_LOG_BYTES = 1024 * 1024;

/**
 * Append one event. Called from hook processes, which must never fail loudly
 * and must never block Claude: every error is swallowed on purpose.
 */
export function publish(sessionId: string, event: Omit<GameEvent, "at">): void {
  try {
    ensureDirs();
    const log = eventLogPath(sessionId);
    const line = JSON.stringify({ at: Date.now(), ...event }) + "\n";
    // Async hooks run concurrently, so several processes may append at once.
    // Each line goes out in one O_APPEND write well under the pipe-buffer
    // size, which keeps lines whole; the order between them is not promised.
    fs.appendFileSync(log, line, { encoding: "utf8", mode: 0o600 });
    if (fs.statSync(log).size > MAX_LOG_BYTES) fs.writeFileSync(log, "");
  } catch {
    /* a broken game must never break the user's real work */
  }
}

/** Record the most recent session, the fallback when `launch` gets no id. */
export function markCurrentSession(sessionId: string): void {
  try {
    ensureDirs();
    writeAtomic(currentSessionPath(), sessionId);
  } catch {
    /* ignore */
  }
}

/** Start a fresh log for a new run. */
export function resetLog(sessionId: string): void {
  try {
    ensureDirs();
    fs.writeFileSync(eventLogPath(sessionId), "", { mode: 0o600 });
  } catch {
    /* ignore */
  }
}

/** Incrementally reads appended lines, remembering where it stopped. */
export class EventTail {
  private offset = 0;
  private partial = "";

  constructor(private readonly file: string, skipExisting: boolean) {
    if (skipExisting) {
      try {
        this.offset = fs.statSync(this.file).size;
      } catch {
        this.offset = 0;
      }
    }
  }

  /** Returns every complete event appended since the last call. */
  read(): GameEvent[] {
    let size: number;
    try {
      size = fs.statSync(this.file).size;
    } catch {
      return [];
    }

    // The log was truncated or replaced (new run): start over.
    if (size < this.offset) {
      this.offset = 0;
      this.partial = "";
    }
    if (size === this.offset) return [];

    let chunk = "";
    try {
      const fd = fs.openSync(this.file, "r");
      try {
        const length = size - this.offset;
        const buf = Buffer.allocUnsafe(length);
        const bytes = fs.readSync(fd, buf, 0, length, this.offset);
        chunk = buf.subarray(0, bytes).toString("utf8");
        this.offset += bytes;
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return [];
    }

    const text = this.partial + chunk;
    const lines = text.split("\n");
    // The last element is whatever follows the final newline: hold it back
    // until the writer finishes the line.
    this.partial = lines.pop() ?? "";

    const out: GameEvent[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as GameEvent;
        if (parsed && typeof parsed.kind === "string") out.push(parsed);
      } catch {
        /* skip a malformed line rather than dying mid-game */
      }
    }
    return out;
  }
}

export function publishState(state: GameState): void {
  try {
    ensureDirs();
    writeAtomic(statePath(state.sessionId), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function readState(sessionId: string): GameState | null {
  try {
    return JSON.parse(fs.readFileSync(statePath(sessionId), "utf8")) as GameState;
  } catch {
    return null;
  }
}

/**
 * Whether a game is attached to this session right now. The game skips the
 * existing log when it attaches, so events written while nothing is playing
 * would never be read: hooks check this and skip the write.
 */
export function gameIsLive(sessionId: string): boolean {
  return isLive(readState(sessionId));
}

export function readCurrentSessionId(): string | null {
  try {
    const id = fs.readFileSync(currentSessionPath(), "utf8").trim();
    return id || null;
  } catch {
    return null;
  }
}

export function readHighScore(): number {
  try {
    const parsed = JSON.parse(fs.readFileSync(highScorePath(), "utf8")) as { score?: number };
    return typeof parsed.score === "number" ? parsed.score : 0;
  } catch {
    return 0;
  }
}

export function writeHighScore(score: number): void {
  try {
    ensureDirs();
    if (score > readHighScore()) {
      writeAtomic(highScorePath(), JSON.stringify({ score, at: Date.now() }));
    }
  } catch {
    /* ignore */
  }
}
