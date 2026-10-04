/**
 * The contract between the hooks (producers) and the game (consumer).
 *
 * Hooks cannot talk to a terminal, so they append one JSON object per line to
 * a session log; the game process tails that log and turns each line into
 * something that happens on screen.
 */
import * as path from "path";

export type GameEventKind =
  | "session_start"   // new run
  | "turn_start"      // user submitted a prompt: a wave begins
  | "bug"             // code was changed: spawn a bug
  | "splitter"        // a file was written: an enemy that splits in two
  | "scout"           // Claude read/searched: weak fast enemy
  | "diver"           // Claude ran a command: an enemy that hunts the ship
  | "probe"           // Claude hit the network: tougher, shoots back
  | "carrier"         // Claude started a subagent: a mini boss that launches scouts
  | "powerup"         // a command succeeded (tests passed): drop a pickup
  | "damage"          // a tool failed: you take a hit
  | "attention"       // Claude needs the human: pause the game
  | "resume"          // attention cleared
  | "wave_clear"      // Claude finished the turn
  | "ally"            // a subagent finished: a wingman joins you
  | "supply"          // the context was compacted: a free bomb
  | "session_end";

export interface GameEvent {
  kind: GameEventKind;
  /** Epoch ms, for ordering and for ignoring stale events on a late attach. */
  at: number;
  /** Tool that caused this, when there was one. Shown on the enemy. */
  tool?: string;
  /** Claude Code's tool_use_id, so a permission banner clears on its own tool. */
  id?: string;
  /** Short human label, e.g. a file basename. Rendered in the side log. */
  label?: string;
  /** How much the event is worth: enemy count, damage amount, etc. */
  weight?: number;
}

/** What the game publishes for the status line to render. */
export interface GameState {
  sessionId: string;
  score: number;
  highScore: number;
  lives: number;
  wave: number;
  combo: number;
  enemies: number;
  status: "menu" | "playing" | "paused" | "attention" | "gameover" | "detached";
  /** Epoch ms of the last frame, so the HUD can tell a live game from a dead one. */
  heartbeat: number;
  pid: number;
  /** Added in 0.3; optional so an older game pane still renders. */
  mode?: string;
  level?: number;
  bombs?: number;
  fever?: boolean;
  /** Name of the boss on screen, if any. */
  boss?: string;
  difficulty?: string;
  maxLives?: number;
}

export const MAX_LIVES = 3;

/** A state file older than this means the game pane is gone or frozen. */
export const LIVE_WINDOW_MS = 6000;

export function isLive(state: GameState | null, now = Date.now()): boolean {
  return !!state && state.status !== "detached" && now - state.heartbeat <= LIVE_WINDOW_MS;
}

/** Tool name -> what it becomes in the game. The heart of the "work is fuel" design. */
export function classifyTool(toolName: string, failed: boolean): {
  kind: GameEventKind;
  weight: number;
} {
  if (failed) return { kind: "damage", weight: 1 };

  switch (toolName) {
    // Changing code is what creates bugs to shoot.
    case "Edit":
    case "NotebookEdit":
      return { kind: "bug", weight: 2 };

    // A whole new file: one enemy that breaks into two when shot.
    case "Write":
      return { kind: "splitter", weight: 1 };

    // Looking around is cheap: fast, flimsy enemies worth a few points.
    case "Read":
    case "Grep":
    case "Glob":
    case "LSP":
      return { kind: "scout", weight: 1 };

    // Reaching outside the machine: armoured and it shoots back.
    case "WebFetch":
    case "WebSearch":
      return { kind: "probe", weight: 1 };

    // Running something that worked is a reward.
    case "Bash":
    case "PowerShell":
      return { kind: "powerup", weight: 1 };

    // Agents and tasks are a mini boss.
    case "Agent":
    case "Task":
      return { kind: "carrier", weight: 1 };

    default:
      // MCP servers reach outside the machine too.
      if (toolName.startsWith("mcp__")) return { kind: "probe", weight: 1 };
      return { kind: "scout", weight: 1 };
  }
}

/**
 * Commands whose success is worth celebrating with a power-up. Anchored to the
 * start of a command, so `git commit -m "make it build"` does not count.
 */
const VERIFICATION = new RegExp(
  "^(?:(?:npx|bunx|pnpm\\s+exec|uv\\s+run|poetry\\s+run|python3?\\s+-m)\\s+)?" +
    "(?:" +
    [
      "(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?(?:test|build|lint|typecheck|check)\\b",
      "(?:jest|vitest|mocha|pytest|tsc|eslint|ruff|mypy|tox|nox|phpunit|rspec)\\b",
      "go\\s+(?:test|build|vet)\\b",
      "cargo\\s+(?:test|build|check|clippy|nextest)\\b",
      "make\\b",
      "(?:\\./)?gradlew?\\s+(?:test|build|check)\\b",
      "(?:\\./)?mvnw?\\s+(?:test|verify|package|install)\\b",
      "dotnet\\s+(?:test|build)\\b",
    ].join("|") +
    ")",
  "i",
);

/** Leading `FOO=bar` assignments and wrappers that do not change what runs. */
const PREFIX = /^(?:(?:[A-Za-z_][A-Za-z0-9_]*=\S*|time|sudo)\s+)+/;

/** Split a shell command on `&&`, `||`, `;`, `|` and newlines outside quotes. */
export function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? "";
    if (quote) {
      if (ch === "\\" && quote === '"') {
        current += ch + (command[i + 1] ?? "");
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ";" || ch === "\n" || ch === "|" || ch === "&") {
      // `&&`, `||` and `|&` are one separator; a lone `&` backgrounds.
      if ((ch === "&" || ch === "|") && (command[i + 1] === "&" || command[i + 1] === "|")) i += 1;
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

export function isVerificationCommand(command: string): boolean {
  return splitCommand(command).some((part) => VERIFICATION.test(part.replace(PREFIX, "")));
}

/**
 * A short, screen-friendly label for the thing Claude just touched. The event
 * log sits on disk, so it keeps only what is safe to keep: file names, the
 * program a command ran, and the host of a URL. Never query strings, search
 * terms or patterns, or command arguments, which is where secrets live.
 */
export function labelFor(toolInput: Record<string, unknown> | undefined): string | undefined {
  const input = toolInput ?? {};
  const filePath = input["file_path"] ?? input["notebook_path"] ?? input["path"];
  if (typeof filePath === "string" && filePath) return path.basename(filePath).slice(0, 24);

  const command = input["command"];
  if (typeof command === "string" && command.trim()) {
    const first = splitCommand(command)[0] ?? "";
    const words = first.replace(PREFIX, "").split(/\s+/);
    const program = path.basename(words[0] ?? "");
    // Keep a subcommand such as `test` in `npm test`, but nothing that could
    // be a value: short, lowercase words only, so no digits, `=`, paths,
    // flags or tokens.
    const sub = words[1];
    const label = sub && /^[a-z][a-z:_-]{0,15}$/.test(sub) ? `${program} ${sub}` : program;
    return label.slice(0, 24) || undefined;
  }

  const url = input["url"];
  if (typeof url === "string" && url) {
    try {
      return new URL(url).hostname.slice(0, 24);
    } catch {
      return undefined;
    }
  }

  return undefined;
}
